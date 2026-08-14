// Repairing a broken mesh. The bar is not "it changed something" — it is that
// the result passes the same health check that condemned the original, and
// still encloses the shape it started as. A repair that closes a hole by
// swallowing the model is worse than no repair.

import {
  repairMesh, toBinaryStl, repairSummary,
  repairStlText, repairBinaryStl, toAsciiStl, meshFromAsciiStl,
} from "../src/meshrepair.js";
import { inspectMesh, inspectBinaryStl, weldTriangles } from "../src/meshhealth.js";
import { boxMesh, cylinderMesh } from "../src/meshbool.js";
import { meshVolume } from "../src/sdf.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const clone = (m) => ({ points: m.points.map((p) => p.slice()), faces: m.faces.map((f) => f.slice()) });

console.log("\na hole gets closed, and the shape survives it\n");
{
  const cube = boxMesh([20, 20, 20]);
  const holed = clone(cube);
  holed.faces = holed.faces.slice(1);            // one triangle missing
  check("the damage is real to begin with", !inspectMesh(holed).watertight);

  const fixed = repairMesh(holed);
  const after = inspectMesh(fixed);
  check("the repaired mesh is watertight", after.watertight, JSON.stringify(after));
  check("...with no open edges left", after.openEdges === 0);
  check("...and no winding clashes introduced", after.windingClashes === 0);
  check("...and it is still a cube-sized volume",
    near(meshVolume(fixed), 8000, 8000 * 0.02), `${meshVolume(fixed).toFixed(1)}`);
  check("the report says a hole was filled", fixed.report.holesFilled === 1, JSON.stringify(fixed.report));
}

console.log("\na bigger hole — a whole face removed, not one triangle\n");
{
  const cube = boxMesh([20, 20, 20]);
  const open = clone(cube);
  open.faces = open.faces.slice(2);              // both triangles of the -Z face
  const before = inspectMesh(open);
  check("four open edges to start", before.openEdges === 4, JSON.stringify(before));
  const fixed = repairMesh(open);
  const after = inspectMesh(fixed);
  check("closed afterwards", after.watertight, JSON.stringify(after));
  check("...and the volume is right, not the hull of a collapsed fan",
    near(meshVolume(fixed), 8000, 8000 * 0.02), `${meshVolume(fixed).toFixed(1)}`);
}

console.log("\nflipped faces get turned back\n");
{
  const cube = boxMesh([20, 20, 20]);
  const bent = clone(cube);
  bent.faces = bent.faces.map((f, i) => (i % 3 === 0 ? [f[0], f[2], f[1]] : f));
  check("the damage is real", inspectMesh(bent).windingClashes > 0);
  const fixed = repairMesh(bent);
  const after = inspectMesh(fixed);
  check("winding is consistent again", after.windingClashes === 0, JSON.stringify(after));
  check("...and it is watertight", after.watertight);
  check("...and still the same volume", near(meshVolume(fixed), 8000, 1));
  check("the report counts the re-orientations", fixed.report.facesReoriented > 0);
}

console.log("\nan inside-out mesh is turned the right way\n");
{
  // Consistent winding, uniformly reversed. Nothing complains — every edge
  // still pairs — and the part prints as its own negative.
  const cube = boxMesh([20, 20, 20]);
  const inverted = clone(cube);
  inverted.faces = inverted.faces.map(([a, b, c]) => [a, c, b]);
  check("an inverted cube still looks watertight to the check",
    inspectMesh(inverted).watertight);
  const fixed = repairMesh(inverted);
  check("the repair notices and turns it", fixed.report.shellsFlipped === 1,
    JSON.stringify(fixed.report));
  // Signed volume positive = wound outward. meshVolume is absolute, so compare
  // the winding directly against a known-good cube.
  const good = boxMesh([20, 20, 20]);
  const sign = (m) => {
    let v = 0;
    for (const [ia, ib, ic] of m.faces) {
      const A = m.points[ia], B = m.points[ib], C = m.points[ic];
      v += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0])
        + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
    }
    return Math.sign(v);
  };
  check("...so it now winds the same way as a sound cube", sign(fixed) === sign(good));
}

