// BrepScript DSL — an OpenSCAD-flavoured authoring layer over the BREP.io kernel.
//
// The kernel's own conventions are inconsistent between primitives: the cube sits
// corner-at-origin, while the cylinder and cone extrude along +Y from y=0, and the
// torus lies in the XZ plane. Every primitive below is normalised to the OpenSCAD
// convention (Z-up, cylinder base at z=0 centred in XY) via AXIS_FIX.

import { Matrix4, Euler, Vector3, Quaternion, MathUtils } from "three";

const DEG = Math.PI / 180;

// Rotate +90° about X: maps the kernel's +Y extrusion axis onto +Z.
const AXIS_FIX = new Matrix4().makeRotationX(90 * DEG);
const IDENTITY = new Matrix4();

const node = (o) => ({ __brepscript: true, ...o });
const isNode = (v) => !!(v && v.__brepscript);

function collect(args) {
  const out = [];
  for (const a of args.flat(Infinity)) {
    if (isNode(a)) out.push(a);
    else if (a != null) throw new TypeError(`Expected a shape, got ${typeof a}: ${JSON.stringify(a)}`);
  }
  return out;
}

// ---------------------------------------------------------------- primitives

// cube([x,y,z]) or cube(size) or cube({size:[x,y,z], center:false})
export function cube(arg = 10, opts = {}) {
  let size = arg, center = opts.center ?? false;
  if (arg && typeof arg === "object" && !Array.isArray(arg)) {
    size = arg.size ?? arg.s ?? 10;
    center = arg.center ?? false;
  }
  // A half-typed vector (`cube([10, 10`) still renders something sensible:
  // missing components repeat the last one given.
  let x, y, z;
  if (Array.isArray(size)) {
    const s = size.filter((n) => typeof n === "number" && Number.isFinite(n));
    if (!s.length) throw new TypeError("cube() needs numbers, e.g. cube([20, 20, 10])");
    [x, y, z] = [s[0], s[1] ?? s[0], s[2] ?? s[1] ?? s[0]];
  } else {
    [x, y, z] = [size, size, size];
  }
  const n = node({ kind: "prim", code: "P.CU", params: { sizeX: x, sizeY: y, sizeZ: z }, fix: IDENTITY });
  return center ? translate([-x / 2, -y / 2, -z / 2], n) : n;
}

// cylinder({r, h}) — base at z=0, centred in XY (OpenSCAD convention).
// Supports r1/r2 (or d1/d2) for cones, matching OpenSCAD's cylinder().
export function cylinder(opts = {}) {
  if (Array.isArray(opts)) {
    throw new TypeError(
      `cylinder() takes named options, not a vector — try cylinder({ r: ${opts[0] ?? 5}, h: ${opts[2] ?? opts[1] ?? 20} })`,
    );
  }
  if (typeof opts === "number") opts = { r: opts };
  const h = opts.h ?? opts.height ?? 10;
  const res = opts.$fn ?? opts.resolution;
  const r = opts.r ?? (opts.d != null ? opts.d / 2 : undefined);
  const r1 = opts.r1 ?? (opts.d1 != null ? opts.d1 / 2 : undefined);
  const r2 = opts.r2 ?? (opts.d2 != null ? opts.d2 / 2 : undefined);

  let n;
  if (r1 != null || r2 != null) {
    const params = { radiusBottom: r1 ?? r ?? 5, radiusTop: r2 ?? r ?? 5, height: h };
    if (res) params.resolution = res;
    n = node({ kind: "prim", code: "P.CO", params, fix: AXIS_FIX });
  } else {
    const params = { radius: r ?? 5, height: h };
    if (res) params.resolution = res;
    n = node({ kind: "prim", code: "P.CY", params, fix: AXIS_FIX });
  }
  return opts.center ? translate([0, 0, -h / 2], n) : n;
}

export function cone(opts = {}) {
  return cylinder({ r1: opts.r1 ?? opts.rBottom ?? 5, r2: opts.r2 ?? opts.rTop ?? 0, ...opts });
}

export function sphere(opts = 5) {
  if (Array.isArray(opts)) {
    throw new TypeError(
      `sphere() takes a radius, not a size vector — try sphere({ r: ${opts[0] ?? 10} }), or cube([${opts.join(", ")}]) if you wanted a box`,
    );
  }
  const o = typeof opts === "number" ? { r: opts } : opts;
  const params = { radius: o.r ?? (o.d != null ? o.d / 2 : 5) };
  if (o.$fn ?? o.resolution) params.resolution = o.$fn ?? o.resolution;
  return node({ kind: "prim", code: "P.S", params, fix: IDENTITY });
}

// torus lies in the XY plane (OpenSCAD-ish), unlike the kernel's XZ default.
export function torus(opts = {}) {
  const params = {
    majorRadius: opts.r ?? opts.majorRadius ?? 10,
    tubeRadius: opts.tube ?? opts.tubeRadius ?? 2,
  };
  if (opts.arc != null) params.arc = opts.arc;
  if (opts.$fn ?? opts.resolution) params.resolution = opts.$fn ?? opts.resolution;
  return node({ kind: "prim", code: "P.T", params, fix: AXIS_FIX });
}

// Escape hatch: drive any kernel feature directly by its short code.
export function feature(code, params = {}) {
  return node({ kind: "prim", code, params, fix: IDENTITY });
}

// ------------------------------------------------------------ mesh imports

// Session registry of imported files: name -> ASCII STL text or a base64 data
// URL (binary STL / 3MF). The viewer's Import button fills this; code then
// references files by name so the model stays readable.
const IMPORTS = new Map();
let hullSeq = 0;          // unique names for hull() result meshes
export function registerImport(name, contents) {
  // The viewer converts binary STL to ASCII through the kernel before it gets
  // here, but the CLI has no such step — and a binary STL is what every slicer
  // exports. Decode it directly so `registerImport(name, readFileSync(path))`
  // just works headlessly; transforms need real vertices, not a blob.
  if (contents instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(contents))) {
    contents = decodeStlBytes(contents);
  }
  IMPORTS.set(name, contents);
  return contents;      // callers often want the decoded text to measure it
}

