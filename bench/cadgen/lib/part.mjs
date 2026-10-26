// Build a practice part into its ground truth: the centred exact solid, its
// STEP, its bounding box, its features moved with it, and one STEP per jig.

import { build, stats } from "../../../src/render.js";
import { exactSTEP } from "../../../src/stepexport.js";
import { translate } from "../../../src/dsl.js";
import { applyFeatures, jigShape, jigType, shiftFeature } from "./features.mjs";

export function rawShape(part) {
  return part.model ? part.model({ applyFeatures, features: part.features || [] }) : applyFeatures(part.body(), part.features || []);
}

export function boundsOf(result) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const s of stats(result)) ["x", "y", "z"].forEach((k, i) => {
    b.min[i] = Math.min(b.min[i], s.bounds[k][0]); b.max[i] = Math.max(b.max[i], s.bounds[k][1]);
  });
  return b;
}

export async function buildPart(part) {
  const raw = await build(rawShape(part), { engine: "split" });
  const b0 = boundsOf(raw);
  const c = b0.min.map((v, i) => Math.round(((v + b0.max[i]) / 2) * 1000) / 1000);
  const shift = (p) => p.map((v, i) => v - c[i]);
  const res = await build(translate(c.map((v) => -v), rawShape(part)), { engine: "split" });
  const step = await exactSTEP(res, part.id || "part");
  const bbox = boundsOf(res);
  const features = (part.features || []).map((f) => shiftFeature(f, c));
  const dims = (part.dims || []).map((d) => ({ ...d, a: shift(d.a), b: shift(d.b) }));
  const leaders = (part.leaders || []).map((l) => ({ ...l, at: shift(l.at) }));
  const jigs = [];
  const idx = new Map();
  for (const f of features) {
    if (f.noJig) continue;
    const ctx = f.ctx ?? 1;
    const i = (idx.get(ctx) ?? 0) + 1;
    idx.set(ctx, i);
    const jr = await build(jigShape(f), { engine: "split" });
    jigs.push({ name: `jig_${ctx}__${i}__${jigType(f)}.step`, step: await exactSTEP(jr, `jig_${ctx}_${i}`) });
  }
  return { step, bbox, center: c, features, dims, leaders, jigs, result: res };
}
