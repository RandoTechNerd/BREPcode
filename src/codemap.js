// codemap.js — the editor code as a parse tree instead of a string.
//
// Every write-back the viewer does (sliders, drag-to-move, resize handles,
// colour, the AI's surgical edits) has to find a piece of the source text and
// change only that. Until now that meant regexes and bracket counting, and the
// shape-to-text link paired the Nth traced primitive with the Nth call it could
// see in the text — right for a flat document, wrong the moment a loop, a
// helper function or a reused variable made the two counts disagree.
//
// This module answers both halves exactly:
//   parseCode(src)         every call (with its source range) and every
//                          top-level const/let parameter (with its value range)
//   mapTraceSites(...)     the compile trace's recorded call sites (line:col,
//                          captured from a stack when the DSL node was made)
//                          resolved to calls in the editor text
//
// Nothing here runs the model or touches the kernel, so it works the same on
// every engine (NVIDIA SMLib, the Rust kernel, the JS kernel): the kernel only
// ever sees the feature list compile() produces.

import { Parser } from "../vendor/acorn/acorn.mjs";

// The name the evaluated model code is given (`//# sourceURL=`), so a stack
// frame from the user's own code can be told from every other frame.
export const SITE_URL = "brepcode-model.js";

const PARSE_OPTS = {
  ecmaVersion: "latest",
  sourceType: "script",
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
  allowHashBang: true,
};

// Same trick as params.js: the same text is asked about many times per build
// (the trace map, the panel, a colour write), so remember the last few.
const MEMO = new Map();
const MEMO_MAX = 6;

export function lineStarts(src) {
  const out = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}

// 1-based line and column (what a V8 / SpiderMonkey stack frame reports) to a
// character offset, or -1 when the position is not in the text.
export function offsetAt(starts, line, col) {
  if (!(line >= 1) || line > starts.length || !(col >= 1)) return -1;
  return starts[line - 1] + col - 1;
}

function calleeName(c) {
  if (c.type === "Identifier") return { name: c.name, member: false, start: c.start, end: c.end };
  if (c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier") {
    return { name: c.property.name, member: true, start: c.property.start, end: c.property.end };
  }
  return null;
}

// A literal a slider can own: a number (optionally negated), a string, a
// boolean, or a flat array of numbers.
function literalOf(n) {
  if (!n) return null;
  if (n.type === "Literal") {
    if (typeof n.value === "number") return { kind: "number", value: n.value };
    if (typeof n.value === "string") return { kind: "text", value: n.value };
    if (typeof n.value === "boolean") return { kind: "bool", value: n.value };
    return null;
  }
  if (n.type === "UnaryExpression" && n.operator === "-" && n.argument.type === "Literal"
    && typeof n.argument.value === "number") {
    return { kind: "number", value: -n.argument.value };
  }
  if (n.type === "ArrayExpression" && n.elements.length) {
    const parts = [];
    for (const e of n.elements) {
      const v = literalOf(e);
      if (!v || v.kind !== "number") return null;
      parts.push({ start: e.start, end: e.end, value: v.value });
    }
    return { kind: "vector", value: parts.map((p) => p.value), parts };
  }
  return null;
}

