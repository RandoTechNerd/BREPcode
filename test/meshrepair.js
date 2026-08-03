// Repairing a broken mesh. The bar is not "it changed something" — it is that
// the result passes the same health check that condemned the original, and
// still encloses the shape it started as. A repair that closes a hole by
// swallowing the model is worse than no repair.

import { repairMesh, toBinaryStl, repairSummary } from "../src/meshrepair.js";
import { inspectMesh, inspectBinaryStl } from "../src/meshhealth.js";
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

console.log("\nwhat it cannot fix, it says so about\n");
{
  // Three faces meeting on one edge: two surfaces fused along a seam. No repair
  // can pick which surface was meant without inventing intent.
  const cube = boxMesh([20, 20, 20]);
  const fin = clone(cube);
  const [a, b] = fin.faces[0];
  fin.points.push([0, 0, 40]);
  fin.faces.push([a, b, fin.points.length - 1]);
  const fixed = repairMesh(fin);
  check("the over-used edge is reported as unrepairable",
    /more than two/.test(fixed.report.unrepairable || ""), String(fixed.report.unrepairable));
  check("...and the repair does not pretend otherwise",
    !inspectMesh(fixed).watertight || fixed.report.unrepairable);
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
