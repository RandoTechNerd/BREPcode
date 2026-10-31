// KUGGIS: inserts for IKEA's KUGGIS storage boxes, from the case builder.
//
// A KUGGIS is a tapered tub with rounded vertical corners and a rounded
// floor edge, and its inside is what the inserts have to fit: a piece that
// stands against a wall leans with it and rounds with the corner, while the
// faces between two pieces stay upright and flat. No Casefinity ribs here:
// the box itself holds everything in place, and the pieces just sit side by
// side on the module grid with a hair of air between them.
//
// HOW A PIECE IS CUT
//
// The box's inside, less a fit gap, is one solid: the LINER, a hull of three
// rounded slabs (the floor inset by the floor rounding, the floor's full
// size one rounding up, the rim size at the top). Every piece is the liner
// intersected with an upright prism over its grid cells. A cell range that
// reaches the grid's edge has its prism pushed out past the wall, so the
// liner's own sloped, rounded face becomes that side of the piece; a range
// that stops inside the grid keeps the prism's flat upright face, set in by
// half the gap between neighbours. The cavity is the same cut again, from a
// liner shrunk by the wall thickness and a prism shrunk by the wall on its
// upright sides, starting at the floor thickness (or below the bed, for a
// separator frame). Two intersections and one difference per piece,
// whatever its shape, and the slope is never computed twice.
//
// THE CORNER LUGS
//
// Every KUGGIS has a short rib standing diagonally across each inside
// corner at the floor (a stacking lug), so a piece that sits in a box
// corner needs a slot for it. The published inserts all cut the same thing:
// a narrow slot along the corner's diagonal, from the rounded corner in to
// just past the rib's inner face, as tall as the rib. Here the slot is cut
// into the LINER's four corners once (lug = how far in from the box's sharp
// inside corner the slot reaches, lugW its width, lugH its height), so only
// a piece that reaches a corner ever has one, and the cavity liner carries
// the same slot grown by the wall, so a wall stays around it inside.
//
// WHAT WE KNOW ABOUT THE BOXES
//
// IKEA publishes the OUTSIDE sizes only (13x18x8, 18x26x8, 18x26x15,
// 26x35x15 and 37x54x21 cm), and the published insert models keep their
// measured interiors in files behind a login. So KUGGIS_SIZES carries
// ESTIMATES from the outside sizes, labelled as such, and every number is a
// slider: measure the rim inside, the floor inside and the depth, type them
// over, and the pieces follow. The fit gap defaults loose (1 mm a side), the
// way the published dividers are made, so a piece lifts out with a finger.

import {
  cube, translate, rotate, difference, union, intersection, hull, fillet, colorize, group, polygon, linearExtrude,
} from "./dsl.js";
import { CASEFINITY, CASEKIT_COLORS, shelfPack, featuredOutline, outlinePrism } from "./casefinity.js";

