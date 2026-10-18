import { bindings, padButtonName, PAD, type PadType } from '../config/controls';
import {
  CROSSHAIR_COLORS,
  CROSSHAIR_SIZES,
  CROSSHAIR_STYLES,
  resetSettings,
  saveSettings,
  settings,
  type CrosshairStyle,
} from '../config/settings';
import { Crosshair, crosshairIcon } from './crosshair';
import type { LevelId } from '../world/level';

export type MenuChoice = LevelId | 'resume';

/** The start / pause screen with mode buttons and the full controls list. */
export class Menu {
  readonly root: HTMLDivElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly controls: HTMLDivElement;
  private padType: PadType | null = null;
  private readonly mainView: HTMLDivElement;
  private readonly settingsView: HTMLDivElement;
  private readonly preview = new Crosshair();
  private previewTime = 0;
  private previewRunning = false;
  onChoose: (choice: MenuChoice) => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1>DEAD ACRE</h1>
        <div class="menu-sub">Phase 1 &middot; Gunfeel test &middot; now with shotguns</div>
        <div class="menu-main">
          <div class="menu-buttons">
            <button type="button" data-choice="resume" class="resume">Resume</button>
            <button type="button" data-choice="range">Shooting range</button>
            <button type="button" data-choice="village">Village</button>
            <button type="button" data-action="settings">Settings</button>
          </div>
          <div class="menu-note">Click a button to play. The mouse gets captured for aiming &mdash; press <b>Esc</b> to get it back.</div>
          <div class="menu-controls"></div>
        </div>
        <div class="menu-settings" hidden></div>
      </div>`;
    document.body.appendChild(this.root);
    this.resumeBtn = this.root.querySelector('.resume') as HTMLButtonElement;
    this.controls = this.root.querySelector('.menu-controls') as HTMLDivElement;
    this.mainView = this.root.querySelector('.menu-main') as HTMLDivElement;
    this.settingsView = this.root.querySelector('.menu-settings') as HTMLDivElement;
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const choice = btn.dataset.choice as MenuChoice | undefined;
      if (choice) this.onChoose(choice);
      this.onSettingsClick(btn);
    });
    this.renderControls();
  }

  get settingsOpen(): boolean {
    return !this.settingsView.hidden;
  }

  // ---------------------------------------------------------------------------
  // Settings screen

  openSettings(): void {
    this.mainView.hidden = true;
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
        // The preview breathes in and out like a reticle tightening as aim steadies.
        const u = (Math.sin(this.previewTime * 1.6) + 1) / 2;
        this.preview.update(8 + u * 36, u < 0.08 ? 1 : 0.5);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  closeSettings(): void {
    this.settingsView.hidden = true;
    this.mainView.hidden = false;
  }

  private onSettingsClick(btn: HTMLButtonElement): void {
    const d = btn.dataset;
    if (d.action === 'settings') return this.openSettings();
    if (d.action === 'back') return this.closeSettings();
    if (d.action === 'reset') resetSettings();
    else if (d.crosshair) settings.crosshair = d.crosshair as CrosshairStyle;
    else if (d.color) settings.crosshairColor = d.color;
    else if (d.size) settings.crosshairSize = Number(d.size);
    else if (d.laser) settings.laserBeam = d.laser === 'on';
    else if (d.gunshot) settings.gunshotSound = d.gunshot === 'synth' ? 'synth' : 'recorded';
    else return;
    saveSettings();
    this.renderSettings();
  }

  private renderSettings(): void {
    const on = (yes: boolean) => (yes ? ' class="on"' : '');
    const style = CROSSHAIR_STYLES.find((c) => c.id === settings.crosshair)!;
    this.settingsView.innerHTML = `
      <h2>Settings</h2>
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
      ['Switch weapon', '1 2 3 or mouse wheel', `${pad(bindings.prevWeapon.pad!)} / ${pad(bindings.nextWeapon.pad!)}`],
      ['Sprint', 'Hold Shift', `Hold ${pad(bindings.sprint.pad!)}`],
      ['Quick 180&deg; turn', 'Hold S + tap Shift', `Down + ${pad(bindings.sprint.pad!)}`],
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
        ? `<div class="menu-note">Controller: press ${pad(PAD.south)} for the shooting range or ${pad(PAD.north)} for the village.</div>`
        : '');
  }
}
