// The split engine (src/engine.js) against the JS kernel, model by model:
// same feature list, volume and bounding box must agree. Rust volumes are of
// the exact surfaces, the JS ones of a faceted mesh, so they get a tolerance.
//
//   node test/engine.js            the built-in cases
//   node test/engine.js --examples also every example that the engine handles

import { readFileSync } from "node:fs";
import { PartHistory } from "brep-io-kernel";
import * as d from "../src/dsl.js";
import { fromOpenSCAD } from "../src/openscad.js";
import { runEngine, solidsToSTL, toRustDialect, EngineRefusal } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";

const rust = await loadRustKernel();

function stlStats(stl) {
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  for (const p of v) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { vol, lo, hi };
}

let fails = 0;
async function check(label, shape, { volTol = 0.02, expectLane = null, expectRefusal = false } = {}) {
  const ph = new PartHistory();
  await d.compile(shape, ph);
  const json = await ph.toJSON();
  await ph.runHistory({ throwOnFeatureError: true });
  const jsSolids = ph.scene.children.filter((o) => o.type === "SOLID");
  const js = stlStats(jsSolids.map((s) => s.toSTL("x", 6)).join("\n"));
  let out;
  try {
    out = await runEngine(json, { rust, manifold: loadManifoldNode });
  } catch (e) {
    if (expectRefusal && e instanceof EngineRefusal) { console.log(`ok    ${label}: refused as expected (${e.message.slice(0, 80)})`); return; }
    fails++; console.log(`FAIL  ${label}: ${e.message.slice(0, 200)}`); return;
  }
  const r = stlStats(solidsToSTL(out.solids));
  const dv = Math.abs(r.vol - js.vol) / Math.max(1, Math.abs(js.vol));
  const db = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(r.lo[k] - js.lo[k]), Math.abs(r.hi[k] - js.hi[k])]));
  const laneOk = !expectLane || out.lane === expectLane;
  const ok = dv <= volTol && db <= 0.15 && laneOk && out.solids.length === jsSolids.length;
  if (!ok) fails++;
  console.log(`${ok ? "ok   " : "FAIL "} ${label}: lane=${out.lane} solids ${out.solids.length}/${jsSolids.length} vol ${r.vol.toFixed(1)} vs js ${js.vol.toFixed(1)} (${(dv * 100).toFixed(2)}%) bbox off ${db.toFixed(3)} | exact ${out.stats.exactMs}ms mesh ${out.stats.meshMs}ms`);
}

// The dialect fixes are the part that fails silently, so pin each one.
{
  const doc = { features: [
    { type: "XFORM", inputParams: { id: "X1", solids: ["A"], translate: [1, 2, 3], rotateEulerDeg: [90, 0, 0], scale: [1, 1, 1] } },
    { type: "E", inputParams: { id: "E2", distance: 0, distanceBack: 7 } },
    { type: "B", inputParams: { id: "B3", targetSolid: "A", boolean: { targets: ["C", "D"], operation: "UNION" } } },
    { type: "B", inputParams: { id: "B4", targetSolid: "A", boolean: { targets: ["E"], operation: "SUBTRACT" } } },
  ] };
  const { doc: r } = toRustDialect(doc);
  const f = r.features;
  const pass = f[0].inputParams.transform.position[2] === 3 && f[0].inputParams.transform.rotationEuler[0] === 90
    && f[1].inputParams.distance === 7 && f[1].inputParams.distanceBack === 0
    && f[3].inputParams.targetSolid === "C";
  if (!pass) fails++;
  console.log(`${pass ? "ok   " : "FAIL "} dialect: XFORM nesting, extrude direction, union rename`);
}

const { cube, cylinder, sphere, torus, cone, difference, union, intersection, translate, rotate, fillet, chamfer, linearExtrude, polygon, revolve, texture } = d;
await check("cube", cube([20, 10, 5]), { expectLane: "exact" });
await check("cylinder", cylinder({ r: 5, h: 10 }));
await check("sphere", sphere({ r: 8 }), { volTol: 0.03 });
await check("torus", torus({ r: 10, tube: 3 }), { volTol: 0.04 });
await check("cone", cone({ r1: 6, r2: 2, h: 10 }));
await check("hole in block", difference(cube([40, 30, 20]), translate([20, 15, -1], cylinder({ r: 8, h: 22 }))));
await check("multi-tool union then subtract", difference(cube([60, 40, 6]),
  union(...[[7, 7], [53, 7], [7, 33], [53, 33]].map(([x, y]) => translate([x, y, -1], cylinder({ r: 2.5, h: 8 })))),
  translate([30, 20, -1], cylinder({ r: 10, h: 8 }))));
