import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, type Object3D, type Scene } from 'three';
import { buildAxe, buildDynamite } from '../characters/enemyParts';
import { tuning } from '../config/tuning';
import type { WorldHit } from '../world/world';

// Things in the air: your grenades, and the axes and dynamite enemies throw.
// They fly in an arc, bounce, can be shot out of the air, and go off when
// their fuse runs out. The game decides what a detonation does.

export type ThrownType = 'axe' | 'dynamite' | 'frag' | 'flash' | 'fire';

export interface Thrown {
  id: number;
  type: ThrownType;
  mesh: Object3D;
  pos: Vector3;
  vel: Vector3;
  /** Seconds until it goes off (negative: no fuse, like an axe). */
  fuse: number;
  /** Thrown by an enemy (can hit you; can be parried). */
  hostile: boolean;
  grounded: boolean;
  age: number;
  hissTimer: number;
  /** Glowing fuse tip on dynamite. */
  spark: Object3D | null;
  /** An incendiary goes off the first time it lands. */
  onImpact: boolean;
}

export interface ThrownHost {
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): WorldHit | null;
  groundHeight(x: number, z: number): number;
  /** An enemy axe is at `pos`: did it reach the player? A parry or a hit uses the axe up. */
  axeReaches(pos: Vector3): 'hit' | 'parried' | 'miss';
  /** A fuse ran out (or the item was shot): do whatever it does. */
  detonate(t: Thrown): void;
  /** An axe struck something. */
  axeLanded(pos: Vector3, flesh: boolean): void;
  /** It bounced off the ground or a wall. */
  bounced(pos: Vector3): void;
  /** A little spark and a hiss from a burning fuse. */
  fuseSpark(pos: Vector3): void;
}

const GRAVITY = 9.8;
const GRENADE_RADIUS = 0.07;
const SHOT_RADIUS = 0.4;

const frag = new MeshStandardMaterial({ color: '#4c5a38', roughness: 0.55, metalness: 0.4 });
const flash = new MeshStandardMaterial({ color: '#b9bdc2', roughness: 0.4, metalness: 0.7 });
const fire = new MeshStandardMaterial({ color: '#b5551d', roughness: 0.5, metalness: 0.5 });
const band = new MeshStandardMaterial({ color: '#d9d9cf', roughness: 0.6 });

