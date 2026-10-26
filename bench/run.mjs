// BREPcode prompt benchmark: hard, printable models from a plain sentence.
//
// For each prompt in bench/prompts.json: Claude writes BREPcode (headless
// `claude -p`, given the same LLM_PROMPT.md the app's chat uses), BREPcode
// builds it on the kernel chain (NVIDIA SMLib -> next.BREP.io Rust -> BREP.io
// JS), a failed build goes back to Claude with the kernel's error (up to
// --attempts), and the result is scored for printability. With --shots, every
// finished model is also photographed in the real viewer (headless Chrome) in
// Code and Design mode: material for a video.
//
//   node bench/run.mjs [--only id,id] [--model claude-opus-5-5] [--attempts 3]
//                      [--engine nvidia|split|js] [--shots http://localhost:5326/viewer/index.html]
//
// Writes bench/results/<stamp>/: per prompt <id>.js, <id>.stl, <id>-*.png,
// plus scores.json, report.md and report.html.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXACT_CORE } from "../src/exactlane.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = arg("model", "claude-opus-5-5");
const ATTEMPTS = +arg("attempts", 3);
const ENGINE = arg("engine", "nvidia");
const SHOTS = arg("shots", null);
const ONLY = arg("only", null)?.split(",");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.join(HERE, "results", stamp);
mkdirSync(OUT, { recursive: true });

const prompts = JSON.parse(readFileSync(path.join(HERE, "prompts.json"), "utf8")).filter((p) => !ONLY || ONLY.includes(p.id));
const DOC = readFileSync(path.join(ROOT, "LLM_PROMPT.md"), "utf8");
const PRINT_RULES = `This will be 3D printed (FDM, 0.4 mm nozzle). Every part rests flat on z = 0; separate parts sit side by side on the bed with 5 mm gaps, never floating or overlapping; avoid overhangs steeper than 45 degrees unless they bridge; moving clearances 0.3 to 0.4 mm; walls at least 1.2 mm; the whole layout fits a 256 x 256 mm bed. Put every important size in a named const at the top. rotate([a, b, c]) turns about Z first, then Y, then X (three.js order), the reverse of OpenSCAD; check every rotated piece lands where you meant.`;

const log = (s) => { process.stdout.write(s + "\n"); };

