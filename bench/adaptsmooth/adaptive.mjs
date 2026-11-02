// The coarse-to-fine path: a small cage, then refine only where it misses.
//   node adaptive.mjs <file.stl> [coarseQuads=400] [tolPct=0.1] [maxLevel=3]
//   MODE=insert : no fitting, every face knot-inserted to maxLevel (same
//                 geometry, more control points): what do control points cost the kernel?
import { writeFileSync } from "node:fs";
import { loadSTL, cage, kernelImport, deviation } from "./lib.mjs";
const A = await import(new URL("../../src/adaptsmooth.js", import.meta.url).href);
const [path, q = "400", tolPct = "0.1", ml = "3"] = process.argv.slice(2);
const { stl, mesh, name } = loadSTL(path);
const log = (m) => process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${m}
`);
const out = { lambda: +(process.env.LAMBDA || 0.02), name, triangles: mesh.tris.length / 3, target: +q, tolPct: +tolPct, maxLevel: +ml, mode: process.env.MODE || "adapt" };
try {
  // AUTO: the smallest coarse cage that keeps the shape (mesh -> surface
  // p95 under 1% of the diagonal); a thin wall or a cabin lost at 400 quads
  // cannot be refined back, it is the wrong topology
  const sizes = process.env.AUTO ? [400, 1000, 2500].filter((s) => s >= +q) : [+q];
  let c, model, pre, t;
  out.tried = [];
  for (const size of sizes) {
    log(`cage ${size}`);
    c = await cage(stl, size);
    t = performance.now();
    model = A.coarseModel(c.verts, c.quads, mesh);
    out.coarseMs = Math.round(performance.now() - t);
    pre = A.modelToTriangles(model, 2);
    out.devCoarse = deviation(mesh, pre.tris);
    out.tried.push({ size, quads: c.quads.length / 4, cageMs: c.ms, coarseMs: out.coarseMs, p95pct: out.devCoarse.meshToSurf.p95pct });
    log(`  coarse p95 ${out.devCoarse.meshToSurf.p95pct}% of diag`);
    if (out.devCoarse.meshToSurf.p95pct <= 1) break;
  }
  out.cage = { quads: c.quads.length / 4, ms: out.tried.reduce((s, x) => s + x.cageMs + x.coarseMs, 0) - out.coarseMs, stageMs: c.stageMs, seed: c.seed };
  writeFileSync(new URL(`./out/${name}-a${q}-coarse.json`, import.meta.url), JSON.stringify({ tris: [...pre.tris].map((x) => +x.toFixed(4)), level: [...pre.level] }));
  log("adapt");
  t = performance.now();
  if (out.mode === "insert") {
    for (const e of model.edges.values()) { e.P = A.refineCurve(e.P, 0, +ml); e.level = +ml; }
    for (const f of model.faces) f.S = A.refineSurf(f.S, +ml, +ml);
    out.adapt = { ms: Math.round(performance.now() - t), ...A.summary(model) };
  } else {
    const diag = out.devCoarse.diag;
    const te = performance.now();
    out.estimate = A.estimate(model, [0.4, 0.2, 0.1, 0.05].map((p) => diag * p / 100), { maxLevel: +ml });
    out.estimateMs = Math.round(performance.now() - te);
    out.adapt = A.adapt(model, { tol: diag * +tolPct / 100, maxLevel: +ml, lambda: +(process.env.LAMBDA || 0.02) });
  }
  if (process.env.CONFORM) out.conform = { mode: process.env.CONFORM, ...A.conform(model, process.env.CONFORM) };
  t = performance.now();
  const w = A.modelToStep(model, name);
  out.write = { ms: Math.round(performance.now() - t), faces: w.faces, MB: +(w.step.length / 1048576).toFixed(2) };
  const fin = A.modelToTriangles(model, 3);
  out.dev = deviation(mesh, fin.tris);
  const tag = `${name}-a${q}-${tolPct}-${ml}${out.mode === "insert" ? "-ins" : ""}${process.env.CONFORM ? "-" + process.env.CONFORM : ""}`;
  writeFileSync(new URL(`./out/${tag}.step`, import.meta.url), w.step);
  writeFileSync(new URL(`./out/${tag}.json`, import.meta.url), JSON.stringify({ tris: [...fin.tris].map((x) => +x.toFixed(4)), level: [...fin.level] }));
  log(`kernel (${w.faces} faces)`);
  out.kernel = await kernelImport(w.step, name);
  out.totalMs = out.cage.ms + out.coarseMs + out.adapt.ms + out.write.ms + out.kernel.ms;
} catch (e) { out.failed = String(e?.stack || e).slice(0, 400); }
console.log(JSON.stringify(out));
process.exit(0);
