import { CatmullRomCurve3, Color, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Vector3 } from 'three';
import { anatomy, type NerveId, type VesselId } from '../config/anatomy';
import type { AneurysmHandle } from './aneurysm';
import { buildTaperedTube } from './tube';

export interface Adhesion {
  id: string;
  kind: 'neck' | 'dome';
  /** Visible band. */
  mesh: Mesh;
  /** Invisible, fatter proxy used for picking (the band itself is too thin to hit). */
  proxy: Mesh;
  /** 0..1 — how far it has been dissected. */
  progress: number;
  freed: boolean;
  /** Animation time after being freed (s). */
  releaseT: number;
  from: Vector3;
  to: Vector3;
}

/**
 * Adhesions: thin arachnoid/fibrous bands tethering the aneurysm to its neighbours.
 * Before a clip can be applied safely, the NECK must be dissected free on both sides so
 * the blades can pass around it without catching the PCom or anterior choroidal artery.
 */
export function buildAdhesions(
  aneurysm: AneurysmHandle,
  curves: Map<VesselId | NerveId, CatmullRomCurve3>,
  icaCurve: CatmullRomCurve3,
): { group: Group; adhesions: Adhesion[] } {
  const group = new Group();
  group.name = 'adhesions';
  const adhesions: Adhesion[] = [];

  // Frame around the aneurysm axis: u points distally along the ICA, w completes it.
  const a = aneurysm.axis;
  const T = icaCurve.getTangentAt(anatomy.aneurysm.icaT);
  const u = T.clone().addScaledVector(a, -a.dot(T)).normalize();
  const w = new Vector3().crossVectors(a, u);

  const proxyMaterial = new MeshBasicMaterial({ visible: false });

  for (const spec of anatomy.adhesions) {
    const ang = (spec.from.around * Math.PI) / 180;
    const h = spec.from.height;
    // Radius of the aneurysm surface at that height (neck → dome sphere).
    const R = aneurysm.domeRadius;
    const c = aneurysm.domeCenter.distanceTo(aneurysm.neckCenter);
    const r = h <= 0 ? aneurysm.neckRadius : Math.sqrt(Math.max(0, R * R - (h - c) ** 2));
    const radial = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(w, Math.sin(ang));
    const from = aneurysm.neckCenter.clone().addScaledVector(a, h).addScaledVector(radial, Math.max(r, aneurysm.neckRadius * 0.9));

    const target = curves.get(spec.to.curve as VesselId | NerveId);
    if (!target) throw new Error(`Adhesion ${spec.id}: unknown curve ${spec.to.curve}`);
    let to: Vector3;
    if (spec.to.t === 'nearest') {
      to = target.getSpacedPoints(200).reduce((best, p) => (p.distanceTo(from) < best.distanceTo(from) ? p : best));
    } else {
      to = target.getPointAt(spec.to.t);
    }
    // End on the target's surface rather than its centreline.
    to = to.clone().addScaledVector(from.clone().sub(to).normalize(), 0.5);

    // Slight sag and twist so it looks like a strand, not a rod.
    const mid = from.clone().lerp(to, 0.5).addScaledVector(new Vector3(0, 0, -1), 0.4);
    const curve = new CatmullRomCurve3([from, mid, to]);
    const mesh = new Mesh(
      buildTaperedTube(curve, { radius: [0.11, 0.08], tubularSegments: 24, radialSegments: 8 }),
      new MeshPhysicalMaterial({
        color: new Color('#d9cbb8'),
        transparent: true,
        opacity: 0.7,
        roughness: 0.35,
        clearcoat: 1,
        sheen: 0.6,
        sheenColor: new Color('#ffffff'),
      }),
    );
    mesh.name = `adhesion-${spec.id}`;
    const proxy = new Mesh(buildTaperedTube(curve, { radius: [0.7, 0.7], tubularSegments: 12, radialSegments: 8 }), proxyMaterial);
    const adhesion: Adhesion = { id: spec.id, kind: spec.kind, mesh, proxy, progress: 0, freed: false, releaseT: 0, from, to };
    proxy.userData.structure = 'adhesion';
    proxy.userData.adhesion = adhesion;
    group.add(mesh, proxy);
    adhesions.push(adhesion);
  }
  return { group, adhesions };
}

/** Visual state: thinning while dissected, snapping and retracting once freed. */
export function updateAdhesions(adhesions: Adhesion[], dt: number): void {
  for (const ad of adhesions) {
    const m = ad.mesh.material as MeshPhysicalMaterial;
    if (!ad.freed) {
      m.opacity = 0.7 - 0.4 * ad.progress;
      continue;
    }
    if (!ad.mesh.visible) continue;
    ad.releaseT += dt;
    const k = Math.min(1, ad.releaseT / 0.5);
    m.opacity = 0.3 * (1 - k);
    // Shrink toward the anchor on the neighbour (the freed strand recoils).
    ad.mesh.scale.setScalar(1 - 0.6 * k);
    ad.mesh.position.copy(ad.to).multiplyScalar(0.6 * k);
    if (k >= 1) ad.mesh.visible = false;
  }
}
