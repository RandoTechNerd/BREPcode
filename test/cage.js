// The smooth-surface cage worker (viewer/cage-worker.js) run directly in Node:
// welding, the five QuadriFlow stages one call at a time, and the cage that
// comes back. Checked by its topology: every face a quad, no open edges, no
// edge shared by more than two quads, few irregular vertices, and the cage
// sitting where the mesh was (same bounding box, within a little).

import { pathToFileURL } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const QF = join(HERE, "..", "vendor", "quadriflow", "quadriflow-stages.mjs");
globalThis.__QF_URL = pathToFileURL(QF).href;
globalThis.__QF_WASM_BYTES = readFileSync(QF.replace(/\.mjs$/, ".wasm"));
const { weldSTL, _handleForTests: handle } = await import("../viewer/cage-worker.js");
const { STAGE_NAMES } = await import("../viewer/cage-stages.js");

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

// A test shape with curvature in every direction: a lumpy sphere as ASCII STL.
function lumpySTL(n = 48) {
  const P = (i, j) => {
    const th = (i / n) * Math.PI, ph = (j / n) * 2 * Math.PI;
    const r = 20 * (1 + 0.15 * Math.sin(3 * th) * Math.cos(2 * ph));
    return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
  };
  const out = ["solid lumpy"];
  const tri = (a, b, c) => {
    out.push(" facet normal 0 0 0", "  outer loop");
    for (const v of [a, b, c]) out.push(`   vertex ${v[0]} ${v[1]} ${v[2]}`);
    out.push("  endloop", " endfacet");
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    if (i > 0) tri(a, b, d);
    if (i < n - 1) tri(b, c, d);
  }
  out.push("endsolid lumpy");
  return out.join("\n");
}

function topology(verts, quads) {
  const E = new Map(), val = new Map();
  for (let q = 0; q < quads.length; q += 4) for (let k = 0; k < 4; k++) {
    const a = quads[q + k], b = quads[q + ((k + 1) & 3)];
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    E.set(key, (E.get(key) || 0) + 1);
    val.set(a, (val.get(a) || 0) + 1);
  }
  let open = 0, non = 0, irr = 0;
  for (const c of E.values()) { if (c === 1) open++; else if (c > 2) non++; }
  for (const c of val.values()) if (c !== 4) irr++;
  return { open, non, irr, used: val.size };
}
const bbox = (v) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], v[i + k]); hi[k] = Math.max(hi[k], v[i + k]);
  }
  return { lo, hi };
};

async function runCage(stl, faces) {
  const begun = await handle({ op: "begin", stl, faces, sharp: 1 });
  const ms = [];
  for (let k = 0; k < STAGE_NAMES.length; k++) ms.push((await handle({ op: "stage", k })).ms);
  const out = await handle({ op: "finish" });
  return { begun, ms, ...out };
}

console.log("\ncage: welding\n");
{
  const stl = lumpySTL(16);
  const { verts, tris } = weldSTL(stl);
  const nTri = (stl.match(/facet normal/g) || []).length;
  check("welding shares corners (V = T/2 + 2 for a closed sphere)", verts.length / 3 === nTri / 2 + 2,
    `V=${verts.length / 3} T=${nTri}`);
  check("every triangle kept", tris.length / 3 === nTri);
}

console.log("\ncage: QuadriFlow, stage by stage\n");
{
  const stl = lumpySTL(48);
  const r = await runCage(stl, 1500);
  const nq = r.quads.length / 4;
  const t = topology(r.verts, r.quads);
  check("five stages ran one call at a time", r.ms.length === 5);
  check(`about the asked-for number of quads (${nq} for 1500)`, nq > 900 && nq < 2200);
  check("watertight: no open edges", t.open === 0, `open=${t.open}`);
  check("manifold: no edge on more than two quads", t.non === 0, `non=${t.non}`);
  check(`few irregular vertices (${t.irr} of ${t.used})`, t.irr / t.used < 0.1);
  const a = bbox(weldSTL(stl).verts), b = bbox(r.verts);
  const off = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(a.lo[k] - b.lo[k]), Math.abs(a.hi[k] - b.hi[k])]));
  check(`cage sits where the mesh is, in mm (box within ${off.toFixed(2)} mm)`, off < 1.5);
  check("finishing frees the instance (a stage after it is refused)",
    await handle({ op: "stage", k: 0 }).then(() => false, () => true));
}

{
  // the same job twice in a row: a fresh instance each time, same answer
  const stl = lumpySTL(32);
  const a = await runCage(stl, 800), b = await runCage(stl, 800);
  check("a second job in the same worker gives the same cage", a.quads.length === b.quads.length
    && a.verts.every((x, i) => Math.abs(x - b.verts[i]) < 1e-9));
}

const WOBBLY = join(HERE, "..", "scratch_fz", "wobbly.stl");
if (existsSync(WOBBLY)) {
  console.log("\ncage: a real organic STL (scratch_fz/wobbly.stl)\n");
  const buf = readFileSync(WOBBLY);
  const t0 = Date.now();
  const begun = await handle({ op: "begin", stl: undefined, verts: null, ...(() => {
    const m = weldSTL(new Uint8Array(buf));
    return { verts: m.verts, tris: m.tris };
  })(), faces: 4000, sharp: 1 });
  const ms = [];
  for (let k = 0; k < 5; k++) ms.push(Math.round((await handle({ op: "stage", k })).ms));
  const out = await handle({ op: "finish" });
  const t = topology(out.verts, out.quads);
  console.log(`  ${begun.triangles} triangles -> ${out.quads.length / 4} quads in ${Date.now() - t0} ms; stages ${ms.join(" / ")} ms`);
  check("real STL: watertight all-quad cage", t.open === 0 && t.non === 0 && out.quads.length > 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
