import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type Material,
  type Object3D,
} from 'three';

// The extra gear and bodies of the different enemies: axe, pitchfork, shield,
// dynamite, chainsaw, sack hoods and the parasite. All built from simple shapes.

const wood = new MeshStandardMaterial({ color: '#5a4330', roughness: 0.9 });
const darkWood = new MeshStandardMaterial({ color: '#3b2b1f', roughness: 0.95 });
const rustSteel = new MeshStandardMaterial({ color: '#7a756e', roughness: 0.5, metalness: 0.7 });
const darkSteel = new MeshStandardMaterial({ color: '#2d2f33', roughness: 0.4, metalness: 0.8 });
const burlap = new MeshStandardMaterial({ color: '#8a7650', roughness: 1 });
const holeBlack = new MeshBasicMaterial({ color: '#0a0705' });
const dynamiteRed = new MeshStandardMaterial({ color: '#a8281e', roughness: 0.7 });
const paperTan = new MeshStandardMaterial({ color: '#d8c79a', roughness: 0.9 });
const sawOrange = new MeshStandardMaterial({ color: '#c4531a', roughness: 0.55, metalness: 0.3 });
const leather = new MeshStandardMaterial({ color: '#2a1d16', roughness: 0.8 });
const fuseGlow = new MeshBasicMaterial({ color: '#ffb347' });
const fuseDark = new MeshBasicMaterial({ color: '#1a1410' });
const flesh = new MeshStandardMaterial({ color: '#6b1318', roughness: 0.4, emissive: '#2a0408', emissiveIntensity: 0.6 });
const fleshDark = new MeshStandardMaterial({ color: '#3a0a10', roughness: 0.5, emissive: '#1a0206', emissiveIntensity: 0.5 });
const toothMat = new MeshStandardMaterial({ color: '#e6dcc0', roughness: 0.4 });
const mawGlow = new MeshStandardMaterial({ color: '#c01848', emissive: '#d0205a', emissiveIntensity: 1.2, roughness: 0.3 });

function add(parent: Object3D, geo: Mesh['geometry'], mat: Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.raycast = () => {}; // decoration: bullets pass through unless a zone is set
  parent.add(m);
  return m;
}

/** A throwing axe (also what a thrower holds): handle along -z, head at the end. */
export function buildAxe(): Group {
  const g = new Group();
  add(g, new CylinderGeometry(0.02, 0.022, 0.62, 6), wood, 0, 0, -0.22, Math.PI / 2);
  add(g, new BoxGeometry(0.05, 0.16, 0.09), rustSteel, 0, 0, -0.52);
  add(g, new BoxGeometry(0.012, 0.2, 0.05), rustSteel, 0, 0.0, -0.56);
  add(g, new BoxGeometry(0.06, 0.04, 0.05), darkSteel, 0, 0, -0.46);
  return g;
}

/** A pitchfork: long shaft with three tines. */
export function buildPitchfork(): Group {
  const g = new Group();
  add(g, new CylinderGeometry(0.02, 0.022, 0.95, 6), wood, 0, 0, -0.3, Math.PI / 2);
  add(g, new BoxGeometry(0.2, 0.025, 0.03), rustSteel, 0, 0, -0.78);
  for (const x of [-0.085, 0, 0.085]) add(g, new CylinderGeometry(0.008, 0.012, 0.26, 5), rustSteel, x, 0, -0.9, Math.PI / 2);
  return g;
}

export interface ShieldModel {
  group: Group;
  /** The planks bullets hit (each tagged with the 'shield' zone by the caller). */
  planks: Mesh[];
}

