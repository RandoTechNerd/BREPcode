// The shelf: common printed parts, already built and already correct.
//
// WHY THIS IS NOT A PORT OF SOMEONE ELSE'S LIBRARY
//
// The obvious move is to bundle an existing one. Two reasons not to:
//
//   NopSCADlib is GPL-3.0. This repository is public and MIT, and copyleft
//   would reach everything it touched.
//
//   BOSL2 is BSD-2-Clause, so the licence is fine — but it is OpenSCAD, and it
//   is built on rotate_extrude, polyhedron, text and an attachment solver, none
//   of which this translator has. src/openscad.js already reached that verdict
//   and shipped a small shim with honest warnings instead of a port.
//
// So these are written here, from the public standards. A dimension is a fact
// and facts are not copyrightable; what matters is that each one is BUILT and
// MEASURED in test/shelf.js rather than asserted.
//
// WHAT A SHELF PART IS
//
// A function that returns a shape, with defaults good enough that calling it
// bare gives you something sensible. Anything whose name ends in Slot, Pocket,
// Hole, Cut or Catch is a NEGATIVE — you subtract it. Everything else is a
// positive you union or place.
//
// The whole point is that none of this sits in the prompt. The functions are
// vocabulary the evaluator already has, and the descriptions live in a lazily
// fetched recipe. A model reaches the shelf; it does not carry it around.

import {
  cube, cylinder, sphere, translate, rotate, difference, union, hull, group,
  polygon, linearExtrude, mirror, fillet,
} from "./dsl.js";
import {
  screwSpec, insertSpec, insertBore, bearingSpec, bearingPocket,
} from "./parts.js";

const num = (v, name) => {
  const n = +v;
  if (!Number.isFinite(n)) throw new Error(`shelf: ${name} must be a number, got ${v}`);
  return n;
};
const pos = (v, name) => {
  const n = num(v, name);
  if (n <= 0) throw new Error(`shelf: ${name} must be greater than zero, got ${n}`);
  return n;
};

const SIDES = 48;

// ------------------------------------------------------------- mounting

// A PCB standoff / mounting boss: a post with a hole down it.
//
// Wall is what matters. Under about 1.5mm around the hole the post splits when
// the screw goes in, so the outer diameter is derived from the hole rather than
// guessed, and a caller who asks for something thinner is corrected.
export function standoff(opts = {}) {
  const h = pos(opts.h ?? 8, "h");
  const id = pos(opts.id ?? 3.2, "id");
  const wall = pos(opts.wall ?? 2, "wall");
  const od = opts.od != null ? pos(opts.od, "od") : id + wall * 2;
  if (od <= id) throw new Error(`shelf: standoff od (${od}) must be bigger than id (${id})`);
  const $fn = opts.$fn ?? SIDES;
  const post = cylinder({ d: od, h, $fn });
  if (opts.solid) return post;
  return difference(post, translate([0, 0, -0.5], cylinder({ d: id, h: h + 1, $fn })));
}

// A boss sized for a heat-set insert, with the bore already cut.
//
// The outer diameter comes from the insert table's minimum boss, which is the
// figure that leaves 2mm of wall — the number people get wrong by eye.
export function screwBoss(size = "M3", opts = {}) {
  const i = insertSpec(size);
  const h = pos(opts.h ?? i.length + 3, "h");
  const od = opts.od != null ? pos(opts.od, "od") : i.boss;
  const $fn = opts.$fn ?? SIDES;
  return difference(
    cylinder({ d: od, h, $fn }),
    translate([0, 0, h], insertBore(size, opts.bore || {})),
  );
}

// A keyhole slot, for hanging a part on a screw already in the wall.
//
// CUT THIS. The big end drops over the screw head, the part slides down, and
// the narrow end traps the shank. Cut from the BACK face, so it is placed at
// z=0 and cut downward like every other hole here.
export function keyholeSlot(opts = {}) {
  const head = pos(opts.head ?? 8, "head");
  const shank = pos(opts.shank ?? 4.2, "shank");
  if (shank >= head) throw new Error(`shelf: keyhole shank (${shank}) must be smaller than head (${head})`);
  const drop = pos(opts.drop ?? 12, "drop");
  const depth = pos(opts.depth ?? 4, "depth");
  const $fn = opts.$fn ?? SIDES;
  // The head end is countersunk into a pocket deeper than the slot, so the
  // screw head sits BELOW the shank channel and the part hangs flat.
  const pocket = pos(opts.pocket ?? depth, "pocket");
  return translate([0, 0, -depth], union(
    cylinder({ d: head, h: pocket + 0.01, $fn }),
    // the channel the shank slides up
    translate([-shank / 2, 0, 0], cube([shank, drop, depth + 0.01])),
    translate([0, drop, 0], cylinder({ d: shank, h: depth + 0.01, $fn })),
  ));
}

// The pair of slots a zip tie threads through. CUT THIS.
//
// Two slots with a bridge between them: the tie goes down one, across the back
// and up the other. One slot is a hole, not a tie mount.
export function zipTieSlot(opts = {}) {
  const w = pos(opts.w ?? 5, "w");          // tie width — 5mm is the common one
  const t = pos(opts.t ?? 2, "t");          // tie thickness
  const gap = pos(opts.gap ?? 12, "gap");   // between the slots
  const depth = pos(opts.depth ?? 6, "depth");
  const slot = (x) => translate([x - t / 2, -w / 2, -depth],
    cube([t + 0.4, w + 0.4, depth + 0.01]));
  return union(slot(-gap / 2), slot(gap / 2));
}

