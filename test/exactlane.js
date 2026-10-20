// Exact first: the AI's instructions steer onto the Rust B-rep lane, and the
// chat asks for an exact rewrite when a build leaves it for no good reason.
//
// Three things are checked. The advice (src/exactlane.js) fires on avoidable
// mesh and fallback builds and stays quiet otherwise. The rules it teaches are
// TRUE on the engine: each "do this, not that" pair is built and its lane
// measured, so a kernel change that makes advice wrong fails here. And the
// rules reach the AI: the harness, LLM_PROMPT.md and the recipe library carry
// them, and no recipe teaches a mesh where an exact build does the job.
//
//   node test/exactlane.js

import { readFileSync, readdirSync } from "node:fs";
import * as dsl from "../index.js";
import { build } from "../index.js";
import { exactAdvice, EXACT_RULES, EXACT_CORE } from "../src/exactlane.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

console.log("\nthe advice fires only when the code could have stayed exact\n");
{
  check("exact: nothing to say", exactAdvice({ engine: "exact" }, "return hull(a, b);") === null);
  check("no build report: nothing claimed", exactAdvice(null, "return hull(a, b);") === null);
  const h = exactAdvice({ engine: "mesh" }, "const c = 6;\nreturn hull(a, b);");
  check("hull() on the mesh lane: ask for exact", h?.lane === "mesh" && /hull\(\)/.test(h.ask) && /edges: "z"/.test(h.ask), h?.ask);
  check("...keeping sizes and dials", /Keep every size, hole, colour and the const dials/.test(h?.ask || ""));
  check("roundedGrow() too", /roundedGrow/.test(exactAdvice({ engine: "mesh" }, "return roundedGrow(2, cube([9, 9, 9]));")?.why || ""));
  check("a mesh on purpose (tube, texture, text) is left alone",
    exactAdvice({ engine: "mesh" }, "return union(tube(p, { r: 2 }), texture({ pattern: 'knurl' }, part));") === null);
  check("...but hull() beside a tube is still named, and the tube kept",
    /Keep tube\(\)/.test(exactAdvice({ engine: "mesh" }, "return union(tube(p, { r: 2 }), hull(a, b));")?.ask || ""));
  check("a mesh verb the user asked for by name is their call",
    exactAdvice({ engine: "mesh" }, "return hull(a, b);", "make it as a hull() of four cylinders") === null);
  check("a word inside a string or comment is not a call",
    exactAdvice({ engine: "mesh" }, "// hull(a, b) would be a mesh\nreturn text({ text: 'hull(' });") === null);
  check("Rust still downloading: not the code's fault",
    exactAdvice({ engine: "js", fallbackKind: "loading", fallback: "the Rust kernel is still downloading" }, "return cube(5);") === null);
  check("JS kernel picked on purpose: nothing to say", exactAdvice({ engine: "js", fallbackKind: null }, "return cube(5);") === null);
  const rev = exactAdvice({ engine: "js", fallbackKind: "refused",
    fallback: "Rust kernel, B B6: boolean SUBTRACT failed: boolean: the result SELF-INTERSECTS" },
    "return difference(revolve(360, prof), cylinder({ r: 4, h: 5 }));");
  check("a refused revolve: names the axis hole and the cone fix", rev?.lane === "js" && /revolve\(\) axis/.test(rev.ask) && /cylinder\(\{ r1, r2 \}\)/.test(rev.ask), rev?.ask);
  const gen = exactAdvice({ engine: "js", fallbackKind: "refused", fallback: "boolean assembly: non-integral genus" }, "return difference(a, t1, t2);");
  check("a refused tool union: one cutter at a time", /one at a time/.test(gen?.ask || ""), gen?.ask);
  check("an unknown refusal still gets a request, with the kernel's words",
    /the kernel said: something new/i.test(exactAdvice({ engine: "js", fallbackKind: "refused", fallback: "something new" }, "return cube(5);")?.ask || ""));
}

