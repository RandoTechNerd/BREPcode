// Splitting a model into printable parts, and putting it back together.
//
// A one-piece model is often unprintable — a colour that needs its own
// filament, an overhang that wants no supports, a part taller than the bed. The
// answer is to cut it up, print the pieces separately, and register them to
// each other when they go back together. Slicers have a "cut" tool for the
// first half of that; the second half, the ALIGNMENT, is what they leave you to
// solve, and it is the half that decides whether the seam disappears or shows.
//
// So the useful thing here is not a cutting function — a plane and a
// difference() already cut anything. It is the joinery: dowel holes that land
// in the SAME place on both faces because they were computed once, and pockets
// sized so a printed part actually drops into them.
//
// FITS ARE ON DIAMETER, like every supplier, recipe and person states them.
// Halving that by accident is a dowel you cannot press in; doubling it is one
// that falls out. This bit me in src/parts.js and it is written down here so it
// does not have to bite twice.

// Same circular-import note as src/parts.js: dsl.js re-exports this module, and
// that is safe because nothing here CALLS a dsl function while the modules are
// still evaluating — every call happens later, when a user's model runs.
import { cylinder, cone, translate, rotate, union, group, clearance, layout } from "./dsl.js";

const num = (v, name, fallback) => {
  if (v === undefined && fallback !== undefined) return fallback;
  const n = +v;
  if (!Number.isFinite(n)) throw new Error(`joinery: ${name} must be a number, got ${v}`);
  return n;
};

// Allowances ON DIAMETER, for FDM. A printed hole comes out undersize by
// roughly a nozzle's squeeze, so the hole is cut oversize to compensate.
export const JOIN_FIT = {
  // A dowel you tap in and it stays: for a printed pin in a printed hole.
  snug: 0.15,
  // Slides together by hand, comes apart again — for dry-fitting, or a part
  // that has to be removable.
  slip: 0.35,
  // Glued. The gap IS the glue line; too tight and the glue is scraped off on
  // the way in, which is the usual reason a glued joint fails.
  glue: 0.30,
  // A 3mm steel pin or a cut-down filament offcut.
  steel: 0.10,
};

// ---------------------------------------------------------------- dowels
//
// The pin itself. Chamfered at both ends, because a printed pin has an elephant
// foot on the first layer and a lip on the last, and either will stop it
// entering a hole cut to size.
export function dowelPin(opts = {}) {
  const d = num(opts.d ?? opts.diameter, "d", 4);
  const len = num(opts.len ?? opts.length ?? opts.h, "len", 12);
  const ch = num(opts.chamfer, "chamfer", Math.min(0.8, d / 5));
  const $fn = opts.$fn ?? 32;
  if (d <= 0 || len <= 0) throw new Error("joinery: a dowel needs a positive diameter and length");
  if (ch * 2 >= len) throw new Error(`joinery: ${ch}mm chamfers do not fit in a ${len}mm pin`);
  return union(
    cone({ r1: d / 2 - ch, r2: d / 2, h: ch, $fn }),
    translate([0, 0, ch], cylinder({ r: d / 2, h: len - 2 * ch, $fn })),
    translate([0, 0, len - ch], cone({ r1: d / 2, r2: d / 2 - ch, h: ch, $fn })),
  );
}

// The hole for it. A NEGATIVE — subtract it. Runs from z=0 up, and pokes 0.5
// below so the boolean has no coincident face to argue about.
export function dowelHole(opts = {}) {
  const d = num(opts.d ?? opts.diameter, "d", 4);
  const depth = num(opts.depth, "depth", 8);
  const fit = typeof opts.fit === "string"
    ? (JOIN_FIT[opts.fit] ?? (() => { throw new Error(`joinery: no such fit "${opts.fit}" — try ${Object.keys(JOIN_FIT).join(", ")}`); })())
    : num(opts.fit, "fit", JOIN_FIT.snug);
  const $fn = opts.$fn ?? 32;
  // A little cone at the mouth so the pin finds the hole instead of catching
  // on the rim — the difference between a part that assembles and one you
  // fight with.
  // lead: 0 turns it off — a zero-height cone is not a solid, and asking the
  // kernel to union one in fails the whole build with "Not manifold", which is
  // a long way from the "no chamfer please" the caller meant.
  const lead = Math.max(0, num(opts.lead, "lead", 0.6));
  const r = (d + fit) / 2;
  const bore = translate([0, 0, -0.5], cylinder({ r, h: depth + 0.5, $fn }));
  if (!lead) return bore;
  return union(bore, translate([0, 0, -0.01], cone({ r1: r + lead, r2: r, h: lead, $fn })));
}

