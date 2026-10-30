// The case builder: brepcode.com/case, and "Case builder" in the Toolbox.
//
// Type the case's size, and the grid inside it appears: one square per 15 mm
// Casefinity module. Paint it like a minesweeper board: drag across squares
// to mark an area as a box, a box with a lid, or separators, as one big piece
// or one per square. Start from a ready layout if you would rather. Build
// writes a caseKit() call into the editor, which lays every printable part
// side by side; Export then saves them as 3MF (one plate per file) or STL.
//
// The grid system is Chris Agocs's Casefinity spec (casefinity.net), built on
// "Gridfinity for Hardcases" by the Unemployed Architect. The credits sit in
// the builder's footer and in the code it writes, on purpose: people who meet
// the system here should know whose it is.
//
// Like make.js this is an overlay inside the app, and everything that touches
// the model goes through the hooks passed to showCaseBuilder(), so it can be
// read on its own. The pure parts (fit, presets, the code it writes and reads
// back) are exported for test/casebuilder.js.

import { casefinityFit, CASEKIT_COLORS } from "../src/casefinity.js";
import { kuggisFit, kuggisEstimate, KUGGIS_SIZES } from "../src/kuggis.js";

export const CREDITS = Object.freeze({
  casefinity: "https://casefinity.net",
  spec: "https://casefinity.net/casefinity-spec",
  github: "https://github.com/agocs/casefinity",
  hardcases: "https://www.patreon.com/UnemployedArchitect/posts/gridfinity-for-162320687",
  patreon: "https://www.patreon.com/cw/UnemployedArchitect",
  video: "https://www.youtube.com/watch?v=YSqm821ekR4",
  // the Koch Box style follows Luca Koch's Parametric Hinged Storage Box
  koch: "https://www.printables.com/model/1517296-parametric-hinged-storage-box-with-snap-fit-lid-cu",
});

const KINDS = ["box", "lidbox", "frame"];
const LABEL = { box: "Box", lidbox: "Box + lid", frame: "Separators", erase: "Erase" };
const STORE = "brepcode-casebuilder";
// gasket is opt-in every time: it is never remembered, only read back from
// code that already asks for it
export const DEFAULTS = Object.freeze({ width: 200, depth: 140, height: 70, inside: false, includeCase: true, gasket: false, latch: "hook", kochLatch: "swingpip", lidFit: 0.3, style: "smooth", container: "case",
  // advanced: the case's own walls and fits (mm)
  wall: 4, floor: 2, binWall: 1.2, pinFit: 0.1 });
export const KOCH_LATCHES = ["swing", "swingpip", "toggle"];
// The other container: an IKEA KUGGIS box, its inside as the builder knows
// it. Starts as the 26 x 35 x 15 estimated from its outside size; every
// number is the user's to measure and correct.
export const KUGGIS_DEFAULT_SIZE = "26x35x15";
export function defaultKuggis(sizeId = KUGGIS_DEFAULT_SIZE) {
  const sz = KUGGIS_SIZES.find((k) => k.id === sizeId) || KUGGIS_SIZES[3];
  return { size: sz.id, ...kuggisEstimate(sz) };
}

// Does this address ask for the case builder? ?case=1 is what the /case
// bounce sends; #case is for a link typed by hand; /case is the tidy path.
// /m/case would be a MODEL called "case", and is not ours.
export function isCaseUrl({ search = "", hash = "", pathname = "" } = {}) {
  return /[?&]case=1(&|$)/.test(search)
    || /^#case$/i.test(hash)
    || (/(^|\/)case\/?(index\.html)?$/i.test(pathname) && !/(^|\/)m\/case\/?$/i.test(pathname));
}

// ------------------------------------------------------------------ layouts

const overlaps = (a, b) => a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;
const inGrid = (g, cols, rows) => g.c >= 0 && g.r >= 0 && g.c + g.w <= cols && g.r + g.h <= rows;

// Tile tw x th pieces across an area, with narrower pieces filling the
// leftover edge, so a preset always covers the whole grid.
function tile(c0, r0, w, h, tw, th, kind, split = false) {
  const out = [];
  for (let r = r0; r < r0 + h; r += th) {
    for (let c = c0; c < c0 + w; c += tw) {
      out.push({ c, r, w: Math.min(tw, c0 + w - c), h: Math.min(th, r0 + h - r), kind, split });
    }
  }
  return out;
}

// The ready layouts. Each is a function of the grid, so it fits any case.
export const PRESETS = [
  // Separators first: it is the first-visit default. Open 3 x 3 frames (45 mm
  // compartments), each a plain rim with no inner walls, so the whole kit
  // builds in a couple of seconds. The fine grid below is one frame with a
  // wall on every 15 mm line, and every wall is a boolean the kernel pays
  // for: on the default case that is 20 walls and the slowest layout here,
  // slower than 65 small boxes.
  { id: "dividers", label: "Separators", blurb: "open 45 mm compartments", make: (C, R) => tile(0, 0, C, R, 3, 3, "frame") },
  { id: "fine", label: "Fine grid", blurb: "a wall on every 15 mm line", make: (C, R) => [{ c: 0, r: 0, w: C, h: R, kind: "frame", split: true }] },
  { id: "small", label: "Small boxes", blurb: "one box per square", make: (C, R) => [{ c: 0, r: 0, w: C, h: R, kind: "box", split: true }] },
  { id: "two", label: "2 × 2 boxes", blurb: "30 mm boxes", make: (C, R) => tile(0, 0, C, R, 2, 2, "box") },
  { id: "mixed", label: "Big + small", blurb: "a long tray, small boxes beside it", make: (C, R) => {
    const big = Math.max(1, Math.ceil(C / 3));
    return [{ c: 0, r: 0, w: big, h: R, kind: "box", split: false },
      ...(C > big ? [{ c: big, r: 0, w: C - big, h: R, kind: "box", split: true }] : [])];
  } },
  { id: "rows", label: "Trays", blurb: "long trays, front to back", make: (C, R) => tile(0, 0, C, R, C, 2, "box") },
  { id: "lidded", label: "Lidded parts", blurb: "2 × 2 boxes with lids", make: (C, R) => tile(0, 0, C, R, 2, 2, "lidbox") },
  { id: "clear", label: "Empty", blurb: "start from nothing", make: () => [] },
];

// Count what a layout prints: the parts list Build will produce.
export function tally(regions, cols, rows, includeCase = true, separateLatch = false) {
  const t = { box: 0, lidbox: 0, lids: 0, frame: 0, covered: 0, pieces: 0 };
  for (const g of regions) {
    if (!inGrid(g, cols, rows)) continue;
    t.covered += g.w * g.h;
    const n = g.kind !== "frame" && g.split ? g.w * g.h : 1;
    t[g.kind] += n;
    if (g.kind === "lidbox") t.lids += n;
  }
  t.empty = Math.max(0, cols * rows - t.covered);
  // the case is a body and a lid; a swing latch on a filament pin is a third part
  t.pieces = t.box + t.lidbox + t.lids + t.frame + (includeCase ? (separateLatch ? 3 : 2) : 0);
  return t;
}

// --------------------------------------------------------------- the code

