// Model inventory: browse a local folder of STL / OBJ / 3MF files as
// thumbnails and click to import. Everything here stays on the user's
// machine — files are read via the File System Access API (or a
// webkitdirectory input as fallback) and thumbnails render locally.
//
// The parsers below exist ONLY for thumbnails, so they favour speed and
// tolerance over fidelity: raw triangle soup in, Float32Array out. Actual
// imports still go through the kernel's own pipeline.

// ------------------------------------------------------------------ STL

export function parseSTL(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;

  // Reliable binary detection: a binary STL is EXACTLY 84 + 50*n bytes, where
  // n is the triangle count at offset 80. The "solid" header trick is
  // unreliable (many binary exporters write "solid <name>" too), so match on
  // the exact byte length first — that's what was blanking some thumbnails.
  const asBinary = () => {
    if (bytes.length < 84) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = dv.getUint32(80, true);
    if (bytes.length !== 84 + n * 50) return null;   // not a clean binary STL
    const out = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const base = 84 + i * 50 + 12;                 // skip the per-facet normal
      for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(base + k * 4, true);
    }
    return out;
  };
  const asAscii = () => {
    const text = new TextDecoder().decode(bytes);
    if (!/facet\s+normal/i.test(text)) return null;  // no facets → not ascii STL
    const out = [];
    for (const m of text.matchAll(/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g)) {
      out.push(+m[1], +m[2], +m[3]);
    }
    return out.length ? new Float32Array(out) : null;
  };

  // exact binary match wins; otherwise try ascii; otherwise a lenient binary read
  return asBinary() || asAscii() || (() => {
    if (bytes.length < 84) return new Float32Array(0);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = dv.getUint32(80, true);
    const count = Math.min(n, Math.floor((bytes.length - 84) / 50));
    const out = new Float32Array(count * 9);
    for (let i = 0; i < count; i++) {
      const base = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(base + k * 4, true);
    }
    return out;
  })();
}

// ------------------------------------------------------------------ OBJ

export function parseOBJ(text) {
  const verts = [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("v ")) {
      verts.push(t.slice(2).trim().split(/\s+/).map(Number));
    } else if (t.startsWith("f ")) {
      const idx = t.slice(2).trim().split(/\s+/)
        .map((tok) => parseInt(tok.split("/")[0], 10))
        .map((i) => (i < 0 ? verts.length + i : i - 1));
      for (let k = 1; k + 1 < idx.length; k++) {
        for (const i of [idx[0], idx[k], idx[k + 1]]) {
          const v = verts[i];
          if (v) out.push(v[0], v[1], v[2]);
        }
      }
    }
  }
  return new Float32Array(out);
}

// ------------------------------------------------------------------ 3MF
//
// A 3MF is a zip holding 3D/3dmodel.model (XML). This is a minimal reader:
// central directory scan, stored entries sliced, deflated entries fed to
// DecompressionStream. The XML is mined with regexes — fine for the
// vertex/triangle lists every slicer emits.

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ZIP64. A 32-bit field holding 0xFFFFFFFF (or a 16-bit one holding 0xFFFF) is
// not a value — it is a flag saying "the real number is in the ZIP64 record".
// Taking it literally is how a 219KB file asks to be read at offset 4,294,967,295
// and the whole import dies with "Offset is outside the bounds of the DataView".
//
// It is not only huge archives that need this: plenty of writers emit ZIP64
// unconditionally when they are streaming and do not know the final size yet,
// which is exactly how an ordinary 3MF from a slicer ends up here.
const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

// Read the central directory's position and entry count, consulting the ZIP64
// records when the ordinary fields are sentinels.
function centralDirectory(bytes, dv) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (i + 4 <= bytes.length && dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip (no central directory)");

  let count = dv.getUint16(eocd + 10, true);
  let offset = dv.getUint32(eocd + 16, true);
  if (count !== U16_MAX && offset !== U32_MAX) return { count, offset };

  // The ZIP64 locator sits immediately before the end record.
  const loc = eocd - 20;
  if (loc < 0 || dv.getUint32(loc, true) !== 0x07064b50) {
    throw new Error("this zip needs ZIP64 but has no ZIP64 locator");
  }
  const z64 = Number(dv.getBigUint64(loc + 8, true));
  if (z64 < 0 || z64 + 56 > bytes.length || dv.getUint32(z64, true) !== 0x06064b50) {
    throw new Error("this zip's ZIP64 record is missing or unreadable");
  }
  if (count === U16_MAX) count = Number(dv.getBigUint64(z64 + 32, true));
  if (offset === U32_MAX) offset = Number(dv.getBigUint64(z64 + 48, true));
  return { count, offset };
}

