import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dirtTexture, seededRandom, worldNoise } from './textures';

/** The village square's fence runs along x and z = +/- this many metres. */
export const SQUARE_HALF_SIZE = 22;

/** Ground height at any point. The square itself is flat; hills rise beyond it. */
export function terrainHeight(x: number, z: number): number {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const hills = MathUtils.smoothstep(d, 27, 45);
  if (hills <= 0) return 0;
  const n = worldNoise(x, z, 0.035, 9) - 0.35;
  const near = Math.max(0, n) * 6 * hills + hills * 0.6;
  // Far away the land rolls into bigger hills that frame the horizon.
  const far = MathUtils.smoothstep(d, 140, 420) * (worldNoise(x, z, 0.006, 21) * 38 - 6);
  return near + Math.max(0, far);
}

/** 1 on the dirt roads that lead out of the square's gates, 0 elsewhere. */
export function roadMask(x: number, z: number): number {
  const H = SQUARE_HALF_SIZE;
  const along = (a: number, b: number) =>
    MathUtils.smoothstep(b, H - 2, H + 2) * (1 - MathUtils.smoothstep(Math.abs(a), 1.5, 3.2));
  return Math.max(along(x, Math.abs(z)), along(z - Math.sign(x) * 5, Math.abs(x)));
}

/** Grid coordinates: dense near the middle, sparse far away, with no gaps between them. */
function gridCoords(inner: number, innerStep: number, outer: number, outerStep: number): number[] {
  const out: number[] = [];
  for (let v = -outer; v < -inner; v += outerStep) out.push(v);
  for (let v = -inner; v <= inner + 1e-6; v += innerStep) out.push(v);
  for (let v = inner + outerStep; v <= outer + 1e-6; v += outerStep) out.push(v);
  return out;
}

/** Ground, woods, rocks and grass around the village. Shared by every level. */
export function buildTerrain(): Group {
  const root = new Group();
  root.name = 'terrain';
  root.add(buildGround());
  buildWoods(root);
  return root;
}

function buildGround(): Mesh {
  const xs = gridCoords(120, 2.5, 640, 20);
  const n = xs.length;
  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const colors = new Float32Array(n * n * 3);
  const dirt = new Color('#ffffff');
  const grass = new Color('#7d8a55');
  const road = new Color('#9c8c78');
  const c = new Color();
  const tile = 3.5;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const z = xs[j];
      const k = j * n + i;
      positions[k * 3] = x;
      positions[k * 3 + 1] = terrainHeight(x, z);
      positions[k * 3 + 2] = z;
      uvs[k * 2] = x / tile;
      uvs[k * 2 + 1] = -z / tile;
      const d = Math.max(Math.abs(x), Math.abs(z));
      const patch = worldNoise(x, z, 0.12, 3);
      const wear = MathUtils.smoothstep(d + (patch - 0.5) * 8, SQUARE_HALF_SIZE - 1, SQUARE_HALF_SIZE + 6);
      c.copy(dirt).multiplyScalar(0.82 + patch * 0.35);
      c.lerp(grass, wear * 0.85);
      c.lerp(road, roadMask(x, z) * 0.7);
      c.multiplyScalar(1 - MathUtils.smoothstep(d, 120, 400) * 0.35);
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const cc = a + n;
      const d = cc + 1;
      indices.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const tex = dirtTexture();
  const mat = new MeshStandardMaterial({ map: tex.color, bumpMap: tex.bump, bumpScale: 2.5, vertexColors: true, roughness: 1 });
  mat.userData.surface = 'dirt';
  const ground = new Mesh(geo, mat);
  ground.receiveShadow = true;
  ground.name = 'ground';
  ground.userData.noBatch = true;
  return ground;
}

function buildWoods(root: Group): void {
  const rand = seededRandom(77);
  const houses = [[-12, -30], [13, -31.5], [32, -4], [-31, 11], [7, 32], [-14, 31]];
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const v = new Vector3();
  const yAxis = new Vector3(0, 1, 0);

  // Pine woods in a wide ring around the village.
  const foliageGeo = mergeGeometries([
    new ConeGeometry(1.7, 2.8, 7).translate(0, 2.6, 0),
    new ConeGeometry(1.3, 2.4, 7).translate(0, 3.8, 0),
    new ConeGeometry(0.85, 2.0, 7).translate(0, 5.0, 0),
  ]);
  const trunkGeo = new CylinderGeometry(0.12, 0.22, 2.2, 6).translate(0, 1.1, 0);
  const spots: Array<[number, number, number]> = [];
  let tries = 0;
  while (spots.length < 520 && tries++ < 20000) {
    const angle = rand() * Math.PI * 2;
    // More trees close in, thinning out with distance.
    const dist = 36 + Math.pow(rand(), 1.6) * 230;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (houses.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 9)) continue;
    if (roadMask(x, z) > 0.05 || (Math.abs(x) < 5 && Math.abs(z) > 30)) continue;
    spots.push([x, z, (0.8 + rand() * 1.1) * (1 + dist / 300)]);
  }
  const foliageMat = new MeshStandardMaterial({ color: '#27321f', roughness: 1, flatShading: true });
  foliageMat.userData.surface = 'wood';
  const trunkMat = new MeshStandardMaterial({ color: '#2d221a', roughness: 1 });
  trunkMat.userData.surface = 'wood';
  const foliage = new InstancedMesh(foliageGeo, foliageMat, spots.length);
  const trunks = new InstancedMesh(trunkGeo, trunkMat, spots.length);
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
  foliage.computeBoundingSphere();
  trunks.computeBoundingSphere();
  root.add(foliage, trunks);

  // Rocks scattered about outside the fence.
  const rockCount = 110;
  const rockMat = new MeshStandardMaterial({ color: '#5f5c57', roughness: 0.95, flatShading: true });
  rockMat.userData.surface = 'stone';
  const rocks = new InstancedMesh(new IcosahedronGeometry(0.5, 0), rockMat, rockCount);
  for (let i = 0; i < rockCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 25 + rand() * 70;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const k = 0.3 + rand() * 1.1;
    q.setFromAxisAngle(v.set(rand(), rand(), rand()).normalize(), rand() * Math.PI);
    s.set(k * (1 + rand()), k * (0.6 + rand() * 0.5), k * (1 + rand()));
    m.compose(new Vector3(x, terrainHeight(x, z) + k * 0.15, z), q, s);
    rocks.setMatrixAt(i, m);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.computeBoundingSphere();
  root.add(rocks);

  // Dry grass tufts beyond the square.
  const tuftCount = 1400;
  const tufts = new InstancedMesh(
    new ConeGeometry(0.12, 0.55, 4).translate(0, 0.25, 0),
    new MeshStandardMaterial({ color: '#6e6a45', roughness: 1 }),
    tuftCount,
  );
  for (let i = 0; i < tuftCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 23.5 + rand() * 70;
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
  tufts.computeBoundingSphere();
  root.add(tufts);
}
