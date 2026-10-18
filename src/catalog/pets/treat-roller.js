// A treat-dispensing roller: a hollow tube, octagonal, hexagonal or round,
// closed at one end, with a push-fit cap for the other. Kibble or treats go
// in, and a pet rolls it around to shake them out of the holes in its sides.
// It prints standing on its closed end. The side holes are horizontal, so
// each is a teardrop with a 45 degree pointed roof: it prints clean with no
// support, and a treat slides out just as well.

export default {
  id: "treat-roller",
  category: "pets",
  title: "Treat roller",
  summary: "a hollow treat-dispensing roller with teardrop holes and a push-fit cap; pets roll it to get the kibble out.",
  print: "standing on its closed end, cap beside it, no supports. PETG or TPU. Food contact: food-safe filament, hand wash. A toy to play with under supervision, not a chew toy: take it away once it is chewed.",
  names: ["treat dispenser toy", "treat roller", "kibble roller", "treat dispensing toy", "treat dispenser roller",
    "kibble dispenser toy", "food dispensing toy", "treat toy", "kibble toy", "enrichment roller", "treat tube toy"],
  nouns: ["roller", "toy", "tumbler"],
  keywords: ["treat", "treats", "kibble", "dog", "cat", "puzzle", "enrichment", "dispensing"],
  primary: "outerD",
  tips: ["90 mm across", "bigger holes", "8 holes", "round"],
  examples: ["I want a treat dispenser toy", "make me a treat roller 90mm across with 8 holes",
    "a hexagonal kibble roller", "dog treat puzzle with 18mm holes"],
  params: {
    outerD: { default: 75, min: 40, max: 140, unit: "mm", label: "across the flats", say: ["across", "diameter", "wide", "thick"], more: ["bigger", "fatter"], less: ["smaller", "slimmer"] },
    length: { default: 110, min: 50, max: 220, unit: "mm", label: "length", say: ["long", "length", "tall"], more: ["longer"], less: ["shorter"] },
    sides: { default: "octagon", unit: "choice", choices: ["octagon", "hex", "round"], label: "shape: octagonal, hexagonal or round (round rolls farther)",
      words: { hex: ["hex", "hexagon", "hexagonal", "six sided"], octagon: ["octagon", "octagonal", "eight sided"], round: ["round", "cylinder", "cylindrical"] } },
    holeD: { default: 14, min: 6, max: 30, unit: "mm", label: "treat hole size", say: ["hole", "holes", "treat", "kibble", "opening"], more: ["easier"], less: ["harder"] },
    holes: { default: 6, min: 1, max: 16, unit: "count", label: "number of holes", say: ["hole", "holes", "opening", "openings"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stronger", "tougher"] },
    capFit: { default: 0.25, min: 0.1, max: 0.8, unit: "mm", label: "cap clearance per side (more = looser)", say: ["fit", "tolerance", "cap"], more: ["looser"], less: ["tighter"] },
  },
  things: [
    { names: ["cat treat toy", "cat treat roller", "cat kibble toy", "cat treat dispenser", "cat food puzzle", "kitten treat toy"], title: "Cat treat roller",
      params: { outerD: 48, length: 75, holeD: 10, holes: 4, sides: "round", wall: 2.4 } },
    { names: ["dog treat puzzle", "dog puzzle toy", "dog treat toy", "dog treat dispenser", "dog kibble toy", "dog treat roller"], title: "Dog treat puzzle",
      params: { outerD: 85, length: 130, holeD: 16, holes: 6, sides: "hex", wall: 3.5 } },
    { names: ["large dog treat roller", "big dog treat toy", "large treat dispenser", "large kibble roller"], title: "Large dog treat roller",
      params: { outerD: 110, length: 170, holeD: 20, holes: 8, wall: 4.5 } },
    { names: ["treat tumbler", "kibble tumbler", "treat tumbler toy"], title: "Treat tumbler",
      params: { outerD: 70, length: 100, holeD: 12, holes: 9, sides: "hex" } },
    { names: ["slow feeder toy", "kibble dispenser", "slow feeding toy", "meal dispensing toy"], title: "Slow-feeder roller",
      params: { outerD: 80, length: 140, holeD: 11, holes: 12, sides: "round" } },
    { names: ["hamster treat roller", "small animal treat roller", "rabbit treat toy", "guinea pig treat ball", "rat treat toy"], title: "Small animal treat roller",
      params: { outerD: 42, length: 60, holeD: 8, holes: 4, sides: "round", wall: 2 } },
    { names: ["bird foraging toy", "parrot foraging toy", "bird treat toy", "foraging tube"], title: "Bird foraging tube",
      params: { outerD: 45, length: 90, holeD: 12, holes: 6, sides: "hex", wall: 2.4 } },
  ],
  body: `
// round is a 40-sided prism: flat facets keep the holes' booleans quick
const N = sides === "hex" ? 6 : sides === "octagon" ? 8 : 40;
const ra = outerD / 2;                                    // to the middle of a flat
const rb = ra - wall;                                     // the bore, the same shape inside
const floorT = Math.max(2.4, wall);
const lipD = Math.min(10, Math.max(5, length * 0.08));   // how far the cap plugs in
// an N-sided prism, apo from the middle to a flat; flats face 0, 1/N, 2/N... of a turn
const prism = (apo, h, z = 0) => translate([0, 0, z], linearExtrude({ h }, polygon(Array.from({ length: N }, (_, k) => {
  const a = (k + 0.5) * 2 * Math.PI / N, rc = apo / Math.cos(Math.PI / N);
  return [rc * Math.cos(a), rc * Math.sin(a)];
}))));
const shellPart = difference(prism(ra, length), prism(rb, length, floorT));

// teardrop holes, point up, one per flat (round: a golden-angle spiral)
const rh = holeD / 2;
const tear = (M = 10) => [[0, rh * Math.SQRT2], ...Array.from({ length: M + 1 }, (_, i) => {
  const a = Math.PI * 0.75 + Math.PI * 1.5 * i / M;      // from 135 round the bottom to 405 degrees
  return [rh * Math.cos(a), rh * Math.sin(a)];
})];
const zLo = floorT + rh + 3, zHi = length - lipD - rh * Math.SQRT2 - 3;
const stepF = N === 8 ? 3 : 1;
const holeAt = (i) => {
  const ang = N < 20 ? ((i * stepF) % N) * 360 / N : i * 137.5;
  const z = holes === 1 ? (zLo + zHi) / 2 : zLo + (zHi - zLo) * i / (holes - 1);
  // a prism just through the wall: from inside the bore to past the corners
  const r0 = rb - 1, r1 = ra / Math.cos(Math.PI / 6) + 1;
  return translate([0, 0, z], rotate([0, 0, ang + 90], translate([0, -r0, 0], rotate([90, 0, 0], linearExtrude({ h: r1 - r0 }, polygon(tear()))))));
};
const roller = difference(shellPart, union(...Array.from({ length: holes }, (_, i) => holeAt(i))));

// the cap, upside down beside it: a matching disc and a plug ring
const capT = Math.max(2.4, wall);
const ro = rb - capFit, ri = ro - 1.6;
const cap = union(prism(ra, capT), difference(prism(ro, lipD + 0.01, capT - 0.01), prism(ri, lipD + 2, capT - 1)));
return group(roller, translate([2 * ra + 10, 0, 0], cap));
`,
};
