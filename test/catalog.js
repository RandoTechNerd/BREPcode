// The model catalog: every family must build, print, and be found.
//
// A catalog entry fails people in three quiet ways, and this file looks for
// each of them:
//
//   it is never FOUND   its own example requests route to some other family,
//                       or to nothing, so it may as well not exist;
//   it is found WRONGLY a request meant for the rule engine ("a box with a
//                       cone on top") gets hijacked into a storage box;
//   it does not PRINT   it builds, but floats off the bed, leaks (not
//                       watertight), or hangs a ledge in mid-air that needs
//                       support the family promised it would not.
//
// Quick mode (npm test) builds every family at its defaults. --full also
// builds every named thing and every numeric param at its min and at its max,
// one at a time, which is how a body that only works at the default is caught.
// --category desk limits it to one folder, for work on that category alone.
//
//   node test/catalog.js                  quick, all categories
//   node test/catalog.js --full           everything
//   node test/catalog.js --full --category kitchen

import * as dsl from "../src/dsl.js";
import { build, toSTL } from "../index.js";
import { FAMILIES, SPECS, CATEGORIES, allThings, catalogStats, specFor } from "../src/catalog/index.js";
import { validateFamily, resolveParams, familyCode } from "../src/catalog/schema.js";
import { matchRequest, refineRequest, rankFamilies, THRESHOLD, normalise } from "../src/catalog/match.js";
import { weldTriangles, inspectMesh } from "../src/meshhealth.js";
import { findParams } from "../viewer/params.js";

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const CAT = args.includes("--category") ? args[args.indexOf("--category") + 1] : null;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const vocab = Object.fromEntries(Object.entries(dsl).filter(([k, v]) => typeof v === "function" && k !== "compile"));
const dslNames = Object.keys(vocab);
// The viewer passes the vocabulary in as arguments, so a body that declares a
// DSL word is a SyntaxError there. Run it the same way here, no shadowing help.
const evalCode = (src) => new Function(...dslNames, `"use strict";\n${src}`)(...dslNames.map((n) => vocab[n]));

const families = FAMILIES.filter((f) => !CAT || f.category === CAT);

// ---------------------------------------------------------------- shape