// parseCode(src) -> {
//   ok, error,
//   calls:  [{ name, member, start, end, calleeStart, calleeEnd, line, col,
//              args: [{ start, end, type, literal }], parent, depth, fn }]
//           in source order; `parent` is the index of the innermost call this
//           one is an argument of (null at top level); `fn` is the name of the
//           function it was written inside (null at top level).
//   params: [{ name, kind, start, end, valueStart, valueEnd, literal, line }]
//           top-level declarations only, in source order.
//   lineStarts,
// }
// A source that does not parse (OpenSCAD, Python, half-typed JS) comes back
// with ok: false and empty lists; callers fall back to their old scanners.
export function parseCode(src) {
  if (typeof src !== "string") return { ok: false, error: "not text", calls: [], params: [], lineStarts: [0] };
  const hit = MEMO.get(src);
  if (hit) return hit;
  const out = parseUncached(src);
  MEMO.set(src, out);
  if (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  return out;
}

function parseUncached(src) {
  const starts = lineStarts(src);
  let ast;
  try {
    ast = Parser.parse(src, PARSE_OPTS);
  } catch (e) {
    return { ok: false, error: String(e?.message || e), calls: [], params: [], lineStarts: starts };
  }
  const calls = [];
  const params = [];
  let ret = null;           // the top-level return's value: the whole model

  for (const st of ast.body) {
    if (st.type === "ReturnStatement" && st.argument) ret = { start: st.argument.start, end: st.argument.end };
    if (st.type !== "VariableDeclaration") continue;
    for (const d of st.declarations) {
      if (d.id.type !== "Identifier" || !d.init) continue;
      params.push({
        name: d.id.name,
        kind: st.kind,
        start: d.start,
        end: d.end,
        valueStart: d.init.start,
        valueEnd: d.init.end,
        literal: literalOf(d.init),
        line: lineOf(starts, d.start),
      });
    }
  }

  // Calls, with the function each one was written inside tracked on a stack.
  const fnStack = [];        // names of the open functions
  const visit = (node) => {
    const isFn = /Function/.test(node.type) && node.body;
    if (isFn) {
      fnStack.push(node.id?.name ?? node.boundName ?? null);
    }
    // `const across = (…) => …`: the arrow is called by that name
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && /Function/.test(node.init?.type ?? "")) {
      node.init.boundName = node.id.name;
    }
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const cn = calleeName(node.callee);
      if (cn) {
        const pos = posOf(starts, cn.start);
        calls.push({
          name: cn.name,
          member: cn.member,
          start: node.start,
          end: node.end,
          calleeStart: cn.start,
          calleeEnd: cn.end,
          // where a stack frame reports this call: V8 points at the callee's
          // name (the property, for a member call)
          line: pos.line,
          col: pos.col,
          args: node.arguments.map((a) => ({ start: a.start, end: a.end, type: a.type, literal: literalOf(a) })),
          parent: null,       // filled in by linkParents()
          depth: 0,
          fn: fnStack.length ? fnStack[fnStack.length - 1] ?? "(anonymous)" : null,
          isNew: node.type === "NewExpression",
        });
      }
    }
    for (const key in node) {
      if (key === "type" || key === "start" || key === "end") continue;
      const v = node[key];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === "string") visit(c); }
      else if (v && typeof v.type === "string") visit(v);
    }
    if (isFn) fnStack.pop();
  };
  visit(ast);
  calls.sort((a, b) => a.start - b.start || b.end - a.end);
  linkParents(calls);
  return { ok: true, error: null, calls, params, ret, lineStarts: starts };
}

// A call's parent is the innermost call whose ARGUMENTS contain it (a call in
// the callee position, `f()(x)`, is not an argument of anything).
function linkParents(calls) {
  const open = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    while (open.length && calls[open[open.length - 1]].end <= c.start) open.pop();
    let parent = null;
    for (let k = open.length - 1; k >= 0; k--) {
      const p = calls[open[k]];
      if (p.args.some((a) => c.start >= a.start && c.end <= a.end)) { parent = open[k]; break; }
    }
    c.parent = parent;
    c.depth = parent == null ? 0 : calls[parent].depth + 1;
    open.push(i);
  }
}

function lineOf(starts, off) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= off) lo = mid; else hi = mid - 1;
  }
  return lo;          // 0-based, like params.js
}

function posOf(starts, off) {
  const li = lineOf(starts, off);
  return { line: li + 1, col: off - starts[li] + 1 };
}

// The call a stack frame points at. Exact when the offset is a callee's first
// character (that is what V8 reports); otherwise the innermost call whose range
// holds the offset, which covers engines that report the opening paren.
export function callAt(map, offset) {
  if (!map?.ok || offset < 0) return null;
  let best = null;
  for (const c of map.calls) {
    if (c.calleeStart === offset) return c;
    if (offset >= c.start && offset < c.end && (!best || c.end - c.start < best.end - best.start)) best = c;
  }
  return best;
}

export function paramNamed(src, name) {
  return parseCode(src).params.find((p) => p.name === name) ?? null;
}