export const KUGGIS = Object.freeze({
  pitch: 15,            // the Casefinity module, so the builder's grid is the same grid
  wall: 1.2, floor: 1.2,
  between: 0.3,         // air between two neighbouring pieces, on diameter
  // the "Casefinity lock" style: the spec's ribs and sockets on the upright
  // faces between pieces (never on a face against the box wall), so a kit
  // holds together as one block. The spec's clearance knob at 0.15 a face:
  // the tight end of its 0.10 to 0.20, a little room for a fat first layer
  lockClear: 0.15,
  clear: 1.0,           // fit gap to the box wall, per side
  // The KUGGIS lid is a plug: on the 26x35x15 it is 12 mm tall and 8.8 mm
  // of that drops INSIDE the rim (measured). So the rim is measured lidIn
  // below the top, where the plug ends, and a piece stops topClear under
  // that, clear of the plug.
  lidIn: 9,
  // 2026-10-30: the first printed 2x2 corner piece (pieces stopping 1 mm
  // under the plug) held the lid a little high on the 26x35, so the
  // pieces stop 7 mm under it now: 6 mm off the top
  topClear: 7,
  // The estimates below, per mm of outside size, re-based on a measured
  // 26x35x15 (see KUGGIS_SIZES): IKEA's quoted size is the FOOTPRINT, the
  // inside 9 mm down is 5 mm wider than it, the inside depth is 3.6 under
  // the quoted height, and each wall leans 7.7 degrees (18.5 mm over the
  // 137.4 mm between floor and the lid-plug line). IKEA's own dimension
  // drawing had suggested 5 degrees; the box says otherwise.
  rimIn: -2.5,          // short side: inside at lidIn down = outside - 2 * rimIn
  rimInD: 0,            // long side: measured 350 against a quoted 350
  depthIn: 3.6,         // inside depth = outside height - depthIn
  taper: 6.7,           // degrees the short-side walls lean out, floor to the lid-plug line (7.7 calipered; a printed piece said a degree less)
  taperD: 5.2,          // the long-side walls, a degree less than calipered too
  // The vertical corners inside are tighter than they look: the published
  // inserts' corners measure r 7.3 at the floor of a 13x18 (agepbiz,
  // printables 1285504), r 15 on a floor plate for an 18x26 (Eric T,
  // 1096506, generous: a flat plate also has to clear the floor rounding)
  // and r 18 on a baseplate for a 37x54 (357454). A 423 mm tape diagonal
  // on the 26x35 had suggested r 19, but a printed 2x2 corner piece at 19
  // stood well clear of the box's corner: r 12 for that box, and in
  // general 3 + 0.035 per mm of the box's short side (7.5, 9.5, 12, 16).
  corner: 12,
  cornerBase: 3, cornerPerMm: 0.035,
  floorRound: 6,        // the floor-to-wall rounding inside
  // The corner lug slots (see THE CORNER LUGS above). The slot reaches
  // lugOver past the corner radius along the diagonal (the rib sits just
  // round the corner's arc: 11.4 in on the 13x18 whose corner is ~8, 19 on
  // Eric T's 18x26 plate), is lugW wide (3 on the 13x18, 4 on the 18x26),
  // and stands lugFrac of the inside depth, no less than lugMin (25 mm on
  // the 72 mm deep 13x18x8). 0 for lug = no slot.
  lugOver: 4, lugW: 4, lugFrac: 0.3, lugMin: 20,
  // PRINTING. A piece against a wall carries the box's floor rounding on
  // its wall side, and that rounding starts horizontal at the floor: on the
  // bed it is an overhang no printer likes. So wall pieces print TOP DOWN
  // (the open top on the bed, the rounding closing in at the top) when
  // their cavity is narrow enough for the floor to bridge over it: up to
  // flipMax across. A bigger box prints upright, floor on the bed. Inside
  // pieces are plain prisms and never need flipping. The slot ends are 45
  // degree ramps, so they print in either orientation without support.
  flipMax: 50,
});

// IKEA's five sizes. width x depth x height as IKEA lists them (width is the
// short side, depth the long one), in mm. `measured` holds numbers taken
// off a real box with calipers (2026-10-30, one 26x35x15): the inside 9 mm
// down, the inside at the floor, the depth straight down. They override
// the estimate; what is not in there is still estimated.
export const KUGGIS_SIZES = Object.freeze([
  { id: "13x18x8", label: "13 × 18 × 8 cm (5 × 7 × 3¼ in)", outer: [130, 180, 80] },
  { id: "18x26x8", label: "18 × 26 × 8 cm (7 × 10¼ × 3¼ in)", outer: [180, 260, 80] },
  { id: "18x26x15", label: "18 × 26 × 15 cm (7 × 10¼ × 6 in)", outer: [180, 260, 150] },
  { id: "26x35x15", label: "26 × 35 × 15 cm (10¼ × 13¾ × 6 in)", outer: [260, 350, 150],
    // calipered 265 x 350 at the plug line and 228 x 320 at the floor, but
    // the first printed corner piece leaned 1 degree more than the box (air
    // under its bottom edge), so both are re-fitted about mid-height: the
    // floor 2.4 wider, the rim 2.4 narrower, 6.7 / 5.2 instead of 7.7 / 6.2
    measured: { rimW: 262.6, floorW: 230.4, rimD: 347.6, floorD: 322.4, height: 146.4, lidIn: 9 },
    note: "measured with calipers 9 mm down and the depth; the taper re-fitted from a printed corner piece (a degree steeper than the calipered floor). The corner radius and the corner lug slot are still estimates: check them against your box" },
  { id: "37x54x21", label: "37 × 54 × 21 cm (14½ × 21¼ × 8¼ in)", outer: [370, 540, 210] },
]);