// A triangular brace in the corner between two walls.
//
// Printed flat against the bed it needs no supports, which is why it is a
// triangle and not a fillet: a fillet in this corner is an overhang.
export function cornerGusset(opts = {}) {
  const l = pos(opts.l ?? 15, "l");       // how far it runs along each wall
  const t = pos(opts.t ?? 3, "t");        // thickness
  const h = opts.h != null ? pos(opts.h, "h") : l;
  return rotate([90, 0, 0], linearExtrude({ h: t },
    polygon([[0, 0], [l, 0], [0, h]])));
}

// -------------------------------------------------------------- joining

// A cantilever snap hook — the clip on every battery cover.
//
// The lip is what does the work and the ramp is what lets it go in. A hook
// with no ramp has to be forced; a hook with no back face cannot be released.
export function snapHook(opts = {}) {
  const w = pos(opts.w ?? 6, "w");
  const t = pos(opts.t ?? 1.6, "t");        // arm thickness — this is the spring
  const l = pos(opts.l ?? 10, "l");         // arm length
  const lip = pos(opts.lip ?? 1.2, "lip");  // how far it catches
  const ramp = pos(opts.ramp ?? 2, "ramp"); // the lead-in
  // The arm, then the barb: a wedge that slopes on the way IN and is flat on
  // the way out, so it clicks home and holds.
  return union(
    cube([t, w, l]),
    translate([0, 0, l], rotate([-90, 0, 0], linearExtrude({ h: w },
      polygon([[0, 0], [t + lip, 0], [t, ramp]])))),
  );
}

// The window a snapHook catches on. CUT THIS.
//
// Sized from the SAME numbers as the hook plus a clearance, so the two cannot
// drift: a catch cut by eye is the reason a snap fit is either loose or refuses
// to click at all.
export function snapCatch(opts = {}) {
  const w = pos(opts.w ?? 6, "w");
  const lip = pos(opts.lip ?? 1.2, "lip");
  const fit = opts.fit ?? 0.2;
  const t = pos(opts.t ?? 2, "t");          // wall the window is cut through
  const h = pos(opts.h ?? lip + 1.5, "h");  // window height
  return translate([-0.01, -(w + fit) / 2, 0], cube([t + 0.02, w + fit, h]));
}

// A dovetail tongue, printed lying down so neither face is an overhang.
export function dovetail(opts = {}) {
  const w = pos(opts.w ?? 12, "w");     // width at the WIDE end
  const neck = pos(opts.neck ?? 7, "neck");
  const d = pos(opts.d ?? 6, "d");      // how far it sticks out
  const h = pos(opts.h ?? 8, "h");      // how tall
  if (neck >= w) throw new Error(`shelf: dovetail neck (${neck}) must be narrower than w (${w})`);
  return linearExtrude({ h },
    polygon([[-neck / 2, 0], [neck / 2, 0], [w / 2, d], [-w / 2, d]]));
}

// The socket it slides into. CUT THIS. Clearance is on the WIDTH, per side.
export function dovetailSlot(opts = {}) {
  const fit = opts.fit ?? 0.25;
  const w = pos(opts.w ?? 12, "w") + fit * 2;
  const neck = pos(opts.neck ?? 7, "neck") + fit * 2;
  const d = pos(opts.d ?? 6, "d") + fit;
  const h = pos(opts.h ?? 8, "h");
  return translate([0, -0.01, -0.01], linearExtrude({ h: h + 0.02 },
    polygon([[-neck / 2, 0], [neck / 2, 0], [w / 2, d], [-w / 2, d]])));
}

// A living hinge: a panel thinned to a strip it can fold along. CUT THIS from
// the panel, or pass { solid: true } to see the strip on its own.
//
// 0.4mm is the number. Thicker will not fold, thinner tears on the first bend,
// and it has to be at least two perimeters wide in the fold direction.
export function livingHinge(opts = {}) {
  const l = pos(opts.l ?? 40, "l");         // along the fold
  const w = pos(opts.w ?? 3, "w");          // across it
  const t = pos(opts.t ?? 3, "t");          // the panel's thickness
  const leave = opts.leave ?? 0.4;          // material left at the hinge
  if (leave >= t) throw new Error(`shelf: livingHinge leave (${leave}) must be less than the panel thickness (${t})`);
  const cut = t - leave;
  if (opts.solid) return translate([-w / 2, -l / 2, 0], cube([w, l, leave]));
  return translate([-w / 2, -l / 2, leave], cube([w, l, cut + 0.01]));
}

// A printable knuckle hinge — two leaves and a pin, all one print.
//
// Returned as a group so the parts stay separate bodies. The knuckles
// interleave and the pin hole runs the whole way through; print it lying flat
// with the pin axis along the bed.
export function pinHinge(opts = {}) {
  const len = pos(opts.len ?? 40, "len");
  const knuckles = Math.max(3, Math.round(opts.knuckles ?? 5));
  const pin = pos(opts.pin ?? 3, "pin");
  const r = pos(opts.r ?? pin / 2 + 2, "r");     // knuckle radius
  const leaf = pos(opts.leaf ?? 15, "leaf");     // how far each leaf reaches
  const t = pos(opts.t ?? 3, "t");               // leaf thickness
  const fit = opts.fit ?? 0.3;                   // between knuckles, along the pin
  const $fn = opts.$fn ?? SIDES;
  const seg = len / knuckles;

  const barrel = (i) => translate([0, -len / 2 + i * seg + fit / 2, 0],
    rotate([-90, 0, 0], cylinder({ d: r * 2, h: seg - fit, $fn })));
  const bore = translate([0, -len / 2 - 1, 0],
    rotate([-90, 0, 0], cylinder({ d: pin + fit, h: len + 2, $fn })));

  const side = (dir) => {
    const knuck = [];
    for (let i = dir > 0 ? 0 : 1; i < knuckles; i += 2) knuck.push(barrel(i));
    return difference(
      union(...knuck,
        translate([dir > 0 ? 0 : -leaf, -len / 2, -t / 2], cube([leaf, len, t]))),
      bore);
  };
  return group(side(1), side(-1),
    translate([0, -len / 2 + 0.5, 0], rotate([-90, 0, 0], cylinder({ d: pin, h: len - 1, $fn }))));
}

