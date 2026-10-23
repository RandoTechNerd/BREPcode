// A tube sized to a pole: a splint sleeve that slides over a broken tent pole
// section, or a cap for a pole's end or a trekking pole's tip. A cap prints
// closed end down, so it is a straight-walled cup with nothing overhanging.

export default {
  id: "pole-sleeve",
  category: "travel",
  title: "Pole repair sleeve",
  summary: "a splint sleeve for a broken tent pole, or an end cap for a tent or trekking pole.",
  print: "upright as shown (a cap closed end down), no supports. PETG or nylon.",
  names: ["pole repair sleeve", "tent pole repair sleeve", "tent pole splint", "pole repair tube", "tent pole repair",
    "pole splint", "tent pole sleeve", "pole sleeve"],
  nouns: ["sleeve", "splint", "cap"],
  keywords: ["tent", "pole", "camping", "trekking", "hiking", "broken", "repair"],
  fits: ["pole"],
  fromSpec: (s) => ({ poleD: s.dims.d }),
  primary: "poleD",
  tips: ["for 8.5 mm poles", "an end cap", "longer"],
  examples: ["I want a tent pole repair sleeve", "make me a tent pole splint for 9.5mm poles",
    "trekking pole tip protector", "tent pole end cap for 10mm poles"],
  params: {
    poleD: { default: 10.25, min: 3, max: 40, unit: "mm", label: "pole diameter", say: ["pole", "diameter", "tube"] },
    fit: { default: 0.3, min: 0, max: 1, unit: "mm", label: "clearance per side", say: ["fit", "clearance", "loose", "tight"] },
    wall: { default: 1.6, min: 1, max: 4, unit: "mm", label: "wall thickness", say: ["wall", "thick"], more: ["stronger", "thicker"] },
    length: { default: 100, min: 10, max: 200, unit: "mm", label: "length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    kind: { default: "sleeve", unit: "choice", choices: ["sleeve", "cap"], label: "open sleeve, or a cap closed at one end",
      words: { cap: ["cap", "end cap", "tip", "cover", "protector"], sleeve: ["sleeve", "splint", "repair"] } },
    floor: { default: 2, min: 1, max: 8, unit: "mm", label: "cap end thickness", say: ["floor"] },
  },
  things: [
    { names: ["tent pole cap", "tent pole end cap", "pole end cap", "pole tip cap"], title: "Tent pole end cap", params: { kind: "cap", length: 25 } },
    { names: ["trekking pole tip protector", "trekking pole cap", "hiking pole tip cover", "walking pole tip cover", "trekking pole tip cover"],
      title: "Trekking pole tip protector", params: { kind: "cap", poleD: 11, length: 35, floor: 5, wall: 2.4 } },
    { names: ["fiberglass pole splint", "fibreglass tent pole repair"], title: "Fiberglass pole splint", params: { poleD: 9.5, length: 110, wall: 2 } },
    { names: ["tent pole ferrule", "pole connector sleeve", "pole joiner"], title: "Pole joiner sleeve", params: { length: 60, wall: 1.8 } },
  ],
  body: `
const ri = poleD / 2 + fit;
const ro = ri + wall;
const outer = cylinder({ r: ro, h: length, $fn: 64 });
const bore = kind === "cap"
  ? translate([0, 0, Math.min(floor, length - 2)], cylinder({ r: ri, h: length, $fn: 64 }))
  : translate([0, 0, -1], cylinder({ r: ri, h: length + 2, $fn: 64 }));
// a lead-in chamfer at the open end (inside, so it faces up and prints clean)
const ch = Math.min(1, wall * 0.6);
const lead = translate([0, 0, length - ch], cylinder({ r1: ri, r2: ri + ch, h: ch + 0.01, $fn: 64 }));
return difference(outer, bore, lead);
`,
};
