// The parts shelf.
//
// A shelf of parts is only worth having if every part on it actually builds.
// A library where three of twenty throw is worse than no library: the model
// reaches for one, gets an error it cannot diagnose, and falls back to writing
// the part by hand — having spent a round trip to learn nothing.
//
// So the spine of this file is: build EVERY entry in the index, from its own
// sample code, and check the result is a real solid. Everything after that is
// the specific traps each part exists to avoid.

import { SHELF, shelfIndex, shelfGroups } from "../src/shelf.js";
import * as shelf from "../src/shelf.js";
import * as dsl from "../src/dsl.js";
import { build, toSTL } from "../index.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

async function measure(shape) {
  const stl = toSTL(await build(shape), "s");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  if (!v.length) return { facets: 0, x: 0, y: 0, z: 0, vol: 0, empty: true };
  const ax = (i) => ({ min: Math.min(...v.map((p) => p[i])), max: Math.max(...v.map((p) => p[i])) });
  const [x, y, z] = [ax(0), ax(1), ax(2)];
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2])
      + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return {
    x: x.max - x.min, y: y.max - y.min, z: z.max - z.min,
    zMin: z.min, zMax: z.max, xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max,
    facets: (stl.match(/facet normal/g) || []).length, vol: Math.abs(vol),
  };
}
const near = (a, b, tol = 0.1) => Math.abs(a - b) <= tol;

// Match a number as PROSE writes it. The recipes write 13.0 and 14.0; a JS
// number literal of 13.0 is 13, and `${13}` is "13". A string compare calls
// that a disagreement when the two agree perfectly well, so the trailing zero
// is optional and the decimal point is escaped rather than left as "any char".
const numRe = (n) => String(n).replace(".", "\\.") + (Number.isInteger(n) ? "(\\.0)?" : "");

// Run a sample exactly as the picker would insert it and the model would write
// it — through the real vocabulary, not by calling the function directly.
const vocab = { ...dsl, ...shelf };
const runSample = (src) => Function(...Object.keys(vocab), `return (${src});`)(...Object.values(vocab));

console.log("\nthe index is a real index\n");
{
  check("there is a shelf worth browsing", SHELF.length >= 15, `${SHELF.length} parts`);
  check("every entry has an id, label, blurb, group and sample",
    SHELF.every((p) => p.id && p.label && p.blurb && p.group && p.sample));
  check("ids are unique", new Set(SHELF.map((p) => p.id)).size === SHELF.length);
  check("every id is a real exported function",
    SHELF.every((p) => typeof shelf[p.id] === "function"),
    SHELF.filter((p) => typeof shelf[p.id] !== "function").map((p) => p.id).join(", "));
  // ...and the reverse: a part written and never shelved is a part nobody can
  // find, which is the same as not having written it.
  const exported = Object.keys(shelf).filter((k) => typeof shelf[k] === "function"
    // lookups and helpers that return DATA rather than geometry — they are
    // not parts and have nothing to browse
    && !["shelfIndex", "shelfGroups", "pcbSpec", "pcbHoles", "gridfinityFit"].includes(k));
  const unshelved = exported.filter((k) => !SHELF.some((p) => p.id === k));
  check("every part written is on the shelf", unshelved.length === 0, unshelved.join(", "));
  check("the groups are few enough to scan", shelfGroups().length <= 8, shelfGroups().join(", "));
  check("every part carries search keywords", SHELF.every((p) => p.keywords?.trim()),
    SHELF.filter((p) => !p.keywords?.trim()).map((p) => p.id).join(", "));

  // The words a PERSON types, against the same fields the picker searches.
  // Found the hard way: "arduino" returned nothing while pcbStandoffs("uno")
  // sat right there, because the blurb said "uno" and nobody searches for that.
  const search = (q) => SHELF.filter((p) => [p.label, p.blurb, p.id, p.group, p.keywords || ""]
    .some((s) => s.toLowerCase().includes(q.toLowerCase())));
  for (const [term, want] of [
    ["arduino", "pcbStandoffs"], ["raspberry pi", "pcbStandoffs"], ["esp32", "pcbStandoffs"],
    ["usb", "portCutout"], ["ethernet", "portCutout"], ["sd card", "portCutout"],
    ["gridfinity", "gridfinityBin"], ["storage", "gridfinityBin"],
    ["enclosure", "shell"], ["case", "shell"], ["project box", "shell"],
    ["snap fit", "snapHook"], ["latch", "snapHook"], ["clip", "snapHook"],
    ["coat hook", "hook"], ["nameplate", "labelPlate"], ["cooling", "vent"],
    ["louver", "vent"], ["spacer", "standoff"], ["heat set", "screwBoss"],
    ["cable tie", "zipTieSlot"], ["wall mount", "keyholeSlot"], ["608", "bearingBlock"],
    ["flexure", "livingHinge"], ["print in place", "pinHinge"], ["dial", "knob"],
    ["organizer", "gridfinityBin"], ["organiser", "gridfinityBin"],
  ]) {
    const found = search(term);
    check(`searching "${term}" finds ${want}`, found.some((p) => p.id === want),
      found.length ? `found ${found.map((p) => p.id).join(", ")}` : "found nothing at all");
  }
  check("shelfIndex() hands out copies, not the live list",
    shelfIndex()[0] !== SHELF[0] && shelfIndex()[0].id === SHELF[0].id);
  // The naming rule, in the direction that is actually safe to promise.
  //
  // "Named like a negative ⇒ IS a negative" holds and is worth enforcing: a
  // reader who sees keyholeSlot and subtracts it is never wrong. The converse
  // does not hold and should not be forced — vent() and honeycomb() read as
  // the feature, and both can be positive with { solid: true }. Renaming them
  // to ventCut() would make the common call the ugly one.
  //
  // So the cut FLAG is the truth, and any cut that is not named like one has
  // to say so in its blurb, where a person browsing will actually see it.
  for (const p of SHELF) {
    if (/(Slot|Pocket|Hole|Cut|Catch)$/.test(p.id)) {
      check(`${p.id}: named like a negative, so it is one`, !!p.cut,
        "the name promises a cut and the flag says otherwise");
    } else if (p.cut) {
      check(`${p.id}: a cut not named like one says so in its blurb`,
        /\bcut\b|\bthin\b|\brebate\b|\bholes\b|\brecess\b/i.test(p.blurb),
        `blurb is "${p.blurb}" — a browser would not know to subtract it`);
    }
  }
}

