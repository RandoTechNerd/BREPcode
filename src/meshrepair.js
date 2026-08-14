import { weldTriangles, inspectMesh, meshFromBinaryStl } from "./meshhealth.js";

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
// Edges shared by more than two faces get their own step, between the two,
// because they are what a SIMPLIFIER leaves behind and a simplified mesh is
// the main thing arriving here broken. Measured on a real 3DBenchy: the
// original is flawless — no open edges, no over-used edges, no winding clashes
// — and every reduction meshoptimizer produces has a handful of over-used
// edges, at 50,000 triangles as much as at 2,000. The kernel then sews it into
// something it calls a solid but will not subtract from, so difference() keeps
// the cutter as a second body and a drill appears to do nothing.
//
// The defects are few — one to seven edges out of thousands — so the repair is
// to delete the offending faces and patch the hole that leaves. Which face to
// delete is a judgement, and the one taken here is: the face taking part in
// the most over-used edges, breaking ties by smallest area, since a spurious
// sliver is both the likeliest artefact and the least missed. That is a
// heuristic and it is allowed to be, because the alternative is refusing to
// repair the single most common way a mesh arrives broken.

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

function triArea(points, [ia, ib, ic]) {
  const A = points[ia], B = points[ib], C = points[ic];
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return Math.hypot(n[0], n[1], n[2]) / 2;
}

// Delete faces until no edge is shared by more than two of them.
//
// Greedy and therefore terminating: every pass removes at least one face, and
// there are finitely many. The holes this opens are filled by the later step,
// which is why this has to run before it.
function resolveOverusedEdges(points, faces) {
  let out = faces.map((f) => f.slice());
  let removed = 0;
  for (let guard = 0; guard < out.length; guard++) {
    const edgeFaces = new Map();
    for (let fi = 0; fi < out.length; fi++) {
      const [a, b, c] = out[fi];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = key(u, v);
        const bucket = edgeFaces.get(k);
        if (bucket) bucket.push(fi); else edgeFaces.set(k, [fi]);
      }
    }
    // How many over-used edges each face is implicated in.
    const blame = new Map();
    for (const owners of edgeFaces.values()) {
      if (owners.length <= 2) continue;
      for (const fi of owners) blame.set(fi, (blame.get(fi) || 0) + 1);
    }
    if (!blame.size) break;

    // Which face to drop, and this is the part that has to be right rather
    // than merely decisive. Smallest-area alone gets it exactly backwards: a
    // stray fin welded to a cube is LARGER than the cube's own triangles, so
    // area picks a wall of the cube, and patching that hole with a centroid fan
    // cuts the corner off — measured, an 8000mm3 cube came back as 6333.
    //
    // A fin is recognisable by being attached along one edge and free along its
    // others, so the signal is BOUNDARY edges: the more of a face's edges
    // belong to nobody else, the more it is a flap rather than part of the
    // surface. Blame and area only break ties after that.
    let worst = -1, worstFree = -1, worstBlame = -1, worstArea = Infinity;
    for (const [fi, n] of blame) {
      const [a, b, c] = out[fi];
      let free = 0;
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        if ((edgeFaces.get(key(u, v)) || []).length === 1) free++;
      }
      const area = triArea(points, out[fi]);
      const better = free > worstFree
        || (free === worstFree && n > worstBlame)
        || (free === worstFree && n === worstBlame && area < worstArea);
      if (better) { worst = fi; worstFree = free; worstBlame = n; worstArea = area; }
    }
    if (worst < 0) break;
    out = out.filter((_, i) => i !== worst);
    removed++;
  }
  return { faces: out, removed };
}

