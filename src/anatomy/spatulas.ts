import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, Vector3 } from 'three';
import { anatomy } from '../config/anatomy';
import { fissureWander } from './brain';
import { sampleCorridorProfile, type ProfileSample } from './geometryMath';
import { createSteelMaterial } from './materials';

export interface SpatulaSpec {
  lobe: 'frontal' | 'temporal';
  /** Position along the fissure (mm). */
  x: number;
  width: number;
  /** How deep the blade tip reaches (negative z). Deeper = more retraction. */
  tipDepth: number;
}

export interface Spatula {
  mesh: Mesh;
  spec: SpatulaSpec;
  readonly initial: Readonly<SpatulaSpec>;
}

let profileCache: ProfileSample[] | undefined;

/**
 * Blade geometry: a thin ribbon following the fissure wall from outside the field down
 * to the tip, with a rounded tip.
 */
export function buildSpatulaGeometry(spec: SpatulaSpec): BufferGeometry {
  const b = anatomy.brain;
  profileCache ??= sampleCorridorProfile(b, 300);
  const clearance = b.gyrusAmplitude + 0.8;
  const side: 1 | -1 = spec.lobe === 'frontal' ? 1 : -1;
  const wander = fissureWander(spec.x, side);

  // Blade centreline: follow the wall (offset from the surface) down to the tip depth.
  const centre: Vector3[] = [];
  const normals: Vector3[] = [];
  for (const s of profileCache) {
    if (s.offset > b.rimHalfWidth + 6 || s.z < spec.tipDepth) continue;
    centre.push(
      new Vector3(spec.x, b.corridorCenterY + side * (s.offset + wander + s.nOffset * clearance), s.z + s.nZ * clearance),
    );
    normals.push(new Vector3(0, side * s.nOffset, s.nZ));
  }
  // Shaft leaving the field upward and outward toward the retractor arm.
  const top = centre[0];
  const shaft = [
    new Vector3(spec.x, top.y + side * 22, top.z + 70),
    new Vector3(spec.x, top.y + side * 10, top.z + 30),
    new Vector3(spec.x, top.y + side * 3, top.z + 8),
  ];
  const pts = [...shaft, ...centre];
  const ns = [...shaft.map(() => normals[0]), ...normals];

  const positions: number[] = [];
  const idx: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    // Rounded tip: taper the last few rows along a quarter circle.
    const fromEnd = n - 1 - i;
    const tipRows = 6;
    const k = fromEnd < tipRows ? Math.sqrt(1 - ((tipRows - fromEnd) / (tipRows + 0.5)) ** 2) : 1;
    const hw = (spec.width / 2) * k;
    // Lift the blade slightly off the brain along the local surface normal.
    positions.push(pts[i].x - hw, pts[i].y + ns[i].y * 0.2, pts[i].z + ns[i].z * 0.2);
    positions.push(pts[i].x + hw, pts[i].y + ns[i].y * 0.2, pts[i].z + ns[i].z * 0.2);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    // Wind so the front face looks away from the brain (the mirror image flips it).
    if (side > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Brain spatulas: thin malleable steel blades resting on the frontal and temporal opercula,
 * held by a self-retaining arm (out of view). They protect the brain and hold the dissected
 * fissure open — they should rest gently rather than pull.
 */
export function buildSpatulas(): { group: Group; spatulas: Spatula[] } {
  const group = new Group();
  group.name = 'spatulas';
  const spatulas: Spatula[] = [];
  for (const s of anatomy.spatulas) {
    const spec: SpatulaSpec = { lobe: s.lobe, x: s.x, width: s.width, tipDepth: s.tipDepth };
    const material = createSteelMaterial();
    material.side = DoubleSide; // a thin blade seen from both faces
    const mesh = new Mesh(buildSpatulaGeometry(spec), material);
    mesh.name = `spatula-${spec.lobe}`;
    const spatula: Spatula = { mesh, spec, initial: { ...spec } };
    mesh.userData.structure = 'spatula';
    mesh.userData.spatula = spatula;
    group.add(mesh);
    spatulas.push(spatula);
  }
  return { group, spatulas };
}

/**
 * Retraction pressure (0..1) from how deep the blade reaches. Real brain retraction
 * pressure rises steeply with depth and duration; here depth alone drives it.
 */
export function retractionPressure(spec: SpatulaSpec): number {
  // -12 mm (resting on the rim) → ~0, -34 mm → 1.
  return Math.max(0, Math.min(1, (-spec.tipDepth - 12) / 22));
}

export function rebuildSpatula(s: Spatula): void {
  s.mesh.geometry.dispose();
  s.mesh.geometry = buildSpatulaGeometry(s.spec);
  s.mesh.geometry.computeBoundsTree?.();
}
