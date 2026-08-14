// Pulling a model's dimensions out of its code, so it can be driven without
// reading it.
//
// Somebody who wants a 60mm box instead of a 40mm one should not have to find
// which of forty numbers is the width. Every model here already names its
// dimensions — the AI harness is told to extract them into constants before it
// writes any geometry, and OpenSCAD files off Thingiverse do the same thing by
// convention — so the numbers are already sitting at the top of the file with
// names on them. This reads them out and hands back a list a panel can render
// as sliders.
//
// Two rules decide what counts as a parameter, and both are about not lying:
//
//   TOP LEVEL ONLY. A number inside a function or a loop is part of how the
//   model is built, not a dial on it. Changing it from a slider would be
//   editing the middle of somebody's algorithm.
//
//   SIMPLE VALUES ONLY. `const WALL = 2` is a parameter. `const RIM = WALL * 2`
//   is a CONSEQUENCE — it has a value, but writing a new one over the top would
//   silently break the relationship the author wrote down. Anything whose
//   right-hand side is an expression is left alone, and stays correct.
//
// Everything is reported as a character span into the original source, so
// applying a change rewrites exactly those characters and nothing else: the
// comments, the formatting and the rest of the line survive untouched.

// ---------------------------------------------------------------- scanning
//
// Depth, strings and comments in one pass. The masked copy has every comment
// and string body replaced by spaces at the SAME offsets, so a regex run over
// it can never match inside a comment, and any index it reports is still an
// index into the real source.
function scan(src) {
  const n = src.length;
  const masked = new Array(n);
  const comments = [];
  const depthAtLine = [0];
  const lineStart = [0];
  let depth = 0, i = 0;
  let cur = null;                       // an open comment being collected

  const space = (a, b) => { for (let k = a; k < b; k++) if (src[k] !== "\n") masked[k] = " "; else masked[k] = "\n"; };

  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    // ---- comments
    if (c === "/" && c2 === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      comments.push({ start: i, end: stop, text: src.slice(i + 2, stop), block: false, line: lineStart.length - 1 });
      space(i, stop); i = stop; continue;
    }
    if (c === "#" && (c2 === undefined || /[\s[!]/.test(c2))) {
      // Python's comment. `#` is also OpenSCAD's debug modifier, where it sits
      // directly against the call it marks — `#cube(10);` — so what follows it
      // is the discriminator, not where it sits. Requiring it to OPEN the line
      // was exactly backwards: that is the OpenSCAD case, and it threw away
      // every trailing `# [10:80]` annotation, which is the Python one.
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      comments.push({ start: i, end: stop, text: src.slice(i + 1, stop), block: false, line: lineStart.length - 1 });
      space(i, stop); i = stop; continue;
    }
    if (c === "/" && c2 === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      comments.push({ start: i, end: stop, text: src.slice(i + 2, end === -1 ? n : end), block: true, line: lineStart.length - 1 });
      // a block comment can span lines, and those lines still have to be counted
      for (let k = i; k < stop; k++) {
        masked[k] = src[k] === "\n" ? "\n" : " ";
        if (src[k] === "\n") { lineStart.push(k + 1); depthAtLine.push(depth); }
      }
      i = stop; continue;
    }
    // ---- strings
    if (c === '"' || c === "'" || c === "`") {
      let k = i + 1;
      while (k < n && src[k] !== c) { if (src[k] === "\\") k++; k++; }
      const stop = Math.min(k + 1, n);
      masked[i] = c; masked[stop - 1] = c;             // keep the quotes visible
      for (let j = i + 1; j < stop - 1; j++) masked[j] = src[j] === "\n" ? "\n" : " ";
      i = stop; continue;
    }
    // ---- structure
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    masked[i] = c;
    if (c === "\n") { lineStart.push(i + 1); depthAtLine.push(depth); }
    i++;
  }
  return { masked: masked.join(""), comments, lineStart, depthAtLine };
}

// ------------------------------------------------------------ value parsing
//
// Deliberately narrow. What it accepts is exactly what a slider, a checkbox, a
// text box or a row of number boxes can round-trip without losing anything.
const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