export function repairMesh({ points, faces }) {
  const report = {
    degenerateRemoved: 0, duplicatesRemoved: 0,
    facesReoriented: 0, shellsFlipped: 0, facesRemovedAtJunctions: 0,
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

  // 2. edges owned by three or more faces. Before the winding pass, because a
  // non-manifold junction has no consistent orientation to find — the walk
  // arrives at the same face from two surfaces and flips it back and forth.
  const un = resolveOverusedEdges(points, clean);
  report.facesRemovedAtJunctions = un.removed;
  clean = un.faces;

  // 3. winding
  const wound = makeWindingConsistent(clean);
  report.facesReoriented = wound.flipped;
  clean = wound.faces;

  // 4. holes — including any opened by step 2
  const filled = fillHoles(points, clean);
  report.holesFilled = filled.filled;
  report.patchTriangles = filled.patches;
  const pts = filled.points;
  clean = filled.faces;

  // 5. inside-out shells, LAST: the sign of a volume is meaningless while the
  // surface still has holes in it, so this has to follow the filling.
  const finalWind = makeWindingConsistent(clean);
  report.facesReoriented += finalWind.flipped;
  clean = finalWind.faces;
  for (const component of finalWind.components) {
    if (signedVolume(pts, clean, component) < 0) {
      for (const fi of component) {
        const g = clean[fi];
        clean[fi] = [g[0], g[2], g[1]];
      }
      report.shellsFlipped++;
    }
  }

  // Only now is it honest to say whether anything is left. Reporting up front
  // claimed defeat on faults that the steps above go on to fix.
  const left = new Map();
  for (const [a, b, c] of clean) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      left.set(key(u, v), (left.get(key(u, v)) || 0) + 1);
    }
  }
  let stillOverused = 0, stillOpen = 0;
  for (const n of left.values()) { if (n > 2) stillOverused++; else if (n === 1) stillOpen++; }
  if (stillOverused || stillOpen) {
    const bits = [];
    if (stillOverused) bits.push(`${stillOverused} edge${stillOverused === 1 ? "" : "s"} still shared by more than two faces`);
    if (stillOpen) bits.push(`${stillOpen} edge${stillOpen === 1 ? "" : "s"} still open`);
    report.unrepairable = `${bits.join(" and ")} — this one needs a dedicated repair tool`;
  }

  return { points: pts, faces: clean, report };
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
  if (report.facesRemovedAtJunctions) bits.push(`removed ${report.facesRemovedAtJunctions} face${report.facesRemovedAtJunctions === 1 ? "" : "s"} at non-manifold junctions`);
  if (report.duplicatesRemoved) bits.push(`removed ${report.duplicatesRemoved} duplicate face${report.duplicatesRemoved === 1 ? "" : "s"}`);
  if (report.degenerateRemoved) bits.push(`dropped ${report.degenerateRemoved} zero-area face${report.degenerateRemoved === 1 ? "" : "s"}`);
  if (!bits.length) return "nothing needed changing";
  return bits.join(", ");
}

// ---- repairing what the app actually passes around ----------------------
//
// Everything upstream of the kernel here speaks ASCII STL text: the importer
// normalises every format to it, because that is what makes transforms
// bake-able later. So the useful entry point is text in, text out — otherwise
// repair stays a thing you can only reach through a button, which is exactly
// how a mesh with 68 open edges and 508 zero-area faces got all the way to a
// boolean and took an afternoon with it.

export function meshFromAsciiStl(text) {
  const out = [];
  const re = /vertex\s+(-?[\d.]+(?:[eE][-+]?\d+)?)\s+(-?[\d.]+(?:[eE][-+]?\d+)?)\s+(-?[\d.]+(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(text))) { out.push(+m[1], +m[2], +m[3]); }
  const coords = new Float64Array(out.length - (out.length % 9));
  for (let i = 0; i < coords.length; i++) coords[i] = out[i];
  return weldTriangles(coords);
}

export function toAsciiStl({ points, faces }, name = "repaired") {
  const s = [`solid ${name}`];
  for (const [a, b, c] of faces) {
    const p = points[a], q = points[b], r = points[c];
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    s.push(`facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}`);
    s.push("outer loop");
    for (const v of [p, q, r]) s.push(`vertex ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`);
    s.push("endloop");
    s.push("endfacet");
  }
  s.push(`endsolid ${name}`);
  return s.join("\n");
}

// Repair only if there is something to repair.
//
// A sound mesh must come back BYTE-IDENTICAL — rewriting a good file costs
// precision for nothing, and the overwhelming majority of imports are sound.
// The Benchy is the case to keep in mind: watertight, and still 225k facets
// the kernel has to sew. Repair is not the answer to "slow", only to "broken".
export function repairStlText(text, name = "repaired") {
  const mesh = meshFromAsciiStl(text);
  const before = inspectMesh(mesh);
  const needed = !before.watertight || before.degenerate > 0
    || before.duplicateFaces > 0 || before.windingClashes > 0;
  if (!needed) return { text, changed: false, before, after: before, report: null };
  const fixed = repairMesh(mesh);
  return {
    text: toAsciiStl(fixed, name),
    changed: true,
    before,
    after: inspectMesh(fixed),
    report: fixed.report,
  };
}

// Binary STL in, repaired ASCII STL out — or null when nothing was wrong.
//
// This is the one that matters for imports. The kernel's own reader refuses a
// non-manifold mesh outright ("Not manifold"), so a file with holes never
// reaches any of the app's later stages to be repaired there: it is rejected
// at the door and the user is handed a button. Running this FIRST means the
// kernel is only ever shown a mesh it can accept.
//
// Returning ASCII is deliberate — the importer normalises everything to ASCII
// anyway, so a repaired file skips that round trip through the kernel too.
export function repairBinaryStl(bytes, name = "repaired") {
  const mesh = meshFromBinaryStl(bytes);
  if (!mesh) return null;                       // not a binary STL
  const before = inspectMesh(mesh);
  const needed = !before.watertight || before.degenerate > 0
    || before.duplicateFaces > 0 || before.windingClashes > 0;
  if (!needed) return { text: null, changed: false, before, after: before, report: null };
  const fixed = repairMesh(mesh);
  return {
    text: toAsciiStl(fixed, name),
    changed: true,
    before,
    after: inspectMesh(fixed),
    report: fixed.report,
  };
}