// ---------------------------------------------------------------- Claude
// CLAUDE_BIN, else the newest Claude Code the desktop app bundles (a global
// `claude` can lag behind and refuse newer models), else `claude` on PATH.
const CLAUDE = (() => {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const base = process.env.APPDATA && path.join(process.env.APPDATA, "Claude", "claude-code");
  if (base && existsSync(base)) {
    const vers = readdirSync(base).filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .sort((a, b) => a.split(".").map(Number).reduce((r, x, i) => r || x - b.split(".").map(Number)[i], 0)).reverse();
    for (const v of vers) for (const h of readdirSync(path.join(base, v))) {
      const exe = path.join(base, v, h, "claude.exe");
      if (existsSync(exe)) return exe;
    }
  }
  return "claude";
})();
function ask(text) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(CLAUDE, ["-p", "--model", MODEL, "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"],
      { shell: CLAUDE === "claude" && process.platform === "win32", stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const kill = setTimeout(() => p.kill(), 15 * 60 * 1000);
    p.on("close", () => {
      clearTimeout(kill);
      let j = null;
      try { j = JSON.parse(out); } catch { /* reported below */ }
      const text = j?.result || "";
      const apiError = j?.is_error || /^API Error/.test(text);
      resolve({ text: apiError ? "" : text, cost: j?.total_cost_usd || 0, ms: Date.now() - t0, error: j ? (apiError ? text.slice(0, 400) : null) : (err || out).slice(0, 400) });
    });
    p.stdin.end(text);
  });
}
const codeOf = (reply) => {
  const blocks = [...reply.matchAll(/```(?:js|javascript|scad|openscad)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  return (blocks.sort((a, b) => b.length - a.length)[0] || reply).trim();
};

// ---------------------------------------------------------------- BREPcode
function buildOne(codeFile, stlFile) {
  const r = spawnSync(process.execPath, [path.join(HERE, "buildone.mjs"), codeFile, stlFile, ENGINE],
    { cwd: ROOT, encoding: "utf8", timeout: 5 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === "ETIMEDOUT" || r.signal) return { ok: false, stage: "build", error: "timed out after 5 minutes" };
  const line = (r.stdout || "").trim().split("\n").pop();
  try { return JSON.parse(line); } catch { return { ok: false, stage: "build", error: (r.stderr || r.stdout || "no output").slice(-600) }; }
}

// what a slicer would complain about, in words the AI can act on
function printIssues(b) {
  const out = [];
  if (!b.watertight) out.push("the mesh is not watertight (open edges or self-intersections)");
  if (!b.onBed) out.push(`${b.floating} separate bod${b.floating === 1 ? "y floats" : "ies float"} above z = 0; every part must rest on the bed`);
  if (b.belowBed) out.push(`${b.belowBed} bod${b.belowBed === 1 ? "y reaches" : "ies reach"} below z = 0 (lowest point z = ${b.minZ}); the part must start at z = 0`);
  if (b.overhangPct > 5) out.push(`${b.overhangPct}% of the surface faces down steeper than 45 degrees; chamfer those undersides to 45 degrees, reorient the part, or make them short bridges`);
  if (!b.fitsBed) out.push(`the layout is ${b.size.join(" x ")} mm; it must fit 256 x 256 x 256 mm`);
  return out;
}
function score(b) {
  if (!b?.ok) return 0;
  let s = 40;                                              // it builds
  if (b.watertight) s += 20;
  if (b.onBed) s += 15;
  s += Math.round(15 * Math.max(0, 1 - b.overhangPct / 20)); // 0% overhang = 15, 20%+ = 0
  if (b.fitsBed) s += 10;
  return s;
}

// ---------------------------------------------------------------- screenshots
async function photograph(url, id, code) {
  const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => existsSync(p));
  if (!CHROME) return [];
  const port = 9400 + Math.floor(Math.random() * 400);
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--window-size=1600,900", "--hide-scrollbars",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "bench-"))}`, "about:blank"], { stdio: "ignore" });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const saved = [];
  try {
    let targets;
    for (let i = 0; i < 40 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await wait(250); } }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    let seq = 0; const pending = new Map();
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    // every DevTools call gives up after 60 s: a page that hangs (a model the
    // viewer chokes on) must cost one screenshot, not the whole run
    const send = (method, params = {}) => Promise.race([
      new Promise((r) => { const n = ++seq; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); }),
      new Promise((_, no) => setTimeout(() => no(new Error(`${method} timed out`)), 60000)),
    ]);
    const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
    const shot = async (name) => {
      const r = await send("Page.captureScreenshot", { format: "png" });
      const f = path.join(OUT, `${id}-${name}.png`);
      writeFileSync(f, Buffer.from(r.result.data, "base64"));
      saved.push(path.basename(f));
    };
    await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    // a returning visitor: no welcome card over the model
    await send("Page.addScriptToEvaluateOnNewDocument", { source: "try { localStorage.setItem('brepcode-welcomed', '1'); } catch {}" });
    await send("Page.navigate", { url });
    for (let i = 0; i < 60 && !(await js("!!window.__brepAgent")); i++) await wait(500);
    await js(`document.querySelectorAll('button[title=Close]').forEach(b=>{try{b.click()}catch{}}); document.getElementById('brep-example-note')?.remove(); 1`);
    const state = await js(`window.__brepAgent.run({ action: "set_code", code: ${JSON.stringify(code)}, name: ${JSON.stringify(id)} }).then(s => JSON.stringify(s?.status || s))`);
    for (let i = 0; i < 120; i++) {                          // until the build settles
      const st = await js(`document.getElementById('status')?.textContent || ''`);
      if (st && !/build/i.test(st)) break;
      await wait(1000);
    }
    await js(`window.__brepAgent.run({ action: "set_view", view: "home" }).then(() => window.__brepAgent.run({ action: "fit" })).then(() => 1)`);
    await wait(1500);
    await shot("code");                                     // the model with its code beside it
    const closeEditor = `(() => { const c = document.getElementById("panel"); if (c && c.classList.contains("open")) document.querySelector('[data-close="panel"]')?.click(); return 1 })()`;
    await js(closeEditor);
    await js(`window.__brepAgent.run({ action: "fit" }).then(() => 1)`);
    await wait(1500);
    await shot("hero");                                     // just the model
    await js(`window.brepscript.setMode && window.brepscript.setMode("design"); 1`);
    await js(closeEditor);
    await wait(1500);
    await shot("design");
    await js(`window.brepscript.setMode && window.brepscript.setMode("code"); window.__brepAgent.run({ action: "set_view", view: "top" }).then(() => window.__brepAgent.run({ action: "fit" })).then(() => 1)`);
    await wait(1500);
    await shot("top");
    if (!state) log(`    (viewer gave no build state for ${id})`);
  } catch (e) { log(`    screenshots failed: ${e.message}`); }
  try { chrome.kill(); } catch { /* gone */ }
  return saved;
}

