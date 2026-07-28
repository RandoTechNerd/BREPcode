// The built-in assistant's rule engine: parsing, follow-ups, and that every
// generated snippet actually builds into real geometry.

import {
  respond, buildModelsRequest, extractModels, modelScore,
  parseResize, resizeCode, parseFaceEdit, faceEditCode, parseScale, scaleCode,
  parseOp, opCode, EPS, buildApiRequest,
} from "../viewer/chatbot.js";
import { looksLikeOpenSCAD } from "../src/openscad.js";
import { build, toSTL } from "../index.js";
import * as dsl from "../src/dsl.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const vocab = Object.fromEntries(
  Object.entries(dsl).filter(([k, v]) => typeof v === "function" && k !== "compile"));
const names = Object.keys(vocab), values = names.map((n) => vocab[n]);
const evalCode = (src) => {
  let fn;
  try { fn = new Function(...names, `"use strict"; return (\n${src}\n);`); }
  catch { fn = new Function(...names, `"use strict";\n${src}`); }
  return fn(...values);
};

async function volumeOf(code) {
  const r = await build(evalCode(code));
  const stl = toSTL(r, "t");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}

console.log("\nrule engine\n");

// the flagship request: two shapes, no sizes -> asks, then "go ahead" builds
{
  const state = {};
  const r1 = respond("Make a box with a cone on top", state);
  check("asks for sizes first", !!r1.pending && r1.code === undefined && /size/i.test(r1.reply), r1.reply);
  state.pending = r1.pending;
  const r2 = respond("go ahead", state);
  check("go-ahead produces code", typeof r2.code === "string" && r2.code.includes("union") && r2.code.includes("cone"), r2.code);
  const vol = await volumeOf(r2.code);
  const expected = 20 * 20 * 20 + (1 / 3) * Math.PI * 100 * 18;   // default box + cone
  check("stacked model has the right volume", Math.abs(vol - expected) < 80, `${vol.toFixed(0)} vs ${expected.toFixed(0)}`);
}

// sizes inline -> builds immediately
{
  const r = respond("make a box 30 with a cone 8 on top", {});
  check("inline sizes build immediately", typeof r.code === "string" && r.code.includes("cube([30, 30, 30])"), r.code);
}

// sizes in the follow-up
{
  const state = {};
  state.pending = respond("sphere on a cylinder", state).pending;
  const r = respond("cylinder 6, sphere 9", state);
  check("follow-up sizes apply", typeof r.code === "string", r.reply);
}

// hole request -> difference
{
  const r = respond("make a plate with a hole in it, radius 4", {});
  check("hole becomes difference", typeof r.code === "string" && r.code.includes("difference") && r.code.includes("r: 4"), r.code);
  const vol = await volumeOf(r.code);
  check("hole removes material", vol < 8000, `${vol.toFixed(0)}`);
}

// side by side
{
  const r = respond("two cubes side by side 15", {});
  check("side by side unions with offset", typeof r.code === "string" && r.code.includes("union"), r.code);
}

// single shape
{
  const r = respond("make me a donut r 14 tube 3", {});
  check("torus synonyms + params", typeof r.code === "string" && r.code.includes("torus({ r: 14, tube: 3"), r.code);
}

// graceful unknowns
{
  const r = respond("write me a poem", {});
  check("unknown request stays helpful", r.code === undefined && /shape|box/i.test(r.reply), r.reply);
}
{
  const r = respond("clear", {});
  check("clear empties the editor", r.code === "");
}

// every generated snippet parses and builds
{
  const samples = [
    respond("box with a cylinder on top, box 24, cylinder 5", {}).code,
    respond("ball on a block 20", {}).code,
    respond("cone next to a sphere side by side 10", {}).code,
  ].filter(Boolean);
  let allBuild = true;
  for (const c of samples) {
    try { await build(evalCode(c)); } catch (e) { allBuild = false; console.log("    build failed:", c, e.message); }
  }
  check("all sampled outputs build", allBuild && samples.length === 3, `${samples.length} samples`);
}

console.log("\nguided flows\n");

