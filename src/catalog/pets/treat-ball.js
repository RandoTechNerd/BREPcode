// A treat ball: a hollow ball with holes in it that kibble falls out of as a
// dog (or a cat) noses it round the floor. It prints as two identical halves,
// rim down, plus a short ring that joins them. Each half is a dome with a
// short straight band at the rim (the ring sits in it) whose INSIDE is a 45
// degree cone from the band up to the pole: a spherical ceiling would hang in
// mid-air above 45 degrees, a cone never does, and the pole still comes out a
// wall thick. The holes are teardrops pointed toward the pole, so their roofs
// print clean too. The dome is one hull() of turned polygons (gently
// faceted, 32 sides), because cutting holes out of a true revolve is slow.

export default {
  id: "treat-ball",
  category: "pets",
  title: "Treat ball",
  summary: "a hollow treat-dispensing ball in two identical halves and a joining ring; kibble falls out of the holes as it rolls.",
  print: "the two halves rim down and the ring standing, as shown, no supports; 15% infill is plenty. PETG or TPU, food-safe filament, hand wash. Press the ring into one half (a drop of glue), then the other half over it. A toy for supervised play, not a chew toy: take it away once it is chewed.",
  names: ["treat ball", "dog treat ball", "treat dispensing ball", "treat dispenser ball", "kibble ball", "dog puzzle ball",
    "treat ball toy", "food dispensing ball", "snack ball", "toy that dispenses treats", "ball that dispenses treats",
    "treat dispensing ball toy", "kibble dispensing ball"],
  nouns: ["ball", "toy", "dispenser", "feeder"],
  keywords: ["treat", "treats", "kibble", "dog", "puppy", "cat", "puzzle", "enrichment", "dispensing", "roll", "rolls"],
  primary: "ballD",
  tips: ["90 mm across", "bigger holes", "8 holes", "for a cat"],
  examples: ["treat ball for my dog", "a toy that dispenses treats", "make me a treat dispensing ball 80mm across with 6 holes",
    "kibble ball for a puppy", "a snack ball with 12 mm holes"],
  params: {
    ballD: { default: 75, min: 40, max: 140, unit: "mm", label: "ball diameter", say: ["across", "diameter", "wide", "big", "ball"], more: ["bigger", "larger"], less: ["smaller"] },
    holeD: { default: 16, min: 6, max: 30, unit: "mm", label: "treat hole size", say: ["hole", "holes", "treat", "kibble", "opening"], more: ["easier"], less: ["harder"] },
    holes: { default: 6, min: 1, max: 16, unit: "count", label: "number of holes (shared between the halves)", say: ["hole", "holes", "opening", "openings"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stronger", "tougher", "thicker"], less: ["thinner"] },
    ringFit: { default: 0.3, min: 0.1, max: 0.8, unit: "mm", label: "ring clearance per side (more = looser)", say: ["fit", "tolerance", "ring"], more: ["looser"], less: ["tighter"] },
  },
  things: [
    { names: ["puppy treat ball", "small dog treat ball", "small treat ball", "mini treat ball"], title: "Small dog treat ball",
      params: { ballD: 60, holeD: 12, holes: 6, wall: 2.6 } },
    { names: ["large dog treat ball", "big dog treat ball", "large treat ball", "big treat ball"], title: "Large dog treat ball",
      params: { ballD: 100, holeD: 20, holes: 6, wall: 3.5 } },
    { names: ["cat treat ball", "cat kibble ball", "kitten treat ball", "cat puzzle ball", "cat snack ball"], title: "Cat treat ball",
      params: { ballD: 50, holeD: 9, holes: 4, wall: 2.2 } },
    { names: ["slow feeder ball", "kibble dispenser ball", "meal dispensing ball", "slow feed ball", "dinner ball"], title: "Slow-feeder ball",
      params: { ballD: 85, holeD: 12, holes: 10, wall: 3 } },
    { names: ["easy treat ball", "beginner treat ball", "treat ball with big holes"], title: "Easy treat ball", params: { holeD: 22, holes: 8 } },
    { names: ["hard treat ball", "puzzle treat ball", "challenge treat ball", "advanced treat ball"], title: "Hard treat ball", params: { holeD: 12, holes: 2 } },
  ],
  body: `
const r = ballD / 2, t = wall, ri = r - t;
const band = Math.max(5, Math.min(9, r * 0.14));               // the straight rim the ring sits in
const S = 32, M = 12;                                           // facets round, latitude rings up the dome
// a turned S-gon as a thin ring, for hull(): the whole dome is convex, so one
// hull of every latitude ring IS the dome. 0.2 mm thick, a layer: paper-thin
// rings left non-manifold slivers at some sizes
const ring = (rad, z) => translate([0, 0, z], linearExtrude({ h: 0.2 }, polygon(Array.from({ length: S }, (_, i) =>
  [rad * Math.cos(2 * Math.PI * i / S), rad * Math.sin(2 * Math.PI * i / S)]))));
const dome = hull(ring(r, 0), ...Array.from({ length: M }, (_, i) => {
  const a = Math.PI / 2 * i / M;
  return ring(r * Math.cos(a), band + r * Math.sin(a));
}), ring(0.6, band + r - 0.2));
// the cavity: the band's bore, then a 45 degree cone to just under the pole
const cavity = hull(ring(ri, -0.5), ring(ri, band), ring(1, band + ri - 1));

// teardrop holes, pointed toward the pole, in a ring at 55 degrees from the
// pole (two rings when there are many); each half gets half of them. The
// cone cavity is closest to the centre at 45 degrees (0.71 of the bore), so
// a cutter starts at 0.45 of it to be sure of breaking through into the void
const rh = Math.min(holeD, ri * 0.9) / 2;
const tear = (K = 10) => [[-rh * Math.SQRT2, 0], ...Array.from({ length: K + 1 }, (_, i) => {
  const a = Math.PI * 1.25 + Math.PI * 1.5 * i / K;             // from 225 round the far side to 495 degrees
  return [rh * Math.cos(a), rh * Math.sin(a)];
})];
const cutter = (theta, phi) => translate([0, 0, band], rotate([0, 0, phi], rotate([0, theta, 0],
  translate([0, 0, ri * 0.45], linearExtrude({ h: r + 4 - ri * 0.45 }, polygon(tear()))))));
const holesOn = (n, turn) => {
  const out = [];
  const twoRings = n > 5;
  for (let i = 0; i < n; i++) {
    const theta = twoRings ? (i % 2 ? 68 : 44) : 55;
    out.push(cutter(theta, turn + 360 * i / n));
  }
  return out;
};
const nA = Math.ceil(holes / 2), nB = holes - nA;
const halfA = difference(dome, cavity, ...holesOn(nA, 0));
const halfB = nB > 0 ? difference(dome, cavity, ...holesOn(nB, 180 / Math.max(1, nB))) : difference(dome, cavity);

// the joining ring: a short tube that presses into both bands
const ro = ri - ringFit, ringT = Math.max(1.6, Math.min(2.4, t * 0.7));
const joiner = difference(
  linearExtrude({ h: 2 * band - 2 }, polygon(Array.from({ length: S }, (_, i) => [ro * Math.cos(2 * Math.PI * i / S), ro * Math.sin(2 * Math.PI * i / S)]))),
  translate([0, 0, -1], linearExtrude({ h: 2 * band }, polygon(Array.from({ length: S }, (_, i) => [(ro - ringT) * Math.cos(2 * Math.PI * i / S), (ro - ringT) * Math.sin(2 * Math.PI * i / S)])))),
);
return group(halfA, translate([2 * r + 10, 0, 0], halfB), translate([r + 5, 2 * r + 10, 0], joiner));
`,
};
