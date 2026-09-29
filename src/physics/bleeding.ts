import {
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { anatomy } from '../config/anatomy';
import { sim } from '../config/sim';
import { events, type BleedKind } from '../core/events';
import { state } from '../core/state';

export interface BleedPoint {
  kind: BleedKind;
  position: Vector3;
  /** Outward direction of the jet / drip. */
  normal: Vector3;
  /** mL/s at full inflow. */
  rate: number;
  active: boolean;
  /** Stain on the tissue around the bleeding point. */
  stain: Mesh;
  age: number;
}

const MAX_PARTICLES = 900;
const GRAVITY = new Vector3(0, 0, -260); // "down" in the field is deep (mm/s²)

/**
 * Bleeding and the blood in the field.
 *
 *  - Bleed points: ooze (pial/small vessels, stopped with bipolar), arterial (an injured
 *    artery), and rupture (the aneurysm: only a clip across the neck stops it; a
 *    temporary clip on the ICA slows it).
 *  - Blood collects at the bottom of the corridor as a rising layer that hides the deep
 *    structures; suction removes it.
 *  - Particles show the spurting, pulsatile jet of arterial bleeding and the drip of ooze.
 */
export class Bleeding {
  readonly group = new Group();
  readonly points: BleedPoint[] = [];
  /** Horizontal blood layer filling the corridor from the floor up. */
  readonly layer: Mesh;

  private readonly particles: InstancedMesh;
  private readonly pPos = new Float32Array(MAX_PARTICLES * 3);
  private readonly pVel = new Float32Array(MAX_PARTICLES * 3);
  private readonly pLife = new Float32Array(MAX_PARTICLES);
  private nextParticle = 0;
  private spawnDebt = 0;
  private readonly stainMaterial = new MeshStandardMaterial({ color: new Color('#5c0a0c'), roughness: 0.25, transparent: true, opacity: 0.9 });
  private readonly m4 = new Matrix4();
  private readonly floorZ = -anatomy.brain.floorDepth;

  /** Total blood removed by suction (mL). */
  aspirated = 0;
  /**
   * Relative flow into the aneurysm sac and into the arteries, from the flow model.
   * A temporary ICA clip lowers both; a clip that closes the neck stops sac flow.
   */
  sacFlow = 1;
  arterialFlow = 1;

  constructor() {
    this.group.name = 'bleeding';
    this.layer = new Mesh(
      new PlaneGeometry(2 * anatomy.brain.extentX, 110, 1, 1),
      new MeshPhysicalMaterial({
        color: new Color('#4a0306'),
        // Not a perfect mirror: a large flat pool would otherwise reflect the coaxial light
        // as one huge glare spot.
        roughness: 0.3,
        clearcoat: 0.7,
        clearcoatRoughness: 0.22,
        transparent: true,
        opacity: 0,
      }),
    );
    this.layer.position.set(0, anatomy.brain.corridorCenterY, this.floorZ);
    this.layer.userData.structure = 'blood';
    this.layer.visible = false;
    this.layer.renderOrder = 3;

    this.particles = new InstancedMesh(
      new SphereGeometry(0.2, 6, 4),
      new MeshStandardMaterial({ color: new Color('#8e0b10'), roughness: 0.2, metalness: 0 }),
      MAX_PARTICLES,
    );
    this.particles.instanceMatrix.setUsage(DynamicDrawUsage);
    this.particles.frustumCulled = false;
    this.m4.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.setMatrixAt(i, this.m4);
    this.group.add(this.layer, this.particles);
  }

  /** Current level of the blood layer (z, mm). */
  get level(): number {
    return this.floorZ + state.fieldBlood * sim.bleeding.levelPerMl;
  }

  /** Total active bleeding right now (mL/s). */
  get currentRate(): number {
    return this.points.reduce((sum, p) => sum + this.effectiveRate(p), 0);
  }

  get activeCount(): number {
    return this.points.filter((p) => p.active).length;
  }

  private effectiveRate(p: BleedPoint): number {
    if (!p.active) return 0;
    // Arterial and rupture bleeding scale with the flow feeding them; ooze is venous/capillary.
    if (p.kind === 'ooze') return p.rate;
    return p.rate * (p.kind === 'rupture' ? this.sacFlow : this.arterialFlow);
  }

  start(kind: BleedKind, position: Vector3, normal: Vector3): BleedPoint {
    const rate = kind === 'rupture' ? sim.bleeding.ruptureRate : kind === 'arterial' ? sim.bleeding.arterialRate : sim.bleeding.oozeRate;
    const stain = new Mesh(new CircleGeometry(1, 20), this.stainMaterial);
    stain.position.copy(position).addScaledVector(normal, 0.05);
    stain.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal));
    stain.scale.setScalar(0.2);
    this.group.add(stain);
    const p: BleedPoint = { kind, position: position.clone(), normal: normal.clone().normalize(), rate, active: true, stain, age: 0 };
    this.points.push(p);
    events.emit('bleedStarted', { kind, point: p.position });
    return p;
  }

  /**
   * Bipolar near a bleeding point: stops ooze and arterial bleeding within reach.
   * Returns what happened, so the tool can give the right feedback.
   */
  coagulateNear(point: Vector3): 'stopped' | 'rupture' | 'none' {
    let result: 'stopped' | 'rupture' | 'none' = 'none';
    for (const p of this.points) {
      if (!p.active) continue;
      // Working in the blood layer, the bleeding point is found by position across the
      // field (it lies somewhere beneath the surface); otherwise use true 3D distance.
      const inBlood = state.fieldBlood > 0.4 && point.z <= this.level + 0.5;
      const d = inBlood ? Math.hypot(p.position.x - point.x, p.position.y - point.y) : p.position.distanceTo(point);
      if (d > sim.bleeding.bipolarReach) continue;
      if (p.kind === 'rupture') {
        result = 'rupture';
        continue;
      }
      this.stop(p, 'bipolar');
      result = 'stopped';
    }
    return result;
  }

  private stop(p: BleedPoint, by: 'bipolar' | 'clip'): void {
    p.active = false;
    const coagulated = this.stainMaterial.clone();
    coagulated.color.set('#3b1a12'); // coagulated, brown-black
    p.stain.material = coagulated;
    events.emit('bleedStopped', { kind: p.kind, by });
  }

  /** Suction at the tip: removes blood if the tip is in the layer. Returns mL removed. */
  aspirate(tip: Vector3, dt: number): number {
    if (state.fieldBlood <= 0 || tip.z > this.level + 1.5) return 0;
    const removed = Math.min(state.fieldBlood, sim.bleeding.suctionRate * dt);
    state.fieldBlood -= removed;
    this.aspirated += removed;
    return removed;
  }

  update(dt: number, pulse: number): void {
    // A clip that closes the neck (no more flow into the sac) secures a rupture.
    for (const p of this.points) {
      if (p.active && p.kind === 'rupture' && this.sacFlow < sim.flow.silentBelow) {
        this.stop(p, 'clip');
        state.ruptureSecured = true;
        events.emit('ruptureSecured');
      }
    }

    let spawnRate = 0;
    for (const p of this.points) {
      p.age += dt;
      const r = this.effectiveRate(p);
      if (r <= 0) continue;
      state.ebl += r * dt;
      state.fieldBlood += r * dt;
      // Stain spreads around the point up to a few mm.
      const target = p.kind === 'ooze' ? 1.2 : 2.2;
      p.stain.scale.setScalar(Math.min(target, 0.2 + p.age * 0.6));
      // Arterial bleeding spurts with each heartbeat; ooze wells up steadily.
      spawnRate += p.kind === 'ooze' ? 4 : r * 60 * (0.15 + 1.5 * pulse * pulse);
    }

    this.updateLayer();
    this.updateParticles(dt, spawnRate);
  }

  private updateLayer(): void {
    const v = state.fieldBlood;
    this.layer.visible = v > 0.4;
    this.layer.position.z = this.level;
    // A thin film is translucent; a deeper pool is opaque.
    (this.layer.material as MeshPhysicalMaterial).opacity = Math.min(0.97, 0.35 + v / 30);
    (this.layer.material as MeshPhysicalMaterial).depthWrite = v > 10;
  }

  private updateParticles(dt: number, spawnRate: number): void {
    // Spawn.
    this.spawnDebt += spawnRate * dt;
    const active = this.points.filter((p) => this.effectiveRate(p) > 0);
    while (this.spawnDebt >= 1 && active.length) {
      this.spawnDebt -= 1;
      const src = active[Math.floor(Math.random() * active.length)];
      const i = this.nextParticle;
      this.nextParticle = (i + 1) % MAX_PARTICLES;
      const speed = src.kind === 'ooze' ? 3 : 25 + 30 * Math.random() * (src.kind === 'rupture' ? this.sacFlow : this.arterialFlow);
      const jitter = src.kind === 'ooze' ? 0.8 : 0.35;
      const dir = src.normal
        .clone()
        .add(new Vector3((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter))
        .normalize();
      this.pPos.set([src.position.x, src.position.y, src.position.z], i * 3);
      this.pVel.set([dir.x * speed, dir.y * speed, dir.z * speed], i * 3);
      this.pLife[i] = src.kind === 'ooze' ? 1.4 : 1.1;
    }
    if (!active.length) this.spawnDebt = 0;

    // Integrate.
    const level = this.level;
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      any = true;
      this.pLife[i] -= dt;
      const k = i * 3;
      this.pVel[k] += GRAVITY.x * dt;
      this.pVel[k + 1] += GRAVITY.y * dt;
      this.pVel[k + 2] += GRAVITY.z * dt;
      this.pPos[k] += this.pVel[k] * dt;
      this.pPos[k + 1] += this.pVel[k + 1] * dt;
      this.pPos[k + 2] += this.pVel[k + 2] * dt;
      if (this.pPos[k + 2] < Math.max(level, this.floorZ)) this.pLife[i] = 0;
      const s = this.pLife[i] > 0 ? 1 : 0;
      this.m4.makeScale(s, s, s).setPosition(this.pPos[k], this.pPos[k + 1], this.pPos[k + 2]);
      this.particles.setMatrixAt(i, this.m4);
    }
    if (any) this.particles.instanceMatrix.needsUpdate = true;
  }
}
