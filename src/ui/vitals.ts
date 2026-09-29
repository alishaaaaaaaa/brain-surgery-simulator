import { sim } from '../config/sim';
import { formatTime } from '../core/clock';
import { events } from '../core/events';
import { pulseWaveform, type Heart } from '../core/heart';
import { state } from '../core/state';
import type { AudioEngine } from '../audio/engine';
import type { Physiology } from '../physics/physiology';
import { h, tr } from './dom';
import { applyTranslations, t } from './i18n';

const g = (x: number, mu: number, s: number) => Math.exp(-(((x - mu) / s) ** 2));

/**
 * Lead II ECG as a function of the cardiac phase. The R wave comes ~0.15 cycle before the
 * arterial pulse upstroke (phase 0 of the pressure waveform), as on a real monitor.
 */
export function ecgWaveform(heartPhase: number): number {
  const u = (((heartPhase + 0.36) % 1) + 1) % 1;
  return 0.12 * g(u, 0.1, 0.025) - 0.12 * g(u, 0.19, 0.008) + 1.0 * g(u, 0.21, 0.009) - 0.25 * g(u, 0.232, 0.009) + 0.28 * g(u, 0.45, 0.045);
}

/** A sweeping trace like an OR monitor: the write head moves right, leaving a small gap. */
class Sweep {
  private readonly ctx: CanvasRenderingContext2D;
  private x = 0;
  private lastY: number | null = null;
  private readonly dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly color: string,
    private readonly map: (v: number) => number, // value → 0 (bottom) .. 1 (top)
    private readonly pxPerSecond = 46,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.x = 0;
    this.lastY = null;
  }

  /** Draw the samples collected over the last `dt` seconds. */
  push(dt: number, samples: number[]): void {
    const { ctx, canvas } = this;
    const w = canvas.width, hgt = canvas.height;
    const dx = (this.pxPerSecond * dt * this.dpr) / samples.length;
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.strokeStyle = this.color;
    ctx.lineJoin = 'round';
    for (const v of samples) {
      const nx = this.x + dx;
      const y = hgt - 2 * this.dpr - this.map(v) * (hgt - 4 * this.dpr);
      ctx.clearRect(nx, 0, 10 * this.dpr, hgt); // erase ahead of the write head
      if (this.lastY !== null && nx > this.x) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.lastY);
        ctx.lineTo(nx, y);
        ctx.stroke();
      }
      this.x = nx;
      this.lastY = y;
      if (this.x >= w) {
        this.x = 0;
        this.lastY = null;
      }
    }
  }
}

/**
 * Top-right vitals monitor: ECG and arterial traces, HR, ABP, SpO2, MEP, operation time,
 * temporary occlusion timer and estimated blood loss. Also sounds the pulse-oximeter beep
 * and alarms.
 */
export class VitalsPanel {
  private readonly el: HTMLElement;
  private readonly ecg: Sweep;
  private readonly art: Sweep;
  private readonly v: Record<'hr' | 'abp' | 'map' | 'spo2' | 'mep' | 'time' | 'occl' | 'ebl', HTMLElement>;
  private readonly boxes: Record<'hr' | 'abp' | 'spo2' | 'mep' | 'occl', HTMLElement>;
  private readonly alarmLine: HTMLElement;
  private lastPhase = 0;
  private numTimer = 0;
  private alarmTimer = 0;

