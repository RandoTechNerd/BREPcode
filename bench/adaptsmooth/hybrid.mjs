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
const out = { name, triangles: mesh.tris.length / 3 };

let t = performance.now();
const seg = JSON.parse(rust.segment_mesh_faces_json(JSON.stringify({ positions: [...mesh.verts], indices: [...mesh.tris], options: {} })));
out.segMs = Math.round(performance.now() - t);
// its Vec3s are { x, y, z }
const arr = (v) => (v && typeof v === "object" && "x" in v ? [v.x, v.y, v.z] : v);
for (const r of seg.regions) for (const k of Object.keys(r.carrier)) r.carrier[k] = arr(r.carrier[k]);
// a triangle's region, when it is a fitted carrier with at least minTris triangles
const regionOf = (t) => { const r = seg.regions[seg.triangle_region_ids[t]]; return r && r.carrier.type !== "Freeform" && r.triangle_count >= +minTris ? r : null; };

log(`cage ${q}`);
const c = await cage(stl, +q, 1, path);
out.cage = { quads: c.quads.length / 4, ms: c.wallMs ?? c.ms, seed: c.seed };
for (const mode of ["plain", "hybrid"]) {
  const r = {};
  t = performance.now();
  const model = A.coarseModel(c.verts, c.quads, mesh);
  A.prepare(model);
  r.prepareMs = Math.round(performance.now() - t);
  if (mode === "hybrid") { log("snap"); r.snap = A.snapToPlanes(model, regionOf, { share: SHARE }); }
  log(`${mode}: adapt`);
  r.adapt = A.adapt(model, { tol: model.diag * +tolPct / 100, maxLevel: 3 });
  delete r.adapt.passes;
  t = performance.now();
  const w = A.modelToStep(model, name);
  r.write = { ms: Math.round(performance.now() - t), faces: w.faces, planeFaces: w.planeFaces, mergedFaces: w.mergedFaces, MB: +(w.step.length / 1048576).toFixed(2) };
  const fin = A.modelToTriangles(model, 3);
  // tint: plane faces level 1, the rest by their own level + 2 (for render.py)
  const lv = []; let k = 0;
  for (const f of model.faces) { const n = 2 * 9 * (1 << f.S.lu) * (1 << f.S.lv); for (let i = 0; i < n; i++) lv.push(f.carrier ? 1 : 0); k += n; }
  for (let i = k; i < fin.level.length; i++) lv.push(6);
  r.dev = deviation(mesh, fin.tris);
  writeFileSync(new URL(`./out/${name}-${mode}.step`, import.meta.url), w.step);
  writeFileSync(new URL(`./out/${name}-${mode}.json`, import.meta.url), JSON.stringify({ tris: [...fin.tris].map((x) => +x.toFixed(4)), level: lv }));
  log(`${mode}: kernel (${w.faces} faces)`);
  r.kernel = await kernelImport(w.step, `${name}-${mode}`);
  r.totalMs = out.cage.ms + r.prepareMs + (r.snap?.ms || 0) + r.adapt.ms + r.write.ms + r.kernel.ms;
  out[mode] = r;
}
out.segMs && (out.hybrid.totalMs += out.segMs);
console.log(JSON.stringify(out));
process.exit(0);
