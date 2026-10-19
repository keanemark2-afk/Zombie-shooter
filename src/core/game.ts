import {
  ACESFilmicToneMapping,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
  type Intersection,
  type Object3D,
} from 'three';
import { Horde } from '../ai/horde';
import { Sfx } from '../audio/sfx';
import { FallingProp } from '../characters/handheld';
import { chainsawHit, solveThrow } from '../combat/ballistics';
import { isLimb, resolveShot, zoneGroup, type HitResult, type LimbSegment, type LimbZone, type PelletHit, type Zone } from '../combat/damage';
import { blastFalloff, GrabStruggle, judgeParry, MELEE_NAMES, pickMeleeTarget, type MeleeMove } from '../combat/melee';
import { rollDrop, type Drop } from '../combat/drops';
import { herbEffect, PlayerHealth } from '../combat/health';
import { blastPush, falloff, randomInCone } from '../combat/pellets';
import { WEAPONS, weaponUpgrades } from '../combat/weapons';
import { EXCLUSIVES, STAT_NAMES, UPGRADE_STATS } from '../combat/upgrades';
import { TraderNpc } from '../characters/trader';
import { Trader, tuningPrices } from '../inventory/shop';
import { CaseScreen, type CaseHost } from '../ui/caseScreen';
import { TraderScreen, type TraderUiHost } from '../ui/traderScreen';
import { padButtonName, PAD } from '../config/controls';
import { bloodScale, goreLevel, settings } from '../config/settings';
import { tuning } from '../config/tuning';
import { showError } from '../debug/errorOverlay';
import { FpsCounter } from '../debug/fpsCounter';
import { TuningPanel } from '../debug/tuningPanel';
import { isElite, type EnemyKind } from '../enemies/kinds';
import { Zombie, type AttackKind, type AttackOutcome, type GrabRelease, type ThrownKind, type ZombieBehavior, type ZombieHost } from '../enemies/zombie';
import { Effects } from '../fx/effects';
import { GoreSystem } from '../fx/gore';
import { Pickups, type Pickup } from '../fx/pickups';
import { FireSystem, ThrownSystem, type Thrown, type ThrownHost } from '../fx/thrown';
import { itemDef, type GrenadeKind } from '../inventory/items';
import { chooseHealItem, Supplies } from '../inventory/supplies';
import { EliteSchedule, WaveDirector } from '../modes/waves';
import { NO_INPUT, Player, type MeleePhase, type PlayerHost, type PlayerInput } from '../player/player';
import { ShoulderCamera } from '../player/shoulderCamera';
import { PostFx } from '../render/postFx';
import { DeathScreen } from '../ui/deathScreen';
import { Hud, type RangeStats } from '../ui/hud';
import { Menu, type MenuChoice } from '../ui/menu';
import type { Collider } from '../world/colliders';
import { colliderOutlines } from '../world/colliders';
import { rangeZ } from '../world/range';
import { World } from '../world/world';
import { FlyCamera } from './flyCamera';
import { GamepadReader } from './gamepad';
import { Input } from './input';
import { FixedStepClock } from './loop';
import { levelFor, type GameMode } from './modes';
import { PlayerInputReader } from './playerInput';

const ZONE_NAMES: Record<Zone, string> = {
  head: 'HEAD',
  torso: 'BODY',
  armL: 'LEFT ARM',
  armR: 'RIGHT ARM',
  legL: 'LEFT LEG',
  legR: 'RIGHT LEG',
  parasite: 'PARASITE',
  shield: 'SHIELD',
};

function describeHit(hit: HitResult): string {
  const reactions: Record<HitResult['reaction'], string> = {
    none: 'no reaction',
    torsoFlinch: 'flinched',
    knockback: 'knocked back',
    headStagger: 'STAGGERED (clutching face)',
    kneel: hit.spin ? 'dropped to one knee and spun round' : 'dropped to one knee',
    trip: 'TRIPPED and fell flat',
    armFlinch: hit.dropWeapon ? 'arm knocked back, DROPPED its tool' : 'arm knocked back',
    knockdown: 'KNOCKED DOWN',
    legless: 'now CRAWLING',
    mutate: 'HEAD BURST · a PARASITE bursts out of the neck!',
    death: hit.headPop
      ? `${hit.crit ? 'CRITICAL! ' : ''}${goreLevel() === 'off' ? 'KILLED OUTRIGHT' : 'HEAD BURST'}`
      : hit.overkill > 0
        ? `KILLED (overkill ${Math.round(hit.overkill)})`
        : 'KILLED',
  };
  const where = hit.pellets > 1 ? `${ZONE_NAMES[hit.zone]} · ${hit.pellets} pellets` : ZONE_NAMES[hit.zone];
  const torn = hit.severed.map((s) => `${ZONE_NAMES[s.zone]} TORN OFF`).join(' · ');
  return `${where} · ${Math.round(hit.damage)} damage · ${torn ? `${torn} · ` : ''}${reactions[hit.reaction]}`;
}

interface AimResult {
  /** Where the camera's aim (with wobble) lands. */
  point: Vector3;
  direction: Vector3;
}

interface Rocket {
  mesh: Object3D;
  pos: Vector3;
  dir: Vector3;
  travelled: number;
}

interface Crate {
  mesh: Object3D;
  collider: Collider | null;
  broken: boolean;
}

interface Barrel {
  group: Object3D;
  collider: Collider | null;
  meshes: Object3D[];
  exploded: boolean;
  /** Seconds until it goes off (-1 = not lit). */
  fuse: number;
}

/** How big and strong a blast is (a rocket or barrel, a frag grenade, a stick of dynamite). */
interface BlastSpec {
  radius: number;
  damage: number;
  gibRadius: number;
  limbRadius: number;
  push: number;
  playerDamage: number;
  playerPush: number;
  size: number;
}

/** The speed that throws something `distance` metres in a pleasant arc (about 40 degrees), up to `max`. */
function arcSpeed(distance: number, max: number): number {
  return MathUtils.clamp(Math.sqrt((9.8 * Math.max(1, distance)) / 0.985) * 1.1, 6, max);
}

const GRENADE_NAMES: Record<GrenadeKind, string> = { frag: 'Frag', flash: 'Flash', fire: 'Incendiary' };
const GRENADE_ORDER: GrenadeKind[] = ['frag', 'flash', 'fire'];

/** Angle between two directions seen from above (ignoring up/down), in radians. */
function angleBetweenFlat(a: Vector3, b: Vector3): number {
  const d = Math.atan2(a.x, a.z) - Math.atan2(b.x, b.z);
  return Math.atan2(Math.sin(d), Math.cos(d));
}

/** Removes a dropped prop from the scene and frees its shapes (materials are shared). */
function disposeObject(obj: Object3D): void {
  obj.removeFromParent();
  obj.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
  });
}

