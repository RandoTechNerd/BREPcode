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
await check("octagon ($fn=8) keeps its flats", cylinder({ r: 5, h: 3, $fn: 8 }), { volTol: 0.001 });
// $fn=16 is above POLYGON_MAX: a true circle, so it is ~2.5% bigger than the
// JS kernel's inscribed 16-gon, and the engine counts it as rounded.
await check("$fn=16 hole goes round", difference(cube([20, 20, 6]), translate([10, 10, -1], cylinder({ r: 4, h: 8, $fn: 16 }))), { volTol: 0.01 });
{
  const roundedOf = async (shape) => {
    const ph = new PartHistory();
    await d.compile(shape, ph);
    return (await runEngine(await ph.toJSON(), { rust, manifold: loadManifoldNode })).stats.roundedCurves;
  };
  const nut = await roundedOf(difference(cube([20, 20, 6]), translate([10, 10, 2], cylinder({ r: 3.2, h: 5, $fn: 6 }))));
  const hole = await roundedOf(difference(cube([20, 20, 6]), translate([10, 10, -1], cylinder({ r: 4, h: 8, $fn: 16 }))));
  const plain = await roundedOf(cylinder({ r: 4, h: 8 }));
  const pass = nut === 0 && hole === 1 && plain === 0;
  if (!pass) fails++;
  console.log(`${pass ? "ok   " : "FAIL "} roundedCurves: hex nut ${nut}, $fn=16 hole ${hole}, plain cylinder ${plain}`);
}
{
  // The OpenSCAD path end to end: a nut trap stays hexagonal, a $fn=16 bolt hole goes round.
  const ph = new PartHistory();
  await d.compile(fromOpenSCAD("difference(){ cube([20,20,8]); translate([10,10,-1]) cylinder(r=1.6,h=10,$fn=16); translate([10,10,5]) cylinder(r=3.2,h=4,$fn=6); }"), ph);
  const out = await runEngine(await ph.toJSON(), { rust, manifold: loadManifoldNode });
  const pass = out.lane === "exact" && out.stats.roundedCurves === 1;
  if (!pass) fails++;
  console.log(`${pass ? "ok   " : "FAIL "} OpenSCAD nut trap + $fn=16 bolt hole: lane=${out.lane} rounded=${out.stats.roundedCurves}`);
}
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
  // the JS kernel (refusal fallback, --engine js) cuts with the source mesh,
  // which needs the clone patch the STEP branch now installs too
  {
    const { build: b, toSTL: t } = await import("../src/render.js");
    const r = await b(difference(cube([60, 30, 12]), translate([10, 5, 1], d.importedSolid("block.step"))), { engine: "js" });
    const vol = stlStats(t(r)).vol;
    const pass = r.engine === "js" && Math.abs(vol - (60 * 30 * 12 - 7500)) < 120;
    if (!pass) fails++;
    console.log(`${pass ? "ok   " : "FAIL "} JS kernel cuts with an exact import's mesh: vol ${vol.toFixed(1)} (expected ~${60 * 30 * 12 - 7500})`);
  }
  await check("exact import moved and drilled", difference(translate([5, 0, 0], d.importedSolid("block.step")), translate([10, 10, -1], cylinder({ r: 2, h: 12 }))), { expectLane: "exact", volTol: 0.01 });
}

// path2d + bezierTo stay exact curves, and revolve({ stretch }) makes a
// racetrack (stadium) solid: two half-revolves and an extruded middle.
{
  const { path2d, bezierTo } = d;
  await check("racetrack of a rectangle = a stadium plate", revolve({ stretch: 4 }, polygon([[0, 0], [3, 0], [3, 4], [0, 4]])), { expectLane: "exact", volTol: 0.01 });
  const side = path2d([0, 0], [20, 0], bezierTo([22.5, 0], [23.4, 1.8], [23, 3.2]),
    bezierTo([22.4, 5.2], [14.3, 9], [14.3, 15]), bezierTo([14.3, 24], [14.8, 32], [13.2, 32]), [0, 32]);
  await check("Bezier profile revolves", revolve(360, side), { expectLane: "exact", volTol: 0.01 });
  await check("Bezier profile racetrack", revolve({ stretch: 10 }, side), { expectLane: "exact", volTol: 0.01 });
  await check("Bezier profile extrudes", linearExtrude({ h: 5 }, path2d([0, 0], [20, 0], bezierTo([25, 5], [15, 15], [10, 20]), [0, 20])), { expectLane: "exact", volTol: 0.01 });
  // arcs and round hole loops (test/sketcharcs.js has the analytic volumes)
  const { arcTo, circle2d, region2d } = d;
  await check("arc slot with a round hole loop extrudes", linearExtrude({ h: 4 }, region2d(
    path2d([0, 0], [20, 0], arcTo([20, 10], { center: [20, 5] }), [0, 10], arcTo([0, 0], { center: [0, 5] })),
    circle2d({ r: 2, center: [10, 5] }))), { expectLane: "exact", volTol: 0.005 });
  await check("round-over arc revolves", revolve(360, path2d([0, 0], [10, 0], [10, 6], arcTo([6, 10], { center: [6, 6] }), [0, 10])), { expectLane: "exact", volTol: 0.005 });
}

