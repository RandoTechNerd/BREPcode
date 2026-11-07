// STEP -> BREPcode, by exact cross-sections: for bodies the plain extrude
// (step2code.js tryExtrude) turns down because a face slants or lies across
// the extrude direction: a slanted side at any angle, a bar or a half-round
// lying across the part, a tab sticking out another way.
//
// The body is cut at every height along d where its section can change (a
// vertex, the top of a curve), and each section is traced exactly: every
// face is cut by the plane (a plane gives a line, a cylinder along d a
// circle, one lying across it two straight lines, a cone, sphere or torus on
// d a circle), each cut kept where it runs inside its face, and the pieces
// chained into loops. Heights where every cut face is a wall along d have a
// constant section: one extrude, as before. A run of heights where the
// section changes (the slanted or rounded part) is a STRIP, rebuilt from the
// other side: sectioned along a direction d2 across d, each section clipped
// to the strip, and extruded along d2. A slanted face is a line along d2, a
// bar's cylinder an arc. Holes come out first and are drilled at the end, so
// they never break a strip.
//
// With { approx: true } a strip nothing rebuilds exactly becomes thin layers,
// each its own mid-height section: the "close" version, which the checker
// measures and offers with its missing volume (never kept as exact).
//
// trySliced(solid, d, { approx }) -> { kind, expr, dials, approx } | { why }
// sectionAt(faces, fr, h, tol) -> { segs, varying } | { why }   (2D, frame fr)

import { vec } from "./stepread.js";
import {
  boundsOf, frameFor, parallel, perpendicular, chainLoops, circleLoops, nestLoops, mergeLines, sectionKey,
  emitExtrude, turnedCutters, dirName, canon, loopCode, num, placementFor,
} from "./step2code.js";

const { sub, add, mul, dot, cross, len, unit } = vec;
const TAU = 2 * Math.PI;
const MAX_PIECES = 40;
const MAX_LEVELS = 400;

// ---------------------------------------------------------------- faces

// a face's outward normal at p (its surface's, turned by the face's sense)
function faceNormal(f, p) {
  const s = f.surface;
  const radial = () => { const q = sub(p, s.o); return unit(sub(q, mul(s.z, dot(q, s.z)))); };
  let n;
  if (s.type === "plane") n = s.z;
  else if (s.type === "cylinder") n = radial();
  else if (s.type === "sphere") n = unit(sub(p, s.o));
  else if (s.type === "cone") n = unit(sub(mul(radial(), Math.cos(s.angle)), mul(s.z, Math.sin(s.angle))));
  else if (s.type === "torus") n = unit(sub(sub(p, s.o), mul(radial(), s.R)));
  else return null;
  return f.sense === false ? mul(n, -1) : n;
}

