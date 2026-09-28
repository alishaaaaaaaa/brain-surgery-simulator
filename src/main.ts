import './ui/styles.css';
import { Mesh, PerspectiveCamera } from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { buildAnatomy } from './anatomy';
import { pulseUniform } from './anatomy/pulsation';
import { microscope } from './config/anatomy';
import { sim } from './config/sim';
import { events } from './core/events';
import { Heart } from './core/heart';
import { Autofocus } from './scene/autofocus';
import { MicroscopeLight } from './scene/lighting';
import { MicroscopeControls } from './scene/microscopeControls';
import { PostFX } from './scene/postfx';
import { createRenderer } from './scene/renderer';
import { mountHud } from './ui/hud';
import { getLang } from './ui/i18n';
import { showStartScreen } from './ui/startScreen';

const viewport = document.getElementById('viewport')!;
const uiRoot = document.getElementById('ui')!;
document.documentElement.lang = getLang();

// --- Scene -----------------------------------------------------------------
const { renderer, scene } = createRenderer(viewport);
const camera = new PerspectiveCamera(microscope.fov, viewport.clientWidth / viewport.clientHeight, 20, 1200);

const anatomy = buildAnatomy();
scene.add(anatomy.root);
anatomy.root.traverse((o) => {
  if (!(o instanceof Mesh)) return;
  const transparent = Array.isArray(o.material) ? false : o.material.transparent;
  o.castShadow = !transparent;
  o.receiveShadow = true;
});

const controls = new MicroscopeControls(camera, renderer.domElement);
const light = new MicroscopeLight(scene);
const post = new PostFX(renderer, scene, camera);
const autofocus = new Autofocus(camera, renderer.domElement, anatomy.pickables, post.focusPoint, controls.target);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'label-layer';
viewport.appendChild(labelRenderer.domElement);

const heart = new Heart(sim.heart.baselineRate);

// --- UI --------------------------------------------------------------------
let hud: ReturnType<typeof mountHud> | null = null;
showStartScreen(uiRoot, () => {
  hud = mountHud(uiRoot);
  events.emit('started');
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'l') anatomy.labels.visible = !anatomy.labels.visible;
  if (key === 'r') controls.reset();
});

// --- Resize ----------------------------------------------------------------
function resize(): void {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// --- Main loop -------------------------------------------------------------
let last = performance.now();
let hudTimer = 0;

renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  heart.update(dt);
  pulseUniform.value = heart.pulse;

  controls.update(dt);
  autofocus.update(dt);
  post.setZoom(controls.fov);
  light.update(camera, controls.target);

  post.render(dt);
  labelRenderer.render(scene, camera);

  hudTimer -= dt;
  if (hud && hudTimer <= 0) {
    hudTimer = 0.1;
    hud.setReadouts(controls.magnification, autofocus.depth);
  }
});

// Handy for debugging in the browser console.
Object.assign(window, { __sim: { scene, camera, anatomy, controls, post, heart } });