const num = (v, name, d) => {
  const n = v == null ? d : +v;
  if (!Number.isFinite(n)) throw new Error(`kuggis: ${name} must be a number, got ${v}`);
  return n;
};
const tanD = (deg) => Math.tan((deg * Math.PI) / 180);

// The inside of a box, estimated from its outside size, with any measured
// numbers (a KUGGIS_SIZES entry's `measured`) laid over the estimate. What
// the builder shows when a size is picked; every field is then the user's
// to correct. Takes a size entry or a bare [w, d, h].
export function kuggisEstimate(size) {
  const outer = Array.isArray(size) ? size : size.outer;
  const m = Array.isArray(size) ? {} : (size.measured || {});
  const [w, d, h] = outer.map((v, i) => num(v, ["width", "depth", "height"][i]));
  const half = (v) => Math.round(v * 2) / 2;
  const corner = half(KUGGIS.cornerBase + KUGGIS.cornerPerMm * Math.min(w, d));
  const height = +(h - KUGGIS.depthIn).toFixed(1);
  const e = {
    rimW: +(w - 2 * KUGGIS.rimIn).toFixed(1),
    rimD: +(d - 2 * KUGGIS.rimInD).toFixed(1),
    height,
    lidIn: KUGGIS.lidIn,
    taper: KUGGIS.taper,
    taperD: KUGGIS.taperD,
    corner,
    floorRound: KUGGIS.floorRound,
    clear: KUGGIS.clear,
    lug: corner + KUGGIS.lugOver,
    lugW: KUGGIS.lugW,
    lugH: Math.max(KUGGIS.lugMin, Math.round(KUGGIS.lugFrac * (m.height ?? height))),
  };
  for (const k of ["rimW", "rimD", "height", "lidIn", "corner", "floorRound", "lug", "lugW", "lugH"]) if (m[k] != null) e[k] = m[k];
  // a measured floor fixes that axis's taper: the lean from floor to the plug line
  const lean = (rim, fl) => +((Math.atan((rim - fl) / 2 / (e.height - e.lidIn)) * 180) / Math.PI).toFixed(1);
  if (m.floorW != null && m.rimW != null) e.taper = lean(m.rimW, m.floorW);
  if (m.floorD != null && m.rimD != null) e.taperD = lean(m.rimD, m.floorD);
  return e;
}

