// design-tree.js — Design mode's model browser: the code as a tree of calls.
//
// One row per modelling call in the editor text (cube, translate, difference,
// fillet …), nested the way the code nests them, each holding the feature ids
// its shapes built (featureMap / brepscript.featureSites(), which places each
// feature at its exact call). Nothing here runs the model: the tree is the
// parse plus the last build's map, so it is the same on every kernel.
//
// Groups, top to bottom: the model itself (the returned expression and any
// loose calls), then every helper function and every variable that holds a
// shape. A call in a helper or a variable is ONE row however many times it is
// used; its features form a pattern group and the row says "×n".

import { parseCode } from "../src/codemap.js";

// What a call is, for its icon and for which row a click on it selects.
const BOOLEANS = new Set(["union", "difference", "intersection", "subtract", "add", "cut", "intersect", "hull", "minkowski"]);
const TRANSFORMS = new Set(["translate", "rotate", "scale", "mirror", "move", "colorize", "color", "finish", "glass", "glow", "multmatrix", "resize"]);
export function callCategory(name, hasOwnFeature) {
  if (hasOwnFeature) return "shape";
  if (BOOLEANS.has(name)) return "boolean";
  if (TRANSFORMS.has(name)) return "transform";
  return "op";             // fillet, chamfer, shell, extrude… anything else
}

const looksLikeFunction = (text) =>
  /^\s*(async\s+)?(function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(text);

// buildTree(src, sites, words) -> { ok, error, groups: [{ key, label, kind, rows }] }
//   src:   the editor text
//   sites: featureId -> { start, end, kind, name?, pattern? } (featureMap), or null
//   words: Set of the vocabulary's call names (the viewer's vocabWords)
// Each row: { key, name, start, end, depth, category, fids, ownFids, label,
//             userName, pattern: {count} | null, args, helper? }
// fids are every feature the row's range holds; ownFids the ones built by
// this exact call.
export function buildTree(src, sites, words) {
  const map = parseCode(src);
  if (!map.ok) return { ok: false, error: map.error, groups: [] };
  const entries = Object.entries(sites || {});

  // top-level declarations: helpers (function values) and shape variables
  const decls = map.params.map((p) => ({
    name: p.name, start: p.valueStart, end: p.valueEnd,
    fn: looksLikeFunction(src.slice(p.valueStart, p.valueEnd)),
  }));
  const declOf = (c) => decls.find((d) => c.start >= d.start && c.end <= d.end) ?? null;
  const helperNames = new Set(decls.filter((d) => d.fn).map((d) => d.name));
  for (const c of map.calls) if (c.fn && c.fn !== "(anonymous)") helperNames.add(c.fn);

  const keep = (c) => !c.member && (words?.has(c.name) || helperNames.has(c.name));
  const kept = new Map();             // call index -> row
  const groups = new Map();
  const groupFor = (key, label, kind) => {
    if (!groups.has(key)) groups.set(key, { key, label, kind, rows: [] });
    return groups.get(key);
  };

  map.calls.forEach((c, i) => {
    if (!keep(c)) return;
    // the nearest kept ancestor is the row's parent in the tree
    let p = c.parent;
    while (p != null && !kept.has(p)) p = map.calls[p].parent;
    const parentRow = p == null ? null : kept.get(p);
    const d = declOf(c);
    const fnName = c.fn && c.fn !== "(anonymous)" ? c.fn : null;
    const group = parentRow ? parentRow.group
      : d ? (d.fn ? `fn:${d.name}` : `var:${d.name}`)
      : fnName ? `fn:${fnName}`
      : "model";
    const ownFids = entries.filter(([, s]) => s.start === c.start && s.end === c.end).map(([id]) => id);
    const fids = entries.filter(([, s]) => s.start >= c.start && s.end <= c.end)
      .sort((a, b) => a[1].start - b[1].start).map(([id]) => id);
    const first = ownFids.length ? sites[ownFids[0]] : null;
    const isHelperCall = helperNames.has(c.name) && !words?.has(c.name);
    const row = {
      key: `${c.start}:${c.end}`,
      name: c.name, start: c.start, end: c.end,
      depth: parentRow ? parentRow.depth + 1 : 0,
      category: isHelperCall ? "helper" : callCategory(c.name, ownFids.length > 0),
      fids, ownFids,
      userName: first?.name ?? null,
      pattern: first?.pattern ? { count: first.pattern.count } : null,
      args: argSummary(src, c),
      group,
      helper: isHelperCall ? c.name : null,
    };
    kept.set(i, row);
    const g = group === "model" ? groupFor("model", "Model", "model")
      : group.startsWith("fn:") ? groupFor(group, `${group.slice(3)}()`, "helper")
      : groupFor(group, group.slice(4), "variable");
    g.rows.push(row);
  });

  // a helper call row selects what the helper builds
  for (const g of groups.values()) {
    for (const r of g.rows) {
      if (!r.helper || r.fids.length) continue;
      const def = groups.get(`fn:${r.helper}`);
      if (def) r.fids = [...new Set(def.rows.flatMap((x) => x.fids))];
    }
  }
  // …and so does every row around a helper call: the union holding peg(10)
  // holds the peg too, ordered by where each sits in the text
  for (const g of groups.values()) {
    const calls = g.rows.filter((r) => r.helper && r.fids.length);
    if (!calls.length) continue;
    for (const r of g.rows) {
      if (r.helper) continue;
      const inside = calls.filter((h) => h.start >= r.start && h.end <= r.end);
      if (!inside.length) continue;
      const at = new Map(r.fids.map((id) => [id, sites[id].start]));
      for (const h of inside) for (const id of h.fids) if (!at.has(id)) at.set(id, h.start);
      r.fids = [...at.keys()].sort((a, b) => at.get(a) - at.get(b));
    }
  }
  // the model first, then helpers and variables in source order
  const order = [...groups.values()].sort((a, b) =>
    (a.kind === "model" ? -1 : 0) - (b.kind === "model" ? -1 : 0)
    || (a.rows[0]?.start ?? 0) - (b.rows[0]?.start ?? 0));
  return { ok: true, error: null, groups: order };
}

// The call's arguments in a few characters: cube([20, 10, 5]) -> "[20, 10, 5]".
// Shape arguments (nested calls) are left out; the tree shows those as rows.
function argSummary(src, c) {
  const parts = [];
  for (const a of c.args) {
    if (a.type === "CallExpression") continue;
    parts.push(src.slice(a.start, a.end).replace(/\s+/g, " "));
  }
  const s = parts.join(", ");
  return s.length > 34 ? s.slice(0, 33) + "…" : s;
}

// The feature a click on a row selects: the row's own shape, else the first
// shape inside it (for a boolean that is its main shape, and a move of that
// moves the whole boolean, the same as grabbing it on the model).
export function primaryFid(row) {
  return row.ownFids[0] ?? row.fids[0] ?? null;
}

// The row to mark for a selected feature: the innermost call that built it.
export function rowForFid(tree, fid) {
  let best = null;
  for (const g of tree.groups) {
    for (const r of g.rows) {
      if (r.ownFids.includes(fid)) return r;
      if (r.fids.includes(fid) && (!best || r.end - r.start < best.end - best.start)) best = r;
    }
  }
  return best;
}

// ------------------------------------------------------------------ the DOM

const ICONS = {
  shape: `<path d="M3 5.5 8 3l5 2.5v5L8 13l-5-2.5z"/><path d="M3 5.5 8 8l5-2.5M8 8v5"/>`,
  boolean: `<circle cx="6" cy="8" r="3.6"/><circle cx="10" cy="8" r="3.6"/>`,
  transform: `<path d="M8 2v12M2 8h12M8 2 6.3 3.7M8 2l1.7 1.7M14 8l-1.7-1.7M14 8l-1.7 1.7"/>`,
  op: `<path d="M3 13V7a4 4 0 0 1 4-4h6"/><path d="M3 13h10"/>`,
  helper: `<path d="M5 3H4a1 1 0 0 0-1 1v3l-1 1 1 1v3a1 1 0 0 0 1 1h1M11 3h1a1 1 0 0 1 1 1v3l1 1-1 1v3a1 1 0 0 1-1 1h-1"/>`,
};
const svgIcon = (cat) => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICONS[cat] ?? ICONS.op}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

