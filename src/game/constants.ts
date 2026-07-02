// Central tuning knobs for the whole game.

export const RUN_DURATION = 60; // seconds per round

// Movement
export const BASE_SPEED = 16; // units/sec at round start
export const MAX_SPEED = 26; // units/sec at round end
export const LATERAL_LIMIT = 4.3; // how far off the path center you can steer
export const LATERAL_SPEED = 10.5; // sideways speed cap
export const LATERAL_RESPONSE = 9; // proportional gain (1/s) toward the steer target
export const JUMP_VELOCITY = 9.6;
export const GRAVITY = -26;

// Track shape
export const TRACK_HALF_WIDTH = 5.4;
export const SEGMENT_LENGTH = 12;
export const SEGMENT_COUNT = 28;
export const THEME_LENGTH = 400; // distance per environment before rotating

// Bananas
export const COLLECT_RADIUS = 1.7;
export const BANANA_SPAWN_AHEAD = 280;

// Motion controls
export const TILT_FULL_STEER_DEG = 26; // roll angle for full steering
export const TILT_DEADZONE_DEG = 3;
export const TILT_SMOOTH_SLOW = 0.04; // gravity filter alpha during shakes/flicks
export const TILT_SMOOTH_FAST = 0.25; // alpha when the accel reads a clean 1g tilt
export const JERK_JUMP_THRESHOLD_G = 1.1; // accel spike (beyond gravity) to jump
export const JERK_JUMP_SAMPLES = 3; // consecutive spiking samples before it counts
export const JERK_COOLDOWN_MS = 450;

export function curveX(d: number): number {
  // Gentle winding S-curves; d = distance travelled along the path.
  return 6.5 * Math.sin(d * 0.021) + 3.2 * Math.sin(d * 0.047 + 1.7);
}

export function curveSlope(d: number): number {
  // d(curveX)/dd, used for path tangents.
  return 6.5 * 0.021 * Math.cos(d * 0.021) + 3.2 * 0.047 * Math.cos(d * 0.047 + 1.7);
}
