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

// ------------------------------------------------------------------ the DOM

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const KIND = (s) => (s.type === "B" ? "bool" : /^P\./.test(s.type) ? "prim" : "op");

// renderTimeline(el, steps, { selectedFid, featureLabel, onPick(step) })
export function renderTimeline(el, steps, { selectedFid = null, featureLabel, onPick, failed = -1 } = {}) {
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
    el.appendChild(b);
  });
}
