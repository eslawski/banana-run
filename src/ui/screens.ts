import type { CharacterDef } from '../game/characters';

// All DOM overlays: home / character select, countdown, HUD, results.
// The 3D canvas lives underneath; these screens float on top.

const BANANA_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 10c2 14 10 24 24 26 6 1 10-1 12-4-1 3-6 9-16 9C14 41 6 27 5 14c0-2 2-5 3-4z" fill="#ffd028" stroke="#7a5217" stroke-width="2.4" stroke-linejoin="round"/><path d="M7 9l2-3c1-1 3 0 3 1l-1 4z" fill="#8a6a2a" stroke="#7a5217" stroke-width="2"/></svg>`;

export interface ScreenCallbacks {
  onPlay(): void;
  onCharStep(dir: number): void;
  onCharPick(index: number): void;
  onConnect(): void;
  onMute(): boolean; // returns new muted state
  onFlip(): boolean; // returns new flipped state
  onPlayAgain(): void;
  onHome(): void;
}

export class Screens {
  private root: HTMLElement;
  private home!: HTMLElement;
  private hud!: HTMLElement;
  private results!: HTMLElement;
  private countdownEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private charName!: HTMLElement;
  private charTagline!: HTMLElement;
  private charChip!: HTMLElement;
  private dots: HTMLElement[] = [];
  private countEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private timerFill!: HTMLElement;
  private comboEl!: HTMLElement;
  private padStatus!: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private flipBtn!: HTMLButtonElement;
  private connectBtn!: HTMLButtonElement;
  private finalScore!: HTMLElement;
  private bestLine!: HTMLElement;
  private resultsTitle!: HTMLElement;
  private confettiBox!: HTMLElement;
  private toastTimer: number | null = null;
  private comboTimer: number | null = null;

  // Gamepad/keyboard focus: which buttons the d-pad can walk through on the
  // currently visible screen, in navigation order.
  private homeFocus: HTMLButtonElement[] = [];
  private resultsFocus: HTMLButtonElement[] = [];
  private focusList: HTMLButtonElement[] = [];
  private focused: HTMLButtonElement | null = null;

  constructor(parent: HTMLElement, private cb: ScreenCallbacks, hidSupported: boolean, muted: boolean, flipped: boolean) {
    this.root = document.createElement('div');
    this.root.id = 'ui';
    parent.appendChild(this.root);
    this.buildHome(hidSupported, muted, flipped);
    this.buildHud();
    this.buildCountdown();
    this.buildResults();
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toast';
    this.root.appendChild(this.toastEl);
  }

  private buildHome(hidSupported: boolean, muted: boolean, flipped: boolean): void {
    this.home = document.createElement('div');
    this.home.className = 'screen home';
    this.home.innerHTML = `
      <div class="logo">
        <span class="logo-banana logo-banana-l">${BANANA_SVG}</span>
        <h1><span class="logo-word">BANANA</span><span class="logo-word logo-run">RUN!</span></h1>
        <span class="logo-banana logo-banana-r">${BANANA_SVG}</span>
      </div>
      <div class="char-row">
        <button class="arrow-btn" data-dir="-1" aria-label="Previous character">◀</button>
        <div class="char-card">
          <div class="char-name"></div>
          <div class="char-chip"></div>
          <div class="char-tagline"></div>
        </div>
        <button class="arrow-btn" data-dir="1" aria-label="Next character">▶</button>
      </div>
      <div class="dots"></div>
      <button class="play-btn">PLAY!</button>
      <div class="pad-row">
        <button class="pill-btn connect-btn">🎮 Connect PS5 Controller</button>
        <span class="pad-status"></span>
      </div>
      <div class="settings-row">
        <button class="pill-btn small mute-btn"></button>
        <button class="pill-btn small flip-btn"></button>
      </div>
      <div class="howto"></div>
    `;
    this.root.appendChild(this.home);

    this.charName = this.home.querySelector('.char-name')!;
    this.charTagline = this.home.querySelector('.char-tagline')!;
    this.charChip = this.home.querySelector('.char-chip')!;
    this.padStatus = this.home.querySelector('.pad-status')!;
    this.connectBtn = this.home.querySelector('.connect-btn')!;
    this.muteBtn = this.home.querySelector('.mute-btn')!;
    this.flipBtn = this.home.querySelector('.flip-btn')!;

    const dotsBox = this.home.querySelector('.dots')!;
    for (let i = 0; i < 5; i++) {
      const dot = document.createElement('button');
      dot.className = 'dot';
      dot.addEventListener('click', () => this.cb.onCharPick(i));
      dotsBox.appendChild(dot);
      this.dots.push(dot);
    }

    this.home.querySelectorAll<HTMLButtonElement>('.arrow-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.cb.onCharStep(Number(btn.dataset.dir)));
    });
    const playBtn = this.home.querySelector<HTMLButtonElement>('.play-btn')!;
    playBtn.addEventListener('click', () => this.cb.onPlay());
    // Character choice is on the d-pad left/right, so focus only walks the
    // vertical stack of buttons.
    this.homeFocus = [playBtn, this.connectBtn, this.muteBtn, this.flipBtn];
    this.connectBtn.addEventListener('click', () => this.cb.onConnect());
    this.muteBtn.addEventListener('click', () => this.setMuteLabel(this.cb.onMute()));
    this.flipBtn.addEventListener('click', () => this.setFlipLabel(this.cb.onFlip()));
    this.setMuteLabel(muted);
    this.setFlipLabel(flipped);

