import { events } from './events';

/**
 * Mutable simulation state shared by tools, the procedure (M3), vitals (M4) and the
 * debrief (M6). Kept in memory only.
 */
export const state = {
  /** Hidden 0..1. Rough handling of the dome raises it (see config/sim.ts). */
  ruptureRisk: 0,
  /** Retraction pressure per spatula, 0..1. */
  retraction: { frontal: 0, temporal: 0 },
  injuries: 0,
  coagulations: 0,
};

export function addRuptureRisk(amount: number): void {
  if (amount <= 0) return;
  state.ruptureRisk = Math.min(1, state.ruptureRisk + amount);
  events.emit('ruptureRiskChanged', { value: state.ruptureRisk });
}
