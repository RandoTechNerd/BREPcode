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

export async function unzipEntry(buf, namePattern) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // find End Of Central Directory (scan back through the trailing comment)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip (no central directory)");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!namePattern.test(name)) continue;
    // the local header repeats name/extra lengths — read them from there
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + compSize);
    if (method === 0) return data;
    if (method === 8) return await inflateRaw(data);
    throw new Error(`unsupported zip method ${method}`);
  }
  throw new Error("entry not found in zip");
}

// Every entry whose name matches, not just the first — a 3MF that uses the
// production extension keeps its geometry in separate part files.
export async function unzipEntries(buf, namePattern) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip (no central directory)");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!namePattern.test(name)) continue;
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const startAt = localOff + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(startAt, startAt + compSize);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, await inflateRaw(data));
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
    if (acc.length) out.push({ name: label, positions: new Float32Array(acc) });
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
  try { cfg = new TextDecoder().decode(await unzipEntry(buf, /model_settings\.config$/i)); } catch { return []; }
  try { proj = new TextDecoder().decode(await unzipEntry(buf, /project_settings\.config$/i)); } catch { /* colours unknown */ }

  const filaments = (/"filament_colour"\s*:\s*\[([^\]]*)\]/.exec(proj)?.[1] || "")
    .split(",").map((t) => t.trim().replace(/^"|"$/g, "")).filter((t) => /^#[0-9a-f]{6}$/i.test(t));

  // Parts appear in the same order as the components they describe.
  const out = [];
  for (const m of cfg.matchAll(/<part\b[\s\S]*?<\/part>/g)) {
    const ex = +(/key="extruder"\s+value="(\d+)"/.exec(m[0])?.[1] || 0);
    out.push(ex > 0 && filaments[ex - 1] ? filaments[ex - 1].toUpperCase() : null);
  }
  return out;
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
    snapshot(positions) {
      if (!positions?.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const bs = g.boundingSphere;
      // guard against NaN/degenerate geometry — that's what rendered blank
      if (!bs || !Number.isFinite(bs.radius) || bs.radius <= 0
          || !Number.isFinite(bs.center.x) || !Number.isFinite(bs.center.y) || !Number.isFinite(bs.center.z)) {
        g.dispose();
        return null;
      }
      const mesh = new THREE.Mesh(g, material);
      scene.add(mesh);
      const { center, radius } = bs;
      const r = Math.max(radius, 0.001);
      const dir = new THREE.Vector3(1, -1, 0.75).normalize();
      camera.position.copy(center).addScaledVector(dir, r * 3.1);
      camera.near = r / 100;
      camera.far = r * 100;
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/png");
      scene.remove(mesh);
      g.dispose();
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

// v2: bumping the version bypasses any blank thumbnails cached by the old
// (unreliable) binary/ASCII detection, so they regenerate correctly.
export const thumbKey = (f) => `v2|${f.name}|${f.size}|${f.lastModified}`;

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
