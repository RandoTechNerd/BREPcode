import { mapTraceToSites, primitiveSites, drillParts } from "../viewer/assist.js";
let pass=0, fail=0;
const ck=(l,ok,d="")=>{ ok?(pass++,console.log("  PASS  "+l)):(fail++,console.log("  FAIL  "+l+(d?"  — "+d:""))); };

console.log("\nprimitiveSites: hull/freeform swallow their children\n");
ck("hull is one site", primitiveSites("hull(cylinder({r:5,h:2}), cylinder({r:9,h:2}))").length===1);
ck("its code is IMPORT3D", primitiveSites("hull(cube([1,1,1]))")[0].codes[0]==="IMPORT3D");
ck("freeform is one site", primitiveSites("freeform([[0,0,0],[1,0,0],[0,1,0],[0,0,1]])").length===1);
ck("a cube beside a hull still counts",
   primitiveSites("group(hull(cube([1,1,1]),cube([2,2,2])), cube([3,3,3]))").length===2);

console.log("\ndrill() is a site, and leaving it out broke more than drills\n");
{
  // A drill is a cylinder under an xform, so it reaches the trace as one P.CY.
  // While it was not a recognised call site, the trace held a P.CY the source
  // could not account for — which did NOT merely make the hole unclickable.
  // The counts disagreed, so the mapper dropped the whole P.CY code, and every
  // ordinary cylinder in the same document lost its handles too.
  ck("a drill is one site",
     primitiveSites("difference(cube([9,9,9]), drill([1,2,3],[0,0,1],{d:4}))").length === 2);
  ck("...and it is a cylinder to the trace",
     primitiveSites("drill([1,2,3],[0,0,1],{d:4})")[0].codes.includes("P.CY"));

  const text = "difference(union(cube([60,40,20]), cylinder({d:12,h:14})), drill([45,20,20],[0,0,1],{d:8}))";
  const trace = [{ id: "cu", code: "P.CU" }, { id: "cy", code: "P.CY" }, { id: "dr", code: "P.CY" }];
  const m = mapTraceToSites(trace, text);
  ck("a model with BOTH a cylinder and a drill maps all three", m && m.cu && m.cy && m.dr,
     JSON.stringify(m && Object.keys(m)));
  ck("...the drill maps to the drill call",
     m && text.slice(m.dr.start, m.dr.start + 5) === "drill", m && text.slice(m.dr.start, m.dr.start + 8));
  ck("...and the cylinder to the cylinder call",
     m && text.slice(m.cy.start, m.cy.start + 8) === "cylinder", m && text.slice(m.cy.start, m.cy.start + 8));
}

console.log("\ndrillParts: the numbers a handle is allowed to rewrite\n");
{
  const parts = (t) => drillParts(t, primitiveSites(t)[0]);
  const at = (t, s) => t.slice(s.start, s.end);

  const a = "drill([30, 20, 20], [0, 0, 1], { d: 8, depth: 15 })";
  const pa = parts(a);
  ck("point and direction are told apart",
     JSON.stringify(pa.point) === "[30,20,20]" && JSON.stringify(pa.dir) === "[0,0,1]");
  ck("the spans cover exactly the vectors",
     at(a, pa.pointSpan) === "[30, 20, 20]" && at(a, pa.dirSpan) === "[0, 0, 1]",
     `${at(a, pa.pointSpan)} / ${at(a, pa.dirSpan)}`);
  ck("width and depth land on their own digits",
     at(a, pa.diaSpan) === "8" && at(a, pa.depthSpan) === "15");

  // r is a RADIUS. Treating it as a diameter would double the hole the first
  // time anyone dragged the rim, silently, on a part about to be printed.
  const pr = parts("drill([1,2,3],[0,0,1],{r:2.5})");
  ck("r is read as a radius and reported as a diameter", pr.dia === 5 && pr.fromRadius === true,
     `${pr.dia} fromRadius=${pr.fromRadius}`);
  ck("...and its span still points at the r digits, not a made-up one",
     "drill([1,2,3],[0,0,1],{r:2.5})".slice(pr.diaSpan.start, pr.diaSpan.end) === "2.5");

  ck("dia is accepted as a spelling of d", parts("drill([1,2,3],[0,0,1],{dia:6})").dia === 6);
  // Absent options mean drill()'s own defaults, and a null span is how the
  // caller knows it must ADD the option rather than rewrite one.
  const pd = parts("drill([1,2,3],[0,0,1])");
  ck("a bare drill reports the defaults", pd.dia === 4 && pd.depth === 12);
  ck("...with no spans, so the handle knows to write the option in",
     pd.diaSpan === null && pd.depthSpan === null);
  ck("through is noticed", parts("drill([1,2,3],[0,0,1],{d:4,through:true})").through === true);
  ck("...and is false when absent", parts("drill([1,2,3],[0,0,1],{d:4})").through === false);
  // Anything that is not a drill must return null rather than a half-parse,
  // or a handle would rewrite characters in the middle of another call.
  const cyl = "cylinder({ r: 4, h: 10 })";
  ck("a cylinder is not mistaken for a drill", drillParts(cyl, primitiveSites(cyl)[0]) === null);
  ck("a drill missing its direction is refused",
     drillParts("drill([1,2,3])", primitiveSites("drill([1,2,3])")[0]) === null);
}

