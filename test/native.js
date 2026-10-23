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

if (fails) { console.log(`\n${fails} native kernel check(s) failed`); process.exit(1); }
console.log("\nnative kernel: all checks passed");
process.exit(0);   // the JS kernel keeps the event loop alive
