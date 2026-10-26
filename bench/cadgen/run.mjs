#!/usr/bin/env node
// Generator v1: picture -> feature table -> BREPcode -> exact STEP, per sample.
//
//   node bench/cadgen/run.mjs --run v1                     every practice sample
//   node bench/cadgen/run.mjs --run v1 --only p01,p07      some of them
//   node bench/cadgen/run.mjs --inputs <dir> --run pub     any CADGenBench-style inputs dir
//
// The reading and checking are the app's own shared modules, the same ones
// the chat uses when someone attaches a picture:
//   src/imageread.js   the reading rules, the feature-table schema, the
//                      overview + zoomed tiles, the follow-up prompts
//   src/selfcheck.js   measure the exact model's faces and diff them
//                      against the table
//   viewer/curved.js   the app's 3-view blueprint, for the look-compare
//
// Per generation sample (input*.png):
//   1. READ+BUILD  the AI (headless Claude Code, tools off, no MCP) answers
//                  with the feature table, then BREPcode. The code is built
//                  on the exact lane in a child process (lib/runcode.mjs),
//                  measured, centred, written as exact STEP and put through
//                  cadgenbench's validity gate. A build/validity failure goes
//                  back with the error (--tries in all).
//   2. SELF-CHECK  the measured model is diffed against the table; any
//                  disagreement goes back once for a fix.
//   3. CANDIDATES  still disagreeing: --candidates-1 more fresh readings, in
//                  parallel; the one that self-checks best (its own table,
//                  then agreement with the others' tables) is kept.
//   4. LOOK        the kept model's blueprint next to the input picture for
//                  a final correction pass (kept only if it still builds and
//                  self-checks no worse).
// Per editing sample (input.step + edit_description.txt): the STEP is read
// EXACTLY by the Rust kernel (importedSolid / IMPORT3D stepText), measured,
// and the AI writes the edit on top of it; exported as exact STEP, not
// centred (the edit keeps the input's frame).
//
// Output: results/<run>/<sample>/{output.step, table.json, code.js, log.json,
// blueprint.png}, the layout `cadgenbench evaluate` reads (see score.mjs).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { EXACT_RULES } from "../../src/exactlane.js";
import {
  readerRules, parseReply, normalizeTable, tileRects, tilesNote, zoomRects,
  fixPrompt, lookPrompt, candidateHint, parseLooseJSON,
} from "../../src/imageread.js";
import { diffTable } from "../../src/selfcheck.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PY = process.env.CGB_PYTHON || join(HERE, ".venv/bin/python");

const args = {
  run: "v1", inputs: join(HERE, "practice/data/inputs"), only: null, parallel: 3, tries: 3,
  model: "claude-opus-5-5", timeout: 600, candidates: 3, look: true, check: true,
};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], v = process.argv[i + 1];
  if (a === "--run") args.run = v, i++;
  else if (a === "--inputs") args.inputs = resolve(v), i++;
  else if (a === "--only") args.only = v.split(","), i++;
  else if (a === "--parallel") args.parallel = +v, i++;
  else if (a === "--tries") args.tries = +v, i++;
  else if (a === "--model") args.model = v, i++;
  else if (a === "--timeout") args.timeout = +v, i++;
  else if (a === "--candidates") args.candidates = Math.max(1, +v), i++;
  else if (a === "--no-look") args.look = false;
  else if (a === "--no-check") args.check = false;
  else throw new Error(`unknown option ${a}`);
}
const OUT = join(HERE, "results", args.run);

