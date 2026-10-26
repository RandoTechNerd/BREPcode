// Exact STEP out of a Node build (the CLI and bench/cadgen).
//
// The Rust kernel writes AP242 itself: true planes, cylinders, cones, tori and
// B-spline faces, straight from the resident solid. The viewer's OpenCASCADE
// path (viewer/curved.js) needs a browser; this one needs nothing but the wasm
// the build already loaded. NVIDIA's addon has no STEP writer, and a mesh-lane
// or JS-kernel build has no exact solid to write, so both are refused rather
// than quietly faceted.

import { loadRustKernel } from "./engine-node.js";
import { stepFromHandles } from "./stepwrite.js";

export class StepRefusal extends Error {
  constructor(message) { super(message); this.name = "StepRefusal"; }
}

// result: what build() returned. Several solids are unioned into one first
// (a STEP with two touching bodies is two parts, not one).
export async function exactSTEP(result, name = "part", { unit = "mm", timestamp = new Date().toISOString() } = {}) {
  if (result.kernel !== "rust") {
    const why = result.kernel === "nvidia" ? "the NVIDIA kernel has no STEP writer" : `the model fell back to the JS kernel (${result.fallback || "refused"})`;
    throw new StepRefusal(`no exact solid to write: ${why}`);
  }
  if (result.engine !== "exact" || result.solids.some((s) => !s.exact || s.handle == null)) {
    throw new StepRefusal("the model went to the mesh lane (a mesh verb or an import): its STEP would be facets, not exact faces");
  }
  const rk = await loadRustKernel();
  return stepFromHandles(rk, result.solids.map((r) => r.handle), name, { unit, timestamp });
}
