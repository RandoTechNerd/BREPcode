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
  cube, translate, difference, union, intersection, hull, fillet, colorize, group,
} from "./dsl.js";
import { CASEFINITY, CASEKIT_COLORS, shelfPack } from "./casefinity.js";

export const KUGGIS = Object.freeze({
  pitch: 15,            // the Casefinity module, so the builder's grid is the same grid
  wall: 1.2, floor: 1.2,
  between: 0.3,         // air between two neighbouring pieces, on diameter
  clear: 1.0,           // fit gap to the box wall, per side
  // The KUGGIS lid is a plug: on the 26x35x15 it is 12 mm tall and 8.8 mm
  // of that drops INSIDE the rim (measured). So the rim is measured lidIn
  // below the top, where the plug ends, and a piece stops topClear under
  // that, clear of the plug.
  lidIn: 9,
  topClear: 1,
  // the estimates below, per mm of outside size
  rimIn: 3.0,           // inside at lidIn down = outside - 2 * rimIn (a 2.25 wall, plus the lean over lidIn)
  depthIn: 6,           // inside depth = outside height - depthIn (the lid's 3 mm above the rim, the floor)
  taper: 5,             // degrees each wall leans out, floor to rim. Read off IKEA's own
                        // dimension drawing of the 26x35x15: both visible corner edges
                        // lean ~1.25 cm per side over the 15 cm, through the drawing's
                        // 26 and 35 cm scales (±1 degree; a measured box beats it)
  corner: 10,           // vertical corner radius inside
  floorRound: 6,        // the floor-to-wall rounding inside
});

// IKEA's five sizes. width x depth x height as IKEA lists them (width is the
// short side, depth the long one), in mm.
export const KUGGIS_SIZES = Object.freeze([
  { id: "13x18x8", label: "13 × 18 × 8 cm (5 × 7 × 3¼ in)", outer: [130, 180, 80] },
  { id: "18x26x8", label: "18 × 26 × 8 cm (7 × 10¼ × 3¼ in)", outer: [180, 260, 80] },
  { id: "18x26x15", label: "18 × 26 × 15 cm (7 × 10¼ × 6 in)", outer: [180, 260, 150] },
  { id: "26x35x15", label: "26 × 35 × 15 cm (10¼ × 13¾ × 6 in)", outer: [260, 350, 150] },
  { id: "37x54x21", label: "37 × 54 × 21 cm (14½ × 21¼ × 8¼ in)", outer: [370, 540, 210] },
]);

const num = (v, name, d) => {
  const n = v == null ? d : +v;
  if (!Number.isFinite(n)) throw new Error(`kuggis: ${name} must be a number, got ${v}`);
  return n;
};
const tanD = (deg) => Math.tan((deg * Math.PI) / 180);

// The inside of a box, estimated from its outside size. What the builder
// shows when a size is picked; every field is then the user's to correct.
export function kuggisEstimate(outer) {
  const [w, d, h] = outer.map((v, i) => num(v, ["width", "depth", "height"][i]));
  return {
    rimW: +(w - 2 * KUGGIS.rimIn).toFixed(1),
    rimD: +(d - 2 * KUGGIS.rimIn).toFixed(1),
    height: +(h - KUGGIS.depthIn).toFixed(1),
    lidIn: KUGGIS.lidIn,
    taper: KUGGIS.taper,
    corner: KUGGIS.corner,
    floorRound: KUGGIS.floorRound,
    clear: KUGGIS.clear,
  };
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
  const span = height - lidIn;                          // floor to the measuring plane
  const shrink = span * tanD(taper);                    // how far each wall leans over that
  const floorW = rimW - 2 * shrink, floorD = rimD - 2 * shrink;
  const corner = Math.max(0.5, Math.min(num(opts.corner, "corner", KUGGIS.corner), Math.min(floorW, floorD) / 2 - 1));
  const floorRound = Math.max(0, Math.min(num(opts.floorRound, "floorRound", KUGGIS.floorRound), Math.min(floorW, floorD) / 4, height / 2));
  const clear = Math.max(0, num(opts.clear, "clear", KUGGIS.clear));
  const wall = num(opts.wall, "wall", KUGGIS.wall), floor = num(opts.floor, "floor", KUGGIS.floor);
  const topClear = num(opts.topClear, "topClear", KUGGIS.topClear);
  const pieceH = span - topClear;
  return { rimW, rimD, height, lidIn, span, taper, shrink, floorW, floorD, corner, floorRound, clear, wall, floor, topClear, pieceH };
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
function liner(b, inset, z0, z1, floorRound) {
  const t = tanD(b.taper);
  const at = (z) => [b.floorW - 2 * inset + 2 * z * t, b.floorD - 2 * inset + 2 * z * t];
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
  return hull(...slabs);
}

// The three liners a kit cuts with, built ONCE and shared by every piece:
// the engine builds a hull it has seen before from its cache, and a piece
// that touches no wall never asks for them at all.
function liners(b) {
  const H = b.pieceH;
  return {
    outer: liner(b, b.clear, 0, H + 1, b.floorRound),
    inner: liner(b, b.clear + b.wall, b.floor, H + 2, Math.max(0, b.floorRound - b.wall)),
    innerOpen: liner(b, b.clear + b.wall, -1, H + 2, 0),
    walls: liner(b, b.clear + 0.05, -1, H + 1, b.floorRound),
  };
}

// One piece over grid cells [c, c+w) x [r, r+h). Returns { shape, bounds }
// with bounds [minX, maxX, minY, maxY] about the box's own origin.
function piece(b, fit, g, kind, divide, L) {
  const P = fit.pitch, BIG = 500;
  const gx0 = -fit.inner[0] / 2, gy0 = -fit.inner[1] / 2;
  const half = KUGGIS.between / 2;
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
  // an inside piece is a plain upright box: two cubes and one cut
  const outerPrism = prism(x0, x1, y0, y1, 0, H);
  const cavityPrism = prism(edgeL ? -BIG : x0 + w, edgeR ? BIG : x1 - w, edgeF ? -BIG : y0 + w, edgeB ? BIG : y1 - w, zc, H + 1);
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
  const topHalfW = (b.floorW + 2 * H * tanD(b.taper)) / 2 - b.clear, topHalfD = (b.floorD + 2 * H * tanD(b.taper)) / 2 - b.clear;
  const bounds = [edgeL ? -topHalfW : x0, edgeR ? topHalfW : x1, edgeF ? -topHalfD : y0, edgeB ? topHalfD : y1];
  return { shape, bounds };
}

// Everything to print for a box and its layout, laid out flat. `layout` as
// caseKit's: { at: [col, row], size: [cols, rows], kind: "box" | "frame", split }.
// A lidded box is printed as a plain box here: the pieces stop under the
// rim, and the KUGGIS lid covers them all.
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