// An entry's own oversized fields live in extra-field block 0x0001, in a fixed
// order but only for the fields that were sentinels — so the order they are
// consumed in has to match which ones actually overflowed.
function zip64Extra(dv, at, len, need) {
  let p = at;
  const end = at + len;
  while (p + 4 <= end) {
    const id = dv.getUint16(p, true);
    const size = dv.getUint16(p + 2, true);
    if (id === 0x0001) {
      let q = p + 4;
      const got = {};
      if (need.uncomp && q + 8 <= end) { got.uncomp = Number(dv.getBigUint64(q, true)); q += 8; }
      if (need.comp && q + 8 <= end) { got.comp = Number(dv.getBigUint64(q, true)); q += 8; }
      if (need.local && q + 8 <= end) { got.local = Number(dv.getBigUint64(q, true)); q += 8; }
      return got;
    }
    p += 4 + size;
  }
  return {};
}

// Walk the central directory once. Both readers below use this, so ZIP64 is
// handled in one place rather than in two that can drift apart.
function* zipEntries(bytes, dv) {
  const { count, offset } = centralDirectory(bytes, dv);
  let p = offset;
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    let compSize = dv.getUint32(p + 20, true);
    const uncSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    let localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (compSize === U32_MAX || localOff === U32_MAX || uncSize === U32_MAX) {
      const big = zip64Extra(dv, p + 46 + nameLen, extraLen, {
        uncomp: uncSize === U32_MAX, comp: compSize === U32_MAX, local: localOff === U32_MAX,
      });
      if (big.comp !== undefined) compSize = big.comp;
      if (big.local !== undefined) localOff = big.local;
    }
    p += 46 + nameLen + extraLen + commentLen;
    yield { name, method, compSize, localOff };
  }
}

// Where an entry's bytes actually start: the local header repeats the name and
// extra lengths, and they can differ from the central directory's.
function entryData(bytes, dv, { localOff, compSize }) {
  if (localOff + 30 > bytes.length) throw new Error("zip entry points past the end of the file");
  const lNameLen = dv.getUint16(localOff + 26, true);
  const lExtraLen = dv.getUint16(localOff + 28, true);
  const start = localOff + 30 + lNameLen + lExtraLen;
  return bytes.subarray(start, Math.min(start + compSize, bytes.length));
}

export async function unzipEntry(buf, namePattern) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const e of zipEntries(bytes, dv)) {
    if (!namePattern.test(e.name)) continue;
    const data = entryData(bytes, dv, e);
    if (e.method === 0) return data;
    if (e.method === 8) return await inflateRaw(data);
    throw new Error(`unsupported zip method ${e.method}`);
  }
  throw new Error("entry not found in zip");
}

// Every entry whose name matches, not just the first — a 3MF that uses the
// production extension keeps its geometry in separate part files.
export async function unzipEntries(buf, namePattern) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map();
  for (const e of zipEntries(bytes, dv)) {
    if (!namePattern.test(e.name)) continue;
    const data = entryData(bytes, dv, e);
    if (e.method === 0) out.set(e.name, data);
    else if (e.method === 8) out.set(e.name, await inflateRaw(data));
  }
  return out;
}

// A 3MF's objects, by id, from one .model part.
//
// An object is EITHER a mesh or a list of components pointing at other objects
// — possibly in a different part file. That second form is the 3MF "production
// extension", and it is what every multi-part Bambu/Orca project uses.
function parseModelPart(xml) {
  const objects = new Map();
  // Split on object boundaries rather than regexing across the whole document:
  // a 2.6MB part with 100k vertices makes any backtracking regex miserable.
  const chunks = xml.split(/<object\b/).slice(1);
  for (const chunk of chunks) {
    const id = /^[^>]*\bid="([^"]+)"/.exec(chunk)?.[1];
    if (!id) continue;
    const body = chunk.slice(0, chunk.indexOf("</object>") + 1 || undefined);

    const components = [];
    for (const m of body.matchAll(/<component\b([^>]*)\/?>/g)) {
      const attrs = m[1];
      const objectid = /\bobjectid="([^"]+)"/.exec(attrs)?.[1];
      if (!objectid) continue;
      components.push({
        objectid,
        path: /\bp:path="([^"]+)"/.exec(attrs)?.[1] || null,
        transform: /\btransform="([^"]+)"/.exec(attrs)?.[1] || null,
      });
    }
    if (components.length) { objects.set(id, { components }); continue; }

    const verts = [];
    for (const m of body.matchAll(/<vertex[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bz="([^"]+)"/g)) {
      verts.push([+m[1], +m[2], +m[3]]);
    }
    const tris = [];
    for (const m of body.matchAll(/<triangle[^>]*\bv1="(\d+)"[^>]*\bv2="(\d+)"[^>]*\bv3="(\d+)"/g)) {
      tris.push([+m[1], +m[2], +m[3]]);
    }
    if (verts.length) objects.set(id, { verts, tris });
  }
  return objects;
}

