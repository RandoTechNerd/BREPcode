// A finger guard for a computer or project fan: a square plate with the
// fan's own screw-hole spacing and a grille across the opening. The spacing
// comes from the fan's size (40 mm fans: 32, 80: 71.5, 120: 105, 140: 124.5),
// so asking for "an 80 mm fan" is all it takes. Flat, so it prints in one go.
//
// The patterns are chosen to build fast as well as to look right: rounded
// slots (the default) are a dozen cuts; rings need only two crossing spokes;
// round holes are many cuts and take a few seconds on big fans. A honeycomb
// or a square grid crossing every bar took the kernel minutes, so it is not
// offered.

export default {
  id: "fan-grill",
  category: "electronics",
  title: "Fan grill",
  summary: "a finger guard for 25 to 200 mm fans, with the fan's own hole spacing and slots, rings or round holes.",
  print: "flat as shown, no supports.",
  names: ["fan grill", "fan guard", "fan grille", "fan cover", "fan finger guard", "computer fan grill", "pc fan grill",
    "fan protector", "fan shroud grill", "case fan grill"],
  nouns: ["grill", "grille", "guard"],
  keywords: ["fan", "pc", "computer", "case", "cooling"],
  fits: ["fan"],
  fromSpec: (s) => ({ fanSize: s.dims.size, holeD: s.dims.hole }),
  primary: "fanSize",
  tips: ["for an 80 mm fan", "rings", "round holes", "thicker"],
  examples: ["make me a fan grill", "fan guard for a 120mm fan",
    "fan grill with rings for an 80 mm fan", "a 40mm fan grill"],
  params: {
    fanSize: { default: 120, min: 25, max: 200, unit: "mm", label: "fan size", say: ["fan", "size"], more: ["bigger"], less: ["smaller"] },
    plateT: { default: 2, min: 1.2, max: 5, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"] },
    barW: { default: 1.8, min: 1, max: 4, unit: "mm", label: "bar width between openings", say: ["bar", "rib"] },
    gapW: { default: 7, min: 3, max: 15, unit: "mm", label: "opening width", say: ["gap", "opening", "spacing"] },
    holeD: { default: 4.3, min: 2.5, max: 5.5, unit: "mm", label: "screw hole diameter", say: ["hole", "screw"] },
    pattern: { default: "slots", unit: "choice", choices: ["slots", "rings", "holes"], label: "grille pattern",
      words: { rings: ["rings", "circles", "concentric", "spokes"], holes: ["round holes", "holes", "perforated", "dots"], slots: ["slots", "louvres", "louvers", "lines"] } },
  },
  things: [
    { names: ["40mm fan grill", "40mm fan guard", "40 mm fan grill"], title: "40 mm fan grill", spec: "fan-40" },
    { names: ["60mm fan grill", "60mm fan guard"], title: "60 mm fan grill", spec: "fan-60" },
    { names: ["80mm fan grill", "80mm fan guard", "80 mm fan grill"], title: "80 mm fan grill", spec: "fan-80" },
    { names: ["92mm fan grill", "92mm fan guard"], title: "92 mm fan grill", spec: "fan-92" },
    { names: ["120mm fan grill", "120mm fan guard", "120 mm fan grill"], title: "120 mm fan grill", spec: "fan-120" },
    { names: ["140mm fan grill", "140mm fan guard", "140 mm fan grill"], title: "140 mm fan grill", spec: "fan-140" },
    { names: ["ring fan grill", "classic fan grill", "concentric fan guard"], title: "Ring fan grill", params: { pattern: "rings" } },
    { names: ["perforated fan grill", "round hole fan grill", "fan dust grill"], title: "Perforated fan grill", spec: "fan-80", params: { pattern: "holes", gapW: 5 } },
    { names: ["3d printer fan guard", "hotend fan guard", "small fan guard"], title: "Small fan guard", spec: "fan-40", params: { gapW: 4, barW: 1.2 } },
  ],
  body: `
// standard hole spacing for a fan of this size, in between the sizes by interpolation
const spacingFor = (s) => {
  const t = [[25, 20], [30, 24], [40, 32], [50, 40], [60, 50], [70, 60], [80, 71.5], [92, 82.5], [120, 105], [140, 124.5], [200, 154]];
  for (let i = 1; i < t.length; i++) {
    if (s <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (s - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
  }
  return t[t.length - 1][1];
};
const sp = spacingFor(fanSize);
const r = Math.max(2, fanSize * 0.08);
const plate = hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * (fanSize / 2 - r), sy * (fanSize / 2 - r), 0], cylinder({ r, h: plateT, $fn: 24 }))));
const screws = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => translate([sx * sp / 2, sy * sp / 2, -1], cylinder({ d: holeD, h: plateT + 2, $fn: 20 })));
// the opening stays clear of the screw holes
const R = Math.min(fanSize * 0.46, sp / 2 * Math.SQRT2 - holeD / 2 - 1.6);
const g = Math.min(gapW, R);
const pitch = g + barW;
const through = (shape) => translate([0, 0, -1], shape);
if (pattern === "rings") {
  const rings = [];
  for (let rr = R - pitch; rr > g; rr -= pitch) {
    rings.push(difference(cylinder({ r: rr, h: plateT, $fn: 96 }), through(cylinder({ r: rr - barW, h: plateT + 2, $fn: 96 }))));
  }
  const spokes = [0, 90].map((a) => rotate([0, 0, a], translate([-R - 0.5, -barW / 2, 0], cube([2 * R + 1, barW, plateT]))));
  return union(difference(plate, ...screws, through(cylinder({ r: R, h: plateT + 2, $fn: 96 }))),
    ...rings, ...spokes, cylinder({ r: Math.max(g * 0.6, 3), h: plateT, $fn: 32 }));
}
const cuts = [];
if (pattern === "holes") {
  const dy = pitch * 0.866;
  for (let j = -Math.ceil(R / dy); j <= Math.ceil(R / dy); j++) {
    for (let i = -Math.ceil(R / pitch) - 1; i <= Math.ceil(R / pitch) + 1; i++) {
      const x = i * pitch + (j % 2 ? pitch / 2 : 0), y = j * dy;
      if (Math.hypot(x, y) + g / 2 <= R) cuts.push(through(translate([x, y, 0], cylinder({ d: g, h: plateT + 2, $fn: 20 }))));
    }
  }
} else {
  // rounded slots, each as long as the circle allows at its row
  for (let k = -Math.floor(R / pitch); k <= Math.floor(R / pitch); k++) {
    const y = k * pitch;
    const hl = Math.sqrt(Math.max(0, R * R - (Math.abs(y) + g / 2) ** 2)) - g / 2;
    if (hl <= 0.2) continue;
    cuts.push(through(hull(translate([-hl, y, 0], cylinder({ d: g, h: plateT + 2, $fn: 24 })), translate([hl, y, 0], cylinder({ d: g, h: plateT + 2, $fn: 24 })))));
  }
}
return difference(plate, ...screws, ...cuts);
`,
};
