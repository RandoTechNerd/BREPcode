// One STL -> STEP reconstruction, in a worker of its own.
//
// The page starts one of these per attempt (src/stlexact.js decides which
// build and whether a second attempt is worth it) and terminates it after,
// so a reconstruction that traps or never returns can't take the build
// worker's kernel down with it: that instance builds every model, and a wasm
// instance that trapped mid-call is not safe to call again.
//
//   ?engine=current  vendor/brep-kernel-rust      (the kernel the app builds with)
//   ?engine=legacy   vendor/brep-stl2step-legacy  (0.9.0, kept for this only)
//   &wasm=<url>      where the .wasm lives, on a host that keeps it elsewhere
//
// NB build-site.mjs rewrites the /vendor paths below for the static site.
import { summarise } from "../src/stlexact.js";

const PARAMS = new URLSearchParams(self.location?.search || "");
const ENGINE = PARAMS.get("engine") === "legacy" ? "legacy" : "current";

let ready = null;
function load() {
  ready ??= (async () => {
    const mod = ENGINE === "legacy"
      ? await import("/vendor/brep-stl2step-legacy/brep_kernel.js")
      : await import("/vendor/brep-kernel-rust/brep_kernel.js");
    const dir = ENGINE === "legacy" ? "/vendor/brep-stl2step-legacy/" : "/vendor/brep-kernel-rust/";
    await mod.default({ module_or_path: PARAMS.get("wasm") || new URL(`${dir}brep_kernel_bg.wasm`, self.location.href) });
    if (typeof mod.stl_to_step_json !== "function") throw new Error("this kernel build has no STL reconstruction");
    return mod;
  })();
  return ready;
}

self.onmessage = async ({ data }) => {
  const { id, stl, name, options } = data;
  let rust;
  try { rust = await load(); }
  catch (e) { self.postMessage({ id, ok: false, engine: ENGINE, loadFailed: true, error: String(e?.message || e) }); return; }
  const t0 = performance.now();
  try {
    const bytes = typeof stl === "string" ? new TextEncoder().encode(stl) : new Uint8Array(stl);
    const out = JSON.parse(rust.stl_to_step_json(bytes, options ? JSON.stringify(options) : "", name || "part"));
    self.postMessage({ id, ...summarise(out, performance.now() - t0, ENGINE) });
  } catch (e) {
    // A RuntimeError is the wasm trapping (a Rust panic: "unreachable"), not a
    // refusal; the page throws this worker away either way.
    self.postMessage({
      id, ok: false, engine: ENGINE, ms: Math.round(performance.now() - t0),
      crashed: e instanceof WebAssembly.RuntimeError, error: String(e?.message || e),
    });
  }
};

// a message posted in the same tick as new Worker() can be lost (see the
// page's workerOutbox), so the page waits for this before it sends the job
self.postMessage({ ready: true });
