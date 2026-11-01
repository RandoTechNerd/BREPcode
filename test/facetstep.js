// Faceted STEP written from a build's own faces (src/facetstep.js).
//
// The worker's STEP download used to rebuild an exact-import model on the JS
// kernel, which kept 1,830 of a Benchy's 8,106 faces: the file had 3,106 open
// edges and a slicer showed half a boat. These build real models through the
// same engine call the worker makes, write the STEP, and read it back: every
// edge must be shared by exactly two faces, and flat faces must come out as
// one face each (with their holes), not as their triangles.
//
//   node test/facetstep.js

import { build, cube, cylinder, difference, translate } from "../index.js";
import { importedSolid, registerImport } from "../src/dsl.js";
import { runEngine } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";
import { trianglesStep } from "../src/facetstep.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const count = (step, entity) => (step.match(new RegExp(`=${entity}\\(`, "g")) || []).length;

// Read a STEP back: faces, and how many faces use each edge (by its endpoints).
function readBack(text) {
  const E = new Map();
  for (const m of text.matchAll(/#(\d+)=([A-Z0-9_]+)\(([\s\S]*?)\);/g)) E.set(+m[1], { t: m[2], a: m[3] });
  const refs = (s) => [...s.matchAll(/#(\d+)/g)].map((m) => +m[1]);
  const nums = (s) => s.match(/-?\d+(\.\d+)?([eE][-+]?\d+)?/g).map(Number);
  const pt = (id) => nums(E.get(id).a.replace(/^'[^']*',/, "")).slice(-3);
  const k = (p) => p.map((v) => v.toFixed(4)).join(",");
  const use = new Map();
  let faces = 0;
  for (const [, e] of E) {
    if (e.t !== "ADVANCED_FACE") continue;
    faces++;
    const r = refs(e.a);
    for (const b of r.slice(0, -1)) for (const oe of refs(E.get(refs(E.get(b).a)[0]).a)) {
      const ec = E.get(refs(E.get(oe).a).at(-1));
      const [v1, v2] = refs(ec.a).slice(0, 2).map((v) => pt(refs(E.get(v).a)[0]));
      const key = [k(v1), k(v2)].sort().join("|");
      use.set(key, (use.get(key) || 0) + 1);
    }
  }
  let open = 0, over = 0;
  for (const c of use.values()) { if (c === 1) open++; else if (c > 2) over++; }
  return { faces, open, over };
}

const rust = await loadRustKernel();
const engineSolids = async (shape) => {
  const r = await build(shape, { engine: "split" });
  const out = await runEngine(await r.partHistory.toJSON(), { rust, manifold: loadManifoldNode });
  return out.solids;
};

console.log("\nfaceted STEP from a build's faces: an exact part\n");
{
  const solids = await engineSolids(difference(cube([60, 40, 6]), translate([30, 20, -1], cylinder({ r: 5, h: 8, $fn: 32 }))));
  const r = trianglesStep(solids, "plate");
  const back = readBack(r.step);
  check("an ISO-10303-21 file with one manifold solid", r.step.startsWith("ISO-10303-21;") && count(r.step, "MANIFOLD_SOLID_BREP") === 1);
  check("closed: every edge on exactly two faces", r.openEdges === 0 && back.open === 0 && back.over === 0, `open ${back.open}, over ${back.over}`);
  check("the top and bottom are one face each, holed (FACE_BOUND)", count(r.step, "FACE_BOUND") === 2, `${count(r.step, "FACE_BOUND")} inner bounds`);
  check(`flat faces merged: ${r.faces} faces, far fewer than its triangles`, r.faces < 200 && r.faces >= 6);
  check("in millimetres", /SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(r.step));
}

console.log("\nfaceted STEP from a build's faces: an exact import (the Benchy case)\n");
{
  // a lumpy, organic STL -> the Rust kernel's stl2step -> importedSolid
  const n = 40, tris = [];
  const P = (i, j) => {
    const th = (i / n) * Math.PI, ph = (j / n) * 2 * Math.PI;
    const rr = 20 * (1 + 0.15 * Math.sin(3 * th) * Math.cos(2 * ph));
    return [rr * Math.sin(th) * Math.cos(ph), rr * Math.sin(th) * Math.sin(ph), rr * Math.cos(th) + 25];
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    if (i > 0) tris.push([a, b, d]);
    if (i < n - 1) tris.push([b, c, d]);
  }
  const stl = ["solid lumpy", ...tris.flatMap((t) => [" facet normal 0 0 0", "  outer loop", ...t.map((v) => `   vertex ${v.join(" ")}`), "  endloop", " endfacet"]), "endsolid lumpy"].join("\n");
  const conv = JSON.parse(rust.stl_to_step_json(new TextEncoder().encode(stl), "", "lumpy"));
  const srcFaces = count(conv.step, "ADVANCED_FACE");
  registerImport("lumpy.step", conv.step, { mesh: stl });
  const t0 = Date.now();
  const solids = await engineSolids(importedSolid("lumpy.step"));
  const r = trianglesStep(solids, "lumpy");
  const ms = Date.now() - t0;
  const back = readBack(r.step);
  check(`closed: every edge on exactly two faces (${r.faces} faces from a ${srcFaces}-face import)`, r.openEdges === 0 && back.open === 0, `open ${back.open}`);
  check("no face is lost: at least as many faces as the import had", r.faces >= srcFaces, `${r.faces} < ${srcFaces}`);
  check(`fast: built and written in ${ms} ms`, ms < 30000);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
