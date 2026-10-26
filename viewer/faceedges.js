// faceedges.js — the edges around a picked face, by kernel name.
//
// fillet() and chamfer() take edges as "FACEA|FACEB[i]": the two faces that
// meet there, sorted, and which of their shared edges it is. Every kernel uses
// that form (JS, Rust, NVIDIA SMLib through the Rust dialect). A build on this
// thread still has the kernel's EDGE objects and can just read the names; a
// build from the worker arrives as face buffers only. Both get the same answer
// here: two faces that share a boundary run of vertices meet at an edge, and
// the name follows from theirs.
//
// faces: [{ name, positions, index?, matrix? }]   (world space after matrix)
// Returns [{ name, faces: [a, b], segments: [[p, q], ...] }] for faceName.
// When the two faces share more than one separate run (a slot's two ends),
// they are numbered [0], [1]... in order of their lowest point; the kernel's
// own numbering may differ, which only matters for a model that picks one of
// several twin edges by index.

const KEY_TOL = 1e-4;

function keyOf(x, y, z, q) {
  return `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
}

function worldPositions(f) {
  const p = f.positions;
  if (!f.matrix) return p;
  const m = f.matrix, out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    out[i] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out[i + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out[i + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  }
  return out;
}

// Vertex keys of one face, and its boundary edges (used by one triangle only).
function faceTopo(f, q) {
  const pos = worldPositions(f);
  const n = pos.length / 3;
  const keys = new Array(n);
  const pts = new Map();
  for (let i = 0; i < n; i++) {
    const k = keyOf(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], q);
    keys[i] = k;
    if (!pts.has(k)) pts.set(k, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
  }
  const idx = f.index || Array.from({ length: n }, (_, i) => i);
  const count = new Map();
  for (let t = 0; t + 2 < idx.length; t += 3) {
    for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
      const ka = keys[a], kb = keys[b];
      if (ka === kb) continue;
      const e = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      count.set(e, (count.get(e) || 0) + 1);
    }
  }
  const boundary = [];
  for (const [e, c] of count) if (c === 1) boundary.push(e.split("|"));
  return { keys: new Set(keys), boundary, pts };
}

export function faceEdges(faces, faceName, { tol = KEY_TOL } = {}) {
  const me = faces.find((f) => f.name === faceName);
  if (!me) return [];
  const q = Math.max(tol, 1e-9);
  const mine = faceTopo(me, q);
  const out = [];
  for (const other of faces) {
    if (other === me || !other.name || other.name === faceName) continue;
    const theirs = faceTopo(other, q);
    const shared = mine.boundary.filter(([a, b]) => theirs.keys.has(a) && theirs.keys.has(b));
    if (!shared.length) continue;
    // separate runs = connected components of the shared segments
    const parent = new Map();
    const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
    for (const [a, b] of shared) {
      if (!parent.has(a)) parent.set(a, a);
      if (!parent.has(b)) parent.set(b, b);
      parent.set(find(a), find(b));
    }
    const runs = new Map();
    for (const seg of shared) {
      const r = find(seg[0]);
      if (!runs.has(r)) runs.set(r, []);
      runs.get(r).push(seg);
    }
    const lowest = (segs) => Math.min(...segs.flat().map((k) => {
      const p = mine.pts.get(k);
      return p[2] * 1e6 + p[1] * 1e3 + p[0];
    }));
    const ordered = [...runs.values()].sort((a, b) => lowest(a) - lowest(b));
    const pair = [faceName, other.name].sort();
    ordered.forEach((segs, i) => {
      out.push({
        name: `${pair[0]}|${pair[1]}[${i}]`,
        faces: pair,
        segments: segs.map(([a, b]) => [mine.pts.get(a), mine.pts.get(b)]),
      });
    });
  }
  return out;
}
