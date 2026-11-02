// QuadriFlow with a per-vertex size field (QuadriFlowWasm "density" build), one seed, own process
//   node densitychild.mjs <file.stl> <faces> <seed> <sizes.json|none> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadSTL } from "./lib.mjs";
const QW = "C:/Users/Rando/Claude Play/QuadriFlowWasm/out/";
const [path, faces, seed, sizes, out] = process.argv.slice(2);
const { mesh } = loadSTL(path);
const factory = (await import(pathToFileURL(QW + "quadriflow-density.mjs").href)).default;
const bytes = readFileSync(QW + "quadriflow-density.wasm");
const say = (s) => process.stderr.write(`qf: ${s}
`);
const M = await factory({ noExitRuntime: true, noInitialRun: true, print: say, printErr: say, instantiateWasm: (imports, receive) => { WebAssembly.instantiate(bytes, imports).then((r) => receive(r.instance)); return {}; } });
const t0 = performance.now();
const nv = mesh.verts.length / 3, nf = mesh.tris.length / 3;
const pv = M._malloc(mesh.verts.byteLength), pf = M._malloc(nf * 12);
M.HEAPF64.set(mesh.verts, pv / 8); M.HEAP32.set(Int32Array.from(mesh.tris), pf / 4);
M._qf_begin(pv, nv, pf, nf, +faces, 1, +seed);
if (sizes !== "none") {
  const rel = Float64Array.from(JSON.parse(readFileSync(sizes, "utf8")));
  if (rel.length !== nv) throw new Error(`size field has ${rel.length} values for ${nv} vertices`);
  const ps = M._malloc(rel.byteLength); M.HEAPF64.set(rel, ps / 8); M._qf_set_size(ps, nv);
}
// LABELS=<file.json>: a region label per triangle; QuadriFlow keeps their borders as quad edges
if (process.env.LABELS) {
  const lab = Int32Array.from(JSON.parse(readFileSync(process.env.LABELS, "utf8")));
  if (lab.length !== nf) throw new Error(`labels: ${lab.length} for ${nf} triangles`);
  const pl = M._malloc(lab.byteLength); M.HEAP32.set(lab, pl / 4); M._qf_set_face_labels(pl, nf);
}
const stageMs = [];
for (let k = 0; k < 5; k++) { const t = performance.now(); const r = M._qf_stage(k); if (r) throw new Error(`stage ${k}: ${r}`); stageMs.push(Math.round(performance.now() - t)); }
const n = M._qf_vert_count(), nq = M._qf_quad_count();
if (!nq) throw new Error("no quads");
const a = M._malloc(n * 24), b = M._malloc(nq * 16);
M._qf_copy_out(a, b);
writeFileSync(out, JSON.stringify({ verts: [...M.HEAPF64.slice(a / 8, a / 8 + n * 3)], quads: [...M.HEAP32.slice(b / 4, b / 4 + nq * 4)], stageMs, ms: Math.round(performance.now() - t0), seed: +seed }));
process.exit(0);