function parseValue(src, at) {
  let i = at;
  while (i < src.length && /[ \t]/.test(src[i])) i++;
  const rest = src.slice(i);

  const num = NUM.exec(rest);
  if (num) return { kind: "number", value: +num[0], start: i, end: i + num[0].length };

  if (/^true\b/.test(rest)) return { kind: "bool", value: true, start: i, end: i + 4 };
  if (/^false\b/.test(rest)) return { kind: "bool", value: false, start: i, end: i + 5 };
  if (/^True\b/.test(rest)) return { kind: "bool", value: true, start: i, end: i + 4, py: true };
  if (/^False\b/.test(rest)) return { kind: "bool", value: false, start: i, end: i + 5, py: true };

  const q = rest[0];
  if (q === '"' || q === "'") {
    let k = 1;
    while (k < rest.length && rest[k] !== q) { if (rest[k] === "\\") k++; k++; }
    if (rest[k] !== q) return null;
    return { kind: "text", value: rest.slice(1, k), start: i, end: i + k + 1, quote: q };
  }

  // A vector — [30, 20, 10]. Numbers only: a list of anything else is data,
  // not three dimensions somebody wants three boxes for.
  if (q === "[") {
    const close = rest.indexOf("]");
    if (close === -1) return null;
    const inner = rest.slice(1, close);
    if (!inner.trim()) return null;
    const parts = [];
    let off = i + 1;
    for (const piece of inner.split(",")) {
      const m = NUM.exec(piece.trim());
      if (!m || m[0].length !== piece.trim().length) return null;   // not a plain number
      const lead = piece.length - piece.trimStart().length;
      parts.push({ value: +m[0], start: off + lead, end: off + lead + m[0].length });
      off += piece.length + 1;
    }
    if (parts.length < 2 || parts.length > 4) return null;
    return { kind: "vector", value: parts.map((p) => p.value), parts, start: i, end: i + close + 1 };
  }
  return null;
}

// What may legally follow a value for it to have been a whole statement. An
// operator here means the right-hand side was an expression, and an expression
// is a consequence of other parameters rather than one itself.
function terminated(src, end) {
  const rest = src.slice(end);
  return /^[ \t]*(?:;|$|\n|\/\/|\/\*|#)/.test(rest);
}

// ------------------------------------------------------------- annotations
//
// OpenSCAD's customizer already standardised this and thousands of published
// models carry it, so it is read rather than reinvented:
//
//   WALL = 2;        // [1:5]        min:max
//   WALL = 2;        // [1:0.5:5]    min:step:max
//   STYLE = "hex";   // [hex, round] a choice, not a slider
//   WALL = 2;        // wall thickness in mm      <- plain description
//   /* [Box] */                                   <- a group heading
//
function readAnnotation(text) {
  const t = text.trim();
  const br = /^\[([^\]]*)\]\s*(.*)$/.exec(t);
  if (!br) return { note: t || null };
  const body = br[1].trim(), note = br[2].trim() || null;
  if (!body) return { note };
  if (body.includes(":")) {
    const bits = body.split(":").map((s) => s.trim());
    const nums = bits.map(Number);
    if (bits.length === 2 && nums.every(Number.isFinite)) return { min: nums[0], max: nums[1], note };
    if (bits.length === 3 && nums.every(Number.isFinite)) return { min: nums[0], step: nums[1], max: nums[2], note };
    return { note };
  }
  if (body.includes(",")) {
    const choices = body.split(",").map((s) => s.trim()).filter(Boolean);
    if (choices.length > 1) return { choices, note };
  }
  return { note };
}

// ------------------------------------------------------------------- ranges
//
// A slider needs ends, and most models never say what they should be. Guessing
// wrong in the tight direction is the bad one: a slider that cannot reach the
// value you want reads as the feature being broken. So the guess is generous,
// and the number box beside it is never clamped at all.
export function niceCeil(x) {
  if (!(x > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(x));
  const n = x / mag;
  const s = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => n <= k + 1e-9) ?? 10;
  return s * mag;
}

