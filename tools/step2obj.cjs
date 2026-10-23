#!/usr/bin/env node
// STEP -> OBJ with one named object per solid body, using BREPcode's own OCCT engine
// (replicad + replicad-opencascadejs) headless in Node.
//
//   node tools/step2obj.cjs in.step [out.obj] [--tol 0.05] [--ang 15]
//
// The OCCT build that ships with replicad has the plain STEPControl_Reader but not the
// XCAF (name-aware) reader, so names come from the STEP's own product/assembly tree, walked
// in the same depth-first order OCCT uses to build its compound. Every body is cross-checked
// by face count (CLOSED_SHELL face list vs. the solid's faces) so a mis-ordered name is caught,
// not silently written.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const args = process.argv.slice(2);
const inFile = args[0];
if (!inFile) { console.error("usage: step2obj.cjs in.step [out.obj] [--tol mm] [--ang deg]"); process.exit(2); }
const outFile = (args[1] && !args[1].startsWith("--")) ? args[1] : inFile.replace(/\.(step|stp)$/i, "") + ".obj";
const opt = (k, d) => { const i = args.indexOf(k); return i > 0 ? +args[i + 1] : d; };
const TOL = opt("--tol", 0.05), ANG = opt("--ang", 15);

const base = path.join(__dirname, "..", "node_modules");

// ------------------------------------------------------------- STEP text: names + assembly tree
function decodeStepString(s) {
  // \X\hh = ISO-8859-1 byte, \X2\hhhh...\X0\ = UTF-16BE run, '' = quote
  return s.replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, hex) => hex.match(/.{4}/g).map(h => String.fromCharCode(parseInt(h, 16))).join(""))
          .replace(/\\X\\([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/''/g, "'");
}
function parseStep(text) {
  const ent = new Map();
  const re = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = re.exec(text))) ent.set(+m[1], { type: m[2], args: m[3] });
  return ent;
}
const refs = (s) => [...s.matchAll(/#(\d+)/g)].map(x => +x[1]);
const firstString = (s) => { const m = /'((?:[^']|'')*)'/.exec(s); return m ? decodeStepString(m[1]) : ""; };

