import {
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Raycaster,
  Vector3,
  type Camera,
  type Group,
  type Intersection,
  type Material,
  type Object3D,
  type Scene,
} from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import type { Collider } from './colliders';
import { Environment } from './environment';
import type { Level, LevelId } from './level';
import type { Surface } from './props';
import { buildRange } from './range';
import { buildTerrain, terrainHeight } from './terrain';
import { buildVillage } from './village';

// Fast ray tests against big merged meshes (bullets, laser, camera).
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

export interface WorldHit {
  point: Vector3;
  normal: Vector3;
  distance: number;
  object: Object3D;
  surface: Surface;
}

const tmpMatrix = new Matrix4();
const tmpLocal = new Vector3();

/** Everything that isn't a character: sky, terrain, the active level, and how things collide with it. */
export class World {
  readonly env: Environment;
  readonly terrain: Group;
  readonly levels: Record<LevelId, Level>;
  level: Level;
  private targets: Object3D[] = [];
  /** Things that no longer stop bullets (barrels that have blown up). */
  readonly disabled = new Set<Object3D>();
  private readonly terrainTargets: Object3D[] = [];
  private readonly raycaster = new Raycaster();

  constructor(scene: Scene) {
    this.env = new Environment(scene);
    this.terrain = buildTerrain();
    scene.add(this.terrain);
    this.levels = { village: buildVillage(), range: buildRange() };
    for (const level of Object.values(this.levels)) {
      level.root.visible = false;
      scene.add(level.root);
      prepareForRaycasts(level.root);
    }
    prepareForRaycasts(this.terrain);
    this.terrain.traverse((o) => {
      // Grass tufts are too small to stop a bullet.
      if (o instanceof InstancedMesh && o.count > 1000) return;
      if (o instanceof Mesh) this.terrainTargets.push(o);
    });
    this.raycaster.firstHitOnly = true;
    this.level = this.levels.village;
    this.setLevel('village');
  }

  setLevel(id: LevelId): void {
    this.disabled.clear();
    for (const level of Object.values(this.levels)) level.root.visible = level.id === id;
    this.level = this.levels[id];
    const levelTargets: Object3D[] = [];
    this.level.root.traverse((o) => {
      if (o instanceof Mesh) levelTargets.push(o);
    });
    this.targets = [...this.terrainTargets, ...levelTargets];
  }

  get colliders(): Collider[] {
    return this.level.colliders;
  }

  groundHeight(x: number, z: number): number {
    return terrainHeight(x, z);
  }

  update(time: number, camera: Camera | null): void {
    this.env.update(time, camera, this.level.lamps);
  }

  /** First solid thing a ray hits within `maxDistance`, or null. */
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): WorldHit | null {
    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDistance;
    this.raycaster.near = 0;
    let best: Intersection | null = null;
    for (const target of this.targets) {
      if (this.disabled.has(target)) continue;
      const hits = this.raycaster.intersectObject(target, false);
      if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
    }
    if (!best) return null;
    const normal = best.face ? best.face.normal.clone() : direction.clone().negate();
    if (best.instanceId !== undefined && best.object instanceof InstancedMesh) {
      best.object.getMatrixAt(best.instanceId, tmpMatrix);
      normal.transformDirection(tmpMatrix);
    }
    normal.transformDirection(best.object.matrixWorld);
    if (normal.dot(direction) > 0) normal.negate();
    const material = (best.object as Mesh).material as Material | Material[];
    const mat = Array.isArray(material) ? material[0] : material;
    return {
      point: best.point.clone(),
      normal,
      distance: best.distance,
      object: best.object,
      surface: (mat?.userData.surface as Surface) ?? 'dirt',
    };
  }

  /**
   * Pushes a round body (seen from above) out of anything solid. Changes `pos`
   * in place and returns true if it had to move it.
   */
  resolveCircle(pos: Vector3, radius: number): boolean {
    let moved = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.level.colliders) {
        if (c.kind === 'circle') {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const min = c.radius + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 1e-4;
          const push = min - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
          moved = true;
        } else {
          // Work in the box's own frame, where it is an upright rectangle.
          const cos = Math.cos(c.rotY);
          const sin = Math.sin(c.rotY);
          const rx = pos.x - c.x;
          const rz = pos.z - c.z;
          if (rx * rx + rz * rz > (c.halfW + c.halfD + radius) ** 2) continue;
          tmpLocal.set(rx * cos - rz * sin, 0, rx * sin + rz * cos);
          const cx = Math.max(-c.halfW, Math.min(c.halfW, tmpLocal.x));
          const cz = Math.max(-c.halfD, Math.min(c.halfD, tmpLocal.z));
          let nx = tmpLocal.x - cx;
          let nz = tmpLocal.z - cz;
          let d = Math.hypot(nx, nz);
          if (d >= radius) continue;
          if (d < 1e-6) {
            // Centre is inside the box: push out through the nearest side.
            const ox = c.halfW - Math.abs(tmpLocal.x);
            const oz = c.halfD - Math.abs(tmpLocal.z);
            if (ox < oz) {
              nx = Math.sign(tmpLocal.x) || 1;
              nz = 0;
              d = -ox;
            } else {
              nx = 0;
              nz = Math.sign(tmpLocal.z) || 1;
              d = -oz;
            }
          } else {
            nx /= d;
            nz /= d;
          }
          const push = radius - d;
          const lx = tmpLocal.x + nx * push;
          const lz = tmpLocal.z + nz * push;
          // Back to world space.
          pos.x = c.x + lx * cos + lz * sin;
          pos.z = c.z - lx * sin + lz * cos;
          moved = true;
        }
      }
    }
    return moved;
  }
}

function prepareForRaycasts(root: Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    // Trees and rocks are small repeated shapes: the normal ray test (which skips
    // far-away copies quickly) is faster for them than a search tree.
    if (o instanceof InstancedMesh) return;
    if (o instanceof Mesh && !o.geometry.boundsTree) o.geometry.computeBoundsTree();
  });
}
