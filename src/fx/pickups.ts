import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import type { Drop } from '../combat/drops';
import { tuning } from '../config/tuning';
import { TREASURES } from '../inventory/items';

// Things lying on the ground to pick up: ammo, herbs, coins, treasure and
// grenades. They glow so you can see them, bob gently, and fade after a while.

export type PickupDrop = Drop | { type: 'orb' };

export interface Pickup {
  drop: PickupDrop;
  object: Group;
  glow: Sprite;
  beam: Mesh;
  age: number;
  life: number;
  vel: Vector3;
  landed: boolean;
  baseY: number;
  phase: number;
  /** Counts up while collecting is blocked (so a drop popped out of a zombie isn't grabbed in mid-air). */
  grace: number;
}

const geo = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(0.5, 0.5, 1, 12),
  sphere: new SphereGeometry(0.5, 12, 8),
  gem: new OctahedronGeometry(0.5, 0),
  rock: new IcosahedronGeometry(0.5, 0),
  capsule: new CapsuleGeometry(0.3, 0.4, 3, 8),
  leaf: new SphereGeometry(0.5, 8, 6),
  torus: new TorusGeometry(0.4, 0.12, 6, 14),
  beam: new CylinderGeometry(0.035, 0.035, 2.4, 6, 1, true).translate(0, 1.2, 0),
};

