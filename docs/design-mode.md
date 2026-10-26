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

### Handles and gestures

The selection's handles are dots of constant on-screen size (`viewer/handle-dots.js`):
corners ~6 px light, faces ~5 px accent, a 20 px hit area. Hovering one rings
it; resting on it (`mat.handleDwellMs`, default 600 ms) shows arrows for the
ways it moves (a face both ways along its normal). A plain drag stays on those
directions; a face drag shows a signed distance by the cursor.

- **Alt-drag on a shape or a face dot** (Design mode) = free move in the screen
  plane, written by `moveText()` like every move (fold into a `translate`, else
  wrap). Code mode keeps Alt-drag on the model = resize the face under the cursor.
- **Double-click a dot** = a small box per number behind it (a face: that side;
  a box corner: x, y, z; a round shape's corner: its named sizes; a drill's aim
  dot: its point). Enter writes the changed values at their exact ranges
  (`design-edit.js writeNumbers`), Esc or a click away cancels. A size that is
  a name (`const w = 60;`) is edited at its declaration; an expression has no box.
- **Alt-drag on a box corner** = all three sizes change with the OPPOSITE corner
  held: the call's own size numbers plus the translate that keeps the far
  corner put (half the growth for `center: true`), written as one undo step
  (`design-edit.js boxCornerText`). The box stays a `cube([…])`; it is never
  converted to `freeform()`. Refused (with a hint) when a size is an
  expression, or two sides share one name and are pulled apart. Like every
  edit, it changes a pattern member's shared call. The drag is read on world axes:
  a box inside a `rotate()` would take those as its own axes (Phase 2 should map them).

A still click on a dot in Design mode does not re-select (it is half of a
double-click, and re-selecting would pop the code panel over the dot).

### Toolbar

A thin strip across the top; double-click it or press ▾ for the full ribbon
(remembered as `localStorage["brepcode.ribbon"]`). Phase 2 fills it in (below).

### Hooks

`brepscript.design()` returns the shell's state (tree rows, timeline steps and
the text they link to, the selection, the picked face and its edges, the
gizmo's shape). Tests: `test/design.js` (in `npm test`) and
`npm run test:design` (Electron, against `npm run serve`; writes screenshots).

## Phase 2: feature dialogs

| Piece | File | What it does |
|---|---|---|
| Writers | `viewer/design/features.js` | the text every feature writes (no DOM, no kernel); tested in `test/design.js` |
| Dialogs | `viewer/design/dialogs.js` | the panels, their picks on the model, the live preview; loaded on first use |
| Press-pull | `viewer/design/presspull.js` | the face drag; loaded on first use |
| Words | `src/dsl.js` | `shelled`, `mirrored`, `linearPattern`, `circularPattern`, `drill` cbore/csink, `fillet`/`chamfer` by edge name, `linearExtrude`/`revolve` `on` a plane, `rotate`/`scale` `about` a point |

Every new word is built from what all three kernels already build exactly
(boxes, cylinders, extrusions, revolves, booleans, fillets), and `test/design.js`
builds each one on the JS kernel, the Rust kernel and NVIDIA SMLib (when the
addon is built) and checks the volume.

### Where a feature goes

