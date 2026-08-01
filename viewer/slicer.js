// A slicer that does ONE thing: brick-staggered perimeters.
//
// Not a competitor to Orca and not trying to be. Orca has a decade of tuning
// and a thousand settings; this has a handful, and it exists because of a
// feature none of them expose — perimeters that interlock like brickwork
// instead of stacking in straight vertical seams.
//
// WHY THE OUTER WALL DOES NOT MOVE. The obvious reading of "stagger every
// layer" is to shift all the walls, and it is wrong: shifting the outermost
// one makes the part's own surface ripple in and out by half a bead, which
// both looks like corduroy and puts the finished dimension half a bead off on
// alternate layers. So the outer wall sits at a fixed offset — the surface and
// the tolerance stay exactly where they belong — and the INNER walls alternate.
// The interlock happens where it does any good, inside the shell, and costs
// nothing where it would do harm.
//
// Everything here is a MESH operation. It never touches the CAD kernel, so it
// cannot slow a build down, and the module is loaded on demand — nobody who
// never slices anything pays for it.
//
// NB build-site.mjs rewrites the /node_modules path below for the static site.

let clipperReady = null;

// Test hook: node has no window, so the suite injects ClipperLib itself
// (same pattern as curved.js/_setReplicad and simplify.js/_setSimplifier).
export function _setClipper(c) {
  clipperReady = Promise.resolve(c);
}

const getClipper = () => (clipperReady ??= import("/node_modules/clipper-lib/clipper.js")
  .then(() => globalThis.ClipperLib));

// Clipper is integer-only — it works in scaled fixed point, and feeding it
// millimetres directly quantises every coordinate to the nearest 1mm, which
// turns a 0.4mm wall into nothing at all.
const SCALE = 1000;
const toClip = (pts) => pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
const fromClip = (path) => path.map((p) => [p.X / SCALE, p.Y / SCALE]);

// ---------------------------------------------------------------- slicing

// Every triangle crossing z, as a loose set of 2D segments.
export function sliceTriangles(tris, z) {
  const segs = [];
  for (const t of tris) {
    const d = [t[0][2] - z, t[1][2] - z, t[2][2] - z];
    const hit = [];
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3], da = d[e], db = d[(e + 1) % 3];
      if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) continue;
      const f = da / (da - db);
      hit.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    if (hit.length === 2 && Math.hypot(hit[1][0] - hit[0][0], hit[1][1] - hit[0][1]) > 1e-9) {
      segs.push(hit);
    }
  }
  return segs;
}

