// True curved-surface STEP export.
//
// The BREP.io kernel that powers the live viewer is mesh-backed — every face
// it knows is triangles, so its exports are always faceted. But the DSL tree
// still knows the analytic truth ("cylinder r=8 h=14"), so this module
// mirrors the model into a real OpenCascade kernel (replicad + OCCT wasm,
// lazy-loaded ~11 MB on first use) and lets OCCT write STEP with genuine
// CYLINDRICAL / SPHERICAL / CONICAL / TOROIDAL surfaces.
//
// Only pure BREPcode shapes can go through: mesh imports have no analytic
// surfaces to recover, and feature("...") escape hatches have no replicad
// equivalent — both fail with a clear message instead of a faceted lie.

import { Matrix4, Vector3, Quaternion } from "three";
import { getImport, displacedPositions } from "../src/dsl.js";

let replicadReady = null;

export function loadReplicad() {
  replicadReady ??= (async () => {
    const [r, loader] = await Promise.all([
      import("/node_modules/replicad/dist/replicad.js"),
      import("/node_modules/replicad-opencascadejs/src/replicad_single.js"),
    ]);
    const OC = await loader.default({
      locateFile: () => "/node_modules/replicad-opencascadejs/src/replicad_single.wasm",
    });
    r.setOC(OC);
    return r;
  })();
  return replicadReady;
}

// Test hook: node can't import the dual-format wasm loader directly, so the
// test suite initialises replicad itself and injects it here.
export function _setReplicad(r) {
  replicadReady = Promise.resolve(r);
}

const IDENTITY = new Matrix4();

// Decompose the accumulated 4x4 into scale -> rotate -> translate and apply
// through replicad's own ops (M = T·R·S, matching three's decompose).
function applyMatrix(shape, m) {
  if (m.equals(IDENTITY)) return shape;
  const p = new Vector3(), q = new Quaternion(), s = new Vector3();
  m.decompose(p, q, s);
  if (Math.abs(s.x - s.y) > 1e-9 || Math.abs(s.x - s.z) > 1e-9) {
    throw new Error("curved STEP can't apply a non-uniform scale([x, y, z]) — B-rep surfaces don't stretch that way. Scale uniformly, or use the mesh exports (STL/3MF).");
  }
  let out = shape;
  if (Math.abs(s.x - 1) > 1e-12) out = out.scale(s.x, [0, 0, 0]);
  if (q.w < 0) { q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1; }
  const halfSin = Math.sqrt(Math.max(0, 1 - q.w * q.w));
  if (halfSin > 1e-12) {
    const deg = (2 * Math.acos(Math.min(1, q.w)) * 180) / Math.PI;
    out = out.rotate(deg, [0, 0, 0], [q.x / halfSin, q.y / halfSin, q.z / halfSin]);
  }
  if (p.x || p.y || p.z) out = out.translate([p.x, p.y, p.z]);
  return out;
}

function buildPrim(r, n) {
  const P = n.params;
  switch (n.code) {
    case "P.CU":
      // our cube is corner-at-origin; replicad's box is centred on XY
      return r.makeBaseBox(P.sizeX, P.sizeY, P.sizeZ)
        .translate([P.sizeX / 2, P.sizeY / 2, 0]);
    case "P.CY":
      return r.makeCylinder(P.radius, P.height);
    case "P.CO": {
      // revolve the frustum profile — OCCT emits a true CONICAL_SURFACE
      const rb = P.radiusBottom, rt = P.radiusTop, h = P.height;
      const pts = [[0, 0]];
      if (rb > 0) pts.push([rb, 0]);
      if (rt > 0) pts.push([rt, h]);
      pts.push([0, h]);
      if (pts.length < 3) throw new Error("cone needs at least one non-zero radius");
      let d = r.draw(pts[0]);
      for (let i = 1; i < pts.length; i++) d = d.lineTo(pts[i]);
      return d.close().sketchOnPlane("XZ").revolve([0, 0, 1]);
    }
    case "P.S":
      return r.makeSphere(P.radius);
    case "P.T": {
      if (P.arc != null && P.arc < 360) {
        throw new Error("curved STEP doesn't support partial-arc torus yet — use a full torus or export STL/3MF");
      }
      return r.drawCircle(P.tubeRadius).translate(P.majorRadius, 0)
        .sketchOnPlane("XZ").revolve([0, 0, 1]);
    }
    default:
      throw new Error(`feature("${n.code}") has no analytic equivalent — curved STEP covers cube/cylinder/cone/sphere/torus/polygon-extrudes and booleans of them`);
  }
}

