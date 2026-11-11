// The outline a cutter is made from, worked out from a drawing.
//
// An icon is not an outline. It is a pile of filled pieces and stroked lines:
// a cat's head, two eyes, six whiskers, sometimes the same shape twice in two
// tones. Handing each piece to the cutter kit as its own blade is what put
// blades across the inside of the cutter and loose slivers on the plate beside
// it (a whisker 0.4 mm wide has no inside to cut round, so only its rim
// survived, as a flat shard).
//
// So the drawing is reduced here, in 2D, before any code is written:
//
//   inkLoops       everything drawn (fills, and strokes at their real width),
//                  fused into one region, scaled to millimetres
//   cutterOutline  the SILHOUETTE of that: gaps too narrow for dough bridged,
//                  holes filled, anything too thin to print as a blade taken
//                  off, corners rounded, crumbs dropped. Plus, for a stamp, the
//                  detail that sits inside it.
//
// The 2D work is Clipper2, through manifold-3d's CrossSection, which the app
// already ships. Nothing here touches the DOM, so node can test it.

const area2 = (p) => {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) { const u = p[i], v = p[(i + 1) % n]; a += u[0] * v[1] - v[0] * u[1]; }
  return a;
};
// counter-clockwise adds ink, clockwise takes it away: every loop is wound to
// say which it is, so one "Positive" fill unions the lot
const wind = (p, ccw) => ((area2(p) > 0) === ccw ? p : p.slice().reverse());
const disc = ([cx, cy], r, n = 10) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});

let crossPromise = null;
export function loadCross() {
  crossPromise ??= (async () => {
    const Module = (await import("manifold-3d")).default;
    const wasm = await Module();
    wasm.setup();
    return wasm.CrossSection;
  })();
  return crossPromise;
}

// wasm objects are not garbage collected: everything made on the way is
// handed to `bin` and freed together
const scope = (fn) => {
  const bin = [];
  const k = (cs) => { bin.push(cs); return cs; };
  try { return fn(k); } finally { for (const cs of bin) { try { cs.delete(); } catch { /* already gone */ } } }
};

// parts: { fills: [[outer, ...holes]], strokes: [{ points, width, closed }], box }
// in the drawing's own units, y down (viewer/svg.js svgParts). Returns loops
// { hole, points } in mm, centred, y up, longest side `maxSize`: the drawing's
// ink as one region, no loop overlapping another.
export function inkLoops(CS, parts, { maxSize = 70 } = {}) {
  const polys = [];
  for (const f of parts.fills || []) f.forEach((p, i) => { if (p.length >= 3 && area2(p) !== 0) polys.push(wind(p, i === 0)); });
  for (const s of parts.strokes || []) {
    const hw = Math.max(+s.width || 0, 1e-3) / 2, p = s.points, n = p.length;
    for (let i = 0, last = s.closed ? n : n - 1; i < last; i++) {
      const a = p[i], b = p[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-9) continue;
      const nx = (-dy / L) * hw, ny = (dx / L) * hw;
      polys.push(wind([[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]], true));
    }
    for (const c of p) polys.push(disc(c, hw));          // round joints and ends
  }
  if (!polys.length) throw new Error("nothing is drawn in that picture, so there is no shape to cut around");
  return scope((k) => {
    let ink = k(new CS(polys, "Positive"));
    // only what shows through the picture's frame (parts.box: x0, y0, x1, y1)
    const f = parts.box;
    if (f) ink = k(ink.intersect([[f[0], f[1]], [f[2], f[1]], [f[2], f[3]], [f[0], f[3]]]));
    if (ink.isEmpty()) throw new Error("nothing is drawn in that picture, so there is no shape to cut around");
    const b = ink.bounds();
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
    const s = maxSize / Math.max(w, h, 1e-9), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    return k(ink.simplify(0.03 / s)).toPolygons().filter((p) => p.length >= 3).map((p) => ({
      hole: area2(p) < 0,
      // y is flipped because SVG counts downwards and the plate does not; the
      // points are reversed with it, so a loop still winds the way it did
      points: p.map(([x, y]) => [+((x - cx) * s).toFixed(3), +(-(y - cy) * s).toFixed(3)]).reverse(),
    }));
  });
}

// offset() for the OpenSCAD translator (src/openscad.js setPolygonOffsetter):
// the same grow or shrink, but with the crossings resolved, so a rim grown
// round a tight notch has no inside-out loop to extrude as a spur. The biggest
// piece is the answer; nothing left is null, and the translator's own takes over.
export const makeOffsetter = (CS) => (pts, amount, fn = 24, rounded = true) => {
  try {
    return scope((k) => {
      const grown = k(k(new CS([wind(pts, true)], "Positive")).offset(amount, rounded ? "Round" : "Miter", 4, Math.max(12, +fn || 24)));
      const all = grown.toPolygons().filter((p) => p.length >= 3 && area2(p) > 0).sort((a, b) => area2(b) - area2(a));
      return all.length ? all[0].map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) : null;
    });
  } catch { return null; }
};

