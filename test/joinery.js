// Splitting a model into printable parts, and the joinery that registers them.
//
// The thing worth testing is not that a hole is round. It is that the SAME call
// bores both halves of a joint, that a pin actually passes through the result,
// and that a glue-in part drops into its socket with a gap. Those are the three
// ways a split model fails on the bench while looking perfect on screen.

import { build, toSTL } from "../index.js";
import * as dsl from "../index.js";
import {
  dowelPin, dowelHole, dowelsOnPlane, dowelPinsFor, glueSocket, onPlate,
  JOIN_FIT, JOINERY,
} from "../src/joinery.js";
import { fromOpenSCAD, getWarnings } from "../src/openscad.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function measure(shape) {
  const stl = toSTL(await build(shape), "j");
  const v = [...stl.matchAll(/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g)]
    .map((m) => m.slice(1).map(Number));
  if (!v.length) return { vol: 0, empty: true, x: 0, y: 0, z: 0, verts: [] };
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2])
      + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  const span = (i) => Math.max(...v.map((p) => p[i])) - Math.min(...v.map((p) => p[i]));
  return {
    vol: Math.abs(vol), x: span(0), y: span(1), z: span(2),
    zMin: Math.min(...v.map((p) => p[2])), zMax: Math.max(...v.map((p) => p[2])),
    verts: v,
  };
}

console.log("\nfits are on DIAMETER\n");
{
  // Halving this by accident is a dowel you cannot press in; doubling it is one
  // that falls out. It bit src/parts.js once already.
  const d = 4;
  const hole = await measure(dowelHole({ d, depth: 6, fit: "snug", lead: 0 }));
  check("a snug hole is the pin plus the fit, ACROSS",
    near(hole.x, d + JOIN_FIT.snug, 0.08), `${hole.x.toFixed(3)} vs ${d + JOIN_FIT.snug}`);
  const slip = await measure(dowelHole({ d, depth: 6, fit: "slip", lead: 0 }));
  check("...and a slip fit is looser by the difference of the two",
    near(slip.x - hole.x, JOIN_FIT.slip - JOIN_FIT.snug, 0.06),
    `${(slip.x - hole.x).toFixed(3)}`);
  check("every named fit is a real allowance",
    Object.values(JOIN_FIT).every((v) => v > 0 && v < 1));
  let threw = "";
  try { dowelHole({ d: 4, fit: "tight" }); } catch (e) { threw = e.message; }
  check("an unknown fit name is refused, and lists the real ones",
    /no such fit "tight"/.test(threw) && /snug/.test(threw), threw);
}

console.log("\nthe pin enters the hole\n");
{
  // A printed pin has an elephant foot on layer one and a lip on the last. Both
  // stop it entering a hole cut to size, which is why it is chamfered.
  const pin = await measure(dowelPin({ d: 4, len: 12 }));
  check("a pin is its stated length", near(pin.z, 12, 0.02), `${pin.z.toFixed(2)}`);
  check("...and its stated diameter at the waist", near(pin.x, 4, 0.05), `${pin.x.toFixed(2)}`);
  const ends = pin.verts.filter((p) => p[2] < 0.01 || p[2] > 11.99);
  const endR = Math.max(...ends.map((p) => Math.hypot(p[0], p[1])));
  check("...and narrower at BOTH ends, so it starts into the hole",
    endR < 1.95, `ends are ${(endR * 2).toFixed(2)} across vs 4.00 at the waist`);
  let threw = "";
  try { dowelPin({ d: 4, len: 1, chamfer: 0.8 }); } catch (e) { threw = e.message; }
  check("chamfers that do not fit the pin are refused", /do not fit/.test(threw), threw);

  // The real question: does it go in?
  const clash = await measure(dsl.intersection(
    dsl.difference(dsl.translate([-10, -10, 0], dsl.cube([20, 20, 8])),
      dowelHole({ d: 4, depth: 6 })),
    dowelPin({ d: 4, len: 5.5 }),
  ));
  check("a pin dropped into its own hole meets no material",
    clash.vol < 0.5, `${clash.vol.toFixed(2)} mm3 of interference`);
}

