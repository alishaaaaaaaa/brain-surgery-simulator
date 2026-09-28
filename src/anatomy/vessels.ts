import { CatmullRomCurve3, Group, Mesh, SphereGeometry, Vector3 } from 'three';
import { anatomy, type NerveId, type VesselId, type VesselSpec } from '../config/anatomy';
import { createArteryMaterial, createNerveMaterial } from './materials';
import { buildTaperedTube } from './tube';

const v = (p: readonly [number, number, number]) => new Vector3(p[0], p[1], p[2]);

/**
 * Centreline curves for every vessel. Branches (PCom, AChA) start on their parent's
 * centreline so their origin is hidden inside the parent wall — as a real branch would
 * emerge from the vessel lumen.
 */
export function buildVesselCurves(): Map<VesselId, CatmullRomCurve3> {
  const curves = new Map<VesselId, CatmullRomCurve3>();
  const specs = anatomy.vessels as Record<VesselId, VesselSpec>;
  // Parents first (anything without branchOf), then branches.
  const order = (Object.keys(specs) as VesselId[]).sort(
    (a, b) => Number(!!specs[a].branchOf) - Number(!!specs[b].branchOf),
  );
  for (const id of order) {
    const spec = specs[id];
    const pts = spec.points.map(v);
    if (spec.branchOf) {
      const parent = curves.get(spec.branchOf.vessel);
      if (!parent) throw new Error(`Vessel ${id}: parent ${spec.branchOf.vessel} not built`);
      pts.unshift(parent.getPointAt(spec.branchOf.t));
    }
    curves.set(id, new CatmullRomCurve3(pts, false, 'centripetal'));
  }
  return curves;
}

export function buildVessels(curves: Map<VesselId, CatmullRomCurve3>): { group: Group; meshes: Map<VesselId, Mesh> } {
  const group = new Group();
  group.name = 'vessels';
  const meshes = new Map<VesselId, Mesh>();
  const specs = anatomy.vessels as Record<VesselId, VesselSpec>;
  for (const [id, curve] of curves) {
    const spec = specs[id];
    const radius = spec.radius;
    const segs = Math.max(48, Math.round(curve.getLength() * 3));
    const geo = buildTaperedTube(curve, { radius, tubularSegments: segs, radialSegments: 24 });
    const mesh = new Mesh(geo, createArteryMaterial(Math.max(...radius)));
    mesh.name = id;
    mesh.userData.structure = id;
    group.add(mesh);
    meshes.set(id, mesh);
  }

  // Smooth the ICA terminal bifurcation (ICA → M1 + A1) with a small blob.
  const bif = curves.get('ica')!.getPointAt(1);
  const blob = new Mesh(new SphereGeometry(anatomy.vessels.ica.radius[1] * 1.08, 24, 16), createArteryMaterial(1.8));
  blob.position.copy(bif);
  blob.name = 'icaBifurcation';
  blob.userData.structure = 'ica';
  group.add(blob);
  // M1 → M2 bifurcation (usually at the genu of the MCA, near the limen insulae).
  const mcaBif = new Mesh(new SphereGeometry(anatomy.vessels.m1.radius[1] * 1.05, 20, 14), createArteryMaterial(1.3));
  mcaBif.position.copy(curves.get('m1')!.getPointAt(1));
  mcaBif.name = 'mcaBifurcation';
  mcaBif.userData.structure = 'm1';
  group.add(mcaBif);

  return { group, meshes };
}

export function buildNerves(): { group: Group; meshes: Map<NerveId, Mesh>; curves: Map<NerveId, CatmullRomCurve3> } {
  const group = new Group();
  group.name = 'nerves';
  const meshes = new Map<NerveId, Mesh>();
  const curves = new Map<NerveId, CatmullRomCurve3>();
  const material = createNerveMaterial();
  for (const [id, spec] of Object.entries(anatomy.nerves) as [NerveId, (typeof anatomy.nerves)[NerveId]][]) {
    const curve = new CatmullRomCurve3(spec.points.map(v), false, 'centripetal');
    const geo = buildTaperedTube(curve, {
      radius: [spec.radius, spec.radius * 0.95],
      flatten: spec.flatten,
      tubularSegments: 80,
      radialSegments: 24,
    });
    const mesh = new Mesh(geo, material);
    mesh.name = id;
    mesh.userData.structure = id;
    group.add(mesh);
    meshes.set(id, mesh);
    curves.set(id, curve);
  }
  return { group, meshes, curves };
}
