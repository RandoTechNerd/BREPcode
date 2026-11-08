// Finds the true shape behind a B-spline surface in a STEP file.
//
// Exporters often write plain shapes as splines: Fusion writes many fillets
// and turned faces as B-spline surfaces, and a rational quadratic spline is
// the textbook way to write a circle. The converter only recognises planes,
// cylinders, cones, spheres and tori, so a spline that IS one of those, to
// within `tol`, is handed back as that surface and the face converts like
// any other.
//
// fitSurface(spline, tol) -> { surface, flip, err } | null
//   spline: { du, dv, P: [[pt]], W: [[w]] | null, U, V }  (knot vectors expanded)
//   surface: { type, o, z, x, y, r, R, angle } in the reader's conventions
//     (cylinder/cone/sphere/torus normals point away from the axis/centre)
//   flip: the spline's own normal (dS/du x dS/dv) points the other way, so the
//     face's sense must flip to keep pointing out of the solid

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// a point of a (rational) B-spline curve with control points of any width
function deBoor(p, U, P, u) {
  const n = P.length - 1;
  let k = p;
  for (let i = p; i < U.length - p - 1; i++) if (u >= U[i] && u < U[i + 1]) k = i;
  if (u >= U[n + 1]) k = n;
  const d = [];
  for (let j = 0; j <= p; j++) d.push((P[k - p + j] || P[n]).slice());
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const den = U[i + p - r + 1] - U[i];
      const a = den ? (u - U[i]) / den : 0;
      for (let c = 0; c < d[j].length; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
    }
  }
  return d[p];
}

export function evalSurface(s, u, v) {
  // homogeneous rows along v, then one column along u
  const rows = s.P.map((row, i) => deBoor(s.dv, s.V, row.map((q, j) => { const w = s.W ? s.W[i][j] : 1; return [q[0] * w, q[1] * w, q[2] * w, w]; }), v));
  const h = deBoor(s.du, s.U, rows, u);
  return [h[0] / h[3], h[1] / h[3], h[2] / h[3]];
}

// symmetric 3x3 eigen pairs (Jacobi), ascending
function eig3(A) {
  const a = A.map((r) => r.slice());
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return [0, 1, 2].map((i) => ({ val: a[i][i], vec: [V[0][i], V[1][i], V[2][i]] })).sort((x, y) => x.val - y.val);
}

function cov(pts, m) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = sub(p, m); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  return C;
}
const mean = (pts) => mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);

// small dense least squares (normal equations, Gaussian elimination)
function lsq(rows, rhs, square = false) {
  const n = rows[0].length;
  const A = square ? rows.map((r, i) => [...r, rhs[i]]) : Array.from({ length: n }, () => new Array(n + 1).fill(0));
  if (!square) rows.forEach((r, k) => { for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] += r[i] * r[j]; A[i][n] += r[i] * rhs[k]; } });
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-14) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}

function frame(z) {
  const x = unit(Math.abs(z[2]) < 0.9 ? cross([0, 0, 1], z) : cross(z, [1, 0, 0]));
  return { z, x, y: cross(z, x) };
}

// circle through planar points (2D algebraic fit): { c: [u,v], r }
function circle2(q) {
  const s = lsq(q.map(([u, v]) => [u, v, 1]), q.map(([u, v]) => u * u + v * v));
  if (!s) return null;
  const c = [s[0] / 2, s[1] / 2];
  const r2 = s[2] + c[0] * c[0] + c[1] * c[1];
  return r2 > 0 ? { c, r: Math.sqrt(r2) } : null;
}

// the outward normal of an analytic surface at p
function normalOf(s, p) {
  if (s.type === "plane") return s.z;
  if (s.type === "sphere") return unit(sub(p, s.o));
  const d = sub(p, s.o), h = dot(d, s.z);
  const radial = unit(sub(d, mul(s.z, h)));
  if (s.type === "cylinder") return radial;
  if (s.type === "cone") return unit(sub(mul(radial, Math.cos(s.angle)), mul(s.z, Math.sin(s.angle))));
  // torus: away from the tube's centre circle
  return unit(sub(p, add(s.o, mul(radial, s.R))));
}

function distTo(s, p) {
  if (s.type === "plane") return Math.abs(dot(sub(p, s.o), s.z));
  if (s.type === "sphere") return Math.abs(len(sub(p, s.o)) - s.r);
  const d = sub(p, s.o), h = dot(d, s.z), rho = len(sub(d, mul(s.z, h)));
  if (s.type === "cylinder") return Math.abs(rho - s.r);
  if (s.type === "cone") return Math.abs((rho - (s.r + h * Math.tan(s.angle))) * Math.cos(s.angle));
  return Math.abs(Math.hypot(rho - s.R, h) - s.r);
}

