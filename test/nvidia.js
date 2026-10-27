// NVIDIA's SMLib kernel (native/nvidia-kernel, the desktop alpha's default):
// it loads, it builds the shapes BREPcode makes most, the volumes are right,
// and faces come back with the same names the Rust kernel gives them (which is
// what colours, click-to-code and fillet edge picks depend on).
//
// Skipped (exit 0) where the addon isn't built, which is everywhere but an
// alpha build: `npm run build:nvidia` first. BREPCODE_REQUIRE_NVIDIA=1 (the alpha CI job) makes a missing addon a failure.

import * as dsl from "../src/dsl.js";
import { build } from "../index.js";
import { loadNvidiaKernel } from "../src/engine-node.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

if (!loadNvidiaKernel()) {
  if (process.env.BREPCODE_REQUIRE_NVIDIA) { console.log("FAIL  the NVIDIA kernel addon isn't built in this job"); process.exit(1); }
  console.log("skip  the NVIDIA kernel isn't built here (npm run build:nvidia)");
  process.exit(0);
}

const names = Object.keys(dsl).filter((k) => typeof dsl[k] === "function" && k !== "compile");
const shape = (src) => new Function(...names, `"use strict";\n${src}`)(...names.map((n) => dsl[n]));

function volumeOf(res) {
  let vol = 0;
  for (const s of res.solids) {
    const v = [...s.toSTL(s.name).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    for (let i = 0; i + 2 < v.length; i += 3) {
      const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return vol;
}

// [label, code, exact volume, faces that must be named, tolerance]
const PI = Math.PI;
const CASES = [
  ["box", "return cube([40, 30, 10]);", 12000, ["P.CU1_PX", "P.CU1_NZ"]],
  ["cylinder", "return cylinder({ r: 5, h: 10 });", PI * 25 * 10, ["P.CY1_S", "P.CY1_T", "P.CY1_B"]],
  ["sphere", "return sphere({ r: 6 });", (4 / 3) * PI * 216, ["P.S1"], 0.02],
  ["plate with a hole", "return difference(cube([40, 30, 10]), translate([20, 15, -1], cylinder({ r: 5, h: 12 })));",
    12000 - PI * 25 * 10, ["P.CU1_PZ", "P.CY2_S"]],
  ["rounded box", 'return fillet({ r: 3, edges: "z" }, cube([40, 30, 10]));',
    12000 - 4 * (9 - PI * 9 / 4) * 10, ["P.CU1_PX", "F2:BLEND:P.CU1_NX|P.CU1_NY[0]"]],
  ["chamfered top", 'return chamfer({ d: 1, edges: "top" }, cube([10, 10, 10]));',
    1000 - 4 * 0.5 * 10, ["P.CU1_PZ"]],
  ["union", "return union(cube([10, 10, 10]), translate([5, 5, 10], cylinder({ r: 3, h: 5 })));",
    1000 + PI * 9 * 5, ["P.CU1_PZ"]],
  ["extruded triangle", "return linearExtrude({ h: 5 }, polygon([[0, 0], [20, 0], [10, 15]]));",
    150 * 5, ["E3:S2:G100_SW", "E3:S2:PROFILE:L100_END"]],
  ["revolved cup", "return revolve({ angle: 360 }, polygon([[0, 0], [8, 0], [8, 6], [0, 6]]));",
    PI * 64 * 6, ["S2:G101_RV"], 0.02],
  // a part turn needs the closed profile (status 1001 without the axis edge)
  ["half-revolved cup", "return revolve({ angle: 180 }, polygon([[0, 0], [8, 0], [8, 6], [0, 6]]));",
    PI * 64 * 6 / 2, ["S2:G100_RV", "S2:G101_RV", "S2:G102_RV", "R3:L100_START", "R3:L100_END"], 0.02],
  ["part torus", "return torus({ r: 10, tube: 2, arc: 90 });", 2 * PI * PI * 10 * 4 / 4, ["P.T1_Cap0", "P.T1_Cap1", "P.T1_Side[0]"], 0.02],
  ["part torus, placed", "return translate([1, 2, 3], rotate([30, 0, 10], torus({ r: 10, tube: 2, arc: 270 })));",
    2 * PI * PI * 10 * 4 * 3 / 4, ["P.T1_Cap0", "P.T1_Cap1"], 0.02],
  ["mirrored box", "return scale([-1, 1, 1], translate([5, 0, 0], cube([4, 5, 6])));", 120, ["P.CU1_PX", "P.CU1_NX"]],
  ["mirrored plate with a hole", "return mirror([0, 1, 0], difference(cube([40, 30, 10]), translate([20, 15, -1], cylinder({ r: 5, h: 12 }))));",
    12000 - PI * 25 * 10, ["P.CU1_PZ", "P.CY2_S"]],
  // SMLib's union isn't symmetric in its numerics: bar + arm (overlapping by
  // 0.01, as filament-guide draws them) came back open, arm + bar solid
  ["union that needs the other order", `const rect = (x0, y0, x1, y1) => polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    return union(linearExtrude({ h: 10 }, rect(-13.2, 10.2, 13.2, 13.2)), linearExtrude({ h: 10 }, rect(-13.2, -5, -10.2, 10.209999999999999)));`,
    1248, ["E3:S2:G100_SW", "E6:S5:G100_SW"]],
];

console.log("\nNVIDIA kernel\n");
for (const [label, src, want, faces, tol = 0.005] of CASES) {
  let res;
  try { res = await build(shape(src), { engine: "nvidia-split" }); }
  catch (e) { check(`${label}: builds`, false, String(e.message || e).slice(0, 200)); continue; }
  check(`${label}: builds`, res.kernel === "nvidia");
  const v = volumeOf(res);
  check(`${label}: volume ${v.toFixed(1)} ~ ${want.toFixed(1)}`, Math.abs(v - want) / want < tol);
  const got = new Set(res.solids.flatMap((s) => s.faceNames || []));
  for (const f of faces) check(`${label}: face ${f}`, got.has(f), [...got].slice(0, 12).join(" "));
}

// bounds, where a mirror or a pivot would show up wrong with the volume right
function boundsOf(res) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of res.solids) {
    for (const m of s.toSTL(s.name).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], +m[k + 1]); hi[k] = Math.max(hi[k], +m[k + 1]); }
    }
  }
  return { lo, hi };
}
const near3 = (a, b, tol = 0.02) => a.every((v, k) => Math.abs(v - b[k]) <= tol);
{
  const res = await build(shape("return scale([-1, 1, 1], translate([5, 0, 0], cube([4, 5, 6])));"), { engine: "nvidia-split" });
  const b = boundsOf(res);
  check("a mirrored box lands on the other side", near3(b.lo, [-9, 0, 0]) && near3(b.hi, [-5, 5, 6]), JSON.stringify(b));
  const t = boundsOf(await build(shape("return torus({ r: 10, tube: 2, arc: 90 });"), { engine: "nvidia-split" }));
  check("a part torus sweeps from +X toward +Y, as on the Rust kernel", near3(t.lo, [0, 0, -2], 0.05) && near3(t.hi, [12, 12, 2], 0.05), JSON.stringify(t));
}

