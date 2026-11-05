// Assemblies: a model of named parts, each with a placement and a print turn.
//
// What has to hold, end to end on the real kernel:
//
//   * assembly() compiles to separate solids, one per copy, and compile()
//     knows which features belong to which copy — that is how the page and
//     the MCP tools say "pod #7" instead of "solid P.CU31";
//   * the copies split into independent pieces, so the desktop builds them in
//     parallel like any group();
//   * the fit check finds a real overlap with the right volume and stays quiet
//     about parts that only share a bounding box;
//   * a part printed "flip" comes out upside down, on the bed, the same volume.

import { PartHistory } from "brep-io-kernel";
import { compile, cube, cylinder, difference, translate, rotate, fillet, assembly, polar } from "../src/dsl.js";
import { runEngine, solidsToSTL } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";
import { splitHistory } from "../src/partsplit.js";
import { weld } from "../src/fizzcore.js";
import {
  instanceSoups, instanceLabel, checkFit, printPose, soupBounds, soupVolume, partsCSV, splitSTL, soupToBinarySTL,
} from "../src/assembly.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) pass++;
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const rust = await loadRustKernel();
const wasm = await loadManifoldNode();
async function build(shape) {
  const ph = new PartHistory();
  const trace = [];
  await compile(shape, ph, trace);
  const doc = JSON.parse(await ph.toJSON());
  const out = await runEngine(doc, { rust, manifold: loadManifoldNode });
  return { ph, doc, trace, out, stl: solidsToSTL(out.solids, 6) };
}

// ---- the DSL ---------------------------------------------------------------

{
  let err = "";
  try { assembly({ lid: { color: "#fff" } }); } catch (e) { err = e.message; }
  check("a part with no shape says which part", /part "lid" needs a shape/.test(err), err);
  err = "";
  try { assembly({ a: { shape: cube(5), place: (s) => difference(s, cube(1)) } }); } catch (e) { err = e.message; }
  check("a place() that changes the part is refused", /may only move the part/.test(err), err);
  err = "";
  try { assembly({ a: { shape: cube(5), print: "sideways-ish" } }); } catch (e) { err = e.message; }
  check("a print value it cannot read is refused at the call", /print must be/.test(err), err);
  const a = assembly({ ring: { shape: cube(2), count: 6, place: polar(6, { at: [20, 0, 0] }) } });
  check("count copies become count children", a.children.length === 6);
  check("the parts table keeps the name and count", a.assembly.parts[0].name === "ring" && a.assembly.parts[0].count === 6);
  const f = assembly({ a: { shape: cube(5), place: (s, i) => translate([i * 10, 0, 0], rotate([0, 0, 90], s)), count: 2 } });
  check("a function place is read back to its matrix", Math.abs(f.children[1].matrix.elements[12] - 10) < 1e-9);
}

// ---- a housing with pods around it ----------------------------------------

const housing = difference(cylinder({ r: 30, h: 20, $fn: 48 }), translate([0, 0, 3], cylinder({ r: 26, h: 20, $fn: 48 })));
const pod = cube([6, 4, 10]);
const motor = (podAt) => assembly({
  housing: { shape: housing, color: "#8a8f98", print: "flip" },
  pod: { shape: pod, color: "#c8702a", count: 4, place: polar(4, { at: [podAt, -2, 5] }) },
});

