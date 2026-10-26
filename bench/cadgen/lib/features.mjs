// A practice part is a body plus a list of mating features. The one list
// drives three things, so they can never disagree:
//   * the cutters/bosses that make the ground-truth solid,
//   * the interface jigs (keep-out / keep-in sub-volumes, the files
//     cadgenbench's interface metric reads: jig_<ctx>__<i>__KOR|KIR.step),
//   * the drawing's callouts and position dimensions.
//
// Feature shapes (every `at` is the centre of the feature ON the surface it
// enters, `dir` the outward normal there; axis directions only):
//   { kind: "hole", at, dir, d, depth, through?, cbore?: { d, depth }, csk?: { d, angle } }
//   { kind: "slot", at, dir, w, len, depth, angle?, through? }   len = centre to centre
//   { kind: "pocket", at, dir, w, l, depth, r? }                 rectangular, corner radius r
//   { kind: "boss", at, dir, d, h, bore? }                       stands OUT along dir; bore = coaxial hole d
// Optional on all: ctx (mating group id, default 1), noJig (drawn, not scored).

import { cube, cylinder, union, difference, translate, rotate, hull, fillet } from "../../../src/dsl.js";

const PROUD = 1;  // how far a cutter pokes out past the surface it enters

// a +Z local frame rotated so local +Z = the outward normal `dir`
function orient(dir, shape) {
  const [x, y, z] = dir.map((v) => Math.round(v));
  if (z === 1) return shape;
  if (z === -1) return rotate([180, 0, 0], shape);
  if (x === 1) return rotate([0, 90, 0], shape);
  if (x === -1) return rotate([0, -90, 0], shape);
  if (y === 1) return rotate([-90, 0, 0], shape);
  if (y === -1) return rotate([90, 0, 0], shape);
  throw new Error(`feature dir must be an axis direction (got ${dir})`);
}
const place = (f, local) => translate(f.at, orient(f.dir, local));
const FN = 96;

// The empty (or solid) volume of a feature in its local frame: material is
// z < 0, the surface is z = 0. `proud` extends it out of the material.
function localVolume(f, proud) {
  if (f.kind === "hole") {
    const r = f.d / 2;
    const bore = translate([0, 0, -f.depth], cylinder({ r, h: f.depth + proud, $fn: FN }));
    if (f.cbore) {
      const k = f.cbore.depth, R = f.cbore.d / 2;
      return union(bore, translate([0, 0, -k], cylinder({ r: R, h: k + proud, $fn: FN })));
    }
    if (f.csk) {
      const R = f.csk.d / 2, k = (R - r) / Math.tan(((f.csk.angle ?? 90) / 2) * Math.PI / 180);
      const parts = [bore, translate([0, 0, -k], cylinder({ r1: r, r2: R, h: k, $fn: FN }))];
      if (proud > 0) parts.push(cylinder({ r: R, h: proud, $fn: FN }));
      return union(...parts);
    }
    return bore;
  }
  if (f.kind === "slot") {
    const h = f.depth + proud, r = f.w / 2, c = f.len / 2;
    const s = hull({ exact: true }, translate([-c, 0, 0], cylinder({ r, h, $fn: FN })), translate([c, 0, 0], cylinder({ r, h, $fn: FN })));
    return rotate([0, 0, f.angle ?? 0], translate([0, 0, -f.depth], s));
  }
  if (f.kind === "pocket") {
    const h = f.depth + proud;
    let b = cube([f.l, f.w, h]);
    if (f.r) b = fillet({ r: f.r, edges: "z" }, b);
    return rotate([0, 0, f.angle ?? 0], translate([-f.l / 2, -f.w / 2, -f.depth], b));
  }
  if (f.kind === "boss") {
    // a boss is material standing out of the surface; sunk `proud` into it
    const b = translate([0, 0, -proud], cylinder({ d: f.d, h: f.h + proud, $fn: FN }));
    return f.bore ? difference(b, translate([0, 0, -proud - 1], cylinder({ d: f.bore, h: f.h + proud + 2, $fn: FN }))) : b;
  }
  throw new Error(`unknown feature kind ${f.kind}`);
}

export const isAdd = (f) => f.kind === "boss";
export const cutter = (f) => place(f, localVolume(f, PROUD));
export const adder = (f) => place(f, localVolume(f, 0.5));
// the scored region: exactly the feature's volume, nothing proud
export const jigShape = (f) => place(f, localVolume(f, 0));
export const jigType = (f) => (isAdd(f) ? "KIR" : "KOR");

// body + bosses, minus every cut. Disjoint holes go in one difference; a
// feature flagged `alone` (one that crosses another) is cut on its own.
export function applyFeatures(body, features) {
  const adds = features.filter(isAdd).map(adder);
  let s = adds.length ? union(body, ...adds) : body;
  const cuts = features.filter((f) => !isAdd(f));
  const together = cuts.filter((f) => !f.alone).map(cutter);
  if (together.length) s = difference(s, ...together);
  for (const f of cuts.filter((f) => f.alone)) s = difference(s, cutter(f));
  return s;
}

export function shiftFeature(f, c) {
  return { ...f, at: f.at.map((v, i) => v - c[i]) };
}
