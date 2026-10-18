// A plate guard: a curved wall that clips onto a plate's rim, so food can be
// pushed against it and onto a spoon with one hand. The clip is a channel
// round the rim; its upper jaw slopes at 50 degrees, so the whole arc prints
// standing up without support: an arc of a cylinder with its inside turned out.

export default {
  id: "plate-guard",
  category: "access",
  title: "Plate guard",
  summary: "a curved wall that clips onto a plate's rim, so food can be pushed onto a spoon with one hand.",
  print: "upright as shown, no supports.",
  names: ["plate guard", "food guard", "plate guard for eating", "scoop plate guard", "plate rim guard", "food bumper",
    "plate surround", "one handed eating guard", "plate edge guard"],
  nouns: ["guard", "bumper"],
  keywords: ["plate", "food", "eating", "scoop", "spoon", "rim", "adaptive", "one", "hand"],
  fits: ["plate"],
  fromSpec: (s) => ({ plateD: s.dims.d, rimT: s.dims.t }),
  ask: { unless: ["plateD"], text: "How wide is the plate? Say “for a dinner plate” or give the diameter; I made it for a 9 inch (229 mm) plate." },
  tips: ["for a dinner plate", "taller", "rim 5 mm thick"],
  examples: ["I want a plate guard", "a food guard for a 10 inch dinner plate",
    "plate guard 40mm tall", "scoop plate guard for my kids plate"],
  params: {
    plateD: { default: 229, min: 120, max: 300, unit: "mm", label: "plate diameter", say: ["plate", "diameter", "across"] },
    rimT: { default: 4, min: 2, max: 10, unit: "mm", label: "rim thickness", say: ["rim", "thick", "thickness"] },
    guardH: { default: 30, min: 15, max: 60, unit: "mm", label: "wall height above the rim", say: ["tall", "high", "height", "wall"], more: ["taller", "higher"], less: ["lower"] },
    span: { default: 150, min: 60, max: 200, unit: "deg", label: "how far round the plate", say: ["span", "degree", "around", "round"] },
    gT: { default: 3, min: 2, max: 6, unit: "mm", label: "wall thickness", say: ["sturdy"], more: ["sturdier"] },
    jawL: { default: 8, min: 4, max: 20, unit: "mm", label: "how far the clip reaches under the plate", say: ["jaw", "clip", "under"] },
  },
  things: [
    { names: ["dinner plate guard", "large plate guard", "plate guard for dinner plate"], title: "Dinner plate guard", spec: "plate-dinner", params: { span: 120 } },
    { names: ["kids plate guard", "child plate guard", "toddler plate guard"], title: "Kids plate guard", spec: "plate-kids", params: { guardH: 25 } },
    { names: ["salad plate guard", "side plate guard", "small plate guard"], title: "Side plate guard", spec: "plate-salad" },
  ],
  body: `
// a turned cross-section, z up: lower jaw under the plate, a channel round the rim, a 50 degree upper jaw, the wall
const Rp = plateD / 2;
const ri = Rp + 0.5, ro = ri + gT;               // half a millimetre round the plate's edge
const jt = Math.max(2, gT * 0.8);                // lower jaw thickness
const z1 = jt, z2 = jt + rimT + 0.4;             // the channel
const uL = Math.max(3, gT + 1), z3 = z2 + uL * Math.tan(50 * Math.PI / 180);
const zt = z2 + guardH;
// everything inside the guard, turned about the plate's centre: one cutter
const inside = revolve({ $fn: 96 }, polygon([[0, -1], [Rp - jawL, -1], [Rp - jawL, z1], [ri, z1], [ri, z2], [ri - uL, z3], [ri - uL, zt + 1], [0, zt + 1]]));
// an arc of the outer cylinder, its ends square
const a = span * Math.PI / 180, n = Math.max(8, Math.round(span / 6)), Rw = ro + 5;
const wedge = polygon([[0, 0], ...Array.from({ length: n + 1 }, (_, i) => {
  const t = -a / 2 + a * i / n;
  return [Rw * Math.cos(t) / Math.cos(a / (2 * n)), Rw * Math.sin(t) / Math.cos(a / (2 * n))];
})]);
const arc = difference(intersection(cylinder({ r: ro, h: zt, $fn: 96 }), translate([0, 0, -1], linearExtrude({ h: zt + 2 }, wedge))), inside);
return translate([-(ro + (Rp - jawL) * Math.cos(Math.min(Math.PI, a) / 2)) / 2, 0, 0], arc);
`,
};