// Segments -> closed loops. A watertight mesh gives every segment exactly one
// neighbour at each end, so this is a walk rather than a search.
export function chainLoops(segs, tol = 1e-3) {
  const key = (p) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
  const ends = new Map();
  segs.forEach((s, i) => {
    for (const e of [0, 1]) {
      const k = key(s[e]);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push([i, e]);
    }
  });
  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const loop = [segs[i][0], segs[i][1]];
    for (;;) {
      const nxt = (ends.get(key(loop[loop.length - 1])) || []).find(([j]) => !used[j]);
      if (!nxt) break;
      used[nxt[0]] = true;
      loop.push(segs[nxt[0]][1 - nxt[1]]);
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

// --------------------------------------------------------------- booleans

async function boolOp(subject, clip, type, fill) {
  const C = await getClipper();
  const c = new C.Clipper();
  if (subject.length) c.AddPaths(subject.map(toClip), C.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip.map(toClip), C.PolyType.ptClip, true);
  const out = new C.Paths();
  const f = fill ?? C.PolyFillType.pftNonZero;
  c.Execute(type, out, f, f);
  return out.map(fromClip).filter((p) => p.length > 2);
}

// Raw slice loops come out of chainLoops in whatever direction the triangles
// happened to run — on a box with a hole through it the outer loop is CW and
// the hole CCW, the opposite of what every boolean below assumes. A union
// under the even-odd rule states the region without caring about direction,
// and Clipper hands the answer back in its own convention: outers CCW, holes
// CW. So this is the one call that has to come first.
export async function normalizeLoops(loops) {
  const C = await getClipper();
  return boolOp(loops, [], C.ClipType.ctUnion, C.PolyFillType.pftEvenOdd);
}

export async function differenceLoops(a, b) {
  if (!a.length) return [];
  if (!b.length) return a;
  const C = await getClipper();
  return boolOp(a, b, C.ClipType.ctDifference);
}

export async function intersectLoops(a, b) {
  if (!a.length || !b.length) return [];
  const C = await getClipper();
  return boolOp(a, b, C.ClipType.ctIntersection);
}

export async function unionLoops(a, b) {
  if (!a.length) return b;
  if (!b.length) return a;
  const C = await getClipper();
  return boolOp(a, b, C.ClipType.ctUnion);
}

// ------------------------------------------------------------- offsetting

// Inset (negative delta) or outset the loops. Clipper handles the part people
// get wrong by hand: when a wall is thinner than twice the offset the region
// collapses and must DISAPPEAR rather than turn inside out.
export async function offsetLoops(loops, delta) {
  if (!loops.length) return [];
  if (delta === 0) return loops;
  const C = await getClipper();
  const co = new C.ClipperOffset(2, 0.25);
  co.AddPaths(loops.map(toClip), C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, delta * SCALE);
  return out.map(fromClip).filter((p) => p.length > 2);
}

// Shrink then grow by the same amount. Anything narrower than 2r cannot
// survive the shrink, so it vanishes — which is how you get rid of the
// hairline slivers that a difference between two near-identical layers
// leaves behind, without disturbing anything of real size.
export async function openLoops(loops, r) {
  if (!loops.length || r <= 0) return loops;
  const shrunk = await offsetLoops(loops, -r);
  if (!shrunk.length) return [];
  return offsetLoops(shrunk, r);
}

// Drop points that land on top of the one before them.
//
// Clipper works in integer microns, so two points closer together than that
// become a zero-length segment — which is not a shape it has any definition
// for, and it does not fail cleanly on them: a single degenerate segment sent
// one 40mm layer of gyroid into an unbounded allocation. Marching squares
// produces them whenever the field is near zero exactly at a grid corner, so
// they are ordinary rather than exotic.
function dedupe(path) {
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const p = path[i], q = out[out.length - 1];
    if (Math.abs(p[0] - q[0]) > 1 / SCALE || Math.abs(p[1] - q[1]) > 1 / SCALE) out.push(p);
  }
  return out;
}

// Trim open polylines to a region, keeping only the parts inside it.
async function clipOpen(paths, region) {
  const clean = paths.map(dedupe).filter((p) => p.length >= 2);
  if (!clean.length || !region.length) return [];
  const C = await getClipper();
  const c = new C.Clipper();
  c.AddPaths(clean.map(toClip), C.PolyType.ptSubject, false);
  c.AddPaths(region.map(toClip), C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  c.Execute(C.ClipType.ctIntersection, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return C.Clipper.OpenPathsFromPolyTree(tree).map(fromClip).filter((p) => p.length >= 2);
}

// Loose segments -> polylines. Unlike chainLoops this keeps chains that never
// close, which is what a contour crossing a boundary gives you.
export function chainSegments(segs, tol = 1e-3) {
  const key = (p) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
  const ends = new Map();
  segs.forEach((s, i) => {
    for (const e of [0, 1]) {
      const k = key(s[e]);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push([i, e]);
    }
  });
  const used = new Array(segs.length).fill(false);
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain = [segs[i][0], segs[i][1]];
    for (;;) {
      const n = (ends.get(key(chain[chain.length - 1])) || []).find(([j]) => !used[j]);
      if (!n) break;
      used[n[0]] = true;
      chain.push(segs[n[0]][1 - n[1]]);
    }
    for (;;) {
      const n = (ends.get(key(chain[0])) || []).find(([j]) => !used[j]);
      if (!n) break;
      used[n[0]] = true;
      chain.unshift(segs[n[0]][1 - n[1]]);
    }
    out.push(chain);
  }
  return out;
}

// Greedy nearest-end ordering, flipping each run so its near end comes first.
// Not optimal — that is the travelling salesman — but it turns a random pile
// of curves into something that does not cross the part on every strand.
export function orderRuns(paths) {
  const left = paths.slice(), out = [];
  let at = null;
  while (left.length) {
    let pick = 0, flip = false, best = Infinity;
    if (at) {
      left.forEach((p, i) => {
        const da = Math.hypot(p[0][0] - at[0], p[0][1] - at[1]);
        const db = Math.hypot(p[p.length - 1][0] - at[0], p[p.length - 1][1] - at[1]);
        if (da < best) { best = da; pick = i; flip = false; }
        if (db < best) { best = db; pick = i; flip = true; }
      });
    }
    const p = left.splice(pick, 1)[0];
    if (flip) p.reverse();
    out.push(p);
    at = p[p.length - 1];
  }
  return out;
}

// ------------------------------------------------------------------ fill

// Parallel lines at angleDeg, clipped to the region, ordered so the nozzle
// snakes back and forth instead of returning to one side every time.
//
// The line positions are anchored to the ORIGIN rather than to the region's
// own bounding box: two layers of different size then put their infill on the
// same set of lines, so the strands stack on each other and actually bond,
// instead of drifting by half a spacing every layer.
export async function infillLines(region, spacing, angleDeg) {
  if (!region.length || !(spacing > 0) || !Number.isFinite(spacing)) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of region) {
    for (const [x, y] of p) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const R = Math.hypot(maxX - minX, maxY - minY) / 2 + spacing;

  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);      // along each line
  const nx = -dy, ny = dx;                        // across them
  const tc = cx * nx + cy * ny;
  const lines = [];
  for (let k = Math.ceil((tc - R) / spacing); k <= Math.floor((tc + R) / spacing); k++) {
    // Half a pitch off the grid, so each strand sits in the MIDDLE of its
    // band rather than on the edge of one. On a part whose wall happens to
    // land exactly on a grid line — an axis-aligned box is the obvious case —
    // the on-the-edge line clips to nothing and the layer comes out one
    // strand light, which is a whole percent of density at 10%.
    const t = (k + 0.5) * spacing;
    const px = nx * t, py = ny * t;               // point on the line nearest the origin
    const s = (cx - px) * dx + (cy - py) * dy;    // slide along it to face the region
    lines.push([
      [px + dx * (s - R), py + dy * (s - R)],
      [px + dx * (s + R), py + dy * (s + R)],
    ]);
  }
  if (!lines.length) return [];

  // open subject paths against a closed clip: the lines come back trimmed to
  // the region, already split around any holes
  const segs = await clipOpen(lines, region);

  // Group the strands into LANES before ordering them. A hole cuts every line
  // that passes it into two pieces, and simply zigzagging down the list then
  // hops the hole twice per line — on a tube that is dozens of crossings a
  // layer, every one of them a retraction. Strands that sit on consecutive
  // lines AND overlap along the line are reachable from each other without
  // crossing anything, so they belong to one lane; the slicer finishes a lane
  // before moving to the next, and the hole gets crossed once instead.
  const items = segs.map((s) => {
    const a = s[0][0] * dx + s[0][1] * dy;
    const b = s[s.length - 1][0] * dx + s[s.length - 1][1] * dy;
    return {
      s,
      // The lines sit at (k + 0.5) * spacing, so take the half back off
      // before rounding. Leaving it on lands every index exactly on a .5 tie,
      // where floating point decides which way it goes essentially at random
      // — neighbouring strands then get different lane numbers, no lane ever
      // grows, and the nozzle retracts between every single one of them.
      t: Math.round((s[0][0] * nx + s[0][1] * ny) / spacing - 0.5),
      lo: Math.min(a, b), hi: Math.max(a, b),
    };
  });
  items.sort((A, B) => A.t - B.t || A.lo - B.lo);

  const lanes = [];
  let prev = [], cur = [], curT = null;
  for (const it of items) {
    if (it.t !== curT) { prev = cur; cur = []; curT = it.t; }
    let lane = null;
    for (const L of prev) {
      const p = L[L.length - 1];
      if (p.t === it.t - 1 && p.lo < it.hi && it.lo < p.hi) { lane = L; break; }
    }
    if (lane) prev.splice(prev.indexOf(lane), 1);
    else { lane = []; lanes.push(lane); }
    lane.push(it);
    cur.push(lane);
  }

  // walk the lanes nearest-first, flipping each strand so its near end comes
  // first — which is what makes the path a boustrophedon rather than a comb
  const out = [];
  let at = null;
  const left = lanes.slice();
  while (left.length) {
    let pick = 0;
    if (at) {
      let best = Infinity;
      left.forEach((L, i) => {
        const e = L[0].s[0], f = L[L.length - 1].s[0];
        const d = Math.min(Math.hypot(e[0] - at[0], e[1] - at[1]),
          Math.hypot(f[0] - at[0], f[1] - at[1]));
        if (d < best) { best = d; pick = i; }
      });
    }
    for (const it of left.splice(pick, 1)[0]) {
      const s = it.s;
      if (at) {
        const da = Math.hypot(s[0][0] - at[0], s[0][1] - at[1]);
        const db = Math.hypot(s[s.length - 1][0] - at[0], s[s.length - 1][1] - at[1]);
        if (db < da) s.reverse();
      }
      out.push(s);
      at = s[s.length - 1];
    }
  }
  return out;
}

// ------------------------------------------------------- infill patterns

// Rings following the outline inward. Cheap, and the only pattern with no
// direction to it at all.
export async function concentricLines(region, spacing) {
  const out = [];
  let cur = await offsetLoops(region, -spacing / 2);
  for (let guard = 0; cur.length && guard < 500; guard++) {
    for (const p of cur) out.push([...p, p[0]]);
    cur = await offsetLoops(cur, -spacing);
  }
  return out;
}

// The gyroid: sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0.
//
// Worth the trouble because it is the one common pattern with no weak
// direction — every layer's cross-section runs a different way, so it braces
// the part in X, Y and Z about equally, and no two layers stack into a plane
// you can split. It also never crosses itself, so the nozzle is not driving
// over material it already laid.
//
// Extracted with marching squares rather than solved algebraically. The
// closed form needs acos, which goes undefined exactly at the folds where the
// curve turns around — precisely the places you must not drop — and handling
// that correctly is more code than marching the grid.
export function gyroidSegments(bounds, s, z, step) {
  const w = z / s, sinW = Math.sin(w), cosW = Math.cos(w);
  const f = (x, y) => {
    const u = x / s, v = y / s;
    return Math.sin(u) * Math.cos(v) + Math.sin(v) * cosW + sinW * Math.cos(u);
  };
  const nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / step));
  const ny = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / step));
  const segs = [];
  // one row of samples reused as the next row's bottom edge
  let row = new Float64Array(nx + 1);
  for (let i = 0; i <= nx; i++) row[i] = f(bounds.minX + i * step, bounds.minY);
  for (let j = 0; j < ny; j++) {
    const y0 = bounds.minY + j * step, y1 = y0 + step;
    const next = new Float64Array(nx + 1);
    for (let i = 0; i <= nx; i++) next[i] = f(bounds.minX + i * step, y1);
    for (let i = 0; i < nx; i++) {
      const x0 = bounds.minX + i * step, x1 = x0 + step;
      const a = row[i], b = row[i + 1], c = next[i + 1], d = next[i];
      const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      // Each crossing carries the ID of the grid edge it sits on. Neighbouring
      // cells share that edge exactly, so the pieces can be stitched by
      // integer identity instead of by comparing coordinates — which matters
      // because the two cells compute the same point through different
      // arithmetic, and a last-bit disagreement is enough to make a rounded
      // coordinate land in a different bucket. On a fine grid that shattered
      // the contour into thousands of fragments, and the ordering pass, being
      // quadratic in those, went from milliseconds to out-of-memory.
      const E = (e) => {
        if (e === 0) { const t = a / (a - b); return [[x0 + (x1 - x0) * t, y0], (j * (nx + 1) + i) * 2]; }
        if (e === 1) { const t = b / (b - c); return [[x1, y0 + (y1 - y0) * t], (j * (nx + 1) + i + 1) * 2 + 1]; }
        if (e === 2) { const t = c / (c - d); return [[x1 + (x0 - x1) * t, y1], ((j + 1) * (nx + 1) + i) * 2]; }
        const t = d / (d - a); return [[x0, y1 + (y0 - y1) * t], (j * (nx + 1) + i) * 2 + 1];
      };
      for (const [p, q] of MARCH[idx]) {
        const A = E(p), B = E(q);
        segs.push({ a: A[0], ka: A[1], b: B[0], kb: B[1] });
      }
    }
    row = next;
  }
  return segs;
}

