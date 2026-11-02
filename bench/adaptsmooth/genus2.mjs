import { loadSTL, cage } from "./lib.mjs";
import { topology, shellGenus } from "./genus.mjs";
const A = await import(new URL("../../src/adaptsmooth.js", import.meta.url).href);
const { stl, mesh } = loadSTL(process.argv[2]);
console.log("mesh", JSON.stringify(topology(mesh.verts.length / 3, mesh.tris, 3)));
for (const s of process.argv.slice(3).map(Number)) {
  const c = await cage(stl, s, 1, process.argv[2]);
  const m = A.coarseModel(c.verts, c.quads, mesh);
  console.log(s, c.quads.length / 4, "quads; shell", JSON.stringify(shellGenus(m)));
}
process.exit(0);
