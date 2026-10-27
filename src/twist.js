// twist.js — linearExtrude({ h, twist, scale }, profile): a profile turned
// (and optionally scaled) as it rises.
//
// Two outputs, one shape. No kernel BREPcode runs has a twisted extrude
// except NVIDIA's SMLib, which can SKIN a solid through copies of the profile
// (SmApiCreateSkinPrimitive): exact curved walls, flat caps, a STEP-clean
// solid. Every other kernel gets triangles. So the compiler emits ONE
// IMPORT3D feature carrying both:
//
//   twistMesh(n, world)    the solid as ASCII STL, fine enough (a slice every
//                          TWIST_STEP degrees) that no step shows on a print;
//                          what the Rust and JS kernels build
//   twistRecipe(n, world)  the profile as the addon's segments plus h, twist,
//                          scale and how many profiles to skin through; what
//                          the NVIDIA adapter builds instead (null when the
//                          profile has holes, which one skin cannot carry)
//
// Twist is in degrees, counter-clockwise looking down +Z (the right-hand
// rule, like rotate()); OpenSCAD's linear_extrude twists the other way.
// Scale is the top's size against the bottom's, about the profile's origin.
//
// Either can also be a LIST: values at evenly spaced heights, bottom to top,
// joined by a smooth curve (Catmull-Rom). scale: [1, 1.3, 0.8, 1] swells,
// pinches and opens again; twist: [0, 20, 90, 120] turns slowly, then fast.
// That is what makes a vase look grown rather than machined.

import { Vector2, Vector3, ShapeUtils } from "three";

export const TWIST_STEP = 2;          // degrees per mesh slice
export const SKIN_STEP = 15;          // degrees per skinned profile (cubic)
// A twisted wall between two straight profile edges is curved ACROSS the
// edge too (a saddle), and two triangles per slice cut straight through it:
// a 20 mm square twisted 90 degrees came out 1.2% light. So long edges are
// split first, walls and caps alike (the caps share the wall's vertices).
export const MAX_EDGE = 1.5;          // mm, longest profile edge the mesh twists

// a value list through evenly spaced heights, smooth between (Catmull-Rom,
// the ends held), at height share u
function curveAt(list, u) {
  const k = list.length - 1;
  const t = Math.min(k, Math.max(0, u * k)), i = Math.min(k - 1, Math.floor(t)), f = t - i;
  const p0 = list[Math.max(0, i - 1)], p1 = list[i], p2 = list[i + 1], p3 = list[Math.min(k, i + 2)];
  const m1 = (p2 - p0) / 2, m2 = (p3 - p1) / 2, f2 = f * f, f3 = f2 * f;
  return (2 * f3 - 3 * f2 + 1) * p1 + (f3 - 2 * f2 + f) * m1 + (-2 * f3 + 3 * f2) * p2 + (f3 - f2) * m2;
}
// degrees turned, and size, at height share u
export const angleAt = (n, u) => (Array.isArray(n.twist) ? curveAt(n.twist, u) - n.twist[0] : n.twist * u);
export const scaleAt = (n, u) => (Array.isArray(n.top) ? curveAt(n.top, u) / n.top[0] : 1 + (n.top - 1) * u);
const curved = (n) => Array.isArray(n.twist) || Array.isArray(n.top);
// the most turn between any two heights, for how finely to slice
export function turnOf(n) {
  if (!Array.isArray(n.twist)) return Math.abs(n.twist);
  let t = 0;
  for (let i = 1; i <= 64; i++) t += Math.abs(angleAt(n, i / 64) - angleAt(n, (i - 1) / 64));
  return t;
}

// mesh slices: one per TWIST_STEP of turn, and at least 48 up a curve (a
// swelling side is curved even where it does not turn); a straight taper is
// straight-sided
export const meshSlices = (twist, isCurved = false) => Math.max(isCurved ? 48 : 1, Math.ceil(Math.abs(twist) / TWIST_STEP));
// skin profiles: a cubic loft needs four; one per SKIN_STEP after that, and
// four per span of a value list
export const skinProfiles = (twist, stations = 0) => Math.max(4, Math.ceil(Math.abs(twist) / SKIN_STEP) + 1, stations > 1 ? (stations - 1) * 4 + 1 : 0);

// where profile point [x, y] lands at height share u (0 bottom, 1 top)
function at(n, [x, y], u) {
  const a = angleAt(n, u) * Math.PI / 180, s = scaleAt(n, u);
  const c = Math.cos(a), sn = Math.sin(a);
  return [s * (x * c - y * sn), s * (x * sn + y * c), n.h * u];
}

// -> ASCII STL text of the twisted solid, every vertex through `world`
// a loop with every edge longer than `max` split evenly
export function densify(loop, max = MAX_EDGE) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    const k = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / max));
    for (let j = 0; j < k; j++) out.push([p[0] + (q[0] - p[0]) * j / k, p[1] + (q[1] - p[1]) * j / k]);
  }
  return out;
}

