import { Mesh, MeshStandardMaterial, SphereGeometry, type Object3D } from 'three';

// Shared materials for wounds: torn-off limbs, neck stumps and flying pieces.

export const FLESH = new MeshStandardMaterial({ color: '#5c0d0a', roughness: 0.45, metalness: 0.05 });
export const DARK_FLESH = new MeshStandardMaterial({ color: '#2e0605', roughness: 0.55 });
export const BONE = new MeshStandardMaterial({ color: '#d9cfb8', roughness: 0.6 });

/** A raw red stump cap at a joint (its own small shape, freed with whatever it is attached to). */
export function addStump(parent: Object3D, x: number, y: number, z: number, radius: number): Mesh {
  const cap = new Mesh(new SphereGeometry(radius, 10, 8), FLESH);
  cap.position.set(x, y, z);
  cap.castShadow = true;
  cap.raycast = () => {};
  parent.add(cap);
  return cap;
}
