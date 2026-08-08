// Does the prompt describe the tools that actually exist?
//
// The failure this suite is named after: a user asked for a funnel, the model
// wrote OpenSCAD with rotate_extrude(), and the translator — which has no
// rotate_extrude — WARNED and skipped it. The build succeeded and produced
// nothing. It took several attempts to get a part, and none of the attempts
// were bugs; the prompt simply never said which OpenSCAD words are missing.
//
// So this checks both directions:
//   absent words  — the prompt must warn about every one of them
//   present words — the prompt only advertises what really translates
//
// Both lists come from src/openscad.js, not from here, so the prompt cannot
// drift away from the translator without something going red.

import { UNSUPPORTED, LIMITED, MODULES, fromOpenSCAD, getWarnings } from "../src/openscad.js";
import { DEFAULT_HARNESS, STYLE_LANGUAGES } from "../viewer/chatbot.js";
import { readFileSync, readdirSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

console.log("\nevery absent OpenSCAD module is named in the prompt\n");
{
  for (const name of Object.keys(UNSUPPORTED)) {
    check(`${name}() is called out as missing`,
      new RegExp(`\\b${name}\\b`).test(DEFAULT_HARNESS),
      "a model can reach for it and get a silently empty part");
  }
  for (const name of Object.keys(LIMITED)) {
    check(`${name}() has its refused arguments named`,
      new RegExp(`\\b${name}\\b`).test(DEFAULT_HARNESS));
  }
  // Naming them is not enough — the section has to say what happens, because
  // "unsupported" reads as "degrades gracefully" and this one does not.
  check("the prompt says an absent module comes out EMPTY, not just unsupported",
    /silently skipped|comes out missing|comes out empty/i.test(DEFAULT_HARNESS));
  check("...and points at the replacement for the common one (a lathe)",
    /rotate_extrude[\s\S]{0,220}(revolve|tube)\(/.test(DEFAULT_HARNESS));
}

console.log("\nand every module the prompt advertises really translates\n");
{
  // A 2D module has to be inside an extrude to reach the kernel; a transform
  // needs a child. Anything not listed here is exercised bare.
  const SNIPPET = {
    square: "linear_extrude(2) square(4);",
    circle: "linear_extrude(2) circle(2);",
    polygon: "linear_extrude(2) polygon([[0,0],[4,0],[4,4]]);",
    offset: "linear_extrude(2) offset(r = 1) square(4);",
    linear_extrude: "linear_extrude(2) square(4);",
    translate: "translate([1,0,0]) cube(2);",
    rotate: "rotate([0,0,45]) cube(2);",
    scale: "scale([2,1,1]) cube(2);",
    mirror: "mirror([1,0,0]) cube(2);",
    color: 'color("red") cube(2);',
    render: "render() cube(2);",
    group: "group() { cube(2); }",
    union: "union() { cube(2); sphere(1); }",
    difference: "difference() { cube(4); sphere(1); }",
    intersection: "intersection() { cube(4); sphere(3); }",
    hull: "hull() { cube(2); translate([8,0,0]) cube(2); }",
    minkowski: "minkowski() { cube(4); sphere(1); }",
    children: "module m() { children(); } m() cube(2);",
    echo: 'echo("hi"); cube(2);',
    assert: "assert(true); cube(2);",
  };
  for (const name of MODULES) {
    const src = SNIPPET[name] ?? `${name}();`;
    let warned = "", threw = "";
    try {
      fromOpenSCAD(src);
      warned = (getWarnings() || []).find((w) => /isn't a known module/.test(w)) || "";
    } catch (e) { threw = String(e.message || e); }
    check(`${name}() is a module the translator knows`,
      !warned && !threw, warned || threw);
  }

  // The advertised list and the real list are the same list. If someone adds a
  // module and forgets the prompt, the model never learns it exists.
  const advertised = DEFAULT_HARNESS.match(/Everything else you would reach for is there: ([^.]+)\./);
  check("the prompt carries the roster of what IS there", !!advertised);
  if (advertised) {
    const said = advertised[1].split(/,\s*|\s+and\s+/).map((s) => s.trim());
    const missing = MODULES.filter((m) => !said.includes(m)
      // plumbing and diagnostics — a model does not choose these for geometry,
      // and listing them would only dilute the roster it does choose from
      && !["render", "group", "children", "echo", "assert"].includes(m));
    check("...and it lists every module the translator has",
      missing.length === 0, `not advertised: ${missing.join(", ")}`);
    const invented = said.filter((s) => /^[a-z_]+$/.test(s) && !MODULES.includes(s)
      && !["for", "if", "let", "modules", "functions"].includes(s));
    check("...and advertises nothing the translator lacks",
      invented.length === 0, `advertised but absent: ${invented.join(", ")}`);
  }
}

console.log("\nthe language picker steers away from the absent ones\n");
{
  const any = STYLE_LANGUAGES.any, scad = STYLE_LANGUAGES.openscad;
  check("choosing OpenSCAD is tied to offset(), its one exclusive power",
    /offset\(\)/.test(any) && /only route/i.test(any));
  check("...and a revolved shape is explicitly NOT a reason to choose it",
    /rotate_extrude/.test(any));
  // It may NAME polyhedron in the warning at the end; what it must not do is
  // list it among the words to reach for, which is what it used to do.
  check("the OpenSCAD style string no longer advertises polyhedron",
    !/polyhedron/.test(scad.split(/Re-read WHAT/)[0]), scad.split(/Re-read WHAT/)[0]);
  check("...and repeats the absent list where a model will see it",
    /rotate_extrude/.test(scad));
  check("mixing languages is called out as the failure it is",
    /Mixing is what fails/.test(any));
  for (const k of ["brepcode", "openscad", "jscad", "build123d", "any"]) {
    check(`${k} is still a known style`, typeof STYLE_LANGUAGES[k] === "string");
  }
}

console.log("\nthe sweep-vs-hull lesson is stated with its evidence\n");
{
  check("the prompt has a tool-choice section at all",
    /PICK THE RIGHT TOOL BEFORE YOU WRITE/.test(DEFAULT_HARNESS));
  check("tube() is named for pipes and funnels, not just cables",
    /tube\(\)[\s\S]{0,400}(funnel|spout|nozzle)/i.test(DEFAULT_HARNESS));
  check("hull() defers to tube() when the taper follows a path",
    /hull[\s\S]{0,500}not hull|not a hull|that is tube\(\)/i.test(DEFAULT_HARNESS));
  check("the hand-rolling guard is there", /IF YOU ARE HAND-ROLLING/.test(DEFAULT_HARNESS));
  // Numbers, because "faster" alone does not change a model's mind.
  check("...backed by measured numbers rather than an assertion",
    /\d[\d,]*\s*(tri|triangle|facet)/i.test(DEFAULT_HARNESS));

  // And the worked example has to be findable by the words a user types.
  const pipes = readFileSync(new URL("../viewer/recipes/pipes.md", import.meta.url), "utf8");
  for (const w of ["funnel", "spout", "elbow", "nozzle", "adapter"]) {
    check(`#pipes is reachable from "${w}"`, new RegExp(`\\b${w}`, "i").test(pipes.split("---")[1]));
  }
  check("#pipes shows the bore overshooting the open ends",
    /path\(1\.5\)/.test(pipes) && /overshoot/i.test(pipes));
  check("#pipes says flat caps", /caps: "flat"/.test(pipes));
}

console.log("\nthe asks that used to fail now reach a recipe\n");
{
  // Every phrasing here is a shape whose OBVIOUS OpenSCAD spelling is a module
  // this translator does not have — rotate_extrude for anything revolved — or
  // whose obvious BREPcode spelling is a slow hull of discs. Reaching #pipes is
  // what stops the model guessing.
  const { matchRecipes } = await import("../viewer/recipes.js");
  const manifest = JSON.parse(readFileSync(new URL("../viewer/recipes/manifest.json", import.meta.url), "utf8"));
  const hits = (q) => matchRecipes(q, manifest).matched.map((r) => r.tag);
  for (const q of [
    "make me a funnel for oil, 2.5 inch mouth down to a 3/4 inch spout",
    "I need a 90 degree elbow pipe",
    "design a watering can spout",
    "a hose barb adapter 12mm to 6mm",
    "a vase", "make a bottle 200mm tall", "a lampshade", "a goblet",
    "can you rotate_extrude this profile",
  ]) check(`"${q.slice(0, 42)}" finds #pipes`, hits(q).includes("pipes"), hits(q).join(", ") || "(none)");

  // And the cutter asks still land where they did.
  for (const [q, tag] of [
    ["make a salmon cookie cutter", "cookiecutter"],
    ["a cocoa stencil sheet", "cutterkit"],
    ["rolling pin embosser", "cutterkit"],
    ["gingerbread man cutter with a stamp and twist knob", "cutterkit"],
  ]) check(`"${q.slice(0, 42)}" finds #${tag}`, hits(q).includes(tag), hits(q).join(", ") || "(none)");
}

console.log("\nopentype is on the do-not-do list and stayed off\n");
{
  // The user ruled it out. A dependency that creeps back in through a recipe or
  // the prompt is the way that decision gets quietly reversed.
  const files = ["../viewer/chatbot.js", "../viewer/cutterkit.js"];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    check(`${f.split("/").pop()} does not reach for opentype`,
      !/opentype/i.test(src.replace(/^.*do-not-do.*$/gim, "")));
  }
  const dir = new URL("../viewer/recipes/", import.meta.url);
  const bad = readdirSync(dir).filter((f) => f.endsWith(".md")
    && /opentype/i.test(readFileSync(new URL(f, dir), "utf8")));
  check("no recipe suggests it either", bad.length === 0, bad.join(", "));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
