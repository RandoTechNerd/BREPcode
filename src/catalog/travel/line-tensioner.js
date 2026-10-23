// A guy-line tensioner: a small flat plate with a row of holes. The line is
// knotted through the end hole, runs round the stake and back through the
// other two, and the bend between them holds it by friction until you slide
// the plate to tighten. One flat outline, printed flat.

export default {
  id: "line-tensioner",
  category: "travel",
  title: "Guy line tensioner",
  summary: "a flat three-hole tensioner that tightens and holds a tent guy line, tarp cord or clothesline.",
  print: "flat as shown, no supports. PETG or nylon outdoors.",
  names: ["guy line tensioner", "guyline tensioner", "line tensioner", "tent rope tensioner", "guy line adjuster", "guyline adjuster",
    "tent line tensioner", "rope tensioner", "cord tensioner", "tent tensioner"],
  nouns: ["tensioner", "adjuster", "tightener"],
  keywords: ["tent", "guy", "line", "cord", "rope", "tarp", "camping", "paracord", "clothesline"],
  fits: ["cable"],
  fromSpec: (s) => ({ cordD: s.dims.d }),
  primary: "cordD",
  tips: ["for 4 mm paracord", "longer", "two holes"],
  examples: ["I want a guy line tensioner", "make me a tent rope tensioner for paracord",
    "line tensioner for 3mm cord", "clothesline tensioner"],
  params: {
    cordD: { default: 3, min: 1, max: 9, unit: "mm", label: "line diameter (the holes are 0.8 mm bigger)", say: ["line", "cord", "rope", "diameter"] },
    holes: { default: 3, min: 2, max: 3, unit: "count", label: "holes", say: ["hole"] },
    length: { default: 38, min: 20, max: 80, unit: "mm", label: "length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 13, min: 7, max: 30, unit: "mm", label: "width", say: ["wide", "width"] },
    thick: { default: 3.5, min: 2, max: 7, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"] },
  },
  things: [
    { names: ["clothesline tensioner", "clothes line tightener", "washing line tensioner"], title: "Clothesline tensioner", params: { cordD: 4.2, length: 48, width: 16, thick: 4 } },
    { names: ["paracord tensioner", "paracord adjuster", "550 cord tensioner"], title: "Paracord tensioner", spec: "paracord" },
    { names: ["tarp line tensioner", "tarp tensioner", "tarp cord adjuster"], title: "Tarp tensioner", params: { cordD: 3.2, length: 42, width: 14 } },
    { names: ["thin cord tensioner", "ultralight guy line tensioner", "dyneema tensioner"], title: "Thin cord tensioner",
      params: { cordD: 1.6, length: 28, width: 9, thick: 2.6 } },
    { names: ["two hole tensioner", "2 hole line tensioner"], title: "Two-hole tensioner", params: { holes: 2, length: 30 } },
  ],
  body: `
const r = width / 2;
const h = Math.min(cordD + 0.8, width - 3);     // the hole: the line plus a little, 1.5 mm of plastic either side
const L = Math.max(length, holes * (h + 3) + 4);
const plate = hull(translate([-L / 2 + r, 0, 0], cylinder({ r, h: thick, $fn: 40 })), translate([L / 2 - r, 0, 0], cylinder({ r, h: thick, $fn: 40 })));
// holes spread from end to end, the outer two near the ends
const span = L - 2 * Math.max(r, h / 2 + 3);
const xs = holes === 2 ? [-span / 2, span / 2] : [-span / 2, 0, span / 2];
return difference(plate, ...xs.map((x) => translate([x, 0, -1], cylinder({ r: h / 2, h: thick + 2, $fn: 24 }))));
`,
};
