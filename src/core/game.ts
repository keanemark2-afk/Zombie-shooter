import {
  ACESFilmicToneMapping,
  LineSegments,
  MathUtils,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
  type Intersection,
  type Mesh,
  type Object3D,
} from 'three';
import { Sfx } from '../audio/sfx';
import { FallingProp } from '../characters/handheld';
import { resolveHit, zoneGroup, type HitResult, type Zone } from '../combat/damage';
import { PAD } from '../config/controls';
import { tuning } from '../config/tuning';
import { showError } from '../debug/errorOverlay';
import { FpsCounter } from '../debug/fpsCounter';
import { TuningPanel } from '../debug/tuningPanel';
import { Zombie, type ZombieBehavior, type ZombieHost } from '../enemies/zombie';
import { Effects } from '../fx/effects';
import { Player, type PlayerHost } from '../player/player';
import { ShoulderCamera } from '../player/shoulderCamera';
import { PostFx } from '../render/postFx';
import { Hud, type RangeStats } from '../ui/hud';
import { Menu, type MenuChoice } from '../ui/menu';
import { colliderOutlines } from '../world/colliders';
import type { LevelId } from '../world/level';
import { rangeZ } from '../world/range';
import { World } from '../world/world';
import { FlyCamera } from './flyCamera';
import { GamepadReader } from './gamepad';
import { Input } from './input';
import { FixedStepClock } from './loop';
import { PlayerInputReader } from './playerInput';

const ZONE_NAMES: Record<Zone, string> = {
  head: 'HEAD',
  torso: 'BODY',
  armL: 'LEFT ARM',
  armR: 'RIGHT ARM',
  legL: 'LEFT LEG',
  legR: 'RIGHT LEG',
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
    death: hit.overkill > 0 ? `KILLED (overkill ${Math.round(hit.overkill)})` : 'KILLED',
  };
  return `${ZONE_NAMES[hit.zone]} · ${Math.round(hit.damage)} damage · ${reactions[hit.reaction]}`;
}

interface AimResult {
  /** Where the camera's aim (with wobble) lands. */
  point: Vector3;
  direction: Vector3;
}

/** Removes a dropped prop from the scene and frees its shapes (materials are shared). */
function disposeObject(obj: Object3D): void {
  obj.removeFromParent();
  obj.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
  });
}

