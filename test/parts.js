// Standard hardware as callable parts.
//
// The point of this library is that nobody re-derives a number. So the test
// cannot check that the numbers are in a table — it has to BUILD the geometry
// and MEASURE it, because the failure that matters is a pocket whose table
// entry is right and whose shape came out wrong anyway.
//
// The hexagon is the one to watch. A nut is measured ACROSS FLATS, but a
// 6-sided cylinder is built from a radius, and the radius that gives the right
// across-flats is af/2/cos(30°) — not af/2. Using af/2 makes a pocket 13%
// too small, which is a nut that will not go in and a table that says it
// should. That is measured below rather than assumed.

import {
  BEARINGS, SCREWS, INSERTS, FIT, bearing, bearingPocket, screwHole,
  insertBore, nutPocket, magnetPocket, screw, nut, partsCatalog,
  bearingSpec, screwSpec, insertSpec,
} from "../src/parts.js";
import { difference, translate } from "../src/dsl.js";
import { readFileSync } from "node:fs";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

// Build it and measure the mesh — the only description that cannot lie.
async function measure(shape) {
  const stl = toSTL(await build(shape), "p");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  const ax = (i) => ({ min: Math.min(...v.map((p) => p[i])), max: Math.max(...v.map((p) => p[i])) });
  const [x, y, z] = [ax(0), ax(1), ax(2)];
  return {
    x: x.max - x.min, y: y.max - y.min, z: z.max - z.min,
    zMin: z.min, zMax: z.max,
    facets: (stl.match(/facet normal/g) || []).length,
  };
}
const near = (a, b, tol = 0.06) => Math.abs(a - b) <= tol;

console.log("\nthe tables say what the standards say\n");
{
  check("608 is the skate bearing everyone means",
    BEARINGS[608].bore === 8 && BEARINGS[608].od === 22 && BEARINGS[608].w === 7);
  check("M3 clearance is 3.4, not 3.2 (that is the CLOSE fit)",
    SCREWS.M3.clearance === 3.4 && SCREWS.M3.close === 3.2);
  check("M3 self-tap pilot is 2.7 (plastic), tap drill 2.5 (metal)",
    SCREWS.M3.pilot === 2.7 && SCREWS.M3.tapDrill === 2.5);
  check("an M3 nut is 5.5 across flats and 2.4 thick",
    SCREWS.M3.nutAF === 5.5 && SCREWS.M3.nutT === 2.4);
  check("an M3 socket head is 5.5 x 3", SCREWS.M3.socket.d === 5.5 && SCREWS.M3.socket.h === 3);
  check("an M3 heat-set insert is 4.0 across", INSERTS.M3.od === 4.0);
  // Every table row has to be complete, or a lookup succeeds and the geometry
  // comes out with an undefined in it — which builds, silently, as NaN.
  for (const [k, v] of Object.entries(SCREWS)) {
    check(`${k} has every field the functions read`,
      ["d", "clearance", "close", "pilot", "tapDrill", "nutAF", "nutT"].every((f) => Number.isFinite(v[f]))
        && Number.isFinite(v.socket?.d) && Number.isFinite(v.socket?.h)
        && Number.isFinite(v.button?.d) && Number.isFinite(v.flat?.d));
  }
  for (const [k, v] of Object.entries(BEARINGS)) {
    check(`${k} is a sane bearing`, v.od > v.bore && v.w > 0 && Number.isFinite(v.od));
  }
  // Clearance must always be bigger than the screw, and close must sit between.
  for (const [k, v] of Object.entries(SCREWS)) {
    check(`${k}: clearance > close > diameter > pilot > tap drill`,
      v.clearance > v.close && v.close > v.d && v.d > v.pilot && v.pilot > v.tapDrill, JSON.stringify(v));
  }
}