// ------------------------------------------------------------ enclosure

// A hollow box with rounded vertical corners — the body of most enclosures.
//
// Corners are made by hulling four cylinders, which is the cheap way; growing
// the box and rounding every edge costs about nine times as much to build and
// rounds the top and bottom too, which is rarely what an enclosure wants.
export function shell(opts = {}) {
  const [x, y, z] = (opts.size ?? [60, 40, 25]).map((v, i) => pos(v, `size[${i}]`));
  const wall = pos(opts.wall ?? 2, "wall");
  const r = Math.min(opts.r ?? 3, x / 2 - 0.01, y / 2 - 0.01);
  const $fn = opts.$fn ?? SIDES;
  const box = (w, d, h, rad, zOff) => {
    if (rad <= 0.05) return translate([-w / 2, -d / 2, zOff], cube([w, d, h]));
    const c = (sx, sy) => translate([sx * (w / 2 - rad), sy * (d / 2 - rad), zOff],
      cylinder({ r: rad, h, $fn }));
    return hull(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1));
  };
  const outer = box(x, y, z, r, 0);
  if (opts.solid) return outer;
  const floor = opts.floor ?? wall;
  return difference(outer,
    box(x - wall * 2, y - wall * 2, z - floor + 0.01, Math.max(0, r - wall), floor));
}

// A rebate round the top of a shell so a lid sits INTO it rather than on it.
// CUT THIS from the shell's rim.
export function lidLip(opts = {}) {
  const [x, y] = (opts.size ?? [60, 40]).map((v, i) => pos(v, `size[${i}]`));
  const wall = pos(opts.wall ?? 2, "wall");
  const depth = pos(opts.depth ?? 3, "depth");
  const fit = opts.fit ?? 0.2;
  const r = Math.min(opts.r ?? 3, x / 2 - 0.01);
  const $fn = opts.$fn ?? SIDES;
  // half the wall is removed, so the lid's matching tongue is the other half
  const half = wall / 2 + fit / 2;
  const box = (w, d, rad) => {
    if (rad <= 0.05) return translate([-w / 2, -d / 2, 0], cube([w, d, depth + 0.01]));
    const c = (sx, sy) => translate([sx * (w / 2 - rad), sy * (d / 2 - rad), 0],
      cylinder({ r: rad, h: depth + 0.01, $fn }));
    return hull(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1));
  };
  return translate([0, 0, -depth], difference(
    box(x, y, r),
    box(x - half * 2, y - half * 2, Math.max(0, r - half)),
  ));
}

// A row of louvre slots. CUT THIS.
//
// Slots run the SHORT way and are capped round, because a square-ended slot
// starts a crack at the corner and a slot printed as a bridge across its long
// axis sags.
export function vent(opts = {}) {
  const w = pos(opts.w ?? 40, "w");         // across the whole row
  const h = pos(opts.h ?? 20, "h");         // down the slots
  const slot = pos(opts.slot ?? 3, "slot"); // slot width
  const gap = pos(opts.gap ?? 3, "gap");    // rib between them
  const t = pos(opts.t ?? 4, "t");          // wall thickness to cut through
  const $fn = opts.$fn ?? 24;
  const pitch = slot + gap;
  const n = Math.max(1, Math.floor((w + gap) / pitch));
  const span = n * pitch - gap;
  const one = (x) => translate([x, 0, -0.01], hull(
    translate([0, -(h - slot) / 2, 0], cylinder({ d: slot, h: t + 0.02, $fn })),
    translate([0, (h - slot) / 2, 0], cylinder({ d: slot, h: t + 0.02, $fn })),
  ));
  const outs = [];
  for (let i = 0; i < n; i++) outs.push(one(-span / 2 + slot / 2 + i * pitch));
  return union(...outs);
}

// A honeycomb panel, for lightening a plate or making a grille. CUT THIS, or
// { solid: true } for the ribs on their own.
//
// Hexagons, not circles: they tile with no wasted rib and every wall prints as
// a straight line rather than an arc.
export function honeycomb(opts = {}) {
  const w = pos(opts.w ?? 60, "w");
  const h = pos(opts.h ?? 40, "h");
  const cell = pos(opts.cell ?? 8, "cell");     // across flats
  const wall = pos(opts.wall ?? 1.6, "wall");
  const t = pos(opts.t ?? 4, "t");
  const R = (cell / 2) / Math.cos(Math.PI / 6);
  const dx = cell + wall;
  const dy = (R * 1.5) + wall * 0.866;
  const cols = Math.ceil(w / dx) + 1, rows = Math.ceil(h / dy) + 1;
  const cells = [];
  for (let r = -rows; r <= rows; r++) {
    for (let c = -cols; c <= cols; c++) {
      const x = c * dx + (r % 2 ? dx / 2 : 0);
      const y = r * dy;
      if (Math.abs(x) > w / 2 + cell || Math.abs(y) > h / 2 + cell) continue;
      cells.push(translate([x, y, -0.01], cylinder({ r: R, h: t + 0.02, $fn: 6 })));
    }
  }
  if (!cells.length) throw new Error("shelf: honeycomb has no cells — is the panel smaller than one cell?");
  const holes = union(...cells);
  if (!opts.solid) return holes;
  return difference(translate([-w / 2, -h / 2, 0], cube([w, h, t])), holes);
}

// -------------------------------------------------------------- handling

