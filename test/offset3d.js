// Growing and shrinking a solid with rounded corners — Minkowski with a ball.
//
// A rounded box has a closed-form volume, so this is checked against
// arithmetic rather than against a screenshot:
//
//   V(box a*b*c grown by r) = abc                       the original
//                           + 2r(ab + bc + ca)          slabs on the six faces
//                           + pi r^2 (a + b + c)        quarter-cylinders on the edges
//                           + (4/3) pi r^3              the eight corner octants
//
// Shrinking a plain box is easier still: no corner is convex from the inside,
// so it is just a smaller box.

import { roundedOffset, meshSignedDistance, MAX_FACES } from "../src/offset3d.js";
import { meshVolume } from "../src/sdf.js";
import { boxMesh, cylinderMesh, meshSubtract } from "../src/meshbool.js";
import { inspectMesh } from "../src/meshhealth.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const within = (a, b, pct) => Math.abs(a - b) <= Math.abs(b) * pct;
const bbox = (m) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of m.points) for (let d = 0; d < 3; d++) {
    if (p[d] < lo[d]) lo[d] = p[d];
    if (p[d] > hi[d]) hi[d] = p[d];
  }
  return [0, 1, 2].map((d) => hi[d] - lo[d]);
};
const roundedBoxVolume = (a, b, c, r) =>
  a * b * c + 2 * r * (a * b + b * c + c * a)
  + Math.PI * r * r * (a + b + c) + (4 / 3) * Math.PI * r ** 3;

console.log("\nthe distance field itself is a distance\n");
{
  const f = meshSignedDistance(boxMesh([20, 20, 20]));
  check("zero on a face", Math.abs(f([10, 0, 0])) < 0.5, `${f([10, 0, 0]).toFixed(3)}`);
  check("negative inside, by how far", within(f([0, 0, 0]), -10, 0.02), `${f([0, 0, 0]).toFixed(2)}`);
  check("positive outside, by how far", within(f([16, 0, 0]), 6, 0.02), `${f([16, 0, 0]).toFixed(2)}`);
  // A corner is further away than a face at the same axis distance, which is
  // the thing a distance field has to know and a bounding box does not.
  check("a corner reads as the true diagonal distance",
    within(f([14, 14, 14]), Math.hypot(4, 4, 4), 0.05), `${f([14, 14, 14]).toFixed(2)}`);
}

console.log("\ngrowing rounds the outside, and the volume says by how much\n");
{
  for (const r of [2, 4]) {
    const out = roundedOffset(boxMesh([20, 20, 20]), r, { res: 44 });
    const want = roundedBoxVolume(20, 20, 20, r);
    check(`grow ${r}mm: volume matches the rounded-box formula`,
      within(meshVolume(out), want, 0.03),
      `${meshVolume(out).toFixed(0)} vs ${want.toFixed(0)}`);
    const size = bbox(out);
    check(`grow ${r}mm: it really is ${20 + 2 * r}mm across`,
      size.every((s) => within(s, 20 + 2 * r, 0.04)), size.map((s) => s.toFixed(1)).join(" x "));
    check(`grow ${r}mm: the result is closed`, inspectMesh(out).watertight,
      JSON.stringify(inspectMesh(out)));
  }
  // Rounding is the point: a grown box must NOT simply be a bigger box, and
  // the difference between the two is exactly the corners it rounded off.
  const grown = roundedOffset(boxMesh([20, 20, 20]), 4, { res: 44 });
  check("a grown box is smaller than the plain box it fits inside",
    meshVolume(grown) < 28 ** 3, `${meshVolume(grown).toFixed(0)} vs ${28 ** 3}`);
}

