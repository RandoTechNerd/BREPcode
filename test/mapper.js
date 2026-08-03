import { mapTraceToSites, primitiveSites } from "../viewer/assist.js";
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
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
