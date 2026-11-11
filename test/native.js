// The desktop app's native kernel (rust/brepcode-native) against the wasm one
// the website runs: same feature list in, same solids out. Both are the same
// upstream kernel at the same commit, so this is a check that the native
// wrapper (desktop/native-kernel.cjs) hands the engine what the wasm does.
// Not bit-for-bit: native sin/cos come from the C runtime and the wasm build
// carries its own, so a curve can land an ulp or so apart. Same faces, same
// triangles, every vertex within MAX_DEV.
//
// Skips when vendor/brep-kernel-native/brepcode_native.node isn't built
// (`npm run build:native`), so a clone without Rust stays green.

import { createRequire } from "node:module";
import { PartHistory } from "brep-io-kernel";
import * as d from "../src/dsl.js";
import { runEngine, solidsToSTL, EngineRefusal } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";

const require = createRequire(import.meta.url);
const nativeMod = require("../desktop/native-kernel.cjs");
const native = nativeMod.load();
if (!native) {
  console.log(`native kernel: skipped (${nativeMod.load.error})`);
  process.exit(0);
}
console.log(`native kernel: ${native.info}`);
const wasm = await loadRustKernel();

const MAX_DEV = 1e-6;   // mm
let fails = 0;
const check = (label, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "ok   " : "FAIL "} ${label}${detail ? `  ${detail}` : ""}`);
};

async function featureList(shape) {
  const ph = new PartHistory();
  await d.compile(shape, ph);
  return ph.toJSON();
}

async function run(rust, json) {
  rust.clear_history_cache_json();
  try { return await runEngine(json, { rust, manifold: loadManifoldNode }); }
  catch (e) { return { error: e, refusal: e instanceof EngineRefusal }; }
}

const CASES = {
  "box minus cylinder": () => d.difference(d.cube([30, 20, 10]), d.translate([15, 10, 0], d.cylinder({ r: 4, h: 30, center: true }))),
  "filleted box": () => d.fillet({ r: 2, edges: "z" }, d.cube([40, 30, 12])),
  "union of sphere and cone": () => d.union(d.sphere({ r: 8 }), d.translate([0, 0, 6], d.cylinder({ r1: 6, r2: 1, h: 14 }))),
  "hex nut ($fn=6 polygon lane)": () => d.difference(d.cylinder({ r: 8, h: 6, $fn: 6 }), d.cylinder({ r: 3, h: 20, center: true })),
  "sphere pocket": () => d.difference(d.cube([20, 20, 8]), d.translate([10, 10, 8], d.sphere({ r: 5 }))),
};

for (const [label, make] of Object.entries(CASES)) {
  let json;
  try { json = await featureList(make()); }
  catch (e) { check(label, false, `didn't compile: ${e.message}`); continue; }
  const [a, b] = [await run(wasm, json), await run(native, json)];
  if (a.error || b.error) {
    check(label, !!a.error === !!b.error && a.refusal === b.refusal,
      `wasm: ${a.error?.message?.slice(0, 60) || "built"} | native: ${b.error?.message?.slice(0, 60) || "built"}`);
    continue;
  }
  // Same face names and sizes (as a set: a split face's two halves can be
  // named in either order), and every vertex of each solid within MAX_DEV of
  // one in the other (a loop can start at a different corner).
  const shape = (r) => r.solids.map((x) => x.faces.map((f) => `${f.name}:${f.positions.length}:${f.index?.length}`).sort().join()).join("|");
  const pts = (x) => x.faces.flatMap((f) => Array.from({ length: f.positions.length / 3 }, (_, k) => [f.positions[3 * k], f.positions[3 * k + 1], f.positions[3 * k + 2]]));
  const far = (U, W) => Math.max(0, ...U.map((p) => Math.min(...W.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])))));
  let dev = Infinity;
  if (shape(a) === shape(b)) {
    dev = 0;
    a.solids.forEach((x, i) => {
      const [u, w] = [pts(x), pts(b.solids[i])];
      dev = Math.max(dev, far(u, w), far(w, u));
    });
  }
  check(label, dev <= MAX_DEV && a.lane === b.lane,
    `lane ${b.lane}, ${b.solids.length} solid(s), max vertex deviation ${dev === Infinity ? "(different faces)" : dev.toExponential(1) + " mm"}`);
}

// errors come back as errors, not a dead process
{
  let threw = false;
  try { native.execute_history_json("{not json"); } catch { threw = true; }
  check("a bad request throws instead of crashing", threw);
  let gone = false;
  try { native.tessellate_handle(987654321, 0.05); } catch { gone = true; }
  check("an unknown handle throws", gone);
}

