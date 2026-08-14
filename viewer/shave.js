// Click a whisker, and the whisker goes.
//
// Three automatic detectors were tried on a rabbit whose whiskers had to come
// off — local thickness by raycasting, local dimensionality by PCA, and
// collapse under Laplacian flow. Each one separated whiskers from cheek
// SOMEWHAT, and each one also flagged something it must not touch: the webbing
// between the toes, the edge of an ear. The ear cut left a hole that the
// hole-filler turned into a starburst across the flank.
//
// The lesson is not that those measures are bad. It is that on a model whose
// fur detail is the same scale as its whiskers, no threshold exists that means
// "whisker" — so any rule built from one is guessing, and a shave that guesses
// wrong is destructive in a way that is hard to notice and impossible to undo
// by eye.
//
// Pointing is not a guess. This module takes the triangle under the cursor and
// grows outward from it, ring by ring, watching the RIM it would have to cut.
// Along a strand that rim stays small and roughly constant. Where the strand
// meets the face it flares, and the rim balloons. The narrowest rim is the
// root, and that is where the cut goes — which is what "shave it flush" means
// geometrically.
//
// Nothing here needs the geometry kernel, so it works on the view-only preview
// of a mesh far too dense to build. That matters: the model that prompted all
// of this is 255k triangles, and simplifying it first would merge the whiskers
// into the body and take away the thing you are trying to point at.

// ---------------------------------------------------------------- topology
//
// An STL is a triangle soup — every triangle carries its own three corners and
// nothing knows its neighbours. Welding on a grid recovers the shared corners,
// and from those the edge->triangle map that all the walking below needs.
export function buildTopology(positions, round = 1000) {
  const nTri = Math.floor(positions.length / 9);
  const ids = new Int32Array(nTri * 3);
  const map = new Map();
  const verts = [];
  for (let i = 0; i < nTri * 3; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const k = `${Math.round(x * round)},${Math.round(y * round)},${Math.round(z * round)}`;
    let id = map.get(k);
    if (id === undefined) { id = verts.length / 3; map.set(k, id); verts.push(x, y, z); }
    ids[i] = id;
  }
  // edge -> the triangles using it. A closed mesh gives two; a rim gives one.
  const edges = new Map();
  for (let t = 0; t < nTri; t++) {
    for (let e = 0; e < 3; e++) {
      const a = ids[t * 3 + e], b = ids[t * 3 + (e + 1) % 3];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const cur = edges.get(k);
      if (cur) cur.push(t); else edges.set(k, [t]);
    }
  }
  return { nTri, ids, verts: Float64Array.from(verts), edges };
}

const ekey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export function neighbours(topo, t) {
  const out = [];
  for (let e = 0; e < 3; e++) {
    const a = topo.ids[t * 3 + e], b = topo.ids[t * 3 + (e + 1) % 3];
    for (const q of topo.edges.get(ekey(a, b))) if (q !== t) out.push(q);
  }
  return out;
}

const dist = (V, a, b) => Math.hypot(
  V[a * 3] - V[b * 3], V[a * 3 + 1] - V[b * 3 + 1], V[a * 3 + 2] - V[b * 3 + 2]);

// The total length of the rim that cutting HERE would leave: every edge with a
// triangle inside the selection and one outside it.
export function rimLength(topo, inside) {
  let sum = 0;
  for (const t of inside) {
    for (let e = 0; e < 3; e++) {
      const a = topo.ids[t * 3 + e], b = topo.ids[t * 3 + (e + 1) % 3];
      const tris = topo.edges.get(ekey(a, b));
      let outside = false;
      for (const q of tris) if (q !== t && !inside.has(q)) outside = true;
      if (tris.length === 1) outside = true;          // an existing hole edge
      if (outside) sum += dist(topo.verts, a, b);
    }
  }
  return sum;
}

