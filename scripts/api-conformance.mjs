// Does the prompt actually produce buildable models?
//
//   set ANTHROPIC_API_KEY=...        (or export, on a POSIX shell)
//   node scripts/api-conformance.mjs
//   node scripts/api-conformance.mjs --model claude-opus-4-8 --runs 2
//
// Sends a spread of realistic requests through the SAME composeSystem() the app
// uses, then does what the app does with the reply: pull the fenced code, check
// the safety gate, evaluate it, and build it in the real kernel. A request only
// passes if a solid comes out the other end.
//
// The key is read from the environment and never printed, stored or sent
// anywhere except api.anthropic.com.
//
// Why this exists: the offline suites prove our own examples build, but they
// cannot catch the prompt leading a model somewhere the examples never went —
// which is exactly how "colorize isn't a BREPcode word" reached a user.

// IMPORTANT: this has to do what the VIEWER does, not something stricter. The
// first run scored 7/15 and eight of the failures were this script's fault:
//
//   - Five "missing return" — the app repairs that automatically via
//     addImplicitReturn(), so the user never sees it. Judging without the repair
//     measured a bug that does not exist.
//   - Two "text/qrcode is not defined" — those live in the viewer's lazily
//     loaded vocabulary, not in the DSL, so the script simply hadn't given the
//     model the words the prompt promises it.
//
// Only one failure was real. A test that cries wolf about its own harness is
// worse than no test, so every gap below is now closed against the viewer.
import { composeSystem } from "../viewer/chatbot.js";
import { addImplicitReturn, declaredNames } from "../viewer/assist.js";
import * as dsl from "../index.js";
import { build, toSTL } from "../index.js";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error("Set ANTHROPIC_API_KEY first. It is read from the environment and never written anywhere.");
  process.exit(2);
}
const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const MODEL = arg("model", "claude-opus-4-8");
const RUNS = Number(arg("runs", 1));

// A spread across the things people actually ask for, weighted toward the
// places the prompt makes specific promises — colour, text, codes, imports,
// supports — because that is where a wrong instruction hides.
const PROMPTS = [
  "a box with a cone on top",
  "a phone stand for a 147x72x8 phone",
  "a picture frame for a 4x6 photo",
  "a AAA battery holder, 3 cells side by side",
  "a wall bracket with two M4 screw holes",
  "a pen holder with a drain hole",
  "an ornate gold-coloured frame for a 31x54mm photo",
  "a nameplate that says HELLO in raised letters",
  "a hollow box with 2.4mm walls, open at the top",
  "a plate 80x40x5 with a 12mm hole punched through the middle",
  "a hexagonal coaster with rounded edges",
  "a vase made by revolving a curved profile",
  "a keychain tag with a QR code linking to example.com",
  "a bracket with removable support fins on the +x side",
  "make a cylinder 40mm across and twice as tall as it is wide",
];

// The viewer folds the 2D code operators into the vocabulary after its lazy
// import lands, and the prompt tells the model it may use them. They need real
// geometry so a nameplate or a QR tag can be judged on whether it BUILDS — a
// stub returning a plate of the right footprint does that without dragging the
// browser-only code generator into node.
const vocab = { ...dsl };
for (const op of ["text", "qrcode", "datamatrix", "barcode", "stencil"]) {
  vocab[op] = (o = {}) => {
    const size = Number(o.size ?? o.height ?? 10) || 10;
    const chars = String(o.text ?? o.data ?? o.value ?? "").length || 4;
    return dsl.cube([size * chars * 0.6, size, Number(o.depth ?? o.h ?? 1) || 1]);
  };
}
const names = Object.keys(vocab).filter((k) => typeof vocab[k] === "function");
const values = names.map((n) => vocab[n]);

