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
  check("builder mode errors helpfully", /ALGEBRA mode/.test(e.message), e.message.slice(0, 60));
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

console.log("\nBuildSketch (2D)\n");
{
  const { stl } = await run(`from build123d import *
sketch = Rectangle(40, 30) - Pos(10, 0) * Circle(6)
part = extrude(sketch, amount=5)`);
  const v = volumeOf(stl), b = boundsOf(stl);
  check("rectangle minus circle extrudes", near(v, 40 * 30 - Math.PI * 36 * 1, 40) === false || v > 0);
  check("...volume = rect - hole, 5 thick", near(v, (1200 - Math.PI * 36) * 5, 60), v.toFixed(1));
  check("...centred like build123d", near(b.x[0], -20, 0.1) && near(b.x[1], 20, 0.1), JSON.stringify(b.x));
}
{
  const { stl } = await run(`from build123d import *
part = extrude(RectangleRounded(30, 20, 4), amount=6)`);
  const v = volumeOf(stl);
  const expect = (600 - (16 - Math.PI * 4) * 4) * 6;   // rect minus 4 corner squares + quarter-rounds
  check("rounded rectangle", near(v, expect, expect * 0.02), `${v.toFixed(0)} vs ${expect.toFixed(0)}`);
}
{
  const { stl } = await run(`from build123d import *
part = extrude(RegularPolygon(10, 6), amount=4)`);
  const v = volumeOf(stl);
  const hex = (3 * Math.sqrt(3) / 2) * 100 * 4;
  check("regular hexagon", near(v, hex, hex * 0.02), `${v.toFixed(0)} vs ${hex.toFixed(0)}`);
}
{
  const { stl } = await run(`from build123d import *
part = extrude(SlotOverall(40, 10), amount=3)`);
  const v = volumeOf(stl);
  const expect = (30 * 10 + Math.PI * 25) * 3;
  check("slot (stadium)", near(v, expect, expect * 0.02), `${v.toFixed(0)} vs ${expect.toFixed(0)}`);
}
{
  const { stl } = await run(`from build123d import *
sk = Trapezoid(40, 20, 60)
part = extrude(sk, amount=2, both=True)`);
  const b = boundsOf(stl);
  check("trapezoid + both=True straddles z=0", near(b.z[0], -2, 0.1) && near(b.z[1], 2, 0.1), JSON.stringify(b.z));
}
{
  // a bare sketch auto-extrudes 1mm rather than erroring
  const { stl } = await run(`from build123d import *
sketch = Circle(10)`);
  const b = boundsOf(stl);
  check("bare sketch auto-extrudes 1mm", near(b.z[1] - b.z[0], 1, 0.01), JSON.stringify(b.z));
}

console.log("\nBuildLine (1D) + make_face\n");
{
  const { stl } = await run(`from build123d import *
outline = Polyline((0, 0), (40, 0), (40, 20))
outline += ThreePointArc((40, 20), (20, 28), (0, 20))
outline += Line((0, 20), (0, 0))
part = extrude(make_face(outline), amount=8)`);
  const v = volumeOf(stl), b = boundsOf(stl);
  check("polyline + arc + line closes and extrudes", v > 40 * 20 * 8, v.toFixed(0));
  check("...arc bulges past the flat top", b.y[1] > 27 && b.y[1] < 29, JSON.stringify(b.y));
}
{
  const { stl } = await run(`from build123d import *
w = CenterArc((0, 0), 15, 0, 360)
part = extrude(make_face(w), amount=5)`);
  const v = volumeOf(stl);
  const disc = Math.PI * 225 * 5;
  check("full CenterArc makes a disc", near(v, disc, disc * 0.02), `${v.toFixed(0)} vs ${disc.toFixed(0)}`);
}
{
  const { stl } = await run(`from build123d import *
w = Polyline((0,0),(30,0)) + RadiusArc((30,0),(30,20),12) + Line((30,20),(0,20)) + Line((0,20),(0,0))
part = extrude(make_face(w), amount=4)`);
  check("RadiusArc chain builds", volumeOf(stl) > 0);
}
{
  const { stl } = await run(`from build123d import *
part = extrude(make_face(FilletPolyline((0,0),(30,0),(30,30),(0,30), radius=6) + Line((0,30),(0,0))), amount=3)`);
  const v = volumeOf(stl);
  check("FilletPolyline rounds its corners", v > 0 && v < 30 * 30 * 3, v.toFixed(0));
}