console.log("\nnames are forgiving, and a miss says what exists\n");
{
  check("M2.5 works written with the dot", insertSpec("M2.5").od === 3.5);
  check("...and lower case", screwSpec("m3").clearance === 3.4);
  check("a bearing number works as a number", bearingSpec(608).od === 22);
  check("...and as a string", bearingSpec("608").od === 22);
  let t = "";
  try { bearingSpec("609"); } catch (e) { t = e.message; }
  check("an unknown bearing lists the real ones", /608/.test(t) && /isn't in the table/.test(t), t);
  t = "";
  try { screwSpec("M7"); } catch (e) { t = e.message; }
  check("...and so does an unknown screw", /M6/.test(t), t);
  t = "";
  try { magnetPocket(0, 3); } catch (e) { t = e.message; }
  check("a magnet with no size is refused", /diameter and height/.test(t), t);
}

console.log("\nand the geometry measures what the table promised\n");
{
  const b = await measure(bearing("608"));
  check("bearing 608 is 22 across", near(b.x, 22) && near(b.y, 22), `${b.x.toFixed(2)} x ${b.y.toFixed(2)}`);
  check("...and 7 wide", near(b.z, 7), `${b.z.toFixed(2)}`);
  check("...and it is a ring, not a disc", b.facets > 100, `${b.facets}`);

  const p = await measure(bearingPocket("608"));
  check("the pocket is FIT bigger than the bearing, per side",
    near(p.x, 22 + FIT.bearingPress), `${p.x.toFixed(2)} vs ${22 + FIT.bearingPress}`);
  check("...and a touch deeper, so the face is not fighting the first layer",
    p.z > 7 && p.z < 7.6, `${p.z.toFixed(2)}`);
  // The pocket must be BIGGER than the part. Backwards here is a bearing that
  // will not go in, and nothing else would catch it.
  check("the pocket is bigger than the bearing, not smaller", p.x > b.x);

  const s = await measure(screwHole("M3", { depth: 12 }));
  check("an M3 clearance hole measures 3.4", near(s.x, 3.4), `${s.x.toFixed(2)}`);
  check("...and is cut downward from z=0, where the head goes",
    s.zMin < -11 && s.zMax <= 0.02, `z ${s.zMin.toFixed(2)}..${s.zMax.toFixed(2)}`);
  const st = await measure(screwHole("M3", { depth: 12, tap: true }));
  check("...and the self-tapping hole is 2.7, the PLASTIC pilot", near(st.x, 2.7), `${st.x.toFixed(2)}`);

  const sock = await measure(screwHole("M3", { depth: 12, head: "socket" }));
  check("a socket head recess is head + 0.6", near(sock.x, 5.5 + FIT.counterboreD, 0.1), `${sock.x.toFixed(2)}`);
  const csk = await measure(screwHole("M3", { depth: 12, head: "flat" }));
  check("a countersink opens to the head diameter", near(csk.x, SCREWS.M3.flat.d, 0.12), `${csk.x.toFixed(2)}`);

  const ib = await measure(insertBore("M3"));
  check("an M3 insert bore is 4.0 — the insert's own diameter, not smaller",
    near(ib.x, 4.0), `${ib.x.toFixed(2)}`);
  check("...and a little deeper than the insert, for displaced plastic",
    ib.z > INSERTS.M3.length, `${ib.z.toFixed(2)} vs ${INSERTS.M3.length}`);

  const mp = await measure(magnetPocket(6, 3));
  check("a 6x3 magnet pocket is 6.25 across", near(mp.x, 6 + FIT.magnet), `${mp.x.toFixed(2)}`);
}

console.log("\nthe hexagon is measured across FLATS, which is the whole trap\n");
{
  const np = await measure(nutPocket("M3"));
  // A hexagon's bounding box is across-corners one way and across-flats the
  // other. The SMALLER of the two is across flats, and that is the dimension a
  // nut is sold by.
  const flats = Math.min(np.x, np.y), corners = Math.max(np.x, np.y);
  const want = SCREWS.M3.nutAF + FIT.nut;
  check("an M3 nut pocket is flats + 0.3", near(flats, want), `${flats.toFixed(2)} vs ${want}`);
  // The proof it is not the naive version: across CORNERS must be about 15%
  // larger. Building the hexagon from af/2 instead would put the flats at 4.9
  // and the corners at 5.9 — a pocket the nut cannot enter, from a table that
  // says it can.
  check("...and across the corners it is 2/sqrt(3) bigger, as a hexagon is",
    near(corners, want * 2 / Math.sqrt(3), 0.12), `${corners.toFixed(2)} vs ${(want * 2 / Math.sqrt(3)).toFixed(2)}`);
  check("...so the pocket really does clear a 5.5 nut", flats > SCREWS.M3.nutAF);
  check("the pocket is as thick as the nut, plus slack",
    np.z >= SCREWS.M3.nutT, `${np.z.toFixed(2)}`);

  const cap = await measure(nutPocket("M3", { captive: true, slot: 20 }));
  check("a captive pocket opens a slot out to one side",
    cap.y > 20, `${cap.y.toFixed(2)}`);
  check("...without widening the pocket", near(cap.x, np.x, 0.05), `${cap.x.toFixed(2)} vs ${np.x.toFixed(2)}`);

  // The check that actually earns its keep: put a REAL nut in the slot and see
  // whether any of it is outside the pocket. Comparing numbers cannot catch
  // this — the slot was the right width for the across-FLATS size and the nut
  // still bound, because unturned the hexagon presents its CORNERS at the slot
  // walls and those are 15% further apart. Measured 0.4mm³ of nut outside the
  // pocket, which is a part that does not assemble.
  const spare = async (y) => {
    const stl = toSTL(await build(difference(translate([0, y, 0], nut("M3")),
      nutPocket("M3", { captive: true, slot: 20 }))), "v");
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
    let V = 0;
    for (let i = 0; i < v.length; i += 3) {
      const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
      V += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2])
        + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
    }
    return Math.abs(V);
  };
  for (const y of [0, 6, 12]) {
    const out = await spare(y);
    check(`a real nut is entirely inside the slot at y=${y}`, out < 0.05,
      `${out.toFixed(2)} mm³ of it is outside — it would bind`);
  }

  const n = await measure(nut("M3"));
  check("the nut itself is 5.5 across flats", near(Math.min(n.x, n.y), 5.5), `${Math.min(n.x, n.y).toFixed(2)}`);
  check("...and has a hole through it", n.facets > 20);
  check("a nut fits its own pocket", Math.min(np.x, np.y) > Math.min(n.x, n.y));
}

