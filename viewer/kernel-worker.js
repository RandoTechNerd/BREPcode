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
let rustKernel = null;
async function loadRust(wasmUrl) {
  rustKernel ??= (async () => {
    const mod = await import("/vendor/brep-kernel-rust/brep_kernel.js");
    await mod.default({ module_or_path: wasmUrl || new URL("/vendor/brep-kernel-rust/brep_kernel_bg.wasm", self.location.href) });
    return mod;
  })();
  try { return await rustKernel; }
  catch (e) { rustKernel = null; throw e; }
}
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
self.onmessage = async ({ data }) => {
  const { id, op } = data || {};
  trace(`message: ${op} #${id}`);
  try {
    if (op === "build") {
      trace("build start");
      const key = data.key || "model";
      const engine = data.engine || "auto";
      let fallback = null;
      if (engine !== "js") {
        try {
          const rust = await loadRust(data.rustWasmUrl);
          const out = await runEngine(data.json, { rust, manifold: loadManifold });
          trace(`split engine: ${out.lane} (${out.stats.exactMs} ms exact, ${out.stats.meshMs} ms mesh)`);
          builds.set(key, { split: out, json: data.json, solids: out.solids });
          const { payload, transfer } = splitPayload(out);
          self.postMessage({
            id, ok: true, solids: payload, engine: out.lane, stats: out.stats,
            incremental: false, rebuilt: out.stats.exactFeatures + out.stats.meshFeatures,
            total: out.stats.exactFeatures + out.stats.meshFeatures, reason: "",
          }, transfer);
          return;
        } catch (e) {
          // A refusal is the engine saying "not this model"; the JS kernel
          // below gets it. Anything else (a wasm that failed to load) is
          // also worth a JS attempt in auto mode, but is reported.
          if (engine === "split") throw e;
          fallback = String(e?.message || e).slice(0, 300);
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
        reason: r.plan?.reason || "", engine: "js", fallback,
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
      const rust = await loadRust(data.rustWasmUrl);
      if (typeof rust.stl_to_step_json !== "function") throw new Error("this kernel build has no STL reconstruction (rebuild vendor/brep-kernel-rust from BREPcodeRustKernel/brepcode-kernel)");
      const t0 = performance.now();
      const bytes = typeof data.stl === "string" ? new TextEncoder().encode(data.stl) : new Uint8Array(data.stl);
      const out = JSON.parse(rust.stl_to_step_json(bytes, data.options ? JSON.stringify(data.options) : "", data.name || "part"));
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
    throw new Error(`unknown op "${op}"`);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e || "worker error").slice(0, 400) });
  }
};

trace("ready");
self.postMessage({ ready: true });
