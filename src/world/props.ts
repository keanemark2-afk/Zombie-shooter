import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  RingGeometry,
  ExtrudeGeometry,
  Shape,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import { tuning } from '../config/tuning';
import type { Collider, ColliderTag } from './colliders';
import {
  barrelTexture,
  crateTexture,
  plankTexture,
  plasterTexture,
  signTexture,
  seededRandom,
  shingleTexture,
  stoneTexture,
  strawTexture,
} from './textures';

// Builders for every placeholder prop in the village. Everything is made from
// simple shapes so it can be swapped for real models later.

/** Box whose texture is scaled by its real size, so planks and stones look the same size everywhere. */
export function box(w: number, h: number, d: number, tile = 1): BoxGeometry {
  const g = new BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faceSizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * faceSizes[face][0]) / tile, (uv.getY(idx) * faceSizes[face][1]) / tile);
    }
  }
  return g;
}

function scaleUV<T extends BufferGeometry>(g: T, su: number, sv: number): T {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

const UP = new Vector3(0, 1, 0);

/** A square beam stretched between two points. */
function beamMesh(a: Vector3, b: Vector3, thickness: number, mat: Material): Mesh {
  const dir = new Vector3().subVectors(b, a);
  const length = dir.length();
  const m = new Mesh(box(thickness, length, thickness, 1), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.normalize()));
  return m;
}

interface MeshOpts {
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  cast?: boolean;
  receive?: boolean;
}

function place(parent: Object3D, geo: BufferGeometry, mat: Material, x: number, y: number, z: number, o: MeshOpts = {}): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  parent.add(m);
  return m;
}

/** A light that glows from a window or lantern and flickers gently. */
export interface Lamp {
  light: PointLight | null;
  glow: MeshStandardMaterial;
  phase: number;
  /** 1 = full lantern flicker, smaller = steadier (windows). */
  flicker: number;
}

/** What a surface is made of, so bullets can make the right sound and puff. */
export type Surface = 'wood' | 'stone' | 'dirt' | 'metal' | 'plaster' | 'straw' | 'glass';

function makePropMaterials() {
  const planks = plankTexture('#6d5038', 6, 3);
  const darkPlanks = plankTexture('#4a3627', 5, 8);
  const crate = crateTexture();
  const stone = stoneTexture();
  const plaster = plasterTexture();
  const shingles = shingleTexture();
  const straw = strawTexture();
  const barrel = barrelTexture();
  const std = (surface: Surface, params: ConstructorParameters<typeof MeshStandardMaterial>[0]) => {
    const mat = new MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...params });
    mat.userData.surface = surface;
    return mat;
  };
  return {
    wood: std('wood', { map: planks.color, bumpMap: planks.bump, bumpScale: 1.5 }),
    darkWood: std('wood', { map: darkPlanks.color, bumpMap: darkPlanks.bump, bumpScale: 1.5 }),
    timber: std('wood', { color: '#3a2b20' }),
    crate: std('wood', { map: crate.color, bumpMap: crate.bump, bumpScale: 2 }),
    stone: std('stone', { map: stone.color, bumpMap: stone.bump, bumpScale: 3 }),
    stoneInside: std('stone', { map: stone.color, color: '#555', side: BackSide }),
    plaster: std('plaster', { map: plaster.color, bumpMap: plaster.bump, bumpScale: 1 }),
    shingles: std('wood', { map: shingles.color, bumpMap: shingles.bump, bumpScale: 2 }),
    straw: std('straw', { map: straw.color, bumpMap: straw.bump, bumpScale: 2 }),
    barrel: std('metal', { map: barrel.color, bumpMap: barrel.bump, bumpScale: 1, roughness: 0.6, metalness: 0.35 }),
    metal: std('metal', { color: '#2b2826', roughness: 0.5, metalness: 0.7 }),
    water: std('stone', { color: '#07090b', roughness: 0.08 }),
    darkGlass: std('glass', { color: '#141a22', roughness: 0.25, metalness: 0.2 }),
    rope: std('wood', { color: '#7d6a4c' }),
    paint: std('wood', { color: '#b9b09a' }),
  };
}

let sharedMaterials: ReturnType<typeof makePropMaterials> | null = null;

/** Prop materials are painted once and shared by every level. */
export function propMaterials(): ReturnType<typeof makePropMaterials> {
  sharedMaterials ??= makePropMaterials();
  return sharedMaterials;
}