// ------------------------------------------------------------------ prompts
// What is particular to the benchmark. How to read a picture, the table and
// the drill/rotate rules come from src/imageread.js, shared with the chat.
export const BENCH_RULES = `BENCHMARK MODE (CADGenBench). This overrides "reply with code only" above.
You are given an engineering drawing of ONE mechanical part. Reproduce it as one exact solid. It is scored against the true part by: shape similarity (surface distance + volume IoU), interface match (every hole, slot, pocket and boss must sit within 1% of the part size of its true position with the right diameter and depth: a feature that is off scores 0), and topology (number of through-holes, separate bodies, voids).
Every dimension is on the drawing (scale.source "dimensions"); never ask a question. Use every view, section and detail view; several sheets may show the same part.

Answer in exactly two fenced blocks, in this order, nothing else:
1. \`\`\`json: the FEATURE TABLE, written before any code.
2. \`\`\`js: BREPcode that builds exactly that table: a statement block ending in \`return <one solid>;\`, no imports.

Code rules for the benchmark:
- ONE solid: union every body piece (overlap unions by 0.5 mm, never just touch), then cut. Never group().
- Work in your table's frame (a min-corner origin is easiest); the harness centres the result itself.
- Stay on the exact lane: no plain hull(), roundedGrow, minkowski(mm), tube, texture, blob, text.
- A profile for a rib or gusset standing in the YZ plane: polygon in (y, z), linearExtrude({ h: t }) along +Z, then rotate([0, 0, 90], rotate([90, 0, 0], ...)) maps (px, py, extrude) to (x = extrude, y = px, z = py).
- Only use $fn: 6 for a hex on purpose; never on holes or round bosses.
- Holes that cross other holes or slots: cut them one difference() at a time. Cut bores first, then saw slots that run into them.
- Prefer simple, robust geometry: a small fillet you cannot place reliably is worth less than a valid solid. Never omit a hole, slot, pocket or boss.`;

export const EDIT_RULES = `BENCHMARK MODE (CADGenBench, editing). This overrides "reply with code only" above.
You are given an existing part as an exact solid, importedSolid("input.step") (the file read exactly: true planes and cylinders), pictures of it, the app's measurements of it, and an instruction. Apply exactly that change and nothing else; everything not mentioned stays as it is.
- Start from importedSolid("input.step") and change it with difference() / union() / intersection() of exact pieces (cube, cylinder, drill, polygon + linearExtrude, fillet, chamfer). Keep the part where it is: do not centre, move or rotate it. The measurements are in its own frame.
- To move or resize a feature: fill the old one (union a block or cylinder that exactly fills it, overlapping the walls by 0.01-0.5 mm only where it stays inside the material), then cut the new one.
- To thicken, lengthen or shorten the whole part across a plane: stretch({ axis: "z", by: 2.5, at: z0 }, importedSolid("input.step")) cuts at the plane axis = at (put it where the section is plain, away from holes and steps) and adds \`by\` mm there (negative removes). Prefer it to intersecting the part with boxes and re-unioning copies, which the kernel finds fragile.
- Booleans between the imported part and a piece whose faces lie exactly ON the part's faces are fragile: overshoot by 0.01-0.5 mm into empty space or into material, never flush.
- ONE solid; stay on the exact lane (no plain hull, roundedGrow, minkowski(mm), tube, texture, blob, text, importedMesh).
- rotate([a, b, c]) turns about Z FIRST, then Y, then X.
Answer with one \`\`\`js block: a statement block ending in \`return <one solid>;\`, no imports. Before it, one short paragraph saying which faces/features you change and with what numbers.`;

const BASE = [readFileSync(join(ROOT, "LLM_PROMPT.md"), "utf8"), EXACT_RULES];
const SYSTEM = [...BASE, readerRules(), BENCH_RULES].join("\n\n---\n\n");
const EDIT_SYSTEM = [...BASE, EDIT_RULES].join("\n\n---\n\n");

// ------------------------------------------------------------------ helpers
function sh(cmd, argv, { input, timeout = 600, cwd } = {}) {
  return new Promise((res) => {
    // its own process group, so a timeout kills whatever it started too (a
    // wrapper's child holding the pipes open would otherwise hang the run)
    const p = spawn(cmd, argv, { cwd, env: process.env, detached: true });
    let out = "", err = "", done = false;
    const finish = (code) => { if (done) return; done = true; clearTimeout(t); res({ code, out, err }); };
    const t = setTimeout(() => {
      err += `\n[timeout after ${timeout}s]`;
      try { process.kill(-p.pid, "SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch { /* gone */ } }
      setTimeout(() => finish(null), 2000);
    }, timeout * 1000);
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", finish);
    if (input != null) p.stdin.end(input); else p.stdin.end();
  });
}
const lastJSON = (s) => { try { return JSON.parse(s.trim().split("\n").pop()); } catch { return null; } };
const png = (path) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(path).toString("base64") } });
const txt = (text) => ({ type: "text", text });