// Binary STL: 80-byte header, uint32 triangle count, then 50 bytes each
// (12 floats + a 2-byte attribute). Anything that already reads as ASCII is
// passed through untouched.
function decodeStlBytes(bytes) {
  const head = new TextDecoder().decode(bytes.subarray(0, 512));
  if (/^\s*solid/.test(head) && /facet\s+normal/.test(head)) {
    return new TextDecoder().decode(bytes);          // already ASCII
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint32(80, true);
  if (bytes.byteLength < 84 + count * 50) {
    throw new Error("that STL looks binary but is truncated — re-export it");
  }
  const f = (o) => dv.getFloat32(o, true);
  const out = ["solid imported"];
  for (let i = 0; i < count; i++) {
    const o = 84 + i * 50;
    out.push(`facet normal ${f(o)} ${f(o + 4)} ${f(o + 8)}`, "outer loop");
    for (let v = 0; v < 3; v++) {
      const p = o + 12 + v * 12;
      out.push(`vertex ${f(p)} ${f(p + 4)} ${f(p + 8)}`);
    }
    out.push("endloop", "endfacet");
  }
  out.push("endsolid imported");
  return out.join("\n");
}
export function listImports() { return [...IMPORTS.keys()]; }

// Baked-transform cache: rebuilds re-run compile constantly, and transforming
// a large STL's every vertex each keystroke would hurt.
const XFORM_CACHE = new Map();

function transformedImport(name, text, matrix) {
  const key = name + "|" + matrix.elements.map((v) => v.toFixed(5)).join(",");
  const hit = XFORM_CACHE.get(key);
  if (hit) return hit;

  const det = matrix.determinant();
  const v = new Vector3();
  const tri = [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("vertex")) {
      const [, x, y, z] = t.split(/\s+/);
      v.set(+x, +y, +z).applyMatrix4(matrix);
      tri.push([v.x, v.y, v.z]);
      continue;                                     // re-emitted at endloop
    }
    if (t.startsWith("facet")) { out.push("facet normal 0 0 0"); continue; }
    if (t.startsWith("outer loop")) { out.push("outer loop"); continue; }
    if (t.startsWith("endloop")) {
      // mirroring (negative determinant) flips winding — swap to stay outward
      const order = det < 0 ? [0, 2, 1] : [0, 1, 2];
      for (const i of order) {
        const p = tri[i];
        if (p) out.push(`vertex ${p[0]} ${p[1]} ${p[2]}`);
      }
      tri.length = 0;
      out.push("endloop");
      continue;
    }
    out.push(t);
  }
  const result = out.join("\n");
  XFORM_CACHE.set(key, result);
  if (XFORM_CACHE.size > 8) XFORM_CACHE.delete(XFORM_CACHE.keys().next().value);
  return result;
}

// The kernel imports meshes as MeshToBrep solids. Its Solid.clone() does
// `new this.constructor()` with no args, but MeshToBrep's constructor throws
// without a geometry — so ANY boolean that clones an imported solid as a tool
// dies with "MeshToBrep requires a THREE.BufferGeometry or THREE.Mesh" and the
// operation silently no-ops. We can't patch kernel files (its license asks for
// contribute-back on modification), but we can, at runtime, teach MeshToBrep's
// clone to masquerade as the base Solid class for the duration of the copy —
// the base constructor takes no args and clone() only copies geometry snapshots
// afterward, so the result is a valid, boolean-safe solid. Installed once,
// lazily, from a throwaway import (the class is only reachable via an instance).
const TETRA_STL = [
  "solid t",
  "facet normal 0 0 0\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet",
  "facet normal 0 0 0\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 0 1\n endloop\nendfacet",
  "facet normal 0 0 0\n outer loop\n  vertex 0 0 0\n  vertex 0 1 0\n  vertex 0 0 1\n endloop\nendfacet",
  "facet normal 0 0 0\n outer loop\n  vertex 1 0 0\n  vertex 0 1 0\n  vertex 0 0 1\n endloop\nendfacet",
  "endsolid t",
].join("\n");

let clonePatchState = null;   // null = untried, Promise while installing, true/false = done
async function ensureImportClonePatch(partHistory) {
  if (clonePatchState === true || clonePatchState === false) return clonePatchState;
  if (clonePatchState) return clonePatchState;
  clonePatchState = (async () => {
    try {
      const scratch = new partHistory.constructor();
      const f = await scratch.newFeature("IMPORT3D");
      f.inputParams.fileToImport = TETRA_STL;
      f.inputParams.centerMesh = false;
      await scratch.runHistory({ throwOnFeatureError: true });
      const solid = scratch.scene?.children?.find((o) => o.type === "SOLID");
      if (!solid) return false;
      const MeshToBrep = solid.constructor;
      const BaseSolid = Object.getPrototypeOf(MeshToBrep.prototype)?.constructor;
      if (!BaseSolid || MeshToBrep === BaseSolid || MeshToBrep.__brepscriptCloneSafe) return true;
      const origClone = MeshToBrep.prototype.clone;
      MeshToBrep.prototype.clone = function patchedClone() {
        const realCtor = this.constructor;
        try {
          Object.defineProperty(this, "constructor", { value: BaseSolid, configurable: true, writable: true });
          return origClone.apply(this, arguments);
        } finally {
          try { Object.defineProperty(this, "constructor", { value: realCtor, configurable: true, writable: true }); }
          catch (_) { /* leave masqueraded ctor — still a valid Solid */ }
        }
      };
      MeshToBrep.__brepscriptCloneSafe = true;
      return true;
    } catch (_) {
      return false;   // best-effort: transforms still work, booleans may no-op
    }
  })();
  clonePatchState = await clonePatchState;
  return clonePatchState;
}

// An imported mesh as a first-class solid: move it, rotate it, boolean it.
export function importedMesh(name, opts = {}) {
  if (typeof name !== "string" || !name) {
    throw new TypeError('importedMesh() needs the file name, e.g. importedMesh("part.stl")');
  }
  return node({ kind: "import", name, opts, fix: IDENTITY });
}

// ------------------------------------------------------------- 2D + extrude

// A 2D profile in the XY plane. Not a solid by itself — feed it to linearExtrude.
export function polygon(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new TypeError("polygon() needs at least 3 [x, y] points");
  }
  const pts = points.map((p, i) => {
    const x = Number(p?.[0]), y = Number(p?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError(`polygon() point ${i} isn't an [x, y] pair: ${JSON.stringify(p)}`);
    }
    return [x, y];
  });
  return { __brepscript2d: true, pts };
}

// linearExtrude({ h, center }, polygon([...])) — extrudes along +Z from z=0,
// matching OpenSCAD's linear_extrude.
export function linearExtrude(opts, profile) {
  const h = (typeof opts === "number" ? opts : opts?.h ?? opts?.height);
  if (!Number.isFinite(h) || h <= 0) throw new TypeError("linearExtrude() needs a positive height, e.g. linearExtrude({ h: 10 }, polygon([...]))");
  if (!profile?.__brepscript2d) {
    throw new TypeError("linearExtrude() takes a 2D profile — make one with polygon([[x,y], ...])");
  }
  // Normalise winding to CCW so the sketch face always points +Z.
  let area = 0;
  const pts = profile.pts;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  const ordered = area < 0 ? [...pts].reverse() : pts;
  const n = node({ kind: "prism", pts: ordered, h, fix: IDENTITY });
  return (typeof opts === "object" && opts?.center) ? translate([0, 0, -h / 2], n) : n;
}