// ------------------------------------------------------------ the eval header
//
// `new Function(...)` puts a header ("function anonymous(a,b\n) {") before the
// body, and stack lines count from the top of that. Its height is an engine
// detail, so measure it once instead of assuming 2.
let headerLines = null;
export function functionHeaderLines() {
  if (headerLines != null) return headerLines;
  try {
    // eslint-disable-next-line no-new-func
    const st = new Function("a", "b", `"use strict";\nreturn new Error().stack;\n//# sourceURL=${SITE_URL}`)();
    const m = new RegExp(`${SITE_URL.replace(/\./g, "\\.")}:(\\d+):(\\d+)`).exec(String(st || ""));
    headerLines = m ? Number(m[1]) - 2 : 2;
  } catch {
    headerLines = 2;
  }
  return headerLines;
}

// The body the viewer hands new Function puts the user's text on body line 2
// (line 1 is `"use strict";` or `"use strict"; return (`), so a frame's line
// minus this is the line in the text that ran.
export const runLineOffset = () => functionHeaderLines() + 1;

// ------------------------------------------------------- trace -> editor text
//
// mapTraceSites(trace, runText, editorText, opts) -> { byId, unresolved, patterns }
//
// trace:      compile()'s entries; each may carry site: { line, col } (frame
//             position, as recorded by the DSL when the node was made).
// runText:    the exact text that was evaluated (after trim/fence-strip/autoFix).
// editorText: what is in the editor now; ranges are reported in THIS text.
// opts.lineOffset: frame line minus this = line in runText (runLineOffset()).
// opts.words: optional Set of call names allowed to own a shape (the
//             vocabulary); a frame that lands on anything else (`.map`, a
//             user's own function) is left unresolved.
//
// byId[featureId] = { kind, start, end, codes, exact: true, pattern? } where
// pattern = { ids, index, count } when several features came from the one call
// (a loop, a helper called twice, a variable used twice).
export function mapTraceSites(trace, runText, editorText, opts = {}) {
  const byId = {};
  const unresolved = [];
  if (!Array.isArray(trace) || !trace.length) return { byId, unresolved, patterns: [] };
  const run = parseCode(runText);
  const ed = runText === editorText ? run : parseCode(editorText);
  const lineOffset = opts.lineOffset ?? runLineOffset();
  // Where the run text sits inside the editor text, when it is a verbatim
  // slice (trim, fences): then every range just shifts.
  const shift = runText === editorText ? 0 : editorText.indexOf(runText);

  const toEditor = (c) => {
    if (shift >= 0) return { start: c.start + shift, end: c.end + shift };
    // The run text was rewritten (autoFix). Find the same call text in the
    // editor: same name, same text, same rank among identical copies.
    if (!ed.ok) return null;
    const text = runText.slice(c.start, c.end);
    const twinsRun = run.calls.filter((x) => x.name === c.name && runText.slice(x.start, x.end) === text);
    const twinsEd = ed.calls.filter((x) => x.name === c.name && editorText.slice(x.start, x.end) === text);
    if (twinsRun.length !== twinsEd.length) return null;
    const k = twinsRun.indexOf(c);
    return k >= 0 ? { start: twinsEd[k].start, end: twinsEd[k].end } : null;
  };

  for (const t of trace) {
    const s = t.site;
    if (!s || !run.ok) { unresolved.push(t.id); continue; }
    const off = offsetAt(run.lineStarts, s.line - lineOffset, s.col);
    const c = callAt(run, off);
    if (!c || (opts.words && !opts.words.has(c.name))) { unresolved.push(t.id); continue; }
    const r = toEditor(c);
    if (!r || editorText.slice(r.start, r.end) !== runText.slice(c.start, c.end)) { unresolved.push(t.id); continue; }
    byId[t.id] = { kind: c.name, start: r.start, end: r.end, codes: [t.code], exact: true };
    if (t.name) byId[t.id].name = t.name;
    // made inside a function: that function's name, and the calls above it
    // that led there (innermost first), for an edit of this one instance
    if (c.fn) {
      byId[t.id].fn = c.fn;
      const callers = [];
      for (const u of s.up || []) {
        const cc = callAt(run, offsetAt(run.lineStarts, u.line - lineOffset, u.col));
        const rr = cc && toEditor(cc);
        if (!rr) break;
        callers.push({ name: cc.name, start: rr.start, end: rr.end, fn: cc.fn });
      }
      byId[t.id].callers = callers;
    }
  }

  // Pattern groups: features that resolved to the same call.
  const bySpan = new Map();
  for (const [id, site] of Object.entries(byId)) {
    const k = `${site.start}:${site.end}`;
    if (!bySpan.has(k)) bySpan.set(k, []);
    bySpan.get(k).push(id);
  }
  const patterns = [];
  for (const ids of bySpan.values()) {
    if (ids.length < 2) continue;
    patterns.push(ids);
    ids.forEach((id, index) => { byId[id].pattern = { ids, index, count: ids.length }; });
  }
  return { byId, unresolved, patterns };
}