export class PropBuilder {
  readonly colliders: Collider[] = [];
  readonly lamps: Lamp[] = [];
  private readonly rand: () => number;
  readonly mats = propMaterials();

  constructor(seed = 1234) {
    this.rand = seededRandom(seed);
  }

  private glowMaterial(): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({
      color: '#000000',
      emissive: new Color(tuning.atmosphere.lampColor),
      emissiveIntensity: 3,
      roughness: 1,
    });
    mat.userData.surface = 'glass';
    return mat;
  }

  private boxCollider(x: number, z: number, w: number, d: number, rotY: number, height: number, tag: ColliderTag = 'solid'): void {
    this.colliders.push({ kind: 'box', x, z, halfW: w / 2, halfD: d / 2, rotY, height, tag });
  }

  private circleCollider(x: number, z: number, radius: number, height: number, tag: ColliderTag = 'solid'): void {
    this.colliders.push({ kind: 'circle', x, z, radius, height, tag });
  }

  private addLamp(parent: Object3D, glow: MeshStandardMaterial, lightPos: Vector3 | null, flicker: number): void {
    let light: PointLight | null = null;
    if (lightPos) {
      light = new PointLight(tuning.atmosphere.lampColor, tuning.atmosphere.lampIntensity, tuning.atmosphere.lampRange, 2);
      light.position.copy(lightPos);
      parent.add(light);
    }
    this.lamps.push({ light, glow, phase: this.rand() * 100, flicker });
  }

  /** A run of rickety fence from (ax, az) to (bx, bz): posts with two rails, some broken. */
  fence(parent: Object3D, ax: number, az: number, bx: number, bz: number): void {
    const length = Math.hypot(bx - ax, bz - az);
    const segments = Math.max(1, Math.round(length / 2.2));
    const dirX = (bx - ax) / length;
    const dirZ = (bz - az) / length;
    const posts: Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = new Vector3(ax + (bx - ax) * t, 0, az + (bz - az) * t);
      posts.push(p);
      const h = 1.15 + this.rand() * 0.2;
      const lean = (this.rand() - 0.5) * 0.12;
      const post = place(parent, box(0.14, h, 0.14, 1), this.mats.darkWood, p.x, h / 2 - 0.05, p.z, {
        rotY: Math.atan2(dirX, dirZ),
        rotZ: lean,
      });
      post.rotation.order = 'YXZ';
    }
    for (let i = 0; i < segments; i++) {
      for (const railY of [0.42, 0.92]) {
        if (this.rand() < 0.12) continue; // a missing rail here and there
        const sag = (this.rand() - 0.5) * 0.08;
        const a = posts[i].clone().setY(railY + sag);
        const b = posts[i + 1].clone().setY(railY - sag);
        const rail = beamMesh(a, b, 0.07, this.mats.wood);
        rail.castShadow = true;
        rail.receiveShadow = true;
        parent.add(rail);
      }
    }
    const angle = Math.atan2(bx - ax, bz - az);
    this.boxCollider((ax + bx) / 2, (az + bz) / 2, 0.3, length, angle, 1.2);
  }

  /** Gabled roof (two sloped panels plus triangular ends) sitting on a w x d box of height h. */
  private gableRoof(
    parent: Object3D,
    w: number,
    d: number,
    h: number,
    rise: number,
    overhang: number,
    roofMat: Material,
    endMat: Material,
  ): void {
    const hd = d / 2 + overhang;
    const slope = Math.hypot(hd, rise);
    const angle = Math.atan2(rise, hd);
    for (const side of [1, -1]) {
      const panel = place(parent, box(w + overhang * 2, 0.1, slope, 1.6), roofMat, 0, h + rise / 2 + 0.05, (side * hd) / 2, {
        rotX: side * angle,
      });
      panel.castShadow = true;
    }
    const tri = new Shape();
    tri.moveTo(-d / 2, 0);
    tri.lineTo(d / 2, 0);
    tri.lineTo(0, rise);
    tri.closePath();
    // A thin solid (not a flat sheet) so it casts shadows from both sides.
    const triGeo = scaleUV(new ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false }), 0.4, 0.4);
    for (const side of [1, -1]) {
      const end = new Mesh(triGeo, endMat);
      end.position.set(side * (w / 2 - 0.08), h, 0);
      end.rotation.y = side * (Math.PI / 2);
      end.castShadow = true;
      end.receiveShadow = true;
      parent.add(end);
    }
  }

  /** A window on the local +z face: frame, panes, and optionally a warm light inside. */
  private window(parent: Object3D, x: number, y: number, zFace: number, w: number, h: number, lit: boolean, castLight: boolean): void {
    const glass = lit ? this.glowMaterial() : this.mats.darkGlass;
    place(parent, box(w, h, 0.04), glass, x, y, zFace + 0.01, { cast: false });
    const t = 0.07;
    const z = zFace + 0.05;
    place(parent, box(w + t * 2, t, 0.08), this.mats.timber, x, y + h / 2, z);
    place(parent, box(w + t * 2, t, 0.08), this.mats.timber, x, y - h / 2, z);
    place(parent, box(t, h, 0.08), this.mats.timber, x - w / 2, y, z);
    place(parent, box(t, h, 0.08), this.mats.timber, x + w / 2, y, z);
    place(parent, box(0.04, h, 0.06), this.mats.timber, x, y, z, { cast: false });
    place(parent, box(w, 0.04, 0.06), this.mats.timber, x, y, z, { cast: false });
    if (lit) {
      this.addLamp(parent, glass as MeshStandardMaterial, castLight ? new Vector3(x, y, zFace + 1.2) : null, 0.25);
    }
  }

  /** Small wooden shed. Its door and window face local +z. */
  shed(parent: Object3D, x: number, z: number, w: number, d: number, h: number, rotY: number, litWindow = false): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    place(g, box(w, h, d, 2.2), this.mats.wood, 0, h / 2, 0);
    this.gableRoof(g, w, d, h, 0.9, 0.35, this.mats.shingles, this.mats.wood);
    place(g, box(0.95, 1.95, 0.06, 1.2), this.mats.darkWood, -w / 4, 0.975, d / 2 + 0.03);
    this.window(g, w / 4, h * 0.6, d / 2, 0.7, 0.55, litWindow, litWindow);
    this.boxCollider(x, z, w, d, rotY, h + 0.9);
  }

  /** Two-storey plaster-and-timber house used as backdrop around the square. Front faces local +z. */
  house(
    parent: Object3D,
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    rotY: number,
    litWindows: boolean[],
    castLight: boolean,
  ): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    place(g, box(w, h, d, 3), this.mats.plaster, 0, h / 2, 0);
    // Dark timber framing.
    const t = 0.24;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      place(g, box(t, h, t), this.mats.timber, (sx * (w - t)) / 2 + sx * 0.02, h / 2, (sz * (d - t)) / 2 + sz * 0.02);
    }
    for (const y of [h * 0.5, h - t / 2, t / 2]) {
      place(g, box(w + 0.06, t, 0.1), this.mats.timber, 0, y, d / 2 + 0.03);
      place(g, box(w + 0.06, t, 0.1), this.mats.timber, 0, y, -d / 2 - 0.03);
      place(g, box(0.1, t, d + 0.06), this.mats.timber, w / 2 + 0.03, y, 0);
      place(g, box(0.1, t, d + 0.06), this.mats.timber, -w / 2 - 0.03, y, 0);
    }
    for (const sx of [-1, 1]) {
      g.add(beamMesh(new Vector3(sx * w * 0.49, h * 0.53, d / 2 + 0.05), new Vector3(sx * w * 0.38, h * 0.95, d / 2 + 0.05), 0.16, this.mats.timber));
    }
    this.gableRoof(g, w, d, h, 2.2, 0.5, this.mats.shingles, this.mats.plaster);
    place(g, box(0.8, 2.6, 0.8, 1.2), this.mats.stone, w * 0.3, h + 1.6, -d * 0.15);
    // Door and windows on the front.
    place(g, box(1.1, 2.1, 0.08, 1.2), this.mats.darkWood, -w * 0.3, 1.05, d / 2 + 0.04);
    const spots: Array<[number, number]> = [
      [w * 0.12, h * 0.25],
      [w * 0.34, h * 0.25],
      [-w * 0.28, h * 0.74],
      [w * 0.22, h * 0.74],
    ];
    let lightUsed = false;
    spots.forEach(([wx, wy], i) => {
      const lit = litWindows[i] ?? false;
      const giveLight = lit && castLight && !lightUsed;
      if (giveLight) lightUsed = true;
      this.window(g, wx, wy, d / 2, 0.85, 0.95, lit, giveLight);
    });
    this.boxCollider(x, z, w, d, rotY, h + 2.2);
  }

  /** The stone well in the middle of the square. */
  well(parent: Object3D, x: number, z: number): void {
    const g = new Group();
    g.position.set(x, 0, z);
    parent.add(g);
    const r = 1.1;
    const h = 0.9;
    place(g, scaleUV(new CylinderGeometry(r, r * 1.04, h, 24, 1, true), 5, 0.65), this.mats.stone, 0, h / 2, 0);
    place(g, scaleUV(new CylinderGeometry(r - 0.22, r - 0.22, h, 24, 1, true), 4, 0.65), this.mats.stoneInside, 0, h / 2, 0, { cast: false });
    place(g, scaleUV(new RingGeometry(r - 0.22, r + 0.02, 24, 1), 0.6, 0.6), this.mats.stone, 0, h, 0, { rotX: -Math.PI / 2 });
    place(g, new CylinderGeometry(r - 0.22, r - 0.22, 0.02, 24), this.mats.water, 0, 0.25, 0, { cast: false });
    for (const sx of [-1, 1]) place(g, box(0.15, 2.4, 0.15), this.mats.darkWood, sx * (r - 0.05), 1.2, 0);
    place(g, new CylinderGeometry(0.06, 0.06, 2.4, 8), this.mats.darkWood, 0, 1.9, 0, { rotZ: Math.PI / 2 });
    g.add(beamMesh(new Vector3(r + 0.05, 1.9, 0), new Vector3(r + 0.2, 1.75, 0.3), 0.05, this.mats.metal));
    place(g, new CylinderGeometry(0.012, 0.012, 0.75, 4), this.mats.rope, 0.25, 1.5, 0, { cast: false });
    place(g, new CylinderGeometry(0.17, 0.13, 0.26, 12), this.mats.darkWood, 0.25, 1.05, 0);
    // Little roof over the crank.
    const hd = 0.95;
    const rise = 0.55;
    const angle = Math.atan2(rise, hd);
    for (const side of [1, -1]) {
      place(g, box(2.7, 0.07, Math.hypot(hd, rise), 1.4), this.mats.shingles, 0, 2.4 + rise / 2, (side * hd) / 2, { rotX: side * angle });
    }
    this.circleCollider(x, z, r + 0.05, h);
  }

  /** Wooden watchtower with a platform, railing, ladder and pointed roof. */
  watchtower(parent: Object3D, x: number, z: number, rotY: number): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    const base = 1.6;
    const top = 1.3;
    const deck = 5;
    const roofBase = 7.3;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const lowCorner = (i: number) => new Vector3(corners[i][0] * base, 0, corners[i][1] * base);
    const highCorner = (i: number, y = deck) => new Vector3(corners[i][0] * top, y, corners[i][1] * top);
    for (let i = 0; i < 4; i++) {
      const leg = beamMesh(lowCorner(i), highCorner(i, deck + 0.1), 0.24, this.mats.darkWood);
      leg.castShadow = true;
      g.add(leg);
      const post = beamMesh(highCorner(i), highCorner(i, roofBase), 0.16, this.mats.darkWood);
      post.castShadow = true;
      g.add(post);
      // Cross braces between this leg and the next.
      const j = (i + 1) % 4;
      const at = (k: number, t: number) => lowCorner(k).lerp(highCorner(k), t);
      for (const [t0, t1] of [[0.08, 0.48], [0.52, 0.9]]) {
        g.add(beamMesh(at(i, t0), at(j, t1), 0.1, this.mats.wood));
        g.add(beamMesh(at(j, t0), at(i, t1), 0.1, this.mats.wood));
      }
    }
    place(g, box(top * 2 + 0.5, 0.16, top * 2 + 0.5, 1.6), this.mats.wood, 0, deck, 0);
    for (const y of [deck + 0.5, deck + 1.0]) {
      for (let i = 0; i < 4; i++) {
        if (i === 2 && y < deck + 0.8) continue; // gap at the top of the ladder
        g.add(beamMesh(highCorner(i, y), highCorner((i + 1) % 4, y), 0.08, this.mats.wood));
      }
    }
    const roof = place(g, scaleUV(new ConeGeometry(2.3, 1.7, 4, 1), 2, 1), this.mats.straw, 0, roofBase + 0.85, 0, {
      rotY: Math.PI / 4,
    });
    roof.castShadow = true;
    // Ladder up the +z side.
    for (const sx of [-0.28, 0.28]) {
      g.add(beamMesh(new Vector3(sx, 0, base + 0.45), new Vector3(sx, deck + 0.6, top + 0.15), 0.07, this.mats.wood));
    }
    for (let y = 0.35; y < deck; y += 0.38) {
      const t = y / (deck + 0.6);
      const zz = base + 0.45 + (top + 0.15 - base - 0.45) * t;
      place(g, box(0.62, 0.05, 0.05), this.mats.wood, 0, y, zz);
    }
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    for (let i = 0; i < 4; i++) {
      const lx = corners[i][0] * (base - 0.05);
      const lz = corners[i][1] * (base - 0.05);
      this.circleCollider(x + lx * cos + lz * sin, z - lx * sin + lz * cos, 0.22, deck);
    }
  }

  /** A stack of rectangular straw bales. */
  hayStack(parent: Object3D, x: number, z: number, rotY: number, layout: Array<[number, number, number]>): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    let maxH = 0;
    for (const [lx, level, lz] of layout) {
      const y = 0.27 + level * 0.54;
      maxH = Math.max(maxH, y + 0.27);
      place(g, box(1.15, 0.54, 0.58, 0.8), this.mats.straw, lx, y, lz, { rotY: (this.rand() - 0.5) * 0.15 });
    }
    const xs = layout.map((l) => l[0]);
    const zs = layout.map((l) => l[2]);
    const w = Math.max(...xs) - Math.min(...xs) + 1.2;
    const d = Math.max(...zs) - Math.min(...zs) + 0.62;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    this.boxCollider(x + cx * cos + cz * sin, z - cx * sin + cz * cos, w, d, rotY, maxH);
  }

  /** A big round hay bale lying on its side. */
  roundBale(parent: Object3D, x: number, z: number, rotY: number): void {
    const r = 0.75;
    place(parent, scaleUV(new CylinderGeometry(r, r, 1.2, 20), 3, 1), this.mats.straw, x, r, z, {
      rotZ: Math.PI / 2,
      rotY,
    }).rotation.order = 'YXZ';
    this.boxCollider(x, z, 1.2, r * 2, rotY, r * 2);
  }

  crate(parent: Object3D, x: number, y: number, z: number, size: number, rotY: number): void {
    const crate = place(parent, new BoxGeometry(size, size, size), this.mats.crate, x, y + size / 2, z, { rotY });
    crate.userData.dynamic = true; // stays a separate shape so it can break
    crate.userData.crate = true;
    if (y < 0.01) {
      this.boxCollider(x, z, size, size, rotY, size);
      crate.userData.collider = this.colliders[this.colliders.length - 1];
    }
  }

  /** Red explosive barrel. Tagged so later phases can make it blow up. */
  barrel(parent: Object3D, x: number, z: number): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = this.rand() * Math.PI * 2;
    g.userData.dynamic = true; // blows up when shot
    g.userData.barrel = true;
    parent.add(g);
    const r = 0.34;
    const h = 0.95;
    place(g, new CylinderGeometry(r, r, h, 18), this.mats.barrel, 0, h / 2, 0);
    for (const y of [0.22, 0.73]) {
      place(g, new TorusGeometry(r + 0.005, 0.022, 6, 24), this.mats.metal, 0, y, 0, { rotX: Math.PI / 2, cast: false });
    }
    place(g, new CylinderGeometry(r - 0.02, r - 0.02, 0.02, 18), this.mats.metal, 0, h + 0.005, 0, { cast: false });
    place(g, new CylinderGeometry(0.04, 0.04, 0.04, 8), this.mats.metal, r * 0.5, h + 0.02, 0, { cast: false });
    this.circleCollider(x, z, r + 0.02, h, 'explosive');
  }

  /** An abandoned hand cart. */
  cart(parent: Object3D, x: number, z: number, rotY: number): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    const bedY = 0.78;
    place(g, box(2.0, 0.1, 1.2, 1.5), this.mats.wood, 0, bedY, 0);
    for (const sz of [-1, 1]) place(g, box(2.0, 0.35, 0.06, 1.5), this.mats.wood, 0, bedY + 0.2, sz * 0.6);
    place(g, box(0.06, 0.35, 1.2, 1.5), this.mats.wood, -1.0, bedY + 0.2, 0);
    for (const sz of [-1, 1]) {
      place(g, new CylinderGeometry(0.55, 0.55, 0.09, 14), this.mats.darkWood, -0.25, 0.55, sz * 0.7, { rotX: Math.PI / 2 });
      place(g, new TorusGeometry(0.55, 0.035, 6, 20), this.mats.metal, -0.25, 0.55, sz * 0.75, { cast: false });
      g.add(beamMesh(new Vector3(0.9, bedY, sz * 0.45), new Vector3(2.2, 0.08, sz * 0.32), 0.08, this.mats.darkWood));
    }
    place(g, new BoxGeometry(0.5, 0.4, 0.5), this.mats.crate, 0.3, bedY + 0.25, 0.1, { rotY: 0.4 });
    this.boxCollider(x, z, 2.6, 1.6, rotY, 1.2);
  }

  /** A post with a hanging lantern that lights the ground around it. */
  lanternPost(parent: Object3D, x: number, z: number, rotY: number): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    place(g, box(0.14, 2.9, 0.14), this.mats.darkWood, 0, 1.45, 0);
    place(g, box(0.7, 0.09, 0.09), this.mats.darkWood, 0.3, 2.8, 0);
    g.add(beamMesh(new Vector3(0.06, 2.45, 0), new Vector3(0.45, 2.8, 0), 0.06, this.mats.darkWood));
    place(g, new CylinderGeometry(0.008, 0.008, 0.18, 4), this.mats.metal, 0.6, 2.67, 0, { cast: false });
    const glow = this.glowMaterial();
    place(g, box(0.14, 0.2, 0.14), glow, 0.6, 2.47, 0, { cast: false });
    place(g, box(0.2, 0.04, 0.2), this.mats.metal, 0.6, 2.59, 0, { cast: false });
    place(g, box(0.18, 0.03, 0.18), this.mats.metal, 0.6, 2.36, 0, { cast: false });
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    this.addLamp(parent, glow, new Vector3(x + 0.6 * cos, 2.3, z - 0.6 * sin), 1);
    this.circleCollider(x, z, 0.15, 2.9);
  }

  /** A solid wall of vertical planks from (ax, az) to (bx, bz). */
  plankWall(parent: Object3D, ax: number, az: number, bx: number, bz: number, height: number): void {
    const length = Math.hypot(bx - ax, bz - az);
    const angle = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    place(parent, box(0.12, height, length, 2.2), this.mats.wood, cx, height / 2, cz, { rotY: angle });
    const posts = Math.max(2, Math.round(length / 3) + 1);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      place(parent, box(0.2, height + 0.15, 0.2), this.mats.darkWood, ax + (bx - ax) * t, (height + 0.15) / 2, az + (bz - az) * t, {
        rotY: angle,
      });
    }
    this.boxCollider(cx, cz, 0.3, length, angle, height);
  }

  /** A painted board on a post, e.g. a distance marker. The text faces local +z. */
  sign(parent: Object3D, x: number, z: number, rotY: number, text: string): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    place(g, box(0.12, 1.5, 0.12), this.mats.darkWood, 0, 0.75, 0);
    const board = new MeshStandardMaterial({ map: signTexture(text), roughness: 0.9 });
    board.userData.surface = 'wood';
    place(g, new BoxGeometry(0.9, 0.45, 0.05), board, 0, 1.45, 0.08);
    this.circleCollider(x, z, 0.12, 1.5);
  }

  /** A rough wooden table. */
  table(parent: Object3D, x: number, z: number, rotY: number): void {
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    place(g, box(1.6, 0.08, 0.8, 1.2), this.mats.wood, 0, 0.82, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      place(g, box(0.08, 0.8, 0.08), this.mats.darkWood, sx * 0.7, 0.4, sz * 0.32);
    }
    place(g, new BoxGeometry(0.35, 0.18, 0.22), this.mats.crate, -0.4, 0.95, 0.05, { rotY: 0.2 });
    place(g, new BoxGeometry(0.3, 0.16, 0.2), this.mats.metal, 0.3, 0.94, -0.1, { rotY: -0.3 });
    this.boxCollider(x, z, 1.6, 0.8, rotY, 0.86);
  }
}
