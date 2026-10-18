// Remeshing for texture(): turn the kernel's tessellation into near-equilateral
// triangles of the pattern's own size, on the faces being textured, before the
// displacement runs.
//
// Why: the kernel tessellates for SHAPE, not for detail. A 96-segment knob wall
// is 192 slivers, 1.1 mm wide and 18 mm tall. Uniform subdivision keeps that
// aspect ratio (each level x4 triangles, still 9 mm tall after one), so a 3 mm
// knurl lands on a handful of scattered vertices and reads as spikes. Splitting
// the longest edge instead makes even worse slivers. The fix is to throw the
// kernel's triangles away on those faces and lay a regular lattice down.
//
// How:
//   1. Weld the soup and split it into REGIONS: smooth components classified as
//      a plane or a cylinder (anything else falls apart into its coplanar
//      facets). Each region has a 2D parameter space that is an isometry of
//      the surface: the plane itself, or the unrolled cylinder (arc, height).
//   2. Region boundary edges next to a textured region are split into equal
//      pieces of about the target length. Both regions sharing an edge compute
//      the SAME split points (canonical vertex order), which is what keeps the
//      shell watertight where knurled walls meet plain caps and holes.
//   3. Each region that needs it is retriangulated in its parameter space:
//      start from its own original triangles (a valid triangulation of exactly
//      that region), split the boundary edges, drop lattice points in, and
//      Lawson-flip to the constrained Delaunay triangulation. Region boundaries
//      are the constraints simply by having no neighbour to flip with.
//   4. Lattice points go back to 3D on the TRUE surface (the real cylinder,
//      not the facets), boundary points stay on the shared chord.
//
// The lattice can be pattern-aligned: a knurl is piecewise LINEAR in its
// (u, w) coordinates, so a lattice whose edges follow its creases reproduces
// the diamonds exactly instead of sampling them.
//
// Anything unexpected (non-manifold input, a region that won't orient, a
// result that isn't closed) returns null, and the caller falls back to the old
// uniform subdivision. Never a broken shell.

const COS_SMOOTH = Math.cos((40 * Math.PI) / 180);   // facets this close belong to one surface
const COS_FLAT = Math.cos((0.5 * Math.PI) / 180);    // ...and this close are one plane

// ------------------------------------------------------------------ helpers

function weld(soup) {
  const map = new Map();
  const P = [];
  const T = [];
  for (let i = 0; i < soup.length; i += 9) {
    const ids = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const x = soup[i + k * 3], y = soup[i + k * 3 + 1], z = soup[i + k * 3 + 2];
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      let id = map.get(key);
      if (id === undefined) { id = P.length / 3; map.set(key, id); P.push(x, y, z); }
      ids[k] = id;
    }
    // a triangle the weld collapsed has no area; its two copies of the
    // surviving edge cancel, so dropping it keeps the shell closed
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    T.push(ids[0], ids[1], ids[2]);
  }
  return { P: Float64Array.from(P), T: Uint32Array.from(T) };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// smallest-eigenvalue eigenvector of a symmetric 3x3 (Jacobi sweeps)
function smallestEigvec(m) {
  const a = [m[0].slice(), m[1].slice(), m[2].slice()];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 3; i++) if (a[i][i] < a[best][best]) best = i;
  return norm([v[0][best], v[1][best], v[2][best]]);
}

// an orthonormal pair perpendicular to n, with e1 x e2 = n
function basisFor(n) {
  const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(ref, n));
  return [e1, cross(n, e1)];
}

// ------------------------------------------------------- incremental CDT
//
// A triangulation in a region's parameter plane. Triangles are CCW; nb[3t+i]
// is the triangle across edge i = (v[i], v[i+1]), or -1 on the region boundary,
// which is therefore never flipped: the constraints come for free.