async function askClaude(content, workdir, system = SYSTEM) {
  const msg = JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n";
  for (let k = 0; k < 2; k++) {
    const r = await sh("claude", ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      "--model", args.model, "--strict-mcp-config", "--tools", "", "--system-prompt", system], { input: msg, timeout: args.timeout, cwd: workdir });
    const lines = r.out.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const res = lines.find((l) => l.type === "result");
    if (res && !res.is_error) return { text: res.result || "", cost: res.total_cost_usd || 0 };
    if (k === 1) throw new Error(`claude failed: ${(res?.result || r.err || r.out).slice(0, 500)}`);
  }
}

// The crops src/imageread.js plans, cut by lib/tiles.py.
async function cropImage(path, rects, dir) {
  await sh(PY, ["-I", join(HERE, "lib/tiles.py"), path, dir, JSON.stringify(rects)]);
  return rects.map((r) => join(dir, `${r.name}.png`));
}
async function imageSize(path) {
  const r = await sh(PY, ["-I", join(HERE, "lib/tiles.py"), path, "--size"]);
  return r.out.trim().split(/\s+/).map(Number);
}

// ------------------------------------------------------------------ one build
// Build one answer's code: exact lane, measured against its table, exact
// STEP, validity gate. Returns a candidate record.
async function buildAnswer(ctx, tag, { table, code }, { edit = false } = {}) {
  const c = { tag, table: table ?? null, code, ok: false };
  const codePath = join(ctx.work, `code.${tag}.js`), stepPath = join(ctx.work, `out.${tag}.step`);
  writeFileSync(codePath, code);
  writeFileSync(join(ctx.outDir, `code.${tag}.js`), code);
  const argv = [join(HERE, "lib/runcode.mjs"), codePath, stepPath];
  if (table && args.check) { const tp = join(ctx.work, `table.${tag}.json`); writeFileSync(tp, table); argv.push("--table", tp); }
  if (edit) argv.push("--import", `input.step=${ctx.stepIn}`, "--keep-frame");
  const r = await sh("node", argv, { timeout: 420 });
  const rc = lastJSON(r.out) || { ok: false, kind: "build", error: (r.err || r.out || "no output").slice(-800) };
  Object.assign(c, { kind: rc.kind, error: rc.error, size: rc.size, check: rc.check });
  if (!rc.ok) return c;
  const v = await sh(PY, ["-I", join(HERE, "lib/validity.py"), stepPath], { timeout: 300 });
  c.validity = lastJSON(v.out) || { valid: false, errors: [v.err.slice(-400)] };
  if (!c.validity.valid) { c.kind = "invalid"; c.error = `the STEP failed the validity gate: ${(c.validity.errors || []).join("; ")}`; return c; }
  c.ok = true; c.step = stepPath; c.measure = `${stepPath}.measure.json`;
  return c;
}
const score = (c) => (!c?.ok ? -1 : c.check?.score ?? 0);
const brief = (c) => ({ tag: c.tag, ok: c.ok, kind: c.kind, error: c.error?.slice(0, 300), size: c.size, check: c.check && { score: c.check.score, checked: c.check.checked, issues: c.check.issues?.slice(0, 12) }, consensus: c.consensus });