export function twistMesh(n, world, name = "twist") {
  const slices = meshSlices(turnOf(n), curved(n));
  // a straight taper (no twist) has flat walls: nothing to split
  const fine = (l) => (turnOf(n) ? densify(l) : l);
  const outer = fine(n.pts);
  const holePts = (n.holes || []).map((h) => fine(h.pts ?? h));
  const loops = [outer, ...holePts];
  const tris = [];
  // the walls: a band of quads per loop edge per slice. The outline runs CCW
  // and holes CW, so (edge direction) x (+Z) points out of the solid either way
  for (const loop of loops) {
    for (let k = 0; k < slices; k++) {
      const u0 = k / slices, u1 = (k + 1) / slices;
      for (let i = 0; i < loop.length; i++) {
        const p = loop[i], q = loop[(i + 1) % loop.length];
        const a = at(n, p, u0), b = at(n, q, u0), c = at(n, q, u1), d = at(n, p, u1);
        tris.push([a, b, c], [a, c, d]);
      }
    }
  }
  // the caps: the outline with its holes, triangulated once, then placed
  const contour = outer.map(([x, y]) => new Vector2(x, y));
  const holes = holePts.map((h) => h.map(([x, y]) => new Vector2(x, y)));
  const flat = [...outer, ...holePts.flat()];
  for (const [i, j, k] of ShapeUtils.triangulateShape(contour, holes)) {
    const tri = [flat[i], flat[j], flat[k]];
    const ccw = (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0]) > 0;
    const up = ccw ? tri : [tri[0], tri[2], tri[1]];
    tris.push(up.map((p) => at(n, p, 1)));                       // top faces +Z
    tris.push([up[0], up[2], up[1]].map((p) => at(n, p, 0)));    // bottom faces -Z
  }
  // into the world; a mirror turns every triangle inside out, so wind it back
  const flip = world.determinant() < 0;
  const v = new Vector3();
  const put = ([x, y, z]) => { v.set(x, y, z).applyMatrix4(world); return `vertex ${v.x} ${v.y} ${v.z}\n`; };
  let stl = `solid ${name}\n`;
  for (const t of tris) {
    const [a, b, c] = flip ? [t[0], t[2], t[1]] : t;
    stl += `facet normal 0 0 0\nouter loop\n${put(a)}${put(b)}${put(c)}endloop\nendfacet\n`;
  }
  return stl + `endsolid ${name}\n`;
}

// the DSL's profile segments -> the addon's: [0, line], [1, cubic Bezier],
// [2, cx, cy, cz, r, startDeg, endDeg] (a CCW arc); z = 0, in the profile's
// own frame. null for anything it does not know.
export function addonSegments(n) {
  const deg = (a) => (a * 180) / Math.PI;
  if (!n.segs) {
    return n.pts.map((p, i) => {
      const q = n.pts[(i + 1) % n.pts.length];
      return [0, p[0], p[1], 0, q[0], q[1], 0];
    });
  }
  const out = [];
  for (const s of n.segs) {
    if (s.t === "line") out.push([0, s.p[0][0], s.p[0][1], 0, s.p[1][0], s.p[1][1], 0]);
    else if (s.t === "bezier") out.push([1, ...s.p.flatMap(([x, y]) => [x, y, 0])]);
    else if (s.t === "arc" || s.t === "circle") {
      const [cx, cy] = s.c, r = Math.hypot(s.p[0][0] - cx, s.p[0][1] - cy);
      if (s.t === "circle") { out.push([2, cx, cy, 0, r, 0, 360]); continue; }
      // a clockwise arc is the counter-clockwise one between the same ends
      const [from, to] = s.cw ? [s.p[1], s.p[0]] : [s.p[0], s.p[1]];
      let a0 = deg(Math.atan2(from[1] - cy, from[0] - cx)), a1 = deg(Math.atan2(to[1] - cy, to[0] - cx));
      while (a1 <= a0) a1 += 360;
      out.push([2, cx, cy, 0, r, a0, a1]);
    } else return null;
  }
  return out;
}

// -> what the NVIDIA adapter skins, or null when only the mesh can carry it
export function twistRecipe(n, world) {
  if (n.holes?.length) return null;
  const segs = addonSegments(n);
  if (!segs?.length) return null;
  const stations = Math.max(Array.isArray(n.twist) ? n.twist.length : 0, Array.isArray(n.top) ? n.top.length : 0);
  const profiles = skinProfiles(turnOf(n), stations);
  // every profile's turn and size, worked out here, so the addon has one rule
  const u = Array.from({ length: profiles }, (_, k) => k / (profiles - 1));
  return {
    segs, h: n.h,
    twist: u.map((v) => angleAt(n, v)), scale: u.map((v) => scaleAt(n, v)),
    profiles,
    matrix: Array.from(world.elements),     // column-major, applied after the skin
  };
}