// union(union(a, b), c) keeps a's name, as the JS kernel does (a nested
// union used to come back named after a consumed tool).
{
  const shape = union(union(cube([10, 10, 10]), translate([5, 0, 0], cube([10, 10, 10]))), translate([10, 0, 0], cube([10, 10, 10])));
  const ph = new PartHistory();
  await d.compile(shape, ph);
  await ph.runHistory({ throwOnFeatureError: true });
  const jsNames = ph.scene.children.filter((o) => o.type === "SOLID").map((s) => s.name);
  const out = await runEngine(await ph.toJSON(), { rust, manifold: loadManifoldNode });
  const pass = JSON.stringify(out.solids.map((s) => s.name)) === JSON.stringify(jsNames);
  if (!pass) fails++;
  console.log(`${pass ? "ok   " : "FAIL "} nested union keeps the target's name: ${out.solids.map((s) => s.name)} vs js ${jsNames}`);
}

// The mesh lane frees what it allocates: every Manifold it made is deleted
// by the time it returns, on success and on a refusal partway through.
{
  const mf = await loadManifoldNode();
  const shape = difference(cube([30, 30, 10]), translate([15, 15, 5], texture({ pattern: "bumps" }, sphere({ r: 8 }))));
  const ph = new PartHistory();
  await d.compile(shape, ph);
  const made = [];
  await runEngine(await ph.toJSON(), { rust, manifold: mf, trackManifolds: made });
  const live = made.filter((m) => !m.isDeleted());
  const pass = made.length > 3 && live.length === 0;
  if (!pass) fails++;
  console.log(`${pass ? "ok   " : "FAIL "} mesh lane frees its manifolds: ${made.length} made, ${live.length} still alive`);
}

// fillet/chamfer edges by spec ("z", "top", ...) read from the Rust kernel's
// own topology (compile's opts.edgeNames, engine.js solidEdges) pick the same
// edges the JS kernel's replay picks, without that replay. A cylinder's seam,
// an edge only the Rust kernel has, is never one of them.
{
  let asked = 0;
  const edgeNames = async (json) => {
    asked++;
    const out = await runEngine(json, { rust, manifold: loadManifoldNode, edges: true });
    return out.solids.map((s) => ({ name: s.name, faces: s.faces.map((f) => f.name), edges: s.edges }));
  };
  const picked = async (shape, opts) => {
    const ph = new PartHistory();
    await d.compile(shape, ph, null, opts);
    return JSON.stringify(ph.features.filter((f) => f.type === "F" || f.type === "CH").map((f) => [...f.inputParams.edges].sort()));
  };
  const holed = () => difference(cube([20, 14, 10]), translate([10, 7, -1], cylinder({ r: 3, h: 12 })));
  const cases = {
    z: fillet({ r: 1, edges: "z" }, holed()),
    x: chamfer({ d: 0.5, edges: "x" }, holed()),
    top: fillet({ r: 1, edges: "top" }, holed()),
    bottom: chamfer({ d: 0.5, edges: "bottom" }, holed()),
    all: fillet({ r: 0.5, edges: "all" }, holed()),
    "z after a rotate": fillet({ r: 1, edges: "z" }, rotate([90, 0, 0], cube([10, 6, 4]))),
    "an extrusion's z": fillet({ r: 1, edges: "z" }, linearExtrude({ height: 5 }, polygon([[0, 0], [20, 0], [20, 10], [8, 14], [0, 10]]))),
    "the second part": union(translate([30, 0, 0], cube(5)), fillet({ r: 1, edges: "z" }, holed())),
  };
  for (const [k, shape] of Object.entries(cases)) {
    asked = 0;
    const js = await picked(shape, {}), fast = await picked(shape, { edgeNames });
    const pass = js === fast && asked === 1;
    if (!pass) fails++;
    console.log(`${pass ? "ok   " : "FAIL "} edges "${k}" from the Rust kernel = the JS replay's: ${fast}${pass ? "" : ` vs js ${js} (asked ${asked}x)`}`);
  }
  // a kernel that can't list edges (the NVIDIA adapter) answers null, and
  // compile replays on the JS kernel as before
  const none = async (json) => (await edgeNames(json)).map((s) => ({ ...s, edges: null }));
  const js = await picked(cases.z, {}), back = await picked(cases.z, { edgeNames: none });
  if (js !== back) fails++;
  console.log(`${js === back ? "ok   " : "FAIL "} no edges from the kernel: the JS replay picks them instead`);
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
