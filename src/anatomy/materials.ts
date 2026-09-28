import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { anatomy } from '../config/anatomy';
import { addPulsation } from './pulsation';

/*
 * Tissue materials. Living tissue under the microscope looks wet: a rough base layer
 * with a sharp, bright specular film on top (modelled with clearcoat) and a soft sheen
 * at grazing angles (thin CSF / arachnoid film).
 */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Deterministic pseudo-random for texture drawing. */
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Faint longitudinal streaks + tiny vasa vasorum on the arterial wall. u runs along the vessel. */
function arterySurfaceTexture(): Texture {
  return canvasTexture(512, 128, (ctx) => {
    const r = rng(7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 140; i++) {
      const y = r() * 128;
      ctx.strokeStyle = `rgba(150,40,50,${0.05 + r() * 0.08})`;
      ctx.lineWidth = 0.6 + r() * 1.2;
      ctx.beginPath();
      ctx.moveTo(r() * 512, y);
      ctx.lineTo(r() * 512, y + (r() - 0.5) * 6);
      ctx.stroke();
    }
    // Tiny tortuous vasa vasorum.
    for (let i = 0; i < 18; i++) {
      let x = r() * 512, y = r() * 128;
      ctx.strokeStyle = 'rgba(140,20,30,0.25)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (r() - 0.3) * 14;
        y += (r() - 0.5) * 8;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

/** Nerve fascicles run lengthwise: stripes that vary around the circumference (v). */
function nerveTexture(): Texture {
  return canvasTexture(256, 256, (ctx) => {
    const r = rng(11);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 3 + r() * 4) {
      ctx.fillStyle = `rgba(160,130,90,${0.08 + r() * 0.12})`;
      ctx.fillRect(0, y, 256, 1 + r() * 1.5);
    }
    // A few fine pial vessels on the nerve surface.
    for (let i = 0; i < 6; i++) {
      let x = r() * 256, y = r() * 256;
      ctx.strokeStyle = 'rgba(170,40,40,0.45)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 10; k++) {
        x += 10 + r() * 10;
        y += (r() - 0.5) * 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

/**
 * Arachnoid: a nearly clear veil crossed by fine collagen trabeculae. Used as an alpha map
 * (white = opaque): mostly dark (see-through) with thin, slightly wavy bright strands.
 */
function arachnoidAlphaTexture(): Texture {
  return canvasTexture(
    512,
    512,
    (ctx) => {
      const r = rng(3);
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, 512, 512);
      // Faint cloudy thickening of the membrane.
      for (let i = 0; i < 40; i++) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, 'rgba(255,255,255,0.10)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.translate(r() * 512, r() * 512);
        ctx.scale(20 + r() * 60, 10 + r() * 30);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Trabeculae: short, fine, gently curved strands with a dominant orientation.
      for (let i = 0; i < 220; i++) {
        const x = r() * 512, y = r() * 512;
        const ang = (r() - 0.5) * 1.2 + (r() < 0.3 ? Math.PI / 2 : 0);
        const len = 30 + r() * 110;
        const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
        ctx.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.35})`;
        ctx.lineWidth = 0.4 + r() * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo((x + ex) / 2 + (r() - 0.5) * 18, (y + ey) / 2 + (r() - 0.5) * 18, ex, ey);
        ctx.stroke();
      }
    },
    false,
  );
}

let arteryTex: Texture | undefined;
let nerveTex: Texture | undefined;
let arachnoidTex: Texture | undefined;

export function createArteryMaterial(radius: number): MeshPhysicalMaterial {
  arteryTex ??= arterySurfaceTexture();
  const m = new MeshPhysicalMaterial({
    color: new Color(anatomy.tissue.arteryColor),
    map: arteryTex,
    roughness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    sheen: 0.5,
    sheenColor: new Color('#ffb4a4'),
    sheenRoughness: 0.45,
  });
  addPulsation(m, radius * anatomy.tissue.arteryPulseFraction);
  return m;
}

export function createAneurysmMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.34,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    sheen: 0.6,
    sheenColor: new Color('#ffc2b4'),
    sheenRoughness: 0.4,
  });
  addPulsation(m, (anatomy.aneurysm.domeDiameter / 2) * anatomy.aneurysm.pulseFraction);
  return m;
}

export function createBlebMaterial(): MeshPhysicalMaterial {
  // Thin, translucent-looking wall: darker red with a very glossy surface.
  const m = new MeshPhysicalMaterial({
    color: new Color(anatomy.aneurysm.colors.bleb),
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    sheen: 0.8,
    sheenColor: new Color('#ff8a80'),
  });
  addPulsation(m, anatomy.aneurysm.bleb.radius * 0.1);
  return m;
}

export function createNerveMaterial(): MeshPhysicalMaterial {
  nerveTex ??= nerveTexture();
  return new MeshPhysicalMaterial({
    color: new Color(anatomy.tissue.nerveColor),
    map: nerveTex,
    roughness: 0.55,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    sheen: 0.4,
    sheenColor: new Color('#fff4dc'),
  });
}

export function createBrainMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.52,
    clearcoat: 0.75,
    clearcoatRoughness: 0.2,
    // Low sheen: the fissure walls are seen at grazing angles, where sheen turns milky.
    sheen: 0.12,
    sheenColor: new Color('#ffd6cc'),
    sheenRoughness: 0.5,
    side: DoubleSide,
    envMapIntensity: 0.6,
  });
  addPulsation(m, anatomy.brain.pulseAmplitude);
  return m;
}

export function createFloorMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: new Color(anatomy.brain.colors.floor),
    roughness: 0.5,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.25,
  });
}

export function createArachnoidMaterial(): MeshPhysicalMaterial {
  arachnoidTex ??= arachnoidAlphaTexture();
  return new MeshPhysicalMaterial({
    color: new Color(anatomy.arachnoid.color),
    alphaMap: arachnoidTex,
    transparent: true,
    opacity: anatomy.arachnoid.opacity,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
    sheen: 0.25,
    sheenColor: new Color('#ffffff'),
    side: DoubleSide,
    depthWrite: false,
  });
}

export function createSteelMaterial(): MeshStandardMaterial {
  // Brushed stainless: slightly rough so it catches the microscope light instead of mirroring darkness.
  return new MeshStandardMaterial({ color: new Color('#cfd3d8'), metalness: 0.65, roughness: 0.34, envMapIntensity: 3 });
}