console.log("\nnoise is cleared without touching the shape\n");
{
  const cube = boxMesh([20, 20, 20]);
  const messy = clone(cube);
  messy.faces = [...messy.faces, messy.faces[0].slice(), [0, 1, 1]];
  const fixed = repairMesh(messy);
  check("the duplicate is removed", fixed.report.duplicatesRemoved === 1, JSON.stringify(fixed.report));
  check("the zero-area face is dropped", fixed.report.degenerateRemoved === 1);
  check("and the result is watertight", inspectMesh(fixed).watertight);
  check("...with the volume unchanged", near(meshVolume(fixed), 8000, 1));
}

console.log("\na sound mesh is left alone\n");
{
  const cube = boxMesh([20, 20, 20]);
  const fixed = repairMesh(clone(cube));
  check("nothing is reported as changed", repairSummary(fixed.report) === "nothing needed changing",
    repairSummary(fixed.report));
  check("the triangle count is untouched", fixed.faces.length === cube.faces.length);
  check("...and so is the volume", near(meshVolume(fixed), 8000, 1e-6));
  const cyl = cylinderMesh({ r: 10, h: 20, segments: 32 });
  const f2 = repairMesh(clone(cyl));
  check("a sound cylinder is untouched too", f2.faces.length === cyl.faces.length
    && repairSummary(f2.report) === "nothing needed changing");
}

console.log("\na stray fin welded to an edge is removed, not paid for by the model\n");
{
  // Three faces meeting on one edge. The repair has to delete one of them, and
  // WHICH one is the whole question: the fin is bigger than the cube's own
  // triangles, so choosing by smallest area picks a wall of the cube instead,
  // and patching that hole cuts the corner off. That version measured 6333
  // where the answer is 8000. Volume is therefore the assertion, not tidiness.
  const cube = boxMesh([20, 20, 20]);
  const fin = clone(cube);
  const [a, b] = fin.faces[0];
  fin.points.push([0, 0, 40]);
  fin.faces.push([a, b, fin.points.length - 1]);
  check("the damage is real", !inspectMesh(fin).watertight);

  const fixed = repairMesh(fin);
  const after = inspectMesh(fixed);
  check("the junction is resolved", after.overusedEdges === 0 && after.watertight,
    JSON.stringify(after));
  check("the FIN is what got deleted, not a wall of the cube",
    near(meshVolume(fixed), 8000, 1), `${meshVolume(fixed).toFixed(1)}`);
  check("...leaving the original 12 triangles", fixed.faces.length === 12, `${fixed.faces.length}`);
  check("...and a closed surface of genus 0", after.chi === 2 && after.genus === 0,
    `chi ${after.chi} genus ${after.genus}`);
  check("it reports removing a junction face", fixed.report.facesRemovedAtJunctions === 1,
    JSON.stringify(fixed.report));
  check("...and claims nothing is left unfixed", fixed.report.unrepairable === null,
    String(fixed.report.unrepairable));
}