console.log("\nEVERY part on the shelf builds, from its own sample\n");
{
  for (const p of SHELF) {
    let m = null, err = "";
    try { m = await measure(runSample(p.sample)); } catch (e) { err = String(e.message || e); }
    check(`${p.id} builds`, !!m && m.facets > 0, err || "produced nothing");
    if (m && m.facets > 0) {
      check(`${p.id}: ...and has real volume`, m.vol > 0.5, `${m.vol?.toFixed(2)} mm³`);
      check(`${p.id}: ...at a sane size`, m.x < 500 && m.y < 500 && m.z < 500,
        `${m.x.toFixed(0)} x ${m.y.toFixed(0)} x ${m.z.toFixed(0)}`);
    }
  }
}

console.log("\nand every part called BARE works too — defaults are the promise\n");
{
  // The point of a shelf is that standoff() gives you a standoff. A part whose
  // defaults throw is a part you have to read the source of before using.
  for (const p of SHELF) {
    let ok = false, err = "";
    try { ok = !!(await measure(shelf[p.id]())).facets; } catch (e) { err = String(e.message || e); }
    check(`${p.id}() with no arguments`, ok, err);
  }
}

console.log("\nthe traps each part exists to avoid\n");
{
  // standoff: the hole must go THROUGH, or it is a post with a dimple.
  const so = await measure(shelf.standoff({ h: 8, id: 3.2, wall: 2 }));
  check("standoff is id + 2 walls across", near(so.x, 3.2 + 4), `${so.x.toFixed(2)}`);
  const solid = await measure(shelf.standoff({ h: 8, id: 3.2, wall: 2, solid: true }));
  // a 3.2 bore through a 7.2 post removes (3.2/7.2)^2 = 20% of it
  check("...and its bore is really open", so.vol < solid.vol * 0.85,
    `${so.vol.toFixed(0)} vs solid ${solid.vol.toFixed(0)} mm³`);
  let t = "";
  try { shelf.standoff({ id: 6, od: 5 }); } catch (e) { t = e.message; }
  check("a bore wider than the post is refused", /bigger than/.test(t), t);

  // screwBoss: the boss diameter must come from the insert table, not by eye.
  const { insertSpec } = await import("../src/parts.js");
  const bo = await measure(shelf.screwBoss("M3"));
  check("screwBoss uses the insert table's minimum boss",
    near(bo.x, insertSpec("M3").boss), `${bo.x.toFixed(2)} vs ${insertSpec("M3").boss}`);

  // keyhole: the head end must actually be wider than the shank end, and the
  // slot must run the distance asked for.
  const kh = await measure(shelf.keyholeSlot({ head: 8, shank: 4.2, drop: 12 }));
  check("keyhole is as wide as its head", near(kh.x, 8), `${kh.x.toFixed(2)}`);
  check("...and runs head + drop long", near(kh.y, 8 / 2 + 12 + 4.2 / 2, 0.3), `${kh.y.toFixed(2)}`);
  t = "";
  try { shelf.keyholeSlot({ head: 4, shank: 6 }); } catch (e) { t = e.message; }
  check("a shank wider than the head is refused", /smaller than/.test(t), t);

  // zip tie: TWO slots, not one.
  const zt = await measure(shelf.zipTieSlot({ w: 5, gap: 12 }));
  check("zipTieSlot spans the gap it was given", near(zt.x, 12 + 2.4, 0.3), `${zt.x.toFixed(2)}`);

  // snap hook + catch: the catch must be WIDER than the hook or it never clicks.
  const hk = await measure(shelf.snapHook({ w: 6, t: 1.6, l: 10, lip: 1.2 }));
  const ct = await measure(shelf.snapCatch({ w: 6, lip: 1.2, t: 2 }));
  check("the hook is as wide as asked", near(hk.y, 6), `${hk.y.toFixed(2)}`);
  check("the catch window clears the hook", ct.y > hk.y, `${ct.y.toFixed(2)} vs ${hk.y.toFixed(2)}`);
  check("the hook's barb stands proud of its arm", hk.x > 1.6, `${hk.x.toFixed(2)}`);

  // dovetail: the socket must be bigger than the tongue, in both widths.
  const dt = await measure(shelf.dovetail({ w: 12, neck: 7, d: 6, h: 8 }));
  const ds = await measure(shelf.dovetailSlot({ w: 12, neck: 7, d: 6, h: 8 }));
  check("the dovetail socket is wider than the tongue", ds.x > dt.x,
    `${ds.x.toFixed(2)} vs ${dt.x.toFixed(2)}`);
  check("the tongue is wide at the far end, narrow at the neck", near(dt.x, 12), `${dt.x.toFixed(2)}`);
  t = "";
  try { shelf.dovetail({ w: 7, neck: 12 }); } catch (e) { t = e.message; }
  check("a neck wider than the tail is refused", /narrower than/.test(t), t);

  // living hinge: what is LEFT is the number that matters.
  const lh = await measure(shelf.livingHinge({ l: 40, w: 3, t: 3, leave: 0.4 }));
  check("the living hinge cut starts above the material it leaves",
    near(lh.zMin, 0.4), `starts at ${lh.zMin.toFixed(2)}`);
  check("...and removes the rest of the panel", near(lh.z, 3 - 0.4, 0.05), `${lh.z.toFixed(2)}`);
  t = "";
  try { shelf.livingHinge({ t: 2, leave: 3 }); } catch (e) { t = e.message; }
  check("leaving more than the panel is thick is refused", /less than/.test(t), t);

  // shell: hollow, and the wall is the wall.
  const sh = await measure(shelf.shell({ size: [60, 40, 25], wall: 2, r: 3 }));
  const shSolid = await measure(shelf.shell({ size: [60, 40, 25], solid: true, r: 3 }));
  check("the shell is the size asked for", near(sh.x, 60) && near(sh.y, 40) && near(sh.z, 25),
    `${sh.x.toFixed(1)} x ${sh.y.toFixed(1)} x ${sh.z.toFixed(1)}`);
  check("...and is genuinely hollow", sh.vol < shSolid.vol * 0.5,
    `${sh.vol.toFixed(0)} vs solid ${shSolid.vol.toFixed(0)} mm³`);

  // vent: more than one slot, and it stays inside the width it was given.
  const vn = await measure(shelf.vent({ w: 40, h: 20, slot: 3, gap: 3, t: 4 }));
  check("the vent fits the width it was given", vn.x <= 40.01, `${vn.x.toFixed(2)}`);
  check("...and is a ROW, not one slot", vn.facets > 60, `${vn.facets} facets`);

  // honeycomb: many cells, and it respects the panel.
  const hc = await measure(shelf.honeycomb({ w: 60, h: 40, cell: 8, wall: 1.6, t: 4 }));
  check("the honeycomb is many cells", hc.facets > 200, `${hc.facets} facets`);
  const hcSolid = await measure(shelf.honeycomb({ w: 60, h: 40, cell: 8, wall: 1.6, t: 4, solid: true }));
  check("...and as ribs it stays inside the panel",
    hcSolid.x <= 60.01 && hcSolid.y <= 40.01, `${hcSolid.x.toFixed(1)} x ${hcSolid.y.toFixed(1)}`);
  check("...and the ribs weigh less than a full plate", hcSolid.vol < 60 * 40 * 4 * 0.6,
    `${hcSolid.vol.toFixed(0)} mm³`);

  // knob: the flutes are CUT, so the diameter is the diameter.
  const kn = await measure(shelf.knob({ d: 30, h: 12, flutes: 12 }));
  check("the knob is the diameter asked for, not bigger",
    kn.x <= 30.01 && kn.x > 26, `${kn.x.toFixed(2)}`);
  check("...and it is fluted, not plain", kn.facets > 100, `${kn.facets}`);
  const bored = await measure(shelf.knob({ d: 30, h: 12, bore: 6 }));
  check("...and a bore really goes through it", bored.vol < kn.vol, `${bored.vol.toFixed(0)}`);

  // pillow block: bored right THROUGH, so a shaft can pass.
  const bb = await measure(shelf.bearingBlock("608", { wall: 4 }));
  const bbVol = bb.vol;
  check("the pillow block stands on a foot", bb.zMin <= 0.01, `${bb.zMin.toFixed(2)}`);
  check("...and is wider at the base than the body", bb.x > 22 + 8, `${bb.x.toFixed(2)}`);
  check("...and has real material in it", bbVol > 1000, `${bbVol.toFixed(0)} mm³`);
}