// A knurled knob you can turn with wet hands.
//
// The flutes are cut, not added: cutting leaves the grip standing at the knob's
// real diameter, while adding them makes the knob bigger than you asked for.
export function knob(opts = {}) {
  const d = pos(opts.d ?? 30, "d");
  const h = pos(opts.h ?? 12, "h");
  const flutes = Math.max(3, Math.round(opts.flutes ?? 12));
  const depth = pos(opts.depth ?? 1.6, "depth");
  const $fn = opts.$fn ?? SIDES;
  const cuts = [];
  for (let i = 0; i < flutes; i++) {
    const a = (i / flutes) * Math.PI * 2;
    cuts.push(translate([Math.cos(a) * (d / 2 + depth * 0.6), Math.sin(a) * (d / 2 + depth * 0.6), -0.5],
      cylinder({ d: depth * 2.6, h: h + 1, $fn: 16 })));
  }
  const body = difference(cylinder({ d, h, $fn }), ...cuts);
  if (!opts.bore) return body;
  const b = typeof opts.bore === "number" ? { d: opts.bore } : opts.bore;
  return difference(body, translate([0, 0, -0.5],
    cylinder({ d: pos(b.d ?? 6, "bore.d"), h: (b.depth ?? h) + 1, $fn })));
}

// A D handle on two feet — the pull on a drawer, a lid, a carry case.
export function handle(opts = {}) {
  const span = pos(opts.span ?? 60, "span");    // centre to centre of the feet
  const rise = pos(opts.rise ?? 25, "rise");    // how far it stands off
  const r = pos(opts.r ?? 5, "r");              // bar radius
  const foot = pos(opts.foot ?? 8, "foot");     // foot diameter
  const $fn = opts.$fn ?? SIDES;
  const leg = (x) => translate([x, 0, 0], cylinder({ d: foot, h: rise - r, $fn }));
  const top = (x) => translate([x, 0, rise - r], sphere({ r, $fn }));
  return union(leg(-span / 2), leg(span / 2),
    hull(top(-span / 2), top(span / 2)));
}

// A wall hook: a plate, an arm, and a lip so things do not slide off.
export function hook(opts = {}) {
  const plate = opts.plate ?? [30, 4, 40];
  const [pw, pt, ph] = plate.map((v, i) => pos(v, `plate[${i}]`));
  const reach = pos(opts.reach ?? 30, "reach");
  const t = pos(opts.t ?? 6, "t");
  const lip = pos(opts.lip ?? 10, "lip");
  return union(
    translate([-pw / 2, 0, 0], cube([pw, pt, ph])),
    translate([-t / 2, pt, ph - t], cube([t, reach, t])),
    translate([-t / 2, pt + reach - t, ph - t], cube([t, t, lip + t])),
  );
}

// A recess for a stick-on rubber foot. CUT THIS from the underside.
export function footPocket(opts = {}) {
  const d = pos(opts.d ?? 12, "d");
  const h = pos(opts.h ?? 2, "h");
  const $fn = opts.$fn ?? SIDES;
  return cylinder({ d: d + (opts.fit ?? 0.4), h: h + 0.01, $fn });
}

// A raised plate to put a label or a name on — the base for text().
export function labelPlate(opts = {}) {
  const w = pos(opts.w ?? 40, "w");
  const h = pos(opts.h ?? 12, "h");
  const t = pos(opts.t ?? 1.5, "t");
  const r = Math.min(opts.r ?? 2, w / 2 - 0.01, h / 2 - 0.01);
  const $fn = opts.$fn ?? SIDES;
  if (r <= 0.05) return translate([-w / 2, -h / 2, 0], cube([w, h, t]));
  const c = (sx, sy) => translate([sx * (w / 2 - r), sy * (h / 2 - r), 0],
    cylinder({ r, h: t, $fn }));
  return hull(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1));
}

// --------------------------------------------------------------- motion

// A pillow block: a bearing held in a block, with a foot bolted down.
//
// The seat is bored straight THROUGH on the Y axis, so the shaft passes out
// both sides — a blind seat here is a bearing you can never get back out and a
// shaft with nowhere to go.
export function bearingBlock(id = "608", opts = {}) {
  const b = bearingSpec(id);
  const wall = pos(opts.wall ?? 4, "wall");
  const t = opts.t != null ? pos(opts.t, "t") : b.w + 2;         // block depth, along the shaft
  const w = opts.w != null ? pos(opts.w, "w") : b.od + wall * 2; // across
  const base = pos(opts.base ?? 6, "base");                      // foot thickness
  const h = opts.h != null ? pos(opts.h, "h") : base + b.od / 2 + wall;
  const axis = h - wall - b.od / 2;                              // shaft height off the bed
  const s = screwSpec(opts.bolt ?? "M4");
  const $fn = opts.$fn ?? SIDES;
  const span = opts.span != null ? pos(opts.span, "span") : w + s.clearance * 2 + wall * 2;
  const holeX = span / 2 - wall / 2 - s.clearance / 2;

  const body = union(
    translate([-w / 2, 0, 0], cube([w, t, h])),
    translate([-span / 2, 0, 0], cube([span, t, base])),
  );
  // Bored along Y: rotate the pocket -90 about X so its axis lies on +Y, then
  // run it past both faces.
  const seat = translate([0, -0.5, axis], rotate([-90, 0, 0],
    bearingPocket(id, { depth: t + 1, sink: 0, ...(opts.slip ? { slip: true } : {}) })));
  const bolt = (x) => translate([x, t / 2, -0.5], cylinder({ d: s.clearance, h: base + 1, $fn }));
  return difference(body, seat, bolt(-holeX), bolt(holeX));
}

