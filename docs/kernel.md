# The kernel, and what happens if it goes away

## Where we stand

BREPcode is built on the BREP.io kernel (`brep-io-kernel`, Autodrop3d LLC). It
is now vendored into `vendor/brep-io-kernel` rather than fetched from npm.

The licence is MIT-shaped — use, copy, modify, merge, publish, distribute,
sublicense, sell — with three additions that matter:

1. Modifications must be contributed back, or the permissions are void. **This
   app has never modified the kernel**, which is why that clause has never been
   in play, and it is worth keeping that way.
2. The licence transfers to any successor of Autodrop3d LLC.
3. A dead man's switch: if Autodrop3d dissolves and nobody publicly hosts the
   source for eighteen consecutive months, clauses 1 and 2 cancel automatically
   and irrevocably, leaving what is effectively MIT.

There is no revocation clause. Unpublishing the package would not withdraw the
licence on a copy already obtained, and redistribution is expressly permitted —
which is what makes vendoring the right answer rather than a grey area.

So the exposure was never *losing the right to use it*. It was losing upstream
maintenance, and losing the ability to `npm install` on a fresh clone.

## The surface we would have to replace

The DSL only ever asks the kernel for seven feature types:

    B (boolean)   E (extrude)   R (revolve)   P (primitive)
    S (sketch)    XFORM         IMPORT3D

plus `PartHistory`, `runHistory`, `scene.children`, `toSTL` and
`extractMultipleSolids`. Roughly fifteen to twenty entry points — a narrow
waist, and the reason a port is a project rather than a rewrite.

## If a replacement were ever needed

**Vendor and freeze** — done. Days of work, and it removes the supply risk.

**Port to OCCT via replicad** — weeks to months. `replicad` and
`replicad-opencascadejs` are ALREADY dependencies: `viewer/curved.js` uses OCCT
today for true curved STEP export and the SVG drawing. The geometry does not
need inventing; the work is re-pointing the compile layer, then re-earning mesh
import and sewing, tolerances, tessellation quality, and the performance
characteristics that everything downstream assumes — the drag handles, the
trace-to-site mapper and the feature-id system all lean on current behaviour.

**Write one from scratch** — no. OCCT is about thirty years and over a million
lines. The hard parts are surface-surface intersection, tolerant modelling and
robust filleting, which is where naive implementations quietly produce wrong
solids instead of failing. `src/meshbool.js` in this repo is a taste of it: a
hand-rolled mesh boolean that is exactly correct below 12,000 triangles and goes
quadratic above.
