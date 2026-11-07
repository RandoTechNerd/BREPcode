// The plain parts the in-browser model fills in (viewer/browserparts.js).
//
//   * every template, filled with a request's numbers, builds on the real
//     kernel into a part of the asked-for size with the asked-for holes;
//   * missing numbers (0) fall back to sane defaults that still build;
//   * a request goes to the right template, and one with a feature no
//     template draws (a T shape, a slot, rounded corners) goes to none;
//   * the form the model fills is held to numbers, and read defensively.

import { TEMPLATES, templateById, templateFor, fillAsk, readForm, fillTemplate, settle } from "../viewer/browserparts.js";
import { buildCode, metrics, judge } from "../scripts/mesh-metrics.mjs";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
}

console.log("\nbrowser parts: each template builds what was asked\n");
const cases = [
  ["plate", "a 40 by 60 mm plate 3 mm thick with four 4 mm holes in the corners", { length: 40, width: 60, thickness: 3, holes: 4, hole_d: 4 }, { size: [3, 40, 60], holes: 4 }],
  ["plate", "a plate 80 by 20 by 4 mm with a row of 3 holes", { length: 80, width: 20, thickness: 4, holes: 3, hole_d: 4 }, { size: [4, 20, 80], holes: 3 }],
  ["plate", "a 50 mm square plate with 9 holes in a 3 by 3 grid", { length: 50, width: 50, thickness: 3, holes: 9, hole_d: 3 }, { size: [3, 50, 50], holes: 9 }],
  ["plate", "a 60 mm plate with a 30 mm hole in the centre", { length: 60, width: 60, thickness: 5, holes: 1, hole_d: 30 }, { size: [5, 60, 60], holes: 1 }],
  ["plate", "a plain plate", { length: 0, width: 0, thickness: 0, holes: 0, hole_d: 0 }, { holes: 0 }],
  ["lbracket", "an L bracket 50 mm each side", { arm_a: 50, arm_b: 0, width: 20, thickness: 4, holes_per_arm: 2, hole_d: 4 }, { size: [20, 50, 50], holes: 4 }],
  ["lbracket", "an L bracket with no holes", { arm_a: 60, arm_b: 40, width: 25, thickness: 5, holes_per_arm: 0, hole_d: 0 }, { size: [25, 40, 60], holes: 0 }],
  ["box", "an open box 60 by 40 by 30 with 2 mm walls", { length: 60, width: 40, height: 30, wall: 2, floor: 0, lid: 0 }, { size: [30, 40, 60], holes: 0, hollow: true }],
  ["box", "a box 50 by 30 by 20 with a separate lid", { length: 50, width: 30, height: 20, wall: 2, floor: 0, lid: 1 }, { pieces: 2 }],
  ["tube", "a tube 25 mm outside, 21 inside, 60 long", { outer_d: 25, inner_d: 21, height: 60 }, { size: [25, 25, 60], holes: 1 }],
  ["tube", "a washer 16 mm with an 8 mm hole", { outer_d: 16, inner_d: 8, height: 1.5 }, { size: [1.5, 16, 16], holes: 1 }],
  ["tube", "a solid cylinder 40 wide 10 tall", { outer_d: 40, inner_d: 0, height: 10 }, { size: [10, 40, 40], holes: 0 }],
  ["tube", "a spacer for an 8 mm bolt", { outer_d: 0, inner_d: 8, height: 10 }, { dim: 10, holes: 1 }],
  ["lid", "a round lid 80 mm across 4 thick with a 10 mm knob", { diameter: 80, thickness: 4, knob_d: 10, knob_h: 0 }, { size: [null, 80, 80], holes: 0 }],
  ["frame", "a frame 80 by 60, 10 mm border, 5 thick", { length: 80, width: 60, border: 10, thickness: 5 }, { size: [5, 60, 80], holes: 1 }],
  ["block", "a 20 mm cube with a 10 mm hole", { length: 20, width: 0, height: 0, hole_d: 10 }, { size: [20, 20, 20], holes: 1 }],
  ["block", "a block 40 x 20 x 10", { length: 40, width: 20, height: 10, hole_d: 0 }, { size: [10, 20, 40], holes: 0 }],
  ["hex", "a hex nut 13 mm across flats, 5 thick, 6 mm hole", { flats: 13, thickness: 5, hole_d: 6 }, { size: [5, 13, 15.01], holes: 1, fill: [0.5, 0.7] }],
  ["wedge", "a wedge 50 long 30 wide rising to 20", { length: 50, width: 30, height: 20 }, { size: [20, 30, 50], holes: 0, fill: [0.45, 0.55] }],
  // a model that guessed a huge hole size: clamped so neighbouring holes stay apart
  ["lbracket", "an L bracket, two holes each arm", { arm_a: 50, arm_b: 50, width: 20, thickness: 4, holes_per_arm: 2, hole_d: 20 }, { holes: 4 }],
];
for (const [id, text, values, want] of cases) {
  const { code } = templateById(id).build(values, text);
  const b = await buildCode(code);
  if (!b.ok) { check(`${id}: ${text}`, false, b.error); continue; }
  const m = metrics(b.tris);
  const bad = judge(m, want);
  check(`${id}: ${text}`, !bad.length && b.lane === "exact", `${bad.join("; ")}${b.lane !== "exact" ? `; lane ${b.lane}` : ""}`);
}