// The box as the geometry needs it, from the builder's numbers: the inside
// at lidIn below the top (rimW x rimD, where the lid's plug ends and the
// pieces top out), inside depth floor to top, the taper, the corner radius
// and the floor rounding.
function boxDims(opts) {
  const rimW = num(opts.rimW, "rimW", 254), rimD = num(opts.rimD, "rimD", 344);
  const height = num(opts.height, "height", 144);
  const lidIn = Math.max(0, Math.min(num(opts.lidIn, "lidIn", KUGGIS.lidIn), height / 2));
  const taper = Math.min(20, Math.max(0, num(opts.taper, "taper", KUGGIS.taper)));
  // the long walls may lean differently; 0 or absent means the same as the short ones
  const tD = num(opts.taperD, "taperD", 0);
  const taperD = tD > 0 ? Math.min(20, tD) : taper;
  const span = height - lidIn;                          // floor to the measuring plane
  const shrink = span * tanD(taper), shrinkD = span * tanD(taperD);   // how far each wall leans over that
  const floorW = rimW - 2 * shrink, floorD = rimD - 2 * shrinkD;
  const corner = Math.max(0.5, Math.min(num(opts.corner, "corner", KUGGIS.corner), Math.min(floorW, floorD) / 2 - 1));
  const floorRound = Math.max(0, Math.min(num(opts.floorRound, "floorRound", KUGGIS.floorRound), Math.min(floorW, floorD) / 4, height / 2));
  const clear = Math.max(0, num(opts.clear, "clear", KUGGIS.clear));
  const wall = num(opts.wall, "wall", KUGGIS.wall), floor = num(opts.floor, "floor", KUGGIS.floor);
  const topClear = num(opts.topClear, "topClear", KUGGIS.topClear);
  const pieceH = span - topClear;
  const lock = opts.lock === true;
  // the corner lug slot: 0 reach = none; never deeper than a quarter of the floor
  const lug = Math.max(0, Math.min(num(opts.lug, "lug", 0), Math.min(floorW, floorD) / 4));
  const lugW = Math.max(0.5, num(opts.lugW, "lugW", KUGGIS.lugW));
  const lugH = Math.max(0, Math.min(num(opts.lugH, "lugH", KUGGIS.lugMin), height));
  // flip: true = every wall piece top down, false = all upright, absent =
  // wall pieces whose cavity bridges (flipMax) top down
  const flip = opts.flip === true ? true : opts.flip === false ? false : "auto";
  // openWalls: a piece against the box wall keeps no wall of its own on
  // that side (the box's wall closes it): floor and the upright walls
  // between pieces only. openLug: the corner rib's slot is cut straight
  // through into the piece instead of walled off
  const openWalls = opts.openWalls === true, openLug = opts.openLug === true;
  return { rimW, rimD, height, lidIn, span, taper, taperD, shrink, shrinkD, floorW, floorD, corner, floorRound, clear, wall, floor, topClear, pieceH, lock, lug, lugW, lugH, flip, openWalls, openLug };
}

// The module grid a box holds: whole 15 mm squares across the FLOOR inside,
// less the fit gap, centred. Pure numbers for the builder.
export function kuggisFit(opts = {}) {
  const b = boxDims(opts);
  const P = num(opts.pitch, "pitch", KUGGIS.pitch);
  const useW = b.floorW - 2 * b.clear, useD = b.floorD - 2 * b.clear;
  const cols = Math.max(0, Math.floor(useW / P)), rows = Math.max(0, Math.floor(useD / P));
  return {
    cols, rows, pitch: P,
    rim: [b.rimW, b.rimD], floor: [+b.floorW.toFixed(1), +b.floorD.toFixed(1)], height: b.height, lidIn: b.lidIn,
    inner: [cols * P, rows * P, +b.pieceH.toFixed(1)],
    pieceHeight: +b.pieceH.toFixed(1),
    // the margin between the grid and the floor's inside, per side
    marginX: +((b.floorW - cols * P) / 2).toFixed(1), marginY: +((b.floorD - rows * P) / 2).toFixed(1),
    fits: cols > 0 && rows > 0 && b.pieceH >= 8 && b.floorW > 20 && b.floorD > 20,
  };
}

// A rounded slab w x d, t thick, standing at z, corners r.
const slab = (w, d, r, z, t = 0.02) =>
  translate([-w / 2, -d / 2, z], fillet({ r: Math.max(0.3, Math.min(r, Math.min(w, d) / 2 - 0.01)), edges: "z" }, cube([w, d, t])));