// ------------------------------------------------------------------ PCB
//
// Board outlines and their mounting patterns. The numbers come from #devboard,
// which was already written and reviewed; a test cross-checks these against it
// so the prose and the code cannot drift apart.
//
// Boards are centred on the origin, because that is what makes them easy to
// place: a plate for a Pi is `pcbPlate("pi4")` at 0,0, not an exercise in
// remembering which corner the datum was.
export const PCBS = {
  pi4: {
    label: "Raspberry Pi 3 / 4 / 5", w: 85, d: 56, hole: 2.7, screw: "M2.5",
    // four holes on a rectangle, 3.5 in from each board corner
    hx: 58, hy: 49,
  },
  pizero: { label: "Pi Zero / Zero 2", w: 65, d: 30, hole: 2.7, screw: "M2.5", hx: 58, hy: 23 },
  pico: { label: "Pi Pico / Pico 2", w: 51, d: 21, hole: 2.1, screw: "M2", hx: 47, hy: 11.4 },
  uno: {
    label: "Arduino Uno / Leonardo", w: 68.6, d: 53.3, hole: 3.2, screw: "M3",
    // The Uno's holes are NOT a rectangle, which is the single most common way
    // a printed Arduino case comes out unusable. Measured from the bottom-left
    // corner with the USB on the left.
    points: [[14.0, 2.5], [15.3, 50.6], [66.0, 17.8], [66.0, 45.7]],
  },
};

export const pcbSpec = (id) => {
  const k = String(id).trim().toLowerCase().replace(/[\s_-]/g, "");
  const hit = PCBS[k] ?? PCBS[Object.keys(PCBS).find((n) => n.toLowerCase() === k)];
  if (!hit) throw new Error(`shelf: board "${id}" isn't known — try ${Object.keys(PCBS).join(", ")}`);
  return hit;
};

// Where the holes are, centred on the board. One place, so the standoffs and
// the plate cannot disagree about it.
export function pcbHoles(id) {
  const b = pcbSpec(id);
  if (b.points) return b.points.map(([x, y]) => [x - b.w / 2, y - b.d / 2]);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [sx * b.hx / 2, sy * b.hy / 2]);
}

// Standoffs at a board's own mounting holes.
//
// The bore is the board's hole minus a little, so an M2.5 self-taps into it —
// which is how a Pi is actually mounted, rather than with a nut nobody can
// reach under the board.
export function pcbStandoffs(id = "pi4", opts = {}) {
  const b = pcbSpec(id);
  const h = pos(opts.h ?? 6, "h");
  const bore = opts.bore != null ? pos(opts.bore, "bore") : Math.max(1, b.hole - 0.5);
  const od = opts.od != null ? pos(opts.od, "od") : b.hole * 2;
  return group(...pcbHoles(id).map(([x, y]) =>
    translate([x, y, 0], standoff({ h, id: bore, od, $fn: opts.$fn ?? SIDES }))));
}

// A plate the size of the board with those standoffs already on it.
export function pcbPlate(id = "pi4", opts = {}) {
  const b = pcbSpec(id);
  const t = pos(opts.t ?? 3, "t");
  const margin = opts.margin ?? 3;
  const r = Math.min(opts.r ?? 3, (b.w + margin * 2) / 2 - 0.01);
  const h = pos(opts.h ?? 6, "h");
  const $fn = opts.$fn ?? SIDES;
  const W = b.w + margin * 2, D = b.d + margin * 2;
  const c = (sx, sy) => translate([sx * (W / 2 - r), sy * (D / 2 - r), 0], cylinder({ r, h: t, $fn }));
  return union(hull(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)),
    translate([0, 0, t], pcbStandoffs(id, { h, ...opts })));
}

// -------------------------------------------------------------- gridfinity
//
// The open Gridfinity standard. Numbers from #gridfinity, cross-checked by the
// tests against that recipe.
//
// The plinth is the whole trick, and it falls out neatly: every step of the
// profile insets by the same amount as its corner radius shrinks, so all four
// corner centres sit at ±17.0 at EVERY height. That makes the plinth four
// stacks of cones rather than a lofted shell — cheap to build and exactly the
// spec rather than an approximation of it.
export const GRID = {
  pitch: 42,        // one cell
  foot: 41.5,       // bin footprint, 0.5 total clearance
  r: 3.75,          // outer corner radius at the top of the plinth
  unit: 7,          // one height unit
  base: 4.75,       // plinth height: 0.8 chamfer + 1.8 straight + 2.15 chamfer
  chamferLo: 0.8,
  straight: 1.8,
  chamferHi: 2.15,
};
// r at each step, and the corner centre they all share
const G_RTOP = GRID.r;                                   // 3.75 at 41.5 wide
const G_RMID = G_RTOP - GRID.chamferHi;                  // 1.60 at 37.2
const G_RLOW = G_RMID - GRID.chamferLo;                  // 0.80 at 35.6
const G_C = GRID.foot / 2 - G_RTOP;                      // 17.0, for all of them

// One cell's plinth, centred on the origin, sitting on z=0.
function plinth(grow = 0) {
  const corners = (rBot, rTop, z, h) => hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
    translate([sx * G_C, sy * G_C, z],
      cylinder({ r1: rBot + grow, r2: rTop + grow, h, $fn: 32 }))));
  return union(
    corners(G_RLOW, G_RMID, 0, GRID.chamferLo),
    corners(G_RMID, G_RMID, GRID.chamferLo, GRID.straight),
    corners(G_RMID, G_RTOP, GRID.chamferLo + GRID.straight, GRID.chamferHi),
  );
}

