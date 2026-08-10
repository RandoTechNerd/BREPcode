import { fromOpenSCAD, getWarnings } from "./src/openscad.js";
import { build, toSTL } from "./index.js";
import { readFileSync, writeFileSync } from "node:fs";
const scad = readFileSync(process.env.SCRATCH + "/orca-v8.scad", "utf8");
const shape = fromOpenSCAD(scad);
console.log("warnings:", JSON.stringify(getWarnings()));
const t0 = Date.now();
try {
  const stl = toSTL(await build(shape), "o");
  const tris = (stl.match(/facet normal/g) || []).length;
  const vs = [...stl.matchAll(/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g)].map(m=>m.slice(1).map(Number));
  const rng = (i) => `${Math.min(...vs.map(v=>v[i])).toFixed(1)}..${Math.max(...vs.map(v=>v[i])).toFixed(1)}`;
  console.log(`BUILT in ${Date.now()-t0} ms · ${tris} tris · x ${rng(0)} y ${rng(1)} z ${rng(2)}`);
  writeFileSync(process.env.SCRATCH + "/orca-v8.stl", stl);
} catch (e) { console.log("BUILD FAILED after", Date.now()-t0, "ms:", String(e.message).slice(0, 400)); process.exit(1); }
