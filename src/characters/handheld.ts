import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three';

// Things characters hold. In a hand's own frame, -y points out past the
// fingers (along the arm) and +z points out of the bottom of the fist.

const gunMetal = new MeshStandardMaterial({ color: '#3a3d42', roughness: 0.4, metalness: 0.8 });
const gunGrip = new MeshStandardMaterial({ color: '#1c1a18', roughness: 0.8, metalness: 0.1 });
const laserBody = new MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5, metalness: 0.5 });
const wood = new MeshStandardMaterial({ color: '#5a4330', roughness: 0.9 });
const rustyBlade = new MeshStandardMaterial({ color: '#6b5b4e', roughness: 0.55, metalness: 0.6 });

export interface PistolModel {
  group: Group;
  /** The part that moves when it fires: the pistol's slide, or the revolver's hammer. */
  slide: Mesh;
  /** End of the barrel, where bullets and the muzzle flash come from. */
  muzzle: Object3D;
  /** Front of the laser module under the barrel. */
  laser: Object3D;
  /** Where spent casings fly out. */
  ejectionPort: Object3D;
}

export function buildPistol(): PistolModel {
  const group = new Group();
  const noHit = (m: Mesh) => {
    m.castShadow = true;
    m.raycast = () => {};
    return m;
  };
  const slide = noHit(new Mesh(new BoxGeometry(0.03, 0.19, 0.038), gunMetal));
  slide.position.set(0, -0.075, -0.05);
  group.add(slide);
  const frame = noHit(new Mesh(new BoxGeometry(0.027, 0.15, 0.025), gunMetal));
  frame.position.set(0, -0.06, -0.022);
  group.add(frame);
  const grip = noHit(new Mesh(new BoxGeometry(0.029, 0.045, 0.11), gunGrip));
  grip.position.set(0, 0.0, 0.03);
  grip.rotation.x = -0.25;
  group.add(grip);
  const guard = noHit(new Mesh(new BoxGeometry(0.01, 0.05, 0.03), gunMetal));
  guard.position.set(0, -0.04, 0.0);
  group.add(guard);
  const laserBox = noHit(new Mesh(new BoxGeometry(0.022, 0.05, 0.022), laserBody));
  laserBox.position.set(0, -0.115, -0.012);
  group.add(laserBox);

  const muzzle = new Object3D();
  muzzle.position.set(0, -0.172, -0.05);
  group.add(muzzle);
  const laser = new Object3D();
  laser.position.set(0, -0.142, -0.012);
  group.add(laser);
  const ejectionPort = new Object3D();
  ejectionPort.position.set(0.02, -0.06, -0.07);
  group.add(ejectionPort);
  return { group, slide, muzzle, laser, ejectionPort };
}

const stockWood = new MeshStandardMaterial({ color: '#6a4a30', roughness: 0.7 });
const blackPoly = new MeshStandardMaterial({ color: '#1e1f20', roughness: 0.6, metalness: 0.2 });

export interface LongGunModel {
  /** Origin is the end of the stock (rests in the shoulder); the barrel points along -z. */
  group: Group;
  muzzle: Object3D;
  laser: Object3D;
  ejectionPort: Object3D;
  /** Where the right hand holds the grip. */
  grip: Object3D;
  /** Where the left hand holds the fore-end (moves with the pump). */
  fore: Object3D;
  /** The part that slides back and forth when pumping (or the bolt). */
  action: Object3D;
  /** How far the action travels when pulled back, in metres. */
  actionTravel: number;
  /** Where the left hand goes to swap a magazine, drum or rocket. */
  reloadPoint: Object3D;
  /** Shown only while loaded (the rocket's warhead). */
  loaded?: Object3D;
}

function gunPart(parent: Object3D, geo: BoxGeometry | CylinderGeometry | ConeGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number, rotX = 0): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.x = rotX;
  m.castShadow = true;
  m.raycast = () => {};
  parent.add(m);
  return m;
}

