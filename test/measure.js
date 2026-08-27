// Measuring, and the two ways a measuring tool fails.
//
// It can fail loudly, which is fine — no snap, no number, try again. Or it can
// hand back a confident wrong number, which is the one that matters: nobody
// re-derives a measurement by hand, that is the entire reason for asking. So
// every case here is a shape whose answer is known by arithmetic, and the test
// is the number, not the pixels.
//
// Also guards the dims toggle, which broke in a way worth remembering: the
// checkbox handler was `addEventListener("change", updateDims)`, which passes
// the Event as `updateDims(target = modelGroup)`. Turning dims OFF still worked
// — that path returns before it touches `target` — so the bug was one-way and
// looked like the toggle was stuck. Box3.setFromObject(anEvent) throws
// "object.updateWorldMatrix is not a function", verified in the browser.

import {
  boundaryEdges, surfaceArea, closestPointOnSegment,
  facesParallel, faceGap, faceAngleDeg, distanceParts, measureText,
} from "../src/measuregeom.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// One quad (two triangles) in the z=0 plane, w by h, corner at the origin.
const quad = (w, h) => new Float32Array([
  0, 0, 0, w, 0, 0, w, h, 0,
  0, 0, 0, w, h, 0, 0, h, 0,
]);

console.log("\nthe edges of the model, not of the tessellation\n");
{
  const e = boundaryEdges(quad(40, 20));
  check("a two-triangle quad has four boundary edges", e.length === 4,
    `got ${e.length}`);
  const lens = e.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).sort((x, y) => x - y);
  check("...and they are the four sides, not the diagonal",
    near(lens[0], 20) && near(lens[1], 20) && near(lens[2], 40) && near(lens[3], 40),
    `lengths ${lens.map((n) => n.toFixed(1)).join(", ")}`);
  check("the shared diagonal is not among them",
    !lens.some((L) => near(L, Math.hypot(40, 20), 1e-3)),
    "it is an interior seam of the triangulation and means nothing");

  // The bug the quantised key exists for: the same corner stored twice over.
  // Index-based matching finds no shared edge and calls all six a boundary,
  // which would drop a snap point in the middle of a flat face.
  const dup = new Float32Array([
    0, 0, 0, 40, 0, 0, 40, 20, 0,
    0.0000001, 0, 0, 40, 20, 0, 0, 20, 0,      // first corner a hair off
  ]);
  check("duplicated corners still share their edge", boundaryEdges(dup).length === 4,
    `got ${boundaryEdges(dup).length} — index matching would say 6`);

  const indexed = boundaryEdges(
    new Float32Array([0, 0, 0, 40, 0, 0, 40, 20, 0, 0, 20, 0]),
    new Uint32Array([0, 1, 2, 0, 2, 3]),
  );
  check("an indexed geometry gives the same four", indexed.length === 4);

  const moved = boundaryEdges(quad(40, 20), null,
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1]);   // translate x+100
  check("the matrix is applied", moved.every(([a, b]) => a[0] >= 100 && b[0] >= 100),
    "edges come back in world space, where the measurement happens");
  check("nothing at all is not a crash", boundaryEdges(null).length === 0
    && boundaryEdges(new Float32Array([])).length === 0);
}

console.log("\narea comes from the triangles\n");
{
  check("a 40 × 20 face is 800", near(surfaceArea(quad(40, 20)), 800));
  check("...and scales with the matrix",
    near(surfaceArea(quad(40, 20), null,
      [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]), 3200),
    "doubling both directions quadruples the area");

  // The case a bounding box gets wrong: an L, whose box is 100 but whose
  // material is 75.
  const L = new Float32Array([
    0, 0, 0, 10, 0, 0, 10, 5, 0, 0, 0, 0, 10, 5, 0, 0, 5, 0,   // 10x5 = 50
    0, 5, 0, 5, 5, 0, 5, 10, 0, 0, 5, 0, 5, 10, 0, 0, 10, 0,   // 5x5  = 25
  ]);
  check("an L-shaped face is its material, not its box", near(surfaceArea(L), 75),
    `got ${surfaceArea(L)} — the bounding box would say 100`);
  check("an empty face has no area", surfaceArea(new Float32Array([])) === 0);
}

console.log("\nsnapping to an edge lands on the edge\n");
{
  check("a point beside the middle snaps onto it",
    closestPointOnSegment([5, 3, 0], [0, 0, 0], [10, 0, 0]).join() === "5,0,0");
  check("...past the end is clamped to the end",
    closestPointOnSegment([50, 3, 0], [0, 0, 0], [10, 0, 0]).join() === "10,0,0",
    "an edge snap must land ON the edge, not on the line through it");
  check("...and before the start likewise",
    closestPointOnSegment([-50, 3, 0], [0, 0, 0], [10, 0, 0]).join() === "0,0,0");
  check("a degenerate edge does not divide by zero",
    closestPointOnSegment([1, 1, 1], [2, 2, 2], [2, 2, 2]).join() === "2,2,2");
}

