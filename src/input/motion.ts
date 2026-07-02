import type { DualSenseSample } from './dualsense';
import {
  TILT_FULL_STEER_DEG,
  TILT_DEADZONE_DEG,
  JERK_JUMP_THRESHOLD_G,
  JERK_COOLDOWN_MS,
} from '../game/constants';

// Turns raw IMU samples into game intent:
//  - Steering: the low-passed accelerometer estimates the gravity direction,
//    and the controller's roll angle around it maps to -1..1 steering.
//  - Jump: any sharp acceleration spike beyond gravity (a "jerk") triggers a
//    jump. Direction is deliberately ignored so an excited kid flicking the
//    controller any which way still gets their jump.
export class MotionMapper {
  private gx = 0;
  private gy = 1;
  private gz = 0;
  private lastJumpAt = -Infinity;
  private jumpQueued = false;
  private flip: boolean;
  steer = 0;

  constructor() {
    this.flip = localStorage.getItem('banana-run-flip-steer') === '1';
  }

  setFlipped(flipped: boolean): void {
    this.flip = flipped;
    localStorage.setItem('banana-run-flip-steer', flipped ? '1' : '0');
  }

  get flipped(): boolean {
    return this.flip;
  }

  feed(sample: DualSenseSample): void {
    if (!sample.hasMotion) return;
    const { x: ax, y: ay, z: az } = sample.accel;

    // Jerk detection against the *previous* gravity estimate, so the spike
    // itself doesn't get absorbed into the baseline first.
    const dx = ax - this.gx;
    const dy = ay - this.gy;
    const dz = az - this.gz;
    const jerk = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const now = sample.timestamp;
    if (jerk > JERK_JUMP_THRESHOLD_G && now - this.lastJumpAt > JERK_COOLDOWN_MS) {
      this.lastJumpAt = now;
      this.jumpQueued = true;
    }

    // Gravity low-pass. Reports arrive ~250Hz over Bluetooth, so a small
    // alpha still settles in well under 200ms.
    const alpha = 0.04;
    this.gx += (ax - this.gx) * alpha;
    this.gy += (ay - this.gy) * alpha;
    this.gz += (az - this.gz) * alpha;

    // Roll: positive when the right edge of the controller dips.
    let rollDeg = (Math.atan2(-this.gx, this.gy) * 180) / Math.PI;
    if (this.flip) rollDeg = -rollDeg;
    const magnitude = Math.abs(rollDeg);
    if (magnitude < TILT_DEADZONE_DEG) {
      this.steer = 0;
    } else {
      const t = Math.min(
        (magnitude - TILT_DEADZONE_DEG) / (TILT_FULL_STEER_DEG - TILT_DEADZONE_DEG),
        1
      );
      // Slight ease-in makes small corrections gentle for little hands.
      this.steer = Math.sign(rollDeg) * t * t * (3 - 2 * t);
    }
  }

  consumeJump(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }
}
