import {
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { anatomy } from '../config/anatomy';
import { aneurysmProfile } from './geometryMath';
import { createAneurysmMaterial, createBlebMaterial } from './materials';
import { Noise3, smoothstep } from './noise';

const noise = new Noise3(1234);

export interface AneurysmHandle {
  group: Group;
  dome: Mesh;
  bleb: Mesh;
  /** World-space centre of the neck (on the ICA wall). */
  neckCenter: Vector3;
  /** Unit projection axis (from neck toward apex). */
  axis: Vector3;
  domeCenter: Vector3;
  apex: Vector3;
  neckRadius: number;
  domeRadius: number;
}

/**
 * The IC-PC aneurysm: a saccular outpouching at the junction of the ICA and the PCom origin.
 *
 * Anatomy notes for learners:
 *  - The NECK is the part the clip must close: fully, without leaving a residual neck and
 *    without kinking or narrowing the parent ICA.
 *  - The DOME is thin-walled and fragile; the BLEB (daughter sac) is the weakest point and
 *    a common rupture site — avoid touching it.
 *  - The PCom origin sits at the proximal edge of the neck; the anterior choroidal artery
 *    is just distal. Both must remain open after clipping.
 */
export function buildAneurysm(icaCurve: CatmullRomCurve3): AneurysmHandle {
  const cfg = anatomy.aneurysm;
  const profile = aneurysmProfile(cfg.domeDiameter, cfg.neckDiameter);

  // Place the neck on the ICA wall facing the projection direction.
  const t = cfg.icaT;
  const icaCenter = icaCurve.getPointAt(t);
  const icaTangent = icaCurve.getTangentAt(t);
  const icaR = anatomy.vessels.ica.radius[0] + (anatomy.vessels.ica.radius[1] - anatomy.vessels.ica.radius[0]) * t;
  const axis = new Vector3(...cfg.direction).normalize();
  const wallNormal = axis.clone().addScaledVector(icaTangent, -axis.dot(icaTangent)).normalize();
  const neckCenter = icaCenter.clone().addScaledVector(wallNormal, icaR * cfg.neckOffset);

  const geo = new LatheGeometry(profile.points, 64);
  // Irregular wall: displace along the normal, more toward the apex (thin, stretched wall),
  // and colour it: redder where thick, paler/pinker where thin, yellowish atheroma near neck.
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const wall = new Color(cfg.colors.wall);
  const thin = new Color(cfg.colors.thinWall);
  const athero = new Color(cfg.colors.atheroma);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = smoothstep(0, profile.apexHeight, y);
    const d = cfg.irregularity * noise.fbm(x * 0.7, y * 0.7, z * 0.7, 3) * smoothstep(0.2, 1.2, y);
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
    c.copy(wall).lerp(thin, h * 0.8 + 0.2 * noise.noise(x * 1.3, y * 1.3, z * 1.3));
    const plaque = smoothstep(0.25, 0.5, noise.noise(x * 0.9 + 5, y * 0.9, z * 0.9)) * (1 - smoothstep(0.5, 2.5, y));
    c.lerp(athero, plaque * 0.7);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const dome = new Mesh(geo, createAneurysmMaterial());
  dome.name = 'aneurysmDome';
  dome.userData.structure = 'aneurysm';

  // Bleb: small sphere on the dome, tilted from the apex toward the lateral side.
  const a = (cfg.bleb.angleFromApex * Math.PI) / 180;
  const localDir = new Vector3(Math.sin(a), Math.cos(a), 0);
  const blebCenterLocal = new Vector3(0, profile.centerHeight, 0).addScaledVector(
    localDir,
    profile.domeRadius + cfg.bleb.radius * 0.35,
  );
  const bleb = new Mesh(new SphereGeometry(cfg.bleb.radius, 24, 16), createBlebMaterial());
  bleb.position.copy(blebCenterLocal);
  bleb.name = 'aneurysmBleb';
  bleb.userData.structure = 'bleb';

  // Orient local +Y to the projection axis; spin about it so the bleb faces lateral (+x).
  const group = new Group();
  group.name = 'aneurysm';
  group.add(dome, bleb);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis);
  const lateral = new Vector3(1, 0, 0).applyQuaternion(q);
  const wantLateral = new Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
  const spin = Math.atan2(new Vector3().crossVectors(lateral, wantLateral).dot(axis), lateral.dot(wantLateral));
  group.quaternion.copy(new Quaternion().setFromAxisAngle(axis, spin).multiply(q));
  group.position.copy(neckCenter);
  group.updateMatrixWorld(true);

  return {
    group,
    dome,
    bleb,
    neckCenter,
    axis,
    domeCenter: neckCenter.clone().addScaledVector(axis, profile.centerHeight),
    apex: neckCenter.clone().addScaledVector(axis, profile.apexHeight),
    neckRadius: cfg.neckDiameter / 2,
    domeRadius: profile.domeRadius,
  };
}
