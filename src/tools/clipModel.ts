import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3,
} from 'three';

export type ClipShape = 'straight' | 'curved';

export interface ClipOptions {
  shape: ClipShape;
  /** Blade length in mm. */
  length: number;
  /** Temporary (mini) clips are smaller and have a weaker spring. */
  kind: 'permanent' | 'temporary';
}

export type ClipModel = Group & {
  options: ClipOptions;
  /** 0 = closed, 1 = fully open (tips ~5 mm apart). */
  setOpen(v: number): void;
  setGhost(ghost: boolean): void;
};

/**
 * Sweep a rectangle along a curve lying in the local YZ plane. X is the closing axis of
 * the clip: blades are thin in X and broader in Z, so their flat faces meet when closed.
 */
function sweepRect(points: Vector3[], halfX: number, halfN: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const X = new Vector3(1, 0, 0);
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const t = points[Math.min(n - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    const N = new Vector3().crossVectors(t, X).normalize();
    // Corners: (+x,+n) (-x,+n) (-x,-n) (+x,-n)
    for (const [sx, sn] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      pos.push(p.x + sx * halfX + N.x * sn * halfN, p.y + N.y * sn * halfN, p.z + N.z * sn * halfN);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + ((k + 1) % 4);
      const c = a + 4, d = b + 4;
      idx.push(a, c, b, b, c, d);
    }
  }
  // End caps.
  idx.push(0, 1, 2, 0, 2, 3);
  const e = (n - 1) * 4;
  idx.push(e, e + 2, e + 1, e, e + 3, e + 2);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed(); // flat shading keeps the machined edges crisp
  ng.computeVertexNormals();
  return ng;
}

/**
 * Aneurysm clip (Yasargil/Sugita style): a spring coil at the head, two arms, and two
 * blades. Local frame: blade tips toward −Y (into the field), head toward +Y, blades close
 * along X. The origin is the middle of the blades — the point that should sit on the neck.
 */
export function buildClip(options: ClipOptions): ClipModel {
  const { length: L, shape, kind } = options;
  const mini = kind === 'temporary';
  const s = mini ? 0.7 : 1;
  const material = new MeshStandardMaterial({
    // Permanent clips: titanium grey. Temporary clips are coloured (gold) so they are never
    // left behind by mistake.
    color: new Color(mini ? '#c9a24a' : '#b8bcc3'),
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 1.6,
  });

  const g = new Group() as ClipModel;
  g.options = options;
  const pivotY = L / 2 + 1.6 * s;

  const bladePoints: Vector3[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const y = L / 2 - (L * i) / steps;
    // Curved clips bend away from the blade plane toward the tips (to follow the ICA wall).
    const f = i / steps;
    const z = shape === 'curved' ? -L * 0.32 * f * f : 0;
    bladePoints.push(new Vector3(0, y, z));
  }
  const bladeGeo = sweepRect(bladePoints, 0.22 * s, 0.55 * s);
  // Arms from blade base to the coil.
  const armGeo = sweepRect([new Vector3(0, L / 2, 0), new Vector3(0, pivotY, 0)], 0.25 * s, 0.4 * s);

  const halves: Group[] = [];
  for (const side of [-1, 1]) {
    const half = new Group();
    const blade = new Mesh(bladeGeo, material);
    const arm = new Mesh(armGeo, material);
    // Build relative to the pivot so rotation opens the blades like the real spring.
    blade.position.y = -pivotY;
    arm.position.y = -pivotY;
    half.add(blade, arm);
    half.position.y = pivotY;
    half.userData.side = side;
    halves.push(half);
    g.add(half);
  }
  const coil = new Mesh(new TorusGeometry(1.1 * s, 0.32 * s, 10, 24), material);
  coil.position.y = pivotY + 1.1 * s;
  g.add(coil);

  g.setOpen = (v: number) => {
    const maxGap = 5;
    const angle = Math.atan(maxGap / 2 / (L + 1.6 * s)) * v;
    for (const h of halves) {
      const side = h.userData.side as number;
      h.rotation.z = side * angle;
      // Blades sit a hair apart when closed so both remain visible.
      h.position.x = side * 0.22 * s;
    }
  };
  g.setGhost = (ghost: boolean) => {
    material.transparent = ghost;
    material.opacity = ghost ? 0.55 : 1;
    material.emissive.set(ghost ? '#0c3a32' : '#000000');
    material.depthWrite = !ghost;
    material.needsUpdate = true;
  };
  g.setOpen(1);
  return g;
}
