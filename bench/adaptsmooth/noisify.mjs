// a mesh with scan-like noise: every vertex moved along its normal by N(0, sigma)
import { writeFileSync } from "node:fs";
import { loadSTL } from "./lib.mjs";
const [inp, outp, sigma = "0.05"] = process.argv.slice(2);
const { mesh } = loadSTL(inp);
const V = mesh.verts, T = mesh.tris, n = new Float64Array(V.length);
for (let t = 0; t < T.length; t += 3) {
  const [a, b, c] = [T[t], T[t + 1], T[t + 2]];
  const u = [0, 1, 2].map((k) => V[b * 3 + k] - V[a * 3 + k]), v = [0, 1, 2].map((k) => V[c * 3 + k] - V[a * 3 + k]);
  const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const i of [a, b, c]) for (let k = 0; k < 3; k++) n[i * 3 + k] += f[k];
}
let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const P = Float64Array.from(V);
for (let i = 0; i < V.length / 3; i++) {
  const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1, g = gauss() * +sigma;
  for (let k = 0; k < 3; k++) P[i * 3 + k] += n[i * 3 + k] / l * g;
}
const out = ["solid noisy"];
for (let t = 0; t < T.length; t += 3) { out.push(" facet normal 0 0 0", "  outer loop"); for (let j = 0; j < 3; j++) out.push(`   vertex ${P[T[t + j] * 3]} ${P[T[t + j] * 3 + 1]} ${P[T[t + j] * 3 + 2]}`); out.push("  endloop", " endfacet"); }
out.push("endsolid noisy");
writeFileSync(outp, out.join("\n"));
console.log("ok", T.length / 3, "triangles, sigma", sigma);
process.exit(0);
