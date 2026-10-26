// selection-context.js — "Ask about this…": where on the model the user is
// pointing, as one object every AI path reads.
//
// Right-click the model → Ask about this… pins a marker at the clicked point
// and the next chat message carries this object: the built-in assistant, a
// connected AI (the prompt text from describeSelectionContext) and an agent
// over MCP (get_state.selection, from forAgent) all see the same thing.
//
// No DOM and no kernel. The viewer fills it from the pick (face, point,
// normal, edges) and the last build's map (the call that made the face, the
// body it belongs to); everything here reads and writes code text.
//
// The object is versioned and open-ended on purpose. Today it is a point on a
// face. The slots below are for what comes later and are null until then:
//   sketchPlane  { origin, normal, x }   a plane to draw on (a sketch, a scan's ground)
//   reference    { kind: "photo", name, src, mmPerPx, plane, corners }  a
//                reference photo (on a mat of known size) placed in the scene
//   scan         { kind: "phone", name, points | mesh, scale }  a phone scan
// A consumer that does not know a slot ignores it; describeSelectionContext
// says what it can about each one that is set.

import { addTool, holeCall, edgeOpText, bodySpan, round, vec } from "./design/features.js";

export const SELECTION_CONTEXT_VERSION = 1;

// makeSelectionContext({ ... }) -> the context. `text` is the editor text the
// spans were read against; `feature` and `body` are { start, end } in it.
export function makeSelectionContext({
  mode = "code", text = "", point, normal = null, face = null, solid = null,
  edges = [], fid = null, feature = null, body = null, sketchPlane = null,
  reference = null, scan = null,
} = {}) {
  const lineOf = (pos) => text.slice(0, pos).split("\n").length;
  // the name is read off the text itself: it is what the AI and the chip
  // will be shown, so it must be the word at the start of that code
  const spanOut = (s) => (!s ? null : {
    start: s.start, end: s.end, name: /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(text.slice(s.start, s.end))?.[1] ?? s.name ?? s.kind ?? null,
    line: lineOf(s.start), code: text.slice(s.start, s.end),
  });
  return {
    version: SELECTION_CONTEXT_VERSION,
    kind: "point",
    mode,
    point: point ? point.map((v) => round(v, 100)) : null,
    normal: normal ? unit(normal).map((v) => round(v, 10000)) : null,
    face, solid,
    edges: edges.map((e) => (typeof e === "string" ? e : e.name)).filter(Boolean),
    fid,
    feature: spanOut(feature),
    body: spanOut(body),
    sketchPlane, reference, scan,
  };
}

function unit(v) {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}

// The face's direction in words, for a person and for a model: "top" beats
// [0, 0, 1] in a sentence, and the vector still goes alongside.
export function facing(n) {
  if (!n) return null;
  const KEYS = [["top", [0, 0, 1]], ["bottom", [0, 0, -1]], ["+X side", [1, 0, 0]], ["-X side", [-1, 0, 0]],
    ["back (+Y)", [0, 1, 0]], ["front (-Y)", [0, -1, 0]]];
  const k = KEYS.find(([, v]) => v[0] * n[0] + v[1] * n[1] + v[2] * n[2] > 0.985);
  return k ? k[0] : "slanted";
}

// relocate(ctx, text) -> ctx with its spans moved to where their code now is
// in `text`, or marked stale. The user may type, or an earlier reply may have
// edited the code, between pinning and sending: a span read against old text
// would point the AI at the wrong call.
export function relocate(ctx, text) {
  if (!ctx) return ctx;
  const fix = (s) => {
    if (!s) return s;
    if (text.slice(s.start, s.end) === s.code) return { ...s, stale: false };
    const at = text.indexOf(s.code);
    if (at < 0 || text.indexOf(s.code, at + 1) >= 0) return { ...s, stale: true };
    return { ...s, start: at, end: at + s.code.length, line: text.slice(0, at).split("\n").length, stale: false };
  };
  const feature = fix(ctx.feature);
  let body = fix(ctx.body);
  // the body itself was edited (a hole joined its difference, a fillet
  // wrapped it): find it again by climbing out from the call, which is
  // still there word for word
  if (body?.stale && feature && !feature.stale) {
    const b = bodySpan(text, "f", { sites: { f: feature } });
    if (b) body = { start: b.start, end: b.end, name: b.name, line: text.slice(0, b.start).split("\n").length, code: text.slice(b.start, b.end), stale: false };
  }
  return { ...ctx, feature, body };
}