console.log("\nboards: the pattern is the board's, not a rectangle drawn by eye\n");
{
  const { PCBS, pcbSpec, pcbHoles } = shelf;
  // Every board's numbers are cross-checked against #devboard, which was
  // written and reviewed first. Two copies of a dimension is how a model gets
  // told 58 x 49 in one place and something else in the other.
  const md = readFileSync(new URL("../viewer/recipes/board.md", import.meta.url), "utf8");
  for (const [id, b] of Object.entries(PCBS)) {
    check(`#devboard agrees on the ${id} outline`,
      new RegExp(`${b.w}\\s*×\\s*${b.d}`).test(md), `code says ${b.w} x ${b.d}`);
    if (b.hx) {
      check(`...and on its ${b.hx} x ${b.hy} hole pattern`,
        new RegExp(`\\*\\*${b.hx}\\s*×\\s*${b.hy}\\*\\*`).test(md), `code says ${b.hx} x ${b.hy}`);
    }
  }
  // The Uno is the one that matters: its holes are famously NOT a rectangle,
  // and laying them out as one is why a printed Arduino case will not close.
  const uno = pcbHoles("uno");
  check("the Uno has four holes", uno.length === 4);
  const xs = new Set(uno.map((p) => +p[0].toFixed(1)));
  const ys = new Set(uno.map((p) => +p[1].toFixed(1)));
  check("...and they are NOT a rectangle", xs.size > 2 || ys.size > 2,
    `${xs.size} distinct x, ${ys.size} distinct y — that is a rectangle`);
  for (const [x, y] of uno) {
    check(`...(${x.toFixed(1)}, ${y.toFixed(1)}) is inside the board outline`,
      Math.abs(x) <= PCBS.uno.w / 2 && Math.abs(y) <= PCBS.uno.d / 2);
  }
  check("a rectangular board really is a rectangle", (() => {
    const h = pcbHoles("pi4");
    return h.length === 4 && new Set(h.map((p) => Math.abs(p[0]))).size === 1;
  })());
  // A RECTANGULAR pattern must be centred, or a plate drawn round it is off by
  // half a board. The Uno is deliberately exempt: its holes are asymmetric, so
  // their centroid is genuinely NOT the board centre — demanding otherwise
  // would be demanding the wrong shape.
  for (const [id, b] of Object.entries(PCBS)) {
    if (!b.hx) continue;
    const h = pcbHoles(id);
    const cx = h.reduce((n, p) => n + p[0], 0) / h.length;
    const cy = h.reduce((n, p) => n + p[1], 0) / h.length;
    check(`${id}: the hole pattern is centred on the origin`,
      Math.abs(cx) < 0.01 && Math.abs(cy) < 0.01, `centre is ${cx.toFixed(1)}, ${cy.toFixed(1)}`);
  }
  // ...and the Uno's four points are checked against the recipe individually,
  // since a centroid tells you nothing about an asymmetric pattern.
  for (const [px, py] of PCBS.uno.points) {
    check(`#devboard lists the Uno hole at (${px}, ${py})`,
      new RegExp(`\\(${numRe(px)},\\s*${numRe(py)}\\)`).test(md),
      "the recipe and the table disagree");
  }
  const st = await measure(shelf.pcbStandoffs("pi4", { h: 6 }));
  check("pi4 standoffs span the 58 x 49 pattern",
    near(st.x, 58 + PCBS.pi4.hole * 2, 0.3) && near(st.y, 49 + PCBS.pi4.hole * 2, 0.3),
    `${st.x.toFixed(1)} x ${st.y.toFixed(1)}`);
  const pl = await measure(shelf.pcbPlate("pi4", { margin: 3 }));
  check("...and a plate for it is the board plus its margin",
    near(pl.x, 85 + 6, 0.3), `${pl.x.toFixed(1)}`);
  let t = "";
  try { pcbSpec("teensy"); } catch (e) { t = e.message; }
  check("an unknown board lists the real ones", /pi4/.test(t) && /isn't known/.test(t), t);
  check("board names are forgiving about case and spacing",
    pcbSpec("Pi 4").w === 85 && pcbSpec("PIZERO").w === 65);
}

console.log("\ngridfinity: a bin this code made must seat in a base it made\n");
{
  const { GRID, gridfinityBin, gridfinityBase } = shelf;
  const md = readFileSync(new URL("../viewer/recipes/gridfinity.md", import.meta.url), "utf8");
  // Every number the code holds has to appear in the page the model is handed,
  // or the two drift and the model builds to a figure nobody checked. Written
  // as "does the recipe contain the constant" rather than "does it contain this
  // exact sentence", so the page can be reworded without the suite going red
  // for no reason — but it cannot lose a NUMBER.
  const states = (label, ...vals) => check(label,
    vals.every((v) => md.includes(String(v))),
    vals.filter((v) => !md.includes(String(v))).map((v) => `missing ${v}`).join(", "));
  states("#gridfinity states the 42mm pitch", GRID.pitch);
  states("...the 41.5 footprint", GRID.foot);
  states("...the r3.75 corner", GRID.r);
  states("...the 7mm height unit", GRID.unit);
  states("...the 0.8 / 1.8 / 2.15 foot profile",
    GRID.chamferLo, GRID.straight, GRID.chamferHi, GRID.base);
  states("...the 0.7 / 1.8 / 1.9 stacking lip", GRID.lipLo, GRID.lipHi, GRID.lip);
  states("...the baseplate socket, which is NOT the foot", GRID.socketLo, GRID.socketHi, GRID.socket);
  states("...the r4.0 baseplate corner", GRID.baseR);
  states("...the 0.25 mating clearance", GRID.clearance);
  check("...and that a 2u bin measures 18.4 overall, which is the trap",
    md.includes("18.4"));
  check("...and that gridfinityFit exists, since that is the usual first question",
    md.includes("gridfinityFit"));
  check("...and every divider name the code answers to",
    ["split", "quad", "thirds", "six"].every((d) => md.includes(d)));
  check("the three steps really add up to the stated base height",
    near(GRID.chamferLo + GRID.straight + GRID.chamferHi, GRID.base, 0.001), `${GRID.base}`);

  // ---- the stacking lip, straight off the reference sheet ----------------
  //
  // Without it a "Gridfinity bin" is a box with a decorative foot: nothing
  // stacks on it. The sheet gives the profile as 0.7 / 1.8 / 1.9 and annotates
  // "+~4.4mm", and the two agree — which is the first sign the reading is right.
  check("the lip's three steps add up to the 4.4 the sheet annotates",
    near(GRID.lipLo + GRID.lipStraight + GRID.lipHi, GRID.lip, 1e-9), `${GRID.lip}`);
  check("the baseplate socket's three steps add up to its stated height",
    near(GRID.socketLo + GRID.socketStraight + GRID.socketHi, GRID.socket, 1e-9), `${GRID.socket}`);
  // Every chamfer is 45°, so a step's rise IS its change in radius. Three
  // separate numbers on the sheet fall out of that, and if any of them missed,
  // the reading would be wrong somewhere.
  const C = GRID.foot / 2 - GRID.r;                       // 17.0
  const across = (r) => 2 * (C + r);
  check("...the corner centres are at 17.0 for every profile", near(C, 17, 1e-9), `${C}`);
  const lipTopR = (GRID.r - GRID.lipHi - GRID.lipLo) + GRID.lipLo + GRID.lipHi;
  check("the lip's top opening is flush with the wall it is cut into",
    near(across(lipTopR), GRID.foot, 1e-9), `${across(lipTopR)}`);
  const lipFitR = (GRID.r - GRID.lipHi - GRID.lipLo) + GRID.lipLo;
  const footFitR = GRID.r - GRID.chamferHi;
  check("...and its straight section clears the foot's by exactly the 0.25 offset",
    near(lipFitR - footFitR, GRID.clearance, 1e-9), `${(lipFitR - footFitR).toFixed(3)}`);
  const socketTopR = (lipFitR - GRID.socketLo) + GRID.socketLo + GRID.socketHi;
  check("the baseplate socket opens at the full 42.0 cell",
    near(across(socketTopR), GRID.pitch, 1e-9), `${across(socketTopR)}`);
  check("...on an r4.0 corner, which is the sheet's 8.0Ø",
    near(socketTopR, GRID.baseR, 1e-9), `${socketTopR}`);

  const bin = await measure(gridfinityBin({ x: 1, y: 1, u: 3 }));
  check("a 1x1x3 bin is 41.5 across", near(bin.x, GRID.foot, 0.15), `${bin.x.toFixed(2)}`);
  // u counts BODY units; the lip stands on top. The sheet prints 18.4 for a 2u
  // bin, which is 14 + 4.4 — so a 3u is 21 + 4.4.
  check("...and 25.4 tall — 3 x 7 of body plus the 4.4 lip",
    near(bin.z, 3 * GRID.unit + GRID.lip, 0.05), `${bin.z.toFixed(2)}`);
  const twoU = await measure(gridfinityBin({ x: 1, y: 1, u: 2 }));
  check("a 2u bin measures the 18.4 printed on the sheet",
    near(twoU.z, 18.4, 0.05), `${twoU.z.toFixed(2)}`);
  const noLip = await measure(gridfinityBin({ x: 1, y: 1, u: 3, lip: false }));
  check("lip:false gives the bare 21 back, for a bin that never stacks",
    near(noLip.z, 21, 0.05), `${noLip.z.toFixed(2)}`);
  check("...so the lip is really adding material, not just height",
    bin.vol > noLip.vol, `${bin.vol.toFixed(0)} vs ${noLip.vol.toFixed(0)}`);

  const two = await measure(gridfinityBin({ x: 2, y: 1, u: 3 }));
  check("a 2x1 bin is one pitch wider, not two footprints",
    near(two.x, GRID.foot + GRID.pitch, 0.15), `${two.x.toFixed(2)}`);
  check("...and is hollow", two.vol < 2 * 42 * 42 * 21 * 0.5, `${two.vol.toFixed(0)} mm³`);

  const base = await measure(gridfinityBase({ x: 2, y: 2 }));
  check("a 2x2 baseplate is 84 square", near(base.x, 84, 0.05) && near(base.y, 84, 0.05),
    `${base.x.toFixed(1)} x ${base.y.toFixed(1)}`);

  // ---- bottomless: a frame, not a tray ------------------------------------
  // For gluing onto a drawer bottom, or a big grid that would otherwise be
  // hours of solid layers. The seat must survive; the floor must not.
  {
    const frame = await measure(gridfinityBase({ x: 2, y: 2, bottomless: true }));
    check("a bottomless plate saves real plastic", frame.vol < base.vol * 0.8,
      `${frame.vol.toFixed(0)} vs ${base.vol.toFixed(0)}`);
    check("...and defaults to the socket's own 4.65 height",
      near(frame.z, GRID.socket, 0.02), `${frame.z.toFixed(2)}`);
    // The proof it is OPEN: a probe pillar through the middle of a cell meets
    // no material at all, where the solid plate has its floor.
    const pillar = dsl.translate([-10, -10, -2], dsl.cube([20, 20, 10]));
    const open = await measure(dsl.intersection(gridfinityBase({ x: 1, y: 1, bottomless: true }), pillar));
    const closed = await measure(dsl.intersection(gridfinityBase({ x: 1, y: 1 }), pillar));
    check("the socket is open right through", open.vol < 1, `${open.vol.toFixed(1)} mm³ in the way`);
    check("...where the solid plate really does have a floor there", closed.vol > 50,
      `${closed.vol.toFixed(0)} mm³`);
    // And a bin still seats — the frame kept the stepped walls that hold it.
    const clash = await measure(dsl.intersection(
      gridfinityBin({ x: 1, y: 1, u: 2, solid: true }),
      gridfinityBase({ x: 1, y: 1, bottomless: true })));
    check("a bin still seats in the frame", clash.vol < 1, `${clash.vol.toFixed(1)} mm³ overlap`);
  }

  // THE check. Everything above is a number agreeing with another number; this
  // is the bin and the baseplate meeting, and no dimension check catches a
  // plinth that will not go in.
  //
  // Asked as INTERFERENCE, not as leftover height. Two parts that fit share no
  // volume; two that foul share exactly the volume that has to be shaved off.
  // The earlier version subtracted one from the other and measured what was
  // left, which only works when the lower part is solid underneath — true of a
  // baseplate, and quietly false of a bin, whose lip is a ring with open air
  // down the middle. That version passed a bin-on-bin stack it never tested.
  const solo = await measure(gridfinityBin({ x: 1, y: 1, u: 2, solid: true }));
  {
    // Seated on the socket floor: the socket is 4.65 deep and the foot 4.75
    // tall, so the foot rests on the floor and the bin sits 0.1 proud of the
    // plate's top face. That 0.1 is the sheet's, not a rounding error.
    const seat = 5 - GRID.socket;
    const clash = await measure(dsl.intersection(
      dsl.translate([0, 0, seat], gridfinityBin({ x: 1, y: 1, u: 2, solid: true })),
      gridfinityBase({ x: 1, y: 1, h: 5 })));
    check("a bin drops into a baseplate with nothing fouling",
      clash.vol < 1, `${clash.vol.toFixed(1)} mm³ of overlap — the plinth is jamming`);
    check("...and it is a real seat, not the bin floating clear of the plate",
      near(seat + GRID.base, 5 + 0.1, 0.02), `foot top lands at ${(seat + GRID.base).toFixed(2)}`);
  }

  // THE OTHER check, and the one the lip exists for: a bin has to stack on a
  // BIN, not only drop into a baseplate. Same method — sit one on top of the
  // other at the stacking pitch and see whether the foot is swallowed.
  //
  // Stacking pitch is u x 7, NOT the bin's overall height: the upper bin's foot
  // sinks into the lower one's lip, which is exactly what makes the grid keep
  // its 7 mm rhythm however many bins are piled up.
  {
    const lower = gridfinityBin({ x: 1, y: 1, u: 2 });
    const upper = gridfinityBin({ x: 1, y: 1, u: 2, solid: true });
    const pitch = 2 * GRID.unit;                       // 14, not 18.4
    const clash = await measure(dsl.intersection(
      dsl.translate([0, 0, pitch], upper), lower));
    const alone = await measure(upper);
    check("a bin stacks on another bin — the foot goes into the lip, nothing fouls",
      clash.vol < 1, `${clash.vol.toFixed(1)} mm³ of overlap between the foot and the lip`);
    // "No interference" on its own proves nothing — two bricks stacked flat
    // also do not interfere. What the lip buys is that the lower bin HAS
    // material at the heights the foot occupies, forming a wall around it, and
    // still does not touch it. That is the difference between a located stack
    // and a pile.
    const slab = dsl.translate([-30, -30, pitch], dsl.cube([60, 60, GRID.lip]));
    const ring = await measure(dsl.intersection(lower, slab));
    const nothing = await measure(dsl.intersection(
      gridfinityBin({ x: 1, y: 1, u: 2, lip: false }), slab));
    check("...and the lip really is a wall around the foot, not just clearance",
      ring.vol > 200, `${ring.vol.toFixed(0)} mm³ of lip at the foot's height`);
    check("...which a lip-less bin does not have — it would just perch on top",
      nothing.vol < 1, `${nothing.vol.toFixed(1)} mm³`);
    check("...and the stack pitch stays a clean u x 7",
      near(pitch, 2 * GRID.unit, 1e-9), `${pitch}`);
    check("...so two stacked 2u bins occupy 14 + 18.4, not 36.8",
      near(pitch + alone.z, 32.4, 0.05), `${(pitch + alone.z).toFixed(2)}`);
  }

  // ---- dividers ----------------------------------------------------------
  {
    const plain = await measure(gridfinityBin({ x: 2, y: 2, u: 3 }));
    const split = await measure(gridfinityBin({ x: 2, y: 2, u: 3, divide: "split" }));
    const quad = await measure(gridfinityBin({ x: 2, y: 2, u: 3, divide: "quad" }));
    check("a split bin has more material than a plain one — that is the wall",
      split.vol > plain.vol, `${split.vol.toFixed(0)} vs ${plain.vol.toFixed(0)}`);
    check("...and a quad has more again — three walls, not one",
      quad.vol > split.vol, `${quad.vol.toFixed(0)} vs ${split.vol.toFixed(0)}`);
    check("dividers do not change the outside of the bin",
      near(split.x, plain.x, 0.02) && near(quad.z, plain.z, 0.02),
      `${split.x.toFixed(2)} / ${quad.z.toFixed(2)}`);
    // The dividers must stop UNDER the lip. One run up into it would hold the
    // next bin off its seat by however far it stood proud, and the stack would
    // rock — invisible in a render, obvious on a desk.
    check("...and stop below the lip, so a bin still stacks on a divided one",
      near(quad.z, plain.z, 0.02), `${quad.z.toFixed(2)} vs ${plain.z.toFixed(2)}`);
    const thirds = await measure(gridfinityBin({ x: 3, y: 1, u: 3, divide: "thirds" }));
    check("thirds is three compartments", thirds.vol > plain.vol * 0.4, `${thirds.vol.toFixed(0)}`);
    const custom = await measure(gridfinityBin({ x: 2, y: 2, u: 3, divX: 2, divY: 2 }));
    check("divX/divY match the named shorthand", near(custom.vol, quad.vol, 1),
      `${custom.vol.toFixed(0)} vs ${quad.vol.toFixed(0)}`);
  }

  // ---- describing a drawer ------------------------------------------------
  //
  // The question people actually arrive with. The trap is that a bin is 41.5
  // across but a CELL is 42, so the last column still needs a full 42 — round
  // the wrong way and the grid does not go in the drawer at all.
  {
    const { gridfinityFit } = shelf;
    const f = gridfinityFit(380, 290);
    check("a 380 x 290 drawer takes 9 x 6 cells", f.x === 9 && f.y === 6, `${f.x} x ${f.y}`);
    check("...spanning 378 x 252", f.spanX === 378 && f.spanY === 252, `${f.spanX} x ${f.spanY}`);
    check("...with the leftover reported, not hidden",
      near(f.leftoverX, 2, 0.01) && near(f.leftoverY, 38, 0.01),
      `${f.leftoverX} / ${f.leftoverY}`);
    check("an exact multiple leaves nothing over",
      gridfinityFit(420, 294).leftoverX === 0 && gridfinityFit(420, 294).leftoverY === 0);
    check("it always rounds DOWN — 41.9 of space is not a column",
      gridfinityFit(41.9, 41.9).x === 0 && gridfinityFit(41.9, 41.9).fits === false);
    check("...and says so rather than returning a 0x0 grid silently",
      gridfinityFit(41.9, 100).fits === false);
    check("a margin is taken off before the division",
      gridfinityFit(420, 420, { margin: 10 }).x === 9, `${gridfinityFit(420, 420, { margin: 10 }).x}`);
    check("the total cell count is there for the shopping list",
      gridfinityFit(380, 290).cells === 54, `${gridfinityFit(380, 290).cells}`);
  }
}

// ---- the Toolbox picker ---------------------------------------------------
//
// A size is picked far better by dragging across a grid than by typing two
// numbers, and the millimetres have to be on screen while you do it — "4 x 3"
// means nothing stood at a drawer, "168 x 126mm" decides whether it fits.
console.log("\ngridfinity: the Toolbox picker\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const { GRID } = shelf;
  check("there is a Toolbox row for it", HTML.includes('<button id="gfin-row">'));
  check("...opening a card", HTML.includes('<section id="gfin" class="card"'));
  check("the grid is built to 12 x 12", HTML.includes("const MAX = 12;"));
  // The picker must read its numbers from the same standard the DSL does, or
  // the millimetres it shows while you choose are not the ones you get.
  check("...from the same pitch, footprint, unit and lip the DSL uses",
    HTML.includes(`PITCH = ${GRID.pitch}`) && HTML.includes(`FOOT = ${GRID.foot}`)
    && HTML.includes(`UNIT = ${GRID.unit}`) && HTML.includes(`LIP = ${GRID.lip}`));
  check("bin or baseplate is a choice",
    HTML.includes('data-kind="bin"') && HTML.includes('data-kind="base"'));
  check("...and the bin-only options hide for a baseplate",
    HTML.includes('$("gfin-binopts").hidden = kind !== "bin"'));

  // Every divider the menu offers has to be one the code answers to, or the
  // picker writes a call that silently does nothing.
  const menu = HTML.match(/<select id="gfin-div">([\s\S]*?)<\/select>/);
  const offered = menu ? [...menu[1].matchAll(/value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean) : [];
  check("the divider menu offers something", offered.length >= 3, offered.join(", "));
  const plain = await measure(shelf.gridfinityBin({ x: 3, y: 2, u: 3 }));
  for (const d of offered) {
    const cut = await measure(shelf.gridfinityBin({ x: 3, y: 2, u: 3, divide: d }));
    check(`"${d}" really divides the bin`, cut.vol > plain.vol,
      `${cut.vol.toFixed(0)} vs ${plain.vol.toFixed(0)}`);
  }

  // Every height offered must build, and its LABEL has to be the number the bin
  // actually measures — this is the 18.4-not-14 trap, printed in the menu.
  const heights = HTML.match(/<select id="gfin-u">([\s\S]*?)<\/select>/);
  const rows = heights ? [...heights[1].matchAll(/value="(\d+)"[^>]*>(\d+)u — ([\d.]+)mm/g)] : [];
  check("the height menu labels its own millimetres", rows.length >= 4, `${rows.length} rows`);
  for (const [, val, u, mm] of rows) {
    check(`${u}u is labelled ${mm}mm — u x 7 plus the lip`,
      near(+mm, +val * GRID.unit + GRID.lip, 0.01), `${+val * GRID.unit + GRID.lip}`);
  }
  const last = rows[rows.length - 1];
  const tall = await measure(shelf.gridfinityBin({ x: 1, y: 1, u: +last[1] }));
  check("...and the tallest one really builds to its label",
    near(tall.z, +last[3], 0.05), `${tall.z.toFixed(2)} vs ${last[3]}`);

  // Round DOWN, like gridfinityFit — a grid one column too wide does not go in.
  check("the drawer box floors rather than rounding",
    HTML.includes("Math.floor(w / PITCH)") && HTML.includes("Math.floor(d / PITCH)"));
  check("...and says so when the drawer holds no whole cell",
    HTML.includes("holds no full cell"));
  // The picker's output is a WHOLE MODEL, so it is combined via union() with
  // whatever the editor holds rather than pasted at the caret — pasting a
  // second model into the middle of an expression does not parse, and pasting
  // it after a return never runs. combineWithEditor() is the one place that
  // knows the three cases (empty, returns, bare expression).
  check("inserting combines with the editor via union(), never a caret paste",
    HTML.includes("code.value = combineWithEditor(v, call);"));
  check("...and the bare-expression case keeps the existing model in the union",
    /new Function\(`return \(/.test(HTML));
  check("...and bottomless is offered for baseplates",
    HTML.includes('id="gfin-bottomless"') && HTML.includes('parts.push("bottomless: true")'));
}


console.log("\nports: the size is the CUT, and it goes through the wall\n");
{
  const { PORTS, portCutout } = shelf;
  const md = readFileSync(new URL("../viewer/recipes/connectors.md", import.meta.url), "utf8");
  for (const [name, spec] of Object.entries(PORTS)) {
    const re = Array.isArray(spec)
      ? new RegExp(`${numRe(spec[0])}\\s*×\\s*${numRe(spec[1])}`)
      : new RegExp(`${numRe(spec)}\\b`);
    check(`#ports agrees on the ${name} cutout`, re.test(md),
      `code says ${Array.isArray(spec) ? spec.join(" x ") : spec}`);
  }
  const usbc = await measure(portCutout("usb-c", { t: 3 }));
  check("a usb-c cutout is 10 wide", near(usbc.x, PORTS["usb-c"][0], 0.05), `${usbc.x.toFixed(2)}`);
  // It cuts along +Y — the one break in the shelf's convention, made on purpose.
  check("...and runs through the wall along +Y, overshooting both faces",
    near(usbc.y, 3 + 2, 0.05) && usbc.yMin < -0.9, `y ${usbc.yMin.toFixed(2)}..${usbc.yMax.toFixed(2)}`);
  const round = await measure(portCutout("barrel", { t: 3 }));
  check("a barrel jack is a round hole of the stated diameter",
    near(round.x, PORTS.barrel, 0.05) && near(round.z, PORTS.barrel, 0.05), `${round.x.toFixed(2)}`);
  // The roof: a flat-topped rectangle prints its top edge as an unsupported
  // bridge, so the default adds a 45-degree peak.
  const hdmi = await measure(portCutout("hdmi", { t: 3 }));
  const square = await measure(portCutout("hdmi", { t: 3, arch: false }));
  check("a rectangular cutout gets a roof by default", hdmi.z > square.z,
    `${hdmi.z.toFixed(2)} vs ${square.z.toFixed(2)}`);
  check("...and it can be turned off", near(square.z, PORTS.hdmi[1], 0.05), `${square.z.toFixed(2)}`);
  let t = "";
  try { portCutout("firewire"); } catch (e) { t = e.message; }
  check("an unknown port lists the real ones", /usb-c/.test(t) && /isn't known/.test(t), t);
}

console.log("\nbad input is refused by name, never silently absorbed\n");
{
  // A part that quietly accepts nonsense produces a shape that looks fine and
  // is wrong. Every one of these should say which argument and why.
  const bad = [
    ["standoff", { h: 0 }], ["standoff", { h: "big" }],
    ["shell", { size: [0, 40, 25] }],
    ["vent", { slot: -1 }],
    ["knob", { d: 0 }],
    ["cornerGusset", { l: 0 }],
    ["handle", { span: NaN }],
  ];
  for (const [id, opts] of bad) {
    let msg = "";
    try { shelf[id](opts); } catch (e) { msg = e.message; }
    check(`${id}(${JSON.stringify(opts)}) is refused`, /^shelf: /.test(msg), msg || "accepted it");
  }
}

console.log("\nthe shelf costs the prompt nothing until it is asked for\n");
{
  // The whole design rule. The harness may POINT at the shelf; it must not
  // carry it. If the catalogue ever gets pasted into the prompt, every request
  // starts paying for parts it will never use.
  const { DEFAULT_HARNESS } = await import("../viewer/chatbot.js");
  const named = SHELF.filter((p) => DEFAULT_HARNESS.includes(p.id));
  check("the harness does not list the whole shelf", named.length < SHELF.length / 2,
    `${named.length} of ${SHELF.length} parts named in the prompt`);
  check("...but it does say the shelf exists", /#shelf/.test(DEFAULT_HARNESS));

  // The recipe is where the detail lives, and it is fetched only on a match.
  const md = readFileSync(new URL("../viewer/recipes/shelf.md", import.meta.url), "utf8");
  for (const p of SHELF) {
    check(`#shelf documents ${p.id}`, md.includes(p.id), "on the shelf but not in the recipe");
  }
  // And nothing documented that does not exist. Two things are legitimately
  // not in this module's vocabulary: JavaScript's own methods, and the words
  // the VIEWER adds (text, stencil, the codes) which live in index.html rather
  // than the DSL — test/vocab.js is what holds those honest.
  const JS = ["map", "filter", "forEach", "slice", "join", "push", "Math", "Array"];
  const VIEWER = ["text", "stencil", "qrcode", "datamatrix", "barcode", "blend", "filament"];
  const shown = [...md.matchAll(/\b([a-z][A-Za-z0-9]*)\(/g)].map((m) => m[1]);
  const ghosts = [...new Set(shown)]
    .filter((n) => !(n in vocab) && !JS.includes(n) && !VIEWER.includes(n));
  check("the recipe teaches nothing that does not exist", ghosts.length === 0, ghosts.join(", "));
}

console.log("\nthe picker is wired to the index, not to a copy of it\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  for (const id of ["shelf", "shelf-row", "shelf-sub", "shelf-q", "shelf-list", "shelf-foot"]) {
    check(`#${id} exists`, HTML.includes(`id="${id}"`));
  }
  // The one thing that must never happen: the part list typed into the page.
  // A copy goes stale, and a stale shelf offers parts that no longer exist.
  check("the picker reads shelfIndex(), it does not hold its own list",
    /shelfIndex\(\)/.test(HTML));
  check("...loaded only when the shelf is opened",
    /await import\("\.\.\/src\/shelf\.js"\)/.test(HTML));
  const named = SHELF.filter((p) => new RegExp(`["'\`]${p.id}["'\`]`).test(HTML));
  check("no part id is hard-coded into the page", named.length === 0, named.map((p) => p.id).join(", "));

  check("clicking a part INSERTS at the caret rather than replacing the model",
    /code\.value = v\.slice\(0, at\) \+ snippet/.test(HTML));
  check("...and a cut goes in marked as one",
    /p\.cut \? `\$\{p\.sample\}   \/\/ subtract this`/.test(HTML));
  check("...and it is undoable", /pushHistory\(v\);[\s\S]{0,200}code\.value = v\.slice/.test(HTML));
  check("the search has an empty state rather than a blank panel", /shelf-none/.test(HTML));
  check("the list is keyboard-navigable", /e\.key === "ArrowDown"[\s\S]{0,300}highlight\(\)/.test(HTML));
  check("Enter takes whatever is highlighted", /all\[active\]\?\.click\(\)/.test(HTML));
  check("Escape closes it", /e\.key === "Escape"[\s\S]{0,80}toggleCard\(shelfCard/.test(HTML));
  check("the picker searches keywords, not just labels", /p\.keywords \|\| ""/.test(HTML));
  // An insert must survive a build that then fails to parse — the paste has
  // already happened and is undoable; losing it because the model broke is not
  // a trade anyone would choose.
  check("a failed rebuild does not swallow the insert",
    /try \{ rebuild\(\); \} catch/.test(HTML));
  check("the row does not go through the Toolbox delegate",
    !/<button id="shelf-row"[^>]*data-act/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
