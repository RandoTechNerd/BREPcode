# Subtle features: before / after (2026-10-26, claude-opus-5-5)

Branch `drawing-subtle-features` against `image-to-model-v1` (the "before",
run from a clean checkout of that branch). Same model, same options (3 tries,
3 candidates, self-check and look-compare on). Nothing was submitted to the
leaderboard.

## Sample 121 (octagonal flange, public)

The private ground truth is not available, so 121 is scored against a
**hand-made reference** (`public/ref/121-octagon-flange.mjs`): a person's
reading of the drawing, built in BREPcode. It is a yardstick for before vs
after, not a leaderboard estimate. One caution: the reference was corrected
once after the first "after" run, when that run read two things better than
the first draft of the reference had. SECTION A-A leaves the trapezoid windows
unhatched, so they go through, and the iso view shows bosses round the hub-rim
holes and spoke pockets on the plate face. Both corrections rest on the
drawing, but the reading is still one person's.

| run | CAD | shape | interface | topology | through-holes (b1, ref 16) | notes |
|---|---|---|---|---|---|---|
| before (v1) | 0.541 | 0.631 | 0.547 | 0.346 | 9 | ribs are short square-cut blocks that stop before the hub; windows blind from the top; no R5 corners, no hub-rim bosses |
| after, run 1 | **0.867** | 0.808 | 0.912 | 0.892 | 17 | sloped ribs to the hub at 25.12°, through windows with R5 TYP corners, spoke pockets, hub-rim bosses |
| after, run 2 | **0.732** | 0.705 | 0.912 | 0.428 | 25 | same features; the Ø10 rim holes went through, which costs topology |

Both "after" runs produced sloped ribs that reach the hub. The self-check
caught run 1's first build (ribs at 21° instead of 25.12°, the far probe
empty: "the rib stops short") and the fix round corrected it. Run to run, the
reading still varies on what goes through (topology).

Images: `subtle-features/121/before-after.png` (drawing, before, after,
reference), and each blueprint on its own. The blueprints are drawn with the
`blueprint-layout` branch's layout code, so the old ISO-label collision does
not show; this branch does not change the blueprint code. Outline overlays
of the drawing's views (model outline in red) are in
`after-pub/121/outline-*.png`.

## Other public samples (no ground truth)

Validity: every output of both runs passes the dataset's own
`sanity_check_submission.py` (is_valid, watertight).

The outline proxy (`public/outline-proxy.mjs`) draws each output in the
sample's main views (the same crops for both runs) and compares the outline
with the drawing. It sees the outer shape only (ribs and steps inside the
outline barely move it), so treat it as coarse.

| sample | outline before | outline after | self-check after (missing) | cost before -> after |
|---|---|---|---|---|
| 102 | 0.748 | 0.756 | 1.00 (0) | $0.62 -> $2.05 |
| 121 | 0.792 | 0.789 | 1.00 (0) | $1.23 -> $3.25 |
| 128 | 0.911 | 0.908 | 0.72 (7) | $1.60 -> $1.84 |
| 139 | 0.956 | 0.958 | 1.00 (0) | $1.79 -> $1.36 |
| 148 | 0.715 | **0.892** | 0.86 (15) | $2.47 -> $5.69 |

The "before" self-check scores are not comparable: v1 checked only holes,
bosses and slots, while v2 also checks fillets, slopes, levels, probes and
callouts.

## Practice set (real ground truth): regression guard

| sample | before CAD | after CAD |
|---|---|---|
| p07-bearing-housing | 1.000 | 0.992 |
| p12-rib-bracket | 0.996 | 0.992 |
| p17-gusset-angle | 0.994 | 0.997 |
| p20-hub | 0.996 | 0.996 |
| **mean** | **0.996** | **0.994** |

No regression beyond run-to-run noise (all 4/4 valid, interface and topology
1.000 in both). These drawings have no sections or TYP callouts, so they
cannot show the gain; they only show that nothing broke.

## Regression note

- **Cost and time went up**: the layout call, the view crops and a fix round
  that now also runs on outline differences. Practice: $1.66 -> $3.21 for 4;
  public: $7.71 -> $14.18 for 5. 148 took 37 min (11 calls). `--no-views`
  turns the layout pass and the outline compare off.
- **The outline compare is advisory.** Extension and dimension lines that
  touch the part fill in as material on some drawings; the lines say so, and
  the overlay pictures let the AI tell. Detail views are skipped. Sections are
  compared only when the cut is on a principal axis (A-A on 121, not a
  diagonal C-C unless the AI gives it axes).
- **Self-check limits found on 128**: arc slots (curved, on a bolt circle) are
  still checked as straight slots and fail, an old limit that now weighs more
  because a fix round follows. Step levels are now checked in both the matched
  frame and as written. A callout pointing at the body (not a feature id) is a
  note, not a failure.
- During the after-pub run, `src/selfcheck.js` got those two fixes (levels,
  body callouts) while 139, 121 and 148 were still building, so part of that
  run used them and part did not.
- The full test suite passes; `test/plantpot.js` once ran over its build-time
  limit while the benchmark loaded the CPU, and passes on its own.
