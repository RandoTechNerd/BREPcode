// The kernel, off the main thread.
//
// The page compiles the DSL tree into a PartHistory (cheap — a feature list),
// serializes it with ph.toJSON(), and posts the string here. This worker
// rebuilds the history with fromJSON(), runs it (the expensive part that used
// to freeze the whole app), and posts back each solid's FACE buffers for the
// page to adopt. The solids stay alive HERE so exports (STL, faceted STEP)
// can be produced on demand without another build.
//
// Deliberately dependency-light: module workers don't see the page's import
// map, so nothing here may import "three" or any bare specifier. The kernel
// bundle is self-contained and the small amount of matrix work rides on the
// kernel's own objects.
//
// NB build-site.mjs rewrites the /node_modules path below for the static
// site, exactly as it does for every other viewer file.
import { PartHistory } from "/node_modules/brep-io-kernel/dist-kernel/brep-kernel.js";
import { adoptHistory, featureTimestamps, countRebuilt } from "../src/rehistory.js";
import { runEngine, solidsToSTL, EngineRefusal } from "../src/engine.js";

// The split engine (src/engine.js): the Rust kernel for exact parts, manifold
// for meshes, this file's JS kernel when either refuses. Both wasm modules are
// loaded on first use, by path, because a module worker has no import map.
// NB build-site.mjs rewrites both paths for the static site; the page can
// point the Rust wasm elsewhere (rustWasmUrl) on a host that can't serve 13 MB
// from the app folder, as brepcode.com already does for replicad.
const PARAMS = new URLSearchParams(self.location?.search || "");
let rustKernel = null;         // the load promise, once started
let rustModule = null;         // set when the load has finished
let rustFailure = null;        // set when it failed: not retried this session
function loadRust(wasmUrl) {
  if (rustFailure) return Promise.reject(rustFailure);
  rustKernel ??= (async () => {
    const mod = await import("/vendor/brep-kernel-rust/brep_kernel.js");
    await mod.default({ module_or_path: wasmUrl || PARAMS.get("rust") || new URL("/vendor/brep-kernel-rust/brep_kernel_bg.wasm", self.location.href) });
    rustModule = mod;
    // builds that ran on the JS kernel while this downloaded can now be redone
    self.postMessage({ rustReady: true });
    return mod;
  })().catch((e) => {
    // Remember it. A host that can't serve the 13 MB wasm would otherwise
    // re-fetch it, fail and warn on every single build.
    rustFailure = e instanceof Error ? e : new Error(String(e));
    console.warn("[kw] Rust kernel unavailable for this session; the JS kernel builds everything:", rustFailure.message);
    throw rustFailure;
  });
  return rustKernel;
}
// SMLib (from NVIDIA's open-source usd-brep) as WebAssembly: the kernel the
// desktop alpha runs as a native addon, here for the website. The kernel
// picker's "nvidia" asks for it, and only then is it downloaded (4.4 MB, 1.2
// MB brotli; vendor/brep-kernel-smlib, staged by build-smlib-wasm.mjs). It
// runs behind the desktop's own adapter (native/nvidia-kernel/adapter.cjs),
// so it names faces exactly as the desktop does, and whatever it refuses goes
// on to the Rust kernel, as in desktop/kernel-host.cjs.
//
// wasm memory grows and never shrinks, so after a heavy model (a few hundred
// MB of heap) the instance is dropped and the next build starts a fresh one
// from the module already compiled. That is safe between builds: the engine
// keeps no SMLib handles once a build's triangles are out, and the adapter
// frees the last run's solids at the start of the next. Builds go through it
// one at a time for the same reason (the adapter's handles are per instance).
// NB build-site.mjs rewrites both paths below for the static site.
const SMLIB_RECYCLE_BYTES = 768 * 1024 * 1024;
let smlibModule = null;     // the compiled WebAssembly.Module, kept across instances
let smlibWrap = null;       // adapter.cjs's wrap()
let smlibLoad = null;       // the load promise of the current instance
let smlibKernel = null;     // { kernel, raw } once loaded
let smlibFailure = null;    // set when it failed to load: not retried this session
let smlibPoisoned = false;  // the instance trapped: never reuse it
let smlibQueue = Promise.resolve();
// adapter.cjs is CommonJS for Node and Electron; here it gets the two things
// its loader asks for. Only wrap() is used, so its addon search never runs.
async function smlibAdapter() {
  const src = await (await fetch(new URL("/native/nvidia-kernel/adapter.cjs", self.location.href))).text();
  const module = { exports: {} };
  const path = { join: (...p) => p.join("/") };
  const require = (id) => {
    if (id === "node:path" || id === "path") return path;
    throw new Error(`adapter.cjs asked for ${id}, which the browser hasn't got`);
  };
  new Function("module", "exports", "require", "__dirname", "process", src)(module, module.exports, require, "", {});
  return module.exports.wrap;
}
function loadSmlib(wasmUrl) {
  if (smlibFailure) return Promise.reject(smlibFailure);
  smlibLoad ??= (async () => {
    const url = wasmUrl || PARAMS.get("smlib") || new URL("/vendor/brep-kernel-smlib/smlib.wasm", self.location.href).href;
    const [{ default: loadApi }, wrap, module] = await Promise.all([
      import("/vendor/brep-kernel-smlib/api.mjs"),
      smlibWrap || smlibAdapter(),
      smlibModule || (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`the SMLib wasm didn't download (HTTP ${res.status})`);
        return WebAssembly.compile(await res.arrayBuffer());
      })(),
    ]);
    smlibWrap = wrap;
    smlibModule = module;
    const raw = await loadApi({
      instantiateWasm: (imports, done) => { WebAssembly.instantiate(module, imports).then((inst) => done(inst, module)); return {}; },
    });
    // a trap (out of memory, a kernel bug) leaves the instance in an unknown
    // state: note it, so the instance is dropped after this build
    const guarded = {};
    for (const [k, f] of Object.entries(raw)) {
      guarded[k] = (...a) => {
        try { return f(...a); }
        catch (e) { if (e instanceof WebAssembly.RuntimeError) smlibPoisoned = true; throw e; }
      };
    }
    smlibPoisoned = false;
    smlibKernel = { kernel: wrap(guarded), raw };
    self.postMessage({ smlibReady: true });
    return smlibKernel;
  })().catch((e) => {
    smlibFailure = e instanceof Error ? e : new Error(String(e));
    smlibLoad = null;
    console.warn("[kw] SMLib kernel unavailable for this session; the Rust kernel builds instead:", smlibFailure.message);
    throw smlibFailure;
  });
  return smlibLoad;
}
// One SMLib build at a time; the instance is dropped afterwards if it grew
// past SMLIB_RECYCLE_BYTES or trapped.
function runSmlib(json, wasmUrl) {
  const run = smlibQueue.then(async () => {
    const { kernel, raw } = await loadSmlib(wasmUrl);
    try {
      const out = await runEngine(json, { rust: kernel, manifold: loadManifold });
      return { ...out, stats: { ...out.stats, kernel: "nvidia", wasm: true } };
    } finally {
      let heap = 0;
      try { heap = raw.heapBytes(); } catch { smlibPoisoned = true; }
      if (smlibPoisoned || heap > SMLIB_RECYCLE_BYTES) {
        trace(`SMLib instance dropped (${smlibPoisoned ? "it trapped" : `heap ${Math.round(heap / 1048576)} MB`}); the next build starts a fresh one`);
        smlibKernel = null;
        smlibLoad = null;
      }
    }
  });
  smlibQueue = run.catch(() => {});
  return run;
}

