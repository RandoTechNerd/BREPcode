// next.BREP.io's stl2step (our unchanged wasm copy) on a mesh: time, faces by surface type, report
//   node nextrun.mjs <file.stl>
import { readFileSync, writeFileSync } from "node:fs";
const { loadRustKernel } = await import(new URL("../../src/engine-node.js", import.meta.url).href);
const rust = await loadRustKernel();
const path = process.argv[2], name = path.replace(/^.*[\/]/, "").replace(/\.\w+$/, "");
const bytes = readFileSync(path);
const ascii = bytes.subarray(0, 5).toString("latin1") === "solid" && bytes.includes("facet normal");
const t = performance.now();
let r;
try { r = JSON.parse(rust.stl_to_step_json(ascii ? new TextEncoder().encode(bytes.toString("utf8")) : new Uint8Array(bytes), "", name)); }
catch (e) { console.log(JSON.stringify({ name, ms: Math.round(performance.now() - t), failed: String(e?.message || e).slice(0, 300) })); process.exit(0); }
const ms = Math.round(performance.now() - t);
const count = () => r.step.split("=ADVANCED_FACE(").length - 1;
const types = {};
for (const k of ["PLANE", "CYLINDRICAL_SURFACE", "CONICAL_SURFACE", "SPHERICAL_SURFACE", "TOROIDAL_SURFACE", "B_SPLINE_SURFACE_WITH_KNOTS"]) types[k] = r.step.split(`=${k}(`).length - 1;
writeFileSync(new URL(`./out/${name}-next.step`, import.meta.url), r.step);
writeFileSync(new URL(`./out/${name}-next-report.json`, import.meta.url), JSON.stringify(r.report, null, 1));
console.log(JSON.stringify({ name, ms, faces: count(/=ADVANCED_FACE\(/g), types, hybrid: r.report?.hybrid_rebuild, keys: Object.keys(r.report || {}) }));
process.exit(0);
