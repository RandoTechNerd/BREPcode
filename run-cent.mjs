import * as dsl from "./index.js";
import { build, toSTL } from "./index.js";
import { readFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
const names = Object.keys(dsl).filter((k) => typeof dsl[k] === "function");
const fn = new Function(...names, `"use strict";\n${src}`);
const t0 = Date.now();
let shape;
try { shape = fn(...names.map((n) => dsl[n])); }
catch (e) { console.log("EVAL FAILED:", e.message); process.exit(1); }
const r = await build(shape);
const stl = toSTL(r, "c");
const tris = (stl.match(/facet normal/g) || []).length;
const vs = [];
const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
let m; while ((m = re.exec(stl))) vs.push([+m[1], +m[2], +m[3]]);
const rng = (i) => `${Math.min(...vs.map(v=>v[i])).toFixed(1)} .. ${Math.max(...vs.map(v=>v[i])).toFixed(1)}`;
console.log(`built in ${Date.now() - t0} ms  ·  ${tris} triangles`);
console.log(`x ${rng(0)}   y ${rng(1)}   z ${rng(2)}`);
