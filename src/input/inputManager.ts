import { DualSense, webHidSupported } from './dualsense';
import { MotionMapper } from './motion';

export type UiAction = 'left' | 'right' | 'up' | 'down' | 'select' | 'start';

// Merges DualSense motion controls with the keyboard fallback into one
// steering value, a jump queue, and menu navigation events.
export class InputManager {
  readonly pad = new DualSense();
  readonly motion = new MotionMapper();

  private keys = new Set<string>();
  private keyboardSteer = 0;
  private jumpQueued = false;
  private uiQueue: UiAction[] = [];
  private prevCross = false;
  private prevDpadLeft = false;
  private prevDpadRight = false;
  private prevDpadUp = false;
  private prevDpadDown = false;
  private prevOptions = false;
  private stickX = 0;

  /** -1..1, updated every frame via update(). */
  steer = 0;

  onConnectionChange: ((connected: boolean, name: string) => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (ev) => {
      if (ev.repeat) return;
      this.keys.add(ev.code);
      switch (ev.code) {
        case 'ArrowUp':
          this.uiQueue.push('up');
          this.jumpQueued = true;
          ev.preventDefault();
          break;
        case 'Space':
        case 'KeyW':
          this.jumpQueued = true;
          ev.preventDefault();
          break;
        case 'ArrowDown':
          this.uiQueue.push('down');
          ev.preventDefault();
          break;
        case 'ArrowLeft':
          this.uiQueue.push('left');
          break;
        case 'ArrowRight':
          this.uiQueue.push('right');
          break;
        case 'Enter':
          this.uiQueue.push('select');
          break;
      }
    });
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.pad.onConnection = (connected, name) => {
      this.onConnectionChange?.(connected, name);
    };
    this.pad.onSample = (sample) => {
      this.motion.feed(sample);
      this.stickX = Math.abs(sample.stick.x) > 0.15 ? sample.stick.x : 0;
      if (sample.cross && !this.prevCross) {
        this.jumpQueued = true;
        this.uiQueue.push('select');
      }
      if (sample.dpadLeft && !this.prevDpadLeft) this.uiQueue.push('left');
      if (sample.dpadRight && !this.prevDpadRight) this.uiQueue.push('right');
      if (sample.dpadUp && !this.prevDpadUp) this.uiQueue.push('up');
      if (sample.dpadDown && !this.prevDpadDown) this.uiQueue.push('down');
      if (sample.options && !this.prevOptions) this.uiQueue.push('start');
      this.prevCross = sample.cross;
      this.prevDpadLeft = sample.dpadLeft;
      this.prevDpadRight = sample.dpadRight;
      this.prevDpadUp = sample.dpadUp;
      this.prevDpadDown = sample.dpadDown;
      this.prevOptions = sample.options;
    };
  }

  get controllerConnected(): boolean {
    return this.pad.connected;
  }

  get supported(): boolean {
    return webHidSupported();
  }

  update(dt: number): void {
    // Keyboard steering ramps so taps give fine control.
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    const ramp = target === 0 ? 12 : 6;
    this.keyboardSteer += (target - this.keyboardSteer) * Math.min(1, ramp * dt);
    if (Math.abs(this.keyboardSteer) < 0.02 && target === 0) this.keyboardSteer = 0;

    if (this.pad.connected) {
      const motionSteer = this.motion.steer;
      // Stick works as a backup even when motion is flowing.
      const padSteer = Math.abs(motionSteer) > Math.abs(this.stickX) ? motionSteer : this.stickX;
      this.steer = Math.abs(padSteer) > Math.abs(this.keyboardSteer) ? padSteer : this.keyboardSteer;
    } else {
      this.steer = this.keyboardSteer;
    }
    if (this.motion.consumeJump()) this.jumpQueued = true;
  }

  consumeJump(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  consumeUiActions(): UiAction[] {
    const queue = this.uiQueue;
    this.uiQueue = [];
    return queue;
  }
}