// Stitch keyed segments into polylines by shared edge ID — exact, and linear
// in the number of segments.
export function chainKeyed(segs) {
  const ends = new Map();
  segs.forEach((sg, i) => {
    for (const k of [sg.ka, sg.kb]) {
      const at = ends.get(k);
      if (at) at.push(i); else ends.set(k, [i]);
    }
  });
  const used = new Array(segs.length).fill(false);
  const out = [];
  const grow = (key, push) => {
    for (;;) {
      const list = ends.get(key);
      const nx = list && list.find((j) => !used[j]);
      if (nx == null) return key;
      used[nx] = true;
      const t = segs[nx];
      const far = t.ka === key ? [t.b, t.kb] : [t.a, t.ka];
      push(far[0]);
      key = far[1];
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    // Both directions are collected by PUSHING and the backward half reversed
    // at the end. Growing a chain with unshift is quadratic — every insert
    // shifts the whole array — and a dense gyroid makes chains tens of
    // thousands of points long, which was enough to exhaust the heap.
    const fwd = [segs[i].b], back = [segs[i].a];
    grow(segs[i].kb, (p) => fwd.push(p));
    grow(segs[i].ka, (p) => back.push(p));
    back.reverse();
    out.push(back.concat(fwd));
  }
  return out;
}

// A grid fine enough to trace the curve, but never so fine that a big plate
// at a high density turns one layer into millions of cells.
const MAX_GYROID_CELLS = 400000;
function gyroidGrid(bounds, s) {
  let step = s / 10;
  const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY;
  while ((w / step) * (h / step) > MAX_GYROID_CELLS) step *= 1.4;
  return step;
}

const MARCH = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]],
  6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 10: [[0, 3], [2, 1]],
  11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
};

