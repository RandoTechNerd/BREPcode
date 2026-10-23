// A general electronics enclosure: a box with screw posts in its corners and
// a flat lid that screws down onto them. The lid can carry holes for panel
// buttons or switches, the long walls can carry vent slots, and a cable notch
// opens down from the rim of one end so the lid closes it into a hole with no
// bridge to print. The lid prints beside the box, outside face up so the
// screw countersinks open upward.

export default {
  id: "project-box",
  category: "electronics",
  title: "Project box",
  summary: "an electronics enclosure with corner screw posts, a screw-down lid, and optional vents, panel holes and a cable notch.",
  print: "box upright, lid beside it outside face up, no supports. M3 screws self-tap into the posts.",
  names: ["project box", "project enclosure", "electronics enclosure", "electronics box", "enclosure box",
    "circuit box", "electronics case", "diy enclosure", "control box", "button box", "switch box",
    "electronics project box", "sensor box"],
  nouns: ["enclosure", "case", "housing"],
  keywords: ["electronics", "project", "lid", "screw", "circuit", "arduino", "esp32", "vent", "button"],
  triple: ["width", "depth", "height"],
  tips: ["120 x 80 x 40", "4 button holes", "6 vents", "cable hole 8 mm"],
  examples: ["make me a project box", "electronics enclosure 120 x 80 x 40",
    "a button box with 4 holes for 16mm buttons", "project box with vents and a cable hole"],
  params: {
    width: { default: 80, min: 30, max: 220, unit: "mm", label: "outside width", say: ["wide", "width", "long", "length"], more: ["wider", "longer"], less: ["narrower"] },
    depth: { default: 60, min: 25, max: 180, unit: "mm", label: "outside depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    height: { default: 35, min: 15, max: 120, unit: "mm", label: "box height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter", "lower"] },
    wall: { default: 2, min: 1.6, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    cornerR: { default: 4, min: 1, max: 6, unit: "mm", label: "corner radius", say: ["corner", "round"] },
    vents: { default: 0, min: 0, max: 12, unit: "count", label: "vent slots per long side", say: ["vent", "vents", "slot"] },
    holes: { default: 0, min: 0, max: 8, unit: "count", label: "panel holes in the lid", say: ["hole", "holes", "button", "switch"] },
    holeD: { default: 16, min: 6, max: 30, unit: "mm", label: "panel hole diameter", say: ["button", "switch", "panel"] },
    cableD: { default: 0, min: 0, max: 20, unit: "mm", label: "cable notch in one end (0 = none)", say: ["cable", "cord", "gland", "wire"] },
    tabs: { default: "no", unit: "choice", choices: ["no", "yes"], label: "mounting tabs",
      words: { no: ["no tabs", "without tabs"], yes: ["tabs", "mounting tabs", "ears", "wall mount", "screw tabs"] } },
  },
  things: [
    { names: ["small project box", "mini project box", "small electronics box"], title: "Small project box", params: { width: 60, depth: 40, height: 25 } },
    { names: ["large project box", "big electronics enclosure", "large electronics box"], title: "Large project box", params: { width: 160, depth: 110, height: 60, wall: 2.4 } },
    { names: ["esp32 enclosure", "esp32 box", "esp8266 enclosure", "wemos enclosure"], title: "ESP32 enclosure", params: { width: 70, depth: 45, height: 28, vents: 4, cableD: 6 } },
    { names: ["sensor enclosure", "vented sensor box", "weather sensor box", "temperature sensor box"], title: "Sensor enclosure", params: { width: 70, depth: 50, height: 30, vents: 8, cableD: 6, tabs: "yes" } },
    { names: ["sim racing button box", "push button box", "switch panel box", "panel button box"], title: "Button box",
      params: { width: 160, depth: 90, height: 50, holes: 6, holeD: 24, cableD: 8 } },
    { names: ["junction enclosure", "wire splice box", "low voltage box"], title: "Low-voltage splice box", params: { width: 90, depth: 60, height: 35, cableD: 8, tabs: "yes" } },
    { names: ["relay box", "relay enclosure", "power supply enclosure"], title: "Relay enclosure", params: { width: 110, depth: 70, height: 45, vents: 6, cableD: 10, tabs: "yes" } },
  ],
  body: `
const pr = Math.max(3.2, wall + 1.2);                // corner post radius, round an M3 self-tapping screw
const rr = Math.min(cornerR, wall + pr);             // the posts nest into the corners
const rounded = (w, d, h, r, z = 0) => hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * (w / 2 - r), sy * (d / 2 - r), z], cylinder({ r, h, $fn: 32 }))));
const floor = wall;
const iw = width - 2 * wall, id = depth - 2 * wall;
const px = width / 2 - wall - pr + 0.8, py = depth / 2 - wall - pr + 0.8;
const posts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => translate([sx * px, sy * py, floor - 0.01], cylinder({ r: pr, h: height - floor + 0.01, $fn: 24 })));
const parts = [difference(rounded(width, depth, height, rr), rounded(iw, id, height, Math.max(0.5, rr - wall), floor)), ...posts];
if (tabs === "yes") {
  for (const s of [-1, 1]) parts.push(difference(
    translate([s > 0 ? width / 2 - 0.5 : -width / 2 - 11.5, -Math.min(depth, 30) / 2, 0], cube([12, Math.min(depth, 30), wall * 1.5])),
    translate([s * (width / 2 + 6), 0, -1], cylinder({ d: 4.5, h: wall * 1.5 + 2, $fn: 20 }))));
}
const cuts = [...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => translate([sx * px, sy * py, floor + 2], cylinder({ d: 2.6, h: height, $fn: 16 })))];
// vents: tall narrow slots through both long walls
const ventH = Math.max(4, (height - floor) * 0.5);
const ventP = Math.max(5, wall + 3);
for (let i = 0; i < vents; i++) {
  const x = (i - (vents - 1) / 2) * ventP;
  if (Math.abs(x) > iw / 2 - pr * 2 - 2) continue;
  for (const s of [-1, 1]) cuts.push(translate([x - 1, s * (depth / 2 - wall / 2) - wall, floor + (height - floor - ventH) / 2], cube([2, 2 * wall, ventH])));
}
// a cable notch down from the rim of the +x end; the lid closes its top
if (cableD > 0) {
  const r = Math.min(cableD / 2, id / 2 - pr * 2, height - floor - 2) ;
  if (r > 0.5) cuts.push(translate([width / 2 - wall - 1, 0, height - r - 1], union(
    rotate([0, 90, 0], translate([0, 0, 0], cylinder({ r, h: wall + 2, $fn: 24 }))),
    translate([0, -r, 0], cube([wall + 2, 2 * r, r + 2])))));
}
const box = difference(union(...parts), ...cuts);
// the lid: a plate with countersunk holes over the posts and the panel holes
const lt = Math.max(2, wall);
const lidCuts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([sx, sy]) => [
  translate([sx * px, sy * py, -1], cylinder({ d: 3.4, h: lt + 2, $fn: 16 })),
  translate([sx * px, sy * py, lt - 1.4], cylinder({ r1: 1.7, r2: 3.1, h: 1.41, $fn: 16 })),
]);
const hd = Math.min(holeD, id - 4, iw - 4);
const hp = hd + 6;
const nh = Math.min(holes, Math.max(0, Math.floor((iw - 2 * pr - 4) / hp)));
for (let i = 0; i < nh; i++) lidCuts.push(translate([(i - (nh - 1) / 2) * hp, 0, -1], cylinder({ d: hd, h: lt + 2, $fn: 40 })));
const lid = difference(rounded(width, depth, lt, rr), ...lidCuts);
return group(box, translate([0, depth + 10, 0], lid));
`,
};