console.log("\nand a screw is a screw\n");
{
  const s = await measure(screw("M3", { length: 12 }));
  check("an M3 socket screw is 5.5 across the head", near(s.x, 5.5), `${s.x.toFixed(2)}`);
  check("...12 long under the head, plus the head itself",
    near(s.z, 12 + SCREWS.M3.socket.h), `${s.z.toFixed(2)}`);
  check("...and its shaft passes through its own clearance hole",
    SCREWS.M3.d < SCREWS.M3.clearance);
}

console.log("\nthe catalog is generated, never a second hand-kept list\n");
{
  const c = partsCatalog();
  check("every bearing is in it",
    Object.keys(BEARINGS).every((k) => c.bearings.includes(k)), c.bearings);
  check("...with its numbers", /608 \(8\/22\/7\)/.test(c.bearings));
  check("every screw size is in it",
    Object.keys(SCREWS).every((k) => c.screws.includes(k.replace("_", "."))), c.screws);
  check("...spelled the way a person types it", c.screws.includes("M2.5"));
  check("every insert size is in it",
    Object.keys(INSERTS).every((k) => c.inserts.includes(k.replace("_", "."))), c.inserts);
}

console.log("\nthe recipe and the tables cannot drift apart\n");
{
  // The #parts recipe restates the numbers in prose, because that is what a
  // model reads. Prose copies of data go stale silently — so every figure it
  // quotes is checked against the table it came from. Change a bearing here
  // and the recipe goes red until it is changed there too.
  const md = readFileSync(new URL("../viewer/recipes/parts.md", import.meta.url), "utf8");
  for (const [id, b] of Object.entries(BEARINGS)) {
    check(`#parts quotes ${id} as ${b.bore}/${b.od}/${b.w}`,
      md.includes(`${id} (${b.bore}/${b.od}/${b.w})`), `not found in the recipe`);
  }
  for (const k of Object.keys(SCREWS)) {
    check(`#parts lists ${k.replace("_", ".")}`, new RegExp(`\\b${k.replace("_", "\\.")}\\b`).test(md));
  }
  check("...and quotes the M3 clearance correctly", /3\.4 clearance|is 3\.4/.test(md));
  check("...and the M3 insert bore", new RegExp(`${INSERTS.M3.od.toFixed(1)}`).test(md));
  check("...and the M3 nut across flats", new RegExp(`${SCREWS.M3.nutAF}`).test(md));
  check("...and the bearing fit it actually uses",
    md.includes(`+${FIT.bearingPress}`), `FIT.bearingPress is ${FIT.bearingPress}`);

  // Every call the recipe demonstrates has to exist. A recipe that teaches a
  // function nobody wrote is worse than no recipe.
  const calls = [...md.matchAll(/^\s*([a-zA-Z][\w]*)\(/gm)].map((m) => m[1]);
  const api = { bearing, bearingPocket, screwHole, insertBore, nutPocket, magnetPocket, screw, nut, difference, translate };
  const missing = [...new Set(calls)].filter((c) => !(c in api) && !["cube"].includes(c));
  check("every function the recipe shows really exists", missing.length === 0, missing.join(", "));
}

console.log("\nand the OTHER hardware recipes agree with the tables\n");
{
  // #bearing, #screw, #insert and #magnet each carried their own table long
  // before parts.js existed. Two tables for one fact is how a model gets told
  // 3.4 in one paragraph and 3.2 in the next — so every number they quote is
  // checked against the code that now generates the geometry.
  const md = (f) => readFileSync(new URL(`../viewer/recipes/${f}.md`, import.meta.url), "utf8");

  const bear = md("bearing");
  for (const [id, b] of Object.entries(BEARINGS)) {
    if (!bear.includes(id)) continue;          // the recipe lists a subset, which is fine
    check(`#bearing agrees on ${id}`,
      new RegExp(`${id}[^\\n]*?${b.bore}\\s*[×x]\\s*${b.od}\\s*[×x]\\s*${b.w}`).test(bear),
      "the recipe and the table disagree");
  }

  const scr = md("screw");
  for (const [k, v] of Object.entries(SCREWS)) {
    const name = k.replace("_", ".");
    const row = new RegExp(`^- ${name.replace(".", "\\.")}: ([\\d.]+) · ([\\d.]+) · ([\\d.]+) · ([\\d.]+)`, "m").exec(scr);
    if (!row) continue;
    check(`#screw agrees on ${name}: pitch/clearance/close/pilot`,
      +row[1] === v.pitch && +row[2] === v.clearance && +row[3] === v.close && +row[4] === v.pilot,
      `recipe says ${row.slice(1, 5).join("/")}, table says ${[v.pitch, v.clearance, v.close, v.pilot].join("/")}`);
    check(`#screw agrees on the ${name} nut`,
      new RegExp(`${name.replace(".", "\\.")} ${v.nutAF}×${v.nutT}`).test(scr),
      `table says ${v.nutAF}×${v.nutT}`);
  }
  check("#screw quotes the counterbore allowance the code uses",
    scr.includes(`+${FIT.counterboreD}`) && scr.includes(`+${FIT.counterboreH}`),
    `code uses +${FIT.counterboreD} / +${FIT.counterboreH}`);
  check("#screw quotes the nut pocket allowance the code uses",
    scr.includes(`+${FIT.nut}`), `code uses +${FIT.nut}`);

  const ins = md("insert");
  for (const [k, v] of Object.entries(INSERTS)) {
    const name = k.replace("_", ".");
    check(`#insert agrees on ${name}`,
      new RegExp(`${name.replace(".", "\\.")}: Ø${v.od}[^\\n]*${v.length}[^\\n]*boss ${v.boss}`).test(ins),
      `table says Ø${v.od} · ${v.length} · boss ${v.boss}`);
  }

  const mag = md("magnet");
  check("#magnet quotes the pocket allowance the code uses",
    mag.includes(`+${FIT.magnet}`), `code uses +${FIT.magnet}`);

  // And every one of them should now be POINTING at the functions rather than
  // leaving a model to build the pocket by hand from the numbers.
  for (const [f, fn] of [["bearing", "bearingPocket"], ["screw", "screwHole"],
    ["insert", "insertBore"], ["magnet", "magnetPocket"]]) {
    check(`#${f} points at ${fn}()`, md(f).includes(`${fn}(`),
      "the recipe still teaches building it by hand");
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
