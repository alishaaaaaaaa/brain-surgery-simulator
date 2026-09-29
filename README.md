# IC-PC Aneurysm Clipping Simulator

Browser-based **educational** simulator of microsurgical clipping of a right internal
carotid–posterior communicating artery (IC-PC) aneurysm via a pterional, transsylvian
approach.

> For education and demonstration only. Not a clinical training device and not medical
> advice. Anatomy is simplified and procedurally generated.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit + anatomy layout tests
npm run build      # typecheck + production bundle
```

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

Instruments: `1` suction · `2` micro scissors · `3` bipolar · `4` dissector · `5` spatula ·
`6` aneurysm clip (`Q`/`E` rotate, `[` `]` blade depth, `C` straight/curved) · `7` ICG ·
`8` Doppler · `9` endoscope · `0` temporary clip.

## Tuning

All anatomy sizes, positions and colours live in [`src/config/anatomy.ts`](src/config/anatomy.ts)
(millimetres; the coordinate frame is documented at the top of that file). Gameplay
values (rupture-risk increments, suction rate, dissection stroke length) live in
[`src/config/sim.ts`](src/config/sim.ts).

`src/anatomy/layout.test.ts` checks that key structures stay visible, don't intersect,
and that the neck adhesions can be reached, so run `npm test` after tuning.

See [PLAN.md](PLAN.md) for architecture and milestones.
