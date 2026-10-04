// FizzCore: graded bubble infill for a printed part.
//
// The idea (Aryn's, 2026-10-03): fill a model with bubbles instead of a
// slicer's grid. Big bubbles where there is room, smaller ones packed into
// the gaps between them, and bubbles that shrink as the part gets thin, so
// the plastic left behind is a closed-cell foam: a skin, plus thin webs
// joining it all together.
//
// Two design decisions that are not obvious from that description:
//
//  1. GRADED TOWARD THE SKIN, not uniform. Bending load is carried by the
//     material furthest from the middle of a section (it is why an I-beam is
//     an I), so bubble size grows with depth: small, dense bubbles just under
//     the skin, the big ones in the core where they cost the least strength.
//     `grade` controls how quickly they grow.
//
//  2. TEARDROP TOPS. An FDM printer cannot print the ceiling of a round
//     cavity: the last few layers of a sphere's dome are a flat bridge in mid
//     air, and big bubbles come out with sagging, stringy roofs, which is
//     exactly where the webs are supposed to be strongest. A sphere capped
//     with a 45 degree cone is the shape slicers print with no support, so
//     that is the default (`teardrop: true`). Turn it off for SLS/MJF, where
//     overhangs don't matter. (Resin needs drain holes, which this does not
//     make, so it is not a resin tool.)
//
// The bubbles never overlap by construction, so they are composed (no
// boolean between them, which is O(n)) and subtracted from the part in one
// manifold-3d difference. Distance to the surface comes from a voxel grid and
// an exact Euclidean distance transform, which is cheap, robust to any
// watertight mesh, and accurate to one voxel, which the skin margin covers.
//
// Everything here is pure: no DOM, no three.js. It runs in Node for the tests
// and in the page for the tool.

const SQRT2 = Math.SQRT2;
// The two spheres used to keep teardrops apart: the round body, and a smaller
// one that encloses the cone. Checked against the real hull: together they
// cover it to within 0.3% of r, and the web margin is far bigger than that.
const TOP_OFF = 0.8, TOP_R = 0.62;

export const FIZZ_DEFAULTS = {
  minBubble: 1.2,     // smallest bubble RADIUS, mm
  maxBubble: 0,       // largest bubble radius, mm; 0 = pick from the part's size
  fillGaps: true,     // pack small bubbles into the gaps between big ones
  skin: 1.2,          // solid shell, mm (3 perimeters at 0.4)
  web: 0.8,           // thinnest wall between two bubbles, mm (2 perimeters)
  grade: 0.35,        // 0 = same size everywhere, 1 = strongly graded to the core
  teardrop: true,     // 45 degree tops, printable with no support (FDM)
  maxBubbles: 6000,   // safety cap: every bubble is a few hundred triangles
  resolution: 0,      // voxel size, mm; 0 = automatic
  density: 1.24,      // g/cm3, for the weight estimate (PLA)
};

let wasmPromise = null;
export async function loadManifold() {
  wasmPromise ??= (async () => {
    const Module = (await import("manifold-3d")).default;
    const wasm = await Module();
    wasm.setup();
    return wasm;
  })();
  return wasmPromise;
}

// ------------------------------------------------------------------ mesh in

// Triangle soup (9 floats per triangle) -> shared vertices. STL repeats every
// corner per triangle; manifold needs them welded to see a closed solid.
export function weld(soup, tol = 1e-4) {
  const map = new Map();
  const verts = [];
  const tris = new Uint32Array(soup.length / 3);
  const q = 1 / tol;
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${Math.round(soup[i] * q)},${Math.round(soup[i + 1] * q)},${Math.round(soup[i + 2] * q)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      map.set(key, id);
      verts.push(soup[i], soup[i + 1], soup[i + 2]);
    }
    tris[i / 3] = id;
  }
  // drop triangles that welded down to a line or a point
  const keep = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    if (a !== b && b !== c && a !== c) keep.push(a, b, c);
  }
  return { verts: new Float32Array(verts), tris: new Uint32Array(keep) };
}

export function soupToManifold(wasm, soup) {
  const { verts, tris } = weld(soup);
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: verts, triVerts: tris });
  mesh.merge();
  let solid;
  try { solid = new wasm.Manifold(mesh); }
  catch (e) {
    throw new Error("This mesh isn't a closed solid (it has holes or loose faces), so there is no inside to fill. Run Repair on it first, then try again.");
  }
  if (solid.status && solid.status() !== "NoError") {
    throw new Error(`This mesh isn't a closed solid (${solid.status()}). Run Repair on it first, then try again.`);
  }
  if (!(solid.volume() > 0)) {
    throw new Error("This mesh has no volume (inside-out or open), so there is nothing to fill. Run Repair on it first.");
  }
  return solid;
}

export function manifoldToSoup(solid) {
  const m = solid.getMesh();
  const P = m.numProp, V = m.vertProperties, T = m.triVerts;
  const out = new Float32Array(T.length * 3);
  for (let i = 0; i < T.length; i++) {
    const v = T[i] * P;
    out[i * 3] = V[v]; out[i * 3 + 1] = V[v + 1]; out[i * 3 + 2] = V[v + 2];
  }
  return out;
}

function boundsOf(soup) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = soup[i + k];
      if (v < mn[k]) mn[k] = v;
      if (v > mx[k]) mx[k] = v;
    }
  }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

// --------------------------------------------------------- distance field

// Voxelise by ray parity: one ray up +Z per (x, y) column, every crossing
// toggles inside/outside. The column centres sit at an awkward fraction of a
// voxel so a ray almost never lands exactly on a triangle edge or vertex,
// which is the one case parity counting gets wrong.
function voxelise(soup, grid) {
  const { nx, ny, nz, h, o } = grid;
  const inside = new Uint8Array(nx * ny * nz);
  const cols = new Array(nx * ny);
  const JX = 0.5 + 1.3e-4, JY = 0.5 + 2.9e-4;
  for (let t = 0; t < soup.length; t += 9) {
    const ax = soup[t], ay = soup[t + 1], az = soup[t + 2];
    const bx = soup[t + 3], by = soup[t + 4], bz = soup[t + 5];
    const cx = soup[t + 6], cy = soup[t + 7], cz = soup[t + 8];
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - o[0]) / h - JX));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - o[0]) / h - JX));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - o[1]) / h - JY));
    const j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - o[1]) / h - JY));
    if (i0 > i1 || j0 > j1) continue;
    const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);   // 2x signed xy area
    if (Math.abs(d) < 1e-12) continue;                          // edge-on to the ray
    for (let j = j0; j <= j1; j++) {
      const py = o[1] + (j + JY) * h;
      for (let i = i0; i <= i1; i++) {
        const px = o[0] + (i + JX) * h;
        // barycentric in xy
        const w1 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / d;
        const w2 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / d;
        const w3 = 1 - w1 - w2;
        if (w1 < 0 || w2 < 0 || w3 < 0) continue;
        const z = w1 * az + w2 * bz + w3 * cz;
        (cols[j * nx + i] ??= []).push(z);
      }
    }
  }
  for (let c = 0; c < cols.length; c++) {
    const zs = cols[c];
    if (!zs || zs.length < 2) continue;
    zs.sort((a, b) => a - b);
    const n = zs.length & ~1;                 // an odd count is a bad column: drop the last hit
    const i = c % nx, j = (c / nx) | 0;
    for (let k = 0; k < n; k += 2) {
      const k0 = Math.max(0, Math.ceil((zs[k] - o[2]) / h - 0.5));
      const k1 = Math.min(nz - 1, Math.floor((zs[k + 1] - o[2]) / h - 0.5));
      for (let kk = k0; kk <= k1; kk++) inside[(kk * ny + j) * nx + i] = 1;
    }
  }
  return inside;
}

