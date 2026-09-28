import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { buildTaperedTube } from '../anatomy/tube';

/*
 * Procedural microsurgical instruments used as 3D cursors.
 * Convention: the working tip is at the origin, the shaft runs along +Y toward the surgeon
 * (the tool manager aims +Y back toward the microscope/hand). Sizes in mm.
 */

const steel = () => new MeshStandardMaterial({ color: new Color('#d3d7dc'), metalness: 0.75, roughness: 0.3, envMapIntensity: 3 });
const darkSteel = () => new MeshStandardMaterial({ color: new Color('#5b6068'), metalness: 0.7, roughness: 0.4, envMapIntensity: 2 });
/** Bipolar forceps are insulated except for the tips; insulation is often coloured. */
const insulation = () => new MeshStandardMaterial({ color: new Color('#2f4f7a'), metalness: 0.1, roughness: 0.45 });

const SHAFT = 140;

function shaft(radius: number, from = 0, length = SHAFT, material = steel()): Mesh {
  const m = new Mesh(new CylinderGeometry(radius, radius, length, 16), material);
  m.position.y = from + length / 2;
  return m;
}

function bent(points: [number, number, number][], radius: [number, number], material = steel()): Mesh {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  return new Mesh(buildTaperedTube(curve, { radius, tubularSegments: 32, radialSegments: 12, caps: true }), material);
}

/** Frazier-type micro suction: open tube with a gentle bend near the tip. */
export function buildSuction(): Group {
  const g = new Group();
  const m = steel();
  g.add(bent([[0, 0, 0], [0, 4, 0.4], [0, 12, 1.4], [0, 22, 1.6]], [0.75, 0.8], m));
  g.add(shaft(0.8, 21.5, SHAFT, m).translateZ(1.6));
  // Dark lumen at the tip opening.
  const lumen = new Mesh(new SphereGeometry(0.5, 12, 8), new MeshStandardMaterial({ color: '#050505', roughness: 1 }));
  lumen.scale.set(1, 0.2, 1);
  g.add(lumen);
  return g;
}

/** Micro scissors: two slender curved blades on a long shaft. `open` 0..1. */
export function buildScissors(): Group & { setOpen(v: number): void } {
  const g = new Group() as Group & { setOpen(v: number): void };
  const m = steel();
  const bladeA = new Group();
  const bladeB = new Group();
  // Mirrored by building the second blade from mirrored points (a negative scale would
  // flip the triangle winding and make it render inside-out).
  const blade = (sign: 1 | -1) => {
    const b = bent([[0, 0, 0], [0.15 * sign, 2.5, 0], [0.3 * sign, 5.5, 0]], [0.1, 0.32], m);
    b.scale.set(1, 1, 0.45);
    return b;
  };
  const a = blade(1);
  const b = blade(-1);
  // Pivot near the base of the blades.
  a.position.y = -5.5;
  b.position.y = -5.5;
  bladeA.add(a);
  bladeB.add(b);
  bladeA.position.y = 5.5;
  bladeB.position.y = 5.5;
  g.add(bladeA, bladeB, shaft(0.55, 5.5, SHAFT, m));
  g.setOpen = (v: number) => {
    bladeA.rotation.z = -0.22 * v;
    bladeB.rotation.z = 0.22 * v;
  };
  g.setOpen(0.6);
  return g;
}

/** Bipolar forceps: two insulated tines with bare tips. `open` 0..1. */
export function buildBipolar(): Group & { setOpen(v: number): void } {
  const g = new Group() as Group & { setOpen(v: number): void };
  const tip = steel();
  const ins = insulation();
  const tines: Group[] = [];
  for (const side of [-1, 1]) {
    const t = new Group();
    const bare = new Mesh(new BoxGeometry(0.35, 3, 0.3), tip);
    bare.position.set(0, 1.5, 0);
    const body = new Mesh(new BoxGeometry(0.5, 60, 0.45), ins);
    body.position.set(0, 33, 0);
    t.add(bare, body);
    t.userData.side = side;
    tines.push(t);
    g.add(t);
  }
  g.setOpen = (v: number) => {
    // Tines hinge at the far end (like forceps held in the hand).
    const gap = 0.25 + 1.4 * v;
    for (const t of tines) {
      const side = t.userData.side as number;
      t.position.x = side * gap * 0.5;
      // Rotate about the tip so the far ends meet at the hinge.
      t.rotation.z = (side * gap * 0.5) / 63;
    }
  };
  g.setOpen(0.7);
  return g;
}

/** Micro dissector (Rhoton-type): thin shaft with a small round, slightly angled tip. */
export function buildDissector(): Group {
  const g = new Group();
  const m = steel();
  const tip = new Mesh(new SphereGeometry(0.42, 16, 12), m);
  tip.scale.set(1, 0.6, 1.3);
  g.add(tip);
  g.add(bent([[0, 0, 0], [0, 1.5, 0.6], [0, 5, 1.2], [0, 10, 1.3]], [0.28, 0.45], m));
  g.add(shaft(0.5, 9.8, SHAFT, m).translateZ(1.3));
  return g;
}

/** Spatula manipulator: a small flat blade (to grab and adjust the retractor spatulas). */
export function buildSpatulaTool(): Group {
  const g = new Group();
  const m = steel();
  const blade = new Mesh(new BoxGeometry(4, 8, 0.3), m);
  blade.position.y = 4;
  g.add(blade, shaft(0.8, 8, SHAFT, darkSteel()));
  return g;
}

/** Doppler micro-probe: thin probe with a rounded sensor tip and a cable-style sheath. */
export function buildDopplerProbe(): Group {
  const g = new Group();
  const tip = new Mesh(new SphereGeometry(0.5, 16, 12), new MeshStandardMaterial({ color: '#e8e2d0', roughness: 0.4 }));
  g.add(tip, shaft(0.5, 0, 14, steel()), shaft(1.2, 14, SHAFT, new MeshStandardMaterial({ color: '#dcdcdc', roughness: 0.6 })));
  return g;
}

/** Rigid endoscope: steel rod with an angled (30°) lens face. */
export function buildEndoscope(): Group {
  const g = new Group();
  const rod = shaft(1.35, 0.6, SHAFT, steel());
  const lens = new Mesh(new CylinderGeometry(1.1, 1.1, 0.2, 24), new MeshStandardMaterial({ color: '#0b1a24', metalness: 0.2, roughness: 0.05 }));
  lens.rotation.x = 0.52;
  lens.position.y = 0.5;
  const ring = new Mesh(new TorusGeometry(1.25, 0.15, 8, 24), steel());
  ring.rotation.x = Math.PI / 2 + 0.52;
  ring.position.y = 0.5;
  g.add(rod, lens, ring);
  return g;
}

/** Clip applier jaws (without the clip): two short jaws on a shaft. */
export function buildClipApplier(scale = 1): Group {
  const g = new Group();
  const m = darkSteel();
  for (const side of [-1, 1]) {
    const jaw = new Mesh(new BoxGeometry(0.6 * scale, 5 * scale, 1.4 * scale), m);
    jaw.position.set(side * 1.2 * scale, 2.5 * scale, 0);
    g.add(jaw);
  }
  g.add(shaft(1.2 * scale, 5 * scale, SHAFT, m));
  return g;
}

/** ICG: no instrument, just a small reticle marker at the aim point. */
export function buildReticle(): Group {
  const g = new Group();
  const ring = new Mesh(new TorusGeometry(1.2, 0.08, 6, 32), new MeshStandardMaterial({ color: '#5fe0c6', emissive: '#5fe0c6', emissiveIntensity: 0.8 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}
