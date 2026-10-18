// Sliders for a model's dimensions.
//
// Somebody who wants a 60mm box instead of a 40mm one should not have to find
// which of forty numbers is the width. The Parameters panel reads the named
// constants out of the code and puts a slider and a number box on each one.
//
// The whole feature stands on two behaviours, and both are ways of not lying
// about the model:
//
//   WHAT IT OFFERS. A number at the top of the file with a name on it is a
//   dial. A number inside a loop is part of how the model is BUILT, and a
//   value computed from other values (const INNER = WIDTH - WALL * 2) is a
//   CONSEQUENCE — writing a new number over that would silently break the
//   relationship its author wrote down. Neither is offered.
//
//   WHAT IT WRITES. The panel edits the source text, so the code on screen is
//   always exactly what the model is, and undo/autosave/sharing keep working
//   with no idea it exists. That only holds if a change rewrites the number and
//   NOTHING else — not the comment beside it, not the spacing, not the line.
//
// The rest is arithmetic about slider ends, which matters more than it sounds:
// a slider that cannot reach the value you want reads as the feature being
// broken, so the guess is generous and the number box is never clamped at all.

import {
  findParams, applyParam, humanLabel, inferRange, unitFor, niceCeil,
  formatNumber, paramsSignature,
} from "../viewer/params.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const names = (src) => findParams(src).map((p) => p.name);
const byName = (src, n) => findParams(src).find((p) => p.name === n);

const TRAY = [
  "// A parametric tray",
  "const WIDTH = 90;          // [40:200] outside width",
  "const DEPTH = 60;",
  "const WALL = 2.4;          // [1:0.2:6] wall thickness",
  "const ROUNDED = true;",
  'const LABEL = "TRAY";',
  "const SIZE = [40, 30, 12];",
  "const INNER = WIDTH - WALL * 2;   // derived",
  "",
  "return cube([WIDTH, DEPTH, 20]);",
].join("\n");

console.log("\nit finds the dials and only the dials\n");
{
  const n = names(TRAY);
  check("every named constant is offered",
    ["WIDTH", "DEPTH", "WALL", "ROUNDED", "LABEL", "SIZE"].every((x) => n.includes(x)), n.join(", "));
  check("a DERIVED value is not — it is a consequence, not a dial",
    !n.includes("INNER"),
    "writing a number over WIDTH - WALL * 2 would quietly break the relationship");

  // Anything with structure around it belongs to how the model is built.
  const nested = [
    "const TOP = 10;",
    "function part() { const HIDDEN = 3; return cube([HIDDEN, 1, 1]); }",
    "const shapes = [1, 2, 3].map((i) => { const STEP = i * 2; return STEP; });",
    "for (let i = 0; i < 3; i++) { const LOOPY = 5; }",
    "const OPTS = { wall: 2, deep: 4 };",
  ].join("\n");
  const nn = names(nested);
  check("a constant inside a function is not offered", !nn.includes("HIDDEN"), nn.join(", "));
  check("...nor inside a loop", !nn.includes("LOOPY"));
  check("...nor inside a callback", !nn.includes("STEP"));
  check("an object literal is not three sliders", !nn.includes("OPTS"), nn.join(", "));
  check("...and the top-level one still is", nn.includes("TOP"));

  // A number written inside a comment or a string is not a declaration.
  const decoys = [
    "// const FAKE = 5;",
    "/* const ALSO_FAKE = 6; */",
    'const REAL = 7;',
    'const NOTE = "const STRINGY = 8;";',
  ].join("\n");
  const dn = names(decoys);
  check("a commented-out constant is not offered", !dn.includes("FAKE") && !dn.includes("ALSO_FAKE"),
    dn.join(", "));
  check("...nor one inside a string", !dn.includes("STRINGY"), dn.join(", "));
  check("...and the real ones survive", dn.includes("REAL") && dn.includes("NOTE"), dn.join(", "));
}

console.log("\nit knows what each one IS\n");
{
  const p = (n) => byName(TRAY, n);
  check("a number is a number", p("WIDTH").kind === "number");
  check("true/false is a switch", p("ROUNDED").kind === "bool" && p("ROUNDED").value === true);
  check("a quoted word is text", p("LABEL").kind === "text" && p("LABEL").value === "TRAY");
  check("[40, 30, 12] is three boxes, not one",
    p("SIZE").kind === "vector" && p("SIZE").parts.length === 3);
  check("...each with its own span, so one axis can change alone",
    p("SIZE").parts.every((q, i, a) => i === 0 || q.start > a[i - 1].end));
}

