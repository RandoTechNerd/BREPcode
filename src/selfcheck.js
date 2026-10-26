// Self-check: measure the model as built and diff it against the feature
// table the AI read off the picture (src/imageread.js).
//
// The measurement works on the exact kernel's FACES, one tessellated buffer
// per B-rep face (what src/engine.js and the viewer's worker already hand
// around), so it runs the same in Node (bench/cadgen) and in the browser
// (the chat). Every vertex of an exact face lies ON its surface, so a
// cylinder or cone fitted to one face's vertices and normals recovers the
// true axis and radius to float precision; nothing here is a mesh estimate.
//
//   measureFaces(faces)          -> { bounds, size, cylinders, cones, holes, bosses, slotEnds, planes, blends }
//   diffTable(table, measured, { inside, skipped })
//                                -> { ok, score, checked, issues, notes, frame, missing, skipped, unchecked }
//   makeInside(faces)            -> p => true when p is in the material
//   skippedFromCode(code)        -> [{ id, why }] from the code's // SKIP <id>: <why> lines
//   issuesText(diff)             -> the issues as lines for the AI or the user
//
// Plain arrays in, plain objects out; no three.js, no kernel.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const fmt = (v) => String(Math.round(v * 100) / 100);
const fv = (p) => `(${p.map(fmt).join(", ")})`;

// Eigen-decomposition of a symmetric 3x3 matrix (Jacobi). Values ascending.
export function eigSym3(A) {
  const a = A.map((r) => r.slice());
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
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
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return [0, 1, 2].map((i) => ({ value: a[i][i], vector: [V[0][i], V[1][i], V[2][i]] }))
    .sort((x, y) => x.value - y.value);
}

// One axis direction per line, whichever way it was found: the largest
// component positive, so +z and -z holes compare equal.
function canonAxis(a) {
  const i = [0, 1, 2].reduce((m, k) => (Math.abs(a[k]) > Math.abs(a[m]) ? k : m), 0);
  return a[i] < 0 ? mul(a, -1) : a;
}

