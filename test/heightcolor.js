// Colour in bands up a model — and the trap that made it look broken.
//
// Reported as "an issue modifying the colors by height". Reproduced before
// writing a line: the natural way to express it is
//
//   union(colorize(red, lowerBand), colorize(blue, upperBand))
//
// which builds cleanly, keeps both colours on the tree, and comes out ONE
// SOLID — because that is what union does. One body to paint, one object in
// the 3MF, one filament on the printer. Nothing errors and nothing works.
//
// Measured on a 50mm test model: union gives 1 solid, group gives 2. That gap
// is the whole bug, and colorByHeight exists so it cannot be fallen into.
//
// The kernel builds are slow, so the geometry is exercised once and everything
// that can be checked without a build is checked without one.

import { cube, cylinder, union, translate, colorize, group, intersection, build, toSTL, colorByHeight } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// 40x40x30 box with a 20-radius, 20-tall cylinder on top: 50mm tall overall,
// and not a prism, so a band cut through the shoulder has to follow the shape.
const model = () => union(cube([40, 40, 30]), translate([0, 0, 30], cylinder({ r: 20, h: 20 })));

console.log("\nit says what is wrong before it builds anything\n");
{
  // These are the four mistakes someone will actually make, and each message
  // has to name the fix rather than the fault.
  const err = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };
  const noColours = err(() => colorByHeight({ every: 10 }, model()));
  check("no colours is refused", /at least two colours/.test(noColours || ""), noColours);
  check("...and shows the shape of the argument", /colors: \["#/.test(noColours || ""));
  const one = err(() => colorByHeight({ every: 10, colors: ["#e33333"] }, model()));
  check("one colour is not a band", /at least two colours/.test(one || ""), one);
  const neither = err(() => colorByHeight({ colors: ["#e33333", "#3399ff"] }, model()));
  check("neither every nor at is refused", /every: 10.*at: \[8, 22\]/.test(neither || ""), neither);
  const noShape = err(() => colorByHeight({ every: 10, colors: ["#e33333", "#3399ff"] }));
  check("no shape is refused", /needs a shape/.test(noShape || ""), noShape);
  const badEvery = err(() => colorByHeight({ every: 0, colors: ["#e33333", "#3399ff"] }, model()));
  check("a band height of zero is refused", /band height in mm/.test(badEvery || ""), badEvery);
  const badAt = err(() => colorByHeight({ at: 12, colors: ["#e33333", "#3399ff"] }, model()));
  check("...and `at` must be a list", /list of heights/.test(badAt || ""), badAt);
}

console.log("\nthe pair form is accepted too\n");
{
  // colorByHeight([[8, red], [22, blue]], shape) reads well enough that people
  // will write it, so it means the same as { at, colors }.
  const a = colorByHeight([[8, "#e33333"], [22, "#3399ff"]], model());
  check("a list of [height, colour] pairs works", a.kind === "heightbands", a.kind);
  check("...and is read as cuts", JSON.stringify(a.at) === "[8,22]", JSON.stringify(a.at));
  check("...with the colours in order", a.colors.length === 2, JSON.stringify(a.colors));
}

console.log("\nheights are read from the bottom, and sorted\n");
{
  const a = colorByHeight({ at: [22, 8], colors: ["#e33333", "#3399ff", "#33cc55"] }, model());
  check("cuts given out of order are sorted", JSON.stringify(a.at) === "[8,22]", JSON.stringify(a.at));
  const b = colorByHeight({ at: [8, NaN, 22], colors: ["#e33333", "#3399ff"] }, model());
  check("...and a junk height is dropped rather than poisoning the list",
    JSON.stringify(b.at) === "[8,22]", JSON.stringify(b.at));
}

console.log("\nand the geometry really is separate solids\n");
{
  // The one part that needs the kernel. Three checks off one pair of builds:
  // the bands are separate, the union form is NOT, and nothing was lost.
  const banded = await build(colorByHeight({ every: 20, colors: ["#e33333", "#3399ff"] }, model()));
  check("a 50mm model banded every 20mm gives three solids",
    banded?.solids?.length === 3, `${banded?.solids?.length} solids`);

  const stl = toSTL(banded, "t");
  const z = [...stl.matchAll(/vertex\s+\S+\s+\S+\s+(\S+)/g)].map((m) => +m[1]);
  check("...spanning the whole model, so no band was dropped",
    Math.abs(Math.min(...z)) < 0.01 && Math.abs(Math.max(...z) - 50) < 0.01,
    `z ${Math.min(...z).toFixed(2)}..${Math.max(...z).toFixed(2)}`);

  // The trap itself, asserted rather than described.
  const band = (z0, z1) => translate([-100, -100, z0], cube([200, 200, z1 - z0]));
  const byHand = await build(union(
    colorize("#e33333", intersection(model(), band(0, 25))),
    colorize("#3399ff", intersection(model(), band(25, 50))),
  ));
  check("the hand-written union really does collapse to one solid",
    byHand?.solids?.length === 1, `${byHand?.solids?.length} solids`);
  check("...which is exactly what colorByHeight avoids",
    banded.solids.length > byHand.solids.length,
    `${banded.solids.length} vs ${byHand.solids.length}`);
}

console.log("\na cut that misses the model is not a band\n");
{
  // Asking for a cut above the top used to be worth guarding: emitting a
  // "group" of one solid would claim the model was banded when it is not.
  const r = await build(colorByHeight({ at: [999], colors: ["#e33333", "#3399ff"] }, model()));
  check("a cut above the top leaves one solid, not a group of one",
    r?.solids?.length === 1, `${r?.solids?.length} solids`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