// Felzenszwalb & Huttenlocher's exact 1-D squared distance transform, run
// along each axis in turn: exact Euclidean distance in linear time.
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      const p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
    }
    if (k === 0 && s <= z[0]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

// Distance from every inside voxel to the nearest outside voxel, in mm.
function distanceField(inside, grid) {
  const { nx, ny, nz, h } = grid;
  const BIG = 1e20;
  const D = new Float32Array(nx * ny * nz);
  for (let i = 0; i < D.length; i++) D[i] = inside[i] ? BIG : 0;
  const n = Math.max(nx, ny, nz);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  // x
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const base = (k * ny + j) * nx;
    for (let i = 0; i < nx; i++) f[i] = D[base + i];
    edt1d(f, nx, d, v, z);
    for (let i = 0; i < nx; i++) D[base + i] = d[i];
  }
  // y
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) f[j] = D[(k * ny + j) * nx + i];
    edt1d(f, ny, d, v, z);
    for (let j = 0; j < ny; j++) D[(k * ny + j) * nx + i] = d[j];
  }
  // z
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) f[k] = D[(k * ny + j) * nx + i];
    edt1d(f, nz, d, v, z);
    for (let k = 0; k < nz; k++) D[(k * ny + j) * nx + i] = d[k];
  }
  // voxel units squared -> mm, measured to the surface (half a voxel short of
  // the outside voxel's centre)
  for (let i = 0; i < D.length; i++) D[i] = D[i] > 0 ? Math.max(0, Math.sqrt(D[i]) - 0.5) * h : 0;
  return D;
}

function sampler(D, grid) {
  const { nx, ny, nz, h, o } = grid;
  return (x, y, z) => {
    const fx = (x - o[0]) / h - 0.5, fy = (y - o[1]) / h - 0.5, fz = (z - o[2]) / h - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return 0;
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const at = (a, b, c) => D[((k + c) * ny + (j + b)) * nx + (i + a)];
    // a corner OUTSIDE the part reads 0; never interpolate past it, so a
    // point near the surface reads small rather than averaged-up
    const c000 = at(0, 0, 0), c100 = at(1, 0, 0), c010 = at(0, 1, 0), c110 = at(1, 1, 0);
    const c001 = at(0, 0, 1), c101 = at(1, 0, 1), c011 = at(0, 1, 1), c111 = at(1, 1, 1);
    if (!c000 || !c100 || !c010 || !c110 || !c001 || !c101 || !c011 || !c111) {
      return Math.min(c000, c100, c010, c110, c001, c101, c011, c111);
    }
    const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
    const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
    return y0 + (y1 - y0) * tz;
  };
}

// ----------------------------------------------------------------- packing

// A seeded generator, so the same part and settings give the same bubbles:
// a print you liked can be made again.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function autoMaxBubble(size) {
  const minDim = Math.min(...size);
  return Math.round(Math.max(2.5, Math.min(15, minDim / 4)) * 10) / 10;
}

