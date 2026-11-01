// Faceted STEP straight from a build's own triangles.
//
// Why: a model built on the Rust kernel comes back as tessellated faces, and
// the Rust kernel cannot write STEP from that build. The faceted STEP used to
// be made by rebuilding the whole history on the JS kernel instead, which for
// an exact-rebuilt mesh (importedSolid: an 8,106-face STEP from a Benchy) was
// slow AND lossy: it kept 1,830 of the faces and the file had 3,106 open
// edges, so a slicer showed half a boat. This writes what was built.
//
// solids: [{ name, faces: [{ positions: Float32Array|number[], index?: [] }] }]
// (the engine's split-build records; one entry in `faces` per B-rep face).
//
// Each B-rep face whose triangles all lie in one plane becomes ONE STEP face,
// bounded by loops traced from its border edges (outer + holes), so a cube is
// 6 faces, not 12. A curved face (a cylinder's side) is written one flat face
// per triangle. Vertices are welded across the whole solid, so neighbouring
// faces share their edges and the shell is closed wherever the triangles are.
//
// Returns { step, faces, openEdges, solids }. openEdges > 0 means the source
// triangles themselves had gaps; the caller decides what to do about it.

const fmt = (v) => {
  if (Object.is(v, -0)) v = 0;
  const s = Number.isInteger(v) ? `${v}.` : String(+v.toPrecision(15));
  return /[.eE]/.test(s) ? s.replace(/e/, "E") : `${s}.`;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Border loops of a set of triangles (vertex ids, CCW about the outward
// normal). Null when the border doesn't chain into simple loops (a vertex
// with two ways out), so the caller falls back to triangles.
function borderLoops(tris) {
  const count = new Map();
  for (const [a, b, c] of tris) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const next = new Map();
  for (const [a, b, c] of tris) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      if (count.get(k) !== 1) continue;           // interior edge
      if (next.has(u)) return null;               // pinched border
      next.set(u, v);
    }
  }
  const loops = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let v = start;
    while (!seen.has(v)) {
      seen.add(v);
      loop.push(v);
      v = next.get(v);
      if (v === undefined) return null;
    }
    if (v !== start || loop.length < 3) return null;
    loops.push(loop);
  }
  return loops;
}

