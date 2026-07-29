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
      const ph = new PartHistory();
      await ph.fromJSON(data.json);
      trace("fromJSON done");
      if ((ph.features || []).some((f) => f?.type === "IMPORT3D")) await ensureImportClonePatch();
      trace("patch done");
      await ph.runHistory({ throwOnFeatureError: true });
      trace("runHistory done");
      const { solids, payload, transfer } = extractSolids(ph);
      trace(`extract done: ${payload.length} solids`);
      builds.set(data.key || "model", { ph, solids });
      self.postMessage({ id, ok: true, solids: payload }, transfer);
      return;
    }
    if (op === "stl") {
      const b = builds.get(data.key || "model");
      if (!b || !b.solids.length) throw new Error("no build to export — build the model first");
      const tol = data.tolerance ?? 6;
      // Same solid naming the page used when it held the solids itself, so the
      // downstream OBJ/3MF converters see exactly the text they always saw.
      const text = b.solids.map((s, i) => s.toSTL(s.name || `solid_${i}`, tol)).join("\n");
      self.postMessage({ id, ok: true, text });
      return;
    }
    if (op === "step") {
      const b = builds.get(data.key || "model");
      if (!b || !b.solids.length) throw new Error("no build to export — build the model first");
      const generateSTEP = await loadGenerateSTEP();
      const res = generateSTEP(b.solids, {
        name: data.name || "model", precision: 6, applyWorldTransform: true,
      });
      if (!res?.data) throw new Error("STEP exporter returned no data.");
      self.postMessage({ id, ok: true, text: res.data });
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
