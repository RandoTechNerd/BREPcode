// design-timeline.js — Design mode's timeline: the kernel's feature history,
// left to right, each step linked back to the call that made it.
//
// A primitive (P.CU1, P.CY2 …) links straight through featureMap. A boolean,
// fillet or chamfer has no trace entry of its own, so it is placed from the
// features it names (a boolean's targetSolid and targets, a fillet's edges
// "P.CU1_NX|P.CU1_PY[0]"): the compile trace records, for every primitive, the
// chain of calls it sits inside (`path`), and the step belongs to the innermost
// call those chains share that is the right kind of word (union for a UNION,
// difference for a SUBTRACT, the fillet() itself for a fillet).

import { parseCode, offsetAt, callAt, runLineOffset, mapTraceSites } from "../src/codemap.js";

const OP_WORDS = {
  UNION: ["union", "add", "merge"],
  SUBTRACT: ["difference", "subtract", "cut"],
  INTERSECT: ["intersection", "intersect"],
};
// words that wrap a shape without being a feature step of their own
const WRAPPERS = new Set(["translate", "rotate", "scale", "mirror", "move", "colorize", "color",
  "finish", "glass", "glow", "union", "difference", "intersection", "subtract", "add", "cut", "intersect"]);

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The feature ids a step's params mention, among `known`.
export function referencedIds(params, known) {
  const text = JSON.stringify(params ?? {});
  const out = [];
  for (const id of known) {
    if (id === params?.id) continue;
    // "P.CU1" in "P.CU1", "P.CU1_NX" or "P.CU1_NX|P.CY2_S[0]", never in "P.CU12"
    if (new RegExp(`(^|[^\\w.])${escRe(id)}(?!\\d)`).test(text)) out.push(id);
  }
  return out;
}

// linkFeatures(features, { sites, trace, runText, editorText, lineOffset })
//   -> [{ index, id, type, op, link: { start, end, exact } | null, refs }]
// features: [{ type, params }] (the viewer's lastFeatures)
// sites:    featureMap (featureId -> { start, end }) or null
export function linkFeatures(features, { sites = null, trace = [], runText = null, editorText = "", lineOffset } = {}) {
  const run = runText != null ? parseCode(runText) : null;
  const shift = runText == null ? -1 : runText === editorText ? 0 : editorText.indexOf(runText);
  const lo = lineOffset ?? runLineOffset();
  const traceById = new Map(trace.map((t) => [t.id, t]));
  const known = [...new Set([...Object.keys(sites || {}), ...traceById.keys()])];
  // a trace path, as the calls it passes through (outermost first) in the run text
  const chainOf = (id) => {
    const t = traceById.get(id);
    if (!t?.path || !run?.ok) return null;
    const out = [];
    for (const s of t.path) {
      const c = callAt(run, offsetAt(run.lineStarts, s.line - lo, s.col));
      if (c && !out.includes(c)) out.push(c);
    }
    return out;
  };

  return (features || []).map((f, index) => {
    const id = f.params?.id ?? null;
    const op = f.params?.boolean?.operation ?? null;
    const step = { index, id, type: f.type, op, link: null, refs: [] };
    const own = id && sites?.[id];
    if (own) {
      step.link = { start: own.start, end: own.end, exact: !!own.exact };
      return step;
    }
    step.refs = referencedIds(f.params, known);
    if (!step.refs.length || shift < 0) return step;
    const chains = step.refs.map(chainOf).filter(Boolean);
    if (chains.length !== step.refs.length) return step;
    const common = chains[0].filter((c) => chains.every((ch) => ch.includes(c)));
    if (!common.length) return step;
    let pick = null;
    if (f.type === "B" && op && OP_WORDS[op]) {
      pick = [...common].reverse().find((c) => OP_WORDS[op].includes(c.name)) ?? null;
    } else {
      pick = [...common].reverse().find((c) => !WRAPPERS.has(c.name)
        && !step.refs.some((r) => sites?.[r] && sites[r].start === c.start + shift)) ?? null;
    }
    if (!pick) return step;
    step.link = { start: pick.start + shift, end: pick.end + shift, exact: false };
    return step;
  });
}