// How much curve a unit-scale gyroid packs into a unit of area.
//
// Scaling the pattern by s multiplies lengths by s and areas by s squared, so
// length per area goes exactly as k/s — PROVIDED the grid is scaled with it
// too, which is why the step is s/10 rather than an absolute floor. Straight
// lines at pitch p give 1/p, so matching them is s = k * p, and it holds at
// every density instead of only the one it was tuned at.
//
// The cross-section is not the same length at every height — the gyroid's z
// period is 2*pi*s — so this averages over a full period. Individual layers
// still vary a few percent either side, which is true of the pattern itself
// and not something a slicer can or should flatten out.
let gyroidK = null;
function gyroidScale(spacing) {
  if (gyroidK == null) {
    const N = 12 * Math.PI;
    const box = { minX: 0, minY: 0, maxX: N, maxY: N };
    let total = 0;
    const STEPS = 8;
    for (let i = 0; i < STEPS; i++) {
      const z = (i / STEPS) * 2 * Math.PI;     // one full period at s = 1
      let L = 0;
      for (const g of gyroidSegments(box, 1, z, 0.1)) {
        L += Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
      }
      total += L / (N * N);
    }
    // Measured on the raw contour; what actually reaches the part has been
    // through chaining, clipping and micron quantisation, each of which
    // shaves a little. Across 10% to 40% that came to a steady 8%, so the
    // constant carries it. Note that a gyroid's cross-section is genuinely
    // not the same length at every height — individual layers land within
    // about 10% either side of the mean, and that is the pattern, not an
    // error to tune out.
    gyroidK = (total / STEPS) * 0.92;
  }
  return gyroidK * spacing;
}

export async function gyroidLines(region, spacing, z) {
  if (!region.length || !(spacing > 0) || !Number.isFinite(spacing)) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of region) {
    for (const [x, y] of p) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const s = gyroidScale(spacing);
  const pad = s;
  const box = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  const segs = gyroidSegments(box, s, z, gyroidGrid(box, s));
  return orderRuns(await clipOpen(chainKeyed(segs), region));
}

export const INFILL_PATTERNS = {
  rectilinear: "Rectilinear — 45°, crossing the layer below",
  aligned: "Back and forth — same direction every layer",
  grid: "Grid — both diagonals on every layer",
  gyroid: "Gyroid — curves, no weak direction",
  concentric: "Concentric — follows the outline",
};

// One layer's sparse fill, whichever pattern was asked for.
export async function fillPattern(region, spacing, pattern, i, z) {
  switch (pattern) {
    // Same angle on every layer, so the strands stack into continuous walls
    // rather than crossing. Stiff along the lines and floppy across them —
    // which is exactly what you want when you know which way the load comes.
    case "aligned": return infillLines(region, spacing, 0);
    // Both diagonals every layer, each at half the density so the total is
    // what was asked for. The crossings collide with the nozzle, which is the
    // price of it being braced both ways within a single layer.
    case "grid": return orderRuns([
      ...await infillLines(region, spacing * 2, 45),
      ...await infillLines(region, spacing * 2, 135),
    ]);
    case "concentric": return orderRuns(await concentricLines(region, spacing));
    case "gyroid": return gyroidLines(region, spacing, z);
    default: return infillLines(region, spacing, 45 + (i % 2) * 90);
  }
}

// -------------------------------------------------- crossing the outline

