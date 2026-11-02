// The coarse-to-fine smooth surface (src/adaptsmooth.js) off the main thread.
// Unlike smooth-worker.js (one message in, one STEP out) this one KEEPS the
// model between messages, so the page can preview the coarse surface at
// once, show what each detail setting would cost, refine (pass by pass, each
// pass previewed), and refine again at another setting without laying the
// surface out again.
//
//   page -> { id, op: "segment", stl, rustWasmUrl }   (optional, early: the shape recognition, while the layout runs elsewhere)
//   worker -> { id, ok, ms }
//   page -> { id, op: "begin", verts, quads, stl, name, stops, hybrid, rustWasmUrl }   stops: tolerances, % of the part's size
//   worker -> { id, ok, coverage: { p95, mean, diag }, estimates: [...], preview }
//   page -> { id, op: "refine", tolPct }
//   worker -> { id, pass: {...}, preview }  (each pass)  then { id, ok, summary }
//   page -> { id, op: "write" }
//   worker -> { id, ok, result: { step, mesh, faces, dev, ... } }
//
// preview = { positions: Float32Array, level: Uint8Array per triangle }:
// level is the face's span level (0 = left as the coarse patch), 8 a face on
// a true plane, 9 on a true cylinder, cone or sphere, so the page can tint
// where the work went.
import { weldSTL } from "./cage-worker.js";
import { coarseModel, prepare, estimate, adapt, modelToStep, modelToTriangles, summary, snapToCarriers } from "../src/adaptsmooth.js";
import { surfaceDeviation } from "./cagedev.js";

let base = null;       // { verts, quads, mesh, name, regionOf }: enough to start over
let model = null, refinedTo = Infinity, snapped = null;

// The hybrid (begin with hybrid: true): next.BREP.io's kernel segmentation,
// called unchanged in our Rust wasm, says which regions of the mesh are
// planes, cylinders, cones and spheres; those faces of ours go exactly onto
// them and are written as true PLANE, CYLINDRICAL, CONICAL and SPHERICAL faces (adaptsmooth.js
// snapToCarriers). The 13 MB kernel comes from the HTTP cache the build
// worker already filled.
let rustP = null;
const loadRust = (url) => (rustP ??= (async () => {
  const mod = await import("/vendor/brep-kernel-rust/brep_kernel.js");
  await mod.default({ module_or_path: url || new URL("/vendor/brep-kernel-rust/brep_kernel_bg.wasm", self.location.href) });
  return mod;
})());
const MIN_REGION_TRIANGLES = 8;       // smaller regions are noise (a Benchy has ~100 "spheres" of 1-7 triangles)
async function segment(mesh, url) {
  const rust = await loadRust(url);
  if (typeof rust.segment_mesh_faces_json !== "function") return null;
  const seg = JSON.parse(rust.segment_mesh_faces_json(JSON.stringify({ positions: Array.from(mesh.verts), indices: Array.from(mesh.tris), options: {} })));
  const arr = (v) => (v && typeof v === "object" && "x" in v ? [v.x, v.y, v.z] : v);     // its Vec3s are { x, y, z }
  for (const r of seg.regions) for (const k of Object.keys(r.carrier)) r.carrier[k] = arr(r.carrier[k]);
  return (t) => {
    const r = seg.regions[seg.triangle_region_ids[t]];
    return r && r.carrier.type !== "Freeform" && r.triangle_count >= MIN_REGION_TRIANGLES ? r : null;
  };
}

// one recognition per mesh: begin runs again for each layout tried, and on
// a 92k-triangle mesh the recognition alone is ~13 s
let segFor = null;     // { stl, mesh, p: Promise<{ regionOf, ms, error }> }
function segmentOnce(stl, url) {
  if (segFor?.stl === stl) return segFor;
  const mesh = weldSTL(stl);
  const t0 = performance.now();
  const p = segment(mesh, url).then((regionOf) => ({ regionOf, ms: Math.round(performance.now() - t0), error: null }),
    (e) => ({ regionOf: null, ms: Math.round(performance.now() - t0), error: String(e?.message || e).slice(0, 160) }));
  return (segFor = { stl, mesh, p });
}

const preview = (segs = 2) => {
  const { tris, level } = modelToTriangles(model, segs);
  const positions = Float32Array.from(tris);
  return { positions, level };
};
const fresh = () => {
  model = coarseModel(base.verts, base.quads, base.mesh); prepare(model); refinedTo = Infinity;
  snapped = base.regionOf ? snapToCarriers(model, base.regionOf) : null;
};

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

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  const reply = (msg, transfer = []) => self.postMessage({ id, ...msg }, transfer);
  try {
    if (op === "segment") {
      const { ms, error } = await segmentOnce(data.stl, data.rustWasmUrl).p;
      reply({ ok: true, ms, error });
    } else if (op === "begin") {
      const mesh = data.hybrid ? segmentOnce(data.stl, data.rustWasmUrl).mesh : weldSTL(data.stl);
      base = { verts: data.verts, quads: data.quads, mesh, name: data.name, regionOf: null };
      // the coverage test is on the plain coarse surface (snapping moves it a little)
      model = coarseModel(base.verts, base.quads, base.mesh);
      const coverage = surfaceDeviation(Array.from(mesh.verts), modelToTriangles(model, 2).tris);
      let segMs = 0, segError = null;
      if (data.hybrid) {
        const seg = await segmentOnce(data.stl, data.rustWasmUrl).p;
        base.regionOf = seg.regionOf; segError = seg.error; segMs = seg.ms;
      }
      fresh();
      const p = preview();
      const estimates = estimate(model, (data.stops || []).map((pct) => model.diag * pct / 100), { maxLevel: 3 })
        .map((e, i) => ({ tolPct: data.stops[i], ms: e.ms, refined: e.refined, faces: model.faces.length + model.fills.length }));
      reply({ ok: true, coverage, estimates, faces: model.faces.length + model.fills.length, hybrid: snapped ? { ...snapped, segMs } : null, segError, preview: p }, [p.positions.buffer, p.level.buffer]);
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
      const { step, faces, planeFaces, cylFaces, coneFaces, sphereFaces, mergedFaces } = modelToStep(model, base.name);
      const { tris } = modelToTriangles(model, 3);
      const dev = surfaceDeviation(Array.from(base.mesh.verts), tris);
      // the JS kernel's stand-in mesh: coarser, it only shows while Rust loads
      const mesh = stlText(modelToTriangles(model, 2).tris, base.name);
      reply({ ok: true, result: { step, mesh, faces, dev, planeFaces, cylFaces, coneFaces, sphereFaces, mergedFaces, ...summary(model) } });
    } else throw new Error(`unknown op ${op}`);
  } catch (e) {
    reply({ ok: false, error: String(e?.message || e) });
  }
};
