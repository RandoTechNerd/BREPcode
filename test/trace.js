// Image autotrace: threshold -> contours -> mm polygons -> BREPcode, plus a
// round-trip that actually extrudes the traced code through the kernel.

import { traceImage, contoursToCode } from "../viewer/trace.js";
import { polygon, linearExtrude, difference, union, translate, build, toSTL } from "../index.js";

function volOf(stl) {
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

// build a fake ImageData: dark shape on a white field
function img(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;   // white
    data[i * 4 + 3] = 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (paint(x, y)) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;   // black
    }
  }
  return { width: w, height: h, data };
}

console.log("\nimage trace\n");

// a solid filled square
{
  const im = img(60, 60, (x, y) => x >= 10 && x < 50 && y >= 10 && y < 50);
  const { outers, holes, count } = traceImage(im, { size: 40, simplify: 1.0 });
  check("filled square -> 1 outer, 0 holes", outers.length === 1 && holes.length === 0, `outers ${outers.length} holes ${holes.length} count ${count}`);
  const b = outers[0];
  const xs = b.map((p) => p[0]), ys = b.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), hh = Math.max(...ys) - Math.min(...ys);
  check("square fits ~40mm and is centred", near(w, 40, 3) && near(hh, 40, 3) && near((Math.max(...xs) + Math.min(...xs)) / 2, 0, 2), `w ${w.toFixed(1)} h ${hh.toFixed(1)}`);
}

// a square ring (hole in the middle) -> outer + hole
{
  const im = img(80, 80, (x, y) => {
    const outer = x >= 10 && x < 70 && y >= 10 && y < 70;
    const inner = x >= 30 && x < 50 && y >= 30 && y < 50;
    return outer && !inner;
  });
  const { outers, holes } = traceImage(im, { size: 60, simplify: 1.0 });
  check("ring -> 1 outer + 1 hole", outers.length === 1 && holes.length === 1, `outers ${outers.length} holes ${holes.length}`);
}

// two separate blobs -> two outers
{
  const im = img(100, 50, (x, y) => (x >= 10 && x < 35 && y >= 10 && y < 40) || (x >= 60 && x < 90 && y >= 10 && y < 40));
  const { outers } = traceImage(im, { size: 80, simplify: 1.0 });
  check("two blobs -> two outers", outers.length === 2, `outers ${outers.length}`);
}

console.log("\ncode generation + kernel round-trip\n");

// generated code for a plain square must extrude to a ~40x40xH slab
{
  const im = img(60, 60, (x, y) => x >= 10 && x < 50 && y >= 10 && y < 50);
  const code = contoursToCode(traceImage(im, { size: 40, simplify: 1.0 }), 5);
  check("code is a linearExtrude", /linearExtrude/.test(code), code?.slice(0, 30));
  // eval the generated BREPcode via the DSL vocabulary
  const shape = new Function("polygon", "linearExtrude", "difference", "union", `return (${code});`)(
    polygon, linearExtrude, difference, union);
  const stl = toSTL(await build(shape), "t");
  const zs = [...stl.matchAll(/vertex\s+\S+\s+\S+\s+(\S+)/g)].map((m) => +m[1]);
  check("traced square extrudes to height 5", near(Math.max(...zs), 5, 0.2) && near(Math.min(...zs), 0, 0.2), `${Math.min(...zs)}..${Math.max(...zs)}`);
}

// the ring's generated code should use difference() and leave a hole
{
  const im = img(80, 80, (x, y) => {
    const outer = x >= 10 && x < 70 && y >= 10 && y < 70;
    const inner = x >= 30 && x < 50 && y >= 30 && y < 50;
    return outer && !inner;
  });
  const contours = traceImage(im, { size: 60, simplify: 1.0 });
  const code = contoursToCode(contours, 4);
  check("ring code uses difference()", /difference\(/.test(code));
  const mk = (c) => new Function("polygon", "linearExtrude", "difference", "union", "translate", `return (${c});`)(
    polygon, linearExtrude, difference, union, translate);
  const stl = toSTL(await build(mk(code)), "t");
  const facets = (stl.match(/facet normal/g) || []).length;
  check("ring extrudes to a valid solid with a hole", facets > 20, `${facets} facets`);
  // the hole must go all the way through: removed volume should equal the hole
  // footprint times the FULL height (a capped hole would remove less)
  const vRing = volOf(stl);
  const solidOnly = contoursToCode({ outers: contours.outers, holes: [] }, 4);
  const vSolid = volOf(toSTL(await build(mk(solidOnly)), "t"));
  const holeArea = Math.abs((() => {
    const p = contours.holes[0]; let a = 0;
    for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
    return a / 2;
  })());
  const removed = vSolid - vRing;
  check("hole is a true through-hole (full-depth cut)", removed > holeArea * 4 * 0.9,
    `removed ${removed.toFixed(0)}, through-hole ~${(holeArea * 4).toFixed(0)}`);
}

// ---- rings -> one extruded solid (what smooth text() is built from) -------
{
  const { ringsToPrismStl } = await import("../viewer/trace.js");
  const { ShapeUtils, Vector2 } = await import("three");
  const tri = (o, hs) => ShapeUtils.triangulateShape(o.map(([x, y]) => new Vector2(x, y)), hs.map((h) => h.map(([x, y]) => new Vector2(x, y))));
  const ring = (cx, cy, r, n, cw = false) => Array.from({ length: n }, (_, i) => {
    const a = ((cw ? -i : i) / n) * 2 * Math.PI;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  // an "O" (disc with a hole) and a separate square "I", windings deliberately wrong
  const outers = [ring(0, 0, 10, 64, true), [[20, -10], [20, 10], [24, 10], [24, -10]]];
  const holes = [ring(0, 0, 6, 64)];
  const stl = ringsToPrismStl(outers, holes, 2, tri);
  const P = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => `${(+m[1]).toFixed(5)},${(+m[2]).toFixed(5)},${(+m[3]).toFixed(5)}`);
  const edges = new Map();
  for (let i = 0; i < P.length; i += 3) for (let e = 0; e < 3; e++) {
    const k = `${P[i + e]}>${P[i + (e + 1) % 3]}`;
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  // closed AND consistently wound: every directed edge once, its reverse once
  const closed = [...edges.keys()].every((k) => { const [a, b] = k.split(">"); return edges.get(k) === 1 && edges.get(`${b}>${a}`) === 1; });
  check("rings extrude into one closed, consistently wound shell", closed);
  const want = (Math.PI * (100 - 36)) * 2 + 4 * 20 * 2;      // smooth-circle volume; the 64-gon is ~0.5% less
  let signed = 0;
  const V = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  for (let i = 0; i < V.length; i += 3) {
    const [a, b, c] = V.slice(i, i + 3);
    signed += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  check("...with the hole cut and normals pointing out (positive volume)", signed > 0 && near(signed, want, want * 0.01), `${signed.toFixed(1)} vs ${want.toFixed(1)}`);
  // and the kernel takes it as a solid (this is the road text() uses)
  const { registerImport, importedMesh } = await import("../src/dsl.js");
  registerImport("__rings_test.stl", stl);
  const got = volOf(toSTL(await build(importedMesh("__rings_test.stl")), "t"));
  check("...and imports through the kernel as one solid", near(got, signed, signed * 0.01), `${got.toFixed(1)}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
