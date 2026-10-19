import { tuning } from '../config/tuning';
import { WeaponUpgrades } from './upgrades';

// The guns you carry, and the bookkeeping for each one: ammo, firing rate,
// pumping and reloading. Kept free of graphics so it can be unit-tested.

export type WeaponId = 'pistol' | 'pump' | 'drum' | 'smg' | 'rifle' | 'magnum' | 'rocket' | 'heavy' | 'swift';

/** Every gun's numbers have this shape (see the sections in tuning.ts). */
export type WeaponStats = typeof tuning.pistol;

/** What has been bought for each gun (levels, exclusive upgrades, attachments). Wiped at the start of a run. */
export const weaponUpgrades = new WeaponUpgrades(() => tuning.upgrades);

const upgradedCache = new Map<string, WeaponStats>();

/** A gun's numbers from tuning.ts with everything bought for it applied. */
function statsFor(id: string, base: WeaponStats): WeaponStats {
  if (!weaponUpgrades.affects(id)) return base;
  let out = upgradedCache.get(id);
  if (!out) {
    out = { ...base };
    upgradedCache.set(id, out);
  }
  return weaponUpgrades.apply(id, base, out);
}

/** Sounds and moments a gun produces while it works. */
export type GunEvent =
  | 'magOut'
  | 'magIn'
  | 'slide'
  | 'pump'
  | 'shellIn'
  | 'drumOut'
  | 'drumIn'
  | 'bolt'
  | 'eject'
  | 'cylinderOut'
  | 'cylinderIn'
  | 'roundIn'
  | 'rocketIn';

export interface WeaponDef {
  id: WeaponId;
  /** On-screen name (original names, not from any other game). */
  name: string;
  /** Quick-slot number (keys 1, 2, 3...). */
  slot: number;
  /** Live numbers from tuning.ts, so F1 changes apply straight away. */
  stats: () => WeaponStats;
  /** Pistol = held in the hands; long = shouldered rifle-style gun (the rocket tube rests on the shoulder). */
  hold: 'pistol' | 'long';
  /** Magazine = all at once; shells = one at a time, can be interrupted by firing. */
  reload: 'magazine' | 'shells';
  /** Worked by hand after every shot: a pump or a bolt (or nothing). */
  cycle: 'none' | 'pump' | 'bolt';
  /** Keeps firing while the trigger is held. */
  auto: boolean;
  /** Reload sounds: taking the old ammo out, putting new in, and racking when empty. */
  reloadEvents: [GunEvent | null, GunEvent | null, GunEvent | null];
  /** One at a time: the sound of each shell or round going in. */
  loadEvent: GunEvent;
  /** What kind of casing flies out (none for the revolver and rocket). */
  casing: 'brass' | 'hull' | 'none';
  /** Which gunshot sound to play. */
  sound: 'pistol' | 'shotgun' | 'autoShotgun' | 'smg' | 'rifle' | 'magnum' | 'rocket' | 'heavyPistol' | 'swiftPistol';
  /** Looking through a scope while aiming. */
  scope: boolean;
  /** Fires a rocket instead of bullets. */
  projectile: boolean;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'pistol', name: 'KESTREL 9', slot: 1, stats: () => statsFor('pistol', tuning.pistol), hold: 'pistol', reload: 'magazine', cycle: 'none', auto: false,
    reloadEvents: ['magOut', 'magIn', 'slide'], loadEvent: 'shellIn', casing: 'brass', sound: 'pistol', scope: false, projectile: false,
  },
  {
    id: 'pump', name: 'BRAMBLE 12', slot: 2, stats: () => statsFor('pump', tuning.pumpShotgun), hold: 'long', reload: 'shells', cycle: 'pump', auto: false,
    reloadEvents: [null, null, 'pump'], loadEvent: 'shellIn', casing: 'hull', sound: 'shotgun', scope: false, projectile: false,
  },
  {
    id: 'drum', name: 'THRESHER', slot: 3, stats: () => statsFor('drum', tuning.drumShotgun), hold: 'long', reload: 'magazine', cycle: 'none', auto: false,
    reloadEvents: ['drumOut', 'drumIn', 'bolt'], loadEvent: 'shellIn', casing: 'hull', sound: 'autoShotgun', scope: false, projectile: false,
  },
  {
    id: 'smg', name: 'MAGPIE', slot: 4, stats: () => statsFor('smg', tuning.smg), hold: 'long', reload: 'magazine', cycle: 'none', auto: true,
    reloadEvents: ['magOut', 'magIn', 'bolt'], loadEvent: 'shellIn', casing: 'brass', sound: 'smg', scope: false, projectile: false,
  },
  {
    id: 'rifle', name: 'HERON', slot: 5, stats: () => statsFor('rifle', tuning.rifle), hold: 'long', reload: 'shells', cycle: 'bolt', auto: false,
    reloadEvents: [null, null, 'bolt'], loadEvent: 'roundIn', casing: 'brass', sound: 'rifle', scope: true, projectile: false,
  },
  {
    id: 'magnum', name: 'OXBOW', slot: 6, stats: () => statsFor('magnum', tuning.magnum), hold: 'pistol', reload: 'magazine', cycle: 'none', auto: false,
    reloadEvents: ['cylinderOut', 'cylinderIn', null], loadEvent: 'shellIn', casing: 'none', sound: 'magnum', scope: false, projectile: false,
  },
  {
    id: 'rocket', name: 'HAYMAKER', slot: 7, stats: () => statsFor('rocket', tuning.rocket), hold: 'long', reload: 'magazine', cycle: 'none', auto: false,
    reloadEvents: [null, 'rocketIn', null], loadEvent: 'rocketIn', casing: 'none', sound: 'rocket', scope: false, projectile: true,
  },
  {
    id: 'heavy', name: 'BLACKTAIL', slot: 8, stats: () => statsFor('heavy', tuning.heavyPistol), hold: 'pistol', reload: 'magazine', cycle: 'none', auto: false,
    reloadEvents: ['magOut', 'magIn', 'slide'], loadEvent: 'shellIn', casing: 'brass', sound: 'heavyPistol', scope: false, projectile: false,
  },
  {
    id: 'swift', name: 'SPARROW', slot: 9, stats: () => statsFor('swift', tuning.swiftPistol), hold: 'pistol', reload: 'magazine', cycle: 'none', auto: false,
    reloadEvents: ['magOut', 'magIn', 'slide'], loadEvent: 'shellIn', casing: 'brass', sound: 'swiftPistol', scope: false, projectile: false,
  },
];

