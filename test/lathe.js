// rotate_extrude() — the module whose absence this project kept tripping over.
//
// A user pasted a hoop generator; every shape in it is a rotate_extrude. The
// translator warned once, dropped all four revolves, and auto-extruded the
// leftover 2D circle to 1mm. The build SUCCEEDED and produced a disc. That is
// the worst possible failure: no error to read, and a result that looks like a
// modelling mistake rather than a missing feature.
//
// It needs two routes, and which one you get is decided by the profile:
//
//   touching the axis  -> revolve(): a true lathe of any outline
//   a detached circle  -> a torus, because revolve() has no axis edge to spin
//                         and refuses outright
//
// Anything else detached sweeps a ring with a non-round section, which the
// kernel cannot make — refused by name rather than approximated.

import { fromOpenSCAD, getWarnings, circleOf, UNSUPPORTED, MODULES } from "../src/openscad.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function measure(src) {
  const stl = toSTL(await build(fromOpenSCAD(src)), "t");
  const v = [...stl.matchAll(/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g)]
    .map((m) => m.slice(1).map(Number));
  if (!v.length) return { empty: true };
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2])
      + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  const lo = (i) => Math.min(...v.map((p) => p[i])), hi = (i) => Math.max(...v.map((p) => p[i]));
  return { vol: Math.abs(vol), facets: v.length / 3,
    x: [lo(0), hi(0)], y: [lo(1), hi(1)], z: [lo(2), hi(2)] };
}

console.log("\nit is no longer advertised as missing\n");
{
  check("rotate_extrude is out of the UNSUPPORTED list", !("rotate_extrude" in UNSUPPORTED));
  check("...and in the roster of modules that translate", MODULES.includes("rotate_extrude"));
}

console.log("\na detached circle is a torus\n");
{
  // The hoop. Major 50, minor 5 -> a ring 110 across and 10 thick.
  const t = await measure(
    "rotate_extrude($fn = 64) translate([50, 0, 0]) circle(r = 5, $fn = 64);");
  check("it is not empty — the whole original bug", !t.empty);
  check("110mm across", near(t.x[1] - t.x[0], 110, 1), `${(t.x[1] - t.x[0]).toFixed(1)}`);
  check("...in both directions, so it really went round",
    near(t.y[1] - t.y[0], 110, 1), `${(t.y[1] - t.y[0]).toFixed(1)}`);
  check("...and 10mm thick, the tube's diameter",
    near(t.z[1] - t.z[0], 10, 0.3), `${(t.z[1] - t.z[0]).toFixed(1)}`);
  // A torus is 2*pi^2*R*r^2 = 24674 mm3. Faceting makes it slightly smaller.
  check("the volume is a torus's, not a disc's",
    t.vol > 22000 && t.vol < 25000, `${t.vol.toFixed(0)} mm3 vs 24674 exact`);
  check("no warning was raised", !getWarnings().some((w) => /rotate_extrude/.test(w)),
    getWarnings().join(" | "));
}

console.log("\na partial angle is an arc of that torus\n");
{
  const q = await measure(
    "rotate_extrude(angle = 90, $fn = 64) translate([50, 0, 0]) circle(r = 5, $fn = 64);");
  check("a quarter turn stays in the +x +y quadrant",
    q.x[0] > -0.6 && q.y[0] > -0.6, `x from ${q.x[0].toFixed(1)}, y from ${q.y[0].toFixed(1)}`);
  check("...and reaches the full radius", near(q.x[1], 55, 0.6), `${q.x[1].toFixed(1)}`);
  const full = await measure(
    "rotate_extrude($fn = 64) translate([50, 0, 0]) circle(r = 5, $fn = 64);");
  check("...with about a quarter of the material",
    near(q.vol / full.vol, 0.25, 0.03), `${(q.vol / full.vol).toFixed(3)}`);
}

console.log("\na profile touching the axis is a real lathe\n");
{
  // A cone: a triangle with an edge on x = 0.
  const c = await measure("rotate_extrude($fn = 64) polygon([[0,0],[20,0],[0,10]]);");
  check("a triangle on the axis revolves into a cone", !c.empty);
  check("...40mm across", near(c.x[1] - c.x[0], 40, 0.6), `${(c.x[1] - c.x[0]).toFixed(1)}`);
  check("...and 10mm tall", near(c.z[1] - c.z[0], 10, 0.2), `${(c.z[1] - c.z[0]).toFixed(1)}`);
  // cone volume = pi r^2 h / 3 = pi*400*10/3 = 4189
  check("with a cone's volume", near(c.vol, 4189, 200), `${c.vol.toFixed(0)} vs 4189`);

  // A vase profile — the shape people actually reach for a lathe to make.
  const v = await measure(
    "rotate_extrude($fn = 96) polygon([[0,0],[18,0],[18,3],[4,6],[6,40],[10,50],[8,52],[0,52]]);");
  check("an arbitrary outline lathes too", !v.empty && v.vol > 1000, `${v.vol?.toFixed(0)}`);
  check("...to the profile's own height", near(v.z[1] - v.z[0], 52, 0.5), `${(v.z[1] - v.z[0]).toFixed(1)}`);
}