// ------------------------------------------------------------- colour → code
//
// A shape's look lives in the code as wrappers around its call:
// colorize("#hex", call) for its colour and finish("Brass", call) for its
// material. The two stack in either order (colorize("#f00", finish("Brass",
// cube(…)))), so each writer looks up through the wrappers already on the
// call for its own one.
const LOOK_WRAPS = new Set(["colorize", "finish"]);

// the wrapper fn already around the call at [start, end), or null
function wrapperAt(map, start, end, fn) {
  let me = map.calls.find((c) => c.start === start && c.end === end);
  while (me && me.parent != null) {
    const parent = map.calls[me.parent];
    if (!LOOK_WRAPS.has(parent.name) || parent.args.length !== 2
      || parent.args[1].start !== me.start || parent.args[1].end !== me.end) return null;
    if (parent.name === fn) return parent;
    me = parent;
  }
  return null;
}

// wrapAt(src, start, end, fn, value) -> new source text: the call at
// [start, end) gets fn(value, call); when that wrapper is already on it (a
// text value), only the value changes.
export function wrapAt(src, start, end, fn, value) {
  const q = JSON.stringify(String(value));
  const map = parseCode(src);
  if (map.ok) {
    const w = wrapperAt(map, start, end, fn);
    if (w && w.args[0].literal?.kind === "text") return src.slice(0, w.args[0].start) + q + src.slice(w.args[0].end);
  }
  return src.slice(0, start) + `${fn}(${q}, ${src.slice(start, end)})` + src.slice(end);
}

// unwrapAt(src, start, end, fn) -> new source text, or null when there is no
// fn(…, it) around the call at [start, end) to take off.
export function unwrapAt(src, start, end, fn) {
  const map = parseCode(src);
  if (!map.ok) return null;
  const w = wrapperAt(map, start, end, fn);
  if (!w) return null;
  const inner = w.args[1];
  return src.slice(0, w.start) + src.slice(inner.start, inner.end) + src.slice(w.end);
}

// colorizeAt(src, start, end, hex) -> new source text.
// The call at [start, end) gets the colour IN THE CODE: when it is already the
// shape argument of a colorize("…", it) the string is replaced; otherwise the
// call is wrapped as colorize("#hex", call).
export function colorizeAt(src, start, end, hex) { return wrapAt(src, start, end, "colorize", hex); }

// uncolorizeAt(src, start, end) -> new source text, or null when the call at
// [start, end) is not the shape argument of a colorize("…", it) to take off.
export function uncolorizeAt(src, start, end) { return unwrapAt(src, start, end, "colorize"); }

// ------------------------------------------------------------- whole model
//
// The model's own look: finish("name", …) around what it returns. Every shape
// inside takes it, over its own colorize() (src/dsl.js finish(); the viewer's
// applyFinishTo), so it is how "print ALL of it in Ruby Red" is written.

// the finish("…", …) that IS the returned value, or null
function wholeWrap(map) {
  if (!map.ok || !map.ret) return null;
  const w = map.calls.find((c) => c.start === map.ret.start && c.end === map.ret.end);
  return w && w.name === "finish" && w.args.length === 2 && w.args[0].literal?.kind === "text" ? w : null;
}

// wholeFinishOf(src) -> the name in a finish() around the whole model, or null
export function wholeFinishOf(src) {
  return wholeWrap(parseCode(src))?.args[0].literal.value ?? null;
}

