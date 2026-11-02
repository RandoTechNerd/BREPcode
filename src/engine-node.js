// Node-side loaders for src/engine.js (the CLI and the tests). The browser
// loads the same two wasm modules by URL; see viewer/kernel-worker.js.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";

let rust = null;
export async function loadRustKernel() {
  if (rust) return rust;
  // BREPCODE_RUST_KERNEL_DIR points the tests and bench/kernel-bench.mjs at a
  // candidate build (a folder holding brep_kernel.js + brep_kernel_bg.wasm).
  const dir = process.env.BREPCODE_RUST_KERNEL_DIR;
  const url = dir ? pathToFileURL(resolve(dir, "brep_kernel.js")) : new URL("../vendor/brep-kernel-rust/brep_kernel.js", import.meta.url);
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
