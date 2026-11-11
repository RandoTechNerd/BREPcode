// The native Rust kernel (rust/brepcode-native, built to
// vendor/brep-kernel-native/brepcode_native.node) dressed as the wasm module,
// so src/engine.js runs on it unchanged: same function names, and
// tessellate_handle() returns an object with the wasm build's take_*() methods.
//
// load() returns null when the addon is missing or won't load (wrong arch, a
// build without it); the caller then stays on the wasm kernel.

const path = require("node:path");

const CANDIDATES = [
  // a candidate build for the tests and bench/kernel-bench.mjs
  process.env.BREPCODE_NATIVE_KERNEL && path.resolve(process.env.BREPCODE_NATIVE_KERNEL),
  path.join(__dirname, "..", "vendor", "brep-kernel-native", "brepcode_native.node"),
  // electron-builder asarUnpack puts it here; Electron also redirects the
  // path above, this is the belt to that brace
  process.resourcesPath && path.join(process.resourcesPath, "app.asar.unpacked", "vendor", "brep-kernel-native", "brepcode_native.node"),
].filter(Boolean);

let cached;
function load() {
  if (cached !== undefined) return cached;
  cached = null;
  let lastError = null;
  for (const file of CANDIDATES) {
    try {
      cached = wrap(require(file));
      cached.file = file;
      break;
    } catch (e) { lastError = e; }
  }
  if (!cached) load.error = lastError ? String(lastError.message || lastError) : "not found";
  return cached;
}

// FAST TRIMS on an imported STEP. Before a boolean, the kernel re-fits every
// trim curve of both operands that lies on a free-form surface, and again on
// the result. On a real part that is nearly all of the time: a 395-face
// bracket with 70 spline faces took 123 s for its first boolean (51 s + 61 s
// in those two passes) and 8 s without them, for the same faces. The passes
// polish trims the file itself wrote; the part on screen already has them as
// they are. The kernel reads these two switches from the environment on every
// call, so they are set for a history that carries a STEP and cleared after.
const FAST_TRIMS = { BREP_DEBUG_TRIM_REFIT_OFF: "1", BREP_INHERITED_TRIM_REFIT: "0" };
function withFastTrims(json, run) {
  if (process.env.BREPCODE_STEP_TRIMS === "full" || !json.includes('"stepText"')) return run();
  const before = {};
  for (const k of Object.keys(FAST_TRIMS)) { before[k] = process.env[k]; process.env[k] = FAST_TRIMS[k]; }
  try { return run(); }
  finally { for (const k of Object.keys(FAST_TRIMS)) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; } }
}

function wrap(n) {
  return {
    native: true,
    info: n.nativeInfo(),
    execute_history_json: (json) => withFastTrims(json, () => n.executeHistoryJson(json)),
    tessellate_handle(handle, tol) {
      const m = n.tessellateHandle(handle, tol);
      return {
        take_positions: () => m.positions,
        take_normals: () => m.normals,
        take_indices: () => m.indices,
        take_face_ids: () => m.faceIds,
      };
    },
    face_names_handle: (handle) => n.faceNamesHandle(handle),
    // a solid's topology and names, in the wasm kernel's own shape (engine.js
    // solidEdges reads edges out of it); absent from an addon built before it
    ...(typeof n.solidHandleToBuffer === "function" ? {
      solid_handle_to_buffer(handle) {
        const b = n.solidHandleToBuffer(handle);
        return { names_json: () => b.namesJson, take_data: () => b.data };
      },
    } : {}),
    free_solid: (handle) => n.freeSolid(handle),
    registered_solid_count: () => n.registeredSolidCount(),
    clear_history_cache_json: () => n.clearHistoryCache(),
    stl_to_step_json: (bytes, options, name) => n.stlToStepJson(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), options || "", name || ""),
  };
}

module.exports = { load };
