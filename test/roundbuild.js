// Assembling the rounded offset.
//
// roundify.js is checked against arithmetic; this checks the solid that comes
// out the other end. Two things have to hold, and they pull against each other:
// the result must be watertight (or the kernel and every slicer will reject
// it), and it must measure what a rounded solid of that size measures. A
// watertight blob of the wrong volume is the failure mode that nearly shipped
// once already — an earlier assembly closed the shell around the cavity and
// came back watertight with twice the volume it should have had.

import { buildRoundedOffset, tubeMesh, prismMesh } from "../src/roundbuild.js";
import { boxMesh, cylinderMesh, meshSubtract } from "../src/meshbool.js";
import { expectedGrownVolume } from "../src/roundify.js";
import { inspectMesh } from "../src/meshhealth.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

function volumeOf({ points, faces }) {
  let v = 0;
  for (const [i, j, k] of faces) {
    const A = points[i], B = points[j], C = points[k];
    v += (A[0] * (B[1] * C[2] - B[2] * C[1])
      - A[1] * (B[0] * C[2] - B[2] * C[0])
      + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
  }
  return Math.abs(v);
}
// How many separate pieces the result is. Watertight only says every edge is
// used twice; it says nothing about whether there is a stray bubble sealed
// inside. One shell is what a solid should be.
function shellCount({ faces }) {
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const adj = new Map();
  faces.forEach((f, i) => {
    for (let k = 0; k < 3; k++) {
      const kk = key(f[k], f[(k + 1) % 3]);
      const bucket = adj.get(kk);
      if (bucket) bucket.push(i); else adj.set(kk, [i]);
    }
  });
  const seen = new Uint8Array(faces.length);
  let shells = 0;
  for (let i = 0; i < faces.length; i++) {
    if (seen[i]) continue;
    shells++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const t = stack.pop(), f = faces[t];
      for (let k = 0; k < 3; k++) {
        for (const nb of adj.get(key(f[k], f[(k + 1) % 3])) || []) {
          if (!seen[nb]) { seen[nb] = 1; stack.push(nb); }
        }
      }
    }
  }
  return shells;
}
const bbox = ({ points }) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) {
    if (p[i] < lo[i]) lo[i] = p[i];
    if (p[i] > hi[i]) hi[i] = p[i];
  }
  return { lo, hi, size: hi.map((v, i) => v - lo[i]) };
};
// The exact Minkowski sum of a box with a ball — derived independently of
// anything in src/, so agreeing with it means something.
const roundedBox = (a, b, c, r) =>
  a * b * c + 2 * r * (a * b + b * c + c * a)
  + Math.PI * r * r * (a + b + c) + (4 / 3) * Math.PI * r ** 3;

console.log("\ngrowing a cube gives a rounded cube\n");
{
  const r = 3;
  const got = buildRoundedOffset(boxMesh([20, 20, 20]), r);
  const want = roundedBox(20, 20, 20, r);
  const vol = volumeOf(got.mesh);
  check("it is watertight", got.health.watertight, JSON.stringify(got.health));
  check("...with no open edges", got.health.openEdges === 0, `${got.health.openEdges}`);
  check("...no edge shared by three faces", got.health.overusedEdges === 0,
    `${got.health.overusedEdges}`);
  check("...and one solid with no handles through it",
    got.health.chi === 2 && got.health.genus === 0,
    `chi ${got.health.chi} genus ${got.health.genus}`);
  check("the union was clean enough not to need repair", got.repaired === false);
  check(`volume is within 1% of the exact rounded cube`,
    Math.abs(vol / want - 1) < 0.01, `${vol.toFixed(1)} vs ${want.toFixed(1)}`);
  // Which SIDE of exact matters. Cylinders and spheres are polygons here, and
  // an inscribed polygon is smaller than its circle, so the answer must come in
  // under. Over would mean the assembly is adding material somewhere it
  // shouldn't — the signature of a union that closed the wrong void.
  check("...and it errs UNDER, the way inscribed polygons do", vol < want,
    `${vol.toFixed(1)} vs ${want.toFixed(1)}`);
  // A 20mm cube grown by 3 is 26mm across, on every axis.
  const b = bbox(got.mesh);
  check("it measures 26mm on all three axes",
    b.size.every((s) => Math.abs(s - 26) < 1e-6), b.size.map((s) => s.toFixed(3)).join(" x "));
}

