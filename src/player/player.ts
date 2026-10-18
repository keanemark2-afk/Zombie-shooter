import { MathUtils, Matrix4, Quaternion, Vector3, type Group } from 'three';
import {
  buildDrumShotgun,
  buildKnife,
  buildMagnum,
  buildPistol,
  buildPumpShotgun,
  buildRifle,
  buildRocketLauncher,
  buildSmg,
  type LongGunModel,
  type PistolModel,
} from '../characters/handheld';
import { pointBoneAt, reachTwoBone } from '../characters/ik';
import { playerLook } from '../characters/looks';
import { buildRig, PoseBlender, type Euler3, type JointName, type Pose, type Rig } from '../characters/rig';
import { Knife, type MeleeMove } from '../combat/melee';
import { ReticleFocus, swayOffset } from '../combat/reticle';
import { Gun, WEAPONS, type GunEvent, type WeaponDef, type WeaponId, type WeaponStats } from '../combat/weapons';
import { tuning } from '../config/tuning';
import type { World } from '../world/world';
import type { ShoulderCamera } from './shoulderCamera';

/** One update's worth of player controls, from keyboard/mouse or gamepad. */
export interface PlayerInput {
  /** -1 (left) .. 1 (right). */
  moveX: number;
  /** -1 (back) .. 1 (forward). */
  moveY: number;
  aim: boolean;
  firePressed: boolean;
  /** Trigger held down (automatic weapons keep firing). */
  fireHeld: boolean;
  reloadPressed: boolean;
  sprint: boolean;
  sprintPressed: boolean;
  /** Melee / action button pressed (F / Cross). */
  meleePressed: boolean;
  /** Knife button pressed (V / R1) and whether it is held. */
  knifePressed: boolean;
  knifeHeld: boolean;
  /** A quick-slot number pressed this update (1, 2, 3...), or null. */
  weaponSlot: number | null;
  /** -1 / +1 to cycle to the previous / next weapon, 0 for none. */
  weaponCycle: number;
}

export const NO_INPUT: PlayerInput = {
  moveX: 0,
  moveY: 0,
  aim: false,
  firePressed: false,
  fireHeld: false,
  reloadPressed: false,
  sprint: false,
  sprintPressed: false,
  meleePressed: false,
  knifePressed: false,
  knifeHeld: false,
  weaponSlot: null,
  weaponCycle: 0,
};

/** Moments in a melee move that the game acts on. */
export type MeleePhase = 'impact' | 'grab' | 'slam' | 'release' | 'end';

/** Things the player asks the rest of the game to do. */
export interface PlayerHost {
  /** Pull the trigger: the game traces the bullet(s) and plays the effects. */
  fire(): void;
  dryFire(): void;
  /** A reload, pump or casing moment from the gun in your hands. */
  gunEvent(event: GunEvent): void;
  footstep(pos: Vector3, sprinting: boolean): void;
  /** The knife slash reaches out right now. */
  knifeSlash(): void;
  /** A kick lands, a suplex lifts or slams, a stab goes in. */
  meleeEvent(move: MeleeMove, phase: MeleePhase): void;
}

const IK_JOINTS: JointName[] = ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR'];
const UPPER_ARM = 0.29;
const LOWER_ARM = 0.32;
/** Seconds into a slash when the blade reaches out. */
const SLASH_HIT = 0.1;

/** When each melee move's moments happen, as fractions of the move. */
const MELEE_TIMING: Record<MeleeMove, Partial<Record<MeleePhase, number>>> = {
  roundhouse: { impact: 0.33 },
  frontKick: { impact: 0.38 },
  suplex: { grab: 0.1, slam: 0.5, release: 0.72 },
  finisher: { impact: 0.55 },
};