// 3MF transform: "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32", row-major
// with the translation last — so a point goes x*m00 + y*m10 + z*m20 + m30.
function applyTransform(p, t) {
  if (!t) return p;
  const n = t.trim().split(/\s+/).map(Number);
  if (n.length < 12 || n.some((v) => !Number.isFinite(v))) return p;
  const [x, y, z] = p;
  return [
    x * n[0] + y * n[3] + z * n[6] + n[9],
    x * n[1] + y * n[4] + z * n[7] + n[10],
    x * n[2] + y * n[5] + z * n[8] + n[11],
  ];
}

// Read a 3MF as the SEPARATE SOLIDS it describes.
//
// This used to read the FIRST .model part in the zip and regex it for
// <vertex>/<triangle>. On any file written by Bambu or Orca that part is
// 3D/3dmodel.model, which holds nothing but <components> pointing into
// 3D/Objects/*.model — so a real 4-colour Benchy read as ZERO triangles.
//
// Flattening everything into one soup was the second mistake. A multi-part
// project is several closed solids that touch and interpenetrate; merged into a
// single mesh the kernel is asked to manifoldize all of them at once, and a
// 33k-triangle Benchy simply hung. Kept apart, each one is a clean closed solid
// the kernel handles on its own — and the user gets parts they can move and
// edit individually, which is what the file meant in the first place.
//
// Returns [{ name, positions }] in build order.
export async function parse3MFObjects(buf) {
  const parts = await unzipEntries(buf, /\.model$/i);
  if (!parts.size) throw new Error("no model data in that 3MF");

  const dec = new TextDecoder();
  const byPath = new Map();                       // "/3D/x.model" -> Map(id -> object)
  const norm = (p) => "/" + String(p || "").replace(/^\/+/, "");
  for (const [name, bytes] of parts) byPath.set(norm(name), parseModelPart(dec.decode(bytes)));

  const rootPath = [...byPath.keys()].find((k) => /3dmodel\.model$/i.test(k)) || [...byPath.keys()][0];
  const rootXml = dec.decode(parts.get(rootPath.slice(1)) ?? [...parts.values()][0]);

  // Collect the triangles of ONE mesh object, with every transform on the way
  // down applied. Components can nest and, in a broken file, cycle.
  const collect = (path, id, transform, depth, into, seen) => {
    const key = `${path}#${id}#${transform}`;
    if (depth > 12 || seen.has(key)) return;
    seen.add(key);
    const obj = byPath.get(path)?.get(id);
    if (!obj) return;
    if (obj.components) {
      for (const c of obj.components) {
        collect(c.path ? norm(c.path) : path, c.objectid,
          transform && c.transform ? `${c.transform}|${transform}` : (c.transform || transform),
          depth + 1, into, seen);
      }
      return;
    }
    for (const t of obj.tris) {
      for (const i of t) {
        let v = obj.verts[i];
        if (!v) continue;
        for (const step of String(transform || "").split("|").filter(Boolean)) v = applyTransform(v, step);
        into.push(v[0], v[1], v[2]);
      }
    }
  };

  // One entry per PART. An assembly's components are the parts — that is the
  // granularity a slicer shows and the one worth editing.
  const out = [];
  const push = (path, id, transform, label) => {
    const acc = [];
    collect(path, id, transform, 0, acc, new Set());
    // srcPath/srcId identify the object this part came from, so the colour
    // fallback can look up its pid/pindex without re-deriving the traversal
    if (acc.length) out.push({ name: label, positions: new Float32Array(acc), srcPath: path, srcId: id });
  };

  const items = [...rootXml.matchAll(/<item\b([^>]*)>/g)]
    .map((m) => ({
      objectid: /\bobjectid="([^"]+)"/.exec(m[1])?.[1],
      transform: /\btransform="([^"]+)"/.exec(m[1])?.[1] || null,
    }))
    .filter((i) => i.objectid);

  if (items.length) {
    for (const it of items) {
      const obj = byPath.get(rootPath)?.get(it.objectid);
      if (obj?.components) {
        obj.components.forEach((c, i) => {
          push(c.path ? norm(c.path) : rootPath, c.objectid,
            it.transform && c.transform ? `${c.transform}|${it.transform}` : (c.transform || it.transform),
            `part ${out.length + 1}`);
        });
      } else {
        push(rootPath, it.objectid, it.transform, `part ${out.length + 1}`);
      }
    }
  } else {
    // No build section: every mesh we found, wherever it lives.
    for (const [path, objs] of byPath) {
      for (const [id, o] of objs) if (o.verts) push(path, id, null, `part ${out.length + 1}`);
    }
  }
  return out;
}

