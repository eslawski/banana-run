// WebHID driver for the Sony DualSense (PS5) controller.
//
// Over Bluetooth the DualSense boots in a "simple" mode that only reports
// sticks and buttons (report 0x01, 9 bytes). Requesting the calibration
// feature report (0x05) flips it into enhanced mode, where it streams
// report 0x31 with the full payload including the IMU (gyro + accelerometer).
// Over USB it always streams the full report 0x01.

const SONY_VENDOR_ID = 0x054c;
const DUALSENSE_PRODUCT_IDS = [0x0ce6 /* DualSense */, 0x0df2 /* DualSense Edge */];

const GYRO_RES_PER_DEG_S = 1024;
const ACCEL_RES_PER_G = 8192;

export interface DualSenseSample {
  /** Angular velocity in deg/s: pitch (x), yaw (y), roll (z). */
  gyro: { x: number; y: number; z: number };
  /** Proper acceleration in g. At rest, roughly (0, 1, 0) when held flat. */
  accel: { x: number; y: number; z: number };
  /** Left stick, -1..1 (x right, y down). */
  stick: { x: number; y: number };
  cross: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  dpadUp: boolean;
  dpadDown: boolean;
  options: boolean;
  /** True when this sample includes real IMU data (enhanced mode). */
  hasMotion: boolean;
  timestamp: number;
}

type ConnectionListener = (connected: boolean, name: string) => void;
type SampleListener = (sample: DualSenseSample) => void;

export function webHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

export class DualSense {
  private device: HIDDevice | null = null;
  private enhancedRequested = false;
  onSample: SampleListener | null = null;
  onConnection: ConnectionListener | null = null;
  motionSeen = false;

  get connected(): boolean {
    return this.device !== null;
  }

  constructor() {
    if (!webHidSupported()) return;
    navigator.hid.addEventListener('disconnect', (ev) => {
      if (this.device && ev.device === this.device) {
        this.detach();
      }
    });
  }

  /** Reconnect to a previously-permitted controller without a prompt. */
  async autoConnect(): Promise<boolean> {
    if (!webHidSupported()) return false;
    try {
      const devices = await navigator.hid.getDevices();
      const match = devices.find((d) => this.isDualSense(d));
      if (match) {
        await this.attach(match);
        return true;
      }
    } catch {
      /* not available; keyboard still works */
    }
    return false;
  }

  /** Show the browser's device picker. Must be called from a user gesture. */
  async requestConnect(): Promise<boolean> {
    if (!webHidSupported()) return false;
    const devices = await navigator.hid.requestDevice({
      filters: DUALSENSE_PRODUCT_IDS.map((productId) => ({
        vendorId: SONY_VENDOR_ID,
        productId,
      })),
    });
    const device = devices.find((d) => this.isDualSense(d));
    if (!device) return false;
    await this.attach(device);
    return true;
  }

  private isDualSense(d: HIDDevice): boolean {
    return d.vendorId === SONY_VENDOR_ID && DUALSENSE_PRODUCT_IDS.includes(d.productId);
  }

  private async attach(device: HIDDevice): Promise<void> {
    if (this.device) this.detach();
    if (!device.opened) await device.open();
    this.device = device;
    this.enhancedRequested = false;
    this.motionSeen = false;
    device.addEventListener('inputreport', this.handleReport);
    await this.enableEnhancedMode();
    this.onConnection?.(true, device.productName || 'DualSense');
  }

  private detach(): void {
    const device = this.device;
    this.device = null;
    if (device) {
      device.removeEventListener('inputreport', this.handleReport);
      device.close().catch(() => {});
    }
    this.onConnection?.(false, '');
  }

  private async enableEnhancedMode(): Promise<void> {
    if (!this.device || this.enhancedRequested) return;
    this.enhancedRequested = true;
    try {
      // Reading the calibration feature report switches a Bluetooth
      // connection into enhanced (full report) mode. Harmless over USB.
      await this.device.receiveFeatureReport(0x05);
    } catch {
      // Some setups reject this over USB; USB already streams full reports.
    }
  }

  private handleReport = (ev: HIDInputReportEvent): void => {
    let offset: number;
    let hasMotion: boolean;
    if (ev.reportId === 0x31 && ev.data.byteLength >= 63) {
      // Bluetooth enhanced mode: one leading sequence byte, then the payload.
      offset = 1;
      hasMotion = true;
    } else if (ev.reportId === 0x01 && ev.data.byteLength >= 60) {
      // USB full report.
      offset = 0;
      hasMotion = true;
    } else if (ev.reportId === 0x01) {
      // Bluetooth simple mode: sticks + buttons only. Nudge into enhanced
      // mode (again) and still surface the buttons meanwhile.
      this.enhancedRequested = false;
      void this.enableEnhancedMode();
      this.emitSimple(ev.data);
      return;
    } else {
      return;
    }

    const d = ev.data;
    const stickX = (d.getUint8(offset + 0) - 127.5) / 127.5;
    const stickY = (d.getUint8(offset + 1) - 127.5) / 127.5;
    const btn0 = d.getUint8(offset + 7);
    const btn1 = d.getUint8(offset + 8);
    const dpad = btn0 & 0x0f; // hat switch: 0=N, 2=E, 4=S, 6=W, 8=released

    const sample: DualSenseSample = {
      gyro: {
        x: d.getInt16(offset + 15, true) / GYRO_RES_PER_DEG_S,
        y: d.getInt16(offset + 17, true) / GYRO_RES_PER_DEG_S,
        z: d.getInt16(offset + 19, true) / GYRO_RES_PER_DEG_S,
      },
      accel: {
        x: d.getInt16(offset + 21, true) / ACCEL_RES_PER_G,
        y: d.getInt16(offset + 23, true) / ACCEL_RES_PER_G,
        z: d.getInt16(offset + 25, true) / ACCEL_RES_PER_G,
      },
      stick: { x: stickX, y: stickY },
      cross: (btn0 & 0x20) !== 0,
      dpadLeft: dpad === 5 || dpad === 6 || dpad === 7,
      dpadRight: dpad === 1 || dpad === 2 || dpad === 3,
      dpadUp: dpad === 7 || dpad === 0 || dpad === 1,
      dpadDown: dpad === 3 || dpad === 4 || dpad === 5,
      options: (btn1 & 0x20) !== 0,
      hasMotion,
      timestamp: performance.now(),
    };
    if (hasMotion) this.motionSeen = true;
    this.onSample?.(sample);
  };

  private emitSimple(d: DataView): void {
    if (d.byteLength < 9) return;
    const btn0 = d.getUint8(4);
    const dpad = btn0 & 0x0f;
    this.onSample?.({
      gyro: { x: 0, y: 0, z: 0 },
      accel: { x: 0, y: 1, z: 0 },
      stick: {
        x: (d.getUint8(0) - 127.5) / 127.5,
        y: (d.getUint8(1) - 127.5) / 127.5,
      },
      cross: (btn0 & 0x20) !== 0,
      dpadLeft: dpad === 5 || dpad === 6 || dpad === 7,
      dpadRight: dpad === 1 || dpad === 2 || dpad === 3,
      dpadUp: dpad === 7 || dpad === 0 || dpad === 1,
      dpadDown: dpad === 3 || dpad === 4 || dpad === 5,
      options: (d.getUint8(5) & 0x20) !== 0,
      hasMotion: false,
      timestamp: performance.now(),
    });
  }
}
