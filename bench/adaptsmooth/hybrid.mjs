// Hybrid: next.BREP.io's kernel segmentation (unchanged, our wasm) says which
// regions are planes; our coarse-to-fine B-spline surface covers everything,
// with the plane regions snapped exactly onto their planes and written as one
// PLANE face each. Same cage, with and without the snap, so the difference is
// the hybrid alone.
//   node hybrid.mjs <file.stl> [quads=2500] [tolPct=0.1] [minTris=8]
import { writeFileSync } from "node:fs";
import { loadSTL, cage, kernelImport, deviation } from "./lib.mjs";
const A = await import(new URL("../../src/adaptsmooth.js", import.meta.url).href);
const { loadRustKernel } = await import(new URL("../../src/engine-node.js", import.meta.url).href);
const log = (m) => process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${m}\n`);
const [path, q = "2500", tolPct = "0.1", minTris = "8"] = process.argv.slice(2);
const SHARE = +(process.env.SHARE || 0.8);
const { stl, mesh, name } = loadSTL(path);
const rust = await loadRustKernel();
const out = { name, triangles: mesh.tris.length / 3, align: !!process.env.ALIGN, slide: !!process.env.SLIDE };

let t = performance.now();
const seg = JSON.parse(rust.segment_mesh_faces_json(JSON.stringify({ positions: [...mesh.verts], indices: [...mesh.tris], options: {} })));
out.segMs = Math.round(performance.now() - t);
// its Vec3s are { x, y, z }
const arr = (v) => (v && typeof v === "object" && "x" in v ? [v.x, v.y, v.z] : v);
for (const r of seg.regions) for (const k of Object.keys(r.carrier)) r.carrier[k] = arr(r.carrier[k]);
// a triangle's region, when it is a fitted carrier with at least minTris triangles
const regionOf = (t) => { const r = seg.regions[seg.triangle_region_ids[t]]; return r && r.carrier.type !== "Freeform" && r.triangle_count >= +minTris ? r : null; };

// ALIGN=1: QuadriFlow (our density build) gets each triangle's region and
// lays quad edges along the borders between regions
let c;
if (process.env.ALIGN) {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync: rf } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { fileURLToPath } = await import("node:url");
  const dir = mkdtempSync(tmpdir() + "/qfl-");
  const labels = [];
  for (let k = 0; k < mesh.tris.length / 3; k++) { const r = regionOf(k); labels.push(r && ["Plane", "Cylinder"].includes(r.carrier.type) ? r.id : -1); }
  writeFileSync(`${dir}/labels.json`, JSON.stringify(labels));
  for (const seed of [0, 1, 2, 3, 4, 5]) {
    log(`aligned cage ${q}, seed ${seed}`);
    const t1 = performance.now();
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("./densitychild.mjs", import.meta.url)), path, q, String(seed), "none", `${dir}/c.json`], { timeout: 90000, env: { ...process.env, LABELS: `${dir}/labels.json` } });
    if (r.status !== 0) { const why = String(r.stderr).split(String.fromCharCode(10)).filter((l) => /qf:|Error/.test(l)).slice(0, 2).join(" "); log(`  seed ${seed}: ${r.error ? "timed out" : why}`); continue; }
    const j = JSON.parse(rf(`${dir}/c.json`, "utf8"));
    c = { verts: Float64Array.from(j.verts), quads: Int32Array.from(j.quads), ms: Math.round(performance.now() - t1), seed };
    break;
  }
  if (!c) throw new Error("aligned cage failed on 6 seeds");
} else {
  log(`cage ${q}`);
  c = await cage(stl, +q, 1, path);
}
out.cage = { quads: c.quads.length / 4, ms: c.wallMs ?? c.ms, seed: c.seed };
for (const mode of (process.env.ONLY ? [process.env.ONLY] : ["plain", "hybrid"])) {
  const r = {};
  t = performance.now();
  // SLIDE=1: cage corners slide onto the plane regions' borders first (hybrid only)
  let cv = c.verts;
  if (mode === "hybrid" && process.env.SLIDE) { const al = A.alignCageToRegions(c.verts, c.quads, mesh, regionOf); cv = al.verts; r.slide = { moved: al.moved, skipped: al.skipped, segments: al.segments }; }
  const model = A.coarseModel(cv, c.quads, mesh);
  A.prepare(model);
  r.prepareMs = Math.round(performance.now() - t);
  if (mode === "hybrid") { log("snap"); r.snap = A.snapToCarriers(model, regionOf, { share: SHARE, kinds: (process.env.KINDS || "Plane,Cylinder,Cone,Sphere").split(",") }); }
  log(`${mode}: adapt`);
  r.adapt = A.adapt(model, { tol: model.diag * +tolPct / 100, maxLevel: 3 });
  delete r.adapt.passes;
  t = performance.now();
  const w = A.modelToStep(model, name);
  r.write = { ms: Math.round(performance.now() - t), faces: w.faces, planeFaces: w.planeFaces, cylFaces: w.cylFaces, coneFaces: w.coneFaces, sphereFaces: w.sphereFaces, mergedFaces: w.mergedFaces, unmerged: w.unmerged, MB: +(w.step.length / 1048576).toFixed(2) };
  const fin = A.modelToTriangles(model, 3);
  // tint: plane faces level 1, the rest by their own level + 2 (for render.py)
  const lv = []; let k = 0;
  for (const f of model.faces) { const n = 2 * 9 * (1 << f.S.lu) * (1 << f.S.lv); for (let i = 0; i < n; i++) lv.push(f.carrier ? (f.carrier.kind === "plane" ? 1 : 2) : 0); k += n; }
  for (let i = k; i < fin.level.length; i++) lv.push(6);
  r.dev = deviation(mesh, fin.tris);
  writeFileSync(new URL(`./out/${name}-${mode}${process.env.ALIGN ? "-al" : ""}.step`, import.meta.url), w.step);
  writeFileSync(new URL(`./out/${name}-${mode}${process.env.ALIGN ? "-al" : ""}.json`, import.meta.url), JSON.stringify({ tris: [...fin.tris].map((x) => +x.toFixed(4)), level: lv }));
  log(`${mode}: kernel (${w.faces} faces)`);
  r.kernel = process.env.NOKERNEL ? { skipped: true, ms: 0 } : await kernelImport(w.step, `${name}-${mode}`);
  r.totalMs = out.cage.ms + r.prepareMs + (r.snap?.ms || 0) + r.adapt.ms + r.write.ms + r.kernel.ms;
  out[mode] = r;
}
if (out.hybrid) out.hybrid.totalMs += out.segMs;
console.log(JSON.stringify(out));
process.exit(0);