console.log("\nbrowser parts: which template\n");
const routes = [
  ["a 40 by 60 mm plate with four holes", [], "plate"],
  ["an L bracket for a shelf", [], "lbracket"],
  ["something to hold a shelf up", ["shelf bracket", "angle bracket"], "lbracket"],
  ["an open box 60 by 40 by 30", [], "box"],
  ["a round lid with a knob", [], "lid"],
  ["a washer for an M8 bolt", [], "tube"],
  ["a 20 mm cube", [], "block"],
  ["a picture frame 80 by 60", [], "frame"],
  ["a T shaped plate", [], null],
  ["a plate with rounded corners", [], null],
  ["a box with a hinged lid", [], null],
  ["a stepped cylinder", [], null],
  ["a hexagonal nut", [], "hex"],
  ["a model of the Eiffel tower", ["eiffel tower"], null],
  ["a lid for my pot", [], "lid"],
  ["a hexagonal spacer 10 mm across flats", [], "hex"],
  ["a wedge 50 mm long", [], "wedge"],
  ["an L shaped plate 50 by 50", [], null],
  ["an L shaped bracket 40 mm", [], "lbracket"],
  ["a round tray 100 mm across", [], null],
  ["a round plate 60 mm across", [], "tube"],
];
for (const [text, names, want] of routes) {
  check(`"${text}" -> ${want ?? "no template"}`, (templateFor(text, names)?.id ?? null) === want, String(templateFor(text, names)?.id));
}