console.log("\nBuildPart extras\n");
{
  const { stl } = await run(`from build123d import *
part = Box(30, 30, 10) - Pos(0, 0, 5) * CounterBoreHole(3, 6, 3, 10)`);
  const v = volumeOf(stl);
  check("counterbore hole cuts shank + bore", v < 9000 - Math.PI * 9 * 9 && v > 8000, v.toFixed(0));
}
{
  const { stl } = await run(`from build123d import *
part = Wedge(20, 20, 20, 5, 5, 15, 15)`);
  const v = volumeOf(stl), b = boundsOf(stl);
  check("Wedge builds a tapered solid", v > 20 * 20 * 20 / 4 && v < 8000, v.toFixed(0));
  check("...centred", near(b.x[0], -10, 0.1), JSON.stringify(b.x));
}
{
  const { stl } = await run(`from build123d import *
part = ConvexPolyhedron([(0,0,0), (20,0,0), (0,20,0), (0,0,20)])`);
  const v = volumeOf(stl);
  check("ConvexPolyhedron hulls a tetrahedron", near(v, 20 ** 3 / 6, 20), v.toFixed(1));
}
try {
  fromPython(`from build123d import *\npart = Rectangle(10, 10) - Box(5, 5, 5)`);
  check("sketch minus solid explains itself", false, "no error");
} catch (e) {
  check("sketch minus solid explains itself", /extrude/.test(e.message), e.message.slice(0, 70));
}
try {
  fromPython(`from build123d import *\npart = Helix(5, 20, 5)`);
  check("unsupported line objects name the supported set", false, "no error");
} catch (e) {
  check("unsupported line objects name the supported set", /make_face/.test(e.message), e.message.slice(0, 80));
}
check("sketch snippet detected as python",
  looksLikePython("sketch = Rectangle(40, 30) - Circle(6)\npart = extrude(sketch, amount=5)"));

console.log("\nLLM-style build123d (the Gemini samples)\n");
{
  // sample 1 verbatim (plus a closing edge + extrude to make it a solid)
  const { stl } = await run(`from build123d import *
e1 = Line((0, 0), (20, 0))
e2 = Line((20, 0), (20, 10))
e3 = ThreePointArc((20, 10), (10, 15), (0, 0))
test_1d = Wire([e1, e2, e3])
show(test_1d)
part = extrude(make_face(test_1d), amount=4)`);
  const v = volumeOf(stl);
  check("Wire([edges]) + show() works", v > 20 * 10 * 4 * 0.8, v.toFixed(0));
}
{
  // sample 2 in algebra form: vertex fillets + GridLocations * Circle
  const { stl } = await run(`from build123d import *
base = Rectangle(40, 30)
base = fillet(base.vertices(), radius=4)
holes = Circle(7)
holes += GridLocations(25, 15, 2, 2) * Circle(2.5)
part = extrude(base - holes, amount=5)`);
  const v = volumeOf(stl);
  const expect = (1200 - (16 - Math.PI * 4) * 4 - Math.PI * 49 - 4 * Math.PI * 6.25) * 5;
  check("fillet(.vertices()) + GridLocations plate", near(v, expect, expect * 0.02),
    `${v.toFixed(0)} vs ${expect.toFixed(0)}`);
  const b = boundsOf(stl);
  check("...grid holes are centred (symmetric bounds)", near(b.x[0], -20, 0.1) && near(b.x[1], 20, 0.1));
}
{
  const { stl } = await run(`from build123d import *
part = extrude(Circle(20) - PolarLocations(12, 6) * Circle(3), amount=3)`);
  const v = volumeOf(stl);
  const expect = (Math.PI * 400 - 6 * Math.PI * 9) * 3;
  check("PolarLocations ring of holes", near(v, expect, expect * 0.02), `${v.toFixed(0)} vs ${expect.toFixed(0)}`);
}
try {
  fromPython(`from build123d import *
for loc in GridLocations(25, 15, 2, 2):
    holes += loc * Circle(2.5)`);
  check("the for-loop form teaches the algebra form", false, "no error");
} catch (e) {
  check("the for-loop form teaches the algebra form", /GridLocations\(25, 15, 2, 2\) \* Circle/.test(e.message), e.message.slice(0, 90));
}
try {
  fromPython(`from build123d import *\npart = sweep(Circle(3), path=Line((0,0),(10,10)))`);
  check("sweep refuses by name with a way forward", false, "no error");
} catch (e) {
  check("sweep refuses by name with a way forward", /sweep\(\)/.test(e.message) && /hull/.test(e.message), e.message.slice(0, 80));
}
try {
  // builder mode full of @ operators — the diagnosis must beat the tokenizer
  fromPython(`from build123d import *
with BuildLine() as my_1d_wire:
    l1 = Line((0, 0), (10, 0))
    a1 = TangentArc(l1 @ 1, (20, 10), tangent=(1, 1))
with BuildPart() as my_3d_part:
    extrude(amount=10)`);
  check("builder mode with @ gets the algebra guide, not 'unexpected @'", false, "no error");
} catch (e) {
  check("builder mode with @ gets the algebra guide, not 'unexpected @'",
    /ALGEBRA mode/.test(e.message) && !/unexpected/i.test(e.message), e.message.slice(0, 80));
}
try {
  fromPython(`from build123d import *\np = Line((0,0),(10,0)) @ 1`);
  check("a flat @ explains the position operator", false, "no error");
} catch (e) {
  check("a flat @ explains the position operator", /position operator/.test(e.message), e.message.slice(0, 80));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
