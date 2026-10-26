# Design mode

Design mode is the point-and-click way of working on a BREPcode model. It is a
second way of editing the same thing, not a second model: every action writes
into the code, and the code stays the single source of truth. Switch back to
Code mode and you see exactly what was done, on every kernel (NVIDIA SMLib, the
Rust kernel, the JS fallback), because nothing in Design mode talks to a kernel
directly.

The switch is the Code | Design pill at the top left (`viewer/design.js`,
remembered as `localStorage["brepcode.mode"]`, shown as `body.design-mode`).
Code mode is unchanged by any of this.

## Phase 1: the shell

| Piece | File | What it does |
|---|---|---|
| Shell | `viewer/design-shell.js` | builds the UI below, wires it to the viewer through a small `host` object made in `index.html` |
| Model browser | `viewer/design-tree.js` | one row per modelling call, nested as the code nests them; helpers and shape variables are their own groups |
| Timeline | `viewer/design-timeline.js` | the kernel's feature history left to right, each step linked to the call that made it |
| Move gizmo | `viewer/design-gizmo.js` | three.js `TransformControls` on the selected shape |
| Move writer | `viewer/design-move.js` | `moveText()`, the one writer behind the body drag and the gizmo; `ridersOf()`, what a move carries |

All of it is hidden unless `body.design-mode` is set (`.dz-ui`).

### Model browser

Built from `codemap.parseCode()` (exact call ranges) plus the last build's
feature map (`featureMap`, also `brepscript.featureSites()`), so it is the same
on every kernel. A row shows the call, its `id:` name, `×n` when one call makes
several shapes, and its plain arguments. Clicking a row selects exactly as a
click on the model does (`selectFeature()` in `index.html`: handles, outline,
the call selected in the editor). A boolean or transform row selects its first
shape; for a boolean that is its main shape, and moving it moves the whole
boolean, the same as grabbing it on the model.

While you type the tree follows the text, greyed until the build lands.

### Timeline

`lastFeatures` (what the kernel was asked to build). Primitives link through
the feature map. A boolean, fillet or chamfer has no trace entry, so it is
placed from the features its params name (a boolean's `targetSolid` and
`targets`, a fillet's edge names): the trace records, for every primitive, the
chain of calls it was made inside (`path`), and the step belongs to the
innermost call those chains share that is the right word (`union` for UNION,
`difference` for SUBTRACT, the `fillet()` itself for a fillet). When the run
text is not a verbatim slice of the editor text (autoFix rewrote it) these
steps are left unlinked rather than guessed.

### Selection

A click on the model in Design mode also picks the face under the cursor
(`mesh.userData.faceName`). The selection card shows the feature, the face and
the edges around it by the names `fillet()` / `chamfer()` take (`A|B[n]`, from
`edgesOfPickedFace(mesh)`); click an edge to copy its name. On a worker build
the edges are also drawn on the model.

### Move gizmo

Arrows and planes on the selected shape (the Move tool, on by default; Select
turns it off). Dragging slides the shape's meshes, or translucent ghosts for a
cutter, without touching the kernel. On release the delta, snapped to the
toolbar's step (1, 0.5, 0.1 mm or free), is written with `moveText()`:

- a `drill()` gets its point rewritten,
- a call already inside `translate([…], …)` has the move folded into it,
- anything else is wrapped in `translate([dx, dy, dz], …)`.

Then the usual history push and rebuild, and the selection and gizmo come back
on the rebuilt shape. While the gizmo's handle is under the pointer the
viewer's own press handling (body drag, pick, orbit) stands aside.

**Pattern members.** A shape made by a loop, a helper called twice or a
variable used twice comes from ONE call, so a move edits that call and every
instance moves. Design mode says so in the selection card ("this one call
makes n shapes… moving it moves all n") rather than pretending to move one.
Moving a single instance means changing the code's structure (pull that
instance out into its own call, or edit the loop variable), which is a
decision about the user's code, so it is left to a later phase as an explicit
"break out this instance" action.

**Booleans and helpers.** Grabbing a boolean's main shape moves the whole
boolean, and the preview now carries every shape a helper builds from inside
it too (`ridersOf()` reads the trace path), so `union(cube(…), peg(10))`
previews the peg moving along, as the written code will.

### Toolbar

A thin strip across the top; double-click it or press ▾ for the full ribbon
(remembered as `localStorage["brepcode.ribbon"]`). Extrude, Revolve, Hole,
Press-pull, Fillet, Chamfer, Shell and Pattern are placeholders for phase 2.

### Hooks

`brepscript.design()` returns the shell's state (tree rows, timeline steps and
the text they link to, the selection, the picked face and its edges, the
gizmo's shape). Tests: `test/design.js` (in `npm test`) and
`npm run test:design` (Electron, against `npm run serve`; writes screenshots).