// The liner: the box's inside pulled in by `inset` on every wall, from z0 up
// to z1 (past the rim is fine: the slope continues). floorRound rounds the
// floor edge; the hull of three slabs is that shape to within the facets.
// Then the corner lug slots, `grow` more than the box's own (the slot is a
// bump INTO the piece, so a liner inset by the wall carries it grown by the
// wall), up to lugTop: four cutters that never touch, one difference.
function liner(b, inset, z0, z1, floorRound, grow = 0, lugTop = b.lugH) {
  const t = tanD(b.taper), tD = tanD(b.taperD);
  const at = (z) => [b.floorW - 2 * inset + 2 * z * t, b.floorD - 2 * inset + 2 * z * tD];
  const r = Math.max(0.5, b.corner - inset);
  const fr = Math.max(0, Math.min(floorRound, (z1 - z0) / 2));
  const [w0, d0] = at(z0), [w1, d1] = at(z1);
  const slabs = [slab(w1, d1, r + z1 * t * 0, z1)];
  if (fr > 0.05) {
    const [wf, df] = at(z0 + fr);
    slabs.push(slab(wf, df, r, z0 + fr), slab(w0 - 2 * fr, d0 - 2 * fr, Math.max(0.3, r - fr), z0));
  } else {
    slabs.push(slab(w0, d0, r, z0));
  }
  const body = hull(...slabs);
  if (!(b.lug > 0) || lugTop <= z0) return body;
  // a slot along each corner's diagonal: from `reach` in from the box's
  // sharp inside corner at the floor, out past the corner (the walls lean
  // out above the floor, so the slot only gets roomier higher up). Its end
  // is not a flat roof but a 45 degree ramp climbing back out toward the
  // corner, so the slot prints without support whichever way up the piece
  // goes: the profile in the diagonal's vertical plane is drawn as a
  // polygon and extruded across the slot's width.
  const reach = b.lug + grow, w = b.lugW + 2 * grow, out = 30 + b.height * Math.max(t, tD);
  const zb = z0 - 1, zt = lugTop;
  const profile = polygon([[-out, zb], [reach, zb], [reach, zt], [-out, zt + reach + out]]);
  // drawn in x/y, stood up: rotate about x turns +y into +z and the
  // extrusion (0..w along z) into -w..0 along y, so centre it on the diagonal
  const cutter = translate([0, w / 2, 0], rotate([90, 0, 0], linearExtrude({ h: w }, profile)));
  const slots = [[-1, -1, 45], [1, -1, 135], [1, 1, 225], [-1, 1, 315]].map(([sx, sy, ang]) =>
    translate([sx * b.floorW / 2, sy * b.floorD / 2, 0], rotate([0, 0, ang], cutter)));
  return difference(body, ...slots);
}

// The three liners a kit cuts with, built ONCE and shared by every piece:
// the engine builds a hull it has seen before from its cache, and a piece
// that touches no wall never asks for them at all.
function liners(b) {
  const H = b.pieceH;
  // the cavity liner: inset by the wall, or (openWalls) a hair OUTSIDE the
  // outer liner so the wall side comes away clean; its rib slot grown by
  // the wall, or (openLug) a hair bigger than the outer's so the slot is
  // open into the piece, with the top ramps coinciding
  const inset = b.openWalls ? b.clear - 0.05 : b.clear + b.wall;
  const grow = b.openLug || b.openWalls ? 0.05 : b.wall;
  const lugTop = b.openLug || b.openWalls ? b.lugH + 0.05 : b.lugH + b.wall;
  const floorRound = b.openWalls ? b.floorRound : Math.max(0, b.floorRound - b.wall);
  return {
    outer: liner(b, b.clear, 0, H + 1, b.floorRound),
    inner: liner(b, inset, b.floor, H + 2, floorRound, grow, lugTop),
    innerOpen: liner(b, inset, -1, H + 2, 0, grow, lugTop),
    walls: liner(b, b.clear + 0.05, -1, H + 1, b.floorRound),
  };
}

