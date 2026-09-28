import { BufferGeometry, Color, Float32BufferAttribute, Mesh, PlaneGeometry } from 'three';
import { anatomy } from '../config/anatomy';
import { createBrainMaterial, createFloorMaterial } from './materials';
import { Noise3, smoothstep } from './noise';
import { sampleCorridorProfile } from './geometryMath';

const noise = new Noise3(42);

export type LobeId = 'frontalLobe' | 'temporalLobe';

/** The fissure is not perfectly straight: each wall wanders a little along x (mm). */
export function fissureWander(x: number, side: 1 | -1): number {
  return 2.2 * noise.noise(x * 0.03, side * 100, 0.5);
}

/**
 * One lobe (frontal or temporal) seen through the craniotomy: the cortical surface, the
 * rounded operculum at the fissure rim, and the fissure wall dropping to the basal
 * cisterns. Built as a grid: x along the fissure × u along the cross-section profile.
 *
 * Surface detail (all procedural):
 *  - gyri: rounded bumps from fractal noise
 *  - sulci: narrow creases where a second noise field crosses zero
 *  - pial arteries: thin red lines (another zero-crossing field)
 *  - superficial sylvian vein: a bluish vein meandering along the fissure rim
 */
export function buildLobe(id: LobeId): Mesh {
  const b = anatomy.brain;
  const side: 1 | -1 = id === 'frontalLobe' ? 1 : -1;
  const nx = 240;
  const nu = 200;
  const profile = sampleCorridorProfile(b, nu);

  const positions = new Float32Array(nx * nu * 3);
  const colors = new Float32Array(nx * nu * 3);
  const cortex = new Color(b.colors.cortex);
  const sulcus = new Color(b.colors.sulcus);
  const pial = new Color(b.colors.pialArtery);
  const vein = new Color(b.colors.sylvianVein);
  const deepShade = new Color('#8e524a');
  const c = new Color();

  const f = b.gyrusFrequency;
  const seedOffset = side * 100;

  for (let i = 0; i < nx; i++) {
    const x = -b.extentX + (2 * b.extentX * i) / (nx - 1);
    const wander = fissureWander(x, side);
    for (let j = 0; j < nu; j++) {
      const s = profile[j];
      const baseY = b.corridorCenterY + side * (s.offset + wander);
      const baseZ = s.z;
      const ny = side * s.nOffset;
      const nz = s.nZ;

      // Gyral relief: fbm for the rounded gyri, minus a crease where another field ~ 0.
      const gx = x * f, gy = baseY * f, gz = baseZ * f + seedOffset;
      const gyri = noise.fbm(gx, gy, gz, 3);
      const sulcField = noise.noise(gx * 0.9 + 7, gy * 0.9, gz * 0.9);
      const crease = 1 - smoothstep(0.0, 0.11, Math.abs(sulcField));
      // Deep in the fissure (small offset) the relief flattens a little: pia over insula.
      const reliefScale = 0.55 + 0.45 * smoothstep(-40, -5, baseZ);
      const disp = reliefScale * (b.gyrusAmplitude * gyri - b.sulcusDepth * crease);

      const k = (i * nu + j) * 3;
      positions[k] = x;
      positions[k + 1] = baseY + ny * disp;
      positions[k + 2] = baseZ + nz * disp;

      // Colour: cortex, darkened in sulci and deep in the fissure (less light, more CSF).
      c.copy(cortex);
      const tone = 0.08 * noise.noise(x * 0.2, baseY * 0.2, baseZ * 0.2);
      c.offsetHSL(0, 0, tone);
      c.lerp(sulcus, crease * 0.75);
      c.lerp(deepShade, 0.35 * (1 - smoothstep(-45, -10, baseZ)));

      // Pial arteries: thin lines along the zero set of a warped noise field.
      const vesselField = noise.noise(x * 0.11 + 30, baseY * 0.11, baseZ * 0.11 + seedOffset);
      const pialLine = 1 - smoothstep(0.0, 0.025, Math.abs(vesselField));
      c.lerp(pial, pialLine * 0.8 * (1 - crease * 0.5));

      // Superficial sylvian vein along the rim (only a short run of the rim has it).
      const rimDist = Math.abs(s.offset - (b.rimHalfWidth + 1.5 + 1.5 * noise.noise(x * 0.08, side, 3)));
      const veinMask = (1 - smoothstep(0.6, 1.5, rimDist)) * smoothstep(-30, -10, x) * (side > 0 ? 1 : 0.6);
      c.lerp(vein, veinMask * 0.85);

      colors[k] = c.r;
      colors[k + 1] = c.g;
      colors[k + 2] = c.b;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nu - 1; j++) {
      const a = i * nu + j, bb = (i + 1) * nu + j;
      // Winding chosen so normals face out of the brain (up / into the corridor).
      if (side > 0) indices.push(a, a + 1, bb, bb, a + 1, bb + 1);
      else indices.push(a, bb, a + 1, bb, bb + 1, a + 1);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();

  const mesh = new Mesh(g, createBrainMaterial());
  mesh.name = id;
  mesh.userData.structure = id;
  return mesh;
}

/**
 * Floor of the corridor: the basal cisterns over the skull base (tentorial edge, clinoid
 * region). Dark because little light reaches it and it is covered by CSF and arachnoid.
 */
export function buildFloor(): Mesh {
  const b = anatomy.brain;
  const width = 2 * b.extentX;
  const depth = 2 * b.floorHalfWidth + 8;
  const g = new PlaneGeometry(width, depth, 120, 40);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, 1.2 * noise.fbm(x * 0.08, y * 0.08, 9, 3));
  }
  g.computeVertexNormals();
  const mesh = new Mesh(g, createFloorMaterial());
  mesh.position.set(0, b.corridorCenterY, -b.floorDepth);
  mesh.name = 'floor';
  mesh.userData.structure = 'floor';
  return mesh;
}