function smoothstep(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

const tmp = new Vector3();
const tmp2 = new Vector3();
const tmp3 = new Vector3();
const muzzlePos = new Vector3();
const laserPos = new Vector3();
const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const qYaw = new Quaternion();
const qPitch = new Quaternion();

const rocketBody = new MeshStandardMaterial({ color: '#5d5a3a', roughness: 0.6, metalness: 0.3 });
const rocketFlame = new MeshBasicMaterial({ color: '#ffb35c' });

/** Owns the renderer, the world, the characters and the main loop. */
export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly world: World;
  readonly player: Player;
  readonly cam: ShoulderCamera;
  readonly tuningPanel: TuningPanel;
  readonly zombies: Zombie[] = [];
  readonly stats: RangeStats = { shots: 0, hits: 0, headshots: 0, kills: 0, lastHit: '' };
  private readonly post: PostFx;
  private readonly input: Input;
  private readonly pad = new GamepadReader();
  private readonly controls: PlayerInputReader;
  private readonly clock = new FixedStepClock();
  private readonly fps: FpsCounter;
  private readonly fx: Effects;
  private readonly gore: GoreSystem;
  private readonly sfx = new Sfx();
  private readonly hud = new Hud();
  private readonly menu = new Menu();
  private readonly deathScreen = new DeathScreen();
  private readonly horde = new Horde();
  private readonly pickups: Pickups;
  readonly health = new PlayerHealth(tuning.health.max);
  readonly supplies = new Supplies();
  private readonly waves = new WaveDirector();
  private readonly elites = new EliteSchedule();
  private readonly flyCamera: FlyCamera;
  private readonly raycaster = new Raycaster();
  private readonly fallingProps: FallingProp[] = [];
  private readonly reportedErrors = new Set<string>();
  private readonly zombieHost: ZombieHost;
  private readonly playerHost: PlayerHost;
  private readonly thrown: ThrownSystem;
  private readonly fires = new FireSystem();
  private readonly thrownHost: ThrownHost;
  /** The grenade type G throws (B changes it). */
  private grenadeKind: GrenadeKind = 'frag';
  private fireBurnTimer = 0;
  private readonly caseScreen = new CaseScreen();
  private readonly traderScreen = new TraderScreen();
  private readonly traderNpc = new TraderNpc();
  private readonly trader: Trader;
  /** Which full-screen menu is open (the game is frozen while one is). */
  private ui: 'case' | 'trader' | null = null;
  private traderWasOpen = false;
  private firePainTimer = 0;
  private colliderLines: LineSegments | null = null;
  private lastFrameTime = 0;
  private pixelRatio = 0;
  private hitStop = 0;
  private respawnTimer = 0;
  private zombieSeed = 1;
  private freeCam = false;
  /** Debug: keep the player's controls working while the free camera looks on. */
  private freeCamControls = false;
  private releasingMouse = false;
  private hitboxView = false;
  private lastDummyDistance = tuning.range.dummyDistance;
  /** Which side-by-side spot each range dummy stands on. */
  private readonly dummySlots = new Map<Zombie, number>();
  private lastWeapon = -1;
  private aim: AimResult = { point: new Vector3(), direction: new Vector3(0, 0, -1) };

  /** The stunned zombie the melee prompt is showing over, and the move it offers. */
  private meleeOption: { zombie: Zombie; move: MeleeMove } | null = null;
  /** The zombie being kicked, suplexed or stabbed right now. */
  private meleeTarget: Zombie | null = null;
  private grabbedBy: Zombie | null = null;
  private struggle: GrabStruggle | null = null;
  private grabCooldown = 0;
  private lastWiggle = 0;
  private readonly rockets: Rocket[] = [];
  private barrels: Barrel[] = [];
  private crates: Crate[] = [];
  /** The healing item being used right now. */
  private healingItem: { id: number; kind: 'herb' | 'spray'; key: string } | null = null;
  private heartbeatTimer = 0;
  private deathTimer = -1;
  private noRoomTimer = 0;
  private startedAt = 0;
  /** Kills in this run (drives elites, and the death summary). */
  runKills = 0;
  runCoinsEarned = 0;
  damageTaken = 0;

  /** What is being played: Survival, Score Attack or the practice range. */
  modeId: GameMode | null = null;
  get mode(): 'village' | 'range' | null {
    return this.modeId ? levelFor(this.modeId) : null;
  }
  paused = true;
  gameTime = 0;
  frameCount = 0;
  tickCount = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly autotest = false,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = tuning.graphics.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(tuning.camera.fov, 1, 0.05, 1500);
    this.world = new World(this.scene);
    this.fx = new Effects(this.scene);
    this.fx.onShellLand = (pos, kind) => this.sfx.shellLand(pos, kind);
    this.gore = new GoreSystem(this.scene, this.fx, (origin, dir, max) => this.world.raycast(origin, dir, max));
    this.pickups = new Pickups(this.scene);
    this.thrown = new ThrownSystem(this.scene);
    this.player = new Player();
    this.scene.add(this.player.object);
    this.cam = new ShoulderCamera(this.camera);
    this.input = new Input(this.renderer.domElement);
    this.controls = new PlayerInputReader(this.input, this.pad);
    this.flyCamera = new FlyCamera(this.camera, this.input, (x, z) => this.world.groundHeight(x, z));
    this.post = new PostFx(this.renderer, this.scene, this.camera);
    this.fps = new FpsCounter(this.renderer);
    this.tuningPanel = new TuningPanel(tuning);
    this.tuningPanel.onChange((path) => this.onTuningChanged(path));

    const self = this;
    this.zombieHost = {
      world: this.world,
      playerPosition: this.player.position,
      zombies: this.zombies,
      voice: this.sfx,
      attackPlayer: (z, kind) => this.attackPlayer(z, kind),
      canGrab: () => !this.player.busy && !this.player.invulnerable && this.grabCooldown <= 0 && this.grabbedBy === null && this.player.stunTime <= 0 && !this.player.dead,
      playerAlive: true,
      hasToken: (z) => this.horde.hasToken(z.id),
      waitingSpot: (z) => this.horde.waitingSpot(z.id),
      lineClear: (a, b) => this.horde.lineClear(a, b),
      steer: (from, out) => this.horde.steer(from, out),
      spotted: (z) => {
        this.horde.alertAround(this.zombies, z.position, tuning.ai.alertRadius);
      },
      dropProp: (prop, velocity, spin) => {
        this.scene.add(prop);
        const fp = new FallingProp(prop);
        fp.velocity.copy(velocity);
        fp.spin.copy(spin);
        this.fallingProps.push(fp);
        if (this.fallingProps.length > 12) disposeObject(this.fallingProps.shift()!.object);
      },
      canThrow: () => this.thrown.hostileCount < 2,
      launchThrown: (z, what, from, fuse) => this.enemyThrow(z, what, from, fuse),
      dropLitDynamite: (at, fuse) => {
        this.thrown.launch('dynamite', at.clone().setY(at.y + 0.1), tmp.set(0, 1.5, 0), fuse, true);
      },
    };
    this.thrownHost = {
      raycast: (o, d, m) => this.world.raycast(o, d, m),
      groundHeight: (x, z) => this.world.groundHeight(x, z),
      axeReaches: (pos) => this.axeReaches(pos),
      detonate: (t) => this.detonateThrown(t),
      axeLanded: (pos, flesh) => {
        this.sfx.axeThunk(pos, flesh);
        if (flesh) this.fx.blood(pos, tmp.set(0, 0.3, 1), 0.6 * bloodScale(), this.world.groundHeight(pos.x, pos.z));
        else this.fx.surfaceImpact(pos, UP, 'wood', 0.6);
      },
      bounced: (pos) => this.sfx.grenadeBounce(pos),
      fuseSpark: (pos) => {
        this.fx.flame(pos, 0.12);
        if (Math.random() < 0.5) this.sfx.fuseHiss(pos);
      },
    };
    this.playerHost = {
      fire: () => this.fireShot(),
      dryFire: () => this.sfx.dryFire(),
      gunEvent: (e) => {
        const casing = this.player.def.casing;
        if (e === 'eject' && casing !== 'none') {
          this.player.ejectionWorld(tmp);
          this.fx.ejectShell(tmp, tmp2.set(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)), casing);
        }
        if (e === 'cylinderOut') {
          // Six empty cases tumble out of the revolver.
          this.player.ejectionWorld(tmp);
          for (let i = 0; i < 6; i++) this.fx.ejectShell(tmp, tmp2.set(Math.random() - 0.5, -0.5, Math.random() - 0.5).multiplyScalar(0.4), 'brass');
        }
        this.sfx.gunEvent(e);
      },
      footstep: (_pos, sprinting) => this.sfx.footstep(sprinting),
      knifeSlash: () => this.knifeSlash(),
      meleeEvent: (move, phase) => this.meleeEvent(move, phase),
      healFinished: () => this.healFinished(),
      throwGrenade: () => this.releaseGrenade(),
    };
    this.deathScreen.onChoose = (choice) => {
      this.deathScreen.hide();
      if (choice === 'retry' && this.modeId) this.startMode(this.modeId);
      else this.goToMenu();
    };
    this.supplies.onChange = () => {};
    this.scene.add(this.traderNpc.object);
    this.trader = new Trader(
      {
        get coins() { return self.supplies.coins; },
        set coins(v: number) { self.supplies.coins = v; },
        items: () => this.supplies.items,
        addItem: (kind, key) => {
          const it = this.supplies.addNew(kind, key);
          if (it && kind === 'weapon') this.player.give(key as 'pistol', tuning.trader.startAmmo);
          return it !== null;
        },
        removeItem: (id) => {
          const it = this.supplies.remove(id);
          if (it?.kind === 'weapon') this.player.take(it.key as 'pistol');
        },
        weaponCount: () => this.supplies.items.filter((i) => i.kind === 'weapon').length,
        ownsWeapon: (id) => this.supplies.items.some((i) => i.kind === 'weapon' && i.key === id),
        weaponName: (id) => WEAPONS.find((w) => w.id === id)?.name ?? id,
        ammo: (id) => {
          const g = this.player.guns.find((x) => x.def.id === id);
          return g && this.player.has(g.def.id) ? { reserve: g.reserve, max: g.stats.spareAmmo } : null;
        },
        addAmmo: (id, n) => {
          const g = this.player.guns.find((x) => x.def.id === id)!;
          const add = Math.min(n, g.stats.spareAmmo - g.reserve);
          g.reserve += add;
          return add;
        },
        knifeCondition: () => this.player.knife.condition,
        repairKnife: () => this.player.knife.repair(),
        caseTier: () => this.supplies.caseTier,
        upgradeCase: () => this.supplies.upgradeCase(this.supplies.caseTier + 1),
        upgrades: weaponUpgrades,
      },
      tuningPrices,
      WEAPONS.map((w) => w.id),
    );
    this.caseScreen.onClose = () => this.closeUi();
    this.traderScreen.onClose = () => this.closeUi();
    this.traderScreen.onReady = () => {
      this.waves.skipBreak();
      this.closeUi();
    };
    this.traderScreen.onOpenCase = () => this.openCase();

    this.menu.onChoose = (choice) => this.choose(choice);
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.paused && !this.autotest) this.input.lockPointer();
    });
    // Sound can only start after the player clicks or presses a key.
    const unlockAudio = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Behind the title menu: a slow view of the village.
    this.world.setLevel('village');
    this.player.spawn(0, 12, 0, this.world);
    this.player.object.visible = false;
    this.cam.yaw = 0.35;
    this.cam.pitch = -0.12;
    this.menu.show(false);
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------------------
  // Modes, menu and pausing

  private choose(choice: MenuChoice): void {
    this.sfx.unlock();
    if (choice === 'resume' && this.modeId) {
      this.resume();
      return;
    }
    if (choice !== 'resume') this.startMode(choice);
  }

  /** Leaves the current run and shows the title menu. */
  private goToMenu(): void {
    this.deathScreen.hide();
    this.clearRun();
    this.modeId = null;
    this.paused = true;
    this.player.object.visible = false;
    this.hud.visible = false;
    this.world.setLevel('village');
    this.menu.show(false);
  }

  /** Clears everything left over from a run. */
  private clearRun(): void {
    for (const z of this.zombies) this.removeZombie(z);
    this.zombies.length = 0;
    for (const p of this.fallingProps) disposeObject(p.object);
    this.fallingProps.length = 0;
    for (const r of this.rockets) disposeObject(r.mesh);
    this.rockets.length = 0;
    this.thrown.clear();
    this.fires.clear();
    this.fx.setFireLight(null, 0);
    this.gore.clear();
    this.pickups.clear();
    this.restoreBarrels();
    this.restoreCrates();
    this.horde.reset();
  }

  startMode(id: GameMode): void {
    this.deathScreen.hide();
    this.clearRun();
    this.world.setLevel(levelFor(id));
    this.modeId = id;
    this.setupBarrels();
    this.setupCrates();
    this.horde.setObstacles(this.world.level.colliders);
    const practice = id === 'range';
    // The practice range carries every gun; real runs start with just the pistol.
    if (practice) for (const w of WEAPONS) this.player.carried.add(w.id);
    const spawn = this.world.level.playerSpawn;
    this.player.spawn(spawn.x, spawn.z, spawn.yaw, this.world);
    this.player.object.visible = true;
    this.cam.yaw = spawn.yaw;
    this.cam.pitch = -0.05;
    this.health.reset(tuning.health.max);
    this.supplies.clear();
    this.supplies.unlimited = practice;
    weaponUpgrades.reset();
    this.player.knife.repair();
    this.ui = null;
    this.caseScreen.hide();
    this.traderScreen.hide();
    this.traderNpc.visible = false;
    const tp = this.world.level.trader;
    if (tp) this.traderNpc.place(tp.x, this.world.groundHeight(tp.x, tp.z), tp.z, tp.yaw);
    if (!practice) this.supplies.addNew('weapon', 'pistol');
    this.healingItem = null;
    this.deathTimer = -1;
    this.runKills = 0;
    this.runCoinsEarned = 0;
    this.damageTaken = 0;
    this.startedAt = this.gameTime;
    this.elites.reset();
    Object.assign(this.stats, { shots: 0, hits: 0, headshots: 0, kills: 0, lastHit: '' });
    this.respawnTimer = 0;
    this.meleeOption = null;
    this.meleeTarget = null;
    this.grabbedBy = null;
    this.struggle = null;
    this.grabCooldown = 0;
    if (this.colliderLines) {
      this.colliderLines.removeFromParent();
      this.colliderLines = null;
    }
    this.dummySlots.clear();
    this.lastWeapon = -1;
    this.grenadeKind = 'frag';
    if (practice) {
      this.spawnMissingDummies();
      for (const kind of GRENADE_ORDER) for (let i = 0; i < 3; i++) this.supplies.addNew('grenade', kind);
    } else {
      this.player.setLoadout({ pistol: 40 }, 'pistol');
      for (let i = 0; i < tuning.grenades.startFrag; i++) this.supplies.addNew('grenade', 'frag');
      this.supplies.addNew('herb', 'G');
      this.waves.begin(1, tuning.waves.startDelay);
    }
    this.resume();
  }

  private resume(): void {
    this.paused = false;
    this.menu.hide();
    this.hud.visible = true;
    this.controls.clear();
    this.clock.reset();
    if (!this.autotest) this.input.lockPointer();
  }

  private pause(): void {
    if (!this.mode) return;
    this.paused = true;
    this.menu.show(true);
    this.hud.visible = false;
    this.input.unlockPointer();
  }

  private onPointerLockChange(): void {
    if (this.input.pointerLocked) return;
    if (this.releasingMouse) {
      this.releasingMouse = false;
      return;
    }
    // The player pressed Esc.
    if (!this.paused) this.pause();
  }

  // ---------------------------------------------------------------------------
  // Spawning

  private dummyBehavior(): ZombieBehavior {
    return tuning.range.dummyBehavior as ZombieBehavior;
  }

  /** Side-by-side spots for range dummies: middle first, then alternating left and right. */
  private dummyX(slot: number): number {
    return (slot % 2 === 1 ? -1 : 1) * Math.ceil(slot / 2) * 0.9;
  }

  private dummyCount(): number {
    return MathUtils.clamp(Math.round(tuning.range.dummyCount), 1, 6);
  }

  /** Fills every empty dummy spot on the range. */
  private spawnMissingDummies(): void {
    const d = tuning.range.dummyDistance;
    const taken = new Set<number>();
    for (const [z, slot] of this.dummySlots) if (z.alive) taken.add(slot);
    for (let slot = 0; slot < this.dummyCount(); slot++) {
      if (taken.has(slot)) continue;
      const z = new Zombie(this.zombieSeed++, this.dummyX(slot), rangeZ(d), 0, this.dummyBehavior(), {
        holdsTool: tuning.range.dummyHoldsWeapon,
        invincible: tuning.range.dummyInvincible,
      });
      this.dummySlots.set(z, slot);
      this.addZombie(z);
    }
    this.lastDummyDistance = d;
  }

  /** A zombie walks in through one of the gates, a far one by preference. */
  private spawnWaveZombie(kind: EnemyKind): Zombie {
    const spawns = this.world.level.enemySpawns;
    const p = this.player.position;
    const far = [...spawns].sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z));
    let x = 0;
    let z = 0;
    let yaw = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const s = far[Math.floor(Math.random() * Math.min(2, far.length))];
      const outX = Math.sin(s.yaw);
      const outZ = Math.cos(s.yaw);
      const side = (Math.random() - 0.5) * 3.2;
      const depth = Math.random() * 2.5;
      x = s.x + outZ * side + outX * depth;
      z = s.z - outX * side + outZ * depth;
      yaw = s.yaw + Math.PI;
      if (this.zombies.every((o) => !o.alive || Math.hypot(o.position.x - x, o.position.z - z) > 1.1)) break;
    }
    const zombie = new Zombie(this.zombieSeed++, x, z, yaw, 'hunt', {
      holdsTool: kind === 'shambler' && Math.random() < tuning.zombie.weaponChance,
      kind,
      aware: true,
    });
    this.addZombie(zombie);
    return zombie;
  }

  private addZombie(z: Zombie): void {
    if (this.hitboxView) z.rig.setHitboxView(true);
    z.onDeath = (dead) => this.onZombieDied(dead);
    this.zombies.push(z);
    this.scene.add(z.object);
  }

  /** A zombie has died (any way at all): count it and see what it drops. */
  private onZombieDied(z: Zombie): void {
    this.runKills++;
    this.stats.kills++;
    if (this.modeId === 'range') return;
    const rolls = isElite(z.kind) ? 4 : 1;
    for (let i = 0; i < rolls; i++) {
      const at = z.chestPosition(new Vector3());
      at.x += (Math.random() - 0.5) * 0.6;
      at.z += (Math.random() - 0.5) * 0.6;
      this.dropAt(at, z.stats.coins, isElite(z.kind) ? 6 : 1, tuning.drops.chance);
    }
  }

  /** Rolls the drop rules and, if something drops, puts it on the ground. */
  private dropAt(at: Vector3, coinScale: number, luck: number, chance: number): void {
    const guns = this.player.guns
      .filter((g) => this.player.has(g.def.id))
      .map((g) => ({ weapon: g.def.id as string, reserve: g.reserve, maxReserve: g.stats.spareAmmo }));
    const drop: Drop | null = rollDrop({ guns, healItems: this.supplies.healItems, coinScale, luck, grenades: this.modeId === 'survival' || this.modeId === 'score' }, { ...tuning.drops, chance }, Math.random);
    if (drop) this.pickups.spawn(drop, at, this.world.groundHeight(at.x, at.z));
  }

  private removeZombie(z: Zombie): void {
    z.object.removeFromParent();
    z.dispose();
    this.dummySlots.delete(z);
    if (this.meleeTarget === z) this.meleeTarget = null;
    if (this.grabbedBy === z) this.endGrab();
  }

  private manageZombies(dt: number): void {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].removed) {
        this.removeZombie(this.zombies[i]);
        this.zombies.splice(i, 1);
      }
    }
    const alive = this.zombies.filter((z) => z.alive);
    if (this.mode === 'range') {
      const d = tuning.range.dummyDistance;
      const moved = Math.abs(d - this.lastDummyDistance) > 0.25;
      if (moved) this.lastDummyDistance = d;
      for (const z of alive) {
        const slot = this.dummySlots.get(z) ?? 0;
        if (slot >= this.dummyCount()) {
          // Fewer dummies wanted: the extra ones vanish.
          z.removed = true;
          continue;
        }
        z.invincible = tuning.range.dummyInvincible;
        z.behavior = this.dummyBehavior();
        if (moved && !z.crawler) z.teleport(this.dummyX(slot), rangeZ(d), 0);
      }
      const living = alive.filter((z) => !z.removed).length;
      if (living < this.dummyCount()) {
        this.respawnTimer += dt;
        if (this.respawnTimer >= tuning.range.dummyRespawnDelay) {
          this.respawnTimer = 0;
          this.spawnMissingDummies();
        }
      } else {
        this.respawnTimer = 0;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Zombies attacking the player: hits, parries and grabs

  /** Did the knife catch an attack coming from `from`? Handles the knife wear, sparks and sound. */
  private tryParry(from: Vector3, wearCost: number | null = null): 'perfect' | 'parry' | 'none' {
    const p = this.player;
    if (p.grabbed) return 'none';
    const since = p.sinceKnifePress < 2 ? p.sinceKnifePress : null;
    const parry = judgeParry(since, p.guarding, p.knife.durability, tuning.knife);
    if (parry === 'none') return 'none';
    const k = tuning.knife;
    const perfect = parry === 'perfect';
    p.knife.wear(wearCost ?? (perfect ? k.perfectParryCost : k.parryCost), k.unbreakable);
    p.sinceKnifePress = 999;
    this.sfx.parry(perfect);
    this.fx.parrySpark(p.knifeWorld(tmp), perfect);
    if (perfect) {
      this.hitStop = Math.max(this.hitStop, k.parryHitStop);
      this.hud.flashBanner('PERFECT PARRY');
      this.cam.shake(0.2);
    } else {
      p.nudge(from, 0.35);
      this.cam.shake(0.1);
    }
    return parry;
  }

  private attackPlayer(z: Zombie, kind: AttackKind): AttackOutcome {
    const p = this.player;
    if (p.invulnerable || (p.grabbed && this.grabbedBy !== z)) return 'blocked';
    const parry = this.tryParry(z.position, kind === 'chainsaw' ? tuning.chainsaw.parryKnifeCost : null);
    if (parry !== 'none') {
      const perfect = parry === 'perfect';
      this.stats.lastHit = perfect ? 'PERFECT PARRY · stunned - kick it!' : 'PARRIED';
      return perfect ? 'perfect' : 'parried';
    }
    if (kind === 'grab') {
      if (!this.zombieHost.canGrab(z)) return 'blocked';
      this.startGrab(z);
      return 'grabbed';
    }
    if (kind === 'chainsaw') {
      const hit = chainsawHit(settings.difficulty, tuning.chainsaw.damage, tuning.chainsaw.instantKillFrom as 'easy' | 'normal' | 'hard' | 'pro' | 'never');
      this.stats.lastHit = hit.instantKill && this.modeId !== 'range' ? 'CHAINSAW · instant death' : 'CHAINSAW HIT';
      if (hit.instantKill && this.modeId !== 'range' && !p.dead) {
        this.damageTaken += this.health.current;
        this.health.kill();
        p.hurt(z.position, tuning.zombie.attackPush * 1.5);
        this.cam.shake(tuning.feel.shakeHurt * 1.5);
        this.hud.hurtFlash();
        this.sfx.playerHurt();
        const at = p.position.clone().setY(p.position.y + 1.4);
        this.fx.blood(at, tmp.subVectors(p.position, z.position).setY(0.2).normalize(), 2 * bloodScale(), p.position.y);
        this.playerDied();
      } else {
        this.damagePlayer(hit.damage, z.position, tuning.zombie.attackPush * 1.5);
      }
      return 'hit';
    }
    if (kind === 'whip') {
      this.damagePlayer(tuning.parasite.whipDamage, z.position, tuning.zombie.attackPush * 0.8);
      return 'hit';
    }
    const base = kind === 'claw' ? tuning.zombie.clawDamage : tuning.zombie.swingDamage;
    const push = (kind === 'claw' ? tuning.zombie.attackPush * 0.6 : tuning.zombie.attackPush) * (z.kind === 'brute' ? tuning.brute.pushBonus : 1);
    this.damagePlayer(base * z.stats.damage, z.position, push);
    return 'hit';
  }

  // ---------------------------------------------------------------------------
  // Things in the air: grenades, and what enemies throw

  /** An enemy lets go of an axe or a lit stick of dynamite, aimed at you. */
  private enemyThrow(z: Zombie, what: ThrownKind, from: Vector3, fuse: number): void {
    const p = this.player;
    // Aims a little ahead of where you are heading.
    const lead = what === 'axe' ? 0.35 : 0.5;
    const target = new Vector3(p.position.x + p.velocity.x * lead, p.position.y + (what === 'axe' ? 1.15 : 0.1), p.position.z + p.velocity.z * lead);
    if (what === 'axe') {
      const t = tuning.axeThrower;
      const vel = solveThrow(from, target, t.speed, false, 9.8 * 0.55);
      const item = this.thrown.launch('axe', from, tmp.set(vel.x, vel.y, vel.z), -1, true);
      void item;
      this.sfx.axeWhoosh(from);
    } else {
      const t = tuning.dynamiteThrower;
      const d = Math.hypot(target.x - from.x, target.z - from.z);
      const vel = solveThrow(from, target, arcSpeed(d, t.throwSpeed), false);
      this.thrown.launch('dynamite', from, tmp.set(vel.x, vel.y, vel.z), fuse, true);
      this.sfx.fuseHiss(from);
    }
    void z;
  }

  /** Is an enemy axe at `pos` touching the player? A parry knocks it out of the air. */
  private axeReaches(pos: Vector3): 'hit' | 'parried' | 'miss' {
    const p = this.player;
    if (p.dead) return 'miss';
    const dx = pos.x - p.position.x;
    const dz = pos.z - p.position.z;
    if (Math.hypot(dx, dz) > 0.6 || pos.y < p.position.y + 0.1 || pos.y > p.position.y + 1.95) return 'miss';
    if (p.invulnerable) return 'miss';
    const parry = this.tryParry(pos);
    if (parry !== 'none') {
      this.stats.lastHit = parry === 'perfect' ? 'PERFECT PARRY · axe knocked away' : 'PARRIED the axe';
      this.sfx.axeThunk(pos, false);
      return 'parried';
    }
    this.damagePlayer(tuning.axeThrower.damage, tmp.set(pos.x - 1, pos.y, pos.z), tuning.zombie.attackPush * 0.9);
    this.stats.lastHit = 'AXE HIT';
    return 'hit';
  }

  /** Cycles which grenade G throws. */
  private cycleGrenade(): void {
    const have = GRENADE_ORDER.filter((k) => this.supplies.grenades(k).length > 0);
    if (have.length === 0) return;
    const i = have.indexOf(this.grenadeKind);
    this.grenadeKind = have[(i + 1) % have.length];
    this.sfx.uiClick();
  }

  /** G: starts a throw if there is a grenade to throw. */
  private tryThrowGrenade(): void {
    const p = this.player;
    if (!p.canThrow) return;
    if (this.supplies.grenades(this.grenadeKind).length === 0) {
      const other = GRENADE_ORDER.find((k) => this.supplies.grenades(k).length > 0);
      if (!other) {
        this.hud.addFeed('No grenades', 'bad');
        return;
      }
      this.grenadeKind = other;
    }
    p.startThrow(tuning.grenades.throwTime);
    this.sfx.grenadeThrow();
  }

  /** The grenade leaves the hand part-way through the throwing animation. */
  private releaseGrenade(): void {
    const kind = this.grenadeKind;
    const item = this.supplies.grenades(kind)[0];
    if (!item) return;
    this.supplies.remove(item.id);
    const g = tuning.grenades;
    const p = this.player;
    const from = p.leftHandWorld(new Vector3());
    const aim = this.computeAim();
    // Aim where you are looking, but keep the throw within a sensible range.
    const flat = tmp.set(aim.point.x - p.position.x, 0, aim.point.z - p.position.z);
    const wanted = flat.length();
    const dist = MathUtils.clamp(wanted, g.minThrow, g.maxThrow);
    const dir = flat.lengthSq() > 1e-4 ? flat.normalize() : p.forward(tmp3);
    const target = new Vector3(p.position.x + dir.x * dist, 0, p.position.z + dir.z * dist);
    target.y = this.world.groundHeight(target.x, target.z) + 0.1;
    const vel = solveThrow(from, target, arcSpeed(Math.hypot(target.x - from.x, target.z - from.z), g.throwSpeed), false);
    const fuse = kind === 'frag' ? g.fragFuse : kind === 'flash' ? g.flashFuse : 0;
    this.thrown.launch(kind, from, new Vector3(vel.x, vel.y, vel.z), fuse, false);
    if (this.supplies.grenades(kind).length === 0) {
      const other = GRENADE_ORDER.find((k) => this.supplies.grenades(k).length > 0);
      if (other) this.grenadeKind = other;
    }
  }

  /** A thrown thing has gone off (or been shot): do what it does. */
  private detonateThrown(t: Thrown): void {
    const at = t.pos.clone();
    switch (t.type) {
      case 'frag': {
        const g = tuning.grenades;
        this.explode(at.setY(at.y + 0.15), null, true, { radius: g.fragRadius, damage: g.fragDamage, gibRadius: g.fragGibRadius, limbRadius: g.fragLimbRadius, push: g.fragPush, playerDamage: g.fragPlayerDamage, playerPush: tuning.explosion.playerPush, size: 0.9 });
        break;
      }
      case 'dynamite': {
        const d = tuning.dynamiteThrower;
        const e = tuning.explosion;
        this.explode(at.setY(at.y + 0.15), null, true, { radius: d.radius, damage: d.damage, gibRadius: e.gibRadius, limbRadius: d.radius * 0.7, push: e.push, playerDamage: d.playerDamage, playerPush: e.playerPush, size: 0.85 });
        break;
      }
      case 'flash':
        this.flashGrenade(at);
        break;
      case 'fire':
        this.igniteGround(at);
        break;
      case 'axe':
        break;
    }
  }

  /** The flash grenade: blinds zombies (and you, if you look), and kills parasites. */
  private flashGrenade(at: Vector3): void {
    const g = tuning.grenades;
    this.fx.flashBurst(at);
    this.sfx.flashBang(at);
    this.hitStop = Math.max(this.hitStop, 0.05);
    let hit = 0;
    let parasites = 0;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const c = z.chestPosition(tmp2);
      const d = c.distanceTo(at);
      if (d > g.flashRadius) continue;
      const to = tmp3.subVectors(c, at);
      if (this.world.raycast(at, to.clone().normalize(), Math.max(0, d - 0.3))) continue;
      const wasParasite = z.parasite;
      z.flash(g.flashStun, this.zombieHost);
      if (wasParasite) parasites++;
      hit++;
    }
    // You are dazzled too if you are facing it.
    const p = this.player;
    const toFlash = tmp.set(at.x - p.position.x, 0, at.z - p.position.z);
    const d = toFlash.length();
    if (d < g.flashRadius && !p.dead) {
      const camFwd = tmp2.set(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
      const facing = toFlash.normalize().dot(camFwd);
      if (facing > 0.1 || d < 3) this.hud.whiteout(g.flashBlind * (d < 3 ? 1.3 : 1) * (0.5 + 0.5 * Math.max(0, facing)));
    }
    this.stats.lastHit = `FLASH · ${hit} blinded${parasites ? ` · ${parasites} parasite${parasites > 1 ? 's' : ''} killed` : ''}`;
  }

  /** An incendiary lands: a patch of fire on the ground. */
  private igniteGround(at: Vector3): void {
    const g = tuning.grenades;
    at.y = this.world.groundHeight(at.x, at.z);
    this.fires.add(at, g.fireRadius, g.fireDuration);
    this.sfx.fireWhoosh(at);
    this.fx.flame(at, 3);
    for (const z of this.zombies) {
      if (z.alive && Math.hypot(z.position.x - at.x, z.position.z - at.z) < g.fireRadius + 0.3) z.ignite();
    }
    this.stats.lastHit = 'FIRE';
  }

  /** Fire on the ground hurts whoever stands in it; burning zombies flame. */
  private updateFires(dt: number): void {
    this.fires.update(dt);
    let lightAt: Vector3 | null = null;
    let strength = 0;
    for (const patch of this.fires.patches) {
      lightAt = patch.pos;
      strength = Math.min(1, patch.time / 1.5);
      const n = Math.max(1, Math.round(patch.radius * 1.4));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * patch.radius;
        this.fx.flame(tmp.set(patch.pos.x + Math.cos(a) * r, patch.pos.y, patch.pos.z + Math.sin(a) * r), 1);
      }
      for (const z of this.zombies) {
        if (z.alive && Math.hypot(z.position.x - patch.pos.x, z.position.z - patch.pos.z) < patch.radius) z.inFire(dt, this.zombieHost);
      }
    }
    // The player burns while standing in the flames.
    const p = this.player;
    if (!p.dead && this.modeId !== 'range' && this.fires.covers(p.position.x, p.position.z, -0.3)) {
      this.firePainTimer -= dt;
      const done = this.health.drain(tuning.grenades.firePlayerDamage * dt);
      this.damageTaken += done;
      if (this.firePainTimer <= 0) {
        this.firePainTimer = 0.6;
        this.hud.hurtFlash();
        this.sfx.playerHurt();
      }
      if (this.health.dead) this.playerDied();
    }
    for (const z of this.zombies) {
      if (!z.alive || z.burning <= 0) continue;
      this.fx.flame(tmp.set(z.position.x, z.position.y + 0.3 + Math.random() * 1.2, z.position.z), 0.8);
      lightAt ??= z.position;
      strength = Math.max(strength, 0.6);
      this.fireBurnTimer -= dt;
      if (this.fireBurnTimer <= 0) {
        this.fireBurnTimer = 0.35;
        this.sfx.crackle(z.position);
      }
    }
    this.fx.setFireLight(lightAt, strength);
  }

  /** Hurts the player (nothing happens to your health on the practice range). */
  private damagePlayer(amount: number, from: Vector3, push = tuning.zombie.attackPush): void {
    const p = this.player;
    if (p.dead) return;
    if (this.modeId !== 'range') {
      const done = this.health.damage(amount, tuning.health.graceTime);
      if (done <= 0) return;
      this.damageTaken += done;
    } else if (this.health.grace > 0) {
      return;
    } else {
      this.health.grace = tuning.health.graceTime;
    }
    p.hurt(from, push);
    this.healingItem = null;
    this.cam.shake(tuning.feel.shakeHurt);
    this.hud.hurtFlash();
    this.sfx.playerHurt();
    if (this.health.dead) this.playerDied();
  }

  private playerDied(): void {
    this.player.die();
    if (this.grabbedBy) this.endGrab();
    this.sfx.playerDeath();
    this.deathTimer = tuning.health.deathScreenDelay;
    this.hud.setScope(false);
  }

  private showDeathScreen(): void {
    const mins = Math.floor((this.gameTime - this.startedAt) / 60);
    const secs = Math.floor((this.gameTime - this.startedAt) % 60);
    const lines = [
      `Wave <b>${this.waves.wave}</b> reached`,
      `Zombies killed: <b>${this.runKills}</b>`,
      `Coins earned: <b>${this.runCoinsEarned.toLocaleString('en-US')}</b>`,
      `Time survived: <b>${mins}:${String(secs).padStart(2, '0')}</b>`,
    ];
    const padType = this.pad.connected && this.controls.lastDevice === 'gamepad' ? this.pad.type : null;
    const hint = padType ? `${padButtonName(PAD.south, padType)}: try again   ${padButtonName(PAD.east, padType)}: main menu` : 'Enter or R: try again   Esc: main menu';
    this.releasingMouse = true;
    this.input.unlockPointer();
    this.deathScreen.show(lines, hint);
  }

  private startGrab(z: Zombie): void {
    this.grabbedBy = z;
    this.struggle = new GrabStruggle(tuning.grab);
    this.player.grabbed = true;
    this.player.aiming = false;
    this.player.gun.cancelReload();
    this.lastWiggle = 0;
    this.sfx.roar(z.chestPosition(tmp), z.voicePitch * 1.1);
    this.cam.shake(0.25);
  }

  /** Each update while held: keep the two pressed together, read the mashing. */
  private tickGrab(dt: number, input: PlayerInput): void {
    const z = this.grabbedBy!;
    const s = this.struggle!;
    if (!z.alive || z.state !== 'grabbing') {
      this.endGrab();
      return;
    }
    const p = this.player;
    const toZ = tmp.subVectors(z.position, p.position).setY(0);
    if (toZ.lengthSq() < 1e-4) toZ.copy(p.forward(tmp2));
    toZ.normalize();
    p.yaw = Math.atan2(-toZ.x, -toZ.z);
    z.holdAt(tmp2.copy(p.position).addScaledVector(toZ, 0.55), p.yaw + Math.PI);

    if (input.meleePressed) {
      s.mash();
      this.sfx.struggle();
      this.cam.shake(0.05);
    }
    const flick = Math.abs(input.moveX) > 0.5 ? Math.sign(input.moveX) : 0;
    if (flick !== 0 && flick !== this.lastWiggle) s.wiggle();
    if (flick !== 0) this.lastWiggle = flick;
    if (input.knifePressed && !p.knife.broken) {
      this.releaseGrab('knifed');
      return;
    }
    const result = s.tick(dt);
    if (result === 'free') this.releaseGrab('shoved');
    else if (result === 'bitten') this.releaseGrab('bit');
  }

  private releaseGrab(how: GrabRelease): void {
    const z = this.grabbedBy;
    if (!z) return;
    const p = this.player;
    const dir = tmp3.subVectors(z.position, p.position).setY(0).normalize();
    z.releaseGrab(how, dir);
    if (how === 'knifed') {
      p.knife.wear(tuning.knife.grabEscapeCost, tuning.knife.unbreakable);
      p.stab();
      const result = resolveShot([{ zone: 'head', damage: tuning.knife.damage * 2, knockback: 0 }], z.targetState, 1, tuning);
      z.health = result.healthAfter;
      if (result.killed) z.applyHit(result, dir, this.sfx, this.zombieHost);
      const at = z.headPosition(tmp);
      this.sfx.knifeHit(at, true);
      this.fx.blood(at, dir, 1.2 * bloodScale(), this.world.groundHeight(at.x, at.z));
      this.stats.lastHit = 'STABBED FREE';
    } else if (how === 'shoved') {
      this.sfx.kick(z.chestPosition(tmp));
      this.stats.lastHit = 'BROKE FREE · zombie stunned - kick it!';
    } else {
      this.damagePlayer(tuning.zombie.biteDamage * z.stats.damage, z.position, tuning.zombie.attackPush * 1.3);
      this.sfx.bite(z.headPosition(tmp));
      this.fx.blood(p.position.clone().setY(p.position.y + 1.5), dir.clone().negate(), 0.8 * bloodScale(), p.position.y);
      this.stats.lastHit = 'BITTEN';
    }
    this.endGrab();
  }

  private endGrab(): void {
    this.grabbedBy = null;
    this.struggle = null;
    this.player.grabbed = false;
    this.grabCooldown = tuning.grab.cooldown;
  }

  // ---------------------------------------------------------------------------
  // Healing, pickups and crates

  /** Starts using a healing item if you have one worth using. */
  private tryHeal(): void {
    const p = this.player;
    if (p.dead || p.busy || p.healing || p.stunTime > 0 || this.health.dead) return;
    const item = chooseHealItem(this.supplies.items, this.health.fraction);
    if (!item) {
      this.hud.addFeed('Nothing to heal with', 'bad');
      return;
    }
    const effect = item.kind === 'spray' ? { heal: 'full' as const, raiseMax: tuning.health.sprayRaisesMax } : herbEffect(item.key);
    if (!effect) return;
    if (this.health.fraction >= 1 && effect.raiseMax <= 0) {
      this.hud.addFeed('Your health is full', 'info');
      return;
    }
    this.healingItem = { id: item.id, kind: item.kind === 'spray' ? 'spray' : 'herb', key: item.key };
    p.startHeal(tuning.health.healTime);
    this.sfx.heal(item.kind === 'spray');
  }

  /** The healing animation finished: use up the item and restore the health. */
  private healFinished(): void {
    const used = this.healingItem;
    this.healingItem = null;
    if (!used) return;
    const effect = used.kind === 'spray' ? { heal: 'full' as const, raiseMax: tuning.health.sprayRaisesMax } : herbEffect(used.key);
    if (!effect) return;
    const before = this.health.current;
    this.health.apply(effect);
    this.supplies.remove(used.id);
    this.sfx.healed();
    const gained = Math.round(this.health.current - before);
    this.hud.addFeed(gained > 0 ? `Health restored +${gained}` : 'Maximum health raised', 'good');
  }

  /** The player reached a pickup. Returns true if it was taken (false = no room). */
  private collectPickup(pk: Pickup): boolean {
    const d = pk.drop;
    const p = this.player;
    switch (d.type) {
      case 'coins':
        this.supplies.coins += d.amount;
        this.runCoinsEarned += d.amount;
        this.hud.addFeed(`+${d.amount.toLocaleString('en-US')} coins`);
        this.sfx.pickup('coins');
        return true;
      case 'ammo': {
        const gun = p.guns.find((g) => g.def.id === d.weapon);
        if (!gun || !p.has(gun.def.id)) return true; // no longer carrying that gun: the box is just wasted
        const max = gun.stats.spareAmmo;
        if (gun.reserve >= max) return false; // full: leave it for later
        const added = Math.min(d.amount, max - gun.reserve);
        gun.reserve += added;
        this.hud.addFeed(`+${added} ${gun.def.name} ammo`);
        this.sfx.pickup('ammo');
        return true;
      }
      case 'herb':
      case 'spray':
      case 'treasure':
      case 'grenade': {
        const kind = d.type === 'herb' ? 'herb' : d.type === 'spray' ? 'spray' : d.type === 'treasure' ? 'treasure' : 'grenade';
        const key = d.type === 'herb' ? d.herb : d.type === 'spray' ? 'spray' : d.type === 'treasure' ? d.treasure : d.grenade;
        const item = this.supplies.addNew(kind, key);
        if (!item) {
          if (this.noRoomTimer <= 0) {
            this.hud.addFeed('No room in your case', 'bad');
            this.noRoomTimer = 2;
          }
          return false;
        }
        this.hud.addFeed(`${itemDef(item).name}`);
        this.sfx.pickup(d.type === 'treasure' ? 'treasure' : d.type === 'grenade' ? 'grenade' : d.type === 'spray' ? 'spray' : 'herb');
        return true;
      }
      case 'orb':
        return true;
    }
  }

  private setupCrates(): void {
    this.crates = [];
    this.world.level.root.traverse((o) => {
      if (!o.userData.crate) return;
      this.crates.push({ mesh: o, collider: (o.userData.collider as Collider | undefined) ?? null, broken: false });
    });
  }

  private restoreCrates(): void {
    for (const c of this.crates) {
      c.mesh.visible = true;
      c.broken = false;
      if (c.collider && !this.world.level.colliders.includes(c.collider)) this.world.level.colliders.push(c.collider);
    }
    this.crates = [];
  }

  private crateFor(obj: Object3D): Crate | null {
    return this.crates.find((c) => c.mesh === obj && !c.broken) ?? null;
  }

  /** A crate smashes: splinters, a crash, maybe something inside, and whatever sat on top falls too. */
  private breakCrate(c: Crate): void {
    if (c.broken) return;
    c.broken = true;
    c.mesh.visible = false;
    this.world.disabled.add(c.mesh);
    const cols = this.world.level.colliders;
    if (c.collider && cols.includes(c.collider)) cols.splice(cols.indexOf(c.collider), 1);
    this.horde.refreshObstacles();
    const at = c.mesh.getWorldPosition(new Vector3());
    this.fx.surfaceImpact(at, UP, 'wood', 3);
    this.fx.surfaceImpact(at.clone().add(tmp.set(0.2, 0.2, 0)), UP, 'wood', 2);
    this.sfx.crateBreak(at);
    if (this.modeId !== 'range') this.dropAt(at, 1, 1.5, tuning.drops.crateChance);
    // Anything stacked on top comes down with it.
    for (const other of this.crates) {
      if (other.broken || other === c) continue;
      const o = other.mesh.getWorldPosition(new Vector3());
      if (o.y > at.y + 0.3 && Math.hypot(o.x - at.x, o.z - at.z) < 0.9) this.breakCrate(other);
    }
  }

  // ---------------------------------------------------------------------------
  // Survival: waves

  private survivalTick(dt: number): void {
    if (this.modeId !== 'survival' && this.modeId !== 'score') return;
    const alive = this.zombies.filter((z) => z.alive).length;
    const u = this.waves.update(dt, alive);
    if (u.started) {
      this.hud.flashBanner(`WAVE ${this.waves.wave}`, 'gore');
      this.sfx.waveStart();
    }
    for (const kind of u.spawn) this.spawnWaveZombie(kind);
    if (u.cleared) {
      const bonus = tuning.waves.bonusPerWave * this.waves.wave;
      this.supplies.coins += bonus;
      this.runCoinsEarned += bonus;
      this.hud.flashBanner('WAVE CLEARED');
      this.hud.addFeed(`Wave cleared! +${bonus.toLocaleString('en-US')} coins`);
      this.sfx.waveClear();
    }
    const elite = this.elites.check(this.runKills);
    if (elite) {
      this.spawnWaveZombie(elite);
      this.hud.flashBanner('SOMETHING HEAVY IS COMING', 'gore');
      this.sfx.eliteSting();
    }
    const open = this.hasTrader();
    if (open && !this.traderWasOpen) {
      this.hud.flashBanner('THE TRADER IS OPEN');
      this.sfx.traderArrives();
    }
    this.traderWasOpen = open;
  }

  /** Is the Trader's stall open for business? (Added in Phase 5.) */
  private hasTrader(): boolean {
    return this.modeId === 'survival' && this.waves.state === 'intermission' && !!this.world.level.trader && !this.player.dead;
  }

  // ---------------------------------------------------------------------------
  // The case and the Trader's menu

  private openUi(which: 'case' | 'trader'): void {
    if (this.ui || this.paused || !this.mode || this.player.dead) return;
    this.ui = which;
    this.hud.visible = false;
    this.releasingMouse = true;
    this.input.unlockPointer();
    this.controls.clear();
    this.sfx.caseToggle(true);
  }

  private openCase(): void {
    if (this.ui === 'trader') {
      this.traderScreen.hide();
      this.traderReopen = true;
    } else {
      this.traderReopen = false;
      this.openUi('case');
    }
    if (this.ui === null) return;
    this.ui = 'case';
    this.caseScreen.show(this.caseHost());
  }

  private openTrader(): void {
    this.openUi('trader');
    if (this.ui !== 'trader') return;
    this.traderScreen.show(this.traderHost());
  }

  private closeUi(): void {
    const was = this.ui;
    if (!was) return;
    if (was === 'case' && this.hasTrader() && this.traderReopen) {
      this.traderReopen = false;
      this.caseScreen.hide();
      this.ui = 'trader';
      this.traderScreen.show(this.traderHost(), false);
      return;
    }
    this.ui = null;
    this.caseScreen.hide();
    this.traderScreen.hide();
    this.hud.visible = true;
    this.controls.clear();
    this.clock.reset();
    this.sfx.caseToggle(false);
    if (!this.autotest) this.input.lockPointer();
  }

  private traderReopen = false;
  private pendingTrader = false;

  private traderHost(): TraderUiHost {
    return {
      trader: this.trader,
      supplies: this.supplies,
      upgrades: weaponUpgrades,
      ownedWeapons: () => this.supplies.items.filter((i) => i.kind === 'weapon').map((i) => ({ id: i.key, name: WEAPONS.find((w) => w.id === i.key)?.name ?? i.key })),
      knifeCondition: () => this.player.knife.condition,
      padType: () => (this.pad.connected ? this.pad.type : null),
      sound: (k) => (k === 'buy' ? this.sfx.uiBuy() : k === 'no' ? this.sfx.uiDeny() : this.sfx.uiClick()),
    };
  }

  private caseHost(): CaseHost {
    return {
      supplies: this.supplies,
      padType: () => (this.pad.connected ? this.pad.type : null),
      weaponLines: (item) => {
        const def = WEAPONS.find((w) => w.id === item.key);
        const lines = UPGRADE_STATS.map((st) => `${STAT_NAMES[st]}: ${weaponUpgrades.level(item.key, st)}/${weaponUpgrades.maxLevel(item.key)}`);
        if (weaponUpgrades.hasExclusive(item.key)) lines.push(`\u2605 ${EXCLUSIVES[item.key]?.name}`);
        const fitted = weaponUpgrades.attachmentsOf(item.key);
        if (fitted.length) lines.push(`Fitted: ${fitted.join(', ')}`);
        void def;
        return lines;
      },
      use: (item) => {
        const effect = item.kind === 'spray' ? { heal: 'full' as const, raiseMax: tuning.health.sprayRaisesMax } : herbEffect(item.key);
        if (!effect) return null;
        if (this.health.fraction >= 1 && effect.raiseMax <= 0) return 'Your health is already full.';
        this.health.apply(effect);
        this.supplies.remove(item.id);
        this.sfx.healed();
        return 'Health restored.';
      },
      discard: (item) => {
        if (item.kind === 'weapon' && this.supplies.items.filter((i) => i.kind === 'weapon').length <= 1) return null;
        this.supplies.remove(item.id);
        if (item.kind === 'weapon') this.player.take(item.key as 'pistol');
        return `Threw away ${itemDef(item).name}.`;
      },
      attach: (att, weapon) => {
        const def = WEAPONS.find((w) => w.id === weapon.key);
        if (!def) return null;
        const ok = weaponUpgrades.attach({ id: def.id, hold: def.hold, reload: def.reload, projectile: def.projectile }, att.key);
        if (!ok) return null;
        this.supplies.remove(att.id);
        return `Fitted to ${def.name}.`;
      },
    };
  }

  /** Screen position for the Trader's marker, kept inside the screen edges. */
  private updateTraderMarker(): void {
    const t = this.world.level.trader;
    if (!t || !this.hasTrader() || this.ui) {
      this.traderNpc.visible = this.hasTrader();
      this.hud.setTraderMarker(null, '', '', false);
      return;
    }
    this.traderNpc.visible = true;
    const dist = Math.hypot(t.customerX - this.player.position.x, t.customerZ - this.player.position.z);
    const near = dist < tuning.trader.talkRange;
    tmp.set(t.x, this.world.groundHeight(t.x, t.z) + 2.4, t.z).project(this.camera);
    const behind = tmp.z > 1;
    let x = (tmp.x * (behind ? -1 : 1) + 1) / 2;
    let y = (1 - tmp.y * (behind ? -1 : 1)) / 2;
    x = MathUtils.clamp(x, 0.06, 0.94);
    y = MathUtils.clamp(y, 0.1, 0.9);
    const padType = this.pad.connected && this.controls.lastDevice === 'gamepad' ? this.pad.type : null;
    this.hud.setTraderMarker({ x: x * window.innerWidth, y: y * window.innerHeight }, padType ? padButtonName(PAD.south, padType) : 'E', near ? 'Trade' : `Trader \u00B7 ${Math.round(dist)} m`, near);
  }

  private survivalInfo(): string {
    const w = this.waves;
    const alive = this.zombies.filter((z) => z.alive).length;
    let status: string;
    if (w.state === 'countdown') status = `Wave ${w.wave} in ${Math.ceil(w.timer)}`;
    else if (w.state === 'intermission') status = `Wave ${w.wave} cleared &middot; next wave in ${Math.ceil(w.timer)}`;
    else status = `${w.remaining(alive)} zombies left`;
    return `<b>WAVE ${w.wave}</b> &middot; ${status} &middot; Kills ${this.runKills}` + (this.stats.lastHit ? `<br><span class="last-hit">${this.stats.lastHit}</span>` : '');
  }

  // ---------------------------------------------------------------------------
  // Melee: the prompt, the moves and what they do

  /** Finds the stunned zombie (if any) the melee prompt should show over. */
  private computeMeleeOption(): void {
    this.meleeOption = null;
    const p = this.player;
    if (p.busy || p.stunTime > 0 || p.quickTurnTime > 0) return;
    const camFwd = tmp2.set(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    const candidates = this.zombies
      .filter((z) => z.alive && z.openTo !== null)
      .map((z) => {
        const to = z.bodyCenter(new Vector3()).sub(p.position).setY(0);
        return {
          zombie: z,
          openTo: z.openTo,
          distance: to.length(),
          angleOff: MathUtils.radToDeg(angleBetweenFlat(to, camFwd)),
          facingAway: z.facingAwayFrom(p.position),
        };
      });
    const pick = pickMeleeTarget(candidates, tuning.melee.range, tuning.melee.promptAngle);
    if (pick) this.meleeOption = { zombie: pick.target.zombie, move: pick.move };
  }

  private startMelee(): void {
    const opt = this.meleeOption;
    if (!opt) return;
    const { zombie: z, move } = opt;
    const p = this.player;
    const center = z.bodyCenter(new Vector3());
    const anchor = new Vector3();
    let face = p.yaw;
    if (move === 'suplex') {
      // Step in right behind it, facing the same way.
      z.forward(tmp);
      anchor.copy(z.position).addScaledVector(tmp, -0.42);
      face = z.yaw;
    } else if (move === 'finisher') {
      // Kneel beside the body, on whichever side you're on.
      z.forward(tmp);
      const side = tmp2.set(-tmp.z, 0, tmp.x);
      if (side.dot(tmp3.subVectors(p.position, center)) < 0) side.negate();
      anchor.copy(center).addScaledVector(side, 0.62);
      const to = tmp3.subVectors(center, anchor).setY(0);
      face = Math.atan2(-to.x, -to.z);
    } else {
      const to = tmp.subVectors(center, p.position).setY(0);
      const d = Math.max(0.01, to.length());
      to.divideScalar(d);
      anchor.copy(center).addScaledVector(to, -(move === 'roundhouse' ? 1.05 : 0.95));
      face = Math.atan2(-to.x, -to.z);
    }
    anchor.y = this.world.groundHeight(anchor.x, anchor.z);
    p.startMelee(move, anchor, face);
    this.meleeTarget = z;
    this.meleeOption = null;
  }

  private meleeEvent(move: MeleeMove, phase: MeleePhase): void {
    const z = this.meleeTarget;
    const p = this.player;
    const m = tuning.melee;
    if (phase === 'end') {
      if (z && z.state === 'carried') this.landSuplex(z);
      this.meleeTarget = null;
      return;
    }
    if (!z) return;
    const dir = tmp3.subVectors(z.position, p.position).setY(0).normalize();
    const land = (damage: number, zone: Zone, push: number): HitResult => {
      const result = resolveShot([{ zone, damage, knockback: push }], z.targetState, 1, tuning);
      z.applyHit(result, dir.clone(), this.sfx, this.zombieHost);
      return result;
    };
    const feel = () => {
      this.hitStop = Math.max(this.hitStop, m.hitStop);
      this.cam.shake(m.shake);
    };

    if (move === 'roundhouse' && phase === 'impact') {
      const r = land(m.kickDamage, 'torso', 5);
      this.sfx.kick(z.chestPosition(tmp));
      feel();
      // The sweep knocks down everyone close by.
      let swept = 0;
      for (const other of this.zombies) {
        if (other === z || !other.alive || other.state === 'carried' || other.state === 'grabbing') continue;
        const to = other.chestPosition(tmp).sub(p.position).setY(0);
        if (to.length() > m.kickRadius) continue;
        const res = resolveShot([{ zone: 'torso', damage: m.kickSplashDamage, knockback: 5 }], other.targetState, 1, tuning);
        other.applyHit(res, to.normalize(), this.sfx, this.zombieHost);
        swept++;
      }
      this.stats.lastHit = `ROUNDHOUSE KICK · ${Math.round(r.damage)} damage · ${r.killed ? 'KILLED' : 'KNOCKED DOWN'}${swept ? ` (+${swept} more knocked down)` : ''}`;
    } else if (move === 'frontKick' && phase === 'impact' && z.hasShield) {
      // A kick smashes the shield out of its hands and rocks it back.
      this.breakShieldOf(z, dir);
      this.sfx.kick(z.chestPosition(tmp));
      feel();
      const r = land(m.frontKickDamage * 0.4, 'torso', 2.5);
      z.stun(tuning.reactions.headStaggerTime);
      this.stats.lastHit = `KICKED THE SHIELD APART · ${Math.round(r.damage)} damage`;
    } else if (move === 'frontKick' && phase === 'impact') {
      const r = land(m.frontKickDamage, 'torso', 5);
      this.sfx.kick(z.chestPosition(tmp));
      feel();
      this.stats.lastHit = `FRONT KICK · ${Math.round(r.damage)} damage · ${r.killed ? 'KILLED' : 'KNOCKED DOWN'}`;
    } else if (move === 'suplex' && phase === 'grab') {
      z.beginCarry();
      this.sfx.grunt(z.chestPosition(tmp), z.voicePitch);
    } else if (move === 'suplex' && phase === 'slam') {
      // Head first into the ground. Damage now; it lands properly at "release".
      const r = resolveShot([{ zone: 'torso', damage: m.suplexDamage, knockback: 0 }], { ...z.targetState, downed: true }, 1, tuning);
      z.health = r.healthAfter;
      const head = z.headPosition(tmp);
      head.y = Math.max(head.y, this.world.groundHeight(head.x, head.z) + 0.1);
      this.sfx.slam(head);
      this.fx.blood(head, UP, 1.3 * bloodScale(), this.world.groundHeight(head.x, head.z));
      feel();
      this.cam.shake(m.shake * 0.8);
      this.stats.lastHit = `SUPLEX · ${Math.round(r.damage)} damage · ${r.killed ? 'KILLED' : 'slammed down'}`;
    } else if (move === 'suplex' && phase === 'release') {
      this.landSuplex(z);
    } else if (move === 'finisher' && phase === 'impact') {
      const r = land(m.finisherDamage, 'torso', 0);
      p.knife.wear(tuning.knife.finisherCost, tuning.knife.unbreakable);
      const at = z.headPosition(tmp);
      this.sfx.knifeHit(at, true);
      this.fx.blood(at, UP, 1.4 * bloodScale(), this.world.groundHeight(at.x, at.z));
      feel();
      this.stats.lastHit = `KNIFE FINISHER · ${r.killed ? 'KILLED' : `${Math.round(r.damage)} damage`}`;
    }
  }

  /**
   * Where the suplexed body is during the throw: lifted at the waist, swung
   * backwards over the player's head, then slammed down head first behind.
   */
  private updateCarry(): void {
    const z = this.meleeTarget;
    const p = this.player;
    if (!z || p.melee !== 'suplex' || z.state !== 'carried') return;
    const u = p.meleeProgress;
    const theta = u < 0.1 ? 0 : u < 0.5 ? Math.PI * smoothstep((u - 0.1) / 0.4) : Math.PI + (Math.PI - 1.5) * smoothstep((u - 0.5) / 0.22);
    const { pos, quat } = this.carryPose(theta, z);
    z.setCarryTransform(pos, quat);
  }

  private carryPose(theta: number, z: Zombie): { pos: Vector3; quat: Quaternion } {
    const p = this.player;
    const f = p.forward(new Vector3());
    const scale = z.object.scale.x;
    const hip = 0.95 * scale;
    const headUp = 0.75 * scale;
    const chest = new Vector3(p.position.x, p.position.y + 1.05, p.position.z).addScaledVector(f, 0.1);
    qYaw.setFromAxisAngle(UP, p.yaw);
    qPitch.setFromAxisAngle(X_AXIS, theta);
    const quat = qYaw.clone().multiply(qPitch);
    const pos = new Vector3();
    if (theta <= Math.PI) {
      const hips = chest.clone().addScaledVector(f, 0.29 * Math.cos(theta)).addScaledVector(UP, 0.45 * Math.sin(theta));
      pos.copy(hips).sub(tmp.set(0, hip, 0).applyQuaternion(quat));
    } else {
      const head = chest.clone().addScaledVector(f, -0.29).addScaledVector(UP, -headUp);
      head.y = Math.max(head.y, this.world.groundHeight(head.x, head.z) + 0.1);
      pos.copy(head).sub(tmp.set(0, hip + headUp, 0).applyQuaternion(quat));
    }
    return { pos, quat };
  }

  private landSuplex(z: Zombie): void {
    if (z.state !== 'carried') return;
    const { pos } = this.carryPose(Math.PI * 2 - 1.5, z);
    pos.y = this.world.groundHeight(pos.x, pos.z);
    z.endCarry(pos, this.player.yaw);
    this.sfx.bodyFall(pos);
  }

  /** The knife reaches out: cuts whoever is in front, close enough. */
  private knifeSlash(): void {
    this.sfx.knifeSwish();
    const p = this.player;
    const fwd = p.forward(new Vector3());
    let hits = 0;
    for (const z of this.zombies) {
      if (!z.alive || hits >= 2 || z.state === 'carried') continue;
      const c = z.bodyCenter(new Vector3());
      const to = tmp.subVectors(c, p.position).setY(0);
      if (to.length() > tuning.knife.range + 0.3) continue;
      if (MathUtils.radToDeg(Math.abs(angleBetweenFlat(to, fwd))) > tuning.knife.arc) continue;
      const zone: Zone = z.lying ? 'head' : 'torso';
      const result = resolveShot([{ zone, damage: tuning.knife.damage, knockback: 0.3 }], z.targetState, 1, tuning);
      z.applyHit(result, to.clone().normalize(), this.sfx, this.zombieHost);
      this.sfx.knifeHit(c);
      this.fx.blood(c, to.normalize(), 0.7 * bloodScale(), this.world.groundHeight(c.x, c.z));
      this.hud.hitMarker(zoneGroup(zone), result.killed, tuning.feel.hitMarkerTime);
      this.stats.lastHit = `KNIFE · ${Math.round(result.damage)} damage · ${result.killed ? 'KILLED' : result.reaction === 'none' ? 'cut' : 'flinched'}`;
      hits++;
    }
  }

  // ---------------------------------------------------------------------------
  // Gore

  /** Head bursts and torn-off limbs from a hit (after the zombie has reacted). */
  private applyGore(z: Zombie, result: HitResult, dir: Vector3): void {
    const level = goreLevel();
    if ((result.headPop || result.mutate) && !z.headless) {
      const skin = z.skin;
      const at = level === 'off' ? z.headPosition(new Vector3()) : z.popHead(new Vector3());
      this.sfx.headBurst(at);
      if (level !== 'off') {
        this.gore.burstHead(at, dir, skin, this.world.groundHeight(at.x, at.z));
        this.gore.spurt(z.rig.joints.neck, new Vector3(0, 0.1, 0), UP, 1);
      }
      this.hitStop = Math.max(this.hitStop, tuning.feel.hitStopKill * 1.4);
      this.cam.shake(tuning.feel.shakeHeadshot * 2);
      if (result.crit) this.hud.flashBanner('CRITICAL!', 'gore');
    }
    if (result.mutate) {
      this.hud.flashBanner('PARASITE!', 'gore');
      this.cam.shake(0.3);
    }
    if (level === 'off') return;
    for (const s of result.severed) this.tearOff(z, s.zone, s.segment, dir, 1);
  }

  /** Rips an arm or leg off and sends it flying, with blood pumping from both ends. */
  private tearOff(z: Zombie, zone: LimbZone, segment: LimbSegment, dir: Vector3, force: number): void {
    const limb = z.sever(zone, segment);
    if (!limb) return;
    const parent = limb.parent!;
    const offset = limb.position.clone();
    const arm = zone.startsWith('arm');
    const side = zone.endsWith('L') ? -1 : 1;
    // Blood from the stump on the body: out to the side for a shoulder, down for the rest.
    const stumpDir = arm && segment === 'upper' ? new Vector3(side, -0.3, 0) : new Vector3(0, -1, 0);
    this.gore.spurt(parent, offset, stumpDir, 0.8);
    const vel = dir.clone().setY(0).normalize().multiplyScalar((2 + Math.random() * 2) * force);
    vel.y += (1.5 + Math.random() * 1.5) * force;
    const spin = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18 * force);
    this.gore.fling(limb, vel, spin);
    this.gore.spurt(limb, new Vector3(0, 0, 0), UP, 0.4);
    const at = limb.getWorldPosition(new Vector3());
    this.sfx.limbTear(at);
    this.fx.blood(at, dir, 1.2 * bloodScale(), this.world.groundHeight(at.x, at.z));
  }

  /** Blown apart: every body part flies out from the blast. */
  private gibZombie(z: Zombie, from: Vector3): void {
    const center = z.bodyCenter(new Vector3());
    for (const part of [...z.parts]) {
      delete part.userData.zombie;
      const out = part.getWorldPosition(new Vector3()).sub(from);
      out.y = Math.max(0.2, out.y);
      out.normalize();
      const vel = out.multiplyScalar(5 + Math.random() * 5);
      vel.y += 2 + Math.random() * 4;
      const spin = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(25);
      this.gore.fling(part, vel, spin);
    }
    this.gore.burstBody(center, this.world.groundHeight(center.x, center.z));
    z.gib();
  }

  // ---------------------------------------------------------------------------
  // Rockets, explosions and barrels

  private launchRocket(): void {
    const aim = this.computeAim();
    this.player.muzzleWorld(muzzlePos);
    const dir = new Vector3().subVectors(aim.point, muzzlePos).normalize();
    const mesh = new Group();
    const body = new Mesh(new CylinderGeometry(0.045, 0.045, 0.32, 10), rocketBody);
    body.rotation.x = Math.PI / 2;
    const nose = new Mesh(new ConeGeometry(0.045, 0.15, 10), rocketBody);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.23;
    const flame = new Mesh(new ConeGeometry(0.04, 0.18, 8), rocketFlame);
    flame.rotation.x = Math.PI / 2;
    flame.position.z = 0.25;
    mesh.add(body, nose, flame);
    mesh.traverse((o) => (o.raycast = () => {}));
    mesh.position.copy(muzzlePos);
    mesh.quaternion.setFromUnitVectors(tmp.set(0, 0, -1), dir);
    this.scene.add(mesh);
    this.rockets.push({ mesh, pos: muzzlePos.clone(), dir, travelled: 0 });
    this.fx.muzzleFlash(muzzlePos, dir, 2.2);
    // Back-blast: smoke out of the rear of the tube.
    this.player.ejectionWorld(tmp);
    for (let i = 0; i < 6; i++) this.fx.rocketTrail(tmp, dir.clone().multiplyScalar(-2));
    this.sfx.shot('rocket');
    this.cam.shake(tuning.feel.shakeShot * 3);
  }

  private updateRockets(dt: number): void {
    const e = tuning.explosion;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const step = e.rocketSpeed * dt;
      const wall = this.world.raycast(r.pos, r.dir, step);
      const zh = this.castZombies(r.pos, r.dir, wall ? wall.distance : step);
      let boomAt: Vector3 | null = null;
      let direct: Zombie | null = null;
      if (zh.length) {
        boomAt = zh[0].point.clone();
        direct = zh[0].object.userData.zombie as Zombie;
      } else if (wall) {
        boomAt = wall.point.clone().addScaledVector(wall.normal, 0.15);
        const barrel = this.barrelFor(wall.object);
        if (barrel && !barrel.exploded) barrel.fuse = 0;
        const crate = this.crateFor(wall.object);
        if (crate) this.breakCrate(crate);
      } else {
        r.pos.addScaledVector(r.dir, step);
        r.travelled += step;
        if (r.travelled > this.player.guns.find((g) => g.def.projectile)!.stats.maxRange) boomAt = r.pos.clone();
      }
      if (boomAt) {
        disposeObject(r.mesh);
        this.rockets.splice(i, 1);
        this.explode(boomAt, direct);
        continue;
      }
      r.mesh.position.copy(r.pos);
      this.fx.rocketTrail(tmp.copy(r.pos).addScaledVector(r.dir, -0.25), r.dir);
    }
  }

  /** The blast of a rocket or barrel, from the tuning numbers. */
  private rocketBlast(): BlastSpec {
    const e = tuning.explosion;
    return { radius: e.radius, damage: e.damage, gibRadius: e.gibRadius, limbRadius: e.limbRadius, push: e.push, playerDamage: e.playerDamage, playerPush: e.playerPush, size: 1 };
  }

  /** A blast: damages, throws, dismembers or blows apart everything nearby. */
  private explode(at: Vector3, direct: Zombie | null = null, big = true, spec: BlastSpec = this.rocketBlast()): void {
    const e = tuning.explosion;
    const ground = this.world.groundHeight(at.x, at.z);
    this.fx.explosion(at, ground, (big ? 1 : 0.8) * spec.size);
    this.sfx.explosion(at, big);
    const playerDist = tmp.set(this.player.position.x, this.player.position.y + 1, this.player.position.z).distanceTo(at);
    this.cam.shake(e.shake * MathUtils.clamp(1 - playerDist / (spec.radius * 4), 0.15, 1));
    this.hitStop = Math.max(this.hitStop, e.hitStop);
    const gore = goreLevel();
    let killed = 0;
    for (const z of this.zombies) {
      if (z.gibbed) continue;
      const center = z.bodyCenter(new Vector3());
      const d = center.distanceTo(at);
      if (d > spec.radius) continue;
      // Solid walls shelter whatever is behind them.
      const to = tmp2.subVectors(center, at);
      const wall = this.world.raycast(at, to.clone().normalize(), Math.max(0, d - 0.3));
      if (wall && !this.barrelFor(wall.object)) continue;
      const dir = to.setY(Math.max(0.1, to.y)).normalize();
      if (!z.alive) {
        if (gore !== 'off' && d < spec.gibRadius) this.gibZombie(z, at);
        continue;
      }
      const k = blastFalloff(d, spec.radius);
      const elite = isElite(z.kind);
      if (gore !== 'off' && !z.invincible && !elite && (d < spec.gibRadius || z === direct)) {
        z.health = 0;
        z.parasiteHealth = 0;
        const res = resolveShot([{ zone: 'torso', damage: 1e6, knockback: 0 }], z.targetState, 0, tuning);
        z.applyHit(res, dir, this.sfx, this.zombieHost);
        this.gibZombie(z, at);
        killed++;
        continue;
      }
      const damage = spec.damage * k + (z === direct ? tuning.rocket.damage : 0);
      const push = spec.push * (0.4 + 0.6 * k);
      const result = resolveShot([{ zone: 'torso', damage, knockback: Math.max(push, tuning.reactions.knockdownThreshold) }], z.targetState, 0, tuning, Math.random, { explosive: true });
      // Arms and legs may come off close to the blast.
      if (gore !== 'off' && !z.invincible && !elite && d < spec.limbRadius) {
        const chance = 0.65 * (1 - d / spec.limbRadius);
        for (const limb of ['armL', 'armR', 'legL', 'legR'] as LimbZone[]) {
          if (!z.missing.has(limb) && Math.random() < chance) result.severed.push({ zone: limb, segment: Math.random() < 0.5 ? 'upper' : 'lower' });
        }
        if (!result.killed && result.severed.some((s) => isLimb(s.zone) && s.zone.startsWith('leg')) && !z.crawler) result.reaction = 'legless';
      }
      z.applyHit(result, dir, this.sfx, this.zombieHost);
      for (const s of result.severed) this.tearOff(z, s.zone, s.segment, dir, 1.6);
      if (result.killed) killed++;
    }
    if (killed) this.stats.lastHit = `EXPLOSION · ${killed} killed`;

    // Crates close to the blast are smashed.
    for (const c of this.crates) {
      if (c.broken) continue;
      if (c.mesh.getWorldPosition(tmp2).distanceTo(at) < spec.radius * 0.6) this.breakCrate(c);
    }
    // Nearby barrels catch the blast and go off a moment later.
    for (const b of this.barrels) {
      if (b.exploded || b.fuse >= 0) continue;
      if (b.group.position.distanceTo(tmp.set(at.x, b.group.position.y, at.z)) < spec.radius * 0.7) b.fuse = e.barrelChainDelay;
    }
    // Other things in the air near the blast go off too.
    for (const t of [...this.thrown.items]) {
      if (t.pos.distanceTo(at) < spec.radius * 0.5 && t.type !== 'axe' && t.type !== 'fire') {
        t.fuse = Math.min(t.fuse < 0 ? 0.15 : t.fuse, 0.15);
      }
    }
    // Too close for comfort: hurt and shoved.
    if (playerDist < spec.radius * 0.8 && !this.player.invulnerable) {
      const near = 1 - playerDist / (spec.radius * 0.8);
      this.damagePlayer(spec.playerDamage * near, at, spec.playerPush * near);
    }
  }

  private setupBarrels(): void {
    this.barrels = [];
    this.world.level.root.traverse((o) => {
      if (!o.userData.barrel) return;
      const meshes: Object3D[] = [];
      o.traverse((c) => {
        if ((c as Mesh).isMesh) meshes.push(c);
      });
      const collider =
        this.world.level.colliders.find((c) => c.tag === 'explosive' && Math.hypot(c.x - o.position.x, c.z - o.position.z) < 0.05) ?? null;
      this.barrels.push({ group: o, collider, meshes, exploded: false, fuse: -1 });
    });
  }

  /** Puts blown-up barrels back for a new round. */
  private restoreBarrels(): void {
    for (const b of this.barrels) {
      b.group.visible = true;
      if (b.collider && !this.world.level.colliders.includes(b.collider)) this.world.level.colliders.push(b.collider);
    }
    this.barrels = [];
  }

  private barrelFor(obj: Object3D): Barrel | null {
    if (!tuning.explosion.barrels) return null;
    return this.barrels.find((b) => b.meshes.includes(obj)) ?? null;
  }

  private updateBarrels(dt: number): void {
    for (const b of this.barrels) {
      if (b.exploded || b.fuse < 0) continue;
      b.fuse -= dt;
      if (b.fuse > 0) continue;
      b.exploded = true;
      b.group.visible = false;
      for (const m of b.meshes) this.world.disabled.add(m);
      const cols = this.world.level.colliders;
      if (b.collider && cols.includes(b.collider)) cols.splice(cols.indexOf(b.collider), 1);
      this.explode(b.group.position.clone().setY(b.group.position.y + 0.55));
    }
  }

  // ---------------------------------------------------------------------------
  // Shooting

  /** Chance a destroyed head lets a parasite out (rises with the wave). */
  private mutateChance(): number {
    if (this.modeId !== 'survival' && this.modeId !== 'score') return 0;
    if (goreLevel() === 'off') return 0;
    const p = tuning.parasite;
    return Math.min(p.maxChance, p.baseChance + p.chancePerWave * Math.max(0, this.waves.wave - 1));
  }

  /** A bullet hits something in the air. */
  private shootDown(t: Thrown): void {
    if (t.type === 'axe') {
      this.sfx.axeThunk(t.pos, false);
      this.fx.parrySpark(t.pos, false);
      this.thrown.remove(t);
      return;
    }
    // A grenade or lit dynamite shot in the air goes off where it is.
    this.thrown.remove(t);
    this.detonateThrown(t);
  }

  /** The shield splinters and drops away in pieces. */
  private breakShieldOf(z: Zombie, dir: Vector3): void {
    const shield = z.breakShield();
    if (!shield) return;
    const at = shield.getWorldPosition(new Vector3());
    this.sfx.shieldHit(at, true);
    this.fx.surfaceImpact(at, UP, 'wood', 3);
    const vel = dir.clone().setY(0).normalize().multiplyScalar(2.5 + Math.random() * 2);
    vel.y += 2.5;
    this.gore.fling(shield, vel, new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(12));
  }

  private zombieParts(): Mesh[] {
    const parts: Mesh[] = [];
    for (const z of this.zombies) parts.push(...z.parts);
    return parts;
  }

  private castZombies(origin: Vector3, dir: Vector3, far: number): Intersection[] {
    this.raycaster.set(origin, dir);
    this.raycaster.near = 0;
    this.raycaster.far = far;
    return this.raycaster.intersectObjects(this.zombieParts(), false);
  }

  /** Where the camera's aim lands right now (this is what the laser dot and arms point at). */
  private computeAim(): AimResult {
    const dir = this.player.laserDirection(this.cam, this.aim.direction);
    const camPos = this.cam.eye;
    // Start the ray level with the player so nothing behind them gets in the way.
    tmp.set(this.player.position.x, this.player.position.y + 1.5, this.player.position.z).sub(camPos);
    const start = tmp2.copy(camPos).addScaledVector(dir, Math.max(0, tmp.dot(dir)));
    const range = this.player.stats.maxRange;
    const wall = this.world.raycast(start, dir, range);
    const zHits = this.castZombies(start, dir, wall ? wall.distance : range);
    if (zHits.length) this.aim.point.copy(zHits[0].point);
    else if (wall) this.aim.point.copy(wall.point);
    else this.aim.point.copy(start).addScaledVector(dir, range);
    return this.aim;
  }

  private fireShot(): void {
    this.stats.shots++;
    const def = this.player.def;
    if (def.projectile) {
      this.launchRocket();
      return;
    }
    const gun = this.player.stats;
    // Gunfire carries: every zombie in earshot comes looking.
    this.horde.alertAround(this.zombies, this.player.position, tuning.ai.gunshotRange);
    const aim = this.computeAim();
    this.player.muzzleWorld(muzzlePos);
    const scoped = this.player.scoped;
    // Through the scope the bullet leaves from the eye, so it lands exactly on the crosshair.
    const origin = scoped ? this.cam.eye : muzzlePos;
    const baseDir = new Vector3().subVectors(aim.point, origin).normalize();
    const shotgun = gun.pellets > 1;
    const heavy = def.id === 'rifle' || def.id === 'magnum';

    if (!scoped) this.fx.muzzleFlash(muzzlePos, baseDir, shotgun ? 1.8 : heavy ? 1.6 : def.id === 'smg' ? 0.8 : 1);
    this.sfx.shot(def.sound);
    this.cam.shake(tuning.feel.shakeShot * (shotgun ? 2.2 : heavy ? 2 : def.id === 'smg' ? 0.5 : 1));

    // Trace every bullet / pellet. Pellets fan out in a cone.
    const goreOn = goreLevel() !== 'off';
    const perZombie = new Map<Zombie, { pellets: PelletHit[]; points: Vector3[]; dir: Vector3 }>();
    let shieldNote = '';
    let shotDown = false;
    const corpseHits: Array<{ point: Vector3; dir: Vector3 }> = [];
    let wallSound = false;
    const dir = new Vector3();
    for (let i = 0; i < gun.pellets; i++) {
      randomInCone(baseDir, shotgun ? gun.pelletSpread : 0, dir);
      const wall = this.world.raycast(origin, dir, gun.maxRange);
      const stopAt = wall ? wall.distance : gun.maxRange;
      const hits = this.castZombies(origin, dir, stopAt);
      // An axe or a grenade in the air can be shot down.
      const aloft = this.thrown.shotAt(origin, dir, Math.min(stopAt, hits.length ? hits[0].distance : stopAt));
      if (aloft) {
        shotDown = true;
        this.shootDown(aloft.item);
        continue;
      }
      const passed = new Set<Zombie>();
      let stopped = false;
      for (const h of hits) {
        const z = h.object.userData.zombie as Zombie | undefined;
        if (!z || passed.has(z)) continue;
        passed.add(z);
        if (!z.alive) {
          corpseHits.push({ point: h.point.clone(), dir: dir.clone() });
          stopped = true;
          break;
        }
        const k = falloff(h.distance, gun.falloffStart, gun.falloffEnd, gun.falloffMin);
        let entry = perZombie.get(z);
        if (!entry) {
          entry = { pellets: [], points: [], dir: new Vector3() };
          perZombie.set(z, entry);
        }
        const joint = h.object.parent?.name ?? '';
        if (h.object.userData.zone === 'shield') {
          // The shield soaks it up. If that was the last of it, the planks fly apart.
          const broke = z.shieldHit(gun.damage * k);
          this.fx.surfaceImpact(h.point, tmp.copy(dir).negate(), 'wood', 0.7);
          this.sfx.shieldHit(h.point, broke);
          entry.pellets.push({ zone: 'shield', damage: 0, knockback: 0 });
          entry.points.push(h.point.clone());
          entry.dir.add(dir);
          if (broke) {
            this.breakShieldOf(z, dir);
            shieldNote = 'SHIELD BROKEN';
          } else if (z.shield) {
            shieldNote = `SHIELD · ${Math.max(0, Math.round((z.shield.hp / z.shield.max) * 100))}% left`;
          }
          stopped = true;
          break;
        }
        entry.pellets.push({
          zone: h.object.userData.zone as Zone,
          damage: gun.damage * k,
          knockback: gun.knockback * k,
          pop: gun.headPop * k,
          sever: goreOn ? gun.dismember * k : 0,
          segment: joint.startsWith('shoulder') || joint.startsWith('hip') ? 'upper' : 'lower',
        });
        entry.points.push(h.point.clone());
        entry.dir.add(dir);
        if (passed.size > gun.pierce) {
          stopped = true;
          break;
        }
      }
      if (!stopped && wall) {
        const barrel = this.barrelFor(wall.object);
        if (barrel && !barrel.exploded) barrel.fuse = 0;
        const crate = this.crateFor(wall.object);
        if (crate) this.breakCrate(crate);
        this.fx.surfaceImpact(wall.point, wall.normal, wall.surface, shotgun ? 0.4 : 1);
        if (!wallSound) this.sfx.impactSurface(wall.surface, wall.point);
        wallSound = true;
      }
    }

    // Close-range blast: zombies right in front of the barrel get bowled over,
    // even ones the pellets missed (this is what knocks whole groups down).
    if (gun.blastRange > 0) {
      for (const z of this.zombies) {
        if (!z.alive) continue;
        const to = z.chestPosition(tmp).sub(muzzlePos);
        const d = to.length();
        // Measured left-right only, so aiming high or low doesn't matter.
        const angle = MathUtils.radToDeg(Math.abs(angleBetweenFlat(to, baseDir)));
        const push = blastPush(d, angle, gun.blastRange, gun.blastAngle, gun.blastPush);
        if (push <= 0) continue;
        if (z.hasShield && !z.facingAwayFrom(this.player.position)) continue; // the shield takes it
        const wall = this.world.raycast(muzzlePos, to.normalize(), d);
        if (wall) continue;
        let entry = perZombie.get(z);
        if (!entry) {
          entry = { pellets: [], points: [], dir: new Vector3() };
          perZombie.set(z, entry);
        }
        entry.pellets.push({ zone: 'torso', damage: 0, knockback: push });
        entry.dir.add(to);
      }
    }

    for (const c of corpseHits.slice(0, 3)) {
      this.fx.blood(c.point, c.dir, 0.5 * bloodScale(), this.world.groundHeight(c.point.x, c.point.z));
    }
    if (corpseHits.length) this.sfx.impactFlesh('torso', corpseHits[0].point, false);

    // Each zombie that was hit reacts once to everything that hit it.
    const f = tuning.feel;
    let headHit = false;
    let pelletHits = 0;
    let summary: HitResult | null = null;
    let knockedDown = 0;
    for (const [z, entry] of perZombie) {
      const result = resolveShot(entry.pellets, z.targetState, this.player.focus, tuning, Math.random, {
        critChance: gun.critChance,
        mutateChance: this.mutateChance(),
        overkillRatio: tuning.parasite.overkillRatio,
      });
      entry.dir.normalize();
      z.applyHit(result, entry.dir, this.sfx, this.zombieHost);
      this.applyGore(z, result, entry.dir);
      if (result.reaction === 'knockdown' || result.killed) knockedDown++;
      if (entry.points.length === 0) continue; // only caught by the blast
      if (!summary || result.pellets > summary.pellets || result.headPop) summary = result;
      pelletHits++;
      entry.points.slice(0, 4).forEach((pt, i) => {
        const zone = entry.pellets[i].zone;
        this.fx.blood(pt, entry.dir, ((zone === 'head' ? 1.5 : 1) / Math.sqrt(entry.points.length)) * bloodScale(), this.world.groundHeight(pt.x, pt.z));
      });
      const group = zoneGroup(result.zone);
      if (group !== 'shield') this.sfx.impactFlesh(group, entry.points[0], result.killed);
      this.hud.hitMarker(group === 'shield' ? 'torso' : group, result.killed, f.hitMarkerTime);
      const stop = result.killed
        ? f.hitStopKill
        : result.reaction === 'knockdown'
          ? f.hitStopKnockdown
          : group === 'head'
            ? f.hitStopHead
            : f.hitStopBody;
      this.hitStop = Math.max(this.hitStop, stop);
      if (group === 'head') headHit = true;
    }
    if (summary) {
      const others = knockedDown - (summary.reaction === 'knockdown' || summary.killed ? 1 : 0);
      this.stats.lastHit = summary.zone === 'shield' && shieldNote ? shieldNote : describeHit(summary) + (others > 0 ? ` (+${others} more ${shotgun ? 'bowled over' : 'hit'})` : '');
    } else if (shotDown) {
      this.stats.lastHit = 'SHOT IT OUT OF THE AIR';
    }
    if (pelletHits > 0) this.stats.hits++;
    if (headHit) {
      this.stats.headshots++;
      this.cam.shake(f.shakeHeadshot);
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = this.lastFrameTime ? Math.min((now - this.lastFrameTime) / 1000, 1) : 1 / 60;
    this.lastFrameTime = now;
    try {
      this.renderer.info.reset();
      this.pad.poll(tuning.controls.stickDeadzone);
      this.handleGlobalKeys();
      if (this.controls.takeCase() && !this.paused && this.mode) {
        if (this.ui) this.closeUi();
        else this.openCase();
      }
      if (this.pendingTrader) {
        this.pendingTrader = false;
        this.openTrader();
      }
      if (this.ui) {
        if (this.controls.takePause()) this.closeUi();
        if (this.ui === 'case') {
          this.caseScreen.poll(this.pad, dt);
          if (this.input.wasPressed('Escape')) this.closeUi();
        } else if (this.ui === 'trader') {
          this.traderScreen.poll(this.pad, dt);
          this.traderScreen.setTimer(`Next wave in ${Math.ceil(this.waves.timer)}`);
          if (!this.hasTrader()) this.closeUi();
        }
      }
      const playing = !this.paused && this.mode !== null && this.ui === null;

      const mouseActive = this.autotest || this.input.pointerLocked;
      const c = tuning.controls;
      const lookScale = this.player.scoped ? tuning.camera.scopeSensitivity / Math.max(0.05, c.aimSensitivity) : 1;
      const look = this.controls.frame(dt, mouseActive, this.player.aiming, lookScale);
      if (playing && !this.freeCam) this.cam.look(look.yaw, look.pitch);
      if (this.freeCam && !this.freeCamControls) this.flyCamera.look(look.yaw, look.pitch);

      let alpha = 1;
      if (playing) {
        const step = 1 / tuning.simulation.tickRate;
        const steps = this.clock.advance(dt, step, tuning.simulation.maxFrameTime);
        for (let i = 0; i < steps; i++) this.tick(step);
        alpha = this.hitStop > 0 ? 1 : this.clock.alpha;
      } else if (!this.mode) {
        this.cam.yaw += dt * 0.03; // slow pan behind the title menu
      }
      this.renderFrame(dt, alpha, playing);
      this.frameCount++;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (!this.reportedErrors.has(e.message)) {
        this.reportedErrors.add(e.message);
        console.error(e);
        showError('Something went wrong', `${e.message}\n${e.stack ?? ''}`);
      }
    } finally {
      this.input.endFrame();
    }
  };

  /** One fixed slice of game-world time. */
  private tick(dt: number): void {
    if (this.hitStop > 0) {
      // Hit-stop: the world freezes for a few hundredths of a second.
      this.hitStop -= dt;
      return;
    }
    this.gameTime += dt;
    this.tickCount++;
    this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    this.noRoomTimer = Math.max(0, this.noRoomTimer - dt);
    const taken = this.controls.take();
    const input: PlayerInput = (this.freeCam && !this.freeCamControls) || this.player.dead ? { ...NO_INPUT } : taken;
    this.player.infiniteAmmo = this.modeId === 'range' ? tuning.weapons.infiniteAmmo : tuning.weapons.cheatInfiniteAmmo;
    this.zombieHost.playerAlive = !this.player.dead;
    this.health.tick(dt);
    this.horde.update(dt, this.zombies, { position: this.player.position, velocity: this.player.velocity, alive: !this.player.dead });
    for (const z of this.zombies) z.update(dt, this.zombieHost);
    this.survivalTick(dt);

    if (this.grabbedBy) {
      this.tickGrab(dt, input);
    } else if (!this.player.dead) {
      this.computeMeleeOption();
      if (input.meleePressed && this.meleeOption && !this.player.busy && this.player.stunTime <= 0) {
        this.startMelee();
        input.sprintPressed = false;
      }
      if (this.controls.takeInteract() && !this.meleeOption && this.hasTrader()) {
        const t = this.world.level.trader!;
        if (Math.hypot(t.customerX - this.player.position.x, t.customerZ - this.player.position.z) < tuning.trader.talkRange) this.pendingTrader = true;
      }
      if (input.healPressed) this.tryHeal();
      if (input.grenadeCycle) this.cycleGrenade();
      if (input.grenadePressed) this.tryThrowGrenade();
    }
    this.player.tick(dt, input, this.cam, this.world, this.playerHost);
    this.keepInArena();
    // A heal that was cut short (the player was hit) gives the item back.
    if (this.healingItem && !this.player.healing) this.healingItem = null;
    this.pickups.update(dt, this.player.position, (x, z) => this.world.groundHeight(x, z), (pk) => (this.player.dead ? false : this.collectPickup(pk)));
    this.tickHealthEffects(dt);
    this.updateCarry();
    this.updateRockets(dt);
    this.thrown.update(dt, this.thrownHost);
    this.updateFires(dt);
    this.updateBarrels(dt);
    for (const p of this.fallingProps) p.update(dt, this.world.groundHeight(p.object.position.x, p.object.position.z));
    const ground = (x: number, z: number) => this.world.groundHeight(x, z);
    this.fx.update(dt, ground);
    this.gore.update(dt, ground);
    this.manageZombies(dt);
  }

  /** Keeps the player inside the arena (the level can set bounds). */
  private keepInArena(): void {
    const b = this.world.level.bounds;
    if (!b) return;
    const p = this.player.position;
    p.x = MathUtils.clamp(p.x, b.minX, b.maxX);
    p.z = MathUtils.clamp(p.z, b.minZ, b.maxZ);
  }

  /** Heartbeat and the death countdown. */
  private tickHealthEffects(dt: number): void {
    if (this.modeId === null || this.modeId === 'range') return;
    if (this.health.inDanger(tuning.health.dangerLevel)) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        const worry = 1 - this.health.fraction / Math.max(0.01, tuning.health.dangerLevel);
        this.heartbeatTimer = 1.0 - 0.45 * Math.min(1, worry);
        this.sfx.heartbeat(Math.min(1, 0.4 + worry));
      }
    }
    if (this.deathTimer >= 0) {
      this.deathTimer -= dt;
      if (this.deathTimer < 0) this.showDeathScreen();
    }
  }

  private renderFrame(dt: number, alpha: number, playing: boolean): void {
    // Camera follows the smoothed player position.
    tmp.lerpVectors(this.player.prevPosition, this.player.position, alpha);
    const p = this.player;
    if (this.freeCam) {
      this.flyCamera.update(dt);
    } else {
      this.cam.recoilRecovery = p.stats.recoilRecovery;
      // Through the scope the camera sits at the eye.
      const eye = p.scoped && playing ? tmp3.copy(tmp).setY(tmp.y + 1.62).addScaledVector(p.forward(tmp2), 0.12) : null;
      this.cam.update(dt, tmp, playing && p.aiming, this.world, eye);
    }
    for (const z of this.zombies) z.render(alpha);

    if (this.mode) {
      const aim = this.computeAim();
      p.render(alpha, aim.point, this.cam);
      const scoped = p.scoped && playing;
      // Laser sight from the module under the barrel to whatever it hits.
      const showLaser = playing && p.aiming && !scoped && (this.cam.aimBlend > 0.6 || this.freeCam);
      if (showLaser) {
        p.laserWorld(laserPos);
        const toAim = tmp2.subVectors(aim.point, laserPos);
        const d = toAim.length();
        toAim.normalize();
        const wall = this.world.raycast(laserPos, toAim, d + 0.05);
        const zh = this.castZombies(laserPos, toAim, wall ? wall.distance : d + 0.3);
        const end = zh.length ? zh[0].point : wall ? wall.point : aim.point;
        const hitSomething = zh.length > 0 || wall !== null || d < p.stats.maxRange - 1;
        const beam = settings.laserBeam && settings.crosshair !== 'none';
        const dot = hitSomething && settings.crosshair !== 'none' ? end : null;
        this.fx.setLaser(beam ? laserPos : null, beam ? end : null, dot);
      } else {
        this.fx.setLaser(null, null, null);
      }
      // Reticle size on screen matches the real aim wobble (plus the pellet spread for shotguns).
      const ps = p.stats;
      const spread = MathUtils.degToRad(p.reticle.spread + (ps.pellets > 1 ? ps.pelletSpread : 0));
      const radius = (Math.tan(spread) / Math.tan(MathUtils.degToRad(this.camera.fov / 2))) * (window.innerHeight / 2);
      this.hud.setReticle(showLaser ? radius : null, p.focus);
      if (scoped) {
        // The scope crosshair drifts with the aim wobble.
        const s = tmp2.copy(aim.point).project(this.camera);
        this.hud.setScope(true, (s.x * window.innerWidth) / 2, (-s.y * window.innerHeight) / 2);
      } else {
        this.hud.setScope(false);
      }
      const g = p.gun;
      const reload = g.reloading ? (g.def.reload === 'shells' ? g.ammo / ps.capacity : g.reloadProgress) : null;
      this.hud.setAmmo(g.ammo, p.infiniteAmmo ? null : g.reserve, reload);
      this.hud.setWeaponName(g.def.name);
      this.hud.setKnife(p.knife.condition);
      if (p.selected !== this.lastWeapon || p.switching) {
        this.lastWeapon = p.selected;
        const list = WEAPONS.filter((w) => p.has(w.id));
        this.hud.showWeapons(
          list.map((w) => ({ slot: w.slot, name: w.name })),
          list.findIndex((w) => w.id === p.guns[p.selected].def.id),
        );
      }
      this.updatePrompts(playing);
      this.traderNpc.lookYaw = 0;
      this.traderNpc.update(dt);
      this.updateTraderMarker();
      const live = this.modeId === 'survival' || this.modeId === 'score';
      if (live) this.hud.setTopInfo(this.survivalInfo());
      else this.hud.setStats(this.mode === 'range' ? this.stats : null);
      this.updateHealthHud(live);
      const padName = this.pad.connected ? (this.pad.type === 'playstation' ? 'Options' : 'Menu') : null;
      this.hud.setHint(this.controls.lastDevice === 'gamepad' && padName ? `${padName}: menu & controls` : 'Esc: menu & controls  ·  F1: tuning');
      this.hud.update(dt);
    }
    this.menu.setPad(this.pad.connected ? this.pad.type : null);

    this.world.update(this.gameTime, this.camera);
    this.sfx.updateListener(this.camera);
    this.applyGraphicsTuning();
    this.post.render(Math.min(dt, 0.1));
    this.fps.frame(dt);
  }

  /** The health gauge, healing items, coins and the danger glow. */
  private updateHealthHud(live: boolean): void {
    const h = this.health;
    const p = this.player;
    this.hud.setHealth(h.current, h.max, tuning.health.max, h.inDanger(tuning.health.dangerLevel), p.healing ? 1 - p.healTime / p.healTotal : null, live);
    const danger = live && h.inDanger(tuning.health.dangerLevel) ? 1 - h.fraction / Math.max(0.01, tuning.health.dangerLevel) : 0;
    this.hud.setDanger(Math.min(1, danger), 0.5 + 0.5 * Math.sin(this.gameTime * 7));
    const herbs = this.supplies.items.filter((it) => it.kind === 'herb');
    const padType = this.pad.connected && this.controls.lastDevice === 'gamepad' ? this.pad.type : null;
    this.hud.setHealItems(
      {
        g: herbs.filter((i) => i.key === 'G').length,
        r: herbs.filter((i) => i.key === 'R').length,
        y: herbs.filter((i) => i.key === 'Y').length,
        mixed: herbs.filter((i) => i.key.length > 1).length,
        spray: this.supplies.count('spray'),
      },
      padType ? padButtonName(PAD.north, padType) : 'H',
    );
    this.hud.setCoins(live ? this.supplies.coins : null);
    const total = GRENADE_ORDER.reduce((n, k) => n + this.supplies.grenades(k).length, 0);
    if (!live && this.modeId !== 'range') {
      this.hud.setGrenades(null);
    } else if (total === 0) {
      this.hud.setGrenades(null);
    } else {
      const key = padType ? padButtonName(PAD.l1, padType) : 'G';
      const change = padType ? padButtonName(PAD.up, padType) : 'B';
      const parts = GRENADE_ORDER.map((k) => `<span class="gr ${k}${k === this.grenadeKind ? ' on' : ''}">${GRENADE_NAMES[k]} <b>${this.supplies.grenades(k).length}</b></span>`);
      this.hud.setGrenades(`<div class="gr-row">${parts.join('')}</div><div class="gr-keys"><kbd>${key}</kbd> throw &nbsp; <kbd>${change}</kbd> change</div>`);
    }
  }

  /** The melee prompt over a stunned zombie, and the break-free bar while grabbed. */
  private updatePrompts(playing: boolean): void {
    const padType = this.pad.connected && this.controls.lastDevice === 'gamepad' ? this.pad.type : null;
    const meleeKey = padType ? padButtonName(PAD.south, padType) : 'F';
    const knifeKey = padType ? padButtonName(PAD.r1, padType) : 'V';
    const opt = playing ? this.meleeOption : null;
    if (opt) {
      const at = opt.zombie.bodyCenter(tmp).setY(opt.zombie.position.y + (opt.zombie.lying ? 0.8 : 2.0));
      const s = at.project(this.camera);
      if (s.z < 1 && Math.abs(s.x) < 1.1 && Math.abs(s.y) < 1.1) {
        this.hud.setMeleePrompt({ x: ((s.x + 1) / 2) * window.innerWidth, y: ((1 - s.y) / 2) * window.innerHeight }, meleeKey, MELEE_NAMES[opt.move]);
      } else {
        this.hud.setMeleePrompt(null, '', '');
      }
    } else {
      this.hud.setMeleePrompt(null, '', '');
    }
    const st = this.struggle;
    this.hud.setGrab(
      st && playing
        ? { progress: st.progress, timeLeft: st.timeLeft, mash: meleeKey, knife: knifeKey, canKnife: !this.player.knife.broken }
        : null,
    );
  }

  private handleGlobalKeys(): void {
    if (this.input.wasPressed('F1')) {
      this.tuningPanel.toggle();
      // Free the mouse so the panel can be used; the game keeps running.
      if (this.tuningPanel.visible && this.input.pointerLocked) {
        this.releasingMouse = true;
        this.input.unlockPointer();
      } else if (!this.tuningPanel.visible && !this.paused && this.mode && !this.autotest) {
        this.input.lockPointer();
      }
    }
    if (this.input.wasPressed('F3')) this.fps.toggle();
    if (this.input.wasPressed('F4') && this.mode) {
      this.freeCam = !this.freeCam;
      if (this.freeCam) this.flyCamera.lookFrom(this.camera.position.clone(), this.aim.point.clone());
    }
    if (this.controls.takePause()) {
      if (this.paused && this.mode) this.resume();
      else this.pause();
    }
    if (this.deathScreen.visible) {
      if (this.pad.wasPressed(PAD.south) || this.input.wasPressed('Enter') || this.input.wasPressed('KeyR')) {
        this.deathScreen.hide();
        if (this.modeId) this.startMode(this.modeId);
      } else if (this.pad.wasPressed(PAD.east) || this.input.wasPressed('Escape')) {
        this.goToMenu();
      }
    } else if (this.menu.visible && this.menu.settingsOpen) {
      if (this.pad.wasPressed(PAD.east)) this.menu.closeSettings();
    } else if (this.menu.visible) {
      if (this.pad.wasPressed(PAD.south)) this.choose(this.paused && this.mode ? 'resume' : 'survival');
      if (this.pad.wasPressed(PAD.west)) this.choose('range');
      if (this.pad.wasPressed(PAD.north)) this.choose('survival');
    }
  }

  private onTuningChanged(path: string): void {
    if (path === 'graphics.shadows') {
      this.renderer.shadowMap.enabled = tuning.graphics.shadows;
      this.world.env.sun.castShadow = tuning.graphics.shadows;
      this.scene.traverse((obj) => {
        const mat = (obj as { material?: { needsUpdate: boolean } | Array<{ needsUpdate: boolean }> }).material;
        if (Array.isArray(mat)) mat.forEach((m) => (m.needsUpdate = true));
        else if (mat) mat.needsUpdate = true;
      });
    }
    if (path === 'graphics.shadowMapSize') {
      const size = 2 ** Math.round(Math.log2(Math.max(256, tuning.graphics.shadowMapSize)));
      const shadow = this.world.env.sun.shadow;
      shadow.mapSize.set(size, size);
      shadow.map?.dispose();
      shadow.map = null;
    }
    for (const g of this.player.guns) g.ammo = Math.min(g.ammo, g.stats.capacity);
  }

  private applyGraphicsTuning(): void {
    this.renderer.toneMappingExposure = tuning.atmosphere.exposure;
    const ratio = Math.min(window.devicePixelRatio || 1, tuning.graphics.maxPixelRatio);
    if (ratio !== this.pixelRatio) this.resize();

    if (tuning.debug.showColliders && !this.colliderLines) {
      this.colliderLines = colliderOutlines(this.world.colliders);
      this.scene.add(this.colliderLines);
    }
    if (this.colliderLines) this.colliderLines.visible = tuning.debug.showColliders;

    if (tuning.debug.showHitboxes !== this.hitboxView) {
      this.hitboxView = tuning.debug.showHitboxes;
      for (const z of this.zombies) z.rig.setHitboxView(this.hitboxView);
    }
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, tuning.graphics.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.post.setSize(w, h, this.pixelRatio);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.fx.setScreen(h * this.pixelRatio, this.camera.fov);
  }

  // ---------------------------------------------------------------------------
  // Hooks for automated tests

  /** Points the camera straight at a body part of the first living zombie. */
  debugAimAt(zone: Zone): boolean {
    const z = this.zombies.find((zz) => zz.alive && zz.parts.some((p) => p.userData.zone === zone));
    if (!z) return false;
    const part = z.parts.find((p) => p.userData.zone === zone)!;
    const target = part.getWorldPosition(new Vector3());
    for (let i = 0; i < 3; i++) {
      const d = tmp.subVectors(target, this.camera.position).normalize();
      this.cam.yaw = Math.atan2(-d.x, -d.z);
      this.cam.pitch = Math.asin(MathUtils.clamp(d.y, -1, 1));
      this.cam.update(0, this.player.position, this.player.aiming, this.world);
    }
    return true;
  }

  /** Switches to the free camera and looks from one point at another (for screenshots). */
  debugView(from: Vector3 | null, to: Vector3 | null, keepControls = false): void {
    this.freeCam = from !== null && to !== null;
    this.freeCamControls = keepControls;
    if (from && to) this.flyCamera.lookFrom(from, to);
  }

  /** For screenshots: switch crosshair style without the menu. */
  debugSettings(crosshair: typeof settings.crosshair): void {
    settings.crosshair = crosshair;
  }

  /**
   * For automated tests: puts the first living zombie into a state, or makes
   * it grab the player, or places it `distance` metres in front of the player.
   */
  debugZombie(kind: 'headStagger' | 'kneel' | 'kneelAway' | 'down' | 'grab' | 'place', value = 6): boolean {
    const z = this.zombies.find((zz) => zz.alive);
    if (!z) return false;
    if (kind === 'grab') {
      if (this.grabbedBy) return false;
      const f = this.player.forward(new Vector3());
      z.teleport(this.player.position.x + f.x * 0.55, this.player.position.z + f.z * 0.55, this.player.yaw + Math.PI);
      (z as unknown as { state: string }).state = 'grabbing';
      this.startGrab(z);
      return true;
    }
    if (kind === 'place') {
      const f = this.player.forward(new Vector3());
      z.teleport(this.player.position.x + f.x * value, this.player.position.z + f.z * value, this.player.yaw + Math.PI);
      return true;
    }
    z.debugForce(kind, value);
    return true;
  }

  /** For automated tests: puts a zombie `distance` metres in front of the player, facing them. Returns its id. */
  debugSpawn(kind: EnemyKind, distance: number, aware: boolean, side = 0): number {
    const f = this.player.forward(new Vector3());
    const x = this.player.position.x + f.x * distance - f.z * side;
    const z = this.player.position.z + f.z * distance + f.x * side;
    const zombie = new Zombie(this.zombieSeed++, x, z, this.player.yaw + Math.PI, 'hunt', { holdsTool: false, kind, aware });
    this.addZombie(zombie);
    return zombie.id;
  }

  /** For automated tests: smashes the crate nearest to the player. */
  breakNearestCrate(): void {
    let best: Crate | null = null;
    let bestD = Infinity;
    for (const c of this.crates) {
      if (c.broken) continue;
      const d = c.mesh.getWorldPosition(tmp).distanceTo(this.player.position);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) this.breakCrate(best);
  }

  /** For automated tests: kills every zombie that is alive. */
  debugKillAll(): void {
    for (const z of this.zombies) {
      if (!z.alive || z.invincible) continue;
      z.health = 0;
      const res = resolveShot([{ zone: 'torso', damage: 1e6, knockback: 0 }], z.targetState, 0, tuning);
      z.applyHit(res, new Vector3(0, 0, -1), this.sfx, this.zombieHost);
    }
  }

  /** For automated tests: hurts the player, gives items, or skips the wave break. */
  debugCheat(kind: 'hurt' | 'herb' | 'spray' | 'coins' | 'skipBreak' | 'dropHere' | 'wave' | 'grenade' | 'fire', value = 0, key = 'G'): void {
    if (kind === 'grenade') for (let i = 0; i < value; i++) this.supplies.addNew('grenade', key);
    else if (kind === 'fire') this.igniteGround(this.player.position.clone().addScaledVector(this.player.forward(tmp), value || 6));
    else if (kind === 'hurt') this.damagePlayer(value, this.player.position.clone().add(tmp.set(0, 0, 1)), 0);
    else if (kind === 'herb') this.supplies.addNew('herb', key);
    else if (kind === 'spray') this.supplies.addNew('spray', 'spray');
    else if (kind === 'coins') this.supplies.coins += value;
    else if (kind === 'skipBreak') this.waves.skipBreak();
    else if (kind === 'wave') this.waves.begin(value, 0);
    else this.pickups.spawn({ type: 'coins', amount: value || 100 }, this.player.position.clone().add(tmp.set(1.5, 0.5, 0)), this.world.groundHeight(this.player.position.x, this.player.position.z));
  }

  /** For automated tests: opens the case or the Trader's menu. */
  debugUi(which: 'case' | 'trader' | 'close'): void {
    if (which === 'close') this.closeUi();
    else if (which === 'case') this.openCase();
    else this.openTrader();
  }

  debugState() {
    return {
      ui: this.ui,
      traderOpen: this.hasTrader(),
      caseSize: [this.supplies.grid.width, this.supplies.grid.height],
      gunItems: this.supplies.items.filter((i) => i.kind === 'weapon').map((i) => i.key),
      mode: this.modeId,
      level: this.mode,
      health: this.health.current,
      maxHealth: this.health.max,
      dead: this.player.dead,
      healing: this.player.healing,
      wave: this.waves.wave,
      waveState: this.waves.state,
      kills: this.runKills,
      coins: this.supplies.coins,
      pickups: this.pickups.count,
      items: this.supplies.items.map((i) => `${i.kind}:${i.key}`),
      attackers: this.horde.attackers,
      crates: this.crates.filter((c) => c.broken).length,
      deathScreen: this.deathScreen.visible,
      paused: this.paused,
      weapon: this.player.def.id,
      ammo: this.player.gun.ammo,
      reloading: this.player.gun.reloading,
      aiming: this.player.aiming,
      scoped: this.player.scoped,
      focus: this.player.focus,
      player: this.player.position.toArray(),
      yaw: this.player.yaw,
      cameraYaw: this.cam.yaw,
      stats: { ...this.stats },
      zombies: this.zombies.map((z) => ({
        id: z.id,
        kind: z.kind,
        aware: z.aware,
        hasToken: this.horde.hasToken(z.id),
        dist: Math.hypot(z.position.x - this.player.position.x, z.position.z - this.player.position.z),
        state: z.state,
        stateTime: z.stateTime,
        health: z.health,
        alive: z.alive,
        holdingTool: z.holdingTool,
        behavior: z.behavior,
        headless: z.headless,
        gibbed: z.gibbed,
        missing: [...z.missing.keys()],
        openTo: z.openTo,
        shield: z.shield ? Math.round(z.shield.hp) : null,
        parasite: z.parasite,
        parasiteHealth: Math.round(z.parasiteHealth),
        burning: z.burning > 0,
        x: z.position.x,
        z: z.position.z,
      })),
      thrown: this.thrown.items.map((t) => t.type),
      launched: { ...this.thrown.launched },
      fires: this.fires.patches.length,
      grenades: { frag: this.supplies.grenades('frag').length, flash: this.supplies.grenades('flash').length, fire: this.supplies.grenades('fire').length, selected: this.grenadeKind },
      throwing: this.player.throwTime > 0,
      melee: this.player.melee,
      meleePrompt: this.meleeOption?.move ?? null,
      grabbed: this.player.grabbed,
      grabProgress: this.struggle?.progress ?? 0,
      knife: this.player.knife.durability,
      knifeSlashing: this.player.knifeTime > 0,
      rockets: this.rockets.length,
      barrelsExploded: this.barrels.filter((b) => b.exploded).length,
      goreChunks: this.gore.chunkCount,
      audioRunning: this.sfx.ready,
      soundsLoaded: this.sfx.samplesLoaded,
      crosshair: settings.crosshair,
      gore: settings.gore,
      padConnected: this.pad.connected,
      padType: this.pad.type,
      lastDevice: this.controls.lastDevice,
    };
  }

  /**
   * For automated tests: draws a frame and measures how bright and how varied
   * the picture is, so a test can tell a real scene from a black screen.
   */
  debugScreenStats(): { mean: number; spread: number } {
    this.post.render(0);
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 36;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.renderer.domElement, 0, 0, probe.width, probe.height);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let sum = 0;
    let sumSq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      sum += l;
      sumSq += l * l;
    }
    const mean = sum / n;
    return { mean, spread: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
  }
}
