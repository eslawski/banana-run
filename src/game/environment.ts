import * as THREE from 'three';
import { curveX, curveSlope, THEME_LENGTH, TRACK_HALF_WIDTH } from './constants';

// Three rotating biomes: Jungle Temple -> Sunny Beach -> Crystal Cave.
// Each theme defines its atmosphere (sky, fog, lights, ground colors) and a
// decorate() that scatters props alongside a stretch of track. All props are
// built from shared cached geometries/materials so segments can be recycled
// endlessly without allocation churn.

export interface ThemeDef {
  name: string;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  pathColor: THREE.Color;
  apronColor: THREE.Color;
  moteColor: THREE.Color;
  decorate(group: THREE.Group, d0: number, len: number, rng: () => number): void;
}

const c = (hex: string) => new THREE.Color(hex);

// Deterministic per-segment randomness so recycling is stable.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------- shared geo/mat caches

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function toon(color: string): THREE.Material {
  const key = `t:${color}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color });
    matCache.set(key, m);
  }
  return m;
}

function glow(color: string, intensity: number): THREE.Material {
  const key = `g:${color}:${intensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.castShadow = true;
  return me;
}

/** World position for a point at distance d, lateral offset, and height. */
export function trackPoint(d: number, lateral: number, y: number): THREE.Vector3 {
  const slope = curveSlope(d);
  const invLen = 1 / Math.hypot(1, slope);
  // Forward is -Z; right vector is (1, 0, slope) normalized.
  return new THREE.Vector3(
    curveX(d) + lateral * invLen,
    y,
    -d + lateral * slope * invLen
  );
}

export function trackYaw(d: number): number {
  const slope = curveSlope(d);
  // Yaw that makes a +Z-facing object look down-track along (slope, 0, -1).
  return Math.atan2(slope, -1);
}

// -------------------------------------------------------------- builders

function jungleTree(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 2.6 + rng() * 2.6;
  const trunk = mesh(geo('trunk', () => new THREE.CylinderGeometry(0.22, 0.34, 1, 8)), toon('#7a4f2a'));
  trunk.scale.y = h;
  trunk.position.y = h / 2;
  g.add(trunk);
  const greens = ['#2e8f3c', '#3daa48', '#26793f'];
  const layers = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < layers; i++) {
    const r = 1.5 - i * 0.35 + rng() * 0.4;
    const blob = mesh(geo('foliage', () => new THREE.SphereGeometry(1, 12, 9)), toon(greens[Math.floor(rng() * greens.length)] ?? '#2e8f3c'));
    blob.scale.setScalar(r);
    blob.position.set((rng() - 0.5) * 0.8, h + i * 0.8, (rng() - 0.5) * 0.8);
    g.add(blob);
  }
  return g;
}

function templePillar(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const stone = toon('#9aa08a');
  const mossy = toon('#5d8f4e');
  const h = 1.6 + rng() * 2;
  const col = mesh(geo('pillar', () => new THREE.BoxGeometry(0.9, 1, 0.9)), stone);
  col.scale.y = h;
  col.position.y = h / 2;
  g.add(col);
  const cap = mesh(geo('pillarCap', () => new THREE.BoxGeometry(1.3, 0.35, 1.3)), rng() > 0.5 ? mossy : stone);
  cap.position.y = h + 0.17;
  g.add(cap);
  if (rng() > 0.6) {
    const moss = mesh(geo('pillarMoss', () => new THREE.SphereGeometry(0.5, 8, 6)), mossy);
    moss.scale.set(1, 0.4, 1);
    moss.position.y = h + 0.45;
    g.add(moss);
  }
  return g;
}

function flowerPatch(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#ff5b7f', '#ffd028', '#ff8c1a', '#c85bff'];
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const stem = mesh(geo('stem', () => new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6)), toon('#3daa48'));
    const x = (rng() - 0.5) * 1.4;
    const z = (rng() - 0.5) * 1.4;
    stem.position.set(x, 0.25, z);
    g.add(stem);
    const bloom = mesh(geo('bloom', () => new THREE.SphereGeometry(0.14, 8, 6)), toon(colors[Math.floor(rng() * colors.length)] ?? '#ff5b7f'));
    bloom.position.set(x, 0.55, z);
    g.add(bloom);
  }
  return g;
}