console.log("\nthe OpenSCAD customizer, read rather than reinvented\n");
{
  // Thousands of published models already carry these annotations. Ignoring
  // them and guessing our own ranges would be choosing to know less.
  const scad = [
    "/* [Size] */",
    "width = 40;    // [20:120]",
    "height = 15;   // [5:0.5:40] how tall",
    "style = \"hex\"; // [hex, round, square]",
    "",
    "/* [Detail] */",
    "$fn = 48;",
    "",
    "/* [Hidden] */",
    "secret = 99;",
    "",
    "module thing() { inner = 5; }",
    "cube([width, 20, height]);",
  ].join("\n");
  const ps = findParams(scad);
  const n = ps.map((x) => x.name);
  check("bare OpenSCAD assignments are parameters", n.includes("width") && n.includes("height"));
  check("$fn is one too", n.includes("$fn"), n.join(", "));
  check("[min:max] sets the ends",
    byName(scad, "width").min === 20 && byName(scad, "width").max === 120);
  check("[min:step:max] sets the step as well",
    byName(scad, "height").step === 0.5 && byName(scad, "height").max === 40);
  check("...and the words after it are the description",
    byName(scad, "height").note === "how tall");
  check("a comma list is a dropdown, not a slider",
    byName(scad, "style").kind === "choice"
    && byName(scad, "style").choices.join(",") === "hex,round,square");
  check("/* [Group] */ headings are carried", byName(scad, "width").group === "Size"
    && byName(scad, "$fn").group === "Detail");
  check("/* [Hidden] */ means hidden", !n.includes("secret"),
    "OpenSCAD's own convention for a value the author does not want touched");
  check("a value inside a module is still not a dial", !n.includes("inner"));
  check("a call is not an assignment", !n.includes("cube") && !n.includes("thing"));

  // Python, for a pasted build123d model.
  const py = ["WIDTH = 40  # [10:80] the width", "HOLES = 4", "DEEP = True",
    "def part():", "    LOCAL = 9", "    return LOCAL"].join("\n");
  const pn = names(py);
  check("Python constants are found", pn.includes("WIDTH") && pn.includes("HOLES"));
  check("...with # as the comment", byName(py, "WIDTH").min === 10 && byName(py, "WIDTH").note === "the width");
  check("...True is a switch", byName(py, "DEEP").kind === "bool" && byName(py, "DEEP").value === true);
  check("...and an indented one is not offered", !pn.includes("LOCAL"), pn.join(", "));
}

console.log("\nwriting a value back changes THAT NUMBER and nothing else\n");
{
  // The panel's whole claim on trust. The comment beside the value, the
  // spacing that lines the file up, and every other line have to survive —
  // this is somebody's source file, not a settings blob.
  const out = applyParam(TRAY, "WIDTH", 140);
  check("the number changes", /const WIDTH = 140;/.test(out));
  check("...its comment is untouched", out.includes("// [40:200] outside width"));
  check("...its alignment is untouched", out.includes("const WIDTH = 140;          //"));
  const before = TRAY.split("\n"), after = out.split("\n");
  check("...and every OTHER line is byte-identical",
    before.length === after.length && before.every((l, i) => i === 1 || l === after[i]));

  check("a decimal goes in as a decimal", /const WALL = 3.75;/.test(applyParam(TRAY, "WALL", 3.75)));
  check("a switch writes true/false", /const ROUNDED = false;/.test(applyParam(TRAY, "ROUNDED", false)));
  check("text keeps its own quote style",
    /const LABEL = "LID";/.test(applyParam(TRAY, "LABEL", "LID")));
  check("one axis of a vector moves alone",
    /const SIZE = \[40, 44, 12\];/.test(applyParam(TRAY, "SIZE", 44, 1)));
  check("Python writes True, not true",
    /DEEP = False/.test(applyParam("DEEP = True", "DEEP", false)));

  // Float arithmetic on a slider produces 2.5000000000000004, and writing that
  // into somebody's source is vandalism.
  check("no float noise reaches the file",
    applyParam(TRAY, "WALL", 0.1 + 0.2) === applyParam(TRAY, "WALL", 0.3),
    formatNumber(0.1 + 0.2));
  check("an integer stays an integer", formatNumber(40) === "40");

  // Writing must survive the text having MOVED since the panel last looked.
  // Offsets go stale the moment any edit changes a length, and a stale offset
  // does not fail — it writes a number into the middle of something else.
  let src = TRAY;
  src = applyParam(src, "WIDTH", 1000);        // this line just got 2 chars longer
  src = applyParam(src, "WALL", 5);            // ...and every span below it moved
  check("a second write lands correctly after the first shifted the file",
    /const WIDTH = 1000;/.test(src) && /const WALL = 5;/.test(src),
    src.split("\n").slice(1, 5).join(" / "));

  check("an unknown name changes nothing", applyParam(TRAY, "NOPE", 5) === TRAY);

  // A choice list may be numbers — layers = 3; // [1, 2, 3, 4] — and then it
  // must go back UNQUOTED, or the model gets the string "4" where it wants 4.
  const nc = "layers = 3;   // [1, 2, 3, 4] how many";
  check("a numeric choice is still a dropdown", byName(nc, "layers").kind === "choice");
  check("...and writes back as a number, not a string",
    applyParam(nc, "layers", "4") === "layers = 4;   // [1, 2, 3, 4] how many",
    applyParam(nc, "layers", "4"));

  // Text with a quote in it has to come back out as valid source.
  const qt = 'const S = "hi";';
  check("a quote inside text is escaped",
    applyParam(qt, "S", 'a"b') === 'const S = "a\\"b";', applyParam(qt, "S", 'a"b'));
}

