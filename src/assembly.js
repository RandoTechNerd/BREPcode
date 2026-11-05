// Assemblies: a model made of named parts instead of one shape.
//
//   return assembly({
//     housing: { shape: housing(), color: "#8a8f98", print: "flip" },
//     pod:     { shape: pod(), color: "#c8702a", count: 12, place: polar(12, { at: [45, 0, 28] }) },
//   });
//
// Every part keeps its own shape in its OWN frame (the frame it prints in),
// and `place` moves each copy to where it sits in the finished machine. That
// split is the whole point: the viewer shows the assembled pose, a fit check
// intersects the assembled copies, and export_parts writes each part ONCE, in
// the frame it was drawn in (turned by `print`), standing on the bed.
//
// It compiles to a plain group() of transformed parts, so everything that
// already handles a group keeps working: the per-part parallel build
// (partsplit.js), colours, picking, 3MF. Each copy is an identity-free xform
// node tagged `asmPart`; compile() records which kernel features each copy
// emitted (partHistory.assembly), and that is how the page maps a face on
// screen, or a solid in the STL, back to "pod #7".
//
// The rest of this file is the arithmetic the page and the MCP tools share:
// splitting the kernel's STL per part, the print pose, the fit check and the
// parts table. No DOM and no THREE scene, so test/assembly.js runs it in Node.

import { Matrix4, Euler, Vector3 } from "three";

const DEG = Math.PI / 180;
const isNode = (v) => !!(v && v.__brepscript);
const rotM = ([rx = 0, ry = 0, rz = 0]) => new Matrix4().makeRotationFromEuler(new Euler(rx * DEG, ry * DEG, rz * DEG, "XYZ"));

// A placement as a matrix. What people write: a function of the shape (and
// the copy's index) that only moves it, a { translate, rotate } object, or
// nothing at all. A function is run on the real shape and its result walked
// back through the transforms to the shape again; anything that is not a
// pure move (a difference, a scale of one part only…) is refused, because a
// placement that changes the part would make the printed part and the
// assembled one two different things.
function placeMatrix(place, shape, i, name) {
  if (place == null) return new Matrix4();
  if (Array.isArray(place)) return placeMatrix(place[i], shape, i, name);
  if (place instanceof Matrix4) return place.clone();
  if (typeof place === "function") {
    let n = place(shape, i);
    if (n instanceof Matrix4) return n.clone();
    if (!isNode(n)) throw new Error(`assembly(): ${name}'s place() must return the shape it was given, moved (translate/rotate), or a placement`);
    const M = new Matrix4();
    while (n !== shape) {
      if (n?.kind !== "xform") {
        throw new Error(`assembly(): ${name}'s place() may only move the part (translate/rotate), not change it`);
      }
      M.multiply(n.matrix);
      n = n.child;
    }
    return M;
  }
  if (typeof place === "object") {
    const M = new Matrix4();
    if (place.translate) M.makeTranslation(...place.translate);
    if (place.rotate) M.multiply(rotM(Array.isArray(place.rotate) ? place.rotate : [0, 0, place.rotate]));
    return M;
  }
  throw new Error(`assembly(): ${name}'s place is not something I can read — use polar(n, …), a function, or { translate, rotate }`);
}

// n copies around the Z axis. `at` and `rotate` place the FIRST copy (rotate
// first, then move it out to `at`), and each next one turns another 360/n
// degrees about Z. `phase` turns the whole ring.
//   polar(12, { at: [45, 0, 28], rotate: [90, 0, 90] })
export function polar(n, { at = [0, 0, 0], rotate: r = [0, 0, 0], phase = 0 } = {}) {
  const base = new Matrix4().makeTranslation(...at).multiply(rotM(r));
  return Array.from({ length: n }, (_, i) => rotM([0, 0, phase + (360 * i) / n]).multiply(base));
}

// The print turn, as a matrix applied to the part in its own frame. "flip"
// is the common one (a lid modelled the right way up prints upside down),
// "placed" prints the first copy exactly as it sits in the assembly.
export function printMatrix(print, firstPlace = new Matrix4()) {
  if (print == null || print === "asis" || print === "as-is") return new Matrix4();
  if (print === "flip") return rotM([180, 0, 0]);
  if (print === "placed") return firstPlace.clone();
  if (print === "side") return rotM([90, 0, 0]);
  if (Array.isArray(print)) return rotM(print);
  if (print?.rotate) return rotM(print.rotate);
  throw new Error(`assembly(): print must be "asis", "flip", "side", "placed" or [rx, ry, rz] degrees`);
}

