import type { Vector3 } from 'three';

/**
 * Small typed event bus. Modules (tools, procedure, vitals, audio, UI) communicate
 * through events so they stay decoupled. New events are added as milestones land.
 */

export type ToolId =
  | 'suction'
  | 'scissors'
  | 'bipolar'
  | 'dissector'
  | 'spatula'
  | 'clip'
  | 'icg'
  | 'doppler'
  | 'endoscope'
  | 'tempClip';

/** What a structure is, for tool rules and events (mesh.userData.structure). */
export type StructureId =
  | 'frontalLobe'
  | 'temporalLobe'
  | 'floor'
  | 'ica'
  | 'm1'
  | 'm2Superior'
  | 'm2Inferior'
  | 'a1'
  | 'pcom'
  | 'acha'
  | 'opticNerve'
  | 'oculomotorNerve'
  | 'aneurysm'
  | 'bleb'
  | 'arachnoid'
  | 'adhesion'
  | 'spatula'
  | 'csf'
  | 'blood'
  | 'clip'
  | 'tempClip';

export interface ClipPose {
  position: Vector3;
  /** Unit vector from the clip head toward the blade tips. */
  bladeDir: Vector3;
  /** Unit vector along which the blades close. */
  closingDir: Vector3;
}

export interface SimEvents {
  started: void;
  languageChanged: { lang: string };
  heartbeat: { rate: number };
  toolChanged: { tool: ToolId | null };
  arachnoidCut: { sheet: string; index: number; remaining: number; point: Vector3 };
  adhesionFreed: { id: string; kind: 'neck' | 'dome' };
  /** A structure was damaged. severity: 'minor' (pia/small vessel), 'major' (artery/nerve). */
  injury: { structure: StructureId; severity: 'minor' | 'major'; point: Vector3; normal: Vector3; tool: ToolId };
  coagulated: { structure: StructureId; point: Vector3 };
  ruptureRiskChanged: { value: number };
  fluidAspirated: { amount: number };
  retractionChanged: { lobe: 'frontal' | 'temporal'; pressure: number };
  clipApplied: { id: number; pose: ClipPose; shape: 'straight' | 'curved'; length: number };
  clipRemoved: { id: number };
  tempClipApplied: { structure: StructureId; pose: ClipPose };
  tempClipRemoved: void;
  /** Doppler probe pressed on a structure (null = lifted); `flow` is what it hears, 0..1. */
  dopplerContact: { structure: StructureId | null; flow: number };
  /** ICG videoangiography was run. */
  icgRun: void;
  /** A structure was identified (inspected long enough) for the first time. */
  identified: { structure: StructureId };
  /** Stage `index` (0-based) completed; `next` is the new current stage or null when done. */
  stageCompleted: { index: number; id: string; time: number; next: number | null };
  bleedStarted: { kind: BleedKind; point: Vector3 };
  bleedStopped: { kind: BleedKind; by: 'bipolar' | 'clip' };
  ruptured: { point: Vector3 };
  ruptureSecured: void;
  alarm: { id: 'mapLow' | 'hrHigh' | 'spo2Low' | 'mepLow'; active: boolean };
}

export type BleedKind = 'ooze' | 'arterial' | 'rupture';

type Handler<T> = (payload: T) => void;

export class EventBus<E> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, ...payload: E[K] extends void ? [] : [E[K]]): void {
    this.handlers.get(type)?.forEach((h) => (h as Handler<E[K]>)(payload[0] as E[K]));
  }
}

export const events = new EventBus<SimEvents>();
