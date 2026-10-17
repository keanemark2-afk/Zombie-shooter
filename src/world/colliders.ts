import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';

// Simple solid shapes used for bumping into things. Seen from above they are
// rotated rectangles or circles, each with a height.

export type ColliderTag = 'solid' | 'explosive';

export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  rotY: number;
  height: number;
  tag: ColliderTag;
}

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  radius: number;
  height: number;
  tag: ColliderTag;
}

export type Collider = BoxCollider | CircleCollider;

/** Yellow outlines of every collider, for the "show colliders" debug option. */
export function colliderOutlines(colliders: Collider[]): LineSegments {
  const pts: number[] = [];
  const ring = (corners: Array<[number, number]>, h: number) => {
    for (let i = 0; i < corners.length; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % corners.length];
      pts.push(ax, 0.03, az, bx, 0.03, bz, ax, h, az, bx, h, bz);
      if (corners.length <= 4 || i % 4 === 0) pts.push(ax, 0.03, az, ax, h, az);
    }
  };
  for (const c of colliders) {
    if (c.kind === 'box') {
      const cos = Math.cos(c.rotY);
      const sin = Math.sin(c.rotY);
      const corner = (lx: number, lz: number): [number, number] => [
        c.x + lx * cos + lz * sin,
        c.z - lx * sin + lz * cos,
      ];
      ring([corner(-c.halfW, -c.halfD), corner(c.halfW, -c.halfD), corner(c.halfW, c.halfD), corner(-c.halfW, c.halfD)], c.height);
    } else {
      const corners: Array<[number, number]> = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        corners.push([c.x + Math.cos(a) * c.radius, c.z + Math.sin(a) * c.radius]);
      }
      ring(corners, c.height);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const lines = new LineSegments(geo, new LineBasicMaterial({ color: 0xffd400, depthTest: false, transparent: true }));
  lines.renderOrder = 999;
  return lines;
}
