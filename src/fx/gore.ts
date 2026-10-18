import {
  Box3,
  Color,
  IcosahedronGeometry,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Material,
  type Object3D,
  type Scene,
} from 'three';
import { DARK_FLESH, FLESH } from '../characters/flesh';
import { goreLevel } from '../config/settings';
import { tuning } from '../config/tuning';
import type { Effects } from './effects';

// Bursting heads, torn-off limbs and bodies blown apart: pieces that fly,
// bounce and lie on the ground for a while, plus blood pumping from stumps.

/** Small shapes shared by every flying scrap (never freed). */
const SHARED = {
  skull: new SphereGeometry(0.075, 7, 4, 0, Math.PI * 0.8, 0, Math.PI * 0.45),
  scrap: new IcosahedronGeometry(0.035, 0),
  bit: new IcosahedronGeometry(0.02, 0),
};
const SHARED_GEOMETRIES = new Set<unknown>(Object.values(SHARED));

interface Chunk {
  obj: Object3D;
  vel: Vector3;
  /** Spin axis times speed, in radians per second (world space). */
  spin: Vector3;
  /** Centre of the piece in its own space. */
  center: Vector3;
  /** Its longest direction in its own space (it settles lying along this). */
  axis: Vector3;
  /** Half its thickness: how far its centre sits above the ground when lying down. */
  half: number;
  resting: boolean;
  landed: boolean;
  age: number;
}

interface Spurt {
  anchor: Object3D;
  offset: Vector3;
  dir: Vector3;
  time: number;
  total: number;
  strength: number;
}

export type WallFinder = (origin: Vector3, dir: Vector3, max: number) => { point: Vector3; normal: Vector3 } | null;

const v = new Vector3();
const v2 = new Vector3();
const q = new Quaternion();
const q2 = new Quaternion();
const color = new Color();
const box = new Box3();
const UP = new Vector3(0, 1, 0);

export class GoreSystem {
  private readonly chunks: Chunk[] = [];
  private readonly spurts: Spurt[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly fx: Effects,
    private readonly findWall: WallFinder,
  ) {}

  get chunkCount(): number {
    return this.chunks.length;
  }