// A Gridfinity bin: x by y cells, u height units tall, hollowed.
export function gridfinityBin(opts = {}) {
  const x = Math.max(1, Math.round(opts.x ?? 1));
  const y = Math.max(1, Math.round(opts.y ?? 1));
  const u = Math.max(1, Math.round(opts.u ?? 3));
  const wall = pos(opts.wall ?? 1.2, "wall");
  const H = u * GRID.unit;
  if (H <= GRID.base) throw new Error(`shelf: a ${u}u bin is shorter than the ${GRID.base}mm plinth — use u 1 or more`);
  const $fn = opts.$fn ?? 32;

  // one plinth per CELL — that is what drops into a baseplate
  const feet = [];
  for (let i = 0; i < x; i++) {
    for (let j = 0; j < y; j++) {
      feet.push(translate([(i - (x - 1) / 2) * GRID.pitch, (j - (y - 1) / 2) * GRID.pitch, 0], plinth()));
    }
  }
  const W = x * GRID.pitch - (GRID.pitch - GRID.foot);
  const D = y * GRID.pitch - (GRID.pitch - GRID.foot);
  const box = (w, d, rad, z, h) => hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
    translate([sx * (w / 2 - rad), sy * (d / 2 - rad), z], cylinder({ r: rad, h, $fn }))));

  const body = union(...feet, box(W, D, GRID.r, GRID.base, H - GRID.base));
  if (opts.solid) return body;
  const floor = opts.floor ?? GRID.base + 1.2;
  return difference(body, box(W - wall * 2, D - wall * 2, Math.max(0.1, GRID.r - wall), floor, H - floor + 0.01));
}

// A baseplate: x by y sockets that those plinths drop into.
export function gridfinityBase(opts = {}) {
  const x = Math.max(1, Math.round(opts.x ?? 2));
  const y = Math.max(1, Math.round(opts.y ?? 2));
  const fit = opts.fit ?? 0.25;    // on the radius, so the bin is not a press fit
  const h = pos(opts.h ?? 5, "h");
  const slab = translate([-x * GRID.pitch / 2, -y * GRID.pitch / 2, 0],
    cube([x * GRID.pitch, y * GRID.pitch, h]));
  const sockets = [];
  for (let i = 0; i < x; i++) {
    for (let j = 0; j < y; j++) {
      sockets.push(translate(
        [(i - (x - 1) / 2) * GRID.pitch, (j - (y - 1) / 2) * GRID.pitch, h - GRID.base],
        plinth(fit)));
    }
  }
  return difference(slab, ...sockets);
}

// ------------------------------------------------------------------ ports
//
// Panel cutouts for connectors. These are the CUT sizes from #ports — body
// plus the clearance a moulded cable shroud needs — not the connector body.
// A number pair is a rectangle; a single number is a round hole.
export const PORTS = {
  "usb-a": [13.0, 5.5], "usb-c": [10.0, 4.2], "micro-usb": [8.6, 4.0],
  hdmi: [15.4, 6.0], "mini-hdmi": [11.6, 3.6], rj45: [17.0, 14.5],
  microsd: [12.0, 1.8], sd: [24.5, 2.5], xt60: [16.0, 8.2], xt30: [11.0, 6.0],
  rocker: [21.2, 15.2],
  barrel: 8.2, audio: 6.2, banana: 12.2, fuse: 12.2,
  button12: 12.2, button16: 16.2, pot: 7.2,
};

// A port cutout through a wall.
//
// This one cuts along +Y, NOT down Z like the rest of the shelf. That is a
// deliberate break: a port is always in a vertical wall, and making every
// caller wrap it in rotate([90,0,0]) is a rotation to get wrong. Place it at
// the wall's inside face and it runs outward through it.
//
// Rectangular cutouts get a 45-degree roof by default, because a flat-topped
// rectangle prints its top edge as an unsupported bridge and it sags into the
// opening. Pass { arch: false } to keep it square.
export function portCutout(name = "usb-c", opts = {}) {
  const key2 = String(name).trim().toLowerCase().replace(/[\s_]/g, "-");
  const spec = PORTS[key2];
  if (spec === undefined) {
    throw new Error(`shelf: port "${name}" isn't known — try ${Object.keys(PORTS).join(", ")}`);
  }
  const t = pos(opts.t ?? 3, "t");
  const $fn = opts.$fn ?? SIDES;
  // 1mm before the wall and 1mm past it: a cutter that stops level with a face
  // leaves two surfaces in one plane and prints a skin across the opening.
  const depth = t + 2;
  if (!Array.isArray(spec)) {
    const d = pos(opts.d ?? spec, "d");
    return translate([0, -1, 0], rotate([-90, 0, 0], cylinder({ d, h: depth, $fn })));
  }
  const [w, h] = [opts.w != null ? pos(opts.w, "w") : spec[0],
    opts.h != null ? pos(opts.h, "h") : spec[1]];
  const body = translate([-w / 2, -1, -h / 2], cube([w, depth, h]));
  if (opts.arch === false || h < 3) return body;
  // a 45-degree peak on top, so nothing has to bridge flat across the opening
  const roof = translate([0, -1, h / 2], rotate([-90, 0, 0],
    linearExtrude({ h: depth }, polygon([[-w / 2, 0], [w / 2, 0], [0, w / 2]]))));
  return union(body, roof);
}

// ------------------------------------------------------------------ common

// A rounded slot — a hole you can slide a screw along. CUT THIS.
//
// Round-ended, always: a square-ended slot starts a crack at the corner, and
// it is the shape a slot is anyway once you have drilled both ends.
export function slot(opts = {}) {
  const d = pos(opts.d ?? 4, "d");
  const len = pos(opts.len ?? 20, "len");   // centre to centre of the ends
  const depth = pos(opts.depth ?? 6, "depth");
  const $fn = opts.$fn ?? SIDES;
  const end = (x) => translate([x, 0, -0.01], cylinder({ d, h: depth + 0.02, $fn }));
  return hull(end(-len / 2), end(len / 2));
}

