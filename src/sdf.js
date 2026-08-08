// Smooth blends, the shortcut way.
//
// A fillet asks the kernel "find the edge where these two surfaces meet, then
// build a rolling-ball surface along it". That is exact, and on anything
// organic it is also slow and fragile: an imported mesh has thousands of facet
// edges and no notion of which one you meant.
//
// This takes the other road. Describe each shape as a DISTANCE — for any point
// in space, how far to its surface — and the blend stops being a construction
// and becomes arithmetic. Two distance fields combine with min() for union and
// max() for intersection; replace those with a SOFT min and the join rounds
// itself, hardest where the surfaces are nearly parallel and tightening as
// they meet head-on. Which is the "curvature that follows the angle" people
// describe when they see it: nobody places that radius, it falls out of how
// the two fields overlap.
//
// The price is honest: the result is a MESH, not exact geometry. Nothing to
// fillet afterwards and no true surfaces in a STEP. For a whale's mouth that
// is no loss at all — the whale was already triangles.

// ------------------------------------------------------------- primitives
//
// Each returns the signed distance to its surface: negative inside, positive
// outside, and the magnitude is the actual distance in mm, which is what lets
// the blends below be measured in mm too.

export const sdSphere = (r) => (p) => Math.hypot(p[0], p[1], p[2]) - r;

export const sdBox = (w, d, h) => {
  const e = [w / 2, d / 2, h / 2];
  return (p) => {
    const q = [Math.abs(p[0]) - e[0], Math.abs(p[1]) - e[1], Math.abs(p[2]) - e[2]];
    const out = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
    return out + Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0);
  };
};

// along +Z, centred on the origin
export const sdCylinder = (r, h) => (p) => {
  const dx = Math.hypot(p[0], p[1]) - r, dz = Math.abs(p[2]) - h / 2;
  return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
};

// ring of radius R, tube radius t, lying in the XY plane
export const sdTorus = (R, t) => (p) => Math.hypot(Math.hypot(p[0], p[1]) - R, p[2]) - t;

// ------------------------------------------------------------- transforms
//
// A field is moved by moving the QUERY the other way, which is why these read
// backwards. Rotation is the same trick with the inverse rotation.

export const at = (off, f) => (p) => f([p[0] - off[0], p[1] - off[1], p[2] - off[2]]);

export const scaled = (s, f) => (p) => f([p[0] / s, p[1] / s, p[2] / s]) * s;

// ------------------------------------------------------------ the blends
//
// The polynomial smooth-min: a min() with the corner filed off over a band of
// width k. h is how far into that band the two distances are, and the
// quadratic term is the rounding. k is in millimetres — it IS the blend
// radius, so `k: 4` reads as "about a 4mm fillet" and behaves like one.
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, k - Math.abs(a - b)) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
// ...and its mirror, for the max() that intersection and subtraction use.
export function smax(a, b, k) {
  if (k <= 0) return Math.max(a, b);
  const h = Math.max(0, k - Math.abs(a - b)) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

export const sUnion = (k, ...fs) => (p) => fs.map((f) => f(p)).reduce((x, y) => smin(x, y, k));
export const sIntersect = (k, ...fs) => (p) => fs.map((f) => f(p)).reduce((x, y) => smax(x, y, k));
// Subtracting B from A is intersecting A with the OUTSIDE of B, and the same
// soft max rounds the rim it leaves behind — which is the mouth-in-a-whale
// case, where the hard version leaves a scalpel edge.
export const sSubtract = (k, a, ...bs) => (p) =>
  bs.map((f) => -f(p)).reduce((x, y) => smax(x, y, k), a(p));

// --------------------------------------------------------------- meshing
//
// Surface nets rather than marching cubes. One vertex per cell that straddles
// the surface, placed at the average of its edge crossings, then a quad across
// every sign-changing edge joining the four cells around it. It needs no
// 256-case table, it cannot produce the sliver triangles marching cubes is
// known for, and on a blend — which is smooth by construction — the quality
// difference does not show.
export function surfaceNets(f, bounds, res = 48) {
  const [lo, hi] = bounds;
  const n = Math.max(4, Math.min(160, res | 0));
  const step = [(hi[0] - lo[0]) / n, (hi[1] - lo[1]) / n, (hi[2] - lo[2]) / n];
  const at3 = (i, j, k) => [lo[0] + i * step[0], lo[1] + j * step[1], lo[2] + k * step[2]];

  // sample the field once per grid corner — everything else reads this
  const N = n + 1;
  const val = new Float32Array(N * N * N);
  const vi = (i, j, k) => (k * N + j) * N + i;
  for (let k = 0; k <= n; k++) {
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) val[vi(i, j, k)] = f(at3(i, j, k));
    }
  }

  const CORNERS = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  // the twelve cube edges, as pairs of corner indices
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  const cellVert = new Int32Array(n * n * n).fill(-1);
  const ci = (i, j, k) => (k * n + j) * n + i;
  const points = [];

  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const d = CORNERS.map(([a, b, c]) => val[vi(i + a, j + b, k + c)]);
        let neg = 0;
        for (const v of d) if (v < 0) neg++;
        if (neg === 0 || neg === 8) continue;          // wholly in or wholly out
        // average the crossings on this cell's edges — the vertex lands on the
        // surface rather than at the cell centre, which is what keeps a curve
        // looking curved at coarse resolutions
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of EDGES) {
          const da = d[a], db = d[b];
          if ((da < 0) === (db < 0)) continue;
          const t = da / (da - db);
          const A = CORNERS[a], B = CORNERS[b];
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          cnt++;
        }
        if (!cnt) continue;
        cellVert[ci(i, j, k)] = points.length;
        points.push([
          lo[0] + (i + sx / cnt) * step[0],
          lo[1] + (j + sy / cnt) * step[1],
          lo[2] + (k + sz / cnt) * step[2],
        ]);
      }
    }
  }

  // One quad per sign-changing grid edge, joining the four cells that share
  // it. Wound so the normal points OUT of the solid, which the importer and
  // every slicer downstream depend on.
  const faces = [];
  const quad = (a, b, c, dd, flip) => {
    if (a < 0 || b < 0 || c < 0 || dd < 0) return;
    if (flip) { faces.push([a, c, b], [a, dd, c]); }
    else { faces.push([a, b, c], [a, c, dd]); }
  };
  for (let k = 1; k < n; k++) {
    for (let j = 1; j < n; j++) {
      for (let i = 1; i < n; i++) {
        const v0 = val[vi(i, j, k)];
        // +X edge: the four cells around it differ in j and k
        if ((v0 < 0) !== (val[vi(i + 1, j, k)] < 0)) {
          quad(cellVert[ci(i, j - 1, k - 1)], cellVert[ci(i, j, k - 1)],
            cellVert[ci(i, j, k)], cellVert[ci(i, j - 1, k)], v0 < 0);
        }
        if ((v0 < 0) !== (val[vi(i, j + 1, k)] < 0)) {
          quad(cellVert[ci(i - 1, j, k - 1)], cellVert[ci(i - 1, j, k)],
            cellVert[ci(i, j, k)], cellVert[ci(i, j, k - 1)], v0 < 0);
        }
        if ((v0 < 0) !== (val[vi(i, j, k + 1)] < 0)) {
          quad(cellVert[ci(i - 1, j - 1, k)], cellVert[ci(i, j - 1, k)],
            cellVert[ci(i, j, k)], cellVert[ci(i - 1, j, k)], v0 < 0);
        }
      }
    }
  }
  return { points, faces };
}

