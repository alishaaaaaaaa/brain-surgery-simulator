/**
 * Simulation tuning (gameplay, physiology). Expanded in later milestones
 * (bleeding rates, rupture thresholds, vitals drift).
 */
export const sim = {
  heart: {
    /** Baseline heart rate under anaesthesia (beats per minute). */
    baselineRate: 68,
  },

  /**
   * Hidden rupture risk (0..1). Rough handling of the aneurysm raises it; from M4 a
   * threshold crossing triggers intraoperative rupture. Values are per event or per mm/s.
   */
  ruptureRisk: {
    /** Dissector rubbing the dome: added per mm of stroke. The bleb multiplies it. */
    dissectorDomePerMm: 0.012,
    /** Suction held on the dome, per second. */
    suctionDomePerSecond: 0.05,
    bipolarDome: 0.2,
    scissorsDome: 0.6,
    /** Freeing a dome adhesion (the dome is pulled on as it is peeled off). */
    domeAdhesion: 0.14,
    blebMultiplier: 3,
  },

  dissection: {
    /** mm of dissector stroke needed to free one adhesion. */
    strokePerAdhesion: 5,
  },

  suction: {
    /** Fraction of a pool's volume removed per second when the tip is in it. */
    rate: 0.45,
    /** Reach beyond the pool radius (mm). */
    reach: 1.5,
  },

  procedure: {
    /** Seconds the cursor must rest on a structure to identify it. */
    identifyDwell: 1.2,
    /**
     * The part of each arachnoid sheet that must be opened (x range, mm): the working
     * window over the carotid–sylvian region, not the whole fissure.
     */
    window: {
      superficial: [-22, 30],
      middle: [-15, 30],
      deep: [-15, 10],
    } as Record<string, [number, number]>,
    /** A clip counts as "across the neck" if its blade midpoint is this close to the neck (mm, beyond the neck radius). */
    clipNeckTolerance: 2.5,
    /** Pause before the next stage unlocks, so the completion is noticed (s). */
    advanceDelay: 1.2,
  },

  retraction: {
    /** Retraction pressure above which a warning is shown (0..1). */
    warnAbove: 0.7,
  },
} as const;
