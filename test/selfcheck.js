// The self-check (src/selfcheck.js): measure a model off the exact kernel's
// faces and diff it against the feature table the AI read off a picture.
// Every expected number here is worked out by hand from the code that
// builds the part.
//
//   node test/selfcheck.js

import { build, cube, cylinder, difference, union, translate, drill, hull, rotate } from "../index.js";
import { measureFaces, diffTable, classifyFace, eigSym3, expandFeatures, issuesText, diffSummary, measuredText } from "../src/selfcheck.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t;
const facesOf = async (shape) => (await build(shape, { engine: "split" })).solids.flatMap((s) => s.faces);

console.log("\nthe maths\n");
{
  const e = eigSym3([[2, 0, 0], [0, 3, 0], [0, 0, 1]]);
  check("eigenvalues ascending with their vectors", near(e[0].value, 1) && near(Math.abs(e[0].vector[2]), 1) && near(e[2].value, 3));
}

console.log("\nmeasuring a plate\n");
const PLATE = difference(cube([80, 50, 10]),
  drill([10, 10, 10], [0, 0, 1], { d: 6.6, through: true, cbore: { d: 11, depth: 4 } }),
  drill([70, 10, 10], [0, 0, 1], { d: 5.5, through: true, csink: { d: 11, angle: 90 } }),
  drill([40, 25, 10], [0, 0, 1], { d: 8, depth: 6 }),
  drill([0, 25, 5], [-1, 0, 0], { d: 4, depth: 12 }),
  translate([0, 0, -1], hull({ exact: true }, translate([30, 40, 0], cylinder({ d: 6, h: 12 })), translate([50, 40, 0], cylinder({ d: 6, h: 12 })))));
const m = measureFaces(await facesOf(PLATE));
const at = (x, y) => m.holes.find((h) => near(h.point[0], x, 0.01) && near(h.point[1], y, 0.01));
check("overall size", m.size.join() === "80,50,10", m.size.join());
check("four round holes found (the slot is not one)", m.holes.length === 4, String(m.holes.length));
const cb = at(10, 10), ck = at(70, 10), bl = at(40, 25), side = m.holes.find((h) => near(Math.abs(h.axis[0]), 1));
check("counterbore: Ø6.6 through, Ø11 x 4 at the top", cb && near(cb.d, 6.6) && cb.through && cb.cbore && near(cb.cbore.d, 11) && near(cb.cbore.depth, 4), JSON.stringify(cb));
check("countersink: Ø5.5 through, Ø11 x 90°", ck && near(ck.d, 5.5) && ck.through && ck.csk && near(ck.csk.d, 11, 0.01) && ck.csk.angle === 90, JSON.stringify(ck));
check("blind Ø8 x 6, open at the top only", bl && near(bl.d, 8) && !bl.through && near(bl.depth, 6) && bl.open.filter(Boolean).length === 1, JSON.stringify(bl));
check("side hole along X: Ø4 x 12 at y 25, z 5", side && near(side.d, 4) && near(side.depth, 12) && near(side.point[1], 25) && near(side.point[2], 5), JSON.stringify(side));
check("the slot's round ends: two Ø6 half-turns 20 apart", m.slotEnds.filter((e) => near(e.d, 6)).length === 2
  && near(Math.abs(m.slotEnds[0].point[0] - m.slotEnds[1].point[0]), 20), JSON.stringify(m.slotEnds));
check("flat faces are listed for edits", m.planes.some((p) => near(p.normal[2], 1) && near(p.offset, 10)) && /\+Z face at z = 10/.test(measuredText(m)));