export function trianglesStep(solids, name = "model") {
  const out = [];
  let n = 0;
  const add = (s) => { out.push(`#${++n}=${s};`); return n; };
  const pt = (p) => add(`CARTESIAN_POINT('',(${p.map(fmt).join(",")}))`);
  const dir = (d) => add(`DIRECTION('',(${d.map(fmt).join(",")}))`);
  const ctx1 = add("APPLICATION_CONTEXT('managed model based 3d engineering')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','ap242_managed_model_based_3d_engineering',2014,#${ctx1})`);
  const pctx = add(`PRODUCT_CONTEXT('',#${ctx1},'mechanical')`);
  const pdctx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${ctx1},'design')`);
  const lenU = add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))");
  const ang = add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))");
  const sol = add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),#${lenU},'distance_accuracy_value','')`);
  const gctx = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lenU},#${ang},#${sol}))REPRESENTATION_CONTEXT('',''))`);
  const origin = add(`AXIS2_PLACEMENT_3D('',#${pt([0, 0, 0])},#${dir([0, 0, 1])},#${dir([1, 0, 0])})`);

  const breps = [];
  let totalFaces = 0, openEdges = 0;
  for (const [si, s] of solids.entries()) {
    // ---- weld every vertex of the solid
    let scale = 1;
    for (const f of s.faces) for (const c of f.positions) scale = Math.max(scale, Math.abs(c));
    const tol = 1e-6 * scale;
    const verts = [], key = new Map();
    const vid = (x, y, z) => {
      const k = `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`;
      let i = key.get(k);
      if (i === undefined) { i = verts.length; key.set(k, i); verts.push([x, y, z]); }
      return i;
    };
    const faces = [];             // [{ tris: [[a,b,c]] }]
    for (const f of s.faces) {
      const P = f.positions;
      const idx = f.index || Array.from({ length: P.length / 3 }, (_, i) => i);
      const tris = [];
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => vid(P[3 * i], P[3 * i + 1], P[3 * i + 2]));
        if (a === b || b === c || a === c) continue;
        if (len(cross(sub(verts[b], verts[a]), sub(verts[c], verts[a]))) < tol * tol) continue;
        tris.push([a, b, c]);
      }
      if (tris.length) faces.push({ tris });
    }

    // ---- STEP entities, edges shared across the whole solid
    const vpIds = new Map();
    const vp = (i) => { if (!vpIds.has(i)) vpIds.set(i, add(`VERTEX_POINT('',#${pt(verts[i])})`)); return vpIds.get(i); };
    const edge = new Map();
    const uses = new Map();
    const edgeOf = (a, b) => {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const k = `${lo},${hi}`;
      if (!edge.has(k)) {
        const d = sub(verts[hi], verts[lo]);
        const line = add(`LINE('',#${pt(verts[lo])},#${add(`VECTOR('',#${dir(norm(d))},${fmt(len(d))})`)})`);
        edge.set(k, add(`EDGE_CURVE('',#${vp(lo)},#${vp(hi)},#${line},.T.)`));
      }
      uses.set(k, (uses.get(k) || 0) + 1);
      return add(`ORIENTED_EDGE('',*,*,#${edge.get(k)},${a < b ? ".T." : ".F."})`);
    };
    const planeOf = (normal, p0, p1) => {
      let x = sub(p1, p0);
      x = sub(x, normal.map((c) => c * dot(x, normal)));
      if (len(x) < 1e-12) x = Math.abs(normal[0]) < 0.9 ? cross(normal, [1, 0, 0]) : cross(normal, [0, 1, 0]);
      return add(`PLANE('',#${add(`AXIS2_PLACEMENT_3D('',#${pt(p0)},#${dir(normal)},#${dir(norm(x))})`)})`);
    };
    const faceIds = [];
    const writeFace = (normal, loops) => {
      // loops[0] is the outer one; the plane sits on its first vertex
      const plane = planeOf(normal, verts[loops[0][0]], verts[loops[0][1]]);
      const bounds = loops.map((loop, li) => {
        const oes = loop.map((a, k) => edgeOf(a, loop[(k + 1) % loop.length]));
        const el = add(`EDGE_LOOP('',(${oes.map((i) => `#${i}`).join(",")}))`);
        return add(`${li === 0 ? "FACE_OUTER_BOUND" : "FACE_BOUND"}('',#${el},.T.)`);
      });
      faceIds.push(add(`ADVANCED_FACE('',(${bounds.map((i) => `#${i}`).join(",")}),#${plane},.T.)`));
    };
    const triNormal = ([a, b, c]) => norm(cross(sub(verts[b], verts[a]), sub(verts[c], verts[a])));
    for (const f of faces) {
      // one plane for the whole face?
      const n0 = triNormal(f.tris[0]);
      const p0 = verts[f.tris[0][0]];
      const flat = f.tris.length > 1 && f.tris.every((t) => {
        if (dot(triNormal(t), n0) < 1 - 1e-9) return false;
        return t.every((v) => Math.abs(dot(sub(verts[v], p0), n0)) <= tol * 10);
      });
      const loops = flat ? borderLoops(f.tris) : null;
      if (loops && loops.length) {
        // outer loop = the one with the biggest area along the normal
        const area = (loop) => {
          let s = [0, 0, 0];
          for (let k = 0; k < loop.length; k++) s = [0, 1, 2].map((i) => s[i] + cross(verts[loop[k]], verts[loop[(k + 1) % loop.length]])[i]);
          return dot(s, n0) / 2;
        };
        loops.sort((A, B) => area(B) - area(A));
        if (area(loops[0]) > 0 && loops.slice(1).every((l) => area(l) < 0)) { writeFace(n0, loops); continue; }
      }
      for (const t of f.tris) writeFace(triNormal(t), [t]);
    }
    for (const c of uses.values()) if (c !== 2) openEdges++;
    totalFaces += faceIds.length;
    const shell = add(`CLOSED_SHELL('',(${faceIds.map((i) => `#${i}`).join(",")}))`);
    breps.push(add(`MANIFOLD_SOLID_BREP('${String(s.name || `${name}_${si}`).replace(/'/g, "")}',#${shell})`));
  }

  const rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${origin},${breps.map((i) => `#${i}`).join(",")}),#${gctx})`);
  const safe = String(name).replace(/'/g, "");
  const prod = add(`PRODUCT('${safe}','${safe}','',(#${pctx}))`);
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${prod}))`);
  const pdf = add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
  const pd = add(`PRODUCT_DEFINITION('design','',#${pdf},#${pdctx})`);
  const pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
  return {
    faces: totalFaces, openEdges, solids: breps.length,
    step: "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n"
      + `FILE_NAME('${safe}.step','',(''),(''),'brepcode','brepcode','');\n`
      + "FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }'));\nENDSEC;\nDATA;\n"
      + out.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n",
  };
}
