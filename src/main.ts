import './ui/styles.css';
import { Group, Mesh, type Object3D, PerspectiveCamera } from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { buildAnatomy } from './anatomy';
import { updateAdhesions } from './anatomy/adhesions';
import { updateArachnoid } from './anatomy/arachnoid';
import { pulseUniform } from './anatomy/pulsation';
import { AudioEngine } from './audio/engine';
import { microscope } from './config/anatomy';
import { sim } from './config/sim';
import { events } from './core/events';
import { Heart } from './core/heart';
import { clock } from './core/clock';
import { state } from './core/state';
import { Bleeding } from './physics/bleeding';
import { Fluids } from './physics/fluids';
import { Physiology } from './physics/physiology';
import { Complications } from './procedure/complications';
import { Procedure } from './procedure/procedure';
import { Tracker } from './procedure/tracker';
import { Autofocus } from './scene/autofocus';
import { MicroscopeLight } from './scene/lighting';
import { MicroscopeControls } from './scene/microscopeControls';
import { PostFX } from './scene/postfx';
import { createRenderer } from './scene/renderer';
import { BipolarTool } from './tools/impl/bipolar';
import { ClipTool } from './tools/impl/clip';
import { DissectorTool } from './tools/impl/dissector';
import { DopplerTool } from './tools/impl/doppler';
import { EndoscopeTool, IcgTool } from './tools/impl/placeholders';
import { ScissorsTool } from './tools/impl/scissors';
import { SpatulaTool } from './tools/impl/spatula';
import { SuctionTool } from './tools/impl/suction';
import { ToolManager } from './tools/toolManager';
import type { ToolContext } from './tools/types';
import { mountHud } from './ui/hud';
import { mountChecklist } from './ui/checklist';
import { getLang, t, type I18nKey } from './ui/i18n';
import { mountMentor } from './ui/mentor';
import { VitalsPanel } from './ui/vitals';
import { showStartScreen } from './ui/startScreen';
import { Toasts } from './ui/toast';
import { mountToolbar } from './ui/toolbar';

const viewport = document.getElementById('viewport')!;
const uiRoot = document.getElementById('ui')!;
document.documentElement.lang = getLang();

// --- Scene -----------------------------------------------------------------
const { renderer, scene } = createRenderer(viewport);
const camera = new PerspectiveCamera(microscope.fov, viewport.clientWidth / viewport.clientHeight, 20, 1200);

const anatomy = buildAnatomy();
scene.add(anatomy.root);
const fluids = new Fluids();
anatomy.root.add(fluids.group);
const bleeding = new Bleeding();
anatomy.root.add(bleeding.group);
const field = new Group();
field.name = 'field';
anatomy.root.add(field);

anatomy.root.traverse((o) => {
  if (!(o instanceof Mesh)) return;
  const transparent = Array.isArray(o.material) ? false : o.material.transparent;
  o.castShadow = !transparent;
  o.receiveShadow = true;
});

// One shared list of pickable objects: autofocus and the tools both raycast it.
const pickables = anatomy.pickables;
pickables.push(...fluids.pools.map((p) => p.mesh), bleeding.layer);

const controls = new MicroscopeControls(camera, renderer.domElement);
const light = new MicroscopeLight(scene);
const post = new PostFX(renderer, scene, camera);
const autofocus = new Autofocus(camera, renderer.domElement, pickables, post.focusPoint, controls.target);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'label-layer';
viewport.appendChild(labelRenderer.domElement);

const heart = new Heart(sim.heart.baselineRate);
const audio = new AudioEngine();
const physiology = new Physiology();

// --- Tools -----------------------------------------------------------------
const toasts = new Toasts(uiRoot);
toasts.onCaution = () => audio.caution();

const ctx: ToolContext = {
  scene,
  camera,
  anatomy,
  fluids,
  bleeding,
  audio,
  toasts,
  field,
  addPickable: (o: Object3D) => pickables.push(o),
  removePickable: (o: Object3D) => {
    const i = pickables.indexOf(o);
    if (i >= 0) pickables.splice(i, 1);
  },
};
const clipTool = new ClipTool(ctx, 'permanent');
const tempClipTool = new ClipTool(ctx, 'temporary');
let tools: ToolManager;
const spatulaTool = new SpatulaTool(ctx, () => tools.mmPerPixel());
tools = new ToolManager(
  [
    new SuctionTool(ctx),
    new ScissorsTool(ctx),
    new BipolarTool(ctx),
    new DissectorTool(ctx),
    spatulaTool,
    clipTool,
    new IcgTool(ctx),
    new DopplerTool(ctx, heart),
    new EndoscopeTool(ctx),
    tempClipTool,
  ],
  camera,
  renderer.domElement,
  pickables,
  controls,
  scene,
);