// What Build writes into the editor. Plain, commented and editable: width,
// depth and height are sliders, and the layout list is something a person or
// an AI can change by hand ("make the left column lidded").
export function kitCode(state) {
  const s = { ...DEFAULTS, ...state };
  if (s.container === "kuggis") return kuggisCode(s);
  const fit = casefinityFit(s.width, s.depth, s.height, { inside: !!s.inside, wall: s.wall, floor: s.floor });
  const regions = (s.regions || []).filter((g) => inGrid(g, fit.cols, fit.rows));
  const row = (g) => `  { at: [${g.c}, ${g.r}], size: [${g.w}, ${g.h}], kind: "${g.kind}"${g.split ? ", split: true" : ""} },`;
  const koch = s.style === "koch";
  const latch = koch ? (KOCH_LATCHES.includes(s.kochLatch) ? s.kochLatch : "swingpip") : s.latch === "round" ? "round" : "hook";
  return `// A Casefinity case and everything inside it, laid out for printing.
// Made with the BREPcode case builder: brepcode.com/case
//
// The grid is Casefinity (casefinity.net/casefinity-spec) by Chris Agocs,
// built on "Gridfinity for Hardcases" by the Unemployed Architect
// (patreon.com/cw/UnemployedArchitect). Support him if you print this.
${koch ? `// The Koch Box styling (ribbed walls, swing latch on a filament pin) follows
// Luca Koch's Parametric Hinged Storage Box: ${CREDITS.koch}
` : ""}//
// ${s.inside ? "INSIDE" : "Outside"} size in mm. The grid is whole 15 mm modules: ${fit.cols} x ${fit.rows} at this size.
const width = ${+s.width};   // [60:600] ${s.inside ? "inside" : "outside"} width (mm)
const depth = ${+s.depth};   // [60:600] ${s.inside ? "inside" : "outside"} depth (mm)
const height = ${+s.height};  // [${s.inside ? 15 : 35}:300] ${s.inside ? "inside depth of the body" : "outside height, lid closed"} (mm)
const includeCase = ${s.includeCase !== false};   // false: only the pieces that go in the grid
const gasket = ${s.gasket === true};   // true: a sealing ridge along the rim and a matching trench in the lid (dust seal)
const style = "${koch ? "koch" : "smooth"}";   // "smooth": plain walls and the clasp below. "koch": the Koch Box, ribbed walls and a swing latch on a filament pin
const latch = "${latch}";   // smooth walls: "hook" (a windowed blade hooks under a wedge) or "round" (a round lip rolls over a round bead, no supports).
                       // Koch Box: "swing" (swing latch on a filament pin, printed separately), "swingpip" (the same latch printed in place on the lid), "toggle" (folding over-centre latch, printed in place, fold the bail after printing)
const lidFit = ${+s.lidFit || 0.3};   // [0.1:0.6] clearance between the lid and the body, per side (mm)
const pinFit = ${+s.pinFit || 0};   // [0:0.4] extra room in every filament pin hole (mm). 0 is the tight fit as measured; 0.1 goes in and out by hand
const wall = ${+s.wall || 4};   // [2:8] the case's wall thickness (mm)
const floor = ${+s.floor || 2};   // [1:5] the body's floor and the lid's top (mm)
const binWall = ${+s.binWall || 1.2};   // [0.8:3] the bins' and frames' wall thickness (mm)

// What goes where. at: [column, row] from the front-left module; size in modules.
//   kind "box"     a bin              split: true = one 1 x 1 box per module
//   kind "lidbox"  a bin with a lid   split: true = one per module
//   kind "frame"   separators, no floor   split: true = a wall on every module line
const pieces = [
${regions.map(row).join("\n")}
];

return caseKit({ width, depth, height, inside: ${!!s.inside}, includeCase, gasket, style, latch, lidFit, pinFit, wall, floor, binWall, layout: pieces });
`;
}

// The KUGGIS version: the box's inside as sliders, then the same pieces list.
function kuggisCode(s) {
  const k = { ...defaultKuggis(), ...(s.kuggis || {}) };
  const fit = kuggisFit(k);
  const regions = (s.regions || []).filter((g) => inGrid(g, fit.cols, fit.rows));
  const row = (g) => `  { at: [${g.c}, ${g.r}], size: [${g.w}, ${g.h}], kind: "${g.kind === "lidbox" ? "box" : g.kind}"${g.split ? ", split: true" : ""} },`;
  const sz = KUGGIS_SIZES.find((x) => x.id === k.size);
  return `// Inserts for an IKEA KUGGIS box${sz ? ` (${sz.label})` : ""}, laid out for printing.
// Made with the BREPcode case builder: brepcode.com/case
//
// The pieces are cut from the box's INSIDE: a piece against a wall leans and
// rounds with it, the faces between pieces stay upright. The grid is whole
// 15 mm squares across the floor inside: ${fit.cols} x ${fit.rows} at these numbers.
// IKEA publishes outside sizes only, so the inside below started as an
// estimate. Measure your box and correct it: the pieces follow the sliders.
const rimW = ${+k.rimW};   // [60:600] inside width, measured lidIn below the top (mm)
const rimD = ${+k.rimD};   // [60:600] inside depth, measured lidIn below the top (mm)
const height = ${+k.height};   // [20:300] inside depth, floor to the top of the box (mm)
const lidIn = ${+k.lidIn};   // [0:30] how far the lid's plug reaches into the box; the rim is measured there, the pieces stop under it (mm)
const taper = ${+k.taper};   // [0:15] how far the short-side walls lean out, floor to the lid line (degrees)
const taperD = ${+(k.taperD || 0)};   // [0:15] the long-side walls, if they lean differently (0 = same as taper)
const corner = ${+k.corner};   // [1:40] the vertical corners' radius inside (mm)
const floorRound = ${+k.floorRound};   // [0:15] the rounding where the floor meets the walls (mm)
const clear = ${+k.clear};   // [0:3] fit gap to the box wall, per side (mm)
const lock = ${k.lock === true};   // true: Casefinity ribs and sockets on the faces between pieces, so the kit holds together. false: smooth sides

// What goes where. at: [column, row] from the front-left square; size in squares.
//   kind "box"    a bin                   split: true = one 1 x 1 box per square
//   kind "frame"  separators, no floor    split: true = a wall on every square line
const pieces = [
${regions.map(row).join("\n")}
];

return kuggisKit({ rimW, rimD, height, lidIn, taper, taperD, corner, floorRound, clear, lock, layout: pieces });
`;
}