export async function buildCurved(root) {
  const r = await loadReplicad();

  // hull() has no analytic equivalent: OCCT has no convex-hull operation, and
  // the result genuinely IS faceted, so there is nothing curved to preserve.
  // The route in is to compute the hull ourselves and hand OCCT the triangles
  // through importSTL, which gives a real shape that booleans and projects
  // like any other. Resolved in a pre-pass because importSTL is async while
  // build() below is not, innermost hulls first so nested ones work.
  const hullShapes = new Map();
  const kids = (n) => (n?.child ? [n.child] : (Array.isArray(n?.children) ? n.children : []));
  const resolveHulls = async (n) => {
    if (!n || typeof n !== "object") return;
    for (const c of kids(n)) await resolveHulls(c);
    if (n.kind !== "hull" || hullShapes.has(n)) return;

    const pts = [];
    for (const child of n.children) {
      const mesh = build(child, new Matrix4()).mesh();
      const v = mesh.vertices;
      for (let i = 0; i < v.length; i += 3) pts.push(new Vector3(v[i], v[i + 1], v[i + 2]));
    }
    if (pts.length < 4) throw new Error("curved export: hull() needs shapes with geometry");
    const { ConvexGeometry } = await import("three/addons/geometries/ConvexGeometry.js");
    const geo = new ConvexGeometry(pts);
    const pos = geo.attributes.position;
    const out = ["solid hull"];
    for (let i = 0; i < pos.count; i += 3) {
      out.push("facet normal 0 0 0", "outer loop");
      for (let k = 0; k < 3; k++) {
        out.push(`vertex ${pos.getX(i + k)} ${pos.getY(i + k)} ${pos.getZ(i + k)}`);
      }
      out.push("endloop", "endfacet");
    }
    out.push("endsolid hull");
    hullShapes.set(n, await r.importSTL(new Blob([out.join("\n")], { type: "model/stl" })));
  };

  // Imported meshes have no analytic surfaces to recover, but OCCT can still
  // SEW their triangles into a real (faceted) shape — which projects proper
  // hidden-line drawings, joins booleans, and writes valid STEP. Guarded by
  // facet count: hidden-line removal over a slicer-sized mesh takes minutes.
  // Resolved BEFORE hulls so hull(importedMesh(...), …) works too.
  const importShapes = new Map();
  const resolveImports = async (n) => {
    if (!n || typeof n !== "object") return;
    for (const c of kids(n)) await resolveImports(c);
    if (n.kind !== "import" || importShapes.has(n)) return;
    const text = getImport(n.name);
    if (!text) throw new Error(`importedMesh("${n.name}"): no imported file by that name — use the Import button first`);
    const facets = (text.match(/endfacet/g) || []).length;
    if (facets > 20000) {
      throw new Error(`importedMesh("${n.name}") is ~${(facets / 1000).toFixed(0)}k triangles — too dense for a drawing or curved STEP (hidden-line removal would take minutes). Decimate to under 20k triangles and re-import, or use the mesh exports (STL/3MF).`);
    }
    importShapes.set(n, await r.importSTL(new Blob([text], { type: "model/stl" })));
  };

  // texture()/heightmap(): displaced geometry genuinely IS faceted, so run
  // the same displacement pipeline the kernel path uses — on replicad's own
  // tessellation of the child — and sew the result back in via importSTL.
  // A knurled dial then shows up in the blueprint and the STEP for real.
  const textureShapes = new Map();
  const resolveTextures = async (n) => {
    if (!n || typeof n !== "object") return;
    for (const c of kids(n)) await resolveTextures(c);
    if (n.kind !== "texture" || textureShapes.has(n)) return;
    let base = build(n.children[0], new Matrix4());
    for (let i = 1; i < n.children.length; i++) base = base.fuse(build(n.children[i], new Matrix4()));
    const mesh = base.mesh({ tolerance: 0.2, angularTolerance: 20 });
    const flat = [];
    for (let i = 0; i < mesh.triangles.length; i++) {
      const p = mesh.triangles[i] * 3;
      flat.push(mesh.vertices[p], mesh.vertices[p + 1], mesh.vertices[p + 2]);
    }
    const pos = displacedPositions(flat, n.opts);
    const out = ["solid tex"];
    for (let i = 0; i < pos.length; i += 9) {
      out.push("facet normal 0 0 0", "outer loop");
      for (let k = 0; k < 9; k += 3) out.push(`vertex ${pos[i + k]} ${pos[i + k + 1]} ${pos[i + k + 2]}`);
      out.push("endloop", "endfacet");
    }
    out.push("endsolid tex");
    textureShapes.set(n, await r.importSTL(new Blob([out.join("\n")], { type: "model/stl" })));
  };

  // OCCT refuses a wire containing a zero-length edge, while the BREP.io kernel
  // quietly ignores one — so a profile that builds fine in the viewer can fail
  // the STEP/blueprint export with nothing but an emscripten pointer to show for
  // it. Any polygon assembled from arcs hits this: each arc's first point is the
  // previous arc's last point. Drop consecutive duplicates, and a closing point
  // equal to the first, since close() draws that segment itself.
  const cleanProfile = (pts, what) => {
    const eps = 1e-6;
    const same = (a, b) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
    const out = [];
    for (const p of pts) if (!out.length || !same(out[out.length - 1], p)) out.push(p);
    while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
    if (out.length < 3) {
      throw new Error(`curved export: ${what} collapsed to ${out.length} distinct point(s) — the profile has no area`);
    }
    return out;
  };

  const build = (n, matrix) => {
    if (n.kind === "xform") {
      return build(n.child, new Matrix4().multiplyMatrices(matrix, n.matrix));
    }
    if (n.kind === "op") {
      let acc = build(n.children[0], matrix);
      for (let i = 1; i < n.children.length; i++) {
        const tool = build(n.children[i], matrix);
        acc = n.operation === "SUBTRACT" ? acc.cut(tool)
          : n.operation === "INTERSECT" ? acc.intersect(tool)
          : acc.fuse(tool);
      }
      return acc;
    }
    // group() keeps parts SEPARATE in the viewer, which OCCT has no direct
    // equivalent for on this path — so an assembly used to fail the blueprint
    // and STEP exports outright with "unknown node kind". Fusing is the right
    // trade: on a drawing the result is pixel-identical, and disjoint solids
    // stay disjoint (OCCT returns them as a compound). The only thing lost is
    // part separation where two members actually touch, which beats no export.
    if (n.kind === "group") {
      const parts = (n.children || []).map((c) => build(c, matrix));
      if (!parts.length) throw new Error("curved export: group() is empty — there is nothing to draw");
      return parts.reduce((acc, p) => acc.fuse(p));
    }
    if (n.kind === "prim") return applyMatrix(buildPrim(r, n), matrix);
    if (n.kind === "prism") {
      const pts = cleanProfile(n.pts, "linearExtrude() profile");
      let d = r.draw(pts[0]);
      for (let i = 1; i < pts.length; i++) d = d.lineTo(pts[i]);
      return applyMatrix(d.close().sketchOnPlane("XY").extrude(n.h), matrix);
    }
    if (n.kind === "edgeop") {
      // OCCT rounds/bevels analytically — a curved fillet, not faceted
      let shape = build(n.child, matrix);
      try {
        shape = n.code === "F" ? shape.fillet(n.amount) : shape.chamfer(n.amount);
      } catch (e) {
        throw new Error(`curved ${n.code === "F" ? "fillet" : "chamfer"} failed on this shape (radius may be too large for an edge) — try the mesh export, or a smaller amount`);
      }
      return shape;
    }
    if (n.kind === "revolve") {
      const pts = cleanProfile(n.pts, "revolve() profile");
      let d = r.draw(pts[0]);
      for (let i = 1; i < pts.length; i++) d = d.lineTo(pts[i]);
      // revolve the profile about its x=0 edge (the Z axis of the XZ sketch)
      const rev = d.close().sketchOnPlane("XZ").revolve([0, 0, 1], { angleDegrees: n.angle ?? 360 });
      return applyMatrix(rev, matrix);
    }
    if (n.kind === "hull") {
      const shape = hullShapes.get(n);
      if (!shape) throw new Error("curved export: hull was not resolved before the build");
      return applyMatrix(shape, matrix);
    }
    if (n.kind === "import") {
      const shape = importShapes.get(n);
      if (!shape) throw new Error("curved export: import was not resolved before the build");
      return applyMatrix(shape, new Matrix4().multiplyMatrices(matrix, n.fix));
    }
    if (n.kind === "texture") {
      const shape = textureShapes.get(n);
      if (!shape) throw new Error("curved export: texture was not resolved before the build");
      return applyMatrix(shape, new Matrix4().multiplyMatrices(matrix, n.fix));
    }
    throw new Error(`curved export: unknown node kind "${n.kind}"`);
  };

  // OCCT throws C++ exceptions, which emscripten surfaces as a raw heap pointer:
  // the export failed with "8867952" and nothing else. Anything that is not a
  // real Error gets turned into something a user can act on. Try to recover the
  // real message first — some OCCT builds expose a decoder.
  try {
    await resolveImports(root);
    await resolveTextures(root);   // after imports (a texture's child may be one)
    await resolveHulls(root);      // after textures (a hull's child may be one)
    return build(root, new Matrix4());
  } catch (e) {
    if (e instanceof Error) throw e;
    let detail = "";
    try {
      const oc = r.getOC?.();
      const msg = oc?.getExceptionMessage?.(e) ?? oc?.OCJS?.getExceptionMessage?.(e);
      if (msg) detail = `: ${String(msg).slice(0, 120)}`;
    } catch { /* no decoder in this build */ }
    throw new Error(
      `the CAD kernel rejected this model${detail}. This is usually a profile with `
      + "a zero-length or self-crossing edge, or a boolean between shapes that only "
      + "touch along a face. The mesh exports (STL/3MF) are more forgiving.");
  }
}

