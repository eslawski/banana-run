import * as THREE from 'three';
import { World } from './world';
import { Track } from './track';
import { BananaField } from './bananas';
import { EnvironmentController, trackPoint, trackYaw } from './environment';
import { Player, idleAnimate } from './player';
import { CHARACTERS, type Rig } from './characters';
import { InputManager } from '../input/inputManager';
import { AudioEngine } from '../audio/audio';
import { Screens } from '../ui/screens';
import { RUN_DURATION, COLLECT_RADIUS } from './constants';

type GameState = 'home' | 'countdown' | 'running' | 'results';

const BEST_KEY = 'banana-run-best';
const CHAR_KEY = 'banana-run-character';

export class Game {
  private world: World;
  private track: Track;
  private bananas: BananaField;
  private env: EnvironmentController;
  private input = new InputManager();
  private audio = new AudioEngine();
  private screens: Screens;

  private state: GameState = 'home';
  private selected: number;
  private player: Player | null = null;

  // Podium rigs for the character-select screen.
  private podiumRigs: Rig[] = [];
  private podiumGroup = new THREE.Group();
  private podiumSlots: THREE.Vector3[] = [];

  private time = 0;
  private countdownStart = 0;
  private lastCountdownStep = -1;
  private runStart = 0;
  private score = 0;
  private combo = 0;
  private lastCollectAt = -Infinity;
  private lastWholeSecond = -1;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private lastFrame = performance.now();

  constructor(container: HTMLElement) {
    this.world = new World(container);
    this.env = new EnvironmentController(this.world.scene);
    this.track = new Track(this.world.scene);
    this.bananas = new BananaField(this.world.scene);

    this.selected = Math.min(4, Math.max(0, Number(localStorage.getItem(CHAR_KEY) ?? 0) || 0));

    this.screens = new Screens(
      document.body,
      {
        onPlay: () => this.startCountdown(),
        onCharStep: (dir) => this.changeCharacter(this.selected + dir),
        onCharPick: (i) => this.changeCharacter(i),
        onConnect: () => void this.connectController(),
        onMute: () => {
          this.audio.setMuted(!this.audio.muted);
          return this.audio.muted;
        },
        onFlip: () => {
          this.input.motion.setFlipped(!this.input.motion.flipped);
          return this.input.motion.flipped;
        },
        onPlayAgain: () => this.startCountdown(),
        onHome: () => this.goHome(),
      },
      this.input.supported,
      this.audio.muted,
      this.input.motion.flipped
    );

    this.input.onConnectionChange = (connected, name) => {
      this.screens.setPadStatus(connected, name);
      this.screens.toast(
        connected ? `🎮 ${name} connected — tilt to steer!` : '🎮 Controller disconnected — keyboard still works!'
      );
    };
    void this.input.pad.autoConnect();

    this.buildPodium();
    this.goHome();
    this.world.renderer.setAnimationLoop(() => this.frame());

    // Debug helper: manually advance the loop (e.g. from devtools) even
    // when the tab is hidden and requestAnimationFrame is paused.
    (window as unknown as { __step: (s?: number) => void }).__step = (seconds = 1 / 60) => {
      const steps = Math.max(1, Math.round(seconds * 60));
      for (let i = 0; i < steps; i++) {
        this.lastFrame = performance.now() - 1000 / 60;
        this.frame();
      }
    };
  }

  // ------------------------------------------------------------ podium

  private buildPodium(): void {
    this.world.scene.add(this.podiumGroup);
    const discGeo = new THREE.CylinderGeometry(1.15, 1.35, 0.5, 24);
    for (let i = 0; i < CHARACTERS.length; i++) {
      const rig = CHARACTERS[i]!.build();
      rig.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      const disc = new THREE.Mesh(
        discGeo,
        new THREE.MeshToonMaterial({ color: '#9aa08a' })
      );
      disc.position.y = -0.25;
      disc.receiveShadow = true;
      rig.root.add(disc);
      this.podiumGroup.add(rig.root);
      this.podiumRigs.push(rig);
      this.podiumSlots.push(new THREE.Vector3());
    }
  }

  private layoutPodium(): void {
    // Selected character gets the spotlight left of the UI card; everyone
    // else waits in a little lineup on the right.
    let bench = 0;
    for (let i = 0; i < this.podiumRigs.length; i++) {
      if (i === this.selected) {
        this.podiumSlots[i]!.copy(trackPoint(10, -3.4, 0.25));
      } else {
        this.podiumSlots[i]!.copy(trackPoint(11.3 + bench * 0.4, 2.3 + bench * 1.75, 0.25));
        bench++;
      }
    }
  }

