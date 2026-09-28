import { Color, Float32BufferAttribute, Group, Mesh, MeshPhysicalMaterial, RingGeometry, Vector3 } from 'three';
import { anatomy } from '../config/anatomy';
import { sim } from '../config/sim';
import { events } from '../core/events';

export interface Pool {
  kind: 'csf' | 'blood';
  center: Vector3;
  radius: number;
  /** 0..1 fraction of the pool's full volume. */
  volume: number;
  mesh: Mesh;
}

/**
 * Pools of fluid lying in the field. Suction aspirates any pool the tip is in.
 * CSF is clear but glistening; it blurs and reflects the view of whatever lies beneath.
 * (M4 adds blood pools and a rising pooling layer on top of this.)
 */
export class Fluids {
  readonly group = new Group();
  readonly pools: Pool[] = [];

  constructor() {
    this.group.name = 'fluids';
    for (const p of anatomy.csfPools) this.addPool('csf', new Vector3(p.x, p.y, p.z), p.radius, 1);
  }

  addPool(kind: Pool['kind'], center: Vector3, radius: number, volume: number): Pool {
    const material = new MeshPhysicalMaterial({
      // CSF is water-clear: mostly visible as a glossy film with highlights.
      color: new Color(kind === 'csf' ? '#8fa9b3' : '#6d0d10'),
      vertexColors: true,
      transparent: true,
      opacity: kind === 'csf' ? 0.16 : 0.92,
      roughness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      depthWrite: false,
    });
    // A disc whose edge fades out, so the pool has a soft meniscus instead of a rim.
    const geo = new RingGeometry(0, 1, 48, 8);
    const pos = geo.getAttribute('position');
    const rgba = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      rgba.set([1, 1, 1, Math.min(1, (1 - r) / 0.45)], i * 4);
    }
    geo.setAttribute('color', new Float32BufferAttribute(rgba, 4));
    const mesh = new Mesh(geo, material);
    mesh.position.copy(center);
    mesh.renderOrder = 1;
    mesh.userData.structure = kind === 'csf' ? 'csf' : 'blood';
    const pool: Pool = { kind, center, radius, volume, mesh };
    mesh.userData.pool = pool;
    this.group.add(mesh);
    this.pools.push(pool);
    this.refresh(pool);
    return pool;
  }

  /** Aspirate every pool the tip is close to. Returns true if anything was aspirated. */
  aspirate(tip: Vector3, dt: number): boolean {
    let total = 0;
    for (const p of this.pools) {
      if (p.volume <= 0) continue;
      const r = p.radius * Math.sqrt(p.volume) + sim.suction.reach;
      // Ignore depth differences below a few mm (the tip dips into the pool).
      const d = Math.hypot(tip.x - p.center.x, tip.y - p.center.y);
      if (d > r || Math.abs(tip.z - p.center.z) > 4) continue;
      const before = p.volume;
      p.volume = Math.max(0, p.volume - sim.suction.rate * dt);
      total += before - p.volume;
      this.refresh(p);
    }
    if (total > 0) events.emit('fluidAspirated', { amount: total });
    return total > 0;
  }

  private refresh(p: Pool): void {
    const s = p.radius * Math.sqrt(Math.max(p.volume, 0.001));
    p.mesh.scale.set(s, s, 1);
    p.mesh.visible = p.volume > 0.02;
  }
}