// A spring clip that snaps round a cable or a rod.
export function cableClip(opts = {}) {
  const d = pos(opts.d ?? 6, "d");          // cable diameter
  const t = pos(opts.t ?? 1.6, "t");        // wall — this is the spring
  const w = pos(opts.w ?? 8, "w");          // how wide the clip is
  const mouth = opts.mouth ?? d * 0.75;     // the gap it snaps through
  const $fn = opts.$fn ?? SIDES;
  const ring = difference(
    cylinder({ d: d + t * 2, h: w, $fn }),
    translate([0, 0, -0.5], cylinder({ d, h: w + 1, $fn })),
    // the mouth, opening along +X
    translate([0, -mouth / 2, -0.5], cube([d / 2 + t + 1, mouth, w + 1])),
  );
  if (!opts.base) return ring;
  const b = pos(opts.base, "base");
  return union(ring, translate([-(d / 2 + t), -b / 2, 0], cube([1.6, b, w])));
}

// Place copies of a shape evenly round a circle. A helper rather than a part,
// and on the shelf because a bolt circle done by hand is a page of sines.
export function boltCircle(n = 6, r = 20, shape = null, opts = {}) {
  const count = Math.max(1, Math.round(num(n, "n")));
  const rad = pos(r, "r");
  // Bare, it is six M3 clearance holes — the commonest bolt circle there is,
  // and something you can see rather than an error about a missing argument.
  const what = shape ?? cylinder({ d: 3.4, h: 10, $fn: SIDES });
  const start = num(opts.start ?? 0, "start");
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = start + (i / count) * 360;
    out.push(rotate([0, 0, a], translate([rad, 0, 0],
      opts.spin === false ? rotate([0, 0, -a], what) : what)));
  }
  return union(...out);
}

