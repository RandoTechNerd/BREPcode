// Making a broken mesh into one the kernel will sew.
//
// The faults meshhealth.js names, in the order that actually works:
//
//   1. drop zero-area and duplicate faces      — noise that confuses everything after
//   2. make the winding consistent             — neighbours must disagree about direction
//   3. flip the whole thing if it is inside-out — consistent but backwards is still wrong
//   4. fill the holes                          — needs the winding settled first, or the
//                                                patches face the wrong way
//
// Order matters more than any individual step. Filling holes before fixing
// winding produces patches oriented against their neighbours, which turns one
// fault into two.
//
// What this does NOT attempt: edges shared by more than two faces. That is
// geometry meeting along a seam — two shells fused, or a surface folded onto
// itself — and there is no repair that does not first decide which of the
// surfaces the author meant to keep. Guessing produces a mesh that passes the
// check and is the wrong shape, which is worse than being told it cannot be
// fixed automatically.

const key = (u, v) => (u < v ? `${u}_${v}` : `${v}_${u}`);

function faceAdjacency(faces) {
  const edgeFaces = new Map();
  faces.forEach((f, fi) => {
    const [a, b, c] = f;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = key(u, v);
      const bucket = edgeFaces.get(k);
      if (bucket) bucket.push(fi); else edgeFaces.set(k, [fi]);
    }
  });
  return edgeFaces;
}

// Does this face traverse u->v (rather than v->u)?
function traverses(f, u, v) {
  const [a, b, c] = f;
  return (a === u && b === v) || (b === u && c === v) || (c === u && a === v);
}

