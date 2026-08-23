// Mesh import: registerImport + importedMesh as a first-class solid —
// transforms, booleans, error paths — plus the OBJ->STL converter.

import {
  registerImport, importedMesh, cube, translate, rotate, difference, union,
  build, toSTL,
} from "../index.js";
import { objToStl } from "../viewer/exporters.js";

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

function volumeOf(r) {
  const stl = toSTL(r, "t");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}
function boundsOf(r) {
  const p = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const ax = (i) => [Math.min(...p.map((q) => q[i])), Math.max(...p.map((q) => q[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}

// a known-good 10mm cube: generate it WITH the kernel, so the STL is real
import { build as b2, toSTL as t2, cube as c2 } from "../index.js";
const cubeStl = t2(await b2(c2([10, 10, 10])), "src");
registerImport("box.stl", cubeStl);

console.log("\nimportedMesh\n");

{
  const r = await build(importedMesh("box.stl"));
  check("imports with correct volume", near(volumeOf(r), 1000, 2), volumeOf(r).toFixed(1));
  const b = boundsOf(r);
  check("keeps native coordinates (no auto-centre)", near(b.x[0], 0, 0.01) && near(b.z[1], 10, 0.01), JSON.stringify(b));
}
{
  const r = await build(translate([20, 0, 5], importedMesh("box.stl")));
  const b = boundsOf(r);
  check("translate applies via Transform feature", near(b.x[0], 20, 0.01) && near(b.z[0], 5, 0.01), JSON.stringify(b));
}
{
  const r = await build(rotate([0, 0, 45], importedMesh("box.stl")));
  const b = boundsOf(r);
  check("rotate applies", near(b.x[1] - b.x[0], 10 * Math.SQRT2, 0.1), JSON.stringify(b.x));
}
{
  const r = await build(difference(cube([20, 20, 20]), translate([5, 5, 11], importedMesh("box.stl"))));
  check("imported mesh works as a boolean cutter", near(volumeOf(r), 8000 - 9 * 10 * 10, 20), volumeOf(r).toFixed(1));
}
{
  const r = await build(union(cube([10, 10, 10]), translate([10, 0, 0], importedMesh("box.stl"))));
  check("imported mesh unions", near(volumeOf(r), 2000, 5), volumeOf(r).toFixed(1));
}
try {
  await build(importedMesh("nope.stl"));
  check("missing import errors clearly", false, "no error");
} catch (e) {
  check("missing import errors clearly", /Import button/.test(e.message), e.message);
}
{
  // mirroring flips winding — the bake must keep the solid outward-facing
  const { mirror } = await import("../index.js");
  const r = await build(mirror([1, 0, 0], importedMesh("box.stl")));
  const b = boundsOf(r);
  check("mirror keeps solid valid (winding fixed)", near(volumeOf(r), 1000, 2) && near(b.x[1], 0, 0.01),
    `${volumeOf(r).toFixed(1)} ${JSON.stringify(b.x)}`);
}

console.log("\nobjToStl\n");
{
  const obj = `# tri prism-ish quad face test
v 0 0 0
v 10 0 0
v 10 10 0
v 0 10 0
f 1 2 3 4`;
  const stl = objToStl(obj, "q");
  const facets = (stl.match(/facet normal/g) || []).length;
  check("quad fan-triangulates into 2 facets", facets === 2, String(facets));
  check("negative indices supported", (objToStl("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1").match(/facet normal/g) || []).length === 1);
  // and it round-trips through a real import
  registerImport("flat.obj", objToStl(obj, "q"));
  // (a flat quad isn't a solid — just confirm the registry path doesn't blow up
  // at registration; building it would rightly fail as non-manifold)
  check("obj registers", true);
}


// Binary STL is what every slicer exports, and the CLI has no Import button to
// convert it — registerImport decodes the bytes itself.
console.log("\nbinary STL decodes on registerImport\n");
{
  // hand-build a 1-triangle binary STL: 80-byte header, count, 50-byte facet
  const buf = new ArrayBuffer(84 + 50);
  const dv = new DataView(buf);
  dv.setUint32(80, 1, true);
  const f = (o, v) => dv.setFloat32(o, v, true);
  f(84, 0); f(88, 0); f(92, 1);                       // normal
  f(96, 0); f(100, 0); f(104, 0);                     // v1
  f(108, 10); f(112, 0); f(116, 0);                   // v2
  f(120, 0); f(124, 5); f(128, 0);                    // v3
  const text = registerImport("bin.stl", new Uint8Array(buf));
  check("decoded to ASCII STL", /^solid/.test(text) && /facet normal/.test(text));
  check("one facet", (text.match(/facet normal/g) || []).length === 1);
  check("vertices survived", /vertex 10 0 0/.test(text) && /vertex 0 5 0/.test(text));
}
{
  // ASCII in, ASCII out — unchanged
  const ascii = "solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid s\n";
  const enc = new TextEncoder().encode(ascii);
  check("ASCII bytes pass through", registerImport("asc.stl", enc).includes("vertex 1 0 0"));
  check("a plain string is untouched", registerImport("str.stl", ascii) === ascii);
}

// Coloured OBJs keep their colour through import.
//
// The old road flattened every OBJ to STL — a format with no colour — so
// BREPcode's own coloured exports came back grey and welded into one solid.
// parseObjParts() reads them the way the author meant: one part per o/g
// group, colour from the vertex-colour extension, handed to the SAME parts
// machinery the 3MF importer uses. Hex strings, because hex is that road's
// colour contract — arrays painted the preview white.
{
  console.log("\ncoloured OBJ import\n");
  const { parseObjParts } = await import("../viewer/exporters.js");

  const objSrc = [
    "o rim",
    "v 0 0 0 0.25 0.55 0.30", "v 1 0 0 0.25 0.55 0.30", "v 0 1 0 0.25 0.55 0.30",
    "f 1 2 3",
    "o face",
    "v 0 0 1 0.96 0.42 0.62", "v 1 0 1 0.96 0.42 0.62", "v 0 1 1 0.96 0.42 0.62", "v 1 1 1 0.96 0.42 0.62",
    "f 4 5 6 7",
  ].join("\n");
  const parts = parseObjParts(objSrc);
  check("one part per o group", parts.length === 2, `${parts.length}`);
  check("group names survive", parts.map((p) => p.name).join() === "rim,face");
  check("colour comes out as hex — the parts road's contract",
    parts[0].color === "#408c4d", parts[0].color);
  check("...for the second part too", parts[1].color === "#f56b9e", parts[1].color);
  check("a quad face is triangulated", parts[1].positions.length === 2 * 3 * 3,
    `${parts[1].positions.length} floats`);

  const plain = parseObjParts("o a\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3");
  check("a colourless OBJ gets color: null (old road untouched)", plain[0].color === null);

  // one stray 6-number line in a plain file is noise, not a palette
  const stray = parseObjParts("o a\nv 0 0 0 1 0 0\n" + "v 1 0 0\nv 0 1 0\nv 1 1 0\nv 2 0 0\nv 2 1 0\n"
    + "f 2 3 4\nf 4 5 6\n");
  check("a minority of coloured corners does not invent a colour", stray[0].color === null);

  const neg = parseObjParts("o a\nv 0 0 0 0.5 0.5 0.5\nv 1 0 0 0.5 0.5 0.5\nv 0 1 0 0.5 0.5 0.5\nf -3 -2 -1");
  check("negative (relative) face indices resolve", neg[0]?.positions.length === 9);

  // the viewer really routes coloured OBJs onto the parts road
  const { readFileSync } = await import("node:fs");
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  check("the import handler gates on a colour being present",
    /if \(parts\.some\(\(p\) => p\.color\)\) \{\s*\n\s*objects = parts;/.test(HTML),
    "a colourless OBJ must keep its old single-solid behaviour");
  check("...and the binary-STL branch is guarded off the text formats",
    /\} else if \(!contents\) \{/.test(HTML),
    "as a bare else it re-decoded SVG/STEP/ASCII imports from raw bytes");
  check("part names carry the OBJ group identity",
    /`\$\{stem\}-\$\{nice \|\| \(i \+ 1\)\}\.stl`/.test(HTML),
    "colorize(\"#…\", importedMesh(\"coin-rim.stl\")) reads like the file");
  check("the stem strips .obj as well as .3mf", /file\.name\.replace\(\/\\\.\(3mf\|obj\)\$\/i, ""\)/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
