// Coarse-to-fine smooth surface (src/adaptsmooth.js): knot insertion is
// exact, a lumpy sphere's coarse cage refines only where it misses, the
// refined surface sits closer to the mesh than the coarse one, the shell in
// the STEP stays closed, the Rust kernel imports it as an exact solid, and
// the time estimate grows as the tolerance tightens.
//
//   node test/adaptsmooth.js

import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QF = join(HERE, "..", "vendor", "quadriflow", "quadriflow-stages.mjs");
globalThis.__QF_URL = pathToFileURL(QF).href;
globalThis.__QF_WASM_BYTES = readFileSync(QF.replace(/\.mjs$/, ".wasm"));
const { _handleForTests: handle, weldSTL } = await import("../viewer/cage-worker.js");
const A = await import("../src/adaptsmooth.js");
const { importedSolid, registerImport } = await import("../src/dsl.js");
const { build } = await import("../index.js");
const { runEngine } = await import("../src/engine.js");
const { loadRustKernel, loadManifoldNode } = await import("../src/engine-node.js");

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

console.log("\nB-spline refinement is exact\n");
{
  const P = [[0, 0, 0], [1, 2, 0], [3, -1, 1], [4, 0, 2]];
  const Q = A.refineCurve(P, 0, 3);
  let worst = 0;
  for (let k = 0; k <= 40; k++) worst = Math.max(worst, dist(A.evalCurve(P, 0, k / 40), A.evalCurve(Q, 3, k / 40)));
  check("a Bezier refined to 8 spans is the same curve", Q.length === 11 && worst < 1e-12, `${Q.length} points, ${worst}`);
  const G = new Float64Array(48);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) G.set([i, j, Math.sin(i + 2 * j)], (i * 4 + j) * 3);
  const S = { lu: 0, lv: 0, nu: 4, nv: 4, P: G, U: A.knotsFor(0), V: A.knotsFor(0) };
  const R = A.refineSurf(S, 2, 1);
  worst = 0;
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) worst = Math.max(worst, dist(A.evalSurf(S, a / 10, b / 10), A.evalSurf(R, a / 10, b / 10)));
  check("a bicubic refined to 4 x 2 spans is the same surface", R.nu === 7 && R.nv === 5 && worst < 1e-12, `${worst}`);
}

console.log("\nlumpy sphere: coarse cage, refined where it misses\n");
const lumpyR = (th, ph) => 20 * (1 + 0.1 * Math.sin(2 * th) * Math.cos(ph)) + 3 * Math.exp(-((th - 1.3) ** 2 + (ph - 1) ** 2) / 0.04);   // one sharp bump
const n = 72, tris = [];
const PT = (i, j) => { const th = (i / n) * Math.PI, ph = (j / n) * 2 * Math.PI, r = lumpyR(th, ph); return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)]; };
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
  const a = PT(i, j), b = PT(i + 1, j), c = PT(i + 1, j + 1), d = PT(i, j + 1);
  if (i > 0) tris.push([a, b, d]);
  if (i < n - 1) tris.push([b, c, d]);
}
const stl = ["solid lumpy", ...tris.flatMap((t) => [" facet normal 0 0 0", "  outer loop", ...t.map((v) => `   vertex ${v.join(" ")}`), "  endloop", " endfacet"]), "endsolid lumpy"].join("\n");
const mesh = weldSTL(stl);
await handle({ op: "begin", stl, faces: 150, sharp: 1, seed: 0 });
for (let k = 0; k < 5; k++) await handle({ op: "stage", k });
const cage = await handle({ op: "finish" });
const model = A.coarseModel(cage.verts, cage.quads, mesh);
const tol = 0.002 * 2 * 20 * Math.sqrt(3);      // 0.2% of the diagonal
const est = A.estimate(model, [4 * tol, 2 * tol, tol, tol / 2]);
check("the estimate grows as the tolerance tightens", est.every((e, i) => !i || e.ms >= est[i - 1].ms) && est.at(-1).ms > est[0].ms, est.map((e) => e.ms).join(" < "));
const coarseErr = Math.max(...model.faces.map((f) => f.err.p95));
const r = A.adapt(model, { tol, maxLevel: 3 });
const refined = model.faces.filter((f) => f.S.lu + f.S.lv > 0).length;
check("only part of the surface is refined", refined > 0 && refined < model.faces.length, `${refined} of ${model.faces.length} faces`);
check("each pass touches fewer faces than the one before", r.passes.slice(0, -1).every((p, i, a) => !i || p.touched <= a[i - 1].touched), r.passes.map((p) => p.touched ?? 0).join("/"));
const fineErr = Math.max(...model.faces.map((f) => f.err.p95));
check("the refined surface misses the mesh by less", fineErr < coarseErr / 2, `worst face p95 ${coarseErr.toFixed(4)} -> ${fineErr.toFixed(4)} mm`);
A.conform(model, "max");
let gap = 0;
for (const f of model.faces) f.edges.forEach(({ e, fwd }, k) => {
  for (let s = 0; s <= 8; s++) {
    const t = s / 8, tt = fwd ? t : 1 - t;
    const uv = [[t, 0], [1, t], [1 - t, 1], [0, 1 - t]][k];
    gap = Math.max(gap, dist(A.evalSurf(f.S, uv[0], uv[1]), A.evalCurve(e.P, e.level, tt)));
  }
});
check("every face boundary is its edge curve (watertight)", gap < 1e-9, `${gap}`);
const { step, faces } = A.modelToStep(model, "lumpy");
const edgeUses = new Map();
for (const m of step.matchAll(/ORIENTED_EDGE\('',\*,\*,#(\d+),/g)) edgeUses.set(m[1], (edgeUses.get(m[1]) || 0) + 1);
check("the STEP shell is closed (every edge on two faces)", [...edgeUses.values()].every((c) => c === 2) && faces === model.faces.length + model.fills.length, `${edgeUses.size} edges`);
const rust = await loadRustKernel();
registerImport("lumpy-adapt.step", step);
const t = Date.now();
try {
  const out = await runEngine(await (await build(importedSolid("lumpy-adapt.step"), { engine: "split" })).partHistory.toJSON(), { rust, manifold: loadManifoldNode });
  check(`the Rust kernel imports it as an exact solid (${Date.now() - t} ms)`, out.lane === "exact" && out.solids[0].faces.length === faces, `${out.lane}, ${out.solids[0]?.faces?.length} faces`);
} catch (e) { check("the Rust kernel imports it as an exact solid", false, String(e.message).slice(0, 300)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
