// A wedge: the door stop you kick under a door, a thinner one that holds a
// window open, or a flat shim that stops a table rocking. The side view is a
// ramp with grip ridges along its top, stretched across the width and printed
// lying on its flat bottom, so the ridges are just bumps on the top surface.
// A hole at the tall end hangs it on a hook when it is not in use.

export default {
  id: "door-wedge",
  category: "home",
  title: "Door wedge",
  summary: "a ridged wedge that holds a door or window open, or levels a wobbly table.",
  print: "lying on its bottom as shown, no supports. TPU grips best, PETG or PLA work.",
  names: ["door stop", "door wedge", "doorstop", "door stopper", "door stop wedge", "door jam wedge",
    "wedge door stop", "rubber door stop"],
  nouns: ["wedge", "stop", "stopper", "shim"],
  keywords: ["door", "window", "table", "floor", "wobbly", "level", "gap", "open"],
  triple: ["length", "width", "height"],
  tips: ["taller", "60 mm wide", "no ridges", "no hole"],
  examples: ["I want a door stop", "make me a door wedge 30mm tall",
    "a doorstop 150mm long", "a shim for a wobbly table"],
  params: {
    length: { default: 120, min: 30, max: 250, unit: "mm", label: "length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 40, min: 15, max: 120, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    height: { default: 30, min: 3, max: 80, unit: "mm", label: "height at the tall end", say: ["tall", "high", "height", "thick"], more: ["taller", "thicker"], less: ["lower", "thinner"] },
    tipH: { default: 2, min: 0.6, max: 15, unit: "mm", label: "height at the thin end", say: ["tip", "thin", "end"] },
    ridges: { default: 6, min: 0, max: 20, unit: "count", label: "grip ridges", say: ["ridge", "grip", "groove"] },
    ridgeH: { default: 1.5, min: 0.5, max: 4, unit: "mm", label: "ridge height", say: ["ridge"] },
    holeD: { default: 8, min: 0, max: 20, unit: "mm", label: "hanging hole (0 = none)", say: ["hole"] },
  },
  things: [
    { names: ["window wedge", "window stop", "sash wedge", "window lock wedge", "window prop"], title: "Window wedge",
      params: { length: 80, width: 25, height: 12, tipH: 1, ridges: 4, holeD: 5 } },
    { names: ["table shim", "wobbly table shim", "table leveler shim", "furniture shim", "leveling shim", "wobbly table fix"], title: "Table shim",
      params: { length: 60, width: 25, height: 6, tipH: 0.8, ridges: 0, holeD: 0 } },
    { names: ["heavy door stop", "big door stop", "large door wedge", "garage door stop"], title: "Heavy door stop",
      params: { length: 170, width: 60, height: 45, ridges: 8, ridgeH: 2, holeD: 12 } },
    { names: ["small door wedge", "mini door stop", "small door stop"], title: "Small door wedge",
      params: { length: 70, width: 25, height: 15, ridges: 4, holeD: 5 } },
    { names: ["carpet door stop", "door stop for carpet", "thick door wedge"], title: "Carpet door stop",
      params: { length: 140, width: 45, height: 40, ridges: 7, ridgeH: 2.5 } },
  ],
  body: `
// side view: x along the wedge, y up; stood up across the width
const h0 = Math.min(tipH, height - 0.5);
const slope = (x) => h0 + (height - h0) * x / length;
// ridges along the middle of the ramp, clear of the hole at the tall end
const w = Math.min(6, length * 0.5 / Math.max(1, ridges));     // never wider than their spacing
const xs = Array.from({ length: ridges }, (_, i) => length * 0.22 + (length * 0.5) * (i + 0.5) / ridges);
const bumps = xs.reverse().flatMap((x) => [[x + w / 2, slope(x + w / 2)], [x, slope(x) + ridgeH], [x - w / 2, slope(x - w / 2)]]);
const outline = [[0, 0], [length, 0], [length, height], ...bumps, [0, h0]];
// rotate([90, 0, 0]) stands the outline up: its y becomes z, and it extrudes toward -y
const wedge = translate([0, width, 0], rotate([90, 0, 0], linearExtrude({ h: width }, polygon(outline))));
const hx = length - Math.max(holeD, 6) / 2 - 6;
const shaped = holeD > 0 && hx > length * 0.75
  ? difference(wedge, translate([hx, width / 2, -1], cylinder({ r: holeD / 2, h: height + 2, $fn: 32 })))
  : wedge;
return translate([-length / 2, -width / 2, 0], shaped);
`,
};
