// Will a THIRD-PARTY tool still read an STL that is carrying our source?
//
// Our own round trip passing proves nothing about the rest of the world. STL
// has no comment syntax — the source rides after `endsolid`, where a reader is
// supposed to stop — so the question that actually matters is whether a real
// parser stops there. three.js's STLLoader is the one most web tools use, and
// it is the WORST case on purpose: it does not stop at endsolid, it regex-scans
// the entire file for facet blocks. If our payload survives that, plain-text
// source would not have.
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { stlWithSource, extractSourceFromStl } from "../viewer/exporters.js";
import * as dsl from "../index.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const loader = new STLLoader();
const tris = (text) => loader.parse(new TextEncoder().encode(text).buffer)
  .getAttribute("position").count / 3;

const stl = toSTL(await build(dsl.difference(
  dsl.cube([40, 30, 10]),
  dsl.translate([20, 15, -1], dsl.cylinder({ r: 6, h: 12, $fn: 32 })))), "part");
const baseline = tris(stl);
check("the plain STL parses at all", baseline > 0, `${baseline} triangles`);

// The ordinary case.
const CODE = 'const w = 40;\n// a plate\nreturn cube([w, 30, 10]);';
check("three.js reads the same triangles with our source attached",
  tris(stlWithSource(stl, CODE)) === baseline, `${baseline} -> ${tris(stlWithSource(stl, CODE))}`);

// The case that decides base64 vs plain text. A model whose source mentions
// STL keywords — a comment, a string, one of our own generated-STL examples —
// would inject phantom triangles into every tool that reimported it.
const NASTY = [
  'return text({ text: "facet normal 0 0 0" });',
  '// endsolid part\n// outer loop\nreturn cube([1,1,1]);',
  'const s = "solid x\\nfacet normal 0 0 1\\nouter loop\\nvertex 0 0 0\\nvertex 1 0 0\\nvertex 0 1 0\\nendloop\\nendfacet\\nendsolid x";\nreturn cube([2,2,2]);',
];
for (const [i, src] of NASTY.entries()) {
  const f = stlWithSource(stl, src);
  check(`source containing STL grammar (${i + 1}) forges no triangles`,
    tris(f) === baseline, `${baseline} -> ${tris(f)}`);
  check(`...and still comes back intact (${i + 1})`, extractSourceFromStl(f) === src);
}

// A multi-solid export is several solid/endsolid blocks joined together — the
// payload goes after the last one and must not disturb the earlier ones.
const two = [stl, toSTL(await build(dsl.cube([5, 5, 5])), "b")].join("\n");
check("a multi-solid STL is unaffected", tris(stlWithSource(two, CODE)) === tris(two));
check("...and the source survives that too", extractSourceFromStl(stlWithSource(two, CODE)) === CODE);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
