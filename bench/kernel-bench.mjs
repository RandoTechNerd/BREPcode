// Kernel speed + output bench: one Rust kernel build per process, so two
// builds (or the wasm and the native addon) never share a module cache.
//
//   node bench/kernel-bench.mjs models --kernel wasm   --out a.json
//   node bench/kernel-bench.mjs stl    --kernel native --out b.json --list stls.txt
//
// --kernel wasm    vendor/brep-kernel-rust, or BREPCODE_RUST_KERNEL_DIR
// --kernel native  vendor/brep-kernel-native, or BREPCODE_NATIVE_KERNEL
// --kernel smlib-native | smlib-wasm   NVIDIA SMLib (models only; it has no STL -> STEP)
// --reps N         timed runs per case (median kept), default 3
//
// "models" builds every catalog family at its defaults plus the bundled
// examples through runEngine (exact lane + tessellation + any mesh lane),
// clearing the kernel's history cache before every run so each one is cold.
// "stl" runs every STL in --list through stl_to_step_json (the drop menu's
// "Open as an exact solid") and keeps what the reconstruction reported.

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename } from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const mode = args[0];
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const KERNEL = opt("--kernel", "wasm");
const OUT = opt("--out", `bench-${mode}-${KERNEL}.json`);
const REPS = +opt("--reps", 3);
const ONLY = opt("--only", null);

const { loadRustKernel, loadManifoldNode } = await import("../src/engine-node.js");
let rust;
if (KERNEL === "native") {
  const nk = createRequire(import.meta.url)("../desktop/native-kernel.cjs");
  rust = nk.load();
  if (!rust) throw new Error(`native kernel did not load: ${nk.load.error}`);
} else if (KERNEL === "smlib-native") {
  // NVIDIA SMLib (usd-brep) as the Alpha's Node addon, native/nvidia-kernel
  const { loadNvidiaKernel } = await import("../src/engine-node.js");
  rust = loadNvidiaKernel();
  if (!rust) throw new Error("the SMLib addon isn't built (npm run build:nvidia)");
} else if (KERNEL === "smlib-wasm") {
  // SMLib compiled to WebAssembly (the website's kernel). It lives on another
  // branch, so SMLIB_WASM_ROOT names a checkout that has vendor/brep-kernel-smlib
  // and the adapter.cjs with wrap() (default: this checkout); nothing there is written to.
  const { fileURLToPath } = await import("node:url");
  const root = process.env.SMLIB_WASM_ROOT || fileURLToPath(new URL("..", import.meta.url));
  const { pathToFileURL } = await import("node:url");
  const { default: loadSmlib } = await import(pathToFileURL(`${root}/vendor/brep-kernel-smlib/api.mjs`).href);
  const { wrap } = createRequire(import.meta.url)(`${root}/native/nvidia-kernel/adapter.cjs`);
  rust = wrap(await loadSmlib());
} else {
  rust = await loadRustKernel();
}
const kernelInfo = KERNEL === "native" ? rust.info
  : KERNEL.startsWith("smlib") ? `SMLib ${KERNEL === "smlib-wasm" ? `wasm from ${process.env.SMLIB_WASM_ROOT}` : "native addon"}`
  : (process.env.BREPCODE_RUST_KERNEL_DIR || "vendor/brep-kernel-rust");

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };
const clear = () => { try { rust.clear_history_cache_json?.(); } catch { /* older builds */ } };
const results = [];
const t00 = performance.now();

