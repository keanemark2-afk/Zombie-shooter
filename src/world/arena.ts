import {
  BackSide,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Camera,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tuning } from '../config/tuning';
import type { Collider } from './colliders';
import { PropBuilder, type Lamp } from './props';
import { batchStaticMeshes } from './staticBatch';
import { dirtTexture, seededRandom, worldNoise } from './textures';

/** Size and layout of the village square, shared with later phases (spawns, AI). */
export const ARENA = {
  /** The fence runs along x and z = +/- this many metres. */
  halfSize: 22,
  /** Openings in the fence where the road (and later, zombies) come through. */
  gates: [
    { name: 'north', x: 0, z: -22, width: 5 },
    { name: 'south', x: 0, z: 22, width: 5 },
    { name: 'east', x: 22, z: 5, width: 4 },
    { name: 'west', x: -22, z: -5, width: 4 },
  ],
};

/** Ground height at any point. The square itself is flat; hills rise beyond the fence. */
export function terrainHeight(x: number, z: number): number {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const hills = MathUtils.smoothstep(d, 27, 45);
  if (hills <= 0) return 0;
  const n = worldNoise(x, z, 0.035, 9) - 0.35;
  return Math.max(0, n) * 6 * hills + hills * 0.6;
}

function roadMask(x: number, z: number): number {
  const along = (a: number, b: number) => MathUtils.smoothstep(b, ARENA.halfSize - 2, ARENA.halfSize + 2) * (1 - MathUtils.smoothstep(Math.abs(a), 1.5, 3.2));
  return Math.max(along(x, Math.abs(z)), along(z - Math.sign(x) * 5, Math.abs(x)));
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vec4(p.xy, p.w * 0.99999, p.w); // always at the far distance
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 glowColor;
  uniform vec3 sunDir;
  uniform float glowStrength;
  varying vec3 vDir;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float az = atan(d.z, d.x);
    vec3 col = mix(horizonColor, topColor, pow(smoothstep(-0.02, 0.55, h), 0.65));
    float s = max(dot(d, sunDir), 0.0);
    float nearHorizon = 1.0 - smoothstep(0.0, 0.4, h);
    col += glowColor * pow(s, 5.0) * nearHorizon * glowStrength;
    col += glowColor * pow(s, 60.0) * glowStrength * 0.5;
    // A few faint early stars high up.
    float star = step(0.9975, hash(floor(d * 320.0))) * smoothstep(0.3, 0.8, h);
    col += vec3(star * 0.35);
    // Distant ridge line in silhouette.
    float ridge = 0.03 + 0.018 * sin(az * 3.0 + 1.0) + 0.011 * sin(az * 7.3 + 2.0) + 0.005 * sin(az * 19.0 + 0.5);
    col = mix(col, horizonColor * 0.7, 1.0 - smoothstep(ridge - 0.004, ridge + 0.004, h));
    col = mix(horizonColor, col, smoothstep(-0.05, 0.0, h));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * The village square at dusk: ground, sky, fog, lights and every prop.
 */
export class Arena {
  readonly root = new Group();
  readonly colliders: Collider[];
  readonly lamps: Lamp[];
  readonly sun: DirectionalLight;
  readonly skyLight: HemisphereLight;
  readonly fog: FogExp2;
  private readonly sky: Mesh;
  private readonly skyUniforms = {
    topColor: { value: new Color() },
    horizonColor: { value: new Color() },
    glowColor: { value: new Color() },
    sunDir: { value: new Vector3() },
    glowStrength: { value: 1 },
  };
  private readonly colorCache = new Map<Color, string>();

  constructor(private readonly scene: Scene) {
    scene.add(this.root);
    this.fog = new FogExp2(tuning.atmosphere.fogColor, tuning.atmosphere.fogDensity);
    scene.fog = this.fog;
    scene.background = new Color(tuning.atmosphere.fogColor);

    this.sky = new Mesh(
      new SphereGeometry(500, 32, 16),
      new ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    this.skyLight = new HemisphereLight(tuning.atmosphere.skyLightColor, tuning.atmosphere.groundBounceColor, 1);
    scene.add(this.skyLight);

    this.sun = new DirectionalLight(tuning.atmosphere.sunColor, 1);
    this.sun.castShadow = tuning.graphics.shadows;
    const cam = this.sun.shadow.camera;
    cam.left = -34;
    cam.right = 34;
    cam.top = 34;
    cam.bottom = -34;
    cam.near = 1;
    cam.far = 200;
    this.sun.shadow.mapSize.set(tuning.graphics.shadowMapSize, tuning.graphics.shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);

    this.buildGround();
    const props = new PropBuilder();
    this.buildVillage(props);
    this.colliders = props.colliders;
    this.lamps = props.lamps;
    this.buildSurroundings();
    batchStaticMeshes(this.root);
    this.update(0, null);
  }

  private buildGround(): void {
    const size = 240;
    const geo = new PlaneGeometry(size, size, 120, 120);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const dirt = new Color('#ffffff');
    const grass = new Color('#7d8a55');
    const road = new Color('#9c8c78');
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
      const d = Math.max(Math.abs(x), Math.abs(z));
      const patch = worldNoise(x, z, 0.12, 3);
      const wear = MathUtils.smoothstep(d + (patch - 0.5) * 8, ARENA.halfSize - 1, ARENA.halfSize + 6);
      c.copy(dirt).multiplyScalar(0.82 + patch * 0.35);
      c.lerp(grass, wear * 0.85);
      c.lerp(road, roadMask(x, z) * 0.7);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const tex = dirtTexture();
    const repeat = size / 3.5;
    tex.color.repeat.set(repeat, repeat);
    tex.bump.repeat.set(repeat, repeat);
    const ground = new Mesh(
      geo,
      new MeshStandardMaterial({ map: tex.color, bumpMap: tex.bump, bumpScale: 2.5, vertexColors: true, roughness: 1 }),
    );
    ground.receiveShadow = true;
    ground.name = 'ground';
    ground.userData.noBatch = true;
    this.root.add(ground);
  }

  private buildVillage(p: PropBuilder): void {
    const r = this.root;
    const H = ARENA.halfSize;

    // Fence around the square, leaving the four gates open.
    for (const side of [-1, 1]) {
      p.fence(r, -H, side * H, -2.5, side * H);
      p.fence(r, 2.5, side * H, H, side * H);
    }
    p.fence(r, H, -H, H, 3);
    p.fence(r, H, 7, H, H);
    p.fence(r, -H, -H, -H, -7);
    p.fence(r, -H, -3, -H, H);

    // Houses looking onto the square from outside the fence.
    p.house(r, -12, -30, 8, 6, 5, 0, [true, false, false, true], true);
    p.house(r, 13, -31.5, 7, 6, 4.6, 0, [false, false, true, false], false);
    p.house(r, 32, -4, 10, 7, 5.4, -Math.PI / 2, [false, true, false, false], true);
    p.house(r, -31, 11, 7, 6, 4.8, Math.PI / 2, [true, false, false, false], true);
    p.house(r, 7, 32, 8, 6, 5, Math.PI, [false, false, true, false], false);
    p.house(r, -14, 31, 6.5, 5.5, 4.4, Math.PI, [false, false, false, false], false);

    // Inside the square.
    p.well(r, 0, 0);
    p.watchtower(r, -16, -15.5, 0.12);
    p.shed(r, -17.5, 9, 4, 3, 2.6, 0.08);
    p.shed(r, 16.5, 15.5, 3.6, 3, 2.5, Math.PI - 0.15);
    p.shed(r, 16.8, -15.5, 4.2, 3.4, 2.7, -Math.PI / 2 + 0.05, true);
    p.cart(r, 6, 6.5, 0.6);

    p.hayStack(r, -13.2, 12.6, 0.3, [[0, 0, 0], [1.2, 0, 0], [0.6, 1, 0], [0, 0, 0.62]]);
    p.roundBale(r, 10, -7, 0.4);
    p.roundBale(r, 11.4, -5.4, 1.2);
    p.hayStack(r, -6.5, 15.5, -0.2, [[0, 0, 0], [1.2, 0, 0]]);

    p.crate(r, 12.6, 0, 16.2, 1, 0.1);
    p.crate(r, 13.7, 0, 16.0, 0.9, -0.2);
    p.crate(r, 13.1, 1, 16.1, 0.8, 0.5);
    p.crate(r, -12.5, 0, -17.6, 1, 0.3);
    p.crate(r, -11.4, 0, -17.9, 1, 0.05);
    p.crate(r, 19.2, 0, 1.2, 1.1, 0.2);
    p.crate(r, -19.6, 0, -4.2, 0.9, -0.4);
    p.crate(r, 4.2, 0, -12.4, 1, 0.7);
    p.crate(r, 4.3, 1, -12.4, 0.7, 0.2);
    p.crate(r, -8, 0, 4.8, 0.85, 0.9);

    p.barrel(r, 11.3, 15.2);
    p.barrel(r, -11.9, 14.3);
    p.barrel(r, 14.6, -12.4);
    p.barrel(r, -11.4, -15.3);
    p.barrel(r, 19.3, 3.3);
    p.barrel(r, -19.1, -1.9);
    p.barrel(r, 3.0, -13.4);
    p.barrel(r, -7.2, 5.8);

    p.lanternPost(r, -5, 8.5, 0.4);
    p.lanternPost(r, 8.6, -8.6, 2.2);
    p.lanternPost(r, -9, -4, -0.8);
    p.lanternPost(r, 4, 19.5, -1.7);
  }

  private buildSurroundings(): void {
    const rand = seededRandom(77);
    const houses = [[-12, -30], [13, -31.5], [32, -4], [-31, 11], [7, 32], [-14, 31]];
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const v = new Vector3();
    const yAxis = new Vector3(0, 1, 0);

    // Pine trees in a ring around the village.
    const foliageParts: BufferGeometry[] = [
      new ConeGeometry(1.7, 2.8, 7).translate(0, 2.6, 0),
      new ConeGeometry(1.3, 2.4, 7).translate(0, 3.8, 0),
      new ConeGeometry(0.85, 2.0, 7).translate(0, 5.0, 0),
    ];
    const foliageGeo = mergeGeometries(foliageParts);
    const trunkGeo = new CylinderGeometry(0.12, 0.22, 2.2, 6).translate(0, 1.1, 0);
    const spots: Array<[number, number, number]> = [];
    let tries = 0;
    while (spots.length < 170 && tries++ < 5000) {
      const angle = rand() * Math.PI * 2;
      const dist = 36 + rand() * 60;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (houses.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 9)) continue;
      if (roadMask(x, z) > 0.05 || (Math.abs(x) < 5 && Math.abs(z) > 30)) continue;
      spots.push([x, z, 0.8 + rand() * 1.1]);
    }
    const foliage = new InstancedMesh(
      foliageGeo,
      new MeshStandardMaterial({ color: '#27321f', roughness: 1, flatShading: true }),
      spots.length,
    );
    const trunks = new InstancedMesh(trunkGeo, new MeshStandardMaterial({ color: '#2d221a', roughness: 1 }), spots.length);
    spots.forEach(([x, z, k], i) => {
      q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
      s.set(k * (0.85 + rand() * 0.3), k, k * (0.85 + rand() * 0.3));
      v.set(x, terrainHeight(x, z) - 0.1, z);
      m.compose(v, q, s);
      foliage.setMatrixAt(i, m);
      trunks.setMatrixAt(i, m);
    });
    foliage.receiveShadow = true;
    trunks.receiveShadow = true;
    this.root.add(foliage, trunks);

    // Rocks scattered about, mostly outside the fence.
    const rockCount = 90;
    const rocks = new InstancedMesh(
      new IcosahedronGeometry(0.5, 0),
      new MeshStandardMaterial({ color: '#5f5c57', roughness: 0.95, flatShading: true }),
      rockCount,
    );
    for (let i = 0; i < rockCount; i++) {
      let x: number;
      let z: number;
      if (i < 12) {
        // A few small ones tucked against the inside of the fence.
        const side = Math.floor(rand() * 4);
        const t = (rand() - 0.5) * 2 * (ARENA.halfSize - 3);
        const inset = ARENA.halfSize - 0.6 - rand() * 0.8;
        [x, z] = side === 0 ? [t, -inset] : side === 1 ? [t, inset] : side === 2 ? [inset, t] : [-inset, t];
      } else {
        const angle = rand() * Math.PI * 2;
        const dist = 25 + rand() * 45;
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
      }
      const k = i < 12 ? 0.25 + rand() * 0.25 : 0.3 + rand() * 1.1;
      q.setFromAxisAngle(v.set(rand(), rand(), rand()).normalize(), rand() * Math.PI);
      s.set(k * (1 + rand()), k * (0.6 + rand() * 0.5), k * (1 + rand()));
      m.compose(new Vector3(x, terrainHeight(x, z) + k * 0.15, z), q, s);
      rocks.setMatrixAt(i, m);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.root.add(rocks);

    // Dry grass tufts beyond the fence.
    const tuftCount = 700;
    const tufts = new InstancedMesh(
      new ConeGeometry(0.12, 0.55, 4).translate(0, 0.25, 0),
      new MeshStandardMaterial({ color: '#6e6a45', roughness: 1 }),
      tuftCount,
    );
    for (let i = 0; i < tuftCount; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = 23.5 + rand() * 40;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (Math.max(Math.abs(x), Math.abs(z)) < 23 || roadMask(x, z) > 0.3) {
        m.makeScale(0, 0, 0);
      } else {
        const k = 0.6 + rand() * 0.9;
        q.setFromAxisAngle(v.set(rand() - 0.5, 4, rand() - 0.5).normalize(), rand() * 0.5);
        m.compose(new Vector3(x, terrainHeight(x, z), z), q, s.set(k, k * (0.7 + rand() * 0.6), k));
      }
      tufts.setMatrixAt(i, m);
    }
    tufts.receiveShadow = true;
    this.root.add(tufts);
  }

  private setColor(color: Color, hex: string): void {
    if (this.colorCache.get(color) === hex) return;
    color.set(hex);
    this.colorCache.set(color, hex);
  }

  /** Brings sky, fog and lights in line with the tuning values, and animates flicker. */
  update(time: number, camera: Camera | null): void {
    const a = tuning.atmosphere;
    this.setColor(this.fog.color, a.fogColor);
    this.fog.density = a.fogDensity;
    if (this.scene.background instanceof Color) this.setColor(this.scene.background, a.fogColor);

    const elevation = MathUtils.degToRad(a.sunHeight);
    const sunDir = this.skyUniforms.sunDir.value.set(-0.55 * Math.cos(elevation), Math.sin(elevation), -0.83 * Math.cos(elevation)).normalize();
    this.setColor(this.skyUniforms.topColor.value, a.skyTopColor);
    this.setColor(this.skyUniforms.horizonColor.value, a.fogColor);
    this.setColor(this.skyUniforms.glowColor.value, a.sunGlowColor);
    this.skyUniforms.glowStrength.value = a.sunGlowStrength;
    if (camera) this.sky.position.copy(camera.position);

    this.setColor(this.sun.color, a.sunColor);
    this.sun.intensity = a.sunIntensity;
    this.sun.position.copy(sunDir).multiplyScalar(80);
    this.sun.target.position.set(0, 0, 0);

    this.setColor(this.skyLight.color, a.skyLightColor);
    this.setColor(this.skyLight.groundColor, a.groundBounceColor);
    this.skyLight.intensity = a.skyLightIntensity;

    for (const lamp of this.lamps) {
      const t = time * 1.0 + lamp.phase;
      const wobble = Math.sin(t * 11) * 0.5 + Math.sin(t * 17.3 + 1.3) * 0.3 + Math.sin(t * 31.7 + 2.1) * 0.2;
      const k = 1 + wobble * a.lampFlicker * lamp.flicker * 0.6;
      if (lamp.light) {
        this.setColor(lamp.light.color, a.lampColor);
        lamp.light.intensity = a.lampIntensity * k;
        lamp.light.distance = a.lampRange;
      }
      this.setColor(lamp.glow.emissive, a.lampColor);
      lamp.glow.emissiveIntensity = (a.lampIntensity / 5) * k;
    }
  }
}
