import { BufferGeometry, InstancedMesh, Mesh, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP_ATTRIBUTES = new Set(['position', 'normal', 'uv']);

function isDynamic(obj: Object3D, root: Object3D): boolean {
  for (let o: Object3D | null = obj; o && o !== root; o = o.parent) {
    if (o.userData.dynamic || o.userData.noBatch) return true;
  }
  return false;
}

/**
 * Speed trick: the scenery never moves, so all of its little pieces that share
 * a material are welded into one big mesh. Hundreds of draw calls become a few
 * dozen. Anything marked `userData.dynamic` (barrels, crates) is left alone so
 * it can be shot, moved or destroyed later; `userData.noBatch` also opts out.
 */
export function batchStaticMeshes(root: Object3D): void {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { material: Material; cast: boolean; receive: boolean; geos: BufferGeometry[] }>();
  const merged: Mesh[] = [];

  root.traverse((obj) => {
    if (!(obj instanceof Mesh) || obj instanceof InstancedMesh || Array.isArray(obj.material)) return;
    if (isDynamic(obj, root)) return;
    merged.push(obj);
  });

  for (const mesh of merged) {
    const material = mesh.material as Material;
    const key = `${material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material, cast: mesh.castShadow, receive: mesh.receiveShadow, geos: [] };
      buckets.set(key, bucket);
    }
    let geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) {
      if (!KEEP_ATTRIBUTES.has(name)) geo.deleteAttribute(name);
    }
    geo.clearGroups();
    bucket.geos.push(geo);
    mesh.removeFromParent();
  }

  for (const bucket of buckets.values()) {
    const geo = mergeGeometries(bucket.geos, false);
    if (!geo) throw new Error('Could not merge scenery geometry');
    for (const g of bucket.geos) g.dispose();
    const mesh = new Mesh(geo, bucket.material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    mesh.name = `static:${bucket.material.name || bucket.material.type}`;
    root.add(mesh);
  }
}