/** A big wooden shield made of planks, held in front of the chest. */
export function buildShield(): ShieldModel {
  const group = new Group();
  const planks: Mesh[] = [];
  const plankGeo = new BoxGeometry(0.19, 0.82, 0.05);
  for (let i = -1; i <= 1; i++) {
    const m = new Mesh(plankGeo, i % 2 === 0 ? wood : darkWood);
    m.position.set(i * 0.195, 0, 0);
    m.castShadow = true;
    group.add(m);
    planks.push(m);
  }
  add(group, new BoxGeometry(0.64, 0.07, 0.03), darkSteel, 0, 0.25, -0.03);
  add(group, new BoxGeometry(0.64, 0.07, 0.03), darkSteel, 0, -0.25, -0.03);
  add(group, new CylinderGeometry(0.055, 0.055, 0.04, 10), rustSteel, 0, 0, -0.04, Math.PI / 2);
  return { group, planks };
}

export interface DynamiteModel {
  group: Group;
  /** The glowing tip of the fuse. */
  spark: Mesh;
}

/** A stick of dynamite with a fuse. */
export function buildDynamite(lit = false): DynamiteModel {
  const group = new Group();
  add(group, new CylinderGeometry(0.028, 0.028, 0.24, 8), dynamiteRed, 0, 0, -0.1, Math.PI / 2);
  add(group, new CylinderGeometry(0.03, 0.03, 0.05, 8), paperTan, 0, 0, -0.1, Math.PI / 2);
  add(group, new CylinderGeometry(0.004, 0.004, 0.12, 4), fuseDark, 0, 0.0, -0.28, Math.PI / 2 + 0.3);
  const spark = add(group, new SphereGeometry(0.013, 6, 5), fuseGlow, 0, 0.018, -0.335);
  spark.visible = lit;
  return { group, spark };
}

/** A chainsaw held out in front: body, a long bar with a toothed chain, a loop handle. */
export function buildChainsaw(): Group {
  const g = new Group();
  add(g, new BoxGeometry(0.15, 0.17, 0.3), sawOrange, 0, 0, 0.02);
  add(g, new BoxGeometry(0.07, 0.06, 0.62), darkSteel, 0, 0.0, -0.45);
  add(g, new BoxGeometry(0.085, 0.075, 0.6), rustSteel, 0, 0, -0.45).scale.set(1, 0.35, 1);
  for (let i = 0; i < 9; i++) add(g, new BoxGeometry(0.1, 0.012, 0.026), darkSteel, 0, 0.045 * (i % 2 ? 1 : -1), -0.2 - i * 0.065);
  add(g, new TorusGeometry(0.07, 0.014, 6, 12), darkSteel, 0, 0.12, 0.05, 0, Math.PI / 2, 0);
  add(g, new CylinderGeometry(0.02, 0.02, 0.17, 6), darkSteel, 0, 0.0, 0.2, Math.PI / 2);
  return g;
}

/** A burlap sack with eye holes, pulled over a head (sits on the head joint, so it goes when the head bursts). */
export function buildHood(): Group {
  const g = new Group();
  const sack = add(g, new SphereGeometry(0.135, 12, 10), burlap, 0, 0.1, 0.0);
  sack.scale.set(0.96, 1.12, 1.04);
  add(g, new CylinderGeometry(0.1, 0.13, 0.08, 10), burlap, 0, 0.0, 0.0);
  for (const x of [-0.045, 0.045]) add(g, new SphereGeometry(0.022, 6, 5), holeBlack, x, 0.12, -0.115).scale.set(1, 1.2, 0.5);
  add(g, new BoxGeometry(0.07, 0.012, 0.01), holeBlack, 0, 0.055, -0.125);
  return g;
}

/** A leather butcher's apron for the chainsaw man (sits on the spine joint). */
export function buildApron(): Group {
  const g = new Group();
  add(g, new BoxGeometry(0.34, 0.5, 0.02), leather, 0, 0.2, -0.13);
  add(g, new BoxGeometry(0.04, 0.34, 0.02), leather, -0.12, 0.42, -0.12);
  add(g, new BoxGeometry(0.04, 0.34, 0.02), leather, 0.12, 0.42, -0.12);
  return g;
}

