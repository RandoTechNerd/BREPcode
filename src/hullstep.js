// hull() as an EXACT solid.
//
// The kernel has no convex-hull feature, so hull() takes the convex hull of
// its children's points itself. It used to hand the result over as a triangle
// mesh, which put every hull (and everything built on it) in the mesh lane:
// no fillet afterwards, faceted STEP, and an AI told to avoid hull().
//
// But a convex hull of points IS a polyhedron: every face is flat. So this
// writes it as one. Coplanar hull triangles are merged into the real polygon
// faces, each face becomes a PLANE bounded by straight edges, and the result
// is STEP text, which the existing exact-import path (IMPORT3D stepText, see
// dsl.js "import") gives to the Rust kernel as an exact B-rep. Hulling two
// cubes gives the 10-face frustum, not 16 triangles.
//
// Curved children (cylinders, spheres) are sampled at their tessellation, so
// their hull is an exact polyhedron with that many facets: the same shape the
// mesh hull had, now with flat faces the kernel can cut and fillet.
//
// The result is checked before it is trusted (Euler V - E + F = 2, every edge
// shared by exactly two faces). If anything is off, polyhedronStep returns
// null and the caller keeps the mesh hull.

const fmt = (v) => {
  const s = Number.isInteger(v) ? `${v}.` : String(+v.toPrecision(15));
  return /[.eE]/.test(s) ? s.replace(/e/, "E") : `${s}.`;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

// faces: the hull's triangles as { normal: [x,y,z] (unit, outward), pts: [[x,y,z] x3] }.
// Returns { faces: [{ normal, loop: [vertexIndex...] }], verts: [[x,y,z]] } or null.
export function mergePlanarFaces(tris, scale = 1) {
  const tol = 1e-7 * Math.max(1, scale);
  // one vertex per position
  const verts = [], key = new Map();
  const vid = (p) => {
    const k = p.map((c) => Math.round(c / tol)).join(",");
    let i = key.get(k);
    if (i == null) { i = verts.length; verts.push(p); key.set(k, i); }
    return i;
  };
  // group triangles by plane: same normal and same offset
  const planes = [];
  for (const t of tris) {
    const n = t.normal, d = dot(n, t.pts[0]);
    let pl = planes.find((q) => dot(q.n, n) > 1 - 1e-10 && Math.abs(q.d - d) < tol * 10);
    if (!pl) { pl = { n, d, ids: new Set() }; planes.push(pl); }
    for (const p of t.pts) pl.ids.add(vid(p));
  }
  // each plane's polygon: the 2D convex hull of its points, counter-clockwise
  // seen from outside, collinear points dropped (they are not corners)
  const faces = [];
  for (const pl of planes) {
    const ids = [...pl.ids];
    if (ids.length < 3) return null;
    const ref = Math.abs(pl.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(pl.n, ref)), v = cross(pl.n, u);
    const p2 = ids.map((i) => ({ i, x: dot(verts[i], u), y: dot(verts[i], v) }))
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const turn = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const eps = tol * tol * 100;
    const half = (list) => {
      const h = [];
      for (const p of list) {
        while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], p) <= eps) h.pop();
        h.push(p);
      }
      h.pop();
      return h;
    };
    const loop = [...half(p2), ...half([...p2].reverse())].map((p) => p.i);
    if (loop.length < 3) return null;
    faces.push({ normal: pl.n, loop });
  }
  // only corners that some face kept are vertices
  return { faces, verts };
}

