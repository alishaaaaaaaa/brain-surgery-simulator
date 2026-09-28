import { BufferGeometry, Curve, Float32BufferAttribute, Vector3 } from 'three';

export interface TubeOptions {
  tubularSegments?: number;
  radialSegments?: number;
  /** Radius at the start and end of the curve (linear taper). */
  radius: [number, number];
  /** Cross-section flattening along the binormal (1 = round). */
  flatten?: number;
  /** Close the ends with flat caps. */
  caps?: boolean;
}

/**
 * Like THREE.TubeGeometry, but with a tapering radius and optional elliptical cross-section.
 * Vessels narrow as they branch; nerves (especially the optic nerve) are flattened bands.
 */
export function buildTaperedTube(curve: Curve<Vector3>, opts: TubeOptions): BufferGeometry {
  const segs = opts.tubularSegments ?? 64;
  const radial = opts.radialSegments ?? 20;
  const flatten = opts.flatten ?? 1;
  const [r0, r1] = opts.radius;
  const frames = curve.computeFrenetFrames(segs, false);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new Vector3();
  const n = new Vector3();

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // Same parameterisation as THREE.TubeGeometry (note the negated cosine) so the
      // triangle winding faces outward.
      const c = -Math.cos(a), s = Math.sin(a);
      positions.push(
        p.x + r * (c * N.x + flatten * s * B.x),
        p.y + r * (c * N.y + flatten * s * B.y),
        p.z + r * (c * N.z + flatten * s * B.z),
      );
      // Normal of an ellipse: scale the minor-axis component inversely.
      n.set(0, 0, 0).addScaledVector(N, c).addScaledVector(B, s / flatten).normalize();
      normals.push(n.x, n.y, n.z);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  if (opts.caps) {
    for (const end of [0, 1] as const) {
      const t = end;
      curve.getPointAt(t, p);
      const T = frames.tangents[end === 0 ? 0 : segs];
      const sign = end === 0 ? -1 : 1;
      const centre = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      normals.push(T.x * sign, T.y * sign, T.z * sign);
      uvs.push(t, 0.5);
      const ring = end === 0 ? 0 : segs * (radial + 1);
      const start = positions.length / 3;
      for (let j = 0; j <= radial; j++) {
        const k = (ring + j) * 3;
        positions.push(positions[k], positions[k + 1], positions[k + 2]);
        normals.push(T.x * sign, T.y * sign, T.z * sign);
        uvs.push(t, j / radial);
      }
      for (let j = 0; j < radial; j++) {
        if (end === 0) indices.push(centre, start + j, start + j + 1);
        else indices.push(centre, start + j + 1, start + j);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}
