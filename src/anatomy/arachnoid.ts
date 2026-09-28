import { Float32BufferAttribute, Group, Mesh, PlaneGeometry } from 'three';
import { smoothstep } from './noise';
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
  /** Time since the cut (s), drives the recoil animation. */
  cutT: number;
  /** Where the scissors cut, across the fissure: -1 (temporal wall) .. +1 (frontal wall). */
  cutU: number;
  /** Rest positions and each vertex's cross-fissure coordinate u (-1..1). */
  rest: Float32Array;
  u: Float32Array;
  halfSpan: number;
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
      // Neighbouring segments overlap and fade out at their ends, so there are no hard
      // seams — before or after a neighbour is cut.
      const overlap = segW * 0.18;
      const g = new PlaneGeometry(segW + 2 * overlap, 2 * halfSpan, 28, 32);
      const rgba = new Float32Array(g.getAttribute('position').count * 4);
      const pos = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      const us = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i), ly = pos.getY(i);
        const x = x0 + segW / 2 + lx;
        // Follow the wandering walls so the edges stay embedded.
        const u = ly / halfSpan; // -1 (temporal) .. +1 (frontal)
        us[i] = u;
        const edge = Math.min(lx + segW / 2 + overlap, segW / 2 + overlap - lx);
        rgba.set([1, 1, 1, smoothstep(0, 2 * overlap, edge)], i * 4);
        const w = u > 0 ? fissureWander(x, 1) : fissureWander(x, -1);
        const y = b.corridorCenterY + ly + w * Math.abs(u);
        const sag = sheet.sag * (1 - u * u);
        const wrinkle = 0.35 * noise.fbm(x * 0.2, y * 0.2, sheet.z, 2);
        pos.setXYZ(i, x, y, sheet.z - sag + wrinkle);
        // World-space UVs keep the fibre texture continuous across neighbouring segments.
        uv.setXY(i, x / 45 + sheet.z * 0.013, y / 45);
      }
      g.computeVertexNormals();
      g.setAttribute('color', new Float32BufferAttribute(rgba, 4));
      const material = baseMaterial.clone();
      material.vertexColors = true;
      const mesh = new Mesh(g, material);
      mesh.name = `arachnoid-${sheet.id}-${s}`;
      mesh.renderOrder = 2;
      const patch: ArachnoidPatch = {
        mesh,
        sheet: sheet.id,
        index: s,
        cut: false,
        cutT: 0,
        cutU: 0,
        rest: new Float32Array(pos.array as Float32Array),
        u: us,
        halfSpan,
      };
      mesh.userData.structure = 'arachnoid';
      mesh.userData.patch = patch;
      group.add(mesh);
      patches.push(patch);
    }
  }
  return { group, patches };
}

/**
 * Cut a patch at the given point: the membrane splits along the cut and each half recoils
 * toward its wall (arachnoid is under slight tension once the fissure is spread).
 */
export function cutPatch(patch: ArachnoidPatch, cutY: number): void {
  if (patch.cut) return;
  patch.cut = true;
  patch.cutT = 0;
  patch.cutU = Math.max(-0.8, Math.min(0.8, (cutY - anatomy.brain.corridorCenterY) / patch.halfSpan));
}

export function updateArachnoid(patches: ArachnoidPatch[], dt: number): void {
  for (const p of patches) {
    if (!p.cut || !p.mesh.visible) continue;
    p.cutT += dt;
    const k = Math.min(1, p.cutT / 0.7);
    const ease = 1 - (1 - k) ** 3;
    const pos = p.mesh.geometry.getAttribute('position');
    const cy = anatomy.brain.corridorCenterY;
    for (let i = 0; i < pos.count; i++) {
      const u = p.u[i];
      // Which side of the cut this vertex is on, and where that half's wall is.
      const wallU = u >= p.cutU ? 1 : -1;
      const target = wallU * p.halfSpan * 0.97;
      const y0 = p.rest[i * 3 + 1] - cy;
      // Parts near the cut travel furthest; parts at the wall barely move.
      pos.setY(i, cy + y0 + (target - y0) * ease * 0.92);
      pos.setZ(i, p.rest[i * 3 + 2] + 0.8 * ease * (1 - Math.abs(u)));
    }
    pos.needsUpdate = true;
    (p.mesh.material as { opacity: number }).opacity = anatomy.arachnoid.opacity * (1 - 0.7 * ease);
    if (k >= 1) {
      p.mesh.visible = false; // fully retracted into the walls
    }
  }
}