/** Fraction of the fire interval at which the pump or bolt is worked. */
const PUMP_AT = 0.25;
/** Time to bring the gun up before shell-by-shell loading starts. */
const SHELL_START = 0.25;

/** One gun's state: what's loaded, what's spare, and what it's busy doing. */
export class Gun {
  ammo: number;
  reserve: number;
  /** Seconds left before it can fire again. */
  cooldown = 0;
  reloading = false;
  /** Progress through the current reload (or through the current shell). */
  reloadTime = 0;
  reloadTotal = 1;
  /** 0..1 position of the pump / slide / bolt (1 = pulled back). */
  action = 0;
  private cyclePending = false;
  private sinceShot = 999;
  private reloadSteps = 0;
  private emptyReload = false;
  private shellPhase: 'start' | 'load' | 'chamber' = 'start';

  constructor(readonly def: WeaponDef) {
    this.ammo = def.stats().capacity;
    this.reserve = def.stats().spareAmmo;
  }

  get stats(): WeaponStats {
    return this.def.stats();
  }

  /** What a reload is doing right now (for the animation). */
  get reloadPhase(): 'start' | 'load' | 'chamber' | 'magazine' {
    return this.def.reload === 'shells' ? this.shellPhase : 'magazine';
  }

  /** 0..1 progress through the current reload step. */
  get reloadProgress(): number {
    return Math.min(1, this.reloadTime / Math.max(0.001, this.reloadTotal));
  }

  /** Busy working the pump or bolt between shots. */
  get pumping(): boolean {
    return this.cyclePending || (this.def.cycle !== 'none' && this.cooldown > 0 && this.sinceShot < this.stats.fireInterval);
  }

  reset(): void {
    this.ammo = this.stats.capacity;
    this.reserve = this.stats.spareAmmo;
    this.cooldown = 0;
    this.reloading = false;
    this.action = 0;
    this.cyclePending = false;
  }

  canReload(infinite: boolean): boolean {
    return !this.reloading && this.ammo < this.stats.capacity && (infinite || this.reserve > 0);
  }

  startReload(infinite: boolean): boolean {
    if (!this.canReload(infinite)) return false;
    this.reloading = true;
    this.reloadTime = 0;
    this.reloadSteps = 0;
    this.emptyReload = this.ammo === 0;
    if (this.def.reload === 'shells') {
      this.shellPhase = 'start';
      this.reloadTotal = SHELL_START;
    } else {
      this.reloadTotal = this.emptyReload ? this.stats.emptyReloadTime : this.stats.reloadTime;
    }
    return true;
  }

