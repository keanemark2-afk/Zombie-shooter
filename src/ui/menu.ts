import { bindings, padButtonName, PAD, type PadType } from '../config/controls';
import type { LevelId } from '../world/level';

export type MenuChoice = LevelId | 'resume';

/** The start / pause screen with mode buttons and the full controls list. */
export class Menu {
  readonly root: HTMLDivElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly controls: HTMLDivElement;
  private padType: PadType | null = null;
  onChoose: (choice: MenuChoice) => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1>DEAD ACRE</h1>
        <div class="menu-sub">Phase 1 &middot; Gunfeel test &middot; now with shotguns</div>
        <div class="menu-buttons">
          <button type="button" data-choice="resume" class="resume">Resume</button>
          <button type="button" data-choice="range">Shooting range</button>
          <button type="button" data-choice="village">Village</button>
        </div>
        <div class="menu-note">Click a button to play. The mouse gets captured for aiming &mdash; press <b>Esc</b> to get it back.</div>
        <div class="menu-controls"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.resumeBtn = this.root.querySelector('.resume') as HTMLButtonElement;
    this.controls = this.root.querySelector('.menu-controls') as HTMLDivElement;
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      const choice = btn?.dataset.choice as MenuChoice | undefined;
      if (choice) this.onChoose(choice);
    });
    this.renderControls();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(canResume: boolean): void {
    this.root.hidden = false;
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