// failedSteps(failure, { words }) -> { steps, index } for a build the kernel
// refused: the feature list it was asked for, linked like a good build's,
// and which step failed. The kernels name the feature in their message
// ("…, F F2: fillet did not produce a closed solid"). A feature refused
// before it was ever made (fillet(): "no edge …" is thrown while the list is
// being written, so it has no step) gets one of its own, red, linked to its
// call: the dialog's pending call when a preview failed (failure.pending:
// { label, link }), else the last call of the word the message starts with.
// Only a message that names neither blames the last step.
export function failedSteps(failure, { words, lineOffset } = {}) {
  if (!failure?.features?.length && !failure?.pending) return null;
  const editorText = failure.editorText ?? failure.runText ?? "";
  const sites = failure.trace && failure.runText != null
    ? mapTraceSites(failure.trace, failure.runText, editorText, { words, lineOffset }).byId : {};
  const steps = linkFeatures(failure.features || [], { sites, trace: failure.trace || [], runText: failure.runText, editorText, lineOffset });
  const reason = String(failure.reason || "");
  const ids = steps.map((s, i) => [s.id, i]).filter(([id]) => id).sort((a, b) => b[0].length - a[0].length);
  const named = ids.find(([id]) => new RegExp(`(^|[^\\w.])${escRe(id)}(?![\\w.])`).test(reason));
  if (named) return { steps, index: named[1] };
  const add = (label, link) => {
    steps.push({ index: steps.length, id: null, type: "pending", op: null, label, link, refs: [] });
    return { steps, index: steps.length - 1 };
  };
  if (failure.pending) return add(failure.pending.label, failure.pending.link ?? null);
  const word = /^(?:Error:\s*)?(\w+)\(\)/.exec(reason)?.[1];
  const map = word ? parseCode(editorText) : null;
  const call = map?.ok ? [...map.calls].reverse().find((c) => c.name === word) : null;
  if (call) return add(word[0].toUpperCase() + word.slice(1), { start: call.start, end: call.end, exact: false });
  return { steps, index: steps.length - 1 };
}

// A short human label for a step.
export function stepLabel(step, featureLabel) {
  if (step.label) return step.label;
  if (step.type === "B") {
    return { UNION: "Union", SUBTRACT: "Cut", INTERSECT: "Intersect" }[step.op] ?? "Boolean";
  }
  const SHORT = { "P.CU": "Box", "P.CY": "Cylinder", "P.SP": "Sphere", "P.CO": "Cone", "P.TO": "Torus",
    F: "Fillet", CH: "Chamfer", E: "Extrude", R: "Revolve", SW: "Sweep", LO: "Loft", SH: "Shell" };
  const long = featureLabel?.(step.type);
  return SHORT[step.type] ?? (long ? long.replace(/ Feature$/i, "") : step.type);
}

// ------------------------------------------------------------ delete a step
//
// deleteStepText(text, link) -> { next, how } or { error }
// The code is the model, so deleting a step is an edit of the call it links to:
//   a wrapper (fillet, chamfer, a transform, ...) is unwrapped: what it wrapped stays;
//   a shape among others in a union / group / difference is taken out of the list;
//   the first shape of a difference (what the rest cut from) and a call that is
//   not inside another (the whole model, a declaration others use) are refused.
const UNWRAP = new Set(["fillet", "chamfer", "shell", "translate", "rotate", "scale", "mirror", "move",
  "colorize", "color", "finish", "glass", "glow"]);