// Levenberg-Marquardt on the shape's own numbers, minimising the squared
// distances from the samples (the algebraic fits above only get close)
const PACK = {
  plane: { get: (s) => [...s.o, ...s.z], set: (v) => ({ type: "plane", o: v.slice(0, 3), ...frame(unit(v.slice(3, 6))) }) },
  sphere: { get: (s) => [...s.o, s.r], set: (v) => ({ type: "sphere", o: v.slice(0, 3), ...frame([0, 0, 1]), r: Math.abs(v[3]) }) },
  cylinder: { get: (s) => [...s.o, ...s.z, s.r], set: (v) => ({ type: "cylinder", o: v.slice(0, 3), ...frame(unit(v.slice(3, 6))), r: Math.abs(v[6]) }) },
  cone: { get: (s) => [...s.o, ...s.z, s.r, s.angle], set: (v) => ({ type: "cone", o: v.slice(0, 3), ...frame(unit(v.slice(3, 6))), r: v[6], angle: v[7] }) },
  torus: { get: (s) => [...s.o, ...s.z, s.R, s.r], set: (v) => ({ type: "torus", o: v.slice(0, 3), ...frame(unit(v.slice(3, 6))), R: Math.abs(v[6]), r: Math.abs(v[7]) }) },
};
const signedDist = (s, p) => {
  if (s.type === "plane") return dot(sub(p, s.o), s.z);
  if (s.type === "sphere") return len(sub(p, s.o)) - s.r;
  const d = sub(p, s.o), h = dot(d, s.z), rho = len(sub(d, mul(s.z, h)));
  if (s.type === "cylinder") return rho - s.r;
  if (s.type === "cone") return (rho - (s.r + h * Math.tan(s.angle))) * Math.cos(s.angle);
  return Math.hypot(rho - s.R, h) - s.r;
};
function refine(s0, pts) {
  const pk = PACK[s0.type];
  let v = pk.get(s0);
  const res = (v) => { const s = pk.set(v); return pts.map((p) => signedDist(s, p)); };
  const ss = (r) => r.reduce((a, x) => a + x * x, 0);
  let r = res(v), e = ss(r), lam = 1e-3;
  const scale = Math.max(1e-9, ...v.map(Math.abs));
  for (let it = 0; it < 40 && e > 0; it++) {
    const J = v.map((_, k) => { const h = 1e-7 * Math.max(Math.abs(v[k]), scale * 1e-3); const w = v.slice(); w[k] += h; return res(w).map((x, i) => (x - r[i]) / h); });
    const n = v.length;
    const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => J[i].reduce((a, x, q) => a + x * J[j][q], 0)));
    const g = J.map((Ji) => Ji.reduce((a, x, q) => a + x * r[q], 0));
    let stepped = false;
    for (let tries = 0; tries < 8; tries++) {
      const M = A.map((row, i) => row.map((x, j) => x + (i === j ? lam * (A[i][i] || 1) : 0)));
      const d = lsq(M, g.map((x) => -x).map((x, i) => x), true);
      if (!d) { lam *= 10; continue; }
      const w = v.map((x, k) => x + d[k]);
      const r2 = res(w), e2 = ss(r2);
      if (e2 < e) { v = w; r = r2; const de = e - e2; e = e2; lam = Math.max(lam / 10, 1e-12); stepped = de > e * 1e-9; break; }
      lam *= 10;
    }
    if (!stepped) break;
  }
  return pk.set(v);
}

