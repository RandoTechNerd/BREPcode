#!/usr/bin/env node
// Generator v0: engineering drawing -> BREPcode -> exact STEP, per sample.
//
//   node bench/cadgen/run.mjs --run v0                     every practice sample
//   node bench/cadgen/run.mjs --run v0 --only p01,p07      some of them
//   node bench/cadgen/run.mjs --inputs <dir> --run pub     any CADGenBench-style inputs dir
//
// For each sample the AI (headless Claude Code, tools off, no MCP) gets the
// drawing as an overview plus four zoomed tiles and answers in two parts:
// FIRST a JSON dimension table (overall size, every hole/slot/boss/pocket with
// position, size, depth, cbore/csk), THEN BREPcode built from that table. The
// code is built on the exact lane in a child process (lib/runcode.mjs),
// centred, written as exact STEP and put through cadgenbench's validity gate
// (lib/validity.py). A syntax/build/mesh/validity failure goes back to the AI
// with the error, up to --tries attempts in all.
//
// Output: results/<run>/<sample>/{output.step, table.json, code.js, log.json},
// the layout `cadgenbench evaluate` reads (see score.mjs).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { EXACT_RULES } from "../../src/exactlane.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PY = process.env.CGB_PYTHON || join(HERE, ".venv/bin/python");

const args = { run: "v0", inputs: join(HERE, "practice/data/inputs"), only: null, parallel: 3, tries: 3, model: "claude-opus-5-5", timeout: 900 };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], v = process.argv[i + 1];
  if (a === "--run") args.run = v, i++;
  else if (a === "--inputs") args.inputs = resolve(v), i++;
  else if (a === "--only") args.only = v.split(","), i++;
  else if (a === "--parallel") args.parallel = +v, i++;
  else if (a === "--tries") args.tries = +v, i++;
  else if (a === "--model") args.model = v, i++;
  else if (a === "--timeout") args.timeout = +v, i++;
  else throw new Error(`unknown option ${a}`);
}
const OUT = join(HERE, "results", args.run);

// ------------------------------------------------------------------ prompts
export const BENCH_RULES = `BENCHMARK MODE (CADGenBench). This overrides "reply with code only" above.
You are given an engineering drawing (an overview of the whole sheet, then zoomed tiles of it) of ONE mechanical part. Reproduce the part as one exact solid. It is scored against the true part by: shape similarity (surface distance + volume IoU), interface match (every hole, slot, pocket and boss must sit within 1% of the part size of its true position with the right diameter and depth: a feature that is off scores 0), and topology (number of through-holes, separate bodies, voids).

Read the drawing like a machinist:
- Units are mm. Find the projection (third-angle unless stated): TOP/plan view looks down -Z (X right, Y up the sheet), FRONT looks along +Y (X right, Z up), RIGHT looks along -X (Y right, Z up). Use whatever views and sections exist; hidden (dashed) lines show internal features.
- "4X Ø6.6 THRU" = four holes of diameter 6.6 through. "⌴ Ø11 ↧ 6.5" or "CBORE Ø11 X 6.5 DEEP" = counterbore. "⌵ Ø12 X 90°" or "CSK" = countersink (diameter at the surface, included angle). "↧ 10" = depth 10. "M6x1" tapped = model the tap drill diameter (M3 2.5, M4 3.3, M5 4.2, M6 5, M8 6.8, M10 8.5, M12 10.2) with the stated thread depth. "R5 TYP" = all similar corners. "PCD"/"B.C." = bolt circle diameter; "EQ SP" = equally spaced.
- Every dimension you need is on the drawing; derive positions from chains of dimensions, symmetry and centre lines. Do not guess from pixel measurements when a number exists; if one is truly missing, estimate it from the drawing's scale against a known dimension.

Answer in exactly two fenced blocks, in this order, nothing else:
1. \`\`\`json — the DIMENSION TABLE, written before any code:
{ "frame": "where the origin is and which way each axis points, e.g. origin at the min corner of the bounding box, Z up",
  "overall": { "x": .., "y": .., "z": .. },
  "body": [ "each base solid / step / rib / boss block / cut-out with its dims and position" ],
  "features": [ { "id": "A", "type": "hole|cbore|csk|tapped|slot|pocket|boss|keyway|chamfer|fillet", "count": n,
                  "positions": [[x, y, z], ...],   // centre on the surface it enters, in your frame
                  "axis": "+z|-z|+x|-x|+y|-y",     // outward normal of that surface
                  "dia": .., "depth": .. or "thru", "cbore": {"d": .., "depth": ..}, "csk": {"d": .., "angle": ..},
                  "source": "the callout text you read" } ],
  "uncertain": [ "anything you had to infer" ] }
2. \`\`\`js — BREPcode that builds exactly that table: a statement block ending in \`return <one solid>;\`, no imports.

Code rules for the benchmark:
- ONE solid: union every body piece (overlap unions by 0.5 mm, never just touch), then cut. Never group().
- Work in your table's frame (a min-corner origin is easiest); the harness centres the result on the origin itself.
- Holes: drill([x, y, z], [nx, ny, nz], { d, depth }) with the point ON the entry surface and the outward normal; { through: true } for THRU; counterbore: cbore: { d, depth }; countersink: csink: { d, angle } (d at the surface). Or translate a cylinder that overshoots both faces by 1 mm.
- rotate([a, b, c]) turns about Z FIRST, then Y, then X (not OpenSCAD's order). Turn about one axis per call and nest them when you need two: rotate([0, 0, 90], rotate([90, 0, 0], s)) turns s about X, then about Z. A profile for a rib or gusset standing in the YZ plane: polygon in (y, z), linearExtrude({ h: t }) along +Z, then rotate([0, 0, 90], rotate([90, 0, 0], ...)) maps (px, py, extrude) to (x = extrude, y = px, z = py).
- NEVER put $fn on cylinders, cones, holes or round bosses: the kernel builds true circles, and $fn 3-8 would turn a hole into a polygon. (Only use $fn: 6 for a hex on purpose.)
- Stay on the exact lane: no plain hull(), roundedGrow, minkowski(mm), tube, texture, blob, text. Rounded rectangles: fillet({ r, edges: "z" }, cube(...)). Slots: hull({ exact: true }, cylinder, cylinder) (equal upright cylinders). Chamfer/fillet a body piece before unioning it.
- Holes that cross other holes or slots: cut them one difference() at a time. Cut bores first, then saw slots that run into them.
- Prefer simple, robust geometry: a small fillet you cannot place reliably is worth less than a valid solid. Never omit a hole, slot, pocket or boss.`;

