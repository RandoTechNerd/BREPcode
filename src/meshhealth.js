// What is actually wrong with an imported mesh, and what it will cost to turn
// it into something the kernel can work with.
//
// These are two different questions and they get confused constantly. A model
// that "won't fillet" is usually assumed to be broken; far more often it is
// perfectly sound and merely enormous. The real 3DBenchy is the example: zero
// open edges, zero non-manifold junctions, zero winding clashes, zero duplicate
// faces — genuinely watertight — and still unusable for a boolean, because it
// is 225,154 separate facets and the kernel has to sew every one of them into a
// real face before it can cut anything.
//
// So the app should say which it is, rather than offering to "repair" a mesh
// with nothing to repair.

// A mesh is watertight when every edge is shared by exactly two triangles that
// traverse it in opposite directions. Each way that can fail is reported
// separately, because each one means something different to whoever has to fix
// it: a hole is missing geometry, an over-used edge is two surfaces meeting
// along a seam, and a winding clash is a face that was flipped.
export function inspectMesh({ points, faces }) {
  const undirected = new Map();
  const directed = new Map();
  let degenerate = 0;
  const kept = [];

  for (const f of faces) {
    const [a, b, c] = f;
    if (a === b || b === c || a === c) { degenerate++; continue; }
    kept.push(f);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      undirected.set(k, (undirected.get(k) || 0) + 1);
      const d = `${u}_${v}`;
      directed.set(d, (directed.get(d) || 0) + 1);
    }
  }

  let openEdges = 0, overusedEdges = 0;
  for (const count of undirected.values()) {
    if (count === 1) openEdges++;
    else if (count > 2) overusedEdges++;
  }
  // The same edge traversed the same way by two faces means one of them is
  // wound backwards relative to its neighbour.
  let windingClashes = 0;
  for (const count of directed.values()) if (count > 1) windingClashes++;

  const seen = new Set();
  let duplicateFaces = 0;
  for (const f of kept) {
    const k = [...f].sort((x, y) => x - y).join("_");
    if (seen.has(k)) duplicateFaces++; else seen.add(k);
  }

  const V = points.length, F = kept.length, E = undirected.size;
  const chi = V - E + F;
  return {
    triangles: F, vertices: V, edges: E,
    openEdges, overusedEdges, windingClashes, duplicateFaces, degenerate,
    watertight: openEdges === 0 && overusedEdges === 0 && windingClashes === 0,
    chi,
    // Only meaningful for a closed surface; a hollow Benchy really is genus 5.
    genus: openEdges === 0 && overusedEdges === 0 ? (2 - chi) / 2 : null,
  };
}

// Weld a raw triangle soup — 9 numbers per triangle, the shape every STL
// reader produces — into indexed geometry. Without the weld every triangle has
// its own three vertices and NOTHING shares an edge, so the mesh would be
// reported as one big hole.
export function weldTriangles(coords, { places = 4 } = {}) {
  const points = [];
  const faces = [];
  const index = new Map();
  const id = (x, y, z) => {
    const k = `${x.toFixed(places)},${y.toFixed(places)},${z.toFixed(places)}`;
    let i = index.get(k);
    if (i === undefined) { i = points.length; points.push([x, y, z]); index.set(k, i); }
    return i;
  };
  for (let o = 0; o + 8 < coords.length; o += 9) {
    faces.push([
      id(coords[o], coords[o + 1], coords[o + 2]),
      id(coords[o + 3], coords[o + 4], coords[o + 5]),
      id(coords[o + 6], coords[o + 7], coords[o + 8]),
    ]);
  }
  return { points, faces };
}

// Binary STL straight to a verdict, without building a THREE geometry first.
export function inspectBinaryStl(buffer) {
  const dv = new DataView(buffer.buffer ?? buffer, buffer.byteOffset ?? 0, buffer.byteLength);
  if (dv.byteLength < 84) return null;
  const n = dv.getUint32(80, true);
  if (!n || 84 + n * 50 > dv.byteLength) return null;     // not binary, or truncated
  const coords = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;                            // skip the normal
    for (let k = 0; k < 9; k++) coords[i * 9 + k] = dv.getFloat32(o + k * 4, true);
  }
  return inspectMesh(weldTriangles(coords));
}

// Deliberately NO time estimator here. The viewer already has one —
// buildEstimate() — tuned as a worst case rather than a best fit, which is the
// right shape for a number attached to a button someone is about to press. A
// second, tighter estimate sitting beside it would only give the app two
// answers to the same question.

// The single line shown on import. Leads with the verdict, because that is the
// thing being asked.
export function healthSummary(stats) {
  if (!stats) return "";
  const tris = stats.triangles.toLocaleString("en-US");
  if (stats.watertight) return `${tris} triangles · watertight · nothing to repair`;
  const faults = [];
  if (stats.openEdges) faults.push(`${stats.openEdges.toLocaleString("en-US")} open edge${stats.openEdges === 1 ? "" : "s"}`);
  if (stats.overusedEdges) faults.push(`${stats.overusedEdges} edge${stats.overusedEdges === 1 ? "" : "s"} shared by more than two faces`);
  if (stats.windingClashes) faults.push(`${stats.windingClashes} flipped face${stats.windingClashes === 1 ? "" : "s"}`);
  return `${tris} triangles · ${faults.join(", ")}`;
}
