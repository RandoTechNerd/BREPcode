// STEP -> code, checked (Node: the CLI, the tests, bench/step2code).
//
// src/step2code.js proposes code for each body; this builds every proposal
// on the Rust kernel and compares it with the kernel's own exact import of
// the same file (src/step2code-verify.js). A proposal is kept only when the
// volume of the difference between the two solids is essentially zero; a
// body with no such proposal is written out as its own exact STEP and kept
// as an importedSolid. So the code that comes back never quietly differs
// from the file. The viewer does the same in its kernel worker.
//
// convertStep(text, { title }) -> {
//   code,                         // the whole file as BREPcode
//   imports: [{ name, step }],    // bodies kept as solids: registerImport(name, step)
//   bodies: [{ name, kind, ok, why, diff, ms }],
// }

import { readStep } from "./stepread.js";
import { convertSolid, toCode, sourceFor, keptName, planBodies } from "./step2code.js";
import { kernelBodies, freeBodies, unionAll, measure, bestMatch, placeInstances, nearestByBox, solidStep, solidStl, boxOfSolid, summarize, SAME_SHAPE } from "./step2code-verify.js";
import { loadRustKernel } from "./engine-node.js";
import * as dsl from "./dsl.js";
import { build } from "./render.js";

// the converter's own code: consts, then return <shape>. Run with the DSL's
// words as parameters, the way the editor runs code (runcode.js is the
// forgiving version of this, and is not shipped to the website)
const WORDS = Object.keys(dsl).filter((k) => typeof dsl[k] === "function" && /^[A-Za-z_$][\w$]*$/.test(k));
export function runCode(src) {
  return new Function(...WORDS, `"use strict";\n${src}`)(...WORDS.map((k) => dsl[k]));
}

export { SAME_SHAPE };

export async function convertStep(text, { title = "part", maxTries = 4 } = {}) {
  const rk = await loadRustKernel();
  const read = readStep(text);
  const kernel = kernelBodies(rk, text);
  const results = new Array(read.solids.length), ms = new Array(read.solids.length).fill(0), imports = [];
  const usedNames = new Set();
  // a copy that is kept: the file body nearest it, written out as its own STEP
  const keep = (s, why) => {
    const k = nearestByBox(kernel, boxOfSolid(s));
    const name = keptName(title, s.name, usedNames);
    let step = null, mesh = null;
    if (k) {
      try { step = solidStep(rk, k.handle, s.name || "body"); k.used = true; } catch (e) { why = [...why, `its STEP could not be written: ${String(e?.message || e).slice(0, 80)}`]; }
      if (step) { try { mesh = solidStl(rk, k.handle, s.name || "body"); } catch { /* the STEP alone */ } }
    }
    if (step) imports.push({ name, step, mesh });
    return { ok: false, importName: name, why: summarize(why), missing: !step };
  };
  for (const plan of planBodies(read)) {
    const t0 = performance.now();
    const [first, ...rest] = plan.instances;
    const conv = convertSolid(plan.local);
    const why = [...conv.why];
    let done = null, cand = null;
    for (const t of conv.tries.slice(0, maxTries)) {
      let h, made = false;
      try {
        const r = await build(runCode(sourceFor(t, first.matrix)), { engine: "split" });
        if (r.kernel !== "rust" || r.engine !== "exact" || r.solids.some((x) => x.handle == null)) throw new Error(`not exact (${r.engine})`);
        h = unionAll(rk, r.solids.map((x) => x.handle));
        made = r.solids.length > 1;     // the build's own handles stay: the kernel caches builds
      } catch (e) { why.push(`${t.kind}: did not build (${String(e?.message || e).slice(0, 120)})`); continue; }
      let match = null;
      try { cand = measure(rk, h); match = bestMatch(rk, kernel, cand, boxOfSolid(first)); }
      catch (e) { why.push(`${t.kind}: the check failed (${String(e?.message || e).slice(0, 100)})`); continue; }
      finally { if (made) { try { rk.free_solid(h); } catch { /* gone */ } } }
      if (match && match.rel < SAME_SHAPE) { match.k.used = true; done = { ok: true, kind: t.kind, expr: t.expr, dials: t.dials, diff: match.rel, plan }; break; }
      why.push(`${t.kind}: built, but it is not the same shape as the file (off by ${match ? (match.rel * 100).toPrecision(2) + "%" : "an unknown amount"})`);
    }
    if (done) {
      results[first.id] = { ...done, T: first.matrix };
      const found = placeInstances(kernel, cand, first.matrix, rest.map((s) => s.matrix), boxOfSolid(first));
      rest.forEach((s, i) => { results[s.id] = found[i] ? { ...done, T: s.matrix } : keep(s, ["this copy is not where the assembly's placement puts the part"]); });
    } else for (const s of plan.instances) results[s.id] = keep(s, why);
    const each = (performance.now() - t0) / plan.instances.length;
    for (const s of plan.instances) ms[s.id] = Math.round(each);
  }
  freeBodies(rk, kernel);
  const bodies = read.solids.map((s, i) => ({ name: s.name, kind: results[i].ok ? results[i].kind : "import", ok: results[i].ok, why: results[i].ok ? null : results[i].why, diff: results[i].diff ?? null, ms: ms[i] }));
  return { code: toCode(read, results, { title }), imports, bodies, unit: read.unit };
}
