// JSCAD colours: colorize()/hexToRgb tag shapes, compile() threads the colour
// into the trace, and group() keeps an array of parts as separate solids.

import { PartHistory } from "brep-io-kernel";
import { colorize, hexToRgb, rgbToHex, colorToRgba, primitives, transforms } from "../src/jscad.js";
import { compile, group } from "../src/dsl.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const facets = (r) => (toSTL(r, "t").match(/facet/g) || []).length;

console.log("\njscad colours\n");

// colour helpers
check("hexToRgb('#ff8000')", JSON.stringify(hexToRgb("#ff8000").map((v) => Math.round(v * 255))) === "[255,128,0]");
check("rgbToHex round-trips", rgbToHex(hexToRgb("#3ab5c9")) === "#3ab5c9");
check("colorToRgba adds alpha", JSON.stringify(colorToRgba([1, 0, 0])) === "[1,0,0,1]");

// colorize tags the shape with a hex the compiler can read
{
  const c = colorize(hexToRgb("#e03a3a"), primitives.cuboid({ size: [10, 10, 10] }));
  check("colorize tags .color as hex", c.color === "#e03a3a", c.color);
  const c2 = colorize("#00ff00", primitives.sphere({ radius: 5 }));
  check("colorize accepts a hex string too", c2.color === "#00ff00", c2.color);
}

// compile threads the colour into the trace against the feature id
{
  const shape = group(
    colorize(hexToRgb("#ff0000"), primitives.cuboid({ size: [10, 10, 10] })),
    colorize(hexToRgb("#0000ff"), transforms.translate([20, 0, 0], primitives.sphere({ radius: 6 }))),
  );
  const ph = new PartHistory();
  const trace = [];
  await compile(shape, ph, trace);
  const colored = trace.filter((t) => t.color);
  check("trace records a colour per coloured piece", colored.length === 2, JSON.stringify(trace.map((t) => t.color)));
  check("trace colours match the input", colored.some((t) => t.color === "#ff0000") && colored.some((t) => t.color === "#0000ff"));
}

// glass() rides the same style threading — a clear tag per feature, geometry
// untouched (it's a look, like colorize)
{
  const { glass, cube, cylinder } = await import("../src/dsl.js");
  const shape = group(
    glass(0.2, cylinder({ r: 5, h: 2 })),
    cube([10, 10, 10]),
  );
  const ph = new PartHistory();
  const trace = [];
  await compile(shape, ph, trace);
  const clears = trace.filter((t) => t.clear != null);
  check("glass threads a clear tag into the trace", clears.length === 1 && clears[0].clear === 0.2,
    JSON.stringify(trace.map((t) => t.clear)));
  check("glass accepts percent form", glass(25, cube([1, 1, 1])).clearOpacity === 0.25);
  check("glass defaults without a number", glass(cube([1, 1, 1])).clearOpacity === 0.3);
  const r = await build(shape);
  check("glass model still builds real geometry", facets(r) > 0);
}

// group() builds the parts as SEPARATE solids (no boolean) and much faster
{
  const g = group(
    primitives.cuboid({ size: [10, 10, 10] }),
    transforms.translate([30, 0, 0], primitives.sphere({ radius: 6 })),
    transforms.translate([-30, 0, 0], primitives.cylinder({ radius: 5, height: 12 })),
  );
  const ph = new PartHistory();
  await compile(g, ph);
  await ph.runHistory({ throwOnFeatureError: true });
  const solids = (ph.scene?.children || []).filter((o) => o?.type === "SOLID");
  check("group keeps parts as separate solids", solids.length === 3, `${solids.length} solids`);
  const r = await build(g);
  check("grouped model still produces geometry", facets(r) > 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
