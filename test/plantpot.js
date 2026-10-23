// The plant pot family: round and polygon pots, drain holes, a drip tray.
//
// An AI asked for "a hex planter with drip holes and a drip tray" cut the
// floor away three times while saying it had fixed it, so this file checks
// the one thing that matters for a pot by measuring the mesh: the floor is
// there. The area on the bed must be the pot's footprint minus exactly the
// drain holes (plus the saucer's whole footprint), and the cavity's floor at
// z = floor must be the inner outline minus the same holes.
//
//   node test/plantpot.js

import * as dsl from "../src/dsl.js";
import { build, toSTL } from "../index.js";
import { FAMILIES } from "../src/catalog/index.js";
import { resolveParams, familyCode } from "../src/catalog/schema.js";
import { matchRequest } from "../src/catalog/match.js";
import { weldTriangles, inspectMesh } from "../src/meshhealth.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const vocab = Object.fromEntries(Object.entries(dsl).filter(([k, v]) => typeof v === "function" && k !== "compile"));
const names = Object.keys(vocab);
const evalCode = (src) => new Function(...names, `"use strict";\n${src}`)(...names.map((n) => vocab[n]));
const pot = FAMILIES.find((f) => f.id === "plant-pot");

console.log("\nrequests reach the right pot\n");
{
  const m = matchRequest("a hex planter with drip holes and a drip tray");
  check("hex planter with drip holes and a drip tray -> plant-pot", m?.familyId === "plant-pot", m?.familyId);
  check("...six sides", m?.values.sides === 6, m?.values.sides);
  check("...several drain holes", m?.values.holes > 1 && m?.values.drain > 0, `${m?.values.holes} x ${m?.values.drain}`);
  check("...and the drip tray", m?.values.saucer === "yes", m?.values.saucer);
  const o = matchRequest("an octagon planter 140 mm across with 4 drain holes and no drip tray");
  check("octagon: 8 sides, 140 across, 4 holes, no tray",
    o?.familyId === "plant-pot" && o.values.sides === 8 && o.values.topD === 140 && o.values.holes === 4 && o.values.saucer === "no", JSON.stringify(o?.values));
  for (const q of ["hexagonal pot", "hexagon planter", "square planter", "make me a hex pot"]) {
    const r = matchRequest(q);
    check(`"${q}" -> a polygon plant pot`, r?.familyId === "plant-pot" && r.values.sides >= 4, `${r?.familyId} ${r?.values?.sides}`);
  }
  const round = matchRequest("I want a plant pot");
  check("a plain plant pot is still round with one hole", round?.values.sides === 0 && round.values.holes === 1, JSON.stringify(round?.values));
}

// down-facing area on the bed, and up-facing area at z = zf
async function areas(values) {
  const t0 = performance.now();
  const r = await build(evalCode(familyCode(pot, values)));
  const ms = performance.now() - t0;
  const stl = toSTL(r, "s");
  const c = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => m.slice(1).map(Number));
  let bed = 0, floorUp = 0, zMin = Infinity;
  for (let i = 2; i < c.length; i += 3) zMin = Math.min(zMin, c[i]);
  for (let o = 0; o + 8 < c.length; o += 9) {
    const a = c.slice(o, o + 3), b = c.slice(o + 3, o + 6), d = c.slice(o + 6, o + 9);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n);
    if (!len) continue;
    const zs = [a[2], b[2], d[2]];
    if (n[2] / len < -0.99 && Math.max(...zs) < 0.01) bed += len / 2;
    if (n[2] / len > 0.99 && zs.every((z) => Math.abs(z - values.floor) < 0.01)) floorUp += len / 2;
  }
  const health = inspectMesh(weldTriangles(c, { places: 3 }));
  return { bed, floorUp, zMin, health, engine: r.engine, fallback: r.fallback, ms };
}

// the same arithmetic the body does, from the outside
const ngonArea = (n, apothem) => n * apothem * apothem * Math.tan(Math.PI / n);
const holeArea = (d) => 12 * (d / 2) ** 2 * Math.sin(2 * Math.PI / 24);   // a 24-sided hole
function expected(v) {
  const n = v.sides ? Math.min(12, Math.max(4, Math.round(v.sides))) : 0;
  const rt = v.topD / 2, rb = Math.min(v.bottomD, v.topD) / 2, rbi = rb - v.wall;
  const ring = v.holes > 1 ? 0.45 * rbi : 0;
  const hd = v.drain > 0 ? Math.min(v.drain, v.holes > 1 ? Math.min(0.7 * 2 * Math.PI * ring / v.holes, 2 * (rbi - ring - 2)) : rbi) : 0;
  const holes = hd > 0 ? v.holes * holeArea(hd) : 0;
  const area = (a) => (n ? ngonArea(n, a) : Math.PI * a * a);
  const tray = v.saucer === "yes" ? area(rb + 10) : 0;
  return { n, hd, bed: area(rb) - holes + tray, floorUp: area(rbi) - holes, rt };
}

console.log("\nthe floor is solid (measured)\n");
const cases = [
  ["hex planter, 6 holes, drip tray", { sides: 6, topD: 110, bottomD: 90, holes: 6, drain: 6 }],
  ["octagon, 4 holes, no tray", { sides: 8, topD: 120, bottomD: 95, holes: 4, drain: 7, saucer: "no" }],
  ["square, 8 holes, tray", { sides: 4, topD: 100, bottomD: 80, holes: 8, drain: 8 }],
  ["12 sides, one hole", { sides: 12, holes: 1 }],
  ["round default", {}],
  ["round, 5 holes", { holes: 5, drain: 6 }],
  ["small hex, 8 big holes asked", { sides: 6, topD: 40, bottomD: 30, holes: 8, drain: 30 }],
  ["straight hex, no rim", { sides: 6, topD: 100, bottomD: 100, rim: 0 }],
  ["2 sides asked = round", { sides: 2 }],
];
for (const [label, p] of cases) {
  const { values } = resolveParams(pot, p);
  const e = expected(values);
  let m;
  try { m = await areas(values); } catch (err) { check(`${label}: builds`, false, err.message); continue; }
  // every pot is plain exact solids (cones, prisms, flat cuts), so it must
  // stay on the Rust B-rep lane: a fallback to the JS kernel or a mesh lane
  // means a body change brought back a hull(), a lathe seam or a grazing cut
  if (!process.env.BREPSCRIPT_ENGINE) check(`${label}: exact B-rep, ${Math.round(m.ms)} ms`, m.engine === "exact" && m.ms < 3000, `${m.engine} ${m.fallback || ""}`);
  check(`${label}: sits on the bed`, Math.abs(m.zMin) < 0.05, m.zMin);
  check(`${label}: watertight`, m.health.openEdges === 0 && m.health.overusedEdges === 0, `${m.health.openEdges} open, ${m.health.overusedEdges} overused`);
  // round outlines are tessellated, so allow a couple of percent there
  const tol = e.n ? 0.005 : 0.03;
  check(`${label}: bed area = footprint - ${values.holes} hole(s)${values.saucer === "yes" ? " + tray" : ""} (${m.bed.toFixed(0)} vs ${e.bed.toFixed(0)} mm2)`,
    Math.abs(m.bed - e.bed) / e.bed < tol);
  check(`${label}: cavity floor at z=${values.floor} is whole (${m.floorUp.toFixed(0)} vs ${e.floorUp.toFixed(0)} mm2)`,
    Math.abs(m.floorUp - e.floorUp) / e.floorUp < tol);
  check(`${label}: holes are real holes (${e.hd.toFixed(1)} mm)`, values.drain === 0 || e.hd >= Math.min(values.drain, 3));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
