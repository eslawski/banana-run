import * as THREE from 'three';
import {
  BASE_SPEED,
  MAX_SPEED,
  RUN_DURATION,
  LATERAL_LIMIT,
  LATERAL_SPEED,
  JUMP_VELOCITY,
  GRAVITY,
} from './constants';
import { trackPoint, trackYaw } from './environment';
import type { CharacterDef, Rig } from './characters';

// Drives the selected character along the track: forward speed ramp, tilt
// steering, jump physics, and all the procedural run/jump/celebrate
// animation applied to the character rig.

export class Player {
  rig: Rig;
  def: CharacterDef;
  d = 0; // distance along the path
  lateral = 0;
  y = 0;
  vy = 0;
  grounded = true;
  private runPhase = 0;
  private squash = 0; // landing squash timer
  private bank = 0;
  private celebrationTime = 0;

  constructor(scene: THREE.Scene, def: CharacterDef) {
    this.def = def;
    this.rig = def.build();
    this.rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    scene.add(this.rig.root);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
  }

  get speed(): number {
    return BASE_SPEED * this.def.traits.speed;
  }

  /** World-space center of the character (for banana collection). */
  center(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.rig.root.position).setY(this.rig.root.position.y + 1.05);
  }

  reset(): void {
    this.d = 0;
    this.lateral = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.runPhase = 0;
    this.squash = 0;
    this.bank = 0;
    this.celebrationTime = 0;
    this.applyTransform();
  }

  jump(): boolean {
    if (!this.grounded) return false;
    this.grounded = false;
    this.vy = JUMP_VELOCITY * this.def.traits.jumpVel;
    return true;
  }

  update(dt: number, steer: number, elapsed: number): void {
    // Speed ramps over the round so the last stretch feels wild.
    const ramp = Math.min(1, elapsed / RUN_DURATION);
    const speed = (BASE_SPEED + (MAX_SPEED - BASE_SPEED) * ramp) * this.def.traits.speed;
    this.d += speed * dt;

    const targetLat = steer * LATERAL_LIMIT;
    const maxStep = LATERAL_SPEED * dt;
    const delta = THREE.MathUtils.clamp(targetLat - this.lateral, -maxStep, maxStep);
    this.lateral += delta;
    this.bank += (steer - this.bank) * Math.min(1, dt * 8);

    if (!this.grounded) {
      this.vy += GRAVITY * this.def.traits.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.squash = 0.18;
      }
    }
    if (this.squash > 0) this.squash -= dt;

    this.runPhase += dt * speed * 0.62;
    this.applyTransform();
    this.animate(dt);
  }

  private applyTransform(): void {
    this.rig.root.position.copy(trackPoint(this.d, this.lateral, this.y));
    this.rig.root.rotation.y = trackYaw(this.d); // built facing +Z, turned down-track
    this.rig.root.rotation.z = -this.bank * 0.3;
  }

  private animate(dt: number): void {
    const r = this.rig;
    const t = this.runPhase;

    if (this.grounded) {
      const swing = Math.sin(t);
      r.legL.rotation.x = swing * 0.95;
      r.legR.rotation.x = -swing * 0.95;
      if (r.winged) {
        // Wings flutter while running.
        r.armL.rotation.z = 0.4 + Math.abs(Math.sin(t * 1.6)) * 0.9;
        r.armR.rotation.z = -0.4 - Math.abs(Math.sin(t * 1.6)) * 0.9;
        r.armL.rotation.x = 0;
        r.armR.rotation.x = 0;
      } else {
        r.armL.rotation.x = -swing * 0.8;
        r.armR.rotation.x = swing * 0.8;
        r.armL.rotation.z = 0.12;
        r.armR.rotation.z = -0.12;
      }
      r.body.position.y = Math.abs(Math.sin(t)) * 0.09;
      const squashS = this.squash > 0 ? 1 - this.squash * 1.4 : 1;
      r.body.scale.set(2 - squashS, squashS, 1);
      r.body.scale.x = 1 + (1 - squashS) * 0.6;
      r.body.scale.z = 1 + (1 - squashS) * 0.6;
      r.head.rotation.x = Math.sin(t * 2) * 0.05;
    } else {
      // Airborne: tuck legs, throw arms up, stretch a little.
      const rising = this.vy > 0;
      r.legL.rotation.x = THREE.MathUtils.lerp(r.legL.rotation.x, rising ? 1.3 : 0.5, dt * 10);
      r.legR.rotation.x = THREE.MathUtils.lerp(r.legR.rotation.x, rising ? 0.9 : 0.3, dt * 10);
      if (r.winged) {
        const flap = Math.sin(performance.now() * 0.02);
        r.armL.rotation.z = 1.1 + flap * 0.7;
        r.armR.rotation.z = -1.1 - flap * 0.7;
      } else {
        r.armL.rotation.x = THREE.MathUtils.lerp(r.armL.rotation.x, -2.6, dt * 8);
        r.armR.rotation.x = THREE.MathUtils.lerp(r.armR.rotation.x, -2.6, dt * 8);
      }
      r.body.position.y = 0.05;
      r.body.scale.set(0.95, 1.08, 0.95);
      r.head.rotation.x = -0.12;
    }

    if (r.tail) {
      r.tail.rotation.y = Math.sin(t * 0.9) * 0.35;
      r.tail.rotation.x = Math.sin(t * 1.3) * 0.15;
    }
  }

  /** Happy dance for the results screen. */
  celebrate(dt: number): void {
    this.celebrationTime += dt;
    const t = this.celebrationTime;
    const r = this.rig;
    const hop = Math.abs(Math.sin(t * 5)) * 0.45;
    r.root.position.y = hop;
    r.root.rotation.y += dt * 2.2;
    r.armL.rotation.x = -2.6 + Math.sin(t * 10) * 0.4;
    r.armR.rotation.x = -2.6 - Math.sin(t * 10) * 0.4;
    r.armL.rotation.z = 0.3;
    r.armR.rotation.z = -0.3;
    r.legL.rotation.x = hop * 1.2;
    r.legR.rotation.x = hop * 1.2;
    r.body.position.y = 0;
    r.body.scale.setScalar(1);
    if (r.tail) r.tail.rotation.y = Math.sin(t * 8) * 0.6;
  }
}

/** Idle bob + wave used on the character select podium. */
export function idleAnimate(rig: Rig, time: number, selected: boolean): void {
  rig.body.position.y = Math.sin(time * 2.2) * 0.05;
  rig.head.rotation.z = Math.sin(time * 1.7) * 0.06;
  if (selected) {
    if (rig.winged) {
      rig.armL.rotation.z = 0.6 + Math.sin(time * 6) * 0.5;
      rig.armR.rotation.z = -0.3;
    } else {
      rig.armR.rotation.x = -2.4;
      rig.armR.rotation.z = -0.4 + Math.sin(time * 6) * 0.25;
      rig.armL.rotation.x = 0;
      rig.armL.rotation.z = 0.12;
    }
  } else {
    rig.armL.rotation.set(0, 0, rig.winged ? 0.4 : 0.12);
    rig.armR.rotation.set(0, 0, rig.winged ? -0.4 : -0.12);
  }
  if (rig.tail) rig.tail.rotation.y = Math.sin(time * 2.5) * 0.3;
}