console.log("\nONE call bores BOTH halves\n");
{
  // The whole reason this module exists. Placing the holes twice by hand is how
  // a seam ends up a few tenths out with nothing to show why.
  const AT = [[0, 0], [9, -5], [9, 5]];
  const joint = dowelsOnPlane({ p: [0, 0, 10], ang: 0, at: AT, d: 4, depth: 5 });
  const spans = await measure(joint);
  // depth each way from the face. Each bore also poke 0.5 PAST the face so the
  // boolean has no coincident plane to argue about, but that poke lands inside
  // the opposite bore, so it never shows in the extent.
  check("the hole set bores a full depth to EITHER side of the face",
    near(spans.zMin, 10 - 5, 0.1) && near(spans.zMax, 10 + 5, 0.1),
    `z ${spans.zMin.toFixed(1)}..${spans.zMax.toFixed(1)} about a face at 10`);

  const lower = dsl.translate([-15, -15, 0], dsl.cube([40, 30, 10]));
  const upper = dsl.translate([-15, -15, 10], dsl.cube([40, 30, 10]));
  const a = await measure(dsl.difference(lower, joint));
  const b = await measure(dsl.difference(upper, joint));
  const solid = await measure(lower);
  check("the lower half really lost material", solid.vol - a.vol > 100,
    `${(solid.vol - a.vol).toFixed(0)} mm3`);
  check("...and so did the upper, from the SAME call", solid.vol - b.vol > 100,
    `${(solid.vol - b.vol).toFixed(0)} mm3`);

  // And a pin passes through the assembled pair -- which is what "the same bore"
  // actually means, as opposed to two bores that happen to be near each other.
  const pinIn = dsl.translate([0, 0, 10 - 4.5], dsl.cylinder({ r: 2, h: 9, $fn: 32 }));
  const clash = await measure(dsl.intersection(
    dsl.union(dsl.difference(lower, joint), dsl.difference(upper, joint)), pinIn));
  check("a pin passes through both halves at once",
    clash.vol < 0.5, `${clash.vol.toFixed(2)} mm3 in the way`);

  const pins = await measure(dowelPinsFor({ at: AT, d: 4, depth: 5 }));
  check("there is one pin laid out per hole", pins.verts.length > 0 && pins.x > 4 * 3,
    `${pins.x.toFixed(1)}mm of pins laid out`);
  check("...each shorter than the two bores together, so the faces close",
    near(pins.z, 9, 0.05), `${pins.z.toFixed(2)}mm pin into 2 x 5mm of bore`);
  let threw = "";
  try { dowelsOnPlane({ at: [] }); } catch (e) { threw = e.message; }
  check("a joint with no positions is refused", /at least one position/.test(threw), threw);
}

console.log("\na gap all round, at the size a gap actually is\n");
{
  // A glue gap is a few TENTHS. The old route through roundedGrow could not do
  // that size at all: a 10mm box at r=0.15 came back non-manifold when it came
  // back, and one probe ran past ten minutes. So the sizes tested here are the
  // real ones, not comfortable ones.
  for (const [what, part, gap] of [
    ["a box", dsl.translate([-5, -5, 0], dsl.cube([10, 10, 4])), 0.3],
    ["a cylinder", dsl.cylinder({ r: 5, h: 4, $fn: 48 }), 0.3],
    ["a sphere", dsl.sphere({ r: 6, $fn: 32 }), 0.15],
  ]) {
    const a = await measure(part), b = await measure(dsl.clearance(gap, part));
    check(`${what} grows by the gap ACROSS`, near(b.x - a.x, gap, 0.02),
      `${(b.x - a.x).toFixed(3)} vs ${gap}`);
    check(`...and by the same amount THROUGH`, near(b.z - a.z, gap, 0.02),
      `${(b.z - a.z).toFixed(3)} vs ${gap}`);
  }
  // Off the origin: the gap must land around the part, not drag it home.
  const away = dsl.translate([40, -25, 8], dsl.cube([10, 10, 10]));
  const g = await measure(dsl.clearance(0.4, away));
  const mid = (v) => v.verts.reduce((s, p) => s + p[0], 0) / v.verts.length;
  check("a part far from the origin is grown IN PLACE",
    near(mid(g), mid(await measure(away)), 0.05), `centre moved to ${mid(g).toFixed(2)}`);
  let threw = "";
  try { dsl.clearance("wide", dsl.cube([5, 5, 5])); } catch (e) { threw = e.message; }
  check("clearance() needs a number", /needs a gap in mm/.test(threw), threw);
}