// The desktop app's NATIVE Rust kernel (desktop/kernel-host.cjs, a separate
// process running the same engine on the kernel compiled to machine code). The
// page passes this worker a MessagePort to it; ?native=1 says one is coming.
// Until the native kernel turns out missing or broken, the 14 MB wasm is not
// even downloaded. The website never sets native=1 and is unchanged.
const NATIVE_EXPECTED = PARAMS.get("native") === "1";
let nativePort = null;
let nativeDown = !NATIVE_EXPECTED;   // nothing coming, or the host went away
let nativeWaiters = [];
let nativeSeq = 0;
const nativePending = new Map();
function nativeSettle(port) {
  const w = nativeWaiters;
  nativeWaiters = [];
  for (const r of w) r(port);
}
function setNativePort(port) {
  try { nativePort?.close(); } catch { /* gone */ }
  nativePort = port;
  nativeDown = false;
  port.onmessage = ({ data }) => {
    const p = nativePending.get(data?.id);
    if (!p) return;
    // a long build's partial model, on its way (not the reply)
    if (data.progress) { p.onProgress?.(data); return; }
    nativePending.delete(data.id);
    if (data.ok) p.resolve(data);
    // fromHost: the kernel answered "no" (or panicked and caught it); the
    // host itself is fine. An error without it means the host went away.
    else p.reject(Object.assign(new Error(data.error || "native kernel failed"), { refusal: !!data.refusal, fromHost: true, lane: data.lane }));
  };
  nativeSettle(port);
}
function dropNative(reason) {
  const err = new Error(reason || "the native kernel went away");
  for (const [, p] of nativePending) p.reject(err);
  nativePending.clear();
  try { nativePort?.close(); } catch { /* gone */ }
  nativePort = null;
  nativeDown = true;
  nativeSettle(null);
  console.warn("[kw] native kernel unavailable, using the wasm kernel:", err.message);
  if (PARAMS.get("engine") !== "js") loadRust().catch(() => { /* recorded in rustFailure */ });
}
// The port, once the page has handed it over (a moment after start-up), or
// null when there is none and the wasm kernel builds.
function nativeKernel() {
  if (nativePort || nativeDown) return Promise.resolve(nativePort);
  return new Promise((resolve) => {
    nativeWaiters.push(resolve);
    setTimeout(() => { if (!nativePort && !nativeDown) dropNative("the native kernel didn't connect in time"); }, 5000);
  });
}
function nativeCall(msg, transfer = [], onProgress = null) {
  const id = ++nativeSeq;
  return new Promise((resolve, reject) => {
    nativePending.set(id, { resolve, reject, onProgress });
    try { nativePort.postMessage({ ...msg, id }, transfer); }
    catch (e) { nativePending.delete(id); reject(e); }
  });
}