export function assembly(parts, opts = {}) {
  if (!parts || typeof parts !== "object" || Array.isArray(parts)) {
    throw new Error('assembly() takes named parts: assembly({ base: { shape: cube([20, 20, 5]) }, lid: { shape: …, print: "flip" } })');
  }
  const children = [], table = [];
  for (const [name, raw] of Object.entries(parts)) {
    const spec = isNode(raw) ? { shape: raw } : (raw || {});
    const shape = spec.shape;
    if (!isNode(shape)) throw new Error(`assembly(): part "${name}" needs a shape, e.g. ${name}: { shape: cube([10, 10, 10]) }`);
    const count = Math.max(1, Math.floor(spec.count ?? (Array.isArray(spec.place) ? spec.place.length : 1)));
    if (Array.isArray(spec.place) && spec.place.length < count) {
      throw new Error(`assembly(): part "${name}" has count ${count} but only ${spec.place.length} placements`);
    }
    printMatrix(spec.print);              // a bad print value fails here, at the line that wrote it
    // what the page needs about the part, riding on every copy (in-page only:
    // the kernel history never sees it)
    const part = { shape, color: spec.color ?? null, finish: spec.finish ?? null,
      print: spec.print ?? "asis", explode: spec.explode ?? null };
    for (let i = 0; i < count; i++) {
      const matrix = placeMatrix(spec.place, shape, i, name);
      children.push({
        __brepscript: true, kind: "xform", matrix, child: shape,
        ...(spec.color != null ? { color: spec.color } : {}),
        ...(spec.finish != null ? { finish: spec.finish } : {}),
        asmPart: { name, index: i, count, spec: part },
      });
    }
    table.push({
      name, count, color: spec.color ?? null, finish: spec.finish ?? null,
      print: spec.print ?? "asis", explode: spec.explode ?? null, shape,
    });
  }
  if (!children.length) throw new Error("assembly() needs at least one part");
  return { __brepscript: true, kind: "group", children, assembly: { parts: table, ...opts } };
}

// ---------------------------------------------------------- page / tools side

// "pod #7" for a copy, "housing" for a part there is one of.
export const instanceLabel = (inst) => (inst.count > 1 ? `${inst.name} #${inst.index + 1}` : inst.name);

// The kernel's ASCII STL, one triangle soup per solid name.
export function splitSTL(text) {
  const out = new Map();
  let cur = null, name = "";
  const re = /^\s*(solid|vertex|endsolid)\b\s*(.*)$/gm;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] === "solid") { name = m[2].trim(); cur = []; }
    else if (m[1] === "vertex" && cur) { const v = m[2].trim().split(/\s+/); cur.push(+v[0], +v[1], +v[2]); }
    else if (m[1] === "endsolid" && cur) {
      const prev = out.get(name);
      out.set(name, prev ? concat(prev, cur) : Float32Array.from(cur));
      cur = null;
    }
  }
  return out;
}
const concat = (a, b) => { const o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

// Which copy owns a kernel feature id. Built from partHistory.assembly.
export function ownerMap(instances) {
  const own = new Map();
  instances.forEach((inst, k) => { for (const id of inst.ids) own.set(id, k); });
  return own;
}

// Every copy's world triangles, from the STL the kernel wrote for the whole model.
export function instanceSoups(instances, stlText) {
  const own = ownerMap(instances);
  const parts = instances.map(() => []);
  for (const [name, soup] of splitSTL(stlText)) {
    const k = own.get(name);
    if (k !== undefined) parts[k].push(soup);
  }
  return parts.map((list) => list.reduce((a, b) => concat(a, b), new Float32Array(0)));
}

export function soupBounds(soup) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = soup[i + k];
      if (v < mn[k]) mn[k] = v;
      if (v > mx[k]) mx[k] = v;
    }
  }
  return [mn, mx];
}

// Signed volume of a closed soup (divergence theorem), mm³.
export function soupVolume(soup) {
  let v = 0;
  for (let i = 0; i < soup.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = soup.subarray(i, i + 9);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(v / 6);
}

export function transformSoup(soup, m) {
  const out = new Float32Array(soup.length), v = new Vector3();
  for (let i = 0; i < soup.length; i += 3) {
    v.set(soup[i], soup[i + 1], soup[i + 2]).applyMatrix4(m);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
  }
  // a mirror (det < 0) turns every triangle inside out; wind them back
  if (m.determinant() < 0) {
    for (let i = 0; i < out.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = t; }
    }
  }
  return out;
}

