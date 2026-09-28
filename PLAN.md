# IC-PC Aneurysm Clipping Simulator — Plan

Browser-based **educational** simulator of microsurgical clipping of a right IC-PC
aneurysm via a pterional, transsylvian approach. Not for clinical training or
medical advice (stated on the start screen, EN/FR).

## Stack
- Vite + TypeScript (strict) + Three.js
- `postprocessing` (pmndrs) for the microscope look: DoF, vignette, soft bloom, warm tone
- Web Audio API (synthesized — no audio files): Doppler whoosh, alarms, suction hiss
- UI: plain TypeScript + CSS (no framework) — HTML overlay panels on top of the canvas
- Vitest for the pure-logic modules (stage rules, clip evaluation, flow model, vitals)
- No backend; all state in memory

## Architecture
```
src/
  main.ts                 bootstrap, main loop
  config/anatomy.ts       ALL anatomy sizes/positions/colors (single tuning file)
  config/sim.ts           gameplay tuning (bleed rates, rupture thresholds, vitals drift)
  core/                   event bus, clock, typed sim state store
  scene/                  renderer, microscope camera + controls, lighting, postprocessing
  anatomy/                procedural brain lobes, arachnoid, vessels (TubeGeometry on splines),
                          nerves, aneurysm + bleb, tissue materials, pulsation
  tools/                  one module per tool: cursor model, hover rule, interaction rule
  physics/                blood particles (instanced), pooling layer, retraction, flow model
  procedure/              stage definitions, goal checks, demo-mode scripts, clip evaluation
  audio/                  Doppler, alarms, ambient
  ui/                     toolbar, checklist, mentor, vitals + ECG canvas, debrief, i18n (en/fr)
```
Modules talk through a small typed event bus (`vesselTouched`, `arachnoidCut`,
`bleedStarted`, `clipApplied`, …) so stages, vitals, audio and UI stay decoupled.

## Key design decisions
- **View:** right pterional microscope view — frontal lobe at top, temporal lobe below,
  sylvian fissure between; deep field shows ICA, optic nerve medial (screen-left),
  M1 lateral, A1 medial, PCom and AChA from the posterior ICA wall, CN III deep.
  Camera orbits within a limited cone around a focal point (like moving the scope),
  mouse wheel = zoom, focus follows depth under cursor (DoF).
- **Arachnoid:** a grid of cuttable membrane patches; scissors remove a patch.
  Stage 1 progress = % of fissure patches opened.
- **Flow model:** vessels form a small graph (ICA → PCom, AChA, A1, M1 → M2s,
  aneurysm sac). Each segment has a patency value (0–1) from clip/temporary-clip
  geometry. ICG, Doppler, bleeding and MEP all read from this one model, so feedback
  is consistent.
- **Clip:** blades modeled as two line segments with adjustable position, rotation
  (roll/yaw), blade depth, straight or curved. Evaluation samples the neck ring and
  nearby centerlines: neck closure %, residual neck, ICA stenosis %, PCom/AChA
  occluded? Results shown via ICG fill + Doppler, plus a summary panel.
- **Rupture:** hidden `ruptureRisk` rises with dissector force near the dome/bleb,
  clip misplacement, and repeated manipulation; past threshold → rupture event.
- **Blood:** instanced particle jets from bleed points + a translucent pooling
  mesh whose level rises with net (bleed − suction) volume and obscures the field.
- **Vitals:** simple physiology model (HR, MAP, SpO2, EBL, MEP) with noise and
  responses to blood loss and occlusion time; ECG drawn on a 2D canvas.
- **Demo mode:** each stage has a scripted action sequence driving the same tool
  APIs as the user; any click stops the script and hands control back.
- **Anatomy is stylized/approximate**, not patient-derived. Comments explain each
  structure's relevance for learners.

## Milestones (each runnable with `npm run dev`)
- **M1** Scene, microscope camera controls, post-processing look, basic anatomy
  (lobes, fissure, arachnoid, vessels, nerves, aneurysm, spatulas), pulsation, disclaimer start screen
- **M2** Toolbar (1–0 shortcuts), cursor models, hover highlight, per-tool interactions
- **M3** Stage system, left checklist, mentor panel (collapsible, sub-tasks, %), EN/FR toggle
- **M4** Vitals panel + ECG, bleeding/oozing, bipolar, suction, rupture, temporary clip + timer
- **M5** Clip placement & evaluation, ICG view, Doppler audio, endoscope PiP
- **M6** Debrief screen, demo mode, polish, performance pass

After each milestone: run dev server + `tsc` + tests, fix errors, report what to test.

## Questions (defaults assumed if you don't say otherwise)
1. **French text** — I'll write the FR translations myself; fine to have you review them later? *(default: yes)*
2. **Controls** — left-drag = use tool, right-drag = move scope, wheel = zoom. *(default)*
3. **Difficulty** — one fixed anatomy/difficulty to start, randomized variants later? *(default: fixed)*
4. **Commits** — commit at the end of each milestone on `main`? *(default: yes)*
