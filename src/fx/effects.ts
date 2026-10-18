import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three';
import { tuning } from '../config/tuning';
import type { Surface } from '../world/props';
import { DecalPool } from './decals';
import { ParticleSystem } from './particles';

function flashTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.translate(64, 64);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.2, 'rgba(255,200,110,0.9)');
  g.addColorStop(0.6, 'rgba(255,120,30,0.25)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  // A rough star of flame tongues.
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = i % 2 === 0 ? 62 : 22;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  return new CanvasTexture(c);
}

function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,60,40,1)');
  g.addColorStop(0.5, 'rgba(255,0,0,0.35)');
  g.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

const SURFACE_DUST: Record<Surface, string> = {
  wood: '#6b5640',
  stone: '#8a857c',
  dirt: '#6e5b45',
  metal: '#8b8680',
  plaster: '#b3aa98',
  straw: '#a08a58',
  glass: '#9aa3a8',
};

const v = new Vector3();
const v2 = new Vector3();
const color = new Color();
const m = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const one = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

interface Shell {
  pos: Vector3;
  vel: Vector3;
  rot: Euler;
  spin: Vector3;
  age: number;
  bounced: boolean;
  resting: boolean;
}

export type CasingKind = 'brass' | 'hull';

/** A pool of spent casings that fly out, bounce and lie on the ground for a while. */
class CasingPool {
  readonly mesh: InstancedMesh;
  private readonly shells: Shell[] = [];
  private next = 0;

  constructor(geometry: CylinderGeometry, material: MeshStandardMaterial, count: number, readonly kind: CasingKind) {
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.castShadow = true;
    for (let i = 0; i < count; i++) {
      this.shells.push({ pos: new Vector3(), vel: new Vector3(), rot: new Euler(), spin: new Vector3(), age: 1e9, bounced: true, resting: true });
      this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
    }
  }

  eject(at: Vector3, right: Vector3): void {
    const s = this.shells[this.next];
    this.next = (this.next + 1) % this.shells.length;
    const heavy = this.kind === 'hull' ? 0.7 : 1;
    s.pos.copy(at);
    s.vel.copy(right).multiplyScalar((1.6 + Math.random() * 0.8) * heavy);
    s.vel.y += (1.8 + Math.random() * 0.8) * heavy;
    s.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    s.spin.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
    s.age = 0;
    s.bounced = false;
    s.resting = false;
  }