console.log("\nmapTraceToSites: exact match maps everything\n");
{
  const text="difference(cube([10,10,10]), cylinder({r:2,h:20}))";
  const trace=[{id:"a",code:"P.CU"},{id:"b",code:"P.CY"}];
  const m=mapTraceToSites(trace,text);
  ck("both mapped", m && m.a && m.b);
  ck("cube maps to the cube call", m && text.slice(m.a.start,m.a.start+4)==="cube");
}

console.log("\nmapTraceToSites: degrades per shape instead of globally\n");
{
  // a loop emits 3 cubes from 1 source cube: cube counts disagree, cylinder agrees
  const text="union(cube([1,1,1]), cylinder({r:2,h:3}))";
  const trace=[{id:"c1",code:"P.CU"},{id:"c2",code:"P.CU"},{id:"c3",code:"P.CU"},{id:"cy",code:"P.CY"}];
  const m=mapTraceToSites(trace,text);
  ck("does not return null", !!m);
  ck("ambiguous cubes stay unmapped", m && !m.c1 && !m.c2 && !m.c3);
  ck("the unambiguous cylinder still maps", m && !!m.cy);
  ck("cylinder points at the cylinder call", m && text.slice(m.cy.start,m.cy.start+8)==="cylinder");
}
{
  // freeform beside a cube: previously killed the entire map
  const text="group(freeform([[0,0,0],[1,0,0],[0,1,0],[0,0,1]]), cube([3,3,3]))";
  const trace=[{id:"ff",code:"IMPORT3D"},{id:"cu",code:"P.CU"}];
  const m=mapTraceToSites(trace,text);
  ck("freeform maps", m && m.ff && text.slice(m.ff.start,m.ff.start+8)==="freeform");
  ck("the neighbouring cube still maps", m && m.cu && text.slice(m.cu.start,m.cu.start+4)==="cube");
}
{
  const m=mapTraceToSites([{id:"x",code:"P.T"}],"cube([1,1,1])");
  ck("nothing mappable still returns null", m===null);
}
console.log("\na verb that swallows its children must say so\n");
{
  // The drill lesson, again. roundedGrow/minkowski build their child in a
  // throwaway history and re-import the result, so the child NEVER reaches the
  // trace. Leaving them out of the swallow list made the child a phantom site:
  // the sequences went out of step, the offset result itself was unclickable,
  // and every later shape was at risk of losing its handles too.
  const src = "union(\n  roundedGrow(3, cube([20,20,20])),\n  translate([40,0,0], sphere({r:8})),\n)";
  const kinds = primitiveSites(src).map((s) => s.kind);
  ck("the offset is the site, not the cube inside it",
    JSON.stringify(kinds) === JSON.stringify(["roundedGrow", "sphere"]), JSON.stringify(kinds));

  const trace = [{ id: "I1", code: "IMPORT3D" }, { id: "S1", code: "P.S" }];
  const map = mapTraceToSites(trace, src) || {};
  ck("...so both shapes map", !!map.I1 && !!map.S1, JSON.stringify(Object.keys(map)));
  ck("...and the offset result is clickable", map.I1?.kind === "roundedGrow", map.I1?.kind);

  for (const [word, code] of [["minkowski", "P.CY"], ["roundedShrink", "P.CY"]]) {
    const s2 = `union(\n  ${word}(2, cube([10,10,10])),\n  cylinder({r:5,h:9}),\n)`;
    const m2 = mapTraceToSites([{ id: "I1", code: "IMPORT3D" }, { id: "C1", code }], s2) || {};
    ck(`${word}() swallows its child too`, !!m2.I1 && !!m2.C1,
      JSON.stringify(primitiveSites(s2).map((x) => x.kind)));
  }
}


console.log("\ntube() is one site; its path helpers are not sites at all\n");
{
  // A swept tube is generated and imported as one mesh, so it reaches the trace
  // as a single IMPORT3D. helix() and circlePath() return plain point ARRAYS
  // and never build anything, so counting either of them as a call site would
  // invent a shape the trace has no entry for — the same desync that once cost
  // every cylinder in the document its handles.
  ck("a tube is one site", primitiveSites("tube([[0,0,0],[9,0,0]], { r: 2 })").length === 1);
  ck("...mapping to one IMPORT3D",
     primitiveSites("tube([[0,0,0],[9,0,0]], { r: 2 })")[0].codes[0] === "IMPORT3D");
  ck("helix() is not a site",
     primitiveSites("tube(helix({ r: 12, turns: 3 }), { r: 2 })").length === 1);
  ck("circlePath() is not a site",
     primitiveSites("tube(circlePath({ r: 20 }), { r: 3, closed: true })").length === 1);

  // The real document shape: tubes interleaved with ordinary primitives. The
  // kinds must come out in source order, one per built solid, or the mapping
  // slides and the wrong shape lights up when you click.
  const mixed = primitiveSites(`group(
    tube([[0,0,0],[9,0,0]], { r: 1.6 }),
    cube([10, 10, 10]),
    tube(helix({ r: 14, turns: 4 }), { r: 1.8 }),
    cylinder({ r: 5, h: 20 }),
    tube(circlePath({ r: 22 }), { r: 3, closed: true }),
  )`);
  ck("five shapes, five sites", mixed.length === 5, `${mixed.length}`);
  ck("...in source order with the right kinds",
     mixed.map((s) => s.kind).join(",") === "tube,cube,tube,cylinder,tube",
     mixed.map((s) => s.kind).join(","));
  ck("...and the trace codes line up",
     mixed.map((s) => s.codes[0]).join(",") === "IMPORT3D,P.CU,IMPORT3D,P.CY,IMPORT3D",
     mixed.map((s) => s.codes[0]).join(","));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