console.log("\nthe rules are true on the engine (measured, not remembered)\n");
const lane = async (shape) => {
  const t0 = performance.now();
  try { const r = await build(shape); return { engine: r.engine, fallback: r.fallback, ms: performance.now() - t0 }; }
  catch (e) { return { engine: "error", fallback: e.message }; }
};
{
  const { cube, cylinder, hull, fillet, difference, translate, revolve, polygon, roundedGrow, linearExtrude, rotate } = dsl;
  const corner = (x, y) => translate([x, y, 0], cylinder({ r: 6, h: 30, $fn: 48 }));
  const hb = await lane(hull(corner(6, 6), corner(74, 6), corner(6, 44), corner(74, 44)));
  check("plain hull() of corner cylinders is still a mesh", hb.engine === "mesh", hb.engine);
  const fr = await lane(hull({ exact: true }, cube([10, 10, 2]), translate([2, 2, 8], cube([6, 6, 2]))));
  check(`hull({ exact: true }) of two boxes is an exact frustum (${Math.round(fr.ms)} ms)`, fr.engine === "exact", `${fr.engine} ${fr.fallback || ""}`);
  const rb = await lane(difference(hull({ exact: true }, corner(6, 6), corner(74, 6), corner(6, 44), corner(74, 44)),
    translate([40, 25, -1], cylinder({ r: 3, h: 32, $fn: 32 }))));
  check(`...an exact rounded-box hull takes a hole and stays exact (${Math.round(rb.ms)} ms)`, rb.engine === "exact", `${rb.engine} ${rb.fallback || ""}`);
  const { sphere } = dsl;
  const sp = await lane(hull({ exact: true }, sphere({ r: 5, $fn: 24 }), translate([20, 0, 0], sphere({ r: 3, $fn: 24 }))));
  check(`...but over round pieces (too many faces) it stays a fast mesh (${Math.round(sp.ms)} ms)`, sp.engine === "mesh" && sp.ms < 2000, sp.engine);
  const fb = await lane(fillet({ r: 6, edges: "z" }, cube([80, 50, 30])));
  check(`fillet({ r, edges: "z" }, cube) is exact (${Math.round(fb.ms)} ms)`, fb.engine === "exact", `${fb.engine} ${fb.fallback || ""}`);
  check("roundedGrow() is a mesh", (await lane(roundedGrow(2, cube([20, 20, 20])))).engine === "mesh");
  const cup = polygon([[0, 0], [30, 0], [35, 60], [32, 60], [27, 3], [0, 3]]);
  const axisHole = translate([0, 0, -1], cylinder({ r: 4, h: 5, $fn: 32 }));
  const rv = await lane(difference(revolve(360, cup), axisHole));
  check("a hole down a revolve() axis falls back", rv.engine === "js", rv.engine);
  const cn = await lane(difference(cylinder({ r1: 30, r2: 35, h: 60, $fn: 96 }),
    translate([0, 0, 3], cylinder({ r1: 27, r2: 32.3, h: 58, $fn: 96 })), axisHole));
  check(`...the same cup from cones is exact (${Math.round(cn.ms)} ms)`, cn.engine === "exact", `${cn.engine} ${cn.fallback || ""}`);
  check("a cylinder with $fn 6 is an exact hex prism", (await lane(cylinder({ r: 10, h: 5, $fn: 6 }))).engine === "exact");
  check("...a cone with $fn 6 is refused", (await lane(cylinder({ r1: 10, r2: 8, h: 5, $fn: 6 }))).engine === "js");
  // the tapered polygon, cut one block at a time
  const n = 8, k = 1 / Math.cos(Math.PI / n);
  const ngon = (a) => polygon(Array.from({ length: n }, (_, i) => {
    const t = Math.PI / n - Math.PI / 2 + 2 * Math.PI * i / n;
    return [a * k * Math.cos(t), a * k * Math.sin(t)];
  }));
  const blocks = Array.from({ length: n }, (_, i) => rotate([0, 0, -90 + 360 * i / n],
    translate([45, 0, 0], rotate([0, Math.atan(10 / 90) * 180 / Math.PI, 0], translate([0, -400, -400], cube([400, 800, 800]))))));
  const prism = linearExtrude({ h: 90 }, ngon(56));
  let one = prism;
  for (const b of blocks) one = difference(one, b);
  const seq = await lane(one);
  check(`an octagon taper, one cut at a time, is exact (${Math.round(seq.ms)} ms)`, seq.engine === "exact", `${seq.engine} ${seq.fallback || ""}`);
}

