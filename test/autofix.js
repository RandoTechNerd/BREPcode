// Forgiving-mode repairs. autoFix must only ever append what's missing —
// never rewrite or drop what the user actually typed.

import { autoFix, addImplicitReturn, declaredNames, fixDanglingReturn, looseShapeCount, diagnose } from "../viewer/assist.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
function fixes(label, src, expected, expectNote = true) {
  const { code, notes } = autoFix(src);
  const okCode = code === expected;
  const okNote = expectNote ? notes.length > 0 : notes.length === 0;
  check(label, okCode && okNote, `got ${JSON.stringify(code)} notes=${JSON.stringify(notes)}`);
}

console.log("\nautoFix\n");

// the screenshot case: translate( never closed
fixes("closes one missing round bracket",
  "difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cube([20, 20, 10])\n)",
  "difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cube([20, 20, 10])\n))");

fixes("closes bracket and paren in order", "cube([10,10,", "cube([10,10,])");
fixes("closes brace, bracket, paren", "difference(cube([20,20,20]), sphere({r:12",
  "difference(cube([20,20,20]), sphere({r:12}))");
fixes("closes an unterminated string", 'feature("P.CU', 'feature("P.CU")');
fixes("straightens smart quotes", 'feature(“P.CU”)', 'feature("P.CU")');
fixes("straightens en/em dashes", "translate([–10,0,0], cube(5))", "translate([-10,0,0], cube(5))");

// must NOT touch already-valid code
fixes("leaves valid code alone",
  "difference(cube([30,30,12]), translate([15,15,-1], cylinder({r:8,h:14})))",
  "difference(cube([30,30,12]), translate([15,15,-1], cylinder({r:8,h:14})))", false);

// brackets inside strings and comments must not be counted
fixes("ignores brackets inside a string", 'feature("a(b[c{", {})', 'feature("a(b[c{", {})', false);
fixes("ignores brackets in a line comment", "cube(5) // what about ( [ {", "cube(5) // what about ( [ {", false);
fixes("ignores brackets in a block comment", "cube(5) /* ( [ { */", "cube(5) /* ( [ { */", false);
fixes("ignores an apostrophe in a comment", 'cube(5) // don\'t close this', 'cube(5) // don\'t close this', false);

// extra/mismatched closers are left for diagnose() to explain
fixes("leaves an extra closer alone", "cube([1,1,1]))", "cube([1,1,1]))", false);
// crossed brackets: guessing closers would just produce different broken code
fixes("leaves crossed brackets alone", "cube([1,1,1)", "cube([1,1,1)", false);

// never deletes or reorders the user's own text
const messy = "difference(\n  cube([30, 30, 12]),\n  sphere({ r: 8";
check("output starts with the exact input", autoFix(messy).code.startsWith(messy));

// ---- the forgotten `return` ---------------------------------------------
// This is the single most common thing a generated model gets wrong, and the
// repair had NO tests — so it quietly regressed to almost never firing and
// users ended up pressing Fix on every reply. Two things broke it: a trailing
// semicolon left the tail empty, and the word "return" in a comment or a
// string switched the whole thing off.
{
  const R = (src) => addImplicitReturn(src);
  const returns = (src) => {
    const out = R(src);
    return out === null ? null : /(^|\n)\s*return\s/.test(out.replace(/^\s*\/\/.*$/gm, ""));
  };

  check("a trailing semicolon does not defeat it",
    returns('const w = 120;\nstretch({ axis: "x" }, importedMesh("f.stl"));') === true,
    JSON.stringify(R('const w = 120;\nstretch({ axis: "x" }, importedMesh("f.stl"));')));
  check("neither does the absence of one",
    returns('const w = 120;\nstretch({ axis: "x" }, importedMesh("f.stl"))') === true);
  check("a multi-line final call is handled",
    returns('translate([18, 0, 0],\n  stretch({ axis: "x", by: -36 },\n    importedMesh("f.stl")));') === true);

  check('"return" inside a COMMENT does not switch it off',
    returns('// return the narrowed frame\nstretch({ axis: "x" }, importedMesh("f.stl"));') === true,
    JSON.stringify(R('// return the narrowed frame\nstretch({ axis: "x" }, importedMesh("f.stl"));')));
  check('"return" inside a STRING does not either',
    returns('text({ text: "return" });') === true);
  check("a comment above the final line is stepped over",
    returns('const w = 1;\n// narrow it\ncube([1, 1, 1]);') === true);
  check("...and a block comment too", returns('/* narrow it */\ncube([1, 1, 1]);') === true);

  // and it must still keep its hands off code that needs no help
  check("code that already returns is left alone", R("return cube([1, 1, 1]);") === null);
  check("a real return further up is respected", R("const a = 1;\nreturn cube([a, a, a]);") === null);
  // A model that finishes on `const part = union(...);` assigned the thing it
  // meant to hand back and just didn't hand it back. Returning the name is
  // unambiguous, so it should not cost the user a click either.
  check("a trailing const assignment returns the name",
    /return part;/.test(R("const part = cube([1, 1, 1]);") || ""),
    JSON.stringify(R("const part = cube([1, 1, 1]);")));
  check("...and let works the same", /return out;/.test(R("let out = cube([1, 1, 1]);") || ""));
  check("...but a real expression after it still wins",
    /return cube\(\[a, a, a\]\);/.test(R("const a = 1;\ncube([a, a, a]);") || ""));
  check("a lone comment is left alone", R("// nothing here") === null);
  check("an unterminated block comment is left alone", R("/* oops\ncube([1,1,1])") === null);

  // the whole point: the repaired source has to actually run
  const fixed = R('const w = 20;\n// the part\ncube([w, w, 10]);');
  check("the repaired source is valid JavaScript",
    (() => { try { new Function("cube", `"use strict";\n${fixed}`); return true; } catch { return false; } })(),
    JSON.stringify(fixed));
  check("...and returns the shape",
    new Function("cube", `"use strict";\n${fixed}`)((d) => d)?.join?.(",") === "20,20,10",
    JSON.stringify(fixed));
}