function buildTree(ent) {
  const byType = (t) => [...ent].filter(([, e]) => e.type === t);
  const product = new Map();          // PRODUCT id -> name
  for (const [id, e] of byType("PRODUCT")) product.set(id, firstString(e.args));
  const pdfProduct = new Map();       // PRODUCT_DEFINITION_FORMATION id -> product id
  for (const [id, e] of ent) if (e.type.startsWith("PRODUCT_DEFINITION_FORMATION")) {
    const r = refs(e.args); pdfProduct.set(id, r[r.length - 1]);
  }
  const pdName = new Map();           // PRODUCT_DEFINITION id -> product name
  for (const [id, e] of byType("PRODUCT_DEFINITION")) {
    const r = refs(e.args); const pid = pdfProduct.get(r[0]);
    pdName.set(id, product.get(pid) ?? `pd${id}`);
  }
  // PRODUCT_DEFINITION -> shape representation (via PRODUCT_DEFINITION_SHAPE + SHAPE_DEFINITION_REPRESENTATION)
  const pdsOf = new Map();            // PDS id -> definition id (PD or NAUO)
  for (const [id, e] of byType("PRODUCT_DEFINITION_SHAPE")) pdsOf.set(id, refs(e.args)[0]);
  const pdRep = new Map();            // PD id -> representation id
  for (const [, e] of byType("SHAPE_DEFINITION_REPRESENTATION")) {
    const [pds, rep] = refs(e.args); const def = pdsOf.get(pds);
    if (def !== undefined && ent.get(def)?.type === "PRODUCT_DEFINITION") pdRep.set(def, rep);
  }
  // solids per representation, in item order
  const shellFaces = new Map();
  for (const [id, e] of byType("CLOSED_SHELL")) shellFaces.set(id, refs(e.args).length);
  // ORIENTED_CLOSED_SHELL('', *, #shell, .F.) wraps a CLOSED_SHELL; resolve to the underlying face count
  for (const [id, e] of byType("ORIENTED_CLOSED_SHELL")) shellFaces.set(id, shellFaces.get(refs(e.args)[0]) ?? -1);
  const solidInfo = new Map();        // solid entity id -> {name, faces}
  for (const [id, e] of byType("MANIFOLD_SOLID_BREP")) {
    const shell = refs(e.args)[0];
    solidInfo.set(id, { name: firstString(e.args), faces: shellFaces.get(shell) ?? -1 });
  }
  // BREP_WITH_VOIDS('name', #outer, (#void, ...)): one solid whose faces include every void shell
  for (const [id, e] of byType("BREP_WITH_VOIDS")) {
    const r = refs(e.args);
    solidInfo.set(id, { name: firstString(e.args), faces: r.reduce((n, s) => n + (shellFaces.get(s) ?? 0), 0) });
  }
  const repSolids = new Map();        // rep id -> [MSB ids]
  for (const [id, e] of ent) if (/SHAPE_REPRESENTATION$/.test(e.type)) {
    repSolids.set(id, refs(e.args).filter(r => solidInfo.has(r)));
  }
  // a part's SHAPE_REPRESENTATION often holds only a placement; its B-rep lives in an
  // ADVANCED_BREP_SHAPE_REPRESENTATION tied on with SHAPE_REPRESENTATION_RELATIONSHIP(rep, brep)
  for (const [, e] of byType("SHAPE_REPRESENTATION_RELATIONSHIP")) {
    const [rep, brep] = refs(e.args);
    if (repSolids.has(rep) && repSolids.has(brep)) repSolids.set(rep, [...repSolids.get(rep), ...repSolids.get(brep)]);
  }
  // assembly children: NAUO(parent PD, child PD), ordered by entity id (OCCT's transfer order)
  const children = new Map();
  for (const [id, e] of byType("NEXT_ASSEMBLY_USAGE_OCCURRENCE")) {
    const r = refs(e.args); const parent = r[0], child = r[1];
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push({ nauo: id, child, occName: firstString(e.args) });
  }
  for (const list of children.values()) list.sort((a, b) => a.nauo - b.nauo);
  const isChild = new Set([...children.values()].flat().map(c => c.child));
  const roots = [...pdName.keys()].filter(pd => !isChild.has(pd)).sort((a, b) => a - b);

  const order = [];                   // depth-first leaves: {product, body, faces, path}
  const walk = (pd, trail) => {
    const name = pdName.get(pd);
    const rep = pdRep.get(pd);
    const solids = rep !== undefined ? (repSolids.get(rep) ?? []) : [];
    // OCCT builds each assembly node as: child sub-assemblies first, then the node's own bodies
    for (const c of children.get(pd) ?? []) walk(c.child, [...trail, name]);
    for (const msb of solids) {
      const s = solidInfo.get(msb);
      order.push({ product: name, body: s.name, faces: s.faces, path: [...trail, name].join(" / ") });
    }
  };
  for (const r of roots) walk(r, []);
  return { order, roots: roots.map(r => pdName.get(r)), nSolidsInFile: solidInfo.size };
}

// ------------------------------------------------------------- OCCT via replicad
async function loadEngine() {
  const r = require(path.join(base, "replicad", "dist", "replicad.cjs"));
  const glueSrc = fs.readFileSync(path.join(base, "replicad-opencascadejs", "src", "replicad_single.js"), "utf8")
    .replace(/^export default Module;\s*$/m, "module.exports = Module;");
  const glueFile = path.join(os.tmpdir(), "brepcode-occ-glue.cjs");
  fs.writeFileSync(glueFile, glueSrc);
  const init = require(glueFile);
  const wasmBinary = fs.readFileSync(path.join(base, "replicad-opencascadejs", "src", "replicad_single.wasm"));
  const OC = await init({ wasmBinary });
  r.setOC(OC);
  return { r, OC };
}

function faceCount(OC, shape) {
  let n = 0;
  const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) n++;
  ex.delete();
  return n;
}
function bbox(OC, shape) {
  const b = new OC.Bnd_Box_1();
  OC.BRepBndLib.Add(shape, b, true);
  const lo = b.CornerMin(), hi = b.CornerMax();
  const out = [lo.X(), lo.Y(), lo.Z(), hi.X(), hi.Y(), hi.Z()];
  b.delete();
  return out;
}

