import { HalfFloatType, type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { Vector2 } from 'three';

/**
 * The "looking through a microscope" image:
 *  - shallow depth of field (high magnification → only a few mm are sharp)
 *  - soft bloom on specular highlights of wet tissue
 *  - warm grade from the halogen/xenon light, slight lens chromatic aberration
 *  - strong vignette (plus the circular eyepiece mask in CSS)
 */
export class PostFX {
  readonly composer: EffectComposer;
  readonly dof: DepthOfFieldEffect;
  /** World-space point the microscope is focused on (updated by autofocus). */
  readonly focusPoint = new Vector3();
  private readonly warmth: HueSaturationEffect;
  private readonly bloom: BloomEffect;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 4 });
    this.composer.addPass(new RenderPass(scene, camera));

    this.dof = new DepthOfFieldEffect(camera, {
      focusRange: 10,
      bokehScale: 2.2,
      resolutionScale: 0.5,
    });
    this.dof.target = this.focusPoint;

    const bloom = new BloomEffect({
      intensity: 0.45,
      luminanceThreshold: 0.72,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      radius: 0.6,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const warmth = new HueSaturationEffect({ hue: -0.015, saturation: 0.12 });
    this.warmth = warmth;
    this.bloom = bloom;
    const contrast = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.08 });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.62 });
    const aberration = new ChromaticAberrationEffect({
      offset: new Vector2(0.0007, 0.0005),
      radialModulation: true,
      modulationOffset: 0.35,
    });

    // Convolution effects (DoF, chromatic aberration) each need their own pass.
    this.composer.addPass(new EffectPass(camera, this.dof));
    this.composer.addPass(new EffectPass(camera, bloom, tone, warmth, contrast, vignette));
    this.composer.addPass(new EffectPass(camera, aberration));
  }

  /** Near-infrared (ICG) camera: grey-scale, with the fluorescent vessels glowing. */
  setIcg(on: boolean): void {
    this.warmth.saturation = on ? -1 : 0.12;
    this.warmth.hue = on ? 0 : -0.015;
    this.bloom.intensity = on ? 0.9 : 0.45;
  }

  /** Magnification-dependent depth of field: more zoom → thinner in-focus slab. */
  setZoom(fov: number): void {
    this.dof.cocMaterial.focusRange = 4 + fov * 0.9;
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
