import {
  Color,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  ShaderMaterial,
} from 'three';
import type { Anatomy } from '../anatomy';
import type { VesselId } from '../config/anatomy';
import { anatomy as cfg } from '../config/anatomy';
import { sim } from '../config/sim';
import type { StructureId } from '../core/events';

/**
 * ICG videoangiography.
 *
 * Indocyanine green is injected intravenously; the microscope's near-infrared camera shows
 * it arriving in the arteries within seconds. In a grey-scale image, vessels with flow
 * light up in order — ICA, then its branches — while occluded vessels stay dark. After a
 * good clip the PCom and anterior choroidal artery fill but the aneurysm does not.
 */

/** When the dye front enters each vessel (s after injection), at normal flow. */
function schedule(): Record<VesselId, { start: number }> {
  const { arrival: a, transit: t } = sim.icg;
  const branchT = (v: 'pcom' | 'acha') => cfg.vessels[v].branchOf!.t;
  return {
    ica: { start: a },
    pcom: { start: a + t * branchT('pcom') },
    acha: { start: a + t * branchT('acha') },
    m1: { start: a + t },
    a1: { start: a + t },
    m2Superior: { start: a + 2 * t },
    m2Inferior: { start: a + 2 * t },
  };
}

const vesselShader = {
  vertexShader: /* glsl */ `
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vAlong = uv.x;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uFront;   // how far along the vessel the dye has reached (0..1+)
    uniform float uBright;  // brightness from flow
    uniform float uFade;    // global fade in/out
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float filled = 1.0 - smoothstep(uFront - 0.06, uFront, vAlong);
      // Fluorescence is brightest where the vessel is seen face-on (more dye in the path).
      float facing = 0.55 + 0.45 * max(dot(vNormal, vView), 0.0);
      float v = 0.1 + filled * uBright * facing * 1.6;
      gl_FragColor = vec4(vec3(v) * uFade + vec3(0.1) * (1.0 - uFade), 1.0);
    }`,
};

export class IcgView {
  active = false;
  /** Seconds since injection. */
  t = 0;
  private readonly saved = new Map<Mesh, Material | Material[]>();
  private readonly hidden: Object3D[] = [];
  private readonly vesselMats = new Map<VesselId, ShaderMaterial>();
  private sacMat = new MeshBasicMaterial({ color: new Color('#181818') });
  private flows: Partial<Record<StructureId, number>> = {};
  private readonly timing = schedule();

  constructor(
    private readonly anatomy: Anatomy,
    private readonly extraHidden: () => Object3D[],
    private readonly onToggle: (on: boolean) => void,
  ) {}

  /** Inject ICG with the flow state at this moment. */
  start(flows: Partial<Record<StructureId, number>>): void {
    this.flows = { ...flows };
    this.t = 0;
    if (!this.active) this.enter();
  }

  private enter(): void {
    this.active = true;
    const tissue = new MeshLambertMaterial({ color: new Color('#2a2a2a') });
    this.anatomy.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const s = o.userData.structure as StructureId | undefined;
      // Membranes, fluid, labels and invisible proxies don't show in near-infrared.
      if (s === 'arachnoid' || s === 'csf' || s === 'adhesion' || !o.visible) {
        if (o.visible && (s === 'arachnoid' || s === 'csf')) {
          o.visible = false;
          this.hidden.push(o);
        }
        return;
      }
      this.saved.set(o, o.material);
      const vessel = this.anatomy.vessels.get(o.name as VesselId) === o ? (o.name as VesselId) : null;
      if (vessel) {
        const m = new ShaderMaterial({
          uniforms: { uFront: { value: 0 }, uBright: { value: 0 }, uFade: { value: 1 } },
          ...vesselShader,
        });
        this.vesselMats.set(vessel, m);
        o.material = m;
      } else if (s === 'aneurysm' || s === 'bleb') {
        o.material = this.sacMat;
      } else if (s === 'clip' || s === 'tempClip' || s === 'spatula') {
        o.material = new MeshBasicMaterial({ color: new Color('#050505') });
      } else if (s && ['ica', 'm1', 'a1'].includes(s)) {
        // Bifurcation blobs: follow the parent vessel's brightness.
        o.material = new MeshBasicMaterial({ color: new Color('#161616') });
        o.userData.icgFollow = s;
      } else {
        o.material = tissue;
      }
    });
    for (const o of this.extraHidden()) {
      if (o.visible) {
        o.visible = false;
        this.hidden.push(o);
      }
    }
    this.onToggle(true);
  }

  private exit(): void {
    for (const [mesh, mat] of this.saved) mesh.material = mat;
    this.saved.clear();
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    this.vesselMats.clear();
    this.active = false;
    this.onToggle(false);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const { duration, transit } = sim.icg;
    const fade = Math.min(1, this.t / 0.4) * Math.min(1, Math.max(0, (duration - this.t) / 1.5));

    for (const [id, mat] of this.vesselMats) {
      const f = this.flows[id] ?? 0;
      const u = mat.uniforms;
      // Weak flow arrives late and fills slowly and faintly; no flow never fills.
      const arrives = this.timing[id].start / Math.max(f, 0.3);
      u.uFront.value = f < 0.05 ? 0 : Math.max(0, (this.t - arrives) / (transit / f));
      u.uBright.value = Math.sqrt(f);
      u.uFade.value = fade;
    }
    // The sac fills slowly (swirling flow) after the dye passes the neck.
    const sacFlow = this.flows.aneurysm ?? 0;
    const neckArrival = sim.icg.arrival + transit * cfg.aneurysm.icaT;
    const sacFill = sacFlow < 0.05 ? 0 : Math.min(1, Math.max(0, (this.t - neckArrival) / (1.8 / sacFlow)));
    const v = 0.09 + sacFill * Math.sqrt(sacFlow) * 0.85;
    this.sacMat.color.setScalar(v * fade + 0.1 * (1 - fade));
    // Blobs at the bifurcations track their vessel.
    for (const mesh of this.saved.keys()) {
      const follow = mesh.userData.icgFollow as VesselId | undefined;
      if (!follow) continue;
      const m = this.vesselMats.get(follow);
      const lit = m && m.uniforms.uFront.value >= 1 ? 0.1 + Math.sqrt(this.flows[follow] ?? 0) * 1.3 : 0.09;
      (mesh.material as MeshBasicMaterial).color.setScalar(Math.min(1, lit) * fade + 0.1 * (1 - fade));
    }

    if (this.t >= duration) this.exit();
  }
}