function pack(D, grid, sample, opt, onProgress) {
  const { nx, ny, nz, h, o } = grid;
  const rMin = opt.minBubble, rMax = Math.max(rMin, opt.maxBubble);
  const skin = opt.skin + h * 0.5, web = opt.web;
  // Depth at which a bubble may reach full size. grade 0: right under the
  // skin; grade 1: only deep in the core.
  //
  // Scaled to the part's own depth as well: on a thin-walled part (a Benchy's
  // thickest wall is ~6 mm) a fixed 7 mm ramp meant no bubble ever reached
  // full size. So the ramp is never longer than the depth actually there.
  let deepest = 0;
  for (let i = 0; i < D.length; i++) if (D[i] > deepest) deepest = D[i];
  const depthRoom = Math.max(0.5, deepest - skin - rMin);
  const gradeDepth = Math.min(rMax * (0.2 + 3.8 * opt.grade), depthRoom * (0.2 + 0.8 * opt.grade));
  const rCap = (d) => {
    const t = Math.max(0, Math.min(1, (d - skin - rMin) / gradeDepth));
    return rMin + (rMax - rMin) * t;
  };

  // Candidate centres: inside voxels deep enough for the smallest bubble,
  // thinned so huge parts do not mean millions of candidates.
  const need = skin + rMin;
  let count = 0;
  for (let i = 0; i < D.length; i++) if (D[i] >= need) count++;
  const stride = Math.max(1, Math.round(Math.cbrt(count / 350000)));
  const rand = rng(opt.seed ?? 7);
  const cand = [];
  for (let k = 0; k < nz; k += stride) for (let j = 0; j < ny; j += stride) for (let i = 0; i < nx; i += stride) {
    const d = D[(k * ny + j) * nx + i];
    if (d < need) continue;
    const x = o[0] + (i + 0.5 + (rand() - 0.5) * stride * 0.8) * h;
    const y = o[1] + (j + 0.5 + (rand() - 0.5) * stride * 0.8) * h;
    const z = o[2] + (k + 0.5 + (rand() - 0.5) * stride * 0.8) * h;
    // measure at the JITTERED point, not the voxel centre it came from
    const dj = sample(x, y, z);
    if (dj < need) continue;
    cand.push({ x, y, z, d: dj, key: dj + rand() * h * 0.25 });
  }
  cand.sort((a, b) => b.key - a.key);   // deepest first: the big bubbles claim the core

  // Spatial hash of collision spheres.
  const cell = 2 * rMax * 1.5 + web + 1e-6;
  const hash = new Map();
  const keyOf = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const add = (x, y, z, r) => {
    const k = keyOf(x, y, z);
    let b = hash.get(k);
    if (!b) hash.set(k, (b = []));
    b.push(x, y, z, r);
  };
  // Biggest radius a sphere at (x, y, z) can have and keep `web` from every
  // sphere already placed.
  const room = (x, y, z, limit) => {
    let best = limit;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const bin = hash.get(`${cx + a},${cy + b},${cz + c}`);
      if (!bin) continue;
      for (let n = 0; n < bin.length; n += 4) {
        const dd = Math.hypot(bin[n] - x, bin[n + 1] - y, bin[n + 2] - z) - bin[n + 3] - web;
        if (dd < best) { best = dd; if (best < rMin * 0.5) return best; }
      }
    }
    return best;
  };

  const bubbles = [];
  let capped = false;
  const place = (q, T) => {
    let r = Math.min(rCap(q.d), q.d - skin);
    if (r < T) return false;
    r = Math.min(r, room(q.x, q.y, q.z, r));
    if (r < T || r < rMin) return false;
    if (opt.teardrop) {
      // shrink until the cone clears the skin and its neighbours too
      let ok = false;
      for (let tries = 0; tries < 6 && r >= rMin; tries++) {
        const tz = q.z + TOP_OFF * r, tr = TOP_R * r;
        const dTop = sample(q.x, q.y, tz) - skin;
        // and the tip itself: the grid is only accurate to a voxel, and the
        // tip is the one point that runs straight at the top skin
        const dTip = sample(q.x, q.y, q.z + SQRT2 * r) - skin - h * 0.5;
        if (tr <= dTop && dTip >= 0 && room(q.x, q.y, tz, tr) >= tr) { ok = true; break; }
        r *= 0.86;
      }
      if (!ok || r < T || r < rMin) return false;
    }
    bubbles.push([q.x, q.y, q.z, r]);
    add(q.x, q.y, q.z, r);
    if (opt.teardrop) add(q.x, q.y, q.z + TOP_OFF * r, TOP_R * r);
    if (bubbles.length >= opt.maxBubbles) capped = true;
    return true;
  };

  // Lattice first. Bubbles dropped at random jam at roughly a third of the
  // space no matter how long you keep trying (random sequential packing tops
  // out near 38%); a hexagonal close-packed lattice is the densest way to
  // stack equal spheres there is (74%). So the big bubbles go down on that
  // lattice, and the random passes after it fill the gaps the lattice and the
  // grading leave. Teardrops stack on taller layers, because a cone pointing
  // up into the hollow between three bubbles above would hit them.
  if (opt.lattice !== false) {
    const s = 2 * rMax + web;                       // centre spacing in a layer
    const dz = opt.teardrop ? rMax * (1 + TOP_OFF + TOP_R) + web : s * Math.sqrt(2 / 3);
    const rowY = s * Math.sqrt(3) / 2;
    // centre the lattice in the part rather than gluing it to a corner
    const ph = ((nx * h) % s) / 2;
    const lat = [];
    for (let L = 0, z = o[2] + ph * 0.5; z < o[2] + nz * h; L++, z += dz) {
      const ox = (L % 3) * s / 2, oy = (L % 3) * rowY / 3;
      for (let R = 0, y = o[1] + oy; y < o[1] + ny * h; R++, y += rowY) {
        for (let x = o[0] + ox + (R % 2) * s / 2 + ph; x < o[0] + nx * h; x += s) {
          const d = sample(x, y, z);
          if (d >= need) lat.push({ x, y, z, d });
        }
      }
    }
    lat.sort((a, b) => b.d - a.d);
    for (const q of lat) { if (capped) break; place(q, rMin + (rMax - rMin) * 0.3); }
  }

  // Passes from big to small. Each pass only accepts bubbles at least as big as
  // its threshold, so every big bubble gets placed before a small one can take
  // its spot; the later passes are the gap fillers.
  const thresholds = opt.fillGaps
    ? [0.8, 0.55, 0.35, 0.2, 0].map((f) => rMin + (rMax - rMin) * f)
    : [0.8, 0.55].map((f) => rMin + (rMax - rMin) * f).concat(rMax <= rMin * 1.01 ? [rMin] : []);
  for (let p = 0; p < thresholds.length && !capped; p++) {
    const T = thresholds[p];
    for (let c = 0; c < cand.length && !capped; c++) {
      const q = cand[c];
      if (q.used) continue;
      if (place(q, T)) q.used = true;
    }
    onProgress?.(0.35 + 0.4 * ((p + 1) / thresholds.length), `Packing bubbles: ${bubbles.length}`);
  }
  // How much of the core is plastic: the number to compare with a slicer's
  // infill percentage.
  let coreCells = 0;
  for (let i = 0; i < D.length; i++) if (D[i] >= opt.skin) coreCells++;
  return { bubbles, capped, coreVolume: coreCells * h * h * h };
}

// ---------------------------------------------------------------- geometry

function bubbleTemplates(wasm, teardrop) {
  const cache = new Map();
  return (r) => {
    const seg = r < 1.5 ? 10 : r < 3 ? 14 : r < 6 ? 20 : 28;
    let t = cache.get(seg);
    if (!t) {
      const s = wasm.Manifold.sphere(1, seg);
      t = teardrop ? wasm.Manifold.hull([s, [0, 0, SQRT2]]) : s;
      cache.set(seg, t);
    }
    return t;
  };
}

// ------------------------------------------------------------- support fins
//
// The same removable buttresses as BREPcode's fins() (src/dsl.js), rebuilt at
// mesh level so they can ride along with a foamed part that is far too heavy
// for the CAD kernel: a 45 degree triangular plate standing off the part by
// `gap`, a thin skirt for bed grip, and teeth that reach in and stop
// `clearance` short of the surface, so a clean print never fuses to them and
// they only catch the part if it starts to lean. Each tooth's reach is MEASURED
// by casting a ray at the real surface, so a curved face still gets short teeth.

function rayHits(soup, origin, axis, dir) {
  // axis 0 = x, 1 = y; returns the distances along +dir to each crossing
  const out = [];
  const [ox, oy, oz] = origin;
  const u = axis === 0 ? 1 : 0;              // the other horizontal axis
  for (let t = 0; t < soup.length; t += 9) {
    const P = (n) => [soup[t + n * 3], soup[t + n * 3 + 1], soup[t + n * 3 + 2]];
    const a = P(0), b = P(1), c = P(2);
    // project to the (u, z) plane; the ray is the point (o_u, o_z)
    const pu = origin[u], pz = oz;
    const d = (b[u] - a[u]) * (c[2] - a[2]) - (c[u] - a[u]) * (b[2] - a[2]);
    if (Math.abs(d) < 1e-12) continue;
    const w1 = ((b[u] - pu) * (c[2] - pz) - (c[u] - pu) * (b[2] - pz)) / d;
    const w2 = ((c[u] - pu) * (a[2] - pz) - (a[u] - pu) * (c[2] - pz)) / d;
    const w3 = 1 - w1 - w2;
    // a ray straight down a shared edge must count as a hit, or it reads the
    // NEXT surface in (deep inside the part); a double count is harmless here
    // because only the first hit is used
    if (w1 < -1e-7 || w2 < -1e-7 || w3 < -1e-7) continue;
    const s = (w1 * a[axis] + w2 * b[axis] + w3 * c[axis] - origin[axis]) * dir;
    if (s >= 0) out.push(s);
  }
  return out.sort((x, y) => x - y);
}