if (mode === "models") {
  const { PartHistory } = await import("brep-io-kernel");
  const dsl = await import("../src/dsl.js");
  const { runEngine, solidsToSTL } = await import("../src/engine.js");
  const { FAMILIES } = await import("../src/catalog/index.js");
  const { resolveParams, familyCode } = await import("../src/catalog/schema.js");
  const { fromOpenSCAD } = await import("../src/openscad.js");
  const vocab = Object.fromEntries(Object.entries(dsl).filter(([k, v]) => typeof v === "function" && k !== "compile"));
  const names = Object.keys(vocab);
  const evalCode = (src) => new Function(...names, `"use strict";\n${src}`)(...names.map((n) => vocab[n]));

  const cases = FAMILIES.map((f) => ({ id: `catalog/${f.id}`, make: () => evalCode(familyCode(f, resolveParams(f).values)) }));
  for (const file of ["bracket.js", "coin-dish.js", "knob.scad", "screwdriver-holder.scad", "elephant.scad", "orca-bobble.scad", "ltt-collar.js", "ltt-cradle.js", "mini-centrifuge.js"]) {
    const url = new URL(`../examples/${file}`, import.meta.url);
    cases.push({ id: `examples/${file}`, make: async () => {
      if (file.endsWith(".scad")) return fromOpenSCAD(readFileSync(url, "utf8"));
      const m = await import(url.href);
      return typeof m.default === "function" ? m.default({}) : m.default;
    } });
  }

  const volumeOf = (solids) => {
    const stl = solidsToSTL(solids);
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    let vol = 0;
    for (let i = 0; i + 2 < v.length; i += 3) {
      const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    return { vol, tris: v.length / 3 };
  };

  let warmed = false;
  for (const c of cases) {
    if (ONLY && !c.id.includes(ONLY)) continue;
    const row = { id: c.id };
    let json;
    try {
      const ph = new PartHistory();
      await dsl.compile(await c.make(), ph);
      json = await ph.toJSON();
    } catch (e) { row.ok = false; row.stage = "compile"; row.error = String(e.message || e).slice(0, 300); results.push(row); continue; }
    if (!warmed) { clear(); try { await runEngine(json, { rust, manifold: loadManifoldNode }); } catch { /* warm-up only */ } warmed = true; }
    const ms = [], exactMs = [], meshMs = [];
    let out = null, t = 0;
    try {
      for (let i = 0; i < REPS; i++) {
        clear();
        t = performance.now();
        out = await runEngine(json, { rust, manifold: loadManifoldNode });
        ms.push(performance.now() - t);
        exactMs.push(out.stats?.exactMs ?? 0); meshMs.push(out.stats?.meshMs ?? 0);
      }
      const { vol, tris } = volumeOf(out.solids);
      Object.assign(row, {
        ok: true, lane: out.lane, solids: out.solids.length, faces: out.solids.reduce((n, s) => n + (s.faces?.length || 0), 0),
        tris, vol: +vol.toFixed(3), ms: +median(ms).toFixed(1), exactMs: +median(exactMs).toFixed(1), meshMs: +median(meshMs).toFixed(1),
        hullsAsMesh: out.stats?.hullsAsMesh || 0,
      });
    } catch (e) {
      // how long the refusal took: a default kernel that refuses still costs
      // this much before the fallback kernel starts
      Object.assign(row, { ok: false, stage: "engine", refusedAfterMs: +(performance.now() - t).toFixed(1), error: String(e.message || e).slice(0, 300) });
    }
    results.push(row);
    console.log(`${row.ok ? "ok  " : "FAIL"} ${row.id.padEnd(44)} ${row.ok ? `${String(row.ms).padStart(8)} ms  ${row.lane}` : row.error.slice(0, 90)}`);
  }
} else if (mode === "probe") {
  // One feature per case: what each kernel builds exactly, what it hands to the
  // mesh lane, and what it refuses. Same DSL, same engine; only the kernel
  // differs. A refusal here is what makes the app fall back to the next kernel.
  const { PartHistory } = await import("brep-io-kernel");
  const dsl = await import("../src/dsl.js");
  const { runEngine, solidsToSTL } = await import("../src/engine.js");
  const vocab = Object.fromEntries(Object.entries(dsl).filter(([k, v]) => typeof v === "function" && k !== "compile"));
  const names = Object.keys(vocab);
  const evalCode = (src) => new Function(...names, `"use strict";\nreturn (${src});`)(...names.map((n) => vocab[n]));
  // a STEP solid to import: the default Rust build's own reconstruction of a box
  const boxStl = (() => {
    const v = [[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,10],[20,0,10],[20,20,10],[0,20,10]];
    const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
    return `solid b\n${f.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${v[i].join(" ")}`).join("\n")}\nendloop\nendfacet`).join("\n")}\nendsolid b\n`;
  })();
  try {
    const helper = await loadRustKernel();
    dsl.registerImport("probe-box.step", JSON.parse(helper.stl_to_step_json(new TextEncoder().encode(boxStl), "", "probe-box")).step);
  } catch (e) { console.log(`(no STEP fixture: ${e.message})`); }
  const P = "polygon([[0,0],[20,0],[20,10],[10,20],[0,20]])";
  const CASES = [
    ["primitive: box", "cube([20, 20, 10])"],
    ["primitive: cylinder", "cylinder({ r: 5, h: 10 })"],
    ["primitive: cone", "cylinder({ r1: 6, r2: 2, h: 10 })"],
    ["primitive: sphere", "sphere({ r: 6 })"],
    ["primitive: torus", "torus({ r: 10, tube: 2 })"],
    ["primitive: part torus (180 deg)", "torus({ r: 10, tube: 2, arc: 180 })"],
    ["primitive: 6-sided cylinder ($fn 6)", "cylinder({ r: 5, h: 10, $fn: 6 })"],
    ["sketch: extrude polygon", `linearExtrude({ h: 8 }, ${P})`],
    ["revolve: full", "revolve(360, polygon([[0,0],[8,0],[8,4],[4,10],[0,10]]))"],
    ["revolve: partial (120 deg)", "revolve(120, polygon([[0,0],[8,0],[8,4],[4,10],[0,10]]))"],
    ["boolean: union", "union(cube([20,20,10]), translate([10,10,0], cylinder({ r: 6, h: 18 })))"],
    ["boolean: subtract", "difference(cube([20,20,10]), translate([10,10,-1], cylinder({ r: 4, h: 12 })))"],
    ["boolean: intersect", "intersection(cube([20,20,20]), translate([10,10,10], sphere({ r: 13 })))"],
    ["boolean: tangent torus + cylinder", "union(cylinder({ r: 8, h: 10 }), translate([0,0,5], torus({ r: 10, tube: 2 })))"],
    ["fillet: straight edges", "fillet({ r: 2, edges: 'z' }, cube([20, 20, 10]))"],
    ["fillet: circular rim", "fillet({ r: 1.5, edges: 'top' }, cylinder({ r: 10, h: 10 }))"],
    ["fillet: after a boolean", "fillet({ r: 1, edges: 'top' }, difference(cube([20,20,10]), translate([10,10,-1], cylinder({ r: 4, h: 12 }))))"],
    ["fillet: every convex edge", "fillet({ r: 1, edges: 'convex' }, union(cube([20,20,10]), translate([5,5,0], cube([10,10,16]))))"],
    ["fillet: too large for the part", "fillet({ r: 6, edges: 'z' }, cube([10, 10, 10]))"],
    ["chamfer: top edges", "chamfer({ d: 1.5, edges: 'top' }, cube([20, 20, 10]))"],
    ["transform: translate + rotate", "translate([5,0,0], rotate([30,20,10], cube([20,10,5])))"],
    ["transform: non-uniform scale", "scale([2,1,1], sphere({ r: 5 }))"],
    ["transform: mirror", "mirror([1,0,0], translate([5,0,0], cube([10,10,10])))"],
    ["hull: four corner cylinders", "hull(...[[0,0],[30,0],[30,20],[0,20]].map(([x,y]) => translate([x,y,0], cylinder({ r: 3, h: 6 }))))"],
    ["sweep: tube along a helix", "tube(helix({ r: 10, turns: 2, pitch: 6 }), { r: 1 })"],
    ["sweep: tube along a polyline", "tube([[0,0,0],[30,0,0],[30,30,0],[30,30,20]], { r: 2 })"],
    ["import: exact STEP solid", "importedSolid('probe-box.step')"],
    ["import: STEP solid + boolean", "difference(importedSolid('probe-box.step'), translate([10,10,-1], cylinder({ r: 4, h: 12 })))"],
  ];
  for (const [id, code] of CASES) {
    if (ONLY && !id.includes(ONLY)) continue;
    const row = { id, code };
    let json, t = 0;
    try {
      const ph = new PartHistory();
      await dsl.compile(evalCode(code), ph);
      json = await ph.toJSON();
    } catch (e) { Object.assign(row, { ok: false, stage: "compile", error: String(e.message || e).slice(0, 300) }); results.push(row); console.log(`FAIL ${id}: compile ${row.error.slice(0, 80)}`); continue; }
    try {
      clear(); t = performance.now();
      const out = await runEngine(json, { rust, manifold: loadManifoldNode });
      const ms = performance.now() - t;
      const stl = solidsToSTL(out.solids);
      const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
      let vol = 0;
      for (let i = 0; i + 2 < v.length; i += 3) {
        const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      }
      Object.assign(row, { ok: true, lane: out.lane, ms: +ms.toFixed(1), vol: +vol.toFixed(2), faces: out.solids.reduce((n, s) => n + (s.faces?.length || 0), 0) });
    } catch (e) { Object.assign(row, { ok: false, stage: "engine", refusedAfterMs: +(performance.now() - t).toFixed(1), error: String(e.message || e).slice(0, 300) }); }
    results.push(row);
    console.log(`${row.ok ? "ok  " : "FAIL"} ${id.padEnd(40)} ${row.ok ? `${row.lane} vol ${row.vol} faces ${row.faces}` : row.error.slice(0, 100)}`);
  }
  // STL -> STEP is a separate entry point, not a feature
  const has = typeof rust.stl_to_step_json === "function";
  let stlRow = { id: "stl -> step: reconstruct a mesh", ok: false, error: "no stl_to_step_json in this kernel" };
  if (has) {
    try { const o = JSON.parse(rust.stl_to_step_json(new TextEncoder().encode(boxStl), "", "b")); stlRow = { id: stlRow.id, ok: true, lane: o.report?.backend, faces: (o.step.match(/ADVANCED_FACE\(/g) || []).length }; }
    catch (e) { stlRow.error = String(e.message || e).slice(0, 200); }
  }
  results.push(stlRow);
  console.log(`${stlRow.ok ? "ok  " : "FAIL"} ${stlRow.id.padEnd(40)} ${stlRow.ok ? `${stlRow.lane} faces ${stlRow.faces}` : stlRow.error}`);
} else if (mode === "stl") {
  const list = readFileSync(opt("--list", "stls.txt"), "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  const count = (s, re) => (s.match(re) || []).length;
  for (const file of list) {
    const name = basename(file);
    if (ONLY && !name.includes(ONLY)) continue;
    const bytes = new Uint8Array(readFileSync(file));
    const reps = statSync(file).size > 2e6 ? 1 : REPS;
    const row = { id: name, file, kb: Math.round(bytes.length / 1024) };
    const ms = [];
    try {
      let out;
      for (let i = 0; i < reps; i++) {
        const t = performance.now();
        out = JSON.parse(rust.stl_to_step_json(bytes, "", name.replace(/\.stl$/i, "")));
        ms.push(performance.now() - t);
      }
      const r = out.report || {}, h = r.hybrid_rebuild || {};
      const step = out.step;
      Object.assign(row, {
        ok: true, ms: +median(ms).toFixed(1), backend: r.backend, triangles: out.sourceTriangles,
        faces: count(step, /ADVANCED_FACE\(/g), stepKB: Math.round(step.length / 1024),
        planes: count(step, /=\s*PLANE\(/g), cylinders: count(step, /CYLINDRICAL_SURFACE\(/g), cones: count(step, /CONICAL_SURFACE\(/g),
        spheres: count(step, /SPHERICAL_SURFACE\(/g), tori: count(step, /TOROIDAL_SURFACE\(/g),
        bsplines: count(step, /B_SPLINE_SURFACE/g),
        analyticTris: ["plane", "cylinder", "cone", "sphere", "torus"].reduce((n, k) => n + (h[`analytic_${k}_triangles`] || 0), 0),
        facetedFaces: h.faceted_faces ?? null, facetedTris: h.faceted_triangles ?? null,
        roundtripSolids: r.roundtrip_solids ?? null, auditIssues: (r.manifold_audit_issues || []).length,
        droppedFacets: (r.dropped_facets || []).length, timings: r.timings || null,
        wholeCarrier: r.whole_carrier_scan || null,
      });
    } catch (e) { Object.assign(row, { ok: false, ms: ms.length ? +median(ms).toFixed(1) : null, error: String(e?.message || e).slice(0, 400) }); }
    results.push(row);
    console.log(`${row.ok ? "ok  " : "FAIL"} ${name.padEnd(40)} ${row.ok ? `${String(row.ms).padStart(9)} ms  ${row.backend}  faces ${row.faces}` : row.error.slice(0, 100)}`);
  }
} else {
  console.error("usage: node bench/kernel-bench.mjs models|stl --kernel wasm|native --out file.json");
  process.exit(2);
}

const meta = {
  mode, kernel: KERNEL, kernelInfo, reps: REPS, node: process.version, wallSeconds: +((performance.now() - t00) / 1000).toFixed(1),
  cpu: os.cpus()[0]?.model, cores: os.cpus().length, platform: `${os.platform()} ${os.release()}`, date: new Date().toISOString(),
};
writeFileSync(OUT, JSON.stringify({ meta, results }, null, 1));
console.log(`wrote ${OUT} (${results.length} cases, ${meta.wallSeconds} s)`);
// manifold-3d / the native addon keep handles open; nothing else to wait for
process.exit(0);