// Ask, parse, build; a failure goes back with its error. The answer is
// always a full table + code, so each round can correct either.
async function generate(ctx, tag, content, { system = SYSTEM, edit = false } = {}) {
  let c = null, text = "";
  for (let attempt = 1; attempt <= args.tries; attempt++) {
    const msg = attempt === 1 ? content : [...content.filter((x) => x.type === "image"), txt(
      `${content.filter((x) => x.type === "text").map((x) => x.text).join("\n\n")}\n\nYour previous answer is below; it FAILED to build. Fix it and answer again in the same format.\n\n${c?.table ? `\`\`\`json\n${c.table}\n\`\`\`\n\n` : ""}\`\`\`js\n${c?.code ?? "(no code block)"}\n\`\`\`\n\nFailure (${c?.kind}): ${c?.error}`)];
    const t0 = Date.now();
    let reply;
    try { reply = await askClaude(msg, ctx.work, system); }
    catch (e) { ctx.log.calls.push({ tag, attempt, error: String(e.message).slice(0, 300) }); continue; }
    ctx.log.cost += reply.cost;
    text = reply.text;
    const p = parseReply(text);
    if (p.zoom.length) ctx.zoom = p.zoom;
    if (!p.code) {
      if (/NO CHANGES/.test(text)) { ctx.log.calls.push({ tag, attempt, cost: reply.cost, s: Math.round((Date.now() - t0) / 1000), noChanges: true }); return { noChanges: true }; }
      c = { tag, ok: false, kind: "format", error: "no ```js block in the answer", table: p.tableText, code: null };
    } else {
      c = await buildAnswer(ctx, `${tag}.${attempt}`, { table: p.tableText, code: p.code }, { edit });
    }
    ctx.log.calls.push({ tag, attempt, cost: reply.cost, s: Math.round((Date.now() - t0) / 1000), ...brief(c) });
    if (c.ok) return c;
  }
  return c || { tag, ok: false, kind: "claude", error: "no answer" };
}

// How well the others' tables agree with this candidate's model: a misread
// in one reading is rarely repeated in all.
function consensus(c, all) {
  if (!c.ok || !c.measure || !existsSync(c.measure)) return 0;
  const m = JSON.parse(readFileSync(c.measure, "utf8"));
  const others = all.filter((o) => o !== c && o.ok && o.table);
  if (!others.length) return null;
  const s = others.map((o) => { try { const t = normalizeTable(parseLooseJSON(o.table)).table; return t ? diffTable(t, m).score : 0; } catch { return 0; } });
  return s.reduce((a, b) => a + b, 0) / s.length;
}

