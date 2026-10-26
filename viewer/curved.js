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

// Where the OCCT wasm comes from. It is ~10.8MB, which some static hosts will
// not take, so the URL is a single overridable value rather than a literal
// buried in the loader call: set window.__BREP_REPLICAD_WASM_URL before the
// first curved-geometry operation to serve it from somewhere else. Left unset,
// it loads the copy shipped beside the app, so offline and desktop keep working.
// NB build-site.mjs rewrites the default path for the static site.
const WASM_URL = "/node_modules/replicad-opencascadejs/src/replicad_single.wasm";
// The last resort: a pinned public copy of the very same bytes, for a host
// that cannot serve a file this size at all (brepcode.com's /brep/ folder
// 404s it). build-site.mjs fails the build if this version stops matching the
// one in node_modules, so it can never hand the loader a mismatched wasm.
const WASM_CDN = "https://cdn.jsdelivr.net/npm/replicad-opencascadejs@0.23.0/src/replicad_single.wasm";
const wasmUrls = () => [...new Set([
  typeof window !== "undefined" && window.__BREP_REPLICAD_WASM_URL, WASM_URL, WASM_CDN,
].filter(Boolean))];

export function loadReplicad() {
  replicadReady ??= (async () => {
    const [r, loader] = await Promise.all([
      import("/node_modules/replicad/dist/replicad.js"),
      import("/node_modules/replicad-opencascadejs/src/replicad_single.js"),
    ]);
    // Each place in turn: a 404 (or an HTML error page where the wasm should
    // be) fails that instance, and the next URL gets a fresh one.
    let lastErr;
    for (const url of wasmUrls()) {
      try {
        const OC = await loader.default({ locateFile: () => url });
        r.setOC(OC);
        return r;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  })();
  // A failed load is not remembered: the next curved export tries again
  // rather than repeating the old rejection for the rest of the session.
  replicadReady.catch(() => { replicadReady = null; });
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
      // A partial arc is a partial REVOLVE, not a special case: OCCT sweeps the
      // tube profile through whatever angle it is given and the surfaces stay
      // exact conical/toroidal ones, so the drawing gets true arcs rather than
      // the faceted approximation the mesh would have handed it.
      const arc = P.arc == null ? 360 : P.arc;
      const sketch = r.drawCircle(P.tubeRadius).translate(P.majorRadius, 0).sketchOnPlane("XZ");
      return arc >= 360 ? sketch.revolve([0, 0, 1]) : sketch.revolve([0, 0, 1], { angle: arc });
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
    // importedSolid(): the registry holds STEP text (an STL rebuilt exact on
    // drop). OCCT reads it as the real planes and cylinders, which is the
    // whole point of the curved STEP export; the STL reader would choke on it.
    if (/^\s*ISO-10303-21/.test(text)) {
      importShapes.set(n, await r.importSTEP(new Blob([text], { type: "model/step" })));
      return;
    }
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

  // Non-uniform scale: OCCT B-rep surfaces cannot stretch anisotropically, so
  // an ellipsoid — scale([1, 1.4, 0.8], sphere(...)) — used to fail the WHOLE
  // export (the dash-goggles blueprint died on one squashed sphere in a
  // 21-part assembly). The shape genuinely stops being analytic at that point:
  // a stretched sphere is not a SPHERICAL_SURFACE and there is nothing curved
  // to preserve. So do what hulls and textures already do — tessellate the
  // subtree, stretch the triangles, and sew them back in with importSTL. The
  // rest of the model keeps its analytic surfaces; only the stretched part is
  // mesh-backed, which is what it really is.
  //
  // Innermost-first (the recursion visits children before the node), so a
  // stretch inside a stretch bakes correctly.
  const stretchedShapes = new Map();
  const isNonUniform = (m) => {
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
    m.decompose(p, q, s);
    return Math.abs(s.x - s.y) > 1e-9 || Math.abs(s.x - s.z) > 1e-9;
  };
  const resolveStretched = async (n) => {
    if (!n || typeof n !== "object") return;
    for (const c of kids(n)) await resolveStretched(c);
    if (n.kind !== "xform" || stretchedShapes.has(n) || !isNonUniform(n.matrix)) return;
    // a hull nested INSIDE the stretched subtree must resolve before build()
    await resolveHulls(n.child);
    const base = build(n.child, new Matrix4());
    const mesh = base.mesh({ tolerance: 0.08, angularTolerance: 10 });
    const det = n.matrix.determinant();
    const out = ["solid stretched"];
    for (let i = 0; i < mesh.triangles.length; i += 3) {
      const tri = [0, 1, 2].map((k) => {
        const p = mesh.triangles[i + k] * 3;
        return new Vector3(mesh.vertices[p], mesh.vertices[p + 1], mesh.vertices[p + 2])
          .applyMatrix4(n.matrix);
      });
      if (det < 0) tri.reverse();          // a mirror flips winding — keep normals outward
      out.push("facet normal 0 0 0", "outer loop");
      for (const t of tri) out.push(`vertex ${t.x} ${t.y} ${t.z}`);
      out.push("endloop", "endfacet");
    }
    out.push("endsolid stretched");
    stretchedShapes.set(n, await r.importSTL(new Blob([out.join("\n")], { type: "model/stl" })));
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

  // A profile with curves (path2d, and the letters of exact text) is drawn
  // segment by segment: a bezierTo() goes into the STEP as a true cubic,
  // where the sampled points would have written a row of short lines.
  const drawProfile = (n, what) => {
    if (!n.segs?.some((sg) => sg.t === "bezier")) {
      const pts = cleanProfile(n.pts, what);
      let d = r.draw(pts[0]);
      for (let i = 1; i < pts.length; i++) d = d.lineTo(pts[i]);
      return d.close();
    }
    const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
    let d = r.draw(n.segs[0].p[0]);
    n.segs.forEach((sg, i) => {
      const end = sg.p[sg.p.length - 1];
      const last = i === n.segs.length - 1 && same(end, n.segs[0].p[0]);
      if (sg.t === "bezier") d = d.cubicBezierCurveTo(end, sg.p[1], sg.p[2]);
      else if (!last && !same(sg.p[0], end)) d = d.lineTo(end);
    });
    return d.close();
  };

  const build = (n, matrix) => {
    if (n.kind === "xform") {
      // a stretched subtree was baked to a mesh in the pre-pass — its own
      // matrix is already in the vertices, only the OUTER matrix still applies
      const pre = stretchedShapes.get(n);
      if (pre) return applyMatrix(pre, matrix);
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
      // Build members one at a time and say WHICH one OCCT rejected — "the CAD
      // kernel rejected this model" on a 21-part assembly gives the user
      // nothing to act on; "part 8 of 21" narrows it to one shape in the code.
      const parts = (n.children || []).map((c, i) => {
        try {
          return build(c, matrix);
        } catch (e) {
          const where = `part ${i + 1} of ${n.children.length} in the assembly`;
          if (e instanceof Error) {
            if (!e.__partTagged) { e.message = `${where}: ${e.message}`; e.__partTagged = true; }
            throw e;
          }
          // a raw OCCT exception (an emscripten heap pointer) — decode what we
          // can and, above all, keep the part number attached
          let detail = "";
          try {
            const oc = r.getOC?.();
            const msg = oc?.getExceptionMessage?.(e) ?? oc?.OCJS?.getExceptionMessage?.(e);
            if (msg) detail = ` (${String(msg).slice(0, 100)})`;
          } catch { /* no decoder in this build */ }
          const err = new Error(`${where} was rejected by the CAD kernel${detail}. `
            + "Try exporting that part alone to inspect it, or use the mesh exports (STL/3MF).");
          err.__partTagged = true;
          throw err;
        }
      });
      if (!parts.length) throw new Error("curved export: group() is empty — there is nothing to draw");
      return parts.reduce((acc, p) => acc.fuse(p));
    }
    if (n.kind === "prim") return applyMatrix(buildPrim(r, n), matrix);
    if (n.kind === "prism") {
      return applyMatrix(drawProfile(n, "linearExtrude() profile").sketchOnPlane("XY").extrude(n.h), matrix);
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
      // revolve the profile about its x=0 edge (the Z axis of the XZ sketch)
      const rev = drawProfile(n, "revolve() profile").sketchOnPlane("XZ").revolve([0, 0, 1], { angleDegrees: n.angle ?? 360 });
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
    await resolveStretched(root);  // before hulls (a hull's child may be stretched;
                                   // a stretch's inner hull is handled inside)
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

  // Is what came back actually CLOSED? A proper analytic STEP — the kind
  // Fusion, SolidWorks, FreeCAD and Onshape write — reads back watertight.
  // A STEP carrying AP242 *tessellated* geometry instead (our own faceted STEP
  // export is one) does not: OCCT hands back the surface patches without
  // sewing them into a solid, so a ring arrives as two open tubes with its end
  // caps missing. That still previews and measures fine, which is exactly the
  // trap — it will not slice and it will not boolean. Count the boundary edges
  // so the caller can say so out loud rather than hand over a shell that looks
  // like a solid. A closed shell has every directed edge exactly once each way.
  if (opts.stats) {
    const idx = new Map();
    const key = (p) => {
      const k = `${v[p].toFixed(4)},${v[p + 1].toFixed(4)},${v[p + 2].toFixed(4)}`;
      let i = idx.get(k); if (i === undefined) idx.set(k, i = idx.size);
      return i;
    };
    const dir = new Map();
    for (let i = 0; i < t.length; i += 3) {
      const a = key(t[i] * 3), b = key(t[i + 1] * 3), c = key(t[i + 2] * 3);
      if (a === b || b === c || a === c) continue;
      for (const [x, y] of [[a, b], [b, c], [c, a]]) dir.set(`${x}:${y}`, (dir.get(`${x}:${y}`) || 0) + 1);
    }
    let open = 0;
    for (const k of dir.keys()) {
      const [x, y] = k.split(":");
      if (!dir.get(`${y}:${x}`)) open++;
    }
    opts.stats.openEdges = open;
    opts.stats.triangles = t.length / 3;
  }

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
// Replicad emits ONE <path> per edge segment. A Gridfinity 2x2 bin projects to
// 23,756 of them: a 1.8MB file in which most of the bytes are element wrapper
// rather than geometry, and 23k DOM nodes for whatever opens it.
//
// They all share their layer's stroke, and an SVG path already carries many
// subpaths in one `d`, so they merge into one element per distinct style.
// Grouped BY style rather than merged blindly, because replicad puts a stroke
// on some paths and flattening those into the rest would silently repaint
// them. Identical drawing, a fraction of the file.
export function mergeSvgPaths(svg) {
  const byStyle = new Map();
  for (const m of String(svg || "").matchAll(/<path\b([^>]*?)\/>/g)) {
    const attrs = m[1];
    const d = /\bd="([^"]*)"/.exec(attrs)?.[1];
    if (!d) continue;
    const style = attrs.replace(/\s*\bd="[^"]*"/, "").trim();
    if (!byStyle.has(style)) byStyle.set(style, []);
    byStyle.get(style).push(d.trim());
  }
  return [...byStyle].map(([style, ds]) =>
    `<path ${style ? `${style} ` : ""}d="${ds.join(" ")}"/>`).join("\n");
}

export async function curvedSvgText(root, view = "top") {
  const r = await loadReplicad();
  const shape = await buildCurved(root);
  const { visible, hidden } = r.drawProjection(shape, view);
  const vis = visible.toSVG();
  const hid = hidden.toSVG ? hidden.toSVG() : "";
  // pull the drawn paths out of replicad's two SVGs and merge into one,
  // styling hidden edges as thin dashed lines
  const pathsOf = mergeSvgPaths;
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

// A full engineering drawing / blueprint: TOP, FRONT and RIGHT hidden-line
// views in third-angle projection at one shared scale, an isometric in its own
// cell at its own scale, overall dimensions and a title block. Visible edges
// solid, hidden edges dashed.
//
// The sheet is read by people and, in the image-to-model loop, by the AI
// comparing it against an input drawing, so the layout is a fixed grid and
// every piece of text is checked against every other piece and against the
// geometry before it is drawn (see "COLLISION PASS").
//
//            col A                 col B
//   row 1    TOP                   ISOMETRIC (own scale)
//   row 2    FRONT                 RIGHT
//            title block (own row, right-aligned)
export async function curvedDrawingSVG(root, opts = {}) {
  const r = await loadReplicad();
  const shape = await buildCurved(root);

  const pathsOf = mergeSvgPaths;
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
  // replicad's named views, measured (bench/cadgen/README.md): "top" looks UP
  // from below, so the plan view is "bottom"; the third-angle right view (seen
  // from +X) is "left". Sheet mapping: TOP (x, -y), FRONT (x, -z), RIGHT (y, -z),
  // the same as the CADGenBench input drawings the AI compares this against.
  const top = project("bottom"), front = project("front"), right = project("left");
  // the isometric from the front-right corner, as in the bench inputs
  const isoCam = new r.ProjectionCamera([100, -100, 100]);
  isoCam.lookAt([0, 0, 0]);
  const iso = project(isoCam);

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

  // ---- scale and grid ----------------------------------------------------
  // One scale for the three orthographic views, sized so their body is about
  // 820 x 620 on paper. The isometric does NOT share it: it gets a cell of its
  // own and is scaled to fill that cell, its scale printed under it.
  const S = Math.min(820 / Math.max(front.w + right.w, 1), 620 / Math.max(top.h + front.h, 1));
  const tW = top.w * S, tH = top.h * S, fW = front.w * S, fH = front.h * S;
  const rW = right.w * S, rH = right.h * S;

  const M = 30;          // sheet edge to border
  const PAD = 28;        // border to drawing
  const G = 64;          // gap between grid columns
  const MINC = 28;       // a cell is never thinner than this, however flat the part
  const ISO_MIN = 280;   // the isometric cell is never smaller than this
  const LBL = 15, DIMF = 12;
  const tw = (s, size) => String(s).length * size * 0.62;   // monospace, errs generous
  const mm = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const scaleText = (sc) => (sc >= 1 ? sc.toFixed(2) : "1:" + (1 / sc).toFixed(1));

  // A RIGHT view thinner than a few pixels is a line: both its extents are
  // already dimensioned on TOP and FRONT, so it adds nothing and is left out,
  // and the isometric takes the whole right-hand column instead.
  const showRight = Math.min(rW, rH) >= 4;

  // Left band for the vertical dimensions. A dimension too short to hold its
  // number along it prints the number level, beside it, so the band widens.
  const vdimShort = (h, v) => h < tw(mm(v), DIMF) + 14;
  const leftBand = (h, v) => 26 + (vdimShort(h, v) ? 10 + tw(mm(v), DIMF) : 18);
  const colAx = Math.max(leftBand(sizeY * S, sizeY), leftBand(sizeZ * S, sizeZ));
  const colAW = Math.max(tW, fW, MINC);
  const colBx = colAx + colAW + G;
  const isoCellW = Math.max(showRight ? rW : 0, ISO_MIN, 0.6 * colAW);
  const colBW = Math.max(showRight ? rW : 0, isoCellW);

  // row 1: TOP sits on the bottom of the row, close to FRONT, as projected
  const row1H = Math.max(tH, MINC, showRight ? ISO_MIN : 0);
  const row1Lbl = row1H + 26;                         // label baseline under row 1
  const row2Y = row1Lbl + 40;
  const row2H = Math.max(fH, showRight ? rH : 0, MINC);
  const row2Lbl = row2Y + row2H + 56;                 // under FRONT's width dimension

  const topX = colAx, topY = row1H - tH;
  const frontX = colAx, frontY = row2Y;
  const rightX = colBx, rightY = row2Y;
  const isoCell = showRight
    ? { x: colBx, y: 0, w: colBW, h: row1H }
    : { x: colBx, y: 0, w: colBW, h: row2Y + row2H };
  const isoS = 0.94 * Math.min(isoCell.w / iso.w, isoCell.h / iso.h);
  const isoPX = isoCell.x + (isoCell.w - iso.w * isoS) / 2;
  const isoPY = isoCell.y + (isoCell.h - iso.h * isoS) / 2;

  // ---- what goes on the sheet ---------------------------------------------
  const views = [
    { name: "TOP", p: top, x: topX, y: topY, sc: S },
    { name: "FRONT", p: front, x: frontX, y: frontY, sc: S },
    ...(showRight ? [{ name: "RIGHT", p: right, x: rightX, y: rightY, sc: S }] : []),
    { name: "ISOMETRIC", p: iso, x: isoPX, y: isoPY, sc: isoS },
  ].map((v) => ({ ...v, box: [v.x, v.y, v.x + v.p.w * v.sc, v.y + v.p.h * v.sc] }));

  const labelY = (v) => v.name === "FRONT" || v.name === "RIGHT" ? row2Lbl
    : v.name === "ISOMETRIC" ? (showRight ? row1Lbl : row2Lbl) : row1Lbl;
  const labels = views.map((v) => ({
    owner: v.name, size: LBL, anchor: "middle", fill: "#bcd8f5",
    str: v.name === "ISOMETRIC" ? `ISOMETRIC (SCALE ${scaleText(isoS)})` : v.name,
    x: v.name === "ISOMETRIC" ? isoCell.x + isoCell.w / 2 : (v.box[0] + v.box[2]) / 2,
    y: labelY(v),
  }));

  // Overall dimensions, each axis once, in real model units, outside the view:
  // X under FRONT, Z left of FRONT, Y left of TOP. The isometric carries none.
  // `span` trims replicad's padding so the line covers the silhouette exactly.
  const span = (box, len, at) => ({ at: at + ((box - len) / 2) * S, size: len * S });
  const dims = [];
  const dimH = (owner, x, y, w, value) => {
    const str = mm(value);
    dims.push({ owner: `${owner}-dim`, kind: "h", x, y, w, short: w < tw(str, DIMF) + 14,
      text: { str, size: DIMF, x: x + w / 2, y: y - 7, anchor: "middle" } });
  };
  const dimV = (owner, x, y, h, value) => {
    const str = mm(value), short = vdimShort(h, value);
    dims.push({ owner: `${owner}-dim`, kind: "v", x, y, h, short,
      text: short ? { str, size: DIMF, x: x - 10, y: y + h / 2 + 4, anchor: "end" }
        : { str, size: DIMF, x: x - 9, y: y + h / 2, anchor: "middle", rot: true } });
  };
  { const s = span(front.w, sizeX, frontX); dimH("FRONT", s.at, frontY + fH + 26, s.size, sizeX); }
  { const s = span(front.h, sizeZ, frontY); dimV("FRONT", frontX - 26, s.at, s.size, sizeZ); }
  { const s = span(top.h, sizeY, topY); dimV("TOP", topX - 26, s.at, s.size, sizeY); }
  const dimBox = (d) => {
    const e = d.short ? 12 : 0;
    return d.kind === "h" ? [d.x - e, d.y - 7, d.x + d.w + e, d.y + 5]
      : [d.x - 5, d.y - e, d.x + 7, d.y + d.h + e];
  };

  // ---- COLLISION PASS -----------------------------------------------------
  // Every text gets a box (monospace estimate, rotated text the other way
  // round) and is placed only where it overlaps no other text and no geometry:
  // the views' outlines and every dimension's own lines. Labels go first and
  // are nudged if they must be; a dimension whose number cannot be placed
  // clear is dropped whole rather than printed over something.
  const textBox = (t, dx = 0, dy = 0) => {
    const w = tw(t.str, t.size), x = t.x + dx, y = t.y + dy;
    if (t.rot) return [x - t.size, y - w / 2, x + t.size * 0.3, y + w / 2];
    const left = t.anchor === "middle" ? x - w / 2 : t.anchor === "end" ? x - w : x;
    return [left, y - t.size, left + w, y + t.size * 0.3];
  };
  const hit = (a, b, pad = 3) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
  const obstacles = [
    ...views.map((v) => ({ owner: v.name, box: v.box })),
    ...dims.map((d) => ({ owner: d.owner, box: dimBox(d) })),
  ];
  const placed = [];                                   // { box, str, owner }
  const place = (t, owner, tries) => {
    for (const [dx, dy] of tries) {
      const b = textBox(t, dx, dy);
      if (placed.some((p) => hit(p.box, b))) continue;
      if (obstacles.some((o) => o.owner !== owner && hit(o.box, b))) continue;
      t.x += dx; t.y += dy;
      placed.push({ box: b, str: t.str, owner });
      return true;
    }
    return false;
  };
  for (const l of labels) {
    if (!place(l, l.owner + "-label", [[0, 0], [0, 14], [0, 28], [-40, 0], [40, 0], [0, 42]])) {
      placed.push({ box: textBox(l), str: l.str, owner: l.owner + "-label" });   // never silently lose a view name
    }
  }
  const dropped = [];
  const keptDims = dims.filter((d) => {
    const t = d.text, w = tw(t.str, t.size);
    const tries = d.kind === "h"
      ? [[0, 0], [0, 26], [-(d.w / 2 + w / 2 + 16), 7], [d.w / 2 + w / 2 + 16, 7]]
      : d.short ? [[0, 0], [0, -14], [0, 14]]
        : [[0, 0], [0, -(d.h / 2 + w / 2 + 16)], [0, d.h / 2 + w / 2 + 16]];
    if (place(t, d.owner, tries)) return true;
    dropped.push(t.str);
    return false;
  });

  // ---- render ---------------------------------------------------------------
  const viewSVG = (v) => {
    const sw = 1.1 / v.sc;                               // constant on-paper weight
    const t = `translate(${v.x} ${v.y}) scale(${v.sc}) translate(${-v.p.x} ${-v.p.y})`;
    return `<g transform="${t}">
    <g fill="none" stroke="#eaf3ff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${v.p.vis}</g>
    <g fill="none" stroke="#7fb0e0" stroke-width="${sw * 0.7}" stroke-dasharray="${sw * 4} ${sw * 3}">${v.p.hid}</g>
  </g>`;
  };
  const textSVG = (t) => `<text x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}"${t.anchor !== "start" ? ` text-anchor="${t.anchor}"` : ""}${
    t.rot ? ` transform="rotate(-90 ${t.x.toFixed(1)} ${t.y.toFixed(1)})"` : ""}${t.fill ? ` fill="${t.fill}"` : ""} stroke="none">${t.str}</text>`;
  const DIM_G = `stroke="#8fb8e6" stroke-width="1" fill="#dbe9fb" font-family="monospace" font-size="${DIMF}"`;
  // arrows point outward from inside the extension lines, or, on a dimension
  // too short for that, inward from outside with the line run past both ends
  const dimSVG = (d) => {
    const k = d.short ? -1 : 1, e = d.short ? 12 : 0;
    if (d.kind === "h") {
      const { x, y, w } = d;
      return `<g ${DIM_G}>
    <line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 5}"/>
    <line x1="${x + w}" y1="${y - 7}" x2="${x + w}" y2="${y + 5}"/>
    <line x1="${x - e}" y1="${y}" x2="${x + w + e}" y2="${y}"/>
    <path d="M${x} ${y} l${6 * k} -3 v6 z" stroke="none"/>
    <path d="M${x + w} ${y} l${-6 * k} -3 v6 z" stroke="none"/>
    ${textSVG(d.text)}
  </g>`;
    }
    const { x, y, h } = d;
    return `<g ${DIM_G}>
    <line x1="${x - 5}" y1="${y}" x2="${x + 7}" y2="${y}"/>
    <line x1="${x - 5}" y1="${y + h}" x2="${x + 7}" y2="${y + h}"/>
    <line x1="${x}" y1="${y - e}" x2="${x}" y2="${y + h + e}"/>
    <path d="M${x} ${y} l-3 ${6 * k} h6 z" stroke="none"/>
    <path d="M${x} ${y + h} l-3 ${-6 * k} h6 z" stroke="none"/>
    ${textSVG(d.text)}
  </g>`;
  };

  // ---- the sheet is sized from everything that was drawn --------------------
  const boxes = [...views.map((v) => v.box), ...keptDims.map(dimBox), ...placed.map((p) => p.box), [
    isoCell.x, isoCell.y, isoCell.x + isoCell.w, isoCell.y + isoCell.h]];
  const ink = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[2], b[2]), Math.max(a[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const shiftX = M + PAD - ink[0], shiftY = M + PAD - ink[1];
  const inkW = ink[2] - ink[0], inkH = ink[3] - ink[1];

  const name = (opts.title || "BREPcode model").replace(/[<&>]/g, "");
  const tbW = 360, titleH = 90;
  const sheetW = Math.max(inkW, tbW) + 2 * (M + PAD);
  const sheetH = M + PAD + inkH + PAD + titleH + M;
  const tbR = sheetW - M, tbB = sheetH - M;              // inner border edges
  const tbx = tbR - tbW, tb = tbB - titleH;
  const titleBlock = `
  <g font-family="monospace" fill="#dbe9fb">
    <rect x="${tbx}" y="${tb}" width="${tbW}" height="${titleH}" fill="none" stroke="#8fb8e6" stroke-width="1.5"/>
    <line x1="${tbx}" y1="${tb + 34}" x2="${tbR}" y2="${tb + 34}" stroke="#8fb8e6" stroke-width="1"/>
    <line x1="${tbR - 140}" y1="${tb + 34}" x2="${tbR - 140}" y2="${tbB}" stroke="#8fb8e6" stroke-width="1"/>
    <text x="${tbx + 12}" y="${tb + 23}" font-size="18" fill="#ffffff">${name.length > 30 ? name.slice(0, 29) + "…" : name}</text>
    <text x="${tbx + 12}" y="${tb + 56}" font-size="12">Units: mm</text>
    <text x="${tbx + 12}" y="${tb + 78}" font-size="12">Third-angle projection</text>
    <text x="${tbR - 128}" y="${tb + 56}" font-size="12">Scale ${scaleText(S)}</text>
    <text x="${tbR - 128}" y="${tb + 78}" font-size="12">BREPcode</text>
  </g>`;

  // Where everything landed, in sheet coordinates, for tests and for any tool
  // that wants to read the drawing back rather than guess at it.
  const sh = (b) => [b[0] + shiftX, b[1] + shiftY, b[2] + shiftX, b[3] + shiftY].map((n) => +n.toFixed(1));
  const layout = {
    scale: +S.toFixed(4), isoScale: +isoS.toFixed(4),
    border: [M, M, sheetW - M, sheetH - M], titleBlock: [tbx, tb, tbR, tbB],
    views: Object.fromEntries(views.map((v) => [v.name, sh(v.box)])),
    isoCell: sh([isoCell.x, isoCell.y, isoCell.x + isoCell.w, isoCell.y + isoCell.h]),
    texts: placed.map((p) => ({ str: p.str, owner: p.owner, box: sh(p.box) })),
    dimLines: keptDims.map((d) => ({ owner: d.owner, box: sh(dimBox(d)) })),
    omitted: showRight ? [] : ["RIGHT"], droppedDims: dropped,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW.toFixed(0)} ${sheetH.toFixed(0)}" width="${sheetW.toFixed(0)}" height="${sheetH.toFixed(0)}" data-ink="${
    sh(ink).map((n) => n.toFixed(1)).join(" ")}">
  <metadata id="brepcode-layout">${JSON.stringify(layout).replace(/[<&>]/g, "")}</metadata>
  <rect x="0" y="0" width="${sheetW.toFixed(0)}" height="${sheetH.toFixed(0)}" fill="#0d2c52"/>
  <rect x="${M}" y="${M}" width="${sheetW - 2 * M}" height="${sheetH - 2 * M}" fill="none" stroke="#8fb8e6" stroke-width="2"/>
  <g transform="translate(${shiftX.toFixed(2)} ${shiftY.toFixed(2)})">
  ${views.map(viewSVG).join("\n  ")}
  <g font-family="monospace" font-size="${LBL}">
  ${labels.map(textSVG).join("\n  ")}
  </g>
  ${keptDims.map(dimSVG).join("\n  ")}
  </g>
  ${titleBlock}
</svg>`;
}