// Read a builder's own code back, so the Toolbox can reopen the grid it came
// from. Tolerant on purpose (hand edits, reordered keys); returns null when
// the code is not a caseKit() or kuggisKit() model.
export function parseKitCode(src = "") {
  const text = String(src);
  const kuggis = /\bkuggisKit\s*\(/.test(text);
  if (!kuggis && !/\bcaseKit\s*\(/.test(text)) return null;
  const n = (name) => {
    const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*(-?[\\d.]+)`).exec(text);
    return m ? +m[1] : undefined;
  };
  const state = { ...DEFAULTS };
  if (kuggis) {
    state.container = "kuggis";
    const k = defaultKuggis();
    for (const key of ["rimW", "rimD", "height", "lidIn", "taper", "taperD", "corner", "floorRound", "clear"]) if (n(key) != null) k[key] = n(key);
    k.lock = /\b(?:const\s+lock\s*=|lock\s*:)\s*true\b/.test(text);
    // the size whose estimate these numbers still are, if any; else "custom"
    const match = KUGGIS_SIZES.find((sz) => { const e = kuggisEstimate(sz); return e.rimW === k.rimW && e.rimD === k.rimD && e.height === k.height; });
    k.size = match ? match.id : "custom";
    state.kuggis = k;
  }
  for (const k of ["width", "depth", "height"]) if (n(k) != null) state[k] = n(k);
  const ic = /\bconst\s+includeCase\s*=\s*(true|false)/.exec(text);
  if (ic) state.includeCase = ic[1] === "true";
  const gk = /\bconst\s+gasket\s*=\s*(true|false)/.exec(text);
  state.gasket = gk ? gk[1] === "true" : /\bgasket\s*:\s*true\b/.test(text);
  state.style = /\b(?:const\s+style\s*=|style\s*:)\s*["']koch["']/.test(text) ? "koch" : "smooth";
  const lm = /\b(?:const\s+latch\s*=|latch\s*:)\s*["'](\w+)["']/.exec(text);
  const lv = lm ? lm[1] : "hook";
  if (KOCH_LATCHES.includes(lv)) state.kochLatch = lv;
  else state.latch = lv === "round" ? "round" : "hook";
  for (const k of ["lidFit", "pinFit", "wall", "floor", "binWall"]) if (n(k) != null) state[k] = n(k);
  state.inside = /\binside\s*:\s*true\b/.test(text);
  state.regions = [];
  const re = /\{\s*at\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*size\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*kind\s*:\s*["'](\w+)["']\s*(?:,\s*split\s*:\s*(true|false))?/g;
  for (const m of text.matchAll(re)) {
    if (!KINDS.includes(m[5])) continue;
    state.regions.push({ c: +m[1], r: +m[2], w: +m[3], h: +m[4], kind: m[5], split: m[6] === "true" });
  }
  return state;
}

// Paint a rectangle onto a layout: whatever it overlaps goes, and (unless
// erasing) the new piece takes its place. Returns a new list.
export function paintRegion(regions, rect, brush, split) {
  const kept = regions.filter((g) => !overlaps(g, rect));
  if (brush === "erase") return kept;
  return [...kept, { ...rect, kind: brush, split: !!split }];
}

// --------------------------------------------------------------- styling

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const css = document.createElement("style");
  css.textContent = `
  #cb { position: fixed; inset: 0; z-index: 150000; overflow: auto; -webkit-overflow-scrolling: touch;
    background: var(--bg, #0b0f16); color: var(--text, #dfe6f3);
    font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; box-sizing: border-box;
    transition: opacity .3s ease; }
  #cb.gone { opacity: 0; pointer-events: none; }
  #cb *, #cb *::before, #cb *::after { box-sizing: border-box; }
  .cb-wrap { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
  .cb-head { display: flex; align-items: center; gap: 12px; }
  .cb-head h1 { margin: 0; font-size: 20px; letter-spacing: -.01em; }
  .cb-head .cb-sub { color: var(--muted, #8ea0c0); font-size: 13px; }
  .cb-head .cb-sp { flex: 1; }
  .cb-x { background: none; border: 1px solid var(--border, #26314a); color: var(--muted, #8ea0c0); border-radius: 10px;
    width: 34px; height: 34px; font-size: 20px; line-height: 1; cursor: pointer; }
  .cb-x:hover { color: var(--text, #dfe6f3); border-color: var(--accent, #1c66e5); }
  .cb-cols { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
  .cb-side, .cb-main { background: var(--card, #121826); border: 1px solid var(--border-soft, #1c2437); border-radius: 14px; padding: 14px; }
  .cb-side h3 { margin: 14px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted2, #6f83a6); font-weight: 600; }
  .cb-side h3:first-child { margin-top: 0; }
  .cb-seg { display: flex; border: 1px solid var(--border, #26314a); border-radius: 9px; overflow: hidden; }
  .cb-seg button { flex: 1 1 0; background: var(--input-bg, #0d1320); color: var(--text2, #d8e2f5); border: 0;
    border-left: 1px solid var(--border, #26314a); padding: 7px 6px; font: 13px system-ui, sans-serif; cursor: pointer; min-width: 0; }
  .cb-seg button:first-child { border-left: 0; }
  .cb-seg button.on { background: var(--accent, #1c66e5); color: #fff; }
  .cb-dims { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
  .cb-dims4 { grid-template-columns: repeat(4, 1fr); }
  .cb-adv { margin-top: 10px; }
  .cb-adv summary { cursor: pointer; font-size: 12.5px; color: var(--muted, #8ea0c0); }
  .cb-adv summary:hover { color: var(--text, #dfe6f3); }
  .cb-select { width: 100%; background: var(--input-bg, #0d1320); color: var(--text, #dfe6f3); border: 1px solid var(--border, #26314a);
    border-radius: 8px; padding: 7px 8px; font: 13px system-ui, sans-serif; }
  .cb-dims label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted, #8ea0c0); }
  .cb-dims input { width: 100%; background: var(--input-bg, #0d1320); color: var(--text, #dfe6f3); border: 1px solid var(--border, #26314a);
    border-radius: 8px; padding: 7px 8px; font: 14px ui-monospace, Consolas, monospace; }
  .cb-dims input:focus { outline: none; border-color: var(--accent, #1c66e5); }
  .cb-read { margin-top: 8px; font-size: 12.5px; color: var(--muted, #8ea0c0); }
  .cb-read b { color: var(--text, #dfe6f3); }
  .cb-warn { color: #ffb86b; }
  .cb-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .cb-presets button { text-align: left; background: var(--input-bg, #0d1320); border: 1px solid var(--border, #26314a); color: var(--text2, #d8e2f5);
    border-radius: 9px; padding: 6px 9px; cursor: pointer; font: 13px system-ui, sans-serif; min-width: 0; }
  .cb-presets button small { display: block; color: var(--muted2, #6f83a6); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cb-presets button:hover { border-color: var(--accent, #1c66e5); }
  .cb-brushes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .cb-brushes button { display: flex; align-items: center; gap: 8px; background: var(--input-bg, #0d1320); border: 1px solid var(--border, #26314a);
    color: var(--text2, #d8e2f5); border-radius: 9px; padding: 7px 9px; cursor: pointer; font: 13px system-ui, sans-serif; }
  .cb-brushes button.on { border-color: var(--text, #dfe6f3); box-shadow: 0 0 0 1px var(--text, #dfe6f3) inset; }
  .cb-sw { flex: none; display: inline-block; width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(255,255,255,.25); }
  .cb-sw.erase { background: repeating-linear-gradient(45deg, #3a4560 0 3px, transparent 3px 6px); }
  .cb-sw.frame { background: repeating-linear-gradient(45deg, var(--k) 0 3px, transparent 3px 6px); }
  .cb-hint { font-size: 12px; color: var(--muted2, #6f83a6); margin: 8px 0 0; }
  .cb-check { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; font: 13px system-ui, sans-serif; color: var(--text2, #d8e2f5); cursor: pointer; }
  .cb-check input { margin: 3px 0 0; accent-color: var(--accent, #1c66e5); flex: none; }
  .cb-check small { display: block; color: var(--muted2, #6f83a6); font-size: 11.5px; line-height: 1.35; }
  .cb-latch { margin-top: 10px; }
  .cb-latch small { display: block; margin-top: 5px; color: var(--muted2, #6f83a6); font: 11.5px/1.35 system-ui, sans-serif; }
  .cb-latch small a { color: var(--accent-soft2, #7fb0ff); }
  .cb-build { width: 100%; margin-top: 10px; border: 0; border-radius: 12px; background: var(--accent, #1c66e5); color: #fff;
    font: 600 15px system-ui, sans-serif; padding: 12px; cursor: pointer; }
  .cb-build:hover { background: var(--accent-hover, #2e76f2); }
  .cb-build[disabled] { opacity: .5; cursor: default; }
  .cb-sum { margin-top: 8px; font-size: 12.5px; color: var(--muted, #8ea0c0); }
  .cb-main { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
  .cb-edge { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted2, #6f83a6); }
  .cb-board { position: relative; padding: 10px; border-radius: 16px; background: var(--input-bg, #0d1320);
    border: 2px solid var(--border, #26314a); max-width: 100%; overflow: auto; }
  #cb-grid { position: relative; touch-action: none; cursor: crosshair; user-select: none; -webkit-user-select: none;
    background-color: #161d2c;
    background-image: linear-gradient(to right, #26314a 1px, transparent 1px), linear-gradient(to bottom, #26314a 1px, transparent 1px); }
  .cb-reg { position: absolute; border-radius: 5px; border: 2px solid var(--k); background-color: color-mix(in srgb, var(--k) 55%, transparent);
    display: grid; place-items: center; overflow: hidden; pointer-events: none; }
  .cb-reg.split { background-image: linear-gradient(to right, color-mix(in srgb, var(--k), #000 35%) 2px, transparent 2px),
    linear-gradient(to bottom, color-mix(in srgb, var(--k), #000 35%) 2px, transparent 2px);
    background-size: var(--cs) var(--cs); background-position: -1px -1px; }
  .cb-reg.frame { background-color: transparent;
    background-image: repeating-linear-gradient(45deg, color-mix(in srgb, var(--k) 45%, transparent) 0 4px, transparent 4px 9px); }
  .cb-reg.frame.split { background-image: linear-gradient(to right, var(--k) 2px, transparent 2px), linear-gradient(to bottom, var(--k) 2px, transparent 2px),
    repeating-linear-gradient(45deg, color-mix(in srgb, var(--k) 35%, transparent) 0 4px, transparent 4px 9px);
    background-size: var(--cs) var(--cs), var(--cs) var(--cs), auto; background-position: -1px -1px, -1px -1px, 0 0; }
  .cb-reg span { font: 600 11px system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.8); padding: 0 3px;
    max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cb-ghost { position: absolute; border: 2px dashed #fff; border-radius: 5px; pointer-events: none; background: rgba(255,255,255,.12); }
  .cb-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; }
  .cb-row button { background: var(--input-bg, #0d1320); border: 1px solid var(--border, #26314a); color: var(--text2, #d8e2f5);
    border-radius: 8px; padding: 5px 12px; cursor: pointer; font: 13px system-ui, sans-serif; }
  .cb-row button:hover:not([disabled]) { border-color: var(--accent, #1c66e5); }
  .cb-row button[disabled] { opacity: .45; cursor: default; }
  .cb-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center; font-size: 12px; color: var(--muted, #8ea0c0); }
  .cb-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .cb-credit { font-size: 12.5px; color: var(--muted, #8ea0c0); text-align: center; line-height: 1.6; padding: 4px 8px 12px; }
  .cb-credit a { color: var(--accent-soft2, #7fb0ff); text-decoration: none; }
  .cb-credit a:hover { text-decoration: underline; }
  @media (max-width: 860px) {
    .cb-cols { grid-template-columns: 1fr; }
    .cb-main { order: -1; }
  }
  /* after Build: a small card over the plate with the downloads and the way
     back. Bottom-left, above the view cube: the Params card opens on the right */
  #cb-done { position: fixed; z-index: 150000; left: 16px; bottom: 110px; width: min(340px, calc(100vw - 32px));
    background: var(--card, #121826); color: var(--text, #dfe6f3); border: 1px solid var(--border, #26314a); border-radius: 14px;
    box-shadow: 0 18px 50px rgba(0,0,0,.4); padding: 12px 14px; font: 13px/1.45 system-ui, sans-serif; }
  #cb-done b { display: block; font-size: 14px; margin-bottom: 2px; padding-right: 20px; }
  #cb-done p { margin: 0 0 10px; color: var(--muted, #8ea0c0); }
  #cb-done .cb-acts { display: flex; flex-wrap: wrap; gap: 6px; }
  #cb-done button { border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text2, #d8e2f5);
    border-radius: 9px; padding: 6px 10px; cursor: pointer; font: 13px system-ui, sans-serif; }
  #cb-done button.pri { background: var(--accent, #1c66e5); border-color: var(--accent, #1c66e5); color: #fff; }
  #cb-done .cb-x2 { position: absolute; top: 6px; right: 8px; border: 0; background: none; font-size: 18px; color: var(--muted, #8ea0c0); padding: 2px 6px; }
  #cb-done small { display: block; margin-top: 8px; color: var(--muted2, #6f83a6); font-size: 11.5px; }
  #cb-done small a { color: var(--accent-soft2, #7fb0ff); }`;
  document.head.appendChild(css);
}

function creditHTML() {
  return `Grid system: <a href="${CREDITS.casefinity}" target="_blank" rel="noopener">Casefinity</a>
    (<a href="${CREDITS.spec}" target="_blank" rel="noopener">spec</a>,
    <a href="${CREDITS.github}" target="_blank" rel="noopener">source</a>) by Chris Agocs, built on
    <a href="${CREDITS.hardcases}" target="_blank" rel="noopener">Gridfinity for Hardcases</a> by the
    <a href="${CREDITS.patreon}" target="_blank" rel="noopener">Unemployed Architect</a>.
    If this saves you time, <a href="${CREDITS.patreon}" target="_blank" rel="noopener">support him on Patreon</a>.
    <br />The case, the bins and their lids here are BREPcode's own designs, made to the Casefinity spec so they fit its grid.
    The Koch Box style (ribbed walls, swing latch) follows
    <a href="${CREDITS.koch}" target="_blank" rel="noopener">Parametric Hinged Storage Box</a> by Luca Koch on Printables.`;
}

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || "{}") }; } catch { return { ...DEFAULTS }; }
}
function save(s) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private window: it just will not remember */ }
}

// ------------------------------------------------------------------- show

/**
 * Show the case builder.
 * hooks: {
 *   build(code)    put the code in the editor and build it; resolves { ok } (required)
 *   exportParts()  open Export on "3MF - parts laid out on the plate"
 *   exportStl()    open Export on STL
 *   currentCode()  the editor's text, to reopen a builder model where it was
 *   plate()        the printer's bed { x, y } in mm, or null
 *   onClose()      called once, however it closes
 * }
 */
export function showCaseBuilder(hooks = {}) {
  style();
  document.getElementById("cb")?.remove();
  document.getElementById("cb-done")?.remove();

  // the editor's own caseKit() model wins over the remembered one: it is
  // what is on screen, and reopening should pick up exactly that
  const fromCode = parseKitCode(hooks.currentCode?.() || "");
  const S = fromCode || load();
  // the gasket is never pre-ticked: only code on screen that asks for it
  if (!fromCode) S.gasket = false;
  // First visit: the empty case, nothing painted. It used to open on "Big +
  // small", a tray and 65 small boxes on the default case, and the first
  // Build was a long wait for inserts nobody had asked for. The case and
  // its lid alone are the quickest build there is, and every insert is a
  // choice: a preset is one click, a brush a drag.
  if (!Array.isArray(S.regions)) S.regions = [];
  if (S.container !== "kuggis") S.container = "case";
  S.kuggis = { ...defaultKuggis(), ...(S.kuggis || {}) };
  // A remembered KUGGIS size takes the table's CURRENT numbers: the table
  // improves as boxes get measured, and a stale copy under a size's name
  // would quietly print to last month's estimate. Hand-typed numbers are
  // "custom" and stay exactly as typed.
  if (S.kuggis.size && S.kuggis.size !== "custom" && !fromCode) S.kuggis = { ...defaultKuggis(S.kuggis.size), lock: S.kuggis.lock === true };
  let brush = "box", split = false;
  const undo = [];

  const el = document.createElement("div");
  el.id = "cb";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "cb-h");
  el.innerHTML = `
    <div class="cb-wrap">
      <div class="cb-head">
        <div><h1 id="cb-h">Case builder</h1><div class="cb-sub">Size the case, or pick your KUGGIS box; paint its grid; print the parts.</div></div>
        <span class="cb-sp"></span>
        <button type="button" class="cb-x" title="Close" aria-label="Close">&times;</button>
      </div>
      <div class="cb-cols">
        <section class="cb-side" aria-label="Settings">
          <h3>1 · Your case</h3>
          <div class="cb-seg" id="cb-container" role="radiogroup" aria-label="What holds the pieces">
            <button type="button" data-v="case">Printed case</button><button type="button" data-v="kuggis">IKEA KUGGIS box</button>
          </div>
          <div id="cb-casedims">
            <div class="cb-seg" id="cb-inside" role="radiogroup" aria-label="What the size means" style="margin-top:8px">
              <button type="button" data-v="0">Outside size</button><button type="button" data-v="1">Inside space</button>
            </div>
            <div class="cb-dims">
              <label>Width<input id="cb-w" type="number" min="30" max="600" step="1" inputmode="decimal" /></label>
              <label>Depth<input id="cb-d" type="number" min="30" max="600" step="1" inputmode="decimal" /></label>
              <label>Height<input id="cb-hh" type="number" min="15" max="300" step="1" inputmode="decimal" /></label>
            </div>
          </div>
          <!-- The KUGGIS: its inside, as the pieces need it. IKEA publishes the
               outside sizes only, so picking a size fills in an ESTIMATE and
               says so; the fields are there to be measured and typed over. -->
          <div id="cb-kuggis" hidden>
            <select id="cb-ksize" class="cb-select" aria-label="KUGGIS size" style="margin-top:8px"></select>
            <div class="cb-dims cb-dims4">
              <label title="Inside the box, across the short side, measured as far down as the lid's plug reaches">Rim width<input id="cb-krw" type="number" min="40" max="600" step="0.5" inputmode="decimal" /></label>
              <label title="Inside the box, along the long side, measured as far down as the lid's plug reaches">Rim depth<input id="cb-krd" type="number" min="40" max="600" step="0.5" inputmode="decimal" /></label>
              <label title="Floor to the top of the box, inside">Depth<input id="cb-kh" type="number" min="20" max="300" step="0.5" inputmode="decimal" /></label>
              <label title="How far the lid's plug reaches into the box. The rim is measured there and the pieces stop 1 mm under it">Lid in<input id="cb-kl" type="number" min="0" max="30" step="0.5" inputmode="decimal" /></label>
            </div>
            <div class="cb-dims cb-dims4">
              <label title="How far each wall leans out from floor to rim, in degrees. 7° is 17 mm over a 142 mm wall">Taper °<input id="cb-kt" type="number" min="0" max="15" step="0.5" inputmode="decimal" /></label>
              <label title="The radius of the box's vertical corners, inside">Corner<input id="cb-kc" type="number" min="1" max="40" step="0.5" inputmode="decimal" /></label>
              <label title="The rounding where the floor meets the walls, inside">Floor round<input id="cb-kf" type="number" min="0" max="15" step="0.5" inputmode="decimal" /></label>
              <label title="Air between a piece and the box wall, per side. 1 mm lifts out with a finger; 0.5 sits snug">Fit gap<input id="cb-kg" type="number" min="0" max="3" step="0.1" inputmode="decimal" /></label>
            </div>
            <p class="cb-hint" id="cb-khint"></p>
          </div>
          <div class="cb-read" id="cb-read" aria-live="polite"></div>
          <h3>2 · Start from a layout</h3>
          <div class="cb-presets" id="cb-presets"></div>
          <h3>3 · Paint the grid</h3>
          <div class="cb-brushes" id="cb-brushes" role="radiogroup" aria-label="What to paint"></div>
          <div class="cb-seg" id="cb-split" role="radiogroup" aria-label="One piece or one per square" style="margin-top:8px">
            <button type="button" data-v="0"></button><button type="button" data-v="1"></button>
          </div>
          <p class="cb-hint">Drag across squares to mark an area, or click one square. Painting over a piece replaces it.</p>
          <h3>4 · Build</h3>
          <div id="cb-caseopts">
          <div class="cb-seg" id="cb-case" role="radiogroup" aria-label="What to print">
            <button type="button" data-v="1">Case + grid pieces</button><button type="button" data-v="0">Grid pieces only</button>
          </div>
          <label class="cb-check" id="cb-gasket-row"><input type="checkbox" id="cb-gasket" /><span>Gasket bead<small>A sealing ridge along the rim drops into a trench in the lid. Dust seal, firmer close.</small></span></label>
          <div class="cb-latch" id="cb-style-row">
            <div class="cb-seg" id="cb-style" role="radiogroup" aria-label="Walls">
              <button type="button" data-v="smooth">Smooth walls</button><button type="button" data-v="koch">Koch Box</button>
            </div>
            <small id="cb-style-hint"></small>
          </div>
          <div class="cb-latch" id="cb-latch-row">
            <div class="cb-seg" id="cb-latch" role="radiogroup" aria-label="Clasp">
              <button type="button" data-v="hook">Hook clasp</button><button type="button" data-v="round">Round clasp</button>
            </div>
            <div class="cb-seg" id="cb-klatch" role="radiogroup" aria-label="Koch Box latch" hidden>
              <button type="button" data-v="swingpip">Swing, in place</button><button type="button" data-v="swing">Swing, pin</button><button type="button" data-v="toggle">Folding toggle</button>
            </div>
            <small id="cb-latch-hint"></small>
          </div>
          <details class="cb-adv" id="cb-adv">
            <summary>Advanced: walls and fits</summary>
            <div class="cb-dims cb-dims4">
              <label title="The case's wall thickness">Wall<input id="cb-wall" type="number" min="2" max="8" step="0.5" inputmode="decimal" /></label>
              <label title="The body's floor and the lid's top">Floor / top<input id="cb-floor" type="number" min="1" max="5" step="0.2" inputmode="decimal" /></label>
              <label title="The bins' and separator frames' wall thickness">Bin wall<input id="cb-binwall" type="number" min="0.8" max="3" step="0.1" inputmode="decimal" /></label>
              <label title="Clearance between the lid and the body, per side">Lid fit<input id="cb-lidfit" type="number" min="0.1" max="0.6" step="0.05" inputmode="decimal" /></label>
              <label title="Extra room in every filament pin hole: the lid hinge and the swing latch's pivot. 0 is the tight fit as measured; 0.1 goes in and out by hand">Pin fit<input id="cb-pinfit" type="number" min="0" max="0.4" step="0.05" inputmode="decimal" /></label>
            </div>
          </details>
          </div>
          <div class="cb-latch" id="cb-klock-row" hidden>
            <div class="cb-seg" id="cb-klock" role="radiogroup" aria-label="Piece sides">
              <button type="button" data-v="0">Smooth sides</button><button type="button" data-v="1">Casefinity lock</button>
            </div>
            <small id="cb-klock-hint"></small>
          </div>
          <p class="cb-hint" id="cb-kbuild" hidden>Every piece sits in the box itself: no case, no lid. Pieces stop under the KUGGIS lid's plug, so the lid still closes.</p>
          <button type="button" class="cb-build" id="cb-build">Build printable parts</button>
          <div class="cb-sum" id="cb-sum" aria-live="polite"></div>
        </section>
        <section class="cb-main" aria-label="The grid">
          <div class="cb-edge" id="cb-edge-back">Back · hinge</div>
          <div class="cb-board"><div id="cb-grid" role="application" aria-label="Case grid: drag to paint"></div></div>
          <div class="cb-edge" id="cb-edge-front">Front · latch</div>
          <div class="cb-row">
            <button type="button" id="cb-undo">Undo</button>
            <button type="button" id="cb-clear">Clear the grid</button>
          </div>
          <div class="cb-legend" id="cb-legend"></div>
        </section>
      </div>
      <footer class="cb-credit">${creditHTML()}</footer>
    </div>`;
  document.body.appendChild(el);

  const $ = (id) => el.querySelector(`#${id}`);
  const grid = $("cb-grid");

  // The app behind has single-letter shortcuts and a "lift the loading screen
  // on any input" listener; keys and taps in here are the builder's own.
  for (const ev of ["keydown", "keyup", "pointerdown", "wheel"]) {
    el.addEventListener(ev, (e) => {
      if (ev === "keydown") onKey(e);
      e.stopPropagation();
    }, { passive: ev !== "keydown" });
  }

  let closed = false;
  const onResize = () => { if (!closed) paint(); };
  const close = () => {
    if (closed) return;
    closed = true;
    save(S);
    removeEventListener("resize", onResize);
    el.classList.add("gone");
    setTimeout(() => el.remove(), 320);
    try { hooks.onClose?.(); } catch { /* closed either way */ }
  };
  el.querySelector(".cb-x").addEventListener("click", close);

  // ---- size
  const isKuggis = () => S.container === "kuggis";
  const fitNow = () => isKuggis() ? kuggisFit(S.kuggis) : casefinityFit(S.width, S.depth, S.height, { inside: !!S.inside, wall: S.wall, floor: S.floor });
  $("cb-w").value = S.width; $("cb-d").value = S.depth; $("cb-hh").value = S.height;
  const seg = (id, v) => { for (const b of $(id).querySelectorAll("button")) b.classList.toggle("on", b.dataset.v === String(v)); };
  // the KUGGIS: a size list that fills in the estimate, and the fields it fills
  const KFIELDS = [["cb-krw", "rimW"], ["cb-krd", "rimD"], ["cb-kh", "height"], ["cb-kl", "lidIn"], ["cb-kt", "taper"], ["cb-kc", "corner"], ["cb-kf", "floorRound"], ["cb-kg", "clear"]];
  const ksize = $("cb-ksize");
  for (const sz of KUGGIS_SIZES) {
    const o = document.createElement("option");
    o.value = sz.id; o.textContent = `KUGGIS ${sz.label}`;
    ksize.appendChild(o);
  }
  const custom = document.createElement("option");
  custom.value = "custom"; custom.textContent = "Measured by hand (numbers below)";
  ksize.appendChild(custom);
  const paintKuggisFields = () => {
    ksize.value = S.kuggis.size || "custom";
    if (!ksize.value) ksize.value = "custom";
    for (const [id, key] of KFIELDS) $(id).value = S.kuggis[key];
  };
  paintKuggisFields();
  ksize.addEventListener("change", () => {
    if (ksize.value === "custom") { S.kuggis.size = "custom"; paint(); return; }
    S.kuggis = { ...defaultKuggis(ksize.value), lock: S.kuggis.lock === true };
    paintKuggisFields(); paint();
  });
  for (const [id, key] of KFIELDS) {
    $(id).addEventListener("input", () => {
      const v = +$(id).value;
      if (!Number.isFinite(v) || v < 0) return;
      S.kuggis[key] = v;
      if (key === "taper") S.kuggis.taperD = 0;    // one typed taper means both axes
      S.kuggis.size = "custom";       // typed over: no longer the estimate
      ksize.value = "custom";
      paint();
    });
  }
  const KLOCK_HINT = {
    smooth: "Plain upright faces between pieces, 0.3 mm apart. Each piece lifts out on its own.",
    lock: "Casefinity ribs and sockets (casefinity.net) on the faces between pieces, 0.15 mm a face, so the kit holds together as one block. Faces against the box wall stay smooth and sloped.",
  };
  seg("cb-klock", S.kuggis.lock ? 1 : 0);
  $("cb-klock").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.kuggis.lock = b.dataset.v === "1";
    seg("cb-klock", S.kuggis.lock ? 1 : 0); paint();
  });
  seg("cb-container", S.container);
  $("cb-container").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const to = b.dataset.v === "kuggis" ? "kuggis" : "case";
    if (to === S.container) return;
    S.container = to;
    seg("cb-container", to);
    if (to === "kuggis") {
      // the KUGGIS lid covers every piece, so a lidded box is just a box there
      S.regions = S.regions.map((g) => g.kind === "lidbox" ? { ...g, kind: "box" } : g);
      if (brush === "lidbox") brush = "box";
    }
    paintTools(); paint();
  });
  seg("cb-inside", S.inside ? 1 : 0);
  seg("cb-case", S.includeCase === false ? 0 : 1);
  $("cb-gasket").checked = S.gasket === true;
  $("cb-gasket").addEventListener("change", (e) => { S.gasket = !!e.target.checked; paint(); });
  const LATCH_HINT = {
    hook: "A windowed blade on the lid hooks under a wedge on the body. Firm click; the wedge's flat underside is a 0.9 mm overhang.",
    round: "A round lip on a solid blade rolls over a round bead on the body. Nothing to support, opens as smoothly as it closes.",
  };
  seg("cb-latch", S.latch === "round" ? "round" : "hook");
  $("cb-latch").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.latch = b.dataset.v === "round" ? "round" : "hook";
    seg("cb-latch", S.latch); paint();
  });
  const KLATCH_HINT = {
    swingpip: "The swing latch printed in place on the lid's lugs, swinging on a printed pin with 0.35 mm of room. A round bar on the body clicks into a groove in the latch, so it holds pressed in; the lip under the roof takes the load.",
    swing: "The swing latch as a separate part on a filament pin through the lid's lugs, with the same click bar. Pin fit (Advanced) sets how freely the pin goes in.",
    toggle: "A folding over-centre latch, like a tool case: a lever on a printed pin, a bail on a thin living hinge you fold after printing, hooking a round bar on the body and pulling tight past centre.",
  };
  seg("cb-klatch", KOCH_LATCHES.includes(S.kochLatch) ? S.kochLatch : "swingpip");
  $("cb-klatch").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.kochLatch = KOCH_LATCHES.includes(b.dataset.v) ? b.dataset.v : "swingpip";
    seg("cb-klatch", S.kochLatch); paint();
  });
  // advanced: the case's own walls and fits
  const ADV = [["cb-wall", "wall", 4], ["cb-floor", "floor", 2], ["cb-binwall", "binWall", 1.2], ["cb-lidfit", "lidFit", 0.3], ["cb-pinfit", "pinFit", 0.1]];
  for (const [id, key, dflt] of ADV) {
    $(id).value = S[key] ?? dflt;
    $(id).addEventListener("input", () => {
      const v = +$(id).value;
      if (!Number.isFinite(v) || v < 0) return;
      S[key] = v; paint();
    });
  }
  const STYLE_HINT = {
    smooth: "Plain rounded walls with the clasp below.",
    koch: `Eight chamfered ribs and a swing latch on a filament pin, after <a href="${CREDITS.koch}" target="_blank" rel="noopener">Luca Koch's Parametric Hinged Storage Box</a>. Prints an extra latch part; the clasp below is not used.`,
  };
  seg("cb-style", S.style === "koch" ? "koch" : "smooth");
  $("cb-style").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.style = b.dataset.v === "koch" ? "koch" : "smooth";
    seg("cb-style", S.style); paint();
  });
  $("cb-inside").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const inside = b.dataset.v === "1";
    if (inside === !!S.inside) return;
    // the same physical case either way: convert the numbers, do not reinterpret them
    const f = fitNow();
    if (inside) { S.width = +(f.width - 8).toFixed(1); S.depth = +(f.depth - 8).toFixed(1); S.height = +(f.bodyHeight - 2).toFixed(1); }
    else { S.width = +f.width.toFixed(1); S.depth = +f.depth.toFixed(1); S.height = +f.height.toFixed(1); }
    S.inside = inside;
    $("cb-w").value = S.width; $("cb-d").value = S.depth; $("cb-hh").value = S.height;
    seg("cb-inside", inside ? 1 : 0);
    paint();
  });
  $("cb-case").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.includeCase = b.dataset.v === "1"; seg("cb-case", b.dataset.v); paint();
  });
  for (const [id, k] of [["cb-w", "width"], ["cb-d", "depth"], ["cb-hh", "height"]]) {
    $(id).addEventListener("input", () => {
      const v = +$(id).value;
      if (Number.isFinite(v) && v > 0) { S[k] = v; paint(); }
    });
  }

  // ---- presets
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.preset = p.id;
    b.innerHTML = `${esc(p.label)}<small>${esc(p.blurb)}</small>`;
    b.addEventListener("click", () => {
      const f = fitNow();
      undo.push(S.regions);
      S.regions = p.make(f.cols, f.rows);
      paint();
    });
    $("cb-presets").appendChild(b);
  }

  // ---- brushes
  const brushes = ["box", "lidbox", "frame", "erase"];
  const swatch = (k) => `<span class="cb-sw ${k === "erase" ? "erase" : k === "frame" ? "frame" : ""}" style="--k:${CASEKIT_COLORS[k] || "#555"};${k !== "erase" && k !== "frame" ? `background:${CASEKIT_COLORS[k]}` : ""}"></span>`;
  for (const k of brushes) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.k = k;
    b.setAttribute("role", "radio");
    b.title = `${LABEL[k]} (key ${brushes.indexOf(k) + 1})`;
    b.innerHTML = `${swatch(k)}${LABEL[k]}`;
    b.addEventListener("click", () => { brush = k; paintTools(); });
    $("cb-brushes").appendChild(b);
  }
  $("cb-split").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    split = b.dataset.v === "1"; paintTools();
  });
  function paintTools() {
    for (const b of $("cb-brushes").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.k === brush);
      b.setAttribute("aria-checked", String(b.dataset.k === brush));
      if (b.dataset.k === "lidbox") b.hidden = isKuggis();
    }
    for (const b of $("cb-presets").querySelectorAll("button")) if (b.dataset.preset === "lidded") b.hidden = isKuggis();
    paintLegend();
    const [a, b] = $("cb-split").querySelectorAll("button");
    if (brush === "frame") { a.textContent = "Open space"; b.textContent = "Wall every square"; }
    else { a.textContent = "One big piece"; b.textContent = "One per square"; }
    seg("cb-split", split ? 1 : 0);
    $("cb-split").style.opacity = brush === "erase" ? ".4" : "";
    $("cb-split").style.pointerEvents = brush === "erase" ? "none" : "";
  }

  // ---- legend
  const paintLegend = () => {
    $("cb-legend").innerHTML = [["box", "Box"], ["lidbox", "Box + lid"], ["frame", "Separators (no floor)"]]
      .filter(([k]) => k !== "lidbox" || !isKuggis())
      .map(([k, t]) => `<span>${swatch(k)}${t}</span>`).join("")
      + `<span><span class="cb-sw" style="background:#161d2c"></span>Empty</span>`;
  };

  // ---- the grid
  let cs = 32, cols = 0, rows = 0;
  let drag = null;
  const ghost = document.createElement("div");
  ghost.className = "cb-ghost";
  ghost.hidden = true;

  const cellAt = (e) => {
    const r = grid.getBoundingClientRect();
    const c = Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - r.left) / cs)));
    const sy = Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - r.top) / cs)));
    return { c, r: rows - 1 - sy };   // row 0 is the FRONT, drawn at the bottom
  };
  const rectOf = (a, b) => ({ c: Math.min(a.c, b.c), r: Math.min(a.r, b.r), w: Math.abs(a.c - b.c) + 1, h: Math.abs(a.r - b.r) + 1 });
  const place = (node, g) => {
    node.style.left = `${g.c * cs + 1}px`;
    node.style.top = `${(rows - g.r - g.h) * cs + 1}px`;
    node.style.width = `${g.w * cs - 1}px`;
    node.style.height = `${g.h * cs - 1}px`;
  };
  grid.addEventListener("pointerdown", (e) => {
    if (!cols || !rows) return;
    e.preventDefault();
    try { grid.setPointerCapture(e.pointerId); } catch { /* synthetic events have no capture */ }
    const a = cellAt(e);
    drag = { a, b: a };
    ghost.hidden = false;
    place(ghost, rectOf(a, a));
  });
  grid.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.b = cellAt(e);
    place(ghost, rectOf(drag.a, drag.b));
  });
  grid.addEventListener("pointerup", () => {
    if (!drag) return;
    const rect = rectOf(drag.a, drag.b);
    drag = null;
    ghost.hidden = true;
    undo.push(S.regions);
    S.regions = paintRegion(S.regions, rect, brush, split);
    paint();
  });
  grid.addEventListener("pointercancel", () => { drag = null; ghost.hidden = true; });

  $("cb-undo").addEventListener("click", () => { if (undo.length) { S.regions = undo.pop(); paint(); } });
  $("cb-clear").addEventListener("click", () => { undo.push(S.regions); S.regions = []; paint(); });

  function onKey(e) {
    if (e.target.matches?.("input")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); $("cb-undo").click(); return; }
    const i = ["1", "2", "3", "4"].indexOf(e.key);
    if (i >= 0) { brush = brushes[i]; paintTools(); }
    if (e.key.toLowerCase() === "s") { split = !split; paintTools(); }
  }

  // ---- paint everything from S
  function paint() {
    const f = fitNow();
    cols = f.cols; rows = f.rows;
    const availW = Math.max(160, (el.querySelector(".cb-main").clientWidth || 600) - 52);
    const availH = Math.max(200, innerHeight * (innerWidth < 860 ? 0.5 : 0.66));
    cs = cols && rows ? Math.max(12, Math.min(44, Math.floor(Math.min(availW / cols, availH / rows)))) : 32;
    grid.style.width = `${cols * cs + 1}px`;
    grid.style.height = `${rows * cs + 1}px`;
    grid.style.backgroundSize = `${cs}px ${cs}px`;
    grid.style.setProperty("--cs", `${cs}px`);
    grid.textContent = "";
    for (const g of S.regions) {
      if (!inGrid(g, cols, rows)) continue;
      const d = document.createElement("div");
      d.className = `cb-reg${g.kind === "frame" ? " frame" : ""}${g.split ? " split" : ""}`;
      d.style.setProperty("--k", CASEKIT_COLORS[g.kind]);
      place(d, g);
      if (g.w * cs >= 52 && g.h * cs >= 18) {
        const t = document.createElement("span");
        const what = g.kind === "frame" ? (g.split ? "walls" : "open") : g.kind === "lidbox" ? "lid" : "box";
        t.textContent = g.split && g.kind !== "frame" ? `${g.w * g.h} × 1×1 ${what}` : `${g.w}×${g.h} ${what}`;
        d.appendChild(t);
      }
      grid.appendChild(d);
    }
    grid.appendChild(ghost);

    // the readout: what this size gives you, in the numbers that decide it
    const kug = isKuggis();
    $("cb-casedims").hidden = kug;
    $("cb-kuggis").hidden = !kug;
    $("cb-caseopts").hidden = kug;
    $("cb-kbuild").hidden = !kug;
    $("cb-klock-row").hidden = !kug;
    $("cb-klock-hint").textContent = KLOCK_HINT[S.kuggis.lock ? "lock" : "smooth"];
    $("cb-edge-back").textContent = kug ? "Back of the box" : "Back · hinge";
    $("cb-edge-front").textContent = kug ? "Front of the box" : "Front · latch";
    if (kug) {
      const sz = KUGGIS_SIZES.find((x) => x.id === S.kuggis.size);
      $("cb-khint").innerHTML = sz
        ? sz.measured
          ? `<b>Measured on a real box</b> (${esc(sz.note || "")}). Check yours ${S.kuggis.lidIn} mm down and at the floor, and type over anything that differs.`
          : `These are <b>estimates</b> from IKEA's outside size (${sz.outer[0] / 10} × ${sz.outer[1] / 10} × ${sz.outer[2] / 10} cm), scaled from a measured 26 × 35. Measure your box inside ${S.kuggis.lidIn} mm down (where the lid's plug ends) and at the floor, and type over them.`
        : `Your own measurements, inside the box: the rim ${S.kuggis.lidIn} mm down where the lid's plug ends, the depth floor to top, the taper as how far each wall leans out.`;
    }
    const separateLatch = S.style === "koch" && S.kochLatch === "swing";
    const t = tally(S.regions, cols, rows, !kug && S.includeCase !== false, separateLatch);
    const plate = hooks.plate?.() || null;
    const warn = [];
    if (!f.fits) warn.push(kug ? "No whole 15 mm square fits the floor at these numbers. Check the rim size, depth and taper." : "Too small for a single 15 mm square. Make it bigger.");
    if (plate && !kug && S.includeCase !== false
      && (Math.max(f.width, f.depth) > Math.max(plate.x, plate.y) || Math.min(f.width, f.depth) > Math.min(plate.x, plate.y))) {
      warn.push(`The case (${+f.width.toFixed(1)} × ${+f.depth.toFixed(1)} mm) is bigger than your ${plate.x} × ${plate.y} mm plate.`);
    }
    if (plate && kug && f.fits) {
      // a piece along a wall reaches the rim size; one spanning the whole grid is the rim
      const big = S.regions.some((g) => inGrid(g, cols, rows) && !(g.split && g.kind !== "frame") && (g.w * 15 + 40 > Math.min(plate.x, plate.y) || g.h * 15 + 40 > Math.min(plate.x, plate.y)));
      if (big) warn.push(`A long piece against the wall grows to the rim size at its top; check it fits your ${plate.x} × ${plate.y} mm plate, or split it.`);
    }
    $("cb-read").innerHTML = (f.fits
      ? kug
        ? `<b>${cols} × ${rows}</b> squares of 15 mm on the floor · floor inside <b>${f.floor[0]} × ${f.floor[1]}</b>, rim <b>${f.rim[0]} × ${f.rim[1]}</b> mm`
          + `<br />Pieces ${f.pieceHeight} mm tall (stopping under the lid's ${f.lidIn} mm plug), lean ${S.kuggis.taper}°${S.kuggis.taperD > 0 && S.kuggis.taperD !== S.kuggis.taper ? ` / ${S.kuggis.taperD}° (long side)` : ""} with the walls, ${S.kuggis.clear} mm off them`
        : `<b>${cols} × ${rows}</b> squares of 15 mm · outside <b>${+f.width.toFixed(1)} × ${+f.depth.toFixed(1)} × ${+f.height.toFixed(1)}</b> mm`
          + `<br />Grid ${f.inner[0]} × ${f.inner[1]} mm, ${+f.inner[2].toFixed(1)} deep · boxes ${f.binHeight} mm tall`
          + (f.headroom >= 5 ? ", with pull tabs" : "")
      : "")
      + (warn.length ? `${f.fits ? "<br />" : ""}<span class="cb-warn">${warn.map(esc).join("<br />")}</span>` : "");
    const bits = [];
    if (t.box) bits.push(`${t.box} box${t.box === 1 ? "" : "es"}`);
    if (t.lidbox) bits.push(`${t.lidbox} lidded box${t.lidbox === 1 ? "" : "es"}`);
    if (t.frame) bits.push(`${t.frame} separator frame${t.frame === 1 ? "" : "s"}`);
    const koch = S.style === "koch";
    if (!kug && S.includeCase !== false) bits.push((S.gasket === true ? "the case and its lid, with a gasket bead" : "the case and its lid")
      + (koch ? (S.kochLatch === "swing" ? " and its swing latch (Koch Box)" : S.kochLatch === "toggle" ? " with a folding toggle latch (Koch Box)" : " with a swing latch printed in place (Koch Box)") : S.latch === "round" ? " and a round clasp" : ""));
    $("cb-gasket").disabled = S.includeCase === false;
    $("cb-gasket-row").style.opacity = S.includeCase === false ? ".5" : "";
    for (const b of $("cb-style").querySelectorAll("button")) b.disabled = S.includeCase === false;
    $("cb-style-row").style.opacity = S.includeCase === false ? ".5" : "";
    $("cb-style-hint").innerHTML = STYLE_HINT[koch ? "koch" : "smooth"];
    $("cb-latch").hidden = koch;
    $("cb-klatch").hidden = !koch;
    for (const b of $("cb-latch").querySelectorAll("button")) b.disabled = S.includeCase === false;
    for (const b of $("cb-klatch").querySelectorAll("button")) b.disabled = S.includeCase === false;
    $("cb-latch-row").style.opacity = S.includeCase === false ? ".5" : "";
    $("cb-latch-hint").textContent = koch ? KLATCH_HINT[KOCH_LATCHES.includes(S.kochLatch) ? S.kochLatch : "swingpip"] : LATCH_HINT[S.latch === "round" ? "round" : "hook"];
    $("cb-adv").style.opacity = S.includeCase === false ? ".5" : "";
    $("cb-sum").innerHTML = t.pieces
      ? `<b>${t.pieces} piece${t.pieces === 1 ? "" : "s"}</b> to print: ${esc(bits.join(", "))}.`
        + (t.empty ? ` ${t.empty} square${t.empty === 1 ? "" : "s"} left empty.` : "")
      : kug ? "Paint boxes or separators onto the grid." : "Paint something on the grid, or include the case.";
    $("cb-build").disabled = !f.fits || !t.pieces;
    $("cb-undo").disabled = !undo.length;
    save(S);
  }

  // ---- build
  $("cb-build").addEventListener("click", async () => {
    const f = fitNow();
    if (!f.fits) return;
    const code = kitCode(S);
    close();
    let ok = false;
    try { ok = !!(await hooks.build?.(code))?.ok; } catch { ok = false; }
    if (ok) showDone(hooks, tally(S.regions, f.cols, f.rows, !isKuggis() && S.includeCase !== false, S.style === "koch" && S.kochLatch === "swing"));
  });

  paintTools();
  paint();
  addEventListener("resize", onResize);
  requestAnimationFrame(() => { try { $("cb-w").focus({ preventScroll: true }); } catch { /* fine */ } });
  return { el, close };
}

// After Build: the parts are on the plate. Two downloads, the way back to the
// grid, and the credit again, small.
function showDone(hooks, t) {
  style();
  document.getElementById("cb-done")?.remove();
  const el = document.createElement("div");
  el.id = "cb-done";
  el.setAttribute("role", "complementary");
  el.setAttribute("aria-label", "Your case parts");
  el.innerHTML = `
    <button type="button" class="cb-x2" title="Close" aria-label="Close">&times;</button>
    <b>${t.pieces} parts, laid out to print</b>
    <p>Download them as 3MF (every part separate, every plate in the one file; pick your Bambu printer under Prepare for and Bambu Studio opens it with a tab per plate) or STL. The sliders resize the case.</p>
    <div class="cb-acts">
      <button type="button" class="pri" data-a="3mf">Download 3MF</button>
      <button type="button" data-a="stl">STL</button>
      <button type="button" data-a="grid">Back to the grid</button>
    </div>
    <small>Grid: <a href="${CREDITS.casefinity}" target="_blank" rel="noopener">Casefinity</a> by Chris Agocs, on
      <a href="${CREDITS.hardcases}" target="_blank" rel="noopener">Gridfinity for Hardcases</a> by the
      <a href="${CREDITS.patreon}" target="_blank" rel="noopener">Unemployed Architect</a>.</small>`;
  document.body.appendChild(el);
  el.querySelector(".cb-x2").addEventListener("click", () => el.remove());
  el.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "3mf") hooks.exportParts?.();
    else if (a === "stl") hooks.exportStl?.();
    else if (a === "grid") { el.remove(); showCaseBuilder(hooks); }
  });
}