// ------------------------------------------------------------------- growth
//
// How wide is the material under each triangle? Cast a small cone of rays
// INWARD and take the median distance to the far wall. On a strand that is the
// strand's own diameter; on a cheek it is centimetres.
//
// This is the same measure that the automatic attempts used, and on its own it
// could not tell a whisker from toe webbing. Seeded by a CLICK it does not have
// to: the threshold is relative to the thing you pointed at, and the walk can
// only ever reach what is continuously attached to it. The judgement that kept
// going wrong is now yours, and the tool only does the tracing.
function grid(positions, cell) {
  const n = Math.floor(positions.length / 9);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (positions[i + a] < lo[a]) lo[a] = positions[i + a];
      if (positions[i + a] > hi[a]) hi[a] = positions[i + a];
    }
  }
  const dim = hi.map((v, i) => Math.max(1, Math.ceil((v - lo[i]) / cell) + 1));
  const cf = (v, a) => Math.min(dim[a] - 1, Math.max(0, Math.floor((v - lo[a]) / cell)));
  const ci = (x, y, z) => (z * dim[1] + y) * dim[0] + x;
  const bucket = new Map();
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const x0 = cf(Math.min(positions[o], positions[o + 3], positions[o + 6]), 0);
    const x1 = cf(Math.max(positions[o], positions[o + 3], positions[o + 6]), 0);
    const y0 = cf(Math.min(positions[o + 1], positions[o + 4], positions[o + 7]), 1);
    const y1 = cf(Math.max(positions[o + 1], positions[o + 4], positions[o + 7]), 1);
    const z0 = cf(Math.min(positions[o + 2], positions[o + 5], positions[o + 8]), 2);
    const z1 = cf(Math.max(positions[o + 2], positions[o + 5], positions[o + 8]), 2);
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = ci(x, y, z); let b = bucket.get(k); if (!b) { b = []; bucket.set(k, b); } b.push(t);
    }
  }
  return { lo, hi, dim, cell, cf, ci, bucket };
}

