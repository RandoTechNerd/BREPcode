// The smooth-surface writer (src/smoothstep.js) off the main thread: fitting,
// fold and edge-projection checks take a few seconds on a 2,500-quad cage
// (4 s on a 20k Benchy), which would freeze the page.
//
// Given the source mesh too, it measures how far the finished surface strays
// from it (viewer/cagedev.js), which is what decides whether a small cage is
// good enough (index.html, convertImportToSmooth).
//
//   page -> { verts, quads, name, stl? }   (typed arrays, transferred)
//   worker -> { ok: true, result } or { ok: false, error }
//   result.dev = { mean, p95, max, diag } when stl was given
import { cageToStep } from "../src/smoothstep.js";
import { surfaceDeviation } from "./cagedev.js";

const floats = (text) => {
  const out = [];
  for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) out.push(+m[1], +m[2], +m[3]);
  return out;
};

self.onmessage = ({ data }) => {
  try {
    const result = cageToStep(data.verts, data.quads, { name: data.name, mesh: true });
    if (typeof data.stl === "string") result.dev = surfaceDeviation(floats(data.stl), floats(result.mesh));
    self.postMessage({ ok: true, result });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e?.message || e) });
  }
};
