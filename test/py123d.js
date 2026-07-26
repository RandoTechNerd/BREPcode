// build123d / CadQuery translator: centred conventions, Pos/Rot locations,
// compound assignment, align tuples, CadQuery chains, and the error paths.

import { fromPython, looksLikePython } from "../src/py123d.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

function volumeOf(stl) {
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}
function boundsOf(stl) {
  const pts = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const ax = (i) => [Math.min(...pts.map((q) => q[i])), Math.max(...pts.map((q) => q[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}
async function run(src) {
  const { shape, lang } = fromPython(src);
  return { stl: toSTL(await build(shape), "t"), lang };
}

console.log("\ndetection\n");
check("build123d import detected", looksLikePython("from build123d import *\npart = Box(1,1,1)"));
check("cadquery detected", looksLikePython('import cadquery as cq\nr = cq.Workplane("XY").box(1,1,1)'));
check("bare algebra detected", looksLikePython("part = Box(20, 20, 10)\npart -= Pos(0,0,0) * Cylinder(5, 12)"));
check("JS not misdetected", !looksLikePython("const a = cube([1,1,1]);"));
check("BREPcode not misdetected", !looksLikePython("difference(\n  cube([30,30,12]),\n  cylinder({ r: 8, h: 14 })\n)"));

console.log("\nbuild123d algebra\n");
{
  const { stl, lang } = await run(`from build123d import *
body = Box(30, 30, 12)
hole = Pos(0, 0, 0) * Cylinder(8, 14)
part = body - hole
`);
  check("box minus cylinder builds", near(volumeOf(stl), 30 * 30 * 12 - Math.PI * 64 * 12, 120), volumeOf(stl).toFixed(0));
  const b = boundsOf(stl);
  check("build123d Box is centred", near(b.x[0], -15, 0.01) && near(b.z[0], -6, 0.01), JSON.stringify(b));
  check("language tagged", lang === "build123d", lang);
}
{
  const { stl } = await run(`part = Box(20, 20, 10, align=(Align.MIN, Align.MIN, Align.MIN))`);
  const b = boundsOf(stl);
  check("align MIN puts corner at origin", near(b.x[0], 0, 0.01) && near(b.z[0], 0, 0.01), JSON.stringify(b));
}
{
  const { stl } = await run(`part = Box(30, 30, 6)
part -= Pos(10, 0, 0) * Cylinder(4, 8)
part -= Pos(-10, 0, 0) * Cylinder(4, 8)
`);
  check("part -= compound assignment", near(volumeOf(stl), 30 * 30 * 6 - 2 * Math.PI * 16 * 6, 60), volumeOf(stl).toFixed(0));
}
{
  const { stl } = await run(`part = Rot(0, 0, 45) * Box(20, 10, 5)`);
  const b = boundsOf(stl);
  check("Rot location rotates", near(b.x[1] - b.x[0], (20 + 10) / Math.SQRT2, 0.2), JSON.stringify(b.x));
}
{
  const { stl } = await run(`s = Sphere(10)
t = Torus(12, 3)
part = s + t
`);
  check("sphere + torus union", volumeOf(stl) > (4 / 3) * Math.PI * 1000 * 0.95, volumeOf(stl).toFixed(0));
}

console.log("\ncadquery\n");
{
  const { stl, lang } = await run(`import cadquery as cq
result = cq.Workplane("XY").box(30, 30, 12).cut(cq.Workplane("XY").cylinder(14, 8))
`);
  check("Workplane box.cut(cylinder)", near(volumeOf(stl), 30 * 30 * 12 - Math.PI * 64 * 12, 120), volumeOf(stl).toFixed(0));
  check("cq language tagged", lang === "cadquery", lang);
  const b = boundsOf(stl);
  check("cq box centred", near(b.x[0], -15, 0.01), JSON.stringify(b.x));
}
{
  const { stl } = await run(`import cadquery as cq
a = cq.Workplane("XY").box(10, 10, 10).translate((20, 0, 0))
b = cq.Workplane("XY").box(10, 10, 10)
part = b.union(a)
`);
  check("cq translate + union", near(volumeOf(stl), 2000, 10), volumeOf(stl).toFixed(0));
}

console.log("\nerror paths\n");
try {
  fromPython(`with BuildPart() as bp:\n    Box(10, 10, 10)`);
  check("builder mode errors helpfully", false, "no error");
} catch (e) {
  check("builder mode errors helpfully", /algebra mode/.test(e.message), e.message.slice(0, 60));
}
try {
  fromPython(`import cadquery as cq\nr = cq.Workplane("XY").box(10,10,10).faces(">Z").workplane().hole(4)`);
  check("cq selectors error helpfully", false, "no error");
} catch (e) {
  check("cq selectors error helpfully", /isn't supported/.test(e.message), e.message.slice(0, 70));
}
try {
  fromPython(`x = 5`);
  check("no solid -> clear error", false, "no error");
} catch (e) {
  check("no solid -> clear error", /No solid/.test(e.message), e.message.slice(0, 50));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
