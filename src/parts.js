// Standard hardware, as callable parts.
//
// Everything here used to be re-derived from prose on every request. "A bracket
// with an M3 clearance hole" meant the model recalling whether that is 3.2 or
// 3.4, and a 608 bearing seat meant recalling 22 x 7 — sometimes right, and
// wrong in a way nothing catches until the print does not fit. The numbers are
// not hard, they are just numerous, and re-deriving them is the single largest
// source of parts that are almost right.
//
// So they live here once, as data, with functions that turn them into geometry.
// A model that writes `bearingPocket("608")` cannot get the bore wrong.
//
// TWO SHAPES PER FASTENER, and the distinction matters more than anything else
// in this file: the PART (what you buy) and the POCKET (the hole you cut for
// it). They are never the same size. A pocket carries a fit allowance; a part
// carries none, because it is there to be looked at and measured against.
//
// Sources are the ordinary metric standards — ISO 273 for clearance holes,
// DIN 912 / ISO 7380 / ISO 10642 for heads, DIN 934 for nuts, ISO 15 for deep
// groove bearings. Insert sizes follow the common brass heat-set range
// (Ruthex and equivalents), which is what people actually buy.
//
// Circular import note: this module imports from dsl.js and dsl.js re-exports
// this one. That is safe because nothing here CALLS a dsl function while the
// modules are still evaluating — every call happens later, when a user's model
// runs, by which time both are complete and ESM's live bindings resolve.

import { cube, cylinder, translate, rotate, difference, union, group } from "./dsl.js";

// ----------------------------------------------------------------- fit
//
// One place for the allowances, because they are opinions rather than
// standards and someone will want to move them. These are FDM numbers: a
// printed hole comes out undersize by roughly a nozzle's squeeze, so a pocket
// is cut oversize to compensate.
// ON DIAMETER, not per side. That is how every supplier, every recipe and
// every person states a fit — "plus a tenth" means the hole is 0.1 bigger
// across, not 0.2. Halving it here by accident is a bearing you cannot press
// in; doubling it is one that spins in its seat and chews the plastic out.
export const FIT = {
  bearingPress: 0.1,   // push in with a clamp, holds with no glue
  bearingSlip: 0.3,    // turns freely in the pocket
  magnet: 0.25,
  insert: 0,           // the insert MELTS its own fit — see insertBore()
  nut: 0.3,            // across the flats
  counterboreD: 0.6,   // head diameter, so a cap head drops in
  counterboreH: 0.4,   // and sits fully below the surface
  countersink: 0.3,    // cone cut deeper than flush, so no head stands proud
};

// --------------------------------------------------------------- bearings
//
// Deep groove ball bearings, the ones in every printed spinner, hinge and
// idler. bore / outer diameter / width, all mm.
export const BEARINGS = {
  623: { bore: 3, od: 10, w: 4 },
  624: { bore: 4, od: 13, w: 5 },
  625: { bore: 5, od: 16, w: 5 },
  626: { bore: 6, od: 19, w: 6 },
  627: { bore: 7, od: 22, w: 7 },
  608: { bore: 8, od: 22, w: 7 },     // the skate bearing; by far the commonest
  688: { bore: 8, od: 16, w: 5 },
  6001: { bore: 12, od: 28, w: 8 },
  6201: { bore: 12, od: 32, w: 10 },
  6800: { bore: 10, od: 19, w: 5 },
  6801: { bore: 12, od: 21, w: 5 },
  6802: { bore: 15, od: 24, w: 5 },
  6803: { bore: 17, od: 26, w: 5 },
  MR105: { bore: 5, od: 10, w: 4 },
  MR115: { bore: 5, od: 11, w: 4 },
  MR126: { bore: 6, od: 12, w: 4 },
};

