import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { seededRandom } from '../world/textures';

export type DecalKind = 'hole' | 'blood' | 'scorch';

function decalTexture(kind: DecalKind): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const rand = seededRandom(kind === 'hole' ? 5 : kind === 'blood' ? 9 : 17);
  if (kind === 'scorch') {
    // A black blast mark with ragged streaks.
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
    g.addColorStop(0, 'rgba(6,5,4,0.95)');
    g.addColorStop(0.45, 'rgba(14,11,9,0.8)');
    g.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(8,6,5,0.6)';
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20);
      ctx.lineTo(64 + Math.cos(a) * (45 + rand() * 18), 64 + Math.sin(a) * (45 + rand() * 18));
      ctx.lineWidth = 2 + rand() * 4;
      ctx.stroke();
    }
  } else if (kind === 'hole') {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
    g.addColorStop(0, 'rgba(8,6,5,1)');
    g.addColorStop(0.25, 'rgba(20,16,12,0.95)');
    g.addColorStop(0.45, 'rgba(60,50,40,0.6)');
    g.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(15,12,10,0.7)';
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(a) * (25 + rand() * 25), 64 + Math.sin(a) * (25 + rand() * 25));
      ctx.lineWidth = 1 + rand() * 2;
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(70, 6, 4, 0.95)';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const r = 26 + rand() * 18;
      ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    ctx.fill();
    for (let i = 0; i < 18; i++) {
      const a = rand() * Math.PI * 2;
      const d = 35 + rand() * 25;
      ctx.beginPath();
      ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + rand() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const m = new Matrix4();
const q = new Quaternion();
const spin = new Quaternion();
const s = new Vector3();
const Z = new Vector3(0, 0, 1);

/**
 * Bullet holes and blood splats stuck onto surfaces. A fixed-size pool: the
 * oldest one is reused when it fills up, and each shrinks away at the end of its life.
 */
export class DecalPool {
  readonly mesh: InstancedMesh;
  private readonly born: Float32Array;
  private readonly sizes: Float32Array;
  private readonly positions: Vector3[] = [];
  private readonly rotations: Quaternion[] = [];
  private next = 0;
  private time = 0;

  constructor(kind: DecalKind, private readonly capacity: number) {
    const mat = new MeshStandardMaterial({
      map: decalTexture(kind),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      roughness: kind === 'blood' ? 0.35 : 0.95,
      metalness: 0,
    });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.receiveShadow = true;
    this.born = new Float32Array(capacity).fill(-1e9);
    this.sizes = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.positions.push(new Vector3());
      this.rotations.push(new Quaternion());
      this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
    }
  }

  add(point: Vector3, normal: Vector3, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.positions[i].copy(point).addScaledVector(normal, 0.005);
    q.setFromUnitVectors(Z, normal);
    spin.setFromAxisAngle(Z, Math.random() * Math.PI * 2);
    this.rotations[i].copy(q).multiply(spin);
    this.sizes[i] = size;
    this.born[i] = this.time;
    this.write(i, 1);
  }

  private write(i: number, k: number): void {
    s.setScalar(this.sizes[i] * k);
    this.mesh.setMatrixAt(i, m.compose(this.positions[i], this.rotations[i], s));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, life: number): void {
    this.time += dt;
    for (let i = 0; i < this.capacity; i++) {
      const age = this.time - this.born[i];
      if (age < life - 1.5 || this.sizes[i] === 0) continue;
      const k = Math.max(0, (life - age) / 1.5);
      this.write(i, k);
      if (k === 0) this.sizes[i] = 0;
    }
  }
}