    const howto = this.home.querySelector('.howto')!;
    if (hidSupported) {
      howto.innerHTML = `Tilt the controller to steer &nbsp;·&nbsp; Flick it up to jump<br/><span class="howto-alt">Menus: D-pad to move, ✕ to pick &nbsp;·&nbsp; (or steer with ⬅ ➡ and jump with SPACE)</span>`;
      this.setPadStatus(false, '');
    } else {
      howto.innerHTML = `Steer with ⬅ ➡ &nbsp;·&nbsp; Jump with SPACE<br/><span class="howto-alt">For PS5 controller motion play, open this game in Chrome.</span>`;
      this.connectBtn.style.display = 'none';
    }
  }

  private buildHud(): void {
    this.hud = document.createElement('div');
    this.hud.className = 'screen hud';
    this.hud.innerHTML = `
      <div class="hud-count">${BANANA_SVG}<span class="count">0</span></div>
      <div class="hud-timer"><div class="timer-fill"></div><span class="time">60</span></div>
      <div class="combo"></div>
    `;
    this.root.appendChild(this.hud);
    this.countEl = this.hud.querySelector('.count')!;
    this.timeEl = this.hud.querySelector('.time')!;
    this.timerFill = this.hud.querySelector('.timer-fill')!;
    this.comboEl = this.hud.querySelector('.combo')!;
  }

  private buildCountdown(): void {
    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'countdown';
    this.root.appendChild(this.countdownEl);
  }

  private buildResults(): void {
    this.results = document.createElement('div');
    this.results.className = 'screen results';
    this.results.innerHTML = `
      <div class="confetti"></div>
      <div class="results-card">
        <div class="results-title">TIME'S UP!</div>
        <div class="results-score">
          <span class="results-banana">${BANANA_SVG}</span>
          <span class="final-score">0</span>
        </div>
        <div class="results-label">BANANAS COLLECTED</div>
        <div class="best-line"></div>
        <div class="results-buttons">
          <button class="play-btn again-btn">PLAY AGAIN!</button>
          <button class="pill-btn home-btn">🏠 Pick Character</button>
        </div>
      </div>
    `;
    this.root.appendChild(this.results);
    this.finalScore = this.results.querySelector('.final-score')!;
    this.bestLine = this.results.querySelector('.best-line')!;
    this.resultsTitle = this.results.querySelector('.results-title')!;
    this.confettiBox = this.results.querySelector('.confetti')!;
    const againBtn = this.results.querySelector<HTMLButtonElement>('.again-btn')!;
    const homeBtn = this.results.querySelector<HTMLButtonElement>('.home-btn')!;
    againBtn.addEventListener('click', () => this.cb.onPlayAgain());
    homeBtn.addEventListener('click', () => this.cb.onHome());
    this.resultsFocus = [againBtn, homeBtn];
  }

  // ------------------------------------------------------------- controls

  showHome(): void {
    this.home.classList.add('visible');
    this.hud.classList.remove('visible');
    this.results.classList.remove('visible');
    this.setFocusList(this.homeFocus);
  }

  showHud(): void {
    this.home.classList.remove('visible');
    this.results.classList.remove('visible');
    this.hud.classList.add('visible');
    this.countEl.textContent = '0';
    this.setFocusList([]);
  }

  hideAll(): void {
    this.home.classList.remove('visible');
    this.hud.classList.remove('visible');
    this.results.classList.remove('visible');
    this.setFocusList([]);
  }

  // -------------------------------------------------- gamepad focus

  private setFocusList(list: HTMLButtonElement[]): void {
    this.focusList = list;
    this.setFocused(this.visibleFocusables()[0] ?? null);
  }

  /** Buttons can hide (e.g. Connect after pairing), so filter every time. */
  private visibleFocusables(): HTMLButtonElement[] {
    return this.focusList.filter((btn) => btn.offsetParent !== null);
  }

  private setFocused(el: HTMLButtonElement | null): void {
    if (this.focused === el) return;
    this.focused?.classList.remove('gp-focus');
    this.focused = el;
    el?.classList.add('gp-focus');
  }

  /** Move d-pad focus by delta through the visible buttons, wrapping. */
  moveFocus(delta: number): void {
    const items = this.visibleFocusables();
    if (items.length === 0) return;
    const current = this.focused ? items.indexOf(this.focused) : -1;
    const next = current === -1 ? 0 : (current + delta + items.length) % items.length;
    this.setFocused(items[next]!);
  }

  /** Press the focused button (falls back to the first visible one). */
  activateFocus(): void {
    const target =
      this.focused && this.focused.offsetParent !== null
        ? this.focused
        : this.visibleFocusables()[0];
    target?.click();
  }

  setCharacter(def: CharacterDef, index: number): void {
    this.charName.innerHTML = `${def.name} <span class="species">${def.species}</span>`;
    this.charTagline.textContent = def.tagline;
    this.charChip.textContent = def.traitChip;
    this.charChip.style.background = def.accent;
    this.dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    const card = this.home.querySelector('.char-card')!;
    card.classList.remove('bounce');
    void (card as HTMLElement).offsetWidth; // restart animation
    card.classList.add('bounce');
  }

  setPadStatus(connected: boolean, name: string): void {
    this.padStatus.classList.toggle('connected', connected);
    this.padStatus.textContent = connected ? `✓ ${name} ready!` : 'No controller yet';
    this.connectBtn.style.display = connected ? 'none' : '';
    // If the Connect button was focused when it disappeared, move on.
    if (this.focused && this.focused.offsetParent === null) {
      this.setFocused(this.visibleFocusables()[0] ?? null);
    }
  }

  private setMuteLabel(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇 Sound Off' : '🔊 Sound On';
  }

  private setFlipLabel(flipped: boolean): void {
    this.flipBtn.textContent = flipped ? '🔁 Steering: Flipped' : '🔁 Steering: Normal';
  }

  updateHud(count: number, timeLeft: number, frac: number): void {
    this.countEl.textContent = String(count);
    this.timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
    this.timerFill.style.transform = `scaleX(${Math.max(0, frac)})`;
    this.timerFill.classList.toggle('urgent', timeLeft <= 5.5);
  }

  pulseCount(): void {
    const box = this.hud.querySelector('.hud-count')!;
    box.classList.remove('pop');
    void (box as HTMLElement).offsetWidth;
    box.classList.add('pop');
  }

  showCombo(n: number): void {
    if (n < 3) return;
    this.comboEl.textContent = `${n} in a row!`;
    this.comboEl.classList.remove('show');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('show');
    if (this.comboTimer !== null) clearTimeout(this.comboTimer);
    this.comboTimer = window.setTimeout(() => this.comboEl.classList.remove('show'), 900);
  }

  showCountdown(text: string): void {
    this.countdownEl.textContent = text;
    this.countdownEl.classList.remove('zoom');
    void this.countdownEl.offsetWidth;
    this.countdownEl.classList.add('zoom');
  }

  hideCountdown(): void {
    this.countdownEl.classList.remove('zoom');
    this.countdownEl.textContent = '';
  }

  showResults(score: number, best: number, isRecord: boolean): void {
    this.hud.classList.remove('visible');
    this.results.classList.add('visible');
    this.setFocusList(this.resultsFocus);
    this.resultsTitle.textContent = isRecord ? 'NEW RECORD!' : "TIME'S UP!";
    this.bestLine.textContent = isRecord ? `Old best: ${best} 🍌` : `Best ever: ${best} 🍌`;

    // Count-up animation.
    const dur = Math.min(2000, 400 + score * 40);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      this.finalScore.textContent = String(Math.round(score * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Confetti!
    this.confettiBox.innerHTML = '';
    const colors = ['#ffd028', '#ff5b7f', '#3f9be0', '#58c24f', '#ff8c1a', '#c85bff'];
    const count = isRecord ? 90 : 55;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--delay', `${Math.random() * 1.6}s`);
      piece.style.setProperty('--dur', `${2.2 + Math.random() * 2}s`);
      piece.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
      piece.style.setProperty('--sway', `${Math.random() * 80 - 40}px`);
      piece.style.background = colors[i % colors.length]!;
      if (Math.random() > 0.5) piece.style.borderRadius = '50%';
      this.confettiBox.appendChild(piece);
    }
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }
}
