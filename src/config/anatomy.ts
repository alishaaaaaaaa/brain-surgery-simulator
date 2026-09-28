/**
 * ANATOMY CONFIGURATION — the single place to tune sizes, positions and colours.
 *
 * Units: millimetres. 1 scene unit = 1 mm.
 *
 * Coordinate frame: a simplified "surgeon's screen frame" for a RIGHT pterional approach.
 *   +x = lateral, screen-right (along the sylvian fissure, toward M2 / the insula)
 *   -x = medial, screen-left   (toward the optic nerve, chiasm and midline)
 *   +y = screen-up, toward the frontal lobe
 *   -y = screen-down, toward the temporal lobe (and, deeper, posterior structures)
 *   +z = superficial (toward the microscope)   -z = deep (toward the skull base)
 *
 * The real microscope axis is oblique (from lateral, anterior and superior), so each
 * screen direction mixes several anatomical directions. This frame keeps the layout close
 * to what the surgeon actually sees and easy to tune. It is a teaching model, not a
 * patient-derived reconstruction.
 *
 * What you see in the default view:
 *   - Frontal lobe at the top of the screen, temporal lobe at the bottom, the opened
 *     sylvian fissure running left–right between them.
 *   - Deep in the corridor (~30–48 mm): the internal carotid artery (ICA) rising from the
 *     lower deep field to its bifurcation into M1 (running right) and A1 (running left over
 *     the optic nerve). The optic nerve lies medial (left) of the ICA.
 *   - The IC-PC aneurysm pokes out laterally from behind the ICA, below M1, pointing
 *     posterolaterally and down toward the oculomotor nerve (CN III) and the temporal lobe.
 */

export type Vec3 = readonly [number, number, number];

export interface VesselSpec {
  /** Centreline control points (Catmull-Rom spline). */
  points: Vec3[];
  /** Radius at the first and last control point; the tube tapers linearly. */
  radius: [number, number];
  /**
   * Optional: the vessel branches from a parent vessel. The branch starts on the
   * parent's centreline at parameter `t` (0 = start, 1 = end) and then follows `points`.
   */
  branchOf?: { vessel: VesselId; t: number };
}

export type VesselId = 'ica' | 'm1' | 'm2Superior' | 'm2Inferior' | 'a1' | 'pcom' | 'acha';
export type NerveId = 'opticNerve' | 'oculomotorNerve';

export interface NerveSpec {
  points: Vec3[];
  radius: number;
  /** Cross-section flattening (1 = round). The optic nerve is a flattened band. */
  flatten: number;
}

