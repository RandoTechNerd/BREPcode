// The coarse-to-fine smooth-surface worker (viewer/bondo-worker.js), driven
// the way index.html drives it: begin (coverage, estimates, a preview), refine
// (a preview per pass), refine tighter (carries on), refine looser (starts
// over), write (a STEP the Rust kernel imports as an exact solid).
//
//   node test/bondoworker.js

import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QF = join(HERE, "..", "vendor", "quadriflow", "quadriflow-stages.mjs");
globalThis.__QF_URL = pathToFileURL(QF).href;
globalThis.__QF_WASM_BYTES = readFileSync(QF.replace(/\.mjs$/, ".wasm"));
const { _handleForTests: cageStep } = await import("../viewer/cage-worker.js");

const { importedSolid, registerImport } = await import("../src/dsl.js");
const { build } = await import("../index.js");
const { runEngine } = await import("../src/engine.js");
const { loadRustKernel, loadManifoldNode } = await import("../src/engine-node.js");
// (the kernel modules load first: a stray global `self` confuses their polyfills)
// a worker-shaped global for bondo-worker.js: it posts here, we read the replies
const inbox = [];
globalThis.self = { postMessage: (m) => inbox.push(m) };
await import("../viewer/bondo-worker.js");
const send = (msg) => { inbox.length = 0; globalThis.self.onmessage({ data: msg }); return [...inbox]; };


let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// an egg with one sharp bump (as test/adaptsmooth.js)
const R = (th, ph) => 20 * (1 + 0.1 * Math.sin(2 * th) * Math.cos(ph)) + 3 * Math.exp(-((th - 1.3) ** 2 + (ph - 1) ** 2) / 0.04);
const n = 72, tris = [];
const PT = (i, j) => { const th = (i / n) * Math.PI, ph = (j / n) * 2 * Math.PI, r = R(th, ph); return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)]; };
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
  const a = PT(i, j), b = PT(i + 1, j), c = PT(i + 1, j + 1), d = PT(i, j + 1);
  if (i > 0) tris.push([a, b, d]);
  if (i < n - 1) tris.push([b, c, d]);
}
const stl = ["solid egg", ...tris.flatMap((t) => [" facet normal 0 0 0", "  outer loop", ...t.map((v) => `   vertex ${v.join(" ")}`), "  endloop", " endfacet"]), "endsolid egg"].join("\n");
await cageStep({ op: "begin", stl, faces: 150, sharp: 1, seed: 0 });
for (let k = 0; k < 5; k++) await cageStep({ op: "stage", k });
const cage = await cageStep({ op: "finish" });

console.log("\nbegin: the coarse surface, measured and priced\n");
const [b] = send({ id: 1, op: "begin", verts: cage.verts, quads: cage.quads, stl, name: "egg", stops: [0.4, 0.2, 0.1, 0.05] });
check("begin answers", b?.ok, b?.error);
check("coverage is measured against the mesh", b.coverage && b.coverage.p95 > 0 && b.coverage.p95 < 0.01 * b.coverage.diag, JSON.stringify(b.coverage));
check("one estimate per Detail stop, growing as the tolerance tightens", b.estimates.length === 4 && b.estimates.every((e, i, a) => !i || e.ms >= a[i - 1].ms), b.estimates.map((e) => e.ms).join(" < "));
check("a coarse preview with a level per triangle", b.preview.positions.length / 9 === b.preview.level.length && b.preview.level.every((l) => l === 0));

console.log("\nrefine: pass by pass, only where it misses\n");
let msgs = send({ id: 2, op: "refine", tolPct: 0.2 });
const passes = msgs.filter((m) => m.pass), end = msgs.at(-1);
check("each pass sends a preview, then a summary", passes.length >= 1 && passes.every((m) => m.preview.positions.length) && end.ok && end.summary, `${passes.length} passes`);
const lv = end.summary.facesByLevel;
check("part of the surface refined, part left alone", lv[0] > 0 && lv.slice(1).some((x) => x > 0), lv.join(","));
msgs = send({ id: 3, op: "refine", tolPct: 0.1 });
const lv2 = msgs.at(-1).summary.facesByLevel;
check("a tighter Detail refines more (carrying on)", lv2[0] <= lv[0] && lv2.slice(2).reduce((a, x) => a + x, 0) >= lv.slice(2).reduce((a, x) => a + x, 0), `${lv.join(",")} -> ${lv2.join(",")}`);
msgs = send({ id: 4, op: "refine", tolPct: 0.4 });
const lv3 = msgs.at(-1).summary.facesByLevel;
check("a looser Detail starts over from the coarse surface", lv3[0] >= lv2[0], `${lv2.join(",")} -> ${lv3.join(",")}`);

console.log("\nwrite: the STEP, and the Rust kernel takes it\n");
send({ id: 5, op: "refine", tolPct: 0.1 });
const [w] = send({ id: 6, op: "write" });
check("write answers with a STEP, a stand-in mesh and the deviation", w.ok && /ISO-10303-21/.test(w.result.step) && /^solid egg/.test(w.result.mesh) && w.result.dev?.p95 > 0, w.error);
delete globalThis.self;           // the worker part is over; the kernel glue reads `self` too
const rust = await loadRustKernel();
registerImport("egg-smooth.step", w.result.step);
try {
  const out = await runEngine(await (await build(importedSolid("egg-smooth.step"), { engine: "split" })).partHistory.toJSON(), { rust, manifold: loadManifoldNode });
  check("the Rust kernel imports it as an exact solid", out.lane === "exact" && out.solids[0].faces.length === w.result.faces, `${out.lane}, ${out.solids[0]?.faces?.length} faces`);
} catch (e) { check("the Rust kernel imports it as an exact solid", false, String(e.message).slice(0, 300)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
