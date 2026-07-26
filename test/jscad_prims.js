// The wider @jscad/modeling surface: rounded primitives, 2D shape generators,
// hulls, lathe, offset — and the honest errors for the parts that need built
// geometry (measure*/center/align). Every 3D case is BUILT, not just shaped,
// so a primitive that composes into something the kernel can't make will fail
// here rather than in a user's browser.

import {
  primitives, transforms, extrusions, hulls, expansions, measurements, maths, booleans,
} from "../src/jscad.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const facets = (r) => (toSTL(r, "t").match(/facet/g) || []).length;
async function built(label, shape, minFacets = 8) {
  try {
    const r = await build(shape);
    const n = facets(r);
    check(label, n >= minFacets, `${n} facets`);
    return r;
  } catch (e) { check(label, false, e.message); return null; }
}
const throws = (label, fn, match) => {
  try { fn(); check(label, false, "did not throw"); }
  catch (e) { check(label, match ? match.test(e.message) : true, e.message); }
};

console.log("\njscad extended primitives\n");

const { roundedCylinder, roundedCuboid, ellipsoid, geodesicSphere, polyhedron,
  roundedRectangle, star, triangle, ellipse, square, cuboid, sphere, circle } = primitives;

// ---- rounded solids build real geometry ---------------------------------
await built("roundedCylinder builds", roundedCylinder({ height: 20, radius: 8, roundRadius: 2 }), 100);
await built("roundedCuboid builds", roundedCuboid({ size: [20, 20, 10], roundRadius: 3 }), 50);
await built("ellipsoid builds", ellipsoid({ radius: [10, 6, 4] }), 50);
await built("geodesicSphere builds", geodesicSphere({ radius: 7 }), 50);

// a round bigger than the shape should clamp, not invert
await built("roundedCylinder clamps an oversized round",
  roundedCylinder({ height: 10, radius: 5, roundRadius: 999 }), 50);
await built("roundedCuboid clamps an oversized round",
  roundedCuboid({ size: [10, 10, 10], roundRadius: 999 }), 50);

// roundRadius 0 degrades to the plain primitive
{
  const r = await build(roundedCylinder({ height: 10, radius: 4, roundRadius: 0 }));
  const plain = await build(primitives.cylinder({ radius: 4, height: 10 }));
  check("roundedCylinder with no round == cylinder", facets(r) === facets(plain),
    `${facets(r)} vs ${facets(plain)}`);
}

// ---- polyhedron is EXACT, including concave ------------------------------
{
  // a tetrahedron
  const tet = polyhedron({
    points: [[0, 0, 0], [10, 0, 0], [5, 10, 0], [5, 5, 10]],
    faces: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
  });
  await built("polyhedron builds a tetrahedron", tet, 4);
}
throws("polyhedron rejects too few points",
  () => polyhedron({ points: [[0, 0, 0]], faces: [[0, 0, 0]] }), /at least 4 points/);
throws("polyhedron rejects a bad face index",
  () => polyhedron({ points: [[0,0,0],[1,0,0],[0,1,0],[0,0,1]], faces: [[0, 1, 99]] }), /doesn't exist/);

// ---- 2D generators extrude -----------------------------------------------
await built("roundedRectangle extrudes",
  extrusions.extrudeLinear({ height: 5 }, roundedRectangle({ size: [20, 10], roundRadius: 2 })), 20);
await built("star extrudes", extrusions.extrudeLinear({ height: 4 }, star({ vertices: 5, outerRadius: 10 })), 20);
await built("ellipse extrudes", extrusions.extrudeLinear({ height: 4 }, ellipse({ radius: [8, 4] })), 20);
await built("square extrudes", extrusions.extrudeLinear({ height: 4 }, square({ size: 6 })), 8);

// triangle solves its sides
{
  const t = triangle({ type: "SSS", values: [3, 4, 5] });
  const pts = t.pts;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const sides = [d(pts[0], pts[1]), d(pts[1], pts[2]), d(pts[2], pts[0])].sort((a, b) => a - b);
  check("triangle SSS gives a 3-4-5", sides.every((s, i) => Math.abs(s - [3, 4, 5][i]) < 1e-6), sides.join(","));
  await built("triangle extrudes", extrusions.extrudeLinear({ height: 3 }, t), 8);
}
throws("triangle rejects impossible sides",
  () => triangle({ type: "SSS", values: [1, 1, 10] }), /can't close/);

// ---- lathe ----------------------------------------------------------------
await built("extrudeRotate lathes a profile",
  extrusions.extrudeRotate({ segments: 32 },
    primitives.polygon({ points: [[0, 0], [6, 0], [6, 2], [2, 8], [0, 8]] })), 50);
throws("extrudeRotate refuses a 2D boolean",
  () => extrusions.extrudeRotate({}, booleans.subtract(circle({ radius: 8 }), circle({ radius: 3 }))),
  /single outline/);

// ---- hulls ----------------------------------------------------------------
await built("hull wraps two solids",
  hulls.hull(primitives.cylinder({ radius: 3, height: 8, center: [-10, 0, 0] }),
             primitives.cylinder({ radius: 3, height: 8, center: [10, 0, 0] })), 20);
await built("hullChain links three in sequence",
  hulls.hullChain(sphere({ radius: 3, center: [-10, 0, 0] }),
                  sphere({ radius: 3, center: [0, 6, 0] }),
                  sphere({ radius: 3, center: [10, 0, 0] })), 20);

// ---- 2D offset -------------------------------------------------------------
await built("offset grows a 2D outline then extrudes",
  extrusions.extrudeLinear({ height: 3 },
    expansions.offset({ delta: 2 }, square({ size: 10 }))), 8);
throws("offset refuses a solid",
  () => expansions.offset({ delta: 2 }, cuboid({ size: [5, 5, 5] })), /2D geometry/);

// ---- honest failures -------------------------------------------------------
throws("measureBoundingBox explains itself",
  () => measurements.measureBoundingBox(cuboid({ size: [2, 2, 2] })), /built geometry/);
throws("center explains the swap",
  () => transforms.center({ axes: [true, true, true] }, cuboid({ size: [2, 2, 2] })), /center` option|measure the shape/);

// ---- maths -----------------------------------------------------------------
check("degToRad/radToDeg round-trip", Math.abs(maths.radToDeg(maths.degToRad(37)) - 37) < 1e-9);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
