// drop zero-area and needle triangles (QuadriFlow's adaptive field tracing dies on them)
import { writeFileSync } from "node:fs";
import { loadSTL } from "./lib.mjs";
const [inp, outp, minAngDeg = "1"] = process.argv.slice(2);
const { mesh } = loadSTL(inp);
const V = (i) => [0, 1, 2].map((c) => mesh.verts[i * 3 + c]);
const out = ["solid clean"]; let dropped = 0;
const ang = (a, b, c) => { const u = b.map((x, k) => x - a[k]), v = c.map((x, k) => x - a[k]); const d = Math.hypot(...u) * Math.hypot(...v); return d ? Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / d))) * 180 / Math.PI : 0; };
for (let t = 0; t < mesh.tris.length; t += 3) {
  const [a, b, c] = [V(mesh.tris[t]), V(mesh.tris[t + 1]), V(mesh.tris[t + 2])];
  if (Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b)) < +minAngDeg) { dropped++; continue; }
  out.push(" facet normal 0 0 0", "  outer loop", ...[a, b, c].map((p) => `   vertex ${p.join(" ")}`), "  endloop", " endfacet");
}
out.push("endsolid clean");
writeFileSync(outp, out.join("\n"));
console.log({ triangles: mesh.tris.length / 3, dropped });
process.exit(0);