console.log("\nhull({ exact: true }) and minkowski() build exact twins of the same shape\n");
{
  const { cube, cylinder, sphere, hull, translate, minkowski, union } = dsl;
  const { toSTL } = await import("../index.js");
  const volume = (r) => {
    const v = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    let s = 0;
    for (let i = 0; i < v.length; i += 3) {
      const [a, b, c] = v.slice(i, i + 3);
      s += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    return Math.abs(s);
  };
  const bounds = (r) => {
    const p = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    return [0, 1, 2].map((k) => [Math.min(...p.map((q) => q[k])), Math.max(...p.map((q) => q[k]))]);
  };
  // the twin against the mesh hull of the same pieces: exact, and within half a percent
  // (the mesh is faceted, the twin is not)
  const twin = async (label, kids) => {
    const a = await build(hull({ exact: true }, ...kids)), b = await build(hull(...kids));
    const va = volume(a), vb = volume(b);
    check(`${label}: exact, same shape (${(100 * (va - vb) / vb).toFixed(2)}%)`, a.engine === "exact" && Math.abs(va - vb) / vb < 0.005,
      `${a.engine} ${va.toFixed(0)} vs ${vb.toFixed(0)}`);
  };
  const c = (x, y, r = 6, h = 20) => translate([x, y, 0], cylinder({ r, h, $fn: 96 }));
  await twin("rounded box from 4 corner cylinders", [c(6, 6), c(54, 6), c(6, 34), c(54, 34)]);
  await twin("stadium from 2 cylinders", [c(0, 0, 4, 6), c(40, 0, 4, 6)]);
  await twin("hexagon of 6 cylinders", Array.from({ length: 6 }, (_, i) => c(30 * Math.cos(i * Math.PI / 3), 30 * Math.sin(i * Math.PI / 3), 4, 10)));
  await twin("taper from two coaxial discs", [cylinder({ r: 20, h: 0.01, $fn: 96 }), translate([0, 0, 30], cylinder({ r: 10, h: 0.01, $fn: 96 }))]);
  await twin("lathe from a base and a neck", [cylinder({ r: 20, h: 5, $fn: 96 }), translate([0, 0, 25], cylinder({ r: 8, h: 10, $fn: 96 }))]);
  await twin("box rounded all round from 8 spheres",
    [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => translate([i * 40, j * 30, k * 20], sphere({ r: 4, $fn: 48 }))))));
  await twin("capsule from 2 equal spheres", [sphere({ r: 5, $fn: 48 }), translate([50, 20, 10], sphere({ r: 5, $fn: 48 }))]);
  const mixed = await build(hull({ exact: true }, c(0, 0), translate([20, 0, 30], sphere({ r: 5 }))));
  check("...a mix it cannot prove (a cylinder and a sphere) stays the mesh hull", mixed.engine === "mesh", mixed.engine);

  const mk = await build(minkowski(cube([20, 20, 20]), sphere({ r: 3 })));
  const mb = bounds(mk);
  check("minkowski(box, sphere) is exact, grown 3 mm both ways", mk.engine === "exact" && Math.abs(mb[0][0] + 3) < 0.05 && Math.abs(mb[0][1] - 23) < 0.05,
    `${mk.engine} ${JSON.stringify(mb[0])}`);
  const mc = await build(minkowski(cube([40, 30, 10]), cylinder({ r: 4, h: 2, $fn: 96 })));
  const mcb = bounds(mc);
  check("minkowski(box, upright cylinder) is exact: wider by r, taller by h", mc.engine === "exact"
    && Math.abs(mcb[0][1] - mcb[0][0] - 48) < 0.05 && Math.abs(mcb[2][1] - mcb[2][0] - 12) < 0.05, `${mc.engine} ${JSON.stringify(mcb)}`);
  const ms = await build(minkowski(cylinder({ r: 10, h: 20, $fn: 96 }), sphere({ r: 2 })));
  check("minkowski(cylinder, sphere) is exact (the mesh offset refused this one)", ms.engine === "exact", ms.engine);
  check("minkowski(mm, part) is still roundedGrow", minkowski(2, cube([10, 10, 10])).kind === "roundify");
  check("...and a part with no exact twin keeps the ball's radius", minkowski(union(cube(10), sphere({ r: 7 })), sphere({ r: 2 })).kind === "roundify");
}