// ---------------------------------------------------------------- screws
//
// clearance: ISO 273 medium fit — the hole a screw PASSES THROUGH.
// close:     ISO 273 close fit, when the position matters more than the ease.
// tap:       the hole you cut a thread into, or self-tap into plastic.
// Head figures are the socket cap (DIN 912), button (ISO 7380) and countersunk
// (ISO 10642) families, as diameter across and height.
export const SCREWS = {
  M2: { d: 2, pitch: 0.4, clearance: 2.4, close: 2.2, pilot: 1.8, tapDrill: 1.6, nutAF: 4, nutT: 1.6, hex: 1.5, socket: { d: 3.8, h: 2 }, button: { d: 3.8, h: 1.3 }, flat: { d: 4.0 } },
  M2_5: { d: 2.5, pitch: 0.45, clearance: 2.9, close: 2.7, pilot: 2.2, tapDrill: 2.05, nutAF: 5, nutT: 2, hex: 2, socket: { d: 4.5, h: 2.5 }, button: { d: 4.7, h: 1.5 }, flat: { d: 5.0 } },
  M3: { d: 3, pitch: 0.5, clearance: 3.4, close: 3.2, pilot: 2.7, tapDrill: 2.5, nutAF: 5.5, nutT: 2.4, hex: 2.5, socket: { d: 5.5, h: 3 }, button: { d: 5.7, h: 1.65 }, flat: { d: 6.0 } },
  M4: { d: 4, pitch: 0.7, clearance: 4.5, close: 4.3, pilot: 3.6, tapDrill: 3.3, nutAF: 7, nutT: 3.2, hex: 3, socket: { d: 7.0, h: 4 }, button: { d: 7.6, h: 2.2 }, flat: { d: 8.0 } },
  M5: { d: 5, pitch: 0.8, clearance: 5.5, close: 5.3, pilot: 4.6, tapDrill: 4.2, nutAF: 8, nutT: 4.7, hex: 4, socket: { d: 8.5, h: 5 }, button: { d: 9.5, h: 2.75 }, flat: { d: 10.0 } },
  M6: { d: 6, pitch: 1.0, clearance: 6.6, close: 6.4, pilot: 5.5, tapDrill: 5.0, nutAF: 10, nutT: 5.2, hex: 5, socket: { d: 10.0, h: 6 }, button: { d: 10.5, h: 3.3 }, flat: { d: 12.0 } },
  M8: { d: 8, pitch: 1.25, clearance: 9.0, close: 8.4, pilot: 7.4, tapDrill: 6.8, nutAF: 13, nutT: 6.8, hex: 6, socket: { d: 13.0, h: 8 }, button: { d: 14.0, h: 4.4 }, flat: { d: 16.0 } },
};

// ------------------------------------------------------- heat-set inserts
//
// Brass inserts melted into a printed boss. od is the widest part of the
// knurl; length is how deep it sits.
export const INSERTS = {
  M2: { od: 3.2, length: 4.0, boss: 7 },
  M2_5: { od: 3.5, length: 4.0, boss: 7.5 },
  M3: { od: 4.0, length: 5.7, boss: 8 },
  M4: { od: 5.6, length: 8.1, boss: 11 },
  M5: { od: 6.4, length: 9.5, boss: 13 },
  M6: { od: 8.1, length: 12.7, boss: 16 },
};

// M2.5 cannot be a bare property name, and people will type it with the dot.
const key = (s) => String(s).trim().toUpperCase().replace(/[.\s-]/g, "_")
  .replace(/^(\d)/, "M$1");

function look(table, id, what) {
  const k = key(id);
  const hit = table[k] ?? table[String(id).trim()] ?? table[String(id).trim().toUpperCase()];
  if (!hit) {
    throw new Error(`${what} "${id}" isn't in the table — try ${Object.keys(table).map((n) => n.replace("_", ".")).join(", ")}`);
  }
  return hit;
}

export const screwSpec = (size) => look(SCREWS, size, "screw size");
export const bearingSpec = (id) => look(BEARINGS, id, "bearing");
export const insertSpec = (size) => look(INSERTS, size, "insert size");

const SIDES = 64;   // round enough that a printed bore is round, cheap enough

// ------------------------------------------------------------------ parts

// The bearing itself, for looking at and measuring against. Not a pocket —
// subtracting this leaves a hole the bearing cannot go into.
export function bearing(id, opts = {}) {
  const b = bearingSpec(id);
  const $fn = opts.$fn ?? SIDES;
  return difference(
    cylinder({ d: b.od, h: b.w, $fn }),
    translate([0, 0, -1], cylinder({ d: b.bore, h: b.w + 2, $fn })),
  );
}

