// A guitar yoke: a wall plate, an arm out from it, and a fork at the end the
// neck drops into so the headstock rests on the two prongs. Printed standing
// on its wall plate with the arm pointing up: the side profile (plate, arm,
// gussets, the raised tip that stops the headstock sliding off) is stretched
// across the fork's width, and the neck slot is cut straight down into it,
// so every wall is vertical and the tip's underside leans less than 45
// degrees. Size the gap from the instrument: it is the nut width plus room.

export default {
  id: "guitar-hanger",
  category: "wall",
  title: "Guitar hanger",
  summary: "a wall yoke the neck drops into, so the guitar hangs by its headstock.",
  print: "standing on its wall plate as shown, no supports. PETG; screw it into a stud or a plywood board.",
  names: ["guitar hanger", "guitar wall mount", "guitar hook", "guitar holder", "guitar wall hanger",
    "guitar mount", "guitar wall holder", "guitar yoke", "instrument hanger"],
  nouns: ["hanger", "mount", "hook", "holder", "yoke"],
  keywords: ["guitar", "wall", "instrument", "music", "headstock", "neck"],
  fits: ["neck"],
  fromSpec: (s) => ({ neckGap: s.dims.w + 7 }),
  specNote: "the gap is the nut width plus 7 mm",
  primary: "neckGap",
  tips: ["for a bass", "100 mm off the wall", "wider fork"],
  examples: ["I want a guitar hanger", "make me a guitar wall mount for my acoustic guitar",
    "guitar hook that holds it 100mm off the wall", "a wall hanger for my ukulele"],
  params: {
    neckGap: { default: 50, min: 20, max: 80, unit: "mm", label: "gap between the prongs", say: ["gap", "neck", "between", "nut"], more: ["wider"], less: ["narrower"] },
    width: { default: 90, min: 50, max: 140, unit: "mm", label: "overall fork width", say: ["wide", "width", "fork"] },
    reach: { default: 85, min: 50, max: 160, unit: "mm", label: "how far it holds it off the wall", say: ["reach", "out", "off", "deep", "depth", "long"], more: ["longer", "deeper"], less: ["shorter"] },
    armT: { default: 18, min: 10, max: 30, unit: "mm", label: "arm thickness", say: ["thick", "thickness", "arm"], more: ["stronger", "thicker", "sturdier"] },
    tipH: { default: 12, min: 0, max: 25, unit: "mm", label: "front tip height", say: ["tip", "lip"] },
    plateH: { default: 100, min: 60, max: 160, unit: "mm", label: "wall plate height", say: ["plate", "tall", "high", "height"] },
    plateT: { default: 8, min: 5, max: 14, unit: "mm", label: "wall plate thickness", say: ["back"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["electric guitar hanger", "electric guitar hook"], title: "Electric guitar hanger", spec: "neck-electric" },
    { names: ["acoustic guitar hanger", "acoustic guitar hook", "acoustic guitar wall mount"], title: "Acoustic guitar hanger",
      spec: "neck-acoustic", params: { reach: 100 } },
    { names: ["classical guitar hanger", "classical guitar hook", "nylon guitar hanger"], title: "Classical guitar hanger",
      spec: "neck-classical", params: { width: 100, reach: 100 } },
    { names: ["bass hanger", "bass guitar hanger", "bass guitar hook", "bass wall mount"], title: "Bass hanger",
      spec: "neck-bass", params: { reach: 95, armT: 20 } },
    { names: ["ukulele hanger", "ukulele hook", "ukulele wall mount", "uke hanger", "uke hook"], title: "Ukulele hanger",
      spec: "neck-ukulele", params: { width: 70, reach: 65, armT: 14, plateH: 80 } },
    { names: ["violin hanger", "violin hook", "violin wall mount", "fiddle hanger"], title: "Violin hanger",
      spec: "neck-violin", params: { width: 60, reach: 60, armT: 12, plateH: 70 } },
    { names: ["mandolin hanger", "mandolin hook"], title: "Mandolin hanger", spec: "neck-mandolin", params: { width: 70, reach: 70, armT: 14 } },
    { names: ["banjo hanger", "banjo hook"], title: "Banjo hanger", spec: "neck-banjo", params: { reach: 110 } },
  ],
  body: `
// side profile: p runs out from the wall (up, as printed), q runs up the wall
const prong = Math.max(8, (width - neckGap) / 2);
const W = neckGap + 2 * prong;
const g = Math.min(armT, 22);                         // the gussets above and below the arm
const L = Math.max(reach, plateT + g + 30);
const tipL = Math.max(6, armT * 0.5);
const Hp = Math.max(plateH, armT + 2 * g + 6 * screwD);
const qB = armT / 2 - Hp / 2, qT = armT / 2 + Hp / 2;
const tip = tipH > 0
  ? [[L, armT + tipH], [L - tipL, armT + tipH], [L - tipL - 1.2 * tipH, armT]]   // the slope under the tip leans 40 degrees
  : [[L, armT]];
const outline = [
  [0, qB], [plateT, qB], [plateT, -g], [plateT + g, 0],
  [L, 0], ...tip,
  [plateT + g, armT], [plateT, armT + g], [plateT, qT], [0, qT],
];
// stretched across the fork, then stood up: p becomes z, q stays y
const body = translate([W / 2, 0, 0], rotate([0, -90, 0], linearExtrude({ h: W }, polygon(outline))));
// the neck slot, cut down from the top of the arm to just past the gussets
const pSlot = plateT + g + 2;
const neckSlot = translate([-neckGap / 2, qB - 1, pSlot], cube([neckGap, Hp + 2, L]));
// countersunk screws through the plate, above and below the arm
const k = Math.min(screwD / 2, plateT - 1.5);
const holes = [(qB - g) / 2, (qT + armT + g) / 2].flatMap((q) => [
  translate([0, q, -1], cylinder({ r: screwD / 2, h: plateT + 2, $fn: 24 })),
  translate([0, q, plateT - k + 0.02], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 })),
]);
return difference(body, neckSlot, ...holes);
`,
};
