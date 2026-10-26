#!/usr/bin/env node
// Child process: build one piece of AI-written BREPcode and write its exact
// STEP, centred on the origin. Run in its own process so a kernel that hangs
// or panics costs one attempt, not the whole run.
//
//   node runcode.mjs code.js out.step [--table t.json] [--import name=file.step] [--keep-frame]
//   ->  stdout: one JSON line { ok, lane, size, step, error, kind, check }
//   kind: syntax | build | mesh | step
// With --table, the model is measured BEFORE centring (in the code's own
// frame, the table's frame) and diffed against the feature table
// (src/selfcheck.js); the measurement goes to out.step.measure.json.
import { readFileSync, writeFileSync } from "node:fs";
import { measureFaces, diffTable } from "../../../src/selfcheck.js";
import { normalizeTable, parseLooseJSON } from "../../../src/imageread.js";
import * as api from "../../../index.js";
import { build, stats } from "../../../src/render.js";
import { exactSTEP } from "../../../src/stepexport.js";

const argv = process.argv.slice(2);
const VALUED = new Set(["--table", "--import"]);
const [codePath, outPath] = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
const keepFrame = argv.includes("--keep-frame");   // an edit stays where its input was
const opt = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const tablePath = opt("--table")[0];
for (const spec of opt("--import")) {
  const [name, file] = spec.split("=");
  api.registerImport(name, readFileSync(file, "utf8"));
}
const say = (o) => { process.stdout.write(JSON.stringify(o) + "\n"); process.exit(o.ok ? 0 : 1); };

const names = Object.keys(api).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
export function compileCode(src) {
  const body = /\breturn\b/.test(src) ? src : `return (${src.trim().replace(/;\s*$/, "")});`;
  // own block: the code may declare a name the DSL also exports (const slot = ...)
  return new Function(...names, `"use strict";\n{\n${body}\n}`);
}

let shape;
try {
  const src = readFileSync(codePath, "utf8");
  shape = compileCode(src)(...names.map((k) => api[k]));
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
  if (r.engine !== "exact" && opt("--import").length) throw new Error("the edit left the exact lane on the Rust kernel");
  if (r.engine !== "exact") say({ ok: false, kind: "mesh", error: "the model left the exact lane (a mesh verb such as plain hull, roundedGrow, minkowski(mm), tube, texture, blob, or an import)" });
  const b = bounds(r);
  let check;
  if (tablePath) {
    try {
      const measured = measureFaces(r.solids.flatMap((s) => s.faces || []));
      writeFileSync(`${outPath}.measure.json`, JSON.stringify(measured));
      const { table } = normalizeTable(parseLooseJSON(readFileSync(tablePath, "utf8")));
      if (table) {
        const d = diffTable(table, measured);
        check = { score: d.score, checked: d.checked, passed: d.passed, issues: d.issues.map((i) => i.msg), notes: d.notes, frame: d.frame };
      }
    } catch (e) { check = { error: String(e?.message || e).slice(0, 300) }; }
  }
  const c = b.min.map((v, i) => (v + b.max[i]) / 2);
  if (!keepFrame && c.some((v) => Math.abs(v) > 1e-6)) { r = await build(api.translate(c.map((v) => -v), shape), { engine: "split" }); }
  const step = await exactSTEP(r, "part");
  writeFileSync(outPath, step);
  say({ ok: true, lane: r.engine, solids: r.solids.length, size: b.max.map((v, i) => +(v - b.min[i]).toFixed(3)), check });
} catch (e) {
  const msg = String(e?.message || e);
  // The Rust kernel cannot read every STEP (some B-spline seams it refuses),
  // and its booleans on a big imported solid sometimes fail. An edit then
  // goes through the app's other exact lane, the OpenCASCADE build behind
  // the curved STEP export (viewer/curved.js), which reads the same
  // importedSolid() exactly. Still true faces, never the mesh import.
  if (opt("--import").length && shape) {
    try {
      const { initReplicad } = await import("./occ.mjs");
      const { buildCurved } = await import("../../../viewer/curved.js");
      await initReplicad();
      const solid = await buildCurved(shape);
      writeFileSync(outPath, await (await solid.blobSTEP()).text());
      const [lo, hi] = solid.boundingBox.bounds;
      say({ ok: true, lane: "occt", rustRefused: msg.slice(0, 300), size: hi.map((v, i) => +(v - lo[i]).toFixed(3)) });
    } catch (e2) {
      say({ ok: false, kind: "build", error: `Rust kernel: ${msg.slice(0, 600)}; OpenCASCADE: ${String(e2?.message || e2).slice(0, 600)}` });
    }
  }
  say({ ok: false, kind: /no exact solid|mesh lane/.test(msg) ? "step" : "build", error: msg.slice(0, 1500) });
}
