// The arithmetic behind the Measure tool.
//
// Split out of the viewer because a measuring tool that is confidently wrong is
// worse than no measuring tool, and none of this can be checked by looking at
// it on screen — "45.8" and "45.3" render identically to the eye. Here it is
// plain numbers in and plain numbers out, so test/measure.js can check it
// against distances worked out by hand.
//
// Deliberately free of three.js: these take flat arrays (the same
// Float32Array a BufferGeometry already holds) and an optional 16-element
// column-major matrix, and return plain arrays. The viewer wraps the results
// in Vector3s at the call site.

const tx = (m, x, y, z) => (m
  ? [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
  : [x, y, z]);

// Every triangle of a geometry, as world-space corner triples.
function* triangles(positions, index, matrix) {
  const n = index ? index.length : positions.length / 3;
  const at = (i) => (index ? index[i] : i);
  for (let t = 0; t + 2 < n; t += 3) {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const v = at(t + k) * 3;
      out.push(tx(matrix, positions[v], positions[v + 1], positions[v + 2]));
    }
    yield out;
  }
}

// THE EDGES OF THE MODEL, as opposed to the edges of the tessellation.
//
// Each kernel face arrives as its own geometry, so an edge belonging to exactly
// ONE of that geometry's triangles is a boundary of the face — which is a real
// edge of the solid. An edge shared by two triangles is an interior seam of the
// triangulation and means nothing to anyone measuring.
//
// Keyed on QUANTISED POSITIONS, not on vertex indices. A face can carry the
// same corner several times over (split normals, or a re-indexed buffer), and
// index-based matching then finds no shared edges at all and declares every
// single edge a boundary — which would put a snap point in the middle of a flat
// face. 1e-4 mm is far below anything a printer can resolve and far above the
// float noise that separates two copies of the same corner.
export function boundaryEdges(positions, index = null, matrix = null) {
  if (!positions || !positions.length) return [];
  const seen = new Map();
  const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
  for (const tri of triangles(positions, index, matrix)) {
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const ka = key(a), kb = key(b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const had = seen.get(k);
      if (had) had.n++;
      else seen.set(k, { a, b, n: 1 });
    }
  }
  const out = [];
  for (const e of seen.values()) if (e.n === 1) out.push([e.a, e.b]);
  return out;
}

// Summed from the triangles, never from the bounding box. A face with a hole
// through it, an L-shaped face, or any face that is not a rectangle would
// otherwise report the area of the box around it — always too much, and most
// wrong exactly when someone is checking a real part.
export function surfaceArea(positions, index = null, matrix = null) {
  let area = 0;
  for (const [a, b, c] of triangles(positions, index, matrix)) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    area += Math.hypot(cx, cy, cz) * 0.5;
  }
  return area;
}

// Nearest point on segment ab to p, clamped to the segment — so an edge snap
// lands ON the edge rather than on the infinite line through it.
export function closestPointOnSegment(p, a, b) {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
  const len2 = ax * ax + ay * ay + az * az;
  if (len2 < 1e-12) return [a[0], a[1], a[2]];
  let t = ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay + (p[2] - a[2]) * az) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + ax * t, a[1] + ay * t, a[2] + az * t];
}

// Two faces of the same slab point in OPPOSITE directions, so parallel means
// the normals are collinear either way round — hence the absolute value. Get
// this wrong and the commonest measurement of all, the thickness of a wall,
// comes back as an angle of 180°.
export function facesParallel(n1, n2, tol = 1e-4) {
  const d = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
  return Math.abs(Math.abs(d) - 1) <= tol;
}

// The perpendicular gap between two parallel faces: project the line joining
// their centres onto the shared normal. Straight centre-to-centre distance
// would be wrong for any two faces that are offset sideways as well as apart —
// a step, a rebate, a lid lip — which is most of them.
export function faceGap(c1, c2, n) {
  return Math.abs((c2[0] - c1[0]) * n[0] + (c2[1] - c1[1]) * n[1] + (c2[2] - c1[2]) * n[2]);
}

// The angle between two faces, in degrees. Taken on the absolute dot product so
// the answer does not depend on which side of each face its normal happens to
// point: two faces meeting at a square corner read 90°, never 270°.
export function faceAngleDeg(n1, n2) {
  const d = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
  return Math.acos(Math.min(1, Math.max(0, Math.abs(d)))) * 180 / Math.PI;
}

// Distance plus the axis components. The components are what turn a measurement
// into an edit: "45.8 mm" tells you the diagonal, "Δx 40" tells you what number
// to change in the code.
export function distanceParts(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  return { d: Math.hypot(dx, dy, dz), dx: Math.abs(dx), dy: Math.abs(dy), dz: Math.abs(dz) };
}

// How a number is written on screen. Two decimals below 10mm, one above: a
// 3.05mm wall and a 3.1mm wall are different parts, while 124.37mm of plate is
// false precision on a machine with 0.2mm layers.
export function measureText(n) {
  if (!Number.isFinite(n)) return "—";
  return Math.abs(n) < 0.0005 ? "0" : n.toFixed(Math.abs(n) < 10 ? 2 : 1);
}