// ------------------------------------------------------------ the index
//
// The machine-readable shelf. The picker UI, the #shelf recipe and the tests
// all read THIS — so a part that is added, renamed or removed shows up in all
// three at once, and there is never a hand-kept second list to go stale.
//
// `cut: true` means it is a negative you subtract. `sample` is code that runs,
// which is what the picker inserts and what the tests build.
export const SHELF = [
  { id: "standoff", label: "Standoff / boss", group: "Mounting", cut: false,
    blurb: "post with a hole down it, for mounting a PCB",
    keywords: "pcb, spacer, post, pillar, mount",
    sample: `standoff({ h: 8, id: 3.2, wall: 2 })` },
  { id: "screwBoss", label: "Insert boss", group: "Mounting", cut: false,
    blurb: "boss sized for a heat-set insert, bore already cut",
    keywords: "heat set, insert, threaded, m3 boss",
    sample: `screwBoss("M3", { h: 9 })` },
  { id: "keyholeSlot", label: "Keyhole slot", group: "Mounting", cut: true,
    blurb: "hang the part on a screw already in the wall",
    keywords: "wall mount, hang, picture, teardrop",
    sample: `keyholeSlot({ head: 8, shank: 4.2, drop: 12 })` },
  { id: "zipTieSlot", label: "Zip-tie slots", group: "Mounting", cut: true,
    blurb: "a pair of slots a cable tie threads through",
    keywords: "cable tie, zip tie, tiewrap, cable management",
    sample: `zipTieSlot({ w: 5, gap: 12 })` },
  { id: "cornerGusset", label: "Corner gusset", group: "Mounting", cut: false,
    blurb: "triangular brace between two walls, prints support-free",
    keywords: "brace, rib, stiffener, triangle, support",
    sample: `cornerGusset({ l: 15, t: 3 })` },

  { id: "snapHook", label: "Snap hook", group: "Joining", cut: false,
    blurb: "cantilever clip with a lead-in ramp",
    keywords: "snap fit, clip, latch, catch, cantilever, battery cover",
    sample: `snapHook({ w: 6, t: 1.6, l: 10, lip: 1.2 })` },
  { id: "snapCatch", label: "Snap catch window", group: "Joining", cut: true,
    blurb: "the window a snapHook clicks into, from the same numbers",
    keywords: "snap fit, clip, latch, window, keeper",
    sample: `snapCatch({ w: 6, lip: 1.2, t: 2 })` },
  { id: "dovetail", label: "Dovetail tongue", group: "Joining", cut: false,
    blurb: "slide-together joint, printed lying down",
    keywords: "joint, slide, tongue, interlock",
    sample: `dovetail({ w: 12, neck: 7, d: 6, h: 8 })` },
  { id: "dovetailSlot", label: "Dovetail socket", group: "Joining", cut: true,
    blurb: "the socket for it, with the clearance applied",
    keywords: "joint, slide, socket, interlock",
    sample: `dovetailSlot({ w: 12, neck: 7, d: 6, h: 8 })` },
  { id: "livingHinge", label: "Living hinge", group: "Joining", cut: true,
    blurb: "cut a panel down to 0.4mm so it folds",
    keywords: "flexure, fold, bend, thin, flexible",
    sample: `livingHinge({ l: 40, w: 3, t: 3 })` },
  { id: "pinHinge", label: "Pin hinge", group: "Joining", cut: false,
    blurb: "interleaved knuckle hinge and its pin, printed as one",
    keywords: "knuckle hinge, door, lid, barrel, print in place",
    sample: `pinHinge({ len: 40, knuckles: 5, pin: 3 })` },

  { id: "shell", label: "Enclosure shell", group: "Enclosure", cut: false,
    blurb: "hollow box with rounded vertical corners",
    keywords: "enclosure, case, box, housing, project box",
    sample: `shell({ size: [60, 40, 25], wall: 2, r: 3 })` },
  { id: "lidLip", label: "Lid rebate", group: "Enclosure", cut: true,
    blurb: "cut a half-wall rebate so a lid sits INTO the shell",
    keywords: "lid, cover, rebate, lip, tongue and groove",
    sample: `lidLip({ size: [60, 40], wall: 2, depth: 3 })` },
  { id: "vent", label: "Vent slots", group: "Enclosure", cut: true,
    blurb: "cut a row of round-ended louvre holes",
    keywords: "louvre, louver, airflow, cooling, grille, fan",
    sample: `vent({ w: 40, h: 20, slot: 3, gap: 3, t: 4 })` },
  { id: "honeycomb", label: "Honeycomb panel", group: "Enclosure", cut: true,
    blurb: "hex lightening pattern — cut holes, or { solid } for the ribs",
    keywords: "hex, lightening, infill, grille, lattice, weight",
    sample: `honeycomb({ w: 60, h: 40, cell: 8, wall: 1.6, t: 4 })` },

  { id: "knob", label: "Knurled knob", group: "Handling", cut: false,
    blurb: "fluted grip, flutes cut so the diameter is what you asked for",
    keywords: "dial, grip, thumbwheel, knurl, control",
    sample: `knob({ d: 30, h: 12, flutes: 12 })` },
  { id: "handle", label: "D handle", group: "Handling", cut: false,
    blurb: "bar on two feet — drawer pull, lid, case",
    keywords: "grip, pull, drawer, carry, bar",
    sample: `handle({ span: 60, rise: 25, r: 5 })` },
  { id: "hook", label: "Wall hook", group: "Handling", cut: false,
    blurb: "plate, arm and an upturned lip",
    keywords: "coat hook, peg, hanger, wall",
    sample: `hook({ plate: [30, 4, 40], reach: 30 })` },
  { id: "footPocket", label: "Rubber foot recess", group: "Handling", cut: true,
    blurb: "recess for a stick-on foot",
    keywords: "rubber feet, bumper, pad, anti slip",
    sample: `footPocket({ d: 12, h: 2 })` },
  { id: "labelPlate", label: "Label plate", group: "Handling", cut: false,
    blurb: "rounded raised plate to put text() on",
    keywords: "nameplate, badge, sign, tag, text",
    sample: `labelPlate({ w: 40, h: 12, t: 1.5 })` },

  { id: "bearingBlock", label: "Pillow block", group: "Motion", cut: false,
    blurb: "a bearing held in a bolt-down block, bored right through",
    keywords: "pillow block, axle, shaft, journal, 608",
    sample: `bearingBlock("608", { wall: 4 })` },

  { id: "pcbStandoffs", label: "PCB standoffs", group: "Electronics", cut: false,
    blurb: "posts at a board's own holes — pi4, pizero, pico, uno",
    keywords: "raspberry pi, arduino, uno, pico, esp32, board, devboard, electronics",
    sample: `pcbStandoffs("pi4", { h: 6 })` },
  { id: "pcbPlate", label: "PCB mounting plate", group: "Electronics", cut: false,
    blurb: "a plate the size of the board with the standoffs already on it",
    keywords: "raspberry pi, arduino, uno, pico, board, devboard, tray, carrier",
    sample: `pcbPlate("pi4", { t: 3, h: 6 })` },
  { id: "portCutout", label: "Port cutout", group: "Electronics", cut: true,
    blurb: "cut a panel hole for USB-C, HDMI, RJ45, a barrel jack… (cuts along +Y)",
    keywords: "usb, usb-c, hdmi, ethernet, rj45, jack, barrel, sd card, connector, panel, socket, switch, button",
    sample: `portCutout("usb-c", { t: 3 })` },

  { id: "gridfinityBin", label: "Gridfinity bin", group: "Storage", cut: false,
    blurb: "x by y cells, u units tall, with the real plinth profile",
    keywords: "storage, drawer, organiser, organizer, tray, bin, tool",
    sample: `gridfinityBin({ x: 2, y: 1, u: 3 })` },
  { id: "gridfinityBase", label: "Gridfinity baseplate", group: "Storage", cut: false,
    blurb: "the sockets those plinths drop into",
    keywords: "storage, drawer, organiser, organizer, baseplate, grid",
    sample: `gridfinityBase({ x: 2, y: 2 })` },

  { id: "slot", label: "Rounded slot", group: "Handling", cut: true,
    blurb: "cut a slot a screw can slide along, round-ended so it cannot crack",
    keywords: "elongated hole, adjustment, obround, oval hole",
    sample: `slot({ d: 4, len: 20, depth: 6 })` },
  { id: "cableClip", label: "Cable clip", group: "Handling", cut: false,
    blurb: "spring clip that snaps round a cable or rod",
    keywords: "wire clip, cord, tubing, p clip, routing",
    sample: `cableClip({ d: 6, t: 1.6, w: 8 })` },
  { id: "boltCircle", label: "Bolt circle", group: "Handling", cut: false,
    blurb: "place copies of a shape evenly round a circle",
    keywords: "pattern, array, circular, polar, hole pattern, flange",
    sample: `boltCircle(6, 20, cylinder({ d: 3.4, h: 10 }))` },
];

// What a person actually TYPES. The picker searches these as well as the
// label and blurb, because someone looking for an Arduino mount types
// "arduino" — and before this list existed, that search returned nothing while
// pcbStandoffs("uno") sat right there.
//
// Everything the picker and the recipe need, without either of them importing
// the geometry. Kept as a function so the list can never be mutated by a caller.
export const shelfIndex = () => SHELF.map((p) => ({ ...p }));
export const shelfGroups = () => [...new Set(SHELF.map((p) => p.group))];
