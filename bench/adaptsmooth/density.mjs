// Anchors: a coarse uniform pass finds the mesh points farthest from its
// surface; QuadriFlow then runs again with small quads around those points
// only (a size field), and the bondo passes refine from there.
//   node density.mjs <file.stl> [coarse=1000] [faces=1000] [minSize=0.3] [tolPct=0.1]
//   SIZES=none : same QuadriFlow build, no size field (the control)
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSTL, cage, kernelImport, deviation, triIndex, bbox } from "./lib.mjs";
const A = await import(new URL("../../src/adaptsmooth.js", import.meta.url).href);
const log = (m) => process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${m}\n`);
const [path, cq = "1000", fq = "1000", minS = "0.3", tolPct = "0.1"] = process.argv.slice(2);
const { stl, mesh, name } = loadSTL(path);
const { diag } = bbox(mesh.verts);
const out = { name, coarse: +cq, faces: +fq, minSize: +minS, tolPct: +tolPct, sizes: process.env.SIZES || "anchors" };
const dcage = (faces, sizes) => {
  for (const seed of [0, 1, 2, 3]) {
    const dir = mkdtempSync(tmpdir() + "/qfd-"), o = `${dir}/c.json`;
    let sf = "none";
    if (sizes) { sf = `${dir}/s.json`; writeFileSync(sf, JSON.stringify([...sizes])); }
    const t = performance.now();
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("./densitychild.mjs", import.meta.url)), path, String(faces), String(seed), sf, o], { timeout: 90000 });
    if (r.status !== 0) { log(`  density cage seed ${seed}: ${r.error ? "timed out" : String(r.stderr).slice(-300)}`); continue; }
    const c = JSON.parse(readFileSync(o, "utf8"));
    return { ...c, verts: Float64Array.from(c.verts), quads: Int32Array.from(c.quads), wallMs: Math.round(performance.now() - t) };
  }
  throw new Error("density cage failed");
};
try {
  let rel = null;
  out.uniform = { ms: 0 };
  if (out.sizes !== "none") {
    // 1. uniform coarse pass, and how far each mesh vertex is from it
    log(`uniform cage ${cq}`);
    const c0 = await cage(stl, +cq, 1, path);
    const m0 = A.coarseModel(c0.verts, c0.quads, mesh);
    const near = triIndex(A.modelToTriangles(m0, 2).tris, diag);
    const nv = mesh.verts.length / 3, d = new Float64Array(nv);
    for (let i = 0; i < nv; i++) d[i] = near([mesh.verts[i * 3], mesh.verts[i * 3 + 1], mesh.verts[i * 3 + 2]]).d;
    // 2. anchors: points more than 0.5% of the diagonal off the coarse
    //    surface. The size falls to minSize at an anchor and climbs back to 1
    //    over R (two uniform quad lengths), so the dense patch blends in.
    const thr = +(process.env.THR || 1.5) / 100 * diag, anchors = [];
    for (let i = 0; i < nv; i++) if (d[i] > thr) anchors.push(i);
    let area = 0;
    for (let t = 0; t < mesh.tris.length; t += 3) {
      const P = (k) => [0, 1, 2].map((c) => mesh.verts[mesh.tris[t + k] * 3 + c]);
      const [a, b, c] = [P(0), P(1), P(2)], u = b.map((x, k) => x - a[k]), v = c.map((x, k) => x - a[k]);
      area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    }
    const R = +(process.env.RQ || 1) * Math.sqrt(area / +fq), cell = R, grid = new Map(), key = (x, y, z) => `${x},${y},${z}`;
    const step = Math.max(1, Math.floor(anchors.length / 4000));
    for (let k = 0; k < anchors.length; k += step) { const i = anchors[k]; const g = key(...[0, 1, 2].map((c) => Math.floor(mesh.verts[i * 3 + c] / cell))); if (!grid.has(g)) grid.set(g, []); grid.get(g).push(i); }
    rel = new Float64Array(nv).fill(1);
    for (let i = 0; i < nv; i++) {
      const p = [0, 1, 2].map((c) => mesh.verts[i * 3 + c]), g = p.map((x) => Math.floor(x / cell));
      let best = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
        for (const j of grid.get(key(g[0] + dx, g[1] + dy, g[2] + dz)) || []) best = Math.min(best, Math.hypot(mesh.verts[j * 3] - p[0], mesh.verts[j * 3 + 1] - p[1], mesh.verts[j * 3 + 2] - p[2]));
      if (best < R) rel[i] = +minS + (1 - +minS) * best / R;
    }
    out.uniform = { quads: c0.quads.length / 4, ms: c0.wallMs ?? c0.ms, anchors: anchors.length, anchorPct: +(100 * anchors.length / nv).toFixed(1), densePct: +(100 * rel.filter((x) => x < 1).length / nv).toFixed(1) };
    log(`  ${anchors.length} anchor vertices, ${out.uniform.densePct}% of the mesh gets denser quads`);
    writeFileSync(new URL(`./out/${name}-sizes.json`, import.meta.url), JSON.stringify([...rel].map((x) => +x.toFixed(3))));
  }
  // 3. QuadriFlow again with the size field
  log(`density cage ${fq}`);
  const c1 = dcage(+fq, rel);
  out.cage = { quads: c1.quads.length / 4, ms: c1.ms, wallMs: c1.wallMs, stageMs: c1.stageMs, seed: c1.seed };
  let t = performance.now();
  const model = A.coarseModel(c1.verts, c1.quads, mesh);
  out.coarseMs = Math.round(performance.now() - t);
  out.devCoarse = deviation(mesh, A.modelToTriangles(model, 2).tris);
  log(`  ${out.cage.quads} quads, coarse p95 ${out.devCoarse.meshToSurf.p95pct}% of diag; adapt`);
  out.adapt = A.adapt(model, { tol: diag * +tolPct / 100, maxLevel: 3, lambda: 0.2 });
  t = performance.now();
  const w = A.modelToStep(model, name);
  out.write = { ms: Math.round(performance.now() - t), faces: w.faces, MB: +(w.step.length / 1048576).toFixed(2) };
  const fin = A.modelToTriangles(model, 3);
  // REF: measure against another mesh (the uncleaned original)
  out.dev = deviation(process.env.REF ? loadSTL(process.env.REF).mesh : mesh, fin.tris);
  const tag = `${name}-d${cq}-${fq}-${minS}${out.sizes === "none" ? "-plain" : ""}`;
  writeFileSync(new URL(`./out/${tag}.step`, import.meta.url), w.step);
  writeFileSync(new URL(`./out/${tag}.json`, import.meta.url), JSON.stringify({ tris: [...fin.tris].map((x) => +x.toFixed(4)), level: [...fin.level] }));
  log(`kernel (${w.faces} faces)`);
  out.kernel = await kernelImport(w.step, name);
  out.totalMs = out.uniform.ms + out.cage.wallMs + out.coarseMs + out.adapt.ms + out.write.ms + out.kernel.ms;
} catch (e) { out.failed = String(e?.stack || e).slice(0, 400); }
console.log(JSON.stringify(out));
process.exit(0);