console.log("\nmore segments means a closer answer, up to the ceiling\n");
{
  const want = roundedBox(20, 20, 20, 3);
  const coarse = buildRoundedOffset(boxMesh([20, 20, 20]), 3, { segments: 6, rings: 3 });
  const fine = buildRoundedOffset(boxMesh([20, 20, 20]), 3, { segments: 16, rings: 8 });
  const cv = volumeOf(coarse.mesh), fv = volumeOf(fine.mesh);
  check("the coarse one is under", cv < want, `${cv.toFixed(1)}`);
  check("the fine one is under too", fv < want, `${fv.toFixed(1)}`);
  check("...and closer than the coarse one", want - fv < want - cv,
    `fine off by ${(want - fv).toFixed(1)}, coarse off by ${(want - cv).toFixed(1)}`);
  check("...within half a percent at 16 segments",
    Math.abs(fv / want - 1) < 0.005, `${((fv / want - 1) * 100).toFixed(3)}%`);
  check("both stayed clean enough not to need repair",
    coarse.repaired === false && fine.repaired === false);
  // Asking for more than the boolean can take is clamped rather than attempted.
  // Unclamped, 32 segments loses an eighth of the solid and does not close —
  // silently, which is the worst way for it to be wrong.
  const asked = buildRoundedOffset(boxMesh([20, 20, 20]), 3, { segments: 32, rings: 16 });
  check("asking for 32 segments is clamped, and says so", asked.clamped === true);
  check("...to the 16 that works", asked.segments === 16 && asked.rings === 8,
    `${asked.segments}/${asked.rings}`);
  check("...so the result is still sound", asked.health.watertight && asked.health.chi === 2,
    JSON.stringify(asked.health));
  check("...and still within half a percent",
    Math.abs(volumeOf(asked.mesh) / want - 1) < 0.005,
    `${((volumeOf(asked.mesh) / want - 1) * 100).toFixed(3)}%`);
}

console.log("\nshrinking takes an even layer off\n");
{
  // Eroding a convex solid by r is the inner parallel body: a 20mm cube shrunk
  // by 3 is a 14mm cube with SHARP edges. Growing rounds the convex edges;
  // shrinking cannot, because there is nothing outside them to round. This is
  // the exact case, with no faceting error at all, because the flats do all the
  // work and the flats are exact.
  const got = buildRoundedOffset(boxMesh([20, 20, 20]), -3);
  const vol = volumeOf(got.mesh);
  check("it is watertight", got.health.watertight, JSON.stringify(got.health));
  check("a 20mm cube shrunk by 3 is a 14mm cube", Math.abs(vol - 14 ** 3) < 1,
    `${vol.toFixed(1)} vs ${14 ** 3}`);
  const b = bbox(got.mesh);
  check("...measuring 14mm on every axis",
    b.size.every((s) => Math.abs(s - 14) < 1e-6), b.size.map((s) => s.toFixed(3)).join(" x "));
  check("shrinking really did remove material", vol < 8000, `${vol.toFixed(1)}`);
}

console.log("\nshrinking rounds the corners a solid actually has inside it\n");
{
  // The direction that shrinking DOES round: a concave corner. A block with a
  // square pocket, eroded, should end up with the pocket's inside corners
  // rounded to r — that is the useful half of shrinking, and the mirror of what
  // growing does to convex edges.
  const block = meshSubtract(boxMesh([30, 30, 20]), boxMesh([14, 14, 14], [0, 0, 10]));
  const got = buildRoundedOffset(block, -2);
  check("it is watertight", got.health.watertight, JSON.stringify(got.health));
  const vol = volumeOf(got.mesh);
  check("it removed material but did not collapse",
    vol > 0 && vol < volumeOf(block), `${vol.toFixed(1)} vs ${volumeOf(block).toFixed(1)}`);
  const b = bbox(got.mesh);
  check("the outside came in by 2 on each side, so 26 across",
    Math.abs(b.size[0] - 26) < 1e-6 && Math.abs(b.size[1] - 26) < 1e-6,
    b.size.map((s) => s.toFixed(2)).join(" x "));
}

