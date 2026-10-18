import type { ZoneGroup } from '../combat/damage';
import { settings } from '../config/settings';
import { Crosshair } from './crosshair';

export interface RangeStats {
  shots: number;
  hits: number;
  headshots: number;
  kills: number;
  lastHit: string;
}

/** Everything drawn flat on the screen during play. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly crosshair = new Crosshair();
  private readonly marker: HTMLDivElement;
  private readonly hurt: HTMLDivElement;
  private readonly ammoLoaded: HTMLSpanElement;
  private readonly ammoSpare: HTMLSpanElement;
  private readonly reloadBar: HTMLDivElement;
  private readonly reloadFill: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly weaponName: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private stripTimer = 0;
  private stripKey = '';
  private markerTimer = 0;
  private hurtLevel = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hurt-flash"></div>
      <div class="hit-marker"><i></i><i></i></div>
      <div class="weapon-strip"></div>
      <div class="ammo">
        <div class="weapon-name">KESTREL 9</div>
        <div class="ammo-count"><span class="loaded">10</span><span class="spare">/ &infin;</span></div>
        <div class="reload-bar"><div class="reload-fill"></div></div>
      </div>
      <div class="range-stats"></div>
      <div class="play-hint"></div>`;
    document.body.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.root.insertBefore(this.crosshair.svg, this.root.querySelector('.hit-marker'));
    this.marker = q('.hit-marker');
    this.hurt = q('.hurt-flash');
    this.ammoLoaded = q('.loaded');
    this.ammoSpare = q('.spare');
    this.reloadBar = q('.reload-bar');
    this.reloadFill = q('.reload-fill');
    this.stats = q('.range-stats');
    this.hint = q('.play-hint');
    this.weaponName = q('.weapon-name');
    this.strip = q('.weapon-strip');
    this.root.hidden = true;
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  /** Crosshair size (aim wobble) in pixels; null hides it (not aiming). */
  setReticle(radiusPx: number | null, focus: number): void {
    if (radiusPx === null) {
      this.crosshair.svg.style.display = 'none';
      return;
    }
    this.crosshair.configure(settings.crosshair, settings.crosshairColor, settings.crosshairSize);
    this.crosshair.svg.style.display = 'block';
    this.crosshair.update(radiusPx, focus);
  }

  setAmmo(loaded: number, spare: number | null, reloadProgress: number | null): void {
    this.ammoLoaded.textContent = String(loaded);
    this.ammoLoaded.classList.toggle('empty', loaded === 0);
    this.ammoSpare.innerHTML = spare === null ? '/ &infin;' : `/ ${spare}`;
    this.reloadBar.style.visibility = reloadProgress === null ? 'hidden' : 'visible';
    if (reloadProgress !== null) this.reloadFill.style.width = `${Math.min(100, reloadProgress * 100)}%`;
  }

  setWeaponName(name: string): void {
    if (this.weaponName.textContent !== name) this.weaponName.textContent = name;
  }

  /** Briefly lists your weapons with the chosen one highlighted (after a swap). */
  showWeapons(slots: Array<{ slot: number; name: string }>, selected: number): void {
    const key = `${selected}`;
    if (key !== this.stripKey) {
      this.stripKey = key;
      this.strip.innerHTML = slots
        .map((w, i) => `<div class="${i === selected ? 'on' : ''}"><span>${w.slot}</span>${w.name}</div>`)
        .join('');
    }
    this.stripTimer = 2.2;
  }

  hitMarker(zone: ZoneGroup, killed: boolean, seconds: number): void {
    this.marker.classList.remove('head', 'kill', 'show');
    void this.marker.offsetWidth; // restart the pop animation
    if (zone === 'head') this.marker.classList.add('head');
    if (killed) this.marker.classList.add('kill');
    this.marker.classList.add('show');
    this.markerTimer = seconds;
  }

  hurtFlash(): void {
    this.hurtLevel = 1;
  }

  setStats(stats: RangeStats | null): void {
    if (!stats) {
      this.stats.style.display = 'none';
      return;
    }
    this.stats.style.display = 'block';
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    this.stats.innerHTML =
      `<b>SHOOTING RANGE</b><br>Shots ${stats.shots} &middot; Hits ${stats.hits} (${acc}%) &middot; Headshots ${stats.headshots} &middot; Kills ${stats.kills}` +
      (stats.lastHit ? `<br><span class="last-hit">${stats.lastHit}</span>` : '');
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }

  update(dt: number): void {
    this.stripTimer -= dt;
    this.strip.classList.toggle('visible', this.stripTimer > 0);
    this.markerTimer -= dt;
    if (this.markerTimer <= 0) this.marker.classList.remove('show');
    this.hurtLevel = Math.max(0, this.hurtLevel - dt * 1.6);
    this.hurt.style.opacity = String(this.hurtLevel * 0.85);
  }
}
