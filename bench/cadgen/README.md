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
| `run.mjs` | Generator v0: drawing to dimension table to BREPcode to exact STEP (details below). |
| `score.mjs` | Runs cadgenbench's own `evaluate` against the practice GT, then prints the per-sample CAD Score with its shape / interface / topology breakdown. |
| `lib/runcode.mjs`, `lib/validity.py`, `lib/tiles.py` | Child-process build of AI code, the evaluator's validity gate, and the drawing tiler. |

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

`run.mjs` options: `--only p01,p07`, `--parallel 4`, `--tries 3`,
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

## Things learned building this

- **The Rust kernel writes STEP itself.** Call `WasmBrepSolid.export_step`
  through `solid_handle_to_buffer` + `from_buffer`. Some UNION results carry a
  duplicated loop-wire id that the validating codec refuses. Intersecting with
  an enclosing box rebuilds the ids without changing the geometry
  (`src/stepexport.js`). The kernel's boolean op names are lowercase
  (`"union"`, `"intersect"`).
- **replicad's named views:** `"top"` looks *up* from below. The real plan
  view is `"bottom"`, and the third-angle right view is `"left"`. The app's
  blueprint (`viewer/curved.js`) uses the same views and the same
  [100,-100,100] isometric as these input drawings.
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
