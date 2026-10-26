// Sketch arcs and circles (arcTo, circle2d, region2d) on all three kernels.
//
// The Design-mode sketcher emits profiles with arcs, full circles and round
// holes. Each one here is extruded or revolved on the JS kernel, on the Rust
// kernel (the split engine) and on NVIDIA's SMLib kernel (where the addon is
// built), and its volume checked against the analytic value to 0.5%. The JS
// kernel facets curves (128 to a turn for an arc sketch); the other two build
// them exact, and are measured through a tessellation fine enough (0.002 mm
// chord) that faceting doesn't count.
//
//   node test/sketcharcs.js

import { PartHistory } from "brep-io-kernel";
import * as d from "../src/dsl.js";
import { runEngine, solidsToSTL } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode, loadNvidiaKernel } from "../src/engine-node.js";

const { path2d, arcTo, circle2d, region2d, polygon, linearExtrude, revolve, mirror, translate, difference, cube } = d;
const PI = Math.PI;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

function volumeOf(stl) {
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i + 2 < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return vol;
}

// ------------------------------------------------------------ the DSL itself
{
  // the three ways to say an arc land on the same circle
  const viaCenter = path2d([10, 0], arcTo([0, 10], { center: [0, 0] }), [0, 0]).segs[0];
  const viaR = path2d([10, 0], arcTo([0, 10], { r: 10 }), [0, 0]).segs[0];
  const via3 = path2d([10, 0], arcTo([10 * Math.SQRT1_2, 10 * Math.SQRT1_2], [0, 10]), [0, 0]).segs[0];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
  check("arcTo center / r / three-point agree", [viaCenter, viaR, via3].every((s) => s.t === "arc" && near(s.c, [0, 0]) && !s.cw),
    JSON.stringify([viaCenter, viaR, via3].map((s) => [s.c, s.cw])));
  const large = path2d([-3, 0], arcTo([3, 0], { r: 5, large: true }), [0, 0]).segs[0];
  check("arcTo { large } takes the long way round", near(large.c, [0, -4]), JSON.stringify(large.c));
  const cw = path2d([3, 0], arcTo([-3, 0], { r: 5, cw: true })).segs[0];
  check("arcTo { cw } goes round the other way", cw.cw && near(cw.c, [0, 4]), JSON.stringify(cw));
  let threw = false;
  try { path2d([0, 0], arcTo([10, 0], { center: [3, 0] }), [5, 5]); } catch { threw = true; }
  check("arcTo refuses an end off the start's circle", threw);
  // a clockwise arc is written end to start: the kernels only draw CCW arcs
  const ph = new PartHistory();
  await d.compile(linearExtrude({ h: 1 }, path2d([0, 0], [20, 0], [20, 10], [15, 10], arcTo([5, 10], { center: [10, 10], cw: true }), [0, 10])), ph);
  const doc = await ph.toJSON();
  const sk = (typeof doc === "string" ? JSON.parse(doc) : doc).features.find((f) => f.type === "S").persistentData.sketch;
  const arc = sk.geometries.find((g) => g.type === "arc");
  const P = (i) => sk.points.find((q) => q.id === i);
  check("a CW arc reaches the sketch as a CCW one, end to start", arc && P(arc.points[1]).x === 5 && P(arc.points[2]).x === 15,
    JSON.stringify(arc));
}