// What colour is each part?
//
// A slicer project says this in two places, and needs both: which EXTRUDER a
// part prints on (Metadata/model_settings.config) and what colour is loaded in
// each extruder (filament_colour in Metadata/project_settings.config). Neither
// is standard 3MF — they are Bambu/Orca's own — but between them they are the
// only record of what the model is supposed to look like, and without them a
// 4-colour Benchy imports as eight identical grey slices.
//
// Returns hex strings positioned to match parse3MFObjects(), with null where a
// part has no colour to report.
export async function parse3MFPartColours(buf) {
  let cfg = "", proj = "";
  try { cfg = new TextDecoder().decode(await unzipEntry(buf, /model_settings\.config$/i)); } catch { cfg = ""; }
  try { proj = new TextDecoder().decode(await unzipEntry(buf, /project_settings\.config$/i)); } catch { /* colours unknown */ }

  const filaments = (/"filament_colour"\s*:\s*\[([^\]]*)\]/.exec(proj)?.[1] || "")
    .split(",").map((t) => t.trim().replace(/^"|"$/g, "")).filter((t) => /^#[0-9a-f]{6}$/i.test(t));

  // Parts appear in the same order as the components they describe.
  const out = [];
  if (cfg && filaments.length) {
    for (const m of cfg.matchAll(/<part\b[\s\S]*?<\/part>/g)) {
      const ex = +(/key="extruder"\s+value="(\d+)"/.exec(m[0])?.[1] || 0);
      out.push(ex > 0 && filaments[ex - 1] ? filaments[ex - 1].toUpperCase() : null);
    }
  }
  if (out.some(Boolean)) return out;

  // FALLBACK: the 3MF materials extension itself. Each object may carry
  // pid/pindex into an <m:colorgroup> palette — the spec-correct mechanism
  // (and what our own colored3MF always wrote). Aligned by srcPath/srcId,
  // never by guesswork about ordering.
  try {
    const objects = await parse3MFObjects(buf);
    const parts = await unzipEntries(buf, /\.model$/i);
    const dec = new TextDecoder();
    const palettes = new Map();   // "path" -> Map(groupId -> [hex...])
    const objMeta = new Map();    // "path#id" -> { pid, pindex }
    const norm = (p) => "/" + String(p || "").replace(/^\/+/, "");
    for (const [name, bytes] of parts) {
      const xml = dec.decode(bytes);
      const pal = new Map();
      for (const g of xml.matchAll(/<m:colorgroup\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/m:colorgroup>/g)) {
        pal.set(g[1], [...g[2].matchAll(/<m:color\b[^>]*\bcolor="(#[0-9a-fA-F]{6})/g)].map((c) => c[1].toUpperCase()));
      }
      palettes.set(norm(name), pal);
      for (const o of xml.matchAll(/<object\b([^>]*)>/g)) {
        const id = /\bid="([^"]+)"/.exec(o[1])?.[1];
        const pid = /\bpid="([^"]+)"/.exec(o[1])?.[1];
        const pindex = /\bpindex="(\d+)"/.exec(o[1])?.[1];
        if (id && pid) objMeta.set(`${norm(name)}#${id}`, { pid, pindex: +(pindex || 0) });
      }
    }
    return objects.map((o) => {
      const meta = objMeta.get(`${o.srcPath}#${o.srcId}`);
      if (!meta) return null;
      return palettes.get(o.srcPath)?.get(meta.pid)?.[meta.pindex] ?? null;
    });
  } catch {
    return out;
  }
}

// The same file as ONE triangle soup — what a thumbnail wants.
export async function parse3MF(buf) {
  const objects = await parse3MFObjects(buf);
  let n = 0;
  for (const o of objects) n += o.positions.length;
  const all = new Float32Array(n);
  let at = 0;
  for (const o of objects) { all.set(o.positions, at); at += o.positions.length; }
  return all;
}

// The same file as COLOURED groups — what a thumbnail of a multicolour print
// wants. Positions per part with that part's filament colour (null = uncoloured).
// Falls back to [] when the file carries no colour information at all, so the
// caller can keep the cheap single-soup path.
export async function parse3MFColourGroups(buf) {
  const [objects, colours] = await Promise.all([parse3MFObjects(buf), parse3MFPartColours(buf)]);
  if (!colours.some(Boolean)) return [];
  return objects.map((o, i) => ({ positions: o.positions, color: colours[i] || null }));
}