// bracket: ask sizes -> ask holes -> generate, and it must actually build
{
  const state = {};
  const r1 = respond("I want to make a bracket", state);
  check("bracket asks for leg sizes", !!state.flow && /legs/i.test(r1.reply), r1.reply);
  const r2 = respond("40 x 60", state);
  check("bracket asks about screw holes", /holes/i.test(r2.reply), r2.reply);
  const r3 = respond("2 holes 5mm", state);
  check("bracket generates with holes", typeof r3.code === "string" && r3.code.includes("holeR = 2.5"), r3.code?.slice(0, 60));
  const vol = await volumeOf(r3.code);
  check("bracket builds with material removed", vol > 3000 && vol < 40 * 60 * 60, `${vol.toFixed(0)} mm3`);
  check("flow cleared after generation", !state.flow);
}

// picture frame: size preseeded inline -> style question -> rounded corners
{
  const state = {};
  const r1 = respond("make me a picture frame for a 4x6 photo", state);
  check("frame skips to style question", /square|rounded/i.test(r1.reply), r1.reply);
  const r2 = respond("rounded please", state);
  check("frame generates rounded", typeof r2.code === "string" && r2.code.includes("cylinder"), r2.reply);
  check("frame converted inches to mm", r2.code.includes("PW = 102") && r2.code.includes("PH = 152"), r2.code.split("\n")[1]);
  const vol = await volumeOf(r2.code);
  check("frame builds hollow", vol > 4000 && vol < 126 * 176 * 5, `${vol.toFixed(0)} mm3`);
}

// holder: wall-mount variant
{
  const state = {};
  respond("I need a pen holder", state);
  respond("50 wide, 90 deep", state);
  const r = respond("wall mount", state);
  check("wall-mount holder has a screw hole", typeof r.code === "string" && r.code.includes("rotate([90, 0, 0]"), r.reply);
  const vol = await volumeOf(r.code);
  check("holder builds", vol > 5000, `${vol.toFixed(0)}`);
}

// facet commands act on the current code
{
  const cur = "difference(cube([20,20,20]), cylinder({ r: 5, h: 30, $fn: 32 }))";
  const r = respond("make it smoother", {}, cur);
  check("smoother doubles $fn", r.code?.includes("$fn: 64"), r.code);
  const r2 = respond("low poly please", {}, r.code);
  check("low poly halves $fn", r2.code?.includes("$fn: 32"), r2.code);
  const r3 = respond("smoother", {}, "cube([5,5,5])");
  check("no $fn -> explains instead of failing", r3.code === undefined && /\$fn/.test(r3.reply), r3.reply);
}

// beyond built-in skills -> point at the API
{
  const r = respond("design me a helical gear with 24 teeth", {});
  check("complex requests recommend the API", r.code === undefined && /API|key|⚙/i.test(r.reply), r.reply);
}

// generated code must route to the JS evaluator, never the OpenSCAD parser —
// the frame's `const PW = …` once tripped the OpenSCAD heuristic in the viewer
{
  const state = {};
  respond("bracket", state); respond("go ahead", state);
  const bracket = respond("2 holes", state).code;
  const frame = (() => { const s = {}; respond("picture frame 4x6", s); return respond("square", s).code; })();
  const holder = (() => { const s = {}; respond("holder", s); respond("go ahead", s); return respond("freestanding", s).code; })();
  const misrouted = [bracket, frame, holder].filter((c) => c && looksLikeOpenSCAD(c));
  check("no generated code misroutes to the OpenSCAD parser", misrouted.length === 0,
    misrouted[0]?.slice(0, 50));
}