  private changeCharacter(index: number): void {
    const n = CHARACTERS.length;
    this.selected = ((index % n) + n) % n;
    localStorage.setItem(CHAR_KEY, String(this.selected));
    this.screens.setCharacter(CHARACTERS[this.selected]!, this.selected);
    this.layoutPodium();
    this.audio.uiClick();
  }

  private async connectController(): Promise<void> {
    this.audio.ensureContext();
    try {
      const ok = await this.input.pad.requestConnect();
      if (!ok) this.screens.toast('No controller picked — pair it in Bluetooth settings first!');
    } catch {
      this.screens.toast('Could not open the controller. Try re-pairing it.');
    }
  }

  // ------------------------------------------------------ state changes

  private goHome(): void {
    this.state = 'home';
    if (this.player) {
      this.player.dispose(this.world.scene);
      this.player = null;
    }
    this.audio.stopMusic();
    this.track.reset();
    this.bananas.reset();
    this.env.snapTo(0);
    this.podiumGroup.visible = true;
    this.layoutPodium();
    // Snap podium rigs straight to their slots on entry.
    for (let i = 0; i < this.podiumRigs.length; i++) {
      this.podiumRigs[i]!.root.position.copy(this.podiumSlots[i]!);
    }
    this.screens.showHome();
    this.screens.setCharacter(CHARACTERS[this.selected]!, this.selected);
    const home = trackPoint(18, 0, 0);
    this.camPos.set(home.x, 2.6, home.z - 1);
    this.camLook.copy(trackPoint(10, 0, 1.2));
  }

  private startCountdown(): void {
    this.audio.ensureContext();
    this.state = 'countdown';
    this.countdownStart = this.time;
    this.lastCountdownStep = -1;
    this.podiumGroup.visible = false;
    if (this.player) this.player.dispose(this.world.scene);
    this.player = new Player(this.world.scene, CHARACTERS[this.selected]!);
    this.player.reset();
    this.track.reset();
    this.bananas.reset();
    this.env.snapTo(0);
    this.score = 0;
    this.combo = 0;
    this.screens.hideAll();
    this.screens.showHud();
    this.screens.updateHud(0, RUN_DURATION, 1);
    this.input.consumeJump(); // clear anything queued on the menu
  }

  private startRun(): void {
    this.state = 'running';
    this.runStart = this.time;
    this.lastWholeSecond = -1;
    this.audio.startMusic();
    this.input.consumeJump();
  }

  private endRun(): void {
    this.state = 'results';
    this.audio.stopMusic();
    this.audio.fanfare();
    const best = Number(localStorage.getItem(BEST_KEY) ?? 0);
    const isRecord = this.score > best;
    if (isRecord) localStorage.setItem(BEST_KEY, String(this.score));
    this.screens.showResults(this.score, isRecord ? best : Math.max(best, this.score), isRecord);
  }

  // ------------------------------------------------------------- frame

  private frame(): void {
    (window as unknown as { __hb: number }).__hb = ((window as unknown as { __hb: number }).__hb ?? 0) + 1;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;

    this.input.update(dt);
    const actions = this.input.consumeUiActions();

    switch (this.state) {
      case 'home':
        this.tickHome(dt, actions);
        break;
      case 'countdown':
        this.tickCountdown(dt);
        break;
      case 'running':
        this.tickRunning(dt);
        break;
      case 'results':
        this.tickResults(dt, actions);
        break;
    }

    this.world.render();
  }

  private tickHome(dt: number, actions: string[]): void {
    for (const action of actions) {
      if (action === 'left') this.changeCharacter(this.selected - 1);
      else if (action === 'right') this.changeCharacter(this.selected + 1);
      else if (action === 'start') return this.startCountdown();
    }

    for (let i = 0; i < this.podiumRigs.length; i++) {
      const rig = this.podiumRigs[i]!;
      const isSel = i === this.selected;
      rig.root.position.lerp(this.podiumSlots[i]!, Math.min(1, dt * 8));
      const targetScale = isSel ? 1.04 : 0.72;
      const s = rig.root.scale.x + (targetScale - rig.root.scale.x) * Math.min(1, dt * 8);
      rig.root.scale.setScalar(s);
      // Face the camera, which sits further down-track than the podium.
      rig.root.rotation.y = trackYaw(10) + (isSel ? Math.sin(this.time * 0.7) * 0.25 : 0);
      idleAnimate(rig, this.time + i * 1.3, isSel);
    }

    // Camera drifts gently, framing the spotlight character to the left of
    // the UI card and the lineup to the right.
    const camTarget = this.tmp.copy(trackPoint(17, Math.sin(this.time * 0.4) * 1.2, 2.1));
    this.camPos.lerp(camTarget, Math.min(1, dt * 3));
    const lookAt = trackPoint(10, -0.6, 0);
    this.camLook.lerp(this.tmp2.set(lookAt.x, -0.35, lookAt.z), Math.min(1, dt * 5));
    this.world.camera.position.copy(this.camPos);
    this.world.camera.lookAt(this.camLook);

    this.env.tick(dt, 0, this.camPos, this.time);
  }

