// The tube-and-sphere plan for a rounded offset.
//
// The plan is checked two ways: the primitives it lists must be the right ones
// in the right places, and the volume it predicts must match the closed-form
// rounded box. That second one is the real check — Steiner's formula and the
// rounded-box formula are derived differently, so agreeing to six figures means
// the edge and corner accounting is right rather than merely plausible.

import { roundifyPlan, expectedGrownVolume, MAX_PRIMITIVES } from "../src/roundify.js";
import { analyzeSolid } from "../src/faces.js";
import { boxMesh, cylinderMesh, meshSubtract } from "../src/meshbool.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
// The independent formula: a box grown by r.
const roundedBox = (a, b, c, r) =>
  a * b * c + 2 * r * (a * b + b * c + c * a)
  + Math.PI * r * r * (a + b + c) + (4 / 3) * Math.PI * r ** 3;

console.log("\nthe plan lists the right primitives\n");
{
  const cube = boxMesh([20, 20, 20]);
  const plan = roundifyPlan(cube, 3);
  // Six, not twelve: the two triangles of each side are one face and sweep
  // together. Twelve would mean six internal walls the union has to dissolve.
  check("a slab for every face, not every triangle", plan.slabs.length === 6,
    `${plan.slabs.length}`);
  check("a tube for every real edge", plan.tubes.length === 12, `${plan.tubes.length}`);
  check("a ball for every corner", plan.balls.length === 8, `${plan.balls.length}`);
  check("26 primitives in all", plan.total === 26, `${plan.total}`);
  check("it knows it is growing", plan.grow === true);
  check("shrinking is the same plan, flagged the other way",
    roundifyPlan(cube, -3).grow === false);

  // Every tube must lie along a real edge of the cube: 20mm long, and both ends
  // on a corner. A tube of any other length would mean an edge was invented.
  check("every tube is 20mm long", plan.tubes.every((t) => near(t.length, 20, 1e-9)),
    plan.tubes.map((t) => t.length.toFixed(1)).join(","));
  check("every tube has the asked-for radius", plan.tubes.every((t) => t.radius === 3));
  const corner = (p) => p.every((v) => near(Math.abs(v), 10, 1e-9));
  check("every ball sits on a corner", plan.balls.every((b) => corner(b.at)),
    JSON.stringify(plan.balls[0]?.at));
  check("every slab is swept by r along its own normal",
    plan.slabs.every((s) => s.height === 3 && near(Math.hypot(...s.normal), 1, 1e-9)));
  // Each cube side is a square: 4 corners, 2 triangles, and 4 boundary edges.
  // The diagonal is used by both triangles, so it is internal and must not
  // appear — a boundary of 5 would put a wall down the middle of a flat side.
  check("each slab knows its own outline", plan.slabs.every((s) =>
    s.tris.length === 2 && s.boundary.length === 4 && s.points.length === 4),
    plan.slabs.map((s) => `${s.tris.length}t/${s.boundary.length}b`).join(" "));
}

console.log("\nthe predicted volume agrees with the independent formula\n");
{
  // Steiner's formula, assembled from the plan's own edge angles, against the
  // rounded-box formula. Two different derivations, one answer.
  for (const r of [1, 3, 7]) {
    const got = expectedGrownVolume(boxMesh([20, 20, 20]), r);
    const want = roundedBox(20, 20, 20, r);
    check(`a 20mm cube grown by ${r}mm`, near(got, want, want * 1e-9),
      `${got.toFixed(4)} vs ${want.toFixed(4)}`);
  }
  const oblong = expectedGrownVolume(boxMesh([40, 20, 10]), 2.5);
  check("and an oblong, where the three sides differ",
    near(oblong, roundedBox(40, 20, 10, 2.5), roundedBox(40, 20, 10, 2.5) * 1e-9),
    `${oblong.toFixed(4)} vs ${roundedBox(40, 20, 10, 2.5).toFixed(4)}`);
}

console.log("\nconcave edges are left alone\n");
{
  // The pocket's inside corners fold into the material. A tube there would be
  // buried in solid: it costs a boolean and changes nothing.
  const block = meshSubtract(boxMesh([30, 30, 20]), boxMesh([14, 14, 14], [0, 0, 10]));
  const a = analyzeSolid(block);
  const plan = roundifyPlan(block, 2, { analysis: a });
  const concave = a.edges.length - a.convexEdges.length;
  check("the block really does have concave edges", concave > 0, `${concave}`);
  check("...and the plan has no tube for any of them",
    plan.tubes.length === a.convexEdges.length, `${plan.tubes.length} vs ${a.convexEdges.length}`);
  check("...so it is smaller than the naive one edge = one tube count",
    plan.tubes.length < a.edges.length, `${plan.tubes.length} < ${a.edges.length}`);
}

console.log("\na curved solid still plans cleanly\n");
{
  const cyl = cylinderMesh({ r: 10, h: 20, segments: 16 });
  const plan = roundifyPlan(cyl, 2);
  check("16 vertical creases plus 2 rims of 16 = 48 tubes",
    plan.tubes.length === 48, `${plan.tubes.length}`);
  check("32 rim corners want balls", plan.balls.length === 32, `${plan.balls.length}`);
  // The vertical creases are the cylinder's height; the rim tubes are chords.
  const vertical = plan.tubes.filter((t) => near(t.length, 20, 1e-6));
  check("16 of the tubes run the full height", vertical.length === 16, `${vertical.length}`);
}

console.log("\nit refuses the shapes it would be wrong for\n");
{
  // The whole reason the sampled version still exists.
  const sphere = (() => {
    const points = [], faces = [];
    const N = 24;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const u = (i / N) * Math.PI, v = (j / N) * Math.PI * 2;
      points.push([Math.sin(u) * Math.cos(v) * 20, Math.sin(u) * Math.sin(v) * 20, Math.cos(u) * 20]);
    }
    const at = (i, j) => i * (N + 1) + j;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
      faces.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
    }
    return { points, faces };
  })();
  let msg = "";
  try { roundifyPlan(sphere, 2); } catch (e) { msg = String(e.message); }
  check("an organic mesh is refused", /needs \d+ primitives/.test(msg), msg.slice(0, 80));
  check("...and the message counts each kind, so the choice is explainable",
    /slabs/.test(msg) && /tubes/.test(msg) && /balls/.test(msg), msg.slice(0, 120));
  check("...and points at the fallback", /sampled/.test(msg), msg.slice(-60));
  check("the limit is where it says it is", MAX_PRIMITIVES > 100 && MAX_PRIMITIVES < 5000);

  let bad = "";
  try { roundifyPlan(boxMesh([10, 10, 10]), 0); } catch (e) { bad = String(e.message); }
  check("a zero radius is refused — it is not a no-op, it is meaningless",
    /positive radius/.test(bad), bad);
  try { roundifyPlan(boxMesh([10, 10, 10]), "thick"); } catch (e) { bad = String(e.message); }
  check("so is a non-number", /positive radius/.test(bad), bad);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