// where an edge crosses the plane dot(p, d) = h: the point, and the edge's
// direction there (as the loop runs). Lines, circles and ellipses exactly; a
// B-spline edge off its sampled points (approx).
function edgeCross(e, d, h) {
  const c = e.curve, out = [];
  if (c.type === "line") {
    const ha = dot(e.a, d) - h, hb = dot(e.b, d) - h;
    if (ha * hb < 0) out.push({ p: add(e.a, mul(sub(e.b, e.a), ha / (ha - hb))), t: unit(sub(e.b, e.a)) });
    return out;
  }
  if (c.type === "circle" || c.type === "ellipse") {
    const r2 = c.type === "ellipse" ? c.r2 : c.r;
    const A = c.r * dot(c.x, d), B = r2 * dot(c.y, d), R = Math.hypot(A, B);
    if (R < 1e-12) return out;                  // level all round: never crosses
    const k = (h - dot(c.o, d)) / R;
    if (Math.abs(k) >= 1) return out;
    const ang = (p) => { const q = sub(p, c.o); return Math.atan2(dot(q, c.y) / r2, dot(q, c.x) / c.r); };
    const t0 = ang(e.a);
    let sw = ((ang(e.b) - t0) % TAU + TAU) % TAU;
    if (sw < 1e-9) sw = TAU;
    const phi = Math.atan2(B, A), dt = Math.acos(k);
    for (const t of [phi + dt, phi - dt]) {
      const u = ((t - t0) % TAU + TAU) % TAU;
      if (u < 1e-12 || u > sw - 1e-12) continue;
      out.push({
        p: add(c.o, add(mul(c.x, c.r * Math.cos(t)), mul(c.y, r2 * Math.sin(t)))),
        t: unit(add(mul(c.x, -c.r * Math.sin(t)), mul(c.y, r2 * Math.cos(t)))),
      });
    }
    return out;
  }
  const P = e.pts?.length ? [e.a, ...e.pts.slice(1, -1), e.b] : [e.a, e.b];
  for (let i = 0; i + 1 < P.length; i++) {
    const ha = dot(P[i], d) - h, hb = dot(P[i + 1], d) - h;
    if (ha * hb < 0) out.push({ p: add(P[i], mul(sub(P[i + 1], P[i]), ha / (ha - hb))), t: unit(sub(P[i + 1], P[i])), approx: true });
  }
  return out;
}

// every height along d where a section can change: each vertex, the top and
// bottom of each curved edge, and of each curved face lying across d
export function breakpoints(faces, d, tol) {
  const H = (p) => dot(p, d);
  const hs = [];
  for (const f of faces) {
    for (const l of f.loops) for (const e of l.edges) {
      hs.push(H(e.a), H(e.b));
      const c = e.curve;
      if (c.type === "circle" || c.type === "ellipse") {
        const r2 = c.type === "ellipse" ? c.r2 : c.r;
        const A = c.r * dot(c.x, d), B = r2 * dot(c.y, d), R = Math.hypot(A, B);
        if (R > 1e-12) hs.push(H(c.o) + R, H(c.o) - R);
      } else if (e.pts) for (const p of e.pts) hs.push(H(p));
    }
    const s = f.surface;
    if (s.type === "cylinder" && !parallel(s.z, d)) { const k = s.r * Math.sqrt(Math.max(0, 1 - dot(s.z, d) ** 2)); hs.push(H(s.o) + k, H(s.o) - k); }
    if (s.type === "sphere") hs.push(H(s.o) + s.r, H(s.o) - s.r);
    if (s.type === "torus" && parallel(s.z, d)) hs.push(H(s.o) + s.r, H(s.o) - s.r);
  }
  // only inside the body's own span
  let lo = Infinity, hi = -Infinity;
  for (const f of faces) for (const l of f.loops) for (const e of l.edges) { lo = Math.min(lo, H(e.a), H(e.b)); hi = Math.max(hi, H(e.a), H(e.b)); }
  hs.sort((a, b) => a - b);
  const out = [];
  for (const h of hs) if (h >= lo - tol && h <= hi + tol && !(out.length && h - out[out.length - 1] < tol * 10)) out.push(h);
  return out;
}

