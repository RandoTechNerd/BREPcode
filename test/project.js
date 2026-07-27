// The .bcode project file — the one export that is the MODEL rather than a
// picture of it.
//
// It exists because nothing in BREPcode saved your work: theme, material, grid,
// model name and AI settings were all persisted, the CODE never was, and
// closing the tab lost it. So the bar here is higher than "round-trips": a file
// that fails to open is the failure this feature was built to prevent.
//
// The design promise is that the SOURCE is the file and everything else is
// decoration. Every test below is a way of deleting or corrupting the
// decoration and checking the source still comes back.
import {
  bcodeFile, parseBcodeFile, SCENE_OPEN, SCENE_CLOSE, HISTORY_KEEP, SOURCE_MARKER,
} from "../viewer/exporters.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const CODE = `const EPS = 0.01, w = 70, d = 45;
// a plate — "réglage", an em dash, and a apostrophe's worth of punctuation
return difference(
  cube([w, d, 14]),
  translate([w / 2, d / 2, -EPS], cylinder({ r: 6, h: 20, $fn: 48 })));`;
const SCENE = { material: { metal: 0.2, colour: "#d4af37" }, camera: [-40.8, -115.9, 46.3], negatives: true };
const HISTORY = ["return cube([1,1,1]);", "return cube([2,2,2]);", CODE];

console.log("\nround trip\n");
{
  const f = bcodeFile(CODE, { name: "bracket", scene: SCENE, history: HISTORY });
  const r = parseBcodeFile(f);
  check("the source comes back byte-identical", r.source === CODE, JSON.stringify(r.source.slice(0, 50)));
  check("non-ASCII survives", r.source.includes("réglage"));
  check("the scene comes back", JSON.stringify(r.scene) === JSON.stringify(SCENE));
  check("the history comes back in order", JSON.stringify(r.history) === JSON.stringify(HISTORY));

  // The whole point of plain text: readable and editable without our app.
  check("the source sits at the top, above the metadata",
    f.indexOf("return difference(") < f.indexOf(SCENE_OPEN));
  check("it says what it is in plain English", f.includes(SOURCE_MARKER) && /BREPcode\.com/.test(f));
  // The source region specifically — the history below it is JSON, and legitimately
  // escaped. What must never be escaped is the part a human reads and edits.
  const srcRegion = f.slice(0, f.indexOf(SCENE_OPEN));
  check("the model is stored verbatim, not JSON-escaped",
    srcRegion.includes("cube([w, d, 14])") && !srcRegion.includes("\\n"));
}

console.log("\nthe decoration is optional\n");
{
  // Someone hand-edits the file down to just the model, or writes one from
  // scratch. It has to open.
  const bare = parseBcodeFile(CODE);
  check("a file of bare BREPcode opens", bare.source === CODE);
  check("...with no scene", bare.scene === null);
  check("...and no history", bare.history.length === 0);

  // Someone deletes the comment block, or an editor mangles it.
  const f = bcodeFile(CODE, { name: "x", scene: SCENE, history: HISTORY });
  const truncated = f.slice(0, f.indexOf(SCENE_CLOSE));       // block never closed
  check("an unterminated metadata block does not cost the source",
    parseBcodeFile(truncated).source === CODE);
  const corrupt = f.replace(/"camera": \[/, '"camera": {{{');
  const c = parseBcodeFile(corrupt);
  check("corrupt JSON does not cost the source", c.source === CODE);
  check("...and the scene is simply absent rather than half-read", c.scene === null);

  // No scene asked for at all.
  const plain = bcodeFile(CODE, { name: "x" });
  check("no metadata means no comment block", !plain.includes(SCENE_OPEN));
  check("...and it still round-trips", parseBcodeFile(plain).source === CODE);
}

console.log("\nthe hostile cases\n");
{
  // The source is above the block so it cannot break out, but a SCENE value can
  // carry anything a user typed — a model name, a colour picker string.
  const evil = bcodeFile(CODE, { name: "x", scene: { note: `*/ return cube([9,9,9]); ${SCENE_CLOSE}` } });
  const r = parseBcodeFile(evil);
  check("a scene value cannot close the comment early", r.source === CODE, JSON.stringify(r.source.slice(-40)));
  check("...and the value itself survives intact",
    r.scene?.note === `*/ return cube([9,9,9]); ${SCENE_CLOSE}`);

  // History is capped: 200 full copies of a real model is megabytes of
  // near-identical text nobody scrolls back through.
  const many = Array.from({ length: 500 }, (_, i) => `return cube([${i},1,1]);`);
  const capped = parseBcodeFile(bcodeFile(CODE, { name: "x", history: many }));
  check(`history is capped at ${HISTORY_KEEP}`, capped.history.length === HISTORY_KEEP,
    String(capped.history.length));
  check("...keeping the most RECENT states, not the oldest",
    capped.history[capped.history.length - 1] === many[many.length - 1]);

  check("an empty file is handled", parseBcodeFile("").source === "");
  check("a UTF-8 BOM is tolerated", parseBcodeFile("﻿" + CODE).source === CODE);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