console.log("\na faceted cylinder survives it\n");
{
  // The hard case, and the one that drove every design decision here. Left on
  // the defaults, because the defaults are what a user gets: a 16-sided
  // cylinder is 98 primitives, which picks 8 segments per tube.
  const cyl = cylinderMesh({ r: 10, h: 20, segments: 16 });
  const got = buildRoundedOffset(cyl, 2);
  check("it is watertight", got.health.watertight, JSON.stringify(got.health));
  check("...and one connected solid, not a pile of shells", shellCount(got.mesh) === 1,
    `${shellCount(got.mesh)} shells`);
  check("...within 1% of the volume Steiner's formula predicts",
    Math.abs(volumeOf(got.mesh) / expectedGrownVolume(cyl, 2) - 1) < 0.01,
    `${((volumeOf(got.mesh) / expectedGrownVolume(cyl, 2) - 1) * 100).toFixed(2)}%`);
  check("...and it errs under", volumeOf(got.mesh) < expectedGrownVolume(cyl, 2));
  check("the auto tessellation backed off for a shape this dense",
    got.segments === 8, `${got.segments}`);
  const b = bbox(got.mesh);
  check("it grew by 2 in height, 20 -> 24", Math.abs(b.size[2] - 24) < 1e-6,
    `${b.size[2].toFixed(3)}`);
  // The faceted cylinder's corners stick out to exactly r=10, so grown it
  // reaches 12 — 24 across. The flats between them are closer in.
  check("...and to 24 across at the widest", Math.abs(b.size[0] - 24) < 1e-6,
    `${b.size[0].toFixed(3)}`);
  check("it finished in a reasonable time", got.ms < 30000, `${got.ms}ms`);
}

console.log("\nthe pieces on their own are sound\n");
{
  const t = tubeMesh([0, 0, 0], [0, 0, 10], 2, 16);
  check("a tube is closed", t !== null && t.faces.length === 16 * 4);
  check("a zero-length edge makes no tube", tubeMesh([1, 1, 1], [1, 1, 1], 2) === null);
  // One triangle as a face: two caps and three walls.
  const slab = {
    points: [[0, 0, 0], [10, 0, 0], [0, 10, 0]],
    tris: [[0, 1, 2]],
    boundary: [[0, 1], [1, 2], [2, 0]],
    normal: [0, 0, 1],
  };
  const p = prismMesh(slab, [0, 0, 1], 3);
  check("a swept triangle is 6 points and 8 triangles",
    p.points.length === 6 && p.faces.length === 8, `${p.points.length}/${p.faces.length}`);
  check("...and holds the right volume", Math.abs(volumeOf(p) - 150) < 1e-9, `${volumeOf(p)}`);
  check("...and is closed", inspectMesh(p).watertight, JSON.stringify(inspectMesh(p)));
  // A square face swept: two caps of two triangles, four walls of two. The
  // point of sweeping whole faces is that the diagonal does NOT become a wall.
  const square = {
    points: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]],
    tris: [[0, 1, 2], [0, 2, 3]],
    boundary: [[0, 1], [1, 2], [2, 3], [3, 0]],
    normal: [0, 0, 1],
  };
  const sq = prismMesh(square, [0, 0, 1], 4);
  check("a swept square is a box, not two wedges",
    sq.faces.length === 12 && Math.abs(volumeOf(sq) - 400) < 1e-9,
    `${sq.faces.length} faces, volume ${volumeOf(sq)}`);
  check("...and is closed", inspectMesh(sq).watertight);
  check("sweeping the other way still makes a solid, not a mirrored one",
    Math.abs(volumeOf(prismMesh(square, [0, 0, -1], 4)) - 400) < 1e-9);
}

console.log("\na shape that is not a solid does not quietly offset anyway\n");
{
  // The bug that cost the most time here was upstream of this module: the DSL
  // read the kernel's INDEXED face geometry three positions at a time, so a
  // cube arrived as eight triangles joining unrelated corners. It offset
  // without complaint, and the kernel rejected the result as "Not manifold" —
  // a fair verdict, but one that pointed at the output rather than the input.
  // Refusing a broken input names the real problem where it happens.
  const bogus = {
    points: boxMesh([20, 20, 20]).points,
    faces: [[0, 1, 2], [3, 0, 4], [1, 5, 0], [3, 6, 5], [1, 7, 2], [4, 3, 2], [7, 6, 5], [7, 4, 6]],
  };
  let msg = "";
  try { buildRoundedOffset(bogus, 3); } catch (e) { msg = String(e.message); }
  check("an unclosed shape is refused up front", /not a closed solid/i.test(msg),
    msg.slice(0, 90) || "(no error thrown)");
  check("...and the message says what is wrong with it", /open edge|edge/i.test(msg),
    msg.slice(0, 90));
  // And a real solid still passes the same gate.
  let ok = true;
  try { buildRoundedOffset(boxMesh([20, 20, 20]), 3); } catch { ok = false; }
  check("a real solid is not caught by that check", ok);
}

console.log("\nit still refuses what it cannot afford\n");
{
  let msg = "";
  try {
    buildRoundedOffset(boxMesh([10, 10, 10]), 1, { maxPrimitives: 4 });
  } catch (e) { msg = String(e.message); }
  check("the primitive limit is still enforced through the builder",
    /needs \d+ primitives/.test(msg), msg.slice(0, 70));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