// One face cut by the plane dot(p, fr.d) = h, as 2D pieces in fr: kept where
// the cut runs inside the face. Each crossing of its boundary is an entry or
// an exit (which side the face lies, from its normal and the loop's
// direction); a line is paired off in order along it, a circle from each
// entry the way it runs inward to the next crossing.
function faceSection(f, fr, h, tol) {
  const s = f.surface, d = fr.d;
  const P2 = (p) => [dot(p, fr.x), dot(p, fr.y)];
  const X = [];
  let approx = false;
  for (const l of f.loops) for (const e of l.edges) for (const x of edgeCross(e, d, h)) {
    const n = faceNormal(f, x.p);
    if (!n) return { why: `a ${s.type} face` };
    X.push({ p: x.p, inward: cross(n, x.t) });
    if (x.approx) approx = true;
  }
  const spans = () => {
    let lo = Infinity, hi = -Infinity;
    for (const l of f.loops) for (const e of l.edges) for (const p of [e.a, e.b, ...(e.pts || [])]) { lo = Math.min(lo, dot(p, d)); hi = Math.max(hi, dot(p, d)); }
    return lo < h && h < hi;
  };
  const lines = (pts, dir) => {
    if (pts.length % 2) return { why: `a ${s.type} face's cut does not pair up` };
    const sorted = [...pts].sort((a, b) => dot(a.p, dir) - dot(b.p, dir));
    const out = [];
    for (let i = 0; i + 1 < sorted.length; i += 2) out.push({ t: "line", p: P2(sorted[i].p), q: P2(sorted[i + 1].p) });
    return { segs: out };
  };
  const circle = (c3, r, pts0) => {
    const c = P2(c3);
    // a seam (the same edge twice in one loop, once each way) is crossed in
    // and straight back out at one point: the surface runs on through it
    const pts = pts0.filter((x, i) => !pts0.some((y, j) => j !== i && len(sub(x.p, y.p)) < tol * 100 && dot(x.inward, y.inward) < 0));
    if (!pts.length) return { segs: spans() ? [{ t: "circle", c, r }] : [] };
    const A = pts.map((x) => {
      const q = sub(x.p, c3), ccw = cross(d, q);
      return { a: Math.atan2(dot(q, fr.y), dot(q, fr.x)), enter: dot(ccw, x.inward) > 0 };
    }).sort((u, v) => u.a - v.a);
    const out = [];
    for (let i = 0; i < A.length; i++) {
      if (!A[i].enter) continue;
      const j = (i + 1) % A.length;
      if (A[j].enter) return { why: `a ${s.type} face's cut does not pair up` };
      let a1 = A[j].a;
      while (a1 <= A[i].a) a1 += TAU;
      out.push({ t: "arc", c, r, a0: A[i].a, a1 });
    }
    if (out.length * 2 !== A.length) return { why: `a ${s.type} face's cut does not pair up` };
    return { segs: out };
  };
  let r;
  if (s.type === "plane") {
    if (parallel(s.z, d)) return { segs: [], wall: false };
    r = lines(X, unit(cross(s.z, d)));
    if (r.segs) r.wall = perpendicular(s.z, d);
  } else if (s.type === "cylinder" && parallel(s.z, d)) {
    r = circle(add(s.o, mul(s.z, (h - dot(s.o, d)) / dot(s.z, d))), s.r, X);
    if (r.segs) r.wall = true;
  } else if (s.type === "cylinder" && perpendicular(s.z, d)) {
    // two rulings along the axis, where the cylinder is at height h
    const k = (h - dot(s.o, d)) / s.r;
    if (Math.abs(k) >= 1) return { segs: [], wall: false };
    const w = cross(s.z, d);
    const feet = [1, -1].map((sg) => add(s.o, mul(s.r, add(mul(d, k), mul(w, sg * Math.sqrt(1 - k * k))))));
    const segs = [];
    for (const foot of feet) {
      const off = (p) => { const q = sub(p, foot); return len(sub(q, mul(s.z, dot(q, s.z)))); };
      const mine = X.filter((x) => off(x.p) <= Math.min(...feet.map((g) => { const q = sub(x.p, g); return len(sub(q, mul(s.z, dot(q, s.z)))); })) + 1e-12);
      const one = lines(mine, s.z);
      if (one.why) return one;
      segs.push(...one.segs);
    }
    r = { segs, wall: false };
  } else if ((s.type === "cone" || s.type === "torus") && parallel(s.z, d) || s.type === "sphere") {
    const v = (h - dot(s.o, d)) * (s.type === "sphere" ? 1 : Math.sign(dot(s.z, d)));
    const axis = s.type === "sphere" ? d : mul(s.z, Math.sign(dot(s.z, d)));
    const c3 = add(s.o, mul(axis, v));
    let radii;
    if (s.type === "cone") radii = [s.r + v * Math.sign(dot(s.z, d)) * Math.tan(s.angle)];
    else if (s.type === "sphere") radii = Math.abs(v) < s.r ? [Math.sqrt(s.r * s.r - v * v)] : [];
    else radii = Math.abs(v) < s.r ? [s.R + Math.sqrt(s.r * s.r - v * v), s.R - Math.sqrt(s.r * s.r - v * v)] : [];
    radii = radii.filter((x) => x > tol);
    const segs = [];
    for (const rad of radii) {
      const mine = X.filter((x) => radii.every((o) => Math.abs(len(sub(x.p, c3)) - rad) <= Math.abs(len(sub(x.p, c3)) - o) + 1e-12));
      const one = circle(c3, rad, mine);
      if (one.why) return one;
      segs.push(...one.segs);
    }
    r = { segs, wall: false };
  } else return { why: `a ${s.type} face ${s.type === "bspline" ? "(freeform)" : "at an angle"}` };
  if (r.segs) { r.approx = approx; for (const g of r.segs) g.face = f; }
  return r;
}

