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
//   bodies: [{ name, kind, ok, why, diff, ms, close }],
//   closeCode,                    // the same, with each close body as its code
//   closeMap: [{ name, points }], // where each close body differs (see coverage)
// }
//
// A body with no exact rebuild may still have a CLOSE one: the candidate (an
// exact try that missed, or step2code-slice.js's thin-layer version) that
// covers most of it, measured by coverage(). It is never written into code
// on its own: closeCode is the offer, with what it leaves out and adds.

import { readStep } from "./stepread.js";
import { meshSliced, slicesOf } from "./step2code-mesh.js";
import { primCandidate } from "./step2code-prim.js";
import { convertSolid, toCode, sourceFor, keptName, planBodies, withClose } from "./step2code.js";
import { kernelBodies, freeBodies, unionAll, measure, bestMatch, placeInstances, nearestByBox, solidStep, solidStl, boxOfSolid, summarize, coverage, fileSide, boxUnion, SAME_SHAPE, CLOSE_MIN } from "./step2code-verify.js";
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

export async function convertStep(text, { title = "part", maxTries = 6, close = true, fitTol } = {}) {
  const rk = await loadRustKernel();
  const read = readStep(text, { fitTol });
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
    let done = null, cand = null, best = null;
    const myBox = boxOfSolid(first);
    // the closest a near miss comes: measured against the file body it sits on
    // edge: what being simpler is worth, in match (primitive blocks over slices)
    const near = (t, c, edge = 0) => {
      const k = nearestByBox(kernel, myBox);
      const cov = k?.json ? coverage(rk, fileSide(k), c, boxUnion(k.box, myBox)) : null;
      if (cov && cov.match >= CLOSE_MIN && (!best || cov.match + edge > best.cov.match + best.edge)) best = { t, cov, c, k, edge };
    };
    const tryOne = async (t) => {
      let h, made = false;
      try {
        const r = await build(runCode(sourceFor(t, first.matrix)), { engine: "split" });
        if (r.kernel !== "rust" || r.engine !== "exact" || r.solids.some((x) => x.handle == null)) throw new Error(`not exact (${r.engine})`);
        // slices (a group): each measured on its own, never unioned
        if (t.group) return { c: { parts: r.solids.map((x) => measure(rk, x.handle)) } };
        h = unionAll(rk, r.solids.map((x) => x.handle));
        made = r.solids.length > 1;     // the build's own handles stay: the kernel caches builds
      } catch (e) { if (!t.approx) why.push(`${t.kind}: did not build (${String(e?.message || e).slice(0, 120)})`); return null; }
      try { const c = measure(rk, h); return { c, match: t.approx ? null : bestMatch(rk, kernel, c, myBox) }; }
      catch (e) { why.push(`${t.kind}: the check failed (${String(e?.message || e).slice(0, 100)})`); return null; }
      finally { if (made) { try { rk.free_solid(h); } catch { /* gone */ } } }
    };
    for (const t of conv.tries.slice(0, maxTries)) {
      const got = await tryOne(t);
      if (!got) continue;
      const { c, match } = got;
      cand = c;
      if (match && match.rel < SAME_SHAPE) { match.k.used = true; done = { ok: true, kind: t.kind, expr: t.expr, dials: t.dials, diff: match.rel, plan }; break; }
      why.push(`${t.kind}: built, but it is not the same shape as the file (off by ${match ? (match.rel * 100).toPrecision(2) + "%" : "an unknown amount"})`);
      if (close) near(t, c);
    }
    if (!done && close) for (const t of conv.close || []) { const got = await tryOne(t); if (got) near(t, got.c); }
    // nothing near enough (a freeform body): the file's own triangles, sliced,
    // and the same body as a few primitive blocks (step2code-prim.js); the
    // blocks are offered when they come within a point of the slices, being
    // a handful of extrudes rather than dozens of layers
    if (!done && close && !(best?.cov.match > 0.995)) {
      const k = nearestByBox(kernel, myBox);
      const t = meshCandidate(rk, k, first.matrix);
      if (t) { const g = await buildPieces(t.pieces, first.matrix); if (g.keep.length) near(slicesOf(g.keep), { parts: g.parts }); }
      const pc = primCandidate(rk, k, first.matrix, first);
      if (pc) { const g = await buildPieces(pc.pieces.map((p) => [p]), first.matrix); if (g.keep.length) near({ ...slicesOf(g.keep), prim: pc.method }, { parts: g.parts }, PRIM_EDGE); }
    }
    // the one offered: measured again, finer, for its numbers and its map
    if (!done && best) best.cov = coverage(rk, fileSide(best.k), best.c, boxUnion(best.k.box, myBox), true) || best.cov;
    if (done) {
      results[first.id] = { ...done, T: first.matrix };
      const found = placeInstances(kernel, cand, first.matrix, rest.map((s) => s.matrix), boxOfSolid(first));
      rest.forEach((s, i) => { results[s.id] = found[i] ? { ...done, T: s.matrix } : keep(s, ["this copy is not where the assembly's placement puts the part"]); });
    } else for (const s of plan.instances) {
      results[s.id] = keep(s, why);
      if (best) results[s.id].close = { kind: best.t.kind, expr: best.t.expr, dials: best.t.dials, plan, T: s.matrix, match: best.cov.match, missing: best.cov.missing, extra: best.cov.extra, points: s === first ? best.cov.points : null, prim: best.t.prim || null, pieces: (best.t.expr.match(/linearExtrude\(/g) || []).length };
    }
    const each = (performance.now() - t0) / plan.instances.length;
    for (const s of plan.instances) ms[s.id] = Math.round(each);
  }
  freeBodies(rk, kernel);
  const bodies = read.solids.map((s, i) => ({ name: s.name, kind: results[i].ok ? results[i].kind : "import", ok: results[i].ok, why: results[i].ok ? null : results[i].why, diff: results[i].diff ?? null, ms: ms[i], close: closeNumbers(results[i].close) }));
  const anyClose = results.some((r) => r.close);
  return {
    code: toCode(read, results, { title }), imports, bodies, unit: read.unit,
    closeCode: anyClose ? toCode(read, withClose(results), { title }) : null,
    closeMap: results.map((r, i) => (r.close?.points ? { name: read.solids[i].name, points: r.close.points } : null)).filter(Boolean),
  };
}

