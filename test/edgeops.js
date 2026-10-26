// Fillet / chamfer / revolve — the kernel edge-rounding and lathe features
// surfaced through the DSL.

import {
  cube, cylinder, sphere, polygon, linearExtrude, fillet, chamfer, revolve,
  difference, union, translate, build, toSTL,
} from "../index.js";
import * as dsl from "../src/dsl.js";
import { familyById } from "../src/catalog/index.js";
import { familyCode, resolveParams } from "../src/catalog/schema.js";
import { sizeGuardVerdict, noopVerdict, opCode, unwrapRound } from "../viewer/chatbot.js";
// the DSL words a catalog body is run with, the way the viewer passes them
const DSL = Object.fromEntries(Object.entries(dsl).filter(([k, v]) => typeof v === "function" && k !== "compile"));

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
function facetsOf(r) { return (toSTL(r, "t").match(/facet normal/g) || []).length; }
function volumeOf(r) {
  const v = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}
function boundsOf(r) {
  const p = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const ax = (i) => [Math.min(...p.map((q) => q[i])), Math.max(...p.map((q) => q[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}

console.log("\nfillet / chamfer\n");
{
  const plain = facetsOf(await build(cube([20, 20, 20])));
  const rounded = facetsOf(await build(fillet(3, cube([20, 20, 20]))));
  check("fillet(3, cube) rounds every edge", rounded > plain + 50, `${plain} -> ${rounded}`);
  // rounding removes material from the corners, so volume drops a little
  const filVol = volumeOf(await build(fillet(3, cube([20, 20, 20]))));
  check("filleted cube volume < plain cube", filVol < 8000 && filVol > 7000, filVol.toFixed(0));
  const filB = boundsOf(await build(fillet(3, cube([20, 20, 20]))));
  check("filleted cube keeps its 20mm footprint",
    near(filB.x[1] - filB.x[0], 20, 0.2) && near(filB.z[1] - filB.z[0], 20, 0.2), JSON.stringify(filB));
}
{
  const rounded = facetsOf(await build(chamfer(3, cube([20, 20, 20]))));
  check("chamfer(3, cube) bevels every edge", rounded > 12 + 12, String(rounded));
}
{
  // number shorthand and options object agree
  const a = volumeOf(await build(fillet(2, cube([16, 16, 16]))));
  const b = volumeOf(await build(fillet({ r: 2 }, cube([16, 16, 16]))));
  check("fillet number vs {r:} match", near(a, b, 1), `${a.toFixed(0)} vs ${b.toFixed(0)}`);
}
{
  // fillet only the top face's edges → removes less material than rounding
  // every edge. Measured by volume, not facet count: the Rust kernel's
  // tessellator puts more triangles on 4 blended edges than the JS one puts on 12.
  const top = volumeOf(await build(fillet({ r: 3, faces: "top" }, cube([20, 20, 20]))));
  const all = volumeOf(await build(fillet({ r: 3 }, cube([20, 20, 20]))));
  check("fillet faces:'top' rounds a subset", top < 8000 - 1 && top > all + 1, `cube 8000 > top ${top.toFixed(1)} > all ${all.toFixed(1)}`);
}
{
  // fillet composes with booleans (target identity preserved): the hole should
  // remove ~one cylinder's worth of volume from the filleted block
  const blockVol = volumeOf(await build(fillet(3, cube([30, 30, 14]))));
  const cutVol = volumeOf(await build(difference(fillet(3, cube([30, 30, 14])), translate([15, 15, -1], cylinder({ r: 6, h: 16 })))));
  check("filleted solid still cuts with difference()", near(blockVol - cutVol, Math.PI * 36 * 14, 300),
    `removed ${(blockVol - cutVol).toFixed(0)}, expected ${(Math.PI * 36 * 14).toFixed(0)}`);
  // pieces: true (the chat's "round the edges" wrap) rounds each box and cuts
  // the hole after, so the hole rim is never filleted: same solid as above
  const part = translate([5, 0, 0], difference(cube([30, 30, 14]), translate([15, 15, -1], cylinder({ r: 6, h: 16 }))));
  const wrapped = await build(fillet({ r: 3, pieces: true }, part));
  check("fillet({ pieces: true }) cuts the hole after rounding", near(volumeOf(wrapped), cutVol, 5),
    `${volumeOf(wrapped).toFixed(0)} vs ${cutVol.toFixed(0)}`);
  check("...and stays on the exact kernel", wrapped.engine === "exact", wrapped.engine);
  // the catalog wall shelf (plate + board + triangle gussets + keyholes) used
  // to make the exact kernel refuse ("mixes convexity") and the fallback
  // grow it by r and mangle the keyholes
  const ws = familyById("wall-shelf");
  const shelf = new Function(...Object.keys(DSL), `"use strict";\n${familyCode(ws, resolveParams(ws).values)}`)(...Object.values(DSL));
  const plainShelf = boundsOf(await build(shelf));
  const roundShelf = await build(fillet({ r: 3, pieces: true }, shelf));
  const roundB = boundsOf(roundShelf);
  const sameSize = ["x", "y", "z"].every((k) => near(roundB[k][1] - roundB[k][0], plainShelf[k][1] - plainShelf[k][0], 0.05));
  check("...the wall shelf rounds exact and keeps its size", roundShelf.engine === "exact" && sameSize,
    `${roundShelf.engine} ${roundShelf.fallback || ""} ${JSON.stringify(roundB)}`);
  // The chat's size guard: the viewer builds the wrap, measures, and takes it
  // back when the part changed size. A family with no boxes in it (the light
  // clip) has the exact kernel refuse the all-over fillet and the fallback
  // grow it, so it must be refused; the wall shelf must pass untouched.
  const box3 = (b) => ({ min: [b.x[0], b.y[0], b.z[0]], max: [b.x[1], b.y[1], b.z[1]] });
  const runFamily = (id) => {
    const f = familyById(id);
    return new Function(...Object.keys(DSL), `"use strict";\n${familyCode(f, resolveParams(f).values)}`)(...Object.values(DSL));
  };
  check("size guard keeps the rounded wall shelf",
    sizeGuardVerdict(box3(plainShelf), box3(roundB), { op: "round", r: 3 }) === null);
  // the light clip (no boxes in it) used to be refused and grown 6 mm by the
  // fallback; its outside edges now round exact and it keeps its size
  const clip = runFamily("light-clip");
  const plainClip = boundsOf(await build(clip));
  const roundClip = await build(fillet({ r: 3, pieces: true }, clip));
  check("the light clip rounds exact and keeps its size", roundClip.engine === "exact"
    && sizeGuardVerdict(box3(plainClip), box3(boundsOf(roundClip)), { op: "round", r: 3 }) === null,
    `${roundClip.engine} ${JSON.stringify(boundsOf(roundClip))}`);
  // a part the fallback grew (the light clip's old 10 -> 16.17 mm) is refused
  const grown = { min: [0, 0, 0], max: [13.3, 25.4, 16.17] }, was = { min: [0, 0, 0], max: [13.3, 25.4, 10] };
  const v = sizeGuardVerdict(was, grown, { op: "round", r: 3 });
  check("size guard refuses a round that grew the part", v && v.grew && /doesn't take an all-over round/.test(v.reply)
    && v.chips.includes("chamfer the edges") && !/—/.test(v.reply), v?.reply);
  check("...a bevel refusal offers the AI, not another bevel",
    /bevel the specific edges/.test(sizeGuardVerdict(was, grown, { op: "bevel", r: 3 })?.reply || ""));
  check("...and a fallback that collapses the part is refused too",
    sizeGuardVerdict({ min: [0, 0, 0], max: [40, 20, 10] }, { min: [0, 0, 0], max: [40, 20, 3] }, { op: "round", r: 3 })?.grew === false);

  // edges: "convex" leaves the inside corner of an L out, so the exact kernel
  // takes it (an all-edges selection mixes convexity at that corner)
  const ell = () => linearExtrude({ h: 10 }, polygon([[0, 0], [30, 0], [30, 4], [4, 4], [4, 20], [0, 20]]));
  const ellR = await build(fillet({ r: 1.5, edges: "convex" }, ell()));
  check("fillet edges:'convex' rounds an L exact", ellR.engine === "exact" && volumeOf(ellR) < volumeOf(await build(ell())) - 10,
    `${ellR.engine} ${volumeOf(ellR).toFixed(0)}`);
  // the phone stand is an extruded side profile with 4 mm walls: the chat's
  // wrap used to be refused at every radius and come back unrounded from the
  // fallback; now its profile rounds on its outside edges, radius held under
  // half the wall
  const stand = runFamily("phone-stand");
  const plainStand = await build(stand);
  const roundStand = await build(fillet({ r: 3, pieces: true }, stand));
  check("the phone stand's chat round really rounds, exact", roundStand.engine === "exact"
    && volumeOf(roundStand) < volumeOf(plainStand) - 100,
    `${roundStand.engine} ${volumeOf(plainStand).toFixed(0)} -> ${volumeOf(roundStand).toFixed(0)}`);
  check("...and keeps its size", sizeGuardVerdict(box3(boundsOf(plainStand)), box3(boundsOf(roundStand)), { op: "round", r: 3 }) === null);
  // a design that returns early (the pen cup's one-compartment case) gets the
  // wrap on that return too, and "sharp corners" takes every one back off
  const pc = familyById("pen-cup"), pcCode = familyCode(pc, resolveParams(pc).values);
  const pcRound = opCode(pcCode, { kind: "round", r: 3 });
  check("the round wraps an early return too", /if \(compartments < 2\) return fillet\(/.test(pcRound)
    && unwrapRound(pcRound).trim() === pcCode.trim() && unwrapRound(pcCode) === null);
  // a round that built but changed nothing is called out, not claimed
  const nv = noopVerdict(106222, 106222, { op: "round", r: 3 });
  check("no-op round is reported honestly", nv && /couldn't round/.test(nv.reply) && !/—/.test(nv.reply)
    && noopVerdict(106222, 105562, { op: "round", r: 3 }) === null);
}
try {
  await build(fillet(0, cube([10, 10, 10])));
  check("fillet(0) errors", false, "no error");
} catch (e) { check("fillet(0) errors", /positive radius/.test(e.message), e.message.slice(0, 40)); }

console.log("\nrevolve (lathe)\n");
{
  // a rectangle profile touching x=0 -> a cylinder of revolution
  const r = await build(revolve(360, polygon([[0, 0], [6, 0], [6, 12], [0, 12]])));
  check("revolve rectangle -> cylinder volume", near(volumeOf(r), Math.PI * 36 * 12, 200), volumeOf(r).toFixed(0));
  const b = boundsOf(r);
  check("revolve stands up on Z (0..12)", near(b.z[0], 0, 0.3) && near(b.z[1], 12, 0.3), JSON.stringify(b.z));
  check("revolve radius 6 (x: -6..6)", near(b.x[0], -6, 0.3) && near(b.x[1], 6, 0.3), JSON.stringify(b.x));
}
{
  // partial angle
  const full = volumeOf(await build(revolve(360, polygon([[0, 0], [5, 0], [5, 10], [0, 10]]))));
  const half = volumeOf(await build(revolve(180, polygon([[0, 0], [5, 0], [5, 10], [0, 10]]))));
  check("revolve 180 is ~half of 360", near(half, full / 2, full * 0.08), `${half.toFixed(0)} vs ${(full / 2).toFixed(0)}`);
}
{
  // a vase-ish silhouette lofts to a valid solid, positioned by translate
  const r = await build(translate([10, 10, 0], revolve(360, polygon([[0, 0], [8, 0], [8, 4], [3, 10], [0, 10]]))));
  check("vase profile revolves + translates", volumeOf(r) > 100 && near(boundsOf(r).x[0], 10 - 8, 0.4), JSON.stringify(boundsOf(r).x));
}
{
  // a profile clear of the axis spins about a line on the axis beside it: a
  // ring (it used to be refused; the sketcher's revolves need it)
  const ring = volumeOf(await build(revolve(360, polygon([[2, 0], [6, 0], [6, 10], [2, 10]]))));
  check("a profile off the axis revolves into a ring", near(ring, Math.PI * (36 - 4) * 10, 30), ring.toFixed(0));
}
try {
  await build(revolve(360, polygon([[-2, 0], [6, 0], [6, 10], [-2, 10]])));
  check("a profile across the axis errors", false, "no error");
} catch (e) { check("a profile across the axis errors", /crosses its axis/.test(e.message), e.message.slice(0, 60)); }

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
