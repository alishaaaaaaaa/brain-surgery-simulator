import { describe, expect, it } from 'vitest';
import { CatmullRomCurve3, Vector3 } from 'three';
import { buildTaperedTube } from './tube';

/** Every triangle's geometric normal should agree with its vertex normals (faces point outward). */
function outwardFraction(caps: boolean, flatten = 1): number {
  const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(5, 2, -1), new Vector3(10, 0, 3)]);
  const g = buildTaperedTube(curve, { radius: [2, 1], caps, flatten });
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const idx = g.getIndex()!;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
  let ok = 0, total = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const [ia, ib, ic] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    const face = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    if (face.lengthSq() < 1e-12) continue;
    n.fromBufferAttribute(nor, ia);
    total++;
    if (face.dot(n) > 0) ok++;
  }
  return ok / total;
}

describe('buildTaperedTube', () => {
  it('winds triangles outward', () => {
    expect(outwardFraction(false)).toBe(1);
    expect(outwardFraction(false, 0.6)).toBe(1);
  });
  it('winds end caps outward', () => {
    expect(outwardFraction(true)).toBe(1);
  });
});
