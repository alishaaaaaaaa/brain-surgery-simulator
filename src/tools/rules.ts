import type { StructureId } from '../core/events';

/** Structure categories used by the tool rules. */
export const ARTERIES: ReadonlySet<StructureId> = new Set(['ica', 'm1', 'm2Superior', 'm2Inferior', 'a1', 'pcom', 'acha']);
export const NERVES: ReadonlySet<StructureId> = new Set(['opticNerve', 'oculomotorNerve']);
export const BRAIN: ReadonlySet<StructureId> = new Set(['frontalLobe', 'temporalLobe']);

export const isArtery = (s: StructureId) => ARTERIES.has(s);
export const isNerve = (s: StructureId) => NERVES.has(s);
export const isBrain = (s: StructureId) => BRAIN.has(s);
/** The aneurysm dome or its bleb — fragile; rough handling raises rupture risk. */
export const isSac = (s: StructureId) => s === 'aneurysm' || s === 'bleb';