// ------------------------------------------------------------ the solids
//
// [label, shape, exact volume, faces each exact kernel must name]. The names
// are the Rust kernel's: a wall after its sketch curve (a full circle's in two
// halves, [0] and [1]), a hole's walls after its loop (HOLE:L<first curve>).
const stadium = path2d([0, 0], [20, 0], arcTo([20, 10], { center: [20, 5] }), [0, 10], arcTo([0, 0], { center: [0, 5] }));
const plate = polygon([[0, 0], [40, 0], [40, 30], [0, 30]]);
// Pappus: a region of area A whose centroid is x from the axis sweeps 2 pi x A
const corner = 256 * PI - (48 * PI * PI + (128 * PI) / 3);   // the r4 round-over cut off a 10 x 10 can
const CASES = [
  ["stadium (two arcs) extruded", linearExtrude({ h: 4 }, stadium), (200 + 25 * PI) * 4, ["E3:S2:G101_SW", "E3:S2:G100_SW", "E3:S2:PROFILE:L100_END"]],
  ["full circle extruded", linearExtrude({ h: 10 }, circle2d({ r: 6, center: [3, 2] })), 36 * PI * 10, ["E3:S2:G100_SW[0]", "E3:S2:G100_SW[1]"]],
  ["plate with a round hole loop", linearExtrude({ h: 5 }, region2d(plate, circle2d({ r: 5, center: [20, 15] }))),
    (1200 - 25 * PI) * 5, ["E3:HOLE:L104", "E3:S2:G100_SW", "E3:S2:PROFILE:L100_START"]],
  ["plate with a circle and a slot as holes", linearExtrude({ h: 3 }, region2d(plate,
    circle2d({ r: 4, center: [10, 15] }),
    path2d([22, 12], [32, 12], arcTo([32, 18], { r: 3 }), [22, 18], arcTo([22, 12], { r: 3 })))),
    (1200 - 16 * PI - (60 + 9 * PI)) * 3, ["E3:HOLE:L104", "E3:HOLE:L105", "E3:S2:G103_SW"]],
  ["concave (CW) arc bite", linearExtrude({ h: 2 }, path2d([0, 0], [20, 0], [20, 10], [15, 10], arcTo([5, 10], { center: [10, 10], cw: true }), [0, 10])),
    (200 - 12.5 * PI) * 2, ["E3:S2:G103_SW"]],
  ["large arc by radius", linearExtrude({ h: 2 }, path2d([-3, 0], arcTo([3, 0], { r: 5, large: true }))),
    (25 * PI - 12.5 * (2 * Math.acos(0.8) - Math.sin(2 * Math.acos(0.8)))) * 2, ["E3:S2:G100_SW", "E3:S2:G101_SW"]],
  ["mirrored region keeps arcs and holes", mirror([0, 1, 0], linearExtrude({ h: 5 }, region2d(stadium, circle2d({ r: 2, center: [10, 5] })))),
    (200 + 25 * PI - 4 * PI) * 5, []],
  ["hole loop cut from a box", difference(cube([30, 30, 10]), translate([0, 0, -1], linearExtrude({ h: 12 }, region2d(circle2d({ r: 12, center: [15, 15] }), circle2d({ r: 6, center: [15, 15] }))))),
    9000 - (144 - 36) * PI * 10, []],
  ["revolved quarter disc (a hemisphere)", revolve(360, path2d([0, 0], [5, 0], arcTo([0, 5], { center: [0, 0] }))),
    (2 / 3) * PI * 125, ["S2:G101_RV"]],
  ["revolved can with a round-over arc", revolve(360, path2d([0, 0], [10, 0], [10, 6], arcTo([6, 10], { center: [6, 6] }), [0, 10])),
    1000 * PI - corner, ["S2:G102_RV", "S2:G101_RV"]],
  ["revolved profile with a circle hole (a ring void)", revolve(360, region2d(polygon([[0, 0], [10, 0], [10, 10], [0, 10]]), circle2d({ r: 2, center: [6, 5] }))),
    1000 * PI - 48 * PI * PI, ["S2:G101_RV", "S6:G100_RV[0]"]],
];

const nk = loadNvidiaKernel();
if (!nk && process.env.BREPCODE_REQUIRE_NVIDIA) { console.log("FAIL  the NVIDIA kernel addon isn't built in this job"); process.exit(1); }
const rust = await loadRustKernel();
const KERNELS = [["js", null], ["rust", rust], ...(nk ? [["nvidia", nk]] : [])];
console.log(`\nsketch arcs and circles (${KERNELS.map((k) => k[0]).join(", ")}${nk ? "" : "; NVIDIA kernel not built here"})\n`);

for (const [label, shape, want, faces] of CASES) {
  const ph = new PartHistory();
  await d.compile(shape, ph);
  const json = await ph.toJSON();
  for (const [kname, kernel] of KERNELS) {
    let v, names = null;
    try {
      if (!kernel) {
        await ph.runHistory({ throwOnFeatureError: true });
        v = volumeOf(ph.scene.children.filter((o) => o.type === "SOLID").map((s) => s.toSTL("x", 6)).join("\n"));
      } else {
        const out = await runEngine(json, { rust: kernel, manifold: loadManifoldNode, tolerance: 0.002 });
        if (out.lane !== "exact") throw new Error(`built on the ${out.lane} lane`);
        v = volumeOf(solidsToSTL(out.solids));
        names = new Set(out.solids.flatMap((s) => s.faces.map((f) => f.name)));
      }
    } catch (e) { check(`${kname}: ${label}: builds`, false, String(e.message || e).slice(0, 200)); continue; }
    check(`${kname}: ${label}: volume ${v.toFixed(2)} ~ ${want.toFixed(2)}`, Math.abs(v - want) / want < 0.005);
    for (const f of names ? faces : []) check(`${kname}: ${label}: face ${f}`, names.has(f), [...names].slice(0, 14).join(" "));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
