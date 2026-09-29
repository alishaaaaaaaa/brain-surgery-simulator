import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildAneurysm } from '../anatomy/aneurysm';
import { buildVesselCurves } from '../anatomy/vessels';
import { anatomy } from '../config/anatomy';
import { sim } from '../config/sim';
import type { ClipGeometry } from './clipEvaluation';
import { FlowModel } from './flow';

const curves = buildVesselCurves();
const aneurysm = buildAneurysm(curves.get('ica')!);
const model = () => new FlowModel(curves, aneurysm);

const a = aneurysm.axis;
const T = curves.get('ica')!.getTangentAt(anatomy.aneurysm.icaT);
/** Along the ICA, perpendicular to the aneurysm axis. */
const u = T.clone().addScaledVector(a, -a.dot(T)).normalize();

/**
 * A clip across the neck: closing along `closing` (⟂ axis), blades along axis × closing,
 * blade midpoint `height` mm above the neck plane.
 */
function clipAt(opts: { height?: number; closing?: Vector3; length?: number; shift?: Vector3 } = {}): ClipGeometry {
  const closing = (opts.closing ?? u).clone().normalize();
  const bladeDir = new Vector3().crossVectors(a, closing).normalize();
  const position = aneurysm.neckCenter.clone().addScaledVector(a, opts.height ?? 0.7);
  if (opts.shift) position.add(opts.shift);
  return { pose: { position, bladeDir, closingDir: closing }, length: opts.length ?? 7, kind: 'permanent' };
}

describe('clip evaluation', () => {
  it('an ideal clip closes the neck without narrowing the ICA or catching branches', () => {
    const s = model().compute([clipAt()], []);
    expect(s.neckClosure).toBeGreaterThan(0.95);
    expect(s.residualNeck).toBe(0);
    expect(s.icaStenosis).toBeLessThan(0.25);
    expect(s.pcomPinch).toBeLessThan(0.3);
    expect(s.achaPinch).toBeLessThan(0.3);
    expect(s.flow.aneurysm).toBeLessThan(sim.flow.silentBelow);
    expect(s.flow.pcom).toBeGreaterThan(0.9);
    expect(s.flow.acha).toBeGreaterThan(0.9);
    expect(s.perforatorIschemia).toBeLessThan(0.1);
  });

  it('closing along the aneurysm axis (wrong rotation) does not close the neck', () => {
    // Blades still across the neck, but squeezing from dome to base.
    const bladeDir = new Vector3().crossVectors(a, u).normalize();
    const clip: ClipGeometry = {
      pose: { position: aneurysm.neckCenter.clone().addScaledVector(a, 0.7), bladeDir, closingDir: a.clone() },
      length: 7,
      kind: 'permanent',
    };
    const s = model().compute([clip], []);
    expect(s.neckClosure).toBeLessThan(0.2);
    expect(s.flow.aneurysm).toBeGreaterThan(0.8);
  });

  it('a 5 mm clip is too short for a 4 mm neck (flattened ≈ 6.3 mm): incomplete closure', () => {
    const s = model().compute([clipAt({ length: 5 })], []);
    expect(s.neckClosure).toBeLessThan(0.9);
    expect(s.flow.aneurysm).toBeGreaterThan(sim.flow.silentBelow);
  });

  it('a clip placed high on the sac leaves a residual neck', () => {
    const s = model().compute([clipAt({ height: 2.4 })], []);
    expect(s.residualNeck).toBeGreaterThan(1);
  });

  it('a clip placed too low bites into the ICA', () => {
    const s = model().compute([clipAt({ height: -1.4 })], []);
    expect(s.icaStenosis).toBeGreaterThan(0.45);
  });

  it('two clips can together close a neck neither closes alone', () => {
    const m = model();
    const half = u.clone().multiplyScalar(0);
    const left = clipAt({ length: 5, shift: new Vector3().crossVectors(a, u).normalize().multiplyScalar(1.6).add(half) });
    const right = clipAt({ length: 5, shift: new Vector3().crossVectors(a, u).normalize().multiplyScalar(-1.6) });
    const one = m.compute([left], []).neckClosure;
    const both = m.compute([left, right], []).neckClosure;
    expect(both).toBeGreaterThan(one);
  });
});