// A field plus the box it lives in. The box travels with the shape so blend()
// knows where to sample without being told — and so a moved shape moves its
// own sampling window with it.
export const shape = (sdf, bounds) => ({ sdf, bounds });

// Volume of a closed triangle mesh, by the divergence theorem. Used by the
// tests to check a blend against arithmetic rather than against a screenshot.
export function meshVolume({ points, faces }) {
  let v = 0;
  for (const [a, b, c] of faces) {
    const A = points[a], B = points[b], C = points[c];
    v += (A[0] * (B[1] * C[2] - B[2] * C[1])
      - A[1] * (B[0] * C[2] - B[2] * C[0])
      + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
  }
  return Math.abs(v);
}

// ------------------------------------------------- a blend you can actually print
//
// surfaceNets samples a field inside a box, and anywhere the surface reaches
// the WALL of that box it simply stops — leaving a hole where the mesh should
// have closed. Measured on two blended spheres at res 40:
//
//     bounds with room to spare   0 open edges   watertight
//     bounds touching the surface 228 open edges broken
//     bounds cutting the shape    856 open edges broken
//
// That mesh then goes to polyhedron() and into the kernel, which is where a
// blend turns into "Not manifold" — for a reason that has nothing to do with
// the blend and everything to do with the window it was sampled through.
//
// So: notice, and fix the actual cause. A surface touching the wall means the
// window was too small, and the right answer is a bigger window — not a patch
// over the hole, which would cap the shape off flat where it was still going.
// Repair is the last resort, for numerical nicks rather than truncation.
export function solidNets(f, bounds, res = 48, opts = {}) {
  const { grow = 0.18, tries = 2, repair = null } = opts;
  let [lo, hi] = [bounds[0].slice(), bounds[1].slice()];
  let mesh = surfaceNets(f, [lo, hi], res);
  let grew = 0;

  const openCount = (m) => {
    const seen = new Map();
    for (const [a, b, c] of m.faces) {
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = u < v ? `${u}_${v}` : `${v}_${u}`;
        seen.set(k, (seen.get(k) || 0) + 1);
      }
    }
    let n = 0;
    for (const c of seen.values()) if (c === 1) n++;
    return n;
  };

  while (openCount(mesh) > 0 && grew < tries) {
    // Widen by a share of the current span, in every direction — the surface
    // could be leaving through any wall, and finding out which costs more than
    // simply giving it room.
    const pad = [0, 1, 2].map((i) => (hi[i] - lo[i]) * grow);
    lo = lo.map((v, i) => v - pad[i]);
    hi = hi.map((v, i) => v + pad[i]);
    mesh = surfaceNets(f, [lo, hi], res);
    grew++;
  }

  const open = openCount(mesh);
  let repaired = false;
  if (open > 0 && typeof repair === "function") {
    const fixed = repair(mesh);
    mesh = { points: fixed.points, faces: fixed.faces };
    repaired = true;
  }
  return { mesh, bounds: [lo, hi], grew, repaired, openEdges: open };
}