console.log(`\ncatalog: ${JSON.stringify(catalogStats())}\n`);
console.log("every family is well formed\n");
{
  const ids = new Set();
  for (const f of FAMILIES) {
    check(`${f.id}: unique id`, !ids.has(f.id));
    ids.add(f.id);
  }
  for (const f of families) {
    const bad = validateFamily(f, { dslNames });
    check(`${f.id}: valid`, !bad.length, bad.join("; "));
    const declared = [...f.body.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    const clash = declared.filter((n) => dslNames.includes(n));
    check(`${f.id}: body declares no DSL word`, !clash.length, clash.join(", "));
    // the params panel must show exactly the family's dials: a stray
    // \`const N = 48\` in the body turns into a meaningless slider
    const found = findParams(familyCode(f, resolveParams(f).values)).map((p) => p.name);
    const extra = found.filter((n) => !f.params[n]), missing = Object.keys(f.params).filter((n) => !found.includes(n));
    check(`${f.id}: sliders are exactly its params`, !extra.length && !missing.length, `extra ${extra} missing ${missing}`);
    for (const t of f.things || []) {
      if (t.spec) check(`${f.id}: thing "${t.names[0]}" names a real spec`, !!specFor(t.spec), t.spec);
    }
  }
  const specIds = new Set();
  for (const s of SPECS) {
    check(`spec ${s.id}: unique, named, measured`, !specIds.has(s.id) && s.names?.length && s.dims && Object.values(s.dims).every((v) => v > 0));
    specIds.add(s.id);
  }
}

// ---------------------------------------------------------------- routing

console.log("\nrequests reach the right family\n");
for (const f of families) {
  for (const ex of f.examples) {
    const m = matchRequest(ex);
    check(`"${ex}" -> ${f.id}`, m?.familyId === f.id, m ? `got ${m.familyId} (${m.score})` : "no match");
  }
  for (const t of f.things || []) {
    for (const n of t.names) {
      const m = matchRequest(`make me a ${n}`);
      const ok = m?.familyId === f.id;
      // a thing's name may legitimately belong to another family's thing too,
      // but then it must at least land on a family that HAS that name
      check(`thing "${n}" -> ${f.id}`, ok, m ? `got ${m.familyId}${m.thing ? ` / ${m.thing.names[0]}` : ""}` : "no match");
    }
  }
}

console.log("\nthe rule engine keeps its own requests\n");
for (const q of ["Make a box with a cone on top", "plate 40 with a hole radius 5", "two cubes side by side",
  "a donut", "sphere r 10", "make it 50mm wide", "round the edges", "a cylinder 20 tall", "box 30",
  "smoother", "flip it upside down", "a holder", "make a bracket", "picture frame 4x6", "hook"]) {
  const m = matchRequest(q);
  check(`"${q}" -> nothing`, !m, m ? `hijacked by ${m.familyId} (${m.score})` : "");
}

if (!CAT) {
  console.log("\nspecs and numbers\n");
  const m1 = matchRequest("phone stand for iphone 15 pro max at 70 degrees");
  check("the longest phone alias wins", m1?.spec?.id === "iphone-15-pro-max", m1?.spec?.id);
  check("...and sizes the slot from it", Math.abs(m1?.values.deviceT - (8.25 + 3)) < 0.01, m1?.values.deviceT);
  check("70 degrees goes to the angle", m1?.values.angle === 70, m1?.values.angle);
  check("iPhone15 with no space still found", matchRequest("phone holder for my iPhone15")?.spec?.id === "iphone-15");
  const m2 = matchRequest("make me a hook for yoga roll");
  check("a hook for a yoga roll is the yoga mat hook", m2?.familyId === "cradle-hook" && m2?.title === "Yoga mat hook", `${m2?.familyId} / ${m2?.title}`);
  check("...sized to a rolled mat", m2?.values.itemD === 150, m2?.values.itemD);
  const m3 = matchRequest("storage box 120 x 80 x 50 with 2 dividers");
  check("W x D x H fills width, depth, height", m3?.values.width === 120 && m3?.values.depth === 80 && m3?.values.height === 50, JSON.stringify(m3?.values));
  check("...and the count goes to the dividers", m3?.values.divX === 2, m3?.values.divX);
  const m4 = matchRequest("a 6 inch wide pen holder");
  check("inches convert", m4?.values.diameter === 152.4, m4?.values.diameter);
  const m5 = matchRequest("cable clip for 5 cables with screw holes");
  check("a count and a choice from one sentence", m5?.values.count === 5 && m5?.values.mount === "screw", JSON.stringify(m5?.values));
  const m6 = matchRequest("storage box without a lid");
  check("'without a lid' beats 'lid'", m6?.values.lid === "no", m6?.values.lid);
  const big = matchRequest("wall shelf 900mm long");
  check("an out-of-range size is clamped and reported", big?.values.length === 300 && big.clamped.length === 1, JSON.stringify(big?.clamped));
  const ph = matchRequest("I want a phone holder");
  check("an unsized phone stand asks which phone", !!ph?.question);
  const r1 = refineRequest(ph.memo, "for a pixel 9");
  check("a follow-up naming a phone re-sizes it", r1?.spec?.id === "pixel-9" && Math.abs(r1.values.deviceT - 11.5) < 0.01, JSON.stringify(r1?.values));
  const r2 = refineRequest(r1.memo, "wider");
  check("'wider' widens", r2?.values.width > r1.values.width, `${r1?.values.width} -> ${r2?.values.width}`);
  check("...and keeps the phone", r2?.spec?.id === "pixel-9");
  check("a follow-up with nothing in it is left alone", refineRequest(r2.memo, "thanks!") === null);
  check("normalise splits letters from digits", normalise("Galaxy S24+") === "galaxy s 24 plus", normalise("Galaxy S24+"));
}

// ---------------------------------------------------------------- building

async function measure(code) {
  const t0 = performance.now();
  const r = await build(evalCode(code));
  const ms = performance.now() - t0;
  const stl = toSTL(r, "s");
  const coords = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => m.slice(1).map(Number));
  if (!coords.length) return { empty: true };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < coords.length; i++) { const a = i % 3; lo[a] = Math.min(lo[a], coords[i]); hi[a] = Math.max(hi[a], coords[i]); }
  // bed contact and overhang: down-facing area on the bed, and down-facing
  // area steeper than 45 degrees anywhere above it
  let bed = 0, hang = 0, total = 0;
  for (let o = 0; o + 8 < coords.length; o += 9) {
    const a = coords.slice(o, o + 3), b = coords.slice(o + 3, o + 6), c = coords.slice(o + 6, o + 9);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n);
    if (!len) continue;
    const area = len / 2, nz = n[2] / len;
    total += area;
    const onBed = Math.max(a[2], b[2], c[2]) - lo[2] < 0.05;
    if (nz < -0.99 && onBed) bed += area;
    else if (nz < -0.72 && !onBed) hang += area;
  }
  const health = inspectMesh(weldTriangles(coords, { places: 3 }));
  return { ms, size: [0, 1, 2].map((i) => hi[i] - lo[i]), zMin: lo[2], bed, hang, total, health, tris: coords.length / 9 };
}

