// Mesh decimation IN the app — no more "go to Blender and come back".
//
// meshoptimizer's simplifier (MIT, ~50KB of wasm inlined in the module):
// proper quadric-error edge collapse, the same algorithm slicers use for
// "Simplify model". A 225k-triangle Benchy that the kernel refuses becomes an
// ~80k one it can actually build, drill and boolean — decimated PER PART so
// colour boundaries survive.
//
// NB build-site.mjs rewrites the /node_modules path below for the static site.

let simpReady = null;

// Test hook: node can't resolve the browser path, so the suite injects the
// initialised simplifier itself (same pattern as curved.js/_setReplicad).
export function _setSimplifier(s) {
  simpReady = Promise.resolve(s);
}

const getSimp = () => (simpReady ??= import("/node_modules/meshoptimizer/meshopt_simplifier.js")
  .then(async (m) => { await m.MeshoptSimplifier.ready; return m.MeshoptSimplifier; }));

// objects: [{ positions: flat triangle soup, ...anything else }] — the shape
// the 3MF/STL parsers already produce. Returns the same shape, decimated to
// ~targetTris across ALL parts, each part keeping its proportional share so
// a tiny logo part doesn't get erased to make room for the hull.
export async function simplifyObjects(objects, targetTris = 80000) {
  const S = await getSimp();
  const total = objects.reduce((n, o) => n + o.positions.length / 9, 0);
  if (total <= targetTris) return objects;
  const ratio = targetTris / total;

  const reduced = objects.map((o) => {
    const soup = o.positions;
    const tris = soup.length / 9;
    const budget = Math.max(200, Math.round(tris * ratio));
    if (budget >= tris) return o;

    // weld the soup to an indexed mesh — the simplifier needs shared vertices
    // to know which edges it may collapse. NB (-0).toFixed() is "-0.000",
    // a DIFFERENT key from "0.000": without the normalisation, vertices on
    // the axes split in two, the simplifier sees phantom boundaries there,
    // and the output comes back full of open edges the kernel refuses.
    const fx = (x) => { const s = x.toFixed(3); return s === "-0.000" ? "0.000" : s; };
    const key2idx = new Map();
    const verts = [];
    const idx = new Uint32Array(tris * 3);
    for (let i = 0; i < soup.length; i += 3) {
      const k = `${fx(soup[i])},${fx(soup[i + 1])},${fx(soup[i + 2])}`;
      let v = key2idx.get(k);
      if (v === undefined) {
        v = verts.length / 3;
        key2idx.set(k, v);
        verts.push(soup[i], soup[i + 1], soup[i + 2]);
      }
      idx[i / 3] = v;
    }
    const pos = Float32Array.from(verts);

    // target_error 0.01 = drift capped at ~1% of the part's size. If the cap
    // bites before the budget is reached, the result stays a little bigger —
    // shape fidelity wins over an exact count.
    const [res] = S.simplify(idx, pos, 3, budget * 3, 0.01);
    if (!res?.length || res.length >= idx.length) return o;   // nothing gained

    // drop collapsed triangles (two corners on the same vertex) — the kernel's
    // manifold check refuses zero-area slivers the simplifier can leave behind
    const out = [];
    for (let t = 0; t < res.length; t += 3) {
      const a = res[t], b = res[t + 1], c = res[t + 2];
      if (a === b || b === c || a === c) continue;
      for (const v of [a * 3, b * 3, c * 3]) out.push(pos[v], pos[v + 1], pos[v + 2]);
    }
    if (!out.length) return o;
    return { ...o, positions: Float64Array.from(out) };
  });

  // Simplification breaks the mesh, every time, and nothing used to notice.
  //
  // Measured on a real 3DBenchy: the original file is flawless — no open edges,
  // no edges shared by three faces, no flipped winding. Every reduction comes
  // back with a handful of non-manifold edges, and not only the aggressive
  // ones: 5 at a target of 2,000 and still 4 at 50,000. The kernel sews that
  // into something it reports as "1 solid" and then refuses to subtract from,
  // so difference() keeps the cutter as a second body — which is why drilling a
  // simplified model appeared to do nothing at all, and why the app blamed the
  // cut for missing.
  //
  // The faults are tiny and local, so repairing them costs almost nothing and
  // changes the shape by nothing: volume drift measured at 0.000% across every
  // target. Done here rather than at the call site because every route into
  // simplification needs it.
  // Each object comes back carrying `watertight`, because the caller has to
  // know: a sound mesh must be handed to the kernel WITHOUT its repair option,
  // and a broken one with it. See the note where the code is generated.
  return await Promise.all(reduced.map(async (o, i) => {
    if (o === objects[i]) return o;                 // untouched, nothing to check
    try {
      const { weldTriangles, inspectMesh } = await import("../src/meshhealth.js");
      const mesh = weldTriangles(Float32Array.from(o.positions));
      if (inspectMesh(mesh).watertight) return { ...o, watertight: true };
      const { repairMesh } = await import("../src/meshrepair.js");
      const fixed = repairMesh(mesh);
      if (!inspectMesh(fixed).watertight) return { ...o, watertight: false };
      const flat = [];
      for (const [a, b, c] of fixed.faces) {
        for (const v of [a, b, c]) flat.push(...fixed.points[v]);
      }
      return { ...o, positions: Float64Array.from(flat), repaired: true, watertight: true };
    } catch {
      return o;             // a repair that throws must not cost the simplify
    }
  }));
}
