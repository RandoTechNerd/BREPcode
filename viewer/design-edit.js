// design-edit.js — the text Design mode's handle gestures write.
//
//   numberFieldsFor()   the numbers behind a dot, for the double-click box
//   writeNumbers()      typed values written back at their exact ranges
//   boxCornerText()     Alt-drag on a box corner: all three sizes change and
//                       the OPPOSITE corner stays put
//
// (Alt-drag on a shape or a face dot is a free move: design-move.js
// moveText(), the same writer as every other move.)
//
// All of it edits the call's own numbers, never its structure: a box stays a
// cube([…]) call (no freeform() conversion), and a size that is an expression
// rather than a number simply has no field and no handle.

import { findResizeTarget, findScaleTargets, drillParts } from "./assist.js";
import { moveText } from "./design-move.js";

const AXES = ["x", "y", "z"];
const isBox = (kind) => kind === "cube" || kind === "cuboid";

// numberFieldsFor(text, site, handle) -> [{ label, value, numStart, numEnd }]
// handle is the dot's userData.handle ({ kind, axis, … }).
export function numberFieldsFor(text, site, handle) {
  if (!site || !handle) return [];
  const lit = (start, end, label) => {
    const v = parseFloat(text.slice(start, end));
    return Number.isFinite(v) ? { label, value: v, numStart: start, numEnd: end } : null;
  };
  const fromTarget = (t, label) => (t ? { label: label ?? t.label, value: t.value, numStart: t.numStart, numEnd: t.numEnd } : null);
  let out = [];
  switch (handle.kind) {
    case "face":
      out = [fromTarget(findResizeTarget(text, site, handle.axis))];
      break;
    case "corner":
      if (isBox(site.kind)) {
        out = [0, 1, 2].map((a) => fromTarget(findResizeTarget(text, site, a), AXES[a]));
        // cube(10): one number is every side; show it once
        if (out.every(Boolean) && out[0].numStart === out[1].numStart) out = [{ ...out[0], label: "size" }];
      } else {
        const names = text.slice(site.start, site.end);
        out = findScaleTargets(text, site).map((t) => {
          const key = /(\w+)\s*:\s*$/.exec(names.slice(0, t.numStart - site.start))?.[1] ?? "size";
          return fromTarget(t, key);
        });
      }
      break;
    case "drillDia": case "drillDepth": case "drillAim": {
      const P = drillParts(text, site);
      if (!P) break;
      if (handle.kind === "drillDia" && P.diaSpan) out = [lit(P.diaSpan.start, P.diaSpan.end, P.fromRadius ? "r" : "d")];
      else if (handle.kind === "drillDepth" && P.depthSpan) out = [lit(P.depthSpan.start, P.depthSpan.end, "depth")];
      else if (handle.kind === "drillAim") out = vectorFields(text, P.pointSpan, ["at x", "at y", "at z"]);
      break;
    }
  }
  return out.filter(Boolean);
}

// the three numbers of a "[a, b, c]" span, each with its own range
function vectorFields(text, span, labels) {
  const s = text.slice(span.start, span.end);
  const out = [];
  for (const m of s.matchAll(/-?\d+\.?\d*/g)) {
    out.push({ label: labels[out.length] ?? "", value: parseFloat(m[0]), numStart: span.start + m.index, numEnd: span.start + m.index + m[0].length });
  }
  return out.length === 3 ? out : [];
}

// A typed value, as a number literal or null (rejected).
export function parseTyped(s) {
  const t = String(s).trim();
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

const fmt = (v) => String(Math.round(v * 1000) / 1000);

// writeNumbers(text, [{ numStart, numEnd, value }]) -> new text; each value
// replaces exactly its range, the rest of the line is left as written.
export function writeNumbers(text, edits) {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.numStart - a.numStart)) {
    out = out.slice(0, e.numStart) + fmt(e.value) + out.slice(e.numEnd);
  }
  return out;
}

// boxCornerText(text, site, { signs, delta, centered, min })
//   signs:  which corner was grabbed, per axis: +1 the max side, -1 the min
//   delta:  {x, y, z} the corner moved (world mm)
// -> { next, sizes: [sx, sy, sz], shift: [tx, ty, tz] } or null when a size is
//    not a plain number (or the shape is not a box).
// Each size grows by the corner's move along its axis (shrinks when pulled
// in). The far corner is held by a translate(): a corner-anchored cube grows
// from its min corner, so pulling a MIN-side corner has to move the cube by
// that much; a centred cube grows both ways, so it moves by half, always.
export function boxCornerText(text, site, { signs, delta, centered = false }) {
  if (!site || !isBox(site.kind)) return null;
  const targets = [0, 1, 2].map((a) => findResizeTarget(text, site, a));
  if (!targets.every(Boolean)) return null;
  const d = [delta.x, delta.y, delta.z];
  const round = (v) => Math.round(v * 10) / 10;
  const sizes = targets.map((t, a) => Math.max(round(t.value + d[a] * signs[a]), 0.2));
  const grew = sizes.map((s, a) => s - targets[a].value);      // after clamping
  // to the hundredth: half of a 0.1 mm size step is 0.05
  const shift = grew.map((g, a) => Math.round((centered ? (g / 2) * signs[a] : signs[a] < 0 ? -g : 0) * 100) / 100);

  // the move first (it may add `translate([…], ` in front of the call), then
  // the sizes, with every range at or after the call shifted to match
  const span = { start: site.start, end: site.end };
  const moved = moveText(text, span, { x: shift[0], y: shift[1], z: shift[2] }, { step: 0.01 });
  const off = moved.start - span.start;
  const at = (n) => (n >= span.start ? n + off : n);
  // cube(10) (no size vector at all), as against cube([w, w, 8]) whose x and y
  // are one shared name
  const scalar = !/\[/.test(text.slice(site.start, site.end));
  if (!scalar) {
    // one number behind two sides must get one value, or it cannot be written
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
      if (targets[a].numStart === targets[b].numStart && sizes[a] !== sizes[b]) return null;
    }
  }
  const edits = scalar
    // cube(10) cannot hold three sizes in one number: it becomes cube([x, y, z])
    ? [{ numStart: at(targets[0].numStart), numEnd: at(targets[0].numEnd), raw: `[${sizes.map(fmt).join(", ")}]` }]
    // only the sizes that changed: an untouched "8.0" stays "8.0"
    : targets.map((t, a) => ({ numStart: at(t.numStart), numEnd: at(t.numEnd), value: sizes[a] }))
      .filter((e, a, all) => grew[a] !== 0 && all.findIndex((x) => x.numStart === e.numStart) === a);
  if (!grew.some((g) => g !== 0)) return { next: text, sizes, shift, labels: targets.map((t) => t.label) };
  let next = moved.next;
  for (const e of [...edits].sort((a, b) => b.numStart - a.numStart)) {
    next = next.slice(0, e.numStart) + (e.raw ?? fmt(e.value)) + next.slice(e.numEnd);
  }
  return { next, sizes, shift, labels: targets.map((t) => t.label) };
}