// The seat you cut for one.
//
// Press by default: +0.1 on DIAMETER, which goes in with a clamp and holds
// without glue. `{ slip: true }` gives +0.3, which turns freely — the right
// choice when the bearing is a bushing rather than a pressed race.
export function bearingPocket(id, opts = {}) {
  const b = bearingSpec(id);
  const fit = opts.fit ?? (opts.slip ? FIT.bearingSlip : FIT.bearingPress);
  const $fn = opts.$fn ?? SIDES;
  const depth = opts.depth ?? b.w + (opts.sink ?? 0.2);
  const body = cylinder({ d: b.od + fit, h: depth, $fn });
  // A through-hole under the seat is what lets you push a stuck bearing back
  // out with a rod. Off by default because a blind seat is sometimes the point.
  //
  // outer − 3, NOT the bore: it has to clear the INNER ring so a rod pushes on
  // the outer one. A hole sized to the bore pushes the bearing apart instead.
  if (!opts.through) return body;
  const bore = opts.throughD ?? Math.max(1, b.od - 3);
  return union(body, translate([0, 0, -(opts.throughH ?? 20)],
    cylinder({ d: bore, h: (opts.throughH ?? 20) + 0.01, $fn })));
}

// The hole a screw passes through, with its head recess if you ask for one.
//
// Cut DOWN from z=0: the screw goes in from above, so the head sits at the top
// and the shaft runs into the part. That matches how anyone describes it —
// "an M3 clearance hole 12 deep" — and means you place it where the head goes.
export function screwHole(size, opts = {}) {
  const s = screwSpec(size);
  const $fn = opts.$fn ?? SIDES;
  const depth = opts.depth ?? opts.length ?? 20;
  const fit = opts.fit ?? 0;
  // "tap" here means what it means to someone printing: the hole the screw
  // cuts its OWN thread in, which is the plastic pilot (2.7 for an M3) and not
  // the metal tap drill (2.5). The tap drill is in the table as tapDrill for
  // anyone threading aluminium, and reachable with { hole: "tapDrill" }.
  const which = opts.hole ?? (opts.tap ? "pilot" : opts.close ? "close" : "clearance");
  const d = s[which];
  if (!Number.isFinite(d)) {
    throw new Error(`screwHole(): hole "${which}" isn't one of clearance, close, pilot, tapDrill`);
  }
  // 0.01 above z=0 so the top face is never coincident with the part's — two
  // surfaces in one plane is a hole in the mesh, not a hole in the part.
  const shaft = translate([0, 0, -depth], cylinder({ d: d + fit, h: depth + 0.01, $fn }));
  const head = opts.head;
  if (!head) return shaft;

  if (head === "socket" || head === "cap" || head === "button") {
    const h = head === "button" ? s.button : s.socket;
    // Deeper than the head by FIT.counterboreH so it is fully hidden — a head
    // level with the surface still catches a fingernail and a mating part.
    const hh = opts.headDepth ?? h.h + FIT.counterboreH;
    return union(shaft, translate([0, 0, -hh],
      cylinder({ d: h.d + FIT.counterboreD, h: hh + 0.01, $fn })));
  }
  if (head === "flat" || head === "countersunk" || head === "csk") {
    // A real 90° cone, not a cylinder: a countersunk screw pulls itself
    // centred on the cone, and a flat-bottomed recess throws that away. Cut
    // FIT.countersink deeper than flush so the head never stands proud.
    const top = s.flat.d;
    const cone = (top - d) / 2 + FIT.countersink;   // 90° means depth = radius difference
    return union(shaft, translate([0, 0, -cone],
      cylinder({ d1: top - cone * 2, d2: top, h: cone + 0.01, $fn })));
  }
  throw new Error(`screwHole(): head "${head}" isn't one of socket, button, flat`);
}

// The bore a heat-set insert is melted into.
//
// The bore is the insert's own outer diameter, NOT smaller. The knurl displaces
// plastic sideways as it sinks; starting undersize just squeezes the melt up
// around the rim and leaves the insert proud. Depth runs a little past the
// insert so the displaced plastic has somewhere to go.
export function insertBore(size, opts = {}) {
  const i = insertSpec(size);
  const $fn = opts.$fn ?? SIDES;
  const d = (opts.d ?? i.od) + (opts.fit ?? FIT.insert);
  const depth = opts.depth ?? i.length + 1;
  return translate([0, 0, -depth], cylinder({ d, h: depth + 0.01, $fn }));
}

