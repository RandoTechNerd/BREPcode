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

console.log("\nthe rules reach the AI\n");
{
  const chat = await import("../viewer/chatbot.js");
  check("the in-app harness carries the exact-first core", chat.DEFAULT_HARNESS.includes(EXACT_CORE));
  check("...an exact-pass request carries the full rules",
    exactAdvice({ engine: "mesh" }, "return hull(a, b);")?.ask.includes(EXACT_RULES));
  check("...and no longer teaches hull() for a rounded box",
    !/rounded (vertical corners|box)[^.\n]{0,40}→ hull\(\)|A rounded box is hull\(\)/.test(chat.DEFAULT_HARNESS));
  check("the polish pass prefers exact verbs", /EXACT FIRST/.test(chat.POLISH_HARNESS));
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