// One piece over grid cells [c, c+w) x [r, r+h). Returns { shape, bounds }
// with bounds [minX, maxX, minY, maxY] about the box's own origin.
function piece(b, fit, g, kind, divide, L) {
  const P = fit.pitch, BIG = 500;
  const gx0 = -fit.inner[0] / 2, gy0 = -fit.inner[1] / 2;
  const half = b.lock ? KUGGIS.lockClear : KUGGIS.between / 2;
  // the prism's walls: at the grid edge, out past the box; inside, half a gap in
  const edgeL = g.c === 0, edgeR = g.c + g.w === fit.cols, edgeF = g.r === 0, edgeB = g.r + g.h === fit.rows;
  const x0 = edgeL ? -BIG : gx0 + g.c * P + half, x1 = edgeR ? BIG : gx0 + (g.c + g.w) * P - half;
  const y0 = edgeF ? -BIG : gy0 + g.r * P + half, y1 = edgeB ? BIG : gy0 + (g.r + g.h) * P - half;
  const H = b.pieceH;
  const onWall = edgeL || edgeR || edgeF || edgeB;
  const prism = (ax0, ax1, ay0, ay1, z0, z1) => translate([ax0, ay0, z0], cube([ax1 - ax0, ay1 - ay0, z1 - z0]));
  const bottom = kind !== "frame";
  const zc = bottom ? b.floor : -1;
  const w = b.wall;
  // an inside piece is a plain upright box: two cubes and one cut. In the
  // lock style the two prisms are Casefinity outlines instead: sockets cut
  // into the front (-Y) and right (+X) faces, ribs standing on the back and
  // left, one per module centre, and a boss inside behind each socket where
  // the wall is thinner than the socket is deep (REQ-4.4). A face against
  // the box wall gets nothing: the liner's slope is that side.
  const cx0 = edgeL ? -BIG : x0 + w, cx1 = edgeR ? BIG : x1 - w, cy0 = edgeF ? -BIG : y0 + w, cy1 = edgeB ? BIG : y1 - w;
  let outerPrism, cavityPrism;
  if (b.lock) {
    const rib = CASEFINITY.rib, bump = CASEFINITY.bump, cl = KUGGIS.lockClear, s = rib + 2 * cl;
    const featured = (ax0, ax1, ay0, ay1, make, z0, z1) => {
      const mx = (ax0 + ax1) / 2, my = (ay0 + ay1) / 2;
      const xs = Array.from({ length: g.w }, (_, i) => gx0 + (g.c + i + 0.5) * P - mx);
      const ys = Array.from({ length: g.h }, (_, j) => gy0 + (g.r + j + 0.5) * P - my);
      const sides = {};
      if (!edgeF && make.front) sides.front = make.front(xs);
      if (!edgeR && make.right) sides.right = make.right(ys);
      if (!edgeB && make.back) sides.back = make.back(xs);
      if (!edgeL && make.left) sides.left = make.left(ys);
      return translate([mx, my, 0], outlinePrism(featuredOutline(ax1 - ax0, ay1 - ay0, sides, CASEFINITY.draft), z0, z1 - z0));
    };
    const sock = (at) => ({ at, width: s, depth: bump, out: -1 });
    const ribs = (at) => ({ at, width: rib, depth: bump, out: 1 });
    const boss = (at) => ({ at, width: s + 2 * rib, depth: bump, out: -1, taper: false });
    outerPrism = featured(x0, x1, y0, y1, { front: sock, right: sock, back: ribs, left: ribs }, 0, H);
    cavityPrism = featured(cx0, cx1, cy0, cy1, w < 2 * bump ? { front: boss, right: boss } : {}, zc, H + 1);
  } else {
    outerPrism = prism(x0, x1, y0, y1, 0, H);
    cavityPrism = prism(cx0, cx1, cy0, cy1, zc, H + 1);
  }
  const outer = onWall ? intersection(L.outer, outerPrism) : outerPrism;
  const cavity = onWall ? intersection(bottom ? L.inner : L.innerOpen, cavityPrism) : cavityPrism;
  let shape = difference(outer, cavity);
  if (divide) {
    // a wall on every module line inside: upright, let into the floor
    const adds = [];
    const zb = bottom ? b.floor - 0.4 : 0;
    const ix0 = edgeL ? -b.rimW / 2 : x0 + w - 0.4, ix1 = edgeR ? b.rimW / 2 : x1 - w + 0.4;
    const iy0 = edgeF ? -b.rimD / 2 : y0 + w - 0.4, iy1 = edgeB ? b.rimD / 2 : y1 - w + 0.4;
    for (let i = 1; i < g.w; i++) {
      const lx = gx0 + (g.c + i) * P;
      adds.push(prism(lx - w / 2, lx + w / 2, iy0, iy1, zb, H));
    }
    for (let j = 1; j < g.h; j++) {
      const ly = gy0 + (g.r + j) * P;
      adds.push(prism(ix0, ix1, ly - w / 2, ly + w / 2, zb, H));
    }
    // the walls reach the sloped sides past the cavity, so trim them to the liner
    if (adds.length) shape = union(shape, onWall ? intersection(union(...adds), L.walls) : union(...adds));
  }
  // where the piece really reaches: the rim size at the top on an edge side
  const topHalfW = (b.floorW + 2 * H * tanD(b.taper)) / 2 - b.clear, topHalfD = (b.floorD + 2 * H * tanD(b.taperD)) / 2 - b.clear;
  // ribs stand proud of the left and back faces in the lock style
  const proud = b.lock ? CASEFINITY.bump : 0;
  let bounds = [edgeL ? -topHalfW : x0 - proud, edgeR ? topHalfW : x1, edgeF ? -topHalfD : y0, edgeB ? topHalfD : y1 + proud];
  // top down? Only a wall piece gains from it (the floor rounding), and a
  // box only when its floor can bridge the cavity at the top of the print;
  // a frame has no floor and always can. Turned over about X and set back
  // on the bed, so the bounds' Y side swaps.
  const cavitySpan = Math.min(g.w, g.h) * P - 2 * w;
  const flipped = onWall && (b.flip === true || (b.flip === "auto" && (kind === "frame" || cavitySpan <= KUGGIS.flipMax)));
  if (flipped) {
    shape = translate([0, 0, H], rotate([180, 0, 0], shape));
    bounds = [bounds[0], bounds[1], -bounds[3], -bounds[2]];
  }
  return { shape, bounds, flipped };
}