console.log("\nthe diff\n");
const TABLE = {
  overall: { x: 80, y: 50, z: 10 },
  features: [
    { id: "A", type: "cbore", positions: [[10, 10, 10]], axis: "+z", dia: 6.6, depth: "thru", cbore: { d: 11, depth: 4 } },
    { id: "B", type: "csk", positions: [[70, 10, 10]], axis: "+z", dia: 5.5, depth: "thru", csk: { d: 11, angle: 90 } },
    { id: "C", type: "hole", positions: [[40, 25, 10]], axis: "+z", dia: 8, depth: 6 },
    { id: "D", type: "hole", positions: [[0, 25, 5]], axis: "-x", dia: 4, depth: 12 },
    { id: "E", type: "slot", positions: [[40, 40, 10]], axis: "+z", width: 6, length: 26, along: "x", depth: "thru" },
  ],
};
{
  const d = diffTable(TABLE, m);
  check("the table it was built from agrees completely", d.ok && d.score === 1 && d.checked >= 15, JSON.stringify(d.issues));
  check("...summarised in one line", /^all \d+ checks agree/.test(diffSummary(d)));
}
{
  const t = structuredClone(TABLE);
  t.features[0].dia = 6.2; t.features[2].depth = 8; t.features[3].positions[0][1] = 30;
  t.features.push({ id: "F", type: "hole", positions: [[40, 10, 10]], axis: "+z", dia: 5, depth: "thru" });
  t.overall.y = 52;
  const d = diffTable(t, m), msgs = issuesText(d);
  check("a wrong diameter is reported with both numbers", /A at .*diameter is 6.6, the table says 6.2/.test(msgs), msgs);
  check("a wrong depth", /C at .*depth is 6, the table says 8/.test(msgs));
  check("a hole in the wrong place is missing, with the nearest one named", /D at .*no Ø4 hole along X there; the nearest is Ø4 5 mm away/.test(msgs));
  check("a hole the model lacks", /F at .*no Ø5 hole/.test(msgs));
  check("the overall size", /overall Y is 50 mm, the table says 52/.test(msgs));
  check("a hole the table forgot is a note, not an issue", d.notes.some((n) => /Ø4 blind hole along X .*matches no table row/.test(n)));
}
{
  // the same table written with a centred origin: one frame note, no issues
  const t = structuredClone(TABLE);
  for (const f of t.features) f.positions = f.positions.map(([x, y, z]) => [x - 40, y - 25, z - 5]);
  const d = diffTable(t, m);
  check("a table in a centred frame still matches, with a frame note", d.ok && d.frame.hypothesis === "centred origin" && d.notes.some((n) => /different frame/.test(n)), JSON.stringify(d.frame));
}
{
  const t = structuredClone(TABLE);
  t.features[0].depth = 4;   // the cbore hole said blind
  t.features[1].csk = null; t.features[1].cbore = { d: 11, depth: 3 };
  const msgs = issuesText(diffTable(t, m));
  check("THRU vs blind", /A at .*should be 4 deep but goes through/.test(msgs), msgs);
  check("a counterbore where the model has a countersink", /B at .*counterbore is missing/.test(msgs));
}

console.log("\nfeatures in other directions\n");
{
  // a boss on a plate, and a hole through a rotated block
  const part = union(cube([60, 40, 6]), translate([30, 20, 0], cylinder({ d: 16, h: 20 })),
    difference(translate([0, 0, 0], cube([10, 40, 30])), drill([0, 20, 20], [-1, 0, 0], { d: 7, through: true })));
  const mm = measureFaces(await facesOf(part));
  const d = diffTable({ overall: { x: 60, y: 40, z: 30 }, features: [
    { id: "B", type: "boss", positions: [[30, 20, 6]], axis: "+z", dia: 16, height: 14 },
    { id: "H", type: "hole", positions: [[0, 20, 20]], axis: "-x", dia: 7, depth: "thru" },
  ] }, mm);
  check("a boss and a side hole through a wall", d.ok, JSON.stringify(d.issues));
  check("expandFeatures: one record per position", expandFeatures(TABLE).length === 5 && expandFeatures({ features: [{ positions: [[0, 0, 0], [1, 1, 1]] }] }).length === 2);
}
{
  // a tilted hole: the axis is found whatever its direction
  const part = difference(cube([40, 40, 20]), translate([20, 20, 10], rotate([30, 0, 0], translate([0, 0, -30], cylinder({ d: 6, h: 60 })))));
  const mm = measureFaces(await facesOf(part));
  const h = mm.holes[0];
  check("a hole tilted 30° about X: Ø6, axis (0, -0.5, 0.866)", h && near(h.d, 6) && near(Math.abs(h.axis[1]), 0.5, 1e-3) && near(Math.abs(h.axis[2]), Math.sqrt(3) / 2, 1e-3), JSON.stringify(h?.axis));
}
check("an unrecognisable face is 'other', not a guess", classifyFace({ positions: new Float32Array(3), normals: new Float32Array(3) }).kind === "other");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
