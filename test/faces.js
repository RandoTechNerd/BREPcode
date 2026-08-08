// Recovering a solid's real faces and edges from its triangles.
//
// Everything the constructive rounded offset does depends on this being right,
// and it is the kind of thing that looks right while being wrong: a cube whose
// six diagonal seams are mistaken for edges still LOOKS like a cube, it just
// grows six tubes buried in the middle of its flat sides.

import { analyzeSolid, offsetPrimitiveCount, triangleNormal } from "../src/faces.js";
import { boxMesh, cylinderMesh, meshSubtract, meshUnion } from "../src/meshbool.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

console.log("\na cube is six faces and twelve edges, not twelve and eighteen\n");
{
  const cube = boxMesh([20, 20, 20]);
  const a = analyzeSolid(cube);
  check("12 triangles merge into 6 faces", a.faces.length === 6, `${a.faces.length}`);
  check("...covering every triangle",
    a.faces.reduce((n, f) => n + f.triangles.length, 0) === 12);
  // The seam is the point of the whole module: a cube has 18 triangle edges and
  // only 12 of them are real. The other 6 are diagonals across flat sides.
  check("12 real edges, so the 6 diagonals were dropped", a.edges.length === 12,
    `${a.edges.length}`);
  check("all twelve are convex", a.convexEdges.length === 12, `${a.convexEdges.length}`);
  check("8 corners want a sphere", a.convexVertices.length === 8, `${a.convexVertices.length}`);
  // Every real edge must join two DIFFERENT faces; that is what makes it real.
  check("every edge joins two different faces",
    a.edges.every((e) => e.faces[0] !== e.faces[1]));
  // Each face normal should be an axis, and all six should be distinct.
  const axes = new Set(a.faces.map((f) => f.normal.map((v) => Math.round(v)).join(",")));
  check("the six normals are the six axis directions", axes.size === 6,
    [...axes].join(" | "));
}

console.log("\nparallel is not the same as coplanar\n");
{
  // A thin plate: top and bottom are parallel and 2mm apart. Merging them would
  // make a solid with one face where it has two, and no edges between them.
  const plate = boxMesh([40, 40, 2]);
  const a = analyzeSolid(plate);
  check("a 2mm plate still has 6 faces", a.faces.length === 6, `${a.faces.length}`);
  check("...and 12 edges", a.edges.length === 12, `${a.edges.length}`);
  // Two separate blocks sharing no material are two solids, and coplanar faces
  // across the gap must not be joined into one face.
  const two = meshUnion(boxMesh([10, 10, 10], [-20, 0, 0]), boxMesh([10, 10, 10], [20, 0, 0]));
  const b = analyzeSolid(two);
  check("two separate blocks give 12 faces, not 6", b.faces.length === 12, `${b.faces.length}`);
}

console.log("\na valley is not a rim\n");
{
  // A block with a pocket milled into the top. The outside corners are convex
  // and want tubes; the corners INSIDE the pocket fold into the material and
  // must not get one, or the tube sits buried in solid.
  const block = meshSubtract(boxMesh([30, 30, 20]), boxMesh([14, 14, 14], [0, 0, 10]));
  const a = analyzeSolid(block);
  const concave = a.edges.filter((e) => !e.convex);
  check("the pocket produced concave edges", concave.length > 0, `${concave.length}`);
  check("...and convex ones too", a.convexEdges.length > 0, `${a.convexEdges.length}`);
  check("they add up to every edge", concave.length + a.convexEdges.length === a.edges.length);
  // The pocket floor's four edges are the classic valley. The floor sits at
  // z = 3 (a 14mm pocket cut 14 deep into a 20 block, centred at z=10), so any
  // edge with both ends on that plane and folding upward is concave.
  const floorEdges = a.edges.filter((e) => {
    const za = block.points[e.a][2], zb = block.points[e.b][2];
    return Math.abs(za - 3) < 1e-6 && Math.abs(zb - 3) < 1e-6;
  });
  check("the pocket floor's rim is found", floorEdges.length === 4, `${floorEdges.length}`);
  check("...and every one of them reads as concave", floorEdges.every((e) => !e.convex),
    floorEdges.map((e) => e.convex).join(","));
}

console.log("\na faceted cylinder keeps one face per facet\n");
{
  const cyl = cylinderMesh({ r: 10, h: 20, segments: 16 });
  const a = analyzeSolid(cyl);
  // 16 wall facets plus a top and a bottom.
  check("16 walls + 2 caps = 18 faces", a.faces.length === 18, `${a.faces.length}`);
  // 16 vertical creases between walls, plus 16 around each cap rim.
  check("48 real edges", a.edges.length === 48, `${a.edges.length}`);
  check("all of them convex on a plain cylinder", a.convexEdges.length === 48,
    `${a.convexEdges.length}`);
  // The caps are triangle fans; every fan spoke is a seam, not an edge.
  check("the fan spokes in the caps were not counted as edges",
    a.edges.length < cyl.faces.length * 3 / 2, `${a.edges.length}`);
}

console.log("\nthe primitive count is the number that decides the method\n");
{
  const count = offsetPrimitiveCount(boxMesh([20, 20, 20]));
  check("a cube needs 6 slabs + 12 tubes + 8 balls",
    count.slabs === 6 && count.tubes === 12 && count.balls === 8,
    JSON.stringify(count));
  check("...26 primitives in total", count.total === 26, `${count.total}`);
  // The point of the merge: WITHOUT it every triangle edge would want a tube,
  // which is 18 rather than 12 on a cube and grows much faster on a cylinder.
  const cyl = offsetPrimitiveCount(cylinderMesh({ r: 10, h: 20, segments: 16 }));
  check("a faceted cylinder stays affordable", cyl.total < 200, JSON.stringify(cyl));
  // And the case that must NOT go constructive.
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
  const org = offsetPrimitiveCount(sphere);
  check("an organic mesh blows past any sane union", org.total > 2000, JSON.stringify(org));
}

console.log("\nawkward input does not throw\n");
{
  const withSliver = boxMesh([20, 20, 20]);
  withSliver.faces = [...withSliver.faces, [0, 1, 1]];
  let ok = true;
  try { analyzeSolid(withSliver); } catch { ok = false; }
  check("a zero-area triangle is tolerated", ok);
  check("...and does not become a face of its own",
    analyzeSolid(withSliver).faces.length === 6);
  check("an empty mesh gives nothing rather than throwing",
    analyzeSolid({ points: [], faces: [] }).faces.length === 0);
  check("a normal is null for a degenerate triangle",
    triangleNormal([[0, 0, 0], [1, 0, 0], [2, 0, 0]], [0, 1, 2]) === null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
