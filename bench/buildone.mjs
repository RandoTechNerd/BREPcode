// One model, one kernel chain, one verdict: builds a code file, writes its STL
// and prints a JSON line with the build and printability measurements.
// Its own process so a kernel that hangs costs only this model (the runner
// kills it), and so the BREP.io JS kernel's open handles die with it.
//
//   node bench/buildone.mjs model.js out.stl [engine]      engine: nvidia (default) | split | js

import { readFileSync, writeFileSync } from "node:fs";
import * as dsl from "../src/dsl.js";
import { build, toSTL, fromOpenSCAD, looksLikeOpenSCAD } from "../index.js";
import Module from "manifold-3d";

const [file, outStl, engine = "nvidia"] = process.argv.slice(2);
const BED = 256;                       // mm, a Bambu/Prusa-class bed
const say = (o) => { process.stdout.write(JSON.stringify(o) + "\n"); process.exit(0); };

let src = readFileSync(file, "utf8");
const t0 = performance.now();
let res;
try {
  if (looksLikeOpenSCAD(src)) src = fromOpenSCAD(src);
  const names = Object.keys(dsl).filter((k) => typeof dsl[k] === "function" && k !== "compile");
  let shape = new Function(...names, `"use strict";\n${src}`)(...names.map((n) => dsl[n]));
  if (Array.isArray(shape)) shape = dsl.group(...shape);
  if (!shape) throw new Error("the code returned nothing (it needs `return <shape>`)");
  res = await build(shape, { engine });
} catch (e) {
  say({ ok: false, stage: "build", error: String(e?.message || e).slice(0, 600), ms: Math.round(performance.now() - t0) });
}
const ms = Math.round(performance.now() - t0);
const stl = toSTL(res, "model");
writeFileSync(outStl, stl);

// ---- printability, measured on the triangles the slicer will see ----
const wasm = await Module(); wasm.setup();
const bodies = [];
let watertight = true, triangles = 0;
for (const chunk of stl.split(/^solid /m).filter((s) => s.trim())) {
  const v = [...chunk.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  triangles += v.length / 3;
  const map = new Map(), verts = [], tris = [];
  for (const p of v) {
    const k = p.map((x) => Math.round(x * 1e4)).join();
    if (!map.has(k)) { map.set(k, verts.length / 3); verts.push(...p); }
    tris.push(map.get(k));
  }
  let m;
  try {
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
    mesh.merge();
    m = new wasm.Manifold(mesh);
    if (m.status && m.status() !== "NoError") throw new Error(m.status());
  } catch { watertight = false; continue; }
  for (const part of m.decompose()) bodies.push(part);
}
let vol = 0, overhangArea = 0, downArea = 0, totalArea = 0, floating = 0;
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const b of bodies) {
  vol += b.volume();
  const bb = b.boundingBox();
  for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], bb.min[k]); hi[k] = Math.max(hi[k], bb.max[k]); }
  if (bb.min[2] > 0.05) floating++;                       // not resting on the bed
  const mesh = b.getMesh(), P = mesh.vertProperties, T = mesh.triVerts, np = mesh.numProp;
  for (let i = 0; i < T.length; i += 3) {
    const a = [0, 1, 2].map((j) => [P[T[i + j] * np], P[T[i + j] * np + 1], P[T[i + j] * np + 2]]);
    const u = [0, 1, 2].map((k) => a[1][k] - a[0][k]), w = [0, 1, 2].map((k) => a[2][k] - a[0][k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const area = Math.hypot(...n) / 2;
    if (!area) continue;
    totalArea += area;
    const nz = n[2] / (2 * area);
    const zMin = Math.min(a[0][2], a[1][2], a[2][2]);
    if (nz < -0.999 && zMin < bb.min[2] + 0.05) continue; // the face on the bed
    if (nz < -Math.SQRT1_2) overhangArea += area;           // steeper than 45 degrees, facing down
    if (nz < -0.001) downArea += area;
  }
}
const size = bodies.length ? hi.map((h, k) => h - lo[k]) : [0, 0, 0];
say({
  ok: true, ms, kernel: res.kernel || res.engine, lane: res.engine, fallback: res.fallback || null,
  solids: res.solids.length, bodies: bodies.length, triangles, watertight,
  volume: Math.round(vol), size: size.map((x) => +x.toFixed(1)),
  fitsBed: size[0] <= BED && size[1] <= BED && size[2] <= BED,
  floating, onBed: bodies.length > 0 && floating === 0,
  overhangPct: totalArea ? +(100 * overhangArea / totalArea).toFixed(1) : 0,
});