const tmp = new Vector3();
const tmp2 = new Vector3();
const muzzlePos = new Vector3();
const laserPos = new Vector3();

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
  private readonly sfx = new Sfx();
  private readonly hud = new Hud();
  private readonly menu = new Menu();
  private readonly flyCamera: FlyCamera;
  private readonly raycaster = new Raycaster();
  private readonly fallingProps: FallingProp[] = [];
  private readonly reportedErrors = new Set<string>();
  private readonly zombieHost: ZombieHost;
  private readonly playerHost: PlayerHost;
  private colliderLines: LineSegments | null = null;
  private lastFrameTime = 0;
  private pixelRatio = 0;
  private hitStop = 0;
  private respawnTimer = 0;
  private zombieSeed = 1;
  private freeCam = false;
  private releasingMouse = false;
  private hitboxView = false;
  private lastDummyDistance = tuning.range.dummyDistance;
  private aim: AimResult = { point: new Vector3(), direction: new Vector3(0, 0, -1) };

  mode: LevelId | null = null;
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
    this.fx.onShellLand = (pos) => this.sfx.shellLand(pos);
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

    this.zombieHost = {
      world: this.world,
      playerPosition: this.player.position,
      zombies: this.zombies,
      voice: this.sfx,
      onPlayerHit: (z) => this.onPlayerHit(z),
      dropProp: (prop, velocity, spin) => {
        this.scene.add(prop);
        const fp = new FallingProp(prop);
        fp.velocity.copy(velocity);
        fp.spin.copy(spin);
        this.fallingProps.push(fp);
        if (this.fallingProps.length > 12) disposeObject(this.fallingProps.shift()!.object);
      },
    };
    this.playerHost = {
      fire: () => this.fireShot(),
      dryFire: () => this.sfx.dryFire(),
      reloadStep: (step) => this.sfx.reloadStep(step),
      footstep: (_pos, sprinting) => this.sfx.footstep(sprinting),
    };

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
    if (choice === 'resume' && this.mode) {
      this.resume();
      return;
    }
    if (choice !== 'resume') this.startMode(choice);
  }

  startMode(id: LevelId): void {
    for (const z of this.zombies) this.removeZombie(z);
    this.zombies.length = 0;
    for (const p of this.fallingProps) disposeObject(p.object);
    this.fallingProps.length = 0;
    this.world.setLevel(id);
    this.mode = id;
    const spawn = this.world.level.playerSpawn;
    this.player.spawn(spawn.x, spawn.z, spawn.yaw, this.world);
    this.player.object.visible = true;
    this.cam.yaw = spawn.yaw;
    this.cam.pitch = -0.05;
    Object.assign(this.stats, { shots: 0, hits: 0, headshots: 0, kills: 0, lastHit: '' });
    this.respawnTimer = 0;
    if (this.colliderLines) {
      this.colliderLines.removeFromParent();
      this.colliderLines = null;
    }
    if (id === 'range') this.spawnDummy();
    else for (let i = 0; i < tuning.village.zombieCount; i++) this.spawnVillageZombie();
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

  private spawnDummy(): void {
    const d = tuning.range.dummyDistance;
    const z = new Zombie(this.zombieSeed++, 0, rangeZ(d), 0, this.dummyBehavior(), {
      holdsTool: tuning.range.dummyHoldsWeapon,
      invincible: tuning.range.dummyInvincible,
    });
    this.lastDummyDistance = d;
    this.addZombie(z);
  }

  private spawnVillageZombie(): void {
    const spawns = this.world.level.enemySpawns;
    const s = spawns[Math.floor(Math.random() * spawns.length)];
    const z = new Zombie(this.zombieSeed++, s.x + (Math.random() - 0.5) * 2, s.z + (Math.random() - 0.5) * 2, s.yaw + Math.PI, 'hunt', {
      holdsTool: Math.random() < tuning.zombie.weaponChance,
    });
    this.addZombie(z);
  }

  private addZombie(z: Zombie): void {
    if (this.hitboxView) z.rig.setHitboxView(true);
    this.zombies.push(z);
    this.scene.add(z.object);
  }

  private removeZombie(z: Zombie): void {
    z.object.removeFromParent();
    z.dispose();
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
      const dummy = alive[0];
      if (dummy) {
        dummy.invincible = tuning.range.dummyInvincible;
        dummy.behavior = this.dummyBehavior();
        const d = tuning.range.dummyDistance;
        if (Math.abs(d - this.lastDummyDistance) > 0.25) {
          this.lastDummyDistance = d;
          dummy.teleport(0, rangeZ(d), 0);
        }
      } else {
        this.respawnTimer += dt;
        if (this.respawnTimer >= tuning.range.dummyRespawnDelay) {
          this.respawnTimer = 0;
          this.spawnDummy();
        }
      }
    } else if (this.mode === 'village') {
      if (alive.length < tuning.village.zombieCount) {
        this.respawnTimer += dt;
        if (this.respawnTimer >= tuning.village.respawnDelay) {
          this.respawnTimer = 0;
          this.spawnVillageZombie();
        }
      } else {
        this.respawnTimer = 0;
      }
    }
  }

  private onPlayerHit(_z: Zombie): void {
    this.player.hurt(_z.position);
    this.cam.shake(tuning.feel.shakeHurt);
    this.hud.hurtFlash();
    this.sfx.playerHurt();
  }

  // ---------------------------------------------------------------------------
  // Shooting

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
    const camPos = this.camera.position;
    // Start the ray level with the player so nothing behind them gets in the way.
    tmp.set(this.player.position.x, this.player.position.y + 1.5, this.player.position.z).sub(camPos);
    const start = tmp2.copy(camPos).addScaledVector(dir, Math.max(0, tmp.dot(dir)));
    const range = tuning.pistol.maxRange;
    const wall = this.world.raycast(start, dir, range);
    const zHits = this.castZombies(start, dir, wall ? wall.distance : range);
    if (zHits.length) this.aim.point.copy(zHits[0].point);
    else if (wall) this.aim.point.copy(wall.point);
    else this.aim.point.copy(start).addScaledVector(dir, range);
    return this.aim;
  }

  private fireShot(): void {
    this.stats.shots++;
    const aim = this.computeAim();
    this.player.pistol.muzzle.getWorldPosition(muzzlePos);
    const dir = new Vector3().subVectors(aim.point, muzzlePos);
    const dist = dir.length();
    dir.normalize();

    this.fx.muzzleFlash(muzzlePos, dir);
    this.sfx.gunshot();
    this.cam.shake(tuning.feel.shakeShot);
    this.player.pistol.ejectionPort.getWorldPosition(tmp);
    this.fx.ejectShell(tmp, tmp2.set(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)));

    // Trace the bullet from the barrel to the aim point (and a little beyond).
    const reach = Math.max(dist + 0.5, 1);
    const wall = this.world.raycast(muzzlePos, dir, tuning.pistol.maxRange);
    const stopAt = wall ? wall.distance : tuning.pistol.maxRange;
    const hits = this.castZombies(muzzlePos, dir, Math.max(reach, stopAt));
    const hitZombies = new Set<Zombie>();
    let stoppedByZombie = false;
    let anyHit = false;
    for (const h of hits) {
      if (h.distance > stopAt) break;
      const z = h.object.userData.zombie as Zombie;
      if (hitZombies.has(z)) continue;
      hitZombies.add(z);
      const groundY = this.world.groundHeight(h.point.x, h.point.z);
      if (!z.alive) {
        // Shooting a body: just blood.
        this.fx.blood(h.point, dir, 0.6, groundY);
        this.sfx.impactFlesh('torso', h.point, false);
        stoppedByZombie = true;
        break;
      }
      const zone = h.object.userData.zone as Zone;
      const group = zoneGroup(zone);
      const result = resolveHit(zone, tuning.pistol, z.targetState, this.player.focus, tuning);
      z.applyHit(result, dir, this.sfx, this.zombieHost);
      this.fx.blood(h.point, dir, group === 'head' ? 1.5 : 1, groundY);
      this.sfx.impactFlesh(group, h.point, result.killed);
      this.hud.hitMarker(group, result.killed, tuning.feel.hitMarkerTime);
      const f = tuning.feel;
      const stop = result.killed ? f.hitStopKill : group === 'head' ? f.hitStopHead : f.hitStopBody;
      this.hitStop = Math.max(this.hitStop, stop);
      if (group === 'head') this.cam.shake(f.shakeHeadshot);
      if (!anyHit) this.stats.hits++;
      anyHit = true;
      if (group === 'head') this.stats.headshots++;
      if (result.killed) this.stats.kills++;
      this.stats.lastHit = describeHit(result);
      if (hitZombies.size > tuning.pistol.pierce) {
        stoppedByZombie = true;
        break;
      }
    }
    if (!stoppedByZombie && wall) {
      this.fx.surfaceImpact(wall.point, wall.normal, wall.surface);
      this.sfx.impactSurface(wall.surface, wall.point);
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = this.lastFrameTime ? Math.min((now - this.lastFrameTime) / 1000, 0.25) : 1 / 60;
    this.lastFrameTime = now;
    try {
      this.renderer.info.reset();
      this.pad.poll(tuning.controls.stickDeadzone);
      this.handleGlobalKeys();
      const playing = !this.paused && this.mode !== null;

      const mouseActive = this.autotest || this.input.pointerLocked;
      const look = this.controls.frame(dt, mouseActive, this.player.aiming);
      if (playing && !this.freeCam) this.cam.look(look.yaw, look.pitch);

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
    const input = this.freeCam ? { moveX: 0, moveY: 0, aim: false, firePressed: false, reloadPressed: false, sprint: false, sprintPressed: false } : this.controls.take();
    for (const z of this.zombies) z.update(dt, this.zombieHost);
    this.player.tick(dt, input, this.cam, this.world, this.playerHost);
    for (const p of this.fallingProps) p.update(dt, this.world.groundHeight(p.object.position.x, p.object.position.z));
    this.fx.update(dt, (x, z) => this.world.groundHeight(x, z));
    this.manageZombies(dt);
  }

  private renderFrame(dt: number, alpha: number, playing: boolean): void {
    // Camera follows the smoothed player position.
    tmp.lerpVectors(this.player.prevPosition, this.player.position, alpha);
    if (this.freeCam) {
      this.flyCamera.update(dt);
    } else {
      this.cam.update(dt, tmp, playing && this.player.aiming, this.world);
    }
    for (const z of this.zombies) z.render(alpha);

    if (this.mode) {
      const aim = this.computeAim();
      this.player.render(alpha, aim.point, this.cam);
      // Laser sight from the module under the barrel to whatever it hits.
      const showLaser = playing && this.player.aiming && this.cam.aimBlend > 0.6 && !this.freeCam;
      if (showLaser) {
        this.player.pistol.laser.getWorldPosition(laserPos);
        const toAim = tmp2.subVectors(aim.point, laserPos);
        const d = toAim.length();
        toAim.normalize();
        const wall = this.world.raycast(laserPos, toAim, d + 0.05);
        const zh = this.castZombies(laserPos, toAim, wall ? wall.distance : d + 0.3);
        const end = zh.length ? zh[0].point : wall ? wall.point : aim.point;
        const hitSomething = zh.length > 0 || wall !== null || d < tuning.pistol.maxRange - 1;
        this.fx.setLaser(laserPos, end, hitSomething ? end : null);
      } else {
        this.fx.setLaser(null, null, null);
      }
      // Reticle size on screen matches the real aim wobble.
      const spread = MathUtils.degToRad(this.player.reticle.spread);
      const radius = (Math.tan(spread) / Math.tan(MathUtils.degToRad(this.camera.fov / 2))) * (window.innerHeight / 2);
      this.hud.setReticle(showLaser ? radius : null, this.player.focus);
      const p = this.player;
      const reload = p.reloading ? p.reloadTime / p.reloadTotal : null;
      this.hud.setAmmo(p.ammo, tuning.pistol.infiniteAmmo ? null : p.reserve, reload);
      this.hud.setStats(this.mode === 'range' ? this.stats : null);
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
    if (this.menu.visible) {
      if (this.pad.wasPressed(PAD.south)) this.choose(this.paused && this.mode ? 'resume' : 'range');
      if (this.pad.wasPressed(PAD.west)) this.choose('range');
      if (this.pad.wasPressed(PAD.north)) this.choose('village');
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
    if (path === 'pistol.capacity') this.player.ammo = Math.min(this.player.ammo, tuning.pistol.capacity);
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
    const z = this.zombies.find((zz) => zz.alive);
    if (!z) return false;
    const part = z.parts.find((p) => p.userData.zone === zone);
    if (!part) return false;
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
  debugView(from: Vector3 | null, to: Vector3 | null): void {
    this.freeCam = from !== null && to !== null;
    if (from && to) this.flyCamera.lookFrom(from, to);
  }

  debugState() {
    return {
      mode: this.mode,
      paused: this.paused,
      ammo: this.player.ammo,
      reloading: this.player.reloading,
      aiming: this.player.aiming,
      focus: this.player.focus,
      player: this.player.position.toArray(),
      yaw: this.player.yaw,
      cameraYaw: this.cam.yaw,
      stats: { ...this.stats },
      zombies: this.zombies.map((z) => ({ state: z.state, health: z.health, alive: z.alive, holdingTool: z.holdingTool, behavior: z.behavior })),
      audioRunning: this.sfx.ready,
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
