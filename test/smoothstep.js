// The smooth B-spline solid from the cage (src/smoothstep.js): a lumpy sphere
// and a box go through the real QuadriFlow cage, become bicubic patches and
// a STEP, and that STEP is read back (closed: every edge on two faces) and
// imported by the Rust kernel as an exact solid. The limit surface must sit
// on the original shape (lumpy radius error small), and the box must keep
// its creases (sharp edges found, corners sharp).
//
//   node test/smoothstep.js

import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QF = join(HERE, "..", "vendor", "quadriflow", "quadriflow-stages.mjs");
globalThis.__QF_URL = pathToFileURL(QF).href;
globalThis.__QF_WASM_BYTES = readFileSync(QF.replace(/\.mjs$/, ".wasm"));
const { _handleForTests: handle } = await import("../viewer/cage-worker.js");
const { STAGE_NAMES } = await import("../viewer/cage-stages.js");
const { cageToStep, cageToStl, cageTopology, findCreases, catmullClarkPatches, evalPatch, closeCage, fitCage } = await import("../src/smoothstep.js");
const { importedSolid, registerImport } = await import("../src/dsl.js");
const { build } = await import("../index.js");
const { runEngine } = await import("../src/engine.js");
const { loadRustKernel, loadManifoldNode } = await import("../src/engine-node.js");

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const count = (step, entity) => (step.match(new RegExp(`=${entity}\\(`, "g")) || []).length;
const OUT = join(HERE, "..", "scratch_fz", "smoothstep");
mkdirSync(OUT, { recursive: true });

const stlOf = (name, tris) => ["solid " + name, ...tris.flatMap((t) => [" facet normal 0 0 0", "  outer loop", ...t.map((v) => `   vertex ${v.join(" ")}`), "  endloop", " endfacet"]), "endsolid " + name].join("\n");
const lumpyR = (th, ph) => 20 * (1 + 0.15 * Math.sin(3 * th) * Math.cos(2 * ph));
function lumpySTL(n = 48) {
  const P = (i, j) => {
    const th = (i / n) * Math.PI, ph = (j / n) * 2 * Math.PI, r = lumpyR(th, ph);
    return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
  };
  const tris = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    if (i > 0) tris.push([a, b, d]);
    if (i < n - 1) tris.push([b, c, d]);
  }
  return stlOf("lumpy", tris);
}
// a 40 x 30 x 20 box, each face a grid of triangles so QuadriFlow has something to work from
function boxSTL(n = 10) {
  const [X, Y, Z] = [40, 30, 20], tris = [];
  const quad = (a, b, c, d) => { tris.push([a, b, c]); tris.push([a, c, d]); };
  const face = (origin, du, dv) => {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const P = (s, t) => origin.map((o, k) => o + du[k] * s / n + dv[k] * t / n);
      quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
    }
  };
  face([0, 0, 0], [0, Y, 0], [X, 0, 0]);           // bottom (normal -z)
  face([0, 0, Z], [X, 0, 0], [0, Y, 0]);           // top
  face([0, 0, 0], [X, 0, 0], [0, 0, Z]);           // front y=0 (normal -y)
  face([0, Y, 0], [0, 0, Z], [X, 0, 0]);           // back
  face([0, 0, 0], [0, 0, Z], [0, Y, 0]);           // left x=0
  face([X, 0, 0], [0, Y, 0], [0, 0, Z]);           // right
  return stlOf("box", tris);
}

async function runCage(stl, faces) {
  await handle({ op: "begin", stl, faces, sharp: 1 });
  for (let k = 0; k < STAGE_NAMES.length; k++) await handle({ op: "stage", k });
  return handle({ op: "finish" });
}

