// The coarse-to-fine smooth surface (src/adaptsmooth.js) off the main thread.
// Unlike smooth-worker.js (one message in, one STEP out) this one KEEPS the
// model between messages, so the page can preview the coarse surface at
// once, show what each detail setting would cost, refine (pass by pass, each
// pass previewed), and refine again at another setting without laying the
// surface out again.
//
//   page -> { id, op: "begin", verts, quads, stl, name, stops }   stops: tolerances, % of the part's size
//   worker -> { id, ok, coverage: { p95, mean, diag }, estimates: [...], preview }
//   page -> { id, op: "refine", tolPct }
//   worker -> { id, pass: {...}, preview }  (each pass)  then { id, ok, summary }
//   page -> { id, op: "write" }
//   worker -> { id, ok, result: { step, mesh, faces, dev, ... } }
//
// preview = { positions: Float32Array, level: Uint8Array per triangle }:
// level is the face's span level (0 = left as the coarse patch), so the page
// can tint where the work went.
import { weldSTL } from "./cage-worker.js";
import { coarseModel, prepare, estimate, adapt, modelToStep, modelToTriangles, summary } from "../src/adaptsmooth.js";
import { surfaceDeviation } from "./cagedev.js";

let base = null;       // { verts, quads, mesh, name }: enough to start over
let model = null, refinedTo = Infinity;

const preview = (segs = 2) => {
  const { tris, level } = modelToTriangles(model, segs);
  const positions = Float32Array.from(tris);
  return { positions, level };
};
const fresh = () => { model = coarseModel(base.verts, base.quads, base.mesh); prepare(model); refinedTo = Infinity; };

function stlText(tris, name) {
  const out = [`solid ${name}`];
  const r = (x) => +x.toFixed(5);
  for (let t = 0; t < tris.length; t += 9) {
    out.push(" facet normal 0 0 0", "  outer loop");
    for (let k = 0; k < 9; k += 3) out.push(`   vertex ${r(tris[t + k])} ${r(tris[t + k + 1])} ${r(tris[t + k + 2])}`);
    out.push("  endloop", " endfacet");
  }
  out.push(`endsolid ${name}`);
  return out.join("\n");
}

self.onmessage = ({ data }) => {
  const { id, op } = data;
  const reply = (msg, transfer = []) => self.postMessage({ id, ...msg }, transfer);
  try {
    if (op === "begin") {
      const mesh = weldSTL(data.stl);
      base = { verts: data.verts, quads: data.quads, mesh, name: data.name };
      fresh();
      const p = preview();
      const coverage = surfaceDeviation(Array.from(mesh.verts), p.positions);
      const estimates = estimate(model, (data.stops || []).map((pct) => model.diag * pct / 100), { maxLevel: 3 })
        .map((e, i) => ({ tolPct: data.stops[i], ms: e.ms, refined: e.refined, faces: model.faces.length + model.fills.length }));
      reply({ ok: true, coverage, estimates, faces: model.faces.length + model.fills.length, preview: p }, [p.positions.buffer, p.level.buffer]);
    } else if (op === "refine") {
      const tol = model.diag * data.tolPct / 100;
      // tighter than before: carry on from here; looser: start over from the coarse surface
      if (tol > refinedTo) fresh();
      const r = adapt(model, {
        tol, maxLevel: 3,
        onPass: (pass) => { const p = preview(); reply({ pass, preview: p }, [p.positions.buffer, p.level.buffer]); },
      });
      refinedTo = tol;
      reply({ ok: true, summary: { ms: r.ms, passes: r.passes, ...summary(model) } });
    } else if (op === "write") {
      const { step, faces } = modelToStep(model, base.name);
      const { tris } = modelToTriangles(model, 3);
      const dev = surfaceDeviation(Array.from(base.mesh.verts), tris);
      // the JS kernel's stand-in mesh: coarser, it only shows while Rust loads
      const mesh = stlText(modelToTriangles(model, 2).tris, base.name);
      reply({ ok: true, result: { step, mesh, faces, dev, ...summary(model) } });
    } else throw new Error(`unknown op ${op}`);
  } catch (e) {
    reply({ ok: false, error: String(e?.message || e) });
  }
};