// the section of these faces at height h along fr.d: 2D pieces in fr, and
// whether any comes off a face that is not a wall along fr.d (so the
// section changes with h)
export function sectionAt(faces, fr, h, tol) {
  const segs = [];
  let varying = false, approx = false;
  for (const f of faces) {
    const r = faceSection(f, fr, h, tol);
    if (r.why) return r;
    if (r.segs.length && !r.wall) varying = true;
    if (r.approx) approx = true;
    segs.push(...r.segs);
  }
  return { segs, varying, approx };
}

// 2D pieces -> regions (outer loops with their holes), or why not
function regionsOf(segs, tol, at, join = tol * 50) {
  if (!segs.length) return { regions: [], key: "" };
  const merged = mergeLines(segs, tol);
  const chained = chainLoops(merged, join);
  if (!chained) return { why: `the section at ${at} does not close` };
  return { regions: nestLoops(circleLoops(chained, tol)), key: sectionKey(merged) };
}

// ---------------------------------------------------------------- the band

// a piece's u (the first 2D coordinate) where it crosses u = z: v values
function crossingsAt(s, z, tol) {
  const out = [];
  if (s.t === "line") {
    const a = s.p[0] - z, b = s.q[0] - z;
    if (Math.abs(a) <= tol) out.push(s.p[1]);
    if (Math.abs(b) <= tol) out.push(s.q[1]);
    if (a * b < 0 && Math.abs(a) > tol && Math.abs(b) > tol) out.push(s.p[1] + (s.q[1] - s.p[1]) * (a / (a - b)));
    return out;
  }
  const k = (z - s.c[0]) / s.r;
  if (Math.abs(k) > 1) return out;
  const t = Math.acos(Math.max(-1, Math.min(1, k)));
  for (const a of [t, -t, TAU - t, t - TAU, t + TAU]) {
    if (s.t === "arc" && !(a >= s.a0 - 1e-12 && a <= s.a1 + 1e-12)) continue;
    if (s.t === "circle" && !(a >= 0 && a < TAU)) continue;
    out.push(s.c[1] + s.r * Math.sin(a));
  }
  return out;
}
// how many pieces a ray from (u, v) towards +v crosses (odd: inside)
function rayCount(segs, u, v) {
  let n = 0;
  for (const s of segs) {
    if (s.t === "line") {
      const a = s.p[0] - u, b = s.q[0] - u;
      if ((a > 0) === (b > 0)) continue;
      const y = s.p[1] + (s.q[1] - s.p[1]) * (a / (a - b));
      if (y > v) n++;
      continue;
    }
    const k = (u - s.c[0]) / s.r;
    if (Math.abs(k) >= 1) continue;
    const t = Math.acos(k);
    for (const a of [t, -t]) {
      if (s.t === "arc") {
        let x = a;
        while (x < s.a0) x += TAU;
        if (x > s.a1) continue;
      }
      if (s.c[1] + s.r * Math.sin(a) > v) n++;
    }
  }
  return n;
}
// split a piece where it crosses u = z0 and u = z1; the parts inside the band
function clipPiece(s, z0, z1, tol) {
  const inBand = (u) => u > z0 + tol && u < z1 - tol;
  if (s.t === "line") {
    const ts = [0, 1];
    for (const z of [z0, z1]) {
      const a = s.p[0] - z, b = s.q[0] - z;
      if (a * b < 0) ts.push(a / (a - b));
    }
    ts.sort((a, b) => a - b);
    const at = (t) => [s.p[0] + (s.q[0] - s.p[0]) * t, s.p[1] + (s.q[1] - s.p[1]) * t];
    const out = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] < 1e-12) continue;
      if (inBand(at((ts[i] + ts[i + 1]) / 2)[0])) out.push({ ...s, p: at(ts[i]), q: at(ts[i + 1]) });
    }
    return out;
  }
  const a0 = s.t === "circle" ? 0 : s.a0, a1 = s.t === "circle" ? TAU : s.a1;
  const cuts = [];
  for (const z of [z0, z1]) {
    const k = (z - s.c[0]) / s.r;
    if (Math.abs(k) >= 1) continue;
    const t = Math.acos(k);
    for (let a of [t, -t]) { while (a < a0) a += TAU; while (a > a0 + TAU) a -= TAU; if (a > a0 + 1e-12 && a < a1 - 1e-12) cuts.push(a); }
  }
  const mid = (a) => s.c[0] + s.r * Math.cos(a);
  if (!cuts.length) return inBand(mid((a0 + a1) / 2)) ? [s] : [];
  cuts.sort((a, b) => a - b);
  const ts = s.t === "circle" ? [...cuts, cuts[0] + TAU] : [a0, ...cuts, a1];
  const out = [];
  for (let i = 0; i + 1 < ts.length; i++) if (inBand(mid((ts[i] + ts[i + 1]) / 2))) out.push({ t: "arc", c: s.c, r: s.r, a0: ts[i], a1: ts[i + 1], face: s.face });
  return out;
}
// the section clipped to the band z0 < u < z1, closed along the band's two
// edges where material reaches them
function clipBand(segs, z0, z1, tol) {
  const kept = segs.flatMap((s) => clipPiece(s, z0, z1, tol));
  const eps = Math.min((z1 - z0) * 1e-3, tol * 1e3);
  for (const [z, side] of [[z0, 1], [z1, -1]]) {
    const vs = segs.flatMap((s) => crossingsAt(s, z, tol)).sort((a, b) => a - b);
    const uniq = vs.filter((v, i) => i === 0 || v - vs[i - 1] > tol * 10);
    for (let i = 0; i + 1 < uniq.length; i++) {
      const vm = (uniq[i] + uniq[i + 1]) / 2;
      if (rayCount(segs, z + side * eps, vm) % 2) kept.push({ t: "line", p: [z, uniq[i]], q: [z, uniq[i + 1]], band: true });
    }
  }
  return kept;
}