// Unique vertices and their normals of one face buffer.
function faceSamples(face) {
  const P = face.positions, N = face.normals;
  const pts = [], nrm = [], seen = new Set();
  for (let i = 0; i < P.length / 3; i++) {
    const k = `${Math.round(P[3 * i] * 1e4)},${Math.round(P[3 * i + 1] * 1e4)},${Math.round(P[3 * i + 2] * 1e4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pts.push([P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
    if (N) nrm.push(unit([N[3 * i], N[3 * i + 1], N[3 * i + 2]]));
  }
  return { pts, nrm };
}

// What one B-rep face is: a plane, a cylinder, a cone, or "other" (sphere,
// torus, B-spline). For the round ones: the axis line, the radius (at both
// ends for a cone), the extent along the axis, how much of the full turn the
// face covers, and whether it is concave (a hole's wall: the normals point at
// the axis) or convex (a boss's).
export function classifyFace(face) {
  const { pts, nrm } = faceSamples(face);
  if (pts.length < 3 || nrm.length !== pts.length) return { kind: "other" };
  const n = nrm.length;
  const mean = [0, 0, 0];
  for (const v of nrm) { mean[0] += v[0] / n; mean[1] += v[1] / n; mean[2] += v[2] / n; }
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const v of nrm) {
    const d = sub(v, mean);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j] / n;
  }
  const eig = eigSym3(C);
  if (eig[2].value < 1e-6) {
    const nn = unit(mean);
    return { kind: "plane", normal: nn, offset: dot(nn, pts[0]), count: pts.length };
  }
  // A surface of revolution: the normals' spread is flat across the axis.
  if (eig[0].value > 1e-4 * eig[2].value + 1e-9) return { kind: "other" };
  const a = canonAxis(unit(eig[0].vector));
  const sinA = nrm.reduce((s, v) => s + dot(v, a), 0) / n;
  // Every normal line of a surface of revolution meets the axis: the axis
  // point is their least-squares meeting point in the plane across it.
  const u = unit(cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), w = cross(a, u);
  let s11 = 0, s12 = 0, s22 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const p = [dot(pts[i], u), dot(pts[i], w)];
    let d = [dot(nrm[i], u), dot(nrm[i], w)];
    const dl = Math.hypot(d[0], d[1]);
    if (dl < 1e-6) continue;
    d = [d[0] / dl, d[1] / dl];
    const m11 = 1 - d[0] * d[0], m12 = -d[0] * d[1], m22 = 1 - d[1] * d[1];
    s11 += m11; s12 += m12; s22 += m22;
    b1 += m11 * p[0] + m12 * p[1]; b2 += m12 * p[0] + m22 * p[1];
  }
  const det = s11 * s22 - s12 * s12;
  if (Math.abs(det) < 1e-9 * (s11 + s22) ** 2) return { kind: "other" };
  const cu = (s22 * b1 - s12 * b2) / det, cw = (s11 * b2 - s12 * b1) / det;
  const origin = add(mul(u, cu), mul(w, cw));   // the axis point nearest the global origin's line
  const ts = [], rs = [], angs = [];
  let concave = 0;
  for (let i = 0; i < n; i++) {
    const rel = sub(pts[i], origin);
    const t = dot(rel, a);
    const radial = sub(rel, mul(a, t));
    const r = len(radial);
    ts.push(t); rs.push(r);
    angs.push(Math.atan2(dot(radial, w), dot(radial, u)));
    if (r > 1e-9 && dot(nrm[i], radial) < 0) concave++;
  }
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  // angular coverage: the full turn less the widest gap between samples
  angs.sort((x, y) => x - y);
  let gap = angs[0] + 2 * Math.PI - angs[angs.length - 1];
  for (let i = 1; i < angs.length; i++) gap = Math.max(gap, angs[i] - angs[i - 1]);
  const coverage = 1 - gap / (2 * Math.PI);
  const out = { axis: a, origin, t0, t1, coverage, concave: concave > n / 2, count: n };
  if (Math.abs(sinA) < 0.02) {
    const r = rs.reduce((s, v) => s + v, 0) / n;
    const resid = Math.max(...rs.map((v) => Math.abs(v - r)));
    if (resid > 0.01 * r + 1e-4) return { kind: "other" };
    return { kind: "cylinder", r, ...out };
  }
  // cone: radius linear along t; fit r = r0 + k t
  let st = 0, sr = 0, stt = 0, str = 0;
  for (let i = 0; i < n; i++) { st += ts[i]; sr += rs[i]; stt += ts[i] * ts[i]; str += ts[i] * rs[i]; }
  const den = n * stt - st * st;
  if (Math.abs(den) < 1e-12) return { kind: "other" };
  const k = (n * str - st * sr) / den, r0 = (sr - k * st) / n;
  return { kind: "cone", r0: r0 + k * t0, r1: r0 + k * t1, halfAngle: Math.atan(Math.abs(k)) * 180 / Math.PI, ...out };
}

// Ray-parity point-in-solid against every triangle of every face.
export function makeInside(faces) {
  const tris = [];
  for (const f of faces) {
    const P = f.positions, I = f.index || Array.from({ length: P.length / 3 }, (_, i) => i);
    for (let t = 0; t + 2 < I.length; t += 3) {
      const v = (k) => [P[3 * I[t + k]], P[3 * I[t + k] + 1], P[3 * I[t + k] + 2]];
      tris.push([v(0), v(1), v(2)]);
    }
  }
  const dirs = [unit([0.5773, 0.6123, 0.5401]), unit([-0.3127, 0.8341, -0.4542]), unit([0.7071, -0.4123, -0.5747])];
  const hits = (o, d) => {
    let c = 0;
    for (const [a, b, cc] of tris) {
      const e1 = sub(b, a), e2 = sub(cc, a), p = cross(d, e2), det = dot(e1, p);
      if (Math.abs(det) < 1e-14) continue;
      const inv = 1 / det, s = sub(o, a), uu = dot(s, p) * inv;
      if (uu < 0 || uu > 1) continue;
      const q = cross(s, e1), vv = dot(d, q) * inv;
      if (vv < 0 || uu + vv > 1) continue;
      if (dot(e2, q) * inv > 1e-9) c++;
    }
    return c;
  };
  // majority of three rays, so one grazing ray can't flip the answer
  return (p) => dirs.reduce((s, d) => s + (hits(p, d) % 2), 0) >= 2;
}

const sameLine = (A, B, tolPos, tolAng = 2e-3) => {
  if (Math.abs(Math.abs(dot(A.axis, B.axis)) - 1) > tolAng) return false;
  const d = sub(B.origin, A.origin);
  return len(sub(d, mul(A.axis, dot(d, A.axis)))) <= tolPos;
};
// Where along A's axis B's t-range sits (B may have its own origin on the line).
const shiftT = (A, B) => dot(sub(B.origin, A.origin), A.axis) * Math.sign(dot(A.axis, B.axis) || 1);

// faces: [{ positions, normals, index }] one per B-rep face, in model mm.
export function measureFaces(faces, { inside = true } = {}) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) {
    const P = f.positions;
    for (let i = 0; i < P.length; i++) { const k = i % 3; if (P[i] < lo[k]) lo[k] = P[i]; if (P[i] > hi[k]) hi[k] = P[i]; }
  }
  const size = hi.map((v, k) => v - lo[k]);
  const diag = Math.hypot(...size) || 1;
  const tolPos = Math.max(1e-3, 1e-4 * diag);
  const shapes = faces.map(classifyFace);
  const cylinders = [], cones = [];
  // merge faces of one surface (a hole is often two half-faces)
  for (const s of shapes) {
    if (s.kind !== "cylinder" && s.kind !== "cone") continue;
    const list = s.kind === "cylinder" ? cylinders : cones;
    const twin = list.find((c) => c.concave === s.concave && sameLine(c, s, tolPos)
      && (s.kind === "cylinder" ? Math.abs(c.r - s.r) < tolPos * 2
        : Math.abs(c.halfAngle - s.halfAngle) < 0.5 && Math.abs(shiftT(c, s) + s.t0 - c.t0) < tolPos * 5));
    if (twin) {
      const dt = shiftT(twin, s);
      twin.t0 = Math.min(twin.t0, s.t0 + dt); twin.t1 = Math.max(twin.t1, s.t1 + dt);
      twin.coverage = Math.min(1, twin.coverage + s.coverage);
      twin.faces++;
    } else list.push({ ...s, faces: 1 });
  }
  const inSolid = inside ? makeInside(faces) : null;
  const at = (c, t) => add(c.origin, mul(c.axis, t));
  // HOLES: full concave cylinders, stacked with their coaxial neighbours
  // (a counterbore, a countersink cone, a drill point) into one feature.
  const holes = [];
  const full = cylinders.filter((c) => c.concave && c.coverage > 0.8).sort((a, b) => a.r - b.r);
  const used = new Set();
  for (const c of full) {
    if (used.has(c)) continue;
    used.add(c);
    const segs = [{ kind: "cyl", d: 2 * c.r, t0: c.t0, t1: c.t1 }];
    for (const o of full) if (!used.has(o) && sameLine(c, o, tolPos * 10)) {
      used.add(o); const dt = shiftT(c, o);
      segs.push({ kind: "cyl", d: 2 * o.r, t0: o.t0 + dt, t1: o.t1 + dt });
    }
    for (const k of cones) if (k.concave && k.coverage > 0.8 && sameLine(c, k, tolPos * 10)) {
      const dt = shiftT(c, k);
      const flip = Math.sign(dot(c.axis, k.axis)) < 0;
      segs.push({ kind: "cone", d0: 2 * (flip ? k.r1 : k.r0), d1: 2 * (flip ? k.r0 : k.r1), angle: 2 * k.halfAngle, t0: k.t0 + dt, t1: k.t1 + dt });
    }
    segs.sort((a, b) => a.t0 - b.t0);
    const t0 = Math.min(...segs.map((s) => s.t0)), t1 = Math.max(...segs.map((s) => s.t1));
    const eps = Math.max(0.05, 0.002 * diag);
    const open0 = inSolid ? !inSolid(at(c, t0 - eps)) : null;
    const open1 = inSolid ? !inSolid(at(c, t1 + eps)) : null;
    const bore = segs.filter((s) => s.kind === "cyl").reduce((m, s) => (s.d < m.d ? s : m));
    const hole = {
      axis: c.axis.map(r3), point: at(c, (t0 + t1) / 2).map(r3), d: r3(bore.d),
      length: r3(t1 - t0), boreLength: r3(bore.t1 - bore.t0),
      ends: [at(c, t0).map(r3), at(c, t1).map(r3)], through: open0 && open1, open: [open0, open1],
      segments: segs.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" ? r3(v) : v]))),
    };
    // counterbore / countersink: a wider step or a cone at an open end
    for (const [end, open] of [[0, open0], [1, open1]]) {
      if (open === false) continue;
      const tEnd = end ? t1 : t0;
      const atEnd = segs.filter((s) => Math.abs((end ? s.t1 : s.t0) - tEnd) < eps);
      const cb = atEnd.find((s) => s.kind === "cyl" && s.d > bore.d + 2 * tolPos);
      if (cb) hole.cbore = { d: r3(cb.d), depth: r3(cb.t1 - cb.t0), end };
      const ck = atEnd.find((s) => s.kind === "cone");
      if (ck) hole.csk = { d: r3(Math.max(ck.d0, ck.d1)), angle: Math.round(ck.angle), end };
    }
    if (!hole.through) hole.depth = r3(bore.t1 - bore.t0 + (hole.cbore ? hole.cbore.depth : 0));
    holes.push(hole);
  }
  const bosses = cylinders.filter((c) => !c.concave && c.coverage > 0.8).map((c) => ({
    axis: c.axis.map(r3), point: at(c, (c.t0 + c.t1) / 2).map(r3), d: r3(2 * c.r), height: r3(c.t1 - c.t0),
    ends: [at(c, c.t0).map(r3), at(c, c.t1).map(r3)],
  }));
  // a slot's round ends: concave half-turns
  const slotEnds = cylinders.filter((c) => c.concave && c.coverage > 0.4 && c.coverage <= 0.8).map((c) => ({
    axis: c.axis.map(r3), point: at(c, (c.t0 + c.t1) / 2).map(r3), d: r3(2 * c.r), length: r3(c.t1 - c.t0),
  }));
  // flat faces, for an edit that moves a wall: normal, offset, extent; the
  // tilt from +Z (a sloped rib's top, a taper, a chamfer) and the area
  const planes = [];
  shapes.forEach((s, i) => {
    if (s.kind !== "plane") return;
    const P = faces[i].positions, flo = [Infinity, Infinity, Infinity], fhi = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < P.length; j++) { const k = j % 3; if (P[j] < flo[k]) flo[k] = P[j]; if (P[j] > fhi[k]) fhi[k] = P[j]; }
    planes.push({ normal: s.normal.map(r3), offset: r3(s.offset), min: flo.map(r3), max: fhi.map(r3),
      tilt: r3(Math.acos(Math.min(1, Math.abs(s.normal[2]))) * 180 / Math.PI), area: r3(faceArea(faces[i])) });
  });
  // BLENDS: fillets and rounds. A cylinder that is only part of a turn, or a
  // torus / B-spline face, whose tightest radius of curvature is small next
  // to the part: the radius a drawing calls out as "R5 TYP".
  const blends = [];
  shapes.forEach((s, i) => {
    let r = null, convex = null;
    if (s.kind === "cylinder" && s.coverage <= 0.55) { r = s.r; convex = !s.concave; }
    else if (s.kind === "other") ({ r, convex } = tightestRadius(faces[i]));
    if (r == null || !(r > 0) || r > 0.2 * Math.max(...size)) return;
    blends.push({ r: r3(r), convex, at: faceCentroid(faces[i]).map(r3), area: r3(faceArea(faces[i])), kind: s.kind });
  });
  return {
    bounds: { min: lo.map(r3), max: hi.map(r3) }, size: size.map(r3), planes,
    cylinders: cylinders.map((c) => ({ axis: c.axis.map(r3), origin: c.origin.map(r3), d: r3(2 * c.r), t0: r3(c.t0), t1: r3(c.t1), coverage: r3(c.coverage), concave: c.concave })),
    cones: cones.map((k) => ({ axis: k.axis.map(r3), origin: k.origin.map(r3), d0: r3(2 * k.r0), d1: r3(2 * k.r1), angle: r3(2 * k.halfAngle), concave: k.concave })),
    holes, bosses, slotEnds, blends,
  };
}

function faceTris(face) {
  const P = face.positions, I = face.index || Array.from({ length: P.length / 3 }, (_, i) => i);
  const v = (k) => [P[3 * k], P[3 * k + 1], P[3 * k + 2]];
  const out = [];
  for (let t = 0; t + 2 < I.length; t += 3) out.push([I[t], I[t + 1], I[t + 2], v(I[t]), v(I[t + 1]), v(I[t + 2])]);
  return out;
}
function faceArea(face) {
  let a = 0;
  for (const [, , , p, q, r] of faceTris(face)) a += len(cross(sub(q, p), sub(r, p))) / 2;
  return a;
}
function faceCentroid(face) {
  let a = 0, c = [0, 0, 0];
  for (const [, , , p, q, r] of faceTris(face)) {
    const w = len(cross(sub(q, p), sub(r, p))) / 2;
    a += w; c = add(c, mul(add(add(p, q), r), w / 3));
  }
  return a > 0 ? mul(c, 1 / a) : [face.positions[0], face.positions[1], face.positions[2]];
}
// The tightest radius of curvature over a face's mesh edges: |dn| / |dp| is
// the normal curvature along that edge, so its upper percentile is 1 / the
// smaller principal radius (a torus fillet's tube radius). Convex when the
// normals spread apart along the edges.
function tightestRadius(face) {
  const N = face.normals;
  if (!N) return {};
  const ks = [];
  let sgn = 0;
  const n = (k) => [N[3 * k], N[3 * k + 1], N[3 * k + 2]];
  for (const [a, b, c, pa, pb, pc] of faceTris(face)) {
    for (const [i, j, pi, pj] of [[a, b, pa, pb], [b, c, pb, pc], [c, a, pc, pa]]) {
      const dp = sub(pj, pi), dl = len(dp);
      if (dl < 1e-9) continue;
      const dn = sub(unit(n(j)), unit(n(i)));
      const k = len(dn) / dl;
      if (k < 1e-6) continue;
      ks.push(k);
      sgn += Math.sign(dot(dp, dn));
    }
  }
  if (ks.length < 3) return {};
  ks.sort((x, y) => x - y);
  const k = ks[Math.floor(0.9 * (ks.length - 1))];
  return { r: 1 / k, convex: sgn >= 0 };
}

// ---------------------------------------------------------------- the diff

const AXES = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
export function axisVec(a) {
  if (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)) return unit(a);
  const k = String(a ?? "+z").trim().toLowerCase();
  return AXES[k] || AXES[`+${k}`] || [0, 0, 1];
}
const num = (v) => (v == null || v === "" ? null : Number.isFinite(+v) ? +v : null);

// The table's feature list flattened to one record per instance.
export function expandFeatures(table) {
  const out = [];
  for (const f of table?.features || []) {
    const type = String(f.type || "hole").toLowerCase();
    const positions = Array.isArray(f.positions) ? f.positions
      : Array.isArray(f.position) ? [f.position] : [];
    positions.forEach((p, i) => {
      if (!Array.isArray(p) || p.length < 2) return;
      const pos = [num(p[0]) ?? 0, num(p[1]) ?? 0, num(p[2]) ?? 0];
      out.push({
        id: `${f.id ?? "?"}${positions.length > 1 ? `#${i + 1}` : ""}`, type, pos, axis: axisVec(f.axis),
        dia: num(f.dia ?? f.d ?? f.diameter), depth: f.depth === "thru" || f.through === true || /thru/i.test(String(f.depth)) ? "thru" : num(f.depth),
        cbore: f.cbore && num(f.cbore.d) ? { d: num(f.cbore.d), depth: num(f.cbore.depth) } : null,
        csk: f.csk && num(f.csk.d) ? { d: num(f.csk.d), angle: num(f.csk.angle) ?? 90 } : null,
        width: num(f.width ?? f.w), length: num(f.length ?? f.len), ctc: num(f.ctc),
        along: f.along ?? f.dir ?? null, height: num(f.height ?? f.h), source: f.source,
      });
    });
  }
  return out;
}

const HOLE_TYPES = /^(hole|cbore|csk|tapped|counterbore|countersink|bore|drill)/;
// The subtle features a drawing shows in TYP callouts, sections and details.
const FILLET_T = /^(fillet|round|blend|radius)/;
const CHAMFER_T = /^(chamfer|bevel)/;
const ADD_T = /^(rib|gusset|web|shoulder|step|collar|ring|hub|lug|flange|pad|raised|spoke)/;
const CUT_T = /^(notch|keyway|groove|pocket|recess|cutout|window|undercut|spline|flat|relief)/;
const SUBTLE = (t) => FILLET_T.test(t) || CHAMFER_T.test(t) || ADD_T.test(t) || CUT_T.test(t);

// "// SKIP F: R1 blends, the kernel refuses a fillet on the rib joins"
export function skippedFromCode(code) {
  const out = [];
  for (const m of String(code || "").matchAll(/\/\/\s*SKIP(?:PED)?\s+([\w#.-]+)\s*[:-]?\s*(.*)$/gim)) out.push({ id: m[1], why: m[2].trim() });
  return out;
}

// table: the AI's feature table. measured: measureFaces(). Positions are
// compared after the best of three frame hypotheses (the table's own frame,
// a min-corner origin, a centred origin) so a model built in a different
// frame from its table is one frame note, not every feature wrong.
export function diffTable(table, measured, { tolFrac = 0.005, minTol = 0.1, inside = null, skipped = [] } = {}) {
  const size = measured.size, diag = Math.hypot(...size) || 1;
  const tol = Math.max(minTol, tolFrac * diag);
  const issues = [], notes = [];
  let checked = 0, passed = 0;
  const pass = (ok) => { checked++; if (ok) passed++; return ok; };

  // overall size
  const ov = table?.overall;
  if (ov && ["x", "y", "z"].some((k) => num(ov[k]) != null)) {
    ["x", "y", "z"].forEach((k, i) => {
      const want = num(ov[k]);
      if (want == null) return;
      const got = size[i];
      if (!pass(Math.abs(got - want) <= Math.max(tol, 0.005 * want))) {
        issues.push({ kind: "overall", axis: k, want, got, msg: `overall ${k.toUpperCase()} is ${fmt(got)} mm, the table says ${fmt(want)}` });
      }
    });
  }

  const feats = expandFeatures(table);
  const mid = measured.bounds.min.map((v, i) => (v + measured.bounds.max[i]) / 2);
  const tmin = Array.isArray(table?.bbox?.min) ? table.bbox.min.map(Number) : null;
  const hyps = [{ name: "as written", shift: [0, 0, 0] }];
  if (tmin) hyps.push({ name: "table bbox", shift: sub(measured.bounds.min, tmin) });
  hyps.push({ name: "min-corner origin", shift: measured.bounds.min.slice() }, { name: "centred origin", shift: mid });

  const lineDist = (p, h) => { const d = sub(p, h.point); return len(sub(d, mul(h.axis, dot(d, h.axis)))); };
  const parallel = (a, b) => Math.abs(dot(a, b)) > 0.999;
  const matchAll = (shift) => {
    const res = [];
    const free = new Set(measured.holes.map((_, i) => i));
    for (const f of feats) {
      const p = add(f.pos, shift);
      if (HOLE_TYPES.test(f.type)) {
        let best = null;
        for (const i of free) {
          const h = measured.holes[i];
          if (!parallel(h.axis, f.axis)) continue;
          const d = lineDist(p, h);
          if (d <= tol && (!best || d < best.d)) best = { i, d };
        }
        if (best) free.delete(best.i);
        res.push({ f, p, hole: best ? measured.holes[best.i] : null, dist: best?.d });
      } else if (f.type === "boss") {
        const b = measured.bosses.find((x) => parallel(x.axis, f.axis) && lineDist(p, x) <= tol && (f.dia == null || Math.abs(x.d - f.dia) <= Math.max(0.15, 0.03 * f.dia)));
        res.push({ f, p, boss: b || null });
      } else if (f.type === "slot") {
        res.push({ f, p, slot: matchSlot(f, p, measured, tol) });
      } else res.push({ f, p, skipped: true });
    }
    return { res, extra: [...free].map((i) => measured.holes[i]) };
  };
  let best = null;
  for (const h of hyps) {
    const m = matchAll(h.shift);
    const found = m.res.filter((r) => r.hole || r.boss || r.slot?.ok).length;
    if (!best || found > best.found) best = { ...m, found, hyp: h };
  }
  const frame = { hypothesis: best?.hyp.name ?? "as written", shift: (best?.hyp.shift ?? [0, 0, 0]).map(r3) };
  if (best && best.hyp.name !== "as written" && best.found > 0) notes.push(`the model is built in a different frame from the table (${best.hyp.name}); features were compared after shifting by ${fv(frame.shift)}`);

  for (const r of best?.res || []) {
    const { f } = r;
    const where = `${f.type} ${f.id} at ${fv(f.pos)}${f.source ? ` ("${f.source}")` : ""}`;
    if (r.skipped) { if (!SUBTLE(f.type)) notes.push(`${where}: not measured (${f.type})`); continue; }
    if (HOLE_TYPES.test(f.type)) {
      if (!pass(!!r.hole)) {
        const near = nearestHole(measured.holes, r.p, f.axis, lineDist);
        issues.push({ kind: "missing", id: f.id, msg: `${where}: no ${f.dia ? `Ø${fmt(f.dia)} ` : ""}hole along ${axisName(f.axis)} there${near ? `; the nearest is Ø${fmt(near.h.d)} ${fmt(near.d)} mm away, axis through ${fv(sub(near.h.point, frame.shift))}` : ""}` });
        continue;
      }
      const h = r.hole;
      if (f.dia != null && !pass(Math.abs(h.d - f.dia) <= Math.max(0.1, 0.02 * f.dia))) issues.push({ kind: "diameter", id: f.id, msg: `${where}: diameter is ${fmt(h.d)}, the table says ${fmt(f.dia)}` });
      if (f.depth === "thru" && h.through === false) { pass(false); issues.push({ kind: "depth", id: f.id, msg: `${where}: should go THRU but is blind (${fmt(h.length)} deep)` }); }
      else if (f.depth === "thru") pass(true);
      else if (typeof f.depth === "number") {
        if (h.through) { pass(false); issues.push({ kind: "depth", id: f.id, msg: `${where}: should be ${fmt(f.depth)} deep but goes through` }); }
        else if (h.depth != null && !pass(Math.abs(h.depth - f.depth) <= Math.max(tol, 0.03 * f.depth))) issues.push({ kind: "depth", id: f.id, msg: `${where}: depth is ${fmt(h.depth)}, the table says ${fmt(f.depth)}` });
      }
      if (f.cbore) {
        if (!pass(!!h.cbore)) issues.push({ kind: "cbore", id: f.id, msg: `${where}: the Ø${fmt(f.cbore.d)} counterbore is missing` });
        else {
          if (!pass(Math.abs(h.cbore.d - f.cbore.d) <= Math.max(0.1, 0.02 * f.cbore.d))) issues.push({ kind: "cbore", id: f.id, msg: `${where}: counterbore Ø${fmt(h.cbore.d)}, the table says Ø${fmt(f.cbore.d)}` });
          if (f.cbore.depth != null && !pass(Math.abs(h.cbore.depth - f.cbore.depth) <= Math.max(0.1, 0.03 * f.cbore.depth))) issues.push({ kind: "cbore", id: f.id, msg: `${where}: counterbore ${fmt(h.cbore.depth)} deep, the table says ${fmt(f.cbore.depth)}` });
        }
      } else if (h.cbore && f.type === "hole") notes.push(`${where}: the model has a Ø${fmt(h.cbore.d)} counterbore the table does not list`);
      if (f.csk) {
        if (!pass(!!h.csk)) issues.push({ kind: "csk", id: f.id, msg: `${where}: the Ø${fmt(f.csk.d)} countersink is missing` });
        else if (!pass(Math.abs(h.csk.d - f.csk.d) <= Math.max(0.15, 0.03 * f.csk.d))) issues.push({ kind: "csk", id: f.id, msg: `${where}: countersink Ø${fmt(h.csk.d)}, the table says Ø${fmt(f.csk.d)}` });
      }
      // the entry should be at one end of the measured hole
      const tp = dot(sub(r.p, h.point), h.axis);
      const half = h.length / 2;
      if (!pass(Math.abs(Math.abs(tp) - half) <= Math.max(tol * 2, 0.5) || Math.abs(tp) < half)) {
        issues.push({ kind: "entry", id: f.id, msg: `${where}: the table puts the entry ${fmt(Math.abs(tp) - half)} mm beyond the end of the hole the model has` });
      }
    } else if (f.type === "boss") {
      if (!pass(!!r.boss)) issues.push({ kind: "missing", id: f.id, msg: `${where}: no ${f.dia ? `Ø${fmt(f.dia)} ` : ""}boss along ${axisName(f.axis)} there` });
    } else if (f.type === "slot") {
      if (!pass(!!r.slot?.ok)) issues.push({ kind: "slot", id: f.id, msg: `${where}: ${r.slot?.why || "slot not found"}` });
    }
  }
  let missing = issues.filter((i) => i.kind === "missing" || i.kind === "slot").length;
  const subtle = checkSubtle(table, measured, { shift: best?.hyp.shift ?? [0, 0, 0], tol, inside, skipped, pass, issues, notes });
  missing += subtle.missing;
  for (const h of best?.extra || []) {
    if (!feats.some((f) => HOLE_TYPES.test(f.type))) break;
    notes.push(`the model has a Ø${fmt(h.d)} ${h.through ? "through" : "blind"} hole along ${axisName(h.axis)} through ${fv(sub(h.point, frame.shift))} that matches no table row`);
  }
  const score = checked ? passed / checked : 1;
  return { ok: issues.length === 0, score: r3(score), checked, passed, issues, notes, frame, tol: r3(tol), missing, skipped: subtle.skipped, unchecked: subtle.unchecked };
}

// Fillets, chamfers, ribs, shoulders, steps, notches, pockets: the features a
// hole matcher cannot see. Each is checked by what the table gives for it:
//   r            a round face of that radius (fillet / round)
//   angle        a face sloped that many degrees from the plane across `axis`
//                (a sloped rib's top, a taper, a chamfer)
//   levels       flat faces across `axis` at those coordinates (section steps)
//   probes       points that must be material (rib, shoulder, boss...) or
//                empty (notch, keyway, pocket...); a rib that stops short of
//                the hub leaves its far probe empty
// A feature the code skipped (// SKIP <id>: why) is reported, not failed;
// a callout no feature uses and no SKIP explains is a missing feature.
function checkSubtle(table, measured, { shift, tol, inside, skipped, pass, issues, notes }) {
  let missing = 0, unchecked = 0;
  const skipIds = new Map((skipped || []).map((x) => [String(x.id), x.why]));
  const skippedOut = [];
  const blends = measured.blends || [], planes = measured.planes || [], cones = measured.cones || [];
  const ids = new Set();
  for (const f of table?.features || []) {
    const type = String(f.type || "").toLowerCase(), id = String(f.id ?? "?");
    ids.add(id);
    if (!SUBTLE(type)) continue;
    const label = `${type} ${id}${f.source ? ` ("${f.source}")` : ""}`;
    if (skipIds.has(id)) { skippedOut.push({ id, type, why: skipIds.get(id) }); notes.push(`${label}: skipped by the code (${skipIds.get(id) || "no reason given"}); build it if you can`); continue; }
    let any = false, bad = false;
    const fail = (kind, msg) => { pass(false); bad = true; issues.push({ kind, id, msg: `${label}: ${msg}` }); };
    const axis = axisVec(f.axis ?? "+z");
    const add = ADD_T.test(type) || type === "boss";
    // a round face of the radius
    const r = num(f.r ?? f.radius) ?? (FILLET_T.test(type) && num(f.dia ?? f.d) != null ? num(f.dia ?? f.d) / 2 : null);
    if (r != null && FILLET_T.test(type)) {
      any = true;
      const hits = blends.filter((b) => Math.abs(b.r - r) <= Math.max(0.15, 0.1 * r));
      const want = Math.max(1, Math.ceil((num(f.count) ?? 1) / 2));
      if (!hits.length) {
        const radii = [...new Set(blends.map((b) => fmt(b.r)))].slice(0, 6);
        fail("fillet", `the model has no R${fmt(r)} round face${radii.length ? ` (its rounds: R${radii.join(", R")})` : " (it has no rounds at all)"}`);
      } else if (hits.length < want) fail("fillet", `only ${hits.length} R${fmt(r)} round face${hits.length === 1 ? "" : "s"}; the table lists ${num(f.count)} places`);
      else pass(true);
    }
    // a face at the angle
    const ang = num(f.angle ?? f.slope ?? f.taper) ?? (CHAMFER_T.test(type) ? 45 : null);
    if (ang != null && ang > 0.5 && ang < 89.5) {
      any = true;
      const tiltTo = (n, a) => Math.acos(Math.min(1, Math.abs(dot(n, a)))) * 180 / Math.PI;
      const near = (v) => Math.abs(v - ang) <= 3;
      let n = 0;
      if (CHAMFER_T.test(type)) n = planes.filter((p) => [[1, 0, 0], [0, 1, 0], [0, 0, 1]].some((a) => near(tiltTo(p.normal, a)))).length;
      else n = planes.filter((p) => near(tiltTo(p.normal, axis))).length;
      n += cones.filter((k) => Math.abs(Math.abs(dot(k.axis, axis)) - 1) < 0.01 && (near(90 - k.angle / 2) || near(k.angle / 2))).length;
      const want = /^(rib|gusset|web|spoke)/.test(type) ? (num(f.count) ?? 1) : 1;
      if (n < want) {
        const seen = [...new Set(planes.filter((p) => { const t = tiltTo(p.normal, axis); return t > 1 && t < 89; }).map((p) => Math.round(tiltTo(p.normal, axis))))].slice(0, 8);
        fail("slope", n ? `only ${n} face${n === 1 ? "" : "s"} sloped ${fmt(ang)}°, the table lists ${want}` : `no face sloped ${fmt(ang)}° from the plane across ${axisName(axis)}${seen.length ? ` (the model's slopes: ${seen.join("°, ")}°)` : " (the model has no sloped faces: is it built square?)"}`);
      } else pass(true);
    }
    // flat steps at the levels a section dimensions
    for (const lv of (Array.isArray(f.levels) ? f.levels : []).map(num).filter((v) => v != null)) {
      any = true;
      const at = lv + dot(shift, axis);
      const hit = planes.some((p) => Math.abs(Math.abs(dot(p.normal, axis)) - 1) < 1e-3 && Math.abs(p.offset * Math.sign(dot(p.normal, axis)) - at) <= tol);
      if (!pass(hit)) { bad = true; issues.push({ kind: "level", id, msg: `${label}: no flat face across ${axisName(axis)} at ${fmt(lv)} (a step height the table reads)` }); }
    }
    // probe points: material for what is added, empty for what is cut
    let probes = Array.isArray(f.probes) ? f.probes.filter((p) => Array.isArray(p) && p.length === 3).map((p) => p.map(Number)) : [];
    if (!probes.length && Array.isArray(f.positions)) {
      const d = num(f.depth) ?? num(f.height ?? f.h);
      if (d != null) probes = f.positions.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => add_(p.map((v) => +v || 0).concat([0]).slice(0, 3), mul(axis, (add ? 1 : -1) * d / 2)));
    }
    if (inside && probes.length) {
      any = true;
      for (const p of probes.slice(0, 16)) {
        const solid = inside(add_(p, shift));
        if (!pass(solid === add)) { bad = true; issues.push({ kind: "probe", id, msg: `${label}: at ${fv(p)} the model is ${solid ? "solid" : "empty"}, the table puts ${add ? "material" : "a cut"} there${/^(rib|gusset|web|spoke)/.test(type) && !solid ? " (the rib stops short, or runs at another angle or height)" : ""}` }); }
      }
    }
    if (!any) { unchecked++; notes.push(`${label}: not measured; give it r, angle, levels or probes so the check can see it`); }
    if (bad) missing++;
  }
  for (const c of Array.isArray(table?.callouts) ? table.callouts : []) {
    if (!c || typeof c !== "object") continue;
    const used = c.feature != null && String(c.feature).split(/[,\s]+/).filter(Boolean);
    const text = `callout "${c.text ?? "?"}"${c.view ? ` (${c.view})` : ""}`;
    if (c.skip) { notes.push(`${text}: skipped (${c.skip})`); continue; }
    if (!used || !used.length) { pass(false); missing++; issues.push({ kind: "callout", msg: `${text} is not used by any feature and has no skip reason: model it, or say why not` }); continue; }
    const unknown = used.filter((u) => !ids.has(u));
    if (unknown.length) { pass(false); missing++; issues.push({ kind: "callout", msg: `${text} points at feature ${unknown.join(", ")}, which the table does not have` }); }
  }
  return { missing, unchecked, skipped: skippedOut };
}
const add_ = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function axisName(a) {
  const i = [0, 1, 2].reduce((m, k) => (Math.abs(a[k]) > Math.abs(a[m]) ? k : m), 0);
  return Math.abs(a[i]) > 0.999 ? "XYZ"[i] : fv(a);
}

function nearestHole(holes, p, axis, lineDist) {
  let best = null;
  for (const h of holes) {
    if (Math.abs(dot(h.axis, axis)) < 0.999) continue;
    const d = lineDist(p, h);
    if (!best || d < best.d) best = { h, d };
  }
  return best;
}

function slotDir(along) {
  if (Array.isArray(along)) return unit(along.map(Number));
  if (typeof along === "number") return [Math.cos(along * Math.PI / 180), Math.sin(along * Math.PI / 180), 0];
  const k = String(along ?? "x").toLowerCase().replace(/^[+-]/, "");
  return k === "y" ? [0, 1, 0] : k === "z" ? [0, 0, 1] : [1, 0, 0];
}

// A slot: its two round ends, each a concave half-turn of radius width/2,
// either side of the centre along `along`.
function matchSlot(f, p, measured, tol) {
  if (f.width == null) return { ok: false, why: "the table gives no slot width" };
  const dir = slotDir(f.along);
  const c2c = f.ctc ?? (f.length != null ? f.length - f.width : null);
  if (c2c == null) return { ok: false, why: "the table gives no slot length" };
  const r = f.width / 2;
  const cands = [...measured.slotEnds, ...measured.holes.map((h) => ({ ...h, full: true }))]
    .filter((s) => Math.abs(s.d / 2 - r) <= Math.max(0.1, 0.03 * r));
  const hit = (q) => cands.find((s) => {
    const d = sub(q, s.point);
    return Math.abs(dot(s.axis, f.axis)) > 0.999 && len(sub(d, mul(s.axis, dot(d, s.axis)))) <= tol;
  });
  const e1 = add(p, mul(dir, c2c / 2)), e2 = add(p, mul(dir, -c2c / 2));
  const ok = !!hit(e1) && !!hit(e2);
  return ok ? { ok } : { ok: false, why: `no Ø${fmt(f.width)} round ends at ${fv(e1)} and ${fv(e2)} (width ${fmt(f.width)}, ${fmt(c2c)} centre to centre)` };
}

export function issuesText(diff, { max = 25 } = {}) {
  const lines = diff.issues.slice(0, max).map((i) => `- ${i.msg}`);
  if (diff.issues.length > max) lines.push(`- …and ${diff.issues.length - max} more`);
  return lines.join("\n");
}

// One line for a log or a chat bubble.
export function diffSummary(diff) {
  if (!diff.checked) return "nothing in the table could be measured";
  const extra = [diff.missing ? `${diff.missing} feature${diff.missing === 1 ? "" : "s"} missing` : "", diff.skipped?.length ? `${diff.skipped.length} skipped` : ""].filter(Boolean).join(", ");
  return (diff.ok ? `all ${diff.checked} checks agree with the table` : `${diff.passed}/${diff.checked} checks agree; ${diff.issues.length} disagree`) + (extra ? ` (${extra})` : "");
}

// Per-face buffers from a replicad (OpenCASCADE) shape, the same records the
// kernels hand around, so an imported STEP the Rust kernel cannot read is
// still measured exactly.
export function facesFromReplicad(shape, { tolerance = 0.3, angularTolerance = 0.3 } = {}) {
  const m = shape.mesh({ tolerance, angularTolerance });
  const V = m.vertices, N = m.normals, T = m.triangles;
  return m.faceGroups.map((g) => {
    const remap = new Map(), pos = [], nrm = [], idx = [];
    for (let t = g.start; t < g.start + g.count; t++) {
      const v = T[t];
      let k = remap.get(v);
      if (k === undefined) { k = pos.length / 3; remap.set(v, k); pos.push(V[3 * v], V[3 * v + 1], V[3 * v + 2]); nrm.push(N[3 * v], N[3 * v + 1], N[3 * v + 2]); }
      idx.push(k);
    }
    return { name: `F${g.faceId}`, positions: new Float32Array(pos), normals: new Float32Array(nrm), index: new Uint32Array(idx) };
  });
}

// The measurements as text an AI can edit against.
export function measuredText(m, { maxPlanes = 120, maxHoles = 80 } = {}) {
  const L = [];
  L.push(`bounding box: min ${fv(m.bounds.min)} max ${fv(m.bounds.max)}, size ${m.size.map(fmt).join(" x ")}`);
  if (m.holes.length) {
    L.push(`holes (${m.holes.length}; axis, a point on the axis, diameter, the two ends):`);
    for (const h of m.holes.slice(0, maxHoles)) {
      L.push(`  Ø${fmt(h.d)} along ${axisName(h.axis)} ${h.through ? "THRU" : `blind ${fmt(h.depth ?? h.length)} deep`}${h.cbore ? ` cbore Ø${fmt(h.cbore.d)} x ${fmt(h.cbore.depth)}` : ""}${h.csk ? ` csk Ø${fmt(h.csk.d)} x ${h.csk.angle}°` : ""} ends ${fv(h.ends[0])} -> ${fv(h.ends[1])}`);
    }
  }
  if (m.bosses.length) {
    L.push(`round bosses/shafts (${m.bosses.length}):`);
    for (const b of m.bosses.slice(0, 40)) L.push(`  Ø${fmt(b.d)} along ${axisName(b.axis)} from ${fv(b.ends[0])} to ${fv(b.ends[1])}`);
  }
  if (m.slotEnds.length) {
    L.push(`half-round ends (slots, rounded pockets) (${m.slotEnds.length}):`);
    for (const e of m.slotEnds.slice(0, 40)) L.push(`  R${fmt(e.d / 2)} along ${axisName(e.axis)} axis through ${fv(e.point)}`);
  }
  const big = (m.planes || []).filter((p) => Math.max(...p.normal.map(Math.abs)) > 0.999)
    .map((p) => ({ ...p, area: p.max.map((v, i) => v - p.min[i]).filter((d) => d > 1e-6).reduce((a, b) => a * b, 1) }))
    .sort((a, b) => b.area - a.area).slice(0, maxPlanes);
  if (big.length) {
    L.push(`flat faces (largest ${big.length}; outward normal, where, extent):`);
    for (const p of big) {
      const i = p.normal.findIndex((v) => Math.abs(v) > 0.999);
      L.push(`  ${p.normal[i] > 0 ? "+" : "-"}${"XYZ"[i]} face at ${"xyz"[i]} = ${fmt(p.offset * Math.sign(p.normal[i]))}, spans ${fv(p.min)} to ${fv(p.max)}`);
    }
  }
  return L.join("\n");
}
