import { Group, Mesh, PlaneGeometry } from 'three';
import { anatomy } from '../config/anatomy';
import { fissureWander } from './brain';
import { wallOffsetAtDepth } from './geometryMath';
import { createArachnoidMaterial } from './materials';
import { Noise3 } from './noise';

const noise = new Noise3(77);

export interface ArachnoidPatch {
  mesh: Mesh;
  sheet: string;
  index: number;
  cut: boolean;
}

/**
 * Arachnoid membranes bridging the fissure. The arachnoid is a thin, translucent
 * membrane; opening the sylvian fissure means cutting it sharply (micro-scissors),
 * NOT tearing it by retraction — tearing pulls on bridging veins and the cortex.
 *
 * Each sheet is split into segments that can be cut one by one (M2).
 */
export function buildArachnoid(): { group: Group; patches: ArachnoidPatch[] } {
  const b = anatomy.brain;
  const group = new Group();
  group.name = 'arachnoid';
  const patches: ArachnoidPatch[] = [];
  const baseMaterial = createArachnoidMaterial();

  for (const sheet of anatomy.arachnoid.sheets) {
    const halfSpan = wallOffsetAtDepth(b, sheet.z) + 2.5; // tuck edges into the walls
    const segW = (sheet.xTo - sheet.xFrom) / sheet.segments;
    for (let s = 0; s < sheet.segments; s++) {
      const x0 = sheet.xFrom + s * segW;
      const g = new PlaneGeometry(segW, 2 * halfSpan, 24, 32);
      const pos = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i), ly = pos.getY(i);
        const x = x0 + segW / 2 + lx;
        // Follow the wandering walls so the edges stay embedded.
        const u = ly / halfSpan; // -1 (temporal) .. +1 (frontal)
        const w = u > 0 ? fissureWander(x, 1) : fissureWander(x, -1);
        const y = b.corridorCenterY + ly + w * Math.abs(u);
        const sag = sheet.sag * (1 - u * u);
        const wrinkle = 0.35 * noise.fbm(x * 0.2, y * 0.2, sheet.z, 2);
        pos.setXYZ(i, x, y, sheet.z - sag + wrinkle);
        // World-space UVs keep the fibre texture continuous across neighbouring segments.
        uv.setXY(i, x / 45 + sheet.z * 0.013, y / 45);
      }
      g.computeVertexNormals();
      const material = baseMaterial.clone();
      const mesh = new Mesh(g, material);
      mesh.name = `arachnoid-${sheet.id}-${s}`;
      mesh.renderOrder = 2;
      const patch: ArachnoidPatch = { mesh, sheet: sheet.id, index: s, cut: false };
      mesh.userData.structure = 'arachnoid';
      mesh.userData.patch = patch;
      group.add(mesh);
      patches.push(patch);
    }
  }
  return { group, patches };
}
