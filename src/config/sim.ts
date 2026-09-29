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

  /** Bleeding (mL and mL/s). */
  bleeding: {
    /**
     * The aneurysm ruptures when the hidden rupture risk crosses a threshold drawn at
     * random between these values at the start of each case (so it can't be memorised).
     */
    ruptureThreshold: [0.45, 0.75] as [number, number],
    /** Arterial bleeding from a ruptured aneurysm with full ICA inflow. */
    ruptureRate: 4,
    /** Injured artery (cut or coagulated). */
    arterialRate: 1.2,
    /** Pial or small-vessel ooze. */
    oozeRate: 0.06,
    /** Chance that cutting an arachnoid segment tears a small bridging vein. */
    oozeOnArachnoidCut: 0.25,
    /** Suction clears blood at this rate while the tip is in it. */
    suctionRate: 7,
    /** Blood-layer rise per mL collected in the corridor (mm/mL). */
    levelPerMl: 0.19,
    /** Bipolar reach: bleed points this close to the tips are coagulated (mm). */
    bipolarReach: 2.2,
  },

  /** Flow model. */
  flow: {
    /** Flow that still reaches territory beyond a blocked ICA via collaterals (fraction). */
    collateral: 0.2,
    /** PCom flow when the ICA is blocked below its origin (it fills backwards from the PCA). */
    pcomRetrograde: 0.7,
    /** After clipping, the dome counts as "silent" on Doppler below this flow. */
    silentBelow: 0.1,
    /** A vessel counts as "flowing" on Doppler above this flow. */
    flowingAbove: 0.5,
  },

  /** ICG videoangiography timing (s). */
  icg: {
    /** Bolus arrival in the ICA after injection. */
    arrival: 0.8,
    /** Time for dye to travel the length of a vessel at normal flow. */
    transit: 1.1,
    /** How long the fluorescence view stays on. */
    duration: 16,
  },

  /** Physiology (anaesthetised adult, ~5 L blood volume). */
  physiology: {
    bloodVolume: 5000,
    baseline: { hr: 68, sbp: 118, dbp: 68, spo2: 99 },
    /** Seconds of temporary ICA occlusion before MEPs start to fall, and until they reach the floor. */
    mepSafeOcclusion: 120,
    mepFloorAt: 420,
    mepFloor: 35,
    /** Alarm limits. A MEP amplitude fall of more than 50 % is the usual warning criterion. */
    alarms: { mapLow: 60, hrHigh: 110, spo2Low: 92, mepLow: 50 },
    /** Temporary occlusion timer colour changes (s). */
    occlusionCaution: 180,
    occlusionDanger: 300,
  },
} as const;