// Route by extension. Returns Float32Array positions (triangle soup).
export async function parseModelFile(name, buf) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "stl") return parseSTL(buf);
  if (ext === "obj") return parseOBJ(new TextDecoder().decode(buf));
  if (ext === "3mf") return parse3MF(buf);
  throw new Error(`unsupported file type .${ext}`);
}

// ----------------------------------------------------------- thumbnails
//
// One small hidden renderer shared by every tile. preserveDrawingBuffer so
// toDataURL right after render() is reliable.

export function makeThumbnailer(THREE, size = 176) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(60, -80, 120);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10000);
  camera.up.set(0, 0, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x9fb4d6, metalness: 0.1, roughness: 0.55,
  });

  return {
    // `groups` (optional): [{ positions, color }] — a multicolour 3MF renders
    // one mesh per part in its filament colour, so the tile looks like the
    // print. Without it, the whole soup renders in the house grey.
    snapshot(positions, groups = null) {
      const parts = groups?.length
        ? groups.filter((gr) => gr.positions?.length)
        : (positions?.length ? [{ positions, color: null }] : []);
      if (!parts.length) return null;
      const meshes = [], extraMats = [];
      const bounds = new THREE.Box3();
      for (const part of parts) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
        g.computeVertexNormals();
        g.computeBoundingBox();
        const bb = g.boundingBox;
        if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.x)) { g.dispose(); continue; }
        let m = material;
        if (part.color) {
          m = material.clone();
          m.color.set(part.color);
          extraMats.push(m);
        }
        const mesh = new THREE.Mesh(g, m);
        meshes.push(mesh);
        scene.add(mesh);
        bounds.union(bb);
      }
      // guard against NaN/degenerate geometry — that's what rendered blank
      if (!meshes.length || bounds.isEmpty()) {
        for (const mesh of meshes) { scene.remove(mesh); mesh.geometry.dispose(); }
        for (const m of extraMats) m.dispose();
        return null;
      }
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
      if (!Number.isFinite(radius) || radius <= 0
          || !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
        for (const mesh of meshes) { scene.remove(mesh); mesh.geometry.dispose(); }
        for (const m of extraMats) m.dispose();
        return null;
      }
      const r = Math.max(radius, 0.001);
      const dir = new THREE.Vector3(1, -1, 0.75).normalize();
      camera.position.copy(center).addScaledVector(dir, r * 3.1);
      camera.near = r / 100;
      camera.far = r * 100;
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/png");
      for (const mesh of meshes) { scene.remove(mesh); mesh.geometry.dispose(); }
      for (const m of extraMats) m.dispose();
      return url;
    },
    dispose() {
      material.dispose();
      renderer.dispose();
    },
  };
}

// ------------------------------------------------------------ persistence
//
// IndexedDB keeps (a) the folder handle so the pick survives reloads and
// (b) generated thumbnails keyed by name|size|mtime, so a folder only pays
// the snapshot cost once.

const DB = "brepcode-inventory";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
      req.result.createObjectStore("thumbs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(store, key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// v3: colour-aware 3MF thumbnails — the bump regenerates the all-grey tiles.
// (v2 bypassed blanks cached by the old unreliable binary/ASCII detection.)
export const thumbKey = (f) => `v3|${f.name}|${f.size}|${f.lastModified}`;

// --------------------------------------------------------------- scanning

const MODEL_RE = /\.(stl|obj|3mf)$/i;

// Recursive directory walk (File System Access API), depth-capped so a
// pick of ~/Documents doesn't spiral. Returns [{name, path, getFile}].
export async function scanDirectory(dirHandle, maxDepth = 2, cap = 400) {
  const out = [];
  async function walk(handle, path, depth) {
    for await (const entry of handle.values()) {
      if (out.length >= cap) return;
      if (entry.kind === "file" && MODEL_RE.test(entry.name)) {
        out.push({ name: entry.name, path: path + entry.name, handle: entry });
      } else if (entry.kind === "directory" && depth < maxDepth) {
        await walk(entry, `${path}${entry.name}/`, depth + 1);
      }
    }
  }
  await walk(dirHandle, "", 0);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

// Fallback for browsers without showDirectoryPicker: a FileList from an
// <input webkitdirectory> mapped to the same shape.
export function scanFileList(files) {
  return [...files]
    .filter((f) => MODEL_RE.test(f.name))
    .map((f) => ({
      name: f.name,
      path: f.webkitRelativePath || f.name,
      handle: { getFile: async () => f },
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
