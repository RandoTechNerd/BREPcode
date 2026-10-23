// The desktop app's native kernel, in its own process.
//
// main.cjs forks this as an Electron utility process (one per window) and
// hands the window's build worker a MessagePort straight to it. The worker
// posts the same feature list it would run on the wasm kernel; this runs the
// SAME split engine (dist-site/src/engine.js) on the native Rust kernel
// (native-kernel.cjs) and posts the solids back. Nothing goes through the main
// process, and a kernel that hangs or crashes takes down only this process:
// the worker then builds on its wasm kernel as before.
//
// Messages on a port: { id, op: "build", json, tolerance, kernel? }
//                     { id, op: "stl2step", stl, options, name }
//                     { id, op: "info" }
// Replies:            { id, ok: true, ... } | { id, ok: false, error, refusal?, lane? }

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const native = require("./native-kernel.cjs");

const kernel = native.load();
// NVIDIA's SMLib kernel (native/nvidia-kernel). Only the alpha build ships it;
// elsewhere load() comes back null and every build stays on the Rust kernel.
const nvidiaLoader = (() => {
  for (const p of [path.join(__dirname, "..", "native", "nvidia-kernel", "adapter.cjs")]) {
    try { return require(p); } catch { /* not in this build */ }
  }
  return null;
})();
const nvidia = nvidiaLoader ? nvidiaLoader.load() : null;
const SITE = path.join(__dirname, "..", "dist-site");
// engine.js is the website's own copy, so both builds run one engine
const engineP = import(pathToFileURL(path.join(SITE, "src", "engine.js")).href);
let manifoldP = null;
const loadManifold = () => {
  manifoldP ??= (async () => {
    const Module = (await import(pathToFileURL(path.join(SITE, "vendor", "manifold", "manifold.js")).href)).default;
    const wasm = await Module();
    wasm.setup();
    return wasm;
  })();
  return manifoldP;
};

// One build at a time: the kernel is single-threaded anyway. No handle is
// freed here: the kernel's incremental history cache owns every handle it
// hands out and frees them itself when a feature goes dirty, which is also
// what makes an unchanged feature free to rebuild.
let queue = Promise.resolve();

// msg.kernel "nvidia": NVIDIA's kernel first; a refusal there goes on to the
// Rust kernel, and only a Rust refusal goes back to the worker (which then
// builds on the JS kernel). Anything else: the Rust kernel, as always.
async function build(msg) {
  const { runEngine, EngineRefusal } = await engineP;
  const t0 = performance.now();
  const tolerance = msg.tolerance ?? 0.05;
  let out = null, used = "rust", nvidiaRefused = null;
  if (msg.kernel === "nvidia" && nvidia) {
    try {
      out = await runEngine(msg.json, { rust: nvidia, manifold: loadManifold, tolerance });
      used = "nvidia";
    } catch (e) {
      if (!(e instanceof EngineRefusal)) console.warn("[kernel] NVIDIA kernel failed:", e);
      nvidiaRefused = String(e?.message || e).slice(0, 300);
    }
  } else if (msg.kernel === "nvidia") {
    nvidiaRefused = `the NVIDIA kernel isn't in this build (${nvidiaLoader ? nvidiaLoader.load.error : "no adapter"})`;
  }
  if (!out) {
    if (!kernel) throw new Error(`native kernel unavailable: ${native.load.error}`);
    out = await runEngine(msg.json, { rust: kernel, manifold: loadManifold, tolerance });
  }
  const ms = performance.now() - t0;
  // Copied, not transferred: Electron's MessagePortMain only transfers ports,
  // and between processes the bytes are copied either way.
  const solids = out.solids.map((s) => ({
    name: s.name, exact: s.exact,
    faces: s.faces.map((f) => ({ name: f.name, positions: f.positions, normals: f.normals, index: f.index })),
  }));
  return { ok: true, lane: out.lane, solids, stats: { ...out.stats, native: true, kernel: used, nvidiaRefused, nativeMs: Math.round(ms) } };
}

function stl2step(msg) {
  const bytes = typeof msg.stl === "string" ? new TextEncoder().encode(msg.stl) : new Uint8Array(msg.stl);
  return { ok: true, json: kernel.stl_to_step_json(bytes, msg.options ? JSON.stringify(msg.options) : "", msg.name || "part") };
}

function serve(port) {
  port.on("message", ({ data }) => {
    const { id, op } = data || {};
    queue = queue.then(async () => {
      try {
        if (!kernel && !(op === "build" && nvidia) && op !== "info") throw new Error(`native kernel unavailable: ${native.load.error}`);
        let r;
        if (op === "build") r = await build(data);
        else if (op === "stl2step") r = stl2step(data);
        else if (op === "info") r = { ok: true, info: kernel?.info, nvidia: nvidia ? nvidia.info : null };
        else throw new Error(`unknown op "${op}"`);
        port.postMessage({ id, ...r });
      } catch (e) {
        const { EngineRefusal } = await engineP.catch(() => ({}));
        const refusal = !!EngineRefusal && e instanceof EngineRefusal;
        port.postMessage({ id, ok: false, refusal, lane: e?.lane, error: String(e?.message || e).slice(0, 400) });
      }
    });
  });
  port.start();
}

process.parentPort.on("message", (e) => {
  for (const port of e.ports || []) serve(port);
});
process.parentPort.postMessage({ up: true, native: !!kernel || !!nvidia, nvidia: !!nvidia, info: kernel?.info || native.load.error });
