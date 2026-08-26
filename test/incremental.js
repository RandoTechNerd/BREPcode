// Rebuilding only what changed, without ever building something different.
//
// The speed is easy to demonstrate and beside the point. The only question that
// matters is whether an incrementally-rebuilt model is IDENTICAL to one built
// from scratch — because the failure mode here is not a crash, it is a model
// that looks built and is quietly wrong, and nobody checks a viewport against a
// mental image of what the code said.
//
// So every case below runs the same edit twice: once through a fresh
// PartHistory (what the app did before) and once through the reuse path, and
// compares the STL TEXT. Not vertex counts, not bounding boxes — the actual
// triangles. A vertex count would have passed a model with a hole in the wrong
// place.
//
// The cases are chosen to cover the ways reuse can go wrong:
//
//   * change a param on the LAST feature      — the easy case
//   * change a param on the FIRST feature     — everything downstream must be
//                                               invalidated, which is the
//                                               kernel's timestamp rule doing
//                                               its job rather than ours
//   * move a solid that a later boolean cuts  — a stale cutter is the classic
//                                               silently-wrong result
//   * remove a param the script stopped setting
//   * add and remove features, change a type  — must refuse to reuse at all
//   * no change whatsoever                    — must produce the same model
//                                               twice, which is the case a
//                                               naive cache passes and a broken
//                                               one fails

import { PartHistory } from "brep-io-kernel";
import {
  compile, cube, cylinder, sphere, difference, union, translate, rotate, group,
} from "../src/dsl.js";
import {
  planAdoption, adoptHistory, featureKey, featureSignature, featureTimestamps, countRebuilt,
} from "../src/rehistory.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const stlOf = (ph) => (ph.scene?.children || [])
  .filter((o) => o?.type === "SOLID")
  .map((s, i) => s.toSTL(s.name || `s${i}`, 6))
  .join("\n");

async function historyJSON(shape) {
  const ph = new PartHistory();
  await compile(shape, ph);
  return await ph.toJSON();
}

// The old way: a fresh history every time.
async function buildFresh(shape) {
  const ph = new PartHistory();
  await ph.fromJSON(await historyJSON(shape));
  await ph.runHistory({ throwOnFeatureError: true });
  return stlOf(ph);
}

// The new way: one history, adopted repeatedly — exactly what the worker does.
function makeReuser() {
  let ph = null, plan = null;
  return async (shape) => {
    const json = await historyJSON(shape);
    const r = await adoptHistory({ prev: ph, prevPlan: plan, json, PartHistory });
    ph = r.ph; plan = r.plan;
    await ph.runHistory({ throwOnFeatureError: true });
    return { stl: stlOf(ph), incremental: r.incremental, changed: r.changed, total: r.total, reason: r.plan.reason };
  };
}

// ---------------------------------------------------------------- the plan --
console.log("\ndeciding when a history is the same history\n");
{
  const doc = {
    idCounter: 3, expressions: [],
    features: [
      { type: "P.CU", inputParams: { id: "P.CU1", sizeX: 10 }, persistentData: {} },
      { type: "B", inputParams: { id: "B2", targetSolid: "P.CU1" }, persistentData: {} },
    ],
  };
  const first = planAdoption(null, doc);
  check("nothing built yet is not a reuse", !first.reuse);

  const same = planAdoption(first, doc);
  check("the same history reuses with nothing changed", same.reuse && same.changed.length === 0);

  const edited = structuredClone(doc);
  edited.features[0].inputParams.sizeX = 12;
  const one = planAdoption(first, edited);
  check("a changed param marks exactly that feature", one.reuse && one.changed.join() === "0");

  const added = structuredClone(doc);
  added.features.push({ type: "P.SP", inputParams: { id: "P.SP3" }, persistentData: {} });
  check("an added feature refuses reuse", !planAdoption(first, added).reuse);

  const retyped = structuredClone(doc);
  retyped.features[0].type = "P.SP";
  check("a changed feature TYPE refuses reuse", !planAdoption(first, retyped).reuse);

  const renamed = structuredClone(doc);
  renamed.features[0].inputParams.id = "P.CU9";
  check("a changed feature ID refuses reuse", !planAdoption(first, renamed).reuse,
    "ids shift when a feature is inserted, which is the signal we want");

  const shell = structuredClone(doc);
  shell.expressions = [{ name: "w", value: 10 }];
  check("a change outside the features refuses reuse", !planAdoption(first, shell).reuse,
    "expressions and settings can change how any feature evaluates");

  const dropped = structuredClone(doc);
  delete dropped.features[0].inputParams.sizeX;
  check("a param the script STOPPED setting counts as a change",
    planAdoption(first, dropped).changed.join() === "0",
    "merging instead of replacing would leave it applied");

  check("persistent data is part of the signature",
    featureSignature({ inputParams: { a: 1 }, persistentData: { m: 1 } })
      !== featureSignature({ inputParams: { a: 1 }, persistentData: { m: 2 } }));
  check("the kernel's own timestamp is NOT",
    featureSignature({ inputParams: { a: 1 }, timestamp: 1 })
      === featureSignature({ inputParams: { a: 1 }, timestamp: 999 }),
    "it is bookkeeping, and null on everything the page sends");
  check("identity is type AND id", featureKey({ type: "B", inputParams: { id: "B2" } }) === "B#B2");
}

