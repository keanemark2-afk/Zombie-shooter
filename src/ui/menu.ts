import { bindings, padButtonName, PAD, resetBindings, type Action, type PadType, ACTION_NAMES } from '../config/controls';
import {
  applySettingsToGame,
  CROSSHAIR_COLORS,
  CROSSHAIR_SIZES,
  CROSSHAIR_STYLES,
  GORE_LEVELS,
  resetSettings,
  saveSettings,
  settings,
  type AimMode,
  type CrosshairStyle,
  type DifficultyId,
  type GoreLevel,
  type GraphicsQuality,
} from '../config/settings';
import { Crosshair, crosshairIcon } from './crosshair';
import type { GameMode } from '../core/modes';

export type MenuChoice = GameMode | 'resume';

export const DIFFICULTY_CHOICES: Array<{ id: DifficultyId; label: string; hint: string }> = [
  { id: 'easy', label: 'Easy', hint: 'Zombies deal less damage and ammo drops are generous.' },
  { id: 'normal', label: 'Normal', hint: 'The balanced survival-horror experience.' },
  { id: 'hard', label: 'Hard', hint: 'Enemies hit hard, ammo is tight, and Sawyer kills instantly.' },
  { id: 'pro', label: 'Pro', hint: 'Devastating damage, scarce ammo, relentless aggression.' },
];

/** The start / pause screen with mode buttons, settings, and remappable controls. */
export class Menu {
  readonly root: HTMLDivElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly controls: HTMLDivElement;
  private padType: PadType | null = null;
  private readonly mainView: HTMLDivElement;
  private readonly settingsView: HTMLDivElement;
  private readonly remapView: HTMLDivElement;
  private readonly preview = new Crosshair();
  private previewTime = 0;
  private previewRunning = false;
  private listeningAction: Action | null = null;
  onChoose: (choice: MenuChoice) => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1>DEAD ACRE</h1>
        <div class="menu-sub">Over-the-shoulder survival horror arena</div>
        <div class="menu-main">
          <div class="menu-buttons">
            <button type="button" data-choice="resume" class="resume">Resume</button>
            <button type="button" data-choice="survival">Survival</button>
            <button type="button" data-choice="score">Score Attack</button>
            <button type="button" data-choice="range">Shooting range</button>
            <button type="button" data-action="settings">Settings</button>
          </div>
          <div class="menu-note">Click a button to play. The mouse gets captured for aiming &mdash; press <b>Esc</b> to get it back.</div>
          <div class="menu-controls"></div>
        </div>
        <div class="menu-settings" hidden></div>
        <div class="menu-remap" hidden></div>
      </div>`;
    document.body.appendChild(this.root);
    this.resumeBtn = this.root.querySelector('.resume') as HTMLButtonElement;
    this.controls = this.root.querySelector('.menu-controls') as HTMLDivElement;
    this.mainView = this.root.querySelector('.menu-main') as HTMLDivElement;
    this.settingsView = this.root.querySelector('.menu-settings') as HTMLDivElement;
    this.remapView = this.root.querySelector('.menu-remap') as HTMLDivElement;

    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const choice = btn.dataset.choice as MenuChoice | undefined;
      if (choice) this.onChoose(choice);
      this.onSettingsClick(btn);
    });

    window.addEventListener('keydown', (e) => {
      if (this.listeningAction) {
        e.preventDefault();
        e.stopPropagation();
        this.rebindKey(this.listeningAction, e.code);
        this.listeningAction = null;
        this.renderRemap();
      }
    }, true);

    this.renderControls();
  }

  get settingsOpen(): boolean {
    return !this.settingsView.hidden || !this.remapView.hidden;
  }

  // ---------------------------------------------------------------------------
  // Settings screen

  openSettings(): void {
    this.mainView.hidden = true;
    this.remapView.hidden = true;
    this.settingsView.hidden = false;
    this.renderSettings();
    if (!this.previewRunning) {
      this.previewRunning = true;
      let last = performance.now();
      const loop = (now: number) => {
        if (this.settingsView.hidden || this.root.hidden) {
          this.previewRunning = false;
          return;
        }
        this.previewTime += (now - last) / 1000;
        last = now;
        const u = (Math.sin(this.previewTime * 1.6) + 1) / 2;
        this.preview.update(8 + u * 36, u < 0.08 ? 1 : 0.5);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  closeSettings(): void {
    this.settingsView.hidden = true;
    this.remapView.hidden = true;
    this.mainView.hidden = false;
  }

  openRemap(): void {
    this.settingsView.hidden = true;
    this.remapView.hidden = false;
    this.renderRemap();
  }

  closeRemap(): void {
    this.remapView.hidden = true;
    this.settingsView.hidden = false;
    this.renderSettings();
  }

  private rebindKey(action: Action, code: string): void {
    if (!settings.customBindings) {
      settings.customBindings = {};
    }
    const current = bindings[action];
    settings.customBindings[action] = {
      keys: [code],
      mouse: current.mouse,
      pad: current.pad,
    };
    bindings[action].keys = [code];
    saveSettings();
  }

  private onSettingsClick(btn: HTMLButtonElement): void {
    const d = btn.dataset;
    if (d.action === 'settings') return this.openSettings();
    if (d.action === 'back') return this.closeSettings();
    if (d.action === 'open-remap') return this.openRemap();
    if (d.action === 'back-remap') return this.closeRemap();
    if (d.action === 'reset-remap') {
      resetBindings();
      settings.customBindings = null;
      saveSettings();
      this.renderRemap();
      return;
    }
    if (d.action === 'reset') {
      resetSettings();
      resetBindings();
      applySettingsToGame();
      this.renderSettings();
      return;
    }
    if (d.remapAction) {
      this.listeningAction = d.remapAction as Action;
      this.renderRemap();
      return;
    }
    if (d.crosshair) settings.crosshair = d.crosshair as CrosshairStyle;
    else if (d.color) settings.crosshairColor = d.color;
    else if (d.size) settings.crosshairSize = Number(d.size);
    else if (d.laser) settings.laserBeam = d.laser === 'on';
    else if (d.gunshot) settings.gunshotSound = d.gunshot === 'synth' ? 'synth' : 'recorded';
    else if (d.gore) settings.gore = d.gore as GoreLevel;
    else if (d.diff) settings.difficulty = d.diff as DifficultyId;
    else if (d.aimMode) settings.aimMode = d.aimMode as AimMode;
    else if (d.inverty) settings.invertY = d.inverty === 'on';
    else if (d.graphics) settings.graphicsQuality = d.graphics as GraphicsQuality;
    else return;

    saveSettings();
    applySettingsToGame();
    this.renderSettings();
  }

  private renderSettings(): void {
    const on = (yes: boolean) => (yes ? ' class="on"' : '');
    const style = CROSSHAIR_STYLES.find((c) => c.id === settings.crosshair)!;
    const diffHint = DIFFICULTY_CHOICES.find((d) => d.id === settings.difficulty)!.hint;

    this.settingsView.innerHTML = `
      <h2>Settings</h2>

