// Booleans on triangles. A boolean is judged by eye in the end, but every
// claim under it is arithmetic: a cube with a hole through it encloses the
// cube's volume minus the hole's, and if it does not, no amount of looking
// right will save the part that gets printed.

import {
  meshUnion, meshSubtract, meshIntersect, meshSubtractAll, boxMesh, cylinderMesh, MAX_FACES,
} from "../src/meshbool.js";
import { meshVolume } from "../src/sdf.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Every closed mesh must stay closed: each edge used exactly twice, once in
// each direction. This is the property that decides whether a slicer will
// accept the result, and it is the one a boolean is most likely to break.
function isClosed({ points, faces }) {
  const seen = new Map();
  for (const [a, b, c] of faces) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = `${u}_${v}`, r = `${v}_${u}`;
      if (seen.get(r)) seen.set(r, seen.get(r) - 1);
      else seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  let unmatched = 0;
  for (const n of seen.values()) unmatched += n;
  return { closed: unmatched === 0, unmatched };
}

console.log("\nthe cutters themselves are sound before anything is cut\n");
{
  const b = boxMesh([20, 20, 20]);
  check("a box encloses its own volume", near(meshVolume(b), 8000, 1));
  check("...and is closed", isClosed(b).closed, JSON.stringify(isClosed(b)));
  const c = cylinderMesh({ r: 10, h: 20, segments: 64 });
  // A 64-gon is slightly inside the circle it approximates, so compare with
  // the polygon's real area rather than pi r^2.
  const exact = 0.5 * 64 * Math.sin((2 * Math.PI) / 64) * 100 * 20;
  check("a cylinder encloses its polygon volume", near(meshVolume(c), exact, exact * 0.001),
    `${meshVolume(c).toFixed(1)} vs ${exact.toFixed(1)}`);
  check("...and is closed", isClosed(c).closed, JSON.stringify(isClosed(c)));
}

console.log("\nsubtraction removes exactly what it should\n");
{
  const cube = boxMesh([20, 20, 20]);
  // A rod straight through, longer than the cube so it exits both faces.
  const rod = cylinderMesh({ r: 4, h: 40, segments: 48 });
  const holed = meshSubtract(cube, rod);
  const rodInside = 0.5 * 48 * Math.sin((2 * Math.PI) / 48) * 16 * 20;
  check("a through hole removes the rod's volume",
    near(meshVolume(holed), 8000 - rodInside, 8000 * 0.005),
    `${meshVolume(holed).toFixed(1)} vs ${(8000 - rodInside).toFixed(1)}`);
  check("...and the result is still closed", isClosed(holed).closed,
    JSON.stringify(isClosed(holed)));

  // A cutter that misses entirely must change nothing measurable.
  const miss = meshSubtract(cube, cylinderMesh({ r: 3, h: 10, centre: [40, 40, 0] }));
  check("a cutter that misses leaves the volume alone", near(meshVolume(miss), 8000, 1));
  check("...and leaves it closed", isClosed(miss).closed);

  // Subtracting something that swallows the target leaves nothing.
  const gone = meshSubtract(cube, boxMesh([60, 60, 60]));
  check("a cutter that swallows the target empties it", meshVolume(gone) < 1,
    `${meshVolume(gone)}`);
}

console.log("\nunion and intersection agree with arithmetic\n");
{
  // Two 20mm cubes overlapping by a 10mm slab: 8000 + 8000 - 4000.
  const a = boxMesh([20, 20, 20], [0, 0, 0]);
  const b = boxMesh([20, 20, 20], [10, 0, 0]);
  const u = meshUnion(a, b);
  check("union is A + B - overlap", near(meshVolume(u), 12000, 12000 * 0.005),
    `${meshVolume(u).toFixed(1)}`);
  check("...and closed", isClosed(u).closed, JSON.stringify(isClosed(u)));
  const i = meshIntersect(a, b);
  check("intersection is just the overlap", near(meshVolume(i), 4000, 4000 * 0.005),
    `${meshVolume(i).toFixed(1)}`);
  check("...and closed", isClosed(i).closed, JSON.stringify(isClosed(i)));

  // Disjoint solids: union keeps both, intersection keeps nothing.
  const far = boxMesh([10, 10, 10], [100, 0, 0]);
  check("union of disjoint solids keeps both",
    near(meshVolume(meshUnion(a, far)), 9000, 9000 * 0.005));
  check("intersection of disjoint solids is empty",
    meshVolume(meshIntersect(a, far)) < 1);
}

console.log("\nseveral cutters in a row, the way difference() reads\n");
{
  const plate = boxMesh([60, 40, 8]);
  const holes = [[-20, -10], [20, -10], [-20, 10], [20, 10]]
    .map(([x, y]) => cylinderMesh({ r: 3, h: 20, segments: 32, centre: [x, y, 0] }));
  const drilled = meshSubtractAll(plate, holes);
  const oneHole = 0.5 * 32 * Math.sin((2 * Math.PI) / 32) * 9 * 8;
  check("four holes remove four holes' worth",
    near(meshVolume(drilled), 60 * 40 * 8 - 4 * oneHole, 19200 * 0.005),
    `${meshVolume(drilled).toFixed(1)}`);
  check("...and it is still one closed shell", isClosed(drilled).closed,
    JSON.stringify(isClosed(drilled)));
}

