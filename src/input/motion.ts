import type { DualSenseSample } from './dualsense';
import {
  TILT_FULL_STEER_DEG,
  TILT_DEADZONE_DEG,
  TILT_SMOOTH_SLOW,
  TILT_SMOOTH_FAST,
  JERK_JUMP_THRESHOLD_G,
  JERK_JUMP_SAMPLES,
  JERK_COOLDOWN_MS,
} from '../game/constants';

// Turns raw IMU samples into game intent:
//  - Steering: the low-passed accelerometer estimates the gravity direction,
//    and the controller's roll angle around it maps to -1..1 steering.
//  - Jump: a sharp acceleration spike beyond gravity (a "jerk") that holds
//    for a few consecutive samples triggers a jump. Direction is deliberately
//    ignored so an excited kid flicking the controller any which way still
//    gets their jump, but the threshold + streak keep ordinary steering
//    wobble from firing it.
export class MotionMapper {
  private gx = 0;
  private gy = 1;
  private gz = 0;
  private jerkStreak = 0;
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
    this.jerkStreak = jerk > JERK_JUMP_THRESHOLD_G ? this.jerkStreak + 1 : 0;
    if (this.jerkStreak >= JERK_JUMP_SAMPLES && now - this.lastJumpAt > JERK_COOLDOWN_MS) {
      this.lastJumpAt = now;
      this.jumpQueued = true;
      this.jerkStreak = 0;
    }

    // Gravity low-pass with adaptive speed. During a steady tilt the accel
    // magnitude stays ~1g, so the reading *is* the gravity direction — track
    // it fast for low-latency steering. When the controller is being shaken
    // or flicked the magnitude strays from 1g and we fall back to the slow,
    // stable baseline (which also keeps jerk detection honest). Reports
    // arrive ~250Hz over Bluetooth.
    const mag = Math.sqrt(ax * ax + ay * ay + az * az);
    const trust = Math.max(0, 1 - Math.abs(mag - 1) * 5);
    const alpha = TILT_SMOOTH_SLOW + (TILT_SMOOTH_FAST - TILT_SMOOTH_SLOW) * trust;
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
      // Mild ease-in: gentle near center for little hands, but close to
      // linear overall so mid-tilt corrections don't surge and overshoot
      // (smoothstep's 1.5x mid-range gain made steering feel twitchy).
      this.steer = Math.sign(rollDeg) * t * (0.6 + 0.4 * t);
    }
  }

  consumeJump(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }
}
