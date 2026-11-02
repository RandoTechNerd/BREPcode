// segmentation -> colour per triangle for render.py "level" mode:
// 0 freeform or too small, 1 plane, 2 cylinder, 3 cone, 4 sphere, 6 torus
import { readFileSync, writeFileSync } from "node:fs";
import { loadSTL } from "./lib.mjs";
const [path, minTris = "8"] = process.argv.slice(2);
const { mesh, name } = loadSTL(path);
const seg = JSON.parse(readFileSync(new URL(`./out/${name}-seg.json`, import.meta.url), "utf8"));
const code = { Freeform: 0, Plane: 1, Cylinder: 2, Cone: 3, Sphere: 4, Torus: 6 };
const T = [], L = [];
let kept = { area: 0, total: 0 };
for (let t = 0; t < mesh.tris.length / 3; t++) {
  const r = seg.regions[seg.triangle_region_ids[t]];
  for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) T.push(+mesh.verts[mesh.tris[t * 3 + k] * 3 + c].toFixed(4));
  L.push(r && r.triangle_count >= +minTris ? code[r.carrier.type] : 0);
}
writeFileSync(new URL(`./out/${name}-segviz.json`, import.meta.url), JSON.stringify({ tris: T, level: L }));
const sig = seg.regions.filter((r) => r.triangle_count >= +minTris && r.carrier.type !== "Freeform");
const tot = seg.regions.reduce((s, r) => s + r.area, 0);
const by = {}; for (const r of sig) { by[r.carrier.type] ??= { regions: 0, areaPct: 0 }; by[r.carrier.type].regions++; by[r.carrier.type].areaPct += 100 * r.area / tot; }
for (const k in by) by[k].areaPct = +by[k].areaPct.toFixed(1);
console.log(name, `regions with >= ${minTris} triangles:`, JSON.stringify(by));
process.exit(0);