// Start the download now, while the page is still booting, unless the page
// asked for the JS kernel only or the native kernel is coming.
if (PARAMS.get("engine") !== "js" && !NATIVE_EXPECTED) loadRust().catch(() => { /* recorded in rustFailure */ });
// and SMLib's, when the kernel picker says so (the Rust one is its fallback)
if (PARAMS.get("engine") !== "js" && !NATIVE_EXPECTED && PARAMS.get("kernel") === "nvidia") loadSmlib().catch(() => { /* recorded in smlibFailure */ });
let manifoldWasm = null;
function loadManifold() {
  manifoldWasm ??= (async () => {
    const Module = (await import("/node_modules/manifold-3d/manifold.js")).default;
    const wasm = await Module();
    wasm.setup();
    return wasm;
  })();
  return manifoldWasm;
}

// Split-engine solids -> the same {name, faces} records extractSolids() sends.
// Copies, because a transferred buffer is gone from this side and the engine
// result stays here for STL export.
function splitPayload(out) {
  const transfer = [];
  const own = (a) => { if (!a) return null; const c = a.slice(); transfer.push(c.buffer); return c; };
  const payload = out.solids.map((s) => ({
    name: s.name, exact: s.exact,
    faces: s.faces.map((f) => ({
      name: f.name, positions: own(f.positions), itemSize: 3,
      normals: own(f.normals), normalSize: 3, index: own(f.index), matrix: null,
    })),
  }));
  return { payload, transfer };
}

// Imported solids can't be cloned (MeshToBrep's ctor throws without a
// geometry), which silently no-ops booleans that use an import as the TOOL.
// Same masquerade patch dsl.js installs on the page — but this worker has its
// own module instances, so it needs its own copy. See FOR-BREP-DEVS.md #4.
const TETRA_STL = [
  "solid t",
  "facet normal 0 0 0", "outer loop", "vertex 0 0 0", "vertex 1 0 0", "vertex 0 1 0", "endloop", "endfacet",
  "facet normal 0 0 0", "outer loop", "vertex 0 0 0", "vertex 0 1 0", "vertex 0 0 1", "endloop", "endfacet",
  "facet normal 0 0 0", "outer loop", "vertex 0 0 0", "vertex 0 0 1", "vertex 1 0 0", "endloop", "endfacet",
  "facet normal 0 0 0", "outer loop", "vertex 1 0 0", "vertex 0 0 1", "vertex 0 1 0", "endloop", "endfacet",
  "endsolid t",
].join("\n");