// natural-language transforms wrap the current model
{
  const cur = "difference(cube([30,30,12]), translate([15,15,-1], cylinder({ r: 8, h: 14, $fn: 64 })))";
  const flip = respond("flip it", {}, cur);
  check("flip wraps rotate 180 about X", flip.code?.startsWith("rotate([180, 0, 0], ("), flip.code?.slice(0, 40));
  const vol0 = await volumeOf(cur), vol1 = await volumeOf(flip.code);
  check("flip preserves volume", Math.abs(vol0 - vol1) < 5, `${vol0.toFixed(0)} vs ${vol1.toFixed(0)}`);

  const rot = respond("rotate it 45 around y", {}, cur);
  check("rotate parses angle and axis", rot.code?.startsWith("rotate([0, 45, 0]"), rot.code?.slice(0, 30));

  const up = respond("move it up 12", {}, cur);
  check("move up translates +Z", up.code?.startsWith("translate([0, 0, 12]"), up.code?.slice(0, 30));

  const big = respond("make it twice as big", {}, cur);
  check("twice as big scales x2", big.code?.startsWith("scale(2, ("), big.code?.slice(0, 20));

  const empty = respond("flip it", {}, "");
  check("transform with empty editor explains", empty.code === undefined && /nothing/i.test(empty.reply), empty.reply);

  // statement-form current code: the final return gets wrapped, and it builds
  const s = {};
  respond("bracket", s); respond("go ahead", s);
  const bracket = respond("2 holes", s).code;
  const flipped = respond("flip it", {}, bracket);
  check("statement-form return is wrapped", /return rotate\(\[180, 0, 0\], \(/.test(flipped.code), flipped.code?.split("\n").pop());
  const vb = await volumeOf(bracket), vf = await volumeOf(flipped.code);
  check("flipped bracket still builds, same volume", Math.abs(vb - vf) < 5, `${vb.toFixed(0)} vs ${vf.toFixed(0)}`);

  // creation+transform in one sentence stays a creation
  const combo = respond("make a box and rotate it 45", {}, cur);
  check("make-and-rotate is not hijacked as a transform", !combo.code?.startsWith("rotate("), combo.reply?.slice(0, 40));
}

// cancel bails out of a flow
{
  const state = {};
  respond("make a bracket", state);
  const r = respond("cancel", state);
  check("cancel clears the flow", !state.flow && /cancel/i.test(r.reply));
}

console.log("\nmodel discovery\n");
{
  const g = buildModelsRequest({ provider: "gemini", key: "K" });
  check("gemini list URL", g.url.includes("/v1beta/models?") && g.url.includes("key=K"));
  const c = buildModelsRequest({ provider: "claude", key: "K" });
  check("claude list uses browser header", c.options.headers["anthropic-dangerous-direct-browser-access"] === "true");

  const gm = extractModels("gemini", { models: [
    { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-2.0-flash-live", supportedGenerationMethods: ["generateContent"] },
  ]});
  check("gemini filter keeps chat models only", JSON.stringify(gm) === JSON.stringify(["gemini-2.5-pro", "gemini-2.5-flash"]), JSON.stringify(gm));

  const cm = extractModels("claude", { data: [{ id: "claude-sonnet-5" }, { id: "claude-haiku-4-5" }] });
  check("claude list parses ids", cm.join(",") === "claude-sonnet-5,claude-haiku-4-5");

  try { extractModels("gemini", { error: { message: "API key not valid" } }); check("error payload throws", false); }
  catch (e) { check("error payload throws with message", /API key/.test(e.message)); }
}


// The dropdown is ordered by modelScore, so this decides which model a new user
// actually gets. It has to keep working for names that did not exist when it was
// written, which is why the version is parsed out rather than matched to a list.
console.log("\nmodel ranking\n");
{
  const rank = (ids) => [...ids].sort((a, b) => modelScore(b) - modelScore(a));
  const beats = (a, b) => modelScore(a) > modelScore(b);
  check("a newer version outranks an older one", beats("claude-opus-5", "claude-opus-4-8"));
  check("within a version, opus outranks sonnet", beats("claude-opus-5", "claude-sonnet-5"));
  check("and sonnet outranks haiku", beats("claude-sonnet-5", "claude-haiku-4-5"));
  check("a newer sonnet outranks an older opus", beats("claude-sonnet-5", "claude-opus-4-6"));
  check("gemini pro outranks gemini flash", beats("gemini-2.5-pro", "gemini-2.5-flash"));
  check("previews are nudged down", beats("gemini-2.5-pro", "gemini-2.5-pro-preview"));
  check("an unreleased opus still lands on top",
    rank(["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-7"])[0] === "claude-opus-7");
  check("a dated id is not read as a version number",
    modelScore("claude-haiku-4-5-20251001") === modelScore("claude-haiku-4-5"));
}


// ---- resize without an LLM ------------------------------------------------
// "decrease width by 30%" is arithmetic, not authorship: given the measured
// size there is one right answer. Doing it locally means it works with no API
// key AND cannot hallucinate a bounding box, which is the failure this exact
// operation is famous for. What must hold is that the phrasing maps to the
// right axis and amount, that ambiguous wording falls through to the AI rather
// than guessing, and that the emitted code really builds to the stated size.
{
  const dims = [120, 65.44, 5.4];           // the user's real picture frame
  const R = (q) => parseResize(q, dims);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const boundsOf = async (code) => {
    const stl = toSTL(await build(evalCode(code)), "t");
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    if (!v.length) throw new Error("no vertices parsed — the model built to nothing");
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const p of v) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    return { x: [lo[0], hi[0]], y: [lo[1], hi[1]], z: [lo[2], hi[2]] };
  };

  check("percent shrink picks the x axis and the right amount",
    R("decrease width by 30%")?.axis === "x" && R("decrease width by 30%")?.by === -36,
    JSON.stringify(R("decrease width by 30%")));
  check("percent grow works too", R("increase width by 25%")?.by === 30);
  check("a comparative counts as an axis word", R("make it 30% taller")?.axis === "z");

  // "by N" is a CHANGE, "to N" is a TARGET. Confusing them turns "reduce the
  // depth by 10mm" into "set the depth to 10mm" — looks fine, destroys the part.
  check("\"by 10mm\" is a change, not a target", R("reduce the depth by 10mm")?.by === -10,
    JSON.stringify(R("reduce the depth by 10mm")));
  check("\"to 80\" is a target", R("set the width to 80")?.target === 80);
  check("\"50mm wide\" is a target", R("make it 50mm wide")?.target === 50);
  check("\"20mm longer\" is a change", R("20mm longer")?.by === 20);
  check("an absolute target needs no direction word", R("make it 40mm tall")?.target === 40);

  // ambiguity must reach the AI, not be guessed at
  check("\"make it smaller\" falls through", R("make it smaller") === null);
  check("a relative change with no direction falls through", R("change the width by 20%") === null);
  check("an unrelated request falls through", R("make a box with a cone on top") === null);
  check("no dims means no local resize", parseResize("decrease width by 30%", null) === null);

  check("a nonsense reduction is refused, not built",
    /nothing left/.test(R("decrease width by 99.9%")?.error || ""), JSON.stringify(R("decrease width by 99.9%")));

  // the emitted code has to be real, and it has to recentre
  // a stand-in frame registered under the same name, so the emitted code builds
  dsl.registerImport("frame.stl", toSTL(await build(
    dsl.difference(dsl.cube([120, 65.44, 5.4], { center: true }),
      dsl.cube([106, 45, 20], { center: true }))), "frame"));
  const src = 'return importedMesh("frame.stl", { split: true });';
  const out = resizeCode(src, R("decrease width by 30%"));
  check("emitted code cuts at 0, not at width/2", /at:\s*0\b/.test(out) && !/at:\s*\d\d/.test(out), out);
  check("emitted code recentres the result", /translate\(\[18, 0, 0\]/.test(out), out);
  check("emitted code keeps the filename byte-identical", out.includes('importedMesh("frame.stl", { split: true })'), out);

  const b = await boundsOf(out);
  check("...and it really builds 84mm wide", near(b.x[1] - b.x[0], 84, 0.05),
    `got ${(b.x[1] - b.x[0]).toFixed(2)}`);
  check("...still centred after the resize", near(b.x[0] + b.x[1], 0, 0.05),
    `${b.x[0].toFixed(2)}..${b.x[1].toFixed(2)}`);
  check("...other axes untouched",
    near(b.y[1] - b.y[0], 65.44, 0.05) && near(b.z[1] - b.z[0], 5.4, 0.05));
}

// ---- one-sided face work and scaling --------------------------------------
// "Take 0.2mm off the top" is NOT a cut through the middle, and reading it as
// one would quietly delete a slab out of the centre of the part. Each of these
// is built and measured, because a plausible-looking cutter in the wrong place
// is the failure mode that costs a print.
{
  const near2 = (a, b, tol) => Math.abs(a - b) <= tol;
  const bounds = async (code) => {
    const stl = toSTL(await build(evalCode(code)), "t");
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    if (!v.length) throw new Error("built to nothing");
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const p of v) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    return { size: hi.map((h, i) => h - lo[i]), min: lo, max: hi };
  };

  // a frame-shaped part, centred on x/y and sitting on z = 0
  const SRC = 'return difference(\n  translate([-60, -32.72, 0], cube([120, 65.44, 5.4])),\n  translate([-53, -22, -1], cube([106, 44, 8])));';
  const base = await bounds(SRC);
  const box = { min: base.min, max: base.max };

  for (const [q, want] of [
    ["take 0.2mm off the top",     [120, 65.44, 5.2]],
    ["shave 1mm off the bottom",   [120, 65.44, 4.4]],
    ["extend right side by 7mm",   [127, 65.44, 5.4]],
    ["extend the left side by 7mm",[127, 65.44, 5.4]],
    ["add 5mm to the top",         [120, 65.44, 10.4]],
    ["trim 2mm from the left",     [118, 65.44, 5.4]],
    ["double the width",           [240, 65.44, 5.4]],
    ["half the height",            [120, 65.44, 2.7]],
  ]) {
    const f = parseFaceEdit(q, box);
    const sc = f ? null : parseScale(q, box);
    check(`"${q}" is recognised`, !!(f || sc));
    if (!(f || sc)) continue;
    const got = await bounds(f ? faceEditCode(SRC, f) : scaleCode(SRC, sc));
    check(`  ...builds ${want.join(" × ")}`,
      want.every((w, i) => near2(got.size[i], w, 0.06)),
      got.size.map((n) => n.toFixed(2)).join(" × "));
    // whatever we do, the part must still be sitting on the bed
    check("  ...and still sits on z = 0", near2(got.min[2], 0, 0.06), got.min[2].toFixed(2));
  }

  // a named face must beat the middle-cut reading
  check("a face phrase does not fall through to the middle cut",
    parseFaceEdit("take 2mm off the right", box)?.kind === "trim");
  check("...while a bare axis phrase still goes to the middle",
    parseFaceEdit("decrease width by 30%", box) === null
      && parseResize("decrease width by 30%", box)?.by === -36);

  // refusals rather than slivers
  check("trimming more than exists is refused",
    /whole part/.test(parseFaceEdit("take 200mm off the right", box)?.error || ""),
    JSON.stringify(parseFaceEdit("take 200mm off the right", box)));
  check("an ambiguous face phrase falls through",
    parseFaceEdit("the top looks nice", box) === null);
  check("scale needs to be asked for by name",
    parseScale("make it wider", box) === null);
}

// ---- plain-English operations ---------------------------------------------
// "Punch a hole in it", "round the edges", "drop it to the floor". Each has one
// sensible reading given the box, so none needs a follow-up. The epsilon
// overshoot is the part that must not regress: a cutter flush with the solid's
// face is a coincident face, which looks fine in the viewer and prints as a
// skin over the hole.
{
  const near2 = (a, b, tol) => Math.abs(a - b) <= tol;
  const measure = async (code) => {
    const stl = toSTL(await build(evalCode(code)), "t");
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    if (!v.length) throw new Error("built to nothing");
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    let vol = 0;
    for (const p of v) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    for (let i = 0; i < v.length; i += 3) {
      const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
      vol += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2]) + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
    }
    return { size: hi.map((h, i) => h - lo[i]), min: lo, vol: Math.abs(vol) };
  };

  const SRC = "return translate([0, 0, 5], cube([100, 60, 10]));";   // floating 5mm up
  const base = await measure(SRC);
  const box = { min: base.min, max: base.min.map((n, i) => n + base.size[i]) };

  // the phrases from the translation lexicon
  for (const [q, kind] of [
    ["punch a hole in it", "hole"], ["take a bite out of the middle", "hole"],
    ["cut a hole through it", "hole"],
    ["round the edges", "round"], ["smooth it", "round"], ["soften the corners", "round"],
    ["bevel the edges", "bevel"], ["chamfer it", "bevel"],
    ["drop it to the floor", "floor"], ["centre it", "centre"], ["center it", "centre"],
  ]) {
    const op = parseOp(q, box);
    check(`"${q}" reads as ${kind}`, op?.kind === kind, JSON.stringify(op));
  }

  // and each one builds into geometry that actually changed
  const hole = parseOp("punch a hole in it", box);
  const holeCode = opCode(SRC, hole);
  check("the hole cutter starts BELOW the base (epsilon)",
    holeCode.includes(`${base.min[2] - 0.01}`), holeCode);
  check("...and is taller than the part (epsilon at both ends)",
    /h: 10\.02\b/.test(holeCode), holeCode);
  const holed = await measure(holeCode);
  check("...and really removes a cylinder of material",
    near2(base.vol - holed.vol, Math.PI * 10 * 10 * 10, 60),
    `removed ${(base.vol - holed.vol).toFixed(0)}, expected ${(Math.PI * 1000).toFixed(0)}`);

  const floored = await measure(opCode(SRC, parseOp("drop it to the floor", box)));
  check("drop to the floor lands the base exactly on z = 0", near2(floored.min[2], 0, 0.02), `${floored.min[2]}`);

  const centred = await measure(opCode(SRC, parseOp("centre it", box)));
  check("centre it centres on x and y",
    near2(centred.min[0] + centred.size[0] / 2, 0, 0.02) && near2(centred.min[1] + centred.size[1] / 2, 0, 0.02));

  const rounded = await measure(opCode(SRC, parseOp("round the edges", box)));
  check("rounding eases material off without changing the size",
    rounded.vol < base.vol && near2(rounded.size[0], 100, 0.05), `${rounded.vol.toFixed(0)}`);

  // sizes are honoured when given, and refused when impossible
  check("an explicit hole size is used", parseOp("punch a 20mm hole", box)?.dia === 20);
  check("a radius is doubled to a diameter", parseOp("punch a hole r 5", box)?.dia === 10);
  check("an explicit fillet radius is used", parseOp("round the edges 2mm", box)?.r === 2);
  check("a hole bigger than the part is refused",
    /doesn't fit/.test(parseOp("punch a 90mm hole", box)?.error || ""));
  check("a fillet bigger than the part is refused",
    /too big/.test(parseOp("round it by 40mm", box)?.error || ""));
  check("already on the floor says so rather than moving it",
    parseOp("drop it to the floor", { min: [0, 0, 0], max: [10, 10, 10] })?.already === true);

  // things this must NOT claim
  check("hollow goes to the AI — there is no shell operator", parseOp("make it hollow", box) === null);
  check("\"put a cone on top\" goes to the AI", parseOp("put a cone on top", box) === null);
  check("a face phrase is left to the face editor", parseOp("round the top edge", box) === null);
  check("no dims means no local op", parseOp("punch a hole in it", null) === null);
}

// --- an attached image reaches the wire --------------------------------
//
// sendChat sets msg.images and this builder is the only thing between that
// and the provider — if it drops them, the user attaches a sketch and the
// model silently never sees it.
{
  const msgs = [{ role: "user", text: "match this sketch",
    images: [{ media_type: "image/png", data: "AAAA" }] }];
  const c = JSON.parse(buildApiRequest({ provider: "claude", model: "m", key: "k" }, msgs).options.body);
  check("claude: the image is a content block", Array.isArray(c.messages[0].content)
    && c.messages[0].content[0].type === "image"
    && c.messages[0].content[0].source.data === "AAAA");
  check("claude: the text still arrives", c.messages[0].content[1].text === "match this sketch");
  const g = JSON.parse(buildApiRequest({ provider: "gemini", model: "m", key: "k" }, msgs).options.body);
  check("gemini: the image is inline_data", g.contents[0].parts[0].inline_data.data === "AAAA");
  check("gemini: the text still arrives", g.contents[0].parts[1].text === "match this sketch");
  const plain = JSON.parse(buildApiRequest({ provider: "claude", model: "m", key: "k" },
    [{ role: "user", text: "no image" }]).options.body);
  check("no image means the plain string shape, unchanged", plain.messages[0].content === "no image");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