// the strip z0 < h < z1 (along d) rebuilt along d2: each section of the
// strip across d2 must not change between two heights along d2
function crossStrip(faces, d, z0, z1, tol, B) {
  const H = (p) => dot(p, d);
  const inStrip = faces.filter((f) => {
    let lo = Infinity, hi = -Infinity;
    for (const l of f.loops) for (const e of l.edges) for (const p of [e.a, e.b, ...(e.pts || [])]) { lo = Math.min(lo, H(p)); hi = Math.max(hi, H(p)); }
    // a curved face can bulge past its edges: its own top and bottom
    const s = f.surface;
    if (s.type === "cylinder" && !parallel(s.z, d)) { const k = s.r * Math.sqrt(Math.max(0, 1 - dot(s.z, d) ** 2)); lo = Math.min(lo, H(s.o) - k); hi = Math.max(hi, H(s.o) + k); }
    if (s.type === "sphere" || s.type === "torus") { lo = Math.min(lo, H(s.o) - s.r); hi = Math.max(hi, H(s.o) + s.r); }
    return hi > z0 + tol && lo < z1 - tol;
  });
  // the directions across d the strip's own faces run along
  const dirs = [];
  const addDir = (v, w = 1) => {
    if (len(v) < 1e-9) return;
    const u = canon(unit(sub(v, mul(d, dot(v, d)))));
    if (!(len(u) > 0.5) || !perpendicular(u, d, 1e-6)) return;
    const hit = dirs.find((x) => parallel(x.d, u));
    if (hit) hit.n += w; else dirs.push({ d: u, n: w });
  };
  for (const f of inStrip) {
    const s = f.surface;
    if (s.type === "cylinder" && perpendicular(s.z, d)) addDir(s.z, 3);
    else if (s.type === "plane" && !parallel(s.z, d)) addDir(cross(s.z, d), perpendicular(s.z, d) ? 1 : 3);
  }
  for (const a of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) if (perpendicular(a, d)) addDir(a, 0);
  dirs.sort((a, b) => b.n - a.n);
  const why = [];
  for (const { d: d2 } of dirs.slice(0, 6)) {
    const fr2 = { d: d2, x: d, y: cross(d2, d) };
    const hs = breakpoints(inStrip, d2, tol);
    if (hs.length > MAX_LEVELS) { why.push(`along ${dirName(d2)}: too many levels`); continue; }
    const layers = [];
    let bad = null;
    for (let k = 0; k + 1 < hs.length && !bad; k++) {
      if (hs[k + 1] - hs[k] < tol * 10) continue;
      const m = (hs[k] + hs[k + 1]) / 2;
      const sec = sectionAt(inStrip, fr2, m, tol);
      if (sec.why) { bad = sec.why; break; }
      if (sec.approx) { bad = "a freeform edge"; break; }
      const kept = clipBand(sec.segs, z0, z1, tol);
      if (kept.some((s) => !s.band && s.face && !isWall(s.face, d2))) { bad = `it slants along ${dirName(d2)} too`; break; }
      const rg = regionsOf(kept, tol, `${dirName(d2)} ${m.toFixed(3)}`);
      if (rg.why) { bad = rg.why; break; }
      const last = layers[layers.length - 1];
      if (last && last.key === rg.key && Math.abs(last.z1 - hs[k]) < tol * 10) last.z1 = hs[k + 1];
      else layers.push({ z0: hs[k], z1: hs[k + 1], regions: rg.regions, key: rg.key });
    }
    if (bad) { why.push(`along ${dirName(d2)}: ${bad}`); continue; }
    const solid = layers.filter((g) => g.regions.length);
    if (!solid.length) { why.push(`along ${dirName(d2)}: nothing in the strip`); continue; }
    return { d2, fr2, layers: solid };
  }
  return { why: why[0] || "no direction across it" };
}
const isWall = (f, d) => {
  const s = f.surface;
  return (s.type === "plane" && perpendicular(s.z, d)) || (s.type === "cylinder" && parallel(s.z, d));
};