// renderTree(el, tree, { selectedFid, stale, onPick(row) })
export function renderTree(el, tree, { selectedFid = null, stale = false, onPick } = {}) {
  el.textContent = "";
  if (!tree.ok) {
    el.innerHTML = `<div class="dz-empty">The code does not parse as BREPcode JavaScript, so there is no tree to show.`
      + ` <small>OpenSCAD, JSCAD and Python models build fine; their browser comes later.</small></div>`;
    return;
  }
  if (!tree.groups.length) {
    el.innerHTML = `<div class="dz-empty">No shapes yet. Type one in the code, or ask the chat.</div>`;
    return;
  }
  const sel = selectedFid ? rowForFid(tree, selectedFid) : null;
  for (const g of tree.groups) {
    const head = document.createElement("div");
    head.className = "dz-group";
    head.innerHTML = g.kind === "model" ? "Model"
      : `${esc(g.label)} <small>${g.kind === "helper" ? "helper" : "variable"}</small>`;
    el.appendChild(head);
    for (const r of g.rows) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `dz-row dz-${r.category}`;
      b.style.setProperty("--depth", r.depth);
      b.dataset.key = r.key;
      if (r.fids.length) b.dataset.fids = r.fids.join(" ");
      const on = sel && sel.key === r.key;
      const holds = !on && selectedFid && r.fids.includes(selectedFid);
      if (on) b.classList.add("on");
      if (holds) b.classList.add("holds");
      if (!r.fids.length || stale) b.classList.add("dead");
      b.title = stale ? "Building… the tree links up when the build lands"
        : r.fids.length ? `Select ${r.name}(…) (${r.fids.length} shape${r.fids.length === 1 ? "" : "s"})`
        : `${r.name}(…) built nothing the map could place`;
      b.innerHTML = `<span class="dz-ico">${svgIcon(r.category)}</span>`
        + `<span class="dz-name">${esc(r.name)}</span>`
        + (r.userName ? `<span class="dz-id">${esc(r.userName)}</span>` : "")
        + (r.pattern ? `<span class="dz-pat" title="${r.pattern.count} shapes come from this one call">×${r.pattern.count}</span>` : "")
        + (r.args ? `<span class="dz-args">${esc(r.args)}</span>` : "");
      b.addEventListener("click", () => onPick?.(r));
      el.appendChild(b);
    }
  }
}
