// An elevated feeder that holds stainless bowls by their rolled rims. It is
// printed upside down: the top plate with the bowl holes lies on the bed and
// the walls rise from it, so nothing overhangs. Arches are cut down from the
// free edge of the walls (the floor end in use), which leaves a leg at each
// corner and between the bowls; the arches open toward the bed in use, so in
// print they are plain U notches with no ceiling at all.

export default {
  id: "bowl-stand",
  category: "pets",
  title: "Elevated bowl stand",
  summary: "a raised feeder that holds one to four stainless bowls by their rims, with arched legs.",
  print: "upside down as shown (top plate on the bed), no supports. Turn it over to use; the bowls drop in from the top and hang by their rims.",
  names: ["bowl stand", "elevated bowl stand", "raised bowl stand", "pet bowl stand", "elevated pet feeder",
    "raised pet feeder", "pet feeding station", "bowl riser", "elevated feeder", "raised feeder", "pet bowl holder"],
  nouns: ["stand", "feeder", "riser", "holder"],
  keywords: ["elevated", "raised", "bowl", "dog", "cat", "pet", "feeding", "water"],
  fits: ["pet-bowl"],
  fromSpec: (s) => ({ bowlD: s.dims.d }),
  specNote: "the hole is smaller than the rim so the rolled rim rests on the plate; rims vary, measure yours",
  primary: "bowlD",
  ask: {
    unless: ["bowlD"],
    text: "How wide is your bowl across its rolled rim? Name a size (“for a 1 quart bowl”) or give the rim in mm; I used 120 mm, a small cat bowl.",
  },
  tips: ["for a 1 quart bowl", "150 mm tall", "one bowl", "solid sides"],
  examples: ["I want an elevated dog bowl stand", "make me a raised cat feeder 120mm tall",
    "bowl stand for two cat bowls", "elevated bowl stand for a 2 quart bowl"],
  params: {
    bowlD: { default: 120, min: 60, max: 300, unit: "mm", label: "bowl diameter across its rim", say: ["rim", "diameter", "across"] },
    rimW: { default: 8, min: 3, max: 20, unit: "mm", label: "how much rim rests on the plate (hole = rim minus twice this)", say: ["overlap", "lip"] },
    count: { default: 2, min: 1, max: 4, unit: "count", label: "number of bowls", say: ["bowl", "bowls"] },
    height: { default: 100, min: 40, max: 300, unit: "mm", label: "stand height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    gap: { default: 6, min: 2, max: 60, unit: "mm", label: "space between the bowl rims", say: ["apart", "gap", "spacing", "between"] },
    wall: { default: 4, min: 2.4, max: 8, unit: "mm", label: "wall thickness", say: ["wall", "thick"], more: ["stronger", "sturdier"] },
    plateT: { default: 4, min: 3, max: 10, unit: "mm", label: "top plate thickness", say: ["plate", "top"] },
    legs: { default: "arches", unit: "choice", choices: ["arches", "solid"], label: "arched legs, or solid sides",
      words: { solid: ["solid sides", "closed sides", "no cutouts", "no arches", "solid"], arches: ["arches", "arched", "legs", "cutouts", "open sides"] } },
    archH: { default: 0.55, min: 0.2, max: 0.85, unit: "ratio", label: "arch height as a share of the stand height" },
    legW: { default: 24, min: 10, max: 60, unit: "mm", label: "leg width", say: ["leg", "legs"] },
  },
  things: [
    { names: ["cat bowl stand", "elevated cat bowl stand", "raised cat feeder", "double cat bowl stand", "cat feeding station",
      "raised cat bowl stand", "elevated cat feeder", "cat food stand"], title: "Raised cat feeder (two bowls)",
      spec: "pet-bowl-cat", params: { count: 2, height: 100 } },
    { names: ["elevated dog bowl stand", "raised dog feeder", "dog bowl stand", "elevated dog feeder", "raised dog bowl stand",
      "dog bowl holder", "dog feeding station"], title: "Elevated dog bowl stand",
      spec: "pet-bowl-1qt", params: { count: 1, height: 150, wall: 5, plateT: 5, legW: 30 } },
    { names: ["large dog bowl stand", "tall dog bowl stand", "big dog feeder", "large elevated dog feeder", "large raised dog feeder"],
      title: "Large dog bowl stand", spec: "pet-bowl-2qt", params: { count: 1, height: 220, wall: 5, plateT: 5, legW: 34 } },
    { names: ["double bowl stand", "double dog bowl stand", "two bowl stand", "dog food and water stand", "double dog feeder"],
      title: "Double bowl stand", spec: "pet-bowl-1pt", params: { count: 2, height: 130, wall: 4.5, legW: 26 } },
    { names: ["single bowl stand", "small dog bowl stand", "puppy bowl stand", "one bowl stand", "single dog feeder"],
      title: "Single bowl stand", spec: "pet-bowl-1pt", params: { count: 1, height: 110 } },
    { names: ["water bowl stand", "dog water bowl stand", "water dish stand", "cat water bowl stand", "raised water bowl"],
      title: "Water bowl stand", spec: "pet-bowl-1qt", params: { count: 1, height: 120, legs: "solid", wall: 4.5 } },
    { names: ["low cat bowl stand", "kitten bowl stand", "short bowl stand", "low bowl stand"], title: "Low cat bowl stand",
      spec: "pet-bowl-cat", params: { count: 2, height: 60, archH: 0.5, legW: 18 } },
  ],
  body: `
// print orientation: the top plate on the bed, walls rising to the floor end
const n = count;
const edge = Math.max(2, wall / 2);                      // plate beyond the rims
const pitch = bowlD + gap;
const Lp = n * bowlD + (n - 1) * gap + 2 * edge;
const Wp = bowlD + 2 * edge;
const H = Math.max(height, plateT + 12);
const rc = Math.min(Wp / 2 - 0.5, Math.max(6, bowlD * 0.15));
// a rounded rectangle w x d, h tall, centred, standing at z
const rounded = (w, d, h, r, z = 0) => hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
  translate([sx * (w / 2 - r), sy * (d / 2 - r), z], cylinder({ r, h, $fn: 48 }))));
const xs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch);
const holeR = Math.max(10, Math.min(bowlD / 2 - rimW, bowlD / 2 + edge - wall - 1.5));

const parts = [
  rounded(Lp, Wp, plateT, rc),
  difference(rounded(Lp, Wp, H, rc), rounded(Lp - 2 * wall, Wp - 2 * wall, H + 2, Math.max(1, rc - wall), -1)),
];
// a wall between each pair of bowls, where the rims leave room for it
const dT = Math.min(wall, pitch - 2 * holeR - 2);
if (dT >= 1.6) for (let i = 1; i < n; i++) {
  parts.push(translate([(xs[i - 1] + xs[i]) / 2 - dT / 2, -Wp / 2 + wall - 0.5, 0], cube([dT, Wp - 2 * wall + 1, H])));
}
const cuts = xs.map((x) => translate([x, 0, -1], cylinder({ r: holeR, h: plateT + 2, $fn: 96 })));

if (legs === "arches") {
  // U notches down from the free edge, their bottoms rounded: arches in use
  const depthN = Math.min(archH * (H - plateT), H - plateT - 3);
  const zN = H - depthN;
  const uNotch = (wN) => {
    const r = Math.max(1, Math.min(depthN * 0.9, wN / 2 - 0.5, Math.max(8, wN * 0.3)));
    const arc = (cx, a0, a1, N = 16) => Array.from({ length: N + 1 }, (_, i) => {
      const a = a0 + (a1 - a0) * i / N;
      return [cx + r * Math.cos(a), zN + r + r * Math.sin(a)];
    });
    return [[-wN / 2, H + 1], ...arc(-wN / 2 + r, Math.PI, 1.5 * Math.PI), ...arc(wN / 2 - r, 1.5 * Math.PI, 2 * Math.PI), [wN / 2, H + 1]];
  };
  // a profile in (x, z) cut straight through both long walls
  const thruY = (pts, x0) => translate([x0, Wp / 2 + 1, 0], rotate([90, 0, 0], linearExtrude({ h: Wp + 2 }, polygon(pts))));
  // a profile in (y, z) cut along the whole length (ends and dividers)
  const thruX = (pts) => translate([-Lp / 2 - 1, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: Lp + 2 }, polygon(pts)))));
  const lw = Math.min(legW, pitch / 3, Wp / 3);
  for (let i = 0; i < n; i++) {
    const x0 = i === 0 ? -Lp / 2 + rc + lw / 2 : (xs[i - 1] + xs[i]) / 2 + lw / 2;
    const x1 = i === n - 1 ? Lp / 2 - rc - lw / 2 : (xs[i] + xs[i + 1]) / 2 - lw / 2;
    if (x1 - x0 > 10) cuts.push(thruY(uNotch(x1 - x0), (x0 + x1) / 2));
  }
  if (Wp - 2 * rc - lw > 10) cuts.push(thruX(uNotch(Wp - 2 * rc - lw)));
}
return difference(union(...parts), ...cuts);
`,
};