// ------------------------------------------------------- holes on a face
//
// THE POINT OF THIS FILE. Both halves of a split get their holes from ONE call,
// so they cannot drift apart. Hand-placing them twice is how a seam ends up
// 0.4mm out with nothing to show why.
//
// `plane` describes the cut the way the rest of the DSL does: a point it passes
// through and a tilt about Y in degrees, matching rotate([0, -ang, 0]).
// `at` is a list of positions ALONG the face, measured from that point: [u, v]
// where u runs down the face's slope and v across it.
export function dowelsOnPlane(opts = {}) {
  const p = opts.p ?? opts.point ?? [0, 0, 0];
  const ang = num(opts.ang ?? opts.angle, "ang", 0);
  const at = Array.isArray(opts.at) ? opts.at : [[0, 0]];
  const d = num(opts.d ?? opts.diameter, "d", 4);
  const depth = num(opts.depth, "depth", 8);
  const fit = opts.fit ?? "snug";
  const $fn = opts.$fn ?? 32;
  if (!at.length) throw new Error("joinery: dowelsOnPlane needs at least one position");

  // BORED BOTH WAYS by default, because a split face has a part on each side
  // and both need the hole. Subtract this ONE solid from both halves and the
  // two bores are the same bore — which is the entire reason this function
  // exists instead of two calls.
  const both = opts.both !== false;
  const one = ([u, v]) => translate([u, v, 0], union(
    dowelHole({ d, depth, fit, $fn }),
    ...(both ? [rotate([180, 0, 0], dowelHole({ d, depth, fit, $fn }))] : []),
  ));
  return translate(p, rotate([0, -ang, 0], union(...at.map(one))));
}

// The matching pins, from the SAME arguments — pass the identical `at` list and
// they cannot land anywhere else. Printed lying down (they are stronger across
// the layers that way), so they come out flat rather than standing on the face.
export function dowelPinsFor(opts = {}) {
  const at = Array.isArray(opts.at) ? opts.at : [[0, 0]];
  const d = num(opts.d ?? opts.diameter, "d", 4);
  // A pin spans BOTH holes, less a little so it bottoms out on neither.
  const depth = num(opts.depth, "depth", 8);
  // Spans both bores, less a millimetre so it bottoms out in neither and the
  // two faces close on each other rather than on the pin.
  const len = num(opts.len, "len", depth * 2 - 1);
  const gap = num(opts.gap, "gap", d * 2.2);
  return group(...at.map((_, i) =>
    translate([i * gap, 0, 0], dowelPin({ d, len, $fn: opts.$fn ?? 32 }))));
}

// ------------------------------------------------------------- glue-in
//
// A pocket for a separately printed part to drop into and be glued. The pocket
// is the part's own shape with the glue gap round it — so it fits whatever the
// shape is, including something organic that no primitive describes.
//
// The gap is applied by MEASURING the part and scaling it about its own centre
// (see clearance() in dsl.js), which is exact for a box, a cylinder or a sphere
// and cheap for anything. It is not a true offset, and on a strongly non-convex
// part the clearance comes out uneven; there, cut the pocket from the same
// primitives the part was built from. For a piece BUILT by intersecting
// something with a surface — an inlay, an eye, a badge — rebuilding it with the
// ellipsoid a fraction larger is both exact and cheaper. Say which one you did.
export function glueSocket(part, opts = {}) {
  const gap = num(opts.gap, "gap", JOIN_FIT.glue);
  const depth = num(opts.depth, "depth", 0);
  if (!part?.__brepscript) {
    throw new TypeError("joinery: glueSocket(part, …) takes a shape — the part that will drop in");
  }
  // The part with the gap all round it — clearance() measures the part and
  // scales it about its own centre, so the gap is ON DIAMETER like every other
  // fit here. Exact for a box, a cylinder or a sphere; see clearance() for what
  // it does to an L-shape, and prefer the part's own primitives there.
  const grown = clearance(gap, part);
  return depth ? union(grown, translate([0, 0, -depth], grown)) : grown;
}

// --------------------------------------------------------------- layout
//
// Parts laid out on the bed, side by side, each standing on z=0. The mesh
// exporter already does this for a finished model; this is for laying out the
// pieces WHILE modelling, so what you see is what will print.
export function onPlate(parts, opts = {}) {
  const list = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
  const gap = num(opts.gap, "gap", 6);
  const per = num(opts.spacing ?? opts.pitch, "spacing", 0);
  if (!list.length) throw new Error("joinery: onPlate needs at least one part");
  // By default each part is MEASURED and butted up against the last with `gap`
  // between them, so nothing overlaps and no bed is wasted. A fixed pitch is
  // wrong in both directions at once: too small and two parts fight over the
  // same square of bed, too large and a plate that would have held six holds
  // three — which on a 3D print is hours. Pass spacing: to force one anyway.
  if (per) return group(...list.map((p, i) => translate([i * per, 0, 0], p)));
  return layout(list, { gap, onBed: opts.onBed !== false });
}

export const JOINERY = [
  { id: "dowelPin", label: "Dowel pin", blurb: "a printable pin, chamfered both ends so it enters" },
  { id: "dowelHole", label: "Dowel hole", blurb: "CUT — the hole for one, with a lead-in mouth" },
  { id: "dowelsOnPlane", label: "Dowels on a split face", blurb: "CUT — both halves' holes from one call, so they cannot drift" },
  { id: "glueSocket", label: "Glue-in socket", blurb: "CUT — a pocket shaped like the part that drops into it" },
  { id: "onPlate", label: "Lay parts out", blurb: "side by side on the bed, ready to print" },
];