console.log("\nthe translators write exact B-rep\n");
{
  const { fromOpenSCAD } = await import("../src/openscad.js");
  const jscad = await import("../src/jscad.js");
  const { fromPython } = await import("../src/py123d.js");
  const scad = async (label, src) => {
    const r = await lane(fromOpenSCAD(src));
    check(`OpenSCAD ${label}: exact`, r.engine === "exact", `${r.engine} ${r.fallback || ""}`);
  };
  await scad("rounded box as hull() of corner cylinders", `$fn = 64; W = 60; D = 40; R = 6;
    hull() for (x = [R, W - R], y = [R, D - R]) translate([x, y, 0]) cylinder(r = R, h = 20);`);
  await scad("rounded box as 8 corner spheres", `hull() for (x = [0, 40], y = [0, 30], z = [0, 20]) translate([x, y, z]) sphere(r = 4);`);
  await scad("taper as hull() of two discs", `hull() { cylinder(r = 20, h = 0.01); translate([0, 0, 30]) cylinder(r = 10, h = 0.01); }`);
  await scad("minkowski() { cube(); sphere(); }", `minkowski() { cube([20, 20, 10], center = true); sphere(r = 2); }`);
  await scad("minkowski() { cube(); cylinder(); }", `minkowski() { cube([40, 30, 10]); cylinder(r = 4, h = 2); }`);
  await scad("linear_extrude() offset(r) square()", `linear_extrude(4) offset(r = 3) square([30, 20]);`);
  await scad("a rectangular rotate_extrude ring (a washer)", `rotate_extrude() translate([10, 0]) square([5, 3]);`);
  await scad("a rounded box with a hole cut in it", `$fn = 64; difference() {
      hull() for (x = [5, 55], y = [5, 35]) translate([x, y, 0]) cylinder(r = 5, h = 12);
      translate([30, 20, -1]) cylinder(r = 4, h = 14); }`);
  const ring = await build(fromOpenSCAD(`rotate_extrude() translate([10, 0]) square([5, 3]);`));
  check("...and the washer is the right size", ring.engine === "exact");
  const js = async (label, shape) => {
    const r = await lane(shape);
    check(`JSCAD ${label}: exact`, r.engine === "exact", `${r.engine} ${r.fallback || ""}`);
  };
  await js("roundedCuboid", jscad.roundedCuboid({ size: [40, 30, 20], roundRadius: 3 }));
  await js("roundedCylinder", jscad.roundedCylinder({ height: 20, radius: 10, roundRadius: 2 }));
  await js("extrudeLinear(roundedRectangle)", jscad.extrudeLinear({ height: 5 }, jscad.roundedRectangle({ size: [40, 20], roundRadius: 4 })));
  await js("hull of corner cylinders", jscad.hull(...[[-20, -10], [20, -10], [-20, 10], [20, 10]].map(([x, y]) =>
    jscad.translate([x, y, 0], jscad.cylinder({ radius: 4, height: 10, segments: 64 })))));
  const py = await lane(fromPython(`from build123d import *
with BuildPart() as p:
    with BuildSketch():
        RectangleRounded(40, 20, 4)
    extrude(amount=5)
`).shape);
  check("build123d RectangleRounded extruded: exact", py.engine === "exact", `${py.engine} ${py.fallback || ""}`);
}