console.log("\nwhat it refuses, and why\n");
{
  // A detached SQUARE would sweep a ring of square section. The kernel has no
  // such primitive, and quietly rounding it off would be a lie about the part.
  let threw = "";
  try { fromOpenSCAD("rotate_extrude() translate([30, 0, 0]) square([6, 6]);"); }
  catch (e) { threw = e.message; }
  check("a detached non-circular profile is refused", /does not touch the axis/.test(threw), threw);
  check("...and says both ways out", /x = 0/.test(threw) && /tube\(\)/.test(threw), threw);

  threw = "";
  try { fromOpenSCAD("rotate_extrude() translate([-30, 0, 0]) circle(r = 5);"); }
  catch (e) { threw = e.message; }
  check("a profile across the axis is refused", /x >= 0/.test(threw), threw);

  threw = "";
  try { fromOpenSCAD("rotate_extrude() cube(3);"); } catch (e) { threw = e.message; }
  check("a 3D child is refused by name", /already 3D/.test(threw), threw);

  threw = "";
  try { fromOpenSCAD("rotate_extrude(angle = 0) polygon([[0,0],[5,0],[0,5]]);"); }
  catch (e) { threw = e.message; }
  check("a zero angle is refused", /angle must be positive/.test(threw), threw);
}

console.log("\nis it a circle? decided by measurement\n");
{
  // By the time a profile reaches the revolve it is a plain point list — it may
  // have been translated, scaled, or written by hand. Remembering that circle()
  // made it would miss all three.
  const circle = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const c = circleOf(circle(50, 0, 5, 32));
  check("a 32-gon reads as a circle", !!c && near(c.cx, 50, 0.1) && near(c.r, 5, 0.1),
    JSON.stringify(c));
  const off = circleOf(circle(30, 7, 3, 24));
  check("...wherever its centre is", !!off && near(off.cy, 7, 0.1), JSON.stringify(off));
  check("a square is not a circle", circleOf([[0, 0], [10, 0], [10, 10], [0, 10]]) === null);
  check("a triangle is not a circle", circleOf([[0, 0], [10, 0], [0, 10]]) === null);
  check("too few points to tell is not a circle", circleOf(circle(10, 0, 2, 5)) === null,
    "5 points could be a pentagon anybody meant as a pentagon");
  // An ellipse is the one that must not slip through: it would come back as a
  // torus of the wrong radius, which is wrong SILENTLY.
  const ellipse = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    return [50 + 8 * Math.cos(a), 3 * Math.sin(a)];
  });
  check("an ellipse is NOT accepted as a circle", circleOf(ellipse) === null,
    "it would silently become a torus of the wrong section");
}

console.log("\nthe model that started this\n");
{
  // One segment of the user's hoop: a 90 degree arc, a curved pin on the end,
  // and a curved socket cut into the start.
  const seg = (hole) => `
    difference() {
      union() {
        rotate_extrude(angle = 90, $fn = 64) translate([50,0,0]) circle(r = 5, $fn = 64);
        rotate([0,0,90]) rotate_extrude(angle = 15, $fn = 32)
          translate([50,0,0]) circle(r = 2, $fn = 32);
      }
      ${hole ? "rotate_extrude(angle = 16, $fn = 32) translate([50,0,0]) circle(r = 2.25, $fn = 32);" : ""}
    }`;
  const solid = await measure(seg(false));
  const drilled = await measure(seg(true));
  check("the segment builds", !solid.empty && solid.vol > 5000, `${solid.vol?.toFixed(0)} mm3`);
  check("the pin overshoots the segment's own 90 degrees",
    solid.x[0] < -5, `x reaches ${solid.x[0].toFixed(1)}, so the pin passes 90`);
  const cut = solid.vol - drilled.vol;
  // pi r^2 * arc length = pi*2.25^2 * (2*pi*50*16/360) = 222 mm3
  check("the connector socket is really cut", near(cut, 222, 25), `${cut.toFixed(1)} vs 222 mm3`);
  check("...and the whole thing is one solid, not a pile of warnings",
    !getWarnings().length, getWarnings().join(" | "));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
