// per-triangle distance to the input mesh, for a heat-map render
//   node colorize.mjs <input.stl> <surface.json|.stl> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { loadSTL, triIndex, meshSoup, bbox, stlSoup } from "./lib.mjs";
const [inp, surf, outp] = process.argv.slice(2);
const { mesh } = loadSTL(inp);
let tris, level = null;
if (surf.endsWith(".json")) { const j = JSON.parse(readFileSync(surf, "utf8")); tris = Float64Array.from(j.tris); level = j.level; }
else tris = stlSoup(readFileSync(surf, "utf8"));
const { diag } = bbox(mesh.verts);
const q = triIndex(meshSoup(mesh), diag);
const dev = [];
for (let t = 0; t < tris.length; t += 9) dev.push(+q([(tris[t] + tris[t + 3] + tris[t + 6]) / 3, (tris[t + 1] + tris[t + 4] + tris[t + 7]) / 3, (tris[t + 2] + tris[t + 5] + tris[t + 8]) / 3]).d.toFixed(4));
writeFileSync(outp, JSON.stringify({ tris: [...tris].map((x) => +x.toFixed(4)), dev, level, diag }));
process.exit(0);