console.log("\nthe simplifier's own signature, which is what this is really for\n");
{
  // meshoptimizer leaves a handful of non-manifold edges behind on every
  // reduction — measured on a real 3DBenchy, 5 at a target of 2,000 and still
  // 4 at 50,000, from a source file with none. The kernel sews that into
  // something it calls a solid and then will not subtract from, so a drill
  // silently does nothing. These are the two shapes that fault takes, built
  // deterministically so the test does not depend on how meshoptimizer behaves
  // on any particular day.

  // 1. a face duplicated with REVERSED winding: over-used edges, winding
  //    clashes and a duplicate at once, and no free edge to give it away.
  const flap = clone(boxMesh([20, 20, 20]));
  const [a, b, c] = flap.faces[0];
  flap.faces.push([a, c, b]);
  const before1 = inspectMesh(flap);
  check("a reversed duplicate reads as all three faults at once",
    before1.overusedEdges === 3 && before1.windingClashes === 3 && before1.duplicateFaces === 1,
    JSON.stringify(before1));
  const fixed1 = repairMesh(flap);
  const after1 = inspectMesh(fixed1);
  check("...and repairs to watertight", after1.watertight, JSON.stringify(after1));
  check("...with the volume EXACTLY intact", near(meshVolume(fixed1), 8000, 0.01),
    `${meshVolume(fixed1).toFixed(2)}`);
  check("...and the original 12 triangles", fixed1.faces.length === 12, `${fixed1.faces.length}`);

  // 2. two closed solids welded along a shared wall — four faces on those
  //    edges, and every face fully attached, so the free-edge signal that
  //    identifies a fin is no help here and blame has to carry it.
  const two = { points: [], faces: [] };
  for (const dx of [0, 20]) {
    const m = boxMesh([20, 20, 20]);
    const off = two.points.length;
    for (const p of m.points) two.points.push([p[0] + dx, p[1], p[2]]);
    for (const f of m.faces) two.faces.push(f.map((i) => i + off));
  }
  const welded = weldTriangles(two.faces.flatMap((f) => f.flatMap((i) => two.points[i])));
  const before2 = inspectMesh(welded);
  check("two solids sharing a wall read as over-used edges",
    before2.overusedEdges === 4 && !before2.watertight, JSON.stringify(before2));
  const fixed2 = repairMesh(welded);
  const after2 = inspectMesh(fixed2);
  check("...and repair merges them into one closed solid",
    after2.watertight && after2.genus === 0, JSON.stringify(after2));
  check("...keeping both cubes' volume exactly", near(meshVolume(fixed2), 16000, 0.01),
    `${meshVolume(fixed2).toFixed(2)}`);
  check("...by deleting the shared wall, not by hollowing anything",
    fixed2.report.facesRemovedAtJunctions === 4, JSON.stringify(fixed2.report));
}

console.log("\nrepair never quietly eats the model\n");
{
  // The failure mode that matters most: a repair that "succeeds" by deleting
  // real geometry. Every case here must come back within a whisker of the
  // volume it started with.
  const cases = [
    ["a hole", (m) => { m.faces = m.faces.slice(1); return m; }],
    ["a whole face", (m) => { m.faces = m.faces.slice(2); return m; }],
    ["flipped faces", (m) => { m.faces = m.faces.map((f, i) => (i % 3 === 0 ? [f[0], f[2], f[1]] : f)); return m; }],
    ["a duplicate", (m) => { m.faces = [...m.faces, m.faces[0].slice()]; return m; }],
    ["a zero-area sliver", (m) => { m.faces = [...m.faces, [0, 1, 1]]; return m; }],
  ];
  for (const [label, damage] of cases) {
    const fixed = repairMesh(damage(clone(boxMesh([20, 20, 20]))));
    const v = meshVolume(fixed);
    check(`${label}: volume within 2% of the original`, near(v, 8000, 8000 * 0.02),
      `${v.toFixed(1)}`);
    check(`${label}: ...and watertight`, inspectMesh(fixed).watertight);
  }
}

console.log("\nit comes back as a file the app can open\n");
{
  const cube = boxMesh([20, 20, 20]);
  const holed = clone(cube);
  holed.faces = holed.faces.slice(1);
  const fixed = repairMesh(holed);
  const stl = toBinaryStl(fixed, { name: "cube" });
  const round = inspectBinaryStl(new Uint8Array(stl));
  check("the STL it writes reads back as watertight", round && round.watertight,
    JSON.stringify(round));
  check("...with the triangles it claimed", round.triangles === fixed.faces.length,
    `${round.triangles} vs ${fixed.faces.length}`);
  check("...and normals that are unit length", (() => {
    const dv = new DataView(stl);
    for (let i = 0; i < Math.min(round.triangles, 20); i++) {
      const o = 84 + i * 50;
      const l = Math.hypot(dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true));
      if (Math.abs(l - 1) > 1e-3) return false;
    }
    return true;
  })());
}

