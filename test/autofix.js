// Forgiving-mode repairs. autoFix must only ever append what's missing —
// never rewrite or drop what the user actually typed.

import { autoFix } from "../viewer/assist.js";

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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