console.log("\ntwo faces: the gap, or the angle\n");
{
  const up = [0, 0, 1], down = [0, 0, -1], side = [1, 0, 0];
  check("a face is parallel to itself", facesParallel(up, up));
  check("...and to one facing the other way", facesParallel(up, down),
    "the two sides of a slab point in opposite directions — this IS the wall-thickness case");
  check("a perpendicular face is not parallel", !facesParallel(up, side));

  check("the gap is measured along the normal", near(faceGap([0, 0, 0], [0, 0, 5], up), 5));
  check("...and sideways offset does not inflate it",
    near(faceGap([0, 0, 0], [40, 90, 5], up), 5),
    "centre-to-centre would say 98.6 for a 5mm step");
  check("...whichever way the normal points", near(faceGap([0, 0, 0], [0, 0, 5], down), 5));

  check("a square corner reads 90", near(faceAngleDeg(up, side), 90, 1e-9));
  check("...not 270, whichever way the normals face",
    near(faceAngleDeg(up, [-1, 0, 0]), 90, 1e-9));
  check("parallel faces read 0", near(faceAngleDeg(up, down), 0, 1e-9));
  const d = faceAngleDeg([0, 0, 1], [0, Math.SQRT1_2, Math.SQRT1_2]);
  check("a 45° chamfer reads 45", near(d, 45, 1e-9), `got ${d}`);
}

console.log("\ndistance, and the numbers that let you act on it\n");
{
  // the 40 x 20 x 10 box measured in the browser: body diagonal sqrt(2100)
  const p = distanceParts([0, 0, 0], [40, 20, 10]);
  check("the body diagonal of 40 × 20 × 10", near(p.d, Math.sqrt(2100)));
  check("...with the axis components", p.dx === 40 && p.dy === 20 && p.dz === 10,
    "the components are what turn a measurement into an edit");
  check("components are unsigned whichever way round you click",
    distanceParts([40, 20, 10], [0, 0, 0]).dx === 40);
  check("a 3-4-5 triangle still works", near(distanceParts([0, 0, 0], [3, 4, 0]).d, 5));
}

console.log("\nhow the number is written\n");
{
  check("under 10mm keeps two decimals", measureText(3.048) === "3.05",
    "a 3.05 wall and a 3.1 wall are different parts");
  check("over 10mm keeps one", measureText(124.37) === "124.4",
    "more than that is false precision on a 0.2mm layer");
  check("a hair off zero is zero, not 0.00", measureText(1e-9) === "0");
  check("nonsense is a dash, not NaN", measureText(NaN) === "—" && measureText(Infinity) === "—");
}

console.log("\nthe viewer is wired to all of it\n");
{
  const { readFileSync } = await import("node:fs");
  const V = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const has = (needle, label, why) => check(label, V.includes(needle), why || needle);

  // THE DIMS BUG.
  check("the dims checkbox does not hand its Event to updateDims",
    !/\$\("dims"\)\.addEventListener\("change", updateDims\)/.test(V),
    "updateDims(target = modelGroup) would receive the Event and Box3 would throw");
  has('$("dims").addEventListener("change", () => updateDims());',
    "...it calls it with no argument, so the default applies");

  has('id="measure-panel"', "the measure panel exists");
  has('data-act="measure-btn"', "...and a toolbox row opens it");
  has("import * as mgeom", "the viewer uses the shared measure maths");
  has("mgeom.boundaryEdges(", "...for the model's real edges");
  has("mgeom.surfaceArea(", "...for area");
  has("mgeom.facesParallel(", "...for the parallel test");
  has("mgeom.faceAngleDeg(", "...for the angle");
  has("mgeom.distanceParts(", "...and for the distance");
  check("no second copy of the maths is left behind in the viewer",
    !/const dot = Math\.min\(1, Math\.max\(-1, n1\.dot\(n2\)\)\)/.test(V),
    "two implementations of the same sum will disagree eventually");

  has("if (snap.mesh === measurePending.mesh)",
    "picking the same face twice is refused",
    "on a box no two parallel faces are visible at once, so this is easy to do by accident");

  // FACE HIGHLIGHTING. In Face and Info modes the unit being picked is the
  // face, so the whole face lights up — and the implementation borrows the
  // model mesh's geometry rather than copying it, which makes the dispose
  // guard below the single most important line of the feature: without it,
  // clearing the overlay (every mouse move) would dispose the model's own
  // geometry and pointing at a face would tear it out of the solid.
  has("function measureFaceHilite", "faces light up when face-picking");
  has("if (!c.userData.sharedGeom) {",
    "...and clearing the overlay never disposes borrowed geometry",
    "the highlight shares the model mesh's geometry; disposing it would hole the model");
  has('if (measureMode === "face" && measurePending?.mesh)',
    "the first face of a pair stays lit from measureRedraw",
    "drawn there, not in the hover handler, so it survives the mouse leaving the model");
  has('snap.mesh === measurePending?.mesh)) {',
    "...and hovering the already-picked face does not repaint it amber");
  has("The model changed — measurements cleared.",
    "a rebuild clears the measurements",
    "world-space endpoints would keep drawing a confident number across a changed model");
  has("if (measureArmed) setMeasureArmed(false);", "Esc closes it");
  has("measureRescale();", "markers hold their size on screen");
  check("measure runs before the tools that edit",
    V.indexOf("if (measureArmed) {") < V.indexOf("if (drillArmed || codeArmed"),
    "it must swallow the click rather than also selecting a shape");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