// ---------------------------------------------------------------- transforms

function wrap(matrix, children, verb = "transform") {
  const kids = collect(children);
  if (!kids.length) {
    // A transform with nothing to transform is the usual "translate([...])"
    // typo — say so plainly instead of the cryptic union() error underneath.
    const example = verb === "translate" ? "translate([10, 0, 0], cube([10, 10, 10]))"
      : verb === "rotate" ? "rotate([0, 0, 45], cube([20, 10, 5]))"
      : `${verb}(…, cube([10, 10, 10]))`;
    throw new Error(`${verb}() needs a shape to work on — put one after the values, e.g. ${example}`);
  }
  const child = kids.length === 1 ? kids[0] : union(kids);
  return node({ kind: "xform", matrix, child });
}

export function translate(v, ...children) {
  const [x, y, z] = Array.isArray(v) ? v : [v, 0, 0];
  return wrap(new Matrix4().makeTranslation(x, y, z), children, "translate");
}

// rotate([rx,ry,rz]) in DEGREES (the kernel uses degrees for rotationEuler).
export function rotate(v, ...children) {
  const [rx, ry, rz] = Array.isArray(v) ? v : [0, 0, v];
  const m = new Matrix4().makeRotationFromEuler(new Euler(rx * DEG, ry * DEG, rz * DEG, "XYZ"));
  return wrap(m, children, "rotate");
}

export function scale(v, ...children) {
  const [x, y, z] = Array.isArray(v) ? v : [v, v, v];
  return wrap(new Matrix4().makeScale(x, y, z), children, "scale");
}

export function mirror(v, ...children) {
  const [x, y, z] = Array.isArray(v) ? v : [1, 0, 0];
  // Householder reflection about the plane with normal v through the origin.
  const n = new Vector3(x, y, z).normalize();
  const m = new Matrix4().set(
    1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
    -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
    -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
    0, 0, 0, 1,
  );
  return wrap(m, children, "mirror");
}

// ----------------------------------------------------------------- booleans

const op = (operation) => (...children) => {
  const kids = collect(children);
  if (!kids.length) throw new Error(`${operation.toLowerCase()}() needs at least one shape`);
  if (kids.length === 1) return kids[0];
  return node({ kind: "op", operation, children: kids });
};

export const union = op("UNION");
export const difference = op("SUBTRACT");
export const intersection = op("INTERSECT");

// ---------------------------------------------------------------------- hull
//
// Convex hull of one or more solids — the smallest convex shape that wraps them
// all (OpenSCAD's hull()). The kernel has no hull feature, so we build the
// children in a scratch history, take every surface vertex, compute the 3D
// convex hull (three's ConvexGeometry), and import the resulting mesh as a
// solid. Great for smooth swept connectors and sloped lips.
export function hull(...children) {
  const kids = collect(children);
  if (!kids.length) throw new Error("hull() needs at least one shape");
  return node({ kind: "hull", children: kids, fix: IDENTITY });
}

// ------------------------------------------------------------- freeform
//
// A solid defined by its CORNERS rather than by width/depth/height. This is what
// a primitive cannot be: cube([30,30,12]) is three numbers with nowhere to
// record a corner that has moved, so skewing one is not expressible. Listing the
// corners outright is, and each point stays an editable number in the source.
//
// Built as the convex hull of a tiny marker at each point, which is the only
// route the kernel offers to an arbitrary polyhedron. `bead` is the marker
// radius: small enough to ignore (0.01mm, well under a nozzle) but not zero,
// since a hull needs volume to work with. Raise it deliberately for rounded
// corners.
//
// Convex only, by construction. Points that fall inside the hull of the others
// simply have no effect.
export function freeform(points, opts = {}) {
  const pts = Array.isArray(points) ? points.filter((p) => Array.isArray(p) && p.length >= 3
    && p.every((n) => Number.isFinite(n))) : [];
  if (pts.length < 4) {
    throw new TypeError("freeform() needs at least 4 corner points, e.g. freeform([[0,0,0], [10,0,0], [10,10,0], [0,0,10]]) — press Free-form and drag a corner and the editor fills this in");
  }
  const bead = Math.max(0.001, opts.bead ?? opts.r ?? 0.01);
  // A CUBE, not a sphere. The marker is 0.01mm, far under a nozzle, so its
  // shape cannot matter to the print, but it matters a lot downstream: every
  // marker vertex is a hull vertex, and every hull facet becomes hidden-line
  // geometry in the blueprint. A sphere contributes hundreds of points (the
  // STEP path meshes it analytically, ignoring $fn); a cube contributes eight.
  // Eight spheres made a 1.7MB SVG.
  return hull(...pts.map((p) => translate([p[0], p[1], p[2]],
    cube([bead, bead, bead], { center: true }))));
}

// The 8 corners of an axis-aligned box, in the order the viewer's corner
// handles are spawned, so a dragged handle maps to a known index.
export function boxCorners(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const out = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push([x, y, z]);
  return out;
}

// Tag a shape with a colour. The compiler has always threaded `n.color` down
// the tree and recorded it against every feature it reaches — the viewer paints
// from it, and two or more colours export as a 3MF colour group so a
// multi-material printer assigns a filament per colour. What was missing was
// the way to SET it: the prompt and a comment in this file both referred to
// colorize() as though it existed, so every model that tried to colour anything
// failed with "colorize isn't a BREPcode word". This is that function.
//
// Accepts what people actually write: colorize([1, 0.84, 0], part) with 0–1
// components, [255, 215, 0] with 0–255, or a "#rrggbb" string.
export function colorize(color, ...children) {
  const kids = collect(children);
  if (!kids.length) throw new Error('colorize() needs a shape, e.g. colorize("#d4af37", cube([10, 10, 10]))');
  const shape = kids.length === 1 ? kids[0] : group(...kids);
  return node({ ...shape, color: normaliseColor(color) });
}

// Emissive tag — the same threading, for a part that should glow.
export function glow(color, intensity, ...children) {
  const kids = collect(children);
  if (!kids.length) throw new Error('glow() needs a shape, e.g. glow("#39ff14", 2, sphere({ r: 10 }))');
  const shape = kids.length === 1 ? kids[0] : group(...kids);
  const em = normaliseColor(color);
  return node({ ...shape, color: shape.color ?? em, emissive: em, emissiveInt: Number(intensity) || 1 });
}