// ---------------------------------------------------------------- the run
log(`claude: ${CLAUDE} · model ${MODEL} · engine ${ENGINE}`);
const rows = [];
for (const p of prompts) {
  log(`\n== ${p.id}: ${p.prompt}`);
  let reply = await ask(`${DOC}\n\n${EXACT_CORE}\n\n---\n\nWrite a BREPcode model for this request.\n\nRequest: ${p.prompt}\n\n${PRINT_RULES}\n\nReply with ONLY the complete editor code in one \`\`\`js block (named consts at the top, then \`return <shape>;\`).`);
  const tries = [];
  let best = null, bestCode = "", code = "", cost = reply.cost;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (reply.error && !reply.text) { tries.push({ attempt, error: `claude: ${reply.error}` }); break; }
    code = codeOf(reply.text);
    const codeFile = path.join(OUT, `${p.id}.js`), stlFile = path.join(OUT, `${p.id}.stl`);
    writeFileSync(codeFile, code);
    const b = buildOne(codeFile, stlFile);
    tries.push({ attempt, ok: b.ok, error: b.error || null, ms: b.ms, aiMs: reply.ms, score: score(b) });
    log(`  try ${attempt}: ${b.ok ? `built on ${b.kernel} (${b.lane}) in ${b.ms} ms; watertight ${b.watertight}, on bed ${b.onBed}, overhang ${b.overhangPct}%` : `failed: ${String(b.error).slice(0, 160)}`}`);
    if (!best || score(b) > score(best)) { best = b; bestCode = code; }
    const problems = b.ok ? printIssues(b) : [];
    if (b.ok && !problems.length) break;
    if (attempt >= ATTEMPTS) break;
    const why = b.ok
      // it builds but won't print well: hand the measured problems back
      ? `builds, but a print check found:\n\n${problems.map((x) => `- ${x}`).join("\n")}\n\nFix those problems without losing any requested feature.`
      : `failed to build:\n\n${b.error}\n\nFix it.`;
    reply = await ask(`${DOC}\n\n${EXACT_CORE}\n\n---\n\nThis BREPcode model for "${p.prompt}" ${why}\n\nThe code:\n\`\`\`js\n${code}\n\`\`\`\n\n${PRINT_RULES}\n\nReply with ONLY the complete corrected code in one \`\`\`js block.`);
    cost += reply.cost;
  }
  if (bestCode && bestCode !== code) {                       // a later try scored worse: keep the best
    code = bestCode;
    writeFileSync(path.join(OUT, `${p.id}.js`), code);
    buildOne(path.join(OUT, `${p.id}.js`), path.join(OUT, `${p.id}.stl`));
  }
  const row = { ...p, score: score(best), attempts: tries.length, tries, build: best, costUsd: +cost.toFixed(3), codeLines: code.split("\n").length };
  if (SHOTS && best?.ok) {
    // and the whole photo session is capped too
    row.shots = await Promise.race([photograph(SHOTS, p.id, code), new Promise((r) => setTimeout(() => r([]), 6 * 60 * 1000))]);
  }
  rows.push(row);
  writeFileSync(path.join(OUT, "scores.json"), JSON.stringify({ model: MODEL, engine: ENGINE, stamp, rows }, null, 1));
}