console.log("\nthe advice speaks the code's own language\n");
{
  const { codeLanguage, EXACT_SCAD, EXACT_JSCAD } = await import("../src/exactlane.js");
  const scadSrc = "$fn = 64;\nhull() { sphere(r = 5); translate([20, 0, 0]) cylinder(r = 3, h = 9); }";
  check("OpenSCAD is told apart from BREPcode", codeLanguage(scadSrc) === "openscad" && codeLanguage("return hull(a, b);") === "brepcode");
  const sa = exactAdvice({ engine: "mesh" }, scadSrc);
  check("an OpenSCAD hull on the mesh lane is answered in OpenSCAD", sa?.lang === "openscad" && /Keep it in OpenSCAD/.test(sa.ask)
    && sa.ask.includes(EXACT_SCAD) && !/fillet\(\{ r, edges/.test(sa.ask), sa?.ask?.slice(0, 200));
  const jsSrc = "const { hull } = require('@jscad/modeling').hulls\nconst main = () => hull(a, b)\nmodule.exports = { main }";
  const ja = exactAdvice({ engine: "mesh" }, jsSrc);
  check("...and a JSCAD module in JSCAD", ja?.lang === "jscad" && /Keep it a JSCAD module/.test(ja.ask) && ja.ask.includes(EXACT_JSCAD), ja?.ask?.slice(0, 200));
  const rv = exactAdvice({ engine: "js", fallbackKind: "refused", fallback: "boolean SUBTRACT failed: the result SELF-INTERSECTS" },
    "difference() { rotate_extrude() square([10, 20]); cylinder(r = 3, h = 30); }");
  check("...including a refused rotate_extrude axis hole", rv?.lang === "openscad" && /rotate_extrude\(\) axis/.test(rv.ask), rv?.ask?.slice(0, 200));
  const seam = exactAdvice({ engine: "js", fallbackKind: "refused", fallback: "F F2: fillet failed: fillet_edges: 2 of the 3 selected edges were blended" },
    "return fillet({ r: 2 }, cylinder({ r: 10, h: 20 }));");
  check("a fillet refused over a cylinder's seam: one rim at a time", /edges: "top"/.test(seam?.ask || ""), seam?.ask?.slice(0, 200));
}

console.log("\nthe shelf parts the AI reaches for are exact\n");
{
  for (const name of ["shell", "lidLip", "vent", "slot", "labelPlate", "pcbPlate", "handle"]) {
    const r = await lane(dsl[name]());
    check(`${name}() builds exact`, r.engine === "exact", `${r.engine} ${r.fallback || ""}`);
  }
}

console.log("\nthe rules reach the AI\n");
{
  const chat = await import("../viewer/chatbot.js");
  check("the in-app harness carries the exact-first core", chat.DEFAULT_HARNESS.includes(EXACT_CORE));
  check("...an exact-pass request carries the full rules",
    exactAdvice({ engine: "mesh" }, "return hull(a, b);")?.ask.includes(EXACT_RULES));
  check("...and no longer teaches hull() for a rounded box",
    !/rounded (vertical corners|box)[^.\n]{0,40}→ hull\(\)|A rounded box is hull\(\)/.test(chat.DEFAULT_HARNESS));
  check("the polish pass prefers exact verbs", /EXACT FIRST/.test(chat.POLISH_HARNESS));
  check("...a rounded-off cylinder is two rim fillets, not one whole-cylinder fillet (refused)",
    /fillet\(\{ r, edges: "bottom" \}, fillet\(\{ r, edges: "top" \}, cylinder/.test(chat.DEFAULT_HARNESS)
    && !/rounded-off cylinder is fillet\(\{radius: r\}, cylinder/.test(chat.DEFAULT_HARNESS));
  check("...hull({exact:true}) is taught as the exact hull", /hull\(\{exact:true\}\)/.test(chat.DEFAULT_HARNESS) && /hull\(\{ exact: true \}, \.\.\.\) stays exact/.test(EXACT_CORE));
  check("...and the OpenSCAD notes say which forms translate exact", /EXACT IN OPENSCAD TOO/.test(chat.DEFAULT_HARNESS));
  const sys = chat.composeSystem({});
  check("...and the composed system prompt sends them", sys.includes("EXACT B-REP FIRST"));
  const page = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  check("the chat loop asks exactAdvice() after an AI build", /exactAdvice\(r\.engine, src, lessonPrompt\)/.test(page) && /await exactFollowUp\(r, fence\[1\]\.trim\(\), house\)/.test(page));
  check("...keeps the working model when the rewrite fails", /The exact rewrite didn't build, so I put the working version back/.test(page));
  check("...and only once per request", /exactTried = false;\s+\/\/ \.\.\.and a fresh exact pass/.test(page));
  check("the agent bridge reports the lane and the advice in get_state",
    /engine: lastEngine \? \{ lane: lastEngine\.engine/.test(page) && /exactAdvice\(lastEngine, code\.value\)/.test(page));
  const mcp = readFileSync(new URL("../agent/mcp-server.mjs", import.meta.url), "utf8");
  check("...and tells outside agents to build exact", /9\. Build EXACT\./.test(mcp) && /get_state\.exactAdvice/.test(mcp));
  const doc = readFileSync(new URL("../LLM_PROMPT.md", import.meta.url), "utf8");
  check("LLM_PROMPT.md puts exact first", /\*\*Exact B-rep first\.\*\*/.test(doc));
}

console.log("\nno recipe teaches a mesh where exact would do\n");
{
  const dir = new URL("../viewer/recipes/", import.meta.url);
  const bad = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const text = readFileSync(new URL(f, dir), "utf8");
    if (/rounded box is a hull|roundedGrow\(\d+, cube\(\[[^\]]*\]\)\)\s*(gives|rounds)/i.test(text)) bad.push(f);
  }
  check("rounded boxes are fillets in every recipe", !bad.length, bad.join(", "));
  const { matchRecipes } = await import("../viewer/recipes.js");
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));
  const tags = (text, code) => matchRecipes(text, manifest, code ? { code } : {}).matched.map((r) => r.tag);
  check("#exact is in the manifest", manifest.recipes.some((r) => r.tag === "exact"));
  for (const q of ["a box with rounded corners 80 x 50", "a tapered hex planter", "export a STEP file"]) {
    check(`"${q}" brings in #exact`, tags(q).includes("exact"), tags(q).join(", "));
  }
  check("...and so does editing a model that uses hull()", tags("make it taller", "return hull(a, b);").includes("exact"));
  check("a plain cube does not", !tags("a 20mm cube").includes("exact"));
  const vessel = readFileSync(new URL("vessel.md", dir), "utf8");
  check("the vessel recipe builds round pots from cones", /Round pots: cones/.test(vessel));
  check("...and tapered polygons one cut at a time", /ONE `difference\(\)` AT A TIME/.test(vessel));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
