import { CatmullRomCurve3, Vector2, Vector3 } from 'three';
import { anatomy } from '../config/anatomy';

type BrainConfig = typeof anatomy.brain;

export interface ProfileSample {
  /** Distance from the corridor centre line (always positive, away from the fissure). */
  offset: number;
  z: number;
  /** Unit normal in the (offset, z) plane, pointing out of the brain (up / into the corridor). */
  nOffset: number;
  nZ: number;
}

/**
 * Cross-section of one lobe across the opened fissure, as control points (offset, z).
 * Traversed from far out on the cortical surface, over the rounded rim (the operculum),
 * down the fissure wall, and tucking under the corridor floor.
 */
export function corridorProfilePoints(b: BrainConfig): Vector3[] {
  const R = b.rimHalfWidth, F = b.floorHalfWidth, D = b.floorDepth;
  const pts: [number, number][] = [
    [R + b.outerExtent, 0.5],
    [R + 30, 1.5],
    [R + 12, 1.2],
    [R + 3, -0.5],
    [R - 1, -5],
    [R - 4, -14],
    [(R + F) / 2 + 1, -D * 0.56],
    [F + 2, -D + 6],
    [F + 0.5, -D + 1.5],
    [F - 2, -D - 1],
  ];
  return pts.map(([o, z]) => new Vector3(o, z, 0));
}

/** Evenly spaced samples along the lobe profile, with outward normals. */
export function sampleCorridorProfile(b: BrainConfig, count: number): ProfileSample[] {
  const curve = new CatmullRomCurve3(corridorProfilePoints(b), false, 'centripetal');
  const out: ProfileSample[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    // Traversal goes toward decreasing offset; rotating the tangent by -90° gives the
    // normal that points up on the surface and into the corridor on the wall.
    const len = Math.hypot(t.x, t.y) || 1;
    out.push({ offset: p.x, z: p.y, nOffset: t.y / len, nZ: -t.x / len });
  }
  return out;
}

/**
 * Distance from the corridor centre to the fissure wall at a given depth z (ignoring gyral
 * relief). Used to size arachnoid sheets and place spatulas.
 */
export function wallOffsetAtDepth(b: BrainConfig, z: number): number {
  const samples = sampleCorridorProfile(b, 400);
  // Walk the descending wall portion (after the rim) and interpolate.
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], c = samples[i];
    if (a.offset > b.rimHalfWidth + 4) continue;
    if ((a.z - z) * (c.z - z) <= 0 && a.z !== c.z) {
      const t = (z - a.z) / (c.z - a.z);
      return a.offset + (c.offset - a.offset) * t;
    }
  }
  return z > -1 ? b.rimHalfWidth : b.floorHalfWidth;
}

export interface AneurysmProfile {
  /** Lathe profile (x = radius, y = height along the projection axis); neck plane at y = 0. */
  points: Vector2[];
  /** Height of the dome centre above the neck plane. */
  centerHeight: number;
  domeRadius: number;
  /** Height of the apex above the neck plane. */
  apexHeight: number;
}

/**
 * Saccular aneurysm as a sphere truncated by the neck plane, plus a short flared base that
 * sinks into the parent artery wall. The sphere centre sits at c = sqrt(R² − r_neck²) above
 * the neck plane so that the sphere meets the plane exactly at the neck radius.
 */
export function aneurysmProfile(domeDiameter: number, neckDiameter: number, arcSegments = 48): AneurysmProfile {
  const R = domeDiameter / 2;
  const rn = Math.min(neckDiameter / 2, R * 0.98);
  const c = Math.sqrt(R * R - rn * rn);
  const points: Vector2[] = [
    new Vector2(rn + 0.55, -1.6),
    new Vector2(rn + 0.3, -0.8),
    new Vector2(rn + 0.08, -0.25),
  ];
  // θ is the angle from the apex. The neck circle (y = 0) lies below the sphere's equator,
  // at θ0 = π − asin(r_neck / R). Sweep from the neck over the equator to the apex.
  const theta0 = Math.PI - Math.asin(rn / R);
  for (let i = 0; i <= arcSegments; i++) {
    const theta = theta0 * (1 - i / arcSegments);
    points.push(new Vector2(R * Math.sin(theta), c + R * Math.cos(theta)));
  }
  points[points.length - 1].x = 0;
  return { points, centerHeight: c, domeRadius: R, apexHeight: c + R };
}