class Tri2 {
  constructor() {
    this.x = []; this.y = []; this.tag = [];
    this.v = []; this.nb = [];
  }
  addPoint(x, y, tag = 0) { this.x.push(x); this.y.push(y); this.tag.push(tag); return this.x.length - 1; }
  get count() { return this.v.length / 3; }
  orient(a, b, c) {
    const { x, y } = this;
    return (x[b] - x[a]) * (y[c] - y[a]) - (y[b] - y[a]) * (x[c] - x[a]);
  }
  orientP(a, b, px, py) {
    const { x, y } = this;
    return (x[b] - x[a]) * (py - y[a]) - (y[b] - y[a]) * (px - x[a]);
  }
  addTri(a, b, c) { this.v.push(a, b, c); this.nb.push(-1, -1, -1); return this.count - 1; }
  // repoint u's neighbour link from `from` to `to`
  relink(u, from, to) {
    if (u < 0) return;
    for (let j = 0; j < 3; j++) if (this.nb[3 * u + j] === from) { this.nb[3 * u + j] = to; return; }
  }
  // split boundary edge i of t at point p: t=(a,b,c) -> (a,p,c) + (p,b,c).
  // Returns the new triangle, whose edge 0 is (p,b), the rest of the edge.
  splitBoundary(t, i, p) {
    const { v, nb } = this;
    const a = v[3 * t + i], b = v[3 * t + (i + 1) % 3], c = v[3 * t + (i + 2) % 3];
    const nbBC = nb[3 * t + (i + 1) % 3], nbCA = nb[3 * t + (i + 2) % 3];
    v[3 * t] = a; v[3 * t + 1] = p; v[3 * t + 2] = c;
    const t2 = this.addTri(p, b, c);
    nb[3 * t] = -1; nb[3 * t + 1] = t2; nb[3 * t + 2] = nbCA;
    nb[3 * t2] = -1; nb[3 * t2 + 1] = nbBC; nb[3 * t2 + 2] = t;
    this.relink(nbBC, t, t2);
    return t2;
  }
  // point p strictly inside t=(a,b,c): t -> (a,b,p), (b,c,p), (c,a,p)
  splitInside(t, p) {
    const { v, nb } = this;
    const a = v[3 * t], b = v[3 * t + 1], c = v[3 * t + 2];
    const n0 = nb[3 * t], n1 = nb[3 * t + 1], n2 = nb[3 * t + 2];
    v[3 * t + 2] = p;
    const t1 = this.addTri(b, c, p), t2 = this.addTri(c, a, p);
    nb[3 * t] = n0; nb[3 * t + 1] = t1; nb[3 * t + 2] = t2;
    nb[3 * t1] = n1; nb[3 * t1 + 1] = t2; nb[3 * t1 + 2] = t;
    nb[3 * t2] = n2; nb[3 * t2 + 1] = t; nb[3 * t2 + 2] = t1;
    this.relink(n1, t, t1);
    this.relink(n2, t, t2);
    return [t, t1, t2];
  }
  // flip edge i of t (shared with u): (a,b,c)+(b,a,d) -> (a,d,c)+(d,b,c)
  flip(t, i) {
    const { v, nb } = this;
    const u = nb[3 * t + i];
    let j = 0;
    while (nb[3 * u + j] !== t) j++;
    const a = v[3 * t + i], b = v[3 * t + (i + 1) % 3], c = v[3 * t + (i + 2) % 3];
    const d = v[3 * u + (j + 2) % 3];
    const nT1 = nb[3 * t + (i + 1) % 3], nT2 = nb[3 * t + (i + 2) % 3];
    const nU1 = nb[3 * u + (j + 1) % 3], nU2 = nb[3 * u + (j + 2) % 3];
    v[3 * t] = a; v[3 * t + 1] = d; v[3 * t + 2] = c;
    nb[3 * t] = nU1; nb[3 * t + 1] = u; nb[3 * t + 2] = nT2;
    v[3 * u] = d; v[3 * u + 1] = b; v[3 * u + 2] = c;
    nb[3 * u] = nU2; nb[3 * u + 1] = nT1; nb[3 * u + 2] = t;
    this.relink(nU1, u, t);
    this.relink(nT1, t, u);
    return u;
  }
  inCircle(a, b, c, d) {
    const { x, y } = this;
    const adx = x[a] - x[d], ady = y[a] - y[d];
    const bdx = x[b] - x[d], bdy = y[b] - y[d];
    const cdx = x[c] - x[d], cdy = y[c] - y[d];
    const ad = adx * adx + ady * ady, bd = bdx * bdx + bdy * bdy, cd = cdx * cdx + cdy * cdy;
    return adx * (bdy * cd - bd * cdy) - ady * (bdx * cd - bd * cdx) + ad * (bdx * cdy - bdy * cdx);
  }
  // should edge i of t flip? Delaunay, with a tie-break for cocircular quads
  // (a lattice is full of them) toward the edge the pattern prefers.
  wantsFlip(t, i, tol, prefer) {
    const { v, nb } = this;
    const u = nb[3 * t + i];
    if (u < 0) return false;
    let j = 0;
    while (nb[3 * u + j] !== t) j++;
    const a = v[3 * t + i], b = v[3 * t + (i + 1) % 3], c = v[3 * t + (i + 2) % 3];
    const d = v[3 * u + (j + 2) % 3];
    // only a strictly convex quad can flip and stay valid
    const minA = tol.area;
    if (this.orient(a, d, c) <= minA || this.orient(d, b, c) <= minA) return false;
    const ic = this.inCircle(a, b, c, d);
    if (ic > tol.circle) return true;
    if (ic < -tol.circle || !prefer) return false;
    // prefer() scores an edge by its end tags: take the better-scored diagonal
    return prefer(this.tag[c], this.tag[d]) > prefer(this.tag[a], this.tag[b]);
  }
  legalize(stack, tol, prefer) {
    let guard = 0;
    const cap = 200 * (this.count + 10);
    while (stack.length && guard++ < cap) {
      const t = stack.pop();
      for (let i = 0; i < 3; i++) {
        if (this.wantsFlip(t, i, tol, prefer)) {
          const u = this.flip(t, i);
          stack.push(t, u);
          break;
        }
      }
    }
  }
  // walk to the triangle containing (px,py); -1 if it's outside the region
  locate(px, py, start, eps) {
    let t = start >= 0 && start < this.count ? start : 0;
    const steps = this.count + 16;
    for (let s = 0; s < steps; s++) {
      let worst = -eps, go = -1;
      for (let i = 0; i < 3; i++) {
        const o = this.orientP(this.v[3 * t + i], this.v[3 * t + (i + 1) % 3], px, py);
        if (o < worst) { worst = o; go = i; }
      }
      if (go < 0) return t;
      const u = this.nb[3 * t + go];
      if (u < 0) break;                     // hit the boundary: maybe a hole was in the way
      t = u;
    }
    for (let k = 0; k < this.count; k++) {    // slow but sure
      let inside = true;
      for (let i = 0; i < 3 && inside; i++) {
        if (this.orientP(this.v[3 * k + i], this.v[3 * k + (i + 1) % 3], px, py) < -eps) inside = false;
      }
      if (inside) return k;
    }
    return -1;
  }
}

// ------------------------------------------------------------- lattices