const tmp = new Vector3();
const tmp2 = new Vector3();
const tmp3 = new Vector3();
const moveDir = new Vector3();
const butt = new Vector3();
const aimDir = new Vector3();
const basisX = new Vector3();
const basisY = new Vector3();
const basisZ = new Vector3();
const basis = new Matrix4();

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function smooth(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function smoothstep(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** 0 outside [a, b], rising to 1 in the middle and back to 0. */
function bump(u: number, a: number, b: number): number {
  if (u <= a || u >= b) return 0;
  return Math.sin(((u - a) / (b - a)) * Math.PI);
}

export class Player {
  readonly rig: Rig;
  readonly pistols = new Map<WeaponId, PistolModel>();
  readonly longGuns = new Map<WeaponId, LongGunModel>();
  readonly guns: Gun[];
  readonly knife = new Knife(tuning.knife.durability);
  readonly reticle = new ReticleFocus();
  readonly position = new Vector3();
  readonly prevPosition = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  prevYaw = 0;

  aiming = false;
  sprinting = false;
  stunTime = 0;
  quickTurnTime = 0;
  /** Index into `guns` of the weapon in your hands. */
  current = 0;
  /** Seconds left of a weapon swap (0 = not swapping). */
  switchTime = 0;
  private switchTo = -1;

  /** The melee move being performed, if any. */
  melee: MeleeMove | null = null;
  meleeTime = 0;
  meleeDuration = 1;
  /** Seconds left of the current knife slash. */
  knifeTime = 0;
  /** How long ago the knife button was last pressed (for parry timing). */
  sinceKnifePress = 999;
  /** Holding the knife up to block. */
  guarding = false;
  /** Held in a zombie's grip. */
  grabbed = false;

  private readonly knifeModel: Group;
  private readonly blender = new PoseBlender();
  private readonly baseQuats = new Map<JointName, Quaternion>();
  private phase = 0;
  private aimWeight = 0;
  private sprintWeight = 0;
  private reloadWeight = 0;
  private knifeWeight = 0;
  private recoilAnim = 0;
  private swayTime = 0;
  private stepTimer = 0;
  private lastCameraYaw = 0;
  private lastCameraPitch = 0;
  private readonly push = new Vector3();
  private turnBodyFrom = 0;
  private turnBodyBy = 0;
  private grabTime = 0;
  private readonly meleeStart = new Vector3();
  private readonly meleeAnchor = new Vector3();
  private meleeYaw = 0;
  private readonly meleeDone = new Set<MeleePhase>();

  constructor() {
    this.rig = buildRig(playerLook());
    this.pistols.set('pistol', buildPistol());
    this.pistols.set('magnum', buildMagnum());
    for (const model of this.pistols.values()) this.rig.handR.add(model.group);
    this.longGuns.set('pump', buildPumpShotgun());
    this.longGuns.set('drum', buildDrumShotgun());
    this.longGuns.set('smg', buildSmg());
    this.longGuns.set('rifle', buildRifle());
    this.longGuns.set('rocket', buildRocketLauncher());
    for (const model of this.longGuns.values()) {
      model.group.visible = false;
      model.action.userData.restZ = model.action.position.z;
      this.rig.root.add(model.group);
    }
    this.knifeModel = buildKnife();
    this.knifeModel.visible = false;
    this.rig.handL.add(this.knifeModel);
    this.guns = WEAPONS.map((def) => new Gun(def));
    for (const j of IK_JOINTS) this.baseQuats.set(j, new Quaternion());
  }

  get object() {
    return this.rig.root;
  }

  get gun(): Gun {
    return this.guns[this.current];
  }

  get def(): WeaponDef {
    return this.gun.def;
  }

  get stats(): WeaponStats {
    return this.gun.stats;
  }

  /** The weapon being switched to, or the one in your hands. */
  get selected(): number {
    return this.switchTo >= 0 ? this.switchTo : this.current;
  }

  get switching(): boolean {
    return this.switchTime > 0;
  }

  /** 0 = wide reticle, 1 = fully focused. */
  get focus(): number {
    return this.reticle.focus(this.stats);
  }

  /** Kicking, suplexing, stabbing or caught in a grab: no shooting or walking. */
  get busy(): boolean {
    return this.melee !== null || this.grabbed;
  }

  /** Can't be hit or grabbed right now. */
  get invulnerable(): boolean {
    return this.melee !== null && tuning.melee.invulnerable;
  }

  /** 0..1 progress through the current melee move. */
  get meleeProgress(): number {
    return this.melee ? Math.min(1, this.meleeTime / this.meleeDuration) : 0;
  }

  /** Looking through the rifle scope. */
  get scoped(): boolean {
    return this.aiming && this.def.scope && this.aimWeight > 0.85;
  }

  private gunModel(): { muzzle: { getWorldPosition(v: Vector3): Vector3 }; laser: { getWorldPosition(v: Vector3): Vector3 }; ejectionPort: { getWorldPosition(v: Vector3): Vector3 } } {
    return this.longGuns.get(this.def.id) ?? this.pistols.get(this.def.id) ?? this.pistols.get('pistol')!;
  }

  /** The barrel end and laser module of the gun in your hands (world positions). */
  muzzleWorld(out: Vector3): Vector3 {
    return this.gunModel().muzzle.getWorldPosition(out);
  }

  laserWorld(out: Vector3): Vector3 {
    return this.gunModel().laser.getWorldPosition(out);
  }

  ejectionWorld(out: Vector3): Vector3 {
    return this.gunModel().ejectionPort.getWorldPosition(out);
  }

  /** Where the knife blade is (for sparks). */
  knifeWorld(out: Vector3): Vector3 {
    return this.knifeModel.localToWorld(out.set(0, 0, -0.12));
  }

  /** Where the player is facing on the ground. */
  forward(out: Vector3): Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  spawn(x: number, z: number, yaw: number, world: World): void {
    this.position.set(x, world.groundHeight(x, z), z);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.yaw = this.prevYaw = yaw;
    for (const g of this.guns) g.reset();
    const start = this.guns.findIndex((g) => g.def.id === tuning.weapons.startWeapon);
    this.current = start >= 0 ? start : 0;
    this.switchTime = 0;
    this.switchTo = -1;
    this.stunTime = 0;
    this.quickTurnTime = 0;
    this.melee = null;
    this.knifeTime = 0;
    this.sinceKnifePress = 999;
    this.guarding = false;
    this.grabbed = false;
    this.knife.repair(tuning.knife.durability);
    this.blender.snap(this.pose());
    this.blender.apply(this.rig);
  }

  /** Where the laser points this instant: camera aim plus the reticle wobble. */
  laserDirection(cam: ShoulderCamera, out: Vector3): Vector3 {
    cam.aimDirection(out);
    const spread = MathUtils.degToRad(this.reticle.spread);
    if (spread <= 0) return out;
    const sway = swayOffset(this.swayTime * this.stats.swaySpeed);
    const right = tmp.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    const up = tmp2.crossVectors(right, out).normalize();
    return out.addScaledVector(right, Math.tan(spread) * sway.x).addScaledVector(up, Math.tan(spread) * sway.y).normalize();
  }

  /** Something hit us: brief stun and a shove (`push` metres or so). */
  hurt(from: Vector3, push = tuning.zombie.attackPush): void {
    this.stunTime = tuning.player.hitStunTime;
    this.push.subVectors(this.position, from).setY(0).normalize().multiplyScalar(push * 5);
    this.blender.kick('spine', 7, 0, 0);
    this.blender.kick('head', 6, 0, 0);
    this.aiming = false;
  }

  /** A parry knocks us back a little. */
  nudge(from: Vector3, push: number): void {
    this.push.subVectors(this.position, from).setY(0).normalize().multiplyScalar(push * 5);
    this.blender.kick('spine', 3, 0, 0);
  }

  /** Starts a kick, suplex or finisher: glide to `anchor`, face `faceYaw`. */
  startMelee(move: MeleeMove, anchor: Vector3, faceYaw: number): void {
    const m = tuning.melee;
    this.melee = move;
    this.meleeTime = 0;
    this.meleeDuration = move === 'roundhouse' ? m.kickTime : move === 'frontKick' ? m.frontKickTime : move === 'suplex' ? m.suplexTime : m.finisherTime;
    this.meleeStart.copy(this.position);
    this.meleeAnchor.copy(anchor);
    this.meleeYaw = this.yaw + angleDiff(this.yaw, faceYaw);
    this.meleeDone.clear();
    this.aiming = false;
    this.knifeTime = 0;
    this.gun.cancelReload();
  }

  /** A quick stab (used to knife free of a grab). */
  stab(): void {
    this.knifeTime = tuning.knife.slashTime;
  }

  private startSwitch(index: number): void {
    if (index === this.current && this.switchTo < 0) return;
    if (index < 0 || index >= this.guns.length) return;
    this.gun.cancelReload();
    this.switchTo = index;
    this.switchTime = tuning.weapons.switchTime;
  }

  tick(dt: number, input: PlayerInput, cam: ShoulderCamera, world: World, host: PlayerHost): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.swayTime += dt;
    this.stunTime = Math.max(0, this.stunTime - dt);
    this.recoilAnim *= Math.exp(-12 * dt);
    this.sinceKnifePress += dt;

    // Knife: a quick slash, or held up to block.
    if (input.knifePressed && !this.busy) {
      this.sinceKnifePress = 0;
      if (this.knifeTime <= 0.05) this.knifeTime = tuning.knife.slashTime;
    }
    if (this.knifeTime > 0) {
      const before = tuning.knife.slashTime - this.knifeTime;
      this.knifeTime = Math.max(0, this.knifeTime - dt);
      const after = tuning.knife.slashTime - this.knifeTime;
      if (before < SLASH_HIT && after >= SLASH_HIT && !this.grabbed) host.knifeSlash();
    }
    this.guarding = input.knifeHeld && !this.busy && !this.knife.broken && this.sinceKnifePress > 0.12;

    if (this.melee) {
      this.tickMelee(dt, world, host);
    } else if (this.grabbed) {
      this.grabTime += dt;
      this.aiming = false;
      this.sprinting = false;
      this.velocity.set(0, 0, 0);
    } else {
      this.grabTime = 0;
      this.tickMove(dt, input, cam, world);
    }

    // Reticle focus: swinging the camera or walking widens it.
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const turnDeg = MathUtils.radToDeg(Math.abs(angleDiff(this.lastCameraYaw, cam.yaw)) + Math.abs(cam.pitch - this.lastCameraPitch));
    this.lastCameraYaw = cam.yaw;
    this.lastCameraPitch = cam.pitch;
    const quickTurning = this.quickTurnTime > 0 || cam.quickTurning;
    this.reticle.update(dt, this.aiming, horizSpeed > 0.3, quickTurning ? 0 : turnDeg, this.stats);

    this.updateGun(dt, input, cam, host);

    // Footsteps.
    this.stepTimer -= horizSpeed * dt;
    if (this.stepTimer <= 0 && horizSpeed > 0.5) {
      this.stepTimer = this.sprinting ? 1.1 : 0.8;
      host.footstep(this.position, this.sprinting);
    }

    const stride = this.sprinting ? 1.7 : 1.0;
    this.phase += (horizSpeed / stride) * Math.PI * dt;
    this.aimWeight = smooth(this.aimWeight, this.aiming ? 1 : 0, 18, dt);
    this.sprintWeight = smooth(this.sprintWeight, this.sprinting ? 1 : 0, 10, dt);
    this.reloadWeight = smooth(this.reloadWeight, this.gun.reloading ? 1 : 0, 12, dt);
    this.knifeWeight = smooth(this.knifeWeight, this.knifeTime > 0 || this.guarding ? 1 : 0, 28, dt);

    this.blender.update(this.pose(), dt, this.melee ? 18 : 12);
    this.blender.apply(this.rig);
    for (const j of IK_JOINTS) this.baseQuats.get(j)!.copy(this.rig.joints[j].quaternion);
  }

  /** Walking, sprinting, turning, aiming and weapon swaps. */
  private tickMove(dt: number, input: PlayerInput, cam: ShoulderCamera, world: World): void {
    const p = tuning.player;
    // Weapon swapping: keys 1-7, mouse wheel, D-pad left/right.
    if (input.weaponSlot !== null) {
      const i = this.guns.findIndex((g) => g.def.slot === input.weaponSlot);
      if (i >= 0 && i !== this.current) this.startSwitch(i);
    } else if (input.weaponCycle !== 0) {
      const from = this.switchTo >= 0 ? this.switchTo : this.current;
      this.startSwitch((from + input.weaponCycle + this.guns.length) % this.guns.length);
    }
    if (this.switchTime > 0) {
      const total = tuning.weapons.switchTime;
      this.switchTime = Math.max(0, this.switchTime - dt);
      // Halfway through, the old gun is down and the new one comes up.
      if (this.switchTo >= 0 && this.switchTime <= total / 2) {
        this.current = this.switchTo;
        this.switchTo = -1;
      }
    }

    const stunned = this.stunTime > 0;
    const turning = this.quickTurnTime > 0;
    this.aiming = input.aim && !stunned && !turning && !this.switching;
    const moveLen = Math.min(1, Math.hypot(input.moveX, input.moveY));
    this.sprinting = input.sprint && !this.aiming && moveLen > 0.3 && !stunned;

    // Quick 180-degree turn: hold back and tap sprint while facing away from the
    // camera. (If you are already running back towards the camera, sprint just sprints.)
    const facingAway = Math.abs(angleDiff(this.yaw, cam.yaw)) < MathUtils.degToRad(70);
    if (p.quickTurn && input.sprintPressed && input.moveY < -0.5 && facingAway && !this.aiming && !turning && !stunned) {
      this.quickTurnTime = p.quickTurnTime;
      this.turnBodyFrom = this.yaw;
      this.turnBodyBy = angleDiff(this.yaw, cam.yaw + Math.PI);
      cam.startQuickTurn(p.quickTurnTime);
    }
    if (this.quickTurnTime > 0) {
      this.quickTurnTime = Math.max(0, this.quickTurnTime - dt);
      const u = 1 - this.quickTurnTime / p.quickTurnTime;
      this.yaw = this.turnBodyFrom + this.turnBodyBy * u * u * (3 - 2 * u);
      this.velocity.multiplyScalar(0.8);
    }

    // Movement relative to the camera.
    const camForward = tmp.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const camRight = tmp2.set(-camForward.z, 0, camForward.x);
    moveDir.set(0, 0, 0).addScaledVector(camForward, input.moveY).addScaledVector(camRight, input.moveX);
    if (moveDir.lengthSq() > 1) moveDir.normalize();
    let speed = this.sprinting ? p.sprintSpeed : p.walkSpeed;
    if (this.aiming) speed = p.classicAim || this.def.scope ? 0 : p.aimWalkSpeed;
    if (stunned || turning) speed = 0;
    const wish = moveDir.multiplyScalar(speed);
    const accel = 1 - Math.exp(-p.acceleration * dt);
    this.velocity.x += (wish.x - this.velocity.x) * accel;
    this.velocity.z += (wish.z - this.velocity.z) * accel;
    this.position.addScaledVector(this.velocity, dt);
    this.position.addScaledVector(this.push, dt);
    this.push.multiplyScalar(Math.exp(-8 * dt));
    world.resolveCircle(this.position, p.radius);
    this.position.y = world.groundHeight(this.position.x, this.position.z);

    // Facing: towards the aim while aiming, otherwise towards where we're going.
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!turning) {
      let targetYaw: number | null = null;
      let rate = MathUtils.degToRad(p.turnSpeed);
      if (this.aiming) {
        targetYaw = cam.yaw;
        rate *= 2.5;
      } else if (horizSpeed > 0.3 && moveLen > 0.1) {
        targetYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
      }
      if (targetYaw !== null) {
        const d = angleDiff(this.yaw, targetYaw);
        this.yaw += MathUtils.clamp(d, -rate * dt, rate * dt);
      }
    }
  }

  /** A melee move plays out: glide into place, then the kick, slam or stab lands on cue. */
  private tickMelee(dt: number, world: World, host: PlayerHost): void {
    const move = this.melee!;
    this.aiming = false;
    this.sprinting = false;
    this.velocity.set(0, 0, 0);
    this.meleeTime += dt;
    const u = this.meleeTime / this.meleeDuration;
    const g = smoothstep(this.meleeTime / 0.15);
    this.position.lerpVectors(this.meleeStart, this.meleeAnchor, g);
    world.resolveCircle(this.position, tuning.player.radius);
    this.position.y = world.groundHeight(this.position.x, this.position.z);
    // The roundhouse spins all the way round; everything else just faces the target.
    this.yaw = this.meleeYaw + (move === 'roundhouse' ? Math.PI * 2 * smoothstep(u) : 0);

    const timing = MELEE_TIMING[move];
    for (const phase of ['grab', 'impact', 'slam', 'release'] as MeleePhase[]) {
      const at = timing[phase];
      if (at !== undefined && u >= at && !this.meleeDone.has(phase)) {
        this.meleeDone.add(phase);
        host.meleeEvent(move, phase);
      }
    }
    if (u >= 1) {
      this.melee = null;
      this.yaw = this.meleeYaw;
      this.prevYaw = this.yaw;
      host.meleeEvent(move, 'end');
    }
  }

  private updateGun(dt: number, input: PlayerInput, cam: ShoulderCamera, host: PlayerHost): void {
    const gun = this.gun;
    const infinite = tuning.weapons.infiniteAmmo;
    gun.tick(dt, infinite, (e) => host.gunEvent(e));
    if (this.switching || this.busy) return;

    if (input.reloadPressed) gun.startReload(infinite);

    const trigger = gun.def.auto ? input.fireHeld || input.firePressed : input.firePressed;
    if (trigger && this.aiming && this.stunTime <= 0) {
      const result = gun.pullTrigger();
      if (result === 'fired') {
        const s = gun.stats;
        this.recoilAnim = 1;
        host.fire();
        if (gun.def.cycle === 'none' && gun.def.casing !== 'none') host.gunEvent('eject');
        this.reticle.onFire(s);
        cam.kick(s.recoilKick, (Math.random() - 0.5) * 2 * s.recoilSideways);
        this.blender.kick('spine', gun.def.hold === 'long' ? 4 : gun.def.id === 'magnum' ? 3 : 1.5, 0, 0);
      } else if (result === 'empty' && input.firePressed) {
        host.dryFire();
        gun.startReload(infinite);
      }
    }
    // The rocket launcher loads its next rocket by itself.
    if (gun.def.projectile && gun.ammo === 0 && !gun.reloading && gun.cooldown <= 0) gun.startReload(infinite);
    // The pistol slide is drawn from the gun's action (stays back when empty).
    if (gun.def.id === 'pistol') this.pistols.get('pistol')!.slide.position.y = -0.075 + gun.action * 0.035;
  }

  /** Called every rendered frame: smooth position, then place the gun and arms. */
  render(alpha: number, aimPoint: Vector3 | null, cam: ShoulderCamera): void {
    const root = this.rig.root;
    root.position.lerpVectors(this.prevPosition, this.position, alpha);
    root.rotation.y = this.prevYaw + angleDiff(this.prevYaw, this.yaw) * alpha;
    // Hide the body if the camera is squeezed right up against it, or looking through the scope.
    root.visible = cam.distance > 0.35 && !this.scoped;
    for (const j of IK_JOINTS) this.rig.joints[j].quaternion.copy(this.baseQuats.get(j)!);
    root.updateMatrixWorld(true);

    const longModel = this.longGuns.get(this.def.id) ?? null;
    for (const [id, model] of this.pistols) model.group.visible = longModel === null && id === this.def.id;
    for (const [id, model] of this.longGuns) {
      model.group.visible = id === this.def.id;
      if (model.loaded) model.loaded.visible = this.guns.find((g) => g.def.id === id)!.ammo > 0;
    }
    this.knifeModel.visible = this.knifeTime > 0 || this.guarding || this.knifeWeight > 0.3 || this.melee === 'finisher';

    if (longModel) this.holdLongGun(longModel, aimPoint);
    else this.holdPistol(aimPoint);
  }

  /** 0 at the start and end of a weapon swap, 1 at the halfway point (gun lowered). */
  private get switchLower(): number {
    if (!this.switching) return 0;
    const u = 1 - this.switchTime / tuning.weapons.switchTime;
    return 1 - Math.abs(2 * u - 1);
  }

  private holdPistol(aimPoint: Vector3 | null): void {
    const w = this.aimWeight;
    if (w <= 0.01 || !aimPoint || this.busy) return;
    const j = this.rig.joints;
    // Right arm: nearly straight, pointing the gun at the aim point.
    j.shoulderR.getWorldPosition(tmp);
    tmp2.subVectors(aimPoint, tmp).normalize();
    const reach = tmp3.copy(tmp).addScaledVector(tmp2, (UPPER_ARM + LOWER_ARM) * 0.93);
    const poleR = new Vector3(Math.cos(this.yaw) * 0.6, -1, -Math.sin(this.yaw) * 0.6);
    reachTwoBone(j.shoulderR, j.elbowR, UPPER_ARM, LOWER_ARM, reach, poleR, w);
    j.wristR.updateWorldMatrix(true, false);
    pointBoneAt(j.wristR, aimPoint, w);
    // Recoil flips the muzzle up for an instant (the big revolver kicks hard).
    j.wristR.rotateX(this.recoilAnim * (this.def.id === 'magnum' ? 0.7 : 0.35) * w);
    j.wristR.updateWorldMatrix(true, true);

    // Left hand supports the grip (unless it's busy reloading or using the knife).
    const leftWeight = (this.gun.reloading ? w * 0.15 : w) * (1 - this.knifeWeight);
    const model = this.pistols.get(this.def.id) ?? this.pistols.get('pistol')!;
    const grip = model.group.localToWorld(tmp.set(-0.035, 0.0, 0.035));
    const poleL = new Vector3(-Math.cos(this.yaw), -1, Math.sin(this.yaw));
    reachTwoBone(j.shoulderL, j.elbowL, UPPER_ARM, LOWER_ARM, grip, poleL, leftWeight);
  }

  /**
   * Long guns: the stock sits in the right shoulder while aiming and the gun is
   * carried low across the body otherwise. Both hands reach for the gun. During
   * kicks and grabs it hangs across the back on its sling.
   */
  private holdLongGun(model: LongGunModel, aimPoint: Vector3 | null): void {
    const root = this.rig.root;
    const j = this.rig.joints;
    const gun = this.gun;

    if (this.busy) {
      // Slung across the back, muzzle down, so both hands are free.
      basisZ.set(0.45, 0.8, 0.25).normalize();
      basisY.set(0, 0, 1);
      basisX.crossVectors(basisY, basisZ).normalize();
      basisY.crossVectors(basisZ, basisX).normalize();
      basis.makeBasis(basisX, basisY, basisZ);
      model.group.position.set(-0.05, 0.95, 0.2);
      model.group.quaternion.setFromRotationMatrix(basis);
      model.group.updateMatrixWorld(true);
      return;
    }

    // Carry positions, in the character's own space (x right, y up, -z forward).
    butt.set(0.19, 1.0, 0.12);
    aimDir.set(-0.22, -0.42, -1).normalize();
    let roll = 0;
    const blendTo = (b: Vector3, d: Vector3, w: number) => {
      if (w <= 0) return;
      butt.lerp(b, w);
      aimDir.lerp(d, w).normalize();
    };
    blendTo(tmp.set(0.16, 1.15, 0.05), tmp2.set(-0.75, 0.55, -0.45).normalize(), this.sprintWeight);
    if (gun.reloading || this.reloadWeight > 0.01) {
      blendTo(tmp.set(0.12, 1.08, -0.02), tmp2.set(-0.3, 0.02, -1).normalize(), this.reloadWeight);
      roll += 0.75 * this.reloadWeight;
    }
    if (this.aimWeight > 0.01) {
      // Stock in the shoulder pocket, barrel straight at the aim point.
      root.worldToLocal(j.shoulderR.getWorldPosition(tmp3)).add(tmp.set(-0.06, -0.05, 0.03));
      const target = aimPoint ? root.worldToLocal(tmp2.copy(aimPoint)).sub(tmp3).normalize() : tmp2.set(0, 0, -1);
      const w = this.aimWeight * (1 - this.reloadWeight * 0.6);
      blendTo(tmp3, target, w);
      roll *= 1 - w;
    }
    blendTo(tmp.set(0.22, 0.86, 0.18), tmp2.set(-0.1, -0.9, -0.4).normalize(), this.switchLower);

    // Recoil: kicks back into the shoulder and the muzzle climbs.
    butt.addScaledVector(aimDir, -0.07 * this.recoilAnim);
    aimDir.y += 0.3 * this.recoilAnim;
    aimDir.normalize();

    // Turn the direction into an orientation (gun barrel along -z).
    basisZ.copy(aimDir).negate();
    basisY.set(Math.sin(roll), Math.cos(roll), 0);
    basisX.crossVectors(basisY, basisZ).normalize();
    basisY.crossVectors(basisZ, basisX).normalize();
    basis.makeBasis(basisX, basisY, basisZ);
    model.group.position.copy(butt);
    model.group.quaternion.setFromRotationMatrix(basis);
    model.action.position.z = (model.action.userData.restZ as number) + gun.action * model.actionTravel;
    model.group.updateMatrixWorld(true);

    // Hands on the gun (the left lets go to use the knife).
    // Right elbow tucked down (not out to the side) so the gun stays visible.
    const poleR = tmp3.set(Math.cos(this.yaw) * 0.25, -1, -Math.sin(this.yaw) * 0.25);
    const grip = model.grip.getWorldPosition(tmp);
    reachTwoBone(j.shoulderR, j.elbowR, UPPER_ARM, LOWER_ARM, grip, poleR, 1);
    const leftW = 1 - this.knifeWeight;
    const left = this.leftHandTarget(model, tmp2);
    const poleL = new Vector3(-Math.cos(this.yaw) * 0.8, -1, Math.sin(this.yaw) * 0.8);
    reachTwoBone(j.shoulderL, j.elbowL, UPPER_ARM, LOWER_ARM, left, poleL, leftW);
    const forward = tmp3.copy(aimDir).transformDirection(root.matrixWorld);
    j.wristR.updateWorldMatrix(true, false);
    pointBoneAt(j.wristR, j.wristR.getWorldPosition(new Vector3()).addScaledVector(forward, 0.2), 1);
    j.wristL.updateWorldMatrix(true, false);
    pointBoneAt(j.wristL, j.wristL.getWorldPosition(new Vector3()).addScaledVector(forward, 0.2), leftW);
  }

  /** Where the left hand goes: the fore-end, or to the belt and back while reloading. */
  private leftHandTarget(model: LongGunModel, out: Vector3): Vector3 {
    const gun = this.gun;
    const fore = model.fore.getWorldPosition(new Vector3());
    if (!gun.reloading) return out.copy(fore);
    const belt = this.rig.root.localToWorld(tmp3.set(-0.12, 0.93, -0.12));
    const phase = gun.reloadPhase;
    const u = gun.reloadProgress;
    const port = model.reloadPoint.getWorldPosition(new Vector3());
    if (phase === 'load') {
      // Fetch a shell from the belt and thumb it into the loading port.
      const t = u < 0.5 ? u * 2 : 2 - u * 2;
      return out.copy(port).lerp(belt, Math.sin(t * Math.PI * 0.5));
    }
    if (phase === 'magazine') {
      // Pull the old magazine off, grab a fresh one from the belt, slap it in.
      if (u < 0.25) return out.copy(fore).lerp(port, u / 0.25);
      if (u < 0.6) return out.copy(port).lerp(belt, Math.sin(((u - 0.25) / 0.35) * Math.PI));
      if (u < 0.85) return out.copy(port);
      return out.copy(port).lerp(fore, (u - 0.85) / 0.15);
    }
    return out.copy(fore);
  }

  // -------------------------------------------------------------------------

  private pose(): Pose {
    if (this.melee) return this.meleePose(this.melee, this.meleeProgress);
    const j: Partial<Record<JointName, Euler3>> = {};
    const pose: Pose = { j };
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = Math.min(1, speed / 2.5);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const long = this.def.hold === 'long';

    const legs = (amp: number, kneeAmp: number) => {
      j.hipL = [0.45 * amp * s, 0, 0];
      j.hipR = [-0.45 * amp * s, 0, 0];
      j.kneeL = [-(0.05 + kneeAmp * Math.max(0, c)), 0, 0];
      j.kneeR = [-(0.05 + kneeAmp * Math.max(0, -c)), 0, 0];
      j.ankleL = [0.2 * Math.max(0, c) * amp, 0, 0];
      j.ankleR = [0.2 * Math.max(0, -c) * amp, 0, 0];
    };

    if (this.grabbed) {
      // Pushing a zombie away from your neck.
      const t = this.grabTime;
      const sh = Math.sin(t * 9);
      j.spine = [0.28, 0.15 * sh, 0];
      j.neck = [0.2, 0, 0];
      j.head = [0.25, 0.35 * Math.sin(t * 5), 0];
      j.shoulderL = [1.35, 0, 0.3];
      j.shoulderR = [1.35, 0, -0.3];
      j.elbowL = [0.9 + 0.25 * sh, 0, 0];
      j.elbowR = [0.9 - 0.25 * sh, 0, 0];
      j.hipL = [0.3, 0, 0];
      j.kneeL = [-0.45, 0, 0];
      j.hipR = [-0.35, 0, 0];
      j.kneeR = [-0.2, 0, 0];
      pose.hipsY = -0.08;
      pose.hipsZ = 0.05;
      this.knifeArm(j);
      return pose;
    }

    if (this.sprinting) {
      legs(1.6, 1.4);
      j.spine = [-0.3, 0.1 * s, 0];
      j.neck = [0.15, 0, 0];
      j.head = [0.1, 0, 0];
      j.shoulderL = [-0.8 * s, 0, -0.1];
      j.elbowL = [1.3, 0, 0];
      j.shoulderR = [0.6 + 0.5 * s, 0, 0.1];
      j.elbowR = [1.5, 0, 0];
      j.wristR = [0.4, 0, 0];
      pose.hipsY = -0.05 + 0.05 * Math.abs(c);
    } else if (this.aiming || this.aimWeight > 0.5) {
      legs(moving * 0.6, moving * 0.6);
      if (moving < 0.1) {
        j.hipL = [0.12, 0, -0.08];
        j.hipR = [-0.15, 0, 0.08];
        j.kneeL = [-0.15, 0, 0];
        j.kneeR = [-0.2, 0, 0];
      }
      // Lean the upper body and head with the aim's up/down angle.
      const pitch = this.lastCameraPitch;
      if (long) {
        // Shouldered stance: shoulders turned a little, cheek down on the stock.
        j.spine = [-0.1 + pitch * 0.35, -0.2, 0];
        j.neck = [pitch * 0.2, 0.1, 0];
        j.head = [0.1 + pitch * 0.3, 0.12, 0.12];
      } else {
        j.spine = [-0.06 + pitch * 0.35, -0.1, 0];
        j.neck = [pitch * 0.2, 0.05, 0];
        j.head = [0.05 + pitch * 0.35, 0.05, 0];
      }
      j.shoulderR = [1.45, 0, 0];
      j.shoulderL = [1.35, 0, 0.55];
      j.elbowL = [0.7, 0, 0];
      pose.hipsY = -0.03;
    } else {
      legs(moving, moving * 0.9);
      j.spine = [-0.04 - 0.08 * moving, 0.08 * s * moving, 0];
      j.neck = [0.03, 0, 0];
      j.shoulderL = [-0.45 * s * moving + 0.05, 0, -0.08];
      j.elbowL = [0.25 + 0.2 * moving, 0, 0];
      // Gun held low and ready.
      j.shoulderR = [0.35, 0, 0.12];
      j.elbowR = [0.95, 0, 0];
      j.wristR = [0.55, 0, 0];
      pose.hipsY = -0.02 + 0.03 * Math.abs(c) * moving;
    }

    const lower = this.switchLower;
    if (!long && lower > 0) {
      // Swapping: pistol hand drops to the hip.
      j.shoulderR = [0.1 * (1 - lower) + 0.35 * (1 - lower), 0, 0.15];
      j.elbowR = [0.95 * (1 - lower) + 0.2, 0, 0];
    }

    if (this.gun.reloading && !long) {
      // Left hand goes to the belt for a fresh magazine, then back to the gun.
      const u = this.gun.reloadProgress;
      const toBelt = u < 0.4;
      if (!this.aiming) {
        j.shoulderR = [0.7, 0, -0.35];
        j.elbowR = [1.7, 0, 0];
        j.wristR = [0.2, 0, 0.3];
      }
      j.shoulderL = toBelt ? [-0.25, 0, -0.25] : [0.95, 0, 0.7];
      j.elbowL = toBelt ? [0.9, 0, 0] : [1.7, 0, 0];
      j.head = [-0.25, 0, 0];
    } else if (this.gun.reloading) {
      j.head = [-0.3, 0.1, 0];
    }

    if (this.stunTime > 0) {
      j.spine = [0.25, 0, 0];
      j.head = [0.2, 0, 0];
      j.shoulderL = [0.9, 0, -0.4];
      j.shoulderR = [0.9, 0, 0.4];
      j.elbowL = [1.2, 0, 0];
      j.elbowR = [1.2, 0, 0];
    }
    this.knifeArm(j);
    return pose;
  }

  /** The left arm slashing with the knife, or holding it up to block. */
  private knifeArm(j: Partial<Record<JointName, Euler3>>): void {
    if (this.knifeTime > 0) {
      // A quick backhand sweep from across the chest out to the left.
      const u = smoothstep(1 - this.knifeTime / tuning.knife.slashTime);
      j.shoulderL = [1.4, 0, 1.0 - 2.1 * u];
      j.elbowL = [0.45 - 0.3 * u, 0, 0];
      j.wristL = [0, 0, 0.3];
      const spine = j.spine ?? [0, 0, 0];
      j.spine = [spine[0], spine[1] - 0.3 + 0.6 * u, spine[2]];
    } else if (this.guarding) {
      // Blade held up across the face.
      j.shoulderL = [1.3, 0, 0.75];
      j.elbowL = [1.55, 0, 0];
      j.wristL = [0.2, 0, 0.4];
    }
  }

  /** Whole-body poses for the kicks, the suplex and the finisher. */
  private meleePose(move: MeleeMove, u: number): Pose {
    const j: Partial<Record<JointName, Euler3>> = {};
    const pose: Pose = { j };
    switch (move) {
      case 'roundhouse': {
        // Spinning kick: right leg swung out to the side, body leaning away.
        const leg = bump(u, 0.08, 0.66);
        j.hipR = [0.35 * leg, 0, 1.35 * leg];
        j.kneeR = [-0.15 - 0.5 * (1 - leg), 0, 0];
        j.ankleR = [0.3 * leg, 0, 0];
        j.hipL = [0.1, 0, -0.1 * leg];
        j.kneeL = [-0.3, 0, 0];
        j.spine = [-0.05, 0.15 * leg, 0.5 * leg];
        j.neck = [0, 0, -0.3 * leg];
        j.shoulderL = [0.45, 0, -0.95];
        j.shoulderR = [0.35, 0, 0.75 - 0.4 * leg];
        j.elbowL = [0.7, 0, 0];
        j.elbowR = [1.0, 0, 0];
        pose.hipsY = -0.05 - 0.05 * leg;
        break;
      }
      case 'frontKick': {
        // Chamber the knee, then drive the foot straight out.
        const leg = bump(u, 0.06, 0.8);
        j.hipR = [1.7 * leg, 0, 0];
        j.kneeR = [-1.3 * (1 - leg) * Math.min(1, leg * 3), 0, 0];
        j.ankleR = [-0.3 * leg, 0, 0];
        j.hipL = [-0.1, 0, 0];
        j.kneeL = [-0.3, 0, 0];
        j.spine = [0.35 * leg, 0, 0];
        j.neck = [-0.15 * leg, 0, 0];
        j.shoulderL = [0.5, 0, -0.35];
        j.shoulderR = [0.5, 0, 0.35];
        j.elbowL = [1.4, 0, 0];
        j.elbowR = [1.4, 0, 0];
        pose.hipsZ = 0.08 * leg;
        break;
      }
      case 'suplex': {
        // Arms wrapped round its waist, then arch right back and slam it behind you.
        const a = u < 0.1 ? 0 : u < 0.5 ? smoothstep((u - 0.1) / 0.4) : 1 - smoothstep((u - 0.62) / 0.38);
        const wrap = Math.min(1, u / 0.1) * (u > 0.62 ? 1 - smoothstep((u - 0.62) / 0.25) : 1);
        j.spine = [-0.15 * (1 - a) + 1.3 * a, 0, 0];
        j.neck = [0.5 * a, 0, 0];
        j.head = [0.45 * a, 0, 0];
        j.shoulderL = [1.45 * wrap + 1.0 * a, 0, 0.35 * wrap];
        j.shoulderR = [1.45 * wrap + 1.0 * a, 0, -0.35 * wrap];
        j.elbowL = [1.1 * wrap, 0, 0];
        j.elbowR = [1.1 * wrap, 0, 0];
        j.hipL = [-0.25 * a, 0, -0.05];
        j.hipR = [-0.25 * a, 0, 0.05];
        j.kneeL = [-0.65 * a - 0.15, 0, 0];
        j.kneeR = [-0.65 * a - 0.15, 0, 0];
        j.ankleL = [0.3 * a, 0, 0];
        j.ankleR = [0.3 * a, 0, 0];
        pose.hipsY = -0.18 * a - 0.04;
        pose.hipsZ = -0.22 * a;
        break;
      }
      case 'finisher': {
        // Drop to one knee and drive the knife down.
        const c = u < 0.18 ? smoothstep(u / 0.18) : u > 0.85 ? 1 - smoothstep((u - 0.85) / 0.15) : 1;
        const raise = u < 0.48 ? smoothstep((u - 0.1) / 0.3) : 0;
        const stab = u >= 0.48 && u < 0.85 ? 1 : 0;
        pose.hipsY = -0.5 * c;
        j.hipL = [1.25 * c, 0, -0.05];
        j.kneeL = [-1.9 * c, 0, 0];
        j.ankleL = [0.65 * c, 0, 0];
        j.hipR = [0.15 * c, 0, 0.05];
        j.kneeR = [-1.75 * c, 0, 0];
        j.ankleR = [0.9 * c, 0, 0];
        j.spine = [-0.5 * c, 0.15 * c, 0];
        j.neck = [0.35 * c, 0, 0];
        j.head = [0.25 * c, 0, 0];
        j.shoulderL = stab ? [0.55, 0, 0.3] : [0.4 + 2.5 * raise, 0, 0.25];
        j.elbowL = stab ? [0.15, 0, 0] : [0.5 + 0.4 * raise, 0, 0];
        j.wristL = [0.3, 0, 0];
        j.shoulderR = [0.65 * c, 0, 0.15];
        j.elbowR = [0.7 * c + 0.3, 0, 0];
        break;
      }
    }
    return pose;
  }
}