      <div class="set-row">
        <div class="set-label">Difficulty</div>
        <div class="set-options">
          ${DIFFICULTY_CHOICES.map(
            (c) => `<button type="button" data-diff="${c.id}" title="${c.hint}"${on(c.id === settings.difficulty)}>${c.label}</button>`,
          ).join('')}
        </div>
      </div>
      <div class="set-hint">${diffHint}</div>

      <div class="set-row">
        <div class="set-label">Aim Mode</div>
        <div class="set-options">
          <button type="button" data-aim-mode="modern"${on(settings.aimMode === 'modern')}>Modern (walk while aiming)</button>
          <button type="button" data-aim-mode="classic"${on(settings.aimMode === 'classic')}>Classic (feet planted)</button>
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Mouse Sensitivity</div>
        <div class="set-options slider-row">
          <input type="range" min="0.05" max="1" step="0.05" value="${settings.mouseSensitivity}" id="set-mouse-sens" />
          <span class="slider-val">${settings.mouseSensitivity.toFixed(2)}</span>
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Invert Y Axis</div>
        <div class="set-options">
          <button type="button" data-inverty="off"${on(!settings.invertY)}>Normal</button>
          <button type="button" data-inverty="on"${on(settings.invertY)}>Inverted</button>
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Field of View (FOV)</div>
        <div class="set-options slider-row">
          <input type="range" min="45" max="90" step="1" value="${settings.fov}" id="set-fov" />
          <span class="slider-val">${settings.fov}&deg;</span>
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Controls</div>
        <div class="set-options">
          <button type="button" data-action="open-remap">Customize Keybindings &amp; Gamepad</button>
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Gore</div>
        <div class="set-options">
          ${GORE_LEVELS.map((g) => `<button type="button" data-gore="${g.id}" title="${g.hint}"${on(settings.gore === g.id)}>${g.label}</button>`).join('')}
        </div>
      </div>
      <div class="set-hint">${GORE_LEVELS.find((g) => g.id === settings.gore)!.hint}</div>

