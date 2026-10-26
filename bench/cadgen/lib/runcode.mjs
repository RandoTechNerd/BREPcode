#!/usr/bin/env node
// Child process: build one piece of AI-written BREPcode and write its exact
// STEP, centred on the origin. Run in its own process so a kernel that hangs
// or panics costs one attempt, not the whole run.
//
//   node runcode.mjs code.js out.step   ->  stdout: one JSON line
//   { ok, lane, size, step, error, kind }   kind: syntax | build | mesh | step
import { readFileSync, writeFileSync } from "node:fs";
import * as api from "../../../index.js";
import { build, stats } from "../../../src/render.js";
import { exactSTEP } from "../../../src/stepexport.js";

const [codePath, outPath] = process.argv.slice(2);
const say = (o) => { process.stdout.write(JSON.stringify(o) + "\n"); process.exit(o.ok ? 0 : 1); };

import { runEditorCode } from "../../../src/runcode.js";

let shape;
try {
  // the editor's own forgiveness: shadowed DSL words, a forgotten return
  ({ shape } = runEditorCode(readFileSync(codePath, "utf8"), api));
  if (shape == null) throw new Error("the code returned nothing");
} catch (e) { say({ ok: false, kind: "syntax", error: String(e?.message || e) }); }

const bounds = (r) => {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const s of stats(r)) ["x", "y", "z"].forEach((k, i) => {
    b.min[i] = Math.min(b.min[i], s.bounds[k][0]); b.max[i] = Math.max(b.max[i], s.bounds[k][1]);
  });
  return b;
};
try {
  // engine "split": the Rust kernel or a refusal; never the JS fallback, which has no exact STEP
  let r = await build(shape, { engine: "split" });
  if (r.engine !== "exact") say({ ok: false, kind: "mesh", error: "the model left the exact lane (a mesh verb such as plain hull, roundedGrow, minkowski(mm), tube, texture, blob, or an import)" });
  const b = bounds(r);
  const c = b.min.map((v, i) => (v + b.max[i]) / 2);
  if (c.some((v) => Math.abs(v) > 1e-6)) { r = await build(api.translate(c.map((v) => -v), shape), { engine: "split" }); }
  const step = await exactSTEP(r, "part");
  writeFileSync(outPath, step);
  say({ ok: true, lane: r.engine, solids: r.solids.length, size: b.max.map((v, i) => +(v - b.min[i]).toFixed(3)) });
} catch (e) {
  const msg = String(e?.message || e);
  say({ ok: false, kind: /no exact solid|mesh lane/.test(msg) ? "step" : "build", error: msg.slice(0, 1500) });
}