export const anatomy = {
  /**
   * Brain surface and the opened sylvian fissure.
   * The fissure is modelled as a corridor running along x, centred at `corridorCenterY`.
   * Its walls are the frontal operculum (top, +y) and the temporal operculum (bottom, -y).
   */
  brain: {
    corridorCenterY: -2,
    /** Half-width of the corridor at the rim (brain surface) — how far the spatulas hold it open. */
    rimHalfWidth: 30,
    /** Half-width of the corridor floor (basal cisterns). */
    floorHalfWidth: 19,
    /** Depth of the corridor floor below the cortical surface. */
    floorDepth: 50,
    /** Half-length of the modelled region along x. */
    extentX: 75,
    /** How far the cortex extends beyond the rim (y direction). */
    outerExtent: 80,
    /** Gyral relief (bump height in mm) and noise frequency. */
    gyrusAmplitude: 2.0,
    gyrusFrequency: 0.075,
    /** Depth of sulcal creases between gyri. */
    sulcusDepth: 1.6,
    colors: {
      cortex: '#d9a095',
      sulcus: '#7a3b36',
      pialArtery: '#b8323a',
      /** The superficial sylvian vein runs along the fissure rim — typically preserved. */
      sylvianVein: '#4b3a6b',
      floor: '#3d1d1b',
    },
    /** Subtle brain pulsation amplitude (mm) — transmitted from arterial pulsation. */
    pulseAmplitude: 0.12,
  },

  /**
   * Arteries. Radii are in mm (diameter = 2 × radius).
   * Typical adult diameters: supraclinoid ICA ~4 mm, M1 ~3 mm, A1 ~2 mm,
   * PCom ~1–1.5 mm, anterior choroidal ~0.8–1 mm.
   */
  vessels: {
    /**
     * Supraclinoid internal carotid artery. Emerges from the dural ring next to the anterior
     * clinoid process (deep) and ascends to its terminal bifurcation into M1 and A1.
     * The PCom and the anterior choroidal artery arise from its posterior (deep) wall.
     */
    ica: {
      points: [
        [-4, -17, -52],
        [-3, -10.5, -44.5],
        [-1.6, -4.5, -38.5],
        [0, 1, -33.5],
        [1, 4, -31],
      ],
      radius: [2.0, 1.8],
    },
    /**
     * M1 (sphenoidal segment of the middle cerebral artery): runs laterally along the
     * sylvian fissure from the ICA bifurcation. Following M1 medially is the classic way
     * to reach the ICA in the transsylvian approach.
     */
    m1: {
      points: [
        [1, 4, -31],
        [7, 5, -29.5],
        [14, 5.5, -27.5],
        [21, 5, -24.5],
      ],
      radius: [1.5, 1.3],
    },
    /** Superior M2 trunk — climbs along the frontal (insular) side. */
    m2Superior: {
      points: [
        [21, 5, -24.5],
        [26, 9, -20],
        [32, 12, -16],
        [42, 14, -13],
      ],
      radius: [1.05, 0.85],
    },
    /** Inferior M2 trunk — climbs along the temporal side. */
    m2Inferior: {
      points: [
        [21, 5, -24.5],
        [27, 0, -21],
        [33, -5, -17],
        [43, -9, -14],
      ],
      radius: [1.0, 0.8],
    },
    /**
     * A1 (precommunicating anterior cerebral artery): runs medially and anteriorly
     * above the optic nerve / chiasm toward the anterior communicating artery.
     */
    a1: {
      points: [
        [1, 4, -31],
        [-4, 7, -30.5],
        [-10, 10, -31],
        [-17, 13, -33],
        [-26, 15, -35],
      ],
      radius: [1.1, 0.95],
    },
    /**
     * Posterior communicating artery: arises from the POSTERIOR (deep) wall of the ICA and
     * runs posteromedially, deep and under the temporal side, toward the posterior cerebral
     * artery. It is best seen lateral to the ICA, in the carotid–oculomotor window.
     * Its origin is the "PC" in "IC-PC aneurysm". It must stay patent after clipping — it often supplies perforators
     * to the thalamus and internal capsule.
     */
    pcom: {
      points: [
        [-0.5, -11, -46],
        [-4, -17, -47.2],
        [-8, -24, -47.8],
        [-12, -31, -48.2],
      ],
      radius: [0.7, 0.55],
      branchOf: { vessel: 'ica', t: 0.4 },
    },
    /**
     * Anterior choroidal artery: arises a few mm DISTAL to the PCom and runs
     * posterolaterally. Small but eloquent (internal capsule) — occluding it with a
     * clip blade can cause hemiplegia. It often lies close to the aneurysm dome.
     */
    acha: {
      points: [
        [4.5, -2, -37],
        [8.5, -8, -40.5],
        [11, -16, -43],
        [13, -25, -44.5],
      ],
      radius: [0.45, 0.35],
      branchOf: { vessel: 'ica', t: 0.8 },
    },
  } satisfies Record<VesselId, VesselSpec>,

  nerves: {
    /**
     * Optic nerve (CN II): medial to the ICA, running from the optic canal toward the
     * chiasm, passing under A1. Identifying it together with the ICA is stage 3.
     */
    opticNerve: {
      points: [
        [-7, -15, -43],
        [-9, -5, -40],
        [-12, 5, -38.5],
        [-17, 17, -39.5],
      ],
      radius: 2.3,
      flatten: 0.65,
    },
    /**
     * Oculomotor nerve (CN III): deep and posterolateral, running forward to the
     * cavernous sinus. A posterolaterally-pointing IC-PC aneurysm can compress it
     * (a classic presentation: pupil-involving third-nerve palsy).
     */
    oculomotorNerve: {
      points: [
        [-6, -31, -48],
        [1, -22, -47.5],
        [6, -13, -47.3],
        [11, -3, -47.8],
      ],
      radius: 1.1,
      flatten: 0.9,
    },
  } satisfies Record<NerveId, NerveSpec>,

  /**
   * The IC-PC aneurysm: arises at the distal corner of the PCom origin on the ICA,
   * projecting posterolaterally and inferiorly (toward CN III and the tentorium).
   */
  aneurysm: {
    /** Maximum dome diameter (mm). */
    domeDiameter: 6.6,
    /** Neck diameter (mm). A dome-to-neck ratio > ~1.5 favours clipping. */
    neckDiameter: 4.0,
    /** Where on the ICA centreline the neck sits (just distal to the PCom origin at t = 0.4). */
    icaT: 0.6,
    /**
     * Projection direction: posterolateral and inferior — in the screen frame that is
     * lateral (+x), toward the temporal side (-y) and deep (-z). Normalised in code.
     */
    direction: [0.72, -0.42, -0.42] as Vec3,
    /** How far the neck plane sits from the ICA centreline, as a fraction of ICA radius. */
    neckOffset: 0.8,
    /** Surface irregularity (mm) — real domes are rarely perfect spheres. */
    irregularity: 0.18,
    /** Small daughter sac (bleb) on the dome: a thin-walled weak point, likely rupture site. */
    bleb: {
      radius: 0.95,
      /** Angle (degrees) from the dome apex toward the lateral side. */
      angleFromApex: 38,
    },
    colors: {
      wall: '#d4696a',
      thinWall: '#e9918a',
      atheroma: '#e8d3a8',
      bleb: '#b52f35',
    },
    /** Pulsation amplitude as a fraction of radius — domes pulsate visibly. */
    pulseFraction: 0.045,
  },

  /** Colours and pulsation of arteries/nerves. */
  tissue: {
    arteryColor: '#c7474b',
    arteryPulseFraction: 0.03,
    nerveColor: '#eadfc4',
  },

  /**
   * Arachnoid membranes spanning the fissure at several depths. Each sheet is split into
   * segments along x; each segment is cut individually with the scissors.
   *   - superficial: the sylvian arachnoid
   *   - middle: deeper sylvian / insular cistern trabeculae
   *   - deep: carotid and chiasmatic cistern membranes over the ICA and optic nerve
   */
  arachnoid: {
    sheets: [
      { id: 'superficial', z: -8, xFrom: -34, xTo: 48, segments: 6, sag: 2.0 },
      { id: 'middle', z: -18, xFrom: -28, xTo: 22, segments: 4, sag: 1.4 },
      { id: 'deep', z: -25, xFrom: -26, xTo: 8, segments: 3, sag: 0.8 },
    ],
    opacity: 0.5,
    color: '#f1ebe4',
  },

  /**
   * Arachnoid/fibrous adhesions around the aneurysm, freed with the dissector (stage 4).
   *
   * `from` is a point on the aneurysm: `around` is the angle (degrees) around the
   * aneurysm axis, where 0° = distal side of the neck (toward the AChA / bifurcation) and
   * 180° = proximal side (toward the PCom origin); `height` is mm above the neck plane.
   * `to` is a point on a named vessel or nerve (t along its centreline, or 'nearest').
   *
   *  - kind 'neck': must be freed so the clip blades can pass around the neck. Freeing
   *    both sides of the neck — proximal and distal — is the goal of stage 4.
   *  - kind 'dome': the dome is stuck to neighbouring structures. Leave these alone:
   *    dissecting the dome off them risks rupture. The clip does not need them freed.
   */
  adhesions: [
    // Proximal side: the PCom origin is stuck to the neck and must be separated from it.
    { id: 'neckPcom', kind: 'neck', from: { around: 140, height: 0.4 }, to: { curve: 'pcom', t: 0.25 } },
    { id: 'neckPcomOrigin', kind: 'neck', from: { around: 210, height: 0.35 }, to: { curve: 'pcom', t: 0.12 } },
    // Distal side: the anterior choroidal artery and the distal ICA wall.
    { id: 'neckAcha', kind: 'neck', from: { around: 0, height: 0.4 }, to: { curve: 'acha', t: 0.08 } },
    { id: 'neckIcaDistal', kind: 'neck', from: { around: 60, height: 0.3 }, to: { curve: 'ica', t: 0.72 } },
    { id: 'domeOculomotor', kind: 'dome', from: { around: 110, height: 4.6 }, to: { curve: 'oculomotorNerve', t: 'nearest' } },
    { id: 'domeAcha', kind: 'dome', from: { around: 20, height: 3.8 }, to: { curve: 'acha', t: 0.3 } },
  ] as const,

  /**
   * Cerebrospinal fluid pooling in the cisterns: suction clears it to improve the view.
   * (In M4 blood pools use the same mechanism.)
   */
  csfPools: [
    { x: -3, y: -8, z: -48.9, radius: 5.5 },
    { x: 9, y: -12, z: -48.9, radius: 4.5 },
    { x: -14, y: 2, z: -48.9, radius: 4 },
  ],

  /**
   * Brain spatulas (self-retaining retractor blades) resting on the frontal and temporal
   * opercula. Gentle retraction only — the fissure is opened by dissection, not by force.
   */
  spatulas: [
    { lobe: 'frontal', x: -8, width: 9, tipDepth: -24 },
    { lobe: 'temporal', x: 12, width: 9, tipDepth: -21 },
  ] as const,
} as const;

/** Microscope / camera defaults. */
export const microscope = {
  /** Point the microscope looks at (the carotid–aneurysm region). */
  target: [1, -3, -38] as Vec3,
  /** Direction from target toward the microscope (normalised in code). */
  viewAxis: [0.26, -0.18, 1] as Vec3,
  /** Working distance (mm). Real microscopes: 200–400 mm. */
  workingDistance: 250,
  /** Vertical field of view in degrees (zoom). Smaller = more magnification. */
  fov: 14,
  fovMin: 3.5,
  fovMax: 22,
  /** Maximum tilt of the microscope away from the default axis (degrees). */
  maxTilt: 24,
  /** Pan limits around the default target (mm). */
  panLimit: { x: 38, y: 24 },
  /** Light colour of the xenon/LED illumination (warm). */
  lightColor: '#fff0da',
} as const;