// The same gate the app applies before it will run a reply.
const UNSAFE = /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|document|window|globalThis|navigator|eval|atob|btoa|sendBeacon)\b|\bimport\s*\(|\bFunction\s*\(|\.cookie/;
function unsafe(src) {
  let masked = "", q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], p = src[i - 1];
    if (q) { if (c === q && p !== "\\") q = null; masked += " "; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; masked += " "; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; masked += "\n"; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i); if (e < 0) break; masked += " ".repeat(e + 2 - i); i = e + 1; continue; }
    masked += c;
  }
  return UNSAFE.test(masked);
}

// Mirrors evaluate() in viewer/index.html, repairs and all. `repaired` records
// what the app had to fix, so a pass that needed help still reports it — the
// prompt is doing worse than a bare pass count suggests when this fills up.
const evalCode = (src, repaired) => {
  const shadowed = declaredNames(src, names);
  if (shadowed.length) repaired.push(`dropped shadowed ${shadowed.join(", ")}`);
  const ns = names.filter((n) => !shadowed.includes(n));
  const vs = values.filter((_, i) => !shadowed.includes(names[i]));

  let fn, statementForm = false;
  try { fn = new Function(...ns, `"use strict"; return (\n${src}\n);`); }
  catch { fn = new Function(...ns, `"use strict";\n${src}`); statementForm = true; }
  const out = fn(...vs);

  if (out === undefined && statementForm) {
    const withReturn = addImplicitReturn(src);
    if (withReturn) {
      try {
        const retry = new Function(...ns, `"use strict";\n${withReturn}`)(...vs);
        if (retry !== undefined) { repaired.push("inserted the missing return"); return retry; }
      } catch { /* the guess didn't parse — keep the honest failure */ }
    }
  }
  return out;
};

async function ask(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: composeSystem({}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
}

const results = [];
for (let run = 0; run < RUNS; run++) {
  for (const prompt of PROMPTS) {
    const row = { prompt, run: run + 1, ok: false, why: "" };
    try {
      const answer = await ask(prompt);
      const fence = /```[\w]*\n([\s\S]*?)```/.exec(answer);
      if (!fence) { row.why = "no code block"; results.push(row); report(row); continue; }
      const code = fence[1].trim();
      if (unsafe(code)) { row.why = "blocked by the safety gate"; results.push(row); report(row); continue; }
      const repaired = [];
      let shape;
      try { shape = evalCode(code, repaired); }
      catch (e) { row.why = `did not evaluate: ${e.message.slice(0, 70)}`; results.push(row); report(row); continue; }
      if (!shape || !shape.__brepscript) { row.why = "evaluated but produced no shape, and no repair could recover one"; results.push(row); report(row); continue; }
      const stl = toSTL(await build(shape), "t");
      const tris = (stl.match(/facet normal/g) || []).length;
      if (!tris) { row.why = "built with no geometry"; results.push(row); report(row); continue; }
      row.ok = true;
      row.repaired = repaired;
      row.why = `${tris} triangles${repaired.length ? ` (app ${repaired.join("; ")})` : ""}`;
    } catch (e) {
      row.why = e.message.slice(0, 90);
    }
    results.push(row);
    report(row);
  }
}

function report(r) {
  console.log(`${r.ok ? "  ok  " : "  FAIL"} ${r.prompt.slice(0, 46).padEnd(48)} ${r.why}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} produced a model that builds`);
if (failed.length) {
  console.log("\nwhat the prompt failed to carry:");
  for (const f of failed) console.log(`  - "${f.prompt}" -> ${f.why}`);
}
// Passes that needed repairing are the early warning. They cost the user
// nothing today, but each one is the prompt failing to say something clearly,
// and the repairs only cover the cases we already thought of.
const helped = results.filter((r) => r.ok && r.repaired?.length);
if (helped.length) {
  console.log(`\n${helped.length}/${results.length} only passed because the app repaired them:`);
  for (const h of helped) console.log(`  - "${h.prompt}" -> ${h.repaired.join("; ")}`);
}
process.exit(failed.length ? 1 : 0);