const clip = (s, n = 600) => (s.length > n ? `${s.slice(0, n)}…` : s);

// describeSelectionContext(ctx) -> the text a connected AI gets with the
// message: what was pointed at, and how an edit there is written.
export function describeSelectionContext(ctx) {
  if (!ctx) return "";
  const L = [];
  L.push(`THE USER IS POINTING AT A SPOT ON THE MODEL (they right-clicked it and chose "Ask about this"). "Here", "this", "this face" in their message mean this spot:`);
  if (ctx.point) L.push(`- point: ${vec(ctx.point, 100)} mm (world, Z up)`);
  if (ctx.normal) L.push(`- surface normal there: ${vec(ctx.normal, 10000)} (pointing out of the part; the ${facing(ctx.normal)} face)`);
  if (ctx.face) L.push(`- face: ${ctx.face}`);
  if (ctx.edges.length) L.push(`- edges around that face, by the names fillet()/chamfer() take: ${ctx.edges.map((e) => JSON.stringify(e)).join(", ")}`);
  if (ctx.feature) {
    L.push(`- made by the call on line ${ctx.feature.line}${ctx.feature.stale ? " (the code has changed since; find it by its text)" : ""}:`);
    L.push("  ```\n  " + clip(ctx.feature.code).replace(/\n/g, "\n  ") + "\n  ```");
  }
  if (ctx.body && !(ctx.feature && ctx.body.start === ctx.feature.start && ctx.body.end === ctx.feature.end)) {
    L.push(`- which is part of the body that starts on line ${ctx.body.line} (its outermost call, \`${ctx.body.name}(\`…)`);
  }
  if (ctx.sketchPlane) L.push(`- sketch plane: origin ${vec(ctx.sketchPlane.origin)}, normal ${vec(ctx.sketchPlane.normal, 10000)}`);
  if (ctx.reference) {
    const r = ctx.reference;
    L.push(`- reference ${r.kind || "photo"}${r.name ? ` "${r.name}"` : ""}${r.mmPerPx ? `, scale ${r.mmPerPx} mm per pixel` : ""}${r.plane ? `, lying on the plane through ${vec(r.plane.origin)}` : ""}`);
  }
  if (ctx.scan) L.push(`- ${ctx.scan.kind || "phone"} scan${ctx.scan.name ? ` "${ctx.scan.name}"` : ""}${ctx.scan.scale ? `, scale ${ctx.scan.scale}` : ""}`);
  L.push(`Edit THAT call or its body, not the whole model. A feature on the body goes around or into the body's outermost call:`
    + ` a hole here is drill(${vec(ctx.point || [0, 0, 0], 100)}, ${vec(ctx.normal || [0, 0, 1], 10000)}, { d, depth | through: true })`
    + ` added as one more argument of the body's difference(…) (or wrap the body in difference(body, drill(…)) when it is not one);`
    + ` rounding this face's edges is fillet({ r, edges: [names above] }, body). Keep every other line as it is.`);
  return L.join("\n");
}

// forAgent(ctx) -> the plain JSON an agent sees in get_state.selection.
export function forAgent(ctx) {
  if (!ctx) return null;
  const s = (x) => (x ? { line: x.line, start: x.start, end: x.end, name: x.name, code: clip(x.code, 2000), stale: !!x.stale } : null);
  return {
    version: ctx.version, kind: ctx.kind, mode: ctx.mode,
    point: ctx.point, normal: ctx.normal, facing: facing(ctx.normal),
    face: ctx.face, solid: ctx.solid, edges: ctx.edges, featureId: ctx.fid,
    call: s(ctx.feature), body: s(ctx.body),
    sketchPlane: ctx.sketchPlane, reference: ctx.reference, scan: ctx.scan,
    howToEdit: "drill(point, normal, { d, depth | through: true }) added to the body's difference(); fillet({ r, edges }, body) for this face's edges",
  };
}

// The short label on the chat chip and the marker's title.
export function selectionLabel(ctx) {
  if (!ctx) return "";
  const what = ctx.feature?.name || "the model";
  const side = facing(ctx.normal);
  return `${side && side !== "slanted" ? `${side} face of ` : ""}${what}${ctx.feature ? `, line ${ctx.feature.line}` : ""}`;
}

// ------------------------------------------------- the built-in assistant
// What it can do with a pinned spot without an AI: a hole there, or rounding
// / bevelling the face's edges. Anything else goes to an AI (or gets the
// "connect an AI" answer), with the context.

