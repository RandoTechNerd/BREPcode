// Node-side loaders for src/engine.js (the CLI and the tests). The browser
// loads the same two wasm modules by URL; see viewer/kernel-worker.js.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let rust = null;
export async function loadRustKernel() {
  if (rust) return rust;
  const url = new URL("../vendor/brep-kernel-rust/brep_kernel.js", import.meta.url);
  const mod = await import(url.href);
  mod.initSync({ module: readFileSync(fileURLToPath(new URL("brep_kernel_bg.wasm", url))) });
  rust = mod;
  return rust;
}

let manifold = null;
export async function loadManifoldNode() {
  manifold ??= (async () => {
    const Module = (await import("manifold-3d")).default;
    const wasm = await Module();
    wasm.setup();
    return wasm;
  })();
  return manifold;
}