console.log("\nawkward geometry does not produce nonsense\n");
{
  const cube = boxMesh([20, 20, 20]);
  // Coplanar faces: a cutter whose top face sits exactly on the cube's top.
  const flush = meshSubtract(cube, boxMesh([10, 10, 10], [0, 0, 5]));
  check("a flush-topped pocket removes its own volume",
    near(meshVolume(flush), 8000 - 1000, 8000 * 0.01), `${meshVolume(flush).toFixed(1)}`);
  check("...and stays closed", isClosed(flush).closed, JSON.stringify(isClosed(flush)));

  // Degenerate input: a zero-area triangle must be dropped, not crash.
  const withSliver = {
    points: [...cube.points, [0, 0, 0], [1, 0, 0]],
    faces: [...cube.faces, [8, 9, 8]],
  };
  let survived = true;
  try { meshSubtract(withSliver, cylinderMesh({ r: 2, h: 40 })); }
  catch { survived = false; }
  check("a degenerate face is dropped rather than thrown", survived);

  // An empty mesh is a legitimate thing to subtract (a cutter list may be empty
  // after filtering) and must not destroy the target.
  const untouched = meshSubtract(cube, { points: [], faces: [] });
  check("subtracting nothing leaves the volume alone",
    near(meshVolume(untouched), 8000, 1), `${meshVolume(untouched).toFixed(1)}`);
}

console.log("\nit is fast enough to be worth having\n");
{
  // The point of the whole module: a mesh of Benchy-ish size, cut, in the time
  // the kernel spends deciding where to start. If this ever creeps into
  // seconds, the reason for the mesh path has gone.
  const sphereish = (() => {
    const points = [], faces = [];
    const N = 48;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const u = (i / N) * Math.PI, v = (j / N) * Math.PI * 2;
        points.push([Math.sin(u) * Math.cos(v) * 20, Math.sin(u) * Math.sin(v) * 20, Math.cos(u) * 20]);
      }
    }
    const at = (i, j) => i * (N + 1) + j;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
        faces.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    }
    return { points, faces };
  })();
  const t0 = Date.now();
  const cut = meshSubtract(sphereish, cylinderMesh({ r: 6, h: 60, segments: 32 }));
  const ms = Date.now() - t0;
  check(`${sphereish.faces.length} triangles cut in ${ms}ms`, ms < 5000, `${ms}ms`);
  check("...and the result has geometry", cut.faces.length > 100, `${cut.faces.length} faces`);
  check("...and less volume than it started with", meshVolume(cut) < meshVolume(sphereish));
  // The size that matters. A small case can be closed by luck; this one cannot.
  check("...and is closed at that size", isClosed(cut).closed, JSON.stringify(isClosed(cut)));
  // Curved surfaces meeting a flat cut is where near-duplicate vertices come
  // from, and near-duplicates are what made the stitcher run away. Two cutters
  // that also overlap EACH OTHER is the nastiest arrangement of that.
  const twice = meshSubtract(
    meshSubtract(sphereish, cylinderMesh({ r: 6, h: 60, segments: 32 })),
    cylinderMesh({ r: 6, h: 60, segments: 32, centre: [7, 0, 0] }));
  check("two overlapping cutters still close", isClosed(twice).closed,
    JSON.stringify(isClosed(twice)));
  check("...and removed more than one did", meshVolume(twice) < meshVolume(cut));
}

console.log("\nand it refuses the sizes it is bad at\n");
{
  // The honest limit. This module goes quadratic — 22 seconds at 18k triangles,
  // 61 at 33k — so past a point the kernel it was meant to beat is the faster
  // answer. Refusing loudly is the only version of that which does not waste a
  // minute of someone's time first.
  const big = (() => {
    const points = [], faces = [];
    const N = 90;                       // ~16k triangles, over the limit
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        points.push([i, j, (i * j) % 7]);
      }
    }
    const at = (i, j) => i * (N + 1) + j;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
        faces.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    }
    return { points, faces };
  })();
  check("a mesh over the limit is refused, not silently ground through",
    big.faces.length > MAX_FACES && (() => {
      try { meshSubtract(big, boxMesh([10, 10, 10])); return false; }
      catch (e) { return /past the \d+ this handles/.test(String(e.message)); }
    })(), `${big.faces.length} triangles`);
  check("...and the message says what to do instead", (() => {
    try { meshSubtract(big, boxMesh([10, 10, 10])); return false; }
    catch (e) { return /Simplify|kernel/.test(String(e.message)); }
  })());
  // And the sizes it IS good at still go through.
  check("a mesh under the limit still runs",
    meshVolume(meshSubtract(boxMesh([20, 20, 20]), boxMesh([10, 10, 10], [0, 0, 5]))) > 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