let clonePatchState = null;
async function ensureImportClonePatch() {
  if (clonePatchState === true || clonePatchState === false) return clonePatchState;
  if (clonePatchState) return clonePatchState;
  clonePatchState = (async () => {
    try {
      const scratch = new PartHistory();
      const f = await scratch.newFeature("IMPORT3D");
      f.inputParams.fileToImport = TETRA_STL;
      f.inputParams.centerMesh = false;
      await scratch.runHistory({ throwOnFeatureError: true });
      const solid = scratch.scene?.children?.find((o) => o.type === "SOLID");
      if (!solid) return false;
      const MeshToBrep = solid.constructor;
      const BaseSolid = Object.getPrototypeOf(MeshToBrep.prototype)?.constructor;
      if (!BaseSolid || MeshToBrep === BaseSolid || MeshToBrep.__brepscriptCloneSafe) return true;
      const origClone = MeshToBrep.prototype.clone;
      MeshToBrep.prototype.clone = function patchedClone() {
        const realCtor = this.constructor;
        try {
          Object.defineProperty(this, "constructor", { value: BaseSolid, configurable: true, writable: true });
          return origClone.apply(this, arguments);
        } finally {
          try { Object.defineProperty(this, "constructor", { value: realCtor, configurable: true, writable: true }); }
          catch (_) { /* leave masqueraded ctor — still a valid Solid */ }
        }
      };
      MeshToBrep.__brepscriptCloneSafe = true;
      return true;
    } catch (_) {
      return false;
    }
  })();
  clonePatchState = await clonePatchState;
  return clonePatchState;
}

// One build lives at a time, per KEY ("model" for the main build, "cutters"
// for the negatives overlay) — the newest replaces the old, so worker memory
// stays bounded at roughly one scene.
const builds = new Map();

function extractSolids(ph) {
  const solids = (ph.scene?.children || []).filter(
    (o) => o && o.type === "SOLID" && typeof o.toSTL === "function");
  const out = [], transfer = [];
  for (const s of solids) {
    s.updateWorldMatrix?.(true, true);
    const faces = [];
    s.traverse?.((o) => {
      const pa = o?.geometry?.attributes?.position;
      if (o.type !== "FACE" || !o.isMesh || !pa) return;
      // raw buffers + the world matrix: the page applies it exactly the way
      // its old adoptSolid() did, normals included
      const nrm = o.geometry.attributes.normal;
      const idx = o.geometry.index;
      const positions = Float32Array.from(pa.array);
      const normals = nrm ? Float32Array.from(nrm.array) : null;
      const index = idx ? Uint32Array.from(idx.array) : null;
      transfer.push(positions.buffer);
      if (normals) transfer.push(normals.buffer);
      if (index) transfer.push(index.buffer);
      faces.push({
        name: typeof o.name === "string" ? o.name : "",
        positions, itemSize: pa.itemSize,
        normals, normalSize: nrm?.itemSize ?? 3,
        index,
        matrix: o.matrixWorld?.elements ? Array.from(o.matrixWorld.elements) : null,
      });
    });
    out.push({ name: typeof s.name === "string" ? s.name : "", faces });
  }
  return { solids, payload: out, transfer };
}

// The kernel's STEP writer, located the same way viewer/exporters.js locates it
// on the page: it's compiled into the bundle but not re-exported from the public
// entry, and we don't modify kernel files. Duplicated here rather than shared
// because the solids live in this thread now — exporting from the page would
// mean shipping every face back just to write a file.
//
// NB build-site.mjs rewrites the /node_modules prefix below.
let kernelStep = null;
async function loadGenerateSTEP() {
  if (kernelStep) return kernelStep;
  const mainUrl = "/node_modules/brep-io-kernel/dist-kernel/brep-kernel.js";
  const mainSrc = await (await fetch(mainUrl)).text();
  const chunkName = mainSrc.match(/\.\/(PartHistory-[\w-]+\.js)/)?.[1];
  if (!chunkName) throw new Error("Couldn't locate the kernel's exporter chunk.");
  const chunk = await import(`/node_modules/brep-io-kernel/dist-kernel/${chunkName}`);
  for (const v of Object.values(chunk)) {
    if (typeof v !== "function") continue;
    if (v.name === "generateSTEP" || String(v).includes("ISO-10303")) {
      kernelStep = v;
      return v;
    }
  }
  throw new Error("STEP exporter not found in this kernel version.");
}