await check("intersect", intersection(cube([20, 20, 20]), translate([10, 10, 10], sphere({ r: 13 }))), { volTol: 0.03 });
await check("prism (extrude direction)", translate([5, 5, 2], linearExtrude({ h: 6 }, polygon([[0, 0], [20, 0], [10, 15]]))));
await check("revolve (transform nesting)", revolve(360, polygon([[0, 0], [8, 0], [8, 2], [3, 6], [0, 6]])));
await check("hex nut ($fn=6) keeps its flats", cylinder({ r: 5, h: 3, $fn: 6 }), { volTol: 0.001 });
await check("tilted triangle ($fn=3)", translate([3, 4, 5], rotate([30, 20, 70], cylinder({ r: 6, h: 4, $fn: 3 }))), { volTol: 0.001 });
await check("hex pocket in a block", difference(cube([20, 20, 6]), translate([10, 10, 2], cylinder({ r: 3.2, h: 5, $fn: 6 }))), { volTol: 0.001 });
await check("fillet", fillet({ r: 2 }, cube([20, 20, 10])));
await check("chamfer", chamfer({ d: 1.5 }, cube([20, 20, 10])));
await check("texture alone", texture({ pattern: "knurl" }, cylinder({ r: 10, h: 20 })), { expectLane: "mesh" });
await check("exact minus textured sphere", difference(cube([30, 30, 10]), translate([15, 15, 5], texture({ pattern: "bumps" }, sphere({ r: 8 })))), { expectLane: "mesh" });
await check("textured part moved", translate([10, 0, 5], rotate([0, 90, 0], texture({ pattern: "waffle" }, cube([20, 10, 10])))), { expectLane: "mesh" });
await check("fillet on a texture is refused", fillet({ r: 1 }, texture({ pattern: "bumps" }, cube([20, 20, 10]))), { expectRefusal: true });

// An STL made in CAD, rebuilt exact (the drop menu's "Open as an exact solid"):
// it must come back as a handful of true faces, route through the EXACT lane,
// and keep its volume, including when an exact cylinder is cut out of it.
{
  const src = difference(cube([40, 20, 10]), translate([20, 10, -1], cylinder({ r: 4, h: 12 })));
  const ph = new PartHistory();
  await d.compile(src, ph);
  await ph.runHistory({ throwOnFeatureError: true });
  const stl = ph.scene.children.find((o) => o.type === "SOLID").toSTL("block", 6);
  const conv = JSON.parse(rust.stl_to_step_json(new TextEncoder().encode(stl), "", "block"));
  const faces = (conv.step.match(/ADVANCED_FACE\(/g) || []).length;
  const cyl = (conv.step.match(/CYLINDRICAL_SURFACE\(/g) || []).length;
  const pass = faces <= 12 && cyl >= 1;
  if (!pass) fails++;
  console.log(`${pass ? "ok   " : "FAIL "} stl -> exact: ${(stl.match(/facet normal/g) || []).length} triangles -> ${faces} faces, ${cyl} cylinder(s)`);
  d.registerImport("block.step", conv.step, { mesh: stl });
  await check("exact import routes through the exact lane", d.importedSolid("block.step"), { expectLane: "exact", volTol: 0.01 });
  await check("exact import moved and drilled", difference(translate([5, 0, 0], d.importedSolid("block.step")), translate([10, 10, -1], cylinder({ r: 2, h: 12 }))), { expectLane: "exact", volTol: 0.01 });
}

if (process.argv.includes("--examples")) {
  const ex = (f) => new URL(`../examples/${f}`, import.meta.url);
  for (const f of ["bracket.js", "coin-dish.js", "knob.scad", "screwdriver-holder.scad", "elephant.scad", "orca-bobble.scad", "ltt-collar.js", "mini-centrifuge.js"]) {
    let shape;
    if (f.endsWith(".scad")) shape = fromOpenSCAD(readFileSync(ex(f), "utf8"));
    else { const m = await import(ex(f).href); shape = typeof m.default === "function" ? m.default({}) : m.default; }
    // These two hit real Rust kernel refusals (a tangent torus/cylinder
    // intersection, a fillet too big for its edge). The callers fall back to
    // the JS kernel for them; this pins that they REFUSE rather than build
    // something wrong.
    await check(f, await shape, { volTol: 0.03, expectRefusal: ["ltt-collar.js", "mini-centrifuge.js"].includes(f) });
  }
}

console.log(fails ? `\n${fails} failing` : "\nall engine checks pass");
process.exit(fails ? 1 : 0);
