// Gun upgrades bought from the Trader. Four stats (firepower, fire rate, reload
// speed, capacity) go up in levels; once every stat is maxed the gun's
// Exclusive Upgrade can be bought. Attachments (stock, scope, long magazine)
// are fitted to a gun for good. Pure rules, so they can be unit-tested.

export type UpgradeStat = 'firepower' | 'fireRate' | 'reload' | 'capacity';

export const UPGRADE_STATS: readonly UpgradeStat[] = ['firepower', 'fireRate', 'reload', 'capacity'];

export const STAT_NAMES: Record<UpgradeStat, string> = {
  firepower: 'Firepower',
  fireRate: 'Fire rate',
  reload: 'Reload speed',
  capacity: 'Capacity',
};

export type AttachmentId = 'stock' | 'scope' | 'longMag';

/** The numbers the rules need (the `upgrades` section of tuning.ts). */
export interface UpgradeRules {
  /** Extra firepower per level, as a fraction of the base. */
  firepowerPerLevel: number;
  /** How much shorter the time between shots gets per level (a fraction). */
  fireRatePerLevel: number;
  /** How much quicker reloading gets per level (a fraction). */
  reloadPerLevel: number;
  /** How much more the magazine holds per level (a fraction). */
  capacityPerLevel: number;
  /** Levels each stat can reach on the pistols, and on everything else. */
  levelsPistols: number;
  levelsOthers: number;
}

/** What a gun looks like to the attachment rules. */
export interface GunKind {
  id: string;
  hold: 'pistol' | 'long';
  reload: 'magazine' | 'shells';
  projectile: boolean;
}

/** The gun numbers upgrades change (a subset of every gun's tuning section). */
export interface Upgradable {
  damage: number;
  pellets: number;
  fireInterval: number;
  capacity: number;
  reloadTime: number;
  emptyReloadTime: number;
  focusTime: number;
  swaySpeed: number;
  spreadTight: number;
  pierce: number;
  critChance: number;
}

export interface Exclusive {
  name: string;
  blurb: string;
  apply(stats: Upgradable): void;
}

/** One signature bonus for each gun, unlocked when all four stats are maxed. */
export const EXCLUSIVES: Record<string, Exclusive> = {
  pistol: { name: 'Hawk-eye', blurb: 'Critical headshots are five times as likely.', apply: (s) => void (s.critChance = Math.min(1, s.critChance * 5)) },
  heavy: { name: 'Throughshot', blurb: 'Bullets pass through up to five enemies.', apply: (s) => void (s.pierce = Math.max(s.pierce, 5)) },
  swift: { name: 'Overcharge', blurb: 'One and a half times the firepower.', apply: (s) => void (s.damage *= 1.5) },
  smg: { name: 'Drum feed', blurb: 'A much bigger magazine.', apply: (s) => void (s.capacity = Math.round(s.capacity * 2.5)) },
  pump: { name: 'Wide choke', blurb: 'Half as many pellets again.', apply: (s) => void (s.pellets = Math.round(s.pellets * 1.5)) },
  drum: { name: 'Hair trigger', blurb: 'Fires nearly a third faster.', apply: (s) => void (s.fireInterval *= 0.7) },
  rifle: { name: 'Hardened rounds', blurb: 'More power, and shots pass through three enemies.', apply: (s) => ((s.damage *= 1.25), (s.pierce = Math.max(s.pierce, 3))) },
  magnum: { name: 'Speed loader', blurb: 'Reloads in little more than half the time, with more punch.', apply: (s) => ((s.reloadTime *= 0.6), (s.emptyReloadTime *= 0.6), (s.damage *= 1.2)) },
  rocket: { name: 'Twin tube', blurb: 'Holds a second rocket.', apply: (s) => void (s.capacity += 1) },
};

export const ATTACHMENT_NAMES: Record<AttachmentId, string> = {
  stock: 'Steadying stock',
  scope: 'Sight scope',
  longMag: 'Long magazine',
};

/** Which guns each attachment can be fitted to. */
export function attachmentFits(attachment: string, gun: GunKind): boolean {
  switch (attachment) {
    case 'stock':
      return gun.hold === 'long' && !gun.projectile;
    case 'scope':
      return !gun.projectile && (gun.hold === 'pistol' || gun.id === 'smg');
    case 'longMag':
      return gun.reload === 'magazine' && !gun.projectile;
    default:
      return false;
  }
}

type Levels = Record<UpgradeStat, number>;