  private tickCountdown(dt: number): void {
    const elapsed = this.time - this.countdownStart;
    const step = Math.floor(elapsed);
    if (step !== this.lastCountdownStep) {
      this.lastCountdownStep = step;
      const remaining = 3 - step;
      if (remaining > 0) {
        this.screens.showCountdown(String(remaining));
        this.audio.countdownBeep(false);
      } else {
        this.screens.showCountdown('GO!');
        this.audio.countdownBeep(true);
      }
    }
    if (elapsed >= 3.6) {
      this.screens.hideCountdown();
      this.startRun();
      return;
    }

    const player = this.player!;
    idleAnimate(player.rig, this.time, false);
    player.rig.legL.rotation.x = Math.sin(this.time * 3) * 0.1;
    player.rig.legR.rotation.x = -Math.sin(this.time * 3) * 0.1;

    // Sweep the camera from the podium shot to the chase position.
    const t = Math.min(1, elapsed / 3);
    const ease = t * t * (3 - 2 * t);
    const chase = this.chaseCamPos(player);
    this.camPos.lerp(chase, ease * Math.min(1, dt * 10) + 0.02);
    this.camLook.lerp(this.tmp2.copy(player.rig.root.position).add(this.tmp.set(0, 1.2, 0)), Math.min(1, dt * 6));
    this.world.camera.position.copy(this.camPos);
    this.world.camera.lookAt(this.camLook);
    this.env.tick(dt, 0, player.rig.root.position, this.time);
  }

  private chaseCamPos(player: Player): THREE.Vector3 {
    const behind = trackPoint(player.d - 8.5, player.lateral * 0.5, 0);
    behind.y = 4.2 + player.y * 0.3;
    return behind;
  }

  private tickRunning(dt: number): void {
    const player = this.player!;
    const elapsed = this.time - this.runStart;
    const timeLeft = RUN_DURATION - elapsed;

    if (this.input.consumeJump() && player.jump()) {
      this.audio.jump();
    }
    player.update(dt, this.input.steer, elapsed);
    this.track.update(player.d);

    const center = player.center(this.tmp);
    const radius = COLLECT_RADIUS * player.def.traits.collectRadius;
    const collected = this.bananas.update(dt, player.d, center, radius);
    if (collected > 0) {
      if (this.time - this.lastCollectAt > 1.4) this.combo = 0;
      for (let i = 0; i < collected; i++) {
        this.combo++;
        this.score++;
        this.audio.collect(this.combo);
      }
      this.lastCollectAt = this.time;
      this.screens.pulseCount();
      this.screens.showCombo(this.combo);
    }

    // Final-seconds tick-tock.
    const whole = Math.ceil(timeLeft);
    if (whole !== this.lastWholeSecond) {
      this.lastWholeSecond = whole;
      if (whole <= 5 && whole > 0) this.audio.timeWarning();
    }

    this.screens.updateHud(this.score, timeLeft, timeLeft / RUN_DURATION);

    // Chase camera with soft damping.
    const chase = this.chaseCamPos(player);
    const k = 1 - Math.exp(-dt * 5);
    this.camPos.lerp(chase, k);
    const lookTarget = trackPoint(player.d + 11, player.lateral * 0.4, 1.6 + player.y * 0.4);
    this.camLook.lerp(lookTarget, 1 - Math.exp(-dt * 7));
    this.world.camera.position.copy(this.camPos);
    this.world.camera.lookAt(this.camLook);

    this.env.tick(dt, player.d, player.rig.root.position, this.time);

    if (timeLeft <= 0) this.endRun();
  }

  private tickResults(dt: number, actions: string[]): void {
    for (const action of actions) {
      if (action === 'start') return this.startCountdown();
    }
    const player = this.player!;
    player.celebrate(dt);

    // Swing around to see the happy dance from the front.
    const front = trackPoint(player.d + 6.5, player.lateral, 0);
    front.y = 2.3;
    this.camPos.lerp(front, 1 - Math.exp(-dt * 2.5));
    this.camLook.lerp(this.tmp2.copy(player.rig.root.position).add(this.tmp.set(0, 1.1, 0)), 1 - Math.exp(-dt * 4));
    this.world.camera.position.copy(this.camPos);
    this.world.camera.lookAt(this.camLook);
    this.env.tick(dt, player.d, player.rig.root.position, this.time);
  }
}