// Points of a lattice inside [x0,x1]x[y0,y1] (param space). Returns
// { pts: [[x,y,tag]...], h: nearest-neighbour spacing, area: param area per triangle }.
function latticePoints(spec, x0, y0, x1, y1) {
  const out = [];
  if (spec.kind === "rosette") {
    // bumps: round dots. Per integer point of (u, w): the dot's centre, a ring
    // of 8 at r = 0.2, a ring of 8 exactly on the dot's edge (r = spec.r,
    // turned half a step), and one ground point between dots. An octagonal
    // dome with a crisp edge, where a square grid made a four-point star.
    const { A, off } = spec;
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    const inv = [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]];
    const toP = (u, w) => {
      const du = u - off[0], dw = w - off[1];
      return [inv[0][0] * du + inv[0][1] * dw, inv[1][0] * du + inv[1][1] * dw];
    };
    let umin = Infinity, umax = -Infinity, wmin = Infinity, wmax = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const u = A[0][0] * x + A[0][1] * y + off[0], w = A[1][0] * x + A[1][1] * y + off[1];
      umin = Math.min(umin, u); umax = Math.max(umax, u); wmin = Math.min(wmin, w); wmax = Math.max(wmax, w);
    }
    const R = spec.r || 0.35;
    const local = [[0, 0, 3], [0.5, 0.5, 0]];
    for (let k = 0; k < 8; k++) {
      const a1 = (k * Math.PI) / 4, a2 = a1 + Math.PI / 8;
      local.push([0.2 * Math.cos(a1), 0.2 * Math.sin(a1), 2], [R * Math.cos(a2), R * Math.sin(a2), 1]);
    }
    for (let j = Math.floor(wmin) - 1; j <= Math.ceil(wmax) + 1; j++) {
      for (let i = Math.floor(umin) - 1; i <= Math.ceil(umax) + 1; i++) {
        for (const [du, dw, tag] of local) {
          const [x, y] = toP(i + du, j + dw);
          if (x < x0 || x > x1 || y < y0 || y > y1) continue;
          out.push([x, y, tag]);
        }
      }
    }
    return { pts: out, h: 0.25, triArea: (1 / 36) / Math.abs(det) };
  }
  if (spec.kind === "crossed" || spec.kind === "grid") {
    // Lattices on the quarter grid of the pattern's own (u, w):
    //  crossed: knurl-type. Square cells of side 1/2 plus their centres.
    //    Corner-corner edges (axis lines) and corner-centre edges (diagonals)
    //    are the pattern's creases; centre-centre edges are not (tags 1 / 2).
    //    Corners sit on Z/2 (knurl) or on 1/4 + Z/2 (studs: spec.quarter).
    //  grid: waffle / bumps. Every quarter point; tag 3 on integer points,
    //    where the diagonals of the cells around them must run, 2 on the
    //    lines through them, so each cell's diagonal points at the nearest
    //    integer point and a dot comes out star-symmetric, not striped.
    const { A, off } = spec;               // (u,w) = A (x,y) + off
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    const inv = [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]];
    const toP = (u, w) => {
      const du = u - off[0], dw = w - off[1];
      return [inv[0][0] * du + inv[0][1] * dw, inv[1][0] * du + inv[1][1] * dw];
    };
    let umin = Infinity, umax = -Infinity, wmin = Infinity, wmax = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const u = A[0][0] * x + A[0][1] * y + off[0], w = A[1][0] * x + A[1][1] * y + off[1];
      umin = Math.min(umin, u); umax = Math.max(umax, u); wmin = Math.min(wmin, w); wmax = Math.max(wmax, w);
    }
    for (let j = Math.floor(wmin * 4) - 1; j <= Math.ceil(wmax * 4) + 1; j++) {
      for (let i = Math.floor(umin * 4) - 1; i <= Math.ceil(umax * 4) + 1; i++) {
        let tag;
        if (spec.kind === "grid") {
          // 3 on integer points, 2 on the grid lines through them
          tag = (i & 3) === 0 && (j & 3) === 0 ? 3 : (i & 3) === 0 || (j & 3) === 0 ? 2 : 0;
        } else {
          const odd = (i & 1) && (j & 1), even = !(i & 1) && !(j & 1);
          if (!odd && !even) continue;
          tag = (spec.quarter ? odd : even) ? 1 : 2;
        }
        const [x, y] = toP(i / 4, j / 4);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        out.push([x, y, tag]);
      }
    }
    // spacing: crossed corner to centre is (1/4, 1/4) in (u,w); grid is 1/4
    const step = spec.kind === "grid" ? [[0.25, 0], [0, 0.25]] : [[0.25, 0.25], [0.25, -0.25]];
    const o = toP(0, 0);
    const h = Math.min(...step.map(([u, w]) => { const a = toP(u, w); return Math.hypot(a[0] - o[0], a[1] - o[1]); }));
    return { pts: out, h, triArea: (spec.kind === "grid" ? 1 / 32 : 1 / 16) / Math.abs(det) };
  }
  // equilateral lattice, rows along `dir` (unit, param space), row pitch P,
  // rows phased so one passes through `phase` along the normal.
  const L = spec.L;
  const dir = spec.dir || [1, 0];
  const nrm = [-dir[1], dir[0]];
  const P = spec.pitch || (L * Math.sqrt(3)) / 2;
  const Lr = (2 * P) / Math.sqrt(3);
  const ph = spec.phase || 0;
  let rmin = Infinity, rmax = -Infinity, cmin = Infinity, cmax = -Infinity;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    const r = x * dir[0] + y * dir[1], c = x * nrm[0] + y * nrm[1];
    rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); cmin = Math.min(cmin, c); cmax = Math.max(cmax, c);
  }
  for (let j = Math.floor((cmin - ph) / P) - 1; j <= Math.ceil((cmax - ph) / P) + 1; j++) {
    const c = ph + j * P;
    const shift = (j & 1) ? Lr / 2 : 0;
    for (let i = Math.floor(rmin / Lr) - 1; i <= Math.ceil(rmax / Lr) + 1; i++) {
      const r = i * Lr + shift;
      const x = r * dir[0] + c * nrm[0], y = r * dir[1] + c * nrm[1];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      out.push([x, y, 0]);
    }
  }
  return { pts: out, h: Math.min(Lr, (2 * P) / Math.sqrt(3)), triArea: (Lr * P) / 2 };
}

// ------------------------------------------------------- sphere relaxation
//
// A sphere can't be unrolled flat, so its facets are remeshed one by one: the
// result follows the kernel's UV facets (slivers near the poles, a visible
// facet grid). This evens it out: Delaunay edge flips plus tangential
// smoothing, every moved vertex projected back onto the TRUE sphere. Only
// vertices inside the patch move and the patch outline is never touched, so
// the shell stays closed. Any triangle that would turn over cancels the lot.
function relaxSpherePatch(P, T, faces, { c, R }, iters = 10) {
  const ekey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const vec = (v) => [P[3 * v] - c[0], P[3 * v + 1] - c[1], P[3 * v + 2] - c[2]];
  const normalOf = (a, b, d) => cross(sub(vec(b), vec(a)), sub(vec(d), vec(a)));
  const edgesOf = () => {
    const m = new Map();
    for (const f of faces) {
      for (let i = 0; i < 3; i++) {
        const k = ekey(T[3 * f + i], T[3 * f + (i + 1) % 3]);
        const l = m.get(k); if (l) l.push(f); else m.set(k, [f]);
      }
    }
    return m;
  };
  // which way the patch faces (a ball, or a spherical cavity)
  let side = 0;
  for (const f of faces) {
    const [a, b, d] = [T[3 * f], T[3 * f + 1], T[3 * f + 2]];
    const ctr = vec(a).map((x, k) => (x + vec(b)[k] + vec(d)[k]) / 3);
    side += dot(normalOf(a, b, d), ctr);
  }
  side = Math.sign(side) || 1;
  const facesOut = (list) => list.every(([a, b, d]) => {
    const n = normalOf(a, b, d);
    const ctr = vec(a).map((x, k) => (x + vec(b)[k] + vec(d)[k]) / 3);
    return side * dot(n, ctr) > 1e-9 * R * R * R;
  });
  const fixed = new Set();
  for (const [k, l] of edgesOf()) if (l.length !== 2) for (const v of k.split(",")) fixed.add(+v);
  const savedP = new Map(), savedT = faces.map((f) => [T[3 * f], T[3 * f + 1], T[3 * f + 2]]);
  for (const f of faces) for (let i = 0; i < 3; i++) { const v = T[3 * f + i]; savedP.set(v, [P[3 * v], P[3 * v + 1], P[3 * v + 2]]); }
  const angleAt = (o, a, b) => {
    const u = sub(vec(a), vec(o)), w = sub(vec(b), vec(o));
    return Math.acos(Math.max(-1, Math.min(1, dot(u, w) / (Math.hypot(...u) * Math.hypot(...w) || 1))));
  };

  for (let it = 0; it < iters; it++) {
    // flips toward 3D Delaunay
    const em = edgesOf();
    const touched = new Set();
    for (const [k, l] of em) {
      if (l.length !== 2) continue;
      const [f, g] = l;
      if (touched.has(f) || touched.has(g)) continue;
      let i = 0;
      while (ekey(T[3 * f + i], T[3 * f + (i + 1) % 3]) !== k) i++;
      const a = T[3 * f + i], b = T[3 * f + (i + 1) % 3], cc = T[3 * f + (i + 2) % 3];
      let d = -1;
      for (let j = 0; j < 3; j++) { const x = T[3 * g + j]; if (x !== a && x !== b) d = x; }
      if (d < 0 || em.has(ekey(cc, d))) continue;
      if (angleAt(cc, a, b) + angleAt(d, a, b) <= Math.PI + 1e-6) continue;
      // (a,b,c) + (b,a,d) -> (a,d,c) + (d,b,c)
      if (!facesOut([[a, d, cc], [d, b, cc]])) continue;
      T[3 * f] = a; T[3 * f + 1] = d; T[3 * f + 2] = cc;
      T[3 * g] = d; T[3 * g + 1] = b; T[3 * g + 2] = cc;
      touched.add(f); touched.add(g);
    }
    // tangential smoothing: each free vertex to the mean of its neighbours,
    // back onto the sphere
    const nbr = new Map();
    for (const f of faces) {
      for (let i = 0; i < 3; i++) {
        const v = T[3 * f + i];
        if (fixed.has(v)) continue;
        let s = nbr.get(v); if (!s) nbr.set(v, s = new Set());
        s.add(T[3 * f + (i + 1) % 3]); s.add(T[3 * f + (i + 2) % 3]);
      }
    }
    const next = [];
    for (const [v, s] of nbr) {
      const m = [0, 0, 0];
      for (const u of s) for (let k = 0; k < 3; k++) m[k] += P[3 * u + k];
      const q = [m[0] / s.size - c[0], m[1] / s.size - c[1], m[2] / s.size - c[2]];
      const l = Math.hypot(...q) || 1;
      next.push([v, c[0] + (q[0] / l) * R, c[1] + (q[1] / l) * R, c[2] + (q[2] / l) * R]);
    }
    for (const [v, x, y, z] of next) { P[3 * v] = x; P[3 * v + 1] = y; P[3 * v + 2] = z; }
  }
  if (!facesOut(faces.map((f) => [T[3 * f], T[3 * f + 1], T[3 * f + 2]]))) {
    for (const [v, p] of savedP) { P[3 * v] = p[0]; P[3 * v + 1] = p[1]; P[3 * v + 2] = p[2]; }
    faces.forEach((f, i) => { T[3 * f] = savedT[i][0]; T[3 * f + 1] = savedT[i][1]; T[3 * f + 2] = savedT[i][2]; });
    return false;
  }
  return true;
}

