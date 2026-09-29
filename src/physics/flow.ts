import type { CatmullRomCurve3, Vector3 } from 'three';
import type { AneurysmHandle } from '../anatomy/aneurysm';
import { anatomy, type VesselId, type VesselSpec } from '../config/anatomy';
import { sim } from '../config/sim';
import type { StructureId } from '../core/events';
import { closestT, evaluateNeck, vesselPinch, type ClipGeometry, type NeckGeometry } from './clipEvaluation';

export interface ClipAssessment {
  /** 0..1 of the neck closed (all permanent clips combined). */
  neckClosure: number;
  /** Neck left below the clip blades (mm), if the neck is at least half closed. */
  residualNeck: number;
  /** Narrowing of the ICA lumen by permanent clips, 0..1. */
  icaStenosis: number;
  /** How much each branch is pinched by permanent clips, 0..1 (≥ ~0.5 = occluded). */
  pcomPinch: number;
  achaPinch: number;
}

export interface FlowState extends ClipAssessment {
  /** Temporary clip occlusion of the ICA (0..1) and where it sits along the ICA (t). */
  tempOcclusion: number;
  tempT: number | null;
  /** Relative flow 0..1 in each structure (1 = normal). */
  flow: Partial<Record<StructureId, number>>;
  /** 0..1 ischaemia of eloquent perforator territory (drives MEPs). */
  perforatorIschemia: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Blood flow through the vessel tree, derived from where the clips are.
 *
 *   ICA ──┬── PCom (origin t≈0.4, posterior wall)
 *         ├── aneurysm neck (t≈0.6)
 *         ├── AChA (t≈0.8)
 *         └── bifurcation → M1 → M2s, A1
 *
 * A temporary clip on the ICA stops antegrade flow beyond it; collateral flow (via the PCom
 * from the posterior circulation, and the ACom) keeps a little flow going. A permanent clip
 * shuts the sac (if it closes the neck) and may narrow the ICA or catch a branch.
 * Doppler, ICG, bleeding from a rupture and MEPs all read this one model.
 */
export class FlowModel {
  private readonly neck: NeckGeometry;
  private readonly vessels: Record<'ica' | 'pcom' | 'acha', { curve: CatmullRomCurve3; radius: [number, number] }>;
  private readonly pcomOriginT = anatomy.vessels.pcom.branchOf!.t;
  private cache: { key: string; state: FlowState } | null = null;

  constructor(curves: Map<VesselId, CatmullRomCurve3>, aneurysm: AneurysmHandle) {
    this.neck = {
      center: aneurysm.neckCenter,
      axis: aneurysm.axis,
      neckRadius: aneurysm.neckRadius,
      domeRadius: aneurysm.domeRadius,
      domeCenterHeight: aneurysm.domeCenter.distanceTo(aneurysm.neckCenter),
    };
    const v = anatomy.vessels as Record<VesselId, VesselSpec>;
    this.vessels = {
      ica: { curve: curves.get('ica')!, radius: v.ica.radius },
      pcom: { curve: curves.get('pcom')!, radius: v.pcom.radius },
      acha: { curve: curves.get('acha')!, radius: v.acha.radius },
    };
  }

  /** Evaluate the clips. Cached until any clip changes. */
  compute(clips: readonly ClipGeometry[], tempClips: readonly ClipGeometry[]): FlowState {
    const key = [...clips, ...tempClips]
      .map((c) => [c.kind, c.length, ...c.pose.position.toArray(), ...c.pose.bladeDir.toArray(), ...c.pose.closingDir.toArray()].map((x) => (typeof x === 'number' ? x.toFixed(3) : x)).join(','))
      .join('|');
    if (this.cache?.key === key) return this.cache.state;

    // Permanent clips.
    let open = 1;
    let residualNeck = 0;
    let bestHeight = Infinity;
    let icaStenosis = 0;
    let pcomPinch = 0;
    let achaPinch = 0;
    for (const c of clips) {
      const neck = evaluateNeck(c, this.neck);
      open *= 1 - neck.closure;
      if (neck.closure >= 0.5) bestHeight = Math.min(bestHeight, neck.height);
      icaStenosis = Math.max(icaStenosis, vesselPinch(c, this.vessels.ica));
      pcomPinch = Math.max(pcomPinch, vesselPinch(c, this.vessels.pcom, 0, 0.6));
      achaPinch = Math.max(achaPinch, vesselPinch(c, this.vessels.acha, 0, 0.6));
    }
    const neckClosure = 1 - open;
    // Blades placed well above the neck plane leave a remnant of neck below them.
    if (Number.isFinite(bestHeight)) residualNeck = Math.max(0, bestHeight - 1.2);

    // Temporary clip(s) on the ICA.
    let tempOcclusion = 0;
    let tempT: number | null = null;
    for (const c of tempClips) {
      const occ = vesselPinch(c, this.vessels.ica);
      if (occ > tempOcclusion) {
        tempOcclusion = occ;
        tempT = closestT(this.vessels.ica.curve, c.pose.position);
      }
    }

    const collateral = sim.flow.collateral;
    const tempBlock = smooth(0.25, 0.6, tempOcclusion);
    // A stenosis matters haemodynamically beyond ~50 % diameter.
    const stenosisFactor = 1 - smooth(0.5, 0.95, icaStenosis);
    // Antegrade flow reaching the PCom origin and beyond it.
    const proximalToPcom = tempT !== null && tempT < this.pcomOriginT ? 1 - tempBlock : 1;
    const beyondTemp = 1 - tempBlock;
    const antegrade = beyondTemp * stenosisFactor;
    const icaDistal = antegrade + (1 - antegrade) * collateral;
    const pcomOcc = smooth(0.3, 0.6, pcomPinch);
    const achaOcc = smooth(0.3, 0.6, achaPinch);
    // With the ICA blocked below it, the PCom fills backwards from the posterior circulation.
    const pcomFlow = (1 - pcomOcc) * (proximalToPcom + (1 - proximalToPcom) * sim.flow.pcomRetrograde);
    const sac = (1 - neckClosure) * (beyondTemp + (1 - beyondTemp) * collateral);

    const flow: FlowState['flow'] = {
      ica: icaDistal,
      pcom: pcomFlow,
      acha: (1 - achaOcc) * icaDistal,
      m1: icaDistal,
      m2Superior: icaDistal,
      m2Inferior: icaDistal,
      a1: icaDistal,
      aneurysm: sac,
      bleb: sac,
    };
    const perforatorIschemia = Math.max(achaOcc, 0.35 * pcomOcc, smooth(0.7, 1, icaStenosis) * 0.8);

    const state: FlowState = {
      neckClosure,
      residualNeck,
      icaStenosis,
      pcomPinch,
      achaPinch,
      tempOcclusion,
      tempT,
      flow,
      perforatorIschemia,
    };
    this.cache = { key, state };
    return state;
  }

  /**
   * Flow heard at a specific point. On the ICA, the probe hears full flow proximal to a
   * temporary clip and reduced flow beyond it.
   */
  flowAt(state: FlowState, s: StructureId, point?: Vector3): number {
    if (s === 'ica' && point && state.tempT !== null) {
      const t = closestT(this.vessels.ica.curve, point, 80);
      if (t < state.tempT) return 1;
    }
    return state.flow[s] ?? 0;
  }
}
