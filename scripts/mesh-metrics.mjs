// What a built part IS, measured on its mesh: the overall size, the volume,
// how many solids, and how many holes go through it. Used to judge AI-written
// code by its result rather than by whether it built (test/browserparts.js,
// scripts/webllm-eval-check.mjs).
//
// Holes through a part are its genus. For each closed piece of surface,
// V - E + F = 2 - 2g, once the triangle corners are welded by position
// (every face is tessellated on its own, so the same corner arrives once per
// face it touches).

import { PartHistory } from "brep-io-kernel";
import { compile } from "../src/dsl.js";
import { runEditorCode } from "../src/runcode.js";
import { runEngine, solidsToSTL } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";

let rust = null;

// Build editor code on the real kernel. { ok, error?, tris: Float32Array, solids }
export async function buildCode(code) {
  rust ??= await loadRustKernel();
  try {
    const { shape } = runEditorCode(code);
    const ph = new PartHistory();
    await compile(shape, ph, []);
    const out = await runEngine(JSON.parse(await ph.toJSON()), { rust, manifold: loadManifoldNode });
    const stl = solidsToSTL(out.solids, 6);
    const v = [];
    for (const m of stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) v.push(+m[1], +m[2], +m[3]);
    return { ok: v.length > 0, error: v.length ? null : "built nothing", tris: Float32Array.from(v), solids: out.solids?.length ?? 0, lane: out.lane };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).split("\n")[0].slice(0, 160) };
  }
}

export function metrics(tris) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let vol = 0;
  for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], tris[i + k]); mx[k] = Math.max(mx[k], tris[i + k]); }
  for (let i = 0; i < tris.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.subarray(i, i + 9);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  // weld, then count vertices, edges, faces and connected pieces
  const ids = new Map(), parent = [];
  const id = (i) => {
    const key = `${Math.round(tris[i] * 1000)},${Math.round(tris[i + 1] * 1000)},${Math.round(tris[i + 2] * 1000)}`;
    let n = ids.get(key);
    if (n === undefined) { n = ids.size; ids.set(key, n); parent.push(n); }
    return n;
  };
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const edges = new Set();
  let faces = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const a = id(i), b = id(i + 3), c = id(i + 6);
    if (a === b || b === c || a === c) continue;           // a sliver that welded flat
    faces++;
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      edges.add(p < q ? `${p}_${q}` : `${q}_${p}`);
      const rp = find(p), rq = find(q);
      if (rp !== rq) parent[Math.max(rp, rq)] = Math.min(rp, rq);
    }
  }
  const pieces = new Set(parent.map((_, i) => find(i))).size;
  const chi = ids.size - edges.size + faces;
  const size = mx.map((m, k) => Math.round((m - mn[k]) * 100) / 100);
  return {
    size,                                   // x, y, z extents, mm
    sorted: [...size].sort((a, b) => a - b),
    volume: Math.abs(vol / 6),
    fill: Math.abs(vol / 6) / Math.max(1e-9, size[0] * size[1] * size[2]),   // volume / bounding box
    pieces,
    holes: Math.round(pieces - chi / 2),    // genus summed over pieces
  };
}

// Does a measured part match what was asked? `want`:
//   size: [a, b, c] sorted smallest first, null for "any"; within max(1 mm, 6%)
//   holes: through-holes; hollow: true (fill under 0.5) / false
//   dim: a size that must appear on some axis
export function judge(m, want = {}) {
  const fails = [];
  const near = (a, b) => Math.abs(a - b) <= Math.max(1, 0.06 * b);
  if (want.size) want.size.forEach((w, i) => { if (w != null && !near(m.sorted[i], w)) fails.push(`size ${m.sorted.join("x")} not ${want.size.map((x) => x ?? "?").join("x")}`); });
  if (want.dim != null && !m.sorted.some((s) => near(s, want.dim))) fails.push(`no ${want.dim} mm side in ${m.sorted.join("x")}`);
  if (want.holes != null && m.holes !== want.holes) fails.push(`${m.holes} holes not ${want.holes}`);
  if (want.hollow === true && m.fill > 0.5) fails.push(`solid (fill ${m.fill.toFixed(2)}), not hollow`);
  if (want.pieces != null && m.pieces !== want.pieces) fails.push(`${m.pieces} pieces not ${want.pieces}`);
  // the share of its bounding box a part fills: a T is about 0.44 of its box,
  // a square cut down to the T's outline is not, though both measure 60 x 60
  if (want.fill && (m.fill < want.fill[0] || m.fill > want.fill[1])) fails.push(`fill ${m.fill.toFixed(2)} not ${want.fill[0]}-${want.fill[1]}`);
  return [...new Set(fails)];
}
