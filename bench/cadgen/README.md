# bench/cadgen: getting BREPcode ready for CADGenBench

[CADGenBench](https://github.com/huggingface/cadgenbench) gives an engineering
drawing (`input.png` + `description.yaml`) and scores one `output.step` per
sample. The scoring has a validity gate (a watertight, meshable B-rep, else 0)
and then 0.4 shape similarity + 0.4 interface match + 0.2 topology (Betti
numbers). The ground truth is private, but the evaluator is open source. This
folder holds the tooling to measure our own generator locally before
submitting anything. **Nothing here submits to the leaderboard.**

## What is here

| Path | What it does |
|---|---|
| `src/stepexport.js`, `src/cli.js --step` | Headless **exact** STEP export, written by the Rust kernel's own AP242 writer (true planes, cylinders, cones, B-splines). It refuses with exit 2 when a model fell to the mesh lane or the JS fallback. |
| `practice/parts/*.mjs` | 20 practice parts written in BREPcode: plates, flanges, brackets, a pillow block, a bearing housing, a channel, standoffs, a clamp, a spacer, a stepped block, a lid, a rail, a fixture plate, a shaft support and a hub. They use counterbores, countersinks, slots, pockets, bosses, ribs, gussets, chamfers and fillets. |
| `make-practice.mjs` | Builds each part into `practice/data/` in the evaluator's local layout (below). |
| `lib/features.mjs` | One feature list per part drives the GT cutters, the interface jigs and the drawing callouts, so the three can never disagree. |
| `lib/drawing.mjs` | A white-sheet engineering drawing: OCCT hidden-line TOP / FRONT / RIGHT views of the GT STEP, an isometric view, overall dimensions, baseline position dimensions for every feature, hole/slot/cbore/csk callouts with collision-avoiding leaders, notes and a title block. Rendered to a 3072 px PNG with headless Chromium. |
| `run.mjs` | Generator v1: picture to feature table to BREPcode to exact STEP, self-checked, with candidates and a look-compare; also the editing track (details below). |
| `lib/blueprint.mjs`, `lib/measurestep.mjs` | The app's blueprint of a candidate STEP (look-compare); measurements of an input STEP (editing). |
| `score.mjs` | Runs cadgenbench's own `evaluate` against the practice GT, then prints the per-sample CAD Score with its shape / interface / topology breakdown. |
| `lib/runcode.mjs`, `lib/validity.py`, `lib/tiles.py` | Child-process build of AI code, the evaluator's validity gate, and the drawing tiler (also gray view crops for the outline compare). |
| `public/ref/*.mjs`, `public/make-ref.mjs` | Hand-made references for public samples (so far 121), built into `public/data/gt/` so a public drawing can get a CAD Score. A person's reading of the drawing, **not** the private ground truth: for before/after only. |

### Practice data layout (what `cadgenbench evaluate` reads)

```
practice/data/inputs/<id>/input.png, description.yaml
practice/data/gt/<id>/ground_truth.step          exact, centred on the origin
practice/data/gt/<id>/jig_<ctx>__<i>__KOR|KIR.step  interface sub-volumes
practice/data/gt/<id>/truth.json                 the feature list: our own dimension table
practice/data/gt/<id>/drawing.svg                the drawing before rasterising
```

A hole's KOR jig is exactly its empty volume (bore + counterbore or
countersink, nothing protruding). A boss's KIR jig is its material. Features in
one mating pattern share a `ctx`, so a group scores as its worst feature, as on
the leaderboard. The GT scored against itself averages 0.998: 19 samples score
1.0, and p11 (a nearly rotationally symmetric disc) scores 0.964, which is the
aligner's ceiling on that part.

## Setup and use

```bash
bench/cadgen/setup-eval.sh                 # evaluator venv (pins build123d 0.10 / OCP 7.9)
node bench/cadgen/make-practice.mjs        # (re)build GT + drawings; or: make-practice.mjs p03 p10
node bench/cadgen/run.mjs --run v0         # generate: results/v0/<id>/output.step
node bench/cadgen/score.mjs v0             # score with the open evaluator (~7 min for 20)
node src/cli.js model.js --step out.step   # exact STEP of any model
```