console.log("\na glue-in part drops into its socket\n");
{
  const part = dsl.translate([-5, -5, 0], dsl.cube([10, 10, 4]));
  const socket = glueSocket(part, { gap: 0.4 });
  const p = await measure(part), sk = await measure(socket);
  check("the socket is bigger than the part it takes", sk.vol > p.vol,
    `${sk.vol.toFixed(0)} vs ${p.vol.toFixed(0)} mm3`);
  check("...by the glue gap, on diameter", near(sk.x - p.x, 0.4, 0.03),
    `${(sk.x - p.x).toFixed(2)}mm wider`);
  const body = dsl.translate([-10, -10, -6], dsl.cube([20, 20, 10]));
  const clash = await measure(dsl.intersection(dsl.difference(body, socket), part));
  check("the part meets nothing once the socket is cut",
    clash.vol < 0.5, `${clash.vol.toFixed(2)} mm3`);
  // ...and it is not so loose that it rattles: the pocket should be the part
  // plus a glue line, not the part plus a millimetre.
  const slop = await measure(dsl.difference(socket, part));
  check("...and the pocket is only a glue line bigger, not a rattle",
    slop.vol < 0.25 * p.vol, `${slop.vol.toFixed(1)} mm3 of gap around ${p.vol.toFixed(0)} of part`);
  let threw = "";
  try { glueSocket({ not: "a shape" }); } catch (e) { threw = e.message; }
  check("glueSocket refuses something that is not a shape", /takes a shape/.test(threw), threw);
}

console.log("\nlaid out to print\n");
{
  // Parts of DIFFERENT sizes, which is the whole point: a fixed pitch either
  // overlaps the wide one or wastes bed around the narrow one. 10 + 6 + 40 + 6
  // + 4 = 66 across, and no two parts sharing any bed.
  const wide = dsl.cube([40, 10, 5]);
  const thin = dsl.cube([4, 10, 5]);
  const small = dsl.cube([10, 10, 5]);
  const laid = await measure(onPlate([small, wide, thin], { gap: 6 }));
  check("parts are MEASURED and butted up, not put on a guessed pitch",
    near(laid.x, 66, 0.1), `${laid.x.toFixed(1)}mm across, expected 66`);
  const each = 10 * 10 * 5 + 40 * 10 * 5 + 4 * 10 * 5;
  check("...and none of them overlap, so the volume is all three",
    near(laid.vol, each, 1), `${laid.vol.toFixed(0)} vs ${each} mm3`);
  // Something modelled in mid-air must come down to the bed, or it slices as a
  // support tower rather than a part.
  const flying = dsl.translate([0, 0, 25], dsl.cube([10, 10, 5]));
  const landed = await measure(onPlate([flying]));
  check("a part modelled in mid-air is stood on the bed",
    near(landed.zMin, 0, 0.01), `sits at z=${landed.zMin.toFixed(2)}`);
  check("...unless you say otherwise",
    near((await measure(onPlate([flying], { onBed: false }))).zMin, 25, 0.01));
  const a = dsl.cube([10, 10, 10]);
  const forced = await measure(onPlate([a, a, a], { spacing: 30 }));
  check("a pitch can still be forced", near(forced.x, 70, 0.1), `${forced.x.toFixed(1)}mm`);
  let threw = "";
  try { onPlate([]); } catch (e) { threw = e.message; }
  check("an empty plate is refused", /at least one part/.test(threw), threw);
  const fns = { dowelPin, dowelHole, dowelsOnPlane, glueSocket, onPlate };
  check("every catalogue entry names a real function",
    JOINERY.every((j) => typeof fns[j.id] === "function"),
    JOINERY.map((j) => j.id).join(", "));
}

console.log("\nreachable from OpenSCAD too\n");
{
  // This one is a REGRESSION GUARD, not a nicety. Before the DSL bridge,
  // dowelsOnPlane() inside an OpenSCAD difference() warned once and contributed
  // nothing -- producing a part with no holes in it that looked perfectly fine.
  // A model that is wrong in a way you cannot see is worse than one that errors.
  const vol = async (src) => (await measure(fromOpenSCAD(src))).vol;
  const solid = await vol("cube([30,30,10], center=true);");
  const drilled = await vol(
    "difference() { cube([30,30,10], center=true); "
    + "dowelsOnPlane(p=[0,0,0], ang=0, at=[[0,0],[8,0],[-8,0]], d=4, depth=5); }");
  check("dowelsOnPlane() drills for real from OpenSCAD",
    solid - drilled > 100, `${(solid - drilled).toFixed(0)} mm3 removed`);
  check("...and does not warn that it was skipped",
    !getWarnings().some((w) => /dowelsOnPlane/.test(w)), getWarnings().join(" | "));
  for (const [label, src] of [
    ["a shelf part", "vent(w = 20, h = 10);"],
    ["a gear", "gear(module = 2, teeth = 14, h = 5);"],
    ["a fastener pocket", 'bearingPocket("608");'],
  ]) {
    let ok = false, why = "";
    try { ok = (await vol(src)) > 1; } catch (e) { why = e.message; }
    check(`${label} is callable from OpenSCAD as well`, ok, why);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