As in a history-based CAD: a feature on a **body** (fillet, chamfer, hole,
extrude join/cut, press-pull past a shape's own size) wraps the body's
outermost call, so it comes after everything already in it. The body is found
through the trace `path` (variables and helpers included); members of a
`group()` are separate bodies. A feature on a **shape** (shell, rotate, scale,
mirror, a pattern) wraps that call and the transforms around it; a pattern of
a main shape takes its whole boolean, as a move does. A hole or a cut joins a
body that already is a `difference(…)` as one more argument line.

### The dialogs

| Tool | Picks | Writes |
|---|---|---|
| Extrude | a flat face | `union(body, linearExtrude({ h, on }, polygon([…])))`; Cut: `reverse: true, proud: 0.5` into the body; New body: one more `group()` member; Symmetric: `center: true`. A round face writes a placed `cylinder()` (exact) |
| Revolve | a flat face, an axis (one of its sides or a world axis) | `revolve({ angle, on: { origin, normal, x } }, polygon([…]))`, join / cut / new |
| Hole | a point on a face | `drill(p, n, { d, depth \| through, cbore \| csink })` |
| Fillet, Chamfer | edges, clicked (the nearest edge of the face under the click) | `fillet({ r, edges: ["A|B[0]", …] }, body)` |
| Shell | the selected shape, faces to leave open | `shelled({ wall, open: "top" }, shape)` |
| Mirror | the selected shape; a world plane or a flat face | `mirrored({ normal, at }, shape)` |
| Linear / Circular pattern | the selected shape | `linearPattern({ count, step, count2, step2 }, …)`, `circularPattern({ count, axis, center, angle }, …)` |
| Combine | the selected body (target), bodies clicked (tools) | the tools move into `union/difference/intersection(target, …)` |

Each change is written and built as a **live preview** (`host.preview`: the real
kernel, no undo step). The panel shows the line it will write. OK keeps it as
one undo step (no rebuild: the preview is already on screen); Cancel or Esc puts
the text back exactly. A preview the kernel refuses turns the dialog's status
red with the kernel's reason, and OK waits for one that builds. Spans are always
read against the text the dialog opened on, never the preview's.

### Press-pull

The Press-pull tool: drag any flat face (or a cylinder's round side) along its
normal. A translucent slab shows what comes (green) or goes (red), with a signed
`+5 mm` / `−3 mm cut` label at the cursor; 1 mm steps, Ctrl 0.1, Shift 5.

- A box side or a cylinder's end with a plain size number: out grows, in
  shrinks, by editing that number (plus the `translate` that keeps the far side
  put; half of it for `center: true`). Only when the shape is not turned.
- Past the shape's own size, or a face with no number behind it: the face's
  outline is extruded, joined outward, cut inward on through whatever lies
  beyond, as deep as it was pushed.
- A cylinder's round side pulls its radius.

### Rotate and Scale

Gizmo modes beside Move. Rotate shows one ring per axis and writes
`rotate([0, 0, deg], { about: centre }, …)`, folding a second turn about the same
axis and point into it (5° steps with snap on). Scale is uniform, by the centre
dot: `scale(k, { about: centre }, …)`, folding by multiplying. The stock gizmo's
plane squares and centre block are gone (the "green square at the centre"):
Alt-drag is the free move.

### Failed features

Every build reports its outcome to the shell (`fireBuilt` → `buildResult`).
When the kernel refuses, the feature list it was asked for is linked like a
good build's and the step the message names (`"F F2: …"`) turns red, later
steps dashed ("not built"), the reason beside the timeline. A message that
names no step blames the last one.

### Fixes from the phase 1 review

- In Design mode a pick no longer opens the code card (`selectCodeRange`); the
  call is still selected in the editor for when it is opened.
- The status hint speaks of dots: face / corner dots, arrows after a rest,
  Alt-drag free, double-click to type.
- The green square at the gizmo's centre (three.js' XZ plane handle) is gone.

### Hooks and checks

`brepscript.openFeature(id)`, `brepscript.featureDialog()` (`set`, `takePick`,
`ok`, `cancel`, `debug`), `brepscript.toScreen([x, y, z])`.
`npm run test:design2` drives every dialog, press-pull and the gizmo modes in an
offscreen Electron window against `npm run serve` and saves screenshots.

### Known limits (phase 2)

- Edge names count in build order: inserting a shape before a fillet's body
  renames its edges. The fillet then refuses with "no edge … pick the edges
  again" instead of rounding the wrong ones.
- A face outline is read from the tessellated face: curved boundaries (a
  fillet's rounded corner) come out as short straight segments, not arcs.
  Phase 3's arcs make that exact.
- An extruded face ignores holes in it (a pulled-up plate with drill holes
  covers them).
- `shelled()` takes a box (rounded or not), a cylinder or a straight-sided
  extrusion; anything else refuses with a reason.
- Mirror/pattern of a pattern member edits the shared call (all instances).
- Part-turn revolves are refused by the NVIDIA kernel today (the
  `nvidia-gaps` branch fixes it); auto mode falls back to the Rust kernel.

## Phase 3: the sketcher

| Piece | File | What it does |
|---|---|---|
| Word | `src/dsl.js` `sketch()` | a constrained sketch as code; solved by the kernel's `ConstraintSolver` (`useSketchSolver`), built as an exact profile |
| Model | `viewer/design/sketch-model.js` | the sketch as data: tools, trim, offset, constraints, dims, solve, read from / write to code (no DOM) |
| Sketcher | `viewer/design/sketcher.js` | the plane chooser, the square-on view and grid, drawing, the panel, Finish; loaded on first use |

### The code it writes

```js
const slotW = 34;
const sketch1 = sketch({
  on: { origin: [0, 0, 8], normal: [0, 0, 1] },
  points: [[13, 10], [47, 10], [47, 26], [13, 26], [50, 20]],
  curves: [["line", 0, 1], ["line", 1, 2], ["line", 2, 3], ["line", 3, 0], ["circle", 4, 4]],
  constraints: [["horizontal", 0, 1], ["vertical", 1, 2], ["horizontal", 2, 3], ["vertical", 3, 0], ["fixed", 0]],
  dims: [["distance", 0, 1, slotW], ["distance", 1, 2, 16]],
});
return difference(cube([60, 40, 8]), linearExtrude({ h: 4, reverse: true, proud: 0.5 }, sketch1));
```

- `on`: `"XY"`, `"XZ"`, `"YZ"` or a face's plane (`planeFrame` sets its axes).
- `curves`: `["line", a, b]`, `["arc", center, start, end]` (counter-clockwise),
  `["circle", center, r]` (the radius is its own number, so it can be a const),
  `["bezier", a, c1, c2, b]`; a trailing `"construction"` leaves a curve out of
  the profile (an axis, a reference line).
- `constraints`: coincident, horizontal, vertical, parallel, perpendicular,
  tangent (line a–b touching an arc at its end p: `["tangent", a, b, center, p]`),
  equal, fixed, onLine, midpoint. `dims`: distance, angle.
- The points are the solved positions (the sketcher writes them solved) and the
  starting guess. Whenever they disagree with a constraint or a dim, sketch()
  re-solves with the kernel's solver, so a dim that is a `const` is a slider.
  The viewer and the Node path (`src/render.js`) register the solver; the
  viewer waits for it before building code with a `sketch(`.
- The profile: closed loops of the non-construction curves chained through
  shared points. Loops inside loops alternate outline / hole; separate outlines
  are islands, one body each (as a difference() tool every one cuts).
- The kernel sketch (`persistentData.sketch`) carries the constraints and dims
  too, by the glyphs the BREP.io solver uses (━ │ ⟺ ⏚ …), mapped onto its points.
- `revolve({ angle, axis: [i, j] }, sketch1)` spins about the line through two
  of the sketch's points (a construction line). A profile clear of its axis
  now revolves into a ring (it used to be refused: `test/edgeops.js`).

### Using it

Sketch (toolbar) → pick XY / XZ / YZ, click a flat face, or Edit an existing
`sketch()`. The view turns square-on (rotation off; pan and zoom stay) with a
1 mm / 10 mm grid. Keys: L line, R rectangle, C circle, A arc, S spline, T trim,
O offset, X construction, D dimension, Esc ends a chain / back to select, Enter
finishes a spline, Delete removes the selection. Points snap to existing points
(9 px) and the grid (Alt: free). A line drawn within 3° of level or plumb gets
horizontal / vertical. In select mode, drag a point: the rest re-solves around it.
Click a dimension label to type its value or name it (★: it becomes a `const`
at the top, a slider). Finish as Extrude (join / cut / new body), Revolve (about
the sketch's Y axis or a construction line) or the sketch alone: one undo step.
A sketch drawn on a face joins / cuts that face's body. Editing rewrites the
call in place.

Checks: `node test/design.js` (sketch() on JS, Rust and NVIDIA; the model's
tools; the round trip), `npm run test:design3` (Electron, real mouse clicks,
screenshots).

### Known limits (phase 3)

- Trim cuts lines (and deletes a whole curve otherwise); offset takes outlines
  of straight lines and circles. Arc and spline trim/offset are not done.
- Constraint glyphs mark each rule but cannot be clicked to delete one; Delete
  removes curves (and the rules on their points), not single constraints.
- A face's edges are not projected into the sketch as references yet; snap is
  to the sketch's own points and the grid.
- `on` a face is written as numbers (its plane), not as a link to the face: move
  the body and the sketch stays put.
- The solver is the BREP.io one (iterative): a heavily over-constrained sketch
  settles where it can and says nothing more precise than "not satisfied".