// --- Procedure ---------------------------------------------------------------
const procedure = new Procedure();
const tracker = new Tracker({
  arachnoid: anatomy.arachnoid,
  adhesions: anatomy.adhesions,
  aneurysm: anatomy.aneurysm,
  clips: () => clipTool.placed,
  tempClips: () => tempClipTool.placed,
  activeBleeds: () => bleeding.activeCount,
});
// A clip across the neck secures a ruptured aneurysm.
bleeding.neckClipped = () => tracker.clipsAcrossNeck() > 0;
const complications = new Complications(anatomy, bleeding, toasts);

// Identifying a structure briefly shows its label, so the learner can check themselves.
events.on('identified', ({ structure }) => {
  const key = `anat.${structure}`;
  anatomy.labels.flash(key, 3);
  // Only announce structures that matter for the procedure (not every brain surface glance).
  if (['m1', 'ica', 'opticNerve', 'pcom', 'acha', 'a1', 'oculomotorNerve', 'aneurysm'].includes(structure)) {
    toasts.showText(t('toast.identified', { name: t(key as I18nKey) }), 'info', 1800);
  }
});
events.on('stageCompleted', ({ id, next }) => {
  const stage = procedure.stages.find((s) => s.def.id === id)!;
  audio.chime();
  toasts.showText(t('toast.stageDone', { name: t(stage.def.titleKey) }), 'success', 3000);
  if (next === null) toasts.show('toast.procedureDone', 'success', 4000);
});

// --- UI --------------------------------------------------------------------
let hud: ReturnType<typeof mountHud> | null = null;
let toolbar: ReturnType<typeof mountToolbar> | null = null;
let checklist: ReturnType<typeof mountChecklist> | null = null;
let mentor: ReturnType<typeof mountMentor> | null = null;
let vitals: VitalsPanel | null = null;
showStartScreen(uiRoot, () => {
  audio.unlock();
  hud = mountHud(uiRoot, audio);
  checklist = mountChecklist(uiRoot, procedure);
  mentor = mountMentor(uiRoot, procedure, () =>
    state.ruptured && !state.ruptureSecured
      ? {
          titleKey: 'mentor.emergency',
          textKey: 'mentor.emergencyText',
          steps: [
            { labelKey: 'task.suctionField', done: complications.fieldCleared },
            { labelKey: 'task.tempClipOn', done: state.tempOcclusion.active },
            { labelKey: 'task.neckSecured', done: state.ruptureSecured },
          ],
        }
      : null,
  );
  vitals = new VitalsPanel(uiRoot, physiology, heart, audio, () => clock.elapsed);
  toolbar = mountToolbar(uiRoot, tools, clipTool);
  clock.running = true;
  events.emit('started');
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'l') anatomy.labels.toggleAll();
  // R resets the view unless a tool uses the key.
  if (key === 'r') controls.reset();
  if (key === 'm') audio.setMuted(!audio.muted);
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

  clock.tick(dt);
  if (clock.running) {
    complications.update(dt);
    physiology.update(dt, {
      ebl: state.ebl,
      bleedRate: bleeding.currentRate,
      occlusionSeconds: state.tempOcclusion.active ? state.tempOcclusion.current : 0,
      perforatorIschemia: 0, // from the M5 flow model
    });
    heart.rate = physiology.hr;
  }
  heart.update(dt);
  pulseUniform.value = heart.pulse;

  controls.update(dt);
  tools.update(dt);
  updateArachnoid(anatomy.arachnoid, dt);
  updateAdhesions(anatomy.adhesions, dt);
  bleeding.update(dt, heart.pulse);
  anatomy.labels.update(dt);
  if (clock.running) {
    tracker.update(dt, tools.hit?.structure ?? null);
    procedure.update(dt, tracker, clock.elapsed);
  }
  autofocus.update(dt);
  post.setZoom(controls.fov);
  light.update(camera, controls.target);

  post.render(dt);
  vitals?.update(dt);
  labelRenderer.render(scene, camera);

  hudTimer -= dt;
  if (hud && hudTimer <= 0) {
    hudTimer = 0.1;
    hud.setReadouts(controls.magnification, autofocus.depth);
    toolbar?.refresh();
    checklist?.refresh();
    mentor?.refresh();
  }
});

// Handy for debugging in the browser console (e.g. __sim.state.ruptureRisk).
Object.assign(window, { __sim: { scene, camera, anatomy, controls, post, heart, tools, state, fluids, procedure, tracker, clock, bleeding, physiology, complications } });