// Do these two points see each other without leaving the part?
function segCross(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

// Whether a straight hop from a to b leaves the material.
//
// This is what decides a retraction, and distance alone is NOT the test:
// stepping to the neighbouring infill strand is a 2.7mm hop at 15% density,
// which a plain "retract over 2mm" rule turns into a retraction on every
// single strand — thousands per part, minutes of wasted time, and a filament
// path ground to dust for no benefit. What actually strings is a hop that
// crosses OPEN AIR, so that is the thing to test for.
export function crossesLoops(a, b, loops) {
  for (const p of loops) {
    for (let i = 0; i < p.length; i++) {
      if (segCross(a, b, p[i], p[(i + 1) % p.length])) return true;
    }
  }
  return false;
}

// -------------------------------------------------------------- printers

// Retraction is a property of the extruder, not of the part. A Bowden tube has
// a metre of springy filament between the gear and the melt zone and needs
// centimetres of pull to unload it; a direct drive has millimetres. Getting
// this wrong is the difference between a clean part and a cobweb, so it is
// attached to the machine rather than left as a number to guess.
// A purge line drawn up the left edge before anything else: it gets the
// pressure up and lets you watch the first extrusion somewhere it does not
// matter. Called "purge" rather than "prime" on purpose — a retraction's
// prime is a different thing, and sharing the word makes the two impossible
// to tell apart when reading the file back.
const PRIME_LINE = [
  "G1 Z2 F1200",
  "G1 X{x0} Y20 F5000",
  "G1 Z{layer} F1200",
  "G1 X{x0} Y{y1} E18 F1200 ; purge line",
  "G1 X{x0h} Y{y1} E20 F1200",
  "G92 E0",
];

const GENERIC_START = [
  "G21 ; millimetres", "G90 ; absolute positioning", "M82 ; absolute extrusion",
  "M140 S{bed}", "M104 S{temp}", "M190 S{bed}", "M109 S{temp}",
  "G28 ; home", "G92 E0", ...PRIME_LINE,
];
const GENERIC_END = [
  "M104 S0 ; nozzle off", "M140 S0 ; bed off", "M107 ; fan off",
  "G91", "G1 Z5 F600 ; lift", "G90", "G28 X0 Y0", "M84 ; steppers off",
];

export const PRINTERS = {
  bambu_x1: {
    label: "Bambu Lab X1 / X1C", bedX: 256, bedY: 256,
    retract: 0.8, retractSpeed: 30, zhop: 0.4,
  },
  bambu_p1: {
    label: "Bambu Lab P1P / P1S", bedX: 256, bedY: 256,
    retract: 0.8, retractSpeed: 30, zhop: 0.4,
  },
  bambu_a1: {
    label: "Bambu Lab A1", bedX: 256, bedY: 256,
    retract: 0.8, retractSpeed: 30, zhop: 0.4,
  },
  bambu_a1m: {
    label: "Bambu Lab A1 mini", bedX: 180, bedY: 180,
    retract: 0.8, retractSpeed: 30, zhop: 0.4,
  },
  ender3: {
    label: "Creality Ender 3 / Pro / V2 — Bowden", bedX: 220, bedY: 220,
    retract: 5.0, retractSpeed: 45, zhop: 0.2,
  },
  ender3_s1: {
    label: "Creality Ender 3 S1 / V3 — direct drive", bedX: 220, bedY: 220,
    retract: 1.0, retractSpeed: 40, zhop: 0.2,
  },
  ender5: {
    label: "Creality Ender 5 / Plus", bedX: 220, bedY: 220,
    retract: 4.0, retractSpeed: 45, zhop: 0.2,
  },
  cr10: {
    label: "Creality CR-10 / CR-10S", bedX: 300, bedY: 300,
    retract: 5.0, retractSpeed: 45, zhop: 0.2,
  },
  k1: {
    label: "Creality K1 / K1 Max", bedX: 220, bedY: 220,
    retract: 0.5, retractSpeed: 40, zhop: 0.2,
  },
  prusa_mk4: {
    label: "Prusa MK4 / MK3S", bedX: 250, bedY: 210,
    retract: 0.8, retractSpeed: 35, zhop: 0.4,
  },
  prusa_mini: {
    label: "Prusa MINI / MINI+", bedX: 180, bedY: 180,
    retract: 3.2, retractSpeed: 40, zhop: 0.2,
  },
  voron_250: {
    label: "Voron 2.4 / Trident 250", bedX: 250, bedY: 250,
    retract: 0.5, retractSpeed: 45, zhop: 0.2,
  },
  voron_350: {
    label: "Voron 2.4 / Trident 350", bedX: 350, bedY: 350,
    retract: 0.5, retractSpeed: 45, zhop: 0.2,
  },
  sovol_sv06: {
    label: "Sovol SV06 / SV06 Plus", bedX: 220, bedY: 220,
    retract: 1.0, retractSpeed: 40, zhop: 0.2,
  },
  anycubic_kobra: {
    label: "Anycubic Kobra 2", bedX: 220, bedY: 220,
    retract: 1.5, retractSpeed: 40, zhop: 0.2,
  },
  generic: {
    label: "Generic / Marlin", bedX: 200, bedY: 200,
    retract: 2.0, retractSpeed: 40, zhop: 0.2,
  },
};

// Anything in the G-code text boxes gets these substituted. Keeping the list
// short and obvious beats a template language nobody wants to learn.
export function fillPlaceholders(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export const DEFAULT_START_GCODE = GENERIC_START.join("\n");
export const DEFAULT_END_GCODE = GENERIC_END.join("\n");

// -------------------------------------------------------------- the slice

export const DEFAULTS = {
  layer: 0.2,
  nozzle: 0.4,
  walls: 3,
  topLayers: 4,        // solid skin under a top surface
  bottomLayers: 4,     // ...and over a bottom one
  infill: 0.15,        // 0 = leave it hollow
  infillPattern: "rectilinear",
  filament: 1.75,
  feed: 1800,          // mm/min, walls
  solidFeed: 2100,     // mm/min, solid skin
  infillFeed: 2700,    // mm/min, sparse infill — nothing shows, so run it
  travel: 7200,        // mm/min, not printing
  firstLayer: 0.5,     // fraction of normal speed for layer 1
  temp: 210,
  bed: 60,
  retract: 0.8,
  retractSpeed: 30,    // mm/s
  retractMin: 1.5,     // never worth retracting for a hop this short
  retractLong: 8,      // ...but always worth it for one this long, air or not
  zhop: 0.4,
  bedX: 256,
  bedY: 256,           // 0 disables centring and leaves model coordinates alone
  stagger: true,       // the whole point
  supports: false,     // off unless asked: most parts do not need them
  supportAngle: 45,    // degrees from vertical before an overhang needs holding
  supportXY: 0.7,      // sideways gap so it does not weld itself to the model
  supportZ: 1,         // layers of air underneath the overhang
  supportDensity: 0.12,
  supportMinArea: 4,   // mm2 — under this it is slice noise, not an overhang
  // Painted regions, in MODEL coordinates, as [x0, y0, x1, y1]. Blocked wins
  // over forced, because "definitely not here" is the one you reach for when
  // the slicer has put support somewhere you cannot reach to remove it.
  supportBlock: [],
  supportForce: [],
  startGcode: "",      // blank = the built-in preamble
  endGcode: "",
  layerGcode: "",      // run at every layer change, after the Z move
};

// One layer's worth of wall loops, outermost first.
//
// Offsets without stagger:   0.5, 1.5, 2.5 nozzles in from the surface
// with stagger, odd layers:  0.5, 2.0, 3.0   <- inner walls shifted half a bead
//
// The first number never changes. That is the outer wall, and it is what the
// part measures.
export async function wallsForLayer(loops, opt, layerIndex) {
  const { nozzle, walls, stagger } = opt;
  const shift = stagger && (layerIndex % 2 === 1) ? nozzle / 2 : 0;
  const out = [];
  for (let w = 0; w < walls; w++) {
    const d = nozzle * (0.5 + w) + (w === 0 ? 0 : shift);
    const ring = await offsetLoops(loops, -d);
    if (!ring.length) break;                 // wall thinner than the shell: stop
    out.push(ring);
  }
  return out;
}

const staggerShift = (opt, i) => (opt.stagger && i % 2 === 1 ? opt.nozzle / 2 : 0);

// Everything inside the walls, which is what infill has to fill. On staggered
// layers the innermost wall has moved half a bead further in, so the fill
// boundary has to follow it or the first infill strand lands on top of it.
const fillBoundary = (outline, opt, i) =>
  offsetLoops(outline, -(opt.nozzle * opt.walls + staggerShift(opt, i)));

// Pass one: the geometry of every layer, with no decisions taken yet.
export async function planLayers(tris, opt, onProgress) {
  const zs = [];
  for (const t of tris) for (const p of t) zs.push(p[2]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const nLayers = Math.max(1, Math.floor((zmax - zmin) / opt.layer));
  const layers = [];

  for (let i = 0; i < nLayers; i++) {
    // sample at the MIDDLE of the layer, not its floor: a slice taken exactly
    // on a flat top or bottom face lands in the plane of the triangles there
    // and comes back as noise
    const z = zmin + i * opt.layer + opt.layer / 2;
    const raw = chainLoops(sliceTriangles(tris, z));
    if (!raw.length) { layers.push(null); onProgress?.(i + 1, nLayers); continue; }
    const outline = await normalizeLoops(raw);
    const walls = await wallsForLayer(outline, opt, i);
    if (!walls.length) { layers.push(null); onProgress?.(i + 1, nLayers); continue; }
    // `ref` deliberately ignores the stagger. Comparing layer to layer is how
    // top and bottom surfaces get found, and if the regions being compared
    // breathed in and out by half a bead every layer the comparison would
    // report a ring of false top surface on every single one.
    const ref = await offsetLoops(outline, -opt.nozzle * opt.walls);
    const fill = staggerShift(opt, i) ? await fillBoundary(outline, opt, i) : ref;
    layers.push({ i, outline, walls, ref, fill });
    onProgress?.(i + 1, nLayers);
  }
  return { layers, nLayers, zmin, zmax };
}

// Where this layer needs to be solid, and where sparse infill will do.
//
// A patch is sparse only if it is buried: covered by every one of the next
// `topLayers` and carried by every one of the previous `bottomLayers`. Since
//     (ref - above) u (ref - below)  ==  ref - (above n below)
// the two skins fall out of a single difference rather than two.
export async function skinFor(layers, i, opt) {
  const L = layers[i];
  if (!L || !L.fill.length) return { solid: [], sparse: [] };

  const buried = async (dir, n) => {
    let acc = L.ref;
    for (let k = 1; k <= n; k++) {
      const nb = layers[i + dir * k];
      if (!nb || !nb.ref.length) return [];      // open to the air: nothing is buried
      acc = await intersectLoops(acc, nb.ref);
      if (!acc.length) return [];
    }
    return acc;
  };
  const above = await buried(+1, opt.topLayers);
  const below = await buried(-1, opt.bottomLayers);
  const core = await intersectLoops(above, below);

  let solid = await differenceLoops(L.fill, core);
  // A difference between two layers that are almost the same shape leaves
  // hairline rings behind — a faceted cylinder whose facets shift by a few
  // microns is enough to do it. Anything narrower than one bead cannot be
  // printed as solid whatever we decide, so open the region by half a bead
  // and let those vanish; otherwise a plain tube grows a random solid layer
  // in the middle of it.
  solid = await openLoops(solid, opt.nozzle / 2);
  // ...and the opening still leaves specks behind, because a facet that moves
  // a few microns between layers makes a blob rather than a hairline. A patch
  // this small holds no useful solid infill and is not a surface anyone will
  // ever see, so it is slice noise by definition: measured on a plain tube,
  // one layer in a hundred came out with 0.23mm2 of "top surface" on it.
  const minArea = (3 * opt.nozzle) ** 2;
  solid = solid.filter((p) => Math.abs(polyArea(p)) >= minArea);
  // recompute the sparse side from what actually survived, so solid + sparse
  // covers the fill region exactly and nothing is left as a void
  const sparse = await differenceLoops(L.fill, solid);
  return { solid, sparse };
}

function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

// -------------------------------------------------------------- supports

// Where the part needs holding up, layer by layer.
//
// A layer can only reach so far past the one below it before the bead has
// nothing underneath: at `supportAngle` degrees off vertical that reach is
// `layer * tan(angle)`, which at the usual 45 degrees is exactly one layer
// height. Anything beyond it is an overhang, and an overhang needs a column
// standing under it all the way down to the bed or to whatever part of the
// model is underneath.
//
// So this walks DOWNWARD, accumulating: each layer adds its own overhangs to
// what it inherited from above, and subtracts the model, which is what makes
// a column stop when it lands on something solid instead of tunnelling
// through it.
export async function planSupports(layers, opt) {
  const n = layers.length;
  const out = new Array(n).fill(null).map(() => []);
  if (!opt.supports) return out;

  const rect = ([x0, y0, x1, y1]) => [
    [Math.min(x0, x1), Math.min(y0, y1)], [Math.max(x0, x1), Math.min(y0, y1)],
    [Math.max(x0, x1), Math.max(y0, y1)], [Math.min(x0, x1), Math.max(y0, y1)],
  ];
  const forced = (opt.supportForce || []).length
    ? await normalizeLoops((opt.supportForce || []).map(rect)) : [];
  const blocked = (opt.supportBlock || []).length
    ? await normalizeLoops((opt.supportBlock || []).map(rect)) : [];

  const reach = opt.layer * Math.tan((opt.supportAngle * Math.PI) / 180);
  const need = new Array(n).fill(null).map(() => []);
  let carry = [], everAbove = [];
  for (let i = n - 2; i >= 0; i--) {
    const here = layers[i]?.outline || [];
    const above = layers[i + 1]?.outline || [];
    const held = here.length ? await offsetLoops(here, reach) : [];
    carry = await unionLoops(carry, await differenceLoops(above, held));
    // A painted FORCE region means "hold this up whatever the angle says" —
    // so it needs a column anywhere there is model somewhere above it, which
    // is what everAbove tracks on the way down.
    if (forced.length) {
      everAbove = await unionLoops(everAbove, above);
      carry = await unionLoops(carry, await intersectLoops(forced, everAbove));
    }
    if (here.length) carry = await differenceLoops(carry, here);
    if (blocked.length) carry = await differenceLoops(carry, blocked);
    carry = carry.filter((p) => Math.abs(polyArea(p)) >= opt.supportMinArea);
    need[i] = carry;
  }

  // Drop the whole column by supportZ layers. That leaves the top of it
  // sitting in air under the overhang, which is the only reason the support
  // ever comes off again — printed hard against the underside it fuses, and
  // you are chiselling.
  for (let i = 0; i < n; i++) {
    const src = need[Math.min(n - 1, i + opt.supportZ)];
    if (!src.length) continue;
    const here = layers[i]?.outline || [];
    const clear = here.length ? await offsetLoops(here, opt.supportXY) : [];
    let s = await differenceLoops(src, clear);
    // pull in half a bead, the same as the outer wall does, so the strand
    // sits inside the overhang's footprint instead of half hanging off it
    s = await offsetLoops(s, -opt.nozzle / 2);
    out[i] = s.filter((p) => Math.abs(polyArea(p)) >= opt.supportMinArea);
  }
  return out;
}

// ---------------------------------------------------------------- G-code

// E per mm of travel: the bead this move lays down, expressed as filament.
export const ePerMm = (opt) =>
  (opt.layer * opt.nozzle) / (Math.PI * (opt.filament / 2) ** 2);

export function gcodeVars(opt, name, extra = {}) {
  return {
    name, temp: opt.temp, bed: opt.bed, nozzle: opt.nozzle, layer: opt.layer,
    walls: opt.walls, infill: Math.round(opt.infill * 100),
    bedx: opt.bedX, bedy: opt.bedY,
    // the prime line runs up the left edge of whatever bed was picked
    x0: 3, x0h: 3.4, y1: Math.max(40, (opt.bedY || 200) - 20),
    ...extra,
  };
}

export function gcodeHeader(opt, name) {
  const skin = opt.topLayers || opt.bottomLayers
    ? `${opt.bottomLayers} bottom / ${opt.topLayers} top solid layers` : "no solid skin";
  const stag = opt.stagger
    ? `brick-staggered perimeters: outer wall fixed, inner walls alternate by ${(opt.nozzle / 2).toFixed(2)}mm`
    : "stagger off — every wall stacks straight up";
  const body = (opt.startGcode && opt.startGcode.trim()) || DEFAULT_START_GCODE;
  return [
    `; ${name} — sliced by BREPcode`,
    `; ${stag}`,
    `; layer ${opt.layer}mm · nozzle ${opt.nozzle}mm · ${opt.walls} walls`,
    `; ${Math.round(opt.infill * 100)}% ${opt.infillPattern} infill · ${skin}`,
    ...fillPlaceholders(body, gcodeVars(opt, name)).split("\n"),
  ];
}

export const gcodeFooter = (opt = {}, name = "model") =>
  fillPlaceholders((opt.endGcode && opt.endGcode.trim()) || DEFAULT_END_GCODE,
    gcodeVars({ ...DEFAULTS, ...opt }, name)).split("\n");

// --------------------------------------------------------------- preview

// Read the emitted G-code back into per-layer polylines for drawing.
//
// Parsing the FILE rather than keeping the paths around as they are generated
// is the whole point: a preview built from a separate code path can disagree
// with what actually gets printed, and then it is worse than no preview at
// all. This one can only show what is in the file.
export function parseGcode(text) {
  const layers = [];
  let cur = null, type = "WALL-OUTER", path = null;
  let x = 0, y = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith(";LAYER:")) {
      cur = { i: +line.slice(7), z: 0, runs: [] };
      layers.push(cur);
      path = null;
      continue;
    }
    if (line.startsWith(";TYPE:")) { type = line.slice(6); path = null; continue; }
    if (!cur || (line[0] !== "G") || (line[1] !== "0" && line[1] !== "1")) continue;
    const mx = /X(-?[\d.]+)/.exec(line), my = /Y(-?[\d.]+)/.exec(line);
    if (!mx || !my) {
      // a bare Z is the layer change; a bare E is a retract or a prime
      const mz = /Z(-?[\d.]+)/.exec(line);
      if (mz && !cur.z) cur.z = +mz[1];
      path = null;
      continue;
    }
    const nx = +mx[1], ny = +my[1];
    if (line[1] === "1" && / E-?[\d.]+/.test(line)) {
      if (!path) { path = { type, pts: [[x, y]] }; cur.runs.push(path); }
      path.pts.push([nx, ny]);
    } else {
      path = null;                       // a travel breaks the run
    }
    x = nx; y = ny;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const L of layers) {
    for (const r of L.runs) {
      for (const [px, py] of r.pts) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  return { layers, bounds: layers.length ? { minX, minY, maxX, maxY } : null };
}

// What each kind of extrusion is drawn as. Support is deliberately the odd
// one out — the point of looking at a preview is usually to check where it
// landed.
export const PREVIEW_COLOURS = {
  "WALL-OUTER": "#ff8a3d",
  "WALL-INNER": "#b3592a",
  SOLID: "#e8c547",
  FILL: "#4d7fd6",
  SUPPORT: "#22b8a6",
};

// tris: [[[x,y,z] x3], …] world space. Returns { gcode, stats }.
export async function sliceToGcode(tris, options = {}, onProgress) {
  const opt = { ...DEFAULTS, ...options };
  const { layers, nLayers, zmin, zmax } = await planLayers(tris, opt,
    (d, t) => onProgress?.(d, t, "Slicing"));
  const supports = await planSupports(layers, opt);

  // The model sits wherever it sat in the editor, which for anything built
  // with center:true means straddling the origin — half of it at negative X,
  // i.e. off the front left corner of the bed. Put its footprint in the middle
  // of the plate instead, and drop it onto the bed in Z.
  let ox = 0, oy = 0;
  if (opt.bedX > 0 && opt.bedY > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tris) {
      for (const p of t) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }
    ox = opt.bedX / 2 - (minX + maxX) / 2;
    oy = opt.bedY / 2 - (minY + maxY) / 2;
  }
  const fx = (p) => (p[0] + ox).toFixed(3);
  const fy = (p) => (p[1] + oy).toFixed(3);

  const EPMM = ePerMm(opt);
  const g = gcodeHeader(opt, options.name || "model");
  let E = 0, last = null, z = 0;
  let extrude = 0, travel = 0, retracts = 0, staggered = 0, minutes = 0;
  let supportLayers = 0;
  const dist = { wall: 0, solid: 0, infill: 0, support: 0, travel: 0 };
  const wallCounts = [];

  let outline = [];
  const travelTo = (p) => {
    const d = last ? Math.hypot(p[0] - last[0], p[1] - last[1]) : 0;
    dist.travel += d;
    minutes += d / opt.travel;
    // Retract when the hop crosses air, or when it is long enough that the
    // nozzle would drool across the part even inside it. A short hop to the
    // next strand is neither, and retracting on those is what turns a slice
    // into thousands of pointless retractions.
    const air = last && d >= opt.retractMin
      && (d >= opt.retractLong || crossesLoops(last, p, outline));
    if (opt.retract > 0 && air) {
      const rf = Math.round(opt.retractSpeed * 60);
      g.push(`G1 E${(E - opt.retract).toFixed(5)} F${rf} ; retract`);
      if (opt.zhop > 0) g.push(`G1 Z${(z + opt.zhop).toFixed(3)} F${opt.travel}`);
      g.push(`G0 X${fx(p)} Y${fy(p)} F${opt.travel}`);
      if (opt.zhop > 0) g.push(`G1 Z${z.toFixed(3)} F${opt.travel}`);
      g.push(`G1 E${E.toFixed(5)} F${rf} ; prime`);
      retracts++;
      minutes += (2 * opt.retract) / (opt.retractSpeed * 60);
    } else {
      g.push(`G0 X${fx(p)} Y${fy(p)} F${opt.travel}`);
    }
    travel++;
    last = p;
  };

  const extrudeTo = (p, feed, kind) => {
    const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
    if (d < 1e-4) return;
    E += d * EPMM;
    dist[kind] += d;
    minutes += d / feed;
    g.push(`G1 X${fx(p)} Y${fy(p)} E${E.toFixed(5)} F${feed}`);
    extrude++;
    last = p;
  };

  const run = (path, closed, feed, kind) => {
    const pts = closed ? [...path, path[0]] : path;
    travelTo(pts[0]);
    for (let k = 1; k < pts.length; k++) extrudeTo(pts[k], feed, kind);
  };

  for (let i = 0; i < nLayers; i++) {
    const L = layers[i];
    onProgress?.(i + 1, nLayers, "Writing G-code");
    if (!L) continue;
    const { solid, sparse } = await skinFor(layers, i, opt);
    outline = L.outline;
    if (opt.stagger && i % 2 === 1) staggered++;
    wallCounts.push(L.walls.length);

    // The first layer goes down slower: it is being ironed onto glass rather
    // than laid on plastic, and speed there is what makes prints let go.
    const s = i === 0 ? opt.firstLayer : 1;
    const wallF = Math.round(opt.feed * s);
    const solidF = Math.round(opt.solidFeed * s);
    const infillF = Math.round(opt.infillFeed * s);

    z = (i + 1) * opt.layer;
    g.push(`;LAYER:${i}`, `G1 Z${z.toFixed(3)} F${opt.travel}`);
    if (opt.layerGcode && opt.layerGcode.trim()) {
      g.push(...fillPlaceholders(opt.layerGcode.trim(),
        gcodeVars(opt, options.name || "model", { layernum: i + 1, z: z.toFixed(3) })).split("\n"));
    }

    // Walls INNERMOST FIRST, outer wall last. The outer wall is the one the
    // part is measured on and the only one anybody sees, and it comes out
    // crisper when it is extruded against something solid instead of having
    // the inner walls pushed into its back afterwards.
    //
    // Grouped by ISLAND, not by ring. A tube's layer holds three rings around
    // the outside and three around the bore; walking them ring by ring hops
    // between the two five times a layer, and every hop crosses the bore.
    // Clipper hands back outer boundaries wound positive and holes negative,
    // so the sign of the area says which side of the material a ring belongs
    // to, and the centroid separates one hole from the next.
    const islands = new Map();
    for (let w = L.walls.length - 1; w >= 0; w--) {
      for (const path of L.walls[w]) {
        const a = polyArea(path);
        let cx = 0, cy = 0;
        for (let k = 0; k < path.length; k++) {
          const p = path[k], q = path[(k + 1) % path.length];
          const cr = p[0] * q[1] - q[0] * p[1];
          cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
        }
        const key = a ? `${a > 0 ? "+" : "-"}${Math.round(cx / (6 * a) * 2)},${Math.round(cy / (6 * a) * 2)}` : "0";
        if (!islands.has(key)) islands.set(key, []);
        islands.get(key).push({ w, path });
      }
    }
    for (const ring of islands.values()) {
      for (const { w, path } of ring) {
        g.push(w === 0 ? ";TYPE:WALL-OUTER" : ";TYPE:WALL-INNER");
        run(path, true, wallF, "wall");
      }
    }

    if (solid.length) {
      g.push(";TYPE:SOLID");
      // 45/135 by layer: strands cross the ones below instead of stacking in
      // the same grooves, which is what makes a skin stiff
      const lines = await infillLines(solid, opt.nozzle, 45 + (i % 2) * 90);
      for (const seg of lines) run(seg, false, solidF, "solid");
    }
    if (sparse.length && opt.infill > 0) {
      g.push(";TYPE:FILL");
      const lines = await fillPattern(sparse, opt.nozzle / opt.infill,
        opt.infillPattern, i, zmin + i * opt.layer + opt.layer / 2);
      for (const seg of lines) run(seg, false, infillF, "infill");
    }

    // Support goes down LAST, and at one fixed angle rather than alternating
    // with the layer. Strands that stack in the same plane make a row of thin
    // vertical fins: rigid enough to hold an overhang up, and they snap
    // sideways with a thumbnail. Cross-hatching them would make a solid block
    // welded to the part, which holds just as well and never comes off.
    if (supports[i]?.length) {
      g.push(";TYPE:SUPPORT");
      supportLayers++;
      // One loop round each island first. Without it the fill lines stop a
      // whole spacing short of the extremes — on a round overhang the rim
      // ends up with nothing under it, because a horizontal line never
      // reaches the top or bottom of a circle. It also means the whole
      // support lifts off as one piece instead of crumbling into strands.
      for (const path of supports[i]) run(path, true, infillF, "support");
      const lines = await infillLines(supports[i], opt.nozzle / opt.supportDensity, 0);
      for (const seg of lines) run(seg, false, infillF, "support");
    }
  }
  g.push(...gcodeFooter(opt, options.name || "model"));

  const mm3 = (mm) => +(mm * opt.layer * opt.nozzle).toFixed(1);
  return {
    gcode: g.join("\n"),
    stats: {
      layers: nLayers,
      layersWithWalls: wallCounts.length,
      staggeredLayers: staggered,
      wallsPerLayer: wallCounts.length
        ? Math.round(wallCounts.reduce((a, b) => a + b, 0) / wallCounts.length) : 0,
      extrudeMoves: extrude,
      travelMoves: travel,
      retractions: retracts,
      wallMm: +dist.wall.toFixed(1),
      solidMm: +dist.solid.toFixed(1),
      infillMm: +dist.infill.toFixed(1),
      supportMm: +dist.support.toFixed(1),
      travelMm: +dist.travel.toFixed(1),
      wallMm3: mm3(dist.wall),
      solidMm3: mm3(dist.solid),
      infillMm3: mm3(dist.infill),
      supportMm3: mm3(dist.support),
      supportLayers,
      filamentMm: +E.toFixed(1),
      filamentMm3: +(E * Math.PI * (opt.filament / 2) ** 2).toFixed(1),
      minutes: +minutes.toFixed(1),
      height: +(zmax - zmin).toFixed(2),
    },
  };
}