function normaliseColor(c) {
  if (typeof c === "string") {
    const s = c.trim();
    if (/^#?[0-9a-f]{6}$/i.test(s)) return "#" + s.replace("#", "").toLowerCase();
    if (/^#?[0-9a-f]{3}$/i.test(s)) {
      const h = s.replace("#", "");
      return "#" + [...h].map((ch) => ch + ch).join("").toLowerCase();
    }
    throw new TypeError(`colorize(): "${c}" isn't a colour — use "#d4af37" or [r, g, b]`);
  }
  if (Array.isArray(c) && c.length >= 3) {
    // 0–1 floats and 0–255 bytes are both common; anything above 1 means bytes
    const max = Math.max(c[0], c[1], c[2]);
    const to255 = (v) => Math.max(0, Math.min(255, Math.round(max <= 1 ? v * 255 : v)));
    return "#" + c.slice(0, 3).map((v) => to255(v).toString(16).padStart(2, "0")).join("");
  }
  throw new TypeError('colorize(): give a colour as "#d4af37" or [r, g, b]');
}

// A loose collection of solids kept SEPARATE (no boolean) — a scene/assembly.
// This is what a JSCAD main() returning an array means, and it avoids the huge
// cost of unioning dozens of parts just to display them (each stays its own
// solid, so colours and clicks work per-piece).
export function group(...children) {
  const kids = collect(children);
  if (!kids.length) throw new Error("group() needs at least one shape");
  if (kids.length === 1) return kids[0];
  return node({ kind: "group", children: kids });
}

// ------------------------------------------------------------------ stretch
//
// Cut a model at a plane and widen the middle — the classic "make this tray
// 3 inches wider but keep the details on both ends" edit, and it works on
// importedMesh() parts too. The middle is filled with the model's own
// cross-section geometry: a thin slice is taken at the cut plane and scaled
// along the axis to bridge the gap, so anywhere the model is locally prismatic
// (walls, rails, channels) the extension is exact. Detail that crosses the cut
// plane gets stretched with it — cut through a plain region, not a screw hole.
//
//   stretch({ axis: "x", by: 76.2, at: 0 }, importedMesh("tray.stl"))
//
// This is a macro over existing ops (intersection with half-space boxes, a
// scaled slice, union), so every downstream path — booleans, exports, imported
// meshes with baked transforms — just works. Reusing the child subtree in the
// three branches is safe: compile() never mutates nodes.
export function stretch(opts, ...children) {
  const o = (typeof opts === "number") ? { by: opts } : (opts || {});
  const axisName = String(o.axis ?? "x").toLowerCase();
  const ax = { x: 0, y: 1, z: 2 }[axisName];
  if (ax === undefined) {
    throw new TypeError(`stretch() axis must be "x", "y" or "z" — got ${JSON.stringify(o.axis)}`);
  }
  const by = o.by ?? o.gap ?? o.amount;
  if (!Number.isFinite(by) || by === 0) {
    throw new TypeError('stretch() needs how far to resize, e.g. stretch({ axis: "x", by: 25 }, shape) — 25 adds 25mm through the middle, -25 removes 25mm');
  }
  const at = o.at ?? 0;         // where the cut plane sits — pick a plain spot
  const t = o.slice ?? 1;       // thickness of the sampled cross-section slice
  const BIG = o.big ?? 1000;    // half-space box size — larger than any part

  const kids = collect(children);
  if (!kids.length) {
    throw new Error('stretch() needs a shape to work on — e.g. stretch({ axis: "x", by: 25 }, importedMesh("tray.stl"))');
  }
  const shape = kids.length === 1 ? kids[0] : union(kids);

  // an axis-aligned box spanning [lo, hi] on the stretch axis, huge elsewhere
  const box = (lo, hi) => {
    const size = [BIG, BIG, BIG]; size[ax] = hi - lo;
    const pos = [-BIG / 2, -BIG / 2, -BIG / 2]; pos[ax] = lo;
    return translate(pos, cube(size));
  };
  const along = (v) => { const out = [0, 0, 0]; out[ax] = v; return out; };
  const scaleAlong = (k) => { const out = [1, 1, 1]; out[ax] = k; return out; };

  // Negative `by` SHRINKS: cut a slab of |by| centred on `at` clean out of the
  // middle and slide the far half back to meet the near one. It's the exact
  // inverse of the widen below — "scale the part up, then take the middle back
  // out" leaves the outside its original size with everything near the edges
  // (rails, walls, bosses) as thick as the scale made them. Anything that lived
  // inside the removed slab is gone, which is the point.
  if (by < 0) {
    const half = -by / 2;
    const near = intersection(shape, box(at - BIG, at - half));
    const far = translate(along(by), intersection(shape, box(at + half, at + BIG)));
    return union(near, far);
  }

  const low = intersection(shape, box(at - BIG, at));
  const high = translate(along(by), intersection(shape, box(at, at + BIG)));
  // slice spans [at - t/2, at + t/2]; shift to 0, scale to length t + by, shift
  // back — it now spans [at - t/2, at + t/2 + by], overlapping both halves by
  // t/2 so the union heals into one solid.
  const slice = intersection(shape, box(at - t / 2, at + t / 2));
  const bridge = translate(along(at - t / 2),
    scale(scaleAlong((by + t) / t),
      translate(along(-(at - t / 2)), slice)));
  return union(low, bridge, high);
}

// -------------------------------------------------------------------- drill
//
// A cylindrical cutter aimed along a surface normal — the workhorse behind
// click-to-drill. `point` is a spot on the surface, `dir` its outward normal;
// the cutter is centred on that point, aligned with the normal, and bores
// `depth` into the material (poking a hair proud so difference() cuts cleanly).
//
//   difference(importedMesh("bracket.stl"), drill([12, 0, 8], [0, 0, 1], { d: 4 }))
//
// Options: d / dia (diameter, default 4), depth (how deep, default 12),
// through (bore all the way, ~1000mm), proud (overshoot past the face, 0.6).
// It's a plain xform over cylinder(), so booleans/exports/imports all just work.
export function drill(point, dir, opts = {}) {
  const p = Array.isArray(point) ? point : [0, 0, 0];
  let n = new Vector3(...(Array.isArray(dir) ? [dir[0] ?? 0, dir[1] ?? 0, dir[2] ?? 1] : [0, 0, 1]));
  if (n.lengthSq() < 1e-9) n.set(0, 0, 1);
  n.normalize();
  const d = opts.d ?? opts.dia ?? opts.diameter ?? (opts.r ? opts.r * 2 : 4);
  const depth = opts.through ? 1000 : (opts.depth ?? opts.h ?? 12);
  const proud = opts.proud ?? 0.6;
  // a +Z cylinder shifted down to span [-depth, +proud] about the origin,
  // then aimed so +Z points along the normal and dropped onto `point`.
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
  const m = new Matrix4().makeRotationFromQuaternion(q).setPosition(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
  const cyl = translate([0, 0, -depth], cylinder({ d, h: depth + proud }));
  return node({ kind: "xform", matrix: m, child: cyl });
}

// --------------------------------------------------------------------- fins
//
// Removable print supports: triangular buttress fins standing next to one face
// of the model, touching it only through small breakaway sprue nubs — print,
// then snip the sprues and the whole fin pops off. The Fins button in the
// editor header measures `at` for you; every knob stays editable in code:
//
//   fins({
//     side: "-x",            // which face they lean on: "+x", "-x", "+y", "-y"
//     count: 3,              // fins, spaced evenly along that side
//     sprues: 3,             // breakaway nubs per fin
//     height: 40,            // how high up the fins reach
//     depth: 14,             // how far the fin extends out from the part
//     skirt: 5,              // size of the triangular foot on the bed
//     at: [faceX, y0, y1],   // the face's coordinate + the span to cover
//   }, importedMesh("mini.stl"))
//
// Two options exist for parts that are NOT a solid slab — a frame, a bracket,
// anything with holes — where evenly spaced sprues would jab into thin air:
//
//   positions: [-40, 0, 40]   // put the fins at exactly these coordinates
//   sprueAt: [6, 22, 40]      // put the sprues at exactly these heights
//   sprueAt: [[6, 22], [10]]  // …or per fin (one inner array per fin)
//
// A sprue entry may also be { z, reach } when the face is recessed at that
// height and the nub has to stretch further to reach it. The Fins button fills
// all of this in for you by probing the model — see probeSprues() in the viewer.
//
// The fins come back as SEPARATE solids grouped with the model (no boolean
// against it), so they stay individually clickable/colourable and the part
// itself is untouched — the only contact is the sprues overlapping ~0.4mm.
export function fins(opts, ...children) {
  const o = opts || {};
  const YAW = { "+x": 0, "-x": 180, "+y": 90, "-y": -90 };
  const side = String(o.side ?? "-x");
  if (!(side in YAW)) {
    throw new TypeError(`fins() side must be "+x", "-x", "+y" or "-y" — got ${JSON.stringify(o.side)}`);
  }
  const height = o.height ?? 30;
  if (!(height > 0)) throw new TypeError("fins() needs a positive height — how high up the fins reach");
  // The buttress leans back at `angle` degrees from vertical. 45° is the
  // classic printable slope (steeper than that and the sloping face starts
  // needing support of its own), so that's the default; `depth` overrides it.
  const angle = Math.max(5, Math.min(80, o.angle ?? 45));
  // `lean` tilts the fin's CONTACT edge to match a part that isn't vertical —
  // print something at 45° and its face runs away from a plumb buttress, so
  // every tooth would need a different (and eventually absurd) reach. Sloping
  // the edge by the same angle keeps all the teeth short and even.
  //
  // The DEFAULT is 45, because the whole point of these supports is holding a
  // part printed on a slant; pass lean: 0 for a plumb wall. Any angle works —
  // the tool measures the real face and fills this in.
  const lean = Math.max(0, Math.min(80, o.lean ?? 45));
  const leanRun = height * Math.tan(lean * DEG);   // sideways travel over the height
  // `maxDepth` keeps the fins inside the part's own footprint — a 45° buttress
  // on a tall part would otherwise stick out further than the part is wide and
  // double the plate area for no extra hold. The Fins tool measures it for you.
  const wanted = o.depth ?? Math.max(4, height * Math.tan(angle * DEG) + leanRun);
  const depth = Number.isFinite(o.maxDepth) ? Math.max(leanRun + 2, Math.min(wanted, o.maxDepth)) : wanted;
  const skirt = Math.max(0, o.skirt ?? 5);
  // Everything thin is sized off the NOZZLE, because a support that isn't a
  // whole number of extrusion widths prints as a ragged, weak wall. 0.4 is the
  // common default; set nozzle: 0.6 and the fin, teeth and clearance all scale
  // together. `thickness` still wins if you want to set the width outright.
  const nozzle = Math.max(0.1, o.nozzle ?? 0.4);
  const t = o.thickness ?? Math.round((nozzle * 3) * 100) / 100;   // 3 perimeters
  const gap = o.gap ?? Math.max(0.8, nozzle * 2);   // daylight between fin and part
  // Teeth, not nubs: each is a tiny triangle whose tip stops `clearance` SHORT
  // of the surface, so a clean print never fuses them to the part — they only
  // catch it if it starts to lean. Half a nozzle width is about the tightest gap
  // that reliably stays open; below that the slicer bridges it and you get the
  // worst of both worlds (fused AND fiddly to cut off). Note the tooth lives
  // inside `gap`, so a clearance wider than the gap has nowhere to go — it
  // clamps to a stub rather than inverting into a tooth that pokes backwards.
  const clearance = Math.max(0, o.clearance ?? Math.max(0.2, nozzle * 0.5));
  const toothH = o.tooth ?? o.sprueD ?? Math.max(2, nozzle * 5);   // tooth height
  const toothT = o.toothThickness ?? t;        // and how thick, across the fin
  const z0 = o.z0 ?? 0;
  const at = o.at;
  if (!Array.isArray(at) || at.length < 3 || at.some((n) => !Number.isFinite(n))) {
    throw new TypeError("fins() needs at: [faceCoordinate, spanStart, spanEnd] — press the Fins button in the editor header and it measures these from your model");
  }
  const explicitPos = Array.isArray(o.positions) && o.positions.length
    ? o.positions.filter((n) => Number.isFinite(n)) : null;
  const count = explicitPos ? explicitPos.length
    : Math.max(1, Math.min(24, Math.round(o.count ?? 3)));
  const sprues = Math.max(0, Math.min(12, Math.round(o.sprues ?? 3)));

  const kids = collect(children);
  if (!kids.length) throw new Error('fins() needs the shape to support, e.g. fins({ ... }, importedMesh("part.stl"))');
  const model = kids.length === 1 ? kids[0] : union(kids);

  // Which heights get a nub on fin `i`. Default is evenly spaced up the fin;
  // sprueAt overrides that — either one shared list, or one list per fin (an
  // array of arrays), which is what lets a probe skip the holes in a frame.
  const sprueList = (i) => {
    const s = o.sprueAt;
    let list = null;
    if (Array.isArray(s) && s.length) {
      list = Array.isArray(s[0]) ? (s[Math.min(i, s.length - 1)] || []) : s;
    }
    if (!list) list = Array.from({ length: sprues }, (_, k) => (height * (k + 1)) / (sprues + 1));
    // `reach` is how far a tooth reaches from the fin's inner edge toward the
    // part. The default stops `clearance` short of the face plane; a probed
    // entry carries its own measured reach for a recessed face.
    const fallback = Math.max(0.2, gap - clearance);
    return list
      .map((e) => (typeof e === "number" ? { z: e, reach: fallback }
        : { z: e?.z, reach: Number.isFinite(e?.reach) ? e.reach : fallback }))
      .filter((e) => Number.isFinite(e.z));
  };

  // One fin in LOCAL space: the model face is the plane x = 0, the fin extends
  // toward +x, centred on y = 0, sitting on z = 0.
  //  - plate: right triangle (vertical edge by the part, hypotenuse sloping out)
  //  - skirt: thin triangular foot on the bed for adhesion
  //  - sprues: little horizontal pins bridging the gap into the part
  // A flat profile standing in the fin's own plane: polygon x runs out from the
  // part, polygon y runs up, and `thick` is measured across the fin.
  const inPlane = (pts, thick) => translate([0, t / 2, 0],
    rotate([90, 0, 0], translate([0, 0, -thick / 2],
      linearExtrude({ h: thick }, polygon(pts)))));

  // The contact edge at height z: plumb when lean is 0, sloping away with the
  // part when it isn't.
  const innerX = (z) => gap + z * Math.tan(lean * DEG);

  // Where the fin's OUTER (sloping) edge sits at height z — the hypotenuse runs
  // from the base's outer corner up to the top of the contact edge.
  const outerX = (z) => (gap + depth) + (z / height) * (innerX(height) - (gap + depth));

  const makeFin = (zs) => {
    const parts = [inPlane([[gap, 0], [gap + depth, 0], [innerX(height), height]], t)];
    if (skirt > 0.05) {
      parts.push(linearExtrude({ h: 0.8 }, polygon([
        [gap, -(t / 2 + skirt)], [gap + Math.min(depth, skirt * 2.5), 0], [gap, t / 2 + skirt],
      ])));
    }
    // Sprues: a bar the same width as the fin, ROOTED INSIDE the plate and
    // running out to a hair short of the part. Starting it inside is the whole
    // trick — no lean, angle or height can open a gap between fin and sprue,
    // because the two overlap by construction. Flat on top so it prints as a
    // clean ledge; the underside slopes up to meet the tip.
    for (const s of zs) {
      const edge = innerX(s.z);
      const tip = edge - Math.max(0.05, s.reach);
      // bite far enough into the plate to weld, but never out through its back
      const room = Math.max(0, outerX(s.z) - edge);
      const root = edge + Math.max(0.8, Math.min(4, room * 0.6));
      const h = Math.max(0.6, toothH);
      parts.push(inPlane([[root, s.z - h], [root, s.z], [tip, s.z]], toothT));
    }
    return union(...parts);
  };

  const [face, s0, s1] = at;
  const yaw = YAW[side];
  const alongX = side === "+y" || side === "-y";   // ±y faces spread fins along X
  const out = [model];
  for (let i = 0; i < count; i++) {
    const li = explicitPos ? explicitPos[i] : s0 + ((i + 0.5) * (s1 - s0)) / count;
    const zs = sprueList(i);
    if (!zs.length && o.sprueAt) continue;   // probed as "no material here" — skip the fin
    const pos = alongX ? [li, face, z0] : [face, li, z0];
    out.push(translate(pos, rotate([0, 0, yaw], makeFin(zs))));
  }
  if (out.length === 1) throw new Error("fins(): none of the fins had anything to attach to — check `at` and `positions` against the model's bounding box");
  return group(...out);
}

// ------------------------------------------------------ fillet / chamfer
//
// Round or bevel a solid's edges. Edge picking is face-based (the only thing
// that's reliable in code): fillet(2, shape) rounds EVERY edge; passing a
// side name rounds just that face's edges. Under the hood the kernel resolves
// the selected faces to their shared edges.
const SIDE_ALIASES = { top: "_PZ", bottom: "_NZ", front: "_NY", back: "_PY", left: "_NX", right: "_PX" };

function edgeOp(code, opts, children, amountKey, verb) {
  const o = typeof opts === "number" ? {} : (opts || {});
  const amount = typeof opts === "number" ? opts
    : (o.r ?? o.radius ?? o.d ?? o.distance ?? o.size ?? o.amount);
  if (!(amount > 0)) {
    throw new TypeError(`${verb}() needs a positive ${amountKey}, e.g. ${verb}(2, cube([20, 20, 20]))`);
  }
  const kids = collect(children);
  if (!kids.length) throw new Error(`${verb}() needs a shape to work on`);
  const child = kids.length === 1 ? kids[0] : union(kids);
  const faces = o.faces ?? o.sides ?? o.only ?? "all";
  return node({ kind: "edgeop", code, amount, faces, child });
}

export function fillet(opts, ...children) { return edgeOp("F", opts, children, "radius", "fillet"); }
export function chamfer(opts, ...children) { return edgeOp("CH", opts, children, "distance", "chamfer"); }

// ------------------------------------------------------------- revolve
//
// Spin a 2D profile around the vertical axis (x = 0) to make a lathe/turned
// shape — vases, bottles, knobs. The profile must live in the x >= 0 half and
// include an edge that lies on x = 0; that edge is the spin axis.
export function revolve(opts, profile) {
  const o = typeof opts === "number" ? { angle: opts } : (opts || {});
  const angle = o.angle ?? o.deg ?? o.a ?? 360;
  if (!profile?.__brepscript2d) {
    throw new TypeError("revolve() takes a 2D profile — make one with polygon([[x, y], ...]) in the x >= 0 half-plane, touching x = 0");
  }
  const res = o.$fn ?? o.resolution;
  return node({ kind: "revolve", pts: profile.pts, angle, resolution: res, fix: AXIS_FIX });
}

// ------------------------------------------------------------------ compile

// Walks the shape tree and emits kernel features, baking accumulated transforms
// into each primitive's own transform block.
//
// `trace`, if given, collects {id, code} for every primitive in emission order —
// the viewer uses it to map a clicked mesh (whose face names carry the feature
// id) back to the primitive call in the source text.
// opts.keepCutters: skip SUBTRACT booleans so cutter solids survive as free
// solids — the viewer's "show negatives" overlay builds its dashed outlines
// from that pass. Trace entries for subtracted shapes get negative: true in
// every pass.
export async function compile(root, partHistory, trace = null, opts = {}) {
  if (!isNode(root)) throw new TypeError("compile() expects a shape built with the BrepScript DSL");

  // Fillet/chamfer pick edges by face, and face names only exist once the
  // solid is built — so run the history so far, find the child's solid, and
  // read its real face names. runHistory rebuilds from scratch each call
  // (idempotent), so an intermediate run here is safe; the caller's final run
  // just rebuilds the same graph plus whatever comes after.
  async function childFaceNames(childId, filter) {
    await partHistory.runHistory({ throwOnFeatureError: true });
    const solids = (partHistory.scene?.children || []).filter((o) => o.type === "SOLID");
    let solid = solids.find((s) => s.name === childId)
      || solids.find((s) => { let hit = false; s.traverse((f) => { if (f.type === "FACE" && String(f.name || "").startsWith(childId)) hit = true; }); return hit; })
      || solids[solids.length - 1];
    if (!solid) return [];
    const names = [];
    solid.traverse((f) => { if (f.type === "FACE" && f.name) names.push(f.name); });
    if (filter === "all" || !filter) return names;
    const want = (Array.isArray(filter) ? filter : [filter]).flatMap(
      (w) => (w === "sides" ? ["_PX", "_NX", "_PY", "_NY"] : [SIDE_ALIASES[w] || w]));
    const matched = names.filter((nm) => want.some((sfx) => nm.endsWith(sfx)));
    return matched.length ? matched : names;   // unknown side name → round everything rather than nothing
  }

  // A `style` (colour + optional emissive glow, from colorize()/glow()) threads
  // down the tree and is recorded in the trace against every feature it reaches,
  // so the viewer can paint and light them.
  const emit = async (n, matrix, style = null) => {
    const col = n.color ?? style?.color ?? null;
    const em = n.emissive ?? style?.emissive ?? null;
    const emi = n.emissiveInt ?? style?.emissiveInt ?? 1;
    const st = { color: col, emissive: em, emissiveInt: emi };
    if (n.kind === "xform") {
      return emit(n.child, new Matrix4().multiplyMatrices(matrix, n.matrix), st);
    }

    if (n.kind === "prim") {
      const f = await partHistory.newFeature(n.code);
      Object.assign(f.inputParams, n.params);

      const world = new Matrix4().multiplyMatrices(matrix, n.fix);
      const pos = new Vector3(), quat = new Quaternion(), scl = new Vector3();
      world.decompose(pos, quat, scl);
      const e = new Euler().setFromQuaternion(quat, "XYZ");

      f.inputParams.transform = {
        position: [pos.x, pos.y, pos.z],
        rotationEuler: [
          MathUtils.radToDeg(e.x),
          MathUtils.radToDeg(e.y),
          MathUtils.radToDeg(e.z),
        ],
        scale: [scl.x, scl.y, scl.z],
      };
      trace?.push({ id: f.inputParams.id, code: n.code, color: col, emissive: em, emissiveInt: emi });
      return f.inputParams.id;
    }

    if (n.kind === "prism") {
      // Plane -> Sketch -> Extrude. The sketch lives on the world XY plane, so
      // the accumulated matrix is applied afterwards with a Transform feature.
      const plane = await partHistory.newFeature("P");
      plane.inputParams.orientation = "XY";

      const sk = await partHistory.newFeature("S");
      sk.inputParams.sketchPlane = plane.inputParams.id;
      sk.persistentData.sketch = {
        points: n.pts.map(([x, y], i) => ({ id: i, x, y, fixed: i === 0 })),
        geometries: n.pts.map((_, i) => ({
          id: 100 + i, type: "line", points: [i, (i + 1) % n.pts.length], construction: false,
        })),
        constraints: [{ id: 0, type: "⏚", points: [0] }],
      };

      const ex = await partHistory.newFeature("E");
      ex.inputParams.profile = sk.inputParams.id;
      ex.inputParams.distance = 0;
      ex.inputParams.distanceBack = n.h;   // distanceBack extrudes +Z: z in [0, h]

      const world = new Matrix4().multiplyMatrices(matrix, n.fix);
      if (!world.equals(IDENTITY)) {
        const pos = new Vector3(), quat = new Quaternion(), scl = new Vector3();
        world.decompose(pos, quat, scl);
        const e = new Euler().setFromQuaternion(quat, "XYZ");
        const xf = await partHistory.newFeature("XFORM");
        xf.inputParams.solids = [ex.inputParams.id];
        xf.inputParams.translate = [pos.x, pos.y, pos.z];
        xf.inputParams.rotateEulerDeg = [
          MathUtils.radToDeg(e.x), MathUtils.radToDeg(e.y), MathUtils.radToDeg(e.z),
        ];
        xf.inputParams.scale = [scl.x, scl.y, scl.z];
      }
      trace?.push({ id: ex.inputParams.id, code: "E", color: col, emissive: em, emissiveInt: emi });
      return ex.inputParams.id;
    }

    if (n.kind === "import") {
      let data = IMPORTS.get(n.name);
      if (data == null) {
        throw new Error(`importedMesh("${n.name}"): no imported file by that name — use the Import button first`);
      }
      // Make imported solids safe to clone so they can act as boolean tools.
      await ensureImportClonePatch(partHistory);
      // The import feature has no transform block, and the kernel's Transform
      // feature fails on imported solids (its clone path re-runs MeshToBrep
      // without geometry). So transforms are BAKED into the STL text instead.
      const world = new Matrix4().multiplyMatrices(matrix, n.fix);
      if (!world.equals(IDENTITY)) {
        if (!/^\s*solid/.test(data)) {
          throw new Error(`importedMesh("${n.name}"): only ASCII-STL imports can be transformed — re-import the file through the Import button (it converts automatically)`);
        }
        data = transformedImport(n.name, data, world);
      }

      const f = await partHistory.newFeature("IMPORT3D");
      f.inputParams.fileToImport = data;
      f.inputParams.centerMesh = !!n.opts.center;
      f.inputParams.meshRepairLevel = n.opts.repair ?? "NONE";
      if (n.opts.deflectionAngle) f.inputParams.deflectionAngle = n.opts.deflectionAngle;
      // split disconnected islands into separate solids — a multi-part STL/3MF
      // (an assembly) comes in as individually selectable/movable bodies. Harmless
      // on a single connected part (still one solid).
      if (n.opts.split ?? n.opts.separate) f.inputParams.extractMultipleSolids = true;
      trace?.push({ id: f.inputParams.id, code: "IMPORT3D", color: col, emissive: em, emissiveInt: emi });
      return f.inputParams.id;
    }

    if (n.kind === "edgeop") {
      const childId = await emit(n.child, matrix, st);
      const faces = await childFaceNames(childId, n.faces);
      if (!faces.length) {
        throw new Error(`${n.code === "F" ? "fillet" : "chamfer"}(): couldn't find any edges to work on for this shape`);
      }
      const f = await partHistory.newFeature(n.code);
      f.inputParams.edges = faces;
      f.inputParams.direction = "AUTO";
      if (n.code === "F") f.inputParams.radius = n.amount;
      else f.inputParams.distance = n.amount;
      // the fillet/chamfer modifies the target in place, keeping its id — so
      // downstream booleans still reference childId, and clicks still map to
      // the original primitive's trace entry.
      return childId;
    }

    if (n.kind === "revolve") {
      const plane = await partHistory.newFeature("P");
      plane.inputParams.orientation = "XY";
      const sk = await partHistory.newFeature("S");
      sk.inputParams.sketchPlane = plane.inputParams.id;
      const pts = n.pts;
      sk.persistentData.sketch = {
        points: pts.map(([x, y], i) => ({ id: i, x, y, fixed: i === 0 })),
        geometries: pts.map((_, i) => ({
          id: 100 + i, type: "line", points: [i, (i + 1) % pts.length], construction: false,
        })),
        constraints: [{ id: 0, type: "⏚", points: [0] }],
      };
      // the spin axis is the profile edge lying on x = 0
      let axisIdx = -1;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if (Math.abs(a[0]) < 1e-6 && Math.abs(b[0]) < 1e-6) { axisIdx = i; break; }
      }
      if (axisIdx < 0) {
        throw new Error("revolve(): the profile needs an edge on the x = 0 axis (two consecutive points with x = 0) — that edge is the spin axis. Keep every point at x >= 0.");
      }
      const rev = await partHistory.newFeature("R");
      rev.inputParams.profile = sk.inputParams.id;
      rev.inputParams.axis = `${sk.inputParams.id}:G${100 + axisIdx}`;
      rev.inputParams.angle = n.angle;
      if (n.resolution) rev.inputParams.resolution = n.resolution;

      // the kernel spins about the sketch's vertical (world Y); AXIS_FIX stands
      // the result up on Z, then the accumulated transform places it.
      const world = new Matrix4().multiplyMatrices(matrix, n.fix);
      if (!world.equals(IDENTITY)) {
        const pos = new Vector3(), quat = new Quaternion(), scl = new Vector3();
        world.decompose(pos, quat, scl);
        const e = new Euler().setFromQuaternion(quat, "XYZ");
        const xf = await partHistory.newFeature("XFORM");
        xf.inputParams.solids = [rev.inputParams.id];
        xf.inputParams.translate = [pos.x, pos.y, pos.z];
        xf.inputParams.rotateEulerDeg = [
          MathUtils.radToDeg(e.x), MathUtils.radToDeg(e.y), MathUtils.radToDeg(e.z),
        ];
        xf.inputParams.scale = [scl.x, scl.y, scl.z];
      }
      trace?.push({ id: rev.inputParams.id, code: "R" });
      return rev.inputParams.id;
    }

    if (n.kind === "group") {
      // emit each child as its own solid — no boolean, so it's fast and every
      // piece keeps its own id/colour. The scene collects them all.
      let last = null;
      for (const child of n.children) last = await emit(child, matrix, st);
      return last;
    }

    if (n.kind === "op") {
      const ids = [];
      for (const child of n.children) ids.push(await emit(child, matrix, st));
      const [target, ...tools] = ids;
      if (n.operation === "SUBTRACT" && trace) {
        for (const t of trace) if (tools.includes(t.id)) t.negative = true;
      }
      if (opts.keepCutters && n.operation === "SUBTRACT") return target;
      const b = await partHistory.newFeature("B");
      b.inputParams.targetSolid = target;
      b.inputParams.boolean = { targets: tools, operation: n.operation };
      // A boolean keeps the target solid's identity, so downstream ops chain off it.
      return target;
    }

    if (n.kind === "hull") {
      // Build the children in a throwaway history so we can read their real
      // surface vertices, take the 3D convex hull of them all, and import that
      // hull mesh as the result. Children never enter the main history, so only
      // the hull renders. ConvexGeometry is loaded on demand (hull is rare).
      const scratch = new partHistory.constructor();
      for (const child of n.children) await compile(child, scratch);
      await scratch.runHistory({ throwOnFeatureError: true });
      const { ConvexGeometry } = await import("three/addons/geometries/ConvexGeometry.js");
      const pts = [];
      for (const s of (scratch.scene?.children || [])) {
        if (s.type !== "SOLID") continue;
        s.updateMatrixWorld(true);
        s.traverse((o) => {
          const pa = o.type === "FACE" ? o.geometry?.attributes?.position : null;
          if (!pa) return;
          for (let i = 0; i < pa.count; i++) {
            pts.push(new Vector3().fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld));
          }
        });
      }
      if (pts.length < 4) throw new Error("hull(): the shapes have too little geometry to hull");
      const pos = new ConvexGeometry(pts).attributes.position;
      let stl = "solid hull\n";
      for (let i = 0; i < pos.count; i += 3) {
        stl += "facet normal 0 0 0\nouter loop\n";
        for (let k = 0; k < 3; k++) stl += `vertex ${pos.getX(i + k)} ${pos.getY(i + k)} ${pos.getZ(i + k)}\n`;
        stl += "endloop\nendfacet\n";
      }
      stl += "endsolid hull\n";

      // import the hull mesh, baking the accumulated transform into the STL
      await ensureImportClonePatch(partHistory);
      const name = `__hull${hullSeq++}`;
      let data = stl;
      const world = new Matrix4().multiplyMatrices(matrix, n.fix);
      if (!world.equals(IDENTITY)) data = transformedImport(name, data, world);
      IMPORTS.set(name, data);
      const f = await partHistory.newFeature("IMPORT3D");
      f.inputParams.fileToImport = data;
      f.inputParams.meshRepairLevel = "NONE";
      // IMPORT3D centres its mesh by DEFAULT, which quietly moved every hull()
      // to the origin: the STL above already carries the shape's real position,
      // so hull(a, b) rendered somewhere other than where a and b were. It also
      // put freeform()'s corner handles nowhere near the solid they belong to.
      f.inputParams.centerMesh = false;
      trace?.push({ id: f.inputParams.id, code: "IMPORT3D", color: col, emissive: em, emissiveInt: emi });
      return f.inputParams.id;
    }

    throw new Error(`Unknown node kind: ${n.kind}`);
  };

  await emit(root, IDENTITY);
  return partHistory;
}
