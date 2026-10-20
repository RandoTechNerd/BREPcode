// A case for a development board: a tray with posts at the board's own
// mounting holes (the screws self-tap into them), port openings cut down
// from the rim so the lid closes their tops with nothing to bridge, and a
// lid with a locating lip and optional vents. Boards with no mounting holes
// rest on a ledge round the inside instead.
//
// Hole patterns are from the boards' own drawings: the Pi 3/4/5's four
// holes sit 3.5 mm in from one end, NOT centred on its 85 mm length, and the
// Arduino Uno's are not a rectangle at all (pattern "uno").

export default {
  id: "pcb-case",
  category: "electronics",
  title: "Board case",
  summary: "a case for a Raspberry Pi, Arduino, Pico or any board: posts at its mounting holes, port openings and a vented lid.",
  print: "tray upright, lid beside it with its lip up, no supports.",
  names: ["raspberry pi case", "pi case", "arduino case", "pcb case", "circuit board case", "dev board case",
    "board enclosure", "microcontroller case", "pcb enclosure", "raspberry pi enclosure", "arduino enclosure",
    "development board case", "pi enclosure"],
  nouns: ["case", "enclosure", "housing"],
  keywords: ["raspberry", "pi", "arduino", "pcb", "board", "esp32", "pico", "electronics"],
  fits: ["pcb"],
  fromSpec: (s) => {
    const d = s.dims;
    return { boardW: d.w, boardD: d.d, holeDX: d.hx || 0, holeDY: d.hy || 0, holeX0: d.x0 || 3.5, holeD: d.hole || 2.7, pattern: s.pattern || "rect" };
  },
  ask: {
    unless: ["boardW"],
    text: "Which board is it for? Name it (“for a Pi Zero”, “Arduino Uno”, “Pico”) and I’ll put the posts on its holes; I used a Raspberry Pi 4.",
  },
  tips: ["for a Pi Zero", "for an Arduino Uno", "taller", "with vents"],
  examples: ["make me a raspberry pi case", "a case for my arduino uno",
    "pi zero case with vents", "pcb case for a board 70 x 50"],
  triple: ["boardW", "boardD"],
  params: {
    boardW: { default: 85, min: 20, max: 160, unit: "mm", label: "board length", say: ["long", "length", "wide", "width"] },
    boardD: { default: 56, min: 15, max: 120, unit: "mm", label: "board width", say: ["deep", "depth"] },
    holeDX: { default: 58, min: 0, max: 150, unit: "mm", label: "hole spacing along the board (0 = no holes)", say: ["spacing"] },
    holeDY: { default: 49, min: 0, max: 110, unit: "mm", label: "hole spacing across the board", say: ["across"] },
    holeX0: { default: 3.5, min: 1, max: 40, unit: "mm", label: "first hole in from the board's end", say: ["offset", "inset"] },
    holeD: { default: 2.7, min: 1.8, max: 3.5, unit: "mm", label: "mounting hole diameter", say: ["hole", "screw"] },
    postH: { default: 5, min: 3, max: 15, unit: "mm", label: "post height under the board", say: ["post", "standoff", "lift"] },
    headroom: { default: 22, min: 6, max: 60, unit: "mm", label: "room above the board", say: ["tall", "high", "height", "room", "clearance", "headroom"], more: ["taller"], less: ["lower", "slimmer"] },
    endCut: { default: 50, min: 0, max: 110, unit: "mm", label: "port opening in the far end (0 = none)", say: ["end", "usb", "ethernet"] },
    sideCut: { default: 50, min: 0, max: 150, unit: "mm", label: "port opening along the front (0 = none)", say: ["side", "front", "hdmi"] },
    vents: { default: 6, min: 0, max: 16, unit: "count", label: "vent slots in the lid", say: ["vent", "vents", "slot"] },
    wall: { default: 2, min: 1.6, max: 3.5, unit: "mm", label: "wall thickness", say: ["wall"] },
    pattern: { default: "rect", unit: "choice", choices: ["rect", "uno"], label: "hole pattern",
      words: { uno: ["uno", "arduino uno", "leonardo"], rect: ["rectangle", "rect"] } },
  },
  things: [
    { names: ["raspberry pi 4 case", "pi 4 case", "raspberry pi 4 enclosure"], title: "Raspberry Pi 4 case", spec: "pcb-pi4" },
    { names: ["raspberry pi 5 case", "pi 5 case", "raspberry pi 5 enclosure"], title: "Raspberry Pi 5 case", spec: "pcb-pi5", params: { headroom: 26, vents: 10 } },
    { names: ["raspberry pi 3 case", "pi 3 case", "raspberry pi 3 enclosure"], title: "Raspberry Pi 3 case", spec: "pcb-pi3" },
    { names: ["pi zero case", "raspberry pi zero case", "pi zero 2 case", "pi zero enclosure"], title: "Pi Zero case", spec: "pcb-pizero",
      params: { headroom: 10, endCut: 0, sideCut: 45, vents: 4 } },
    { names: ["pi pico case", "raspberry pi pico case", "pico case", "rp2040 case"], title: "Pi Pico case", spec: "pcb-pico",
      params: { headroom: 8, endCut: 12, sideCut: 0, vents: 0 } },
    { names: ["arduino uno case", "uno case", "arduino uno enclosure", "leonardo case"], title: "Arduino Uno case", spec: "pcb-uno",
      params: { headroom: 18, endCut: 0, sideCut: 0, vents: 4 } },
    { names: ["esp32 case", "esp32 devkit case", "esp32 dev board case"], title: "ESP32 DevKit case", spec: "pcb-esp32-devkit",
      params: { headroom: 12, endCut: 14, sideCut: 0, vents: 4 } },
    { names: ["arduino nano case", "nano case"], title: "Arduino Nano case", spec: "pcb-nano", params: { headroom: 10, endCut: 12, sideCut: 0, vents: 0 } },
    { names: ["wemos d1 mini case", "d1 mini case"], title: "Wemos D1 mini case", spec: "pcb-d1-mini", params: { headroom: 10, endCut: 14, sideCut: 0, vents: 2 } },
  ],
  body: `
const gap = Math.max(1, wall / 2);                   // room round the board
const floor = Math.max(1.6, wall);
const iw = boardW + 2 * gap, id = boardD + 2 * gap;
const W = iw + 2 * wall, D = id + 2 * wall;
const boardZ = floor + postH;                        // underside of the board
const H = boardZ + 1.6 + headroom;
const rounded = (w, d, h, r, z = 0) => hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * (w / 2 - r), sy * (d / 2 - r), z], cylinder({ r, h, $fn: 24 }))));
const x0 = -boardW / 2, y0 = -boardD / 2;            // the board's corner
const holes = pattern === "uno"
  ? [[14.0, 2.5], [15.3, 50.6], [66.0, 17.8], [66.0, 45.7]].map(([x, y]) => [x0 + x, y0 + y])
  : holeDX > 0 && holeDY > 0
    ? [[0, 0], [holeDX, 0], [0, holeDY], [holeDX, holeDY]].map(([x, y]) => [x0 + holeX0 + x, -holeDY / 2 + y])
    : [];
const od = Math.max(holeD * 2.2, holeD + 3);
const supports = holes.length
  ? holes.map(([x, y]) => difference(
      translate([x, y, floor - 0.01], cylinder({ d: od, h: postH + 0.01, $fn: 24 })),
      translate([x, y, floor + 0.6], cylinder({ d: holeD - 0.5, h: postH, $fn: 16 }))))
  // no holes: the board rests on a ledge round the inside
  : [difference(rounded(iw + 0.02, id + 0.02, postH + 0.01, 1, floor - 0.01), translate([0, 0, -1], rounded(iw - 3, id - 3, postH + floor + 2, 0.5)))];
const tray = union(difference(rounded(W, D, H, 3), rounded(iw, id, H, 1, floor)), ...supports);
// port openings, cut down from the rim to just below the board's top face
const portZ = boardZ + 1.1;
const cuts = [];
const ec = Math.min(endCut, id - 2);
if (ec > 0) cuts.push(translate([W / 2 - wall - 1, -ec / 2, portZ], cube([wall + 2, ec, H])));
const sc = Math.min(sideCut, iw - 4);
if (sc > 0) cuts.push(translate([-iw / 2 + 2, -D / 2 - 1, portZ], cube([sc, wall + 2, H])));
const caseBody = cuts.length ? difference(tray, ...cuts) : tray;
// the lid: a plate with a lip that drops inside the walls, and vent slots
const fit = Math.min(0.3, wall / 5), lipT = Math.max(1.2, wall * 0.6), lipH = Math.min(3, headroom - 1);
const lid = union(
  rounded(W, D, 2, 3),
  difference(rounded(iw - 2 * fit, id - 2 * fit, lipH + 0.01, 1, 1.99), rounded(iw - 2 * fit - 2 * lipT, id - 2 * fit - 2 * lipT, lipH + 1, 0.5, 1.5)),
);
const vlen = Math.max(4, id * 0.55);
const vp = Math.max(5, wall + 3);
const nv = Math.min(vents, Math.floor((iw - 10) / vp));
const slots = Array.from({ length: Math.max(0, nv) }, (_, i) =>
  translate([(i - (nv - 1) / 2) * vp, 0, -1], hull(translate([0, -vlen / 2, 0], cylinder({ d: 2.4, h: 5, $fn: 12 })), translate([0, vlen / 2, 0], cylinder({ d: 2.4, h: 5, $fn: 12 })))));
const lidDone = slots.length ? difference(lid, ...slots) : lid;
return group(caseBody, translate([0, D + 10, 0], lidDone));
`,
};