/** A small model of each throwable. */
export function buildThrowable(type: ThrownType): { mesh: Object3D; spark: Object3D | null } {
  const g = new Group();
  let spark: Object3D | null = null;
  const mark = (m: Mesh) => {
    m.raycast = () => {};
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (type) {
    case 'axe':
      g.add(buildAxe());
      break;
    case 'dynamite': {
      const d = buildDynamite(true);
      g.add(d.group);
      spark = d.spark;
      break;
    }
    case 'frag': {
      mark(new Mesh(new SphereGeometry(0.05, 10, 8), frag)).scale.set(1, 1.15, 1);
      mark(new Mesh(new CylinderGeometry(0.052, 0.052, 0.012, 10), band)).position.y = 0.0;
      mark(new Mesh(new CylinderGeometry(0.014, 0.014, 0.03, 6), band)).position.y = 0.062;
      break;
    }
    case 'flash': {
      mark(new Mesh(new CylinderGeometry(0.036, 0.036, 0.12, 10), flash));
      mark(new Mesh(new CylinderGeometry(0.039, 0.039, 0.02, 10), band)).position.y = 0.03;
      break;
    }
    case 'fire': {
      mark(new Mesh(new CylinderGeometry(0.04, 0.04, 0.13, 10), fire));
      mark(new Mesh(new CylinderGeometry(0.042, 0.042, 0.02, 10), band)).position.y = -0.03;
      break;
    }
  }
  return { mesh: g, spark };
}

let nextId = 1;

export class ThrownSystem {
  readonly items: Thrown[] = [];
  /** How many of each kind have been launched since the game started (the automated tests read this). */
  readonly launched: Record<ThrownType, number> = { axe: 0, dynamite: 0, frag: 0, flash: 0, fire: 0 };
  private readonly step = new Vector3();
  private readonly dir = new Vector3();
  private readonly to = new Vector3();

  constructor(private readonly scene: Scene) {}

  /** Enemy-thrown things in the air (used to keep the number of throws down). */
  get hostileCount(): number {
    return this.items.filter((t) => t.hostile && (t.type === 'axe' || !t.grounded)).length;
  }

  /** Sends something flying. `fuse` is ignored for axes. */
  launch(type: ThrownType, from: Vector3, velocity: Vector3, fuse: number, hostile: boolean): Thrown {
    const { mesh, spark } = buildThrowable(type);
    mesh.position.copy(from);
    this.scene.add(mesh);
    const t: Thrown = {
      id: nextId++,
      type,
      mesh,
      pos: from.clone(),
      vel: velocity.clone(),
      fuse: type === 'axe' ? -1 : fuse,
      hostile,
      grounded: false,
      age: 0,
      hissTimer: 0,
      spark,
      onImpact: type === 'fire',
    };
    this.items.push(t);
    this.launched[type]++;
    return t;
  }

  /** Removes one (it has gone off, hit something or been shot down). */
  remove(t: Thrown): void {
    const i = this.items.indexOf(t);
    if (i >= 0) this.items.splice(i, 1);
    t.mesh.removeFromParent();
    t.mesh.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
    });
  }

  clear(): void {
    for (const t of [...this.items]) this.remove(t);
  }

  /**
   * The nearest thing a bullet (travelling from `origin` along `dir`) would hit
   * within `max` metres, or null. Used to shoot axes and grenades out of the air.
   */
  shotAt(origin: Vector3, dir: Vector3, max: number): { item: Thrown; distance: number } | null {
    let best: { item: Thrown; distance: number } | null = null;
    for (const t of this.items) {
      if (t.grounded && t.type === 'axe') continue;
      this.to.subVectors(t.pos, origin);
      const along = this.to.dot(dir);
      if (along < 0 || along > max) continue;
      const off = this.to.addScaledVector(dir, -along).length();
      if (off > SHOT_RADIUS) continue;
      if (!best || along < best.distance) best = { item: t, distance: along };
    }
    return best;
  }

  update(dt: number, host: ThrownHost): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const t = this.items[i];
      t.age += dt;
      if (t.type === 'axe') {
        if (this.updateAxe(t, dt, host)) this.remove(t);
        continue;
      }
      this.updateGrenade(t, dt, host);
      if (t.fuse >= 0) {
        t.fuse -= dt;
        if (t.spark) {
          t.hissTimer -= dt;
          if (t.hissTimer <= 0) {
            t.hissTimer = 0.09;
            host.fuseSpark(t.mesh.localToWorld(this.to.set(0, 0.02, -0.34)));
          }
        }
        if (t.fuse <= 0) {
          this.remove(t);
          host.detonate(t);
        }
      }
    }
  }

  /** Flies an axe end over end. Returns true when it is used up. */
  private updateAxe(t: Thrown, dt: number, host: ThrownHost): boolean {
    if (t.grounded) {
      // Stuck in something: stays a moment, then fades away.
      return t.age > 4;
    }
    t.vel.y -= GRAVITY * dt * 0.55; // thrown hard and flat: it drops only a little
    this.step.copy(t.vel).multiplyScalar(dt);
    const len = this.step.length();
    if (len > 0) {
      this.dir.copy(this.step).divideScalar(len);
      const wall = host.raycast(t.pos, this.dir, len + 0.05);
      if (wall) {
        t.pos.copy(wall.point);
        t.grounded = true;
        t.age = 0;
        host.axeLanded(wall.point, false);
        t.mesh.position.copy(t.pos);
        return true;
      }
    }
    t.pos.add(this.step);
    const ground = host.groundHeight(t.pos.x, t.pos.z);
    if (t.pos.y < ground + 0.05) {
      host.axeLanded(t.pos, false);
      return true;
    }
    if (t.hostile) {
      const reach = host.axeReaches(t.pos);
      if (reach === 'hit') {
        host.axeLanded(t.pos, true);
        return true;
      }
      if (reach === 'parried') return true;
    }
    t.mesh.position.copy(t.pos);
    // Tumbles end over end while pointing roughly where it is going.
    t.mesh.rotation.set(t.age * 14, Math.atan2(-t.vel.x, -t.vel.z), 0, 'YXZ');
    return t.age > 6;
  }

  private updateGrenade(t: Thrown, dt: number, host: ThrownHost): void {
    if (!t.grounded) {
      t.vel.y -= GRAVITY * dt;
      this.step.copy(t.vel).multiplyScalar(dt);
      const len = this.step.length();
      if (len > 1e-5) {
        this.dir.copy(this.step).divideScalar(len);
        const wall = host.raycast(t.pos, this.dir, len + GRENADE_RADIUS);
        if (wall) {
          // Bounce off the wall.
          t.pos.copy(wall.point).addScaledVector(wall.normal, GRENADE_RADIUS + 0.01);
          const into = t.vel.dot(wall.normal);
          t.vel.addScaledVector(wall.normal, -1.5 * into).multiplyScalar(0.55);
          host.bounced(t.pos);
          if (t.onImpact) t.fuse = 0;
        } else {
          t.pos.add(this.step);
        }
      }
      const ground = host.groundHeight(t.pos.x, t.pos.z) + GRENADE_RADIUS;
      if (t.pos.y <= ground) {
        t.pos.y = ground;
        if (t.onImpact) t.fuse = 0;
        if (Math.abs(t.vel.y) > 1.2) {
          t.vel.y = -t.vel.y * 0.38;
          t.vel.x *= 0.62;
          t.vel.z *= 0.62;
          host.bounced(t.pos);
        } else {
          t.vel.set(0, 0, 0);
          t.grounded = true;
        }
      }
      t.mesh.rotation.x += dt * 9;
      t.mesh.rotation.z += dt * 5;
    }
    t.mesh.position.copy(t.pos);
  }
}

/** A patch of flames on the ground. */
export interface FirePatch {
  pos: Vector3;
  radius: number;
  time: number;
}

/** The fires burning right now. */
export class FireSystem {
  readonly patches: FirePatch[] = [];

  add(pos: Vector3, radius = tuning.grenades.fireRadius, duration = tuning.grenades.fireDuration): void {
    this.patches.push({ pos: pos.clone(), radius, time: duration });
    if (this.patches.length > 8) this.patches.shift();
  }

  update(dt: number): void {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      this.patches[i].time -= dt;
      if (this.patches[i].time <= 0) this.patches.splice(i, 1);
    }
  }

  /** Is this spot in the flames? */
  covers(x: number, z: number, margin = 0): FirePatch | null {
    for (const p of this.patches) if (Math.hypot(x - p.pos.x, z - p.pos.z) < p.radius + margin) return p;
    return null;
  }

  clear(): void {
    this.patches.length = 0;
  }
}
