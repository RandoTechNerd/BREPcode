// A fish feeding ring that hangs on the aquarium glass, so floating food
// stays in one spot instead of drifting into the filter. A U clip sits on the
// glass, an arm with a web under it reaches in, and the ring hangs from the
// arm, its top at the rim and crossing the water line. Stretched long and
// narrow it is a shrimp feeding tube down to the substrate; as a cone with
// slits it is a worm feeder that lets live or thawed worms out slowly.
//
// It prints upside down: the clip's top, the arm and the ring's top edge all
// lie on the bed, so the clip's U opens upward and nothing is a ceiling. The
// cone narrows as it rises, its inside at no more than 40 degrees from upright.

export default {
  id: "feeding-ring",
  category: "pets",
  title: "Fish feeding ring",
  summary: "a feeding ring that clips on the aquarium glass; also a shrimp feeding tube or a slotted worm-feeder cone.",
  print: "upside down as shown (the clip's top on the bed), no supports. PETG; it lives in tank water.",
  names: ["feeding ring", "fish feeding ring", "aquarium feeding ring", "fish food ring", "flake food ring",
    "food ring", "fish feeder ring", "tank feeding ring", "aquarium food ring"],
  nouns: ["ring", "feeder", "tube"],
  keywords: ["fish", "aquarium", "tank", "betta", "shrimp", "food", "flake", "feeding"],
  fits: ["aquarium-glass"],
  fromSpec: (s) => ({ glassT: s.dims.t }),
  specNote: "the clip grips with a small bump; measure your glass",
  primary: "ringD",
  tips: ["80 mm across", "for 10 mm glass", "square", "farther from the glass"],
  examples: ["I want a fish feeding ring", "make me a feeding ring 80mm across for 10mm glass",
    "shrimp feeding tube 150mm long", "worm feeder for my aquarium"],
  params: {
    ringD: { default: 60, min: 12, max: 150, unit: "mm", label: "inside size of the ring (or the cone's mouth)", say: ["ring", "diameter", "across", "wide", "inside"], more: ["bigger", "wider"], less: ["smaller", "narrower"] },
    ringH: { default: 40, min: 15, max: 300, unit: "mm", label: "how far the ring reaches down", say: ["tall", "deep", "long", "height", "depth"], more: ["deeper", "longer"], less: ["shorter", "shallower"] },
    shape: { default: "round", unit: "choice", choices: ["round", "square", "cone"], label: "round ring, square ring, or a slotted worm-feeder cone",
      words: { cone: ["cone", "worm", "bloodworm", "live food", "frozen", "tubifex"], square: ["square"], round: ["round", "circle"] } },
    glassT: { default: 6, min: 3, max: 25, unit: "mm", label: "glass (or frame) thickness", say: ["glass", "thick", "thickness", "frame"] },
    armL: { default: 15, min: 3, max: 80, unit: "mm", label: "gap between the glass and the ring", say: ["arm", "away", "gap", "from"], more: ["farther", "further"], less: ["closer", "nearer"] },
    legH: { default: 25, min: 12, max: 60, unit: "mm", label: "how far the clip hangs down the glass", say: ["clip", "leg"] },
    wall: { default: 2.4, min: 1.6, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    slitW: { default: 2, min: 1, max: 6, unit: "mm", label: "worm slit width (cone)", say: ["slit", "slot"] },
  },
  things: [
    { names: ["betta feeding ring", "betta feeder", "betta food ring", "nano feeding ring", "small feeding ring"], title: "Betta feeding ring",
      params: { ringD: 35, ringH: 30, glassT: 4, armL: 8 } },
    { names: ["floating food ring", "large feeding ring", "big feeding ring", "pellet feeding ring", "goldfish feeding ring", "koi feeding ring"],
      title: "Large floating-food ring", params: { ringD: 100, ringH: 45, armL: 20 } },
    { names: ["square feeding ring", "square food ring", "square fish feeding ring"], title: "Square feeding ring",
      params: { shape: "square", ringD: 60 } },
    { names: ["shrimp feeding tube", "shrimp feeder tube", "shrimp feeder", "feeding tube", "aquarium feeding tube", "snail feeding tube", "shrimp feeding pipe"],
      title: "Shrimp feeding tube", params: { ringD: 14, ringH: 200, armL: 6, wall: 2 } },
    { names: ["worm feeder", "bloodworm feeder", "live food feeder", "worm cone feeder", "tubifex feeder", "live worm feeder", "worm cone"],
      title: "Worm feeder cone", params: { shape: "cone", ringD: 45, ringH: 45, slitW: 2 } },
    { names: ["frozen food feeder", "frozen food cone", "frozen bloodworm feeder", "frozen cube feeder", "frozen food holder"],
      title: "Frozen food cone", params: { shape: "cone", ringD: 60, ringH: 55, slitW: 3 } },
  ],
  body: `
// print coordinates: z is depth below the rim, x across the glass (glass from 0 to g)
const g = glassT + 0.4;
const outL = Math.min(legH, Math.max(10, glassT + 8));
// the clip: a U drawn as used (y up), flipped so its top lies on the bed
const hanger = [[-wall, -outL], [0, -outL], [0.6, -outL + 1.2], [0, -outL + 2.4], [0, 0], [g, 0],
  [g, -legH], [g + wall, -legH], [g + wall, wall], [-wall, wall]].map(([x, y]) => [x, wall - y]);
const Ri = ringD / 2, Ro = Ri + wall;
const cx = g + wall + armL + Ro;
const armW = Math.max(10, Math.min(Ro, 16)), armT = Math.max(3, wall + 1);
// a side profile (x, z) stretched across y, centred
const across = (pts, w) => translate([0, w / 2, 0], rotate([90, 0, 0], linearExtrude({ h: w }, polygon(pts))));
const x0 = g + wall - 0.5;
const parts = [
  across(hanger, armW),
  translate([x0, -armW / 2, 0], cube([cx - x0, armW, armT])),
];
let holder, hollow;
const cuts = [];
if (shape === "cone") {
  // the cone narrows as it rises (down, in use); inside no steeper than 40 degrees
  const Hc = Math.max(ringH, Ri / Math.tan(40 * Math.PI / 180));
  const phi = Math.atan(Ri / Hc);
  const wh = wall / Math.cos(phi), wv = wall / Math.sin(phi);
  holder = translate([cx, 0, 0], revolve(360, polygon([[0, 0], [Ri + wh, 0], [0, Hc + wv]])));
  hollow = translate([cx, 0, 0], revolve(360, polygon([[0, -1], [Ri + Ri / Hc, -1], [0, Hc]])));
  // radial slits part way down, for the worms to wriggle out; spaced at
  // three slit widths where the cone is narrowest, so the tip stays strong
  const r1 = Ri * 0.35;
  const nS = Math.max(3, Math.floor(2 * Math.PI * r1 / (slitW * 3)));
  for (let k = 0; k < nS; k++) {
    cuts.push(translate([cx, 0, 0], rotate([0, 0, (k + 0.5) * 360 / nS],
      translate([0, -slitW / 2, Hc * 0.3], cube([Ri + wh + 2, slitW, Hc * 0.35])))));
  }
  parts.push(across([[x0, 0], [cx - Ri, 0], [cx - Ri, armT], [x0, Math.min(legH, 18)]], wall));
} else if (shape === "square") {
  holder = translate([cx - Ro, -Ro, 0], cube([2 * Ro, 2 * Ro, ringH]));
  hollow = translate([cx - Ri, -Ri, -1], cube([2 * Ri, 2 * Ri, ringH + 2]));
  parts.push(across([[x0, 0], [cx - Ro + 0.5, 0], [cx - Ro + 0.5, Math.min(ringH, legH)], [x0, legH]], wall));
} else {
  holder = translate([cx, 0, 0], cylinder({ r: Ro, h: ringH, $fn: 96 }));
  hollow = translate([cx, 0, -1], cylinder({ r: Ri, h: ringH + 2, $fn: 96 }));
  parts.push(across([[x0, 0], [cx - Ro + 0.5, 0], [cx - Ro + 0.5, Math.min(ringH, legH)], [x0, legH]], wall));
}
return translate([-cx / 2, 0, 0], difference(union(...parts, holder), hollow, ...cuts));
`,
};
