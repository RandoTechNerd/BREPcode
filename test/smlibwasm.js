// SMLib as WebAssembly (vendor/brep-kernel-smlib), the website's "nvidia"
// kernel: loaded the way viewer/kernel-worker.js loads it, behind the
// desktop's adapter (native/nvidia-kernel/adapter.cjs, wrap()), it builds
// what BREPcode makes most with the right volumes and the same face names as
// the Rust kernel, refuses what it can't build, and its heap stops growing
// across rebuilds (the worker drops an instance that got too big).
//
// Skipped (exit 0) when vendor/brep-kernel-smlib isn't staged:
// node build-smlib-wasm.mjs first.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { PartHistory } from "brep-io-kernel";
import { compile } from "../src/dsl.js";
import * as dsl from "../src/dsl.js";
import { runEngine, solidsToSTL } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const API = new URL("../vendor/brep-kernel-smlib/api.mjs", import.meta.url);
if (!existsSync(API)) {
  console.log("skip  vendor/brep-kernel-smlib isn't staged (node build-smlib-wasm.mjs)");
  process.exit(0);
}
const { default: loadSmlib } = await import(API.href);
const { wrap } = createRequire(import.meta.url)("../native/nvidia-kernel/adapter.cjs");
const raw = await loadSmlib();
const smlib = wrap(raw);
const rust = await loadRustKernel();

const names = Object.keys(dsl).filter((k) => typeof dsl[k] === "function" && k !== "compile");
const shape = (src) => new Function(...names, `"use strict";\n${src}`)(...names.map((n) => dsl[n]));
const run = async (kernel, src) => {
  const ph = new PartHistory();
  await compile(shape(src), ph);
  return runEngine(await ph.toJSON(), { rust: kernel, manifold: loadManifoldNode });
};
const volumeOf = (out) => {
  let vol = 0;
  for (const m of solidsToSTL(out.solids).matchAll(/outer loop\s+vertex (\S+) (\S+) (\S+)\s+vertex (\S+) (\S+) (\S+)\s+vertex (\S+) (\S+) (\S+)/g)) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = m.slice(1).map(Number);
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
};
const faceNames = (out) => new Set(out.solids.flatMap((s) => s.faces.map((f) => f.name)));

console.log(`\nSMLib as WebAssembly (${raw.info().kernel})\n`);
const PI = Math.PI;
// [label, code, exact volume, tolerance]
const CASES = [
  ["box", "return cube([40, 30, 10]);", 12000],
  ["plate with a hole", "return difference(cube([40, 30, 10]), translate([20, 15, -1], cylinder({ r: 5, h: 12 })));", 12000 - PI * 25 * 10],
  ["rounded box", 'return fillet({ r: 3, edges: "z" }, cube([40, 30, 10]));', 12000 - 4 * (9 - PI * 9 / 4) * 10],
  // the boss starts above the floor: where two bottoms are coplanar, SMLib
  // (native and wasm alike) keeps the box's name for the merged face and the
  // Rust kernel the cylinder's
  ["chamfered box with a boss", 'return chamfer({ d: 1, edges: "top" }, union(cube([20, 20, 10]), translate([10, 10, 2], cylinder({ r: 4, h: 16 }))));', null],
  ["revolved cup", "return revolve({ angle: 360 }, polygon([[0, 0], [8, 0], [8, 6], [0, 6]]));", PI * 64 * 6, 0.02],
  ["mirrored box", "return scale([-1, 1, 1], translate([5, 0, 0], cube([4, 5, 6])));", 120],
  ["twisted square", "return linearExtrude({ h: 40, twist: 90 }, polygon([[-10, -10], [10, -10], [10, 10], [-10, 10]]));", 16000, 0.01],
];
for (const [label, src, want, tol = 0.005] of CASES) {
  let out, ref;
  try { out = await run(smlib, src); }
  catch (e) { check(`${label}: builds`, false, String(e.message || e).slice(0, 200)); continue; }
  const v = volumeOf(out);
  if (want != null) check(`${label}: volume ${v.toFixed(1)} ~ ${want.toFixed(1)}`, Math.abs(v - want) / want < tol);
  try { ref = await run(rust, src); } catch { ref = null; }
  if (ref && ref.lane === "exact") {
    const rv = volumeOf(ref);
    check(`${label}: within 0.5% of the Rust kernel (${rv.toFixed(1)})`, Math.abs(v - rv) / rv < 0.005);
    const mine = faceNames(out);
    const missing = [...faceNames(ref)].filter((n) => !mine.has(n));
    check(`${label}: names its faces as the Rust kernel does`, missing.length === 0, `missing ${missing.slice(0, 6).join(" ")}`);
  }
}

// a chamfer on a revolve cap's axis edge, which SMLib declines to bevel: a
// refusal, not junk (the worker then hands it to the Rust kernel)
{
  let why = "";
  try {
    const out = await run(smlib, 'return chamfer({ d: 1, edges: ["R4:L100_END|R4:L100_START[0]"] }, union(cube(20), translate([30, 0, 0], revolve({ angle: 270 }, polygon([[0, 0], [8, 0], [8, 10], [0, 10]])))));');
    why = `built (${out.lane})`;
  } catch (e) { why = String(e.message || e); }
  check("what SMLib can't build is refused (the worker then tries the Rust kernel)", !why.startsWith("built"), why.slice(0, 160));
}

// the same model, rebuilt: handles are freed each run and the heap levels off
{
  const before = raw.count();
  for (let k = 0; k < 20; k++) await run(smlib, "return difference(cube([40, 30, 10]), translate([20, 15, -1], cylinder({ r: 5, h: 12 })));");
  const heap = raw.heapBytes();
  for (let k = 0; k < 20; k++) await run(smlib, "return difference(cube([40, 30, 10]), translate([20, 15, -1], cylinder({ r: 5, h: 12 })));");
  check(`rebuilding doesn't leak (heap ${(heap / 1048576).toFixed(0)} -> ${(raw.heapBytes() / 1048576).toFixed(0)} MB, ${raw.count()} solids alive)`,
    raw.heapBytes() === heap && raw.count() <= before + 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
