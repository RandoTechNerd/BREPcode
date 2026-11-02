// next.BREP.io's kernel segmentation (segment_mesh_faces_json in our unchanged
// wasm copy): which regions it calls plane / cylinder / cone / sphere / torus,
// by triangle count and by area, and how long it takes.
//   node segrun.mjs <file.stl> [optionsJson]
import { writeFileSync } from "node:fs";
import { loadSTL } from "./lib.mjs";
const { loadRustKernel } = await import(new URL("../../src/engine-node.js", import.meta.url).href);
const rust = await loadRustKernel();
const [path, opt = "{}"] = process.argv.slice(2);
const { mesh, name } = loadSTL(path);
const t = performance.now();
const seg = JSON.parse(rust.segment_mesh_faces_json(JSON.stringify({ positions: [...mesh.verts], indices: [...mesh.tris], options: JSON.parse(opt) })));
const ms = Math.round(performance.now() - t);
const by = {};
let total = 0;
for (const r of seg.regions) {
  const k = r.carrier.type;
  by[k] ??= { regions: 0, triangles: 0, area: 0 };
  by[k].regions++; by[k].triangles += r.triangle_count; by[k].area += r.area; total += r.area;
}
for (const k in by) by[k].areaPct = +(100 * by[k].area / total).toFixed(1), by[k].area = Math.round(by[k].area);
const big = seg.regions.filter((r) => r.carrier.type !== "Freeform").sort((a, b) => b.area - a.area).slice(0, 12)
  .map((r) => ({ id: r.id, type: r.carrier.type, tris: r.triangle_count, area: Math.round(r.area), maxDev: +r.max_deviation.toExponential(2), ...(r.carrier.radius ? { radius: +r.carrier.radius.toFixed(3) } : {}) }));
writeFileSync(new URL(`./out/${name}-seg.json`, import.meta.url), JSON.stringify(seg));
console.log(JSON.stringify({ name, triangles: mesh.tris.length / 3, ms, regions: seg.regions.length, by, big }));
process.exit(0);
