// Image -> 2D outline you can extrude. Fully client-side:
//   threshold to a binary mask -> marching-squares contours -> simplify
//   (Douglas-Peucker) -> classify outers vs holes -> scale to millimetres.
//
// The output is plain polygon point rings, which the viewer turns into
// BREPcode (linearExtrude of the outers, minus the holes). Good for logos,
// silhouettes, stencils, and hand-drawn shapes.

// ---- binary mask -------------------------------------------------------

export function toMask(imageData, { threshold = 128, invert = false } = {}) {
  const { width: w, height: h, data } = imageData;
  const mask = new Uint8Array((w + 2) * (h + 2));   // 1px empty border so edge shapes close
  const W = w + 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // treat transparent as empty; otherwise dark-on-light unless inverted
      const on = a > 24 && (invert ? lum > threshold : lum < threshold);
      if (on) mask[(y + 1) * W + (x + 1)] = 1;
    }
  }
  return { mask, W, H: h + 2 };
}

// ---- marching squares --------------------------------------------------
//
// Walk the boundary between solid and empty cells, emitting one segment per
// crossed cell edge, then link segments end-to-end into closed loops.

// Undirected-adjacency marching squares: every crossed cell contributes
// undirected edges between edge-midpoints; then we walk each midpoint's
// degree-2 chain into a closed loop. Direction-agnostic, so it can't produce
// the stray chords a hand-signed segment table does.
export function marchingSquares(mask, W, H) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mask[y * W + x]);
  const adj = new Map();   // "x,y" (doubled coords) -> [neighbour keys]
  const addEdge = (a, b) => {
    const ka = `${a[0]},${a[1]}`, kb = `${b[0]},${b[1]}`;
    (adj.get(ka) || adj.set(ka, []).get(ka)).push(kb);
    (adj.get(kb) || adj.set(kb, []).get(kb)).push(ka);
  };
  // case -> pairs of crossed midpoints (T top, R right, B bottom, L left)
  const PAIRS = {
    1: [["L", "B"]], 2: [["B", "R"]], 3: [["L", "R"]], 4: [["R", "T"]],
    5: [["T", "R"], ["B", "L"]], 6: [["T", "B"]], 7: [["T", "L"]], 8: [["T", "L"]],
    9: [["T", "B"]], 10: [["T", "L"], ["B", "R"]], 11: [["T", "R"]], 12: [["L", "R"]],
    13: [["B", "R"]], 14: [["L", "B"]],
  };

  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      const mid = {
        T: [2 * x + 1, 2 * y], R: [2 * x + 2, 2 * y + 1],
        B: [2 * x + 1, 2 * y + 2], L: [2 * x, 2 * y + 1],
      };
      for (const [a, b] of PAIRS[c]) addEdge(mid[a], mid[b]);
    }
  }

  const used = new Set();
  const ek = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const loops = [];
  for (const start of adj.keys()) {
    for (const first of adj.get(start)) {
      if (used.has(ek(start, first))) continue;
      const loop = [start];
      used.add(ek(start, first));
      let prev = start, cur = first, guard = 0;
      while (cur !== start && guard++ < adj.size * 2 + 8) {
        loop.push(cur);
        let next = null;
        for (const n of (adj.get(cur) || [])) {
          if (n === prev) continue;
          if (used.has(ek(cur, n))) continue;
          next = n; break;
        }
        if (next === null) break;   // open chain (shouldn't happen on a closed mask)
        used.add(ek(cur, next));
        prev = cur; cur = next;
      }
      if (cur === start && loop.length >= 4) {
        loops.push(loop.map((k) => { const [px, py] = k.split(",").map(Number); return [px / 2, py / 2]; }));
      }
    }
  }
  return loops;
}

// ---- Douglas-Peucker simplification -----------------------------------

