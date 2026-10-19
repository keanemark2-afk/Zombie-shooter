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
  private readonly prompt: HTMLDivElement;
  private readonly promptKey: HTMLSpanElement;
  private readonly promptLabel: HTMLSpanElement;
  private readonly grab: HTMLDivElement;
  private readonly grabFill: HTMLDivElement;
  private readonly grabTime: HTMLDivElement;
  private readonly grabKnife: HTMLDivElement;
  private readonly knifeFill: HTMLDivElement;
  private readonly knifeBar: HTMLDivElement;
  private readonly scope: HTMLDivElement;
  private readonly scopeCross: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private bannerTimer = 0;
  private readonly healthFill: HTMLDivElement;
  private readonly healthExtra: HTMLDivElement;
  private readonly healthText: HTMLSpanElement;
  private readonly healthBox: HTMLDivElement;
  private readonly healProgress: HTMLDivElement;
  private readonly healItems: HTMLDivElement;
  private readonly feed: HTMLDivElement;
  private readonly danger: HTMLDivElement;
  private readonly coins: HTMLDivElement;
  private readonly grenadeBox: HTMLDivElement;
  private feedLines: Array<{ el: HTMLDivElement; life: number }> = [];
  private itemsHtml = '';
  private stripTimer = 0;
  private stripKey = '';
  private markerTimer = 0;
  private hurtLevel = 0;
  private readonly traderMarker: HTMLDivElement;
  private readonly traderKey: HTMLSpanElement;
  private readonly traderLabel: HTMLSpanElement;
  private readonly blind: HTMLDivElement;
  /** 0..1: how blinded you are by a flash (fades by itself). */
  private blindLevel = 0;
  private blindFade = 1;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="danger-vignette"></div>
      <div class="hurt-flash"></div>
      <div class="blind-flash"></div>
      <div class="hit-marker"><i></i><i></i></div>
      <div class="scope" hidden><div class="scope-cross"><i class="h"></i><i class="v"></i><b></b></div></div>
      <div class="melee-prompt" hidden><span class="key">F</span><span class="label">Kick</span></div>
      <div class="trader-marker" hidden><span class="key">E</span><span class="label">Trade</span></div>
      <div class="grab-prompt" hidden>
        <div class="grab-title">GRABBED!</div>
        <div class="grab-text"></div>
        <div class="grab-bar"><div class="grab-fill"></div></div>
        <div class="grab-time"></div>
        <div class="grab-knife"></div>
      </div>
      <div class="banner"></div>
      <div class="weapon-strip"></div>
      <div class="ammo">
        <div class="weapon-name">KESTREL 9</div>
        <div class="ammo-count"><span class="loaded">10</span><span class="spare">/ &infin;</span></div>
        <div class="reload-bar"><div class="reload-fill"></div></div>
        <div class="knife-bar" title="Knife condition"><span>KNIFE</span><div class="knife-track"><div class="knife-fill"></div></div></div>
      </div>
      <div class="health-box">
        <div class="pickup-feed"></div>
        <div class="heal-items"></div>
        <div class="health-label">HEALTH <span class="health-text">100</span></div>
        <div class="health-bar"><div class="health-fill"></div><div class="health-extra"></div></div>
        <div class="heal-progress"><div></div></div>
      </div>
      <div class="coin-counter"></div>
      <div class="grenade-box"></div>
      <div class="range-stats"></div>
      <div class="play-hint"></div>`;
    document.body.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.root.insertBefore(this.crosshair.svg, this.root.querySelector('.hit-marker'));
    this.marker = q('.hit-marker');
    this.hurt = q('.hurt-flash');
    this.blind = q('.blind-flash');
    this.ammoLoaded = q('.loaded');
    this.ammoSpare = q('.spare');
    this.reloadBar = q('.reload-bar');
    this.reloadFill = q('.reload-fill');
    this.stats = q('.range-stats');
    this.hint = q('.play-hint');
    this.weaponName = q('.weapon-name');
    this.strip = q('.weapon-strip');
    this.prompt = q('.melee-prompt');
    this.promptKey = q('.melee-prompt .key');
    this.promptLabel = q('.melee-prompt .label');
    this.traderMarker = q('.trader-marker');
    this.traderKey = q('.trader-marker .key');
    this.traderLabel = q('.trader-marker .label');
    this.grab = q('.grab-prompt');
    this.grabFill = q('.grab-fill');
    this.grabTime = q('.grab-time');
    this.grabKnife = q('.grab-knife');
    this.knifeFill = q('.knife-fill');
    this.knifeBar = q('.knife-bar');
    this.scope = q('.scope');
    this.scopeCross = q('.scope-cross');
    this.banner = q('.banner');
    this.healthBox = q('.health-box');
    this.healthFill = q('.health-fill');
    this.healthExtra = q('.health-extra');
    this.healthText = q('.health-text');
    this.healProgress = q('.heal-progress');
    this.healItems = q('.heal-items');
    this.feed = q('.pickup-feed');
    this.danger = q('.danger-vignette');
    this.coins = q('.coin-counter');
    this.grenadeBox = q('.grenade-box');
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

  /** The "Kick" / "Suplex" prompt floating over a stunned zombie (null hides it). */
  setMeleePrompt(at: { x: number; y: number } | null, key: string, label: string): void {
    this.prompt.hidden = at === null;
    if (!at) return;
    this.prompt.style.left = `${at.x}px`;
    this.prompt.style.top = `${at.y}px`;
    if (this.promptKey.textContent !== key) this.promptKey.textContent = key;
    if (this.promptLabel.textContent !== label) this.promptLabel.textContent = label;
  }

  /**
   * The Trader's marker. `at` is where on screen (already kept inside the screen); `near` shows
   * the key to press, otherwise it just says how far away the stall is.
   */
  setTraderMarker(at: { x: number; y: number } | null, key: string, label: string, near: boolean): void {
    this.traderMarker.hidden = at === null;
    if (!at) return;
    this.traderMarker.style.left = `${at.x}px`;
    this.traderMarker.style.top = `${at.y}px`;
    this.traderMarker.classList.toggle('near', near);
    if (this.traderKey.textContent !== key) this.traderKey.textContent = key;
    if (this.traderLabel.textContent !== label) this.traderLabel.textContent = label;
  }

  /** The break-free bar while a zombie has hold of you (null hides it). */
  setGrab(state: { progress: number; timeLeft: number; mash: string; knife: string; canKnife: boolean } | null): void {
    this.grab.hidden = state === null;
    if (!state) return;
    this.grabFill.style.width = `${Math.min(100, state.progress * 100)}%`;
    this.grabTime.style.width = `${Math.max(0, state.timeLeft * 100)}%`;
    const text = `Mash <b>${state.mash}</b> to break free`;
    const grabText = this.grab.querySelector('.grab-text') as HTMLDivElement;
    if (grabText.innerHTML !== text) grabText.innerHTML = text;
    const knife = state.canKnife ? `or press <b>${state.knife}</b> to stab your way out` : 'Your knife is broken';
    if (this.grabKnife.innerHTML !== knife) this.grabKnife.innerHTML = knife;
  }

  /** Knife condition under the ammo counter (red when nearly broken). */
  setKnife(condition: number): void {
    this.knifeFill.style.width = `${Math.round(condition * 100)}%`;
    this.knifeBar.classList.toggle('low', condition < 0.25);
    this.knifeBar.classList.toggle('broken', condition <= 0);
  }

  /** The rifle scope view; `dx`, `dy` shift the crosshair with the scope's drift. */
  setScope(on: boolean, dx = 0, dy = 0): void {
    this.scope.hidden = !on;
    if (on) this.scopeCross.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  }

  /** A big word in the middle of the screen for a moment ("PERFECT PARRY"). */
  flashBanner(text: string, kind: 'good' | 'gore' = 'good'): void {
    this.banner.textContent = text;
    this.banner.className = `banner show ${kind}`;
    this.bannerTimer = 0.9;
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

  /** Dazzles the screen white for `seconds` (a flash grenade went off near you). */
  whiteout(seconds: number): void {
    this.blindLevel = 1;
    this.blindFade = 1 / Math.max(0.1, seconds);
  }

  /** The box at the top of the screen (wave counter, score...). Plain HTML; null hides it. */
  setTopInfo(html: string | null): void {
    if (html === null) {
      this.stats.style.display = 'none';
      return;
    }
    this.stats.style.display = 'block';
    if (this.stats.innerHTML !== html) this.stats.innerHTML = html;
  }

  /** The health gauge. `healProgress` 0..1 while a healing item is being used. */
  setHealth(current: number, max: number, baseMax: number, danger: boolean, healProgress: number | null, show: boolean): void {
    this.healthBox.style.display = show ? '' : 'none';
    const frac = max > 0 ? current / max : 0;
    this.healthFill.style.width = `${Math.max(0, Math.min(100, frac * (baseMax > 0 ? (max / Math.max(max, baseMax)) * 100 : 100)))}%`;
    // The part of the gauge added by yellow herbs is drawn in gold.
    this.healthExtra.style.width = `${max > baseMax ? ((max - baseMax) / max) * 100 : 0}%`;
    const text = String(Math.ceil(current));
    if (this.healthText.textContent !== text) this.healthText.textContent = text;
    this.healthBox.classList.toggle('danger', danger);
    this.healthFill.style.background = frac < 0.3 ? '#d6403a' : frac < 0.6 ? '#e0b43a' : '#5fbf5a';
    this.healProgress.style.visibility = healProgress === null ? 'hidden' : 'visible';
    if (healProgress !== null) (this.healProgress.firstElementChild as HTMLElement).style.width = `${Math.min(100, healProgress * 100)}%`;
  }

  /** Red vignette that pulses when your health is low (0 = off). */
  setDanger(level: number, pulse: number): void {
    this.danger.style.opacity = String(level * (0.55 + 0.45 * pulse));
  }

  /** Counts of what you carry for healing, shown above the health bar. */
  setHealItems(counts: { g: number; r: number; y: number; mixed: number; spray: number }, key: string): void {
    const html =
      `<span class="hi g" title="Green herbs">${counts.g}</span>` +
      `<span class="hi r" title="Red herbs">${counts.r}</span>` +
      `<span class="hi y" title="Yellow herbs">${counts.y}</span>` +
      (counts.mixed ? `<span class="hi m" title="Mixed herbs">${counts.mixed}</span>` : '') +
      `<span class="hi s" title="First-aid sprays">${counts.spray}</span>` +
      `<span class="hi-key">${key} to heal</span>`;
    if (html !== this.itemsHtml) {
      this.itemsHtml = html;
      this.healItems.innerHTML = html;
    }
  }

  setCoins(coins: number | null): void {
    if (coins === null) {
      this.coins.style.display = 'none';
      return;
    }
    this.coins.style.display = 'block';
    const text = `<span class="coin-icon"></span>${coins.toLocaleString('en-US')}`;
    if (this.coins.innerHTML !== text) this.coins.innerHTML = text;
  }

  /** What grenade you have selected and how many (null hides it). */
  setGrenades(html: string | null): void {
    if (html === null) {
      this.grenadeBox.style.display = 'none';
      return;
    }
    this.grenadeBox.style.display = 'block';
    if (this.grenadeBox.innerHTML !== html) this.grenadeBox.innerHTML = html;
  }

  /** A short line that floats up and fades ("+12 pistol rounds"). */
  addFeed(text: string, kind: 'good' | 'bad' | 'info' = 'good'): void {
    const el = document.createElement('div');
    el.className = `feed-line ${kind}`;
    el.textContent = text;
    this.feed.appendChild(el);
    this.feedLines.push({ el, life: 3 });
    while (this.feedLines.length > 5) this.feedLines.shift()!.el.remove();
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
    for (const l of this.feedLines) {
      l.life -= dt;
      l.el.style.opacity = String(Math.max(0, Math.min(1, l.life)));
    }
    while (this.feedLines.length && this.feedLines[0].life <= 0) this.feedLines.shift()!.el.remove();
    this.hurtLevel = Math.max(0, this.hurtLevel - dt * 1.6);
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
    this.hurt.style.opacity = String(this.hurtLevel * 0.85);
    this.blindLevel = Math.max(0, this.blindLevel - dt * this.blindFade);
    this.blind.style.opacity = this.blindLevel > 0 ? String(Math.min(1, this.blindLevel * 1.6)) : '0';
  }
}
