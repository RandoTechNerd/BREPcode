// The JS face of the wasm kernel: the same functions, with the same
// arguments, as BREPcode's Node addon (native/nvidia-kernel/src/addon.cc), so
// its adapter.cjs can take this object in place of the addon.
//
//   import loadSmlib from "smlib-wasm";
//   const nk = await loadSmlib();
//   const h = nk.box(10, 20, 30);
//   nk.volume(h);  // 6000
//
// Each call hands its arguments to the module as one array (see
// src/smlib_wasm.cc) and turns a failure into a thrown Error with the
// addon's message.

import createSmlib from "./smlib.mjs";

export const FUNCTIONS = [
  "info", "free", "count", "copy",
  "box", "cylinder", "cone", "sphere", "torus", "torusArc",
  "translate", "rotate", "scale", "boolean",
  "extrude", "twistExtrude", "revolve", "fillet",
  "faces", "matchFaces", "edges", "bbox", "volume", "tessellate",
];

// options go to the Emscripten factory (locateFile, wasmBinary, ...)
export default async function loadSmlib(options = {}) {
  const M = await createSmlib(options);
  const call = (name) => {
    const f = M[name];
    return (...args) => {
      const out = f(args);
      const err = M.lastError([]);
      if (err !== undefined) throw new Error(err);
      return out;
    };
  };
  call("init")();
  const api = {};
  for (const name of FUNCTIONS) api[name] = call(name);
  // not in the addon: the wasm heap's size in bytes (it grows, never shrinks)
  api.heapBytes = call("heapBytes");
  return api;
}
