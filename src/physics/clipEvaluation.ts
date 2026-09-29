import { type CatmullRomCurve3, Vector3 } from 'three';
import type { ClipPose } from '../core/events';

/**
 * Geometric clip evaluation.
 *
 * Model of a clip: two blades hinged at the head. Open, the tips are ~5 mm apart; the gap
 * narrows toward the head. When the clip closes, everything lying between the blades is
 * flattened onto the closing plane — that is what the clip occludes.
 *
 * Frame of one clip (unit vectors):
 *   b — along the blades, from the head toward the tips (pose.bladeDir)
 *   c — the closing direction (pose.closingDir); blades close onto the plane c = 0
 *   n — blade width direction, b × c; blades are ±BLADE_HALF_WIDTH wide in n
 *
 * A correctly placed clip:
 *   - closes across the aneurysm axis (c ⟂ axis) so the neck is squeezed flat,
 *   - runs along the flattened neck (b ∥ axis × c), with blades long enough to cover the
 *     flattened width (≈ π × neck radius — why a clip must be ~1.5× the neck diameter),
 *   - sits at the neck, not on the dome (residual neck) nor on the parent ICA (stenosis),
 *   - does not catch the PCom or the anterior choroidal artery.
 */

export interface ClipGeometry {
  pose: ClipPose;
  /** Blade length (mm). */
  length: number;
  kind: 'permanent' | 'temporary';
}

export interface NeckGeometry {
  center: Vector3;
  /** Unit axis from neck toward the dome apex. */
  axis: Vector3;
  neckRadius: number;
  domeRadius: number;
  /** Height of the dome centre above the neck plane. */
  domeCenterHeight: number;
}

export interface VesselGeometry {
  curve: CatmullRomCurve3;
  radius: [number, number];
}

const OPEN_TIP_GAP = 5;
/** Tissue is compliant: a little more than the open gap can be gathered in. */
const GATHER_TOLERANCE = 0.8;

const bladeHalfWidth = (c: ClipGeometry) => (c.kind === 'temporary' ? 0.39 : 0.55);
const pivotOffset = (c: ClipGeometry) => (c.kind === 'temporary' ? 1.12 : 1.6);

/** Local coordinates (b, c, n) of a point in a clip's frame. */
export function clipLocal(clip: ClipGeometry, p: Vector3): { b: number; c: number; n: number } {
  const { position, bladeDir, closingDir } = clip.pose;
  const d = p.clone().sub(position);
  const n = new Vector3().crossVectors(bladeDir, closingDir);
  return { b: d.dot(bladeDir), c: d.dot(closingDir), n: d.dot(n) };
}

