# IC-PC Aneurysm Clipping Simulator

Browser-based **educational** simulator of microsurgical clipping of a right internal
carotid–posterior communicating artery (IC-PC) aneurysm via a pterional, transsylvian
approach, seen through an operating microscope. English and French.

> For education and demonstration only. Not a clinical training device and not medical
> advice. Anatomy is simplified and procedurally generated.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit, anatomy-layout and clip-evaluation tests
npm run build      # typecheck + production bundle
```

On the start screen choose **Start** to operate, or **Watch demo** to see the whole
procedure performed step by step (click in the field or press any key to take over).

## The case

Six steps, each unlocked when the previous one is done (left panel; the mentor at the
bottom right explains each):

1. Open the sylvian fissure — cut the arachnoid, keep retraction gentle, keep the field dry
2. Identify M1 — rest the cursor on it, confirm flow with the Doppler
3. Identify the ICA and optic nerve — open the carotid cistern
4. Confirm the PCom and dissect the neck — free both sides of the neck, stay off the dome
5. Clip the aneurysm — across the neck, no temporary clip left on
6. Confirm PCom patency — Doppler flow in ICA, PCom and AChA, a silent dome, and ICG

Rough handling of the dome can cause a rupture (suction → temporary clip on the ICA →
clip the neck). The vitals monitor reacts to blood loss and temporary occlusion. When the
last step is done — or any time via **End case** — the debrief summarises time, blood loss,
occlusion, rupture and the clip result, with tips.

## Controls

| Input | Action |
|---|---|
| `1`–`0` | Pick up an instrument (press again or `Esc` to put it down) |
| Left-drag | Use the instrument in hand (with no instrument: tilt the microscope) |
| Right-drag / `⌥` + drag | Tilt the microscope |
| `Shift` + drag / arrow keys | Move the microscope |
| Wheel / `+` `−` | Zoom |
| `L` | Anatomy labels |
| `R` | Reset view |
| `H` | Show / hide the controls help |
| `M` | Sound on / off |
| `D` | Start the demo |

Instruments: `1` suction · `2` micro scissors · `3` bipolar · `4` dissector · `5` spatula ·
`6` aneurysm clip (`Q`/`E` rotate, `[` `]` blade depth, `C` straight/curved; 5/7/9 mm in the
toolbar) · `7` ICG · `8` Doppler · `9` endoscope (click to hold in place) · `0` temporary clip.

## Tuning

All anatomy sizes, positions and colours live in [`src/config/anatomy.ts`](src/config/anatomy.ts)
(millimetres; the coordinate frame is documented at the top of that file). Gameplay and
physiology values — rupture threshold, bleeding rates, suction, MEP tolerance to
occlusion, flow collaterals, ICG timing — live in [`src/config/sim.ts`](src/config/sim.ts).

Run `npm test` after tuning: the tests check that key structures stay visible and don't
intersect, that the neck adhesions can be reached, and that a clean, complete clip is
still achievable with the clip tool.

## Code map

```
src/
  config/     anatomy.ts (all anatomy), sim.ts (gameplay/physiology tuning)
  core/       event bus, shared state, clock, heart
  scene/      renderer, microscope camera, lighting, post-processing, autofocus,
              ICG view, endoscope view, adaptive quality
  anatomy/    procedural brain, vessels, nerves, aneurysm, arachnoid, adhesions, spatulas
  tools/      instrument models, tool manager, one module per instrument
  physics/    bleeding, CSF, physiology, clip evaluation, flow model
  procedure/  stages, tracker, complications, debrief logic, clip planner, demo director
  audio/      synthesized Web Audio sounds
  ui/         panels (checklist, mentor, vitals, toolbar, debrief), i18n (EN/FR)
```

Debugging: `__sim` in the browser console exposes the simulation (e.g.
`__sim.state.ruptureRisk`, `__sim.getFlow()`, `__sim.simulate(0.1)`).