const SYSTEM = [readFileSync(join(ROOT, "LLM_PROMPT.md"), "utf8"), EXACT_RULES, BENCH_RULES].join("\n\n---\n\n");

const TASK = "Here is the drawing: the whole sheet first, then four zoomed tiles (top-left, top-right, bottom-left, bottom-right) of the same sheet. Write the dimension table, then the BREPcode.";

// ------------------------------------------------------------------ helpers
function sh(cmd, argv, { input, timeout = 600, cwd } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, argv, { cwd, env: process.env });
    let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); err += `\n[timeout after ${timeout}s]`; }, timeout * 1000);
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => { clearTimeout(t); res({ code, out, err }); });
    if (input != null) p.stdin.end(input); else p.stdin.end();
  });
}

const png = (path) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(path).toString("base64") } });

async function askClaude(content, workdir) {
  const msg = JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n";
  const r = await sh("claude", ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
    "--model", args.model, "--strict-mcp-config", "--tools", "", "--system-prompt", SYSTEM], { input: msg, timeout: args.timeout, cwd: workdir });
  const lines = r.out.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const res = lines.find((l) => l.type === "result");
  if (!res || res.is_error) throw new Error(`claude failed: ${(res?.result || r.err || r.out).slice(0, 500)}`);
  return { text: res.result || "", cost: res.total_cost_usd || 0 };
}

function blocks(text) {
  const json = /```json\s*\n([\s\S]*?)```/.exec(text)?.[1];
  const js = [...text.matchAll(/```(?:js|javascript)\s*\n([\s\S]*?)```/g)].map((m) => m[1]).pop();
  return { json, js };
}

