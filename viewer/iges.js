// IGES import. replicad's OCCT build (curved.js) carries the STEP reader but
// not IGES, so IGES goes through occt-import-js: the same OpenCascade reader,
// compiled on its own, which hands back triangles. An IGES file therefore
// opens the way an STL does (a mesh you can drill, stretch and boolean), not
// as code; STEP is still the format for "Open as code".
//
// Loaded the first time an .igs/.iges file arrives (~7 MB wasm), from the copy
// beside the app when the host ships one, else a pinned public copy. Pinned
// to an exact version so the loader and its wasm can never disagree.

const VERSION = "0.0.23";
const BASES = () => [...new Set([
  globalThis.__OCCT_IMPORT_BASE,                         // a host's own copy, if it sets one
  `https://cdn.jsdelivr.net/npm/occt-import-js@${VERSION}/dist/`,
  `https://unpkg.com/occt-import-js@${VERSION}/dist/`,
].filter(Boolean))];

let loading = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error(`could not load ${src}`)); };
    document.head.appendChild(s);
  });
}
export function loadOcctImport() {
  return loading ??= (async () => {
    let last = null;
    for (const base of BASES()) {
      try {
        if (typeof globalThis.occtimportjs !== "function") await loadScript(base + "occt-import-js.js");
        return await globalThis.occtimportjs({ locateFile: (f) => base + f });
      } catch (e) { last = e; }
    }
    loading = null;                          // let a later try (back online) start over
    throw new Error(`The IGES reader didn't load (${String(last?.message || last).slice(0, 80)}). It downloads on first use, so check the connection.`);
  })();
}

// Boundary edges of an indexed triangle list: 0 means a closed solid. An IGES
// file is often trimmed SURFACES rather than a solid, which previews fine and
// then refuses to slice; the caller says so.
export function openEdgeCount(pos, idx) {
  const key = new Map();
  const id = (i) => {
    const k = `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
    let n = key.get(k); if (n === undefined) key.set(k, n = key.size);
    return n;
  };
  const dir = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const a = id(idx[t]), b = id(idx[t + 1]), c = id(idx[t + 2]);
    if (a === b || b === c || a === c) continue;
    dir.add(`${a}:${b}`); dir.add(`${b}:${c}`); dir.add(`${c}:${a}`);
  }
  let open = 0;
  for (const k of dir) { const [x, y] = k.split(":"); if (!dir.has(`${y}:${x}`)) open++; }
  return open;
}

// -> ASCII STL text of every body in the file, in millimetres. `stats` (if
// given) gets { openEdges, triangles, bodies } like curved.js stepToStl.
export async function igesToStl(buf, name = "iges-import", opts = {}) {
  const occt = await loadOcctImport();
  const res = occt.ReadIgesFile(new Uint8Array(buf), {
    linearUnit: "millimeter",
    linearDeflectionType: "absolute_value",
    linearDeflection: opts.tolerance ?? 0.05,
    angularDeflection: opts.angularTolerance ?? 0.26,
  });
  if (!res?.success) throw new Error("Couldn't read that IGES file. Is it a valid .igs/.iges export?");
  const meshes = (res.meshes || []).filter((m) => m?.index?.array?.length);
  if (!meshes.length) throw new Error("That IGES file contained no surfaces or solids (curves and points only?).");
  let stl = `solid ${name}\n`, tris = 0, open = 0;
  for (const m of meshes) {
    const p = m.attributes.position.array, ix = m.index.array;
    for (let t = 0; t < ix.length; t += 3) {
      stl += "facet normal 0 0 0\nouter loop\n";
      for (let k = 0; k < 3; k++) {
        const v = ix[t + k] * 3;
        stl += `vertex ${p[v]} ${p[v + 1]} ${p[v + 2]}\n`;
      }
      stl += "endloop\nendfacet\n";
    }
    tris += ix.length / 3;
    if (opts.stats) open += openEdgeCount(p, ix);
  }
  stl += `endsolid ${name}\n`;
  if (opts.stats) Object.assign(opts.stats, { openEdges: open, triangles: tris, bodies: meshes.length });
  return stl;
}
