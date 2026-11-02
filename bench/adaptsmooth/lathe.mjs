// A turned test part with real analytic surfaces, finely triangulated:
// flat bottom (r 6), cone up to r 10 at z 10, cylinder to z 30, a dome
// (hemisphere r 10) on top, and a wavy freeform collar band at z 18..24 so
// the smooth patches have something to do.  node lathe.mjs out.stl
import { writeFileSync } from "node:fs";
const N = 160;                       // around
const prof = [];                     // [r, z] from the bottom centre up to the top
for (let i = 0; i <= 12; i++) prof.push([6 * i / 12, 0]);
for (let i = 1; i <= 40; i++) prof.push([6 + 4 * i / 40, 10 * i / 40]);
for (let i = 1; i <= 80; i++) { const z = 10 + 20 * i / 80; const band = z > 18 && z < 24 ? 0.6 * Math.sin(Math.PI * (z - 18) / 6) : 0; prof.push([10 + band, z]); }
for (let i = 1; i <= 60; i++) { const a = Math.PI / 2 * i / 60; prof.push([10 * Math.cos(a), 30 + 10 * Math.sin(a)]); }
const P = (k, j) => { const [r, z] = prof[k], t = 2 * Math.PI * j / N; return [r * Math.cos(t), r * Math.sin(t), z]; };
const out = ["solid lathe"];
const tri = (a, b, c) => out.push(" facet normal 0 0 0", "  outer loop", ...[a, b, c].map((p) => `   vertex ${p.map((x) => +x.toFixed(6)).join(" ")}`), "  endloop", " endfacet");
for (let k = 0; k < prof.length - 1; k++) for (let j = 0; j < N; j++) {
  const a = P(k, j), b = P(k, j + 1), c = P(k + 1, j + 1), d = P(k + 1, j);
  // outward: the profile runs bottom centre -> top centre, counter-clockwise around z
  if (prof[k][0] > 1e-9) tri(a, b, c);
  if (prof[k + 1][0] > 1e-9) tri(a, c, d);
}
out.push("endsolid lathe");
writeFileSync(process.argv[2], out.join("\n"));
console.log("triangles", (out.length - 2) / 7);