const NUM = String.raw`(\d+(?:\.\d+)?)`;
export function parseHoleRequest(t) {
  let s = t.toLowerCase();
  if (!/\b(hole|holes|drill|bore)\b/.test(s)) return null;
  // the depth first, and out of the way, so "5 mm hole 8 mm deep" is d 5
  const deep = new RegExp(String.raw`${NUM}\s*(?:mm\s*)?deep|depth\s*(?:of\s*)?${NUM}`).exec(s);
  if (deep) s = s.replace(deep[0], " ");
  let d = null;
  const m = /\bm(\d+(?:\.\d+)?)\b/.exec(s);          // M3: a clearance hole for that screw
  const rad = new RegExp(String.raw`radius\s*(?:of\s*)?${NUM}|${NUM}\s*(?:mm\s*)?radius`).exec(s);
  const num = new RegExp(String.raw`${NUM}\s*(?:mm)?`).exec(s);
  if (m) d = round(+m[1] * 1.1, 10);
  else if (rad) d = 2 * +(rad[1] ?? rad[2]);
  else if (num) d = +num[1];
  d = d || 5;
  const kind = /counter ?bore|c-?bore/.test(s) ? "counterbore" : /counter ?sink|c-?sink/.test(s) ? "countersink" : "simple";
  return {
    d, through: !deep && !/\bblind\b/.test(s), depth: deep ? +(deep[1] ?? deep[2]) : 10,
    kind, cbD: round(d * 1.8, 10), cbDepth: 3, csD: round(d * 2, 10),
  };
}

export function parseEdgeRequest(t) {
  const s = t.toLowerCase();
  const kind = /\b(fillet|round(?:ed)?|soften)\b/.test(s) ? "fillet" : /\b(chamfer|bevel)/.test(s) ? "chamfer" : null;
  if (!kind || !/\bedge|corner|this|here|face\b/.test(s)) return null;
  const n = new RegExp(String.raw`${NUM}\s*(?:mm)?`).exec(s);
  return { kind, amount: n ? +n[1] : kind === "fillet" ? 2 : 1 };
}

// selectionEdit(ctx, text, code) -> { code, reply, start, end } or null.
// The reply edits the body the spot belongs to, never the whole model.
export function selectionEdit(ctx, message, code) {
  if (!ctx?.point) return null;
  const c = relocate(ctx, code);
  const body = c.body && !c.body.stale ? c.body : null;
  const hole = parseHoleRequest(message);
  if (hole) {
    if (!body) return { reply: "I can't find the call that made that spot in the code any more. Right-click it again and ask." };
    if (!c.normal) return null;
    const point = c.point.map((v) => Math.round(v * 10) / 10);
    const call = holeCall({ ...hole, point, normal: c.normal });
    const r = addTool(code, body, call);
    const what = hole.kind === "counterbore" ? "counterbored " : hole.kind === "countersink" ? "countersunk " : "";
    return {
      code: r.next, start: r.start, end: r.end, call,
      reply: `Added a ${round(hole.d)} mm ${what}${hole.through ? "through " : `${round(hole.depth)} mm deep `}hole at ${vec(point)} on the ${facing(c.normal)} face: \`${call}\`, in the ${body.name}() on line ${body.line}.`,
    };
  }
  const edge = parseEdgeRequest(message);
  if (edge && c.edges.length) {
    if (!body) return { reply: "I can't find the call that made that spot in the code any more. Right-click it again and ask." };
    const r = edgeOpText(code, body, { kind: edge.kind, amount: edge.amount, edges: c.edges });
    return {
      code: r.next, start: r.start, end: r.end,
      reply: `${edge.kind === "fillet" ? "Rounded" : "Bevelled"} the ${c.edges.length} edge${c.edges.length > 1 ? "s" : ""} around that face by ${round(edge.amount)} mm.`,
    };
  }
  return null;
}

// What the built-in assistant says about a pinned spot it cannot edit itself.
export function anchorHelp(ctx) {
  const where = selectionLabel(ctx);
  const edges = ctx.edges.length ? ` Its edges: ${ctx.edges.slice(0, 6).join(", ")}${ctx.edges.length > 6 ? "…" : ""}.` : "";
  return `That spot is the ${where}, at ${vec(ctx.point || [0, 0, 0])}.${edges} Without an AI connected I can put a hole there`
    + ` ("a 5 mm hole here", "M3 hole 8 mm deep") or round / bevel that face's edges ("round these edges 2 mm").`
    + ` For anything else, connect an AI in ⚙: it gets this spot with your message.`;
}

export { vec };
