// Inline keyword swapper, number scrubbing, and the mesh→code mapping helpers.

import {
  swapTarget, wordAt, numberAt, optionAt, optionTarget, primitiveSites, mapTraceToSites,
  convertPrimitiveCall, findScaleTargets, rewriteNumbers, findResizeTarget,
} from "../viewer/assist.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

console.log("\nswapTarget\n");
check("cube -> cylinder", swapTarget("cube", 1) === "cylinder");
check("cube <- torus (wraps)", swapTarget("cube", -1) === "torus");
check("difference -> intersection", swapTarget("difference", 1) === "intersection");
check("translate -> rotate", swapTarget("translate", 1) === "rotate");
check("non-swappable returns null", swapTarget("banana", 1) === null);

console.log("\nwordAt / numberAt\n");
const T = "cube([30, 30, 12])";
check("wordAt inside word", wordAt(T, 2)?.word === "cube");
check("wordAt at boundary", wordAt(T, 4)?.word === "cube");
check("numberAt inside", numberAt(T, 7)?.value === 30);
check("numberAt right after", numberAt(T, 8)?.value === 30);
check("numberAt second 30", numberAt(T, 11)?.value === 30 && numberAt(T, 11).start === 10);
check("numberAt on decimal", numberAt("r: 2.5,", 6)?.value === 2.5);
check("numberAt on negative", numberAt("[-1, 0]", 2)?.value === -1);
check("numberAt misses words", numberAt(T, 2) === null);

console.log("\nprimitiveSites\n");
{
  const src = "difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cylinder({ r: 8, h: 14 })),\n)";
  const sites = primitiveSites(src);
  check("finds both sites in order", sites.length === 2 && sites[0].kind === "cube" && sites[1].kind === "cylinder",
    JSON.stringify(sites.map((s) => s.kind)));
  check("site spans the whole call",
    src.slice(sites[1].start, sites[1].end) === "cylinder({ r: 8, h: 14 })",
    src.slice(sites[1].start, sites[1].end));
}

console.log("\nmapTraceToSites\n");
{
  const src = "difference(cube([10,10,10]), cylinder({ r: 3, h: 12 }))";
  const good = mapTraceToSites([{ id: "P.CU1", code: "P.CU" }, { id: "P.CY2", code: "P.CY" }], src);
  check("maps matching sequences", good?.["P.CY2"]?.kind === "cylinder");
  check("cone code accepted for cylinder site",
    mapTraceToSites([{ id: "P.CU1", code: "P.CU" }, { id: "P.CO2", code: "P.CO" }], src) !== null);
  // A mismatch no longer kills the whole document: shapes whose code appears
  // the same number of times on both sides still map, the rest go dark. What
  // must never happen is a WRONG mapping, so each case checks where the
  // survivors point, not just that something came back.
  {
    // one cube in the trace, one cube in the source: still unambiguous
    const partial = mapTraceToSites([{ id: "P.CU1", code: "P.CU" }], src);
    check("shorter trace still maps its cube", partial?.["P.CU1"]?.kind === "cube");
  }
  {
    // a sphere the source never mentions: it stays unmapped, the cylinder lives
    const partial = mapTraceToSites(
      [{ id: "P.S1", code: "P.S" }, { id: "P.CY2", code: "P.CY" }], src);
    check("unknown sphere stays unmapped", partial && !partial["P.S1"]);
    check("the cylinder beside it still maps", partial?.["P.CY2"]?.kind === "cylinder");
  }
  {
    // two cubes in the trace but one in the source (a loop): ambiguous, so
    // NEITHER may map — mapping both to the same call would let a drag on one
    // silently rewrite the other
    const loop = mapTraceToSites(
      [{ id: "a", code: "P.CU" }, { id: "b", code: "P.CU" }, { id: "c", code: "P.CY" }], src);
    check("ambiguous cubes map to nothing", loop && !loop.a && !loop.b);
    check("the unambiguous cylinder survives", loop?.c?.kind === "cylinder");
  }
}

console.log("\nconvertPrimitiveCall\n");
{
  const src = "cylinder({ r: 8, h: 14, $fn: 64 })";
  const site = primitiveSites(src)[0];
  check("cylinder -> sphere keeps r",
    convertPrimitiveCall(src, site, "sphere") === "sphere({ r: 8, $fn: 48 })",
    convertPrimitiveCall(src, site, "sphere"));
  check("cylinder -> cube uses 2r and h",
    convertPrimitiveCall(src, site, "cube") === "cube([16, 16, 14])",
    convertPrimitiveCall(src, site, "cube"));
}
{
  const src = "cube([30, 20, 12])";
  const site = primitiveSites(src)[0];
  check("cube -> cylinder uses x/2 and z",
    convertPrimitiveCall(src, site, "cylinder") === "cylinder({ r: 15, h: 12, $fn: 48 })",
    convertPrimitiveCall(src, site, "cylinder"));
  check("cube -> cone tapers to 0",
    convertPrimitiveCall(src, site, "cone") === "cone({ r1: 15, r2: 0, h: 12, $fn: 48 })",
    convertPrimitiveCall(src, site, "cone"));
}
{
  const src = "sphere({ r: 10 })";
  const site = primitiveSites(src)[0];
  check("sphere -> cube is the bounding cube",
    convertPrimitiveCall(src, site, "cube") === "cube([20, 20, 20])",
    convertPrimitiveCall(src, site, "cube"));
}