// Matched as WORDS, not as substrings. A regex looking for "n" anywhere found
// it inside CORNER_R and decided a fillet radius was a count — so the slider
// went integer-only and the unit vanished. Splitting the name the same way the
// label does means "corner r" is two words, neither of which is a count.
const words = (name) => String(name).replace(/^\$/, "")
  .replace(/[_-]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2")
  .toLowerCase().split(/\s+/).filter(Boolean);
const ANGLE_WORDS = new Set(["ang", "angle", "angles", "deg", "degrees", "rot",
  "rotation", "rotate", "tilt", "slope", "lean", "twist", "sweep", "arc"]);
const COUNT_WORDS = new Set(["count", "num", "number", "qty", "quantity", "sides",
  "teeth", "segments", "holes", "cells", "rows", "cols", "columns", "fn", "copies",
  "layers", "steps", "slots", "spokes", "divisions", "n"]);
const hasWord = (name, set) => words(name).some((w) => set.has(w));

export function inferRange(value, name = "") {
  const v = Number(value) || 0;
  const a = Math.abs(v);
  if (hasWord(name, ANGLE_WORDS)) {
    return v < 0 ? { min: -180, max: 180, step: 1 } : { min: 0, max: 360, step: 1 };
  }
  if (hasWord(name, COUNT_WORDS) && Number.isInteger(v)) {
    return { min: Math.min(1, v), max: Math.max(12, niceCeil(a * 3)), step: 1 };
  }
  const max = niceCeil(Math.max(a * 3, a + 1));
  const min = v < 0 ? -max : 0;
  const span = max - min;
  // A hundred stops across the range, landed on a round number so the readout
  // is not 3.7142857.
  const raw = span / 100;
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100]
    .find((s) => s >= raw) ?? 100;
  return { min, max, step: Number.isInteger(v) && step > 1 ? 1 : step };
}