  update(dt: number, life: number, groundAt: (x: number, z: number) => number, onLand: (pos: Vector3, kind: CasingKind) => void): void {
    this.shells.forEach((s, i) => {
      if (s.age > life + 1) return;
      s.age += dt;
      if (!s.resting) {
        s.vel.y -= 9.8 * dt;
        s.pos.addScaledVector(s.vel, dt);
        s.rot.x += s.spin.x * dt;
        s.rot.y += s.spin.y * dt;
        s.rot.z += s.spin.z * dt;
        const ground = groundAt(s.pos.x, s.pos.z) + (this.kind === 'hull' ? 0.011 : 0.005);
        if (s.pos.y < ground) {
          s.pos.y = ground;
          if (!s.bounced) {
            s.bounced = true;
            onLand(s.pos, this.kind);
          }
          if (Math.abs(s.vel.y) < 0.6) {
            s.resting = true;
            s.rot.set(Math.PI / 2, s.rot.y, 0);
          } else {
            s.vel.y *= -0.35;
            s.vel.x *= 0.5;
            s.vel.z *= 0.5;
            s.spin.multiplyScalar(0.5);
          }
        }
      }
      const scale = s.age > life ? Math.max(0, 1 - (s.age - life)) : 1;
      q.setFromEuler(e.copy(s.rot));
      this.mesh.setMatrixAt(i, m.compose(s.pos, q, v.copy(one).multiplyScalar(scale)));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** All the visual "juice": blood, dust, sparks, bullet holes, casings, muzzle flash and the laser sight. */
export class Effects {
  readonly smoke = new ParticleSystem(700);
  readonly glow = ParticleSystem.additive(300);
  readonly holes = new DecalPool('hole', 80);
  readonly bloodDecals = new DecalPool('blood', 48);
  private readonly casings: Record<CasingKind, CasingPool>;
  private readonly flash: Sprite;
  private readonly flashLight: PointLight;
  private flashTime = 0;
  private readonly laserBeam: Mesh;
  private readonly laserDot: Sprite;
  /** Called when a casing first hits the ground (for its tinkle or thunk sound). */
  onShellLand: ((pos: Vector3, kind: CasingKind) => void) | null = null;

  constructor(scene: Scene) {
    scene.add(this.smoke.points, this.glow.points, this.holes.mesh, this.bloodDecals.mesh);

    const brass = new MeshStandardMaterial({ color: '#b08d45', metalness: 0.9, roughness: 0.35 });
    const hull = new MeshStandardMaterial({ color: '#8c1f18', roughness: 0.6 });
    this.casings = {
      brass: new CasingPool(new CylinderGeometry(0.0048, 0.0048, 0.019, 6), brass, 40, 'brass'),
      hull: new CasingPool(new CylinderGeometry(0.0105, 0.0105, 0.068, 8), hull, 30, 'hull'),
    };
    scene.add(this.casings.brass.mesh, this.casings.hull.mesh);

    this.flash = new Sprite(new SpriteMaterial({ map: flashTexture(), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false;
    this.flash.raycast = () => {};
    scene.add(this.flash);
    // Always in the scene (switching lights on/off would rebuild every shader).
    this.flashLight = new PointLight('#ffb36b', 0, 9, 2);
    scene.add(this.flashLight);

    this.laserBeam = new Mesh(
      new CylinderGeometry(0.0022, 0.0022, 1, 4, 1, true).translate(0, 0.5, 0),
      new MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false }),
    );
    this.laserBeam.visible = false;
    this.laserBeam.frustumCulled = false;
    this.laserBeam.raycast = () => {};
    scene.add(this.laserBeam);
    this.laserDot = new Sprite(
      new SpriteMaterial({ map: dotTexture(), blending: AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false }),
    );
    this.laserDot.scale.setScalar(0.022);
    this.laserDot.visible = false;
    this.laserDot.raycast = () => {};
    scene.add(this.laserDot);
  }

  setScreen(heightPx: number, fov: number): void {
    this.smoke.setScreen(heightPx, fov);
    this.glow.setScreen(heightPx, fov);
  }

  /** Blood spray from a hit on a zombie. `dir` is the bullet's direction. */
  blood(point: Vector3, dir: Vector3, amount: number, groundY: number): void {
    const k = tuning.feel.bloodAmount * amount;
    if (k <= 0) return;
    const count = Math.round(14 * k);
    for (let i = 0; i < count; i++) {
      // Most spray goes out the far side and a little back towards the shooter.
      const back = i % 3 === 0 ? -0.6 : 1;
      v.copy(dir).multiplyScalar((1 + Math.random() * 2.5) * back);
      v.x += (Math.random() - 0.5) * 2.2;
      v.y += Math.random() * 1.8;
      v.z += (Math.random() - 0.5) * 2.2;
      color.setRGB(0.18 + Math.random() * 0.12, 0.01, 0.01);
      this.smoke.spawn({ position: point, velocity: v, life: 0.5 + Math.random() * 0.5, size: 0.025 + Math.random() * 0.04, color, gravity: 1, drag: 1.5 });
    }
    // A short-lived dark red mist, mostly blown out the far side.
    for (let i = 0; i < Math.round(3 * k); i++) {
      v.set((Math.random() - 0.5) * 0.5, Math.random() * 0.3, (Math.random() - 0.5) * 0.5).addScaledVector(dir, 1.2);
      color.setRGB(0.09, 0.004, 0.004);
      this.smoke.spawn({ position: point, velocity: v, life: 0.22, size: 0.08, grow: 2.2, color, alpha: 0.45, drag: 5 });
    }
    // A splat on the ground below.
    v2.set(point.x + dir.x * 0.6 + (Math.random() - 0.5) * 0.5, groundY, point.z + dir.z * 0.6 + (Math.random() - 0.5) * 0.5);
    this.bloodDecals.add(v2, UP, (0.35 + Math.random() * 0.4) * Math.min(1.6, k));
  }

  /** A bullet hitting the scenery: hole, dust puff, and sparks on metal or stone. */
  surfaceImpact(point: Vector3, normal: Vector3, surface: Surface, amount = 1): void {
    this.holes.add(point, normal, surface === 'dirt' || surface === 'straw' ? 0.09 : 0.06);
    color.set(SURFACE_DUST[surface]);
    for (let i = 0; i < Math.max(2, Math.round(9 * amount)); i++) {
      v.copy(normal).multiplyScalar(0.6 + Math.random() * 1.6);
      v.x += (Math.random() - 0.5) * 1.2;
      v.y += Math.random() * 0.9;
      v.z += (Math.random() - 0.5) * 1.2;
      this.smoke.spawn({ position: point, velocity: v, life: 0.5 + Math.random() * 0.6, size: 0.05 + Math.random() * 0.06, grow: 3, color, alpha: 0.55, drag: 3, gravity: 0.15 });
    }
    for (let i = 0; i < Math.max(1, Math.round(5 * amount)); i++) {
      v.copy(normal).multiplyScalar(1.5 + Math.random() * 2);
      v.x += (Math.random() - 0.5) * 2;
      v.y += Math.random() * 2;
      v.z += (Math.random() - 0.5) * 2;
      this.smoke.spawn({ position: point, velocity: v, life: 0.6, size: 0.015, color, gravity: 1, drag: 0.5 });
    }
    if (surface === 'metal' || surface === 'stone') {
      color.set('#ffb35c');
      for (let i = 0; i < 8; i++) {
        v.copy(normal).multiplyScalar(2 + Math.random() * 3);
        v.x += (Math.random() - 0.5) * 3;
        v.y += Math.random() * 2;
        v.z += (Math.random() - 0.5) * 3;
        this.glow.spawn({ position: point, velocity: v, life: 0.15 + Math.random() * 0.2, size: 0.02, color, gravity: 0.6 });
      }
    }
  }

  /** Muzzle flash, light and a puff of smoke at the gun barrel. `size` 1 = pistol. */
  muzzleFlash(at: Vector3, dir: Vector3, size = 1): void {
    const k = tuning.feel.muzzleFlash * size;
    if (k <= 0) return;
    this.flash.position.copy(at).addScaledVector(dir, 0.04 * size);
    this.flash.scale.setScalar((0.22 + Math.random() * 0.12) * k);
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    this.flash.visible = true;
    this.flashLight.position.copy(at).addScaledVector(dir, 0.15);
    this.flashLight.intensity = 18 * k;
    this.flashLight.distance = 9 * Math.sqrt(size);
    this.flashTime = 0.055;
    color.set('#ffcf8a');
    for (let i = 0; i < 4; i++) {
      v.copy(dir).multiplyScalar(2 + Math.random() * 3);
      v.x += (Math.random() - 0.5) * 0.8;
      v.y += (Math.random() - 0.5) * 0.8;
      v.z += (Math.random() - 0.5) * 0.8;
      this.glow.spawn({ position: at, velocity: v, life: 0.06, size: 0.05, color, drag: 10 });
    }
    // A faint wisp of gun smoke.
    color.set('#3d3a36');
    for (let i = 0; i < Math.round(2 * size); i++) {
      v.copy(dir).multiplyScalar(0.3 + Math.random() * 0.4);
      v.y += 0.25 + Math.random() * 0.25;
      this.smoke.spawn({ position: at, velocity: v, life: 0.7, size: 0.04 * size, grow: 4, color, alpha: 0.12, drag: 2 });
    }
  }

  /** Flicks a spent casing (or shotgun hull) out of the ejection port. */
  ejectShell(at: Vector3, right: Vector3, kind: CasingKind = 'brass'): void {
    this.casings[kind].eject(at, right);
  }

  /** Shows the laser from `start` to `end`. `dot` puts the red dot on whatever it hits. */
  setLaser(start: Vector3 | null, end: Vector3 | null, dot: Vector3 | null): void {
    if (!start || !end) {
      this.laserBeam.visible = false;
      this.laserDot.visible = false;
      return;
    }
    v.subVectors(end, start);
    const length = v.length();
    this.laserBeam.visible = length > 0.01;
    this.laserBeam.position.copy(start);
    this.laserBeam.quaternion.setFromUnitVectors(UP, v.normalize());
    this.laserBeam.scale.set(1, length, 1);
    this.laserDot.visible = dot !== null;
    if (dot) this.laserDot.position.copy(dot);
  }

  update(dt: number, groundAt: (x: number, z: number) => number): void {
    this.smoke.update(dt, groundAt);
    this.glow.update(dt, groundAt);
    this.holes.update(dt, tuning.feel.decalLife);
    this.bloodDecals.update(dt, tuning.feel.decalLife);

    this.flashTime -= dt;
    if (this.flashTime <= 0) {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    } else {
      this.flashLight.intensity *= 0.6;
    }

    const land = (pos: Vector3, kind: CasingKind) => this.onShellLand?.(pos, kind);
    this.casings.brass.update(dt, tuning.feel.shellLife, groundAt, land);
    this.casings.hull.update(dt, tuning.feel.shellLife, groundAt, land);
  }
}