  cancelReload(): void {
    this.reloading = false;
  }

  /**
   * Pull the trigger. Returns "fired", "empty" (click), or "busy" (still
   * pumping or recovering). Firing during a shell-by-shell reload stops it.
   */
  pullTrigger(): 'fired' | 'empty' | 'busy' {
    if (this.reloading) {
      if (this.def.reload === 'shells' && this.ammo > 0 && this.shellPhase !== 'chamber') this.reloading = false;
      else return 'busy';
    }
    if (this.cooldown > 0) return 'busy';
    if (this.ammo <= 0) {
      this.cooldown = 0.25;
      return 'empty';
    }
    this.ammo--;
    this.cooldown = this.stats.fireInterval;
    this.sinceShot = 0;
    if (this.def.cycle !== 'none') this.cyclePending = this.ammo > 0;
    else this.action = 1;
    return 'fired';
  }

  /** Advance time. Calls `emit` for each sound or moment that happens. */
  tick(dt: number, infinite: boolean, emit: (e: GunEvent) => void): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceShot += dt;
    const s = this.stats;

    // Pump and bolt guns are worked by hand a moment after each shot.
    if (this.def.cycle !== 'none') {
      const pumpStart = s.fireInterval * PUMP_AT;
      const pumpEnd = s.fireInterval * 0.85;
      if (this.cyclePending && this.sinceShot >= pumpStart) {
        this.cyclePending = false;
        emit(this.def.cycle);
        emit('eject');
      }
      if (this.sinceShot >= pumpStart && this.sinceShot <= pumpEnd && this.sinceShot < s.fireInterval) {
        const u = (this.sinceShot - pumpStart) / (pumpEnd - pumpStart);
        this.action = Math.sin(Math.min(1, u) * Math.PI);
      } else if (!this.reloading || this.shellPhase !== 'chamber') {
        this.action = 0;
      }
    } else if (this.ammo > 0 && !this.reloading) {
      // Slide or bolt snaps forward again (stays back when empty).
      this.action *= Math.exp(-40 * dt);
    }

    if (!this.reloading) return;
    this.reloadTime += dt;
    if (this.def.reload === 'shells') this.tickShells(infinite, emit);
    else this.tickMagazine(infinite, emit);
  }

  private take(count: number, infinite: boolean): number {
    const n = infinite ? count : Math.min(count, this.reserve);
    if (!infinite) this.reserve -= n;
    return n;
  }

  private tickMagazine(infinite: boolean, emit: (e: GunEvent) => void): void {
    const u = this.reloadTime / this.reloadTotal;
    const [out, into, rack] = this.def.reloadEvents;
    if (this.reloadSteps === 0 && u > 0.15) {
      this.reloadSteps = 1;
      if (out) emit(out);
    }
    if (this.reloadSteps === 1 && u > 0.6) {
      this.reloadSteps = 2;
      if (into) emit(into);
    }
    if (this.reloadSteps === 2 && this.emptyReload && u > 0.85) {
      this.reloadSteps = 3;
      if (rack) emit(rack);
      this.action = 0;
    }
    if (this.reloadTime >= this.reloadTotal) {
      this.ammo += this.take(this.stats.capacity - this.ammo, infinite);
      this.reloading = false;
    }
  }

  private tickShells(infinite: boolean, emit: (e: GunEvent) => void): void {
    if (this.reloadTime < this.reloadTotal) {
      if (this.shellPhase === 'chamber') this.action = Math.sin(Math.min(1, this.reloadTime / this.reloadTotal) * Math.PI);
      return;
    }
    this.reloadTime = 0;
    if (this.shellPhase === 'chamber') {
      this.action = 0;
      this.reloading = false;
      return;
    }
    if (this.shellPhase === 'load') {
      // A shell just went in.
      if (this.take(1, infinite) === 1) {
        this.ammo++;
        emit(this.def.loadEvent);
      }
    }
    this.shellPhase = 'load';
    const full = this.ammo >= this.stats.capacity;
    const outOfShells = !infinite && this.reserve <= 0;
    if (full || outOfShells) {
      if (this.emptyReload && this.ammo > 0 && this.stats.emptyReloadTime > 0) {
        // Was empty: pump (or bolt) the first shell into the chamber.
        this.shellPhase = 'chamber';
        this.reloadTotal = this.stats.emptyReloadTime;
        emit(this.def.cycle === 'bolt' ? 'bolt' : 'pump');
      } else {
        this.reloading = false;
      }
      return;
    }
    this.reloadTotal = this.stats.reloadTime;
  }
}