(async () => {
  const t0 = Date.now();
  const text = fs.readFileSync(inFile, "latin1");
  const tree = buildTree(parseStep(text));
  console.log(`STEP tree: roots=${tree.roots.join(" | ")} bodies in file=${tree.nSolidsInFile} leaves in tree=${tree.order.length}`);

  const { r, OC } = await loadEngine();
  console.log(`engine up (${((Date.now() - t0) / 1000).toFixed(1)}s), reading STEP...`);
  const shape = await r.importSTEP(new Blob([fs.readFileSync(inFile)]));
  console.log(`STEP read (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // split into solids in OCCT's compound order
  const solids = [];
  const ex = new OC.TopExp_Explorer_2(shape.wrapped, OC.TopAbs_ShapeEnum.TopAbs_SOLID, OC.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) solids.push(OC.TopoDS.Solid_1(ex.Current()));
  ex.delete();
  console.log(`OCCT solids: ${solids.length}`);
  if (solids.length !== tree.order.length) {
    console.error(`MISMATCH: OCCT produced ${solids.length} solids but the STEP tree has ${tree.order.length} body leaves; aborting rather than mislabel.`);
    const occ = solids.map(s => faceCount(OC, s));
    console.error("OCCT face counts :", occ.join(" "));
    console.error("tree face counts :", tree.order.map(o => o.faces).join(" "));
    tree.order.forEach((o, i) => console.error(`  tree #${i} faces ${o.faces} ${o.path}`));
    process.exit(1);
  }

  // validate order by face count
  let bad = 0;
  const rows = solids.map((s, i) => {
    const fc = faceCount(OC, s), exp = tree.order[i].faces;
    if (fc !== exp) bad++;
    return { i, fc, exp, ok: fc === exp, ...tree.order[i] };
  });
  for (const row of rows) console.log(`${row.ok ? "ok " : "BAD"} #${String(row.i).padStart(2)} faces ${String(row.fc).padStart(4)}/${String(row.exp).padStart(4)}  ${row.path}${row.body && row.body !== "Body1" ? "  [" + row.body + "]" : ""}`);
  if (bad) { console.error(`${bad} bodies failed the face-count check; aborting.`); process.exit(1); }

  // unique object names
  const seen = new Map();
  const objName = (row) => {
    let n = row.product;
    if (row.body && !/^Body\d*$/.test(row.body) && row.body.toLowerCase() !== row.product.toLowerCase()) n += " - " + row.body;
    const k = seen.get(n) ?? 0; seen.set(n, k + 1);
    if (k) n += ` (${k + 1})`;
    return n.replace(/[\r\n]/g, " ");
  };

  // mesh + write
  let out = `# ${path.basename(inFile)} -> OBJ via BREPcode/OCCT, ${solids.length} bodies, units mm, tol ${TOL} mm / ${ANG} deg\n`;
  let vOff = 0, tris = 0, maxDrift = 0;
  for (const row of rows) {
    const wrapped = r.cast(solids[row.i]);
    const mesh = wrapped.mesh({ tolerance: TOL, angularTolerance: ANG });
    const v = mesh.vertices, t = mesh.triangles;
    // sanity: meshed extent must agree with OCCT's own triangulation box, which applies the
    // assembly placement itself (catches a lost location; the pure-geometry box is too loose for splines)
    const bb = bbox(OC, solids[row.i]);
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]); }
    const drift = Math.max(...[0, 1, 2].map(k => Math.abs(mn[k] - bb[k]) + Math.abs(mx[k] - bb[k + 3])));
    // Bnd_Box is padded by the sub-shapes' tolerances (sloppy STEP faces carry ~1 mm), so allow a few mm;
    // a genuinely lost placement shows up as tens of mm
    if (drift > 5.0) { console.error(`placement drift ${drift.toFixed(2)} mm on body #${row.i}; aborting.`); process.exit(1); }
    maxDrift = Math.max(maxDrift, drift);
    const name = objName(row);
    out += `o ${name}\n`;
    const lines = [];
    for (let i = 0; i < v.length; i += 3) lines.push(`v ${+v[i].toFixed(4)} ${+v[i + 1].toFixed(4)} ${+v[i + 2].toFixed(4)}`);
    for (let i = 0; i < t.length; i += 3) lines.push(`f ${t[i] + 1 + vOff} ${t[i + 1] + 1 + vOff} ${t[i + 2] + 1 + vOff}`);
    out += lines.join("\n") + "\n";
    vOff += v.length / 3; tris += t.length / 3;
    console.log(`meshed #${row.i} ${name}: ${v.length / 3} verts, ${t.length / 3} tris`);
  }
  fs.writeFileSync(outFile, out);
  console.log(`WROTE ${outFile}  (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB, ${solids.length} objects, ${tris} triangles, max placement slack ${maxDrift.toFixed(2)} mm, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
})().catch(e => { console.error("FAIL", e && e.stack || e); process.exit(1); });
