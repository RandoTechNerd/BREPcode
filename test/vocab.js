// The prompt must only promise words that exist.
//
// This suite exists because it didn't. The harness advertised colorize() as a
// BREPcode word for a long time; it was never implemented, so every model that
// tried to colour anything died with "colorize isn't a BREPcode word" — and the
// user saw the failure, not us. A hand-written vocabulary list drifts from the
// real one silently, and the only person who finds out is whoever is trying to
// build something.
//
// So: pull every `name(` the harness names, and check each one against what the
// evaluator actually receives.
import { readFileSync } from "node:fs";
import { DEFAULT_HARNESS } from "../viewer/chatbot.js";
import * as dsl from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

// What the viewer puts in front of the evaluator: every function the DSL
// exports, plus the lazily-loaded text/code engine. Kept in sync by the check
// two blocks down rather than by hope.
const VIEWER_EXTRAS = ["qrcode", "datamatrix", "barcode", "text", "stencil",
  // blend() and the distance-field shapes it takes. Not in the DSL: they are
  // built in the viewer, where the SDF meshers live.
  "blend", "sphere3d", "box3d", "cylinder3d", "torus3d", "move3d"];
// Namespaces, not callables — a model reaches these as primitives.cube(...)
const JSCAD_NAMESPACES = ["primitives", "booleans", "transforms", "colors", "jscad"];

const real = new Set([
  ...Object.keys(dsl).filter((k) => typeof dsl[k] === "function"),
  ...VIEWER_EXTRAS,
  ...JSCAD_NAMESPACES,
]);

// Words that appear as `name(` in the harness but are JavaScript itself, or
// prose, rather than claims about the vocabulary.
const NOT_VOCAB = new Set([
  "if", "for", "while", "return", "function", "const", "let", "var", "switch",
  "catch", "typeof", "Math", "Number", "String", "Array", "Object", "JSON",
  "e.g", "eg", "i.e", "ie", "etc",
  // the #languages section talks ABOUT OpenSCAD/JSCAD — their words are not
  // claims that BREPcode's evaluator has them
  "main", "color",
]);

// No space before the paren. Prose puts one there — "a colour (great for…)",
// "the app (a browser CAD app)" — and code never does, so this alone separates
// a claim about the vocabulary from an ordinary English aside.
const named = [...DEFAULT_HARNESS.matchAll(/\b([a-zA-Z_$][\w$]*)\(/g)]
  .map((m) => m[1])
  .filter((n) => !NOT_VOCAB.has(n));
const unique = [...new Set(named)].sort();

check("the harness names some vocabulary at all", unique.length > 10, `${unique.length}`);

const missing = unique.filter((n) => !real.has(n));
check("every word the prompt promises actually exists",
  missing.length === 0,
  missing.length ? `PROMISED BUT MISSING: ${missing.join(", ")}` : "");

// The specific regression that prompted all this.
check("colorize exists", typeof dsl.colorize === "function");
check("glow exists", typeof dsl.glow === "function");

// VIEWER_EXTRAS is the one hand-written list left, and a hand-written list is
// exactly what this suite exists to distrust: anything added to it is treated
// as real without evidence, which would let the prompt promise a viewer word
// that was renamed or never written. So check them against the viewer itself.
{
  const viewer = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  // Loose on the VALUE — these are written several ways (an arrow function, a
  // call to a factory, a lazily-bound operator) and pinning the shape would
  // make this fail on a refactor rather than on a real absence. Strict on the
  // KEY, which is the part the prompt actually promises.
  const absent = VIEWER_EXTRAS.filter((n) =>
    !new RegExp(`\\n\\s*${n}\\s*:\\s*[A-Za-z_$({]`).test(viewer));
  check("every viewer-only word is really defined in the viewer",
    absent.length === 0,
    absent.length ? `CLAIMED BUT NOT FOUND: ${absent.join(", ")}` : "");
}

// And the reverse direction, as a nudge rather than a failure: a capable word
// nobody is told about may as well not exist.
const SILENT_OK = new Set([
  ...JSCAD_NAMESPACES, "registerImport", "listImports", "feature", "boxCorners",
  "compile", "build", "toSTL", "stats", "fromOpenSCAD", "looksLikeOpenSCAD",
  "getWarnings", "fromPython", "looksLikePython",
]);
const undocumented = [...real].filter((n) => !SILENT_OK.has(n) && !unique.includes(n)).sort();
if (undocumented.length) console.log(`\n  note: in the vocabulary but never mentioned to the model — ${undocumented.join(", ")}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
