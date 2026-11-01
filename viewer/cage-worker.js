// The smooth-surface cage, off the main thread: QuadriFlow (vendor/quadriflow,
// built from QuadriFlowWasm/stages.cpp) turns a triangle mesh into an
// all-quad, watertight cage that follows the shape's curvature.
//
// It runs ONE STAGE PER MESSAGE and then waits, so the page (viewer/cage.js,
// on the background-job scheduler) decides when the next stage may start:
//
//   page -> {op:"begin", id, stl | tris, faces, sharp, seed}   weld + load
//   page -> {op:"stage", id, k}                                  k = 0..4
//   page -> {op:"finish", id}                                    copy the cage out
//   worker -> {id, ok:true, ...} or {id, ok:false, error}
//
// A stage cannot be paused part-way; the page terminates this worker instead
// if it has to (a small machine under a long foreground stretch), and a crash
// inside QuadriFlow aborts the wasm instance, which is thrown away the same
// way. A fresh module per job also hands all of its memory back.

// (a test in Node points __QF_URL at the file on disk)
const MODULE_URL = globalThis.__QF_URL || "/vendor/quadriflow/quadriflow-stages.mjs";
import { STAGE_NAMES as STAGES } from "./cage-stages.js";

let factory = null;     // the Emscripten module factory, loaded once
let M = null;           // this job's module instance

async function freshModule() {
  factory ??= (await import(MODULE_URL)).default;
  // The vendored build is browser-only (no Node branch, so no stray
  // import("node:module") for Chrome to complain about in a worker that has
  // no import map). test/cage.js hands it the wasm bytes through
  // __QF_WASM_BYTES instead of letting it fetch.
  const bytes = globalThis.__QF_WASM_BYTES;
  M = await factory({
    print: () => {}, printErr: () => {},
    ...(bytes ? { instantiateWasm: (imports, receive) => { WebAssembly.instantiate(bytes, imports).then((r) => receive(r.instance)); return {}; } } : {}),
  });
  return M;
}

// ASCII or binary STL -> welded vertices + triangles. Welding matters: STL
// repeats every corner per triangle, and QuadriFlow needs shared vertices to
// see the surface as one connected sheet.
export function weldSTL(input, tol = 1e-4) {
  const tris = [];
  if (typeof input === "string") {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m;
    while ((m = re.exec(input))) tris.push(+m[1], +m[2], +m[3]);
  } else {
    const dv = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const n = dv.getUint32(80, true);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) tris.push(dv.getFloat32(o + k * 4, true));
    }
  }
  const inv = 1 / tol;
  const ids = new Map();
  const verts = [];
  const faces = [];
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const f = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const x = tris[t + k * 3], y = tris[t + k * 3 + 1], z = tris[t + k * 3 + 2];
      const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
      let id = ids.get(key);
      if (id === undefined) { id = verts.length / 3; ids.set(key, id); verts.push(x, y, z); }
      f[k] = id;
    }
    if (f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2]) faces.push(f[0], f[1], f[2]);
  }
  return { verts: new Float64Array(verts), tris: new Int32Array(faces) };
}

async function handle(msg) {
  const { op, id } = msg;
  if (op === "begin") {
    const t0 = performance.now();
    const mesh = msg.verts && msg.tris
      ? { verts: Float64Array.from(msg.verts), tris: Int32Array.from(msg.tris) }
      : weldSTL(msg.stl);
    const nv = mesh.verts.length / 3, nf = mesh.tris.length / 3;
    if (nf < 4) throw new Error("no triangles to work from");
    await freshModule();
    const pv = M._malloc(mesh.verts.byteLength);
    const pf = M._malloc(mesh.tris.byteLength);
    M.HEAPF64.set(mesh.verts, pv / 8);
    M.HEAP32.set(mesh.tris, pf / 4);
    M._qf_begin(pv, nv, pf, nf, msg.faces ?? 4000, msg.sharp ? 1 : 0, msg.seed ?? 0);
    M._free(pv); M._free(pf);
    return { vertices: nv, triangles: nf, ms: performance.now() - t0 };
  }
  if (!M) throw new Error("no cage job loaded");
  if (op === "stage") {
    const t0 = performance.now();
    const r = M._qf_stage(msg.k);
    if (r !== 0) throw new Error(`stage ${msg.k} returned ${r}`);
    return { k: msg.k, name: STAGES[msg.k], ms: performance.now() - t0 };
  }
  if (op === "finish") {
    const nv = M._qf_vert_count(), nq = M._qf_quad_count();
    if (!nq) throw new Error("QuadriFlow produced no quads");
    const pv = M._malloc(nv * 24), pq = M._malloc(nq * 16);
    M._qf_copy_out(pv, pq);
    const verts = M.HEAPF64.slice(pv / 8, pv / 8 + nv * 3);
    const quads = M.HEAP32.slice(pq / 4, pq / 4 + nq * 4);
    M._free(pv); M._free(pq);
    M._qf_end();
    M = null;            // drop the instance: its memory goes with it
    return { verts, quads, transfer: [verts.buffer, quads.buffer] };
  }
  throw new Error(`unknown op ${op}`);
}

if (typeof self !== "undefined" && typeof self.postMessage === "function" && typeof window === "undefined") {
  self.onmessage = async (e) => {
    const msg = e.data || {};
    try {
      const out = await handle(msg);
      const transfer = out.transfer || [];
      delete out.transfer;
      self.postMessage({ id: msg.id, ok: true, ...out }, transfer);
    } catch (err) {
      M = null;          // an abort leaves the instance unusable
      self.postMessage({ id: msg.id, ok: false, error: String(err?.message || err) });
    }
  };
}

// Node tests drive the same code path without a Worker.
export { handle as _handleForTests };