export function fitSurface(spl, tol) {
  const u0 = spl.U[spl.du], u1 = spl.U[spl.U.length - spl.du - 1];
  const v0 = spl.V[spl.dv], v1 = spl.V[spl.V.length - spl.dv - 1];
  const N = 9, pts = [], nrm = [];
  const hu = (u1 - u0) * 1e-5, hv = (v1 - v0) * 1e-5;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    // stay off the patch edges so the finite differences stay inside it
    const u = u0 + (u1 - u0) * (0.02 + 0.96 * i / N), v = v0 + (v1 - v0) * (0.02 + 0.96 * j / N);
    const p = evalSurface(spl, u, v);
    const n = cross(sub(evalSurface(spl, u + hu, v), evalSurface(spl, u - hu, v)), sub(evalSurface(spl, u, v + hv), evalSurface(spl, u, v - hv)));
    if (len(n) < 1e-20) continue;     // a pole (a sphere or cone tip row)
    pts.push(p); nrm.push(unit(n));
  }
  if (pts.length < 20) return null;
  const m = mean(pts);
  const size = Math.max(...pts.map((p) => len(sub(p, m)))) * 2 || 1;
  // a fitted shape must stay a sensible size: a near-flat patch fits a huge
  // sphere or cylinder, and the plane is the right answer for it
  const big = size * 50;
  const tries = [];

  const pe = eig3(cov(pts, m));
  if (pe[0].val <= pts.length * tol * tol) tries.push({ type: "plane", o: m, ...frame(pe[0].vec) });

  // sphere: |p|^2 = 2 c.p + k
  const pc = pts.map((p) => sub(p, m));
  const sp = lsq(pc.map((p) => [p[0], p[1], p[2], 1]), pc.map((p) => dot(p, p)));
  if (sp) {
    const c = [sp[0] / 2, sp[1] / 2, sp[2] / 2], r2 = sp[3] + dot(c, c);
    if (r2 > 0 && Math.sqrt(r2) < big) tries.push({ type: "sphere", o: add(m, c), ...frame([0, 0, 1]), r: Math.sqrt(r2) });
  }

  // surfaces of revolution: every normal meets the axis. For a cylinder or
  // cone, n.axis is the same everywhere, so the axis is the normals' flattest
  // direction once their mean is taken off.
  const nm = mean(nrm);
  const ne = eig3(cov(nrm, nm));
  if (ne[1].val > 1e-6 * nrm.length) {
    const a = ne[0].vec, c = dot(nm, a);
    if (Math.abs(c) < 1e-6 && nrm.every((n) => Math.abs(dot(n, a)) < 1e-4)) {
      const f = frame(a);
      const cc = circle2(pts.map((p) => [dot(sub(p, m), f.x), dot(sub(p, m), f.y)]));
      if (cc && cc.r < big) {
        const o = add(m, add(mul(f.x, cc.c[0]), mul(f.y, cc.c[1])));
        tries.push({ type: "cylinder", o, ...f, r: cc.r });
      }
    } else if (Math.abs(c) < 0.999) {
      // cone: every point's generator runs through the apex, so n.(p - apex) = 0
      const apex = lsq(nrm, pts.map((p, k) => dot(nrm[k], p)));
      if (apex && len(sub(apex, m)) < big) {
        // z points the way the cone widens
        let z = a;
        const hs = pts.map((p) => dot(sub(p, apex), z));
        if (hs.reduce((s, h) => s + h, 0) < 0) z = mul(z, -1);
        const f = frame(z);
        const h = dot(sub(m, apex), z);
        const rho = len(sub(sub(m, apex), mul(z, h)));
        const angle = Math.atan2(rho, h);
        if (angle > 1e-3 && angle < Math.PI / 2 - 1e-3) tries.push({ type: "cone", o: add(apex, mul(z, h)), ...f, r: rho, angle });
      }
    }
  }

  // torus: p - r n lies on the centre circle for the right tube radius r (r is
  // signed here so the spline's normal may point either way)
  if (ne[1].val > 1e-6 * nrm.length) {
    const ring = (r) => {
      const q = pts.map((p, k) => sub(p, mul(nrm[k], r)));
      const qm = mean(q), qe = eig3(cov(q, qm));
      const f = frame(qe[0].vec);
      const cc = circle2(q.map((p) => [dot(sub(p, qm), f.x), dot(sub(p, qm), f.y)]));
      if (!cc) return null;
      let e = qe[0].val;
      for (const p of q) { const d = [dot(sub(p, qm), f.x) - cc.c[0], dot(sub(p, qm), f.y) - cc.c[1]]; e += (Math.hypot(d[0], d[1]) - cc.r) ** 2; }
      return { e, o: add(qm, add(mul(f.x, cc.c[0]), mul(f.y, cc.c[1]))), f, R: cc.r };
    };
    let best = null;
    const S = 120;
    for (let k = 1; k <= S; k++) for (const sg of [1, -1]) {
      const r = sg * size * k / S;
      const g = ring(r);
      if (g && (!best || g.e < best.g.e)) best = { r, g };
    }
    if (best) {
      // refine the tube radius by golden section around the best scan step
      let lo = best.r - size / S, hi = best.r + size / S;
      const G = (Math.sqrt(5) - 1) / 2;
      for (let it = 0; it < 40; it++) {
        const x1 = hi - G * (hi - lo), x2 = lo + G * (hi - lo);
        const e1 = ring(x1)?.e ?? Infinity, e2 = ring(x2)?.e ?? Infinity;
        if (e1 < e2) hi = x2; else lo = x1;
      }
      const r = (lo + hi) / 2, g = ring(r);
      if (g && g.R > 1e-9 && g.R < big) tries.push({ type: "torus", o: g.o, ...g.f, R: g.R, r: Math.abs(r) });
    }
  }

  let pick = null;
  for (const t of tries) {
    const s = refine(t, pts);
    const err = Math.max(...pts.map((p) => distTo(s, p)));
    if (err <= tol && (!pick || err < pick.err - tol * 1e-3)) pick = { surface: s, err };
  }
  if (!pick) return null;
  // the plane's own normal is arbitrary: set it along the spline's
  if (pick.surface.type === "plane" && dot(pick.surface.z, nrm[0]) < 0) {
    const s = pick.surface;
    pick.surface = { ...s, z: mul(s.z, -1), x: s.x, y: mul(s.y, -1) };
  }
  const k = Math.floor(pts.length / 2);
  pick.flip = dot(normalOf(pick.surface, pts[k]), nrm[k]) < 0;
  return pick;
}