// features BREPcode's DSL doesn't write but the kernel interface takes: a
// primitive carrying its own boolean, a transform about the bounding-box
// centre. Straight into the adapter, as the Rust kernel would be driven.
{
  const nk = loadNvidiaKernel();
  const cube = (id, x, y, z, position = [0, 0, 0]) => ({ type: "P.CU", inputParams: { id, sizeX: x, sizeY: y, sizeZ: z, transform: { position, rotationEuler: [0, 0, 0], scale: [1, 1, 1] } } });
  const cyl = (id, boolean) => ({ type: "P.CY", inputParams: { id, radius: 3, height: 20, boolean,
    transform: { position: [5, -5, 5], rotationEuler: [0, 0, 0], scale: [1, 1, 1] } } });
  const run = (features) => JSON.parse(nk.execute_history_json(JSON.stringify({ features }))).results;
  const meshVolume = (h) => {
    const m = nk.tessellate_handle(h, 0.01), p = m.take_positions(), ix = m.take_indices();
    let v = 0;
    for (let i = 0; i < ix.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((j) => [p[3 * ix[i + j]], p[3 * ix[i + j] + 1], p[3 * ix[i + j] + 2]]);
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    return v;
  };
  // the cylinder stands on +Y through the 10 mm cube: 3^2 pi x 10 of it inside
  const inside = PI * 9 * 10;
  for (const [op, want] of [["UNION", 1000 + PI * 9 * 10], ["SUBTRACT", 1000 - inside], ["INTERSECT", inside]]) {
    const r = run([cube("P.CU1", 10, 10, 10), cyl("P.CY2", { operation: op, targets: ["P.CU1"] })]).at(-1);
    const a = r.added[0];
    const names = a ? JSON.parse(nk.face_names_handle(a.handle)).map((x) => x[1]) : [];
    check(`a cylinder's own ${op}: the target keeps its name`, !r.error && r.added.length === 1 && a.name === "P.CU1"
      && r.removed.join() === "P.CU1", r.error || JSON.stringify(r));
    const v = a ? meshVolume(a.handle) : 0;
    check(`a cylinder's own ${op}: volume ${v.toFixed(1)} ~ ${want.toFixed(1)}`, Math.abs(v - want) / want < 0.01);
    check(`a cylinder's own ${op}: its faces are named`, names.includes("P.CY2_S"), names.join(" "));
  }
  // 90 degrees about Z, about the box's own centre: it turns in place
  const r = run([cube("P.CU1", 10, 20, 30, [100, 0, 0]),
    { type: "XFORM", inputParams: { id: "X2", solids: ["P.CU1"], pivot: "BBOX_CENTER", transform: { position: [0, 0, 0], rotationEuler: [0, 0, 90], scale: [1, 1, 1] } } }]).at(-1);
  const m = r.added[0] && nk.tessellate_handle(r.added[0].handle, 0.01).take_positions();
  const lo = [0, 1, 2].map((k) => Math.min(...[...(m || [])].filter((_, i) => i % 3 === k)));
  const hi = [0, 1, 2].map((k) => Math.max(...[...(m || [])].filter((_, i) => i % 3 === k)));
  check("an XFORM about the bounding-box centre turns in place", !r.error && near3(lo, [95, 5, 0], 1e-3) && near3(hi, [115, 15, 30], 1e-3),
    r.error || JSON.stringify({ lo, hi }));
}

// the catalog models NVIDIA used to refuse, and the one whose volume the two
// kernels disagreed on (the Rust kernel drops both cuts down the revolve
// axis; NVIDIA's matches the volume worked out by hand)
{
  const { FAMILIES } = await import("../src/catalog/index.js");
  const { resolveParams, familyCode } = await import("../src/catalog/schema.js");
  const family = (id) => { const f = FAMILIES.find((x) => x.id === id); return shape(familyCode(f, resolveParams(f).values)); };
  for (const id of ["pet-food-scoop", "filament-guide"]) {
    let res;
    try { res = await build(family(id), { engine: "nvidia-split" }); } catch (e) { check(`${id} builds on NVIDIA`, false, String(e.message).slice(0, 160)); continue; }
    check(`${id} builds on NVIDIA`, res.kernel === "nvidia");
  }
  // revolve of (0,0) (16,0) (16,2) (13,5.6) (13.78,63) (13,130) (11.05,140)
  // (0,140), less the 2.8 bore and the knot cone, twice: 150027.5 mm^3
  const v = volumeOf(await build(family("jump-rope-handles"), { engine: "nvidia-split" }));
  check(`jump-rope-handles volume ${v.toFixed(0)} ~ 150027`, Math.abs(v - 150027.5) / 150027.5 < 0.005);
}

// a revolve's faces carry the names the Rust kernel puts on the SAME faces
// (not just the same set of names): each named face's r / z span about the
// spin axis and, for a part turn, which way round it lies. A face's sample
// point on the far side of the axis once named a ring's outer wall after its
// inner one; a part turn of a clockwise profile or of a ring once swept the
// other way round.
{
  const { PartHistory } = await import("brep-io-kernel");
  const { runEngine } = await import("../src/engine.js");
  const { loadRustKernel, loadManifoldNode } = await import("../src/engine-node.js");
  const kernels = [["rust", await loadRustKernel()], ["nvidia", loadNvidiaKernel()]];
  const facesOn = async (k, src) => {
    const ph = new PartHistory();
    await dsl.compile(shape(src), ph);
    const out = await runEngine(await ph.toJSON(), { rust: k, manifold: loadManifoldNode });
    const by = new Map();
    for (const s of out.solids) for (const f of s.faces) {
      const P = f.positions, b = [Infinity, -Infinity, Infinity, -Infinity];
      let X = 0, Y = 0;
      for (let i = 0; i < P.length; i += 3) {
        const r = Math.hypot(P[i], P[i + 1]);
        b[0] = Math.min(b[0], r); b[1] = Math.max(b[1], r); b[2] = Math.min(b[2], P[i + 2]); b[3] = Math.max(b[3], P[i + 2]);
        X += P[i]; Y += P[i + 1];
      }
      by.set(f.name, { b, a: Math.atan2(Y, X) * 180 / PI });
    }
    return by;
  };
  const REVOLVES = [
    ["revolved ring cup", 360, "[[4, 0], [10, 0], [10, 20], [8, 20], [8, 2], [4, 2]]"],
    ["part-turned ring", 120, "[[4, 0], [10, 0], [10, 20], [4, 20]]"],
    ["part-turned ring, clockwise", 120, "[[4, 20], [10, 20], [10, 0], [4, 0]]"],
    ["part-turned block, clockwise", 120, "[[0, 20], [10, 20], [10, 0], [0, 0]]"],
    ["part-turned block", 270, "[[0, 0], [10, 0], [10, 20], [0, 20]]"],
  ];
  for (const [label, angle, pts] of REVOLVES) {
    const src = `return revolve({ angle: ${angle} }, polygon(${pts}));`;
    let rust, nv;
    try { [rust, nv] = [await facesOn(kernels[0][1], src), await facesOn(kernels[1][1], src)]; }
    catch (e) { check(`${label}: builds on both kernels`, false, String(e.message).slice(0, 160)); continue; }
    const bad = [];
    for (const [name, r] of rust) {
      const n = nv.get(name);
      if (!n) { bad.push(`${name} missing`); continue; }
      if (r.b.some((v, i) => Math.abs(v - n.b[i]) > 0.3)) bad.push(`${name} spans ${n.b.map((v) => v.toFixed(1))} not ${r.b.map((v) => v.toFixed(1))}`);
      const da = Math.abs(((r.a - n.a + 540) % 360) - 180);
      if (angle < 360 && da > 15) bad.push(`${name} at ${n.a.toFixed(0)} deg not ${r.a.toFixed(0)}`);
    }
    check(`${label}: every face named as on the Rust kernel`, !bad.length && nv.size === rust.size, bad.join("; ") || `${nv.size} vs ${rust.size} faces`);
  }
}

// a model NVIDIA's kernel refuses (a pyramid, for now) still builds, on the
// Rust kernel, and says why
{
  const res = await build(shape('return feature("P.PY", { baseSideLength: 10, sides: 4, height: 10 });'), { engine: "nvidia" });
  check("a refusal falls through to the Rust kernel", res.solids.length > 0 && res.kernel === "rust" && /NVIDIA/.test(res.fallback || ""),
    `${res.kernel} ${res.fallback || ""}`);
}

// a revolve's end caps are faces "R4:L100_START" on the model but "S3:PROFILE_START"
// in its edge names; an edge picked on the model (face names) still chamfers
{
  const rev = "revolve({ angle: 270 }, polygon([[0, 0], [8, 0], [8, 10], [0, 10]]))";
  let ok = false, why = "";
  try {
    const res = await build(shape(`return chamfer({ d: 1, edges: ["R4:L100_END|R4:L100_START[0]"] }, union(cube(20), translate([30, 0, 0], ${rev})));`), { engine: "nvidia" });
    // it resolves and builds (this concave axis edge is one the exact kernels
    // decline to bevel, so the JS kernel may be the one that does it)
    ok = res.solids.length > 0;
    why = `${res.kernel} ${res.fallback || ""}`;
  } catch (e) { why = String(e.message).slice(0, 160); }
  check("a picked revolve-cap edge (face names) is found under its edge names and builds", ok, why);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