console.log("\nthe slider ends are a guess, so they are a generous one\n");
{
  // A slider that cannot reach the value you want reads as broken.
  const r = inferRange(40, "WIDTH");
  check("a 40mm dimension can reach past 40", r.max > 40, JSON.stringify(r));
  check("...and starts at zero", r.min === 0);
  check("a 2mm wall gets a usable range, not 0-6000",
    inferRange(2, "WALL").max <= 10, JSON.stringify(inferRange(2, "WALL")));

  check("an angle is 0-360", inferRange(15, "TILT_ANGLE").max === 360);
  check("...and a negative one is -180 to 180", inferRange(-15, "ROT").min === -180);
  check("a count steps by 1", inferRange(4, "HOLE_COUNT").step === 1);

  // The bug this caught: a regex looking for "n" ANYWHERE in the name found it
  // inside CORNER_R and made a fillet radius an integer-only count in no units.
  check("CORNER_R is a length, not a count",
    inferRange(3, "CORNER_R").step < 1 && unitFor("CORNER_R", "number") === "mm",
    JSON.stringify(inferRange(3, "CORNER_R")));
  check("...and TOP_N still is a count", inferRange(4, "TOP_N").step === 1);

  check("millimetres by default", unitFor("WIDTH", "number") === "mm");
  check("degrees for an angle", unitFor("TWIST_ANGLE", "number") === "°");
  check("nothing for a count", unitFor("HOLE_COUNT", "number") === "");
  check("nothing for a scale factor — 0.8 mm would be a lie",
    unitFor("SCALE", "number") === "");
  check("nothing on a switch", unitFor("ROUNDED", "bool") === "");

  // An annotated range that does not contain its own value would snap the
  // model the first time the slider is touched.
  const bad = byName("W = 500;  // [0:100]", "W");
  check("a range too small for its own value is widened, not obeyed",
    bad.max >= 500, `max ${bad.max}`);
  check("niceCeil lands on round numbers", niceCeil(105) === 150 && niceCeil(41) === 50,
    `${niceCeil(105)}, ${niceCeil(41)}`);
}

console.log("\nnames people can read\n");
{
  check("WALL_THICKNESS", humanLabel("WALL_THICKNESS") === "Wall thickness", humanLabel("WALL_THICKNESS"));
  check("boxWidth", humanLabel("boxWidth") === "Box width", humanLabel("boxWidth"));
  check("CORNER_R spells out radius", humanLabel("CORNER_R") === "Corner radius", humanLabel("CORNER_R"));
  check("hole_dia spells out diameter", humanLabel("hole_dia") === "Hole diameter", humanLabel("hole_dia"));
  check("$fn is a word, not a variable", humanLabel("$fn") === "Smoothness", humanLabel("$fn"));
}