// ------------------------------------------------------------------ generation
async function runGeneration(ctx, inDir) {
  const pngs = readdirSync(inDir).filter((f) => /^input\d*\.png$/.test(f)).sort();
  const images = [];
  const notes = [];
  for (const f of pngs) {
    const [w, h] = await imageSize(join(inDir, f));
    const rects = tileRects(w, h);
    const paths = await cropImage(join(inDir, f), rects, join(ctx.work, f.replace(".png", "")));
    images.push(...paths.map(png));
    notes.push(`${f}: ${tilesNote(rects) || "the whole image"}`);
    if (!ctx.first) ctx.first = { path: join(inDir, f), w, h };
  }
  const desc = existsSync(join(inDir, "description.yaml")) ? readFileSync(join(inDir, "description.yaml"), "utf8") : "";
  const TASK = `${pngs.length > 1 ? `There are ${pngs.length} sheets of the same part.` : ""} ${notes.join(" ")}\nWrite the feature table, then the BREPcode.\n\ndescription.yaml:\n${desc}`;
  const zoomImages = async () => {
    if (!ctx.zoom?.length || !ctx.first) return [];
    const rects = zoomRects(ctx.zoom, ctx.first.w, ctx.first.h);
    return (await cropImage(ctx.first.path, rects, join(ctx.work, "zoom"))).map(png);
  };
  const withPrev = (c, extra) => `${TASK}\n\nYour feature table and code so far:\n\n\`\`\`json\n${c.table ?? "{}"}\n\`\`\`\n\n\`\`\`js\n${c.code}\n\`\`\`\n\n${extra}`;
  const cands = [];

  // 1. read + build
  let best = await generate(ctx, "c0", [...images, txt(TASK)]);
  cands.push(best);
  // 2. self-check -> one fix round
  if (best.ok && args.check && best.check?.issues?.length) {
    const zi = await zoomImages();
    const fixed = await generate(ctx, "c0fix", [...images, ...zi, txt(withPrev(best,
      `${zi.length ? "The last images are the regions you asked to see closer.\n\n" : ""}${fixPrompt(best.check.issues.map((i) => `- ${i}`).join("\n"), { notes: best.check.notes })}`))]);
    cands.push(fixed);
    if (score(fixed) >= score(best)) best = fixed;
  }
  // 3. more candidates while the self-check still disagrees (or nothing built)
  if (args.candidates > 1 && (!best.ok || (args.check && (best.check?.score ?? 0) < 1))) {
    const more = await Promise.all(Array.from({ length: args.candidates - 1 }, (_, i) =>
      generate(ctx, `c${i + 1}`, [...images, txt(`${TASK}\n\n${candidateHint(i + 1)}`)])));
    cands.push(...more);
    for (const c of cands) c.consensus = consensus(c, cands);
    const rank = (c) => (!c.ok ? -1 : 0.6 * (c.check?.score ?? 0) + 0.4 * (c.consensus ?? c.check?.score ?? 0));
    best = cands.reduce((a, b) => (rank(b) > rank(a) ? b : a));
    ctx.log.ranking = cands.map((c) => ({ tag: c.tag, ok: c.ok, own: c.check?.score, consensus: c.consensus, rank: +rank(c).toFixed(3) }));
  }
  // 4. look-compare
  if (best.ok && args.look) {
    const bp = join(ctx.work, "blueprint.png");
    const r = lastJSON((await sh("node", [join(HERE, "lib/blueprint.mjs"), best.step, bp, ctx.id, (best.size || []).join(",")], { timeout: 300 })).out);
    if (r?.ok) {
      copyFileSync(bp, join(ctx.outDir, "blueprint.png"));
      const selfCheck = best.check ? `${best.check.passed}/${best.check.checked} checks agree${best.check.issues?.length ? `; still disagreeing: ${best.check.issues.slice(0, 6).join("; ")}` : ""}` : "";
      const look = await generate(ctx, "look", [...images, png(bp), txt(withPrev(best, lookPrompt({ selfCheck })))]);
      if (look.noChanges) ctx.log.look = "no changes";
      else if (look.ok && score(look) >= score(best) - 0.05) { ctx.log.look = `kept (self-check ${score(best)} -> ${score(look)})`; best = look; cands.push(look); }
      else { ctx.log.look = look.ok ? `rejected (self-check ${score(best)} -> ${score(look)})` : `rejected (${look.kind})`; if (look.tag) cands.push(look); }
    } else ctx.log.look = `blueprint failed: ${r?.error}`;
  }
  ctx.log.candidates = cands.filter((c) => c.tag).map(brief);
  return best;
}

// ------------------------------------------------------------------ editing
async function runEdit(ctx, inDir) {
  ctx.stepIn = join(inDir, "input.step");
  const instruction = readFileSync(join(inDir, existsSync(join(inDir, "edit_description.txt")) ? "edit_description.txt" : "description.yaml"), "utf8").trim();
  // measure the input exactly; a STEP the kernel cannot read is reported
  const m = lastJSON((await sh("node", [join(HERE, "lib/measurestep.mjs"), ctx.stepIn], { timeout: 600 })).out);
  if (!m?.ok) {
    ctx.log.importError = m?.error || "measure timed out";
    // the unedited part is still a valid answer; say so in the log
    copyFileSync(ctx.stepIn, join(ctx.work, "out.fallback.step"));
    return { tag: "fallback-unedited", ok: true, step: join(ctx.work, "out.fallback.step"), fallback: true };
  }
  const rdir = join(inDir, "renders");
  const renders = existsSync(rdir) ? readdirSync(rdir).filter((f) => f.endsWith(".png")).sort() : [];
  const content = [...renders.map((f) => png(join(rdir, f))), txt(`The part, in renders: ${renders.join(", ")}.\n\nTHE APP'S MEASUREMENTS of importedSolid("input.step") (mm, its own frame):\n${m.summary}\n\nTHE INSTRUCTION:\n${instruction}\n\nWrite the edit.`)];
  let best = await generate(ctx, "e0", content, { system: EDIT_SYSTEM, edit: true });
  if (!best.ok) { const again = await generate(ctx, "e1", content, { system: EDIT_SYSTEM, edit: true }); if (again.ok) best = again; }
  ctx.log.candidates = [brief(best)];
  if (!best.ok) {
    // never hand back nothing: the unedited part is valid, and the log says so
    ctx.log.editError = `${best.kind}: ${String(best.error).slice(0, 300)}`;
    copyFileSync(ctx.stepIn, join(ctx.work, "out.fallback.step"));
    return { tag: "fallback-unedited", ok: true, step: join(ctx.work, "out.fallback.step"), fallback: true };
  }
  return best;
}