const CUTS = new Set(["difference", "subtract", "cut"]);
export function deleteStepText(text, link) {
  const m = parseCode(text);
  if (!m.ok) return { error: "the code does not parse right now" };
  let c = m.calls.find((x) => x.start === link.start && x.end === link.end) ?? callAt(m, link.start);
  if (!c) return { error: "there is no call there to delete" };
  const stepName = c.name;
  if (UNWRAP.has(c.name)) {
    const inner = c.args[c.args.length - 1];
    if (inner && inner.type !== "ObjectExpression" && inner.type !== "ArrayExpression") {
      return { next: text.slice(0, c.start) + text.slice(inner.start, inner.end) + text.slice(c.end), how: "unwrap", name: c.name };
    }
  }
  // a shape goes with the transforms that only carry it (translate(…, sphere())
  // as a whole), or an empty translate() would be left behind
  const shapeArgs = (k) => k.args.filter((a) => a.type !== "ObjectExpression" && a.type !== "ArrayExpression");
  for (let up = c.parent == null ? null : m.calls[c.parent]; up && UNWRAP.has(up.name) && shapeArgs(up).length === 1; up = up.parent == null ? null : m.calls[up.parent]) c = up;
  const p = c.parent == null ? null : m.calls[c.parent];
  const shapes = p ? shapeArgs(p) : [];
  if (p && shapes.length >= 2) {
    const i = p.args.findIndex((a) => a.start <= c.start && a.end >= c.end);
    if (CUTS.has(p.name) && p.args[i] === shapes[0]) {
      return { error: `it is the shape the ${p.name}() cuts from; delete the ${p.name}() step instead` };
    }
    const a = p.args[i];
    const [s0, s1] = i < p.args.length - 1 ? [a.start, p.args[i + 1].start] : [p.args[i - 1].end, a.end];
    return { next: text.slice(0, s0) + text.slice(s1), how: "remove", name: stepName, from: p.name };
  }
  return { error: "it is not one of several shapes (it is the whole model, or a declaration other steps use); edit it in the code" };
}

// ---------------------------------------------------- the edit history
//
// In Design mode the timeline is what you DID, one step per edit (every move,
// fillet or resize), so going back is a click. Each step is named from the
// difference between the code before and after it: the smallest call that
// holds the whole change says what kind of edit it was.
const VERB = { translate: "Move", move: "Move", rotate: "Rotate", scale: "Scale", resize: "Resize", mirror: "Mirror",
  fillet: "Fillet", chamfer: "Chamfer", shell: "Shell", difference: "Cut", subtract: "Cut", cut: "Cut",
  union: "Join", add: "Join", intersection: "Intersect", intersect: "Intersect", hole: "Hole",
  extrude: "Extrude", revolve: "Revolve", sketch: "Sketch", color: "Colour", colorize: "Colour" };
const NOUN = { cube: "box", cylinder: "cylinder", sphere: "sphere", cone: "cone", torus: "torus" };
const noun = (c) => NOUN[c?.name] ?? c?.name ?? "";
// the shape a wrapper call holds: its last argument that is itself a call
function heldShape(map, c) {
  const inner = map.calls.filter((k) => k.parent != null && map.calls[k.parent] === c);
  return inner.length ? inner[inner.length - 1] : null;
}