// ------------------------------------------------------------- the remesh

/**
 * @param {Float64Array} soup  closed triangle soup
 * @param {object} opt
 *   L        target edge on textured faces (mm)
 *   wants(n) does a facet with this unit normal get textured?
 *   lattice(region) -> spec | null   optional pattern-aligned lattice for a
 *            region: { kind: "crossed" | "grid", A, off, quarter? } or { kind: "equi", L, dir, pitch, phase }
 *   maxTris  triangle budget for the whole result
 * @returns {{ verts: Float64Array, faces: Uint32Array, frame: Uint8Array, L: number } | null}
 *   frame, per vertex: bit 1 = on a textured wall of a cylinder about Z,
 *   bit 2 = on a textured plane or cylinder (a surface with a flat layout),
 *   bit 4 = on a face that is NOT textured, bit 8 = on one that is
 *   (4 and 8 together: the border where texture meets a plain face)
 */
export function remeshForTexture(soup, opt) {
  remeshForTexture.why = "";
  // why it declined, for tests and debugging (the caller just falls back)
  const fail = (why) => { remeshForTexture.why = why; return null; };
  const { P, T } = weld(soup);
  const nv = P.length / 3, nt = T.length / 3;
  if (!nt) return fail("empty soup");
  const pos = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];

  // ---- half-edge pairing; must be a closed 2-manifold
  const ekey = (a, b) => (a < b ? a * nv + b : b * nv + a);
  const edgeTris = new Map();                 // key -> [t*3+i, t*3+i]
  for (let t = 0; t < nt; t++) {
    for (let i = 0; i < 3; i++) {
      const k = ekey(T[3 * t + i], T[3 * t + (i + 1) % 3]);
      const l = edgeTris.get(k);
      if (l) l.push(3 * t + i); else edgeTris.set(k, [3 * t + i]);
    }
  }
  const twin = new Int32Array(3 * nt).fill(-1);
  for (const l of edgeTris.values()) {
    if (l.length !== 2) return fail("not a closed 2-manifold");
    const [h0, h1] = l;
    // opposite directions, or the soup isn't consistently wound
    if (T[h0] !== T[h1 - (h1 % 3) + ((h1 % 3) + 1) % 3]) return fail("inconsistent winding");
    twin[h0] = h1; twin[h1] = h0;
  }

  // ---- facet normals / areas
  let diag = 0;
  {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) {
      mn[a] = Math.min(mn[a], P[3 * i + a]); mx[a] = Math.max(mx[a], P[3 * i + a]);
    }
    diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  }
  const N = new Float64Array(3 * nt), area = new Float64Array(nt);
  const degen = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = pos(T[3 * t]), b = pos(T[3 * t + 1]), c = pos(T[3 * t + 2]);
    const cr = cross(sub(b, a), sub(c, a));
    const l = Math.hypot(cr[0], cr[1], cr[2]);
    area[t] = l / 2;
    if (l < 1e-12 * diag * diag) degen[t] = 1;
    N[3 * t] = cr[0] / (l || 1); N[3 * t + 1] = cr[1] / (l || 1); N[3 * t + 2] = cr[2] / (l || 1);
  }
  const nrmOf = (t) => [N[3 * t], N[3 * t + 1], N[3 * t + 2]];

  // ---- smooth components
  const comp = new Int32Array(nt).fill(-1);
  const comps = [];
  for (let s = 0; s < nt; s++) {
    if (comp[s] >= 0) continue;
    const id = comps.length, list = [s];
    comp[s] = id;
    for (let q = 0; q < list.length; q++) {
      const t = list[q];
      for (let i = 0; i < 3; i++) {
        const u = (twin[3 * t + i] / 3) | 0;
        if (comp[u] >= 0) continue;
        if (degen[t] || degen[u] || dot(nrmOf(t), nrmOf(u)) > COS_SMOOTH) { comp[u] = id; list.push(u); }
      }
    }
    comps.push(list);
  }

  // ---- regions: plane | cyl. region[t] = index into regions
  const region = new Int32Array(nt).fill(-1);
  const regions = [];
  const vertsOf = (tris) => { const s = new Set(); for (const t of tris) for (let i = 0; i < 3; i++) s.add(T[3 * t + i]); return [...s]; };
  const tolD = Math.max(1e-4, diag * 2e-6);

  const tryPlane = (tris) => {
    let n = [0, 0, 0];
    for (const t of tris) for (let a = 0; a < 3; a++) n[a] += N[3 * t + a] * area[t];
    if (Math.hypot(n[0], n[1], n[2]) < 1e-15) return null;
    n = norm(n);
    for (const t of tris) if (!degen[t] && dot(nrmOf(t), n) < COS_FLAT) return null;
    const vs = vertsOf(tris);
    const d = dot(pos(vs[0]), n);
    for (const v of vs) if (Math.abs(dot(pos(v), n) - d) > tolD * 10) return null;
    // the knurl's own tangent frame, so pattern coordinates are linear in the plane's
    let t1 = [-n[1], n[0], 0];
    const tl = Math.hypot(t1[0], t1[1]);
    t1 = tl < 1e-6 ? [1, 0, 0] : [t1[0] / tl, t1[1] / tl, 0];
    const e2 = cross(n, t1);
    return { kind: "plane", n, d, e1: t1, e2, tris };
  };

  const tryCyl = (tris) => {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const t of tris) {
      if (degen[t]) continue;
      const n = nrmOf(t);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r][c] += n[r] * n[c] * area[t];
    }
    const ax = smallestEigvec(M);
    for (const t of tris) if (!degen[t] && Math.abs(dot(nrmOf(t), ax)) > 0.035) return null;
    const [e1, e2] = basisFor(ax);
    const vs = vertsOf(tris);
    // Kasa circle fit in the (e1,e2) plane
    let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sz = 0, sxz = 0, syz = 0;
    for (const v of vs) {
      const p = pos(v), x = dot(p, e1), y = dot(p, e2), z = x * x + y * y;
      sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y; sz += z; sxz += x * z; syz += y * z;
    }
    const n = vs.length;
    // [sxx sxy sx; sxy syy sy; sx sy n] [D E F] = -[sxz syz sz]
    const m = [[sxx, sxy, sx, -sxz], [sxy, syy, sy, -syz], [sx, sy, n, -sz]];
    for (let c = 0; c < 3; c++) {
      let piv = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
      [m[c], m[piv]] = [m[piv], m[c]];
      if (Math.abs(m[c][c]) < 1e-18) return null;
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
      }
    }
    const D = m[0][3] / m[0][0], E = m[1][3] / m[1][1], F = m[2][3] / m[2][2];
    const cx = -D / 2, cy = -E / 2;
    const R = Math.sqrt(Math.max(0, cx * cx + cy * cy - F));
    if (!(R > 0) || R > diag * 20) return null;
    for (const v of vs) {
      const p = pos(v), x = dot(p, e1) - cx, y = dot(p, e2) - cy;
      if (Math.abs(Math.hypot(x, y) - R) > Math.max(tolD * 10, R * 2e-3)) return null;
    }
    const c3 = [e1[0] * cx + e2[0] * cy, e1[1] * cx + e2[1] * cy, e1[2] * cx + e2[2] * cy];
    // cut the unrolling in the widest angular gap between vertices
    const th = new Map();
    const angs = [];
    for (const v of vs) {
      const p = sub(pos(v), c3), a = Math.atan2(dot(p, e2), dot(p, e1));
      th.set(v, a); angs.push(a);
    }
    angs.sort((a, b) => a - b);
    let gap = angs[0] + 2 * Math.PI - angs[angs.length - 1], cut = angs[angs.length - 1] + gap / 2;
    for (let i = 1; i < angs.length; i++) {
      if (angs[i] - angs[i - 1] > gap) { gap = angs[i] - angs[i - 1]; cut = angs[i - 1] + gap / 2; }
    }
    return { kind: "cyl", axis: ax, e1, e2, c: c3, R, th, cut, tris };
  };

  // every vertex on one sphere? (algebraic fit: x2+y2+z2 + Dx + Ey + Fz + G = 0)
  const trySphere = (tris) => {
    if (tris.length < 8) return null;
    const vs = vertsOf(tris);
    const m = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    for (const v of vs) {
      const p = pos(v), row = [p[0], p[1], p[2], 1], rhs = -(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) m[r][c] += row[r] * row[c];
        m[r][4] += row[r] * rhs;
      }
    }
    for (let c = 0; c < 4; c++) {
      let piv = c;
      for (let r = c + 1; r < 4; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
      [m[c], m[piv]] = [m[piv], m[c]];
      if (Math.abs(m[c][c]) < 1e-18) return null;
      for (let r = 0; r < 4; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k < 5; k++) m[r][k] -= f * m[c][k];
      }
    }
    const sol = [0, 1, 2, 3].map((r) => m[r][4] / m[r][r]);
    const c = [-sol[0] / 2, -sol[1] / 2, -sol[2] / 2];
    const R = Math.sqrt(Math.max(0, dot(c, c) - sol[3]));
    if (!(R > 0) || R > diag * 20) return null;
    for (const v of vs) if (Math.abs(Math.hypot(...sub(pos(v), c)) - R) > Math.max(tolD * 10, R * 2e-3)) return null;
    return { c, R };
  };

  for (const tris of comps) {
    let reg = tryPlane(tris) || tryCyl(tris);
    if (reg) { const id = regions.length; regions.push(reg); for (const t of tris) region[t] = id; continue; }
    // neither: fall apart into coplanar groups. If the whole component sits
    // on one sphere, remember it: those facets get relaxed together afterwards.
    const sph = trySphere(tris);
    const inComp = new Set(tris);
    for (const s of tris) {
      if (region[s] >= 0) continue;
      const n0 = nrmOf(s), d0 = dot(pos(T[3 * s]), n0);
      const id = regions.length, list = [s];
      region[s] = id;
      for (let q = 0; q < list.length; q++) {
        const t = list[q];
        for (let i = 0; i < 3; i++) {
          const u = (twin[3 * t + i] / 3) | 0;
          if (region[u] >= 0 || !inComp.has(u) || degen[u] || degen[s]) continue;
          if (dot(nrmOf(u), n0) < COS_FLAT) continue;
          let ok = true;
          for (let k = 0; k < 3; k++) if (Math.abs(dot(pos(T[3 * u + k]), n0) - d0) > tolD * 10) ok = false;
          if (ok) { region[u] = id; list.push(u); }
        }
      }
      reg = tryPlane(list);
      if (!reg) return fail("a degenerate facet with no plane");
      reg.sphere = sph;
      reg.facet = true;                      // one facet of a curved surface, not a real plane
      regions.push(reg);
    }
  }

  // ---- param coordinates: per (triangle, corner); a cylinder corner may sit
  // on either side of the cut (wrap 0/1)
  const wrapOf = new Uint8Array(3 * nt);
  for (const reg of regions) {
    if (reg.kind !== "cyl") continue;
    for (const t of reg.tris) {
      const a = [0, 1, 2].map((i) => {
        let x = reg.th.get(T[3 * t + i]) - reg.cut;
        x -= Math.floor(x / (2 * Math.PI)) * 2 * Math.PI;
        return x;
      });
      if (Math.max(...a) - Math.min(...a) > Math.PI) {
        for (let i = 0; i < 3; i++) if (a[i] < Math.PI) wrapOf[3 * t + i] = 1;
        reg.tube = true;                       // closes on itself: there's a seam
      }
    }
  }
  const paramOf = (reg, v, wrap) => {
    const p = pos(v);
    if (reg.kind === "plane") return [dot(p, reg.e1), dot(p, reg.e2)];
    let x = reg.th.get(v) - reg.cut;
    x -= Math.floor(x / (2 * Math.PI)) * 2 * Math.PI;
    if (wrap) x += 2 * Math.PI;
    return [reg.R * x, dot(sub(p, reg.c), reg.axis)];
  };

  // ---- which regions get textured, and their lattices
  for (const reg of regions) {
    reg.textured = reg.tris.some((t) => !degen[t] && opt.wants(nrmOf(t)));
    reg.area = reg.tris.reduce((s, t) => s + area[t], 0);
  }

  // budget: lattice triangles on textured regions + everything left alone.
  // A first guess from areas: raise L until it fits (aligned lattices give
  // way to plain ones first, since they cost ~1.7x the triangles).
  let L = opt.L;
  let aligned = true;
  const specOf = (reg, L, aligned) => {
    const al = aligned && opt.lattice ? opt.lattice(reg, L) : null;
    return al || { kind: "equi", L };
  };
  for (let guard = 0; guard < 40; guard++) {
    let est = 0;
    for (const reg of regions) {
      if (!reg.textured) { est += reg.tris.length; continue; }
      const s = specOf(reg, L, aligned);
      const triArea = s.A
        ? (s.kind === "grid" ? 1 / 32 : s.kind === "rosette" ? 1 / 36 : 1 / 16) / Math.abs(s.A[0][0] * s.A[1][1] - s.A[0][1] * s.A[1][0])
        : ((s.pitch ? (2 * s.pitch) / Math.sqrt(3) : s.L) * (s.pitch || (s.L * Math.sqrt(3)) / 2)) / 2;
      est += Math.max(reg.tris.length, reg.area / triArea);
    }
    est *= 1.08;                             // boundary bands and the plain faces they touch
    if (est <= opt.maxTris) break;
    if (aligned) { aligned = false; continue; }
    L *= Math.max(1.05, Math.sqrt(est / opt.maxTris));
  }
  // ...then the real count decides. Many small facets (a model with no big
  // plane or cylinder to unroll) cost more than their area suggests: mesh,
  // count, and go coarser until it fits. Meshing is milliseconds; the kernel
  // import that follows is not.
  let result = null;
  for (let tries = 0; tries < 8; tries++) {
    result = meshAt(L, aligned);
    if (!result) return null;
    const n = result.faces.length / 3;
    if (n <= opt.maxTris) break;
    if (aligned) { aligned = false; continue; }
    L *= Math.max(1.1, Math.sqrt(n / opt.maxTris) * 1.05);
  }
  return result;

  function meshAt(L, aligned) {
  const specFor = (reg) => specOf(reg, L, aligned);
  const Lc = L * 2.5;                        // plain faces that only need to absorb split edges

  // ---- boundary edge splits (shared by both sides)
  const isCut = (h) => {
    // is half-edge h a boundary of its region's parameter domain?
    const g = twin[h];
    const t = (h / 3) | 0, u = (g / 3) | 0;
    if (region[t] !== region[u]) return true;
    const i = h % 3, j = g % 3;
    // same region: a seam if the two triangles disagree about which side of the cut
    return wrapOf[3 * t + i] !== wrapOf[3 * u + (j + 1) % 3] || wrapOf[3 * t + (i + 1) % 3] !== wrapOf[3 * u + j];
  };
  const splitsOf = new Map();                // edge key -> n pieces
  for (let t = 0; t < nt; t++) {
    for (let i = 0; i < 3; i++) {
      const h = 3 * t + i;
      if (!isCut(h)) continue;
      const a = T[h], b = T[3 * t + (i + 1) % 3];
      const k = ekey(a, b);
      if (splitsOf.has(k)) continue;
      const r1 = regions[region[t]], r2 = regions[region[(twin[h] / 3) | 0]];
      if (!r1.textured && !r2.textured) { splitsOf.set(k, 1); continue; }
      const len = Math.hypot(...sub(pos(a), pos(b)));
      splitsOf.set(k, Math.max(1, Math.ceil(len / L - 0.25)));
    }
  }
  for (const reg of regions) {
    reg.redo = reg.textured || reg.tris.some((t) => [0, 1, 2].some((i) =>
      isCut(3 * t + i) && splitsOf.get(ekey(T[3 * t + i], T[3 * t + (i + 1) % 3])) > 1));
  }

  // ---- output vertex table
  const outP = Array.from(P);
  const frame = [];
  const splitId = new Map();                 // "a_b_k" -> vertex id (a<b)
  const newVert = (p) => { outP.push(p[0], p[1], p[2]); return outP.length / 3 - 1; };
  const outT = [];
  const sphereFaces = new Map();             // sphere -> output faces from its remeshed facets

  for (const reg of regions) {
    if (!reg.textured) for (const t of reg.tris) for (let i = 0; i < 3; i++) frame[T[3 * t + i]] = (frame[T[3 * t + i]] || 0) | 4;
    if (!reg.redo) {
      for (const t of reg.tris) outT.push(T[3 * t], T[3 * t + 1], T[3 * t + 2]);
      continue;
    }
    if (reg.sphere) {
      let l = sphereFaces.get(reg.sphere);
      if (!l) sphereFaces.set(reg.sphere, l = []);
      reg.outFrom = l;
    }
    let tubeL = (2 * Math.PI * (reg.R || 0)) / 5;
    for (let pass = 0; pass < 4; pass++, tubeL /= 2) {
    const tri = new Tri2();
    const gid = [];                          // local point -> output vertex id
    const local = new Map();                 // vid*2+wrap -> local point
    const pt = (v, w) => {
      const key = v * 2 + w;
      let id = local.get(key);
      if (id === undefined) {
        const [x, y] = paramOf(reg, v, w);
        id = tri.addPoint(x, y, 0);
        gid[id] = v;
        local.set(key, id);
      }
      return id;
    };
    const dirEdge = new Map();               // "p,q" -> [t,i]
    for (const t of reg.tris) {
      const a = pt(T[3 * t], wrapOf[3 * t]), b = pt(T[3 * t + 1], wrapOf[3 * t + 1]), c = pt(T[3 * t + 2], wrapOf[3 * t + 2]);
      tri.addTri(a, b, c);
    }
    // Triangulate in a space where the lattice is regular: the pattern's own
    // (u, w) for a crossed lattice (an unrolled wall is about a percent
    // anisotropic in pattern units, plenty for Delaunay to pick the non-crease
    // diagonal of every cocircular quad), param space otherwise. Flips and
    // walks only use orientation, which an affine map preserves. Mirror if
    // needed so the region's own triangles read CCW.
    let spec = reg.textured ? specFor(reg) : { kind: "equi", L: Lc };
    // A full tube is a strip whose two long edges are the same seam. If its
    // lattice is coarse next to its circumference, a point mid-strip can join
    // BOTH copies of a seam vertex (a 5 mm pin at a big part's spacing did
    // exactly that). Keep five edges round, and halve again below if the
    // result still folds onto itself.
    if (reg.tube && tubeL < (spec.A ? L : spec.L)) spec = { kind: "equi", L: tubeL };
    let M = spec.A ? [spec.A[0].slice(), spec.A[1].slice()] : [[1, 0], [0, 1]];
    for (let i = 0; i < tri.x.length; i++) {
      const x = tri.x[i], y = tri.y[i];
      tri.x[i] = M[0][0] * x + M[0][1] * y; tri.y[i] = M[1][0] * x + M[1][1] * y;
    }
    let sgn = 0;
    for (let t = 0; t < tri.count; t++) sgn += tri.orient(tri.v[3 * t], tri.v[3 * t + 1], tri.v[3 * t + 2]);
    if (sgn < 0) {
      for (let i = 0; i < tri.x.length; i++) tri.x[i] = -tri.x[i];
      M = [[-M[0][0], -M[0][1]], M[1]];
    }
    const detM = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    const Minv = [[M[1][1] / detM, -M[0][1] / detM], [-M[1][0] / detM, M[0][0] / detM]];
    let span = 0;
    {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < tri.x.length; i++) {
        x0 = Math.min(x0, tri.x[i]); x1 = Math.max(x1, tri.x[i]); y0 = Math.min(y0, tri.y[i]); y1 = Math.max(y1, tri.y[i]);
      }
      span = Math.max(x1 - x0, y1 - y0) || 1;
    }
    const minArea = span * span * 1e-12;
    for (let t = 0; t < tri.count; t++) {
      if (tri.orient(tri.v[3 * t], tri.v[3 * t + 1], tri.v[3 * t + 2]) <= minArea) return fail("a degenerate or folded triangle in a region");
    }
    for (let t = 0; t < tri.count; t++) {
      for (let i = 0; i < 3; i++) dirEdge.set(`${tri.v[3 * t + i]},${tri.v[3 * t + (i + 1) % 3]}`, t * 3 + i);
    }
    for (let t = 0; t < tri.count; t++) {
      for (let i = 0; i < 3; i++) {
        const h = dirEdge.get(`${tri.v[3 * t + (i + 1) % 3]},${tri.v[3 * t + i]}`);
        tri.nb[3 * t + i] = h === undefined ? -1 : (h / 3) | 0;
      }
    }

    // split the boundary edges
    const bnd = [];
    for (let t = 0; t < tri.count; t++) for (let i = 0; i < 3; i++) {
      if (tri.nb[3 * t + i] < 0) bnd.push([tri.v[3 * t + i], tri.v[3 * t + (i + 1) % 3]]);
    }
    // a split rewrites its triangle's corners, so find each edge afresh
    const findEdge = (pa, pb) => {
      for (let t = 0; t < tri.count; t++) for (let i = 0; i < 3; i++) {
        if (tri.v[3 * t + i] === pa && tri.v[3 * t + (i + 1) % 3] === pb) return [t, i];
      }
      return null;
    };
    const segs = [];                         // boundary segments after splitting, for the clearance test
    for (const [pa, pb] of bnd) {
      const va = gid[pa], vb = gid[pb];
      const n = splitsOf.get(ekey(va, vb)) || 1;
      let prev = pa;
      if (n > 1) {
        const lo = Math.min(va, vb), hi = Math.max(va, vb);
        const plo = va === lo ? pa : pb, phi = va === lo ? pb : pa;
        const A3 = pos(lo), B3 = pos(hi);
        const at = findEdge(pa, pb);
        if (!at) return fail("lost a boundary edge while splitting");
        let [t, i] = at;
        for (let s = 1; s < n; s++) {
          // walk from pa toward pb; k counts from the canonical low end
          const k = va === lo ? s : n - s;
          const f = k / n;
          const x = tri.x[plo] + (tri.x[phi] - tri.x[plo]) * f, y = tri.y[plo] + (tri.y[phi] - tri.y[plo]) * f;
          const p = tri.addPoint(x, y, 0);
          const key = `${lo}_${hi}_${k}`;
          let g = splitId.get(key);
          if (g === undefined) {
            g = newVert([A3[0] + (B3[0] - A3[0]) * f, A3[1] + (B3[1] - A3[1]) * f, A3[2] + (B3[2] - A3[2]) * f]);
            splitId.set(key, g);
          }
          gid[p] = g;
          segs.push([prev, p]);
          prev = p;
          t = tri.splitBoundary(t, i, p);
          i = 0;
        }
      }
      segs.push([prev, pb]);
    }

    // drop the lattice in
    const tol = { area: minArea, circle: 0 };
    // cocircular tie-break toward the pattern's creases
    const prefer = spec.kind === "crossed" ? (ta, tb) => !(ta === 2 && tb === 2)
      : spec.kind === "grid" || spec.kind === "rosette" ? (ta, tb) => Math.max(ta, tb)
      : null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < tri.x.length; i++) {
      x0 = Math.min(x0, tri.x[i]); x1 = Math.max(x1, tri.x[i]); y0 = Math.min(y0, tri.y[i]); y1 = Math.max(y1, tri.y[i]);
    }
    // the lattice is defined in param space: cover this box's preimage
    let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const u = Minv[0][0] * x + Minv[0][1] * y, w = Minv[1][0] * x + Minv[1][1] * y;
      px0 = Math.min(px0, u); px1 = Math.max(px1, u); py0 = Math.min(py0, w); py1 = Math.max(py1, w);
    }
    const lat = latticePoints(spec, px0, py0, px1, py1);
    // nearest-neighbour spacing where we triangulate: corner to centre is
    // (1/4, 1/4) in the crossed lattice's (u, w)
    // (the rosette's rings sit 0.15 apart: clear them at 0.55 * 0.25, not more)
    const h = spec.kind === "crossed" ? Math.SQRT2 / 4 : spec.kind === "grid" || spec.kind === "rosette" ? 0.25 : lat.h;
    tol.circle = h ** 4 * 1e-7;
    const clear = 0.55 * h;
    // grid hash of boundary segments and existing points
    const cell = h;
    const grid = new Map();
    const gkey = (i, j) => i * 73856093 + j * 19349663;
    const addToGrid = (x, y, item) => {
      const k = gkey(Math.floor(x / cell), Math.floor(y / cell));
      const l = grid.get(k); if (l) l.push(item); else grid.set(k, [item]);
    };
    for (const s of segs) {
      const [a, b] = s;
      const len = Math.hypot(tri.x[b] - tri.x[a], tri.y[b] - tri.y[a]);
      const steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
      const seen = new Set();
      for (let q = 0; q <= steps; q++) {
        const x = tri.x[a] + ((tri.x[b] - tri.x[a]) * q) / steps, y = tri.y[a] + ((tri.y[b] - tri.y[a]) * q) / steps;
        const k = gkey(Math.floor(x / cell), Math.floor(y / cell));
        if (seen.has(k)) continue;
        seen.add(k);
        addToGrid(x, y, { seg: s });
      }
    }
    for (let i = 0; i < tri.x.length; i++) addToGrid(tri.x[i], tri.y[i], { pt: i });
    const tooClose = (x, y) => {
      const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const l = grid.get(gkey(ci + di, cj + dj));
        if (!l) continue;
        for (const it of l) {
          if (it.pt !== undefined) {
            if (Math.hypot(tri.x[it.pt] - x, tri.y[it.pt] - y) < clear) return true;
          } else {
            const [a, b] = it.seg;
            const ax = tri.x[a], ay = tri.y[a], bx = tri.x[b], by = tri.y[b];
            const dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy || 1;
            const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ll));
            if (Math.hypot(ax + dx * f - x, ay + dy * f - y) < clear) return true;
          }
        }
      }
      return false;
    };
    // the region's ORIGINAL interior edges are flippable already; legalize
    // the boundary fans before inserting so walks stay short
    {
      const all = [];
      for (let t = 0; t < tri.count; t++) all.push(t);
      tri.legalize(all, tol, prefer);
    }
    const eps = minArea;
    let last = 0;
    for (const [lx, ly, tag] of lat.pts) {
      let x = M[0][0] * lx + M[0][1] * ly, y = M[1][0] * lx + M[1][1] * ly;
      if (tooClose(x, y)) continue;
      let t = tri.locate(x, y, last, eps);
      if (t < 0) continue;                    // outside the region (a hole, or past its edge)
      // too near an interior edge: nudge toward the triangle's middle
      for (let tries = 0; tries < 3; tries++) {
        let near = false;
        for (let i = 0; i < 3; i++) {
          const a = tri.v[3 * t + i], b = tri.v[3 * t + (i + 1) % 3];
          const el = Math.hypot(tri.x[b] - tri.x[a], tri.y[b] - tri.y[a]) || 1;
          if (tri.orientP(a, b, x, y) / el < 1e-4 * h) near = true;
        }
        if (!near) break;
        const a = tri.v[3 * t], b = tri.v[3 * t + 1], c = tri.v[3 * t + 2];
        const mx = (tri.x[a] + tri.x[b] + tri.x[c]) / 3, my = (tri.y[a] + tri.y[b] + tri.y[c]) / 3;
        const dl = Math.hypot(mx - x, my - y) || 1;
        x += ((mx - x) / dl) * Math.min(dl * 0.5, 4e-4 * h);
        y += ((my - y) / dl) * Math.min(dl * 0.5, 4e-4 * h);
      }
      const p = tri.addPoint(x, y, tag);
      addToGrid(x, y, { pt: p });
      // back to 3D, on the true surface
      const ux = Minv[0][0] * x + Minv[0][1] * y, uy = Minv[1][0] * x + Minv[1][1] * y;
      let g;
      if (reg.kind === "plane") {
        g = newVert([0, 1, 2].map((k) => reg.n[k] * reg.d + reg.e1[k] * ux + reg.e2[k] * uy));
      } else {
        const a = reg.cut + ux / reg.R, ca = Math.cos(a) * reg.R, sa = Math.sin(a) * reg.R;
        g = newVert([0, 1, 2].map((k) => reg.c[k] + reg.e1[k] * ca + reg.e2[k] * sa + reg.axis[k] * uy));
      }
      gid[p] = g;
      const ts = tri.splitInside(t, p);
      tri.legalize(ts.slice(), tol, prefer);
      last = t;
    }
    // final sweep: everything Delaunay (cheap when it already is)
    {
      const all = [];
      for (let t = 0; t < tri.count; t++) all.push(t);
      tri.legalize(all, tol, prefer);
    }
    if (reg.tube && pass < 3) {
      // did the strip fold onto itself across the seam?
      const seenHere = new Set();
      let folded = false;
      for (let t = 0; t < tri.count && !folded; t++) {
        const a = gid[tri.v[3 * t]], b = gid[tri.v[3 * t + 1]], c = gid[tri.v[3 * t + 2]];
        if (a === b || b === c || a === c) folded = true;
        for (const k of [`${a},${b}`, `${b},${c}`, `${c},${a}`]) {
          if (seenHere.has(k)) folded = true;
          seenHere.add(k);
        }
      }
      if (folded) continue;                  // finer, from scratch (split points are reused)
    }
    const fl = !reg.textured ? 4
      : 8 | (reg.kind === "cyl" && Math.abs(reg.axis[2]) > 0.999 ? 1 : 0) | (reg.facet ? 0 : 2);
    for (let t = 0; t < tri.count; t++) {
      const a = gid[tri.v[3 * t]], b = gid[tri.v[3 * t + 1]], c = gid[tri.v[3 * t + 2]];
      // (the CDT space was mirrored if needed so the region's own triangles
      // read CCW there: CCW in it is the 3D winding)
      if (reg.outFrom) reg.outFrom.push(outT.length / 3);
      outT.push(a, b, c);
      if (fl) for (const v of [a, b, c]) frame[v] = (frame[v] || 0) | fl;
    }
    break;
    }
  }

  // ---- even out remeshed sphere patches (their facets were done one by one)
  for (const [sph, faces] of sphereFaces) relaxSpherePatch(outP, outT, faces, sph);

  // ---- must be closed, consistently wound, and free of collapsed triangles
  const nOut = outP.length / 3;
  const seen = new Map();
  for (let f = 0; f < outT.length; f += 3) {
    const a = outT[f], b = outT[f + 1], c = outT[f + 2];
    if (a === b || b === c || a === c) return fail("result has a collapsed triangle");
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = p * nOut + q;
      if (seen.has(k)) return fail("result has a doubled edge");
      seen.set(k, 1);
    }
  }
  for (const k of seen.keys()) {
    const p = Math.floor(k / nOut), q = k % nOut;
    if (!seen.has(q * nOut + p)) return fail("result is not closed");
  }
  const flags = new Uint8Array(nOut);
  for (let i = 0; i < frame.length; i++) if (frame[i]) flags[i] = frame[i];
  return { verts: Float64Array.from(outP), faces: Uint32Array.from(outT), frame: flags, L };
  }
}
