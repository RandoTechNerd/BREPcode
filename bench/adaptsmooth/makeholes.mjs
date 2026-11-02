// Punch round holes in a mesh (drop every triangle within r of a few surface
// points) and nudge a strip of vertices apart, so the cage meets open edges
// and unconnected seams: node makeholes.mjs in.stl out.stl [holes=5] [rPct=4]
import { writeFileSync } from "node:fs";
import { loadSTL, bbox } from "./lib.mjs";
const [inp, outp, nh = "5", rp = "4"] = process.argv.slice(2);
const { mesh } = loadSTL(inp);
const { diag } = bbox(mesh.verts);
const r = diag * +rp / 100, nt = mesh.tris.length / 3;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const centres = []; for (let k = 0; k < +nh; k++) { const v = mesh.tris[Math.floor(rnd() * nt) * 3]; centres.push([0, 1, 2].map((c) => mesh.verts[v * 3 + c])); }
const out = [`solid holey`];
let kept = 0;
for (let t = 0; t < nt; t++) {
  const P = [0, 1, 2].map((k) => [0, 1, 2].map((c) => mesh.verts[mesh.tris[t * 3 + k] * 3 + c]));
  const cen = [0, 1, 2].map((c) => (P[0][c] + P[1][c] + P[2][c]) / 3);
  if (centres.some((q) => Math.hypot(q[0] - cen[0], q[1] - cen[1], q[2] - cen[2]) < r)) continue;
  kept++;
  out.push(" facet normal 0 0 0", "  outer loop", ...P.map((p) => `   vertex ${p.join(" ")}`), "  endloop", " endfacet");
}
out.push("endsolid holey");
writeFileSync(outp, out.join("\n"));
console.log({ triangles: nt, kept, holes: +nh, rMM: +r.toFixed(2) });
process.exit(0);
