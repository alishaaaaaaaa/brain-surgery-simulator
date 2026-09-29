import { beforeEach, describe, expect, it } from 'vitest';
import { CatmullRomCurve3, Group, Mesh, type Object3D, PerspectiveCamera, Vector3 } from 'three';
import { buildAdhesions } from '../anatomy/adhesions';
import { buildAneurysm } from '../anatomy/aneurysm';
import { retractionPressure } from '../anatomy/spatulas';
import { buildVesselCurves } from '../anatomy/vessels';
import { anatomy as cfg, type NerveId, type VesselId } from '../config/anatomy';
import { sim } from '../config/sim';
import { events, type StructureId } from '../core/events';
import { state } from '../core/state';
import { Bleeding } from '../physics/bleeding';
import { Fluids } from '../physics/fluids';
import { ClipTool } from './impl/clip';
import { DissectorTool } from './impl/dissector';
import { structureOf } from './toolManager';
import type { PointerHit, ToolContext } from './types';

const curves = buildVesselCurves();
const aneurysm = buildAneurysm(curves.get('ica')!);
const nerveCurves = new Map<NerveId, CatmullRomCurve3>(
  Object.entries(cfg.nerves).map(([id, n]) => [id as NerveId, new CatmullRomCurve3(n.points.map((p) => new Vector3(...p)), false, 'centripetal')]),
);

function makeCtx(): ToolContext & { shown: string[]; pickables: Object3D[] } {
  const { adhesions } = buildAdhesions(aneurysm, new Map<VesselId | NerveId, CatmullRomCurve3>([...curves, ...nerveCurves]), curves.get('ica')!);
  const shown: string[] = [];
  const pickables: Object3D[] = [];
  const camera = new PerspectiveCamera(12, 1.6, 1, 1000);
  camera.position.set(0, -20, 250);
  camera.lookAt(0, 0, -38);
  camera.updateMatrixWorld();
  const silent = new Proxy({}, { get: () => () => {} });
  return {
    shown,
    pickables,
    scene: new Group() as never,
    camera,
    anatomy: { adhesions, arachnoid: [] } as never,
    fluids: new Fluids(),
    bleeding: new Bleeding(),
    audio: silent as never,
    toasts: { show: (k: string) => shown.push(k) } as never,
    field: new Group(),
    addPickable: (o) => pickables.push(o),
    removePickable: (o) => pickables.splice(pickables.indexOf(o), 1),
  };
}

const hitOn = (object: Object3D, structure: StructureId, point = new Vector3(0, 0, -38)): PointerHit => ({
  point,
  normal: new Vector3(0, 0, 1),
  object,
  structure,
  distance: 250,
});

beforeEach(() => {
  state.ruptureRisk = 0;
});

describe('dissector', () => {
  it('frees a neck adhesion after enough stroke length, without raising rupture risk', () => {
    const ctx = makeCtx();
    const tool = new DissectorTool(ctx);
    const neck = ctx.anatomy.adhesions.find((a) => a.kind === 'neck')!;
    const freed: string[] = [];
    const off = events.on('adhesionFreed', (e) => freed.push(e.id));
    for (let i = 0; i < 4; i++) tool.drag(hitOn(neck.proxy, 'adhesion'), 1);
    expect(neck.freed).toBe(false);
    tool.drag(hitOn(neck.proxy, 'adhesion'), sim.dissection.strokePerAdhesion);
    expect(neck.freed).toBe(true);
    expect(freed).toEqual([neck.id]);
    expect(state.ruptureRisk).toBe(0);
    off();
  });

  it('raises rupture risk when rubbing the dome, three times faster on the bleb', () => {
    const ctx = makeCtx();
    const tool = new DissectorTool(ctx);
    tool.drag(hitOn(aneurysm.dome, 'aneurysm'), 2);
    const dome = state.ruptureRisk;
    expect(dome).toBeCloseTo(sim.ruptureRisk.dissectorDomePerMm * 2);
    state.ruptureRisk = 0;
    tool.drag(hitOn(aneurysm.bleb, 'bleb'), 2);
    expect(state.ruptureRisk).toBeCloseTo(dome * sim.ruptureRisk.blebMultiplier);
  });

  it('freeing a dome adhesion is allowed but costs rupture risk', () => {
    const ctx = makeCtx();
    const tool = new DissectorTool(ctx);
    const dome = ctx.anatomy.adhesions.find((a) => a.kind === 'dome')!;
    tool.drag(hitOn(dome.proxy, 'adhesion'), 100);
    expect(dome.freed).toBe(true);
    expect(state.ruptureRisk).toBeCloseTo(sim.ruptureRisk.domeAdhesion);
    expect(ctx.shown).toContain('toast.domeAdhesion');
  });
});