function palmTree(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 3 + rng() * 2;
  const lean = 0.25 + rng() * 0.2;
  const trunk = mesh(geo('palmTrunk', () => new THREE.CylinderGeometry(0.14, 0.24, 1, 8)), toon('#b08954'));
  trunk.scale.y = h;
  trunk.position.set(Math.sin(lean) * h * 0.5, h / 2, 0);
  trunk.rotation.z = -lean;
  g.add(trunk);
  const topX = Math.sin(lean) * h;
  const topY = Math.cos(lean) * h;
  for (let i = 0; i < 6; i++) {
    const frond = mesh(geo('frond', () => new THREE.ConeGeometry(0.32, 2.2, 4)), toon('#37b24d'));
    frond.scale.y = 0.9 + rng() * 0.3;
    const angle = (i / 6) * Math.PI * 2 + rng() * 0.4;
    frond.position.set(topX + Math.cos(angle) * 0.9, topY + 0.1, Math.sin(angle) * 0.9);
    frond.rotation.set(Math.sin(angle) * 1.25, 0, -Math.cos(angle) * 1.25);
    g.add(frond);
  }
  for (let i = 0; i < 2; i++) {
    const coco = mesh(geo('coconut', () => new THREE.SphereGeometry(0.16, 8, 6)), toon('#6d4c2f'));
    coco.position.set(topX + (rng() - 0.5) * 0.5, topY - 0.2, (rng() - 0.5) * 0.5);
    g.add(coco);
  }
  return g;
}

function beachUmbrella(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const pole = mesh(geo('pole', () => new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6)), toon('#fff4d6'));
  pole.position.y = 1.1;
  g.add(pole);
  const tops = ['#ff5b7f', '#3f9be0', '#ffd028'];
  const top = mesh(geo('umbrella', () => new THREE.ConeGeometry(1.5, 0.7, 10)), toon(tops[Math.floor(rng() * tops.length)] ?? '#ff5b7f'));
  top.position.y = 2.2;
  g.add(top);
  return g;
}

function beachRock(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const rock = mesh(geo('rock', () => new THREE.DodecahedronGeometry(0.7, 0)), toon('#cbb694'));
  rock.scale.set(0.7 + rng() * 0.8, 0.5 + rng() * 0.5, 0.7 + rng() * 0.8);
  rock.rotation.y = rng() * Math.PI;
  rock.position.y = 0.25;
  g.add(rock);
  return g;
}

function waterSlab(): THREE.Group {
  const g = new THREE.Group();
  const water = new THREE.Mesh(
    geo('water', () => new THREE.BoxGeometry(34, 0.3, 14)),
    glow('#2fa8d5', 0.25)
  );
  water.position.y = -0.25;
  g.add(water);
  return g;
}

function sailboat(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const hull = mesh(geo('hull', () => new THREE.CylinderGeometry(0.5, 0.2, 2.4, 6)), toon('#e0413c'));
  hull.rotation.z = Math.PI / 2;
  hull.position.y = 0.2;
  g.add(hull);
  const mast = mesh(geo('mast', () => new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6)), toon('#7a4f2a'));
  mast.position.y = 1.1;
  g.add(mast);
  const sail = mesh(geo('sail', () => new THREE.ConeGeometry(0.7, 1.5, 3)), toon('#ffffff'));
  sail.scale.z = 0.1;
  sail.position.set(0.2, 1.15, 0);
  sail.rotation.y = rng() * 0.4;
  g.add(sail);
  return g;
}

function stalagmite(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const n = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const h = 1 + rng() * 2.6;
    const spike = mesh(geo('stalagmite', () => new THREE.ConeGeometry(0.55, 1, 7)), toon('#5a628a'));
    spike.scale.set(0.7 + rng() * 0.6, h, 0.7 + rng() * 0.6);
    spike.position.set((rng() - 0.5) * 1.6, h / 2, (rng() - 0.5) * 1.6);
    g.add(spike);
  }
  return g;
}

