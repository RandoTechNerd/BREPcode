// The smooth-surface writer (src/smoothstep.js) off the main thread: fitting,
// fold and edge-projection checks take a few seconds on a 2,500-quad cage
// (4 s on a 20k Benchy), which would freeze the page.
//
//   page -> { verts, quads, name }   (typed arrays, transferred)
//   worker -> { ok: true, result } or { ok: false, error }
import { cageToStep } from "../src/smoothstep.js";

self.onmessage = ({ data }) => {
  try {
    const result = cageToStep(data.verts, data.quads, { name: data.name, mesh: true });
    self.postMessage({ ok: true, result });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e?.message || e) });
  }
};
