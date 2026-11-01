// Deleting a clicked shape: deletionSpan() must leave code that still parses,
// take the shape's own wrappers with it, and refuse rather than break things.

import { deletionSpan, primitiveSites } from "../viewer/assist.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

// Delete the n-th primitive (by source order) of `kind` and return the new text.
function del(text, kind, n = 0) {
  const site = primitiveSites(text).filter((s) => s.kind === kind)[n];
  if (!site) return { error: `no ${kind} #${n}` };
  const cut = deletionSpan(text, site);
  if (cut.refuse) return { refuse: cut.refuse };
  return { text: text.slice(0, cut.start) + text.slice(cut.end), cut };
}
// It must still be valid JavaScript (the DSL is JS calls).
const parses = (src) => { try { new Function(`return (${src});`); return true; } catch { return false; } };

console.log("\ndeletionSpan\n");

const starter = `difference(
  cube([30, 30, 12]),
  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),
)`;

{
  const r = del(starter, "cylinder");
  check("hole: removes the cylinder and its translate", r.text && !/cylinder|translate/.test(r.text), r.text || r.refuse);
  check("hole: result still parses", r.text && parses(r.text), r.text);
  check("hole: the cube stays", r.text && r.text.includes("cube([30, 30, 12])"));
}
{
  const r = del(starter, "cube");
  check("body of a difference: deletes the whole difference → refuses (nothing left)", !!r.refuse, JSON.stringify(r));
}

const three = `union(
  cube([10, 10, 10]),
  translate([20, 0, 0], sphere({ r: 5 })),
  translate([40, 0, 0], cylinder({ r: 3, h: 10 }))
)`;
{
  const r = del(three, "sphere");
  check("middle of a union: sphere line gone", r.text && !r.text.includes("sphere"), r.text || r.refuse);
  check("middle of a union: parses", r.text && parses(r.text), r.text);
  check("middle of a union: whole line removed, no blank line left", r.text && !/\n\s*\n/.test(r.text), JSON.stringify(r.text));
}
{
  const r = del(three, "cylinder");
  check("last of a union (no trailing comma): parses", r.text && parses(r.text), r.text);
  check("last of a union: others stay", r.text && r.text.includes("sphere") && r.text.includes("cube"));
}
{
  const r = del(three, "cube");
  check("first of a union: parses", r.text && parses(r.text), r.text);
  check("first of a union: only the cube goes", r.text && !r.text.includes("cube") && r.text.includes("sphere"));
}

const nested = `union(
  difference(
    cube([30, 30, 12]),
    translate([15, 15, -1], cylinder({ r: 8, h: 14 })),
  ),
  translate([0, 40, 0], colorize([1, 0.3, 0.6], sphere({ r: 6 }))),
)`;
{
  const r = del(nested, "cube");
  check("body inside a union: the whole difference goes", r.text && !r.text.includes("difference") && !r.text.includes("cylinder"), r.text || r.refuse);
  check("body inside a union: the sphere stays and it parses", r.text && r.text.includes("sphere") && parses(r.text), r.text);
}
{
  const r = del(nested, "sphere");
  check("through colorize + translate: both wrappers go", r.text && !r.text.includes("colorize") && !r.text.includes("[0, 40, 0]"), r.text || r.refuse);
  check("through colorize + translate: parses", r.text && parses(r.text), r.text);
}

check("a lone shape refuses (nothing would be left)", !!del("cube([10, 10, 10])", "cube").refuse);
{
  const r = del("const peg = cylinder({ r: 2, h: 5 });\nreturn union(cube([5,5,5]), peg);", "cylinder");
  check("a shape stored in a variable refuses and names it", r.refuse && r.refuse.includes("peg"), JSON.stringify(r));
}
{
  const src = `hull({ exact: true },\n  translate([0,0,0], sphere({ r: 3 })),\n  translate([10,0,0], sphere({ r: 3 })),\n)`;
  // the app treats a hull as one clickable piece, so aim at the call by hand
  const at = src.lastIndexOf("translate([10");
  const cut = deletionSpan(src, { start: at, end: src.indexOf("),\n)", at) + 1, kind: "translate" });
  const r = cut.refuse ? { refuse: cut.refuse } : { text: src.slice(0, cut.start) + src.slice(cut.end) };
  check("hull options object is not counted as a shape", r.text && r.text.includes("exact") && r.text.includes("sphere") && parses(r.text), r.text || r.refuse);
}
{
  const src = `union(text({ text: "a)b", size: 5 }), cube([4, 4, 4]))`;
  const r = del(src, "cube");
  check("a bracket inside a string doesn't confuse the scan", r.text && parses(r.text) && r.text.includes('"a)b"'), r.text || r.refuse);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