export const OUTLINE = {
  wall: 0.9,      // the blade
  bridge: 1.5,    // gaps under 3 mm close up: dough does not go into them, and two blades that near are one lump
  thin: 1.2,      // anything under 2.4 mm across goes: a blade each side leaves no opening
  crumb: 0.04,    // a separate piece under 4 % of the biggest is a speck, not a second cutter
  detail: 0.35,   // stamp detail under 0.7 mm does not print
};

// A region with holes, as pieces without any: each hole is cut across its
// middle, the two sides overlapping by a hair so they build as one body. The
// kit's code has no way to say "a polygon with a hole", and the exact kernel
// refuses the cut that would make one.
function withoutHoles(CS, k, region, out, depth = 0) {
  for (const part of region.decompose().map(k)) {
    const polys = part.toPolygons();
    const hole = polys.find((p) => area2(p) < 0);
    if (!hole || depth > 10) { for (const p of polys) if (area2(p) > 0) out.push(p); continue; }
    let lo = Infinity, hi = -Infinity;
    for (const [, y] of hole) { if (y < lo) lo = y; if (y > hi) hi = y; }
    const yc = (lo + hi) / 2, b = part.bounds();
    const box = (y0, y1) => [[b.min[0] - 1, y0], [b.max[0] + 1, y0], [b.max[0] + 1, y1], [b.min[0] - 1, y1]];
    withoutHoles(CS, k, k(part.intersect(box(b.min[1] - 1, yc + 0.06))), out, depth + 1);
    withoutHoles(CS, k, k(part.intersect(box(yc - 0.06, b.max[1] + 1))), out, depth + 1);
  }
}

// loops (mm, at the size it will be printed) -> { loops, pieces, dropped }.
// loops: the silhouette pieces, biggest first, as { hole: false }, then (with
// detail: true) the stamp's raised detail as { hole: true }, which is where
// cutterkit's stamp looks for it.
export function cutterOutline(CS, loops, opts = {}) {
  const o = { ...OUTLINE, ...opts };
  const src0 = (loops || []).filter((l) => l.points?.length >= 3).map((l) => wind(l.points, !l.hole));
  if (!src0.length) return { loops: [], pieces: 0, dropped: 0 };
  return scope((k) => {
    const round = (cs, d) => k(cs.offset(d, "Round", 2, 24));
    const ink = k(new CS(src0, "Positive"));
    // closed: near pieces fuse, narrow notches fill, inside corners round
    const closed = round(round(ink, o.bridge), -o.bridge);
    // filled: a cutter cuts round the outside; what is inside is the stamp's
    const filled = k(new CS(closed.toPolygons().filter((p) => area2(p) > 0), "Positive"));
    // opened: what is too thin for a blade goes, outside corners round
    const opened = k(round(round(filled, -o.thin), o.thin).simplify(0.05));
    const all = opened.toPolygons().filter((p) => area2(p) > 0).sort((a, b) => area2(b) - area2(a));
    const floor = all.length ? Math.max(40, area2(all[0]) * o.crumb) : 0;   // area2 is twice the area: 20 mm² at least
    const kept = all.filter((p) => area2(p) >= floor);
    const fix = (p) => p.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
    const out = kept.map((p) => ({ hole: false, points: fix(p) }));
    if (o.detail > 0 && opts.detail !== false && kept.length) {
      // the stamp plate sits 0.5 inside the blade; detail keeps 1.2 off its edge
      const inner = round(k(new CS(kept, "Positive")), -(o.wall / 2 + 0.5 + 1.2));
      const drawn = k(ink.intersect(inner));
      // raise whichever is the smaller part of the picture: the lines of a
      // line drawing, the eyes and mouth of a filled one
      const raw = drawn.area() > 0.5 * inner.area() ? k(inner.subtract(ink)) : drawn;
      const det = k(round(round(raw, -o.detail), o.detail).simplify(0.05));
      const bits = [];
      if (det.area() > 2) withoutHoles(CS, k, det, bits);
      bits.sort((a, b) => area2(b) - area2(a));
      for (const p of bits.slice(0, 40)) if (area2(p) > 1) out.push({ hole: true, points: fix(p) });
    }
    return { loops: out, pieces: kept.length, dropped: all.length - kept.length };
  });
}