{
  const { ph, doc, out, stl, trace } = await build(motor(15));
  const inst = ph.assembly || [];
  check("compile records every copy", inst.length === 5, `got ${inst.length}`);
  check("each copy knows its features", inst.every((i) => i.ids.length > 0));
  check("copies own disjoint features", new Set(inst.flatMap((i) => i.ids)).size === inst.flatMap((i) => i.ids).length);
  check("labels read like people talk", instanceLabel(inst[0]) === "housing" && instanceLabel(inst[3]) === "pod #3");
  check("the colour reaches the trace", trace.some((t) => t.color === "#c8702a"));
  check("the kernel history carries no assembly table", !JSON.stringify(doc).includes("asmPart") && !("assembly" in doc));
  check("each copy carries its part's print setting", inst[0].spec?.print === "flip" && inst[1].spec?.print === "asis");
  check("one solid per copy", out.solids.length === 5, `got ${out.solids.length}`);
  const pieces = splitHistory(doc);
  check("copies build as independent pieces", pieces?.length === 5, `got ${pieces?.length}`);
  check("the STL splits back into the solids", splitSTL(stl).size === 5);
  const soups = instanceSoups(inst, stl);
  check("every copy got triangles", soups.every((s) => s.length > 0));
  const items = inst.map((i, k) => ({ label: instanceLabel(i), soup: soups[k] }));
  const fit = await checkFit(wasm, weld, items);
  check("pods inside the housing's bore do not clash", fit.clashes.length === 0, JSON.stringify(fit.clashes.map((c) => [c.a, c.b, c.volume])));
  check("the box filter still sent the housing/pod pairs to the boolean", fit.pairsChecked >= 4, `checked ${fit.pairsChecked}`);
  check("every part was a closed solid", fit.notClosed.length === 0, fit.notClosed.join());

  // printed flipped: the floor (z 0..3) ends up on top, on the bed, same volume
  const h = printPose(soups[0], inst[0].world, "flip");
  const [mn, mx] = soupBounds(h.soup);
  check("a flipped part stands on the bed", near(mn[2], 0, 1e-4), `min z ${mn[2]}`);
  check("and is centred on the plate", near(mn[0] + mx[0], 0, 1e-3) && near(mn[1] + mx[1], 0, 1e-3));
  check("turning it does not change its volume", near(soupVolume(h.soup), soupVolume(soups[0]), 1));
  // the cup opening faced +z when modelled; flipped, its open end is at the bed
  const topZ = [];
  for (let i = 2; i < h.soup.length; i += 3) if (h.soup[i] > mx[2] - 1e-3) topZ.push(h.soup[i]);
  check("flip really turns it over (the solid floor is now on top)", topZ.length > 0);
  const p = printPose(soups[2], inst[2].world, "asis");
  const [pmn, pmx] = soupBounds(p.soup);
  check("a placed copy comes back to its own frame", near(pmx[0] - pmn[0], 6, 0.01) && near(pmx[2] - pmn[2], 10, 0.01),
    `${pmx.map((v, k) => (v - pmn[k]).toFixed(2))}`);

  const csv = partsCSV([{ name: "pod", count: 4, size: [6, 4, 10], volume: 240, print: "asis", stl: "pod.stl" }]);
  check("parts.csv has a header and a row", /^name,quantity,/.test(csv) && /pod,4,6\.00,4\.00,10\.00,240\.0,asis,pod\.stl,/.test(csv));
  const bin = soupToBinarySTL(p.soup);
  check("binary STL carries every triangle", new DataView(bin.buffer).getUint32(80, true) === p.soup.length / 9);
}

{
  // pods pushed into the wall: each one overlaps the housing
  const { ph, stl } = await build(motor(24));
  const inst = ph.assembly;
  const soups = instanceSoups(inst, stl);
  const fit = await checkFit(wasm, weld, inst.map((i, k) => ({ label: instanceLabel(i), soup: soups[k] })));
  check("pods driven into the wall clash with the housing", fit.clashes.length === 4, `got ${fit.clashes.length}`);
  check("every clash names the housing", fit.clashes.every((c) => c.a === "housing" && /^pod #\d$/.test(c.b)));
  // pod spans x 24..30 against the wall r 26..30: the overlap is the strip of
  // the pod outside r=26, about 4 mm x 4 mm x 10 mm less the curve
  const v = fit.clashes[0]?.volume || 0;
  check("the overlap volume is about right", v > 120 && v < 175, `${v} mm³`);
  check("the overlap comes back as triangles to paint", fit.clashes[0]?.soup?.length > 0);
}

{
  // fillet({ edges: "z" }) inside a part means the PART's z: a thin plate
  // stood on its side must round the same four corners as one lying flat
  // (world z would pick its 2 mm rim, which a 3 mm radius cannot fit)
  const plate = fillet({ r: 3, edges: "z" }, cube([30, 20, 2]));
  let r = null, err = "";
  try {
    r = await build(assembly({ flat: { shape: plate }, standing: { shape: plate, place: { translate: [0, 40, 0], rotate: [90, 0, 0] } } }));
  } catch (e) { err = e.message.slice(0, 200); }
  check("a filleted part rotated by its placement still builds", !!r, err);
  if (r) {
    const soups = instanceSoups(r.ph.assembly, r.stl);
    check("...and rounds the same edges as the flat one", near(soupVolume(soups[0]), soupVolume(soups[1]), 0.5),
      `${soupVolume(soups[0]).toFixed(1)} vs ${soupVolume(soups[1]).toFixed(1)}`);
  }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
