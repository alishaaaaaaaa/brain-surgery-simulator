import { Color, HemisphereLight, type PerspectiveCamera, type Scene, SpotLight, Vector3 } from 'three';
import { microscope } from '../config/anatomy';

/** Illuminance at the working distance, scaled for physically-based (inverse-square) falloff. */
const WD2 = microscope.workingDistance ** 2;

/**
 * Operating microscope illumination is (nearly) coaxial with the line of sight: the light
 * comes from the objective lens itself. That is why the deep field is evenly lit with very
 * few shadows, and why glossy tissue shows bright specular highlights facing you.
 * We model it as two spotlights on the microscope head (one per optical channel) plus a
 * faint warm fill.
 */
export class MicroscopeLight {
  readonly main: SpotLight;
  readonly secondary: SpotLight;
  private readonly offset = 9; // mm between the two light outlets

  constructor(scene: Scene) {
    const color = new Color(microscope.lightColor);
    // Inverse-square falloff (decay 2) makes the deep field a little dimmer than the surface,
    // as through a real scope.
    this.main = new SpotLight(color, 2.4 * WD2, 0, 0.26, 0.65, 2);
    this.main.castShadow = true;
    this.main.shadow.mapSize.set(2048, 2048);
    this.main.shadow.camera.near = 120;
    this.main.shadow.camera.far = 450;
    this.main.shadow.bias = -0.0004;
    this.main.shadow.normalBias = 0.05;
    this.main.shadow.radius = 4;
    this.secondary = new SpotLight(color, 0.8 * WD2, 0, 0.26, 0.75, 2);
    scene.add(this.main, this.main.target, this.secondary, this.secondary.target);
    scene.add(new HemisphereLight(new Color('#ffe3cc'), new Color('#2a0c08'), 0.06));
  }

  /** Keep the lights riding on the microscope head and aimed at the focal point. */
  update(camera: PerspectiveCamera, target: Vector3): void {
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    this.main.position.copy(camera.position).addScaledVector(right, -this.offset / 2);
    this.secondary.position.copy(camera.position).addScaledVector(right, this.offset / 2);
    this.main.target.position.copy(target);
    this.secondary.target.position.copy(target);
    // Widen the beam when zoomed out so the whole field stays lit.
    const halfFov = ((camera.fov / 2) * Math.PI) / 180;
    this.main.angle = this.secondary.angle = Math.min(0.5, halfFov * 1.5 + 0.04);
  }
}
