// Builds a BrepScript shape into kernel geometry and exports it.

import { PartHistory } from "brep-io-kernel";
import { compile } from "./dsl.js";
import { runEngine, solidsToSTL, EngineRefusal } from "./engine.js";
import { loadRustKernel, loadManifoldNode, loadNvidiaKernel } from "./engine-node.js";

// engine: "auto" runs the split engine (Rust for exact parts, manifold for
// meshes, see src/engine.js) and falls back to the JS kernel when it refuses;
// "split" refuses instead of falling back; "js" is the JS kernel only.
export async function build(shape, { tolerance = 6, engine = process.env.BREPSCRIPT_ENGINE || "auto" } = {}) {
  const ph = new PartHistory();
  await compile(shape, ph);
  let fallback = null;
  // "nvidia": NVIDIA's kernel first, then the Rust one, then the JS kernel.
  // "nvidia-split": NVIDIA's kernel or nothing (to see what it refuses).
  if (engine === "nvidia" || engine === "nvidia-split") {
    const nk = loadNvidiaKernel();
    try {
      if (!nk) throw new EngineRefusal("the NVIDIA kernel isn't built on this machine (native/nvidia-kernel)", "exact");
      const out = await runEngine(await ph.toJSON(), { rust: nk, manifold: loadManifoldNode });
      const solids = out.solids.map((s) => ({
        type: "SOLID", name: s.name, exact: s.exact, faceNames: s.faces.map((f) => f.name),
        toSTL: (name) => solidsToSTL([{ ...s, name }], tolerance),
      }));
      return { partHistory: ph, solids, tolerance, engine: out.lane, kernel: "nvidia", stats: out.stats };
    } catch (e) {
      if (engine === "nvidia-split") throw e;
      fallback = `NVIDIA kernel: ${String(e?.message || e)}`;
    }
  }
  if (engine !== "js") {
    try {
      const rust = await loadRustKernel();
      const out = await runEngine(await ph.toJSON(), { rust, manifold: loadManifoldNode });
      const solids = out.solids.map((s) => ({
        type: "SOLID", name: s.name, exact: s.exact, faceNames: s.faces.map((f) => f.name),
        toSTL: (name) => solidsToSTL([{ ...s, name }], tolerance),
      }));
      return { partHistory: ph, solids, tolerance, engine: out.lane, kernel: "rust", stats: out.stats, fallback };
    } catch (e) {
      // auto means "the JS kernel if the split engine can't": a refusal, a
      // wasm that won't load, a kernel panic, a manifold exception. The
      // viewer worker falls back on all of them, and so does this.
      if (engine === "split") throw e;
      if (!(e instanceof EngineRefusal)) console.warn(`[engine] split engine failed, using the JS kernel: ${e?.message || e}`);
      fallback = String(e?.message || e);
    }
  }
  await ph.runHistory({ throwOnFeatureError: true });

  const solids = (ph.scene?.children || []).filter(
    (o) => o && o.type === "SOLID" && typeof o.toSTL === "function",
  );
  if (!solids.length) throw new Error("Model produced no solids.");
  return { partHistory: ph, solids, tolerance, engine: "js", fallback };
}

export function toSTL({ solids, tolerance }, name = "model") {
  if (solids.length === 1) return solids[0].toSTL(name, tolerance);
  // Multiple disjoint solids: concatenate into one multi-solid ASCII STL.
  return solids.map((s, i) => s.toSTL(s.name || `${name}_${i}`, tolerance)).join("\n");
}

export function stats({ solids, tolerance }) {
  return solids.map((s) => {
    const stl = s.toSTL(s.name || "solid", tolerance);
    const facets = (stl.match(/facet normal/g) || []).length;
    const verts = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)]
      .map((m) => [+m[1], +m[2], +m[3]]);
    // Loop rather than Math.min(...verts.map(…)). Spreading an array becomes
    // that many function ARGUMENTS, and a rounded offset of a cylinder is 74k
    // triangles — a quarter of a million arguments, which is a stack overflow,
    // not a large number. The build had already succeeded; only printing it
    // fell over.
    const range = (a) => {
      let lo = Infinity, hi = -Infinity;
      for (const p of verts) { if (p[a] < lo) lo = p[a]; if (p[a] > hi) hi = p[a]; }
      return [lo, hi];
    };
    return { name: s.name, facets, bounds: { x: range(0), y: range(1), z: range(2) } };
  });
}
