import type { Material } from 'three';

/**
 * Shared uniform carrying the current arterial pulse (0..1). Every pulsating material
 * reads it, so the whole field beats in sync with the heart model (and, from M4, the ECG).
 */
export const pulseUniform = { value: 0 };

/**
 * Adds a vertex displacement along the surface normal proportional to the pulse.
 * `amplitude` is in mm at pulse = 1. Used for arteries (systolic expansion), the thin
 * aneurysm dome (visibly pulsatile) and the brain (transmitted pulsation).
 */
export function addPulsation(material: Material, amplitude: number): void {
  const amp = { value: amplitude };
  material.userData.pulseAmplitude = amp;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uPulse = pulseUniform;
    shader.uniforms.uPulseAmp = amp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPulse;\nuniform float uPulseAmp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += objectNormal * uPulseAmp * uPulse;');
  };
}