describe('clip tool', () => {
  it('applies a clip on the aneurysm, aligned with the line of sight, and removes it on a second click', () => {
    const ctx = makeCtx();
    const tool = new ClipTool(ctx, 'permanent');
    const applied: number[] = [];
    const off = events.on('clipApplied', (e) => applied.push(e.id));
    const hit = hitOn(aneurysm.dome, 'aneurysm', aneurysm.neckCenter.clone());
    tool.placeModel(hit, ctx.camera);
    tool.down(hit);
    expect(applied).toHaveLength(1);
    expect(tool.placed).toHaveLength(1);
    const pose = tool.placed[0].pose;
    // Inserted obliquely down the corridor, within ~35° of the line of sight.
    const sight = aneurysm.neckCenter.clone().sub(ctx.camera.position).normalize();
    expect(pose.bladeDir.angleTo(sight)).toBeGreaterThan(0.2);
    expect(pose.bladeDir.angleTo(sight)).toBeLessThan(0.6);
    expect(Math.abs(pose.closingDir.dot(pose.bladeDir))).toBeLessThan(1e-6);
    expect(ctx.pickables.length).toBeGreaterThan(0);

    // Clicking the applied clip removes it.
    const clipMesh = ctx.pickables.find((o) => (o as Mesh).isMesh)!;
    tool.down(hitOn(clipMesh, 'clip'));
    expect(tool.placed).toHaveLength(0);
    expect(ctx.pickables).toHaveLength(0);
    off();
  });

  it('rotation keys turn the closing direction around the insertion axis', () => {
    const ctx = makeCtx();
    const tool = new ClipTool(ctx, 'permanent');
    const hit = hitOn(aneurysm.dome, 'aneurysm', aneurysm.neckCenter.clone());
    tool.placeModel(hit, ctx.camera);
    tool.down(hit);
    const a = tool.placed[0].pose.closingDir.clone();
    for (let i = 0; i < 9; i++) tool.keydown(new KeyboardEventLike('e') as KeyboardEvent);
    tool.placeModel(hit, ctx.camera);
    tool.down(hitOn(aneurysm.dome, 'aneurysm', aneurysm.neckCenter.clone()));
    const b = tool.placed[1].pose.closingDir;
    expect(a.angleTo(b)).toBeCloseTo(Math.PI / 2, 3);
  });

  it('temporary clips only go on the ICA, one at a time', () => {
    const ctx = makeCtx();
    const tool = new ClipTool(ctx, 'temporary');
    const m = new Mesh();
    tool.down(hitOn(m, 'm1'));
    expect(tool.placed).toHaveLength(0);
    expect(ctx.shown).toContain('toast.tempClipWhere');
    tool.placeModel(hitOn(m, 'ica'), ctx.camera);
    tool.down(hitOn(m, 'ica'));
    tool.down(hitOn(m, 'ica', new Vector3(0, 1, -40)));
    expect(tool.placed).toHaveLength(1);
  });
});

describe('suction', () => {
  it('aspirates a CSF pool the tip is in, and not one far away', () => {
    const fluids = new Fluids();
    const pool = fluids.pools[0];
    expect(fluids.aspirate(pool.center.clone().add(new Vector3(30, 30, 0)), 0.5)).toBe(false);
    expect(fluids.aspirate(pool.center.clone(), 0.5)).toBe(true);
    expect(pool.volume).toBeCloseTo(1 - sim.suction.rate * 0.5);
    for (let i = 0; i < 20; i++) fluids.aspirate(pool.center.clone(), 0.5);
    expect(pool.volume).toBe(0);
    expect(pool.mesh.visible).toBe(false);
  });
});

describe('spatula retraction', () => {
  it('rises with depth and is clamped to 0..1', () => {
    const at = (tipDepth: number) => retractionPressure({ lobe: 'frontal', x: 0, width: 9, tipDepth });
    expect(at(-12)).toBe(0);
    expect(at(-24)).toBeGreaterThan(at(-18));
    expect(at(-50)).toBe(1);
  });
});

describe('structureOf', () => {
  it('finds the structure on the object or an ancestor', () => {
    const parent = new Group();
    parent.userData.structure = 'clip';
    const child = new Mesh();
    parent.add(child);
    expect(structureOf(child)).toBe('clip');
    expect(structureOf(new Mesh())).toBeNull();
  });
});

/** Minimal stand-in for KeyboardEvent in the Node test environment. */
class KeyboardEventLike {
  constructor(readonly key: string) {}
}
