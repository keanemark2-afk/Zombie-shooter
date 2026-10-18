import { tuning } from '../config/tuning';

// The guns you carry, and the bookkeeping for each one: ammo, firing rate,
// pumping and reloading. Kept free of graphics so it can be unit-tested.

export type WeaponId = 'pistol' | 'pump' | 'drum';

/** Every gun's numbers have this shape (see the sections in tuning.ts). */
export type WeaponStats = typeof tuning.pistol;

export interface WeaponDef {
  id: WeaponId;
  /** On-screen name (original names, not from any other game). */
  name: string;
  /** Quick-slot number (keys 1, 2, 3...). */
  slot: number;
  /** Live numbers from tuning.ts, so F1 changes apply straight away. */
  stats: () => WeaponStats;
  /** Pistol = held in the hands; long = shouldered rifle-style gun. */
  hold: 'pistol' | 'long';
  /** Magazine = all at once; shells = one at a time, can be interrupted by firing. */
  reload: 'magazine' | 'shells';
  /** Needs the pump worked after every shot. */
  pump: boolean;
  /** What kind of casing flies out. */
  casing: 'brass' | 'hull';
  /** Which gunshot sound to play. */
  sound: 'pistol' | 'shotgun' | 'autoShotgun';
}

export const WEAPONS: readonly WeaponDef[] = [
  { id: 'pistol', name: 'KESTREL 9', slot: 1, stats: () => tuning.pistol, hold: 'pistol', reload: 'magazine', pump: false, casing: 'brass', sound: 'pistol' },
  { id: 'pump', name: 'BRAMBLE 12', slot: 2, stats: () => tuning.pumpShotgun, hold: 'long', reload: 'shells', pump: true, casing: 'hull', sound: 'shotgun' },
  { id: 'drum', name: 'THRESHER', slot: 3, stats: () => tuning.drumShotgun, hold: 'long', reload: 'magazine', pump: false, casing: 'hull', sound: 'autoShotgun' },
];

/** Sounds and moments a gun produces while it works. */
export type GunEvent = 'magOut' | 'magIn' | 'slide' | 'pump' | 'shellIn' | 'drumOut' | 'drumIn' | 'bolt' | 'eject';

/** Fraction of the fire interval at which the pump is worked. */
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
  private pumpPending = false;
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

  /** Busy pumping between shots (pump guns). */
  get pumping(): boolean {
    return this.pumpPending || (this.def.pump && this.cooldown > 0 && this.sinceShot < this.stats.fireInterval);
  }

  reset(): void {
    this.ammo = this.stats.capacity;
    this.reserve = this.stats.spareAmmo;
    this.cooldown = 0;
    this.reloading = false;
    this.action = 0;
    this.pumpPending = false;
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
    if (this.def.pump) this.pumpPending = this.ammo > 0;
    else this.action = 1;
    return 'fired';
  }

  /** Advance time. Calls `emit` for each sound or moment that happens. */
  tick(dt: number, infinite: boolean, emit: (e: GunEvent) => void): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceShot += dt;
    const s = this.stats;

    // Pump guns work the pump a moment after each shot.
    if (this.def.pump) {
      const pumpStart = s.fireInterval * PUMP_AT;
      const pumpEnd = s.fireInterval * 0.85;
      if (this.pumpPending && this.sinceShot >= pumpStart) {
        this.pumpPending = false;
        emit('pump');
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
    const drum = this.def.id === 'drum';
    if (this.reloadSteps === 0 && u > 0.15) {
      this.reloadSteps = 1;
      emit(drum ? 'drumOut' : 'magOut');
    }
    if (this.reloadSteps === 1 && u > 0.6) {
      this.reloadSteps = 2;
      emit(drum ? 'drumIn' : 'magIn');
    }
    if (this.reloadSteps === 2 && this.emptyReload && u > 0.85) {
      this.reloadSteps = 3;
      emit(drum ? 'bolt' : 'slide');
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
        emit('shellIn');
      }
    }
    this.shellPhase = 'load';
    const full = this.ammo >= this.stats.capacity;
    const outOfShells = !infinite && this.reserve <= 0;
    if (full || outOfShells) {
      if (this.emptyReload && this.ammo > 0 && this.stats.emptyReloadTime > 0) {
        // Was empty: pump the first shell into the chamber.
        this.shellPhase = 'chamber';
        this.reloadTotal = this.stats.emptyReloadTime;
        emit('pump');
      } else {
        this.reloading = false;
      }
      return;
    }
    this.reloadTotal = this.stats.reloadTime;
  }
}
