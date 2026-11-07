// STEP -> code (src/stepread.js, src/step2code.js, src/step2code-check.js).
//
// Each model below is built, written out as exact STEP by the Rust kernel
// (src/stepexport.js), and converted back. The converter must rebuild every
// body as code (not keep it as an imported solid), with the expected kind and
// dials, and its own check must say the code is the same shape as the file.
// Then the reader is checked on what real exporters write and the kernel's
// exports do not: units, a placed assembly, colours, complex entities.

import * as dsl from "../src/dsl.js";
import { writeFileSync } from "node:fs";
import { runEditorCode } from "../src/runcode.js";
import { build } from "../src/render.js";
import { exactSTEP } from "../src/stepexport.js";
import { readStep, parsePart21 } from "../src/stepread.js";
import { convertStep } from "../src/step2code-check.js";
import { tryRevolve, toCode } from "../src/step2code.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const stepOf = async (src, name) => exactSTEP(await build(runEditorCode(src).shape, { engine: "split" }), name);

const MODELS = [
  {
    name: "plate with holes",
    src: `return difference(cube([40, 30, 4]), translate([8, 8, -1], cylinder({ r: 1.7, h: 6 })), translate([32, 8, -1], cylinder({ r: 1.7, h: 6 })), translate([20, 22, -1], cylinder({ r: 3, h: 6 })));`,
    kind: "extrude", has: [/const holeD1 = 3\.4;/, /const holeD2 = 6;/, /const thickness = 4;/, /drill\(\[8, 8, thickness\], \[0, 0, 1\], \{ d: holeD1, through: true \}\)/],
  },
  {
    name: "stepped block with a counterbore",
    src: `return difference(union(cube([30, 30, 5]), translate([5, 5, 5], cube([20, 20, 8]))), translate([15, 15, -1], cylinder({ r: 2, h: 20 })), translate([15, 15, 10], cylinder({ r: 4, h: 5 })));`,
    kind: "extrude", has: [/const t1 = 5;/, /const t2 = 8;/, /cbore: \{ d: 8, depth: 3 \}/, /through: true/],
  },
  {
    // the small hole nicks the upper block's corner, so the layer above has
    // a notch on that same cylinder (an arc end that is not a round number:
    // 4 + sqrt(1.25), kept to 7 decimals so arcTo's two ends share a circle).
    // With the layers touching, the kernel refused the drill's subtract; the
    // upper layer now runs down through the base, and it builds.
    name: "a hole that notches the layer above",
    src: `return difference(union(cube([40, 30, 5]), translate([5, 5, 5], cube([30, 20, 8]))), translate([20, 15, -1], cylinder({ r: 2, h: 20 })), translate([20, 15, 10], cylinder({ r: 4, h: 5 })), translate([4, 4, -1], cylinder({ r: 1.5, h: 10 })));`,
    kind: "extrude", has: [/arcTo\(\[5\.118034, 5\], \{ center: \[4, 4\], cw: true \}\)/, /linearExtrude\(\{ h: t1 \+ t2 \+ t3 \}/, /drill\(\[4, 4, t1\], \[0, 0, 1\], \{ d: holeD1, through: true \}\)/],
  },
  {
    name: "blind hole from the top",
    src: `return difference(cube([20, 20, 10]), translate([10, 10, 4], cylinder({ r: 2.5, h: 10 })));`,
    kind: "extrude", has: [/depth: 6/],
  },
  {
    name: "a part standing up along X",
    src: `return rotate([0, 90, 0], difference(cube([12, 20, 30]), translate([6, 10, -1], cylinder({ r: 2, h: 40 }))));`,
    kind: "extrude",
  },
  {
    name: "stepped shaft (turned)",
    src: `return union(cylinder({ r: 10, h: 5 }), translate([0, 0, 5], cylinder({ r: 6, h: 12 })), translate([0, 0, 17], cylinder({ r1: 6, r2: 3, h: 4 })));`,
    kind: "revolve",
  },
  {
    name: "a ring with a cone face, off the origin",
    src: `return translate([30, -12, 7], difference(cylinder({ r1: 15, r2: 12, h: 6 }), translate([0, 0, -1], cylinder({ r: 8, h: 8 }))));`,
    kind: "revolve",
  },
];

for (const m of MODELS) {
  let r;
  try { r = await convertStep(await stepOf(m.src, "t"), { title: "t" }); }
  catch (e) { check(`${m.name}: converts`, false, e.stack); continue; }
  const b = r.bodies[0];
  check(`${m.name}: rebuilt as code (${b.kind})`, r.bodies.length === 1 && b.ok, b.why || "");
  if (m.kind) check(`${m.name}: as ${m.kind}`, b.kind === m.kind, `got ${b.kind}`);
  check(`${m.name}: the check found it the same shape`, b.ok && b.diff < 1e-5, `diff ${b.diff}`);
  for (const re of m.has || []) check(`${m.name}: code has ${re}`, re.test(r.code), r.code);
  check(`${m.name}: nothing kept as an import`, r.imports.length === 0);
  // and the code it wrote builds on its own
  try {
    const out = await build(runEditorCode(r.code).shape, { engine: "split" });
    check(`${m.name}: the written code builds exact`, out.engine === "exact" && out.kernel === "rust", `${out.engine}/${out.kernel}`);
  } catch (e) { check(`${m.name}: the written code builds`, false, String(e?.message || e).slice(0, 200)); }
}

// a body the converter cannot rebuild stays the file's own solid, and the
// code still builds (the importedSolid it names is handed back)
{
  const r = await convertStep(await stepOf(`return sphere({ r: 8 });`, "ball"), { title: "ball" });
  const b = r.bodies[0];
  // a lone sphere is turned (two half arcs); a hull is the real "cannot"
  check("a sphere converts or is kept, never lost", b.ok || r.imports.length === 1, JSON.stringify(b));
  const r2 = await convertStep(await stepOf(`return rotate([20, 30, 0], difference(cube([10, 10, 10]), translate([5, 5, 5], sphere({ r: 6.5 }))));`, "odd"), { title: "odd" });
  const b2 = r2.bodies[0];
  check("a body with no exact rebuild is kept as the file's solid", !b2.ok && r2.imports.length === 1 && /importedSolid\("odd-/.test(r2.code), r2.code);
  check("...with the reason in the code", /kept as the file's solid \(/.test(r2.code));
  check("...and a fallback mesh with it", typeof r2.imports[0]?.mesh === "string" && /^solid /.test(r2.imports[0].mesh));
  for (const im of r2.imports) dsl.registerImport(im.name, im.step, { mesh: im.mesh });
  try {
    const out = await build(runEditorCode(r2.code).shape, { engine: "split" });
    check("...and that code builds", out.solids.length >= 1);
  } catch (e) { check("...and that code builds", false, String(e?.message || e).slice(0, 200)); }
}

// ---- the reader on what CAD exporters write
const HEAD = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('t','',(''),(''),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n`;
const box = (o, id0) => {
  // a 10 x 10 x 10 cube as six faces, corner o, numbered from id0
  const [x, y, z] = o;
  const P = [[x, y, z], [x + 10, y, z], [x + 10, y + 10, z], [x, y + 10, z], [x, y, z + 10], [x + 10, y, z + 10], [x + 10, y + 10, z + 10], [x, y + 10, z + 10]];
  let n = id0;
  const L = [];
  const e = (s) => { L.push(`#${n}=${s};`); return n++; };
  const pts = P.map((p) => e(`CARTESIAN_POINT('',(${p.map((v) => v.toFixed(1)).join(",")}))`));
  const vs = pts.map((p) => e(`VERTEX_POINT('',#${p})`));
  const edge = new Map();
  const ec = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edge.has(k)) {
      const d = P[b].map((v, i) => v - P[a][i]); const l = Math.hypot(...d);
      const dir = e(`DIRECTION('',(${d.map((v) => (v / l).toFixed(1)).join(",")}))`);
      const vec = e(`VECTOR('',#${dir},${l})`);
      const line = e(`LINE('',#${pts[a]},#${vec})`);
      edge.set(k, { id: e(`EDGE_CURVE('',#${vs[a]},#${vs[b]},#${line},.T.)`), a });
    }
    const ed = edge.get(k);
    return e(`ORIENTED_EDGE('',*,*,#${ed.id},${ed.a === a ? ".T." : ".F."})`);
  };
  const faces = [];
  const face = (loop, nrm, at) => {
    const oes = loop.map((v, i) => ec(v, loop[(i + 1) % loop.length]));
    const el = e(`EDGE_LOOP('',(${oes.map((x) => `#${x}`).join(",")}))`);
    const fb = e(`FACE_OUTER_BOUND('',#${el},.T.)`);
    const c = e(`CARTESIAN_POINT('',(${P[at].map((v) => v.toFixed(1)).join(",")}))`);
    const zd = e(`DIRECTION('',(${nrm.join(",")}))`);
    const ax = e(`AXIS2_PLACEMENT_3D('',#${c},#${zd},$)`);
    const pl = e(`PLANE('',#${ax})`);
    faces.push(e(`ADVANCED_FACE('',(#${fb}),#${pl},.T.)`));
  };
  face([0, 3, 2, 1], ["0.", "0.", "-1."], 0); face([4, 5, 6, 7], ["0.", "0.", "1."], 4);
  face([0, 1, 5, 4], ["0.", "-1.", "0."], 0); face([2, 3, 7, 6], ["0.", "1.", "0."], 2);
  face([1, 2, 6, 5], ["1.", "0.", "0."], 1); face([3, 0, 4, 7], ["-1.", "0.", "0."], 3);
  const sh = e(`CLOSED_SHELL('',(${faces.map((f) => `#${f}`).join(",")}))`);
  const brep = e(`MANIFOLD_SOLID_BREP('cube',#${sh})`);
  return { lines: L, brep, next: n };
};
{
  // inches: a 10-unit cube is 254 mm
  const b = box([0, 0, 0], 100);
  const text = HEAD + [
    `#1=( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );`,
    `#2=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#1);`,
    `#3=( CONVERSION_BASED_UNIT('INCH',#2) LENGTH_UNIT() NAMED_UNIT(#4) );`,
    `#4=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);`,
    `#5=( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((#3)) REPRESENTATION_CONTEXT('','') );`,
    ...b.lines,
  ].join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
  const r = readStep(text);
  check("inches: the unit is 25.4 mm", Math.abs(r.unit - 25.4) < 1e-9, String(r.unit));
  const zs = r.solids[0].faces.flatMap((f) => f.loops.flatMap((l) => l.edges.map((e) => e.a[2])));
  check("inches: a 10 inch cube is 254 mm tall", Math.abs(Math.max(...zs) - 254) < 1e-6, String(Math.max(...zs)));
}
{
  // an assembly: one cube product placed twice, the second 50 mm along X and
  // turned 90 degrees about Z; plus a colour on the part
  const b = box([0, 0, 0], 1000);
  const L = [
    `#1=( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );`,
    `#10=PRODUCT('asm','asm','',(#90));`, `#11=PRODUCT_DEFINITION_FORMATION('','',#10);`, `#12=PRODUCT_DEFINITION('design','',#11,#91);`,
    `#13=PRODUCT_DEFINITION_SHAPE('','',#12);`, `#14=SHAPE_REPRESENTATION('asm',(#30,#31,#32),#92);`, `#15=SHAPE_DEFINITION_REPRESENTATION(#13,#14);`,
    `#20=PRODUCT('Cube Part','Cube Part','',(#90));`, `#21=PRODUCT_DEFINITION_FORMATION('','',#20);`, `#22=PRODUCT_DEFINITION('design','',#21,#91);`,
    `#23=PRODUCT_DEFINITION_SHAPE('','',#22);`, `#24=ADVANCED_BREP_SHAPE_REPRESENTATION('cube',(#${b.brep},#33),#92);`, `#25=SHAPE_DEFINITION_REPRESENTATION(#23,#24);`,
    `#40=CARTESIAN_POINT('',(0.,0.,0.));`, `#41=DIRECTION('',(0.,0.,1.));`, `#42=DIRECTION('',(1.,0.,0.));`,
    `#30=AXIS2_PLACEMENT_3D('',#40,#41,#42);`,
    `#43=CARTESIAN_POINT('',(50.,0.,0.));`, `#44=DIRECTION('',(0.,1.,0.));`,
    `#31=AXIS2_PLACEMENT_3D('',#40,#41,#42);`, `#32=AXIS2_PLACEMENT_3D('',#43,#41,#44);`, `#33=AXIS2_PLACEMENT_3D('',#40,#41,#42);`,
    `#50=NEXT_ASSEMBLY_USAGE_OCCURRENCE('1','cube:1','',#12,#22,$);`, `#51=PRODUCT_DEFINITION_SHAPE('','',#50);`,
    `#52=ITEM_DEFINED_TRANSFORMATION('','',#33,#31);`,
    `#53=( REPRESENTATION_RELATIONSHIP('','',#24,#14) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#52) SHAPE_REPRESENTATION_RELATIONSHIP() );`,
    `#54=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#53,#51);`,
    `#60=NEXT_ASSEMBLY_USAGE_OCCURRENCE('2','cube:2','',#12,#22,$);`, `#61=PRODUCT_DEFINITION_SHAPE('','',#60);`,
    `#62=ITEM_DEFINED_TRANSFORMATION('','',#33,#32);`,
    `#63=( REPRESENTATION_RELATIONSHIP('','',#24,#14) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#62) SHAPE_REPRESENTATION_RELATIONSHIP() );`,
    `#64=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#63,#61);`,
    `#70=COLOUR_RGB('',1.,0.5,0.);`, `#71=FILL_AREA_STYLE_COLOUR('',#70);`, `#72=FILL_AREA_STYLE('',(#71));`, `#73=SURFACE_STYLE_FILL_AREA(#72);`,
    `#74=SURFACE_SIDE_STYLE('',(#73));`, `#75=SURFACE_STYLE_USAGE(.BOTH.,#74);`, `#76=PRESENTATION_STYLE_ASSIGNMENT((#75));`, `#77=STYLED_ITEM('color',(#76),#${b.brep});`,
    `#90=PRODUCT_CONTEXT('',#93,'mechanical');`, `#91=PRODUCT_DEFINITION_CONTEXT('part definition',#93,'design');`,
    `#92=( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((#1)) REPRESENTATION_CONTEXT('','') );`, `#93=APPLICATION_CONTEXT('');`,
    ...b.lines,
  ];
  const asmText = HEAD + L.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
  // the app's own check (scripts/step2code-web-check.cjs) opens this file too
  if (process.env.WRITE_FIXTURE) writeFileSync(new URL("./fixtures/step2code-assembly.step", import.meta.url), asmText);
  const r = readStep(asmText);
  check("assembly: the product is placed twice", r.solids.length === 2, String(r.solids.length));
  check("assembly: one part, named from its product", r.parts.length === 1 && r.solids.every((s) => s.name === "Cube Part"), JSON.stringify(r.parts.map((p) => p.name)));
  const bb = (s) => { const P = s.faces.flatMap((f) => f.loops.flatMap((l) => l.edges.map((e) => e.a))); return [0, 1, 2].map((k) => [Math.min(...P.map((p) => p[k])), Math.max(...P.map((p) => p[k]))].map((v) => +v.toFixed(6))); };
  const boxes = r.solids.map(bb).map((x) => JSON.stringify(x)).sort();
  check("assembly: the first copy where it was drawn", boxes.includes(JSON.stringify([[0, 10], [0, 10], [0, 10]])), boxes.join(" "));
  check("assembly: the second moved 50 along X and turned 90 about Z", boxes.includes(JSON.stringify([[40, 50], [0, 10], [0, 10]])), boxes.join(" "));
  check("assembly: the part's colour", r.solids.every((s) => s.color === "#ff8000"), r.solids.map((s) => s.color).join());
  // ...and as code: the part written once, in its own frame, placed twice
  const c = await convertStep(asmText, { title: "asm" });
  check("assembly: both copies rebuilt as code", c.bodies.length === 2 && c.bodies.every((b) => b.ok), JSON.stringify(c.bodies));
  check("assembly: the part is written once", (c.code.match(/linearExtrude\(/g) || []).length === 1 && /const cube_Part = \(\) => /.test(c.code), c.code);
  check("assembly: the second copy moved and turned", /translate\(\[50, 0, 0\], rotate\(\[0, 0, 90\], cube_Part\(\)\)\)/.test(c.code), c.code);
  check("assembly: with its colour", (c.code.match(/color: "#ff8000"/g) || []).length === 2, c.code);
  try {
    const out = await build(runEditorCode(c.code).shape, { engine: "split" });
    check("assembly: the code builds, two parts", out.solids.length === 2, String(out.solids.length));
  } catch (e) { check("assembly: the code builds", false, String(e?.message || e).slice(0, 200)); }
}
{
  // complex entities, strings with quotes and comments
  const E = parsePart21(HEAD + `#1=PRODUCT('it''s a /* not a comment */ name','x','',());\n/* a comment; with a semicolon */\n#2=( BOUNDED_CURVE() B_SPLINE_CURVE(2,(#3,#4,#5),.UNSPECIFIED.,.F.,.F.) CURVE() );\nENDSEC;\n`);
  check("a quote and a comment inside a string survive", E.get(1)?.args?.[0] === "it's a /* not a comment */ name", JSON.stringify(E.get(1)));
  check("a complex entity keeps each part", E.get(2)?.type === "(complex)" && E.get(2).parts.B_SPLINE_CURVE?.[0] === 2);
}
{
  // a part named after a BREPcode word must not hide it from its own code
  const code = toCode({ solids: [{ name: "Drill", color: null }, { name: "cube", color: null }] },
    [{ ok: false, importName: "a.step", why: "x" }, { ok: false, importName: "b.step", why: "y" }]);
  check("a part named Drill or cube is renamed, not shadowing drill() / cube()", /\bdrill_: \{/.test(code) && /\bcube_: \{/.test(code), code);
}
{
  // the turned-profile recogniser refuses a part that is not turned
  const r = readStep(await stepOf(`return cube([10, 10, 10]);`, "c"));
  check("a box is not taken for a turned part", !tryRevolve(r.solids[0]).expr);
}

console.log(`\nstep2code: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