function stalactite(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 1.4 + rng() * 2.4;
  const spike = mesh(geo('stalactite', () => new THREE.ConeGeometry(0.5, 1, 7)), toon('#4a5278'));
  spike.scale.y = h;
  spike.rotation.x = Math.PI;
  spike.position.y = 8.5 - h / 2 + rng() * 2;
  g.add(spike);
  return g;
}

function crystalCluster(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#4de0ff', '#c85bff', '#54ffa8'];
  const color = colors[Math.floor(rng() * colors.length)] ?? '#4de0ff';
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const crystal = new THREE.Mesh(geo('crystal', () => new THREE.OctahedronGeometry(0.5, 0)), glow(color, 1.4));
    const s = 0.5 + rng() * 0.9;
    crystal.scale.set(s * 0.55, s * 1.6, s * 0.55);
    crystal.position.set((rng() - 0.5) * 1.4, s * 0.7, (rng() - 0.5) * 1.4);
    crystal.rotation.set((rng() - 0.5) * 0.5, rng() * Math.PI, (rng() - 0.5) * 0.5);
    g.add(crystal);
  }
  return g;
}

function glowMushroom(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.4 + rng() * 0.7;
    const stem = mesh(geo('mushStem', () => new THREE.CylinderGeometry(0.1, 0.14, 0.5, 6)), toon('#cfd8ee'));
    const x = (rng() - 0.5) * 1.2;
    const z = (rng() - 0.5) * 1.2;
    stem.scale.setScalar(s);
    stem.position.set(x, 0.25 * s, z);
    g.add(stem);
    const cap = new THREE.Mesh(
      geo('mushCap', () => new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
      glow(rng() > 0.5 ? '#54ffa8' : '#4de0ff', 1.1)
    );
    cap.scale.setScalar(s);
    cap.position.set(x, 0.5 * s, z);
    g.add(cap);
  }
  return g;
}

// ------------------------------------------------------- placement helper

function scatter(
  group: THREE.Group,
  d0: number,
  len: number,
  rng: () => number,
  perSide: number,
  make: (rng: () => number) => THREE.Group,
  minLat: number,
  maxLat: number
): void {
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < perSide; i++) {
      const d = d0 + rng() * len;
      const lat = side * (minLat + rng() * (maxLat - minLat));
      const prop = make(rng);
      prop.position.copy(trackPoint(d, lat, 0));
      prop.rotation.y = rng() * Math.PI * 2;
      group.add(prop);
    }
  }
}

// ----------------------------------------------------------------- themes

