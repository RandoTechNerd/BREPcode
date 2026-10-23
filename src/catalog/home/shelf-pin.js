// A shelf support pin: a peg for the hole in the cabinet side and an L-shaped
// ledge the shelf rests on. Printed lying on its side, so the peg lies along
// the bed with its layers running its length (a standing peg snaps off at the
// first layer line). The peg's underside is flattened where it would lean
// past 45 degrees, which still leaves it round enough for the hole.

export default {
  id: "shelf-pin",
  category: "home",
  title: "Shelf pin",
  summary: "a shelf support pin with a ledge, for 5 mm (IKEA) or 1/4 inch shelf holes.",
  print: "on its side as shown, no supports. PETG; print a few spares.",
  names: ["shelf pin", "shelf pins", "shelf peg", "shelf support", "shelf support pin", "shelf support peg",
    "shelf bracket pin", "cabinet shelf support", "bookcase shelf pin"],
  nouns: ["pin", "peg", "support"],
  keywords: ["shelf", "cabinet", "bookcase", "bookshelf", "cupboard", "hole"],
  fits: ["pin-hole"],
  fromSpec: (s) => ({ pinD: s.dims.d - 0.2 }),
  specNote: "the peg is 0.2 mm under the hole",
  primary: "pinD",
  tips: ["for an IKEA bookcase", "6.35 mm pin", "longer ledge"],
  examples: ["I want a shelf pin", "make me a shelf support for a 5mm hole",
    "shelf pins for my ikea bookcase", "a shelf support pin with a 15mm ledge"],
  params: {
    pinD: { default: 4.8, min: 3, max: 8, unit: "mm", label: "peg diameter (the hole size)", say: ["diameter", "hole", "peg", "pin"] },
    pinL: { default: 8, min: 4, max: 20, unit: "mm", label: "how far the peg goes in", say: ["long", "length", "into"] },
    ledgeL: { default: 12, min: 5, max: 40, unit: "mm", label: "how far the ledge sticks out", say: ["ledge", "out", "deep", "depth"], more: ["longer", "deeper"] },
    width: { default: 10, min: 6, max: 30, unit: "mm", label: "support width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    plateH: { default: 14, min: 8, max: 40, unit: "mm", label: "back plate height", say: ["tall", "high", "height", "plate"] },
    plateT: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "back plate thickness", say: ["plate"] },
    ledgeT: { default: 3, min: 2, max: 6, unit: "mm", label: "ledge thickness", say: ["thick", "thickness"], more: ["stronger", "thicker"] },
  },
  things: [
    { names: ["ikea shelf pin", "billy shelf pin", "ikea shelf support", "ikea shelf peg", "billy shelf support"], title: "IKEA shelf pin",
      spec: "shelf-hole-5" },
    { names: ["quarter inch shelf pin", "6mm shelf pin", "american shelf pin"], title: "1/4 inch shelf pin", spec: "shelf-hole-quarter" },
    { names: ["glass shelf support", "glass shelf pin", "glass shelf clip"], title: "Glass shelf support",
      params: { width: 14, ledgeL: 16, plateH: 16 } },
    { names: ["heavy shelf support", "heavy duty shelf pin", "strong shelf pin"], title: "Heavy shelf support",
      params: { width: 16, ledgeT: 4.5, plateH: 22, plateT: 3.5, ledgeL: 16 } },
    { names: ["5mm shelf pin", "5 mm shelf pin", "euro shelf pin"], title: "5 mm shelf pin", spec: "shelf-hole-5" },
  ],
  body: `
// side view: x runs from the cabinet wall (x = 0) out under the shelf
// (negative) and into the hole (positive); y up. Stretched across the width.
const r = pinD / 2;
const pinY = -(r + 1);                           // the peg's axis, just under the shelf
const H = Math.max(plateH, r * 2 + 3);
const outline = [[-ledgeL, 0], [0, 0], [0.4, 0], [0.4, -H], [-plateT, -H], [-plateT, -ledgeT], [-ledgeL, -ledgeT]];
const body = linearExtrude({ h: width }, polygon(outline));
// the peg along +x, its flat cut where the round underside would lean past 45
// degrees; it sits on the bed at one face of the support
const zc = r * Math.SQRT1_2;
const peg = translate([0, pinY, zc], rotate([0, 90, 0], union(
  cylinder({ r, h: pinL - 0.6, $fn: 32 }),
  translate([0, 0, pinL - 0.61], cylinder({ r1: r, r2: r - 0.6, h: 0.6, $fn: 32 })),
)));
return difference(union(body, peg), translate([-ledgeL - 1, -H - 1, -10], cube([ledgeL + pinL + 3, H + 2, 10])));
`,
};