// -------------------------------------------------------------------- names
//
// WALL_THICKNESS and wallThickness are the same words with different plumbing.
export function humanLabel(name) {
  let s = String(name).replace(/^\$/, "");
  s = s.replace(/[_-]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").trim();
  s = s.replace(/\s+/g, " ").toLowerCase();
  const WORDS = {
    dia: "diameter", diam: "diameter", rad: "radius", r: "radius", d: "diameter",
    thk: "thickness", t: "thickness", w: "width", h: "height", l: "length",
    len: "length", qty: "quantity", num: "number of", cnt: "count",
    tol: "tolerance", clr: "clearance", fn: "smoothness",
  };
  s = s.split(" ").map((w) => WORDS[w] ?? w).join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// The unit that belongs after the number. Everything in this app is mm unless
// it is plainly an angle or a plain count, and a label reading "40 mm" is the
// difference between a slider you trust and one you have to test.
export function unitFor(name, kind) {
  if (kind !== "number" && kind !== "vector") return "";
  if (hasWord(name, ANGLE_WORDS)) return "°";
  if (hasWord(name, COUNT_WORDS)) return "";
  // A fraction of something is not a length. 0.2 "scale" in millimetres would
  // be a nonsense reading on a slider people are meant to trust.
  if (hasWord(name, new Set(["scale", "factor", "ratio", "fraction", "opacity", "pct", "percent"]))) return "";
  return "mm";
}

// ------------------------------------------------------------------ finding
const DECL = /^([ \t]*)(?:(const|let|var)[ \t]+)?(\$?[A-Za-z_][\w$]*)[ \t]*=[ \t]*(?!=)/;

// One-entry memo. The scan walks every character, which measured 10ms on a
// 26KB file — small until you notice it runs on every keystroke, and that the
// panel and the rebuild both ask for the same answer about the same text.
// Keyed on the exact source, so it is either right or absent.
let memoSrc = null, memoOut = null;

export function findParams(src) {
  if (typeof src !== "string" || !src.trim()) return [];
  if (src === memoSrc) return memoOut;
  const out = findParamsUncached(src);
  memoSrc = src; memoOut = out;
  return out;
}

function findParamsUncached(src) {
  const { masked, comments, lineStart, depthAtLine } = scan(src);
  const out = [];
  let group = null, hidden = false;

  // Group headings, in source order, so each parameter can be told which one
  // it fell under.
  const heads = comments
    .filter((c) => c.block && /^\s*\[[^\]]+\]\s*$/.test(c.text))
    .map((c) => ({ at: c.start, name: c.text.trim().replace(/^\[|\]$/g, "").trim() }));

  for (let li = 0; li < lineStart.length; li++) {
    if (depthAtLine[li] !== 0) continue;              // inside something
    const from = lineStart[li];
    const to = li + 1 < lineStart.length ? lineStart[li + 1] - 1 : src.length;
    const line = masked.slice(from, to);
    const m = DECL.exec(line);
    if (!m) continue;
    const name = m[3];
    if (name === "module" || name === "function" || name === "return") continue;

    const val = parseValue(src, from + m[0].length);
    if (!val) continue;
    if (!terminated(masked, val.end)) continue;       // an expression, not a dial

    // Python has no braces, so the depth counter sees a function body as top
    // level and offered every local in it. Indentation IS the scope there —
    // and there it is also the language with no semicolons, which is what
    // separates an indented Python local from an indented (but top-level, and
    // terminated) OpenSCAD assignment.
    const indented = m[1].length > 0;
    if (indented && !m[2] && !/^[ \t]*;/.test(masked.slice(val.end))) continue;

    // the heading this one lives under
    for (const h of heads) if (h.at < from) group = h.name;
    hidden = /^hidden$/i.test(group || "");
    if (hidden) continue;

    // its own trailing comment, if any
    const note = comments.find((c) => !c.block && c.start >= val.end && c.start < to);
    const ann = note ? readAnnotation(note.text) : {};

    const p = {
      name,
      label: humanLabel(name),
      kind: ann.choices ? "choice" : val.kind,
      value: val.value,
      start: val.start,
      end: val.end,
      line: li,
      group: group === null ? null : String(group),
      note: ann.note || null,
      declared: m[2] || null,
    };
    if (val.kind === "vector") p.parts = val.parts;
    if (val.kind === "text") p.quote = val.quote;
    if (val.py) p.py = true;
    if (ann.choices) p.choices = ann.choices;
    if (val.kind === "number" || val.kind === "vector") {
      const base = inferRange(val.kind === "vector" ? Math.max(...val.value.map(Math.abs)) : val.value, name);
      p.min = ann.min ?? base.min;
      p.max = ann.max ?? base.max;
      p.step = ann.step ?? base.step;
      p.unit = unitFor(name, val.kind);
      // An annotated range that does not contain the value it annotates is
      // worse than none: the slider would snap the model on first touch.
      const v = val.kind === "vector" ? Math.max(...val.value) : val.value;
      const lo = val.kind === "vector" ? Math.min(...val.value) : val.value;
      if (v > p.max) p.max = niceCeil(v * 1.2);
      if (lo < p.min) p.min = lo < 0 ? -niceCeil(Math.abs(lo) * 1.2) : 0;
    }
    out.push(p);
  }
  return out;
}

// ----------------------------------------------------------------- applying
//
// Always re-finds the parameter by NAME before writing. Offsets recorded by an
// earlier scan go stale the moment any edit shifts the text, and a stale offset
// does not fail — it writes a number into the middle of something else.
export function applyParam(src, name, value, index = null) {
  const p = findParams(src).find((x) => x.name === name);
  if (!p) return src;
  let text, start, end;
  if (p.kind === "vector") {
    const part = p.parts[index ?? 0];
    if (!part) return src;
    text = formatNumber(value, p.parts[index ?? 0].end - p.parts[index ?? 0].start);
    start = part.start; end = part.end;
  } else if (p.kind === "bool") {
    text = p.py ? (value ? "True" : "False") : (value ? "true" : "false");
    start = p.start; end = p.end;
  } else if (p.kind === "text" || p.kind === "choice") {
    const q = p.quote || '"';
    text = p.kind === "choice" && typeof p.value === "number"
      ? formatNumber(value) : q + String(value).replace(new RegExp(q, "g"), "\\" + q) + q;
    start = p.start; end = p.end;
  } else {
    text = formatNumber(value);
    start = p.start; end = p.end;
  }
  return src.slice(0, start) + text + src.slice(end);
}

// 2.5000000000000004 is what arithmetic on a slider gives you, and writing that
// into somebody's source is vandalism. Six decimals is finer than any printer
// and shorter than any float artefact.
export function formatNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(+n.toFixed(6));
}

// A stable description of the SHAPE of a parameter list — names and kinds, not
// values. The panel rebuilds its controls when this changes and only refreshes
// the numbers when it does not, so dragging a slider cannot pull the slider out
// from under the finger doing the dragging.
export function paramsSignature(params) {
  return params.map((p) => `${p.name}:${p.kind}:${p.parts?.length ?? 0}:${p.group ?? ""}`).join("|");
}