// ---------------------------------------------------------------- report
const built = rows.filter((r) => r.build?.ok);
const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
const byKernel = built.reduce((m, r) => ((m[r.build.kernel] = (m[r.build.kernel] || 0) + 1), m), {});
const md = [
  `# BREPcode prompt benchmark, ${stamp}`,
  ``,
  `Model: ${MODEL} · engine chain: ${ENGINE} · up to ${ATTEMPTS} tries per prompt`,
  ``,
  `**Average score ${avg}/100** · built ${built.length}/${rows.length} · watertight ${built.filter((r) => r.build.watertight).length} · on the bed ${built.filter((r) => r.build.onBed).length} · kernels: ${Object.entries(byKernel).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`,
  ``,
  `| Prompt | Score | Tries | Kernel | Build | Watertight | On bed | Overhang | Size (mm) | AI cost |`,
  `|---|---|---|---|---|---|---|---|---|---|`,
  ...rows.map((r) => {
    const b = r.build || {};
    return `| ${r.id} | ${r.score} | ${r.attempts} | ${b.ok ? b.kernel : "-"} | ${b.ok ? `${b.ms} ms` : "failed"} | ${b.ok ? (b.watertight ? "yes" : "NO") : "-"} | ${b.ok ? (b.onBed ? "yes" : `${b.floating} floating`) : "-"} | ${b.ok ? `${b.overhangPct}%` : "-"} | ${b.ok ? b.size.join(" × ") : "-"} | $${r.costUsd} |`;
  }),
  ``,
  `Score: builds 40, watertight 20, every body on the bed 15, overhangs past 45° (15 at 0% of the surface, 0 at 20%+), fits a 256 mm bed 10.`,
  ``,
  ...rows.filter((r) => !r.build?.ok).map((r) => `- **${r.id}** failed: ${String(r.build?.error || r.tries.at(-1)?.error).slice(0, 300)}`),
].join("\n");
writeFileSync(path.join(OUT, "report.md"), md + "\n");
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const html = `<!doctype html><meta charset="utf-8"><title>BREPcode prompt benchmark</title>
<style>body{background:#0b0f16;color:#e8eefc;font:15px/1.5 "Segoe UI",system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 16px}
h1{font-size:28px}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border-bottom:1px solid #26314a;padding:6px 8px;text-align:left}
.card{background:#121826;border:1px solid #2a3654;border-radius:12px;padding:16px;margin:18px 0}.shots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.shots img{width:100%;border-radius:8px;border:1px solid #26314a}pre{background:#0a0e15;padding:12px;border-radius:8px;overflow:auto;max-height:280px;font-size:12.5px}
.s{font-size:22px;font-weight:700;color:#4ea1ff}</style>
<h1>BREPcode prompt benchmark</h1><p>${esc(stamp)} · ${esc(MODEL)} · ${esc(ENGINE)} chain · average <b>${avg}/100</b></p>
${rows.map((r) => `<div class="card"><div class="s">${r.score}/100 · ${esc(r.id)}</div><p>${esc(r.prompt)}</p>
<p>${r.build?.ok ? `Built on <b>${esc(r.build.kernel)}</b> in ${r.build.ms} ms after ${r.attempts} tr${r.attempts === 1 ? "y" : "ies"}; watertight ${r.build.watertight}; on the bed ${r.build.onBed}; overhang ${r.build.overhangPct}%; ${r.build.size.join(" × ")} mm` : `Failed: ${esc(String(r.build?.error || "").slice(0, 300))}`}</p>
${r.shots?.length ? `<div class="shots">${r.shots.map((s) => `<img src="${esc(s)}">`).join("")}</div>` : ""}
<details><summary>Code</summary><pre>${esc(readFileSync(path.join(OUT, `${r.id}.js`), "utf8"))}</pre></details></div>`).join("")}`;
writeFileSync(path.join(OUT, "report.html"), html);
log(`\n${md}\n\nResults: ${OUT}`);
process.exit(0);
