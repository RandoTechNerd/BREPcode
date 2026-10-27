// design-move.js — the text a move writes into the code.
//
// One function for every way of moving a shape: dragging its body on the
// model (Code and Design mode alike) and the Design-mode gizmo. Both used to
// need the same three cases, and two copies of them would drift:
//
//   drill([x, y, z], …)          the point IS the position: rewrite it
//   translate([a, b, c], <span>) already wrapped: fold the move into it
//   <span>                       wrap it: translate([dx, dy, dz], <span>)
//
// `span` is the range to move, from assist.js dragSpanFor(): the call itself,
// or the whole boolean when the call is that boolean's first (main) shape.
// A call in a loop, a helper or a variable used twice is ONE call, so moving
// it moves every instance; Design mode says so rather than pretending to move
// one (see docs/design-mode.md).

import { parseCode, offsetAt, callAt, runLineOffset } from "../src/codemap.js";


// ridersOf(span, { sites, trace, runText, editorText }) -> feature ids that a
// move of `span` carries: every shape whose call sits inside it, AND every
// shape built somewhere else (a helper, a variable) but called from inside
// it. The second kind is found from the trace's `path`, the chain of calls
// each shape was made inside: `union(cube(…), peg(10))` moves the peg too,
// though the peg's own cylinder() is written in the helper up the file.
export function ridersOf(span, { sites = {}, trace = [], runText = null, editorText = "", lineOffset } = {}) {
  const out = new Set(Object.keys(sites).filter((id) => sites[id].start >= span.start && sites[id].end <= span.end));
  const shift = runText == null ? -1 : runText === editorText ? 0 : editorText.indexOf(runText);
  const run = shift >= 0 ? parseCode(runText) : null;
  if (!run?.ok) return [...out];
  const lo = lineOffset ?? runLineOffset();
  for (const t of trace) {
    if (out.has(t.id) || !t.path) continue;
    for (const s of t.path) {
      const c = callAt(run, offsetAt(run.lineStarts, s.line - lo, s.col));
      if (c && c.start + shift >= span.start && c.end + shift <= span.end) { out.add(t.id); break; }
    }
  }
  return [...out];
}
// -0 prints as "0" but reads oddly in a vector some tools compare as text

// A wrapper right before a span is only folded into when the span is its
// ONLY child: translate([1,0,0], a, b) moving `a` must not move `b` too.
// instanceSpan(site) -> where to write an edit of a shape made inside a
// helper function. The helper's body is shared by every call of it, so an
// edit written there changes all of them (a scale of a stand's window cut
// scaled the whole stand); the call of the helper that made THIS shape is
// what to wrap. Follows the callers out (`across` called from the top level,
// or from another helper called from there) and gives:
//   null              the shape is written in the open: edit its own call
//   { start, end }    the outermost helper call that made it
//   { shared: name }  made in a function that cannot be traced to one call
//                     (a .map callback, an unnamed function): edit nothing
export function instanceSpan(site) {
  if (!site?.fn) return null;
  let fn = site.fn;
  for (const c of site.callers || []) {
    if (c.name !== fn) break;
    if (!c.fn) return { start: c.start, end: c.end, label: `${c.name}(…)`, whole: false, instance: true };
    fn = c.fn;
  }
  return { shared: site.fn };
}

export const soleChild = (text, end) => /^\s*,?\s*\)/.test(text.slice(end));
const WRAP_HEAD = /translate\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*,\s*$/;
const DRILL_HEAD = /^drill\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/;

// moveText(text, span, delta) -> { next, how, start, end }
//   delta: {x, y, z} (a THREE.Vector3 is fine), rounded to 0.1 mm here
//   how:   "drill" | "fold" | "wrap" | "none" (a zero move writes nothing)
//   start/end: where the moved span sits in `next`, so a caller can find the
//   same shape again after the rebuild.
// opts.step: the rounding (default 0.1 mm; a centred box's corner needs 0.05)
export function moveText(text, span, delta, { step = 0.1 } = {}) {
  const k = Math.round(1 / step);
  const tidy = (n) => { const v = Math.round(n * k) / k; return Object.is(v, -0) ? 0 : v; };
  const d = [tidy(delta.x), tidy(delta.y), tidy(delta.z)];
  if (!d[0] && !d[1] && !d[2]) return { next: text, how: "none", start: span.start, end: span.end };
  const head = text.slice(0, span.start);
  const body = text.slice(span.start, span.end);
  // A drill already carries its position: it is the first argument, and that
  // is the number someone reading the code expects to see change. Wrapping it
  // in a translate() would work and would be worse: the point would then say
  // one thing and the hole sit somewhere else.
  const bore = DRILL_HEAD.exec(body);
  if (bore) {
    const p = [tidy(+bore[1] + d[0]), tidy(+bore[2] + d[1]), tidy(+bore[3] + d[2])];
    const moved = `drill([${p.join(", ")}]` + body.slice(bore[0].length);
    return { next: head + moved + text.slice(span.end), how: "drill", start: span.start, end: span.start + moved.length };
  }
  const wrap = soleChild(text, span.end) ? WRAP_HEAD.exec(head) : null;
  if (wrap) {
    const nv = [tidy(+wrap[1] + d[0]), tidy(+wrap[2] + d[1]), tidy(+wrap[3] + d[2])];
    const lead = `translate([${nv.join(", ")}], `;
    const start = wrap.index + lead.length;
    return { next: head.slice(0, wrap.index) + lead + text.slice(span.start), how: "fold", start, end: start + body.length };
  }
  const lead = `translate([${d.join(", ")}], `;
  const start = span.start + lead.length;
  return { next: head + lead + body + ")" + text.slice(span.end), how: "wrap", start, end: start + body.length };
}
