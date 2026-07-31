// The built-in assistant's rule engine: parsing, follow-ups, and that every
// generated snippet actually builds into real geometry.

import {
  respond, buildModelsRequest, extractModels, modelScore,
  parseResize, resizeCode, parseFaceEdit, faceEditCode, parseScale, scaleCode,
  parseOp, opCode, EPS, buildApiRequest, harnessTags, filterHarness, composeSystem,
  readClaudeStream, readOpenAIStream, emptyReplyReason, extractApiText, extractApiThinking,
  localBase, openaiBase, composeStyle, STYLE_LANGUAGES,
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
  // In-browser WebLLM ids rank by parameter count — the download picker shows
  // the most capable first, while the app pre-selects the safe 1.5B itself.
  // The compact mission exists for models with 4-8k-token windows: it must
  // stay SMALL (the whole point), and still teach the vocabulary + the
  // one-fenced-block reply shape. ~4 chars/token makes 3000 chars ≈ 750
  // tokens — a fifth of the smallest window.
  const M = await import("../viewer/chatbot.js");
  const CH = M.COMPACT_HARNESS, PH = M.POLISH_HARNESS;
  check("compact mission stays compact", CH.length < 3000, `${CH.length} chars`);
  check("...teaching only the BASE vocabulary",
    ["cube", "cylinder", "difference", "group", "return"].every((w) => CH.includes(w)));
  check("...with the fancy ops held back for the polish pass",
    !/fillet\(r, shape\)/.test(CH) && /Polish pass/.test(CH));
  check("...and the reply shape", /fenced code block/i.test(CH));
  check("...and warns off invented words", /hole\(\)/.test(CH));
  // the polish pass is where rounding/colour unlock, on code that already works
  check("polish mission unlocks fillet/chamfer/colour",
    ["fillet", "chamfer", "colorize", "cone", "torus"].every((w) => PH.includes(w)));
  check("...and protects what already works",
    /ALREADY BUILDS/.test(PH) && /EXACTLY as it is/.test(PH));
  check("...while staying compact too", PH.length < 2000, `${PH.length} chars`);
  check("browser models rank by size",
    rank([
      "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC",
      "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
      "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
      "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    ]).join(" ").match(/-(7|3|1\.5|0\.5)B/g).join(" ") === "-7B -3B -1.5B -0.5B");
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

// --- optional #sections in the mission --------------------------------------
//
// One harness, several dialects: a `#name` line starts a named block, a chip
// turns it off, and the model never sees markers or disabled text.
{
  const NL = String.fromCharCode(10);
  const H = ["Core mission.", "#openscad", "Scad rule A.", "#jscad", "Jscad rule.", "#openscad", "Scad rule B."].join(NL);
  check("tags found once each", harnessTags(H).join(",") === "openscad,jscad");
  const scadOnly = filterHarness(H, ["jscad"]);
  check("a disabled section is gone", !scadOnly.includes("Jscad rule"));
  check("...both blocks of the SAME tag survive together",
    scadOnly.includes("Scad rule A.") && scadOnly.includes("Scad rule B."));
  check("the preamble is always sent", scadOnly.startsWith("Core mission."));
  check("marker lines are never sent", !filterHarness(H, []).includes("#openscad"));
  check("no tags means text passes through", filterHarness("plain text", []) === "plain text");
  // and the composed system honours it, since that is what actually ships
  const sys = composeSystem({ harness: filterHarness(H, ["openscad"]) });
  check("composeSystem carries the filtered mission",
    sys.includes("Jscad rule.") && !sys.includes("Scad rule A."));
}

// ---- streamed Claude replies + the "no response" bug -----------------------
{
  // a synthetic SSE body: thinking first, then text, then the stop reason
  const events = [
    { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm, goggles need" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: " two tubes" } },
    { type: "content_block_start", index: 1, content_block: { type: "text" } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Here you go.\n```js\nreturn cube([10,10,10]);\n```" } },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ];
  const sse = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const resp = { body: new Blob([sse]).stream() };
  const seen = [];
  const json = await readClaudeStream(resp, (p) => seen.push(p.phase));
  check("stream reassembles into the non-streaming shape",
    json.stop_reason === "end_turn" && json.content.length === 2);
  check("...text extraction works unchanged",
    extractApiText("claude", json).includes("return cube"));
  check("...thinking extraction works unchanged",
    extractApiThinking("claude", json) === "hmm, goggles need two tubes");
  check("...progress reported both phases",
    seen.includes("thinking") && seen.includes("writing"));
}
{
  // THE bug: budget burned on thinking, stop_reason max_tokens, zero text —
  // used to surface as "Empty response" / nothing at all
  const thoughtOnly = { content: [{ type: "thinking", thinking: "…" }], stop_reason: "max_tokens" };
  check("thinking-only max_tokens reply explains itself",
    /budget thinking/.test(emptyReplyReason("claude", thoughtOnly)));
  check("a provider error passes through verbatim",
    emptyReplyReason("claude", { error: { message: "overloaded_error" } }) === "overloaded_error");
  check("a truly empty reply still gets a sentence",
    emptyReplyReason("claude", {}).length > 20);
  // and the request that avoids it in the first place
  const req = buildApiRequest({ provider: "claude", model: "m", key: "k" }, [{ role: "user", text: "hi" }], { stream: true });
  const body = JSON.parse(req.options.body);
  check("claude requests stream with a 32k budget", body.stream === true && body.max_tokens === 32000);
  const req2 = buildApiRequest({ provider: "claude", model: "m", key: "k" }, [{ role: "user", text: "hi" }]);
  check("...and stream stays off unless asked", JSON.parse(req2.options.body).stream === undefined);
}

// ---- local (OpenAI-compatible) provider ------------------------------------
{
  check("blank URL means the llama.cpp default", localBase("") === "http://localhost:8080/v1");
  check("bare host:port gets scheme + /v1", localBase("localhost:11434") === "http://localhost:11434/v1");
  check("trailing slash and existing /v1 are respected", localBase("http://localhost:1234/v1/") === "http://localhost:1234/v1");
  const req = buildApiRequest({ provider: "local", model: "bonsai-27b", key: "" },
    [{ role: "user", text: "a cube" }], { stream: true });
  const body = JSON.parse(req.options.body);
  check("local request is OpenAI-shaped", req.url === "http://localhost:8080/v1/chat/completions"
    && body.stream === true && body.messages[0].role === "system" && body.messages[1].content === "a cube");
  const models = extractModels("local", { data: [{ id: "bonsai-27b" }, { id: "qwen2.5" }] });
  check("local model list extracts", models.join() === "bonsai-27b,qwen2.5");
  // Bionic/LM Studio list embedding models too — auto-picking one as the
  // chat default answers nothing, so they never reach the dropdown
  const mixed = extractModels("local", { data: [
    { id: "ternary-bonsai-27b" }, { id: "text-embedding-nomic-embed-text-v1.5" }, { id: "whisper-large-v3" },
  ] });
  check("embedding/audio models are filtered from the local list",
    mixed.join() === "ternary-bonsai-27b", mixed.join());
}
{
  const events = [
    { choices: [{ delta: { reasoning_content: "two tubes, " } }] },
    { choices: [{ delta: { reasoning_content: "a bridge" } }] },
    { choices: [{ delta: { content: "Here.\n```js\nreturn cube([5,5,5]);\n```" }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: "stop" }] },
  ];
  const sse = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  const seen = [];
  const json = await readOpenAIStream({ body: new Blob([sse]).stream() }, (p) => seen.push(p.phase));
  check("openai stream reassembles", extractApiText("local", json).includes("return cube"));
  check("...reasoning lands in the thinking bubble", extractApiThinking("local", json) === "two tubes, a bridge");
  check("...both phases reported", seen.includes("thinking") && seen.includes("writing"));
}
{
  // Qwen-style inline <think> is split out of the reply
  const json = { choices: [{ message: { content: "<think>hmm sizes</think>Here.\n```js\nreturn cube([5,5,5]);\n```" } }] };
  check("<think> block is stripped from the reply", !extractApiText("local", json).includes("hmm sizes"));
  check("...and surfaces as thinking", extractApiThinking("local", json) === "hmm sizes");
  check("empty local reply explains itself", /local server|model loaded/i.test(emptyReplyReason("local", {})));
}

console.log("\nOpenAI provider\n");
{
  check("base URL defaults to OpenAI", openaiBase("") === "https://api.openai.com/v1");
  check("a bare host gets https + /v1", openaiBase("openrouter.ai/api") === "https://openrouter.ai/api/v1");
  check("an explicit /v1 is left alone", openaiBase("https://x.test/v1") === "https://x.test/v1");
  check("trailing slashes are trimmed", openaiBase("https://x.test/v1/") === "https://x.test/v1");

  const msgs = [{ role: "user", text: "make a cube" }];
  const r = buildApiRequest({ provider: "openai", model: "gpt-4o", key: "sk-x" }, msgs);
  check("chat hits /chat/completions", r.url === "https://api.openai.com/v1/chat/completions");
  check("key rides as a Bearer token", r.options.headers.Authorization === "Bearer sk-x");
  const body = JSON.parse(r.options.body);
  check("model is passed through", body.model === "gpt-4o");
  check("a normal model uses max_tokens", body.max_tokens === 8000 && body.max_completion_tokens === undefined);
  check("the harness goes in as system", body.messages[0].role === "system");
  check("the user turn survives", body.messages[1].content === "make a cube");

  // reasoning models renamed the budget field and take "developer", not
  // "system" — sending the old shape is a hard 400 rather than a warning
  const o = JSON.parse(buildApiRequest({ provider: "openai", model: "o4-mini", key: "k" }, msgs).options.body);
  check("a reasoning model uses max_completion_tokens",
    o.max_completion_tokens === 16000 && o.max_tokens === undefined);
  check("...and takes a developer role", o.messages[0].role === "developer");
  const g5 = JSON.parse(buildApiRequest({ provider: "openai", model: "gpt-5", key: "k" }, msgs).options.body);
  check("gpt-5 counts as a reasoning model", g5.max_completion_tokens === 16000);

  // an attached sketch becomes an image_url part ahead of the text
  const img = buildApiRequest({ provider: "openai", model: "gpt-4o", key: "k" },
    [{ role: "user", text: "like this", images: [{ media_type: "image/png", data: "AAA" }] }]);
  const parts = JSON.parse(img.options.body).messages[1].content;
  check("an image rides as a data URI", parts[0].image_url.url === "data:image/png;base64,AAA");
  check("...with the text after it", parts[1].text === "like this");

  // a custom base URL is what makes OpenRouter / Azure / a proxy work
  const alt = buildApiRequest({ provider: "openai", model: "gpt-4o", key: "k", baseUrl: "https://openrouter.ai/api/v1" }, msgs);
  check("a custom base URL is honoured", alt.url === "https://openrouter.ai/api/v1/chat/completions");

  const mr = buildModelsRequest({ provider: "openai", key: "sk-y" });
  check("model listing hits /models", mr.url === "https://api.openai.com/v1/models");
  check("...authenticated the same way", mr.options.headers.Authorization === "Bearer sk-y");

  const list = extractModels("openai", {
    data: [{ id: "gpt-4o" }, { id: "o4-mini" }, { id: "text-embedding-3-small" },
      { id: "whisper-1" }, { id: "dall-e-3" }, { id: "tts-1" }, { id: "gpt-4o-realtime-preview" }],
  });
  check("only chat models are offered", list.includes("gpt-4o") && list.includes("o4-mini"));
  check("...embeddings, audio and image models are not",
    !list.some((m) => /embedding|whisper|dall|tts|realtime/.test(m)), list.join(","));

  check("reply text is read from choices",
    extractApiText("openai", { choices: [{ message: { content: "hi" } }] }) === "hi");
  check("a length stop explains itself",
    /token limit/i.test(emptyReplyReason("openai", { choices: [{ finish_reason: "length" }] })));
}

console.log("\nbuild style — language, approach, passes\n");
{
  check("an empty style says nothing", composeStyle({}) === "");
  check("BREPcode adds no language block", !/OUTPUT LANGUAGE/.test(composeStyle({ language: "brepcode" })));
  check("OpenSCAD is named", /OUTPUT LANGUAGE — OpenSCAD/.test(composeStyle({ language: "openscad" })));
  check("JSCAD asks for a real module", /module\.exports/.test(composeStyle({ language: "jscad" })));
  check("build123d pins ALGEBRA mode",
    /ALGEBRA/.test(STYLE_LANGUAGES.build123d) && /not builder mode/i.test(STYLE_LANGUAGES.build123d));

  const it = composeStyle({ approach: "iterative" });
  check("iterative asks for the block, not the statue", /SIMPLEST solid/.test(it) && /sculptor/.test(it));
  check("...and forbids the cosmetic detail up front", /Leave out fillets/.test(it));
  check("one shot asks for the finished part", /ONE SHOT/.test(composeStyle({ approach: "oneshot" })));

  // geometry first, always — that is the whole point of the ordering
  const s = composeStyle({ colour: true, material: false, texture: true, pattern: false, lighting: false });
  check("geometry is stated first", /GEOMETRY FIRST/.test(s));
  check("wanted passes are ordered", /1\. COLOUR/.test(s) && /2\. TEXTURE/.test(s), s.slice(0, 200));
  check("unwanted passes are named as off",
    /Do NOT spend[^\n]*material[^\n]*pattern[^\n]*lighting/.test(s), s.slice(-160));
  check("all-off means geometry only",
    /geometry only/.test(composeStyle({ colour: false, material: false, texture: false, pattern: false, lighting: false })));
  // an untouched setting must not start dictating priorities
  check("no pass keys at all => no PRIORITIES block",
    !/PRIORITIES/.test(composeStyle({ language: "openscad", approach: "oneshot" })));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

