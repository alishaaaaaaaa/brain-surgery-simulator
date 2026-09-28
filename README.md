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

## Tuning the anatomy

All sizes, positions and colours live in [`src/config/anatomy.ts`](src/config/anatomy.ts)
(millimetres; the coordinate frame is documented at the top of that file).
`src/anatomy/layout.test.ts` checks that key structures stay visible and don't
intersect, so run `npm test` after tuning.

See [PLAN.md](PLAN.md) for architecture and milestones.