/** A strap of dynamite sticks across the chest. */
export function buildBandolier(): Group {
  const g = new Group();
  const strap = add(g, new BoxGeometry(0.46, 0.05, 0.02), leather, 0, 0.3, -0.13);
  strap.rotation.z = 0.7;
  for (let i = -1; i <= 1; i++) add(g, new CylinderGeometry(0.018, 0.018, 0.1, 6), dynamiteRed, i * 0.09, 0.3 + i * 0.1, -0.15);
  return g;
}

export interface ParasiteModel {
  group: Group;
  /** The parts bullets can hit (the caller tags them with the 'parasite' zone). */
  core: Mesh[];
  /** The stalk's segments, wiggled every frame. */
  segments: Object3D[];
  /** The two tentacles at the shoulders, wiggled and whipped. */
  tentacles: Group[];
  /** The tentacle that lashes out (extends and sweeps). */
  whip: Group;
  jawTop: Object3D;
  jawBottom: Object3D;
}

/** The parasite: a toothed maw on a writhing stalk, with tentacles. Sits on the neck joint. */
export function buildParasite(): ParasiteModel {
  const group = new Group();
  const core: Mesh[] = [];
  const segments: Object3D[] = [];
  const mark = (m: Mesh): Mesh => {
    m.raycast = Mesh.prototype.raycast;
    core.push(m);
    return m;
  };

  // Stalk: three tapering segments, each hanging off the last.
  let parent: Object3D = group;
  let y = 0.02;
  for (let i = 0; i < 3; i++) {
    const seg = new Group();
    seg.position.set(0, y, 0);
    parent.add(seg);
    const r = 0.06 - i * 0.012;
    const m = new Mesh(new CapsuleGeometry(r, 0.1, 4, 8), i % 2 ? fleshDark : flesh);
    m.position.y = 0.06;
    m.castShadow = true;
    seg.add(m);
    mark(m);
    segments.push(seg);
    parent = seg;
    y = 0.14;
  }
  // The maw at the top: two jaws that open and snap, with teeth.
  const head = new Group();
  head.position.set(0, 0.16, 0);
  parent.add(head);
  const jawTop = new Group();
  const jawBottom = new Group();
  head.add(jawTop, jawBottom);
  mark(add(jawTop, new SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), flesh, 0, 0.0, -0.01));
  mark(add(jawBottom, new SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), fleshDark, 0, 0.0, -0.01));
  add(head, new SphereGeometry(0.06, 8, 6), mawGlow, 0, 0.0, -0.01);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(jawTop, new ConeGeometry(0.012, 0.05, 4), toothMat, Math.cos(a) * 0.065, -0.005, Math.sin(a) * 0.065 - 0.01, Math.PI, 0, 0);
    add(jawBottom, new ConeGeometry(0.012, 0.045, 4), toothMat, Math.cos(a + 0.4) * 0.058, 0.005, Math.sin(a + 0.4) * 0.058 - 0.01, 0, 0, 0);
  }

  // Two tentacles from the base of the stalk, each a chain of segments.
  const tentacles: Group[] = [];
  for (const side of [-1, 1]) {
    const root = new Group();
    root.position.set(side * 0.06, 0.04, 0);
    group.add(root);
    let p: Object3D = root;
    for (let i = 0; i < 5; i++) {
      const link = new Group();
      link.position.y = i === 0 ? 0 : 0.16;
      p.add(link);
      add(link, new CapsuleGeometry(0.03 - i * 0.004, 0.14, 3, 6), i % 2 ? fleshDark : flesh, 0, 0.08, 0);
      p = link;
    }
    root.rotation.z = -side * 0.9;
    tentacles.push(root);
  }

  // The long whip: a thin, hidden tentacle that extends forwards when it attacks.
  const whip = new Group();
  const whipMesh = new Mesh(new CylinderGeometry(0.012, 0.035, 1, 6), flesh);
  whipMesh.rotation.x = Math.PI / 2;
  whipMesh.position.z = -0.5;
  whipMesh.raycast = () => {};
  whip.add(whipMesh);
  whip.visible = false;
  group.add(whip);

  return { group, core, segments, tentacles, whip, jawTop, jawBottom };
}