`run.mjs` options: `--only p01,p07`, `--parallel 4`, `--tries 3`, `--no-views`,
`--model claude-opus-5-5`, and `--inputs <dir>` to run on any folder of
CADGenBench-style inputs (for example the public dataset).

## Generator v0

For each sample, headless Claude Code (`claude -p`, `--tools ""`,
`--strict-mcp-config`, a replaced system prompt) receives the sheet as an
overview plus four zoomed tiles. It must answer with:

1. a **JSON dimension table**: the frame, overall size, body pieces, and every
   hole/slot/pocket/boss with its position, axis, diameter, depth or THRU,
   cbore, csk and the callout it read;
2. **BREPcode** built from that table.

The system prompt is `LLM_PROMPT.md` + `EXACT_RULES` (`src/exactlane.js`) +
`BENCH_RULES` (in `run.mjs`). The benchmark rules cover how to read the
drawing, exact lane only, no `$fn` on holes, `drill()` with
`cbore`/`csink`, one unioned solid, and the rotate order.

The code is built in a child process on the split engine (exact lane or
refusal), centred, exported as exact STEP and checked by the evaluator's
validity gate. On a syntax, build, mesh-lane or validity failure the AI gets
the error back, for up to 3 attempts.

## Generator v1 (default)

v1 reads and checks with the app's own shared modules, the same code the
chat runs when someone attaches a picture and asks for a model:

| Module | Used by | What it does |
|---|---|---|
| `src/imageread.js` | chat + `run.mjs` | The reading rules for ANY picture (dimensioned drawing, hand sketch, photo, screenshot; an undimensioned picture asks for one size or marks its estimate "guessed"), the feature-table schema, the reply parser, the overview + zoomed tile plan, AI-requested zoom crops, and the fix / look-compare / candidate prompts. |
| `src/selfcheck.js` | chat + `run.mjs` | Measures the built model off the exact kernel's faces (cylinder and cone axes, radii and extents fitted to each B-rep face; holes stacked with their counterbores and countersinks; through vs blind by a point-in-solid test; slot ends; bosses; flat faces) and diffs it against the table, trying three frame hypotheses so a frame mix-up is one note, not every feature wrong. |
| `viewer/curved.js` | chat + `lib/blueprint.mjs` | The 3-view blueprint, now with the real plan view (replicad's `"bottom"`) and the real third-angle right view (`"left"`). |

Per drawing sample: read + build (table, then code; build/validity errors go
back, `--tries`), **self-check** against the table (one fix round on any
disagreement), **candidates** (still disagreeing: `--candidates` - 1 fresh
readings in parallel, kept by 0.6 x own self-check + 0.4 x agreement with the
other candidates' tables), then **look-compare** (the kept model's blueprint
next to the drawing; the answer is kept only if it still builds and
self-checks no worse). `--no-check`, `--no-look` and `--candidates 1` turn
the stages off.

Per **editing** sample (`input.step` + `edit_description.txt`): the STEP is
measured (`lib/measurestep.mjs`: holes, bosses, flat faces in its own frame)
and read exactly by the Rust kernel (`importedSolid("input.step")`, IMPORT3D
`stepText`). The AI writes the edit on top; it is built without centring and
exported as exact STEP. The Rust kernel refuses some public STEPs (15 of 32
on 2026-10-26, B-spline seams it cannot close) and fails some booleans on
large imported solids; then the same code is built on the app's other exact
lane, OpenCASCADE (`viewer/curved.js`, the curved STEP export). An edit that
never builds falls back to the unedited input, logged as `fallback`.
`practice/parts/e01-plate-edit.mjs` is a practice editing sample.

`scripts/imageread-check.mjs` drives the same path through the app's chat in
Chromium with a mocked AI (tiles, table card, self-check, fix, blueprint).

## Subtle features (branch drawing-subtle-features)

v1 got the big shapes of CADGenBench drawings right and dropped the small
ones: R.. TYP fillets, shoulders and steps shown only in a SECTION, sloped
ribs, notches in a DETAIL view. Each costs shape IoU and a per-feature
interface score. The changes are in the shared modules, so the chat gets them
for any picture a user attaches, not only the benchmark:

| Stage | What changed |
|---|---|
| layout (new, bench) | A cheap first call on the overview finds every view (main, SECTION, DETAIL, ISO) with its region and axes. Each view is cut out and sent as its own zoomed crop with the tiles, so a section is read on its own. |
| reading (`src/imageread.js`) | A **checklist pass**: TYP / ALL notes, every section and detail view, every angle (a diagonal rib is sloped), section step heights, pattern counts, notes. Each lands in `callouts` pointing at the feature it became or saying why it is skipped. New feature fields: `r`, `angle`, `levels`, `probes`, `from`/`to`, and the table's `views`. |
| code rules (`BUILD_RULES`) | Sloped ribs as one side-outline polygon extruded and turned; shoulders, steps and tapers as ONE revolved half-section ring (coaxial revolves sharing faces are refused); fillets on the cutter or piece before the boolean (`fillet({ r, edges: "z" }, cutter)`); every feature built or logged with `// SKIP <id>: <why>`. |
| self-check (`src/selfcheck.js`) | Measures blends (fillet radii from partial cylinders and the tightest curvature of torus / B-spline faces) and plane tilts. Checks a fillet's radius, a rib's or taper's slope, a section's step levels, and **probe points** (material for ribs and shoulders, empty for notches and pockets: a rib that stops short leaves its far probe empty). Counts missing features, reads `// SKIP` lines, and fails a callout no feature uses. |
| outline compare (`src/silhouette.js`, new) | Draws the model in each view the drawing shows (a section clipped at its cut), places it on the view's crop at one scale by best overlap, and reports where the drawing has material the model lacks or the reverse, in model mm. Overlay pictures (model outline in red over the view) go with the fix and look-compare rounds, so the AI can tell a real difference from a dimension line. Detail views are skipped (they are magnified pieces). |
| chat (`viewer/index.html`) | The same self-check (probes, `// SKIP`) and the outline compare on the user's own picture, using the views the table lists; outline lines go into the fix and look-compare requests. |

Build costs measured while writing the rules: eight trapezoid pocket cutters
with `edges: "z"` fillets cut from a flange in 30-40 s; adding an R1 floor
fillet to each cutter took 4 min. One revolved half-section (hub wall, shoulder
and taper together) builds; the same pieces as separate revolves that share
faces are refused.

Results, the reference for 121 and the regression note:
`results/subtle-features.md`.

## Things learned building this

- **The Rust kernel writes STEP itself.** Call `WasmBrepSolid.export_step`
  through `solid_handle_to_buffer` + `from_buffer`. Some UNION results carry a
  duplicated loop-wire id that the validating codec refuses. Intersecting with
  an enclosing box rebuilds the ids without changing the geometry
  (`src/stepexport.js`). The kernel's boolean op names are lowercase
  (`"union"`, `"intersect"`).
- **replicad's named views:** `"top"` looks *up* from below. The real plan
  view is `"bottom"`, and the third-angle right view is `"left"`. The app's
  blueprint (`viewer/curved.js`) uses `"top"`, so its TOP view is actually a
  bottom view.
- **`rotate([a, b, c])` applies Z first, then Y, then X** on every kernel
  (three.js Euler order), the reverse of OpenSCAD. Gussets written
  OpenSCAD-style land sideways.
- The evaluator needs OCP 7.9 (OCP 8 breaks its `Bnd_Box.Get()`), plus
  OpenGL and an X server for its renders.

## Results on the practice set (claude-opus-5-5, 2026-10-26)

All scores come from cadgenbench's own `evaluate` against `practice/data/gt`.
Every run produced 20/20 valid exact STEPs on the first attempt, at about $0.15
and 40 s per sample.

| run | CAD | shape | interface | topology | what changed |
|---|---|---|---|---|---|
| GT vs itself | 0.998 | 1.000 | 0.996 | 1.000 | the ceiling: p11's symmetric disc aligns to 0.964 |
| `v0` | 0.969 | 0.954 | 0.976 | 0.987 | first run |
| `v0.1` | 0.994 | 0.991 | 0.995 | 1.000 | rules say `csink:` (and `drill()` takes `csk:`), the rotate order is stated |

The per-sample tables are in `results/<run>/scores.json`. The AI's dimension
table, code and attempt log for each sample are next to its `output.step`.

These drawings are cleaner than CADGenBench's: every feature has a baseline
dimension, there are no sections or detail views, and callouts are
machine-placed. Treat these scores as an upper bound on what the leaderboard
will show. What matters is the gap between runs.