function rdp(points, eps) {
  if (points.length < 3) return points;
  let maxD = 0, idx = 0;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function pointInPoly(pt, poly) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export { rdp, signedArea, pointInPoly };

// ---- rings -> one extruded solid ---------------------------------------
//
// Outer rings plus hole rings (millimetres, any winding) extruded straight up
// from z=0 to z=height, as ONE watertight ASCII STL. Each hole is cut from the
// smallest outer that holds it, and each face is triangulated with three's
// earcut. A single mesh means a single import: the letters of a name tag are
// one solid, not a union of one extrusion per letter minus one per counter.
//
// Walls take their winding from the ring (outer CCW, hole CW), so every
// normal points out of the material and the top, bottom and walls share their
// vertices exactly: the shell is closed with no welding needed.
export function ringsToPrismStl(outers, holes, height, triangulate) {
  const ccw = (r) => (signedArea(r) >= 0 ? r : [...r].reverse());
  const cw = (r) => (signedArea(r) <= 0 ? r : [...r].reverse());
  const shapes = outers.map((o) => ({ outer: ccw(o), holes: [], area: Math.abs(signedArea(o)) }));
  for (const h of holes) {
    let best = null;
    for (const s of shapes) if (pointInPoly(h[0], s.outer) && (!best || s.area < best.area)) best = s;
    if (best) best.holes.push(cw(h));
  }
  const F = [];
  const v = (p, z) => `vertex ${p[0]} ${p[1]} ${z}`;
  const tri = (a, b, c) => F.push(`facet normal 0 0 0\nouter loop\n${a}\n${b}\n${c}\nendloop\nendfacet`);
  for (const s of shapes) {
    const pts = [s.outer, ...s.holes].flat();
    for (let [a, b, c] of triangulate(s.outer, s.holes)) {
      const A = pts[a], B = pts[b], C = pts[c];
      // earcut's winding is not promised: make every top triangle CCW
      if ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) < 0) [b, c] = [c, b];
      tri(v(pts[a], height), v(pts[b], height), v(pts[c], height));
      tri(v(pts[a], 0), v(pts[c], 0), v(pts[b], 0));
    }
    for (const ring of [s.outer, ...s.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        tri(v(a, 0), v(b, 0), v(b, height));
        tri(v(a, 0), v(b, height), v(a, height));
      }
    }
  }
  if (!F.length) throw new Error("nothing to extrude");
  return `solid rings\n${F.join("\n")}\nendsolid rings\n`;
}

// ---- top level ---------------------------------------------------------
//
// Returns { outers: [[ [x,y], ... ] ], holes: [...] } in millimetres, Y-up,
// fit to `size` mm on the longer axis, centred on the origin.

export function traceImage(imageData, opts = {}) {
  const { threshold = 128, invert = false, size = 60, simplify = 1.3, minArea = 12 } = opts;
  const { mask, W, H } = toMask(imageData, { threshold, invert });
  let loops = marchingSquares(mask, W, H)
    .map((lp) => rdp(lp, simplify))
    .filter((lp) => lp.length >= 3 && Math.abs(signedArea(lp)) >= minArea);
  if (!loops.length) return { outers: [], holes: [], count: 0 };

  // fit to mm, flip Y (image Y grows downward), centre on origin
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const lp of loops) for (const [x, y] of lp) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const s = size / span;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const round = (v) => Math.round(v * 100) / 100;
  loops = loops.map((lp) => lp.map(([x, y]) => [round((x - cx) * s), round((cy - y) * s)]));

  // classify: a loop nested inside an odd number of others is a hole
  const outers = [], holes = [];
  for (const lp of loops) {
    const probe = lp[0];
    let depth = 0;
    for (const other of loops) {
      if (other === lp) continue;
      if (pointInPoly(probe, other)) depth++;
    }
    (depth % 2 === 1 ? holes : outers).push(lp);
  }
  return { outers, holes, count: loops.length };
}

// ---- code generation ---------------------------------------------------

const fmtRing = (pts) => `polygon([${pts.map(([x, y]) => `[${x}, ${y}]`).join(", ")}])`;

export function contoursToCode({ outers, holes }, height = 4) {
  if (!outers.length) return null;
  const solid = outers.length === 1
    ? `linearExtrude({ h: ${height} }, ${fmtRing(outers[0])})`
    : `union(\n${outers.map((o) => `  linearExtrude({ h: ${height} }, ${fmtRing(o)})`).join(",\n")}\n)`;
  if (!holes.length) return solid;
  // the cutters must overshoot BOTH faces (start below z=0, end above z=h),
  // or a thin membrane is left capping the hole
  const cut = holes.map((hh) => `  translate([0, 0, -1], linearExtrude({ h: ${height + 2} }, ${fmtRing(hh)}))`).join(",\n");
  return `difference(\n  ${solid.replace(/\n/g, "\n  ")},\n${cut}\n)`;
}