// ?debug=1 on the worker's own URL (set by the page) turns on the narration. A
// build that never returns leaves no stack behind — the running commentary is
// the only way to see which stage it stopped at.
const DEBUG = /(^|[?&])debug=1/.test(self.location?.search || "");
const trace = (s) => { if (DEBUG) console.log(`[kw] ${s}`); };
trace(`module evaluated, kernel present: ${typeof PartHistory}`);

// Announce readiness rather than letting the page post blind. A message sent in
// the same tick as `new Worker(...)` can be dropped on the floor — no error, no
// reply, a build that simply never comes back — so the page holds everything
// until this arrives. Sent last, once the handler below is really installed.
self.onmessage = async ({ data, ports }) => {
  const { id, op } = data || {};
  trace(`message: ${op} #${id}`);
  try {
    if (op === "build") {
      trace("build start");
      const key = data.key || "model";
      const engine = data.engine || "auto";
      let fallback = null;
      let fallbackKind = null;
      const postSplit = (out) => {
        builds.set(key, { split: out, json: data.json, solids: out.solids });
        const { payload, transfer } = splitPayload(out);
        self.postMessage({
          id, ok: true, solids: payload, engine: out.lane, stats: out.stats,
          incremental: false, rebuilt: out.stats.exactFeatures + out.stats.meshFeatures,
          total: out.stats.exactFeatures + out.stats.meshFeatures, reason: "",
        }, transfer);
      };
      // Desktop: the native kernel first. Its refusal is the same kernel's
      // refusal, so that goes straight to the JS kernel; anything else (the
      // host crashed or was killed) leaves this build to the wasm kernel.
      let nativeRefused = false;
      if (engine !== "js" && await nativeKernel()) {
        try {
          // the partial model goes to the page as it grows ({ progressOf },
          // never { id }: that would settle the build early)
          const r = await nativeCall({ op: "build", json: data.json, kernel: data.kernel, progress: !!data.progress }, [],
            (u) => {
              const transfer = u.set.flatMap((s) => [s.positions.buffer, s.indices.buffer]);
              self.postMessage({ progressOf: id, set: u.set, remove: u.remove, done: u.done, total: u.total }, transfer);
            });
          trace(`native engine: ${r.lane} (${r.stats.exactMs} ms exact, ${r.stats.meshMs} ms mesh)`);
          postSplit({ lane: r.lane, solids: r.solids, stats: r.stats });
          return;
        } catch (e) {
          if (e.refusal) {
            if (engine === "split") throw e;
            nativeRefused = true;
            fallback = String(e.message || e).slice(0, 300);
            fallbackKind = "refused";
            trace(`native engine refused: ${fallback}`);
          } else if (!e.fromHost && nativePort) {
            dropNative(`native build failed: ${e.message || e}`);
          }
          // else: the kernel errored rather than refused; the wasm lane below
          // gets its own try, as it did before there was a native one
        }
      }
      // The website (or a desktop whose native kernel went away): "nvidia"
      // is SMLib's WebAssembly build, then the Rust kernel for what it
      // refuses. auto doesn't wait for its download (the Rust kernel builds
      // meanwhile and the page rebuilds when it lands); split does.
      let smlibNote = null;
      if (!nativeRefused && engine !== "js" && data.kernel === "nvidia" && !nativePort) {
        if (engine === "auto" && !smlibKernel && !smlibFailure) {
          loadSmlib(data.smlibWasmUrl).catch(() => {});
          smlibNote = { smlibLoading: true };
        } else if (smlibFailure) {
          smlibNote = { nvidiaRefused: `the SMLib kernel didn't load: ${smlibFailure.message}`.slice(0, 300), smlibUnavailable: true };
        } else {
          try {
            const out = await runSmlib(data.json, data.smlibWasmUrl);
            trace(`SMLib engine: ${out.lane} (${out.stats.exactMs} ms exact, ${out.stats.meshMs} ms mesh)`);
            postSplit(out);
            return;
          } catch (e) {
            if (!(e instanceof EngineRefusal) && e !== smlibFailure) console.warn("[kw] SMLib kernel failed, using the Rust kernel:", e);
            smlibNote = { nvidiaRefused: String(e?.message || e).slice(0, 300), smlibUnavailable: e === smlibFailure || undefined };
            trace(`SMLib engine refused: ${smlibNote.nvidiaRefused}`);
          }
        }
      }
      // auto never waits for the kernel download: until it lands, the JS
      // kernel builds (and the badge says so). split waits, by definition.
      const rustPending = engine === "auto" && !rustModule && !rustFailure;
      if (nativeRefused) {
        // decided above: the JS kernel below builds it
      } else if (engine !== "js" && rustPending) {
        loadRust(data.rustWasmUrl).catch(() => {});
        fallback = "the Rust kernel is still downloading";
        fallbackKind = "loading";
      } else if (engine !== "js") {
        try {
          const rust = await loadRust(data.rustWasmUrl);
          const out = await runEngine(data.json, { rust, manifold: loadManifold });
          trace(`split engine: ${out.lane} (${out.stats.exactMs} ms exact, ${out.stats.meshMs} ms mesh)`);
          if (smlibNote) out.stats = { ...out.stats, ...smlibNote };
          postSplit(out);
          return;
        } catch (e) {
          // A refusal is the engine saying "not this model"; the JS kernel
          // below gets it. Anything else (a wasm that failed to load) is
          // also worth a JS attempt in auto mode, but is reported.
          if (engine === "split") throw e;
          fallback = String(e?.message || e).slice(0, 300);
          fallbackKind = e === rustFailure ? "unavailable" : "refused";
          if (!(e instanceof EngineRefusal)) console.warn("[kw] split engine unavailable, using the JS kernel:", e);
          trace(`split engine refused: ${fallback}`);
        }
      }
      // REBUILD ONLY WHAT CHANGED. The history from the last build is already
      // here — it has to be, so exports can be written without rebuilding — and
      // the kernel tracks per-feature dirtiness. Handing the new history to
      // adoptHistory() reuses that instance when the structure is identical and
      // starts fresh when it is not. See src/rehistory.js for what "identical"
      // has to mean; test/incremental.js compares the STL of both paths.
      const prev = builds.get(key);
      const stampsBefore = featureTimestamps(prev?.ph);
      const r = await adoptHistory({
        prev: prev?.ph, prevPlan: prev?.plan, json: data.json, PartHistory,
      });
      const ph = r.ph;
      trace(r.incremental
        ? `adopted: ${r.changed}/${r.total} features changed`
        : `full rebuild (${r.plan.reason})`);
      if ((ph.features || []).some((f) => f?.type === "IMPORT3D")) await ensureImportClonePatch();
      trace("patch done");
      try {
        await ph.runHistory({ throwOnFeatureError: true });
      } catch (e) {
        // A history that threw mid-run is in an unknown state, and reusing it
        // would carry that state into the next build. Drop it so the next
        // attempt starts clean — the error still goes back to the page as the
        // model's own build error, exactly as before.
        builds.delete(key);
        throw e;
      }
      trace("runHistory done");
      const { solids, payload, transfer } = extractSolids(ph);
      trace(`extract done: ${payload.length} solids`);
      builds.set(key, { ph, solids, plan: r.plan });
      // What the KERNEL re-ran, not what the script edited. See countRebuilt().
      const rebuilt = r.incremental
        ? countRebuilt(stampsBefore, featureTimestamps(ph))
        : (ph.features || []).length;
      self.postMessage({
        id, ok: true, solids: payload,
        incremental: r.incremental, rebuilt, total: (ph.features || []).length,
        reason: r.plan?.reason || "", engine: "js", fallback, fallbackKind,
      }, transfer);
      return;
    }
    if (op === "stl") {
      const b = builds.get(data.key || "model");
      if (!b || !b.solids.length) throw new Error("no build to export — build the model first");
      const tol = data.tolerance ?? 6;
      if (b.split) {
        self.postMessage({ id, ok: true, text: solidsToSTL(b.split.solids, tol) });
        return;
      }
      // Same solid naming the page used when it held the solids itself, so the
      // downstream OBJ/3MF converters see exactly the text they always saw.
      const text = b.solids.map((s, i) => s.toSTL(s.name || `solid_${i}`, tol)).join("\n");
      self.postMessage({ id, ok: true, text });
      return;
    }
    if (op === "step") {
      const b = builds.get(data.key || "model");
      if (!b || !b.solids.length) throw new Error("no build to export — build the model first");
      if (b.split) {
        // The Rust kernel can write exact STEP, but only from full solid JSON,
        // and a history build hands back handles (see BREPcodeRustKernel's
        // recommendations). Until it can, STEP comes from the JS kernel, built
        // once on demand from the same history.
        if (!b.ph) {
          const ph = new PartHistory();
          await ph.fromJSON(b.json);
          if ((ph.features || []).some((f) => f?.type === "IMPORT3D")) await ensureImportClonePatch();
          await ph.runHistory({ throwOnFeatureError: true });
          b.ph = ph;
          b.jsSolids = (ph.scene?.children || []).filter((o) => o && o.type === "SOLID" && typeof o.toSTL === "function");
        }
      }
      const stepSolids = b.split ? b.jsSolids : b.solids;
      const generateSTEP = await loadGenerateSTEP();
      const res = generateSTEP(stepSolids, {
        name: data.name || "model", precision: 6, applyWorldTransform: true,
      });
      if (!res?.data) throw new Error("STEP exporter returned no data.");
      self.postMessage({ id, ok: true, text: res.data });
      return;
    }
    if (op === "stl2step") {
      // STL -> exact solid (the drop menu's "Open as an exact solid"): the
      // upstream stl2step reconstruction, built into the same wasm as the
      // kernel. Returns the STEP text plus what it recognised, so the page can
      // say "33 faces: 25 planes, 8 cylinders" before you keep it.
      const t0 = performance.now();
      let text = null;
      if (await nativeKernel()) {
        try { text = (await nativeCall({ op: "stl2step", stl: data.stl, options: data.options, name: data.name || "part" })).json; }
        catch (e) { if (e.fromHost) throw e; dropNative(`native stl2step failed: ${e.message || e}`); }
      }
      if (text == null) {
        const rust = await loadRust(data.rustWasmUrl);
        if (typeof rust.stl_to_step_json !== "function") throw new Error("this kernel build has no STL reconstruction (rebuild vendor/brep-kernel-rust from BREPcodeRustKernel/brepcode-kernel)");
        const bytes = typeof data.stl === "string" ? new TextEncoder().encode(data.stl) : new Uint8Array(data.stl);
        text = rust.stl_to_step_json(bytes, data.options ? JSON.stringify(data.options) : "", data.name || "part");
      }
      const out = JSON.parse(text);
      const ms = Math.round(performance.now() - t0);
      const count = (re) => (out.step.match(re) || []).length;
      const faces = count(/ADVANCED_FACE\(/g);
      const planes = count(/=\s*PLANE\(/g), cylinders = count(/CYLINDRICAL_SURFACE\(/g),
        cones = count(/CONICAL_SURFACE\(/g), spheres = count(/SPHERICAL_SURFACE\(/g), tori = count(/TOROIDAL_SURFACE\(/g);
      self.postMessage({
        id, ok: true, step: out.step, ms, sourceTriangles: out.sourceTriangles,
        backend: out.report?.backend || "", solids: count(/MANIFOLD_SOLID_BREP\(/g),
        faces, planes, cylinders, cones, spheres, tori,
      });
      return;
    }
    if (op === "ping") { self.postMessage({ id, ok: true }); return; }
    // from the page, no reply: the desktop's native kernel arriving or going
    if (op === "nativePort") { if (ports?.[0]) setNativePort(ports[0]); return; }
    if (op === "nativeDown") { if (NATIVE_EXPECTED) dropNative(data.reason); return; }
    throw new Error(`unknown op "${op}"`);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e || "worker error").slice(0, 400) });
  }
};

trace("ready");
self.postMessage({ ready: true });