function hitTri(P, t, ox, oy, oz, dx, dy, dz) {
  const o = t * 9, ax = P[o], ay = P[o + 1], az = P[o + 2];
  const e1x = P[o + 3] - ax, e1y = P[o + 4] - ay, e1z = P[o + 5] - az;
  const e2x = P[o + 6] - ax, e2y = P[o + 7] - ay, e2z = P[o + 8] - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

function cast(P, G, ox, oy, oz, dx, dy, dz) {
  let best = Infinity; const seen = new Set(); const step = G.cell * 0.5;
  for (let s = 0; s < 400; s++) {
    const px = ox + dx * s * step, py = oy + dy * s * step, pz = oz + dz * s * step;
    if (px < G.lo[0] - G.cell || px > G.hi[0] + G.cell || py < G.lo[1] - G.cell
      || py > G.hi[1] + G.cell || pz < G.lo[2] - G.cell || pz > G.hi[2] + G.cell) break;
    const k = G.ci(G.cf(px, 0), G.cf(py, 1), G.cf(pz, 2));
    if (seen.has(k)) continue; seen.add(k);
    const b = G.bucket.get(k); if (!b) continue;
    for (const t of b) { const h = hitTri(P, t, ox, oy, oz, dx, dy, dz); if (h > 1e-4 && h < best) best = h; }
    if (best < s * step) break;
  }
  return best;
}

// 15 rays over a 60-degree cone, not 9 over 36. A narrow cone samples nearly
// the same direction 9 times, so one crease that reflects a ray straight back
// swings the median and reports solid cheek as paper-thin. Those false readings
// are what let the walk leak off a whisker onto the face.
export function thicknessAt(P, G, t, rays = 15, cone = Math.PI / 3) {
  const o = t * 9;
  const ax = P[o], ay = P[o + 1], az = P[o + 2], bx = P[o + 3], by = P[o + 4], bz = P[o + 5];
  const cx = P[o + 6], cy = P[o + 7], cz = P[o + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3, gz = (az + bz + cz) / 3;
  const ix = -nx, iy = -ny, iz = -nz;
  let ux = 0, uy = 0; if (Math.abs(ix) < 0.9) ux = 1; else uy = 1;
  let sx = uy * iz, sy = -ux * iz, sz = ux * iy - uy * ix;
  const SL = Math.hypot(sx, sy, sz) || 1; sx /= SL; sy /= SL; sz /= SL;
  const txx = iy * sz - iz * sy, tyy = iz * sx - ix * sz, tzz = ix * sy - iy * sx;
  const hits = [];
  for (let r = 0; r < rays; r++) {
    const a = cone * Math.sqrt(r / rays), ph = r * 2.399963;
    const dx = ix * Math.cos(a) + (sx * Math.cos(ph) + txx * Math.sin(ph)) * Math.sin(a);
    const dy = iy * Math.cos(a) + (sy * Math.cos(ph) + tyy * Math.sin(ph)) * Math.sin(a);
    const dz = iz * Math.cos(a) + (sz * Math.cos(ph) + tzz * Math.sin(ph)) * Math.sin(a);
    const h = cast(P, G, gx + ix * 1e-3, gy + iy * 1e-3, gz + iz * 1e-3, dx, dy, dz);
    if (isFinite(h)) hits.push(h * Math.cos(a));
  }
  if (!hits.length) return 0;      // the ray slipped past its own far wall: a sliver
  hits.sort((a, b) => a - b);
  return hits[Math.floor(hits.length / 2)];
}

// A runaway is not necessarily a refusal. The loose threshold that lets the
// walk follow a whisker's flare is also what lets it leak onto a cheek that
// reads thin in places; a strand is uniformly thin, so tightening and trying
// again traces the strand and starves the leak. Two goes, then give up.
export function growStrand(topo, seed, opts = {}) {
  const first = growOnce(topo, seed, opts);
  if (first.ok || first.reason !== "budget") return first;
  // OFF by default. Retrying tighter lifted whiskers from 19 of 31 clicks to
  // 21, and started taking 150-triangle divots out of the body on 4 of 30 —
  // and a tool that occasionally damages the model on a misclick is the exact
  // failure every automatic attempt made. Two extra whiskers are not worth it
  // when the remedy for a refusal is to click again further along the strand.
  if (!opts.retry) return first;
  const tight = growOnce(topo, seed, { ...opts, widen: (opts.widen ?? 2.5) / 2.5, margin: 0.05, floor: 0.25 });
  // The retry is a more trusting pass, so it gets a length floor the first pass
  // does not need: on its own it started nibbling millimetre divots out of the
  // body. A strand you would point at runs for at least a few millimetres, and
  // anything shorter is better left to the first pass or left alone.
  if (tight.ok && tight.ext && tight.ext[2] < (opts.minSpan ?? 2.5)) return first;
  return tight.ok ? { ...tight, retried: true } : first;
}

function growOnce(topo, seed, opts = {}) {
  const P = opts.positions;
  if (!P) throw new Error("growStrand needs opts.positions");
  const maxTris = opts.maxTris ?? 25000;
  const G = opts.grid ?? grid(P, opts.cell ?? 1.5);
  const seedT = thicknessAt(P, G, seed);

  // The cut stops where the material gets FAT relative to what was clicked.
  // Generous, because a whisker flares into its root before it merges: the
  // point is to follow that flare down, not to stop at the first widening.
  // 2.5x, not 4x. A whisker flares into its root over a very short distance,
  // so following "up to a few times the strand's own width" reaches the face
  // and stops. Four times over-reached and walked down a gentle shoulder into
  // the body — on a real 0.5mm whisker in a 20mm cheek the ratio is so extreme
  // that either number works, which is exactly why the test shape is harsher
  // than the real one.
  const limit = Math.max(seedT * (opts.widen ?? 2.5) + (opts.margin ?? 0.3),
    opts.floor ?? 0.45);

  // A whisker is a few tens of millimetres long at most. Bounding the walk by
  // distance from the click is what stops a runaway: the thickness probe reads
  // a few cheek triangles as falsely thin (a crease reflects a ray straight
  // back), and one of those is enough to bridge the strand to the body. With a
  // reach limit that leak costs a small blob, which the strand-shape check
  // below then rejects, instead of half the rabbit.
  const reach = opts.reach ?? 45;
  const sx = (P[seed * 9] + P[seed * 9 + 3] + P[seed * 9 + 6]) / 3;
  const sy = (P[seed * 9 + 1] + P[seed * 9 + 4] + P[seed * 9 + 7]) / 3;
  const sz = (P[seed * 9 + 2] + P[seed * 9 + 5] + P[seed * 9 + 8]) / 3;
  const far = (t) => Math.hypot(
    (P[t * 9] + P[t * 9 + 3] + P[t * 9 + 6]) / 3 - sx,
    (P[t * 9 + 1] + P[t * 9 + 4] + P[t * 9 + 7]) / 3 - sy,
    (P[t * 9 + 2] + P[t * 9 + 5] + P[t * 9 + 8]) / 3 - sz) > reach;

  const inside = new Set([seed]);
  const q = [seed];
  const cacheT = new Map([[seed, seedT]]);
  while (q.length) {
    const t = q.pop();
    for (const u of neighbours(topo, t)) {
      if (inside.has(u)) continue;
      if (far(u)) continue;
      let th = cacheT.get(u);
      if (th === undefined) { th = thicknessAt(P, G, u); cacheT.set(u, th); }
      if (th > limit) continue;                  // this is the body: stop here
      // ...and it has to have COMPANY. A crease on the cheek reflects a ray
      // straight back and reports solid material as paper-thin; one such
      // triangle is a bridge from the strand onto the face, and the walk pours
      // through it and burns the budget. Requiring a thin neighbour of its own
      // means an isolated bad reading cannot be that bridge, while a real
      // strand — every triangle of which is thin — is unaffected.
      if (opts.lone !== false) {
        let thin = 0;
        for (const w of neighbours(topo, u)) {
          if (w === t) { thin++; continue; }
          let tw = cacheT.get(w);
          if (tw === undefined) { tw = thicknessAt(P, G, w); cacheT.set(w, tw); }
          if (tw <= limit) thin++;
        }
        if (thin < 2) continue;
      }
      inside.add(u); q.push(u);
      if (inside.size > maxTris) return { ok: false, reason: "budget", seedT, limit };
    }
  }
  // A click on open body selects a blob that never stops for a reason — the
  // giveaway is that it never found a boundary of fat material at all, i.e.
  // it ran to the budget, handled above. What is left here is a real strand.
  if (inside.size < 3) return { ok: false, reason: "too-small", seedT, limit };

  // Is what we traced actually a STRAND?
  //
  // Not by bounding box. A whisker CURVES — a 30mm one sweeping an arc has a
  // box like 20x15x5, which looks exactly as chunky as an ear flap, and the box
  // test threw those away. That was the refusal you were seeing.
  //
  // Area over length does not care how it curves. Roll a tube out straight and
  // its area is its circumference times its length, so area/length recovers the
  // circumference wherever it bends. For a whisker that is a millimetre or two;
  // for a flap it is the width of the flap, tens of millimetres.
  let area = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of inside) {
    const o = t * 9;
    const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
    const wx = P[o + 6] - P[o], wy = P[o + 7] - P[o + 1], wz = P[o + 8] - P[o + 2];
    area += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    for (let k = 0; k < 3; k++) for (let a2 = 0; a2 < 3; a2++) {
      const v = P[o + k * 3 + a2];
      if (v < lo[a2]) lo[a2] = v; if (v > hi[a2]) hi[a2] = v;
    }
  }
  const ext = hi.map((v, i) => v - lo[i]).sort((x, y) => x - y);
  const span = Math.max(ext[2], 1e-6);
  const girth = area / span;                     // ~ the strand's circumference
  // Generous: a few times the circumference the clicked thickness implies, with
  // a floor so a very fine whisker is not held to a sub-millimetre budget.
  // CLAMPED, not just scaled. Letting the allowance grow with the clicked
  // thickness handed a 3.3mm ear a 41mm budget, and an ear flap's girth is
  // about 27 — so every click on an ear was accepted. A whisker's girth is
  // pi times its diameter: a couple of millimetres, and never more than a
  // handful however fat the strand. So the ceiling is absolute.
  const maxGirth = opts.maxGirth
    ?? Math.min(Math.max(Math.PI * seedT * 6, 2.5), opts.girthCap ?? 8);
  if (girth > maxGirth) {
    return { ok: false, reason: "not-a-strand", seedT, limit, girth, maxGirth, ext, size: inside.size };
  }
  return { ok: true, inside, seedT, limit, ext, girth, area, grid: G };
}

// --------------------------------------------------------------- cut + cap
//
// The mesh was closed and has to stay closed, so the rim left behind is filled
// with a fan. The patch is sunk slightly along the surviving surface's own
// outward normal — capping flat on the rim leaves a disc standing where the
// strand was, and a shallow dimple is what a shaved follicle looks like.
export function cutAndCap(positions, topo, kill, opts = {}) {
  const dish = opts.dish ?? 0.25;
  const keep = [];
  for (let t = 0; t < topo.nTri; t++) if (!kill.has(t)) keep.push(t);

  // directed half-edges of the survivors; one without a twin is on the rim
  const half = new Set();
  for (const t of keep) {
    for (let e = 0; e < 3; e++) half.add(`${topo.ids[t * 3 + e]}>${topo.ids[t * 3 + (e + 1) % 3]}`);
  }
  const out = new Map(), from = new Map();
  for (const t of keep) {
    for (let e = 0; e < 3; e++) {
      const a = topo.ids[t * 3 + e], b = topo.ids[t * 3 + (e + 1) % 3];
      if (half.has(`${b}>${a}`)) continue;
      let l = out.get(a); if (!l) { l = []; out.set(a, l); } l.push(b);
      from.set(`${a}>${b}`, t);
    }
  }
  // A vertex can carry more than one outgoing rim edge where two cuts meet, so
  // the edges are CONSUMED as the loops are walked rather than looked up.
  const loops = [];
  for (const [start, list] of out) {
    while (list.length) {
      const loop = [start];
      let cur = list.shift();
      for (let g = 0; g < 100000 && cur !== start; g++) {
        loop.push(cur);
        const l = out.get(cur);
        if (!l || !l.length) { cur = undefined; break; }
        cur = l.shift();
      }
      if (cur === start && loop.length >= 3) loops.push(loop);
    }
  }

  const V = topo.verts;
  const tris = [];
  for (const t of keep) {
    for (let e = 0; e < 3; e++) {
      const v = topo.ids[t * 3 + e];
      tris.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]);
    }
  }
  let capped = 0;
  for (const loop of loops) {
    let cx = 0, cy = 0, cz = 0;
    for (const v of loop) { cx += V[v * 3]; cy += V[v * 3 + 1]; cz += V[v * 3 + 2]; }
    cx /= loop.length; cy /= loop.length; cz /= loop.length;
    // Which way is INTO the solid comes from the surviving surface, not from
    // the loop's winding: a rim traced the other way flips the winding normal,
    // and dishing along that pushes the patch outward into a spike.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < loop.length; i++) {
      const t = from.get(`${loop[i]}>${loop[(i + 1) % loop.length]}`);
      if (t === undefined) continue;
      const a = topo.ids[t * 3], b = topo.ids[t * 3 + 1], c = topo.ids[t * 3 + 2];
      const ux = V[b * 3] - V[a * 3], uy = V[b * 3 + 1] - V[a * 3 + 1], uz = V[b * 3 + 2] - V[a * 3 + 2];
      const wx = V[c * 3] - V[a * 3], wy = V[c * 3 + 1] - V[a * 3 + 1], wz = V[c * 3 + 2] - V[a * 3 + 2];
      nx += uy * wz - uz * wy; ny += uz * wx - ux * wz; nz += ux * wy - uy * wx;
    }
    const L = Math.hypot(nx, ny, nz);
    if (L > 1e-9 && dish) { cx -= nx / L * dish; cy -= ny / L * dish; cz -= nz / L * dish; }
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      tris.push(V[b * 3], V[b * 3 + 1], V[b * 3 + 2],
        V[a * 3], V[a * 3 + 1], V[a * 3 + 2], cx, cy, cz);
      capped++;
    }
  }
  return { positions: Float32Array.from(tris), removed: kill.size, capped, holes: loops.length };
}

// One call for the viewer: click a triangle, get back the new geometry.
export function shaveAt(positions, seedTri, opts = {}) {
  const topo = opts.topo ?? buildTopology(positions);
  const grown = growStrand(topo, seedTri, { ...opts, positions });
  if (!grown.ok) return { ok: false, reason: grown.reason };
  const cut = cutAndCap(positions, topo, grown.inside, opts);
  return { ok: true, ...cut, rim: grown.rim };
}