// the STL -> STEP reconstruction (the drop menu's "Open as an exact solid")
{
  const stl = solidsToSTL((await run(wasm, await featureList(d.cube([10, 10, 10])))).solids);
  const bytes = new TextEncoder().encode(stl);
  const [x, y] = [JSON.parse(wasm.stl_to_step_json(bytes, "", "cube")), JSON.parse(native.stl_to_step_json(bytes, "", "cube"))];
  const faces = (t) => (t.match(/ADVANCED_FACE\(/g) || []).length;
  check("stl_to_step_json matches", faces(x.step) === faces(y.step) && faces(y.step) === 6, `${faces(y.step)} faces`);
}

// The native kernel lists a solid's edges, as the wasm one does. Fillet and
// chamfer pick their edges from that list; while only the wasm kernel had it,
// every edge lookup on the desktop re-read an imported STEP in a second,
// slower kernel (a 9 MB file: 12.8 s before a fillet that builds in under one).
{
  const json = await featureList(d.fillet({ r: 4, edges: "z" }, d.cube([40, 30, 20])));
  const base = await featureList(d.cube([40, 30, 20]));
  check("the native kernel hands out a solid's topology buffer", typeof native.solid_handle_to_buffer === "function");
  const a = await runEngine(base, { rust: native, manifold: loadManifoldNode, edges: true });
  const b = await runEngine(base, { rust: wasm, manifold: loadManifoldNode, edges: true });
  const names = (out) => (out.solids[0].edges || []).map((e) => e.name).sort().join(",");
  check("...a box has its twelve edges", a.solids[0].edges?.length === 12, `${a.solids[0].edges?.length}`);
  check("...named exactly as the wasm kernel names them", names(a) === names(b) && names(a).length > 0);
  check("...each with points along it", a.solids[0].edges.every((e) => Array.isArray(e.pts) && e.pts.length >= 2));
  const built = await runEngine(json, { rust: native, manifold: loadManifoldNode });
  check("a fillet picked from those names builds on the native kernel", built.lane === "exact" && built.solids[0].faces.length === 10, `${built.solids[0].faces.length} faces`);
  const host = require("node:fs").readFileSync(new URL("../desktop/kernel-host.cjs", import.meta.url), "utf8");
  const worker = require("node:fs").readFileSync(new URL("../viewer/kernel-worker.js", import.meta.url), "utf8");
  check("the kernel host answers an edge lookup", /else if \(op === "edges"\) r = await edges\(data\);/.test(host));
  check("...and the worker asks it before loading the wasm kernel",
    /if \(!nativeNoEdges && await nativeKernel\(\)\) \{[\s\S]{0,200}nativeCall\(\{ op: "edges", json: data\.json \}\)/.test(worker));
}

// AN IMPORTED STEP. Two things made a boolean on one (extruding a face of the
// part, adding a boss) look like it never finished. The kernel re-fits the
// trims of every free-form face before and after each boolean: 112 s of a
// 123 s join on a 395-face bracket, 8 s without. And a boolean it refused went
// to the JS kernel, which cannot read a STEP. So a history carrying a STEP runs
// with those two passes off, and a refused boolean is done on triangles.
{
  const fs = require("node:fs");
  const wrapper = fs.readFileSync(new URL("../desktop/native-kernel.cjs", import.meta.url), "utf8");
  check("a history carrying a STEP runs with the kernel's trim refits off",
    /BREP_DEBUG_TRIM_REFIT_OFF: "1", BREP_INHERITED_TRIM_REFIT: "0"/.test(wrapper)
    && /!json\.includes\('"stepText"'\)\) return run\(\);/.test(wrapper)
    && /execute_history_json: \(json\) => withFastTrims\(json, \(\) => n\.executeHistoryJson\(json\)\)/.test(wrapper));
  // the switches are live for the call and gone after it, whatever happened
  const seen = [];
  const spy = { ...native, execute_history_json: (json) => { seen.push([process.env.BREP_DEBUG_TRIM_REFIT_OFF, process.env.BREP_INHERITED_TRIM_REFIT]); return native.execute_history_json(json); } };
  await run(spy, await featureList(d.cube([10, 10, 10])));
  check("...a model with no STEP leaves them alone", seen.length === 1 && seen[0][0] === undefined && seen[0][1] === undefined);
  check("...and nothing is left set afterwards", process.env.BREP_DEBUG_TRIM_REFIT_OFF === undefined && process.env.BREP_INHERITED_TRIM_REFIT === undefined);

  // a STEP of our own: a plate with a hole, written by the kernel
  const { build } = await import("../index.js");
  const { exactSTEP } = await import("../src/stepexport.js");
  const plate = await build(d.difference(d.cube([60, 40, 6]), d.translate([30, 20, -1], d.cylinder({ r: 5, h: 8 }))), { engine: "split" });
  d.registerImport("plate.step", await exactSTEP(plate, "plate"));
  const boss = () => d.union(d.importedSolid("plate.step"), d.translate([10, 10, 4], d.cube([8, 8, 8])));
  const json = await featureList(boss());
  const exact = await run(native, json);
  check("a boss joined to an imported STEP builds exact", !exact.error && exact.lane === "exact" && exact.solids.length === 1, exact.error?.message?.slice(0, 160));

  // a kernel that turns every boolean down, as the real one does for a tool
  // that shares a wall with the part
  const refusing = {
    ...native,
    execute_history_json(text) {
      const out = JSON.parse(native.execute_history_json(text));
      for (const r of out.results || []) if (r.feature_type === "B") r.error = "boolean Union failed: the section of faces is truncated (a test refusal)";
      return JSON.stringify(out);
    },
  };
  const asMesh = await run(refusing, json);
  check("a boolean on an imported STEP that the kernel refuses is done on triangles",
    !asMesh.error && asMesh.lane === "mesh" && asMesh.solids.length === 1 && typeof asMesh.stats.booleanAsMesh === "string" && /test refusal/.test(asMesh.stats.exactRefusal || ""),
    asMesh.error?.message?.slice(0, 160));
  const box = (out) => {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const s of out.solids || []) for (const f of s.faces) for (let i = 0; i < f.positions.length; i += 3) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], f.positions[i + k]); hi[k] = Math.max(hi[k], f.positions[i + k]);
    }
    return hi.map((v, k) => Math.round((v - lo[k]) * 100) / 100).join(" x ");
  };
  check("...and it is the same part: plate and boss, one body", box(asMesh) === "60 x 40 x 12" && box(exact) === "60 x 40 x 12", `${box(asMesh)} vs ${box(exact)}`);
  // without a STEP in it, a refusal is still a refusal (the JS kernel's to try)
  const plain = await run(refusing, await featureList(d.union(d.cube([10, 10, 10]), d.translate([5, 5, 5], d.cube([10, 10, 10])))));
  check("a refused boolean with no imported STEP is left to the fallback kernel", plain.refusal === true);
  // a face edit after the join needs the exact solid: the first refusal is what is reported
  const after = await run(refusing, await featureList(d.pushFace({ faces: ["IMPORT3D1_Face_1"], by: 1 }, boss())));
  check("...and so is one a later exact step depends on", after.refusal === true && /test refusal/.test(after.error?.message || ""), after.error?.message?.slice(0, 120));
  
  const page = fs.readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  // a join that neither finishes nor refuses: the page gives it a budget
  check("a build with a join on an imported STEP runs on a budget, then joins as a mesh",
    /const timer = setTimeout\(\(\) => \{ late = true; dropWorker\("a join on an imported STEP ran past its budget"\); \}, sj\.budget\);/.test(page)
    && /if \(!r\) \{\s*r = await callBuild\(sj\.asMesh\(\)\);/.test(page)
    && /asMesh\(\) \{ for \(const f of joins\) f\.inputParams\.asMesh = true; return JSON\.stringify\(doc\); \}/.test(page));
  check("...and a join that ran over is not waited for twice", /if \(!r\) \{ sj\.remember\(\);/.test(page) && /else if \(!sj\.known\) \{/.test(page));
  // a boolean marked asMesh goes to the mesh lane without being asked twice
  {
    const doc = JSON.parse(json);
    for (const f of doc.features) if (f.type === "B") f.inputParams.asMesh = true;
    const marked = await run(native, JSON.stringify(doc));
    check("...a join marked asMesh is built on triangles from the start", !marked.error && marked.lane === "mesh" && box(marked) === "60 x 40 x 12", marked.error?.message?.slice(0, 120));
  }
  check("the status line says why the part is a mesh now", /e\.stats\?\.booleanAsMesh\) return " · Mesh" \+ native \+ " \(the exact kernel refused this join on the imported part\)"/.test(page));
}

if (fails) { console.log(`\n${fails} native kernel check(s) failed`); process.exit(1); }
console.log("\nnative kernel: all checks passed");
process.exit(0);   // the JS kernel keeps the event loop alive
