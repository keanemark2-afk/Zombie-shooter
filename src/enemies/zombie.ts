import { MathUtils, Object3D, Quaternion, Vector3, type Material, type Mesh } from 'three';
import { addStump } from '../characters/flesh';
import { buildTool, type ToolKind } from '../characters/handheld';
import { zombieLook, type CharacterLook } from '../characters/looks';
import { buildRig, JOINTS, PoseBlender, type Euler3, type JointName, type Pose, type Rig } from '../characters/rig';
import type { HitResult, LimbSegment, LimbZone, TargetState, Zone } from '../combat/damage';
import type { Openness } from '../combat/melee';
import { tuning } from '../config/tuning';
import { seededRandom } from '../world/textures';
import type { World } from '../world/world';

export type ZombieState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'windup'
  | 'swing'
  | 'grabWindup'
  | 'lunge'
  | 'grabbing'
  | 'recover'
  | 'parried'
  | 'headStagger'
  | 'kneel'
  | 'trip'
  | 'down'
  | 'knockdown'
  | 'downBack'
  | 'getUp'
  | 'armFlinch'
  | 'crawlFall'
  | 'crawl'
  | 'clawWindup'
  | 'claw'
  | 'carried'
  | 'dying'
  | 'dead';

/** What a zombie is trying to do. "hunt" is normal; the rest are shooting-range dummy modes. */
export type ZombieBehavior = 'hunt' | 'stand' | 'walk' | 'pace' | 'run';

/** Ways a zombie can attack the player. */
export type AttackKind = 'swing' | 'grab' | 'claw';

/** What happened when an attack reached the player. */
export type AttackOutcome = 'hit' | 'grabbed' | 'parried' | 'perfect' | 'blocked';

/** How a grab ended. */
export type GrabRelease = 'shoved' | 'knifed' | 'bit';

/** Sounds a zombie can make (implemented by the audio system). */
export interface ZombieVoice {
  groan(pos: Vector3, pitch: number): void;
  grunt(pos: Vector3, pitch: number): void;
  roar(pos: Vector3, pitch: number): void;
  deathCry(pos: Vector3, pitch: number): void;
  bodyFall(pos: Vector3): void;
  swing(pos: Vector3): void;
  shuffle(pos: Vector3): void;
}

/** What a zombie needs to know about the rest of the game. */
export interface ZombieHost {
  world: World;
  playerPosition: Vector3;
  zombies: readonly Zombie[];
  voice: ZombieVoice;
  /** An attack reached the player: did it hit, grab, or get parried? */
  attackPlayer(zombie: Zombie, kind: AttackKind): AttackOutcome;
  /** Is anyone allowed to try grabbing the player right now? */
  canGrab(zombie: Zombie): boolean;
  /** A held tool was knocked loose and should tumble to the ground. */
  dropProp(prop: Object3D, velocity: Vector3, spin: Vector3): void;
}

const RADIUS = 0.33;
const RUN_LANE = 5;
const PACE_LANE = 4.5;
/** Roughly how far a lying body reaches from its feet to its head. */
const BODY_LENGTH = 1.55;
let nextId = 1;

const fwd = new Vector3();
const toPlayer = new Vector3();
const tmp = new Vector3();

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function easeIn(t: number): number {
  return t * t;
}

/** The basic zombie: shambles towards you, swings or grabs, and reacts to where it is shot. */
export class Zombie {
  readonly id = nextId++;
  readonly rig: Rig;
  readonly position = new Vector3();
  /** Position and facing at the previous update, for smooth drawing between updates. */
  readonly prevPosition = new Vector3();
  prevYaw = 0;
  yaw = 0;
  health: number;
  state: ZombieState = 'idle';
  stateTime = 0;
  behavior: ZombieBehavior;
  invincible: boolean;
  /** Set once the body has sunk away and can be deleted. */
  removed = false;
  /** Limbs that have been torn off, and where. */
  readonly missing = new Map<LimbZone, LimbSegment>();
  /** The head has burst. */
  headless = false;
  /** Blown to pieces (nothing left to draw). */
  gibbed = false;

  private readonly blender = new PoseBlender();
  private readonly rand: () => number;
  private readonly look: CharacterLook;
  private readonly reaches: boolean;
  readonly voicePitch: number;
  private tool: Object3D | null = null;
  private phase = 0;
  private speed = 0;
  private readonly knock = new Vector3();
  private flinchTimer = 0;
  private stateDuration = 0;
  private kneelSide: 'L' | 'R' = 'L';
  private spinFrom = 0;
  private spinTo = 0;
  private spinning = false;
  private fallDir = 1;
  /** What a get-up animation starts from. */
  private riseFrom: 'kneel' | 'front' | 'back' = 'front';
  private fallRoll = 0;
  private flinchArm: 'L' | 'R' = 'R';
  private attackResolved = false;
  private groanTimer: number;
  private stepTimer = 0;
  private paceDir = 1;
  private readonly home = new Vector3();
  private sink = 0;
  private readonly carryQuat = new Quaternion();

  constructor(seed: number, x: number, z: number, yaw: number, behavior: ZombieBehavior, opts: { holdsTool: boolean; invincible?: boolean }) {
    this.rand = seededRandom(seed * 31 + 7);
    this.look = zombieLook(seed);
    this.rig = buildRig(this.look);
    this.rig.root.userData.zombie = this;
    for (const part of this.rig.parts) part.userData.zombie = this;
    this.position.set(x, 0, z);
    this.home.set(x, 0, z);
    this.yaw = yaw;
    this.behavior = behavior;
    this.invincible = opts.invincible ?? false;
    this.health = tuning.zombie.health;
    this.reaches = this.rand() < 0.6;
    this.voicePitch = 0.85 + this.rand() * 0.35;
    this.groanTimer = 1 + this.rand() * tuning.zombie.groanInterval;
    this.paceDir = this.rand() < 0.5 ? 1 : -1;
    this.phase = this.rand() * Math.PI * 2;
    if (opts.holdsTool) {
      const kind: ToolKind = this.rand() < 0.6 ? 'sickle' : 'club';
      this.tool = buildTool(kind);
      this.rig.handR.add(this.tool);
    }
    this.setState(behavior === 'run' ? 'run' : behavior === 'stand' ? 'idle' : 'walk');
    this.blender.snap(this.pose(0));
    this.syncTransform();
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
  }

  /** Moves the drawn body smoothly between game updates. */
  render(alpha: number): void {
    if (this.state === 'carried') return; // placed directly by the suplex
    this.rig.root.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.rig.root.rotation.set(0, this.prevYaw + angleDiff(this.prevYaw, this.yaw) * alpha, 0);
  }