  /** Sends a loose piece (a torn-off limb, a body part) flying from where it is now. */
  fling(piece: Object3D, velocity: Vector3, spin: Vector3): void {
    this.scene.attach(piece);
    piece.updateMatrixWorld(true);
    // Measure it in its own space so it can bounce and settle believably.
    const inv = piece.matrixWorld.clone().invert();
    box.makeEmpty();
    piece.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      box.union(b);
      m.raycast = () => {};
    });
    const size = box.getSize(new Vector3());
    const scale = piece.getWorldScale(v2).x;
    const longest = Math.max(size.x, size.y, size.z);
    const axis = longest === size.x ? new Vector3(1, 0, 0) : longest === size.y ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
    const thin = Math.min(size.x, size.y, size.z);
    this.chunks.push({
      obj: piece,
      vel: velocity.clone(),
      spin: spin.clone(),
      center: box.getCenter(new Vector3()),
      axis,
      half: Math.max(0.015, (thin / 2) * scale),
      resting: false,
      landed: false,
      age: 0,
    });
    while (this.chunks.length > tuning.gore.maxChunks) this.remove(0);
  }

  /** Blood pumping from a stump for a little while (follows `anchor` as it moves). */
  spurt(anchor: Object3D, offset: Vector3, dir: Vector3, strength = 1): void {
    if (goreLevel() === 'off' || tuning.gore.spurtTime <= 0) return;
    this.spurts.push({ anchor, offset: offset.clone(), dir: dir.clone().normalize(), time: 0, total: tuning.gore.spurtTime, strength });
    if (this.spurts.length > 24) this.spurts.shift();
  }

  /** A head bursting: skull pieces, scraps, a cloud of blood and splats all around. */
  burstHead(at: Vector3, dir: Vector3, skin: Material, groundY: number): void {
    const level = goreLevel();
    if (level === 'off') return;
    const k = tuning.gore.burstSize;
    const full = level === 'full';
    // Spray in every direction, mostly carried on by the bullet.
    for (let i = 0; i < Math.round(60 * k); i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(1.5 + Math.random() * 3.5);
      v.addScaledVector(dir, 1.5 + Math.random() * 2).y += 1.2;
      color.setRGB(0.16 + Math.random() * 0.14, 0.008, 0.008);
      this.fx.smoke.spawn({ position: at, velocity: v, life: 0.6 + Math.random() * 0.7, size: 0.025 + Math.random() * 0.06, color, gravity: 1, drag: 1.2 });
    }
    for (let i = 0; i < Math.round(10 * k); i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(1.2).addScaledVector(dir, 1);
      color.setRGB(0.1, 0.005, 0.005);
      this.fx.smoke.spawn({ position: at, velocity: v, life: 0.45, size: 0.14, grow: 3, color, alpha: 0.5, drag: 4 });
    }
    // Splats on the ground around the body, and on any wall just behind.
    for (let i = 0; i < 5; i++) {
      v.set(at.x + dir.x * (0.4 + Math.random()) + (Math.random() - 0.5) * 1.4, groundY, at.z + dir.z * (0.4 + Math.random()) + (Math.random() - 0.5) * 1.4);
      this.fx.bloodDecals.add(v, UP, 0.35 + Math.random() * 0.55);
    }
    const wall = this.findWall(at, dir, 3.5);
    if (wall) this.fx.bloodDecals.add(wall.point, wall.normal, 0.7 + Math.random() * 0.4);
    if (!full) return;
    // Pieces of skull and scraps fly off and bounce.
    for (let i = 0; i < 4; i++) this.scrap(SHARED.skull, skin, at, dir, 3.5);
    for (let i = 0; i < 6; i++) this.scrap(SHARED.scrap, i % 2 ? FLESH : DARK_FLESH, at, dir, 4);
    for (let i = 0; i < 5; i++) this.scrap(SHARED.bit, FLESH, at, dir, 4.5);
  }

  /** The cloud of blood and scraps when a whole body is blown apart (the parts are flung separately). */
  burstBody(at: Vector3, groundY: number): void {
    const level = goreLevel();
    if (level === 'off') return;
    for (let i = 0; i < 70; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 5);
      color.setRGB(0.16 + Math.random() * 0.12, 0.008, 0.008);
      this.fx.smoke.spawn({ position: at, velocity: v, life: 0.7 + Math.random() * 0.8, size: 0.03 + Math.random() * 0.07, color, gravity: 1, drag: 1 });
    }
    for (let i = 0; i < 7; i++) {
      v.set(at.x + (Math.random() - 0.5) * 3, groundY, at.z + (Math.random() - 0.5) * 3);
      this.fx.bloodDecals.add(v, UP, 0.5 + Math.random() * 0.7);
    }
    if (level !== 'full') return;
    for (let i = 0; i < 10; i++) this.scrap(i % 3 ? SHARED.scrap : SHARED.bit, i % 2 ? FLESH : DARK_FLESH, at, UP, 6);
  }

  /** A little shared-shape scrap flung out from `at`. */
  private scrap(geometry: SphereGeometry | IcosahedronGeometry, material: Material, at: Vector3, dir: Vector3, speed: number): void {
    const m = new Mesh(geometry, material);
    m.castShadow = true;
    m.position.copy(at).add(v.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12));
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    m.scale.setScalar(0.7 + Math.random() * 0.8);
    this.scene.add(m);
    v.set(Math.random() - 0.5, Math.random() * 0.7 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
    v.addScaledVector(dir, speed * 0.4);
    v2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30);
    this.fling(m, v, v2);
  }

  update(dt: number, groundAt: (x: number, z: number) => number): void {
    const life = tuning.gore.chunkLife;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.age += dt;
      const o = c.obj;
      if (!c.resting) {
        c.vel.y -= 9.8 * dt;
        o.position.addScaledVector(c.vel, dt);
        const rate = c.spin.length();
        if (rate > 1e-3) {
          q.setFromAxisAngle(v.copy(c.spin).divideScalar(rate), rate * dt);
          o.quaternion.premultiply(q);
        }
      } else {
        // Lying down: roll over so its long side rests on the ground.
        o.updateMatrixWorld();
        v.copy(c.axis).transformDirection(o.matrixWorld);
        v2.set(v.x, 0, v.z);
        if (v2.lengthSq() < 1e-4) v2.set(1, 0, 0);
        v2.normalize();
        q.setFromUnitVectors(v, v2);
        q2.identity().slerp(q, 1 - Math.exp(-10 * dt));
        o.quaternion.premultiply(q2);
      }
      o.updateMatrixWorld();
      const center = v.copy(c.center).applyMatrix4(o.matrixWorld);
      const ground = groundAt(center.x, center.z);
      const sink = c.age > life ? (c.age - life) * 0.25 : 0;
      const floor = ground + c.half - sink;
      if (center.y < floor || c.resting) {
        o.position.y += floor - center.y;
        if (!c.resting) {
          if (!c.landed) {
            c.landed = true;
            if (goreLevel() !== 'off') this.fx.bloodDecals.add(v2.set(center.x, ground, center.z), UP, 0.18 + Math.random() * 0.2);
          }
          if (Math.abs(c.vel.y) < 1.6) {
            c.resting = true;
            c.vel.set(0, 0, 0);
          } else {
            c.vel.y *= -0.3;
            c.vel.x *= 0.55;
            c.vel.z *= 0.55;
            c.spin.multiplyScalar(0.45);
          }
        }
      }
      if (c.age > life + 1.6) this.remove(i);
    }

    for (let i = this.spurts.length - 1; i >= 0; i--) {
      const s = this.spurts[i];
      s.time += dt;
      if (s.time >= s.total || !s.anchor.parent) {
        this.spurts.splice(i, 1);
        continue;
      }
      // Pumps in pulses that weaken.
      const fade = 1 - s.time / s.total;
      const pulse = 0.55 + 0.45 * Math.sin(s.time * 14);
      s.anchor.updateWorldMatrix(true, false);
      const at = v.copy(s.offset).applyMatrix4(s.anchor.matrixWorld);
      const dirWorld = v2.copy(s.dir).transformDirection(s.anchor.matrixWorld);
      const n = Math.random() < fade * pulse * s.strength * 2 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const vel = dirWorld.clone().multiplyScalar((1.2 + Math.random() * 1.6) * (0.4 + fade * pulse));
        vel.x += (Math.random() - 0.5) * 0.5;
        vel.y += (Math.random() - 0.5) * 0.3;
        vel.z += (Math.random() - 0.5) * 0.5;
        color.setRGB(0.2 + Math.random() * 0.1, 0.01, 0.01);
        this.fx.smoke.spawn({ position: at, velocity: vel, life: 0.6 + Math.random() * 0.4, size: 0.022 + Math.random() * 0.025, color, gravity: 1, drag: 0.8 });
      }
    }
  }

  private remove(index: number): void {
    const c = this.chunks[index];
    this.chunks.splice(index, 1);
    c.obj.removeFromParent();
    c.obj.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && !SHARED_GEOMETRIES.has(m.geometry)) m.geometry.dispose();
    });
  }

  /** Clears every piece (new round). */
  clear(): void {
    while (this.chunks.length) this.remove(this.chunks.length - 1);
    this.spurts.length = 0;
  }
}