// ------------------------------------------------------------------ one sample
async function runSample(id) {
  const inDir = join(args.inputs, id), outDir = join(OUT, id);
  mkdirSync(outDir, { recursive: true });
  const work = join(tmpdir(), `cadgen-${args.run}-${id}-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const tiles = join(work, "tiles");
  await sh(PY, ["-I", join(HERE, "lib/tiles.py"), join(inDir, "input.png"), tiles]);
  const desc = existsSync(join(inDir, "description.yaml")) ? readFileSync(join(inDir, "description.yaml"), "utf8") : "";
  const images = ["overview", "tile_00", "tile_01", "tile_10", "tile_11"].map((n) => png(join(tiles, `${n}.png`)));
  const log = { id, attempts: [], cost: 0 };
  const t0 = Date.now();
  let table = null, code = null, best = null;

  for (let attempt = 1; attempt <= args.tries; attempt++) {
    let content;
    if (attempt === 1 || !code) {
      content = [...images, { type: "text", text: `${TASK}\n\ndescription.yaml:\n${desc}` }];
    } else {
      const last = log.attempts.at(-1);
      content = [...images, { type: "text", text: `${TASK}\n\nYour previous answer for this drawing is below; it FAILED. Fix it and answer again in the same two-block format (re-check the table against the drawing too).\n\n\`\`\`json\n${table ?? "{}"}\n\`\`\`\n\n\`\`\`js\n${code}\n\`\`\`\n\nFailure (${last.kind}): ${last.error}` }];
    }
    const a = { attempt };
    try {
      const { text, cost } = await askClaude(content, work);
      log.cost += cost;
      const b = blocks(text);
      if (b.json) table = b.json;
      if (!b.js) throw Object.assign(new Error("no ```js block in the answer"), { kind: "format" });
      code = b.js;
      writeFileSync(join(outDir, `code.${attempt}.js`), code);
      const stepPath = join(work, `out.${attempt}.step`);
      const codePath = join(work, `code.${attempt}.js`);
      writeFileSync(codePath, code);
      const r = await sh("node", [join(HERE, "lib/runcode.mjs"), codePath, stepPath], { timeout: 300 });
      let rc;
      try { rc = JSON.parse(r.out.trim().split("\n").pop()); } catch { rc = { ok: false, kind: "build", error: (r.err || r.out || "no output").slice(-800) }; }
      Object.assign(a, rc);
      if (!rc.ok) throw Object.assign(new Error(rc.error), { kind: rc.kind });
      const v = await sh(PY, ["-I", join(HERE, "lib/validity.py"), stepPath], { timeout: 300 });
      let val;
      try { val = JSON.parse(v.out.trim().split("\n").pop()); } catch { val = { valid: false, errors: [v.err.slice(-400)] }; }
      a.validity = val;
      if (!val.valid) throw Object.assign(new Error(`the STEP failed the validity gate: ${val.errors.join("; ")}`), { kind: "invalid" });
      best = stepPath;
      log.attempts.push(a);
      break;
    } catch (e) {
      a.ok = false; a.kind = e.kind || a.kind || "claude"; a.error = String(e.message || e).slice(0, 1500);
      log.attempts.push(a);
    }
  }
  if (table) writeFileSync(join(outDir, "table.json"), table);
  if (code) writeFileSync(join(outDir, "code.js"), code);
  rmSync(join(outDir, "output.step"), { force: true });
  if (best) copyFileSync(best, join(outDir, "output.step"));
  log.ok = !!best;
  log.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(join(outDir, "log.json"), JSON.stringify(log, null, 1));
  rmSync(work, { recursive: true, force: true });
  const last = log.attempts.at(-1);
  console.log(`${id}: ${log.ok ? "STEP ok" : `FAILED (${last?.kind}: ${String(last?.error).slice(0, 120)})`}  attempts ${log.attempts.length}  $${log.cost.toFixed(2)}  ${log.seconds}s`);
  return log;
}

// ------------------------------------------------------------------ all samples
const ids = readdirSync(args.inputs).filter((d) => existsSync(join(args.inputs, d, "input.png")))
  .filter((d) => !args.only || args.only.some((o) => d.startsWith(o))).sort();
mkdirSync(OUT, { recursive: true });
console.log(`${ids.length} samples -> ${OUT}  (model ${args.model}, ${args.parallel} at a time, ${args.tries} tries)`);
const queue = [...ids], logs = [];
await Promise.all(Array.from({ length: Math.max(1, args.parallel) }, async () => {
  while (queue.length) logs.push(await runSample(queue.shift()));
}));
const ok = logs.filter((l) => l.ok).length;
const cost = logs.reduce((s, l) => s + l.cost, 0);
writeFileSync(join(OUT, "generation.json"), JSON.stringify({ model: args.model, samples: logs.length, stepOk: ok, cost, logs }, null, 1));
console.log(`\n${ok}/${logs.length} produced a valid exact STEP, $${cost.toFixed(2)} total. Score with: node bench/cadgen/score.mjs ${args.run}`);
process.exit(0);
