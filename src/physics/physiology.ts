import { sim } from '../config/sim';
import { events } from '../core/events';

type AlarmId = 'mapLow' | 'hrHigh' | 'spo2Low' | 'mepLow';

export interface PhysiologyInputs {
  /** Estimated blood loss so far (mL). */
  ebl: number;
  /** Current bleeding rate (mL/s). */
  bleedRate: number;
  /** Seconds the current temporary ICA occlusion has lasted (0 if none). */
  occlusionSeconds: number;
  /** 0..1 ischaemia of eloquent perforator territory (e.g. AChA occluded by a clip, from M5). */
  perforatorIschemia: number;
}

/** Standard normal random number (Box–Muller). */
function gauss(): number {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A deliberately simple physiology model for teaching, not a clinical simulator.
 *
 *  - Blood loss: small losses are compensated (heart rate rises first); beyond ~15 % of
 *    blood volume, blood pressure falls. A fast bleed also causes an acute dip.
 *  - SpO2 stays high unless perfusion collapses.
 *  - MEP (motor evoked potential amplitude, % of baseline): temporary ICA occlusion is
 *    usually tolerated for a few minutes; after that, MEPs fall — a warning of ischaemia.
 *    Hypotension and perforator (e.g. AChA) occlusion also lower them.
 * Values drift with small random fluctuations and a respiratory swing, like a real monitor.
 */
export class Physiology {
  private readonly b = sim.physiology.baseline;
  hr: number = this.b.hr;
  sbp: number = this.b.sbp;
  dbp: number = this.b.dbp;
  spo2: number = this.b.spo2;
  mep = 100;

  private noise = { hr: 0, bp: 0, spo2: 0, mep: 0 };
  private t = 0;
  private readonly alarms = new Map<AlarmId, boolean>();
  /** Set false in tests for deterministic values. */
  noisy = true;

  get map(): number {
    return this.dbp + (this.sbp - this.dbp) / 3;
  }

  /** Target values the vitals drift toward, given the current inputs. */
  targets(inp: PhysiologyInputs) {
    const p = sim.physiology;
    const loss = inp.ebl / p.bloodVolume;
    const hypovolaemia = Math.max(0, loss - 0.04);
    const acute = Math.min(1, inp.bleedRate / 4);
    const sbp = Math.max(50, this.b.sbp * (1 - 1.5 * hypovolaemia) - 16 * acute);
    const dbp = Math.max(25, this.b.dbp * (1 - 1.3 * hypovolaemia) - 9 * acute);
    const hr = Math.min(160, this.b.hr + 260 * Math.max(0, loss - 0.02) + 24 * acute);
    const map = dbp + (sbp - dbp) / 3;
    const spo2 = Math.max(80, this.b.spo2 - Math.max(0, 58 - map) * 0.4);

    const occlusionEffect = smoothstep(p.mepSafeOcclusion, p.mepFloorAt, inp.occlusionSeconds);
    let mep = 100 - (100 - p.mepFloor) * occlusionEffect;
    if (map < 60) mep -= (60 - map) * 1.3;
    mep = Math.min(mep, 100 - 75 * inp.perforatorIschemia);
    return { sbp, dbp, hr, spo2, mep: Math.max(5, mep) };
  }

  update(dt: number, inp: PhysiologyInputs): void {
    this.t += dt;
    const tgt = this.targets(inp);
    const ease = (cur: number, target: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

    // Ornstein–Uhlenbeck noise: slow, bounded wandering around the target.
    const ou = (x: number, tau: number, sigma: number) => (this.noisy ? x - (x / tau) * dt + sigma * Math.sqrt(dt) * gauss() : 0);
    this.noise.hr = ou(this.noise.hr, 12, 0.6);
    this.noise.bp = ou(this.noise.bp, 15, 0.8);
    this.noise.spo2 = ou(this.noise.spo2, 20, 0.12);
    this.noise.mep = ou(this.noise.mep, 6, 1.6);
    // Ventilation (12/min) makes arterial pressure swing slightly.
    const resp = this.noisy ? 2 * Math.sin((this.t * 2 * Math.PI * 12) / 60) : 0;

    this.sbp = ease(this.sbp, tgt.sbp + this.noise.bp + resp, 5);
    this.dbp = ease(this.dbp, tgt.dbp + this.noise.bp * 0.6 + resp * 0.5, 5);
    this.hr = ease(this.hr, tgt.hr + this.noise.hr, 7);
    this.spo2 = Math.min(100, ease(this.spo2, tgt.spo2 + this.noise.spo2, 10));
    // MEPs fall over seconds once ischaemic, and recover more slowly after reperfusion.
    this.mep = Math.max(0, ease(this.mep, tgt.mep + this.noise.mep, tgt.mep < this.mep ? 8 : 25));

    this.checkAlarms();
  }

  private checkAlarms(): void {
    const a = sim.physiology.alarms;
    const now: Record<AlarmId, boolean> = {
      mapLow: this.map < a.mapLow,
      hrHigh: this.hr > a.hrHigh,
      spo2Low: this.spo2 < a.spo2Low,
      mepLow: this.mep < a.mepLow,
    };
    for (const id of Object.keys(now) as AlarmId[]) {
      if ((this.alarms.get(id) ?? false) !== now[id]) {
        this.alarms.set(id, now[id]);
        events.emit('alarm', { id, active: now[id] });
      }
    }
  }

  isAlarm(id: AlarmId): boolean {
    return this.alarms.get(id) ?? false;
  }

  get anyAlarm(): boolean {
    return [...this.alarms.values()].some(Boolean);
  }
}