// ------------------------------------------------------------------ one sample
async function runSample(id) {
  const inDir = join(args.inputs, id), outDir = join(OUT, id);
  mkdirSync(outDir, { recursive: true });
  const work = join(tmpdir(), `cadgen-${args.run}-${id}-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const edit = existsSync(join(inDir, "input.step"));
  const log = { id, task: edit ? "editing" : "generation", calls: [], cost: 0 };
  const ctx = { id, inDir, outDir, work, log };
  const t0 = Date.now();
  let best;
  try { best = edit ? await runEdit(ctx, inDir) : await runGeneration(ctx, inDir); }
  catch (e) { log.error = String(e?.stack || e).slice(0, 1000); }
  if (best?.table) writeFileSync(join(outDir, "table.json"), best.table);
  if (best?.code) writeFileSync(join(outDir, "code.js"), best.code);
  rmSync(join(outDir, "output.step"), { force: true });
  if (best?.ok) copyFileSync(best.step, join(outDir, "output.step"));
  log.ok = !!best?.ok;
  log.kept = best?.tag;
  log.fallback = !!best?.fallback;
  log.selfCheck = best?.check?.score;
  log.attempts = log.calls.length;
  log.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(join(outDir, "log.json"), JSON.stringify(log, null, 1));
  rmSync(work, { recursive: true, force: true });
  console.log(`${id}: ${log.ok ? `STEP ok (${log.kept}${log.selfCheck != null ? `, self-check ${log.selfCheck}` : ""})` : `FAILED (${best?.kind}: ${String(best?.error ?? log.error).slice(0, 120)})`}  calls ${log.attempts}  $${log.cost.toFixed(2)}  ${log.seconds}s`);
  return log;
}

// ------------------------------------------------------------------ all samples
const ids = readdirSync(args.inputs).filter((d) => existsSync(join(args.inputs, d, "input.png")) || existsSync(join(args.inputs, d, "input.step")))
  .filter((d) => !args.only || args.only.some((o) => d.startsWith(o))).sort();
mkdirSync(OUT, { recursive: true });
console.log(`${ids.length} samples -> ${OUT}  (model ${args.model}, ${args.parallel} at a time, ${args.tries} tries, ${args.candidates} candidates, check ${args.check}, look ${args.look})`);
const queue = [...ids], logs = [];
await Promise.all(Array.from({ length: Math.max(1, args.parallel) }, async () => {
  while (queue.length) logs.push(await runSample(queue.shift()));
}));
const ok = logs.filter((l) => l.ok).length;
const cost = logs.reduce((s, l) => s + l.cost, 0);
writeFileSync(join(OUT, "generation.json"), JSON.stringify({ model: args.model, options: args, samples: logs.length, stepOk: ok, cost, logs }, null, 1));
console.log(`\n${ok}/${logs.length} produced a valid exact STEP, $${cost.toFixed(2)} total. Score with: node bench/cadgen/score.mjs ${args.run}`);
process.exit(0);