describe('temporary clip and flow', () => {
  /** A mini clip squarely across the ICA at parameter t. */
  function tempOnIca(t: number): ClipGeometry {
    const ica = curves.get('ica')!;
    const p = ica.getPointAt(t);
    const tan = ica.getTangentAt(t);
    const closing = new Vector3(0, 0, 1).addScaledVector(tan, -tan.z).normalize();
    const bladeDir = new Vector3().crossVectors(tan, closing).normalize();
    return { pose: { position: p, bladeDir, closingDir: closing }, length: 5, kind: 'temporary' };
  }

  it('a temporary clip on the proximal ICA drops distal flow to collateral levels', () => {
    const s = model().compute([], [tempOnIca(0.2)]);
    expect(s.tempOcclusion).toBeGreaterThan(0.6);
    expect(s.flow.m1).toBeCloseTo(sim.flow.collateral, 1);
    expect(s.flow.aneurysm).toBeCloseTo(sim.flow.collateral, 1);
    // The PCom fills backwards from the posterior circulation.
    expect(s.flow.pcom).toBeCloseTo(sim.flow.pcomRetrograde, 1);
  });

  it('the Doppler hears full flow proximal to the temporary clip, reduced flow beyond it', () => {
    const m = model();
    const s = m.compute([], [tempOnIca(0.3)]);
    const ica = curves.get('ica')!;
    expect(m.flowAt(s, 'ica', ica.getPointAt(0.1))).toBe(1);
    expect(m.flowAt(s, 'ica', ica.getPointAt(0.9))).toBeLessThan(0.4);
  });

  it('with no clips everything flows, including the aneurysm', () => {
    const s = model().compute([], []);
    expect(s.flow.aneurysm).toBe(1);
    expect(s.flow.pcom).toBe(1);
    expect(s.neckClosure).toBe(0);
  });
});

describe('reachability with the clip tool', () => {
  it('tilting the microscope (≤ 20°), some rotation/depth the tool offers closes the neck cleanly', async () => {
    const { PerspectiveCamera, Raycaster } = await import('three');
    const { microscope } = await import('../config/anatomy');
    const { clipPoseFromView } = await import('../tools/impl/clip');
    const target = new Vector3(...microscope.target);
    const axis = new Vector3(...microscope.viewAxis).normalize();
    const right = new Vector3().crossVectors(axis.clone().negate(), new Vector3(0, 1, 0)).normalize();
    const up = new Vector3().crossVectors(axis, right);
    const m = model();
    // The learner aims somewhere on the visible surface of the neck / lower sac.
    const aimHeights = [0.4, 0.9, 1.4, 1.9, 2.4];

    const bestFor = (tiltDeg: number, dirAngle: number) => {
      const t = Math.tan((tiltDeg * Math.PI) / 180);
      const dir = axis.clone().addScaledVector(right, t * Math.cos(dirAngle)).addScaledVector(up, t * Math.sin(dirAngle)).normalize();
      const camera = new PerspectiveCamera(microscope.fov, 16 / 9, 1, 1000);
      camera.position.copy(target).addScaledVector(dir, microscope.workingDistance);
      camera.up.copy(up);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      let best = 0;
      for (const h of aimHeights) {
        const aim = aneurysm.neckCenter.clone().addScaledVector(a, h);
        const hit = new Raycaster(camera.position, aim.clone().sub(camera.position).normalize()).intersectObject(aneurysm.dome, false)[0];
        if (!hit) continue;
        for (let roll = 0; roll < 360; roll += 10) {
          for (let depth = -4; depth <= 4; depth += 0.5) {
            const s = m.compute([{ pose: clipPoseFromView(hit.point, camera, roll, depth), length: 7, kind: 'permanent' }], []);
            const clean = s.icaStenosis < 0.3 && s.pcomPinch < 0.3 && s.achaPinch < 0.3 && s.residualNeck < 0.5;
            if (clean) best = Math.max(best, s.neckClosure);
          }
        }
      }
      return best;
    };

    let best = bestFor(0, 0);
    for (let k = 0; k < 8 && best < 0.95; k++) best = Math.max(best, bestFor(20, (k * Math.PI) / 4));
    expect(best).toBeGreaterThan(0.95);
  });
});