console.log("\nthe panel only rebuilds its controls when it has to\n");
{
  // A slider is a continuous gesture over a document that keeps changing
  // length under it. If the panel rebuilt on every value the control being
  // dragged would be replaced mid-drag, which ends the drag.
  const a = findParams(TRAY);
  const b = findParams(applyParam(TRAY, "WIDTH", 140));
  check("changing a VALUE does not change the shape of the list",
    paramsSignature(a) === paramsSignature(b));
  const c = findParams(TRAY + "\nconst EXTRA = 5;");
  check("...but adding a parameter does", paramsSignature(a) !== paramsSignature(c));
}

console.log("\nit does not fall over on real input\n");
{
  check("empty source", findParams("").length === 0);
  check("not a string", findParams(null).length === 0 && findParams(undefined).length === 0);
  check("an unterminated string", findParams('const A = "oops').length === 0);
  check("an unterminated block comment", findParams("/* const A = 5;").length === 0);
  check("a bare number with no name", findParams("42").length === 0);
  check("a file of only geometry", findParams("cube([30, 30, 12]);").length === 0);
  // Windows line endings are what a pasted file actually arrives with.
  const crlf = "const W = 40;\r\nconst H = 20;\r\n";
  check("CRLF line endings", names(crlf).join(",") === "W,H", names(crlf).join(","));
  check("...and writing into one keeps them",
    applyParam(crlf, "W", 55) === "const W = 55;\r\nconst H = 20;\r\n");
  check("a negative value", byName("const OFF = -12;", "OFF").value === -12);
  check("...and its slider goes negative", byName("const OFF = -12;", "OFF").min < 0);
  check("scientific notation", byName("const TINY = 1e-3;", "TINY").value === 0.001);
}

// colours: a "#rrggbb" string is a colour picker, not a text box, and writes
// back as a quoted string like any text
{
  const src = `const tag_color = "#7b4fe0";\nconst short = '#fff';\nconst label = "#1 fan";\ncolorize(tag_color, cube(10))`;
  const ps = findParams(src);
  const kind = (n) => ps.find((p) => p.name === n)?.kind;
  check("a #rrggbb value is a colour", kind("tag_color") === "color");
  check("...so is #rgb", kind("short") === "color");
  check("...but text that merely starts with # stays text", kind("label") === "text");
  const out = applyParam(src, "tag_color", "#00ff00");
  check("a picked colour is written back quoted", out.includes(`const tag_color = "#00ff00";`), out.split("\n")[0]);
  check("...and keeps its own quote style", applyParam(src, "short", "#000").includes(`const short = '#000';`));
}

// the name tag example: every setting is a control of the right kind
{
  const { EXAMPLES } = await import("../viewer/welcome.js");
  const ps = findParams(EXAMPLES.tag.code);
  const kinds = Object.fromEntries(ps.map((p) => [p.name, p.kind]));
  check("name tag: name is a text box, font a dropdown, two colour pickers",
    kinds.name === "text" && kinds.font === "choice" && kinds.text_color === "color" && kinds.tag_color === "color", JSON.stringify(kinds));
  check("name tag: the sizes are sliders, corners and fillet included",
    ["text_size", "text_height", "width", "tag_height", "thickness", "corner_r", "edge_fillet", "hole_d"].every((n) => kinds[n] === "number"));
  check("name tag: the helper lines are not offered as dials", !("slab" in kinds) && !("r" in kinds) && !("textX" in kinds));
}