      <div class="set-row">
        <div class="set-label">Crosshair</div>
        <div class="set-options crosshairs">
          ${CROSSHAIR_STYLES.map(
            (c) =>
              `<button type="button" data-crosshair="${c.id}" title="${c.hint}"${on(c.id === settings.crosshair)}>${crosshairIcon(c.id, settings.crosshairColor)}<span>${c.label}</span></button>`,
          ).join('')}
        </div>
      </div>
      <div class="set-hint">${style.hint}</div>
      <div class="set-preview"></div>

      <div class="set-row">
        <div class="set-label">Colour</div>
        <div class="set-options">
          ${CROSSHAIR_COLORS.map(
            (c) => `<button type="button" data-color="${c.id}" title="${c.label}"${on(c.id === settings.crosshairColor)}><i style="background:${c.id}"></i>${c.label}</button>`,
          ).join('')}
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Size</div>
        <div class="set-options">
          ${CROSSHAIR_SIZES.map((c) => `<button type="button" data-size="${c.id}"${on(c.id === settings.crosshairSize)}>${c.label}</button>`).join('')}
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Laser line</div>
        <div class="set-options">
          <button type="button" data-laser="on"${on(settings.laserBeam)}>Show</button>
          <button type="button" data-laser="off"${on(!settings.laserBeam)}>Hide (dot only)</button>
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Gunshots</div>
        <div class="set-options">
          <button type="button" data-gunshot="recorded"${on(settings.gunshotSound === 'recorded')}>Real recordings</button>
          <button type="button" data-gunshot="synth"${on(settings.gunshotSound === 'synth')}>Old generated sound</button>
        </div>
      </div>

      <div class="set-row">
        <div class="set-label">Graphics Quality</div>
        <div class="set-options">
          <button type="button" data-graphics="high"${on(settings.graphicsQuality === 'high')}>High</button>
          <button type="button" data-graphics="medium"${on(settings.graphicsQuality === 'medium')}>Medium</button>
          <button type="button" data-graphics="low"${on(settings.graphicsQuality === 'low')}>Low (fastest)</button>
        </div>
      </div>