// ---------------------------------------------------------------- holes

// Holes drilled at the end: every hole (any axis) whose mouths are whole
// rings in the faces it opens through. Those rings come out of their faces
// and the hole's own faces are dropped, so the body sections as if solid
// there; the cutters go back on afterwards.
function fillHoles(solid, tol) {
  const cut = turnedCutters(solid, [0, 0, 1], tol, { all: true });
  if (cut.why || !cut.cutters.length) return { faces: solid.faces, cutters: [] };
  const owners = new Map();
  for (const f of solid.faces) for (const l of f.loops) for (const e of l.edges) {
    if (e.id == null) continue;
    if (!owners.has(e.id)) owners.set(e.id, new Set());
    owners.get(e.id).add(f);
  }
  const drop = new Set(), dropLoops = new Set(), cutters = [];
  for (const c of cut.cutters) {
    const mine = new Set(c.stack);
    const mouths = new Set();
    for (const f of c.stack) for (const l of f.loops) for (const e of l.edges) for (const g of owners.get(e.id) || []) if (!mine.has(g)) mouths.add(e.id);
    // each mouth: a whole loop of the face it opens through
    const rings = [];
    let ok = true;
    for (const f of solid.faces) {
      if (mine.has(f)) continue;
      for (const l of f.loops) {
        const hits = l.edges.filter((e) => mouths.has(e.id)).length;
        if (!hits) continue;
        if (hits !== l.edges.length || l.outer) { ok = false; break; }
        rings.push(l);
      }
      if (!ok) break;
    }
    if (!ok) continue;
    for (const f of c.stack) drop.add(f);
    for (const l of rings) dropLoops.add(l);
    cutters.push(c);
  }
  const faces = solid.faces.filter((f) => !drop.has(f)).map((f) => (f.loops.some((l) => dropLoops.has(l)) ? { ...f, loops: f.loops.filter((l) => !dropLoops.has(l)) } : f));
  return { faces, cutters };
}