const BED = 256;                 // a common printer bed: a default should fit it
async function buildCase(label, f, values, { strict = true } = {}) {
  let m;
  try { m = await measure(familyCode(f, values)); }
  catch (e) { check(`${label}: builds`, false, e.message); return; }
  if (m.empty) { check(`${label}: builds`, false, "empty"); return; }
  check(`${label}: builds (${Math.round(m.ms)} ms, ${m.tris} tris)`, m.ms < 15000, `${Math.round(m.ms)} ms`);
  check(`${label}: sits on the bed`, Math.abs(m.zMin) < 0.05, `zMin ${m.zMin}`);
  check(`${label}: has a real footprint`, m.bed > 20, `${m.bed.toFixed(0)} mm2 on the bed`);
  if (strict) check(`${label}: fits a ${BED} mm bed`, m.size.every((s) => s <= BED + 0.5), m.size.map((s) => s.toFixed(0)).join(" x "));
  // a bridge (a flat ceiling) is not an overhang, and f.bridges says how much
  // of one the design means to have
  const allowance = Math.max(80, 0.02 * m.total) + (f.bridgeArea ? f.bridgeArea(values) : 0);
  check(`${label}: no supports needed`, m.hang <= allowance, `${m.hang.toFixed(0)} mm2 overhang (allowed ${allowance.toFixed(0)})`);
  check(`${label}: watertight`, m.health.openEdges === 0 && m.health.overusedEdges === 0,
    `${m.health.openEdges} open, ${m.health.overusedEdges} overused`);
}

console.log(`\nevery family builds and prints${FULL ? " (full: things and extremes)" : ""}\n`);
for (const f of families) {
  await buildCase(`${f.id} defaults`, f, resolveParams(f).values);
  if (!FULL) continue;
  for (const t of f.things || []) {
    const spec = t.spec ? specFor(t.spec) : null;
    const { values } = resolveParams(f, t.params, spec && f.fromSpec ? f.fromSpec(spec) : null);
    await buildCase(`${f.id} / ${t.names[0]}`, f, values, { strict: false });
  }
  for (const [k, p] of Object.entries(f.params)) {
    if (p.unit === "choice") {
      for (const c of p.choices) if (c !== p.default) await buildCase(`${f.id} ${k}=${c}`, f, resolveParams(f, { [k]: c }).values, { strict: false });
      continue;
    }
    for (const v of [p.min, p.max]) await buildCase(`${f.id} ${k}=${v}`, f, resolveParams(f, { [k]: v }).values, { strict: false });
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