export async function curvedStepBlob(root) {
  const shape = await buildCurved(root);
  return shape.blobSTEP();
}

// STEP IMPORT — the real thing, via OCCT's own reader. The analytic shape is
// tessellated here (that is what the mesh kernel downstream can hold), so
// edits behave exactly like an STL import: drill, union, stretch all work.
// `tolerance` is the chord error in mm — 0.05 keeps a curvy part accurate to
// a twentieth of a millimetre while staying well under mesh-import budgets.
export async function stepToStl(buf, name = "step-import", opts = {}) {
  const r = await loadReplicad();
  let shape;
  try {
    shape = await r.importSTEP(new Blob([buf]));
  } catch (e) {
    throw new Error(`Couldn't read that STEP file (${String(e?.message || e).slice(0, 80)}) — is it a valid AP203/AP214/AP242 export?`);
  }
  const mesh = shape.mesh({
    tolerance: opts.tolerance ?? 0.05,
    angularTolerance: opts.angularTolerance ?? 15,
  });
  const v = mesh.vertices, t = mesh.triangles;
  if (!t?.length) throw new Error("That STEP file contained no solid geometry.");
  let stl = `solid ${name}\n`;
  for (let i = 0; i < t.length; i += 3) {
    stl += "facet normal 0 0 0\nouter loop\n";
    for (let k = 0; k < 3; k++) {
      const p = t[i + k] * 3;
      stl += `vertex ${v[p]} ${v[p + 1]} ${v[p + 2]}\n`;
    }
    stl += "endloop\nendfacet\n";
  }
  stl += `endsolid ${name}\n`;
  return stl;
}