// WHAT THE STATUS LINE IS ALLOWED TO CLAIM.
//
// "2 of 25 rebuilt" was the first thing this reported, counting the features
// whose PARAMS changed. It was a flattering lie: the same two-param edit
// re-runs 4 features when it lands at the end of a boolean chain and 14 when it
// lands at the start, because each boolean consumes the last one's result.
// The kernel's timestamps are the only honest source.
{
  console.log("\ncounting what actually rebuilt\n");
  check("an unchanged feature does not count", countRebuilt([5, 6, 7], [5, 6, 7]) === 0);
  check("a re-run feature does", countRebuilt([5, 6, 7], [5, 9, 7]) === 1);
  check("a fresh history counts as all of it", countRebuilt([], [1, 2, 3]) === 3,
    "no previous build to compare against");
  check("a changed feature count counts as all of it", countRebuilt([1, 2], [1, 2, 3]) === 3);
  check("timestamps read off a history", featureTimestamps({ features: [{ timestamp: 4 }, {}] }).join() === "4,0");
  check("...and a missing history is not a crash", featureTimestamps(null).length === 0);
}

// -------------------------------------------------- the geometry must match --
// Each case: the same sequence of shapes down both paths, comparing STL text.
async function sameBothWays(label, shapes, expect = {}) {
  const reuse = makeReuser();
  for (let i = 0; i < shapes.length; i++) {
    const fresh = await buildFresh(shapes[i]);
    const got = await reuse(shapes[i]);
    const ok = got.stl === fresh;
    check(`${label} — step ${i + 1}${ok ? "" : " GEOMETRY DIFFERS"}`, ok,
      ok ? "" : `incremental ${got.stl.length} chars vs fresh ${fresh.length}`);
    if (expect.incrementalFrom != null && i >= expect.incrementalFrom) {
      check(`${label} — step ${i + 1} took the incremental path`, got.incremental, got.reason);
    }
    if (expect.changedAt && expect.changedAt[i] != null) {
      check(`${label} — step ${i + 1} rebuilt ${expect.changedAt[i]} of ${got.total}`,
        got.changed === expect.changedAt[i], `rebuilt ${got.changed}`);
    }
  }
}

const plate = (holeR, bossX) => difference(
  union(
    cube([60, 40, 6], { center: true }),
    translate([bossX, 12, 3], cylinder({ r: 4, h: 6 })),
  ),
  translate([-15, -10, -6], cylinder({ r: holeR, h: 20 })),
);

console.log("\nthe same model, built both ways\n");
await sameBothWays("no change at all", [plate(3, 0), plate(3, 0)],
  { incrementalFrom: 1, changedAt: [null, 0] });

console.log("\nchanging one number\n");
await sameBothWays("the hole gets bigger", [plate(3, 0), plate(5, 0), plate(7, 0)],
  { incrementalFrom: 1 });

// The one that matters most: an EARLY feature changes and a later boolean has
// to notice. If the kernel's timestamp rule did not work, this is where a stale
// cut would show up — and the STL comparison is what catches it.
console.log("\nmoving a piece that something else cuts\n");
await sameBothWays("the boss slides along", [plate(3, 0), plate(3, 10), plate(3, -18)],
  { incrementalFrom: 1 });

console.log("\nstructural edits fall back to a full rebuild\n");
{
  const reuse = makeReuser();
  const a = union(cube([20, 20, 10]), translate([30, 0, 0], sphere({ r: 8 })));
  const b = union(cube([20, 20, 10]), translate([30, 0, 0], sphere({ r: 8 })),
    translate([0, 30, 0], cylinder({ r: 5, h: 10 })));
  await reuse(a);
  const grown = await reuse(b);
  check("adding a shape rebuilds everything", !grown.incremental, grown.reason);
  check("...and the result matches a fresh build", grown.stl === await buildFresh(b));
  const shrunk = await reuse(a);
  check("removing it rebuilds too", !shrunk.incremental, shrunk.reason);
  check("...and still matches", shrunk.stl === await buildFresh(a));
  // and after a fallback, reuse must resume rather than being stuck off
  const again = await reuse(a);
  check("reuse resumes after a full rebuild", again.incremental && again.changed === 0);
  check("...with the same geometry", again.stl === await buildFresh(a));
}

console.log("\na rotation is not a translation\n");
{
  const r = (deg) => difference(
    cube([30, 30, 10], { center: true }),
    rotate([0, 0, deg], translate([10, 0, -6], cube([6, 40, 20]))),
  );
  await sameBothWays("the cutter turns", [r(0), r(25), r(70)], { incrementalFrom: 1 });
}

console.log("\nnested groups keep their identity\n");
{
  const g = (z) => group(
    cube([20, 20, 4]),
    translate([0, 0, z], group(cylinder({ r: 6, h: 4 }), translate([0, 0, 4], sphere({ r: 5 })))),
  );
  await sameBothWays("the inner group lifts", [g(4), g(9), g(14)], { incrementalFrom: 1 });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
