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
