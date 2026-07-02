import * as THREE from 'three';
import { BANANA_SPAWN_AHEAD, LATERAL_LIMIT } from './constants';
import { trackPoint } from './environment';

// Banana spawning, collection, and celebration particles. Bananas come in
// patterns: ground lines, weaving snakes, double rails, and jump arcs that
// peak too high to grab without jumping.

interface Banana {
  group: THREE.Group;
  active: boolean;
  d: number;
  lateral: number;
  baseY: number;
  spin: number;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const POOL_SIZE = 90;
const BURST_POOL = 48;

function buildBananaGeometry(): THREE.BufferGeometry {
  // A gently bent tube reads instantly as a banana.
  const pts = [
    new THREE.Vector3(-0.42, 0.1, 0),
    new THREE.Vector3(-0.22, -0.12, 0),
    new THREE.Vector3(0.22, -0.12, 0),
    new THREE.Vector3(0.42, 0.1, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 14, 0.13, 8, false);
}

export class BananaField {
  private pool: Banana[] = [];
  private nextSpawnD = 30;
  private bursts: BurstParticle[] = [];
  private burstMat: THREE.MeshBasicMaterial;
  private time = 0;

  constructor(scene: THREE.Scene) {
    const bananaGeo = buildBananaGeometry();
    const bananaMat = new THREE.MeshToonMaterial({ color: '#ffd028' });
    bananaMat.emissive = new THREE.Color('#7a5a00');
    bananaMat.emissiveIntensity = 0.35;
    const tipGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const tipMat = new THREE.MeshToonMaterial({ color: '#8a6a2a' });

    for (let i = 0; i < POOL_SIZE; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(bananaGeo, bananaMat);
      body.castShadow = true;
      group.add(body);
      const tipA = new THREE.Mesh(tipGeo, tipMat);
      tipA.position.set(-0.44, 0.12, 0);
      tipA.scale.setScalar(0.8);
      const tipB = new THREE.Mesh(tipGeo, tipMat);
      tipB.position.set(0.44, 0.12, 0);
      tipB.scale.setScalar(0.8);
      group.add(tipA, tipB);
      group.visible = false;
      scene.add(group);
      this.pool.push({ group, active: false, d: 0, lateral: 0, baseY: 0, spin: Math.random() * Math.PI * 2 });
    }

    this.burstMat = new THREE.MeshBasicMaterial({ color: '#ffe97a' });
    const burstGeo = new THREE.TetrahedronGeometry(0.14);
    for (let i = 0; i < BURST_POOL; i++) {
      const mesh = new THREE.Mesh(burstGeo, this.burstMat);
      mesh.visible = false;
      scene.add(mesh);
      this.bursts.push({ mesh, vel: new THREE.Vector3(), life: 0 });
    }
  }

  reset(): void {
    for (const banana of this.pool) {
      banana.active = false;
      banana.group.visible = false;
    }
    for (const p of this.bursts) {
      p.life = 0;
      p.mesh.visible = false;
    }
    this.nextSpawnD = 30;
  }

  private takeBanana(): Banana | null {
    return this.pool.find((b) => !b.active) ?? null;
  }

  private place(d: number, lateral: number, y: number): void {
    const banana = this.takeBanana();
    if (!banana) return;
    banana.active = true;
    banana.d = d;
    banana.lateral = lateral;
    banana.baseY = y;
    banana.group.visible = true;
    banana.group.position.copy(trackPoint(d, lateral, y));
  }

  private spawnPattern(d0: number): number {
    const kind = Math.floor(Math.random() * 4);
    const lat = (Math.random() * 2 - 1) * (LATERAL_LIMIT - 1);
    switch (kind) {
      case 0: {
        // Straight ground line.
        const n = 6 + Math.floor(Math.random() * 5);
        for (let i = 0; i < n; i++) this.place(d0 + i * 3.1, lat, 1.05);
        return d0 + n * 3.1;
      }
      case 1: {
        // Weave across the path.
        const n = 10;
        for (let i = 0; i < n; i++) {
          this.place(d0 + i * 3, Math.sin((i / (n - 1)) * Math.PI * 2) * (LATERAL_LIMIT - 1), 1.05);
        }
        return d0 + n * 3;
      }
      case 2: {
        // Jump arc — the peak is only reachable mid-air.
        const n = 7;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const y = 1.05 + Math.sin(t * Math.PI) * 2.5;
          this.place(d0 + i * 2.3, lat, y);
        }
        return d0 + n * 2.3;
      }
      default: {
        // Double rail.
        const n = 5 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          this.place(d0 + i * 3.2, lat - 1.9, 1.05);
          this.place(d0 + i * 3.2, lat + 1.9, 1.05);
        }
        return d0 + n * 3.2;
      }
    }
  }

  /**
   * Animate, spawn ahead, and collect. Returns how many bananas the player
   * grabbed this frame.
   */
  update(dt: number, playerD: number, playerCenter: THREE.Vector3, collectRadius: number): number {
    this.time += dt;

    let guard = 0;
    while (this.nextSpawnD < playerD + BANANA_SPAWN_AHEAD && guard++ < 64) {
      const end = this.spawnPattern(this.nextSpawnD);
      this.nextSpawnD = Math.max(end, this.nextSpawnD + 5) + 10 + Math.random() * 16;
    }

    let collected = 0;
    for (const banana of this.pool) {
      if (!banana.active) continue;
      if (banana.d < playerD - 6) {
        banana.active = false;
        banana.group.visible = false;
        continue;
      }
      banana.group.rotation.y = this.time * 2.4 + banana.spin;
      banana.group.rotation.z = 0.35;
      banana.group.position.y = banana.baseY + Math.sin(this.time * 3 + banana.spin) * 0.12;
      if (Math.abs(banana.d - playerD) < 2.2) {
        if (banana.group.position.distanceTo(playerCenter) < collectRadius) {
          banana.active = false;
          banana.group.visible = false;
          this.burst(banana.group.position);
          collected++;
        }
      }
    }

    for (const p of this.bursts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.y += dt * 7;
      p.mesh.scale.setScalar(Math.max(0.05, p.life * 1.6));
      if (p.life <= 0) p.mesh.visible = false;
    }

    return collected;
  }

  private burst(at: THREE.Vector3): void {
    let spawned = 0;
    for (const p of this.bursts) {
      if (p.life > 0) continue;
      p.life = 0.55 + Math.random() * 0.2;
      p.mesh.visible = true;
      p.mesh.position.copy(at);
      p.vel.set((Math.random() - 0.5) * 7, 3 + Math.random() * 4, (Math.random() - 0.5) * 7);
      if (++spawned >= 8) break;
    }
  }
}