export function finsFor(wasm, soup, bounds, f = {}) {
  const side = f.side ?? "-x";
  let count = Math.max(1, Math.min(24, Math.round(f.count ?? 3)));
  const nozzle = f.nozzle ?? 0.4;
  // thickness in whole extrusion lines (3 = stiff, 2 = lighter, 4 = heavy parts)
  const lines = Math.max(1, Math.min(8, Math.round(f.lines ?? 3)));
  const t = Math.round(nozzle * lines * 100) / 100;
  // how far the fin plate stands off the part (the pokes bridge it)
  const gap = Math.max(0.3, f.gap ?? Math.max(0.8, nozzle * 2));
  // the poke gap: how far short of the part each poke's tip stops. 0.2 is a
  // slicer's usual support Z gap; 0 = the tip just kisses the part
  const clearance = Math.max(0, f.clearance ?? 0.2);
  const skirt = f.skirt ?? 5;
  // "slim": a band that follows the part at a fixed depth, just enough to
  // catch it if it teeters. "buttress": the 45 degree brace, for heavy parts.
  const shape = f.shape === "buttress" ? "buttress" : "slim";
  const depth = Math.max(3, f.depth ?? 8);
  // the little pokes (teeth): one every `teethEvery` mm of height; 0 = none
  const teethEvery = Math.max(0, f.teethEvery ?? 10);
  const MAX_REACH = 12;
  // HOW TALL. A fin only has to stop the part tipping, and the part tips
  // about its centre of mass: catching it a little above that height is
  // enough. Anything taller is plastic holding up a face that already prints
  // (a box at 45 degrees supports itself). "full" goes to the top, for
  // wobbly or top-heavy parts; a number is a height in mm.
  let comZ = bounds.min[2] + bounds.size[2] / 2;
  {
    let vol = 0, cz = 0;
    for (let t = 0; t < soup.length; t += 9) {
      const ax = soup[t], ay = soup[t + 1], az = soup[t + 2];
      const bx = soup[t + 3], by = soup[t + 4], bz = soup[t + 5];
      const cx = soup[t + 6], cy = soup[t + 7], ccz = soup[t + 8];
      const v = (ax * (by * ccz - bz * cy) - ay * (bx * ccz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      vol += v; cz += v * (az + bz + ccz) / 4;
    }
    if (vol) comZ = cz / vol;
  }
  const heightMode = f.height ?? "auto";
  const maxH = heightMode === "full" ? Infinity
    : Number.isFinite(+heightMode) && +heightMode > 0 ? +heightMode
    : Math.max(10, (comZ - bounds.min[2]) * 1.25);
  const axis = side[1] === "x" ? 0 : 1;          // the axis the fins push along
  const along = axis === 0 ? 1 : 0;              // the axis they are spread along
  const outward = side[0] === "+" ? 1 : -1;
  const faceBB = outward > 0 ? bounds.max[axis] : bounds.min[axis];
  const z0 = bounds.min[2];
  const H0 = bounds.size[2];
  const a0 = bounds.min[along] + 1, a1 = bounds.max[along] - 1;
  const across = bounds.size[axis];
  // `spacing` (mm between fins) overrides the count: more fins on a long part
  if (f.spacing > 0) count = Math.max(1, Math.min(24, Math.round((a1 - a0) / f.spacing)));
  const pitch = (a1 - a0) / count;
  const fins = [];
  const plan = [];
  const DEG = Math.PI / 180;
  const CS = wasm.CrossSection;
  const solid = f.solid;

  // Fin-local frame: X = out from the part (0 = the plane through its most
  // protruding point), Y = up from the bed, Z = across the fin. The sign on Z
  // keeps the map a proper rotation, so warp() never turns a solid inside out.
  const sZ = axis === 0 ? -outward : outward;
  const ccw = (pts) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a < 0 ? pts.slice().reverse() : pts;
  };
  const poly = (pts) => new CS([ccw(pts)]);

  for (let i = 0; i < count; i++) {
    const li = a0 + (i + 0.5) * pitch;
    // PROBE: where the surface is at each height (outward coordinate, bigger =
    // further out), three rays across the fin's thickness, keeping the one
    // that sticks out most.
    const originO = outward * faceBB + 5;
    const dz = Math.max(0.5, H0 / 90);
    const raw = [];
    for (let z = z0 + 0.6; z < z0 + H0 * 0.985; z += dz) {
      let best = -Infinity;
      for (const off of [-(t / 2 + 0.4), 0, t / 2 + 0.4]) {
        const o = [0, 0, z];
        o[axis] = outward * originO;
        o[along] = li + off;
        const hs = rayHits(soup, o, axis, -outward);
        if (hs.length) best = Math.max(best, originO - hs[0]);
      }
      if (best > -Infinity) raw.push({ z, s: best });
    }
    if (raw.length < 2) continue;
    // A sudden jump INWARD is a hole or a gap, not the face: stop below it.
    let n = raw.length;
    for (let k = 1; k < raw.length; k++) if (raw[k - 1].s - raw[k].s > 8) { n = k; break; }
    let prof = raw.slice(0, n);
    // stop at the fin height (keeping at least the first two probes)
    const capped = prof.filter((h) => h.z - z0 <= maxH);
    prof = capped.length >= 2 ? capped : prof.slice(0, 2);
    const base = Math.max(...prof.map((h) => h.s));

    // the face's overall lean, for the record
    let top = 0;
    for (let k = 1; k < prof.length; k++) if (prof[k].s > prof[top].s + 1e-6) top = k;
    const fitPts = top >= 2 ? prof.slice(0, top + 1) : prof;
    let lean = 0;
    if (fitPts.length >= 3) {
      const m = fitPts.length, mz = fitPts.reduce((a, h) => a + h.z, 0) / m, ms = fitPts.reduce((a, h) => a + h.s, 0) / m;
      let num = 0, den = 0;
      for (const h of fitPts) { num += (h.z - mz) * (h.s - ms); den += (h.z - mz) ** 2; }
      lean = Math.round(Math.max(0, Math.min(75, Math.atan(den > 0 ? num / den : 0) / DEG)));
    }

    // The profile edge, `gap` off the surface, never stepping IN by more than
    // 45 degrees going up (or the fin plate would overhang).
    const edge = prof.map((h) => ({ zl: h.z - z0, surf: h.s - base, x: h.s - base + gap }));
    for (let k = 1; k < edge.length; k++) {
      edge[k].x = Math.max(edge[k].x, edge[k - 1].x - (edge[k].zl - edge[k - 1].zl));
    }
    const topZl = edge[edge.length - 1].zl;
    const H = Math.max(2, Math.min(H0, topZl + 0.2));
    const xTop = edge[edge.length - 1].x;
    // The outer edge is a buttress: from every point of the (curvy) inner
    // edge, a 45 degree slope down and out. So the plate is at least 3 mm wide
    // everywhere, its outer face never overhangs, and it is only as long as
    // the part needs. (A single straight outer line, forced to clear a bulge
    // near the top, ran out across the bed for 100+ mm.)
    const anchors = [...edge.map((p) => ({ zl: p.zl, x: p.x })), { zl: H, x: xTop }];
    const innerAt = (zl) => {
      if (zl <= anchors[0].zl) return anchors[0].x;
      for (let k = 1; k < anchors.length; k++) {
        if (zl <= anchors[k].zl) {
          const a = anchors[k - 1], b = anchors[k];
          return a.x + (b.x - a.x) * ((zl - a.zl) / Math.max(1e-9, b.zl - a.zl));
        }
      }
      return xTop;
    };
    const outerX = shape === "slim"
      // slim = a 90 degree triangle: the curvy side hugs the part, and the
      // outer side drops STRAIGHT DOWN from the furthest-out bit of the part
      // above, `depth` beyond it. A band that only followed the surface
      // climbed a part's belly and stopped there, never reaching the leaning
      // head it was for; a vertical side gets there from the bed and is still
      // a fraction of a 45 degree buttress.
      ? (zl) => {
        let m = -Infinity;
        for (const a of anchors) if (a.zl >= zl - 1e-9) m = Math.max(m, a.x + depth);
        return m;
      }
      : (zl) => {
        let m = -Infinity;
        for (const a of anchors) if (a.zl >= zl - 1e-9) m = Math.max(m, a.x + 3 + (a.zl - zl));
        return m;
      };
    const outerPts = [H, ...edge.map((p) => p.zl).reverse(), 0].map((zl) => [outerX(zl), zl]);
    const xo = outerX(0);

    // ---- the fin, in 2D
    //
    // THE RULER LINE. The fin's contact edge is a straightedge laid against the
    // part's bulges (the convex hull of its outline on the fin side), not a
    // trace of every curve: diving into each pocket left thin hooks and slivers
    // that could not print, and holding a part needs its high points, not its
    // dips. Pokes then reach from that line to the real surface where the reach
    // is short.
    const chain = [];
    {
      const pts = [{ x: edge[0].surf, y: 0 }, ...edge.map((p) => ({ x: p.surf, y: p.zl }))];
      const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      for (const p of pts) {
        // walking up the side that faces the fins, a convex outline only ever
        // turns counter-clockwise; anything else is a pocket the ruler spans
        while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop();
        chain.push(p);
      }
    }
    const rulerAt = (zl) => {
      if (zl <= chain[0].y) return chain[0].x;
      for (let k = 1; k < chain.length; k++) {
        if (zl <= chain[k].y) {
          const a = chain[k - 1], b = chain[k];
          return a.x + (b.x - a.x) * ((zl - a.y) / Math.max(1e-9, b.y - a.y));
        }
      }
      return chain[chain.length - 1].x;
    };

    // pokes: one every `teethEvery` mm, only where the ruler is close enough
    // to the real surface that a short tooth reaches it
    const POKE_REACH = 6;
    const teethZ = [];
    if (teethEvery > 0) {
      let last = -Infinity;
      const pool = edge.filter((p) => p.zl >= 2 && rulerAt(p.zl) + gap - p.surf <= POKE_REACH);
      for (const p of pool) {
        if (p.zl - last >= teethEvery - 1e-6) { teethZ.push(p); last = p.zl; }
      }
      const topP = pool[pool.length - 1];
      if (topP && !teethZ.some((q) => Math.abs(q.zl - topP.zl) < Math.min(4, teethEvery * 0.5))) teethZ.push(topP);
    }
    // A poke is a SACRIFICIAL POINT, not a ledge: a small 45 degree triangle
    // that just bridges the fin's gap to the part, its tip stopping
    // `clearance` short. It only has to catch a part that teeters, and the
    // smaller it is the cleaner it snaps off. Its root sits 0.6 mm into the
    // fin so it is welded to the plate, not to the part.
    const toothPoly = (p, tip) => {
      const root = rulerAt(p.zl) + gap + 0.6;
      const run = Math.max(0.4, root - tip);
      const rise = Math.max(0.4, Math.min(run, p.zl - 0.2));   // 45 degrees, kept off the bed
      return poly([[root, p.zl - rise], [root, p.zl], [tip, p.zl]]);
    };

    // Where plastic MAY go (before printability): outside the part's keep-out,
    // inside the fin's envelope, plus the pokes.
    let free, trimCut = null;
    if (solid) {
      // the real outline: slice the part along the fin's own plane (three
      // slices across its thickness), and keep the fin `gap` off its hull
      const local = solid.warp((v) => {
        const X = outward * v[axis] - base, Y = v[2] - z0, Z = sZ * v[along];
        v[0] = X; v[1] = Y; v[2] = Z;
      });
      const slices = [-(t / 2 + 0.3), 0, t / 2 + 0.3].map((off) => local.slice(sZ * (li + off)));
      const S = CS.union(slices);
      const keepOut = S.hull().offset(gap, "Round");
      // the envelope starts 3 mm behind the ruler (so the carve, not the probe,
      // decides the exact edge) and never wraps round to the part's far side
      const inner = edge.map((p) => [rulerAt(p.zl) - 3, p.zl]);
      const env = poly([[inner[0][0], 0], ...inner, [inner[inner.length - 1][0], H], ...outerPts]);
      // a zero gap still trims a hair (0.02) so a tip touches rather than fuses
      const trimmed = S.offset(Math.max(0.02, clearance), "Round");
      trimCut = trimmed;
      const pokes = teethZ.map((p) => toothPoly(p, p.surf - 0.6).subtract(trimmed));
      free = CS.union([env.subtract(keepOut), ...pokes]);
    } else {
      // no solid (a preview of a mesh that isn't closed): the probed ruler
      const inner = edge.map((p) => [rulerAt(p.zl) + gap, p.zl]);
      const env = poly([[inner[0][0], 0], ...inner, [inner[inner.length - 1][0], H], ...outerPts]);
      free = CS.union([env, ...teethZ.map((p) => toothPoly(p, p.surf + clearance))]);
    }

    // GROW IT FROM THE BED, one printed layer at a time: each 0.2 mm layer may
    // reach out at most 45 degrees past the layer below (offset by one layer)
    // and only into free space. That is the printer's own rule, so nothing can
    // float: a poke above the end of its fin, or a lip under a bulge, simply
    // never grows. At 0.2 mm the 45 degree steps are the layers themselves.
    const LAYER = f.layer ?? 0.2;
    free = free.simplify(0.03);
    // Cut the free space into horizontal strips ONCE, by slabs of 20 layers
    // (intersecting the whole outline 300+ times was most of the cost), then
    // grow strip by strip.
    const strips = [];
    const SLAB = LAYER * 20;
    for (let y0 = 0; y0 < H + 3; y0 += SLAB) {
      const slab = free.intersect(poly([[-1000, y0], [1000, y0], [1000, y0 + SLAB], [-1000, y0 + SLAB]]));
      for (let y = y0; y < y0 + SLAB - 1e-9; y += LAYER) {
        strips.push(slab.isEmpty() ? slab : slab.intersect(poly([[-1000, y], [1000, y], [1000, y + LAYER], [-1000, y + LAYER]])));
      }
    }
    let reach = strips[0];
    const layers = [reach];
    for (let k = 1; k < strips.length && !reach.isEmpty(); k++) {
      if (strips[k].isEmpty()) break;
      reach = strips[k].intersect(reach.offset(LAYER, "Miter", 2));
      if (!reach.isEmpty()) layers.push(reach);
    }
    // The layers step 0.2 mm out per 0.2 mm up, which prints as a clean 45
    // degree face but draws as a staircase. Simplifying by a step and a half
    // (0.3 mm) turns each staircase into the line it really is; the plate
    // keeps at least 0.5 of its 0.8 mm gap, and the pokes are re-trimmed
    // against the exact surface so smoothing can never eat their clearance.
    let fin2d = CS.union(layers).simplify(LAYER * 1.5);
    if (trimCut) fin2d = fin2d.subtract(trimCut);
    if (fin2d.isEmpty()) continue;
    const footBand = fin2d.intersect(poly([[-1000, 0], [1000, 0], [1000, 0.9], [-1000, 0.9]]));
    const skirtX = footBand.isEmpty() ? edge[0].x : footBand.bounds().min[0] + 0.2;
    // pokes that survived the growth (the rest would have printed on air)
    const madeTeeth = teethZ.filter((p) => {
      const at = fin2d.intersect(poly([[p.surf - 3, p.zl - 0.3], [rulerAt(p.zl) + gap, p.zl - 0.3], [rulerAt(p.zl) + gap, p.zl], [p.surf - 3, p.zl]]));
      return !at.isEmpty() && at.bounds().min[0] < rulerAt(p.zl) + gap - 0.3;
    }).length;

    // ---- back to 3D: extrude across the fin, then out of the local frame
    const toWorld = (v) => {
      const X = v[0], Y = v[1], Z = v[2];
      const o = [0, 0, 0];
      o[axis] = outward * (X + base);
      o[2] = Y + z0;
      o[along] = sZ * Z;
      v[0] = o[0]; v[1] = o[1]; v[2] = o[2];
    };
    const parts = [fin2d.extrude(t).translate([0, 0, sZ * li - t / 2])];
    if (skirt > 0.05) {
      // the foot: a flat triangle on the bed, spreading across the fin.
      // Built as (X, across, up) and turned into the local frame.
      const len = Math.min(Math.max(2, xo - skirtX), skirt * 2.5);
      const foot = poly([[skirtX, -(t / 2 + skirt)], [skirtX + len, 0], [skirtX, t / 2 + skirt]]).extrude(0.8)
        .warp((v) => { const W = v[1], h = v[2]; v[1] = h; v[2] = sZ * li - W; });
      parts.push(foot);
    }
    let fin = wasm.Manifold.union(parts).warp(toWorld);
    if (solid && skirt > 0.05) {
      // The foot spreads across the fin, beyond the slices the carve saw, and
      // once a fin reaches in under a part it can land on the part's own
      // footprint. Cut the part's bed outline (plus `gap`) out of it, and keep
      // only what is still joined to the fin.
      // sliced at the TOP of the foot: a tilted part standing on an edge
      // flares out as it rises, so its outline 0.4 mm up is too small
      const bed = solid.slice(z0 + 1.0);
      if (!bed.isEmpty()) {
        const keep = bed.offset(gap, "Round").extrude(1.2).translate([0, 0, z0 - 0.2]);
        const cut = fin.subtract(keep).decompose();
        const joined = cut.filter((m) => {
          const bb = m.boundingBox();
          return bb.max[2] > z0 + 1.2 && bb.min[along] <= li + t && bb.max[along] >= li - t;
        });
        fin = joined.length ? wasm.Manifold.union(joined) : fin;
      }
    }

    // Belt and braces: the carve is exact for the three slices; a part that
    // changes sharply across the fin's thickness could still come closer.
    let e = 0;
    if (solid) {
      const step = [0, 0, 0];
      step[axis] = outward * 0.25;
      for (let k = 0; k < 40 && solid.minGap(fin, 1) < clearance * 0.9; k++) { fin = fin.translate(step); e += 0.25; }
    }
    fins.push(fin);
    plan.push({ at: Math.round(li * 10) / 10, height: Math.round(H * 10) / 10, teeth: madeTeeth, lean, side, heightMode,
      backedOff: Math.round(e * 10) / 10, carved: !!solid, shape });
  }
  return { fins, plan };
}

// ------------------------------------------------------------ orient
//
// Any rotation the user dialled in (spin on the bed, flip, a face laid flat)
// arrives as one 3x3 matrix, row-major. Rotate about the part's centre, then
// put it back on the bed with its footprint where it was.
export function orientSoup(soup, m) {
  if (!m) return soup;
  const b0 = boundsOf(soup);
  const c = [(b0.min[0] + b0.max[0]) / 2, (b0.min[1] + b0.max[1]) / 2, (b0.min[2] + b0.max[2]) / 2];
  const out = new Float32Array(soup.length);
  for (let i = 0; i < soup.length; i += 3) {
    const x = soup[i] - c[0], y = soup[i + 1] - c[1], z = soup[i + 2] - c[2];
    out[i] = m[0] * x + m[1] * y + m[2] * z + c[0];
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z + c[1];
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z + c[2];
  }
  const b1 = boundsOf(out);
  const dz = b0.min[2] - b1.min[2];
  for (let i = 2; i < out.length; i += 3) out[i] += dz;
  return out;
}

// ---------------------------------------------------------------- tilt
//
// Print a part on a slant: rotate it so its top leans `deg` degrees toward
// `toward` (the side the fins go on), then drop it onto the bed (min z = 0)
// with its footprint centred where it was. Everything downstream, bubbles
// included, then works in the print frame, so the teardrops still point up.
export function tiltSoup(soup, deg = 45, toward = "-x") {
  if (!deg) return soup;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const out = new Float32Array(soup.length);
  const sign = toward[0] === "+" ? 1 : -1;
  const aboutY = toward[1] === "x";
  for (let i = 0; i < soup.length; i += 3) {
    const x = soup[i], y = soup[i + 1], z = soup[i + 2];
    if (aboutY) {
      // top moves toward sign*x
      out[i] = x * c + sign * z * sn; out[i + 1] = y; out[i + 2] = -sign * x * sn + z * c;
    } else {
      // top moves toward sign*y
      out[i] = x; out[i + 1] = y * c + sign * z * sn; out[i + 2] = -sign * y * sn + z * c;
    }
  }
  const b0 = boundsOf(soup), b1 = boundsOf(out);
  const dx = (b0.min[0] + b0.max[0]) / 2 - (b1.min[0] + b1.max[0]) / 2;
  const dy = (b0.min[1] + b0.max[1]) / 2 - (b1.min[1] + b1.max[1]) / 2;
  const dz = -b1.min[2];
  for (let i = 0; i < out.length; i += 3) { out[i] += dx; out[i + 1] += dy; out[i + 2] += dz; }
  return out;
}

// Which way would it fall? Compare the centre of mass with the middle of what
// it stands on, along the tilt axis. A tall part tilted toward -x falls toward
// -x; a WIDE part tilted the same way ends up standing on one edge with most
// of its weight on the other side, and falls the other way. Fins go where it
// would fall. Within a millimetre it is balanced, and the lean side wins.
export function tipSide(soup, toward = "-x") {
  const axis = toward[1] === "x" ? 0 : 1;
  let vol = 0, c = 0;
  for (let t = 0; t < soup.length; t += 9) {
    const ax = soup[t], ay = soup[t + 1], az = soup[t + 2];
    const bx = soup[t + 3], by = soup[t + 4], bz = soup[t + 5];
    const cx = soup[t + 6], cy = soup[t + 7], cz = soup[t + 8];
    const v = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    vol += v;
    c += v * ([ax, ay][axis] + [bx, by][axis] + [cx, cy][axis]) / 4;
  }
  if (!vol) return toward;
  const com = c / vol;
  let minZ = Infinity;
  for (let i = 2; i < soup.length; i += 3) if (soup[i] < minZ) minZ = soup[i];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < soup.length; i += 3) {
    if (soup[i + 2] > minZ + 0.5) continue;
    const v = soup[i + axis];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const foot = (lo + hi) / 2;
  if (Math.abs(com - foot) < 1) return toward;
  return (com > foot ? "+" : "-") + (axis === 0 ? "x" : "y");
}

// ------------------------------------------------------------ overhangs
//
// Fins catch a part that teeters; they do not hold up its undersides, which
// still print on air if they hang past 45 degrees. So the tool measures them:
// a triangle is an overhang when it faces within `maxDeg` of STRAIGHT DOWN
// (so 45 = the usual "45 degree rule": anything flatter than 45 degrees from
// horizontal on its underside), and it is not resting on the bed. A SMALLER
// maxDeg is more lenient. Returns the area (mm2) and which triangles, so the
// preview can paint them red.
export function overhangs(soup, { maxDeg = 45, bedTol = 0.3 } = {}) {
  const lim = -Math.cos((maxDeg * Math.PI) / 180);
  let minZ = Infinity;
  for (let i = 2; i < soup.length; i += 3) if (soup[i] < minZ) minZ = soup[i];
  let area = 0;
  const bad = [];
  for (let t = 0; t < soup.length; t += 9) {
    const ux = soup[t + 3] - soup[t], uy = soup[t + 4] - soup[t + 1], uz = soup[t + 5] - soup[t + 2];
    const vx = soup[t + 6] - soup[t], vy = soup[t + 7] - soup[t + 1], vz = soup[t + 8] - soup[t + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (!len) continue;
    if (nz / len >= lim) continue;
    // resting on the bed is not an overhang
    if (Math.max(soup[t + 2], soup[t + 5], soup[t + 8]) < minZ + bedTol) continue;
    area += len / 2;
    bad.push(t / 9);
  }
  return { area, tris: bad };
}

// The tilt (and lean direction) with the least overhang. Normals are rotated,
// not the mesh, so a sweep over every angle and side costs a few milliseconds
// per combination. Ties go to the angle closest to `prefer` (45 by default).
export function bestTilt(soup, { angles, sides = ["-x", "+x", "-y", "+y"], maxDeg = 45, prefer = 45 } = {}) {
  angles ??= Array.from({ length: 16 }, (_, k) => k * 5);   // 0..75
  const n = soup.length / 9;
  const N = new Float64Array(n * 4);                          // nx, ny, nz, area
  for (let t = 0, k = 0; t < soup.length; t += 9, k += 4) {
    const ux = soup[t + 3] - soup[t], uy = soup[t + 4] - soup[t + 1], uz = soup[t + 5] - soup[t + 2];
    const vx = soup[t + 6] - soup[t], vy = soup[t + 7] - soup[t + 1], vz = soup[t + 8] - soup[t + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    N[k] = nx / len; N[k + 1] = ny / len; N[k + 2] = nz / len; N[k + 3] = len / 2;
  }
  const lim = -Math.cos((maxDeg * Math.PI) / 180);
  let best = null;
  const results = [];
  for (const toward of sides) {
    for (const deg of angles) {
      if (deg === 0 && toward !== sides[0]) continue;   // upright is upright
      const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const sign = toward[0] === "+" ? 1 : -1, aboutY = toward[1] === "x";
      // the new height of each vertex, for the bed test
      let minZ = Infinity;
      const zOf = (x, y, z) => (aboutY ? -sign * x * s + z * c : -sign * y * s + z * c);
      for (let i = 0; i < soup.length; i += 3) { const z = zOf(soup[i], soup[i + 1], soup[i + 2]); if (z < minZ) minZ = z; }
      let area = 0;
      for (let t = 0, k = 0; t < soup.length; t += 9, k += 4) {
        const nz = aboutY ? -sign * N[k] * s + N[k + 2] * c : -sign * N[k + 1] * s + N[k + 2] * c;
        if (nz >= lim) continue;
        const zt = Math.max(zOf(soup[t], soup[t + 1], soup[t + 2]), zOf(soup[t + 3], soup[t + 4], soup[t + 5]), zOf(soup[t + 6], soup[t + 7], soup[t + 8]));
        if (zt < minZ + 0.3) continue;
        area += N[k + 3];
      }
      const r = { tilt: deg, toward, area };
      results.push(r);
      if (!best || area < best.area - 1e-6 || (Math.abs(area - best.area) <= 1e-6 && Math.abs(deg - prefer) < Math.abs(best.tilt - prefer))) best = r;
    }
  }
  return { ...best, results };
}

// A coarse copy for previews: vertex clustering on a grid. Not watertight and
// not meant to be: it is for looking at while dragging a slider.
export function decimateSoup(soup, cells = 40) {
  const b = boundsOf(soup);
  const cell = Math.max(...b.size) / cells || 1;
  const snap = (v, k) => (Math.floor((v - b.min[k]) / cell) + 0.5) * cell + b.min[k];
  const out = [];
  const seen = new Set();
  for (let t = 0; t < soup.length; t += 9) {
    const p = [];
    const keys = [];
    for (let k = 0; k < 9; k += 3) {
      const x = snap(soup[t + k], 0), y = snap(soup[t + k + 1], 1), z = snap(soup[t + k + 2], 2);
      p.push(x, y, z);
      keys.push(`${x},${y},${z}`);
    }
    if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) continue;
    const id = [...keys].sort().join("|");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(...p);
  }
  return new Float32Array(out);
}

export function boundsOfSoup(soup) { return boundsOf(soup); }

// --------------------------------------------------------------------- main

/**
 * Fill a part with graded bubbles.
 * @param soup  Float32Array triangle soup (9 floats per triangle), Z up as printed
 * @param opts  see FIZZ_DEFAULTS, plus `fins: { side, count } | null`
 * @returns { part, fins, stats, bubbles } where part / fins are triangle soups
 */
export async function fizzcore(soup, opts = {}, { onProgress, wasm } = {}) {
  const opt = { ...FIZZ_DEFAULTS, ...opts };
  wasm ??= await loadManifold();
  const tick = async (p, msg) => { onProgress?.(p, msg); await new Promise((r) => setTimeout(r, 0)); };
  const t0 = Date.now();

  await tick(0.02, "Reading the part");
  if (opt.orient) soup = orientSoup(soup, opt.orient);
  if (opt.tilt) soup = tiltSoup(soup, opt.tilt, opt.tiltToward ?? "-x");
  const solid = soupToManifold(wasm, soup);
  const bounds = boundsOf(soup);
  const autoMax = !(opt.maxBubble > 0);
  if (autoMax) {
    // Wide (hybrid) webs need bigger bubbles, or the webs are all there is.
    // A first guess from the bounding box; refined below from how thick the
    // part's walls really are.
    const roomy = Math.min(Math.min(...bounds.size) / 3, opt.web * 2.5);
    opt.maxBubble = Math.max(autoMaxBubble(bounds.size), Math.round(roomy * 10) / 10);
  }
  opt.minBubble = Math.max(0.3, Math.min(opt.minBubble, opt.maxBubble));

  // Voxel size: fine enough to resolve the smallest bubble and the skin, capped
  // so a big part stays a few million cells.
  const pad = 2;
  const vol = bounds.size.reduce((a, b) => a * Math.max(b, 0.1), 1);
  // Fine enough that the skin margin (half a voxel) doesn't eat a thin wall:
  // on a Benchy, 0.72 mm voxels left half the bubbles unplaced.
  let h = opt.resolution > 0 ? opt.resolution
    : Math.min(opt.minBubble * 0.4, Math.max(...bounds.size) / 80);
  h = Math.max(h, Math.cbrt(vol / 5e6), 0.05);
  const grid = {
    h,
    o: bounds.min.map((v) => v - pad * h),
    nx: Math.ceil(bounds.size[0] / h) + 2 * pad,
    ny: Math.ceil(bounds.size[1] / h) + 2 * pad,
    nz: Math.ceil(bounds.size[2] / h) + 2 * pad,
  };

  await tick(0.08, `Measuring the inside (${grid.nx}×${grid.ny}×${grid.nz} voxels)`);
  const inside = voxelise(soup, grid);
  await tick(0.2, "Measuring wall thickness");
  const D = distanceField(inside, grid);
  const sample = sampler(D, grid);

  // AUTO LARGEST BUBBLE, FROM THE WALLS. The bounding box says nothing about
  // how thick a part is: a 60 mm Benchy got 15.6 mm bubbles planned for walls
  // a few mm deep, and the grading then held nearly every bubble at minimum
  // size. The thickest point of the part is right here in the distance field,
  // so size the biggest bubble to fit the thickest wall.
  if (autoMax) {
    let deepest = 0;
    for (let i = 0; i < D.length; i++) if (D[i] > deepest) deepest = D[i];
    const fit = Math.max(opt.minBubble, (deepest - opt.skin) * 0.9);
    opt.maxBubble = Math.round(Math.max(opt.minBubble, Math.min(opt.maxBubble, fit)) * 10) / 10;
  }

  await tick(0.3, "Packing bubbles");
  const { bubbles, capped, coreVolume } = opt.bubbles === false
    ? { bubbles: [], capped: false, coreVolume: 0 }
    : pack(D, grid, sample, opt, onProgress);

  await tick(0.78, `Cutting ${bubbles.length} bubbles`);
  const tpl = bubbleTemplates(wasm, opt.teardrop);
  const voids = bubbles.map(([x, y, z, r]) => tpl(r).scale(r).translate([x, y, z]));
  const result = voids.length ? solid.subtract(wasm.Manifold.compose(voids)) : solid;

  let finSolids = [], finPlan = [];
  if (opt.fins) {
    await tick(0.9, "Adding support fins");
    const side = !opt.fins.side || opt.fins.side === "auto"
      ? tipSide(soup, opt.tiltToward ?? "-x") : opt.fins.side;
    ({ fins: finSolids, plan: finPlan } = finsFor(wasm, soup, bounds, { lean: "auto", ...opt.fins, side, solid }));
  }

  await tick(0.96, "Packing up the mesh");
  const before = solid.volume(), after = result.volume();
  const finVol = finSolids.reduce((a, f) => a + f.volume(), 0);
  const radii = bubbles.map((b) => b[3]);
  const stats = {
    bubbles: bubbles.length,
    capped,
    volumeBefore: before,
    volumeAfter: after,
    saved: before > 0 ? 1 - after / before : 0,
    // plastic left in the core / the core's volume, like a slicer's infill %
    infillEquivalent: coreVolume > 0 ? Math.max(0, Math.min(1, 1 - (before - after) / coreVolume)) : 1,
    gramsBefore: (before / 1000) * opt.density,
    gramsAfter: (after / 1000) * opt.density,
    gramsFins: (finVol / 1000) * opt.density,
    smallest: radii.length ? Math.min(...radii) : 0,
    largest: radii.length ? Math.max(...radii) : 0,
    maxBubble: opt.maxBubble,
    voxel: h,
    triangles: 0,
    fins: finPlan,
    ms: 0,
  };
  const part = manifoldToSoup(result);
  const fins = finSolids.length ? manifoldToSoup(wasm.Manifold.compose(finSolids)) : null;
  stats.triangles = part.length / 9 + (fins ? fins.length / 9 : 0);
  // undersides the fins do not fix: what still prints on air at this tilt
  const oh = overhangs(soup);
  stats.overhangArea = oh.area;
  stats.overhangTris = oh.tris;
  stats.ms = Date.now() - t0;
  await tick(1, "Done");
  // `tilted`: the part as printed, before bubbles, for drawing its overhangs
  return { part, fins, stats, bubbles, bounds, tilted: soup };
}

// ------------------------------------------------------------------ export

export function soupToBinaryStl(soups, name = "fizzcore") {
  const list = soups.filter(Boolean);
  const n = list.reduce((a, s) => a + s.length / 9, 0);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = `BREPcode FizzCore ${name}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, n, true);
  let off = 84;
  for (const s of list) {
    for (let t = 0; t < s.length; t += 9) {
      const ux = s[t + 3] - s[t], uy = s[t + 4] - s[t + 1], uz = s[t + 5] - s[t + 2];
      const vx = s[t + 6] - s[t], vy = s[t + 7] - s[t + 1], vz = s[t + 8] - s[t + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(off, nx / l, true); dv.setFloat32(off + 4, ny / l, true); dv.setFloat32(off + 8, nz / l, true);
      for (let k = 0; k < 9; k++) dv.setFloat32(off + 12 + k * 4, s[t + k], true);
      off += 50;
    }
  }
  return new Uint8Array(buf);
}