// what fewer, plainer pieces are worth against the slices, in match
const PRIM_EDGE = 0.01;

// pieces (each its ways of being written, best first) built as one group:
// the plain ones (one outline, no boolean) in one build, the rest, and all
// of them if that fails, one at a time, each by the first of its ways that
// builds; a piece the kernel refuses is left out
async function buildPieces(pieces, T) {
  const rk = await loadRustKernel();
  const keep = [], parts = [];
  const plain = pieces.filter((w) => !/region2d|difference/.test(w[0]));
  let rest = pieces.filter((w) => !plain.includes(w));
  if (plain.length > 1) {
    try {
      const r = await build(runCode(sourceFor(slicesOf(plain.map((w) => w[0])), T)), { engine: "split" });
      if (r.kernel !== "rust" || r.engine !== "exact" || r.solids.length !== plain.length || r.solids.some((x) => x.handle == null)) throw new Error("not one exact solid per piece");
      parts.push(...r.solids.map((x) => measure(rk, x.handle)));
      keep.push(...plain.map((w) => w[0]));
    } catch { rest = pieces; parts.length = 0; keep.length = 0; }
  } else rest = pieces;
  for (const ways of rest) for (const piece of ways) {
    try {
      const r = await build(runCode(sourceFor({ expr: piece }, T)), { engine: "split" });
      if (r.kernel !== "rust" || r.engine !== "exact" || r.solids.some((x) => x.handle == null)) continue;
      parts.push(...r.solids.map((x) => measure(rk, x.handle)));
      keep.push(piece);
      break;
    } catch { /* the next way, or left out */ }
  }
  return { keep, parts };
}

const closeNumbers = (c) => (c ? { match: c.match, missing: c.missing, extra: c.extra, prim: c.prim || null, pieces: c.pieces ?? null } : null);

// the file body's own tessellation, sliced into layers (step2code-mesh.js),
// written in the part's own frame like every other candidate
export function meshCandidate(rk, k, T) {
  if (k?.handle == null) return null;
  try {
    const b = k.box, size = Math.hypot(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) || 1;
    const m = rk.tessellate_handle(k.handle, Math.max(0.01, size * 3e-4));
    const t = meshSliced({ P: m.take_positions(), I: m.take_indices() }, T);
    return t.expr ? t : null;
  } catch { return null; }
}
