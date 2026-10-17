import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
  type Blending,
} from 'three';

/** Soft round blob used by every particle. */
function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

const VERTEX = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  uniform float scale;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.05, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vTint;
  void main() {
    float a = texture2D(map, gl_PointCoord).a * vTint.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vTint.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface ParticleSpec {
  position: Vector3;
  velocity: Vector3;
  life: number;
  size: number;
  /** Size multiplier at the end of its life. */
  grow?: number;
  color: Color;
  alpha?: number;
  /** 1 = falls like a stone, 0 = floats. */
  gravity?: number;
  /** Air resistance. */
  drag?: number;
}

/** A pool of simple glowing or smoky dots, drawn in one go. */
export class ParticleSystem {
  readonly points: Points;
  private readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly tint: Float32Array;
  private readonly size: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly grow: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private next = 0;
  private readonly material: ShaderMaterial;

  constructor(capacity: number, blending: Blending = NormalBlending) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.tint = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('tint', new BufferAttribute(this.tint, 4));
    geo.setAttribute('size', new BufferAttribute(this.size, 1));
    this.material = new ShaderMaterial({
      uniforms: { map: { value: blobTexture() }, scale: { value: 500 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
  }

  static additive(capacity: number): ParticleSystem {
    return new ParticleSystem(capacity, AdditiveBlending);
  }

  /** Converts particle sizes (metres) to pixels for the current screen and field of view. */
  setScreen(heightPx: number, fovDegrees: number): void {
    this.material.uniforms.scale.value = heightPx / (2 * Math.tan((fovDegrees * Math.PI) / 360));
  }

  spawn(p: ParticleSpec): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos.set([p.position.x, p.position.y, p.position.z], i * 3);
    this.vel.set([p.velocity.x, p.velocity.y, p.velocity.z], i * 3);
    this.tint.set([p.color.r, p.color.g, p.color.b, p.alpha ?? 1], i * 4);
    this.baseAlpha[i] = p.alpha ?? 1;
    this.baseSize[i] = p.size;
    this.size[i] = p.size;
    this.grow[i] = p.grow ?? 1;
    this.life[i] = p.life;
    this.maxLife[i] = p.life;
    this.gravity[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
  }

  update(dt: number, groundAt: (x: number, z: number) => number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.tint[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      const k = i * 3;
      const drag = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag - 9.8 * this.gravity[i] * dt;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const ground = groundAt(this.pos[k], this.pos[k + 2]) + 0.01;
      if (this.pos[k + 1] < ground) {
        this.pos[k + 1] = ground;
        this.vel[k] = this.vel[k + 1] = this.vel[k + 2] = 0;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.baseSize[i] * (1 + (this.grow[i] - 1) * t);
      this.tint[i * 4 + 3] = this.baseAlpha[i] * Math.min(1, (1 - t) * 2.5);
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.tint.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }
}