// setWholeFinish(src, name) -> new source text with finish(name, …) around the
// returned value (its name changed when one is already there), or with it
// taken off when name is null. null when there is no top-level return to
// wrap, or nothing to take off.
export function setWholeFinish(src, name) {
  const map = parseCode(src);
  if (!map.ok || !map.ret) return null;
  const w = wholeWrap(map);
  if (name == null) {
    if (!w) return null;
    const inner = w.args[1];
    return src.slice(0, w.start) + src.slice(inner.start, inner.end) + src.slice(w.end);
  }
  const q = JSON.stringify(String(name));
  if (w) return src.slice(0, w.args[0].start) + q + src.slice(w.args[0].end);
  return src.slice(0, map.ret.start) + `finish(${q}, ${src.slice(map.ret.start, map.ret.end)})` + src.slice(map.ret.end);
}

// ------------------------------------------------------------- assembly parts
//
// An assembly's part is an entry in the object it is built from:
//   housing: { shape: housingC(), color: "#b9bec6", finish: "aluminium" },
// and its look is that entry's color / finish (src/assembly.js). The part's
// pieces are usually made in helpers and loops, where no one call is the part,
// so this entry is where a pick on the part belongs in the code.
//
// setPartProp(src, part, prop, value) -> new source text with prop set to the
// text value (replaced if written as text, added at the END of the entry
// otherwise, so it wins over a ...spread before it), or taken off when value
// is null. null when no entry `part: { shape: ..., ... }` is written out
// literally (a name made in a loop), or nothing changes.
export function setPartProp(src, part, prop, value) {
  let ast;
  try { ast = Parser.parse(src, PARSE_OPTS); } catch { return null; }
  const keyOf = (p) => p.key?.type === "Identifier" && !p.computed ? p.key.name
    : p.key?.type === "Literal" ? String(p.key.value) : null;
  let entry = null;
  (function walk(n) {
    if (entry || !n || typeof n.type !== "string") return;
    if (n.type === "Property" && keyOf(n) === part && n.value?.type === "ObjectExpression"
      && n.value.properties.some((q) => q.type === "Property" && keyOf(q) === "shape")) { entry = n.value; return; }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === "string") walk(v);
    }
  })(ast);
  if (!entry) return null;
  const own = entry.properties.filter((q) => q.type === "Property" && keyOf(q) === prop);
  const last = own[own.length - 1];
  const q = value == null ? "null" : JSON.stringify(String(value));
  // after the last ...spread, so it is the value the part ends up with
  const wins = (p) => p && !entry.properties.slice(entry.properties.indexOf(p) + 1).some((x) => x.type === "SpreadElement");
  const hasSpread = entry.properties.some((x) => x.type === "SpreadElement");
  if (value == null && hasSpread) {
    // a ...spread may carry the prop (...copper is a finish): taking ours off
    // would hand the part back to it, so it is set to null instead
    if (last && last.value.type === "Literal" && wins(last)) {
      return last.value.raw === "null" ? null : src.slice(0, last.value.start) + q + src.slice(last.value.end);
    }
    const tail = entry.properties[entry.properties.length - 1];
    return src.slice(0, tail.end) + `, ${prop}: null` + src.slice(tail.end);
  }
  if (value == null) {
    if (!last || last.value.type !== "Literal") return null;
    // the property and the comma that joins it to its neighbour
    const i = entry.properties.indexOf(last);
    const prev = entry.properties[i - 1], next = entry.properties[i + 1];
    const from = prev ? prev.end : last.start, to = prev ? last.end : next ? next.start : last.end;
    return src.slice(0, from) + src.slice(to);
  }
  if (last && last.value.type === "Literal" && wins(last)) {
    if (last.value.raw === q) return null;
    return src.slice(0, last.value.start) + q + src.slice(last.value.end);
  }
  const tail = entry.properties[entry.properties.length - 1];
  return src.slice(0, tail.end) + `, ${prop}: ${q}` + src.slice(tail.end);
}

// ------------------------------------------------------------- face → edges
//
// Kernel edge names are "FACEA|FACEB[i]" (both kernels, and the names that
// fillet()/chamfer() take). Given every edge name of a solid, the ones that
// bound a face.
export function edgesOfFace(faceName, edgeNames) {
  if (!faceName) return [];
  const out = [];
  for (const e of edgeNames || []) {
    // Compared as prefix/suffix rather than split on "|": a blend face's own
    // name can contain one ("F4:BLEND:A|B[0]").
    const pair = String(e).replace(/\[\d+\]$/, "");
    if (pair.startsWith(faceName + "|") || pair.endsWith("|" + faceName)) out.push(String(e));
  }
  return out;
}