// Everything to print for a box and its layout, laid out flat. `layout` as
// caseKit's: { at: [col, row], size: [cols, rows], kind: "box" | "frame", split }.
// A lidded box is printed as a plain box here: the pieces stop under the
// rim, and the KUGGIS lid covers them all. `flip` (see KUGGIS.flipMax):
// true / false / absent for auto.
export function kuggisKit(opts = {}) {
  const b = boxDims(opts);
  const fit = kuggisFit(opts);
  if (!fit.fits) throw new Error(`kuggis: a ${b.rimW} x ${b.rimD} x ${b.height} box holds no whole ${fit.pitch} mm module at this taper`);
  const gap = num(opts.gap, "gap", 6);
  const L = liners(b);
  const parts = [];
  for (const r of opts.layout || []) {
    const [c0, r0] = r.at || [0, 0];
    const [w, h] = r.size || [1, 1];
    if (c0 < 0 || r0 < 0 || c0 + w > fit.cols || r0 + h > fit.rows || w < 1 || h < 1) continue;
    const kind = r.kind === "frame" ? "frame" : "box";
    const colour = CASEKIT_COLORS[r.kind === "lidbox" ? "lidbox" : kind];
    const cells = kind !== "frame" && r.split
      ? Array.from({ length: w * h }, (_, i) => ({ c: c0 + (i % w), r: r0 + Math.floor(i / w), w: 1, h: 1 }))
      : [{ c: c0, r: r0, w, h }];
    for (const g of cells) {
      const p = piece(b, fit, g, kind, kind === "frame" && !!r.split, L);
      parts.push([colorize(colour, p.shape), ...p.bounds]);
    }
  }
  if (!parts.length) throw new Error("kuggis: nothing to print: paint a box or separators onto the grid");
  return group(...shelfPack(parts, gap));
}

export { CASEFINITY as KUGGIS_GRID };