// A 2D vector drawing: the model projected onto a viewing plane, visible
// edges solid and hidden edges dashed — a proper draughting SVG, not a
// screenshot. `view` is one of front/back/top/bottom/left/right.
export async function curvedSvgText(root, view = "top") {
  const r = await loadReplicad();
  const shape = await buildCurved(root);
  const { visible, hidden } = r.drawProjection(shape, view);
  const vis = visible.toSVG();
  const hid = hidden.toSVG ? hidden.toSVG() : "";
  // pull the drawn paths out of replicad's two SVGs and merge into one,
  // styling hidden edges as thin dashed lines
  const pathsOf = (svg) => (svg.match(/<path[\s\S]*?\/>/g) || []).join("\n");
  const vb = vis.match(/viewBox="([^"]+)"/)?.[1] || "0 0 100 100";
  const [, , w, h] = vb.split(/\s+/).map(Number);
  const stroke = Math.max(w, h) / 400;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">
 <g fill="none" stroke="#111" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
${pathsOf(vis)}
 </g>
 <g fill="none" stroke="#999" stroke-width="${stroke * 0.7}" stroke-dasharray="${stroke * 3} ${stroke * 2}">
${pathsOf(hid)}
 </g>
</svg>`;
}

// A full engineering drawing / blueprint: three orthographic views (front, top,
// right) laid out in third-angle projection with a border and a title block —
// visible edges solid, hidden edges dashed. Views share scale and align by their
// common dimensions (front↔top share width, front↔right share height).
export async function curvedDrawingSVG(root, opts = {}) {
  const r = await loadReplicad();
  const shape = await buildCurved(root);

  const pathsOf = (svg) => (svg.match(/<path[\s\S]*?\/>/g) || []).join("\n");
  // A projection can legitimately come back with nothing in it — a sphere seen
  // down its own axis hides no edges at all — and replicad throws
  // "Unpexpected numItems value: 0" rather than handing back an empty drawing.
  // That killed the whole blueprint for a sphere+torus union, so an empty layer
  // has to read as empty rather than as a failed export.
  const toSvgOrEmpty = (drawing) => {
    if (!drawing?.toSVG) return "";
    try { return drawing.toSVG(); } catch { return ""; }
  };
  const project = (view) => {
    let visible = null, hidden = null;
    // …and drawProjection itself throws the same way on some shapes, so one
    // awkward view must not cost the user the other three.
    try { ({ visible, hidden } = r.drawProjection(shape, view)); }
    catch { return { x: 0, y: 0, w: 10, h: 10, vis: "", hid: "" }; }
    const vis = toSvgOrEmpty(visible);
    const hid = toSvgOrEmpty(hidden);
    const [x, y, w, h] = (vis.match(/viewBox="([^"]+)"/)?.[1] || "0 0 10 10").split(/\s+/).map(Number);
    return { x, y, w: w || 10, h: h || 10, vis: pathsOf(vis), hid: pathsOf(hid) };
  };
  const front = project("front"), top = project("top"), right = project("right");
  // an isometric pictorial view from the [1,1,1] corner for the spare corner
  const isoCam = new r.ProjectionCamera([100, 100, 100]);
  isoCam.lookAt([0, 0, 0]);
  const iso = project(isoCam);

  // one scale for all three, sized so the sheet is ~1000 units wide
  const bodyW = front.w + Math.max(right.w, 1) + 40;   // front + gap + right (in model units)
  const bodyH = front.h + Math.max(top.h, 1) + 40;
  const S = 900 / Math.max(bodyW, bodyH * 1.4);
  const stroke = 1.1 / S;                               // constant on-paper weight

  const M = 60;                                         // sheet margin
  const G = 55;                                         // fixed paper gap between views
  // Every view reserves a band under it for its name plus a horizontal
  // dimension, and a band beside it for the vertical one. Laying these out as
  // named constants (rather than nudging each view) is what keeps the sheet
  // aligned when the part's proportions change.
  const LBL = 56;                                       // view label + dimension band
  const DIMPAD = 48;                                    // side band for vertical dimensions
  const fW = front.w * S, fH = front.h * S;
  const tW = top.w * S, tH = top.h * S, rW = right.w * S, rH = right.h * S;
  // third-angle: TOP above FRONT (shared width), RIGHT to the right of FRONT (shared height)
  const LEFT = M + DIMPAD;
  const topX = LEFT, topY = M;
  const frontX = LEFT, frontY = topY + tH + LBL + G;
  const rightX = LEFT + Math.max(fW, tW) + G, rightY = frontY;

  const sheetW = Math.max(rightX + rW + DIMPAD, frontX + fW, topX + tW) + M;
  const titleH = 90;
  const sheetH = frontY + fH + LBL + 20 + titleH + M / 2;

  // the isometric drops into the spare corner: right of TOP, above the RIGHT view
  const isoBoxX = rightX, isoBoxY = topY;
  const isoBoxW = sheetW - M - isoBoxX;
  const isoBoxH = frontY - topY - G;
  const isoS = 0.9 * Math.min(isoBoxW / iso.w, isoBoxH / iso.h);
  const isoPX = isoBoxX + (isoBoxW - iso.w * isoS) / 2;
  const isoPY = isoBoxY + (isoBoxH - iso.h * isoS) / 2;

  // place a view's own-coordinate paths at a sheet position, at scale `sc`
  const view = (p, px, py, label, sc = S) => {
    const sw = 1.1 / sc;                                 // constant on-paper weight
    const t = `translate(${px} ${py}) scale(${sc}) translate(${-p.x} ${-p.y})`;
    return `<g transform="${t}">
    <g fill="none" stroke="#eaf3ff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p.vis}</g>
    <g fill="none" stroke="#7fb0e0" stroke-width="${sw * 0.7}" stroke-dasharray="${sw * 4} ${sw * 3}">${p.hid}</g>
  </g>
  <text x="${px}" y="${py + p.h * sc + 22}" fill="#bcd8f5" font-family="monospace" font-size="15">${label}</text>`;
  };

  // Dimensions, in real model units. `sc` converts model units to paper units,
  // so the numbers are the part's actual size regardless of sheet scale.
  const mm = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const DIM_G = `stroke="#8fb8e6" stroke-width="1" fill="#dbe9fb" font-family="monospace" font-size="12"`;
  const dimH = (px, py, w, value) => `
  <g ${DIM_G}>
    <line x1="${px}" y1="${py - 7}" x2="${px}" y2="${py + 5}"/>
    <line x1="${px + w}" y1="${py - 7}" x2="${px + w}" y2="${py + 5}"/>
    <line x1="${px}" y1="${py}" x2="${px + w}" y2="${py}"/>
    <path d="M${px} ${py} l6 -3 v6 z" stroke="none"/>
    <path d="M${px + w} ${py} l-6 -3 v6 z" stroke="none"/>
    <text x="${px + w / 2}" y="${py - 7}" text-anchor="middle" stroke="none">${mm(value)}</text>
  </g>`;
  const dimV = (px, py, h, value) => `
  <g ${DIM_G}>
    <line x1="${px - 5}" y1="${py}" x2="${px + 7}" y2="${py}"/>
    <line x1="${px - 5}" y1="${py + h}" x2="${px + 7}" y2="${py + h}"/>
    <line x1="${px}" y1="${py}" x2="${px}" y2="${py + h}"/>
    <path d="M${px} ${py} l-3 6 h6 z" stroke="none"/>
    <path d="M${px} ${py + h} l-3 -6 h6 z" stroke="none"/>
    <text x="${px - 9}" y="${py + h / 2}" text-anchor="middle" stroke="none"
          transform="rotate(-90 ${px - 9} ${py + h / 2})">${mm(value)}</text>
  </g>`;

  // Sizes come from the SOLID, not from the projection's viewBox — replicad pads
  // each projection by a unit of drawing margin, so the viewBox reads 2mm over
  // on every axis. The same padding is why the dimension line is inset: `span`
  // trims it back to where the part's silhouette actually starts and ends.
  // OCCT's bounding box is a LOOSE bound on curved solids — it wraps the
  // surface control hull, not the surface. A sphere+torus measuring 72mm across
  // in the viewer had its blueprint stamped 77.9, which is the one thing on a
  // drawing that must never be wrong. When the caller knows the real size (the
  // viewer does — it is the figure in the status bar) that wins, and the
  // drawing agrees with the app instead of contradicting it. Kept centred on
  // the same box so the projected silhouette and the dimension lines still line
  // up. Flat/faceted parts are unaffected: there the two agree exactly.
  let [bmin, bmax] = shape.boundingBox.bounds;
  const known = Array.isArray(opts.size) && opts.size.length === 3
    && opts.size.every((v) => Number.isFinite(v) && v > 0);
  if (known) {
    const mid = [0, 1, 2].map((i) => (bmin[i] + bmax[i]) / 2);
    bmin = mid.map((c, i) => c - opts.size[i] / 2);
    bmax = mid.map((c, i) => c + opts.size[i] / 2);
  }
  const sizeX = bmax[0] - bmin[0], sizeY = bmax[1] - bmin[1], sizeZ = bmax[2] - bmin[2];
  // p: the projection, len: its true model-unit length along that axis
  const span = (p, axis, px, len) => {
    const box = axis === "w" ? p.w : p.h;
    return { at: px + ((box - len) / 2) * S, size: len * S };
  };
  const hDim = (p, px, py, len, view) => {
    const { at, size } = span(p, "w", px, len);
    return dimH(at, py, size, len);
  };
  const vDim = (p, px, py, len) => {
    const { at, size } = span(p, "h", py, len);
    return dimV(px, at, size, len);
  };
  // ---- isometric dimensions -------------------------------------------
  // Dimensions on a pictorial view have to run ALONG the projected axes, not
  // square to the page, or they read as belonging to nothing. The basis below
  // was measured out of replicad's own [100,100,100] camera rather than assumed:
  // project a marker at the origin and at 40mm along each axis, and the offsets
  // give each axis's screen direction. It is a true isometric (every axis
  // foreshortened by sqrt(2/3) = 0.8165, at the classic ±30°) but with X and Y
  // mirrored from the usual textbook layout, which is exactly the sort of thing
  // guessing gets wrong.
  const ISO_X = [-0.70711, 0.40825];
  const ISO_Y = [0.70711, 0.40825];
  const ISO_Z = [0, -0.81650];
  // ...and the projector pads its viewBox by ~1 unit a side, so the shape's own
  // projected origin is not the viewBox origin.
  const isoProject = ([x, y, z]) => [
    x * ISO_X[0] + y * ISO_Y[0] + z * ISO_Z[0],
    x * ISO_X[1] + y * ISO_Y[1] + z * ISO_Z[1],
  ];
  const isoSheet = (p3) => {
    const [px, py] = isoProject(p3);
    return [isoPX + (px - iso.x) * isoS, isoPY + (py - iso.y) * isoS];
  };

  const centre3 = [(bmin[0] + bmax[0]) / 2, (bmin[1] + bmax[1]) / 2, (bmin[2] + bmax[2]) / 2];
  const centre2 = isoSheet(centre3);

  // One dimension along an edge of the bounding box: projected, then pushed
  // clear of the shape along the edge's own perpendicular (outward is decided
  // by which side of it the model's centre falls on, so it works for any
  // proportions rather than relying on hand-picked offsets).
  const isoDim = (from3, to3, value, gap = 22) => {
    const a = isoSheet(from3), b = isoSheet(to3);
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) return "";
    dx /= len; dy /= len;
    let nx = -dy, ny = dx;                       // perpendicular
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((mid[0] + nx - centre2[0]) ** 2 + (mid[1] + ny - centre2[1]) ** 2
      < (mid[0] - centre2[0]) ** 2 + (mid[1] - centre2[1]) ** 2) { nx = -nx; ny = -ny; }
    const A = [a[0] + nx * gap, a[1] + ny * gap];
    const B = [b[0] + nx * gap, b[1] + ny * gap];
    // text sits just off the line, and is flipped when it would read upside down
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    let flip = 1;
    if (deg > 90 || deg < -90) { deg += 180; flip = -1; }
    const tx = (A[0] + B[0]) / 2 + nx * 9 * flip;
    const ty = (A[1] + B[1]) / 2 + ny * 9 * flip;
    return `
  <g ${DIM_G}>
    <line x1="${a[0] + nx * 6}" y1="${a[1] + ny * 6}" x2="${A[0] + nx * 5}" y2="${A[1] + ny * 5}"/>
    <line x1="${b[0] + nx * 6}" y1="${b[1] + ny * 6}" x2="${B[0] + nx * 5}" y2="${B[1] + ny * 5}"/>
    <line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}"/>
    <path d="M${A[0]} ${A[1]} l${(dx * 6 - ny * 3).toFixed(2)} ${(dy * 6 + nx * 3).toFixed(2)} l${(ny * 6).toFixed(2)} ${(-nx * 6).toFixed(2)} z" stroke="none"/>
    <path d="M${B[0]} ${B[1]} l${(-dx * 6 - ny * 3).toFixed(2)} ${(-dy * 6 + nx * 3).toFixed(2)} l${(ny * 6).toFixed(2)} ${(-nx * 6).toFixed(2)} z" stroke="none"/>
    <text x="${tx}" y="${ty}" text-anchor="middle" stroke="none"
          transform="rotate(${deg.toFixed(1)} ${tx} ${ty})">${mm(value)}</text>
  </g>`;
  };

  // Dimension the three silhouette edges that meet at the lowest corner, which
  // is where a reader expects them on an isometric.
  const [x0, y0, z0] = bmin, [x1, y1, z1] = bmax;
  const isoDims = [
    isoDim([x1, y0, z0], [x1, y1, z0], sizeY),   // bottom-left edge, runs along Y
    isoDim([x1, y1, z0], [x0, y1, z0], sizeX),   // bottom-right edge, runs along X
    isoDim([x0, y1, z0], [x0, y1, z1], sizeZ),   // the vertical edge on the right
  ].join("\n");

  const dimensions = [
    hDim(top, topX, topY + tH + 44, sizeX),      vDim(top, topX - 24, topY, sizeY),
    hDim(front, frontX, frontY + fH + 44, sizeX), vDim(front, frontX - 24, frontY, sizeZ),
    hDim(right, rightX, rightY + rH + 44, sizeY), vDim(right, rightX + rW + 24, rightY, sizeZ),
    isoDims,
  ].join("\n");

  // Title block: flush with the inner border's bottom-right corner. It used to
  // be positioned from the sheet edge instead, which left it hanging outside
  // the border on one side and short of it on the other.
  const name = (opts.title || "BREPcode model").replace(/[<&>]/g, "");
  const tbW = 360;
  const tbR = sheetW - M / 2, tbB = sheetH - M / 2;      // inner border edges
  const tbx = tbR - tbW, tb = tbB - titleH;
  const titleBlock = `
  <g font-family="monospace" fill="#dbe9fb">
    <rect x="${tbx}" y="${tb}" width="${tbW}" height="${titleH}" fill="none" stroke="#8fb8e6" stroke-width="1.5"/>
    <line x1="${tbx}" y1="${tb + 34}" x2="${tbR}" y2="${tb + 34}" stroke="#8fb8e6" stroke-width="1"/>
    <line x1="${tbR - 140}" y1="${tb + 34}" x2="${tbR - 140}" y2="${tbB}" stroke="#8fb8e6" stroke-width="1"/>
    <text x="${tbx + 12}" y="${tb + 23}" font-size="18" fill="#ffffff">${name}</text>
    <text x="${tbx + 12}" y="${tb + 56}" font-size="12">Units: mm</text>
    <text x="${tbx + 12}" y="${tb + 78}" font-size="12">Third-angle projection</text>
    <text x="${tbR - 128}" y="${tb + 56}" font-size="12">Scale ${S >= 1 ? S.toFixed(2) : "1:" + (1 / S).toFixed(1)}</text>
    <text x="${tbR - 128}" y="${tb + 78}" font-size="12">BREPcode</text>
  </g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW.toFixed(0)} ${sheetH.toFixed(0)}" width="${sheetW.toFixed(0)}" height="${sheetH.toFixed(0)}">
  <rect x="0" y="0" width="${sheetW.toFixed(0)}" height="${sheetH.toFixed(0)}" fill="#0d2c52"/>
  <rect x="${M / 2}" y="${M / 2}" width="${sheetW - M}" height="${sheetH - M}" fill="none" stroke="#8fb8e6" stroke-width="2"/>
  ${view(front, frontX, frontY, "FRONT")}
  ${view(top, topX, topY, "TOP")}
  ${view(right, rightX, rightY, "RIGHT")}
  ${view(iso, isoPX, isoPY, "ISOMETRIC", isoS)}
  ${dimensions}
  ${titleBlock}
</svg>`;
}
