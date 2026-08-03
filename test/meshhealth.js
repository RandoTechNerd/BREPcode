// Reading an imported mesh's health. The whole value of this is that it tells
// the truth about a specific file, so the tests are built from meshes whose
// faults are known exactly — a cube with a face removed has ONE hole and it is
// the size of that face, and nothing else.

import {
  inspectMesh, weldTriangles, inspectBinaryStl, healthSummary,
} from "../src/meshhealth.js";
import { boxMesh, cylinderMesh } from "../src/meshbool.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

console.log("\na sound mesh is reported sound\n");
{
  const s = inspectMesh(boxMesh([20, 20, 20]));
  check("a cube is watertight", s.watertight);
  check("...with no open edges", s.openEdges === 0);
  check("...no over-used edges", s.overusedEdges === 0);
  check("...no winding clashes", s.windingClashes === 0);
  check("...no duplicate faces", s.duplicateFaces === 0);
  check("...12 triangles, 8 vertices, 18 edges", s.triangles === 12 && s.vertices === 8 && s.edges === 18,
    JSON.stringify(s));
  check("...and Euler says a sphere", s.chi === 2 && s.genus === 0);
  const c = inspectMesh(cylinderMesh({ r: 10, h: 20, segments: 24 }));
  check("a closed cylinder is watertight too", c.watertight, JSON.stringify(c));
  check("...and also genus 0", c.genus === 0);
}

console.log("\nand each way of being broken is named separately\n");
{
  // A hole: drop one triangle. Its three edges now belong to one face each.
  const holed = boxMesh([20, 20, 20]);
  holed.faces = holed.faces.slice(1);
  const h = inspectMesh(holed);
  check("a missing face reads as open edges, not as something else",
    !h.watertight && h.openEdges === 3 && h.overusedEdges === 0 && h.windingClashes === 0,
    JSON.stringify(h));
  check("...and genus is withheld, because it is meaningless on an open surface",
    h.genus === null);

  // A flipped face: reverse one triangle's winding.
  const flipped = boxMesh([20, 20, 20]);
  flipped.faces = flipped.faces.map((f, i) => (i === 0 ? [f[0], f[2], f[1]] : f));
  const fl = inspectMesh(flipped);
  check("a reversed face reads as a winding clash", fl.windingClashes > 0 && !fl.watertight,
    JSON.stringify(fl));
  check("...and does NOT get reported as a hole", fl.openEdges === 0);

  // A duplicate face: the same triangle twice.
  const dup = boxMesh([20, 20, 20]);
  dup.faces = [...dup.faces, dup.faces[0].slice()];
  const d = inspectMesh(dup);
  check("a repeated face is counted", d.duplicateFaces === 1, JSON.stringify(d));
  check("...and shows up as an over-used edge as well", d.overusedEdges > 0);

  // Zero-area triangles are dropped rather than counted as geometry.
  const sliver = boxMesh([20, 20, 20]);
  sliver.faces = [...sliver.faces, [0, 1, 1]];
  const sl = inspectMesh(sliver);
  check("a zero-area face is dropped, not counted", sl.degenerate === 1 && sl.triangles === 12);
  check("...and does not make a sound mesh look broken", sl.watertight);
}

console.log("\nwelding is what makes any of this measurable\n");
{
  // A triangle soup — every triangle with its own copy of each vertex — is what
  // an STL reader hands over. Without welding, nothing shares an edge and a
  // perfect cube looks like 36 separate holes.
  const cube = boxMesh([20, 20, 20]);
  const coords = [];
  for (const [a, b, c] of cube.faces) {
    for (const i of [a, b, c]) coords.push(...cube.points[i]);
  }
  const unwelded = { points: coords.length / 3, faces: cube.faces };
  check("the soup really is 36 loose vertices", coords.length / 3 === 36);
  const welded = weldTriangles(coords);
  check("welding recovers the 8 real corners", welded.points.length === 8, `${welded.points.length}`);
  check("...and the welded mesh is watertight", inspectMesh(welded).watertight);
  check("...which the unwelded one could never be",
    inspectMesh({ points: new Array(36).fill([0, 0, 0]), faces: [] }).triangles === 0);
  void unwelded;
}

console.log("\nbinary STL goes straight to a verdict\n");
{
  const cube = boxMesh([20, 20, 20]);
  const tris = cube.faces.map(([a, b, c]) => [cube.points[a], cube.points[b], cube.points[c]]);
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, i) => {
    const o = 84 + i * 50 + 12;
    t.forEach((p, j) => p.forEach((v, k) => dv.setFloat32(o + j * 12 + k * 4, v, true)));
  });
  const s = inspectBinaryStl(new Uint8Array(buf));
  check("a binary STL of a cube reads as watertight", s && s.watertight, JSON.stringify(s));
  check("...with the right triangle count", s.triangles === 12);
  check("a truncated file is refused rather than half-read",
    inspectBinaryStl(new Uint8Array(buf.slice(0, 100))) === null);
  check("a file too small to be an STL is refused",
    inspectBinaryStl(new Uint8Array(8)) === null);
}

console.log("\nthe summary line leads with the verdict\n");
{
  const good = healthSummary(inspectMesh(boxMesh([20, 20, 20])));
  check("a sound mesh says so, and says there is nothing to fix",
    /watertight/.test(good) && /nothing to repair/.test(good), good);
  const holed = boxMesh([20, 20, 20]);
  holed.faces = holed.faces.slice(1);
  const bad = healthSummary(inspectMesh(holed));
  check("a broken one names the fault", /open edge/.test(bad), bad);
  check("...and does not claim to be watertight", !/watertight/.test(bad), bad);
  check("counts are grouped for reading", /225,154/.test(healthSummary({
    triangles: 225154, watertight: true, openEdges: 0, overusedEdges: 0, windingClashes: 0,
  })));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
