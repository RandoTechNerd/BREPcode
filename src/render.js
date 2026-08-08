// Builds a BrepScript shape into kernel geometry and exports it.

import { PartHistory } from "brep-io-kernel";
import { compile } from "./dsl.js";

export async function build(shape, { tolerance = 6 } = {}) {
  const ph = new PartHistory();
  await compile(shape, ph);
  await ph.runHistory({ throwOnFeatureError: true });

  const solids = (ph.scene?.children || []).filter(
    (o) => o && o.type === "SOLID" && typeof o.toSTL === "function",
  );
  if (!solids.length) throw new Error("Model produced no solids.");
  return { partHistory: ph, solids, tolerance };
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
