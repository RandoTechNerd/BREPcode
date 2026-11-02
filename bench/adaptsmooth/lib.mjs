// Shared bench helpers: load a mesh, run the QuadriFlow cage, import a STEP
// through the Rust kernel, and measure how far one triangle soup strays from
// another (both ways).
import { readFileSync } from "node:fs";
const ROOT = new URL("../../", import.meta.url);
globalThis.__QF_URL = new URL("vendor/quadriflow/quadriflow-stages.mjs", ROOT).href;
globalThis.__QF_WASM_BYTES = readFileSync(new URL("vendor/quadriflow/quadriflow-stages.wasm", ROOT));
const { _handleForTests: handle, weldSTL } = await import(new URL("viewer/cage-worker.js", ROOT).href);
export { weldSTL };
const { importedSolid, registerImport } = await import(new URL("src/dsl.js", ROOT).href);
const { build } = await import(new URL("index.js", ROOT).href);
const { runEngine } = await import(new URL("src/engine.js", ROOT).href);
const { loadRustKernel, loadManifoldNode } = await import(new URL("src/engine-node.js", ROOT).href);

export function loadSTL(path) {
  const bytes = readFileSync(path);
  const ascii = bytes.subarray(0, 5).toString("latin1") === "solid" && bytes.includes("facet normal");
  const stl = ascii ? bytes.toString("utf8") : new Uint8Array(bytes);
  return { stl, mesh: weldSTL(stl), name: path.replace(/^.*[\\/]/, "").replace(/\.\w+$/, "") };
}

// one seed, in this process
export async function cage1(input, faces, seed, sharp = 1) {
  const t0 = performance.now();
  const msg = input.verts ? { verts: input.verts, tris: input.tris } : { stl: input };
  const b = await handle({ op: "begin", ...msg, faces, sharp, seed });
  const stageMs = [b.ms];
  for (let k = 0; k < 5; k++) stageMs.push((await handle({ op: "stage", k })).ms);
  const raw = await handle({ op: "finish" });
  return { ...raw, stageMs: stageMs.map((x) => Math.round(x)), ms: Math.round(performance.now() - t0), seed };
}
// QuadriFlow with seed retry; with a file path each seed runs in a child
// process under a deadline (like the app's per-stage watchdog: some seeds
// never leave the index map). Returns { verts, quads, stageMs, ms, seed }
export async function cage(input, faces, sharp = 1, path = null) {
  const { spawnSync } = await import("node:child_process");
  const { readFileSync: rf, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  for (const seed of [0, 1, 2, 3]) {
    if (!path) { try { return await cage1(input, faces, seed, sharp); } catch { continue; } }
    const out = `${mkdtempSync(tmpdir() + "/qf-")}/c.json`;
    const t0 = performance.now();
    const r = spawnSync(process.execPath, [(await import("node:url")).fileURLToPath(new URL("./cagechild.mjs", import.meta.url)), path, String(faces), String(seed), out], { timeout: 60000 });
    if (r.status !== 0) { process.stderr.write(`  cage ${faces} seed ${seed}: ${r.error ? "timed out" : "failed"} after ${Math.round(performance.now() - t0)} ms
`); continue; }
    const c = JSON.parse(rf(out, "utf8"));
    return { ...c, verts: Float64Array.from(c.verts), quads: Int32Array.from(c.quads), wallMs: Math.round(performance.now() - t0) };
  }
  throw new Error("cage failed on 4 seeds");
}

let rust = null;
let seq = 0;
export async function kernelImport(step, tag = "x") {
  rust ??= await loadRustKernel();
  const name = `${tag}-${++seq}.step`;
  registerImport(name, step);
  const t = performance.now();
  try {
    const r = await runEngine(await (await build(importedSolid(name), { engine: "split" })).partHistory.toJSON(), { rust, manifold: loadManifoldNode });
    return { ok: r.lane === "exact", lane: r.lane, faces: r.solids[0]?.faces?.length, ms: Math.round(performance.now() - t) };
  } catch (e) { return { ok: false, ms: Math.round(performance.now() - t), why: String(e?.message || e).slice(0, 200) }; }
}

// ---- nearest distance from points to a triangle soup (flat xyz x 9 per tri)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function closest(p, a, b, c) {          // Ericson, point to triangle
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

export function bbox(xyz) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < xyz.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], xyz[i + k]); hi[k] = Math.max(hi[k], xyz[i + k]); }
  return { lo, hi, diag: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) };
}