// ---- a picture as exact geometry (the chat's image()) -------------------
//
// A picture attached in the chat used to reach the AI as pixels only, and
// the AI redrew it with polygon() points by eye: a logo cut into the back of
// a phone stand came out jumbled. Now the app traces it here and the AI gets
// image("img-…"), a finished solid, and only has to place it.

// Otsu's threshold over the opaque pixels' brightness, and which side is the
// ink: the smaller of the two (a dark logo on white, or a white mark on a
// dark photo), unless the picture has a transparent background, where the
// opaque pixels are the ink whatever their colour.
export function autoMask(imageData) {
  const { width: w, height: h, data } = imageData;
  const hist = new Array(256).fill(0);
  let opaque = 0, clear = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 24) { clear++; continue; }
    opaque++;
    hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
  }
  if (!opaque) return { threshold: 128, invert: false, alpha: false };
  // a cut-out logo on a transparent background: the shape IS the opaque part
  if (clear > 0.15 * w * h) return { threshold: 256, invert: false, alpha: true };
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = opaque - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t + 0.5; }
  }
  let dark = 0;
  for (let t = 0; t < threshold; t++) dark += hist[t];
  return { threshold, invert: dark > opaque / 2, alpha: false };
}

// contours -> one solid: every loop nested inside an even number of others
// is ink, an odd number is a hole cut through the ink around it. Built from
// polygon() + linearExtrude(), so it stays on the exact kernel.
export function contoursToSolid(dsl, { outers, holes }, { height = 1, mode } = {}) {
  const deboss = mode === "deboss";
  const H = height + (deboss ? 0.4 : 0);
  const loops = [...outers, ...holes].map((pts) => ({ pts, depth: 0 }));
  for (const a of loops) for (const b of loops) if (a !== b && pointInPoly(a.pts[0], b.pts)) a.depth++;
  const solids = loops.filter((l) => l.depth % 2 === 0).map((outer) => {
    const body = dsl.linearExtrude({ h: H }, dsl.polygon(outer.pts));
    const cuts = loops.filter((h) => h.depth === outer.depth + 1 && pointInPoly(h.pts[0], outer.pts));
    if (!cuts.length) return body;
    return dsl.difference(body, ...cuts.map((h) => dsl.translate([0, 0, -0.1], dsl.linearExtrude({ h: H + 0.2 }, dsl.polygon(h.pts)))));
  });
  if (!solids.length) throw new Error("image(): nothing to trace in that picture (try invert: true)");
  const shape = solids.length === 1 ? solids[0] : dsl.union(...solids);
  return deboss ? dsl.translate([0, 0, -0.2], shape) : shape;
}

// image(): the traced picture as a solid, `size` mm across its longer side,
// centred on the origin in XY, from z = 0 up to `height`. threshold/invert
// override the automatic reading; detail (0.5-4) trades points for fidelity.
export function imageSolid(dsl, imageData, o = {}) {
  const auto = autoMask(imageData);
  const threshold = o.threshold ?? auto.threshold;
  const invert = o.invert ?? auto.invert;
  const c = auto.alpha && o.threshold == null && o.invert == null
    ? traceImage(alphaOnly(imageData), { threshold: 128, invert: false, size: o.size ?? 30, simplify: o.detail ?? 0.8, minArea: o.minArea ?? 12 })
    : traceImage(imageData, { threshold, invert, size: o.size ?? 30, simplify: o.detail ?? 0.8, minArea: o.minArea ?? 12 });
  return contoursToSolid(dsl, c, { height: o.height ?? o.depth ?? 1, mode: o.mode });
}
// opaque pixels black, clear ones white: what toMask reads as ink
function alphaOnly({ width, height, data }) {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i + 3] > 24 ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return { width, height, data: out };
}
