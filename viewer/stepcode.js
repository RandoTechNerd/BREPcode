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
// A body with no exact rebuild can still come back CLOSE: the nearest
// candidate, with the share of the file's volume it leaves out and adds, and
// where (closeMap). The page offers closeCode, which writes those as code,
// and never uses it unasked.
//
// convertStepInApp(text, { title, compile, workerCall, rustWasmUrl, onStage, onExact })
//   onExact(result): the exact result, before a freeform body's slices are
//   built and measured (the slow part), for the page to show meanwhile
//   -> { code, imports: [{ name, step, mesh }], bodies: [{ name, ok, kind, why, close }],
//        closeCode, closeMap: [{ name, points: [[x, y, z, 0 missing | 1 extra]] }] }
// compile(src) -> history JSON for the worker (or throws)

import { readStep } from "../src/stepread.js";
import { convertSolid, sourceFor, keptName, toCode, planBodies, withClose } from "../src/step2code.js";
import { boxOfSolid, CLOSE_MIN } from "../src/step2code-verify.js";
import { slicesOf } from "../src/step2code-mesh.js";

// what fewer, plainer pieces are worth against the slices, in match (as in
// src/step2code-check.js); ?blocks on the page keeps the blocks whenever
// they pass at all, to see them on a body the slices would win
const PRIM_EDGE = typeof location !== "undefined" && /[?&]blocks\b/.test(location.search) ? 1 : 0.01;

export async function convertStepInApp(text, { title = "part", compile, workerCall, rustWasmUrl, onStage = () => {}, onExact = null, maxTries = 6 } = {}) {
  onStage("Reading the file");
  const read = readStep(text);
  if (!read.solids.length) throw new Error("there are no solid bodies in this file (it may be surfaces only, or triangles)");
  const plans = planBodies(read).map((p) => ({ p, conv: convertSolid(p.local) }));
  onStage(`Matching ${plans.length} part${plans.length === 1 ? "" : "s"} to code`);
  const bodies = [];
  for (const { p, conv } of plans) {
    const [first, ...rest] = p.instances;
    const candidates = [];
    const all = [...conv.tries.slice(0, maxTries), ...(conv.close || []).map((t) => ({ ...t, close: true }))];
    for (const t of all) {
      try { candidates.push({ kind: t.kind, close: !!t.close, json: await compile(sourceFor(t, first.matrix)) }); }
      catch (e) { candidates.push({ kind: t.kind, close: !!t.close, json: null, error: `did not compile (${String(e?.message || e).slice(0, 100)})` }); }
    }
    conv.all = all;
    // solid: the body as read, for the primitive blocks (its cylinders become
    // exact arcs, its faces say what kind of body it is)
    bodies.push({ name: p.name, box: boxOfSolid(first), T: first.matrix, copies: rest.map((s) => ({ T: s.matrix, box: boxOfSolid(s) })), why: conv.why, candidates, solid: { faces: first.faces } });
  }
  onStage("Checking each body against the file");
  const r = await workerCall({ op: "step2code", step: text, bodies, rustWasmUrl });
  // the code from what came back so far
  const assemble = () => {
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
        if (v.close) {
          const t = v.close.slices || conv.all[v.close.pick];
          for (const s of p.instances) results[s.id].close = { kind: t.kind, expr: t.expr, dials: t.dials, plan: p, T: s.matrix, match: v.close.match, missing: v.close.missing, extra: v.close.extra, points: s === first ? v.close.points : null, prim: v.close.prim || null, pieces: v.close.pieces ?? null };
        }
      }
    });
    const anyClose = results.some((x) => x.close);
    return {
      code: toCode(read, results, { title }),
      imports,
      bodies: results.map((x, i) => ({ name: read.solids[i].name, ok: x.ok, kind: x.ok ? x.kind : "import", why: x.ok ? null : x.why,
        close: x.close ? { match: x.close.match, missing: x.close.missing, extra: x.close.extra, prim: x.close.prim || null, pieces: x.close.pieces ?? null } : null })),
      closeCode: anyClose ? toCode(read, withClose(results), { title }) : null,
      closeMap: results.map((x, i) => (x.close?.points ? { name: read.solids[i].name, points: x.close.points } : null)).filter(Boolean),
    };
  };
  // bodies nothing came near (freeform ones): the worker sliced their own
  // triangles and wrote them as primitive blocks too; each piece compiled
  // here (every way of writing it), built and measured there, and kept when
  // it comes nearer than what came before (the blocks a point ahead: a
  // handful of extrudes beats dozens of layers)
  const jobs = [];
  r.bodies.forEach((v, i) => {
    if (v.slices) jobs.push({ i, ways: v.slices, edge: 0 });
    if (v.prims?.length) jobs.push({ i, ways: v.prims.map((p) => [p]), edge: PRIM_EDGE, prim: true });
  });
  if (jobs.length) {
    // the exact result first, to show while the slices are built and measured
    if (onExact) onExact(assemble());
    const n = new Set(jobs.map((j) => j.i)).size;
    onStage(`Slicing ${n} freeform bod${n === 1 ? "y" : "ies"} for a close version`);
    // the plain pieces (one outline each, no boolean) as ONE compiled group,
    // the rest every way of writing each; all of them one at a time only if
    // the worker refuses that group
    const sendFor = async (job, together) => {
      const first = plans[job.i].p.instances[0], slices = job.ways;
      const of = together ? slices.map((w, k) => (/region2d|difference/.test(w[0]) ? -1 : k)).filter((k) => k >= 0) : [];
      let plain = null;
      if (of.length > 1) {
        try { plain = { json: await compile(sourceFor(slicesOf(of.map((k) => slices[k][0])), first.matrix)), of }; } catch { plain = null; }
      }
      const pieces = [];
      for (const [k, ways] of slices.entries()) {
        const out = [];
        if (!plain?.of.includes(k)) for (const w of ways) { try { out.push(await compile(sourceFor({ expr: w }, first.matrix))); } catch { out.push(null); } }
        pieces.push(out);
      }
      return { box: boxOfSolid(first), plain, pieces };
    };
    const send = [];
    for (const job of jobs) send.push(await sendFor(job, true));
    const got = await workerCall({ op: "step2codeSlices", step: text, bodies: send, rustWasmUrl });
    const again = jobs.filter((_, n) => got.bodies[n]?.plainRefused);
    if (again.length) {
      const more = await workerCall({ op: "step2codeSlices", step: text, bodies: await Promise.all(again.map((j) => sendFor(j, false))), rustWasmUrl });
      again.forEach((j, n) => { got.bodies[jobs.indexOf(j)] = more.bodies[n]; });
    }
    jobs.forEach((job, n) => {
      const g = got.bodies[n], v = r.bodies[job.i];
      if (!g || g.plainRefused || g.match < CLOSE_MIN || (v.close && v.close.match + (v.close.edge || 0) >= g.match + job.edge)) return;
      const keep = job.ways.map((ways, k) => ways[g.keep[k]]).filter(Boolean);
      if (!keep.length) return;
      v.close = { slices: slicesOf(keep), match: g.match, missing: g.missing, extra: g.extra, points: g.points, edge: job.edge, prim: job.prim ? v.primMethod || "blocks" : null, pieces: keep.length };
    });
  }
  return assemble();
}