console.log("\nshrinking is the same operation with the sign flipped\n");
{
  const out = roundedOffset(boxMesh([20, 20, 20]), -3, { res: 44 });
  check("shrink 3mm: a plain box just gets smaller", within(meshVolume(out), 14 ** 3, 0.05),
    `${meshVolume(out).toFixed(0)} vs ${14 ** 3}`);
  const size = bbox(out);
  check("shrink 3mm: 14mm across", size.every((s) => within(s, 14, 0.06)),
    size.map((s) => s.toFixed(1)).join(" x "));
  check("shrink 3mm: still closed", inspectMesh(out).watertight);
  // Shrinking past the part is a real thing to ask for by accident, and it
  // should say so rather than hand back an empty mesh.
  let refused = false;
  try { roundedOffset(boxMesh([20, 20, 20]), -30, { res: 40 }); } catch { refused = true; }
  check("shrinking past nothing is refused, not returned empty", refused);
}

console.log("\ngrowing rounds convex corners, shrinking rounds concave ones\n");
{
  // A block with a square pocket cut into it. Growing rounds its outside
  // corners; shrinking rounds the inside of the pocket. Same call, opposite
  // sign — which is the whole reason both directions are worth having.
  const block = meshSubtract(boxMesh([30, 30, 20]), boxMesh([14, 14, 14], [0, 0, 10]));
  const plain = meshVolume(block);
  const grown = roundedOffset(block, 2, { res: 44 });
  const shrunk = roundedOffset(block, -2, { res: 44 });
  check("the pocketed block is closed to begin with", inspectMesh(block).watertight);
  check("growing adds material", meshVolume(grown) > plain,
    `${meshVolume(grown).toFixed(0)} vs ${plain.toFixed(0)}`);
  check("shrinking removes it", meshVolume(shrunk) < plain,
    `${meshVolume(shrunk).toFixed(0)} vs ${plain.toFixed(0)}`);
  check("both stay closed",
    inspectMesh(grown).watertight && inspectMesh(shrunk).watertight);
  // Growing by r then shrinking by r is a morphological CLOSE, not an identity:
  // it fills concavities narrower than the ball and cannot restore them. Worth
  // pinning so nobody assumes it round-trips.
  const closed = roundedOffset(roundedOffset(block, 2, { res: 40 }), -2, { res: 40 });
  check("grow-then-shrink does not return the original (it is a close, not an undo)",
    !within(meshVolume(closed), plain, 0.001),
    `${meshVolume(closed).toFixed(0)} vs ${plain.toFixed(0)}`);
}

console.log("\nit refuses what it cannot answer\n");
{
  const open = boxMesh([20, 20, 20]);
  open.faces = open.faces.slice(2);            // a whole face removed
  let msg = "";
  try { roundedOffset(open, 2, { res: 32 }); } catch (e) { msg = String(e.message); }
  check("an open surface is refused — it has no inside to grow", /closed surface/.test(msg), msg);
  check("...and the message counts the holes", /open edge/.test(msg), msg);

  let big = "";
  const dense = { points: [], faces: [] };
  for (let i = 0; i < MAX_FACES + 10; i++) {
    const o = dense.points.length;
    dense.points.push([i, 0, 0], [i + 1, 0, 0], [i, 1, 0]);
    dense.faces.push([o, o + 1, o + 2]);
  }
  try { roundedOffset(dense, 1, { res: 16 }); } catch (e) { big = String(e.message); }
  check("a mesh past the limit is refused with a number", /past the \d+/.test(big), big.slice(0, 70));

  let bad = "";
  try { roundedOffset(boxMesh([10, 10, 10]), "wide", { res: 16 }); } catch (e) { bad = String(e.message); }
  check("a non-numeric distance is refused", /distance in mm/.test(bad), bad);
}

console.log("\nit works on a curved solid, not only on boxes\n");
{
  const cyl = cylinderMesh({ r: 8, h: 20, segments: 32 });
  const out = roundedOffset(cyl, 2, { res: 44 });
  check("a grown cylinder is closed", inspectMesh(out).watertight);
  // A capsule-ended cylinder: the wall moves out by r, and the flat ends gain
  // a rounded rim rather than a sharp one.
  const size = bbox(out);
  check("...its diameter grew by 2r", within(size[0], 16 + 4, 0.06), size[0].toFixed(1));
  check("...and so did its height", within(size[2], 20 + 4, 0.06), size[2].toFixed(1));
  check("...and it holds more than it did", meshVolume(out) > meshVolume(cyl));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
