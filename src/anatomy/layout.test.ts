/**
 * Layout sanity checks for the anatomy config. If you tune src/config/anatomy.ts and one
 * of these fails, a structure is probably hidden inside a lobe, out of view, or
 * intersecting a neighbour.
 */
import { describe, expect, it } from 'vitest';
import { CatmullRomCurve3, Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { anatomy, microscope, type NerveId, type VesselId, type VesselSpec } from '../config/anatomy';
import { buildAdhesions } from './adhesions';
import { buildAneurysm } from './aneurysm';
import { buildLobe } from './brain';
import { buildTaperedTube } from './tube';
import { buildVesselCurves } from './vessels';

const curves = buildVesselCurves();
const aneurysm = buildAneurysm(curves.get('ica')!);
const lobes = [buildLobe('frontalLobe'), buildLobe('temporalLobe')];
const nerveCurves = Object.fromEntries(
  Object.entries(anatomy.nerves).map(([id, n]) => [id, new CatmullRomCurve3(n.points.map((p) => new Vector3(...p)), false, 'centripetal')]),
);

const target = new Vector3(...microscope.target);
const camPos = target.clone().addScaledVector(new Vector3(...microscope.viewAxis).normalize(), microscope.workingDistance);
const camera = new PerspectiveCamera(microscope.fov, 16 / 9, 1, 1000);
camera.position.copy(camPos);
camera.up.set(0, 1, 0);
camera.lookAt(target);
camera.updateMatrixWorld();

const keyPoints: [string, Vector3][] = [
  ['ICA (mid)', curves.get('ica')!.getPointAt(0.6)],
  ['ICA bifurcation', curves.get('ica')!.getPointAt(1)],
  ['M1', curves.get('m1')!.getPointAt(0.5)],
  ['A1', curves.get('a1')!.getPointAt(0.3)],
  ['PCom', curves.get('pcom')!.getPointAt(0.25)],
  ['AChA', curves.get('acha')!.getPointAt(0.25)],
  ['aneurysm apex', aneurysm.apex],
  ['aneurysm dome', aneurysm.domeCenter],
  ['optic nerve', nerveCurves.opticNerve.getPointAt(0.45)],
];

describe('default microscope view', () => {
  it.each(keyPoints)('%s is inside the field of view', (_name, p) => {
    const ndc = p.clone().project(camera);
    expect(Math.abs(ndc.x)).toBeLessThan(1);
    expect(Math.abs(ndc.y)).toBeLessThan(1);
  });

  it.each(keyPoints)('%s is not hidden behind a lobe', (_name, p) => {
    const dir = p.clone().sub(camPos);
    const dist = dir.length();
    const ray = new Raycaster(camPos, dir.normalize(), 0, dist - 1);
    expect(ray.intersectObjects(lobes, false)).toHaveLength(0);
  });
});

describe('aneurysm visibility', () => {
  it('the side of the dome facing the microscope is not hidden behind other vessels', () => {
    const specs = anatomy.vessels as Record<VesselId, VesselSpec>;
    const tubes = [...curves].map(([id, c]) => new Mesh(buildTaperedTube(c, { radius: specs[id].radius })));
    const toCam = camPos.clone().sub(aneurysm.domeCenter).normalize();
    const surface = aneurysm.domeCenter.clone().addScaledVector(toCam, aneurysm.domeRadius * 0.95);
    const dir = surface.clone().sub(camPos);
    const ray = new Raycaster(camPos, dir.clone().normalize(), 0, dir.length() - 0.2);
    expect(ray.intersectObjects([...tubes, ...lobes], false)).toHaveLength(0);
  });
});

/** Minimum distance between the dome surface and a curve's centreline, minus its radius. */
function clearanceToCurve(curve: CatmullRomCurve3, radius: number): number {
  const pos = aneurysm.dome.geometry.getAttribute('position');
  const pts = curve.getSpacedPoints(200);
  const v = new Vector3();
  let min = Infinity;
  for (let i = 0; i < pos.count; i += 3) {
    v.fromBufferAttribute(pos, i).applyMatrix4(aneurysm.dome.matrixWorld);
    // Skip the flared base buried in the ICA wall.
    if (v.clone().sub(aneurysm.neckCenter).dot(aneurysm.axis) < 0.3) continue;
    for (const p of pts) min = Math.min(min, v.distanceTo(p));
  }
  return min - radius;
}

describe('aneurysm clearances', () => {
  const specs = anatomy.vessels as Record<VesselId, VesselSpec>;
  it.each(['pcom', 'acha', 'm1', 'a1'] as VesselId[])('dome does not intersect %s', (id) => {
    expect(clearanceToCurve(curves.get(id)!, specs[id].radius[0])).toBeGreaterThan(0.2);
  });
  it('dome does not intersect the oculomotor nerve, but sits close to it', () => {
    const c = clearanceToCurve(nerveCurves.oculomotorNerve, anatomy.nerves.oculomotorNerve.radius);
    expect(c).toBeGreaterThan(0.2);
    expect(c).toBeLessThan(6);
  });
  it('dome does not intersect the optic nerve', () => {
    expect(clearanceToCurve(nerveCurves.opticNerve, anatomy.nerves.opticNerve.radius)).toBeGreaterThan(0.2);
  });
});

describe('arachnoid sheets', () => {
  it('do not cut through vessels', () => {
    const specs = anatomy.vessels as Record<VesselId, VesselSpec>;
    for (const sheet of anatomy.arachnoid.sheets) {
      for (const [id, curve] of curves) {
        const r = Math.max(...specs[id].radius);
        for (const p of curve.getSpacedPoints(120)) {
          if (p.x < sheet.xFrom || p.x > sheet.xTo) continue;
          const inBand = p.z + r > sheet.z - sheet.sag - 0.6 && p.z - r < sheet.z + 0.6;
          expect(inBand, `${sheet.id} sheet intersects ${id} at ${p.toArray().map((n) => n.toFixed(1))}`).toBe(false);
        }
      }
    }
  });
});

describe('lobe mesh', () => {
  it('has outward-facing normals on the cortical surface', () => {
    for (const lobe of lobes) {
      const pos = lobe.geometry.getAttribute('position');
      const nor = lobe.geometry.getAttribute('normal');
      let up = 0, n = 0;
      for (let i = 0; i < pos.count; i += 7) {
        if (pos.getZ(i) > -1 && Math.abs(pos.getY(i)) > 50) {
          n++;
          if (nor.getZ(i) > 0) up++;
        }
      }
      expect(up / n).toBeGreaterThan(0.95);
    }
  });
});

describe('neck adhesions (stage 4)', () => {
  const specs = anatomy.vessels as Record<VesselId, VesselSpec>;
  const tubes = [...curves].map(([id, c]) => new Mesh(buildTaperedTube(c, { radius: specs[id].radius })));
  const { adhesions } = buildAdhesions(
    aneurysm,
    new Map<VesselId | NerveId, CatmullRomCurve3>([...curves, ...(Object.entries(nerveCurves) as [NerveId, CatmullRomCurve3][])]),
    curves.get('ica')!,
  );
  const occluders = [...tubes, aneurysm.dome, aneurysm.bleb, ...lobes];
  const axis = new Vector3(...microscope.viewAxis).normalize();
  const right = new Vector3().crossVectors(axis.clone().negate(), new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(axis, right);

  /** Visible sample points along the band from a microscope tilted by `deg` toward `dir`. */
  function visibleSamples(ad: (typeof adhesions)[number], deg: number, dirAngle: number): number {
    const t = Math.tan((deg * Math.PI) / 180);
    const dir = axis.clone().addScaledVector(right, t * Math.cos(dirAngle)).addScaledVector(up, t * Math.sin(dirAngle)).normalize();
    const cam = target.clone().addScaledVector(dir, microscope.workingDistance);
    let n = 0;
    for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const p = ad.from.clone().lerp(ad.to, f);
      const d = p.clone().sub(cam);
      if (new Raycaster(cam, d.clone().normalize(), 0, d.length() - 0.3).intersectObjects(occluders, false).length === 0) n++;
    }
    return n;
  }

  it.each(adhesions.filter((a) => a.kind === 'neck').map((a) => [a.id, a] as const))(
    '%s can be reached by tilting the microscope (≤ 20°)',
    (_id, ad) => {
      let best = visibleSamples(ad, 0, 0);
      for (let k = 0; k < 8 && best < 2; k++) best = Math.max(best, visibleSamples(ad, 20, (k * Math.PI) / 4));
      expect(best).toBeGreaterThanOrEqual(2);
    },
  );
});
