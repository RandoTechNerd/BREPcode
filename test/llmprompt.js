// The authoring guide handed to OTHER models.
//
// LLM_PROMPT.md is what someone pastes into Gemini, GPT, or an editor's
// assistant to make it write BREPcode. Nothing enforces it — no build step
// reads it — which is exactly why it rotted: it spent a long release cycle
// telling models to REFUSE hull, minkowski, fillet, chamfer, revolve and
// importedMesh, every one of which the DSL had already gained.
//
// That is worse than a stale document. A guide that bans working features
// makes an outside model decline work the app can do and write clumsy
// workarounds for problems that no longer exist.
//
// So: the vocabulary it teaches is checked against the real exports, parsed
// STATICALLY from source. Importing index.js here would pull in the CAD kernel
// and put minutes on every suite run; the export list is a grep away.
//
// The examples are built for real by scripts/check-llm-prompt.mjs, which is
// too slow for the chain but is the thing to run after editing the guide.

import { readFileSync, readdirSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const DOC = readFileSync(new URL("../LLM_PROMPT.md", import.meta.url), "utf8");

// Every name index.js re-exports, without running any of it.
//
// FOLLOWING the export chain, not scanning src/ wholesale. The first version
// swept every file and so counted `offset` from src/jscad.js — which is the
// JSCAD translator's internal surface, not a BREPcode word, and is exactly
// the sort of name the guide is right to say does not exist.
const srcDir = new URL("../src/", import.meta.url);
const real = new Set();
const readModule = (file) => {
  let text;
  try { text = readFileSync(new URL(file, srcDir), "utf8"); } catch { return; }
  for (const m of text.matchAll(/^export function ([a-zA-Z0-9_]+)/gm)) real.add(m[1]);
  for (const m of text.matchAll(/^export const ([a-zA-Z0-9_]+)\s*=/gm)) real.add(m[1]);
  for (const m of text.matchAll(/^export \* from "\.\/([a-zA-Z0-9_.-]+)"/gm)) readModule(m[1]);
};
readModule("dsl.js");                                    // export * from "./src/dsl.js"
for (const n of ["build", "toSTL", "stats", "fromOpenSCAD", "looksLikeOpenSCAD"]) real.add(n);
// (readdirSync stays imported so the intent above is legible against the diff)
void readdirSync;

console.log("\nit teaches words that exist\n");
{
  check("the export list was found", real.size > 80, `${real.size} exports`);
  const vocab = DOC.slice(DOC.indexOf("## The vocabulary"), DOC.indexOf("## What genuinely is not available"));
  check("the vocabulary section was found", vocab.length > 500);
  const prose = new Set(["shape", "solids", "cylinders", "profile", "size", "list", "hex", "stl", "mm"]);
  const named = [...new Set([...vocab.matchAll(/\b([a-zA-Z][a-zA-Z0-9]{2,})\s*[({/]/g)].map((m) => m[1]))];
  const invented = named.filter((n) => !real.has(n) && !prose.has(n));
  check(`every callable word it names is real (${named.length} checked)`,
    invented.length === 0, invented.join(", "));
}

console.log("\n...and does not ban the ones it has\n");
{
  // The exact regression. Each of these was on the old "hard constraints" list.
  for (const w of ["hull", "minkowski", "fillet", "chamfer", "revolve", "importedMesh"]) {
    check(`${w} exists, so the guide must not forbid it`, real.has(w));
  }
  const banned = DOC.slice(DOC.indexOf("## What genuinely is not available"),
    DOC.indexOf("## Rules that prevent broken geometry"));
  const wrong = ["hull", "minkowski", "fillet", "chamfer", "rotate_extrude", "revolve"]
    .filter((w) => new RegExp(`\`${w}\``).test(banned));
  check("...and the not-available list names none of them", wrong.length === 0, wrong.join(", "));
  check("what it does rule out is genuinely absent",
    ["offset", "projection", "surface"].every((w) => !real.has(w)));
  check("...and it says where text() actually lives, rather than banning it",
    /`text\(\)`[\s\S]{0,120}app's editor only/.test(banned),
    "text exists in viewer/codes.js but not in the npm package");
}

console.log("\nit is called BREPcode, except where the package really is not\n");
{
  check("no stale 'BrepScript' in the prose", !/BrepScript/.test(DOC),
    "the language was renamed; the guide is what outsiders read");
  check("...but the npm specifier is still stated truthfully",
    /from "brepscript"/.test(DOC) && /still named `brepscript`/.test(DOC),
    "the package name did not change — pretending otherwise breaks the import");
}

console.log("\nit carries the rules that were learned the hard way\n");
{
  check("union fuses, group keeps apart — the colour trap",
    /union FUSES its arguments\s*\n?\s*into ONE solid/.test(DOC));
  check("...and points at colorByHeight for the common case", /colorByHeight\(\)` does it for/.test(DOC));
  check("height is measured from the model, not from z = 0",
    /A model does not necessarily sit on the\s*\n?\s*plate/.test(DOC),
    "an imported model spanning z -20..+28 is why a 0..0.9 cut looked like the part vanishing");
  check("triangles cost build time", /2 ms of build per triangle/.test(DOC));
  check("it says the in-app chat does this better", /Chatting \*\*inside BREPcode\*\* is better/.test(DOC),
    "the app adds a harness, a recipe library and a retry loop this file cannot");
}

console.log("\nand there is a way to prove the examples still build\n");
{
  const script = readFileSync(new URL("../scripts/check-llm-prompt.mjs", import.meta.url), "utf8");
  check("the checker exists", /```js\\n\(\[\\s\\S\]\*\?\)```/.test(script) || /matchAll/.test(script));
  check("...and it really builds them", /await api\.build\(shape\)/.test(script));
  check("...and fails the process when one does not", /process\.exit\(bad \? 1 : 0\)/.test(script));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
