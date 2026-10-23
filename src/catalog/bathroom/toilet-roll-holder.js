// A wall-mounted toilet roll arm: a plate that screws (or tapes) to the wall
// and a round post the roll's cardboard core slides over, with a gentle
// flare at the tip that keeps the roll from walking off. It prints lying on
// its wall plate, so the post grows straight up: the root cone, the flare
// (steeper than 45 degrees) and the hollow inside with its pointed roof all
// print without support.

export default {
  id: "toilet-roll-holder",
  category: "bathroom",
  title: "Toilet roll holder",
  summary: "a wall arm the toilet roll slides onto, with a flared tip, screwed or taped to the wall.",
  print: "lying on its wall plate as shown, the post straight up; no supports. PETG or PLA.",
  names: ["toilet paper holder", "toilet roll holder", "tp holder", "wall toilet paper holder", "toilet paper roll holder",
    "toilet tissue holder", "toilet paper holder arm", "wall mounted toilet paper holder", "toilet roll arm", "loo roll holder"],
  nouns: ["holder", "arm", "mount"],
  keywords: ["toilet", "tp", "tissue", "bathroom", "wall", "roll", "paper"],
  fits: ["core"],
  fromSpec: (s) => ({ postD: s.dims.d - 6 }),
  specNote: "the post is 6 mm smaller, so the roll spins freely",
  primary: "postD",
  tips: ["tape instead of screws", "longer for two rolls", "38 mm post"],
  examples: ["I want a toilet paper holder", "make me a toilet roll holder with tape",
    "wall mounted toilet paper holder with screws", "a tp holder for the bathroom"],
  params: {
    postD: { default: 36, min: 20, max: 50, unit: "mm", label: "post diameter (a toilet roll core is about 42 mm inside)", say: ["post", "diameter", "across"], more: ["thicker", "fatter"], less: ["thinner"] },
    postL: { default: 125, min: 60, max: 245, unit: "mm", label: "post length out from the wall", say: ["long", "length", "out", "arm"], more: ["longer"], less: ["shorter"] },
    flare: { default: 2.5, min: 0, max: 6, unit: "mm", label: "how far the tip flares out (radius)", say: ["flare", "tip", "lip", "stop"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "post wall thickness", say: ["wall"], more: ["stronger"] },
    plateW: { default: 50, min: 40, max: 120, unit: "mm", label: "wall plate width", say: ["plate", "wide", "width"] },
    plateH: { default: 96, min: 60, max: 180, unit: "mm", label: "wall plate height", say: ["tall", "high", "height"] },
    plateT: { default: 5, min: 3, max: 10, unit: "mm", label: "wall plate thickness", say: ["thick", "thickness"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
    mount: { default: "screws", unit: "choice", choices: ["screws", "tape"], label: "how it mounts",
      words: { tape: ["tape", "adhesive", "stick on", "no screws", "no drilling", "command strip", "sticky"], screws: ["screws", "screw", "screwed"] } },
  },
  things: [
    { names: ["adhesive toilet paper holder", "stick on toilet paper holder", "no drill toilet paper holder", "tape on toilet roll holder"],
      title: "Adhesive toilet paper holder", params: { mount: "tape", plateW: 60, plateH: 90 } },
    { names: ["rv toilet paper holder", "camper toilet paper holder", "boat toilet paper holder", "van toilet paper holder"],
      title: "RV toilet paper holder", spec: "bath-toilet-roll-core", params: { flare: 4.5, postL: 120, mount: "screws", plateW: 46, plateH: 90 } },
    { names: ["spare roll wall holder", "spare toilet paper wall holder", "double toilet paper holder", "two roll toilet paper holder"],
      title: "Spare roll wall holder", spec: "bath-toilet-roll-core", params: { postL: 230, wall: 4, plateW: 60, plateH: 120, plateT: 6 } },
    { names: ["wall paper towel holder", "wall mounted paper towel holder", "kitchen roll wall holder", "under cabinet paper towel holder"],
      title: "Wall paper towel holder", spec: "bath-paper-towel-core", params: { postD: 36, postL: 245, wall: 4, plateW: 60, plateH: 120, plateT: 6 } },
    { names: ["toilet paper holder for cabinet", "cabinet side toilet paper holder", "vanity toilet paper holder"],
      title: "Cabinet-side toilet paper holder", params: { plateW: 44, plateH: 80, plateT: 4, screwD: 3.5 } },
    { names: ["mega roll toilet paper holder", "jumbo toilet paper holder", "large roll toilet paper holder", "mega roll holder"],
      title: "Mega roll toilet paper holder", params: { postL: 150, wall: 3.5, plateW: 56, plateH: 104 } },
  ],
  body: `
// print = lying on the wall plate: the post points straight up (+z), out from the wall
const R = postD / 2;
const rootW = Math.min(6, plateT + 2);                // a cone at the root takes the load into the plate
const top = plateT + postL;
const fl = Math.max(0, flare), rise = fl * 1.25;      // the flare climbs steeper than 45 degrees
const band = Math.min(4, postL / 15);
const cap = Math.min(2, band);
const z0 = top - band - rise;
// the post's outside, lathed: root cone, shaft, flare, a short band and a chamfered end
const tip = fl >= 0.2 ? [[R, z0], [R + fl, z0 + rise]] : [];
const outside = revolve(360, polygon([
  [0, plateT - 0.5], [R + rootW, plateT - 0.5], [R + rootW, plateT], [R, plateT + rootW],
  ...tip, [R + fl, top - cap], [R + fl - cap, top], [0, top],
]));
// hollow inside, open to the wall side, with a 45 degree pointed roof
const ri = Math.max(2, R - wall);
const roofZ = top - Math.max(3, wall) - ri;
const inside = revolve(360, polygon([[0, -1], [ri, -1], [ri, roofZ], [0, roofZ + ri]]));

// the wall plate, with its top edge chamfered on the room side
const hp = Math.max(plateH, postD + 2 * rootW + (mount === "screws" ? 6 * screwD + 12 : 6));
const rc = Math.min(10, plateW / 4), ch = Math.min(1.2, plateT / 3);
const corners = (r1, r2, z, h) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
  translate([sx * (plateW / 2 - rc), sy * (hp / 2 - rc), z], cylinder({ r1, r2, h, $fn: 32 })));
const plate = hull(...corners(rc, rc, 0, plateT - ch), ...corners(rc, rc - ch, plateT - ch, ch));

let part = difference(union(plate, outside), inside);
if (mount === "screws") {
  const r = screwD / 2;
  const y = (hp / 2 + R + rootW) / 2;                 // halfway between the root and the plate end
  const holes = [-1, 1].flatMap((s) => [
    translate([0, s * y, -1], cylinder({ r, h: plateT + 2, $fn: 24 })),
    translate([0, s * y, plateT - r - 0.01], cylinder({ r1: r, r2: 2 * r, h: r + 0.02, $fn: 24 })),
  ]);
  part = difference(part, ...holes);
}
return part;
`,
};