  /** Frees the body's shapes from graphics memory once it has been removed. */
  dispose(): void {
    this.rig.root.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
    });
  }

  /** Puts the zombie somewhere new straight away (range dummy distance changes). */
  teleport(x: number, z: number, yaw: number): void {
    this.position.set(x, this.position.y, z);
    this.home.set(x, 0, z);
    this.prevPosition.copy(this.position);
    this.yaw = this.prevYaw = yaw;
    this.syncTransform();
  }

  get object(): Object3D {
    return this.rig.root;
  }

  get parts(): Mesh[] {
    return this.rig.parts;
  }

  get alive(): boolean {
    return this.state !== 'dying' && this.state !== 'dead';
  }

  get holdingTool(): boolean {
    return this.tool !== null;
  }

  /** The skin material (for bits of skull when the head bursts). */
  get skin(): Material {
    return this.look.skin;
  }

  /** Lost a leg: drags itself along the ground from now on. */
  get crawler(): boolean {
    return this.missing.has('legL') || this.missing.has('legR');
  }

  get armsFree(): number {
    return (this.missing.has('armL') ? 0 : 1) + (this.missing.has('armR') ? 0 : 1);
  }

  get lying(): boolean {
    return ['trip', 'down', 'knockdown', 'downBack', 'crawlFall', 'crawl', 'clawWindup', 'claw'].includes(this.state);
  }

  /** What the damage rules need to know right now. */
  get targetState(): TargetState {
    return {
      health: this.health,
      invincible: this.invincible,
      running: this.state === 'run',
      downed: this.state === 'trip' || this.state === 'down' || this.state === 'knockdown' || this.state === 'downBack' || this.state === 'carried',
      holdingWeapon: this.tool !== null,
      windingUpThrow: false,
      crawling: this.crawler,
    };
  }

  /** Which melee follow-up this zombie is open to. */
  get openTo(): Openness {
    if (!this.alive) return null;
    if (this.state === 'headStagger') return 'head';
    if (this.state === 'kneel') return 'kneel';
    if (this.state === 'down' || this.state === 'downBack') return 'down';
    if (this.crawler && this.state !== 'crawlFall') return 'down';
    return null;
  }

  /** Is it turned away from `from` (so a suplex is possible)? */
  facingAwayFrom(from: Vector3): boolean {
    this.forward(fwd);
    tmp.subVectors(from, this.position).setY(0).normalize();
    return fwd.dot(tmp) < -0.35;
  }

  /** The zombie's chest position, for aiming and sound. */
  chestPosition(target: Vector3): Vector3 {
    return target.set(this.position.x, this.position.y + 1.3, this.position.z);
  }

  /** The middle of the body: up on its feet, or out along the ground when lying down. */
  bodyCenter(target: Vector3): Vector3 {
    this.forward(fwd);
    switch (this.state) {
      case 'down':
      case 'trip':
      case 'crawlFall':
      case 'crawl':
      case 'clawWindup':
      case 'claw':
        return target.copy(this.position).addScaledVector(fwd, BODY_LENGTH * 0.55).setY(this.position.y + 0.2);
      case 'downBack':
      case 'knockdown':
        return target.copy(this.position).addScaledVector(fwd, -BODY_LENGTH * 0.55).setY(this.position.y + 0.2);
      case 'kneel':
        return target.set(this.position.x, this.position.y + 0.8, this.position.z);
      default:
        return target.set(this.position.x, this.position.y + 1.1, this.position.z);
    }
  }

  /** Where the head is (a crawler's head is out in front of its body). */
  headPosition(target: Vector3): Vector3 {
    const head = this.rig.joints.head;
    if (head.parent && !this.headless) return head.getWorldPosition(target);
    return this.chestPosition(target).setY(this.position.y + 1.6);
  }

  private setState(state: ZombieState, duration = 0): void {
    this.state = state;
    this.stateTime = 0;
    this.stateDuration = duration;
  }

  forward(out: Vector3): Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** React to a bullet (or kick, or blast). `dir` is the direction the hit was travelling. */
  applyHit(hit: HitResult, dir: Vector3, voice: ZombieVoice, host: ZombieHost): void {
    if (!this.alive) return;
    this.health = hit.healthAfter;
    const fromFront = this.forward(fwd).dot(dir) < 0;
    const away = fromFront ? 1 : -1; // tilt away from the shooter
    const side = Math.sign(tmp.set(-fwd.z, 0, fwd.x).dot(dir)) || 1;
    this.kickFor(hit.zone, away, side);

    if (hit.dropWeapon) this.dropTool(dir, host);
    // Shoved back about `knockback` metres (a big blast is capped so it can't fly too far).
    if (hit.knockback > 0 && this.state !== 'carried') {
      this.knock.addScaledVector(tmp.set(dir.x, 0, dir.z).normalize(), Math.min(hit.knockback, 2.2) * 6);
    }

    const r = tuning.reactions;
    switch (hit.reaction) {
      case 'death':
        if (this.lying || this.state === 'carried') {
          this.dieOnGround();
        } else {
          this.fallDir = fromFront ? 1 : -1;
          if (hit.zone === 'legL' || hit.zone === 'legR') this.fallDir = -1; // crumples forward
          this.fallRoll = (this.rand() - 0.5) * 0.8;
          this.setState('dying');
        }
        if (!this.headless) voice.deathCry(this.chestPosition(tmp), this.voicePitch);
        break;
      case 'headStagger':
        this.setState('headStagger', r.headStaggerTime);
        voice.grunt(this.chestPosition(tmp), this.voicePitch);
        break;
      case 'kneel':
        this.kneelSide = hit.zone === 'legL' ? 'L' : 'R';
        this.spinning = hit.spin;
        this.spinFrom = this.yaw;
        this.spinTo = this.yaw + (this.rand() < 0.5 ? Math.PI : -Math.PI);
        this.setState('kneel', r.kneelTime);
        voice.grunt(this.chestPosition(tmp), this.voicePitch * 0.95);
        break;
      case 'trip':
        this.setState('trip', 0.45);
        voice.grunt(this.chestPosition(tmp), this.voicePitch * 1.05);
        break;
      case 'knockdown':
        // Blown off its feet onto its back.
        this.fallRoll = (this.rand() - 0.5) * 0.5;
        this.setState('knockdown', 0.55);
        voice.grunt(this.chestPosition(tmp), this.voicePitch * 1.1);
        break;
      case 'legless':
        this.setState('crawlFall', 0.5);
        voice.roar(this.chestPosition(tmp), this.voicePitch * 1.15);
        break;
      case 'armFlinch':
        this.flinchArm = hit.zone === 'armL' ? 'L' : 'R';
        if (!['headStagger', 'kneel', 'getUp', 'grabbing', 'carried'].includes(this.state) && !this.lying) {
          this.setState('armFlinch', r.armFlinchTime);
        }
        break;
      case 'torsoFlinch':
      case 'knockback':
        this.flinchTimer = r.torsoFlinchTime;
        break;
      case 'none':
        break;
    }
  }

  /** Dies where it lies (no standing collapse for a body already on the ground). */
  private dieOnGround(): void {
    const onBack = this.state === 'downBack' || this.state === 'knockdown';
    this.fallDir = onBack ? 1 : -1;
    this.fallRoll = 0;
    this.setState('dead');
  }

  /** A springy jolt on the body part that was hit. */
  private kickFor(zone: Zone, away: number, side: number): void {
    const b = this.blender;
    switch (zone) {
      case 'head':
        b.kick('head', 9 * away, 0, -3 * side);
        b.kick('neck', 4 * away, 0, 0);
        b.kick('spine', 2 * away, 0, 0);
        break;
      case 'torso':
        b.kick('spine', 5 * away, 3 * side, 0);
        b.kick('neck', 3 * away, 0, 0);
        break;
      case 'armL':
      case 'armR': {
        const s = zone === 'armL' ? 'L' : 'R';
        b.kick(`shoulder${s}`, -9 * away, 0, (s === 'R' ? 4 : -4));
        b.kick(`elbow${s}`, -6, 0, 0);
        b.kick('spine', 0, (s === 'R' ? -4 : 4) * away, 0);
        break;
      }
      case 'legL':
      case 'legR': {
        const s = zone === 'legL' ? 'L' : 'R';
        b.kick(`hip${s}`, -6 * away, 0, 0);
        b.kick(`knee${s}`, 6, 0, 0);
        break;
      }
    }
  }

  private dropTool(dir: Vector3, host: ZombieHost): void {
    if (!this.tool) return;
    const tool = this.tool;
    this.tool = null;
    tool.updateWorldMatrix(true, false);
    const pos = new Vector3();
    tool.getWorldPosition(pos);
    const quat = tool.getWorldQuaternion(new Quaternion());
    tool.removeFromParent();
    tool.position.copy(pos);
    tool.quaternion.copy(quat);
    const vel = new Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1.5).add(new Vector3(0, 2.2, 0));
    const spin = new Vector3((this.rand() - 0.5) * 14, (this.rand() - 0.5) * 10, (this.rand() - 0.5) * 14);
    host.dropProp(tool, vel, spin);
  }

  // -------------------------------------------------------------------------
  // Gore

  /** The head bursts: it disappears, leaving a neck stump. Returns where the head was. */
  popHead(out: Vector3): Vector3 {
    this.headPosition(out);
    if (this.headless) return out;
    this.headless = true;
    const head = this.rig.joints.head;
    head.visible = false;
    head.traverse((o) => {
      const i = this.rig.parts.indexOf(o as Mesh);
      if (i >= 0) this.rig.parts.splice(i, 1);
    });
    addStump(this.rig.joints.neck, 0, 0.1, 0, 0.058);
    return out;
  }

  /**
   * Tears off an arm or leg at the shoulder/hip ("upper") or elbow/knee
   * ("lower"). Returns the loose limb, still at its place in the world, for
   * the gore effects to send flying (or null if it was already gone).
   */
  sever(zone: LimbZone, segment: LimbSegment): Object3D | null {
    const already = this.missing.get(zone);
    if (already === 'upper' || (already === 'lower' && segment === 'lower')) return null;
    const s = zone.endsWith('L') ? 'L' : 'R';
    const arm = zone.startsWith('arm');
    const jointName: JointName = arm ? (segment === 'upper' ? `shoulder${s}` : `elbow${s}`) : segment === 'upper' ? `hip${s}` : `knee${s}`;
    const j = this.rig.joints[jointName];
    const parent = j.parent;
    if (!parent) return null;
    if (arm && s === 'R' && this.tool) this.tool = null; // the tool goes with the hand
    this.missing.set(zone, segment);

    const leaving = new Set<Object3D>();
    j.traverse((o) => leaving.add(o));
    for (let i = this.rig.parts.length - 1; i >= 0; i--) if (leaving.has(this.rig.parts[i])) this.rig.parts.splice(i, 1);
    // The animation keeps posing stand-ins for the joints that left.
    for (const name of JOINTS) if (leaving.has(this.rig.joints[name])) this.rig.joints[name] = this.standIn(name);
    if (leaving.has(this.rig.handR)) this.rig.handR = this.standIn('wristR');
    if (leaving.has(this.rig.handL)) this.rig.handL = this.standIn('wristL');

    addStump(parent, j.position.x, j.position.y, j.position.z, arm ? 0.06 : 0.08);
    addStump(j, 0, 0, 0, arm ? 0.055 : 0.075); // the raw end of the loose limb
    j.updateWorldMatrix(true, true);
    for (const o of leaving) delete o.userData.zombie;
    return j;
  }

  private standIn(name: string): Object3D {
    const o = new Object3D();
    o.name = `${name}-gone`;
    return o;
  }

  /** Blown to pieces: the game takes the body parts away; nothing is left to draw. */
  gib(): void {
    this.gibbed = true;
    this.health = 0;
    this.rig.root.visible = false;
    this.rig.parts.length = 0;
    this.setState('dead');
    this.stateTime = tuning.zombie.corpseTime + 2; // removed straight away
  }

  // -------------------------------------------------------------------------
  // Being kicked, suplexed, parried and grabbing

  /** For automated tests: puts the zombie straight into a state. */
  debugForce(kind: 'headStagger' | 'kneel' | 'kneelAway' | 'down', seconds: number): void {
    if (!this.alive) return;
    if (kind === 'down') {
      this.setState('down', seconds);
    } else if (kind === 'headStagger') {
      this.setState('headStagger', seconds);
    } else {
      if (kind === 'kneelAway') this.yaw += Math.PI;
      this.kneelSide = 'L';
      this.spinning = false;
      this.setState('kneel', seconds);
    }
  }

  /** Stunned by a perfect parry or shoved off after a grab: open to a kick. */
  stun(seconds: number): void {
    if (!this.alive || this.crawler) return;
    this.setState('headStagger', seconds);
  }

  /** Lifted for a suplex: the player's code places the body each update. */
  beginCarry(): void {
    if (!this.alive) return;
    this.dropToolQuietly();
    this.setState('carried');
    this.knock.set(0, 0, 0);
  }

  /** Where the carried body is right now (its feet, and its whole orientation). */
  setCarryTransform(pos: Vector3, quat: Quaternion): void {
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.carryQuat.copy(quat);
  }

  /** Slammed down at the end of a suplex: lies face down at `pos`, facing `yaw`. */
  endCarry(pos: Vector3, yaw: number): void {
    this.position.set(pos.x, pos.y, pos.z);
    this.prevPosition.copy(this.position);
    this.yaw = this.prevYaw = yaw;
    if (this.health <= 0 || this.state === 'dead' || this.state === 'dying') {
      this.fallDir = -1;
      this.setState('dead');
    } else {
      this.setState('down', tuning.reactions.tripTime);
    }
    this.blender.snap(this.pose(0));
    this.rig.root.quaternion.identity();
    this.syncTransform();
  }

  private dropToolQuietly(): void {
    if (!this.tool) return;
    this.tool.removeFromParent();
    this.tool.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
    });
    this.tool = null;
  }

  /** While it holds the player, the game keeps it pressed up close. */
  holdAt(pos: Vector3, yaw: number): void {
    this.position.copy(pos);
    this.yaw = yaw;
  }

  /** The player broke free (or got bitten). */
  releaseGrab(how: GrabRelease, dir: Vector3): void {
    if (this.state !== 'grabbing') return;
    if (how === 'bit') {
      this.setState('recover', tuning.zombie.attackRecover);
      return;
    }
    this.knock.addScaledVector(tmp.set(dir.x, 0, dir.z).normalize(), how === 'knifed' ? 5 : 7);
    this.setState('headStagger', tuning.reactions.headStaggerTime * 0.9);
  }

  /** What to do once an attack has reached the player. */
  private afterAttack(outcome: AttackOutcome): void {
    const z = tuning.zombie;
    switch (outcome) {
      case 'grabbed':
        this.setState('grabbing');
        break;
      case 'perfect':
        // A perfect parry knocks its arms wide and stuns it: kick it!
        this.setState('headStagger', tuning.reactions.headStaggerTime);
        break;
      case 'parried':
        this.setState('parried', 0.7);
        break;
      default:
        if (this.crawler) this.setState('crawl');
        else this.setState('recover', z.attackRecover);
    }
  }

  // -------------------------------------------------------------------------

  update(dt: number, host: ZombieHost): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.stateTime += dt;
    this.flinchTimer = Math.max(0, this.flinchTimer - dt);
    const z = tuning.zombie;
    const r = tuning.reactions;
    toPlayer.subVectors(host.playerPosition, this.position).setY(0);
    const distToPlayer = toPlayer.length();
    const yawToPlayer = Math.atan2(-toPlayer.x, -toPlayer.z);
    let wantSpeed = 0;
    let wantYaw = this.yaw;
    let turnRate = MathUtils.degToRad(z.turnSpeed);

    if (this.state === 'carried') {
      // Carried by the player for a suplex: just flail.
      this.blender.update(this.pose(this.stateTime), dt, 14, 30);
      this.blender.apply(this.rig);
      this.rig.root.position.copy(this.position);
      this.rig.root.quaternion.copy(this.carryQuat);
      this.rig.root.updateMatrixWorld(true);
      return;
    }

    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'run': {
        ({ wantSpeed, wantYaw } = this.think(dt, distToPlayer, yawToPlayer, host));
        break;
      }
      case 'windup':
        wantYaw = yawToPlayer;
        turnRate *= 0.6;
        if (this.stateTime >= z.attackWindup) {
          this.setState('swing', 0.32);
          this.attackResolved = false;
          host.voice.swing(this.chestPosition(tmp));
        }
        break;
      case 'swing':
        if (!this.attackResolved && this.stateTime >= 0.12) {
          this.attackResolved = true;
          const facing = Math.abs(angleDiff(this.yaw, yawToPlayer));
          if (distToPlayer < z.attackRange + 0.45 && facing < MathUtils.degToRad(55)) {
            const outcome = host.attackPlayer(this, 'swing');
            if (outcome !== 'hit' && outcome !== 'blocked') {
              this.afterAttack(outcome);
              break;
            }
          }
        }
        wantSpeed = this.stateTime < 0.15 ? 1.2 : 0;
        if (this.stateTime >= this.stateDuration) this.setState('recover', z.attackRecover);
        break;
      case 'grabWindup':
        wantYaw = yawToPlayer;
        turnRate *= 0.8;
        if (this.stateTime >= z.attackWindup * 0.8) {
          this.setState('lunge', 0.4);
          this.attackResolved = false;
          host.voice.swing(this.chestPosition(tmp));
        }
        break;
      case 'lunge': {
        wantYaw = yawToPlayer;
        wantSpeed = this.stateTime < 0.28 ? 3.2 : 0;
        this.speed = wantSpeed;
        const facing = Math.abs(angleDiff(this.yaw, yawToPlayer));
        if (!this.attackResolved && this.stateTime >= 0.08 && distToPlayer < tuning.grab.reach + 0.35 && facing < MathUtils.degToRad(50)) {
          this.attackResolved = true;
          this.afterAttack(host.attackPlayer(this, 'grab'));
          break;
        }
        if (this.stateTime >= this.stateDuration) this.setState('recover', z.attackRecover);
        break;
      }
      case 'grabbing':
        // Held in place by the game until the player breaks free.
        break;
      case 'recover':
        if (this.stateTime >= this.stateDuration) this.resumeDefault();
        break;
      case 'parried':
        wantSpeed = -1.4 * Math.max(0, 1 - this.stateTime / this.stateDuration);
        this.speed = wantSpeed;
        if (this.stateTime >= this.stateDuration) this.resumeDefault();
        break;
      case 'headStagger':
        // Stumbles backwards, slowing down.
        wantSpeed = -0.7 * Math.max(0, 1 - this.stateTime / (this.stateDuration * 0.75));
        if (this.stateTime >= this.stateDuration) this.resumeDefault();
        break;
      case 'kneel':
        if (this.spinning) {
          const u = Math.min(1, this.stateTime / 0.55);
          this.yaw = this.spinFrom + (this.spinTo - this.spinFrom) * (1 - (1 - u) * (1 - u));
          wantYaw = this.yaw;
        }
        if (this.stateTime >= this.stateDuration) {
          this.spinning = false;
          this.riseFrom = 'kneel';
          this.setState('getUp', 0.5);
        }
        break;
      case 'trip':
        // Momentum carries it forward as it falls.
        wantSpeed = 2.5 * (1 - this.stateTime / this.stateDuration);
        this.speed = wantSpeed;
        if (this.stateTime >= this.stateDuration) {
          this.setState('down', r.tripTime);
          host.voice.bodyFall(this.position);
        }
        break;
      case 'down':
        if (this.stateTime >= this.stateDuration) {
          this.riseFrom = 'front';
          this.setState('getUp', r.getUpTime);
        }
        break;
      case 'knockdown':
        if (this.stateTime >= this.stateDuration) {
          this.setState('downBack', r.knockdownTime);
          host.voice.bodyFall(this.position);
        }
        break;
      case 'downBack':
        if (this.stateTime >= this.stateDuration) {
          this.riseFrom = 'back';
          this.setState('getUp', r.getUpTime);
        }
        break;
      case 'getUp':
        if (this.stateTime >= this.stateDuration) this.resumeDefault();
        break;
      case 'armFlinch':
        wantSpeed = 0.2;
        if (this.stateTime >= this.stateDuration) this.resumeDefault();
        break;
      case 'crawlFall':
        if (this.stateTime >= this.stateDuration) {
          this.setState('crawl');
          host.voice.bodyFall(this.position);
        }
        break;
      case 'crawl': {
        // Drags itself towards you; claws when its hands can reach.
        wantYaw = yawToPlayer;
        turnRate *= 0.5;
        const reach = distToPlayer - BODY_LENGTH;
        const facing = Math.abs(angleDiff(this.yaw, yawToPlayer));
        if (reach < z.crawlReach && facing < 0.5 && this.armsFree > 0) {
          this.setState('clawWindup', 0.6);
          host.voice.grunt(this.chestPosition(tmp), this.voicePitch);
        } else if (reach > z.crawlReach * 0.6) {
          // Pulls in strokes rather than gliding.
          wantSpeed = z.crawlSpeed * (0.55 + 0.45 * Math.max(0, Math.sin(this.phase * 2)));
        }
        break;
      }
      case 'clawWindup':
        wantYaw = yawToPlayer;
        turnRate *= 0.4;
        if (this.stateTime >= this.stateDuration) {
          this.setState('claw', 0.35);
          this.attackResolved = false;
        }
        break;
      case 'claw':
        if (!this.attackResolved && this.stateTime >= 0.1) {
          this.attackResolved = true;
          if (distToPlayer - BODY_LENGTH < z.crawlReach + 0.35) {
            const outcome = host.attackPlayer(this, 'claw');
            if (outcome === 'perfect' || outcome === 'parried') {
              this.setState('crawl');
              this.knock.addScaledVector(tmp.copy(toPlayer).normalize(), -3);
              break;
            }
          }
        }
        if (this.stateTime >= this.stateDuration) this.setState('crawl');
        break;
      case 'dying':
        if (this.stateTime >= 0.75) {
          this.setState('dead');
          host.voice.bodyFall(this.position);
        }
        break;
      case 'dead':
        if (this.stateTime > z.corpseTime) {
          this.sink = Math.min(1, (this.stateTime - z.corpseTime) / 1.6);
          if (this.sink >= 1 || this.gibbed) this.removed = true;
        }
        break;
    }

    // Turn, then move along the way it is facing (so it visibly turns first).
    const d = angleDiff(this.yaw, wantYaw);
    this.yaw += MathUtils.clamp(d, -turnRate * dt, turnRate * dt);
    if (this.flinchTimer > 0) wantSpeed *= 0.15;
    const alignment = wantSpeed > 0 ? Math.max(0, Math.cos(angleDiff(this.yaw, wantYaw))) : 1;
    const target = wantSpeed * alignment;
    this.speed += (target - this.speed) * (1 - Math.exp(-8 * dt));
    if (this.state === 'trip' || this.state === 'lunge' || this.state === 'parried') this.speed = target;
    if (this.state === 'grabbing') this.speed = 0;
    this.forward(fwd);
    this.position.addScaledVector(fwd, this.speed * dt);
    this.position.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-6 * dt));

    if (this.alive && this.state !== 'grabbing') {
      host.world.resolveCircle(this.position, RADIUS);
      this.separate(host);
    }
    this.position.y = host.world.groundHeight(this.position.x, this.position.z) - this.sink * 0.6;

    // Walk cycle and sounds.
    const crawling = this.state === 'crawl';
    const stride = this.state === 'run' ? 1.5 : crawling ? 0.5 : 0.9;
    this.phase += (Math.abs(this.speed) / stride) * Math.PI * dt;
    this.stepTimer -= Math.abs(this.speed) * dt;
    if (this.stepTimer <= 0 && Math.abs(this.speed) > (crawling ? 0.1 : 0.3)) {
      this.stepTimer = stride * 0.5;
      host.voice.shuffle(this.position);
    }
    if (this.alive && !this.headless) {
      this.groanTimer -= dt;
      if (this.groanTimer <= 0) {
        this.groanTimer = z.groanInterval * (0.6 + this.rand() * 0.8);
        host.voice.groan(this.chestPosition(tmp), this.voicePitch);
      }
    }

    const pose = this.pose(this.stateTime);
    const snappy = ['headStagger', 'armFlinch', 'swing', 'trip', 'knockdown', 'lunge', 'parried', 'claw', 'crawlFall'].includes(this.state);
    const rate = snappy ? 16 : this.state === 'dying' ? 14 : this.state === 'getUp' ? 5 : 9;
    const falling = ['dying', 'dead', 'trip', 'down', 'knockdown', 'downBack', 'crawlFall'].includes(this.state);
    const bodyRate = falling ? 30 : rate;
    this.blender.update(pose, dt, rate, bodyRate);
    this.syncTransform();
  }

  /** Decides where to go and how fast while walking, running or standing. */
  private think(dt: number, dist: number, yawToPlayer: number, host: ZombieHost): { wantSpeed: number; wantYaw: number } {
    const z = tuning.zombie;
    switch (this.behavior) {
      case 'stand':
        if (this.state !== 'idle') this.setState('idle');
        return { wantSpeed: 0, wantYaw: yawToPlayer };
      case 'pace':
      case 'run': {
        const run = this.behavior === 'run';
        const lane = run ? RUN_LANE : PACE_LANE;
        if (this.state !== (run ? 'run' : 'walk')) this.setState(run ? 'run' : 'walk');
        const offset = this.position.x - this.home.x;
        if (offset > lane) this.paceDir = -1;
        if (offset < -lane) this.paceDir = 1;
        const goal = tmp.set(this.home.x + this.paceDir * (lane + 1), 0, this.home.z).sub(this.position);
        return { wantSpeed: run ? z.runSpeed : z.walkSpeed, wantYaw: Math.atan2(-goal.x, -goal.z) };
      }
      case 'walk':
      case 'hunt': {
        if (dist < z.attackRange && Math.abs(angleDiff(this.yaw, yawToPlayer)) < 0.6) {
          // Both hands free: sometimes it lunges to grab instead of swinging.
          const grab = this.armsFree === 2 && !this.tool && this.rand() < tuning.grab.chance && host.canGrab(this);
          this.setState(grab ? 'grabWindup' : 'windup');
          host.voice.roar(this.chestPosition(tmp), this.voicePitch);
          return { wantSpeed: 0, wantYaw: yawToPlayer };
        }
        if (this.behavior === 'hunt') {
          if (this.state === 'walk' && dist > 6 && this.rand() < z.runChance * dt) this.setState('run', z.runDuration);
          if (this.state === 'run' && (this.stateTime >= this.stateDuration || dist < 3)) this.setState('walk');
        } else if (this.state !== 'walk') {
          this.setState('walk');
        }
        if (dist < z.attackRange * 0.8) return { wantSpeed: 0, wantYaw: yawToPlayer };
        return { wantSpeed: this.state === 'run' ? z.runSpeed : z.walkSpeed, wantYaw: yawToPlayer };
      }
    }
  }

  private resumeDefault(): void {
    if (this.crawler) this.setState('crawl');
    else if (this.behavior === 'run') this.setState('run');
    else if (this.behavior === 'stand') this.setState('idle');
    else this.setState('walk');
  }

  /** Keeps zombies from standing inside each other or the player. */
  private separate(host: ZombieHost): void {
    for (const other of host.zombies) {
      if (other === this || !other.alive || other.state === 'carried') continue;
      tmp.subVectors(this.position, other.position).setY(0);
      const d = tmp.length();
      const min = RADIUS * 2;
      if (d < min && d > 1e-4) this.position.addScaledVector(tmp, ((min - d) / d) * 0.5);
    }
    tmp.subVectors(this.position, host.playerPosition).setY(0);
    const d = tmp.length();
    const min = RADIUS + tuning.player.radius;
    if (d < min && d > 1e-4) this.position.addScaledVector(tmp, (min - d) / d);
  }

  private syncTransform(): void {
    this.blender.apply(this.rig);
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.set(0, this.yaw, 0);
    this.rig.root.updateMatrixWorld(true);
  }

  // -------------------------------------------------------------------------
  // Animation: each state describes a pose; the blender eases between them.

  private pose(t: number): Pose {
    const hunch = this.look.hunch;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const j: Partial<Record<JointName, Euler3>> = {};
    const pose: Pose = { j };
    const sway = Math.sin(t * 0.9 + this.id) * 0.05;

    const arms = (reach: number, swing: number) => {
      if (this.reaches) {
        j.shoulderL = [1.2 * reach + 0.1 * Math.sin(this.phase + 1), 0, 0.12];
        j.shoulderR = [1.15 * reach + 0.1 * Math.sin(this.phase + 2.2), 0, -0.12];
        j.elbowL = [0.25, 0, 0];
        j.elbowR = [0.3, 0, 0];
      } else {
        j.shoulderL = [-0.28 * swing * s + 0.1, 0, -0.05];
        j.shoulderR = [0.28 * swing * s + 0.1, 0, 0.05];
        j.elbowL = [0.35, 0, 0];
        j.elbowR = [0.35, 0, 0];
      }
      if (this.tool) {
        j.shoulderR = [0.25 + 0.25 * swing * s, 0, 0.08];
        j.elbowR = [0.45, 0, 0];
        j.wristR = [0.3, 0, 0];
      }
    };

    const legs = (amp: number, kneeAmp: number, drag: number) => {
      j.hipL = [0.42 * amp * s, 0, 0];
      j.hipR = [-0.42 * amp * drag * s, 0, 0];
      j.kneeL = [-(0.08 + kneeAmp * Math.max(0, c)), 0, 0];
      j.kneeR = [-(0.08 + kneeAmp * drag * Math.max(0, -c)), 0, 0];
      j.ankleL = [0.15 * Math.max(0, c), 0, 0];
      j.ankleR = [0.15 * Math.max(0, -c), 0, 0];
    };

    /** Lying face down, dragging itself along by its arms. */
    const crawl = (reachR: number) => {
      pose.bodyPitch = -1.5;
      pose.bodyLift = 0.13;
      j.spine = [0.15, 0.12 * s, 0];
      j.neck = [0.55, 0, 0];
      j.head = [0.35, 0, 0.1 * s];
      j.shoulderL = [2.55 + 0.45 * s, 0, -0.35];
      j.shoulderR = [2.55 - 0.45 * s, 0, 0.35];
      j.elbowL = [0.5 + 0.5 * Math.max(0, -s), 0, 0];
      j.elbowR = [0.5 + 0.5 * Math.max(0, s), 0, 0];
      if (reachR > 0) {
        j.shoulderR = [2.55 + 0.6 * reachR, 0, 0.2];
        j.elbowR = [0.2, 0, 0];
        j.neck = [0.75, 0, 0];
      }
      // A remaining leg drags behind.
      j.hipL = [0.05, 0, -0.08];
      j.hipR = [-0.1, 0, 0.12];
      j.kneeL = [-0.25 - 0.15 * Math.max(0, s), 0, 0];
      j.kneeR = [-0.25 - 0.15 * Math.max(0, -s), 0, 0];
    };

    switch (this.state) {
      case 'idle':
      case 'recover':
        j.spine = [-hunch - 0.05, 0, sway];
        j.neck = [0.1, 0, 0];
        j.head = [0.12, sway * 2, 0.12 + sway];
        arms(0.7, 0.2);
        legs(0, 0, 1);
        j.hipL = [0.05, 0, -0.05];
        j.hipR = [-0.05, 0, 0.05];
        break;

      case 'walk':
      case 'armFlinch':
        j.spine = [-hunch - 0.08, 0.1 * s, 0.07 * s + sway];
        j.neck = [0.1, 0, 0];
        j.head = [0.15, 0, 0.15];
        arms(1, 1);
        legs(1, 0.65, 0.65);
        pose.hipsY = -0.03 + 0.03 * Math.abs(c);
        if (this.state === 'armFlinch') {
          const side = this.flinchArm;
          const u = Math.min(1, t / 0.15);
          j[`shoulder${side}`] = [-0.9 * u, 0, side === 'R' ? 0.5 : -0.5];
          j[`elbow${side}`] = [0.2, 0, 0];
          j.spine = [-hunch, side === 'R' ? -0.35 : 0.35, 0];
        }
        break;

      case 'run':
        j.spine = [-hunch - 0.35, 0.12 * s, 0];
        j.neck = [0.25, 0, 0];
        j.head = [0.25, 0, 0];
        j.shoulderL = [1.35 + 0.25 * s, 0, 0.1];
        j.shoulderR = [1.35 - 0.25 * s, 0, -0.1];
        j.elbowL = [0.3, 0, 0];
        j.elbowR = [0.3, 0, 0];
        legs(1.8, 1.3, 1);
        pose.hipsY = -0.06 + 0.06 * Math.abs(c);
        break;

      case 'windup':
        j.spine = [0.12, 0, 0];
        j.neck = [-0.1, 0, 0];
        j.head = [0.2, 0, 0];
        j.shoulderL = [2.7, 0, -0.2];
        j.shoulderR = [2.7, 0, 0.2];
        j.elbowL = [0.7, 0, 0];
        j.elbowR = [0.7, 0, 0];
        j.hipL = [0.15, 0, 0];
        j.hipR = [-0.25, 0, 0];
        j.kneeR = [-0.2, 0, 0];
        pose.hipsZ = 0.05;
        break;

      case 'swing':
        j.spine = [-hunch - 0.5, 0, 0];
        j.neck = [0.3, 0, 0];
        j.head = [0.2, 0, 0];
        j.shoulderL = [0.7, 0, 0.25];
        j.shoulderR = [0.7, 0, -0.25];
        j.elbowL = [0.2, 0, 0];
        j.elbowR = [0.2, 0, 0];
        j.hipL = [0.45, 0, 0];
        j.kneeL = [-0.3, 0, 0];
        j.hipR = [-0.3, 0, 0];
        pose.hipsY = -0.08;
        pose.hipsZ = -0.12;
        break;

      case 'grabWindup':
        // Crouches and spreads its arms wide, ready to lunge.
        j.spine = [-hunch - 0.25, 0, 0];
        j.neck = [0.35, 0, 0];
        j.head = [0.1, 0, 0];
        j.shoulderL = [1.45, 0, -0.55];
        j.shoulderR = [1.45, 0, 0.55];
        j.elbowL = [0.35, 0, 0];
        j.elbowR = [0.35, 0, 0];
        j.hipL = [0.35, 0, 0];
        j.kneeL = [-0.5, 0, 0];
        j.hipR = [-0.15, 0, 0];
        j.kneeR = [-0.45, 0, 0];
        pose.hipsY = -0.12;
        pose.hipsZ = 0.06;
        break;

      case 'lunge':
        j.spine = [-hunch - 0.55, 0, 0];
        j.neck = [0.45, 0, 0];
        j.head = [0.15, 0, 0];
        j.shoulderL = [1.65, 0, -0.15];
        j.shoulderR = [1.65, 0, 0.15];
        j.elbowL = [0.15, 0, 0];
        j.elbowR = [0.15, 0, 0];
        j.hipL = [0.7, 0, 0];
        j.kneeL = [-0.4, 0, 0];
        j.hipR = [-0.45, 0, 0];
        j.kneeR = [-0.2, 0, 0];
        pose.hipsY = -0.1;
        pose.hipsZ = -0.1;
        break;

      case 'grabbing': {
        // Arms locked round your shoulders, head lunging for your neck.
        const bite = Math.max(0, Math.sin(t * 7.5));
        j.spine = [-hunch - 0.25, 0.1 * Math.sin(t * 4), 0];
        j.neck = [0.2 + 0.35 * bite, 0, 0];
        j.head = [-0.1 - 0.25 * bite, 0, 0.15 * Math.sin(t * 3)];
        j.shoulderL = [1.7, 0, 0.45];
        j.shoulderR = [1.7, 0, -0.45];
        j.elbowL = [1.25, 0, 0];
        j.elbowR = [1.25, 0, 0];
        j.hipL = [0.25, 0, 0];
        j.kneeL = [-0.3, 0, 0];
        j.hipR = [-0.1, 0, 0];
        j.kneeR = [-0.25, 0, 0];
        pose.hipsY = -0.06;
        break;
      }

      case 'parried': {
        // Knocked off balance: arms thrown wide, stumbling backwards.
        const stumble = Math.sin(t * 10);
        j.spine = [0.35, 0, 0.1 * stumble];
        j.neck = [0.2, 0, 0];
        j.head = [0.3, 0, 0];
        j.shoulderL = [0.6, 0, -1.0];
        j.shoulderR = [0.6, 0, 1.0];
        j.elbowL = [0.4, 0, 0];
        j.elbowR = [0.4, 0, 0];
        j.hipL = [0.35 * stumble, 0, 0];
        j.hipR = [-0.35 * stumble, 0, 0];
        j.kneeL = [-0.3, 0, 0];
        j.kneeR = [-0.3, 0, 0];
        pose.hipsZ = 0.08;
        break;
      }

      case 'headStagger': {
        // Clutches its face and stumbles back.
        const u = t / Math.max(0.01, this.stateDuration);
        const stumble = Math.sin(t * 9);
        const recover = Math.max(0, (u - 0.75) / 0.25);
        j.spine = [0.3 * (1 - recover) - hunch * recover, 0, 0.1 * Math.sin(t * 5)];
        j.neck = [0.25 * (1 - recover), 0, 0];
        j.head = [0.4 * (1 - recover), 0, 0.15 * Math.sin(t * 4)];
        j.shoulderL = [2.25, 0, 0.45];
        j.shoulderR = [2.25, 0, -0.45];
        j.elbowL = [1.95, 0, 0];
        j.elbowR = [1.95, 0, 0];
        j.hipL = [0.3 * stumble, 0, 0];
        j.hipR = [-0.3 * stumble, 0, 0];
        j.kneeL = [-0.2 - 0.4 * Math.max(0, stumble), 0, 0];
        j.kneeR = [-0.2 - 0.4 * Math.max(0, -stumble), 0, 0];
        pose.hipsY = -0.06;
        pose.hipsZ = 0.06;
        break;
      }

      case 'kneel': {
        // Down on one knee, hunched over, a hand on the other knee.
        const down = this.kneelSide;
        const up = down === 'L' ? 'R' : 'L';
        const sign = down === 'L' ? 1 : -1;
        j.spine = [-0.5, 0, 0.08 * sign];
        j.neck = [0.2, 0, 0];
        j.head = [0.15, 0, 0.1];
        j[`hip${down}`] = [-0.08, 0, 0];
        j[`knee${down}`] = [-1.6, 0, 0];
        j[`ankle${down}`] = [0.7, 0, 0];
        j[`hip${up}`] = [1.45, 0, 0];
        j[`knee${up}`] = [-1.5, 0, 0];
        j[`ankle${up}`] = [0.05, 0, 0];
        j[`shoulder${up}`] = [0.75, 0, up === 'R' ? -0.1 : 0.1];
        j[`elbow${up}`] = [0.5, 0, 0];
        j[`shoulder${down}`] = [0.35, 0, down === 'R' ? 0.15 : -0.15];
        j[`elbow${down}`] = [0.3, 0, 0];
        pose.hipsY = -0.47;
        pose.hipsZ = 0.08;
        break;
      }

      case 'trip':
      case 'down':
      case 'crawlFall': {
        // Falls flat on its face, arms thrown forward.
        const timed = this.state !== 'down';
        const u = timed ? easeIn(Math.min(1, t / Math.max(0.01, this.stateDuration))) : 1;
        const twitch = this.state === 'down' ? Math.sin(t * 13) * 0.04 * Math.max(0, 1 - t) : 0;
        pose.bodyPitch = -1.5 * u;
        pose.bodyLift = 0.13 * u;
        j.spine = [0.1 * u, 0, 0];
        j.neck = [0.4 * u, 0, 0];
        j.head = [0.2 * u, 0, 0.6 * u + twitch];
        j.shoulderL = [2.6 * u + 0.4, 0, -0.3];
        j.shoulderR = [2.4 * u + 0.4, 0, 0.35];
        j.elbowL = [0.4, 0, 0];
        j.elbowR = [0.6, 0, 0];
        j.hipL = [0.05, 0, -0.08];
        j.hipR = [-0.1, 0, 0.12];
        j.kneeR = [-0.3, 0, 0];
        break;
      }

      case 'crawl':
        crawl(0);
        break;

      case 'clawWindup':
        crawl(Math.min(1, t / Math.max(0.01, this.stateDuration)));
        break;

      case 'claw':
        crawl(0);
        j.shoulderR = [2.0, 0, 0.3];
        j.elbowR = [0.1, 0, 0];
        j.neck = [0.6, 0, 0];
        break;

      case 'knockdown':
      case 'downBack': {
        // Blown backwards off its feet, landing flat on its back.
        const u = this.state === 'knockdown' ? easeIn(Math.min(1, t / this.stateDuration)) : 1;
        const twitch = this.state === 'downBack' ? Math.sin(t * 11) * 0.05 * Math.max(0, 1 - t) : 0;
        pose.bodyPitch = 1.5 * u;
        pose.bodyRoll = this.fallRoll * u;
        pose.bodyLift = 0.13 * u;
        j.spine = [0.15 * (1 - u), 0, 0];
        j.neck = [-0.2 * u, 0, 0];
        j.head = [-0.15 * u, 0, 0.5 * u + twitch];
        // Arms fly up as it goes over, then flop out to the sides.
        j.shoulderL = [1.8 * (1 - u) + 0.4 * u, 0, -0.3 - 1.0 * u];
        j.shoulderR = [1.8 * (1 - u) + 0.3 * u, 0, 0.3 + 1.1 * u];
        j.elbowL = [0.5, 0, 0];
        j.elbowR = [0.3, 0, 0];
        j.hipL = [0.6 * Math.sin(u * Math.PI) + 0.1, 0, -0.12];
        j.hipR = [0.4 * Math.sin(u * Math.PI), 0, 0.1];
        j.kneeL = [-0.4, 0, 0];
        j.kneeR = [-0.15, 0, 0];
        break;
      }

      case 'carried': {
        // Lifted off its feet: legs kick, arms flail.
        const flail = Math.sin(t * 13);
        j.spine = [0.25, 0, 0.1 * flail];
        j.neck = [0.3, 0, 0];
        j.head = [0.4, 0, 0];
        j.shoulderL = [2.4 + 0.4 * flail, 0, -0.5];
        j.shoulderR = [2.4 - 0.4 * flail, 0, 0.5];
        j.elbowL = [0.5, 0, 0];
        j.elbowR = [0.5, 0, 0];
        j.hipL = [0.3 + 0.25 * flail, 0, -0.05];
        j.hipR = [0.3 - 0.25 * flail, 0, 0.05];
        j.kneeL = [-0.3, 0, 0];
        j.kneeR = [-0.3, 0, 0];
        break;
      }

      case 'getUp': {
        if (this.riseFrom === 'kneel') {
          // Just stands back up from one knee (the blender eases it).
          j.spine = [-hunch - 0.1, 0, 0];
          j.head = [0.12, 0, 0.1];
          arms(0.6, 0.2);
          pose.hipsY = -0.12;
          break;
        }
        // Pushes itself back up, stiffly (from its front or its back).
        const u = Math.min(1, t / Math.max(0.01, this.stateDuration));
        const lying = 1 - u;
        const side = this.riseFrom === 'back' ? 1 : -1;
        pose.bodyPitch = side * 1.5 * lying * lying;
        pose.bodyLift = 0.13 * lying;
        pose.hipsY = -0.35 * Math.sin(u * Math.PI);
        j.spine = [(this.riseFrom === 'back' ? -0.9 : -0.6) * Math.sin(u * Math.PI) - hunch * u, 0, 0];
        j.shoulderL = [1.2 * lying + 0.3, 0, 0];
        j.shoulderR = [1.2 * lying + 0.3, 0, 0];
        j.elbowL = [0.6, 0, 0];
        j.elbowR = [0.6, 0, 0];
        j.hipL = [1.0 * Math.sin(u * Math.PI), 0, 0];
        j.kneeL = [-1.2 * Math.sin(u * Math.PI), 0, 0];
        j.hipR = [0.6 * Math.sin(u * Math.PI), 0, 0];
        j.kneeR = [-0.9 * Math.sin(u * Math.PI), 0, 0];
        break;
      }

      case 'dying':
      case 'dead': {
        // Knees buckle, then it topples and goes limp.
        const buckle = Math.min(1, t / 0.22);
        const topple = this.state === 'dead' ? 1 : easeIn(Math.min(1, Math.max(0, (t - 0.1) / 0.6)));
        pose.hipsY = -0.25 * buckle * (1 - topple * 0.6);
        pose.bodyPitch = this.fallDir * 1.52 * topple;
        pose.bodyRoll = this.fallRoll * topple;
        pose.bodyLift = 0.12 * topple;
        pose.bodyZ = this.fallDir * 0.15 * topple;
        j.spine = [this.fallDir * 0.15 * topple, 0, this.fallRoll * 0.3];
        j.neck = [this.fallDir * 0.3, 0, 0];
        j.head = [this.fallDir * 0.35, 0, 0.5 * topple];
        j.shoulderL = [this.fallDir > 0 ? 1.4 * topple + 0.2 : 2.5 * topple, 0, -0.9 * topple];
        j.shoulderR = [this.fallDir > 0 ? 0.6 * topple + 0.2 : 2.2 * topple, 0, 1.1 * topple];
        j.elbowL = [0.5, 0, 0];
        j.elbowR = [0.9, 0, 0];
        j.hipL = [0.35 * buckle * (1 - topple) + 0.1, 0, -0.1];
        j.hipR = [0.2 * buckle * (1 - topple), 0, 0.15];
        j.kneeL = [-0.7 * buckle * (1 - topple) - 0.2, 0, 0];
        j.kneeR = [-0.5 * buckle * (1 - topple) - 0.4, 0, 0];
        break;
      }
    }
    return pose;
  }
}