function point(parent: Object3D, x: number, y: number, z: number): Object3D {
  const o = new Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** Pump-action shotgun: wooden stock and pump, long barrel with a tube magazine under it. */
export function buildPumpShotgun(): LongGunModel {
  const g = new Group();
  const along = Math.PI / 2; // cylinders lie along z
  gunPart(g, new BoxGeometry(0.04, 0.11, 0.2), stockWood, 0, -0.035, -0.1, -0.12);
  gunPart(g, new BoxGeometry(0.036, 0.06, 0.12), stockWood, 0, -0.02, -0.24, 0.1);
  gunPart(g, new BoxGeometry(0.046, 0.075, 0.22), gunMetal, 0, 0.005, -0.38);
  gunPart(g, new BoxGeometry(0.012, 0.035, 0.05), gunMetal, 0, -0.045, -0.36);
  gunPart(g, new CylinderGeometry(0.015, 0.015, 0.6, 10), gunMetal, 0, 0.022, -0.78, along);
  gunPart(g, new CylinderGeometry(0.011, 0.011, 0.44, 8), gunMetal, 0, -0.012, -0.7, along);
  const action = new Group();
  action.position.set(0, -0.012, -0.64);
  g.add(action);
  gunPart(action, new CylinderGeometry(0.024, 0.022, 0.17, 10), stockWood, 0, 0, 0, along);
  const fore = point(action, 0, -0.03, 0);
  gunPart(g, new BoxGeometry(0.016, 0.02, 0.05), laserBody, 0, -0.035, -0.9);
  return {
    group: g,
    muzzle: point(g, 0, 0.022, -1.08),
    laser: point(g, 0, -0.035, -0.93),
    ejectionPort: point(g, 0.03, 0.015, -0.38),
    grip: point(g, 0, -0.055, -0.24),
    fore,
    action,
    actionTravel: 0.1,
    reloadPoint: point(g, 0, -0.06, -0.36),
  };
}

/** Semi-automatic drum shotgun: black, short barrel, big drum magazine, front grip. */
export function buildDrumShotgun(): LongGunModel {
  const g = new Group();
  const along = Math.PI / 2;
  // Skeleton stock.
  gunPart(g, new BoxGeometry(0.012, 0.1, 0.02), blackPoly, 0, -0.03, -0.01);
  gunPart(g, new BoxGeometry(0.012, 0.012, 0.2), blackPoly, 0, 0.015, -0.1);
  gunPart(g, new BoxGeometry(0.012, 0.012, 0.22), blackPoly, 0, -0.07, -0.11, -0.25);
  gunPart(g, new BoxGeometry(0.03, 0.1, 0.035), blackPoly, 0, -0.07, -0.24, 0.3);
  gunPart(g, new BoxGeometry(0.05, 0.085, 0.3), gunMetal, 0, 0.01, -0.37);
  const action = new Group();
  action.position.set(0.028, 0.03, -0.34);
  g.add(action);
  gunPart(action, new BoxGeometry(0.012, 0.012, 0.03), gunMetal, 0, 0, 0);
  const drum = gunPart(g, new CylinderGeometry(0.075, 0.075, 0.06, 18), blackPoly, 0, -0.07, -0.4);
  drum.rotation.z = Math.PI / 2;
  gunPart(g, new CylinderGeometry(0.018, 0.018, 0.42, 10), gunMetal, 0, 0.025, -0.72, along);
  gunPart(g, new BoxGeometry(0.04, 0.045, 0.18), blackPoly, 0, -0.005, -0.6);
  gunPart(g, new BoxGeometry(0.028, 0.09, 0.035), blackPoly, 0, -0.07, -0.6, -0.15);
  gunPart(g, new BoxGeometry(0.016, 0.02, 0.05), laserBody, 0, -0.035, -0.75);
  return {
    group: g,
    muzzle: point(g, 0, 0.025, -0.94),
    laser: point(g, 0, -0.035, -0.78),
    ejectionPort: point(g, 0.03, 0.02, -0.34),
    grip: point(g, 0, -0.08, -0.24),
    fore: point(g, 0, -0.1, -0.6),
    action,
    actionTravel: 0.06,
    reloadPoint: point(g, 0, -0.09, -0.4),
  };
}

const oliveDrab = new MeshStandardMaterial({ color: '#4a5236', roughness: 0.75, metalness: 0.15 });
const scopeGlass = new MeshStandardMaterial({ color: '#1b2a33', roughness: 0.1, metalness: 0.6, emissive: '#0a1418' });
const warheadPaint = new MeshStandardMaterial({ color: '#5d5a3a', roughness: 0.6, metalness: 0.3 });

/** Submachine gun: wire stock, stubby barrel shroud, long straight magazine. */
export function buildSmg(): LongGunModel {
  const g = new Group();
  const along = Math.PI / 2;
  // Folding wire stock.
  gunPart(g, new BoxGeometry(0.01, 0.07, 0.012), gunMetal, 0, -0.02, -0.01);
  gunPart(g, new BoxGeometry(0.008, 0.008, 0.2), gunMetal, 0.016, 0.012, -0.1);
  gunPart(g, new BoxGeometry(0.008, 0.008, 0.2), gunMetal, -0.016, 0.012, -0.1);
  gunPart(g, new BoxGeometry(0.008, 0.008, 0.2), gunMetal, 0, -0.05, -0.1, 0.18);
  // Receiver with a ribbed shroud and the barrel poking out.
  gunPart(g, new CylinderGeometry(0.026, 0.026, 0.3, 10), gunMetal, 0, 0.01, -0.34, along);
  gunPart(g, new CylinderGeometry(0.03, 0.03, 0.16, 10), blackPoly, 0, 0.01, -0.5, along);
  gunPart(g, new CylinderGeometry(0.009, 0.009, 0.08, 8), gunMetal, 0, 0.01, -0.62, along);
  const action = new Group();
  action.position.set(0.03, 0.02, -0.3);
  g.add(action);
  gunPart(action, new BoxGeometry(0.014, 0.012, 0.025), gunMetal, 0, 0, 0);
  gunPart(g, new BoxGeometry(0.026, 0.09, 0.035), gunGrip, 0, -0.055, -0.24, 0.25);
  gunPart(g, new BoxGeometry(0.022, 0.19, 0.034), gunMetal, 0, -0.1, -0.36, -0.08);
  gunPart(g, new BoxGeometry(0.016, 0.02, 0.05), laserBody, 0, -0.025, -0.5);
  return {
    group: g,
    muzzle: point(g, 0, 0.01, -0.67),
    laser: point(g, 0, -0.025, -0.53),
    ejectionPort: point(g, 0.03, 0.02, -0.32),
    grip: point(g, 0, -0.07, -0.24),
    fore: point(g, 0, -0.03, -0.5),
    action,
    actionTravel: 0.05,
    reloadPoint: point(g, 0, -0.17, -0.36),
  };
}

/** Bolt-action hunting rifle: long wooden stock, long barrel, telescopic sight. */
export function buildRifle(): LongGunModel {
  const g = new Group();
  const along = Math.PI / 2;
  gunPart(g, new BoxGeometry(0.04, 0.12, 0.24), stockWood, 0, -0.04, -0.12, -0.15);
  gunPart(g, new BoxGeometry(0.036, 0.06, 0.16), stockWood, 0, -0.02, -0.28, 0.12);
  gunPart(g, new BoxGeometry(0.04, 0.05, 0.5), stockWood, 0, -0.01, -0.58);
  gunPart(g, new BoxGeometry(0.038, 0.05, 0.2), gunMetal, 0, 0.02, -0.38);
  gunPart(g, new CylinderGeometry(0.012, 0.014, 0.62, 10), gunMetal, 0, 0.022, -0.86, along);
  // Telescopic sight on two rings.
  gunPart(g, new CylinderGeometry(0.022, 0.022, 0.26, 12), gunMetal, 0, 0.085, -0.42, along);
  gunPart(g, new CylinderGeometry(0.03, 0.022, 0.06, 12), gunMetal, 0, 0.085, -0.57, along);
  gunPart(g, new CylinderGeometry(0.027, 0.022, 0.05, 12), gunMetal, 0, 0.085, -0.28, along);
  gunPart(g, new CylinderGeometry(0.026, 0.026, 0.004, 12), scopeGlass, 0, 0.085, -0.6, along);
  gunPart(g, new BoxGeometry(0.012, 0.04, 0.012), gunMetal, 0, 0.055, -0.36);
  gunPart(g, new BoxGeometry(0.012, 0.04, 0.012), gunMetal, 0, 0.055, -0.48);
  // The bolt handle on the right: it slides back after each shot.
  const action = new Group();
  action.position.set(0.03, 0.03, -0.33);
  g.add(action);
  gunPart(action, new CylinderGeometry(0.006, 0.006, 0.05, 6), gunMetal, 0.02, 0, 0).rotation.z = Math.PI / 2;
  gunPart(action, new CylinderGeometry(0.012, 0.012, 0.012, 8), gunMetal, 0.045, 0, 0);
  return {
    group: g,
    muzzle: point(g, 0, 0.022, -1.18),
    laser: point(g, 0, 0.022, -1.18),
    ejectionPort: point(g, 0.03, 0.03, -0.36),
    grip: point(g, 0, -0.07, -0.27),
    fore: point(g, 0, -0.04, -0.66),
    action,
    actionTravel: 0.09,
    reloadPoint: point(g, 0, 0.04, -0.36),
  };
}

/** Rocket launcher: a long tube that rests on the right shoulder, with a warhead poking out the front. */
export function buildRocketLauncher(): LongGunModel {
  const g = new Group();
  const along = Math.PI / 2;
  const y = 0.095; // the tube sits on top of the shoulder
  gunPart(g, new CylinderGeometry(0.055, 0.055, 1.0, 14), oliveDrab, 0, y, -0.25, along);
  gunPart(g, new CylinderGeometry(0.065, 0.06, 0.08, 14), blackPoly, 0, y, 0.24, along);
  gunPart(g, new CylinderGeometry(0.062, 0.062, 0.05, 14), blackPoly, 0, y, -0.72, along);
  gunPart(g, new BoxGeometry(0.03, 0.1, 0.04), blackPoly, 0, y - 0.1, -0.14, 0.2);
  gunPart(g, new BoxGeometry(0.03, 0.09, 0.035), blackPoly, 0, y - 0.095, -0.42, 0.1);
  gunPart(g, new BoxGeometry(0.03, 0.05, 0.08), blackPoly, -0.07, y + 0.03, -0.35);
  gunPart(g, new BoxGeometry(0.016, 0.02, 0.05), laserBody, 0, y - 0.065, -0.6);
  const warhead = new Group();
  warhead.position.set(0, y, -0.78);
  g.add(warhead);
  gunPart(warhead, new CylinderGeometry(0.045, 0.045, 0.08, 12), warheadPaint, 0, 0, 0, along);
  gunPart(warhead, new ConeGeometry(0.045, 0.16, 12), warheadPaint, 0, 0, -0.12, -along);
  const action = new Group();
  g.add(action);
  return {
    group: g,
    muzzle: point(g, 0, y, -0.86),
    laser: point(g, 0, y - 0.065, -0.63),
    ejectionPort: point(g, 0, y, 0.3),
    grip: point(g, 0, y - 0.13, -0.14),
    fore: point(g, 0, y - 0.12, -0.42),
    action,
    actionTravel: 0,
    reloadPoint: point(g, 0, y, -0.8),
    loaded: warhead,
  };
}

const revolverWood = new MeshStandardMaterial({ color: '#4d2f1d', roughness: 0.6 });
const steel = new MeshStandardMaterial({ color: '#8d9296', roughness: 0.3, metalness: 0.9 });

/** Big revolver: long barrel, fat cylinder, wooden grip. Same hand layout as the pistol. */
export function buildMagnum(): PistolModel {
  const group = new Group();
  const noHit = (m: Mesh) => {
    m.castShadow = true;
    m.raycast = () => {};
    group.add(m);
    return m;
  };
  const frame = noHit(new Mesh(new BoxGeometry(0.03, 0.1, 0.035), steel));
  frame.position.set(0, -0.06, -0.035);
  const cyl = noHit(new Mesh(new CylinderGeometry(0.024, 0.024, 0.05, 12), steel));
  cyl.position.set(0, -0.07, -0.04);
  const barrel = noHit(new Mesh(new CylinderGeometry(0.011, 0.012, 0.19, 10), steel));
  barrel.position.set(0, -0.2, -0.05);
  const rib = noHit(new Mesh(new BoxGeometry(0.012, 0.19, 0.012), steel));
  rib.position.set(0, -0.2, -0.064);
  const lug = noHit(new Mesh(new BoxGeometry(0.014, 0.15, 0.016), steel));
  lug.position.set(0, -0.19, -0.032);
  const grip = noHit(new Mesh(new BoxGeometry(0.03, 0.05, 0.11), revolverWood));
  grip.position.set(0, 0.0, 0.03);
  grip.rotation.x = -0.3;
  const guard = noHit(new Mesh(new BoxGeometry(0.01, 0.05, 0.03), steel));
  guard.position.set(0, -0.035, 0.0);
  const hammer = noHit(new Mesh(new BoxGeometry(0.008, 0.015, 0.02), steel));
  hammer.position.set(0, -0.02, -0.06);
  const laserBox = noHit(new Mesh(new BoxGeometry(0.02, 0.045, 0.02), laserBody));
  laserBox.position.set(0, -0.14, -0.012);

  const muzzle = new Object3D();
  muzzle.position.set(0, -0.3, -0.05);
  group.add(muzzle);
  const laser = new Object3D();
  laser.position.set(0, -0.165, -0.012);
  group.add(laser);
  const ejectionPort = new Object3D();
  ejectionPort.position.set(0.02, -0.07, -0.04);
  group.add(ejectionPort);
  return { group, slide: hammer, muzzle, laser, ejectionPort };
}

const bladeSteel = new MeshStandardMaterial({ color: '#b9bec2', roughness: 0.25, metalness: 0.95 });

/** The combat knife, held in the left hand with the blade out of the thumb side of the fist. */
export function buildKnife(): Group {
  const g = new Group();
  const add = (m: Mesh) => {
    m.castShadow = true;
    m.raycast = () => {};
    g.add(m);
    return m;
  };
  add(new Mesh(new BoxGeometry(0.022, 0.026, 0.1), gunGrip)).position.set(0, 0, 0.02);
  add(new Mesh(new BoxGeometry(0.03, 0.03, 0.008), gunMetal)).position.set(0, 0, -0.032);
  const blade = add(new Mesh(new BoxGeometry(0.004, 0.026, 0.15), bladeSteel));
  blade.position.set(0, 0.002, -0.11);
  const tip = add(new Mesh(new ConeGeometry(0.013, 0.04, 4), bladeSteel));
  tip.rotation.x = -Math.PI / 2;
  tip.scale.set(0.3, 1, 1);
  tip.position.set(0, 0.002, -0.2);
  return g;
}

export type ToolKind = 'sickle' | 'club';

/** A farm tool a zombie can carry (and drop when shot in the arm). */
export function buildTool(kind: ToolKind): Group {
  const g = new Group();
  const add = (m: Mesh) => {
    m.castShadow = true;
    m.raycast = () => {};
    g.add(m);
    return m;
  };
  if (kind === 'sickle') {
    const handle = add(new Mesh(new CylinderGeometry(0.018, 0.02, 0.3, 6), wood));
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0, -0.1);
    const blade = add(new Mesh(new TorusGeometry(0.13, 0.012, 4, 14, Math.PI * 1.1), rustyBlade));
    blade.scale.set(1, 1, 2.2);
    blade.rotation.y = Math.PI / 2;
    blade.position.set(0, -0.12, -0.25);
  } else {
    const club = add(new Mesh(new CylinderGeometry(0.035, 0.022, 0.6, 7), wood));
    club.rotation.x = Math.PI / 2;
    club.position.set(0, 0, -0.25);
  }
  return g;
}

/** A dropped tool tumbling to the ground. */
export class FallingProp {
  readonly velocity = new Vector3();
  readonly spin = new Vector3();
  resting = false;

  constructor(readonly object: Object3D) {}

  update(dt: number, groundHeight: number): void {
    if (this.resting) return;
    this.velocity.y -= 9.8 * dt;
    this.object.position.addScaledVector(this.velocity, dt);
    this.object.rotation.x += this.spin.x * dt;
    this.object.rotation.y += this.spin.y * dt;
    this.object.rotation.z += this.spin.z * dt;
    if (this.object.position.y <= groundHeight + 0.03) {
      this.object.position.y = groundHeight + 0.03;
      if (Math.abs(this.velocity.y) < 1.2) {
        // Settle flat on the ground.
        this.resting = true;
        this.object.rotation.set(0, this.object.rotation.y, Math.PI / 2);
      } else {
        this.velocity.y *= -0.3;
        this.velocity.x *= 0.5;
        this.velocity.z *= 0.5;
        this.spin.multiplyScalar(0.5);
      }
    }
  }
}