// The matrix that takes a copy from where it sits in the assembly to where it
// prints: back into the part's own frame, the print turn, then down onto the
// bed, centred on X/Y. Returns the matrix and the posed triangles.
export function printPose(worldSoup, world, print) {
  const W = new Matrix4().fromArray(world);
  const local = new Matrix4().copy(W).invert();
  const turn = printMatrix(print, W).multiply(local);
  const posed = transformSoup(worldSoup, turn);
  const [mn, mx] = soupBounds(posed);
  const bed = new Matrix4().makeTranslation(-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]);
  const soup = transformSoup(posed, bed);
  return { matrix: bed.multiply(turn), soup };
}

export function soupToBinarySTL(soup, header = "BREPcode part") {
  const n = soup.length / 9;
  const buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  const head = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(head);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const p = soup.subarray(t * 9, t * 9 + 9);
    const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2];
    const wx = p[6] - p[0], wy = p[7] - p[1], wz = p[8] - p[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const v of [nx, ny, nz, ...p]) { dv.setFloat32(o, v, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export function partsCSV(rows) {
  const head = ["name", "quantity", "size_x_mm", "size_y_mm", "size_z_mm", "volume_mm3", "print", "stl", "step"];
  const lines = rows.map((r) => [r.name, r.count, ...r.size.map((v) => v.toFixed(2)), r.volume.toFixed(1),
    Array.isArray(r.print) ? r.print.join(" ") : r.print, r.stl || "", r.step || ""].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}

// Safe file stem for a part name.
export const fileStem = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "part";

// ------------------------------------------------------------------ fit check
//
// Every pair of assembled copies whose boxes overlap is intersected for real
// (manifold-3d) and any shared volume above `minVolume` is a clash. The boxes
// are only a filter: a ring of twelve pods inside a housing has every pod's
// box inside the housing's, and only the boolean can say they do not touch.
//
// `wasm` is a set-up manifold-3d module (fizzcore.loadManifold()); `weld`
// turns a soup into shared vertices (fizzcore.weld). Returns the clashes,
// largest first, each with its overlap as a soup so the page can paint it.
export async function checkFit(wasm, weld, items, { minVolume = 0.01, onProgress = null } = {}) {
  const boxes = items.map((it) => soupBounds(it.soup));
  const solids = new Array(items.length).fill(null);
  const notClosed = [];
  const solidOf = (k) => {
    if (solids[k] !== null) return solids[k];
    solids[k] = false;
    try {
      const { verts, tris } = weld(items[k].soup, 1e-4);
      const mesh = new wasm.Mesh({ numProp: 3, vertProperties: verts, triVerts: tris });
      mesh.merge();
      const s = new wasm.Manifold(mesh);
      if (s.status && s.status() !== "NoError") throw new Error(String(s.status()));
      solids[k] = s;
    } catch { notClosed.push(items[k].label); }
    return solids[k];
  };
  const overlap = (a, b) => [0, 1, 2].every((k) => a[0][k] < b[1][k] && b[0][k] < a[1][k]);
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) if (overlap(boxes[i], boxes[j])) pairs.push([i, j]);
  }
  const clashes = [];
  let done = 0;
  for (const [i, j] of pairs) {
    const a = solidOf(i), b = solidOf(j);
    if (a && b) {
      const x = a.intersect(b);
      const volume = x.volume();
      if (volume > minVolume) {
        const m = x.getMesh(), P = m.numProp, V = m.vertProperties, T = m.triVerts;
        const soup = new Float32Array(T.length * 3);
        for (let t = 0; t < T.length; t++) { const v = T[t] * P; soup.set([V[v], V[v + 1], V[v + 2]], t * 3); }
        const [mn, mx] = soupBounds(soup);
        clashes.push({ a: items[i].label, b: items[j].label, volume: +volume.toFixed(3),
          at: mn.map((v, k) => +((v + mx[k]) / 2).toFixed(2)), size: mn.map((v, k) => +(mx[k] - v).toFixed(2)), soup });
      }
      x.delete();
    }
    if (++done % 8 === 0) { onProgress?.(done, pairs.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  for (const s of solids) if (s) s.delete();
  clashes.sort((p, q) => q.volume - p.volume);
  return { parts: items.length, pairsChecked: pairs.length, pairsTotal: (items.length * (items.length - 1)) / 2, clashes, notClosed };
}
