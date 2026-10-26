// Run editor-style BREPcode (named consts, then `return <shape>`) outside the
// viewer, forgiving it exactly the way the editor does, so a script, a
// benchmark or an agent never fails on something a person typing in the app
// would get away with:
//
//   - a variable that reuses a DSL word (`const screw = ...`, `const slot = ...`)
//     shadows it instead of being a SyntaxError, because the vocabulary
//     arrives as function parameters;
//   - a final shape that forgot its `return` is returned anyway;
//   - a bare expression (`cube(10)`) is its own model;
//   - OpenSCAD source is translated to a shape, as the editor does.
//
// The repair helpers are the editor's own (viewer/assist.js), so the two can
// never drift apart. Returns { shape, lang, repaired } or throws the model's
// own error.

import * as dsl from "./dsl.js";
import { fromOpenSCAD, looksLikeOpenSCAD } from "./openscad.js";
import { declaredNames, addImplicitReturn, fixDanglingReturn } from "../viewer/assist.js";

export function runEditorCode(source, vocab = dsl) {
  const src = String(source ?? "");
  const lang = "brepscript";
  // OpenSCAD is translated straight to a shape, as the editor does
  if (looksLikeOpenSCAD(src)) return { shape: fromOpenSCAD(src), lang: "openscad", repaired: null };
  const all = Object.keys(vocab).filter((k) => typeof vocab[k] === "function" && k !== "compile" && /^[A-Za-z_$][\w$]*$/.test(k));
  const shadowed = new Set(declaredNames(src, all));
  const names = all.filter((n) => !shadowed.has(n));
  const values = names.map((n) => vocab[n]);
  const finish = (r, repaired) => ({ shape: Array.isArray(r) ? dsl.group(...r.flat(Infinity)) : r, lang, repaired });

  let fn, statementForm = false;
  try { fn = new Function(...names, `"use strict"; return (\n${src}\n);`); }
  catch { fn = new Function(...names, `"use strict";\n${src}`); statementForm = true; }
  const out = fn(...values);
  if (out !== undefined || !statementForm) return finish(out, null);

  // statement code that never returned: the editor's two repairs, in its order
  for (const [fix, label] of [[fixDanglingReturn, "dangling return joined"], [addImplicitReturn, "return added"]]) {
    const repaired = fix(src);
    if (!repaired) continue;
    try {
      const r = new Function(...names, `"use strict";\n${repaired}`)(...values);
      if (r && typeof r === "object") return finish(r, label);   // a shape, not the last number
    } catch { /* that guess didn't parse; try the next */ }
  }
  throw new Error("the code returned nothing (it needs `return <shape>` at the top level)");
}