  constructor(
    root: HTMLElement,
    private readonly phys: Physiology,
    private readonly heart: Heart,
    private readonly audio: AudioEngine,
    private readonly elapsed: () => number,
  ) {
    const num = (cls: string, key: Parameters<typeof tr>[1], ...extra: HTMLElement[]) => {
      const value = h('span', { class: 'v mono' }, '--');
      const box = h('div', { class: `num ${cls}` }, tr('span', key, { class: 'k' }), value, ...extra);
      return { box, value };
    };
    const ecgCanvas = h('canvas', { class: 'trace ecg', 'aria-hidden': 'true' });
    const artCanvas = h('canvas', { class: 'trace art', 'aria-hidden': 'true' });
    const hr = num('hr', 'vitals.hr');
    const mapEl = h('span', { class: 'sub mono' });
    const abp = num('abp', 'vitals.abp', mapEl);
    const spo2 = num('spo2', 'vitals.spo2');
    const mep = num('mep', 'vitals.mep');
    const time = num('time', 'vitals.time');
    const occl = num('occl', 'vitals.occlusion');
    const ebl = num('ebl', 'vitals.ebl');
    this.alarmLine = h('div', { class: 'alarm-line mono' });

    this.el = h(
      'section',
      { class: 'vitals panel', 'aria-label': 'Vital signs' },
      h('div', { class: 'row' }, ecgCanvas, hr.box),
      h('div', { class: 'row' }, artCanvas, abp.box),
      h('div', { class: 'grid2' }, spo2.box, mep.box),
      h('div', { class: 'grid3' }, time.box, occl.box, ebl.box),
      this.alarmLine,
    );
    root.append(this.el);
    applyTranslations(this.el);

    this.v = { hr: hr.value, abp: abp.value, map: mapEl, spo2: spo2.value, mep: mep.value, time: time.value, occl: occl.value, ebl: ebl.value };
    this.boxes = { hr: hr.box, abp: abp.box, spo2: spo2.box, mep: mep.box, occl: occl.box };

    this.ecg = new Sweep(ecgCanvas, '#57e38c', (v) => (v + 0.35) / 1.5);
    this.art = new Sweep(artCanvas, '#ff6b6b', (p) => (p - 30) / 140);
    window.addEventListener('resize', () => {
      this.ecg.resize();
      this.art.resize();
    });

    events.on('heartbeat', () => {
      this.boxes.hr.classList.remove('beat');
      void this.boxes.hr.offsetWidth; // restart the CSS animation
      this.boxes.hr.classList.add('beat');
      this.audio.pulseBeep(this.phys.spo2);
    });
    events.on('languageChanged', () => this.refreshNumbers());
  }

  update(dt: number): void {
    // Sample the waveforms at several points between frames so narrow QRS spikes are not missed.
    const phase = this.heart.phase;
    let span = phase - this.lastPhase;
    if (span < 0) span += 1;
    const n = Math.max(2, Math.ceil(dt * 240));
    const ecg: number[] = [];
    const art: number[] = [];
    for (let i = 1; i <= n; i++) {
      const ph = this.lastPhase + (span * i) / n;
      ecg.push(ecgWaveform(ph));
      art.push(this.phys.dbp + (this.phys.sbp - this.phys.dbp) * pulseWaveform(ph));
    }
    this.lastPhase = phase;
    this.ecg.push(dt, ecg);
    this.art.push(dt, art);

    this.numTimer -= dt;
    if (this.numTimer <= 0) {
      this.numTimer = 0.25;
      this.refreshNumbers();
    }

    // Alarms repeat while active: high priority for hypotension/desaturation.
    this.alarmTimer -= dt;
    if (this.alarmTimer <= 0) {
      const high = this.phys.isAlarm('mapLow') || this.phys.isAlarm('spo2Low');
      const medium = this.phys.isAlarm('mepLow') || this.phys.isAlarm('hrHigh');
      if (high) this.audio.alarm('high');
      else if (medium) this.audio.alarm('medium');
      this.alarmTimer = high ? 3 : 6;
    }
  }

  private refreshNumbers(): void {
    const p = this.phys;
    this.v.hr.textContent = String(Math.round(p.hr));
    this.v.abp.textContent = `${Math.round(p.sbp)}/${Math.round(p.dbp)}`;
    this.v.map.textContent = `(${Math.round(p.map)})`;
    this.v.spo2.textContent = String(Math.round(p.spo2));
    this.v.mep.textContent = `${Math.round(p.mep)}%`;
    this.v.time.textContent = formatTime(this.elapsed());
    const o = state.tempOcclusion;
    this.v.occl.textContent = o.active ? formatTime(o.current) : o.total > 0 ? `Σ ${formatTime(o.total)}` : '--:--';
    this.v.ebl.textContent = `${Math.round(state.ebl)} mL`;

    this.boxes.abp.classList.toggle('is-alarm', p.isAlarm('mapLow'));
    this.boxes.hr.classList.toggle('is-alarm', p.isAlarm('hrHigh'));
    this.boxes.spo2.classList.toggle('is-alarm', p.isAlarm('spo2Low'));
    this.boxes.mep.classList.toggle('is-alarm', p.isAlarm('mepLow'));
    const ph = sim.physiology;
    this.boxes.occl.classList.toggle('is-active', o.active);
    this.boxes.occl.classList.toggle('is-caution', o.active && o.current >= ph.occlusionCaution && o.current < ph.occlusionDanger);
    this.boxes.occl.classList.toggle('is-alarm', o.active && o.current >= ph.occlusionDanger);

    const active = (['mapLow', 'spo2Low', 'mepLow', 'hrHigh'] as const).filter((id) => p.isAlarm(id));
    this.alarmLine.textContent = active.length ? active.map((id) => t(`vitals.${id}`)).join(' · ') : t('vitals.ok');
    this.alarmLine.classList.toggle('is-alarm', active.length > 0);
  }
}