const matCache = new Map<string, MeshStandardMaterial>();
function mat(color: string, o: { metal?: number; rough?: number; emissive?: number } = {}): MeshStandardMaterial {
  const key = `${color}|${o.metal ?? 0}|${o.rough ?? 0.6}|${o.emissive ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      metalness: o.metal ?? 0.1,
      roughness: o.rough ?? 0.6,
      emissive: o.emissive ? new Color(color) : new Color('#000000'),
      emissiveIntensity: o.emissive ?? 0,
    });
    matCache.set(key, m);
  }
  return m;
}

let glowMap: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (!glowMap) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowMap = new CanvasTexture(c);
  }
  return glowMap;
}

const glowMats = new Map<string, SpriteMaterial>();
const beamMats = new Map<string, MeshBasicMaterial>();

function part(parent: Group, g: BufferGeometry, m: Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): Mesh {
  const mesh = new Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.raycast = () => {};
  parent.add(mesh);
  return mesh;
}

/** Ammo box colours, so you can tell a shotgun shell box from a pistol one at a glance. */
const AMMO_COLOR: Record<string, string> = {
  pistol: '#c9a23a',
  heavy: '#c9a23a',
  swift: '#d9b84a',
  pump: '#b8372a',
  drum: '#b8372a',
  smg: '#6aa0c9',
  rifle: '#5f9a5a',
  magnum: '#d9772a',
  rocket: '#8a8f5a',
};

/** Builds the little model for a drop, and the colour it glows. */
function buildModel(drop: PickupDrop): { group: Group; color: string; scale: number } {
  const g = new Group();
  switch (drop.type) {
    case 'ammo': {
      const color = AMMO_COLOR[drop.weapon] ?? '#c9a23a';
      part(g, geo.box, mat('#3a3f2c', { rough: 0.8 }), 0, 0.07, 0, 0.3, 0.14, 0.2);
      part(g, geo.box, mat(color, { emissive: 0.25 }), 0, 0.145, 0, 0.26, 0.02, 0.12);
      if (drop.weapon === 'rocket') part(g, geo.cyl, mat('#6b6e46'), 0, 0.12, 0, 0.1, 0.5, 0.1, 0, 0, Math.PI / 2);
      return { group: g, color, scale: 1 };
    }
    case 'herb': {
      const color = drop.herb === 'G' ? '#4fc04a' : drop.herb === 'R' ? '#e0443c' : '#e8cc3a';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        part(g, geo.leaf, mat(color, { emissive: 0.15, rough: 0.7 }), Math.cos(a) * 0.07, 0.1, Math.sin(a) * 0.07, 0.07, 0.2, 0.025, 0.5, a, 0.5);
      }
      part(g, geo.cyl, mat('#355a2a'), 0, 0.05, 0, 0.02, 0.1, 0.02);
      return { group: g, color, scale: 1.1 };
    }
    case 'spray': {
      part(g, geo.cyl, mat('#e8eef2', { metal: 0.3, rough: 0.35 }), 0, 0.11, 0, 0.08, 0.22, 0.08);
      part(g, geo.cyl, mat('#3b82e0', { emissive: 0.3 }), 0, 0.25, 0, 0.06, 0.06, 0.06);
      part(g, geo.box, mat('#d6403a'), 0, 0.12, 0.04, 0.05, 0.08, 0.005);
      return { group: g, color: '#8fd0ff', scale: 1.1 };
    }
    case 'coins': {
      const gold = mat('#e0b43a', { metal: 0.9, rough: 0.3, emissive: 0.3 });
      const n = drop.amount >= 200 ? 5 : drop.amount >= 100 ? 4 : 3;
      for (let i = 0; i < n; i++) part(g, geo.cyl, gold, (i % 2) * 0.05 - 0.02, 0.012 + i * 0.022, (i % 3) * 0.03 - 0.03, 0.12, 0.02, 0.12, 0, i, 0);
      return { group: g, color: '#ffd24a', scale: 1 };
    }
    case 'treasure': {
      const t = TREASURES[drop.treasure] ?? TREASURES.gemRed;
      const m = mat(t.color, { metal: drop.treasure === 'goldBar' || drop.treasure === 'chalice' || drop.treasure === 'crown' ? 0.9 : 0.2, rough: 0.2, emissive: 0.35 });
      if (drop.treasure.startsWith('gem')) part(g, geo.gem, m, 0, 0.14, 0, 0.16, 0.22, 0.16);
      else if (drop.treasure === 'goldBar') part(g, geo.box, m, 0, 0.05, 0, 0.26, 0.09, 0.12);
      else if (drop.treasure === 'idol') {
        part(g, geo.capsule, m, 0, 0.2, 0, 0.3, 0.55, 0.3);
        part(g, geo.box, m, 0, 0.03, 0, 0.2, 0.06, 0.2);
      } else if (drop.treasure === 'chalice') {
        part(g, geo.cyl, m, 0, 0.04, 0, 0.12, 0.04, 0.12);
        part(g, geo.cyl, m, 0, 0.11, 0, 0.03, 0.14, 0.03);
        part(g, geo.cyl, m, 0, 0.22, 0, 0.14, 0.12, 0.14);
      } else {
        part(g, geo.torus, m, 0, 0.14, 0, 0.45, 0.45, 0.45, Math.PI / 2, 0, 0);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          part(g, geo.gem, mat('#d6283c', { emissive: 0.5 }), Math.cos(a) * 0.17, 0.25, Math.sin(a) * 0.17, 0.06, 0.1, 0.06);
        }
      }
      return { group: g, color: t.color, scale: 1 };
    }
    case 'grenade': {
      const color = drop.grenade === 'flash' ? '#e8e8d0' : drop.grenade === 'fire' ? '#e8742a' : '#6a7a4a';
      part(g, geo.sphere, mat(color, { rough: 0.5 }), 0, 0.07, 0, 0.13, 0.15, 0.13);
      part(g, geo.cyl, mat('#555a52', { metal: 0.8 }), 0, 0.16, 0, 0.05, 0.04, 0.05);
      part(g, geo.torus, mat('#9aa0a6', { metal: 0.9 }), 0.05, 0.18, 0, 0.12, 0.12, 0.12);
      return { group: g, color: drop.grenade === 'frag' ? '#a8ff7a' : color, scale: 1.1 };
    }
    case 'orb': {
      part(g, geo.sphere, new MeshStandardMaterial({ color: '#4fd8ff', emissive: new Color('#4fd8ff'), emissiveIntensity: 1.5, roughness: 0.2 }), 0, 0.5, 0, 0.45, 0.45, 0.45);
      return { group: g, color: '#4fd8ff', scale: 1.4 };
    }
  }
}

const v = new Vector3();

export class Pickups {
  readonly list: Pickup[] = [];

  constructor(private readonly scene: Scene) {}

  get count(): number {
    return this.list.length;
  }

  /** Drops something at a point: it pops up and out, lands, and waits to be picked up. */
  spawn(drop: PickupDrop, at: Vector3, groundY: number, life = tuning.drops.lifetime): Pickup {
    const { group, color, scale } = buildModel(drop);
    group.scale.setScalar(scale);
    group.position.set(at.x, Math.max(groundY + 0.4, at.y), at.z);
    this.scene.add(group);

    let gm = glowMats.get(color);
    if (!gm) {
      gm = new SpriteMaterial({ map: glowTexture(), color, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
      glowMats.set(color, gm);
    }
    const glow = new Sprite(gm);
    glow.scale.setScalar(drop.type === 'orb' ? 1.8 : 0.85);
    glow.position.y = drop.type === 'orb' ? 0.5 : 0.18;
    glow.raycast = () => {};
    group.add(glow);

    let bm = beamMats.get(color);
    if (!bm) {
      bm = new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false });
      beamMats.set(color, bm);
    }
    const beam = new Mesh(geo.beam, bm);
    beam.raycast = () => {};
    group.add(beam);

    const a = Math.random() * Math.PI * 2;
    const p: Pickup = {
      drop,
      object: group,
      glow,
      beam,
      age: 0,
      life,
      vel: new Vector3(Math.cos(a) * 1.2, 3 + Math.random() * 1.5, Math.sin(a) * 1.2),
      landed: false,
      baseY: groundY,
      phase: Math.random() * 6,
      grace: 0.45,
    };
    this.list.push(p);
    return p;
  }

  /**
   * Moves everything. `collect` is asked about each pickup in reach and
   * returns true if it was taken (false = no room, it stays).
   */
  update(dt: number, player: Vector3, groundAt: (x: number, z: number) => number, collect: (p: Pickup) => boolean): void {
    const d = tuning.drops;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      p.grace = Math.max(0, p.grace - dt);
      const o = p.object;
      p.baseY = groundAt(o.position.x, o.position.z);
      if (!p.landed) {
        p.vel.y -= 9.8 * dt;
        o.position.addScaledVector(p.vel, dt);
        if (o.position.y <= p.baseY + 0.02) {
          o.position.y = p.baseY + 0.02;
          p.vel.set(0, 0, 0);
          p.landed = true;
        }
        o.rotation.y += dt * 8;
      } else {
        o.rotation.y += dt * 1.4;
        const bob = 0.05 + Math.sin(p.age * 3 + p.phase) * 0.04;
        o.position.y = p.baseY + bob + (p.drop.type === 'orb' ? 0.3 : 0);
      }
      // Fades: blinks in the last few seconds, then shrinks away.
      const left = p.life - p.age;
      if (p.life < 1e8 && left < 5) o.visible = left <= 0.6 || Math.floor(p.age * 5) % 2 === 0;
      o.scale.setScalar(Math.max(0, Math.min(1, left / 0.6)) * (p.drop.type === 'orb' ? 1.4 : p.drop.type === 'herb' || p.drop.type === 'spray' || p.drop.type === 'grenade' ? 1.1 : 1));
      p.glow.material.opacity = 0.75 + Math.sin(p.age * 4 + p.phase) * 0.2;
      if (left <= 0) {
        this.remove(i);
        continue;
      }
      // Drifts towards you when you are near, then is picked up when you reach it.
      const dx = player.x - o.position.x;
      const dz = player.z - o.position.z;
      const dist = Math.hypot(dx, dz);
      if (p.landed && p.grace <= 0 && dist < d.magnetRadius && dist > 0.01 && dist > d.pickupRadius * 0.6) {
        const pull = Math.min(dist, (3 + (d.magnetRadius - dist) * 2) * dt);
        o.position.x += (dx / dist) * pull;
        o.position.z += (dz / dist) * pull;
      }
      if (p.landed && p.grace <= 0 && dist < d.pickupRadius && Math.abs(player.y + 0.8 - o.position.y) < 2.2) {
        if (collect(p)) this.remove(i);
      }
    }
    void v;
  }

  remove(i: number): void {
    const p = this.list[i];
    this.list.splice(i, 1);
    p.object.removeFromParent();
  }

  clear(): void {
    while (this.list.length) this.remove(this.list.length - 1);
  }
}
