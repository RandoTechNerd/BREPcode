// Building a model of separate parts one part at a time.
//
// The viewer worker splits a history into independent pieces (src/partsplit.js),
// builds them separately (in parallel on the desktop's kernel pool) and puts
// the results back together. The only thing that matters is that the result is
// IDENTICAL to one whole-model build: same solids, same names, same order, same
// triangles. So each case builds both ways and compares the STL text.
//
// The traps:
//
//   * a reference hidden in a fillet's edge names ("P.CU1_NX|P.CU1_NY[0]")
//     must tie the fillet to its cube, or the fillet lands in a piece with no
//     cube to round;
//   * "P.CU1" must not be read inside "P.CU10", or every part with ten or more
//     features would glue itself to part one and nothing would split;
//   * parts welded by union() or cut by a shared difference() are ONE piece;
//   * the compile-side half of this change: a fillet's edge lookup now runs
//     only its own child, and the features it writes must not change.

import { PartHistory } from "brep-io-kernel";
import {
  compile, cube, cylinder, sphere, difference, union, translate, group, fillet, hull, colorize,
} from "../src/dsl.js";
import { runEngine, solidsToSTL } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";
import { splitHistory, mergeOutputs } from "../src/partsplit.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) pass++;
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function history(shape) {
  const ph = new PartHistory();
  await compile(shape, ph);
  return JSON.parse(await ph.toJSON());
}

const plate = (i, holes) => translate([i * 50, 0, 0], difference(
  fillet({ r: 3, edges: "z" }, cube([40, 40, 5])),
  ...Array.from({ length: holes }, (_, k) => translate([6 + (k % 4) * 9, 6 + Math.floor(k / 4) * 9, -1], cylinder({ r: 2, h: 7, $fn: 16 }))),
));

const rust = await loadRustKernel();
const engine = (doc) => runEngine(doc, { rust, manifold: loadManifoldNode });

// ---- splitting -------------------------------------------------------------

{
  // twelve parts, so ids run past P.CU10 and the boundary matters
  const doc = await history(group(...Array.from({ length: 12 }, (_, i) => plate(i, 3))));
  const pieces = splitHistory(doc);
  check("12 separate plates split into 12 pieces", pieces?.length === 12, `got ${pieces?.length}`);
  check("every feature lands in exactly one piece",
    pieces && pieces.reduce((n, p) => n + p.features.length, 0) === doc.features.length);
  check("pieces keep the history's own order",
    pieces && pieces.flatMap((p) => p.features.map((f) => f.inputParams.id)).join() === doc.features.map((f) => f.inputParams.id).join());
  check("each piece carries the document around its features",
    pieces && pieces.every((p) => p.idCounter === doc.idCounter && "expressions" in p));
  const fillets = pieces?.map((p) => p.features.filter((f) => f.type === "F").length) || [];
  check("each fillet stays with its own cube", fillets.every((n) => n === 1), fillets.join());
}

{
  const one = await history(plate(0, 4));
  check("one part does not split", splitHistory(one) === null);
  const welded = await history(union(plate(0, 2), plate(1, 2)));
  check("parts welded by union() stay one piece", splitHistory(welded) === null);
  // difference(group(a, b), c) cuts only the group's LAST part (the op's
  // target), so a is still free and splits off
  const cut = await history(difference(group(plate(0, 1), plate(1, 1)), translate([60, 10, -1], cube([20, 10, 10]))));
  check("difference(group(a, b), c) splits a from b + c", splitHistory(cut)?.length === 2);
  const many = await history(group(...Array.from({ length: 40 }, (_, i) => translate([i * 12, 0, 0], cube([10, 10, 10])))));
  const folded = splitHistory(many, { maxPieces: 8 });
  check("forty tiny parts fold into at most maxPieces", folded?.length === 8, `got ${folded?.length}`);
  check("folding loses no feature", folded && folded.reduce((n, p) => n + p.features.length, 0) === many.features.length);
}

// ---- same model either way -------------------------------------------------

async function sameEitherWay(label, shape) {
  const doc = await history(shape);
  const pieces = splitHistory(doc);
  check(`${label}: splits`, pieces && pieces.length > 1, `got ${pieces?.length}`);
  if (!pieces) return;
  const whole = await engine(doc);
  const merged = mergeOutputs(await Promise.all(pieces.map(engine)), null, pieces);
  check(`${label}: same lane`, whole.lane === merged.lane, `${whole.lane} vs ${merged.lane}`);
  check(`${label}: same solids in the same order`,
    whole.solids.map((s) => s.name).join() === merged.solids.map((s) => s.name).join());
  check(`${label}: identical STL`, solidsToSTL(whole.solids, 0.05) === solidsToSTL(merged.solids, 0.05));
  check(`${label}: feature counts add up`,
    merged.stats.exactFeatures + merged.stats.meshFeatures === whole.stats.exactFeatures + whole.stats.meshFeatures);
}

await sameEitherWay("filleted perforated plates", group(...Array.from({ length: 4 }, (_, i) => colorize("#4fb3bf", plate(i, 5 + i)))));
await sameEitherWay("difference(group(a, b), c)",
  difference(group(plate(0, 1), plate(1, 1)), translate([60, 10, -1], cube([20, 10, 10]))));
await sameEitherWay("exact parts beside a mesh-lane hull", group(
  plate(0, 3),
  translate([60, 0, 0], hull(sphere({ r: 6 }), translate([15, 0, 0], sphere({ r: 6 })))),
  translate([100, 0, 0], cylinder({ r: 8, h: 12 })),
  translate([0, 60, 0], hull(sphere({ r: 3 }), translate([5, 0, 0], sphere({ r: 3 })))),
));

// ---- compile: a fillet's edge lookup runs only its own child ---------------

{
  // the same plate compiled alone and as the last of five must pick the same
  // edges: the lookup can't be reading the parts before it
  const alone = await history(plate(4, 3));
  const inGroup = await history(group(...Array.from({ length: 5 }, (_, i) => plate(i, 3))));
  const edges = (doc) => doc.features.filter((f) => f.type === "F").map((f) => f.inputParams.edges.length);
  check("a fillet in a group picks the same number of edges as alone",
    edges(inGroup).every((n) => n === edges(alone)[0]), `${edges(inGroup)} vs ${edges(alone)}`);
  const t = performance.now();
  await history(group(...Array.from({ length: 10 }, (_, i) => plate(i, 12))));
  const ms = performance.now() - t;
  check("ten filleted plates compile in well under a second", ms < 1500, `${Math.round(ms)} ms`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
