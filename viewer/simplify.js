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

  return objects.map((o) => {
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
}
