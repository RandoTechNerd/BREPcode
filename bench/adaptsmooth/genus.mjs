// holes (genus) per connected component: of the input mesh and of cages at a few sizes
import { loadSTL, cage } from "./lib.mjs";
export function topology(nv, faces, k) {          // faces: flat index array, k verts each
  const parent = Int32Array.from({ length: nv }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const E = new Map(); const used = new Uint8Array(nv);
  for (let f = 0; f < faces.length; f += k) for (let i = 0; i < k; i++) {
    const a = faces[f + i], b = faces[f + (i + 1) % k]; used[a] = used[b] = 1;
    const key = a < b ? a * nv + b : b * nv + a; E.set(key, (E.get(key) || 0) + 1);
    parent[find(a)] = find(b);
  }
  const comps = new Map();
  const C = (v) => { const r = find(v); let c = comps.get(r); if (!c) comps.set(r, c = { V: 0, E: 0, F: 0, open: 0 }); return c; };
  for (let v = 0; v < nv; v++) if (used[v]) C(v).V++;
  for (const [key, n] of E) { const c = C(Math.floor(key / nv)); c.E++; if (n !== 2) c.open++; }
  for (let f = 0; f < faces.length; f += k) C(faces[f]).F++;
  return [...comps.values()].filter((c) => c.F > 10).map((c) => ({ faces: c.F, genus: (2 - (c.V - c.E + c.F)) / 2, badEdges: c.open }));
}
if (process.argv[1].endsWith("genus.mjs")) {
  const { stl, mesh } = loadSTL(process.argv[2]);
  console.log("mesh", JSON.stringify(topology(mesh.verts.length / 3, mesh.tris, 3)));
  for (const s of process.argv.slice(3).map(Number)) {
    const c = await cage(stl, s, 1, process.argv[2]);
    console.log(s, c.quads.length / 4, "quads", c.ms, "ms", JSON.stringify(topology(c.verts.length / 3, c.quads, 4)));
  }
  process.exit(0);
}

// genus of the shell the STEP will hold: quads plus odd-hole fills, with split rim edges as two
export function shellGenus(model) {
  const { faces, fills, splits, topo } = model;
  const polys = [];
  const side = (a, b) => { const s = a < topo.nv && b < topo.nv ? splits.get(topo.edgeKey(a, b)) : null; return s ? [a, s.mid] : [a]; };
  for (const f of faces) polys.push(f.c.flatMap((a, k) => side(a, f.c[(k + 1) & 3])));
  for (const fl of fills) polys.push(fl.sides.flatMap(({ a, b }) => side(a, b)));
  const V = new Set(), E = new Map();
  for (const p of polys) p.forEach((a, i) => { const b = p[(i + 1) % p.length]; V.add(a); const k = a < b ? `${a},${b}` : `${b},${a}`; E.set(k, (E.get(k) || 0) + 1); });
  const bad = [...E.values()].filter((n) => n !== 2).length;
  return { genus: (2 - (V.size - E.size + polys.length)) / 2, badEdges: bad, faces: polys.length };
}
