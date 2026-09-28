import { describe, expect, it } from 'vitest';
import { anatomy } from '../config/anatomy';
import { aneurysmProfile, sampleCorridorProfile, wallOffsetAtDepth } from './geometryMath';

describe('aneurysmProfile', () => {
  const p = aneurysmProfile(anatomy.aneurysm.domeDiameter, anatomy.aneurysm.neckDiameter);
  it('has the configured dome diameter', () => {
    const maxR = Math.max(...p.points.filter((q) => q.y > 0).map((q) => q.x));
    expect(2 * maxR).toBeCloseTo(anatomy.aneurysm.domeDiameter, 1);
  });
  it('meets the neck plane at the neck radius', () => {
    const neck = p.points.find((q) => Math.abs(q.y) < 1e-6 && q.x > 0)!;
    expect(2 * neck.x).toBeCloseTo(anatomy.aneurysm.neckDiameter, 5);
  });
  it('ends at the apex on the axis', () => {
    const apex = p.points[p.points.length - 1];
    expect(apex.x).toBe(0);
    expect(apex.y).toBeCloseTo(p.apexHeight, 5);
  });
});

describe('corridor profile', () => {
  it('normals point up on the cortical surface and into the corridor on the wall', () => {
    const s = sampleCorridorProfile(anatomy.brain, 200);
    expect(s[0].nZ).toBeGreaterThan(0.9);
    const wall = s.find((q) => q.z < -25 && q.z > -35)!;
    expect(wall.nOffset).toBeLessThan(-0.5);
  });
  it('narrows with depth', () => {
    const b = anatomy.brain;
    expect(wallOffsetAtDepth(b, -8)).toBeGreaterThan(wallOffsetAtDepth(b, -30));
    expect(wallOffsetAtDepth(b, -30)).toBeGreaterThan(b.floorHalfWidth - 0.5);
  });
});