// Euler and two-faces-per-edge: the solid is closed and has no T-junctions.
function closed({ faces }) {
  const edges = new Map(), used = new Set();
  for (const f of faces) {
    for (let k = 0; k < f.loop.length; k++) {
      const a = f.loop[k], b = f.loop[(k + 1) % f.loop.length];
      used.add(a);
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  for (const c of edges.values()) if (c !== 2) return false;
  return used.size - edges.size + faces.length === 2;
}

// STEP AP242 text for the polyhedron, in the shape the kernel's own writer
// uses (and its reader therefore accepts).
export function polyhedronStep(tris, name = "hull") {
  let scale = 1;
  for (const t of tris) for (const p of t.pts) for (const c of p) scale = Math.max(scale, Math.abs(c));
  const poly = mergePlanarFaces(tris, scale);
  if (!poly || !closed(poly)) return null;
  const { faces, verts } = poly;
  const out = [];
  let n = 0;
  const add = (s) => { out.push(`#${++n}=${s};`); return n; };
  const pt = (p) => add(`CARTESIAN_POINT('',(${p.map(fmt).join(",")}))`);
  const dir = (d) => add(`DIRECTION('',(${d.map(fmt).join(",")}))`);
  const ctx1 = add("APPLICATION_CONTEXT('managed model based 3d engineering')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','ap242_managed_model_based_3d_engineering',2014,#${ctx1})`);
  const pctx = add(`PRODUCT_CONTEXT('',#${ctx1},'mechanical')`);
  const pdctx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${ctx1},'design')`);
  const len = add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))");
  const ang = add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))");
  const sol = add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),#${len},'distance_accuracy_value','')`);
  const gctx = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${len},#${ang},#${sol}))REPRESENTATION_CONTEXT('',''))`);
  const origin = add(`AXIS2_PLACEMENT_3D('',#${pt([0, 0, 0])},#${dir([0, 0, 1])},#${dir([1, 0, 0])})`);

  const vpIds = new Map();
  const vp = (i) => { if (!vpIds.has(i)) vpIds.set(i, add(`VERTEX_POINT('',#${pt(verts[i])})`)); return vpIds.get(i); };
  const edge = new Map();               // "a,b" (a < b) -> EDGE_CURVE id, running a -> b
  const edgeOf = (a, b) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const k = `${lo},${hi}`;
    if (!edge.has(k)) {
      const d = sub(verts[hi], verts[lo]), L = Math.hypot(...d);
      const line = add(`LINE('',#${pt(verts[lo])},#${add(`VECTOR('',#${dir(norm(d))},${fmt(L)})`)})`);
      edge.set(k, add(`EDGE_CURVE('',#${vp(lo)},#${vp(hi)},#${line},.T.)`));
    }
    return { id: edge.get(k), same: a < b };
  };
  const faceIds = [];
  for (const f of faces) {
    const p0 = verts[f.loop[0]];
    const xdir = norm(sub(verts[f.loop[1]], p0));
    const plane = add(`PLANE('',#${add(`AXIS2_PLACEMENT_3D('',#${pt(p0)},#${dir(f.normal)},#${dir(xdir)})`)})`);
    const oes = f.loop.map((a, k) => {
      const e = edgeOf(a, f.loop[(k + 1) % f.loop.length]);
      return add(`ORIENTED_EDGE('',*,*,#${e.id},${e.same ? ".T." : ".F."})`);
    });
    const loop = add(`EDGE_LOOP('',(${oes.map((i) => `#${i}`).join(",")}))`);
    faceIds.push(add(`ADVANCED_FACE('',(#${add(`FACE_OUTER_BOUND('',#${loop},.T.)`)}),#${plane},.T.)`));
  }
  const shell = add(`CLOSED_SHELL('',(${faceIds.map((i) => `#${i}`).join(",")}))`);
  const brep = add(`MANIFOLD_SOLID_BREP('${name}',#${shell})`);
  const rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${origin},#${brep}),#${gctx})`);
  const prod = add(`PRODUCT('${name}','${name}','',(#${pctx}))`);
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${prod}))`);
  const pdf = add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
  const pd = add(`PRODUCT_DEFINITION('design','',#${pdf},#${pdctx})`);
  const pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
  return {
    faces: faces.length,
    step: "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n"
      + `FILE_NAME('${name}.step','',(''),(''),'brepcode','brepcode','');\n`
      + "FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }'));\nENDSEC;\nDATA;\n"
      + out.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n",
  };
}