// ---------------------------------------------------------------- the body

export function trySliced(solid, d, { approx = false } = {}) {
  const B = boundsOf(solid);
  const tol = Math.max(1e-6, B.size * 1e-7);
  const fr = frameFor(d);
  // (the close version keeps its holes in each layer's outline: its layers
  // are a group, never unioned or cut, so it builds in a blink)
  const { faces, cutters } = approx ? { faces: solid.faces, cutters: [] } : fillHoles(solid, tol);
  const hs = breakpoints(faces, d, tol);
  if (hs.length < 2) return { why: "no height to it" };
  if (hs.length > MAX_LEVELS) return { why: `${hs.length} levels along ${dirName(d)}` };
  // each gap between two levels: its section, constant or not
  const gaps = [];
  for (let k = 0; k + 1 < hs.length; k++) {
    const z0 = hs[k], z1 = hs[k + 1], m = (z0 + z1) / 2;
    const sec = sectionAt(faces, fr, m, tol);
    if (sec.why) return { why: `${dirName(d)} ${num4(m)}: ${sec.why}` };
    gaps.push({ z0, z1, sec });
  }
  if (!gaps.some((g) => g.sec.varying)) return { why: "nothing slants (the plain extrude covers it)" };
  const groups = [], extra = [];
  let pieces = 0, approxUsed = false;
  const notes = [];
  const pushLayer = (z0, z1, rg) => {
    const last = groups[groups.length - 1];
    if (last && last.key === rg.key && Math.abs(last.z1 - z0) < tol * 10) { last.z1 = z1; return; }
    groups.push({ z0, z1, regions: rg.regions, key: rg.key });
  };
  for (let i = 0; i < gaps.length;) {
    const g = gaps[i];
    if (!g.sec.varying) {
      if (g.sec.approx && !approx) return { why: "a freeform edge in a straight run" };
      if (g.sec.approx) approxUsed = true;
      // (a freeform edge's crossing is read off its sampled points: a hair
      // off the exact cut of the face beside it, so ends join looser)
      const rg = regionsOf(g.sec.segs, tol, `${dirName(d)} ${num4((g.z0 + g.z1) / 2)}`, g.sec.approx ? B.size * 2e-3 : tol * 50);
      if (rg.why) return { why: rg.why };
      pushLayer(g.z0, g.z1, rg);
      i++;
      continue;
    }
    // a run of changing gaps: one strip, rebuilt across d (or each gap on its own)
    let j = i;
    while (j < gaps.length && gaps[j].sec.varying) j++;
    const tries = [[i, j], ...(j - i > 1 ? Array.from({ length: j - i }, (_, k) => [i + k, i + k + 1]) : [])];
    const whole = crossStrip(faces, d, gaps[i].z0, gaps[j - 1].z1, tol, B);
    const parts = whole.why && j - i > 1 ? tries.slice(1).map(([a, b]) => crossStrip(faces, d, gaps[a].z0, gaps[b - 1].z1, tol, B)) : [whole];
    const done = parts.every((p) => !p.why);
    if (done) {
      for (const p of parts) {
        const on = `{ normal: ${pt3(p.d2)}, x: ${pt3(d)} }`;
        for (const L of p.layers) for (const rg of L.regions) {
          extra.push(`linearExtrude({ h: ${num4(L.z1 - L.z0)}, start: ${num4(L.z0)}, on: ${on} }, ${profileCode(rg)})`);
          pieces++;
        }
      }
      // the strip reads as a layer gap to the layers either side
      groups.push({ z0: gaps[i].z0, z1: gaps[j - 1].z1, regions: [], key: `strip${i}` });
    } else if (approx) {
      // thin layers, each its own mid-height section
      const z0 = gaps[i].z0, z1 = gaps[j - 1].z1;
      const n = Math.max(2, Math.min(32, Math.ceil((z1 - z0) / (B.size * 0.002))));
      for (let k = 0; k < n; k++) {
        const a = z0 + (z1 - z0) * k / n, b = z0 + (z1 - z0) * (k + 1) / n;
        const sec = sectionAt(faces, fr, (a + b) / 2, tol);
        if (sec.why) return { why: sec.why };
        const rg = regionsOf(sec.segs, tol, `${dirName(d)} ${num4((a + b) / 2)}`, sec.approx ? B.size * 2e-3 : tol * 50);
        if (rg.why) return { why: rg.why };
        groups.push({ z0: a, z1: b, regions: rg.regions, key: `approx${i}-${k}` });
      }
      approxUsed = true;
      notes.push(`${num4(z0)} to ${num4(z1)} along ${dirName(d)} in ${n} steps`);
    } else return { why: `the part from ${dirName(d)} ${num4(gaps[i].z0)} to ${num4(gaps[j - 1].z1)} slants every way tried (${(parts.find((p) => p.why) || whole).why})` };
    i = j;
  }
  const solidGroups = groups.filter((g) => g.regions.length);
  pieces += solidGroups.reduce((n, g) => n + g.regions.length, 0);
  if (!pieces) return { why: "no material" };
  if (pieces > (approx ? MAX_PIECES * 5 : MAX_PIECES)) return { why: `it would take ${pieces} pieces` };
  if (approxUsed) {
    // the close version: every layer and piece on its own, in a group
    const on = placementFor([0, 0, 0], d, fr.x);
    const layers = solidGroups.flatMap((g) => g.regions.map((rg) => `linearExtrude({ h: ${num4(g.z1 - g.z0)}${num(g.z0) === "0" ? "" : `, start: ${num4(g.z0)}`}${on ? `, on: ${on}` : ""} }, ${profileCode(rg)})`));
    const all = [...layers, ...extra];
    return { kind: "extrude", expr: all.length === 1 ? all[0] : `group(\n  ${all.join(",\n  ")},\n)`, dials: [], approx: true, group: true, note: notes.join("; ") || null };
  }
  const out = emitExtrude(solidGroups, fr, tol, "region", null, cutters, extra);
  return { ...out, kind: "extrude", approx: false, note: null };
}

function profileCode(rg) {
  const outer = loopCodeOf(rg.outer, true);
  return rg.holes.length ? `region2d(${outer}, ${rg.holes.map((h) => loopCodeOf(h, false)).join(", ")})` : outer;
}
const loopCodeOf = (loop, ccw) => loopCode(loop, ccw).code;
const num4 = (v) => num(v);
const pt3 = (p) => `[${num(p[0])}, ${num(p[1])}, ${num(p[2])}]`;