/** What has been bought for each gun. */
export class WeaponUpgrades {
  private readonly levels = new Map<string, Levels>();
  private readonly exclusive = new Set<string>();
  private readonly fitted = new Map<string, Set<string>>();
  /** Bumps whenever anything changes (cached numbers are rebuilt). */
  version = 0;

  constructor(private readonly rules: () => UpgradeRules) {}

  level(gun: string, stat: UpgradeStat): number {
    return this.levels.get(gun)?.[stat] ?? 0;
  }

  /** The most levels a stat can have on this gun. */
  maxLevel(gun: string): number {
    return gun === 'pistol' || gun === 'heavy' || gun === 'swift' ? this.rules().levelsPistols : this.rules().levelsOthers;
  }

  canUpgrade(gun: string, stat: UpgradeStat): boolean {
    return this.level(gun, stat) < this.maxLevel(gun);
  }

  /** Buys the next level of a stat (the Trader takes the money first). */
  upgrade(gun: string, stat: UpgradeStat): boolean {
    if (!this.canUpgrade(gun, stat)) return false;
    const l = this.levels.get(gun) ?? { firepower: 0, fireRate: 0, reload: 0, capacity: 0 };
    l[stat]++;
    this.levels.set(gun, l);
    this.version++;
    return true;
  }

  /** Every stat is at its top level: the Exclusive Upgrade can be bought. */
  allMaxed(gun: string): boolean {
    return UPGRADE_STATS.every((s) => !this.canUpgrade(gun, s));
  }

  hasExclusive(gun: string): boolean {
    return this.exclusive.has(gun);
  }

  canBuyExclusive(gun: string): boolean {
    return this.allMaxed(gun) && !this.hasExclusive(gun) && gun in EXCLUSIVES;
  }

  buyExclusive(gun: string): boolean {
    if (!this.canBuyExclusive(gun)) return false;
    this.exclusive.add(gun);
    this.version++;
    return true;
  }

  hasAttachment(gun: string, attachment: string): boolean {
    return this.fitted.get(gun)?.has(attachment) ?? false;
  }

  attachmentsOf(gun: string): string[] {
    return [...(this.fitted.get(gun) ?? [])];
  }

  /** Fits an attachment for good. Returns false if it doesn't fit this gun or is already on it. */
  attach(gun: GunKind, attachment: string): boolean {
    if (!attachmentFits(attachment, gun) || this.hasAttachment(gun.id, attachment)) return false;
    const set = this.fitted.get(gun.id) ?? new Set<string>();
    set.add(attachment);
    this.fitted.set(gun.id, set);
    this.version++;
    return true;
  }

  /** Has anything been bought for this gun? (If not, its numbers are the plain ones.) */
  affects(gun: string): boolean {
    return this.levels.has(gun) || this.exclusive.has(gun) || (this.fitted.get(gun)?.size ?? 0) > 0;
  }

  /** Total levels bought on a gun (for showing a summary). */
  totalLevels(gun: string): number {
    return UPGRADE_STATS.reduce((n, s) => n + this.level(gun, s), 0);
  }

  reset(): void {
    this.levels.clear();
    this.exclusive.clear();
    this.fitted.clear();
    this.version++;
  }

  /** The gun's numbers with everything bought applied, written into `out`. */
  apply<T extends Upgradable>(gun: string, base: T, out: T): T {
    Object.assign(out, base);
    const r = this.rules();
    const l = this.levels.get(gun);
    if (l) {
      out.damage = base.damage * (1 + r.firepowerPerLevel * l.firepower);
      out.fireInterval = base.fireInterval * Math.max(0.2, 1 - r.fireRatePerLevel * l.fireRate);
      const reload = Math.max(0.2, 1 - r.reloadPerLevel * l.reload);
      out.reloadTime = base.reloadTime * reload;
      out.emptyReloadTime = base.emptyReloadTime * reload;
      out.capacity = Math.max(base.capacity, Math.round(base.capacity * (1 + r.capacityPerLevel * l.capacity)));
    }
    const fitted = this.fitted.get(gun);
    if (fitted) {
      if (fitted.has('stock')) {
        out.focusTime = base.focusTime * 0.7;
        out.swaySpeed = base.swaySpeed * 0.7;
      }
      if (fitted.has('scope')) out.spreadTight = base.spreadTight * 0.7;
      if (fitted.has('longMag')) out.capacity = Math.max(out.capacity + 1, Math.round(out.capacity * 1.34));
    }
    if (this.exclusive.has(gun)) EXCLUSIVES[gun]?.apply(out);
    return out;
  }
}