export const THEMES: ThemeDef[] = [
  {
    name: 'Jungle Temple',
    skyTop: c('#3fa7e8'),
    skyBottom: c('#bfe8a8'),
    fogColor: c('#a8d89a'),
    fogNear: 45,
    fogFar: 190,
    hemiSky: c('#cfe8ff'),
    hemiGround: c('#4a7a3a'),
    hemiIntensity: 1.1,
    sunColor: c('#fff2cc'),
    sunIntensity: 2.6,
    pathColor: c('#c9a86a'),
    apronColor: c('#4f9a44'),
    moteColor: c('#ffe97a'),
    decorate(group, d0, len, rng) {
      scatter(group, d0, len, rng, 3, jungleTree, 8.5, 26);
      if (rng() > 0.45) scatter(group, d0, len, rng, 1, templePillar, 7, 10);
      scatter(group, d0, len, rng, 2, flowerPatch, 6.2, 12);
      if (rng() > 0.72) {
        // Vine arch spanning the path.
        const d = d0 + len / 2;
        const arch = new THREE.Mesh(
          geo('arch', () => new THREE.TorusGeometry(7.2, 0.42, 8, 20, Math.PI)),
          toon('#5d8f4e')
        );
        arch.position.copy(trackPoint(d, 0, 0.4));
        arch.rotation.y = trackYaw(d) + Math.PI; // torus plane spans across the path
        arch.castShadow = true;
        group.add(arch);
      }
    },
  },
  {
    name: 'Sunny Beach',
    skyTop: c('#2f9fe8'),
    skyBottom: c('#ffe8b8'),
    fogColor: c('#cfeaf2'),
    fogNear: 55,
    fogFar: 230,
    hemiSky: c('#ffffff'),
    hemiGround: c('#d8bc8a'),
    hemiIntensity: 1.25,
    sunColor: c('#fff8dd'),
    sunIntensity: 3,
    pathColor: c('#f0d9a0'),
    apronColor: c('#ecd49a'),
    moteColor: c('#ffffff'),
    decorate(group, d0, len, rng) {
      scatter(group, d0, len, rng, 2, palmTree, 7.5, 20);
      if (rng() > 0.5) scatter(group, d0, len, rng, 1, beachUmbrella, 7.5, 14);
      scatter(group, d0, len, rng, 2, beachRock, 6.5, 16);
      // Ocean on both sides beyond the sand.
      for (let side = -1; side <= 1; side += 2) {
        const slab = waterSlab();
        slab.position.copy(trackPoint(d0 + len / 2, side * 38, 0));
        slab.rotation.y = trackYaw(d0 + len / 2);
        group.add(slab);
      }
      if (rng() > 0.75) {
        const boat = sailboat(rng);
        const side = rng() > 0.5 ? 1 : -1;
        boat.position.copy(trackPoint(d0 + rng() * len, side * (30 + rng() * 12), 0));
        boat.rotation.y = rng() * Math.PI * 2;
        group.add(boat);
      }
    },
  },
  {
    name: 'Crystal Cave',
    skyTop: c('#12102a'),
    skyBottom: c('#2a2154'),
    fogColor: c('#241d48'),
    fogNear: 30,
    fogFar: 150,
    hemiSky: c('#5a4fa8'),
    hemiGround: c('#241d48'),
    hemiIntensity: 0.75,
    sunColor: c('#a8b8ff'),
    sunIntensity: 1.1,
    pathColor: c('#6a6294'),
    apronColor: c('#3a3462'),
    moteColor: c('#6ae8ff'),
    decorate(group, d0, len, rng) {
      scatter(group, d0, len, rng, 2, stalagmite, 7, 20);
      scatter(group, d0, len, rng, 2, crystalCluster, 6.2, 16);
      scatter(group, d0, len, rng, 1, glowMushroom, 6, 11);
      scatter(group, d0, len, rng, 2, stalactite, 0, 18);
    },
  },
];

export function themeIndexAt(d: number): number {
  return Math.floor(Math.max(0, d) / THEME_LENGTH) % THEMES.length;
}

export function themeAt(d: number): ThemeDef {
  return THEMES[themeIndexAt(d)] ?? THEMES[0]!;
}

// --------------------------------------------------- atmosphere controller

const MOTE_COUNT = 240;

function moteTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Owns sky dome, fog, lights, and floating motes; blends between themes. */
export class EnvironmentController {
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  private skyMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private motes: THREE.Points;
  private moteMat: THREE.PointsMaterial;
  private moteData: Float32Array;
  private fog: THREE.Fog;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fog = new THREE.Fog(THEMES[0]!.fogColor.clone(), THEMES[0]!.fogNear, THEMES[0]!.fogFar);
    scene.fog = this.fog;

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: THEMES[0]!.skyTop.clone() },
        bottomColor: { value: THEMES[0]!.skyBottom.clone() },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y * 1.6 + 0.25, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), this.skyMat);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(THEMES[0]!.hemiSky, THEMES[0]!.hemiGround, THEMES[0]!.hemiIntensity);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(THEMES[0]!.sunColor, THEMES[0]!.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 90;
    const s = 26;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    scene.add(this.sun, this.sun.target);

    // Drifting motes: fireflies / sun sparkles / cave glow.
    const positions = new Float32Array(MOTE_COUNT * 3);
    this.moteData = new Float32Array(MOTE_COUNT * 4); // phase + drift speeds
    for (let i = 0; i < MOTE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = 0.5 + Math.random() * 9;
      positions[i * 3 + 2] = -Math.random() * 160;
      this.moteData[i * 4] = Math.random() * Math.PI * 2;
      this.moteData[i * 4 + 1] = 0.3 + Math.random() * 0.8;
      this.moteData[i * 4 + 2] = (Math.random() - 0.5) * 0.6;
      this.moteData[i * 4 + 3] = 0.4 + Math.random() * 1.2;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.moteMat = new THREE.PointsMaterial({
      color: THEMES[0]!.moteColor.clone(),
      map: moteTexture(),
      size: 0.42,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.motes = new THREE.Points(moteGeo, this.moteMat);
    this.motes.frustumCulled = false;
    scene.add(this.motes);
  }

  /** Blend the atmosphere toward the theme at distance d. */
  tick(dt: number, d: number, playerPos: THREE.Vector3, time: number): void {
    const theme = themeAt(d);
    const k = Math.min(1, dt * 1.2);

    this.fog.color.lerp(theme.fogColor, k);
    this.fog.near += (theme.fogNear - this.fog.near) * k;
    this.fog.far += (theme.fogFar - this.fog.far) * k;
    (this.skyMat.uniforms.topColor!.value as THREE.Color).lerp(theme.skyTop, k);
    (this.skyMat.uniforms.bottomColor!.value as THREE.Color).lerp(theme.skyBottom, k);
    this.hemi.color.lerp(theme.hemiSky, k);
    this.hemi.groundColor.lerp(theme.hemiGround, k);
    this.hemi.intensity += (theme.hemiIntensity - this.hemi.intensity) * k;
    this.sun.color.lerp(theme.sunColor, k);
    this.sun.intensity += (theme.sunIntensity - this.sun.intensity) * k;
    this.moteMat.color.lerp(theme.moteColor, k);

    this.sky.position.copy(playerPos);
    this.sun.position.set(playerPos.x + 18, 30, playerPos.z + 14);
    this.sun.target.position.copy(playerPos);

    // Drift motes and wrap them into a window around the player.
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const zFront = playerPos.z - 170;
    const zBack = playerPos.z + 25;
    for (let i = 0; i < MOTE_COUNT; i++) {
      const phase = this.moteData[i * 4]!;
      const bobSpeed = this.moteData[i * 4 + 1]!;
      const driftX = this.moteData[i * 4 + 2]!;
      const rise = this.moteData[i * 4 + 3]!;
      arr[i * 3] = arr[i * 3]! + Math.sin(time * bobSpeed + phase) * dt * 0.8 + driftX * dt;
      arr[i * 3 + 1] = arr[i * 3 + 1]! + Math.cos(time * bobSpeed * 0.7 + phase) * dt * rise * 0.5;
      let z = arr[i * 3 + 2]!;
      if (z > zBack) z -= zBack - zFront;
      if (z < zFront) z += zBack - zFront;
      arr[i * 3 + 2] = z;
      if (arr[i * 3 + 1]! < 0.3) arr[i * 3 + 1] = 0.3;
      if (arr[i * 3 + 1]! > 11) arr[i * 3 + 1] = 11;
      const xCenter = playerPos.x;
      if (arr[i * 3]! > xCenter + 35) arr[i * 3] = xCenter - 35;
      if (arr[i * 3]! < xCenter - 35) arr[i * 3] = xCenter + 35;
    }
    pos.needsUpdate = true;
  }

  /** Snap instantly to a theme (used on reset). */
  snapTo(d: number): void {
    const theme = themeAt(d);
    this.fog.color.copy(theme.fogColor);
    this.fog.near = theme.fogNear;
    this.fog.far = theme.fogFar;
    (this.skyMat.uniforms.topColor!.value as THREE.Color).copy(theme.skyTop);
    (this.skyMat.uniforms.bottomColor!.value as THREE.Color).copy(theme.skyBottom);
    this.hemi.color.copy(theme.hemiSky);
    this.hemi.groundColor.copy(theme.hemiGround);
    this.hemi.intensity = theme.hemiIntensity;
    this.sun.color.copy(theme.sunColor);
    this.sun.intensity = theme.sunIntensity;
    this.moteMat.color.copy(theme.moteColor);
    void this.scene;
  }
}

export const PATH_RIBBON_HALF = TRACK_HALF_WIDTH + 0.7;