// the TPU box example: every customizer setting is a control, and it builds
{
  const { EXAMPLES } = await import("../viewer/welcome.js");
  const src = EXAMPLES.tpubox.code;
  const kinds = Object.fromEntries(findParams(src).map((p) => [p.name, p.kind]));
  check("TPU box: show and pattern are dropdowns, riser and lift cross are switches",
    kinds.show === "choice" && kinds.pattern === "choice" && kinds.riser === "bool" && kinds.lift_cross === "bool", JSON.stringify(kinds));
  check("TPU box: box, seal and riser sizes are sliders",
    ["inner_length", "inner_width", "inner_height", "wall", "corner_r", "lid_height", "lid_gap", "bead_from_top", "bead_r", "groove_r", "riser_height", "pattern_size", "pattern_spacing"].every((n) => kinds[n] === "number"));
  // build it headless with the app's own vocabulary (the DSL plus polyhedron)
  const D = await import("../src/dsl.js");
  const { polyhedron } = await import("../src/jscad.js");
  const { build, toSTL } = await import("../index.js");
  const V = { ...D, polyhedron };
  const names = Object.keys(V).filter((k) => /^[a-zA-Z_$][\w$]*$/.test(k));
  const set = (s, k, v) => s.replace(new RegExp(`const ${k} = [^;]+;`), `const ${k} = ${v};`);
  for (const [label, s] of [
    ["base", set(src, "show", '"base"')],
    ["lid", set(src, "show", '"lid"')],
    ["riser (slits)", set(set(src, "show", '"riser"'), "pattern", '"slits"')],
    ["riser (holes)", set(set(src, "show", '"riser"'), "pattern", '"holes"')],
    ["riser (hearts)", set(set(src, "show", '"riser"'), "pattern", '"hearts"')],
    // Show=riser with the Riser box unticked once handed group() nothing
    ["riser shown with Riser unticked", set(set(src, "show", '"riser"'), "riser", "false")],
  ]) {
    let ok = false, detail = "";
    try {
      const r = await build(new Function(...names, s)(...names.map((n) => V[n])));
      const tris = (toSTL(r, "t").match(/facet/g) || []).length;
      ok = tris > 100; detail = `${tris} tris`;
    } catch (e) { detail = e.message; }
    check(`TPU box builds: ${label}`, ok, detail);
  }
  // the lift cross once had fixed 30mm arms, which cut a narrow riser apart
  const pieces = (stl) => {
    const parent = new Map();
    const find = (a) => { while (parent.get(a) !== a) a = parent.get(a); return a; };
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => `${(+m[1]).toFixed(3)},${(+m[2]).toFixed(3)},${(+m[3]).toFixed(3)}`);
    for (let i = 0; i < v.length; i += 3) {
      for (const k of v.slice(i, i + 3)) if (!parent.has(k)) parent.set(k, k);
      parent.set(find(v[i + 1]), find(v[i])); parent.set(find(v[i + 2]), find(v[i]));
    }
    return new Set([...parent.keys()].map(find)).size;
  };
  const narrow = set(set(set(src, "show", '"riser"'), "inner_width", 30), "inner_length", 30);
  const r = await build(new Function(...names, narrow)(...names.map((n) => V[n])));
  check("TPU box: a 30 x 30 riser stays one piece", pieces(toSTL(r, "t")) === 1, `${pieces(toSTL(r, "t"))} pieces`);
}

// the name tag and the knob, at the settings that once broke them
{
  const { EXAMPLES } = await import("../viewer/welcome.js");
  const D = await import("../src/dsl.js");
  const { build, toSTL } = await import("../index.js");
  const set = (s, k, v) => s.replace(new RegExp(`const ${k} = [^;]+;`), `const ${k} = ${v};`);
  const run = (src) => {
    const own = new Set([...src.matchAll(/const (\w+)/g)].map((m) => m[1]));   // the knob has its own `nut`
    const names = Object.keys(D).filter((k) => /^[a-zA-Z_$][\w$]*$/.test(k) && !own.has(k));
    return build(new Function(...names, src)(...names.map((n) => D[n])));
  };
  const verts = (r) => [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  // a fillet over half the thickness pushed the tag below the bed
  for (const [th, ef] of [[2, 1.4], [1.2, 1.5]]) {
    const s = set(set(EXAMPLES.tag.code, "edge_fillet", ef), "thickness", th);
    const z = verts(await run(s.slice(0, s.indexOf("const holeX")) + "return tag;")).map((p) => p[2]);
    check(`name tag, ${th}mm thick with a ${ef}mm fillet, sits on the bed at its set thickness`,
      Math.abs(Math.min(...z)) < 1e-6 && Math.abs(Math.max(...z) - th) < 1e-6, `${Math.min(...z)} .. ${Math.max(...z)}`);
  }
  // knurling the finished knob knurled its bore and nut pocket too
  const knob = verts(await run(EXAMPLES.knob.code.replace(/\ndifference\(/, "\nreturn difference(")));
  const inner = new Set(knob.map((p) => Math.hypot(p[0], p[1])).filter((r) => r < 10).map((r) => r.toFixed(2)));
  check("knob: the bore and the nut pocket are plain (only the bore radius and the hex corners)",
    inner.size === 2 && inner.has("2.60") && inner.has("4.73"), [...inner].join(", "));
  check("...and the outside is knurled", Math.max(...knob.map((p) => Math.hypot(p[0], p[1]))) > 17.2);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