      <div class="menu-buttons">
        <button type="button" data-action="back">Back</button>
        <button type="button" data-action="reset">Reset to defaults</button>
      </div>
      <div class="menu-note">Changes are saved automatically and apply straight away.</div>`;

    this.preview.configure(settings.crosshair, settings.crosshairColor, settings.crosshairSize);
    const box = this.settingsView.querySelector('.set-preview')!;
    box.appendChild(this.preview.svg);
    if (settings.crosshair === 'laser') {
      box.insertAdjacentHTML('beforeend', '<div class="set-laser-dot"></div><div class="set-preview-note">Only the red laser dot shows where you aim.</div>');
    } else if (settings.crosshair === 'none') {
      box.insertAdjacentHTML('beforeend', '<div class="set-preview-note">Nothing on screen.</div>');
    }

    // Attach slider listeners
    const sensInput = this.settingsView.querySelector('#set-mouse-sens') as HTMLInputElement | null;
    sensInput?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      settings.mouseSensitivity = val;
      const display = sensInput.nextElementSibling as HTMLElement;
      if (display) display.textContent = val.toFixed(2);
      saveSettings();
      applySettingsToGame();
    });

    const fovInput = this.settingsView.querySelector('#set-fov') as HTMLInputElement | null;
    fovInput?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      settings.fov = val;
      const display = fovInput.nextElementSibling as HTMLElement;
      if (display) display.textContent = `${val}°`;
      saveSettings();
      applySettingsToGame();
    });
  }

  private renderRemap(): void {
    const pad = (b?: number) => (b !== undefined ? `<span class="pad-btn">${padButtonName(b, this.padType ?? 'playstation')}</span>` : '&ndash;');
    const keyLabel = (keys: string[]) => {
      if (keys.length === 0) return '&ndash;';
      return keys.map((k) => k.replace(/^Key/, '').replace(/^Digit/, '')).join(', ');
    };

    const actions = Object.keys(ACTION_NAMES) as Action[];
    this.remapView.innerHTML = `
      <h2>Remap Controls</h2>
      <div class="remap-table-wrap">
        <table class="remap-table">
          <thead>
            <tr><th>Action</th><th>Key</th><th>Gamepad</th><th></th></tr>
          </thead>
          <tbody>
            ${actions.map((act) => {
              const b = bindings[act];
              const isListening = this.listeningAction === act;
              return `
                <tr>
                  <td>${ACTION_NAMES[act]}</td>
                  <td>${isListening ? '<span class="remap-listening">Press any key...</span>' : keyLabel(b.keys)}</td>
                  <td>${pad(b.pad)}</td>
                  <td>
                    <button type="button" data-remap-action="${act}" class="rebind-btn">
                      ${isListening ? 'Cancel' : 'Rebind'}
                    </button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="menu-buttons">
        <button type="button" data-action="back-remap">Back to Settings</button>
        <button type="button" data-action="reset-remap">Reset Controls</button>
      </div>`;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(canResume: boolean): void {
    this.root.hidden = false;
    this.closeSettings();
    this.resumeBtn.style.display = canResume ? '' : 'none';
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Shows PlayStation or Xbox button names when a controller is connected. */
  setPad(type: PadType | null): void {
    if (type === this.padType) return;
    this.padType = type;
    this.renderControls();
  }

  private renderControls(): void {
    const t = this.padType ?? 'playstation';
    const pad = (b: number) => `<span class="pad-btn">${padButtonName(b, t)}</span>`;
    const rows: Array<[string, string, string]> = [
      ['Move', 'W A S D', 'Left stick'],
      ['Look', 'Mouse', 'Right stick'],
      ['Aim (laser sight)', 'Hold right mouse', `Hold ${pad(bindings.aim.pad!)}`],
      ['Shoot (while aiming)', 'Left mouse', pad(bindings.fire.pad!)],
      ['Reload', 'R', pad(bindings.reload.pad!)],
      ['Switch weapon', '1 to 9 or mouse wheel', `${pad(bindings.prevWeapon.pad!)} / ${pad(bindings.nextWeapon.pad!)}`],
      ['Heal (uses a herb or spray)', 'H', pad(bindings.heal.pad!)],
      ['Kick / suplex / finish (when prompted)', 'F', pad(bindings.melee.pad!)],
      ['Knife slash / parry (just before a hit)', 'V (hold to block)', `${pad(bindings.knife.pad!)} (hold to block)`],
      ['Break free of a grab', 'Mash F, or V to stab', `Mash ${pad(bindings.melee.pad!)}, or ${pad(bindings.knife.pad!)}`],
      ['Sprint', 'Hold Shift', `Hold ${pad(bindings.sprint.pad!)}`],
      ['Quick 180&deg; turn', 'Hold S + tap Shift', `Down + ${pad(bindings.sprint.pad!)}`],
      ['Overdrive (Score Attack)', 'Q', pad(bindings.overdrive.pad!)],
      ['Menu / pause', 'Esc', pad(PAD.start)],
      ['Tuning panel', 'F1', '&ndash;'],
      ['FPS counter', 'F3', '&ndash;'],
    ];
    const heading = this.padType ? (this.padType === 'playstation' ? 'PlayStation controller' : 'Xbox controller') : 'Controller';
    this.controls.innerHTML =
      `<table><tr><th></th><th>Keyboard &amp; mouse</th><th>${heading}</th></tr>` +
      rows.map(([a, k, p]) => `<tr><td>${a}</td><td>${k}</td><td>${p}</td></tr>`).join('') +
      `</table>` +
      (this.padType
        ? `<div class="menu-note">Controller: press ${pad(PAD.south)} or ${pad(PAD.north)} for Survival, or ${pad(PAD.west)} for the shooting range.</div>`
        : '');
  }
}