/** Half the gap between the open blades at blade coordinate b (0 at the head hinge side). */
export function openHalfGap(clip: ClipGeometry, b: number): number {
  const L = clip.length;
  const fromHinge = b + L / 2 + pivotOffset(clip);
  return Math.max(0, (OPEN_TIP_GAP / 2) * (fromHinge / (L + pivotOffset(clip))));
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * How much of a tube cross-section (radius r, centre at local coords) the closed clip
 * pinches, 0 = untouched, 1 = fully occluded. Three factors:
 *  - along c: how much of it lay between the open blades,
 *  - along n: whether it passes under the blades (inside their width) or only its wall is
 *    caught by a blade edge,
 *  - along b: whether the blades are long enough to cover it once flattened (≈ π r wide).
 */
function pinch(clip: ClipGeometry, local: { b: number; c: number; n: number }, r: number): number {
  const L = clip.length;
  const w = bladeHalfWidth(clip);
  const g = openHalfGap(clip, Math.min(L / 2, Math.max(-L / 2, local.b))) + GATHER_TOLERANCE * 0.5;
  const alongC = clamp01((g - (Math.abs(local.c) - r)) / (2 * r));
  const an = Math.abs(local.n);
  const alongN = an <= w ? 1 : clamp01((w + r - an) / (2 * r));
  const half = (Math.PI * r) / 2;
  const overlap = Math.min(local.b + half, L / 2) - Math.max(local.b - half, -L / 2);
  const alongB = clamp01(overlap / (2 * half));
  return alongC * alongN * alongB;
}

/** Radius of the aneurysm (neck → dome) at height h above the neck plane. */
export function sacRadiusAt(neck: NeckGeometry, h: number): number {
  if (h <= 0) return neck.neckRadius;
  const R = neck.domeRadius;
  const dz = h - neck.domeCenterHeight;
  if (h < neck.domeCenterHeight) {
    // Between the neck plane and the widest part: follow the sphere, but never below the neck.
    return Math.max(neck.neckRadius, Math.sqrt(Math.max(0, R * R - dz * dz)));
  }
  return Math.sqrt(Math.max(0, R * R - dz * dz));
}

export interface NeckResult {
  /** 0..1 fraction of the neck lumen closed by this clip. */
  closure: number;
  /** Height of the blades above the neck plane (mm); ideal ≈ 0.3–1.2. */
  height: number;
}

/** How well one clip closes the neck. */
export function evaluateNeck(clip: ClipGeometry, neck: NeckGeometry): NeckResult {
  const { position, closingDir } = clip.pose;
  const a = neck.axis;
  const height = position.clone().sub(neck.center).dot(a);
  // Section of the sac at the level of the blades. Closing blades gather the thin wall down
  // toward the narrow neck, so blades up to ~0.8 mm above the neck plane still close at the
  // neck's width; higher up they meet the wider sac.
  const h = Math.max(0, height);
  const r = sacRadiusAt(neck, Math.max(0, h - 0.8));
  const sectionCenter = neck.center.clone().addScaledVector(a, h);

  // Orientation: the clip must squeeze across the axis. Closing along the axis does nothing.
  const s = new Vector3().crossVectors(a, closingDir);
  const orientation = s.length();
  if (orientation < 1e-3) return { closure: 0, height };
  s.normalize();

  // Capture: is the section between the open blades?
  const lc = clipLocal(clip, sectionCenter);
  const L = clip.length;
  const g = openHalfGap(clip, Math.min(L / 2, Math.max(-L / 2, lc.b))) + GATHER_TOLERANCE;
  const capture = Math.min(1, Math.max(0, (g - (Math.abs(lc.c) - r)) / (2 * r)));

  // Coverage: once squeezed flat, the neck becomes a ribbon ±(π r / 2) wide along s, lying in
  // the closing plane. The blades must cross the whole ribbon. A clip that crosses it at an
  // angle still closes it along a diagonal, so what counts is the blades' span projected
  // onto s — which is why a clip must be ~1.5× the neck diameter.
  const halfFlat = (Math.PI * r) / 2;
  const bDir = clip.pose.bladeDir;
  const nDir = new Vector3().crossVectors(bDir, closingDir);
  const s0 = position.clone().sub(sectionCenter).dot(s);
  const halfProj = (L / 2) * Math.abs(bDir.dot(s)) + bladeHalfWidth(clip) * Math.abs(nDir.dot(s));
  const overlap = Math.min(s0 + halfProj, halfFlat) - Math.max(s0 - halfProj, -halfFlat);
  let coverage = Math.min(1, Math.max(0, overlap / (2 * halfFlat)));
  // Blades tilted steeply along the aneurysm axis run from the ICA up onto the dome instead
  // of across the neck.
  const slant = Math.abs(bDir.dot(a));
  coverage *= Math.min(1, Math.max(0, 1 - (slant - 0.35) / 0.4));

  // Blades far above the neck clip the dome, not the neck; far below, they are on the ICA.
  const levelOk = height > 3.2 || height < -1.2 ? 0 : 1;
  const closure = Math.min(1, capture * coverage * Math.min(1, orientation * 1.15) * levelOk);
  return { closure, height };
}

/**
 * How much a clip pinches a vessel, over the part of the vessel between tFrom and tTo.
 * Returns the worst pinch (0..1) along that stretch.
 */
export function vesselPinch(clip: ClipGeometry, vessel: VesselGeometry, tFrom = 0, tTo = 1): number {
  let worst = 0;
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const t = tFrom + ((tTo - tFrom) * i) / steps;
    const p = vessel.curve.getPointAt(t);
    const r = vessel.radius[0] + (vessel.radius[1] - vessel.radius[0]) * t;
    worst = Math.max(worst, pinch(clip, clipLocal(clip, p), r));
  }
  return worst;
}

/** Parameter t (0..1) of the closest point on a curve to p. */
export function closestT(curve: CatmullRomCurve3, p: Vector3, samples = 200): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const d = curve.getPointAt(i / samples).distanceToSquared(p);
    if (d < bestD) {
      bestD = d;
      best = i / samples;
    }
  }
  return best;
}
