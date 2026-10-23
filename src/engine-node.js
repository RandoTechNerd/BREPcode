// Node-side loaders for src/engine.js (the CLI and the tests). The browser
// loads the same two wasm modules by URL; see viewer/kernel-worker.js.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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

// NVIDIA's SMLib kernel (native/nvidia-kernel), dressed as the Rust module so
// runEngine() takes it unchanged. Native only: null when the addon isn't built
// for this machine (it never is on the website).
let nvidia;
export function loadNvidiaKernel() {
  if (nvidia !== undefined) return nvidia;
  try { nvidia = createRequire(import.meta.url)("../native/nvidia-kernel/adapter.cjs").load(); }
  catch { nvidia = null; }
  return nvidia;
}
