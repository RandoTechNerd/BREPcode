// "Open as code" for a STEP file: every body rebuilt as BREPcode, checked.
//
// The page reads the file and proposes code for each distinct part, in the
// part's own frame (src/stepread.js, src/step2code.js), compiles every
// proposal placed as the part's first copy, the way it compiles the editor
// (the caller's compile), and the kernel worker builds them and compares each
// with its own exact import of the file, then finds every other copy where
// the assembly puts it (op "step2code", src/step2code-verify.js). A body that
// matches is written as code; one that does not comes back as its own exact
// STEP and stays an importedSolid. The same judge the CLI uses, so the
// website keeps exactly the same bodies.
//
// convertStepInApp(text, { title, compile, workerCall, rustWasmUrl, onStage })
//   -> { code, imports: [{ name, step, mesh }], bodies: [{ name, ok, kind, why }] }
// compile(src) -> history JSON for the worker (or throws)

import { readStep } from "../src/stepread.js";
import { convertSolid, sourceFor, keptName, toCode, planBodies } from "../src/step2code.js";
import { boxOfSolid } from "../src/step2code-verify.js";

export async function convertStepInApp(text, { title = "part", compile, workerCall, rustWasmUrl, onStage = () => {}, maxTries = 4 } = {}) {
  onStage("Reading the file");
  const read = readStep(text);
  if (!read.solids.length) throw new Error("there are no solid bodies in this file (it may be surfaces only, or triangles)");
  const plans = planBodies(read).map((p) => ({ p, conv: convertSolid(p.local) }));
  onStage(`Matching ${plans.length} part${plans.length === 1 ? "" : "s"} to code`);
  const bodies = [];
  for (const { p, conv } of plans) {
    const [first, ...rest] = p.instances;
    const candidates = [];
    for (const t of conv.tries.slice(0, maxTries)) {
      try { candidates.push({ kind: t.kind, json: await compile(sourceFor(t, first.matrix)) }); }
      catch (e) { candidates.push({ kind: t.kind, json: null, error: `did not compile (${String(e?.message || e).slice(0, 100)})` }); }
    }
    bodies.push({ name: p.name, box: boxOfSolid(first), T: first.matrix, copies: rest.map((s) => ({ T: s.matrix, box: boxOfSolid(s) })), why: conv.why, candidates });
  }
  onStage("Checking each body against the file");
  const r = await workerCall({ op: "step2code", step: text, bodies, rustWasmUrl });
  const used = new Set();
  const results = new Array(read.solids.length), imports = [];
  const kept = (s, v, why) => {
    const name = keptName(title, s.name, used);
    if (v.step) imports.push({ name, step: v.step, mesh: v.mesh || null });
    return { ok: false, importName: name, why, missing: !v.step };
  };
  r.bodies.forEach((v, i) => {
    const { p, conv } = plans[i];
    const [first, ...rest] = p.instances;
    if (v.ok) {
      const t = conv.tries[v.pick];
      const ok = (s) => ({ ok: true, kind: t.kind, expr: t.expr, dials: t.dials, diff: v.diff, plan: p, T: s.matrix });
      results[first.id] = ok(first);
      rest.forEach((s, k) => { results[s.id] = v.copies?.[k]?.ok ? ok(s) : kept(s, v.copies?.[k] || {}, v.copies?.[k]?.why || "this copy could not be placed"); });
    } else {
      results[first.id] = kept(first, v, v.why);
      rest.forEach((s, k) => { results[s.id] = kept(s, v.copies?.[k] || {}, v.why); });
    }
  });
  return {
    code: toCode(read, results, { title }),
    imports,
    bodies: results.map((x, i) => ({ name: read.solids[i].name, ok: x.ok, kind: x.ok ? x.kind : "import", why: x.ok ? null : x.why })),
  };
}