// A hex nut pocket. `captive` opens a slot out to one side so the nut slides in
// after printing, which is how you get a nut into a closed part.
export function nutPocket(size, opts = {}) {
  const s = screwSpec(size);
  const fit = opts.fit ?? FIT.nut;
  const af = s.nutAF + fit;
  const t = (opts.thickness ?? s.nutT) + (opts.slack ?? 0.3);
  // A hexagon is a 6-sided cylinder, and across-FLATS is what a nut is
  // measured by — so the circumscribed radius is af / 2 / cos(30°). Using
  // af/2 directly makes a pocket the nut will not enter, which is the first
  // mistake this function exists to stop.
  //
  // The 30° turn is the SECOND one, and it is only visible once you try to
  // slide a nut in. Unturned, the hexagon presents its corners along X, so a
  // slot running in Y has to clear 6.35mm for an M3 — not the 5.5 the nut is
  // sold as. A slot cut to the across-flats size binds on the corners: measured
  // at 0.4mm³ of nut left outside the pocket, which is a nut that will not go
  // in and a table that says it should. Turned, the flats face the slot walls,
  // the nut slides on them, and it cannot rotate once home — which is the
  // entire point of a captive nut.
  const pocket = rotate([0, 0, 30], cylinder({ r: af / 2 / Math.cos(Math.PI / 6), h: t, $fn: 6 }));
  if (!opts.captive) return pocket;
  const run = opts.slot ?? 20;
  return union(pocket, translate([-af / 2, 0, 0], cube([af, run, t])));
}

// A disc magnet pocket — diameter and height as bought, in mm.
export function magnetPocket(d, h, opts = {}) {
  if (!(+d > 0) || !(+h > 0)) throw new Error("magnetPocket(d, h) needs the magnet's diameter and height in mm");
  const fit = opts.fit ?? FIT.magnet;
  const $fn = opts.$fn ?? SIDES;
  return cylinder({ d: +d + fit, h: +h + (opts.slack ?? 0.2), $fn });
}

// A screw, roughly, for a fit check or an exploded view. Not a thread — a
// printed thread at these sizes is not useful and modelling one is a lot of
// triangles for a picture.
export function screw(size, opts = {}) {
  const s = screwSpec(size);
  const $fn = opts.$fn ?? SIDES;
  const len = opts.length ?? 12;
  const head = opts.head ?? "socket";
  const h = head === "button" ? s.button : s.socket;
  const shaft = translate([0, 0, -len], cylinder({ d: s.d, h: len, $fn }));
  if (head === "flat" || head === "countersunk" || head === "csk") {
    const cone = (s.flat.d - s.d) / 2;
    return group(shaft, translate([0, 0, -cone], cylinder({ d1: s.d, d2: s.flat.d, h: cone, $fn })));
  }
  return group(shaft, cylinder({ d: h.d, h: h.h, $fn }));
}

// A hex nut, for the same reason.
export function nut(size, opts = {}) {
  const s = screwSpec(size);
  const $fn = opts.$fn ?? SIDES;
  // Same 30° turn as nutPocket, so the two agree: a nut dropped into its own
  // pocket should sit flat-to-flat, not corner-to-flat.
  return difference(
    rotate([0, 0, 30], cylinder({ r: s.nutAF / 2 / Math.cos(Math.PI / 6), h: s.nutT, $fn: 6 })),
    translate([0, 0, -1], cylinder({ d: s.d, h: s.nutT + 2, $fn })),
  );
}

// Everything the tables know, as text. The chat harness prints this so a model
// can see the whole range without anyone maintaining a second copy of it in
// prose — the list in the prompt and the list in the code are the same list.
export function partsCatalog() {
  const b = Object.entries(BEARINGS).map(([k, v]) => `${k} (${v.bore}/${v.od}/${v.w})`).join(", ");
  const s = Object.keys(SCREWS).map((k) => k.replace("_", ".")).join(", ");
  const i = Object.entries(INSERTS).map(([k, v]) => `${k.replace("_", ".")} (${v.od}/${v.length}, boss ${v.boss})`).join(", ");
  return { bearings: b, screws: s, inserts: i };
}
