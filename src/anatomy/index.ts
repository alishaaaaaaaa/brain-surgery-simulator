import { BufferGeometry, CatmullRomCurve3, Group, Mesh, Object3D, Vector3 } from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { anatomy, type NerveId, type VesselId } from '../config/anatomy';
import { buildAneurysm, type AneurysmHandle } from './aneurysm';
import { buildArachnoid, type ArachnoidPatch } from './arachnoid';
import { buildFloor, buildLobe } from './brain';
import { buildLabels } from './labels';
import { buildSpatulas } from './spatulas';
import { buildNerves, buildVesselCurves, buildVessels } from './vessels';

export interface Anatomy {
  root: Group;
  vesselCurves: Map<VesselId, CatmullRomCurve3>;
  vessels: Map<VesselId, Mesh>;
  nerves: Map<NerveId, Mesh>;
  nerveCurves: Map<NerveId, CatmullRomCurve3>;
  aneurysm: AneurysmHandle;
  arachnoid: ArachnoidPatch[];
  spatulas: Group;
  labels: Group;
  /** Meshes the cursor can hit (for autofocus now, tool interaction from M2). */
  pickables: Object3D[];
}

// Bounding-volume hierarchies make cursor raycasts against the dense meshes cheap.
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

/** Builds the whole operative field. */
export function buildAnatomy(): Anatomy {
  const root = new Group();
  root.name = 'anatomy';

  const frontal = buildLobe('frontalLobe');
  const temporal = buildLobe('temporalLobe');
  const floor = buildFloor();
  const vesselCurves = buildVesselCurves();
  const { group: vesselGroup, meshes: vessels } = buildVessels(vesselCurves);
  const { group: nerveGroup, meshes: nerves, curves: nerveCurves } = buildNerves();
  const aneurysm = buildAneurysm(vesselCurves.get('ica')!);
  const { group: arachnoidGroup, patches } = buildArachnoid();
  const spatulas = buildSpatulas();

  const at = (id: VesselId, t: number) => vesselCurves.get(id)!.getPointAt(t);
  const b = anatomy.brain;
  const labels = buildLabels([
    { key: 'anat.ica', position: at('ica', 0.35) },
    { key: 'anat.m1', position: at('m1', 0.5) },
    { key: 'anat.m2Superior', position: at('m2Superior', 0.6) },
    { key: 'anat.m2Inferior', position: at('m2Inferior', 0.6) },
    { key: 'anat.a1', position: at('a1', 0.55) },
    { key: 'anat.pcom', position: at('pcom', 0.6) },
    { key: 'anat.acha', position: at('acha', 0.6) },
    { key: 'anat.opticNerve', position: nerveCurves.get('opticNerve')!.getPointAt(0.28) },
    { key: 'anat.oculomotorNerve', position: nerveCurves.get('oculomotorNerve')!.getPointAt(0.3) },
    { key: 'anat.aneurysm', position: aneurysm.apex.clone() },
    { key: 'anat.bleb', position: aneurysm.bleb.getWorldPosition(new Vector3()) },
    { key: 'anat.frontalLobe', position: new Vector3(-20, b.corridorCenterY + b.rimHalfWidth + 14, 1) },
    { key: 'anat.temporalLobe', position: new Vector3(-20, b.corridorCenterY - b.rimHalfWidth - 14, 1) },
    { key: 'anat.sylvianFissure', position: new Vector3(24, b.corridorCenterY + 4, -6) },
  ]);

  root.add(frontal, temporal, floor, vesselGroup, nerveGroup, aneurysm.group, arachnoidGroup, spatulas, labels);

  const pickables: Object3D[] = [
    frontal,
    temporal,
    floor,
    ...vesselGroup.children,
    ...nerveGroup.children,
    aneurysm.dome,
    aneurysm.bleb,
    ...spatulas.children,
    ...patches.map((p) => p.mesh),
  ];

  for (const o of pickables) if (o instanceof Mesh) o.geometry.computeBoundsTree();

  return {
    root,
    vesselCurves,
    vessels,
    nerves,
    nerveCurves,
    aneurysm,
    arachnoid: patches,
    spatulas,
    labels,
    pickables,
  };
}