// --- declaredNames: names the author took for themselves -------------------
//
// A live API run failed on "a bracket with support fins": the model wrote
// `const fins = [...]`, and because the vocabulary is injected as function
// PARAMETERS that is a SyntaxError before a single line runs — unrecoverable,
// and invisible in every offline suite because our own examples never do it.
{
  const D = (src) => declaredNames(src, ["cube", "fins", "text", "union", "translate"]).sort();
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  check("catches the failure that started this", eq(D("const fins = [1,2];\nreturn cube([1,1,1]);"), ["fins"]));
  check("let and var too", eq(D("let text = 'HI';\nvar fins = 2;"), ["fins", "text"]));
  check("function declarations", eq(D("function fins(n) { return n; }"), ["fins"]));
  check("second binding in a list", eq(D("const w = 20, fins = [1,2];"), ["fins"]));
  check("a comma inside the VALUE isn't a new binding",
    eq(D("const a = cube([1, 2, 3]), text = 'x';"), ["text"]));
  check("destructuring counts", eq(D("const { text } = opts;"), ["text"]));
  // A parameter is bound inside its own function; dropping it would leave the
  // rest of the file calling a word we stopped injecting.
  check("a function PARAMETER is not a top-level declaration",
    eq(D("function makeFin(cube) { return cube; }\nreturn cube([1,1,1]);"), []));
  check("...but the function's own name still counts", eq(D("function fins(n) { return n; }"), ["fins"]));
  check("an arrow's parameter is not one either",
    eq(D("const f = (cube) => cube;\nreturn cube([1,1,1]);"), []));

  // The other half: a word merely USED must never be dropped, or the code loses
  // the function it was calling and fails with "cube is not defined".
  check("a plain call is not a declaration", eq(D("return cube([10, 10, 10]);"), []));
  check("a call on the value side is not a declaration",
    eq(D("const part = union(cube([1,1,1]), translate([1,0,0], cube([1,1,1])));"), []));
  check("the word inside a string is not a declaration", eq(D('return text({ text: "const fins = 1" });'), []));
  check("the word inside a comment is not a declaration", eq(D("// const fins = 1\nreturn cube([1,1,1]);"), []));

  // End to end: dropping the claimed word makes the once-fatal source run.
  const src = "const fins = [4, 6];\nreturn cube([fins[0], fins[1], 2]);";
  const all = ["cube", "fins"], vals = [(d) => d, () => "the operator"];
  const drop = declaredNames(src, all);
  const keep = all.filter((n) => !drop.includes(n));
  check("the source was fatal before the fix",
    (() => { try { new Function(...all, src); return false; } catch { return true; } })());
  check("...and now evaluates to the right shape",
    new Function(...keep, `"use strict";\n${src}`)(...vals.filter((_, i) => !drop.includes(all[i])))
      ?.join?.(",") === "4,6,2");
}

// --- the two ways a beginner loses their whole model -----------------------
//
// Both came from a real session: three primitives pasted out of the cheat
// sheet, and a `return` left on its own line.
{
  const R = (s) => fixDanglingReturn(s);

  // JavaScript inserts a semicolon after a bare `return`, so the shape on the
  // next line is never reached. The code looks completely correct.
  check("a return alone on its line is joined to the next expression",
    /return torus/.test(R("return\ntorus({ r: 14 })") || ""), JSON.stringify(R("return\ntorus({ r: 14 })")));
  check("...across blank lines too", /return cube/.test(R("return\n\n\ncube([1,1,1])") || ""));
  check("...and the code before it is untouched",
    (R("const w = 5;\nreturn\ncube([w,w,w])") || "").startsWith("const w = 5;\n"));

  // It must not touch a return that is deliberately empty.
  check("a deliberate bare return; is left alone", R("if (x) return;\nreturn cube([1,1,1]);") === null);
  check("a return before a closing brace is left alone", R("function f() { return\n}") === null);
  check("normal code is left alone", R("return cube([1, 1, 1]);") === null);
  check("the word inside a string is not a dangling return",
    R('return text({ text: "return\nnow" });') === null);

  // The repaired source has to actually run and hand back the shape.
  const fixed = R("return\ncube([3, 4, 5])");
  check("the repair evaluates to the shape",
    new Function("cube", `"use strict";\n${fixed}`)((d) => d)?.join?.(",") === "3,4,5");

  // Several shapes in a row: only one can be the model.
  check("three stacked shapes are counted",
    looseShapeCount("cube([1,1,1])\ntorus({r:5})\ncylinder({r:2,h:3})", ["cube", "torus", "cylinder"]) === 3);
  check("one shape is not a pile", looseShapeCount("cube([1,1,1])", ["cube"]) === 1);
  check("a nested call is not a second top-level shape",
    looseShapeCount("union(cube([1,1,1]), torus({r:5}))", ["cube", "torus", "union"]) === 1);
  check("a declaration is not a loose shape",
    looseShapeCount("const a = cube([1,1,1]);\nconst b = torus({r:5});", ["cube", "torus"]) === 0);
  check("the advice names union and group",
    /union/.test(diagnose("cube([1,1,1])\ntorus({r:5})", null, undefined))
    && /group/.test(diagnose("cube([1,1,1])\ntorus({r:5})", null, undefined)));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