// a spatial hash over a triangle soup; query(p) -> distance (and closest point)
export function triIndex(T, diag) {
  const cell = diag / 80, grid = new Map();
  const key = (a, b, c) => `${a},${b},${c}`;
  for (let t = 0; t < T.length; t += 9) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 9; k += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], T[t + k + c]); hi[c] = Math.max(hi[c], T[t + k + c]); }
    for (let x = Math.floor(lo[0] / cell); x <= Math.floor(hi[0] / cell); x++)
      for (let y = Math.floor(lo[1] / cell); y <= Math.floor(hi[1] / cell); y++)
        for (let z = Math.floor(lo[2] / cell); z <= Math.floor(hi[2] / cell); z++) {
          const k = key(x, y, z); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(t);
        }
  }
  return function query(p) {
    const g = p.map((x) => Math.floor(x / cell));
    let best = Infinity, bq = null;
    for (let r = 0; r <= 200; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        for (const t of grid.get(key(g[0] + dx, g[1] + dy, g[2] + dz)) || []) {
          const q = closest(p, [T[t], T[t + 1], T[t + 2]], [T[t + 3], T[t + 4], T[t + 5]], [T[t + 6], T[t + 7], T[t + 8]]);
          const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
          if (d < best) { best = d; bq = q; }
        }
      }
      if (best <= r * cell) break;       // nothing in a further shell can be closer
    }
    return { d: best, q: bq };
  };
}

export function meshSoup(mesh) {
  const T = new Float64Array(mesh.tris.length * 3);
  for (let i = 0; i < mesh.tris.length; i++) for (let c = 0; c < 3; c++) T[i * 3 + c] = mesh.verts[mesh.tris[i] * 3 + c];
  return T;
}
export function stlSoup(text) {
  const P = []; for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) P.push(+m[1], +m[2], +m[3]);
  return Float64Array.from(P);
}

const stats = (ds, diag) => {
  ds.sort((a, b) => a - b);
  const mean = ds.reduce((s, x) => s + x, 0) / ds.length;
  return { mean: +mean.toFixed(3), p95: +ds[Math.floor(ds.length * 0.95)].toFixed(3), max: +ds.at(-1).toFixed(3), p95pct: +(100 * ds[Math.floor(ds.length * 0.95)] / diag).toFixed(3) };
};
// two-sided: input vertices -> surface (lost detail), surface samples -> input (bulges, bad fills)
export function deviation(mesh, surfSoup, n = 4000) {
  const { diag } = bbox(mesh.verts);
  const toSurf = triIndex(surfSoup, diag), toMesh = triIndex(meshSoup(mesh), diag);
  const a = [], b = [];
  const nv = mesh.verts.length / 3, s1 = Math.max(1, Math.floor(nv / n));
  for (let i = 0; i < nv; i += s1) a.push(toSurf([mesh.verts[i * 3], mesh.verts[i * 3 + 1], mesh.verts[i * 3 + 2]]).d);
  const nt = surfSoup.length / 9, s2 = Math.max(1, Math.floor(nt / n));
  for (let t = 0; t < nt; t += s2) {
    const o = t * 9; b.push(toMesh([(surfSoup[o] + surfSoup[o + 3] + surfSoup[o + 6]) / 3, (surfSoup[o + 1] + surfSoup[o + 4] + surfSoup[o + 7]) / 3, (surfSoup[o + 2] + surfSoup[o + 5] + surfSoup[o + 8]) / 3]).d);
  }
  return { diag: +diag.toFixed(1), meshToSurf: stats(a, diag), surfToMesh: stats(b, diag) };
}