export function editLabel(prev, next) {
  if (prev == null) return "Start";
  if (prev === next) return "No change";
  let p = 0;
  const max = Math.min(prev.length, next.length);
  while (p < max && prev[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const [nA, nB] = [p, next.length - s], [oA, oB] = [p, prev.length - s];
  const removed = nB <= nA;
  const text = removed ? prev : next;
  const [a, b] = removed ? [oA, oB] : [nA, nB];
  const map = parseCode(text);
  if (!map.ok) return "Edit code";
  // a named value: the slider for it, or its number typed
  const param = map.params.find((q) => a >= q.valueStart && b <= q.valueEnd);
  if (param) return `Set ${param.name}`;
  // the smallest call holding the whole change
  let c = null;
  for (const k of map.calls) if (k.start <= a && k.end >= b && (!c || k.end - k.start < c.end - c.start)) c = k;
  if (!c) return removed ? "Delete" : "Edit code";
  // a whole call added or taken out: the longer text, less that one call,
  // is the shorter one (spaces and the comma that went with it aside)
  const flat = (t) => t.replace(/\s+/g, "").replace(/,+/g, ",").replace(/\(,/g, "(").replace(/,\)/g, ")").replace(/,\]/g, "]");
  const [long, short] = next.length >= prev.length ? [next, prev] : [prev, next];
  const lmap = long === text ? map : parseCode(long);
  if (lmap.ok) {
    const want = flat(short);
    const whole = lmap.calls.find((k) => flat(long.slice(0, k.start) + long.slice(k.end)) === want);
    if (whole) {
      // outermost wins: translate(…, sphere()) added is "Add sphere", not "Add translate"
      let top = whole;
      for (let up = top.parent == null ? null : lmap.calls[top.parent]; up && flat(long.slice(0, up.start) + long.slice(up.end)) === want; up = up.parent == null ? null : lmap.calls[up.parent]) top = up;
      const shown = VERB[top.name] && heldShape(lmap, top) ? heldShape(lmap, top) : top;
      return `${long === next ? "Add" : "Delete"} ${noun(shown)}`;
    }
  }
  if (VERB[c.name]) {
    const held = /^(Move|Rotate|Scale|Resize|Mirror|Fillet|Chamfer|Shell|Colour)$/.test(VERB[c.name]) ? heldShape(map, c) : null;
    return held ? `${VERB[c.name]} ${noun(held)}` : VERB[c.name];
  }
  return `Change ${noun(c)}`;
}

// renderHistory(el, labels, current, { onPick(i) }): one step per edit, the
// current one lit, the ones after it greyed (still there to step forward to,
// until a new edit replaces them).
export function renderHistory(el, labels, current, { onPick } = {}) {
  el.textContent = "";
  labels.forEach((label, i) => {
    if (i) {
      const tick = document.createElement("span");
      tick.className = "dt-join" + (i > current ? " future" : "");
      el.appendChild(tick);
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dt-step dt-edit" + (i === current ? " on" : i > current ? " future" : "");
    b.dataset.i = String(i);
    b.title = i === current ? `${i + 1}. ${label} (where you are now)`
      : i < current ? `${i + 1}. ${label}: click to go back to here`
      : `${i + 1}. ${label}: undone. Click to bring it back; a new edit replaces it`;
    b.innerHTML = `<span class="dt-n">${i + 1}</span><span class="dt-l">${esc(label)}</span>`;
    b.addEventListener("click", () => onPick?.(i));
    el.appendChild(b);
  });
}

// ------------------------------------------------------------------ the DOM

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const KIND = (s) => (s.type === "B" ? "bool" : /^P\./.test(s.type) ? "prim" : "op");

// renderTimeline(el, steps, { selectedFid, featureLabel, onPick(step) })
export function renderTimeline(el, steps, { selectedFid = null, featureLabel, onPick, onMenu = null, failed = -1 } = {}) {
  el.textContent = "";
  if (!steps.length) {
    el.innerHTML = `<span class="dz-empty">The timeline fills in after a build.</span>`;
    return;
  }
  steps.forEach((s, i) => {
    if (i) {
      const tick = document.createElement("span");
      tick.className = "dt-join";
      el.appendChild(tick);
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = `dt-step dt-${KIND(s)}` + (s.link ? "" : " dead")
      + (selectedFid && s.id === selectedFid ? " on" : selectedFid && s.refs.includes(selectedFid) ? " rel" : "")
      + (failed >= 0 && i === failed ? " fail" : failed >= 0 && i > failed ? " unbuilt" : "");
    b.dataset.id = s.id ?? "";
    const label = stepLabel(s, featureLabel);
    b.title = `${i + 1}. ${label} (${s.id ?? s.type})` + (s.link ? "" : " · no call to jump to")
      + (failed >= 0 && i === failed ? " · FAILED (the kernel's reason is beside the timeline)" : failed >= 0 && i > failed ? " · not built" : "");
    b.innerHTML = `<span class="dt-n">${i + 1}</span><span class="dt-l">${esc(label)}</span>`;
    b.addEventListener("click", () => onPick?.(s));
    b.addEventListener("contextmenu", (e) => { if (!onMenu) return; e.preventDefault(); onMenu(s, i, e); });
    el.appendChild(b);
  });
}
