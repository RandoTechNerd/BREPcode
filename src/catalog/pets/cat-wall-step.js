// A wall step for cats to climb on (or, small, a ledge for a gecko or
// reptile). The step plate is the print bed's first layers, the back plate
// rises straight up from its rear edge and screws to the wall above the
// step, and a triangular gusset at each end ties the two together. A front
// lip and a shallow recess for a carpet pad are both plain vertical walls in
// this orientation, and the screw holes are small horizontal holes with a
// countersink on the step side, where the screwdriver goes.
//
// Built strong by default: an 8 mm step and 6 mm back. A cat lands hard.

export default {
  id: "cat-wall-step",
  category: "pets",
  title: "Cat wall step",
  summary: "a wall-mounted step or shelf for cats with end gussets, a front lip and a carpet-pad recess; small, a reptile ledge.",
  print: "upright as shown (step plate on the bed), no supports. PETG with 4+ walls and 40%+ infill; screw into studs or proper anchors with every hole, and press on it hard before a cat jumps on.",
  names: ["cat wall step", "cat step", "cat climbing step", "cat wall stair", "cat stair step", "wall step for cats",
    "cat wall perch", "cat climbing wall step", "cat wall ledge"],
  nouns: ["step", "perch", "shelf", "ledge"],
  keywords: ["cat", "wall", "climbing", "kitty", "reptile", "gecko", "terrarium"],
  primary: "length",
  tips: ["300 mm long", "deeper", "taller lip", "no carpet recess"],
  examples: ["I want a cat wall step", "make me a cat shelf 250mm long",
    "a cat climbing shelf with a lip", "gecko ledge for my terrarium"],
  params: {
    length: { default: 240, min: 60, max: 400, unit: "mm", label: "step length along the wall", say: ["long", "length", "wide", "width"], more: ["longer", "wider"], less: ["shorter", "narrower"] },
    depth: { default: 200, min: 40, max: 300, unit: "mm", label: "how far it sticks out", say: ["deep", "depth", "out"], more: ["deeper"], less: ["shallower"] },
    stepT: { default: 8, min: 3, max: 15, unit: "mm", label: "step plate thickness", say: ["thick", "thickness", "plate"], more: ["thicker", "stronger", "sturdier"] },
    backH: { default: 70, min: 25, max: 150, unit: "mm", label: "back plate height above the step", say: ["back", "tall", "high", "height"] },
    backT: { default: 6, min: 3, max: 12, unit: "mm", label: "back plate thickness", say: ["back"] },
    gusset: { default: 0.7, min: 0.3, max: 1, unit: "ratio", label: "how far the end gussets reach forward (share of the depth)" },
    lipH: { default: 15, min: 0, max: 40, unit: "mm", label: "front lip height (0 = none)", say: ["lip", "rail", "edge"] },
    recess: { default: 3, min: 0, max: 6, unit: "mm", label: "carpet pad recess depth (0 = none)", say: ["recess", "carpet", "pad"] },
    mount: { default: "screws", unit: "choice", choices: ["screws", "tape", "ties"], label: "screws, a flat back for tape or silicone, or zip-tie slots for cage bars",
      words: { tape: ["tape", "adhesive", "silicone", "glue", "no screws", "suction"], ties: ["zip tie", "zip ties", "cable tie", "cable ties", "cage"], screws: ["screw", "screws"] } },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["cat shelf", "cat wall shelf", "cat climbing shelf", "wall shelf for cats", "cat shelf step"], title: "Cat wall shelf",
      params: { length: 300, depth: 220, lipH: 20 } },
    { names: ["cat perch", "wall cat perch", "cat lookout perch", "cat wall bed", "cat resting perch"], title: "Cat perch",
      params: { length: 320, depth: 250, lipH: 30, backH: 90, stepT: 9 } },
    { names: ["kitten step", "small cat step", "kitten wall step", "senior cat step"], title: "Kitten step",
      params: { length: 180, depth: 150, lipH: 10, backH: 60, stepT: 6, backT: 5 } },
    { names: ["gecko ledge", "crested gecko ledge", "gecko perch", "gecko shelf", "gargoyle gecko ledge"], title: "Gecko ledge",
      params: { length: 90, depth: 60, stepT: 3, backH: 30, backT: 3, lipH: 4, recess: 0, mount: "tape", gusset: 0.8 } },
    { names: ["reptile ledge", "terrarium ledge", "reptile shelf", "reptile perch", "vivarium ledge", "chameleon ledge"], title: "Reptile ledge",
      params: { length: 160, depth: 100, stepT: 4, backH: 40, backT: 4, lipH: 6, recess: 0, mount: "tape" } },
    { names: ["basking ledge", "bearded dragon ledge", "basking platform", "basking shelf", "reptile basking ledge"], title: "Basking ledge",
      params: { length: 220, depth: 140, stepT: 5, backH: 50, backT: 4, lipH: 8, recess: 0, mount: "tape" } },
    { names: ["rat cage shelf", "cage shelf", "cage platform", "ferret cage shelf", "chinchilla ledge", "small animal cage shelf"], title: "Cage shelf",
      params: { length: 180, depth: 120, stepT: 5, backH: 50, backT: 5, lipH: 10, recess: 0, mount: "ties" } },
  ],
  body: `
// x along the wall, y out from it (back plate at y = 0), z up
const lip = Math.min(lipH, 60);
const lipT = lip > 0 ? Math.max(4, stepT * 0.6) : 0;
const gT = Math.max(5, backT);                              // gusset thickness
const gD = Math.max(backT + 5, gusset * depth);             // how far a gusset reaches out
const gH = Math.max(stepT + 5, backH * 0.9);                // and how high up the back
const across = (pts, w, x0) => translate([x0, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: w }, polygon(pts)))));
const parts = [
  cube([length, depth, stepT]),                             // the step
  cube([length, backT, stepT + backH]),                     // the back plate
  // end gussets: triangles in (y, z), standing up at each end
  across([[backT - 0.01, stepT - 0.01], [gD, stepT - 0.01], [backT - 0.01, stepT + gH]], gT, 0),
  across([[backT - 0.01, stepT - 0.01], [gD, stepT - 0.01], [backT - 0.01, stepT + gH]], gT, length - gT),
];
if (lip > 0) parts.push(translate([0, depth - lipT, stepT - 0.01], cube([length, lipT, lip + 0.01])));
const cuts = [];
// the carpet pad recess, inside the gussets and the lip
const rd = Math.min(recess, stepT - 2.4);
if (rd > 0.2) {
  const m = 4;
  const x0 = gT + m, x1 = length - gT - m, y0 = backT + m, y1 = depth - lipT - m;
  if (x1 - x0 > 10 && y1 - y0 > 10) cuts.push(translate([x0, y0, stepT - rd], cube([x1 - x0, y1 - y0, rd + 1])));
}
// fixings through the back plate, high enough to clear the gussets' feet
const nH = length > 200 ? 3 : 2;
const xs = Array.from({ length: nH }, (_, i) => gT + 12 + (length - 2 * gT - 24) * i / (nH - 1));
const zH = stepT + Math.max(backH * 0.6, Math.min(backH - 8, 15));
if (mount === "screws") {
  const k = Math.min(screwD / 2 + 0.5, backT - 1.5);
  for (const x of xs) {
    cuts.push(translate([x, -1, zH], rotate([-90, 0, 0], cylinder({ r: screwD / 2, h: backT + 2, $fn: 24 }))));
    cuts.push(translate([x, backT - k, zH], rotate([-90, 0, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k + 0.02, h: k + 0.02, $fn: 24 }))));
  }
} else if (mount === "ties") {
  // pairs of narrow slots: the tie goes out one, round a bar, and back in the other
  for (const x of xs) for (const dx of [-5, 3]) {
    cuts.push(translate([x + dx, -1, zH - 3], cube([2.5, backT + 2, 6])));
  }
}
const step = cuts.length ? difference(union(...parts), ...cuts) : union(...parts);
return translate([-length / 2, -depth / 2, 0], step);
`,
};
