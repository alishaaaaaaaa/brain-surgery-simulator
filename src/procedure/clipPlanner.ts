import { type Camera, type Intersection, Raycaster } from 'three';
import type { AneurysmHandle } from '../anatomy/aneurysm';
import type { FlowModel } from '../physics/flow';
import { clipPoseFromView } from '../tools/impl/clip';

export interface ClipPlan {
  /** Where on the sac surface to aim. */
  aim: Intersection;
  roll: number;
  depth: number;
  closure: number;
}

/**
 * Search the settings the clip tool offers (aim height on the neck, rotation, blade depth)
 * for the placement that closes the neck best without narrowing the ICA or catching a
 * branch. Used by demo mode; the same search in the tests proves a clean clip is reachable.
 */
export function planClip(flow: FlowModel, aneurysm: AneurysmHandle, camera: Camera, length = 7): ClipPlan | null {
  const ray = new Raycaster();
  let best: ClipPlan | null = null;
  for (const h of [0.4, 0.9, 1.4, 1.9, 2.4]) {
    const target = aneurysm.neckCenter.clone().addScaledVector(aneurysm.axis, h);
    ray.set(camera.position, target.clone().sub(camera.position).normalize());
    const aim = ray.intersectObject(aneurysm.dome, false)[0];
    if (!aim) continue;
    for (let roll = 0; roll < 360; roll += 10) {
      for (let depth = -4; depth <= 4; depth += 0.5) {
        const s = flow.compute([{ pose: clipPoseFromView(aim.point, camera, roll, depth), length, kind: 'permanent' }], []);
        const clean = s.icaStenosis < 0.3 && s.pcomPinch < 0.3 && s.achaPinch < 0.3 && s.residualNeck < 0.5;
        if (clean && (!best || s.neckClosure > best.closure)) best = { aim, roll, depth, closure: s.neckClosure };
      }
    }
  }
  return best;
}