// Walk the mesh face to face, flipping any neighbour that agrees with its
// neighbour's direction along the shared edge. Two faces sharing an edge in a
// consistently-wound surface always traverse it in OPPOSITE directions.
function makeWindingConsistent(faces) {
  const out = faces.map((f) => f.slice());
  const edgeFaces = faceAdjacency(out);
  const seen = new Uint8Array(out.length);
  let flipped = 0;
  const components = [];

  for (let start = 0; start < out.length; start++) {
    if (seen[start]) continue;
    const component = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const fi = stack.pop();
      component.push(fi);
      const [a, b, c] = out[fi];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        for (const nb of edgeFaces.get(key(u, v)) || []) {
          if (nb === fi || seen[nb]) continue;
          // Same direction as us along the shared edge means it is reversed.
          if (traverses(out[nb], u, v)) {
            const g = out[nb];
            out[nb] = [g[0], g[2], g[1]];
            flipped++;
          }
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
    components.push(component);
  }
  return { faces: out, flipped, components };
}

function signedVolume(points, faces, subset) {
  let v = 0;
  for (const fi of subset) {
    const [ia, ib, ic] = faces[fi];
    const A = points[ia], B = points[ib], C = points[ic];
    v += (A[0] * (B[1] * C[2] - B[2] * C[1])
      - A[1] * (B[0] * C[2] - B[2] * C[0])
      + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
  }
  return v;
}

// Boundary loops: the chains of edges used by exactly one face. Each is the rim
// of a hole, and the direction comes from the face that owns it, so a patch has
// to run the other way.
function boundaryLoops(faces) {
  const count = new Map();
  const directed = [];
  for (const f of faces) {
    const [a, b, c] = f;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      count.set(key(u, v), (count.get(key(u, v)) || 0) + 1);
      directed.push([u, v]);
    }
  }
  const nextFrom = new Map();
  for (const [u, v] of directed) {
    if (count.get(key(u, v)) !== 1) continue;
    const bucket = nextFrom.get(u);
    if (bucket) bucket.push(v); else nextFrom.set(u, [v]);
  }

  const loops = [];
  const used = new Set();
  for (const [start, firsts] of nextFrom) {
    for (const first of firsts) {
      if (used.has(`${start}_${first}`)) continue;
      const loop = [start];
      let u = start, v = first;
      // A vertex can sit on two different holes, so the walk is bounded by the
      // edge count rather than trusted to close.
      for (let guard = 0; guard < directed.length + 4; guard++) {
        used.add(`${u}_${v}`);
        if (v === start) break;
        loop.push(v);
        const opts = (nextFrom.get(v) || []).filter((w) => !used.has(`${v}_${w}`));
        if (!opts.length) break;
        u = v; v = opts[0];
      }
      if (loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

// Close each rim with a fan from its own centroid. A fan from one of the rim's
// own vertices collapses on a non-planar hole — and holes in a real scan or a
// badly exported STL are rarely flat — while a centroid gives every rim edge a
// triangle with area.
function fillHoles(points, faces) {
  const loops = boundaryLoops(faces);
  if (!loops.length) return { points, faces, filled: 0, patches: 0 };
  const pts = points.map((p) => p.slice());
  const out = faces.map((f) => f.slice());
  let patches = 0;
  for (const loop of loops) {
    const c = [0, 0, 0];
    for (const i of loop) { c[0] += pts[i][0]; c[1] += pts[i][1]; c[2] += pts[i][2]; }
    c[0] /= loop.length; c[1] /= loop.length; c[2] /= loop.length;
    const ci = pts.length;
    pts.push(c);
    for (let i = 0; i < loop.length; i++) {
      const u = loop[i], v = loop[(i + 1) % loop.length];
      // The rim edge runs u->v on the existing face, so the patch runs v->u.
      out.push([ci, v, u]);
      patches++;
    }
  }
  return { points: pts, faces: out, filled: loops.length, patches };
}

export function repairMesh({ points, faces }) {
  const report = {
    degenerateRemoved: 0, duplicatesRemoved: 0,
    facesReoriented: 0, shellsFlipped: 0,
    holesFilled: 0, patchTriangles: 0,
    unrepairable: null,
  };

  // 1. noise
  const seen = new Set();
  let clean = [];
  for (const f of faces) {
    const [a, b, c] = f;
    if (a === b || b === c || a === c) { report.degenerateRemoved++; continue; }
    const k = [a, b, c].slice().sort((x, y) => x - y).join("_");
    if (seen.has(k)) { report.duplicatesRemoved++; continue; }
    seen.add(k);
    clean.push(f.slice());
  }

  // An edge shared by three or more faces survives every step below and still
  // fails the check, so say so rather than let it look repaired.
  const shared = new Map();
  for (const [a, b, c] of clean) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      shared.set(key(u, v), (shared.get(key(u, v)) || 0) + 1);
    }
  }
  let overused = 0;
  for (const n of shared.values()) if (n > 2) overused++;
  if (overused) {
    report.unrepairable = `${overused} edge${overused === 1 ? "" : "s"} shared by more than two `
      + "faces — two surfaces meet there, and which one to keep is not something this can guess";
  }

  // 2. winding
  const wound = makeWindingConsistent(clean);
  report.facesReoriented = wound.flipped;
  clean = wound.faces;

  // 3. inside-out shells. Consistent but inverted is still wrong, and it is the
  // fault that looks fine on screen right up until the slicer prints the
  // negative of the part.
  for (const component of wound.components) {
    if (signedVolume(points, clean, component) < 0) {
      for (const fi of component) {
        const g = clean[fi];
        clean[fi] = [g[0], g[2], g[1]];
      }
      report.shellsFlipped++;
    }
  }

  // 4. holes
  const filled = fillHoles(points, clean);
  report.holesFilled = filled.filled;
  report.patchTriangles = filled.patches;

  return { points: filled.points, faces: filled.faces, report };
}

// A repaired mesh has to get back into the app, and the app imports files. A
// binary STL is the one format every path here already reads.
export function toBinaryStl({ points, faces }, { name = "repaired" } = {}) {
  const buf = new ArrayBuffer(84 + faces.length * 50);
  const dv = new DataView(buf);
  const header = `BREPcode repaired ${name}`.slice(0, 79);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, faces.length, true);
  faces.forEach(([ia, ib, ic], i) => {
    const A = points[ia], B = points[ib], C = points[ic];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const o = 84 + i * 50;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    [A, B, C].forEach((p, j) => {
      dv.setFloat32(o + 12 + j * 12, p[0], true);
      dv.setFloat32(o + 16 + j * 12, p[1], true);
      dv.setFloat32(o + 20 + j * 12, p[2], true);
    });
  });
  return buf;
}

// What changed, in one line, for someone deciding whether to trust it.
export function repairSummary(report) {
  const bits = [];
  if (report.holesFilled) {
    bits.push(`filled ${report.holesFilled} hole${report.holesFilled === 1 ? "" : "s"}`
      + ` with ${report.patchTriangles} triangle${report.patchTriangles === 1 ? "" : "s"}`);
  }
  if (report.facesReoriented) bits.push(`re-oriented ${report.facesReoriented} face${report.facesReoriented === 1 ? "" : "s"}`);
  if (report.shellsFlipped) bits.push(`turned ${report.shellsFlipped} inside-out shell${report.shellsFlipped === 1 ? "" : "s"} the right way`);
  if (report.duplicatesRemoved) bits.push(`removed ${report.duplicatesRemoved} duplicate face${report.duplicatesRemoved === 1 ? "" : "s"}`);
  if (report.degenerateRemoved) bits.push(`dropped ${report.degenerateRemoved} zero-area face${report.degenerateRemoved === 1 ? "" : "s"}`);
  if (!bits.length) return "nothing needed changing";
  return bits.join(", ");
}