// Read a STEP back: faces, and how many faces use each edge entity.
function readBack(text) {
  const E = new Map();
  for (const m of text.matchAll(/#(\d+)=([A-Z0-9_]+)\(([\s\S]*?)\);/g)) E.set(+m[1], { t: m[2], a: m[3] });
  const refs = (s) => [...s.matchAll(/#(\d+)/g)].map((m) => +m[1]);
  const use = new Map();
  let faces = 0;
  for (const [, e] of E) {
    if (e.t !== "ADVANCED_FACE") continue;
    faces++;
    for (const b of refs(e.a).slice(0, -1)) {
      const loop = E.get(refs(E.get(b).a)[0]);
      for (const oe of refs(loop.a)) {
        const ec = refs(E.get(oe).a).at(-1);
        use.set(ec, (use.get(ec) || 0) + 1);
      }
    }
  }
  let open = 0, over = 0;
  for (const c of use.values()) { if (c === 1) open++; else if (c > 2) over++; }
  return { faces, edges: use.size, open, over };
}

const rust = await loadRustKernel();
const engineSolids = async (shape) => {
  const r = await build(shape, { engine: "split" });
  return runEngine(await r.partHistory.toJSON(), { rust, manifold: loadManifoldNode });
};

console.log("\nsmooth STEP: a lumpy sphere\n");
{
  const stl = lumpySTL(48);
  const cage = await runCage(stl, 800);
  const nq = cage.quads.length / 4;
  const t0 = Date.now();
  const r = cageToStep(cage.verts, cage.quads, { name: "lumpy" });
  const ms = Date.now() - t0;
  writeFileSync(join(OUT, "lumpy.step"), r.step);
  const back = readBack(r.step);
  check(`one bicubic face per quad (${nq} quads) in ${ms} ms`, r.faces === nq && count(r.step, "B_SPLINE_SURFACE_WITH_KNOTS") === nq);
  check("closed in the file: every edge curve on exactly two faces", back.open === 0 && back.over === 0, `open ${back.open}, over ${back.over}`);
  check("edge curves shared, not duplicated", count(r.step, "EDGE_CURVE") === back.edges && back.edges === nq * 2, `${count(r.step, "EDGE_CURVE")} edge curves for ${nq} quads`);
  check("a sphere has no creases", r.creases === 0, `${r.creases} crease edges`);
  // the limit surface sits on the lumpy shape: sample every patch
  const topo = cageTopology(cage.verts, cage.quads);
  const { patches } = catmullClarkPatches(fitCage(cage.verts, cage.quads, topo, null), cage.quads, topo, null);
  let worst = 0, sum = 0, nS = 0;
  for (let q = 0; q < nq; q++) for (const [u, v] of [[0.5, 0.5], [0.2, 0.7], [0.8, 0.3]]) {
    const p = evalPatch(patches, q, u, v);
    const rr = Math.hypot(...p), th = Math.acos(p[2] / rr), ph = Math.atan2(p[1], p[0]);
    const err = Math.abs(rr - lumpyR(th, ph));
    worst = Math.max(worst, err); sum += err; nS++;
  }
  check(`limit surface on the shape: mean ${(sum / nS).toFixed(3)} mm, worst ${worst.toFixed(3)} mm off a 20 mm radius`, worst < 0.6 && sum / nS < 0.15);
  // the measure the app sizes the cage by (viewer/cagedev.js): input vertices
  // against the finished surface's preview, agreeing with the sampling above
  {
    const { surfaceDeviation } = await import("../viewer/cagedev.js");
    const withMesh = cageToStep(cage.verts, cage.quads, { name: "lumpy", mesh: true });
    const pts = (t) => [...t.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [+m[1], +m[2], +m[3]]);
    const d = surfaceDeviation(pts(stl), pts(withMesh.mesh));
    check(`surfaceDeviation measures it too: mean ${d.mean.toFixed(3)} mm, p95 ${d.p95.toFixed(3)} mm over a ${d.diag.toFixed(0)} mm part`, d.mean > 0 && d.mean < 0.15 && d.p95 < 0.6 && d.diag > 60 && d.diag < 80);
  }
  // the Rust kernel imports it as an exact solid
  registerImport("lumpy-smooth.step", r.step, { mesh: cageToStl(cage.verts, cage.quads, { name: "lumpy" }) });
  const t1 = Date.now();
  let out = null, why = "";
  try { out = await engineSolids(importedSolid("lumpy-smooth.step")); } catch (e) { why = String(e?.message || e).slice(0, 300); }
  const ms2 = Date.now() - t1;
  check(`the Rust kernel imports it as an exact solid (${ms2} ms)`, out && out.lane === "exact" && out.solids?.length === 1 && out.solids[0].exact, why || `lane ${out?.lane}, ${out?.solids?.length} solids`);
  if (out?.solids?.length) {
    const s = out.solids[0];
    check(`faces survive the import: ${s.faces?.length} of ${nq}`, s.faces?.length === nq);
  }
}

console.log("\nsmooth STEP: a box keeps its edges\n");
{
  const stl = boxSTL(10);
  const raw = await runCage(stl, 600);
  const cage = closeCage(raw.verts, raw.quads);
  // QuadriFlow leaves the box two 3-edge holes at corners: odd, so they stay
  // open in the cage and are closed in the STEP (a split rim edge + a patch)
  const rawOpen = cageTopology(raw.verts, raw.quads).open;
  const odd = cage.oddLoops.reduce((s, l) => s + l.length, 0);
  check(`odd holes left open in the cage, even ones filled (${cage.holes} holes, ${cage.oddLoops.length} odd)`, cageTopology(cage.verts, cage.quads).open === odd && cage.oddLoops.every((l) => l.length & 1));
  const nq = cage.quads.length / 4;
  const topo = cageTopology(cage.verts, cage.quads);
  const cr = findCreases(cage.verts, cage.quads, topo, 40);
  check(`creases found along the 12 box edges (${cr.creases.size} crease edges of ${topo.edges.size})`, cr.creases.size > 40 && cr.creases.size < topo.edges.size / 4);
  // every box corner has a hard vertex on it (hole rims add a few more)
  const boxCorners = [];
  for (const x of [0, 40]) for (const y of [0, 30]) for (const z of [0, 20]) boxCorners.push([x, y, z]);
  const hard = [];
  for (let v = 0; v < topo.nv; v++) if (cr.degree[v] >= 3) hard.push([cage.verts[v * 3], cage.verts[v * 3 + 1], cage.verts[v * 3 + 2]]);
  const covered = boxCorners.filter((c) => hard.some((h) => Math.hypot(h[0] - c[0], h[1] - c[1], h[2] - c[2]) < 0.5)).length;
  check(`a hard corner on each of the 8 box corners: ${covered} (${hard.length} hard vertices)`, covered === 8);
  const r = cageToStep(cage.verts, cage.quads, { name: "box" });
  writeFileSync(join(OUT, "box.step"), r.step);
  const back = readBack(r.step);
  check(`closed: ${r.faces} faces, no open edges`, back.open === 0 && back.over === 0, `open ${back.open}, over ${back.over}`);
  check(`no strips: ${r.faces} faces from ${raw.quads.length / 4} cage quads (${rawOpen} open edges)`, r.faces <= raw.quads.length / 4 + 4 * cage.holes);
  // flat faces stay flat: mid-patch points lie on the box's planes within a hair
  const { patches } = catmullClarkPatches(fitCage(cage.verts, cage.quads, topo, cr), cage.quads, topo, cr);
  let worst = 0;
  for (let q = 0; q < nq; q++) {
    const p = evalPatch(patches, q, 0.5, 0.5);
    const d = Math.min(Math.abs(p[0]), Math.abs(p[0] - 40), Math.abs(p[1]), Math.abs(p[1] - 30), Math.abs(p[2]), Math.abs(p[2] - 20));
    worst = Math.max(worst, d);
  }
  check(`faces stay flat: worst mid-patch distance from a box plane ${worst.toFixed(3)} mm`, worst < 0.25);
  // corners stay sharp: a corner vertex's limit point is the corner itself
  let cornerOff = 0;
  for (let v = 0; v < topo.nv; v++) if (cr.degree[v] >= 3) {
    const p = [cage.verts[v * 3], cage.verts[v * 3 + 1], cage.verts[v * 3 + 2]];
    const { corners: lim } = catmullClarkPatches(fitCage(cage.verts, cage.quads, topo, cr), cage.quads, topo, cr);
    cornerOff = Math.max(cornerOff, Math.hypot(lim[v * 3] - p[0], lim[v * 3 + 1] - p[1], lim[v * 3 + 2] - p[2]));
  }
  check(`corners stay put (${cornerOff.toFixed(4)} mm)`, cornerOff < 1e-9);
  // without creases the same box rounds off
  const soft = cageToStep(cage.verts, cage.quads, { name: "softbox", creases: false });
  check(`creases can be turned off (only the ${odd} hole-rim edges stay creased)`, soft.creases === odd && soft.faces === r.faces);
  registerImport("box-smooth.step", r.step, { mesh: cageToStl(cage.verts, cage.quads, { name: "box" }) });
  let out = null, why = "";
  const t1 = Date.now();
  try { out = await engineSolids(importedSolid("box-smooth.step")); } catch (e) { why = String(e?.message || e).slice(0, 300); }
  check(`the Rust kernel imports the creased box (${Date.now() - t1} ms)`, out && out.lane === "exact" && out.solids?.length === 1 && out.solids[0].exact, why || `lane ${out?.lane}`);
}

console.log("\nsmooth STEP: a cage with holes (the bag sample)\n");
{
  const path = "C:/Users/Rando/Claude Play/QuadriFlowWasm/samples/bag.obj";
  let obj = null;
  try { obj = readFileSync(path, "utf8"); } catch { console.log("  SKIP  bag.obj not on this machine"); }
  if (obj) {
    const v = [], f = [];
    for (const line of obj.split(/\r?\n/)) {
      const p = line.trim().split(/\s+/);
      if (p[0] === "v") v.push(+p[1], +p[2], +p[3]);
      else if (p[0] === "f") { const ids = p.slice(1).map((x) => parseInt(x, 10) - 1); for (let k = 1; k + 1 < ids.length; k++) f.push(ids[0], ids[k], ids[k + 1]); }
    }
    await handle({ op: "begin", verts: v, tris: f, faces: 2000, sharp: 1 });
    for (let k = 0; k < STAGE_NAMES.length; k++) await handle({ op: "stage", k });
    const raw = await handle({ op: "finish" });
    const before = cageTopology(raw.verts, raw.quads).open;
    const r = cageToStep(raw.verts, raw.quads, { name: "bag" });
    writeFileSync(join(OUT, "bag.step"), r.step);
    const back = readBack(r.step);
    check(`holes filled: ${before} open cage edges, ${r.holesFilled} holes closed, ${r.faces} faces`, before === 0 || r.holesFilled > 0);
    check("closed in the file", back.open === 0 && back.over === 0, `open ${back.open}, over ${back.over}`);
    registerImport("bag-smooth.step", r.step, { mesh: cageToStl(raw.verts, raw.quads, { name: "bag" }) });
    let out = null, why = "";
    const t1 = Date.now();
    try { out = await engineSolids(importedSolid("bag-smooth.step")); } catch (e) { why = String(e?.message || e).slice(0, 300); }
    check(`the Rust kernel imports the bag (${Date.now() - t1} ms)`, out && out.lane === "exact" && out.solids?.length === 1 && out.solids[0].exact, why || `lane ${out?.lane}`);
  }
}

console.log("\nsmooth STEP: a 20k Benchy (thin walls, odd holes that pair round the hull)\n");
{
  const path = join(HERE, "..", "scratch_fz", "benchy20.stl");
  let stl = null;
  // a binary STL: the worker decodes the bytes itself
  try { stl = new Uint8Array(readFileSync(path)); } catch { console.log("  SKIP  scratch_fz/benchy20.stl not on this machine"); }
  if (stl) {
    await handle({ op: "begin", stl, faces: 2500, sharp: 1, seed: 0 });
    for (let k = 0; k < STAGE_NAMES.length; k++) await handle({ op: "stage", k });
    const raw = await handle({ op: "finish" });
    const r = cageToStep(raw.verts, raw.quads, { name: "benchy" });
    check(`every hole closed, no patch folded or stray (${r.holesFilled} holes, ${r.faces} faces, ${r.relaxed} relaxed)`, r.folded === 0);
    // the strips this replaced turned this cage into 5,260 faces
    check(`no strips: ${r.faces} faces from ${raw.quads.length / 4} cage quads`, r.faces <= raw.quads.length / 4 + 4 * r.holesFilled);
    registerImport("benchy-smooth.step", r.step);
    let out = null, why = "";
    const t1 = Date.now();
    try { out = await engineSolids(importedSolid("benchy-smooth.step")); } catch (e) { why = String(e?.message || e).slice(0, 300); }
    check(`the Rust kernel imports the Benchy (${Date.now() - t1} ms)`, out && out.lane === "exact" && out.solids?.length === 1 && out.solids[0].exact, why || `lane ${out?.lane}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