console.log("\nfindScaleTargets / rewriteNumbers (corner handles)\n");
{
  const src = "cylinder({ r: 8, h: 14, $fn: 64 })";
  const site = primitiveSites(src)[0];
  const t = findScaleTargets(src, site);
  check("cylinder scales r and h only", t.length === 2 && t.map(x => x.value).join(",") === "8,14",
    JSON.stringify(t.map(x => x.value)));
  const out = rewriteNumbers(src, t, (v) => v * 1.5);
  check("$fn is never scaled", out === "cylinder({ r: 12, h: 21, $fn: 64 })", out);
}
{
  const src = "cube([30, 30, 12])";
  const site = primitiveSites(src)[0];
  const out = rewriteNumbers(src, findScaleTargets(src, site), (v) => v * 2);
  check("cube scales all three dims", out === "cube([60, 60, 24])", out);
}
{
  const src = "torus({ r: 14, tube: 4, $fn: 48 })";
  const site = primitiveSites(src)[0];
  check("torus scale targets r + tube", findScaleTargets(src, site).length === 2);
  const side = findResizeTarget(src, site, 0);
  const top = findResizeTarget(src, site, 2);
  check("torus face handles: side=r, top=tube", side?.value === 14 && top?.value === 4,
    JSON.stringify([side?.value, top?.value]));
}
{
  const src = "sphere({ r: 10, $fn: 48 })";
  const site = primitiveSites(src)[0];
  const out = rewriteNumbers(src, findScaleTargets(src, site), (v) => v * 0.011);
  check("scale floor prevents degenerate sizes", out.includes("r: 0.2"), out);
}

console.log("\noptionAt / optionTarget — Alt+Up/Down through word options\n");
{
  const tex = 'texture({ pattern: "knurl", depth: 0.6, faces: "sides" }, cube([30, 30, 12]))';
  const pat = optionAt(tex, tex.indexOf("knurl") + 2);
  check("finds the pattern the caret is in", pat?.value === "knurl" && pat.prop === "pattern");
  check("knurl -> fuzzy", optionTarget(pat, 1) === "fuzzy");
  check("knurl <- waffle (wraps)", optionTarget(pat, -1) === "waffle");
  check("cycling covers every pattern", pat.options.join() === "knurl,fuzzy,layers,bumps,waffle");

  const fc = optionAt(tex, tex.indexOf('"sides"') + 3);
  check("faces cycles too", fc?.prop === "faces" && optionTarget(fc, 1) === "top");

  // the span must include the quotes, or the replacement eats them
  check("span covers the quotes", tex.slice(pat.start, pat.end) === '"knurl"');
  check("quote character is kept", pat.quote === '"');
}
{
  // same property name, different call, different legal set: a fins() buttress
  // has to stand on a vertical wall, so it must not offer ±z or "wrap"
  const hm = 'heightmap({ map: "m", w: 8, h: 8, side: "+z" }, cube(10))';
  const fn = 'fins({ side: "+x", height: 4 }, cube(10))';
  check("heightmap side reaches wrap",
    optionAt(hm, hm.indexOf('"+z"') + 2).options.includes("wrap"));
  check("fins side stops at the four walls",
    optionAt(fn, fn.indexOf('"+x"') + 2).options.join() === "+x,-x,+y,-y");
  check("fins +x -> -x", optionTarget(optionAt(fn, fn.indexOf('"+x"') + 2), 1) === "-x");
}
{
  const im = 'importedMesh("part.stl", { repair: "BASIC" })';
  const r = optionAt(im, im.indexOf('"BASIC"') + 2);
  check("repair cycles the kernel's three levels", r?.options.join() === "NONE,BASIC,AGGRESSIVE");
  // a filename is a quoted string with no option list behind it — leave it be
  check("a plain string argument is not an option", optionAt(im, im.indexOf("part") + 1) === null);
  // ...and neither is an unknown property
  check("an unknown property is not an option",
    optionAt('foo({ colour: "red" })', 16) === null);
}
{
  check("a bare true flips to false",
    optionTarget(optionAt("cube(10, { center: true })", 20), 1) === "false");
  check("...and back again",
    optionTarget(optionAt("cube(10, { center: false })", 21), 1) === "true");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