console.log("\nthe summary reads like a sentence\n");
{
  const cube = boxMesh([20, 20, 20]);
  const wrecked = clone(cube);
  wrecked.faces = wrecked.faces.slice(1).map((f, i) => (i === 0 ? [f[0], f[2], f[1]] : f));
  wrecked.faces.push(wrecked.faces[0].slice());
  const s = repairSummary(repairMesh(wrecked).report);
  check("it names what it did", /filled|re-oriented|removed/.test(s), s);
  check("...and does not say nothing changed", s !== "nothing needed changing", s);
}


console.log("\nrepair happens on the way IN, not as a button afterwards\n");
{
  // The failure this closes. The kernel's own reader refuses a non-manifold
  // mesh outright, so a file with holes was turned away at the door — it never
  // reached any later stage where the repair that already existed could have
  // run. The user got "Import failed: Not manifold" and a Repair button on a
  // hint line that the next tool overwrites.
  //
  // Measured on a real file (a 34k-triangle charm, 68 open edges, 508 zero-area
  // faces): before, the import failed outright; after, it repairs in about a
  // second and builds as 9 solids.
  const cube = { points: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    faces: [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]] };
  const ascii = toAsciiStl(cube, "box");
  check("a mesh survives the ASCII round trip",
    inspectMesh(meshFromAsciiStl(ascii)).watertight);
  check("...with its triangles intact",
    meshFromAsciiStl(ascii).faces.length === 12, String(meshFromAsciiStl(ascii).faces.length));

  // A sound mesh must come back UNTOUCHED. Rewriting a good file costs
  // precision for nothing, and most imports are sound — the Benchy is
  // watertight and still 225k facets. Repair answers "broken", not "slow".
  const sound = repairStlText(ascii, "box");
  check("a sound mesh is left completely alone", sound.changed === false);
  check("...and its text is returned byte-identical", sound.text === ascii);

  // ...and a broken one is fixed and reported.
  const holed = { points: cube.points, faces: cube.faces.slice(0, 10) };   // lid off
  const broken = toAsciiStl(holed, "box");
  const fixed = repairStlText(broken, "box");
  check("an open mesh is repaired", fixed.changed === true);
  check("...to watertight", fixed.after.watertight, JSON.stringify(fixed.after.openEdges));
  check("...and says what it did", /filled \d+ hole/.test(repairSummary(fixed.report)),
    repairSummary(fixed.report));
  check("repairing twice changes nothing the second time",
    repairStlText(fixed.text, "box").changed === false,
    "repair must be idempotent or every re-import drifts");

  // The binary entry point is the one the importer actually calls, because the
  // kernel never gets a chance to reject the file.
  const bin = toBinaryStl(holed, { name: "box" });
  const fromBin = repairBinaryStl(new Uint8Array(bin), "box");
  check("the binary entry point repairs too", fromBin.changed === true);
  check("...and hands back ASCII, which the importer wanted anyway",
    /^solid /.test(fromBin.text || ""), (fromBin.text || "").slice(0, 12));
  check("...and reports what arrived", fromBin.before.openEdges > 0,
    String(fromBin.before.openEdges));
  const soundBin = repairBinaryStl(new Uint8Array(toBinaryStl(cube, { name: "box" })), "box");
  check("a sound binary mesh is not rewritten either",
    soundBin.changed === false && soundBin.text === null);
  check("something that is not a binary STL is declined, not thrown at",
    repairBinaryStl(new Uint8Array([1, 2, 3]), "x") === null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