console.log("\nbrowser parts: the words settle what they say\n");
{
  // the model's form is all zeros here: only the words count
  const said = (id, text) => {
    const t = templateById(id);
    return settle(t, Object.fromEntries(Object.keys(t.fields).map((k) => [k, 0])), text);
  };
  const same = (a, b) => Object.entries(b).every(([k, v]) => a[k] === v);
  const words = [
    ["tube", "a cylinder 30 mm tall and 20 mm across with a 6 mm hole through the middle", { outer_d: 20, inner_d: 6, height: 30 }],
    ["tube", "a disc 50 mm across, 3 mm thick", { outer_d: 50, inner_d: 0, height: 3 }],
    ["tube", "a washer 16 mm across with an 8 mm hole, 1.5 mm thick", { outer_d: 16, inner_d: 8, height: 1.5 }],
    ["tube", "a ring 40 mm outside, 30 mm inside, 5 mm thick", { outer_d: 40, inner_d: 30, height: 5 }],
    ["tube", "a pipe spacer 10 mm long for an 8 mm bolt", { inner_d: 8, height: 10 }],
    ["plate", "a flat bar 120 mm long, 15 mm wide, 3 mm thick with a 5 mm hole at each end", { length: 120, width: 15, thickness: 3, holes: 2, hole_d: 5 }],
    ["plate", "a plate 50 x 50 x 3 mm with 9 holes 3 mm across in a 3 by 3 grid", { length: 50, width: 50, thickness: 3, holes: 9, hole_d: 3 }],
    ["plate", "a 30 mm square plate, 2 mm thick, with one 5 mm hole in the middle", { length: 30, width: 30, thickness: 2, holes: 1, hole_d: 5 }],
    ["lbracket", "an L bracket for a shelf, 50 mm each side, 4 mm thick, 20 mm wide, with two screw holes on each arm", { arm_a: 50, arm_b: 50, width: 20, thickness: 4, holes_per_arm: 2 }],
    ["lbracket", "an L bracket with a 60 mm arm and a 40 mm arm, 25 mm wide, 5 mm thick, no holes", { arm_a: 60, arm_b: 40, width: 25, thickness: 5, holes_per_arm: 0 }],
    ["box", "a small square bin 50 mm on each side and 50 mm tall, 2 mm walls", { length: 50, width: 50, height: 50, wall: 2 }],
    ["box", "a box 50 by 30 by 20 mm with a separate lid", { length: 50, width: 30, height: 20, lid: 1 }],
    ["frame", "a rectangular frame 80 by 60 mm, 10 mm wide border, 5 mm thick", { length: 80, width: 60, border: 10, thickness: 5 }],
    ["lid", "a round lid 80 mm across and 4 mm thick with a 10 mm knob in the middle on top", { diameter: 80, thickness: 4, knob_d: 10 }],
    ["hex", "a hexagonal nut shape 13 mm across flats, 5 mm thick, with a 6 mm hole", { flats: 13, thickness: 5, hole_d: 6 }],
    ["wedge", "a wedge 50 mm long, 30 mm wide, rising from 0 to 20 mm", { length: 50, width: 30, height: 20 }],
    ["plate", "a spacer plate 70 by 30 mm, 6 mm thick, with four M4 holes", { length: 70, width: 30, thickness: 6, holes: 4, hole_d: 4.5 }],
  ];
  for (const [id, text, want] of words) {
    const got = said(id, text);
    check(`${id}: ${text.slice(0, 60)}`, same(got, want), JSON.stringify(got));
  }
  // where the words say nothing, the model's number stands
  check("the model fills what the words leave open", settle(templateById("block"), { length: 25, width: 0, height: 0, hole_d: 0 }, "a cube 25 mm").length === 25);
  // ...but not a hole size: with none in the words, its guess (20 mm, the
  // bracket's own width) gives way to the template's default
  check("a hole size needs the words", settle(templateById("lbracket"), { arm_a: 50, arm_b: 50, width: 20, thickness: 4, holes_per_arm: 2, hole_d: 20 },
    "an L bracket with two screw holes on each arm").hole_d === 0);
}

console.log("\nbrowser parts: the form\n");
{
  const t = templateById("plate");
  const q = fillAsk(t, "a plate");
  check("every field is a required number", q.schema.required.length === Object.keys(t.fields).length
    && Object.values(q.schema.properties).every((p) => p.type === "number") && q.schema.additionalProperties === false);
  check("a filled form reads back", JSON.stringify(readForm('{"length": 40, "width": 60, "thickness": 3, "holes": 4, "hole_d": 4}', t))
    === JSON.stringify({ length: 40, width: 60, thickness: 3, holes: 4, hole_d: 4 }));
  check("missing and junk fields read as 0", readForm('{"length": "big", "width": 60}', t).length === 0 && readForm('{"length": "big", "width": 60}', t).width === 60);
  check("junk is no form", readForm("forty by sixty", t) === null);
  const done = await fillTemplate("an L bracket 50 mm each side with 5 mm holes", [], async () => '{"arm_a": 50, "arm_b": 0, "width": 20, "thickness": 4, "holes_per_arm": 2, "hole_d": 5}');
  check("fillTemplate writes the part", done?.template.id === "lbracket" && /const A = 50;/.test(done.code) && /const B = 50;/.test(done.code) && /HOLE_D = 5;/.test(done.code));
  check("...and no template, no question", await fillTemplate("a T shaped plate", [], async () => { throw new Error("asked"); }) === null);
  check("every template has a name and a field list", TEMPLATES.every((x) => x.names.length && Object.keys(x.fields).length));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
