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
    F (fillet)    CH (chamfer)

plus `PartHistory`, `runHistory`, `scene.children`, `toSTL` and
`extractMultipleSolids`. Roughly fifteen to twenty entry points — a narrow
waist, and the reason a port is a project rather than a rewrite.

## How much of that already runs on OCCT

More than it looks. `viewer/curved.js` does not merely export STEP — it
RECONSTRUCTS the whole model tree in OCCT: the five primitives, transforms,
booleans, groups, hull, revolve, prism, textures, imports and edge ops. Curved
STEP, the 3-view SVG drawing and STEP import all go through it today.

So a port is not a blank page. What the live viewer still needs from BREP is a
mesh to draw and the feature-id trace that the drag handles and the
trace-to-site mapper are built on — that plumbing, not the geometry, is the
work.

## Where OCCT would genuinely be better today

Fillet and chamfer on CURVED shapes. BREP's edge ops are mesh-based, so they
round every facet edge of a curved wall rather than the one analytic edge that
is really there. Measured:

    cube([20,20,20])              12 tris ->   204 after fillet(2)   0.45s
    cylinder r10 h20 $fn16       ~100 tris -> 2,854 after fillet(1)   1.3s
    cylinder r10 h20 $fn48       ~300 tris -> 3,104 after fillet(1)   1.6s

A cube is fine. A cylinder is a 28x blowup for one rounded rim, and a fillet on
an imported mesh is worse again — measured earlier at 92 seconds turning 2.7k
triangles into 67k, because "every edge" includes every facet.

OCCT fillets the single circular edge exactly and cheaply. The OCCT edge op is
already written in curved.js; it is simply only reachable on export. Making it
reachable for the live model is the one targeted swap worth considering.

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
