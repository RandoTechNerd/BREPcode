// A plug that fills a hole: an unused shelf-pin or cam-lock hole, a hole left
// by moved hardware. A thin cap on a slightly tapered pin, split so it springs
// into the hole and stays; bigger pins are hollow so they flex. Printed cap
// down, so the face you see comes off the bed flat and smooth.

export default {
  id: "hole-plug",
  category: "home",
  title: "Hole plug",
  summary: "a push-in plug with a flat cap that covers an unused hole.",
  print: "cap down as shown, no supports. Print a test one; PETG springs better than PLA.",
  names: ["hole plug", "hole cover", "hole cap", "plug cap", "blanking plug", "hole filler", "furniture hole plug",
    "cabinet hole plug", "hole cover cap"],
  nouns: ["plug", "cover", "cap"],
  keywords: ["hole", "furniture", "cabinet", "shelf", "cover", "fill", "cam", "screw"],
  fits: ["pin-hole"],
  fromSpec: (s) => ({ holeD: s.dims.d }),
  primary: "holeD",
  tips: ["for a 5 mm hole", "bigger cap", "15 mm hole"],
  examples: ["I want a hole plug", "make me a hole cover for a 10mm hole",
    "plugs for empty shelf pin holes", "a furniture hole plug 25mm"],
  params: {
    holeD: { default: 8, min: 2, max: 40, unit: "mm", label: "hole diameter", say: ["hole", "diameter"] },
    depth: { default: 8, min: 2, max: 30, unit: "mm", label: "how far it goes in", say: ["deep", "depth", "long", "length"] },
    capD: { default: 12, min: 4, max: 60, unit: "mm", label: "cap diameter", say: ["cap", "head", "across"] },
    capT: { default: 1.6, min: 0.8, max: 5, unit: "mm", label: "cap thickness", say: ["thick", "thickness"] },
    fit: { default: 0.15, min: -0.2, max: 0.5, unit: "mm", label: "extra width at the root (+ = tighter)", say: ["fit", "tight"] },
    slit: { default: 0.8, min: 0, max: 3, unit: "mm", label: "spring slit (0 = solid)", say: ["slit", "slot"] },
  },
  things: [
    { names: ["shelf pin hole plug", "shelf hole cover", "shelf hole plug", "shelf pin hole cover"], title: "Shelf-pin hole plug",
      spec: "shelf-hole-5", params: { capD: 9, depth: 6, slit: 0 } },
    { names: ["cam lock cover", "cam cover cap", "ikea cam lock cover", "cam bolt cover", "cam lock cap"], title: "Cam lock cover",
      params: { holeD: 15, depth: 5, capD: 19, capT: 1.2 } },
    { names: ["screw hole cover", "screw hole plug", "screw hole cap"], title: "Screw hole cover", params: { holeD: 5, depth: 6, capD: 10 } },
    { names: ["large hole plug", "1 inch hole plug", "big hole cover", "desk hole plug"], title: "Large hole plug",
      params: { holeD: 25.4, depth: 10, capD: 32, capT: 2 } },
    { names: ["chair hole plug", "tube hole plug", "small hole plug"], title: "Small hole plug", params: { holeD: 4, depth: 5, capD: 8, slit: 0 } },
  ],
  body: `
// z = 0 is the cap's face; the pin points up
const d1 = holeD + fit;                            // at the root
const d2 = holeD - 0.3;                            // at the tip, so it starts in the hole
const capR = Math.max(capD, holeD + 2) / 2;
const ch = Math.min(0.6, d2 / 4);
const plug = union(
  cylinder({ r: capR, h: capT, $fn: 64 }),
  translate([0, 0, capT - 0.01], cylinder({ r1: d1 / 2, r2: d2 / 2, h: depth - ch + 0.01, $fn: 48 })),
  translate([0, 0, capT + depth - ch - 0.01], cylinder({ r1: d2 / 2, r2: d2 / 2 - ch, h: ch + 0.01, $fn: 48 })),
);
const cuts = [];
// big pins are hollow, so they flex rather than split the hole
if (holeD > 12) cuts.push(translate([0, 0, capT + 1], cylinder({ r: d2 / 2 - 1.6, h: depth + 1, $fn: 48 })));
if (slit > 0 && holeD >= 4) cuts.push(translate([-slit / 2, -holeD, capT + depth * 0.25], cube([slit, 2 * holeD, depth])));
return cuts.length ? difference(plug, ...cuts) : plug;
`,
};
