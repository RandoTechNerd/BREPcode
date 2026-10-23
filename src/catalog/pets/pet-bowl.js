// A lathed pet dish: flat heavy floor, walls that lean out no more than 45
// degrees, a rounded rim and a chamfered inside corner that wipes clean. A
// slow-feeder version grows walls up from the floor: radial fins round a hub
// (every other fin stops short of the wall so the pockets connect), or
// concentric rings with a gap in each, which make a maze. Every fin and ring
// is vertical, so nothing inside overhangs.

export default {
  id: "pet-bowl",
  category: "pets",
  title: "Pet bowl",
  summary: "a shallow food or water dish with a heavy flat floor, plain or with slow-feeder fins or a ring maze.",
  print: "upright as shown, no supports. Food and water contact: PETG from a food-safe spool, hand wash (PLA softens in a dishwasher), and replace it once it is chewed or scratched.",
  names: ["pet bowl", "pet food bowl", "pet dish", "pet water bowl", "pet feeding bowl", "pet food dish", "pet water dish", "animal bowl"],
  nouns: ["bowl", "dish"],
  keywords: ["pet", "dog", "cat", "food", "water", "slow", "feeding"],
  primary: "topD",
  tips: ["180 mm across", "slow feeder fins", "shallower", "heavier floor"],
  examples: ["I want a cat food bowl", "make me a slow feeder dog bowl 200mm across",
    "a shallow pet bowl 150 mm wide", "reptile water dish"],
  params: {
    topD: { default: 140, min: 50, max: 260, unit: "mm", label: "outside diameter at the rim", say: ["across", "diameter", "wide", "top", "rim"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    height: { default: 40, min: 12, max: 120, unit: "mm", label: "height", say: ["tall", "high", "deep", "height"], more: ["deeper", "taller"], less: ["shallower", "shorter"] },
    flare: { default: 30, min: 0, max: 45, unit: "deg", label: "how far the wall leans out", say: ["flare", "lean", "angle", "degree", "slope"] },
    wall: { default: 3, min: 1.6, max: 8, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 4, min: 2, max: 12, unit: "mm", label: "floor thickness (a heavier floor tips less)", say: ["floor", "bottom", "base"], more: ["heavier"] },
    feeder: { default: "none", unit: "choice", choices: ["none", "fins", "rings"], label: "slow feeder: none, radial fins, or a ring maze",
      words: { none: ["no fins", "plain", "regular bowl", "normal bowl"], fins: ["slow feeder", "slow feed", "slow eating", "fins", "ridges", "radial", "anti gulp"], rings: ["maze", "puzzle", "rings", "lick"] } },
    ridges: { default: 6, min: 2, max: 12, unit: "count", label: "number of fins (rings use about half)", say: ["fin", "fins", "ridge", "ridges", "ring", "rings"] },
    ridgeH: { default: 0.8, min: 0.3, max: 1, unit: "ratio", label: "fin height as a share of the inside depth" },
  },
  things: [
    { names: ["cat food bowl", "cat bowl", "whisker friendly bowl", "whisker friendly cat bowl", "wide cat dish", "shallow cat bowl", "cat dish", "cat food dish"],
      title: "Whisker-friendly cat bowl", params: { topD: 150, height: 35, flare: 35 } },
    { names: ["cat water bowl", "cat water dish", "kitten water bowl", "kitten bowl"], title: "Cat water bowl",
      params: { topD: 140, height: 55, flare: 20 } },
    { names: ["dog bowl", "dog food bowl", "dog water bowl", "dog dish", "puppy bowl", "dog food dish"], title: "Dog bowl",
      params: { topD: 180, height: 70, flare: 20, wall: 3.5, floor: 5 } },
    { names: ["slow feeder bowl", "slow feeder dog bowl", "slow feed bowl", "dog slow feeder", "slow eating bowl", "anti gulp bowl", "slow feeder dish", "slow feeder"],
      title: "Slow feeder dog bowl", params: { feeder: "fins", topD: 200, height: 65, flare: 20, ridges: 8, ridgeH: 0.85 } },
    { names: ["slow feeder cat bowl", "cat slow feeder", "cat slow feed bowl", "slow feeder cat dish"], title: "Slow feeder cat bowl",
      params: { feeder: "fins", topD: 150, height: 40, flare: 30, ridges: 6, ridgeH: 0.8 } },
    { names: ["puzzle feeder bowl", "maze feeder bowl", "maze bowl", "puzzle bowl", "dog puzzle bowl", "lick bowl", "maze slow feeder"],
      title: "Puzzle feeder bowl", params: { feeder: "rings", topD: 200, height: 55, flare: 20, ridges: 6, ridgeH: 0.85 } },
    { names: ["hamster bowl", "small animal bowl", "hamster food bowl", "gerbil bowl", "mouse food bowl", "hamster dish"], title: "Hamster bowl",
      params: { topD: 70, height: 25, flare: 15, wall: 3, floor: 6 } },
    { names: ["rabbit bowl", "guinea pig bowl", "rabbit food bowl", "bunny bowl", "rat bowl", "ferret bowl"], title: "Rabbit bowl",
      params: { topD: 110, height: 40, flare: 15, wall: 4, floor: 8 } },
    { names: ["reptile water dish", "reptile dish", "gecko water dish", "turtle water dish", "bearded dragon water dish", "tortoise water dish", "reptile water bowl"],
      title: "Reptile water dish", params: { topD: 120, height: 20, flare: 45, wall: 3, floor: 3 } },
    { names: ["mealworm dish", "worm dish", "gecko food dish", "insect feeder dish", "feeder insect dish", "cricket dish"],
      title: "Mealworm dish (escape-proof)", params: { topD: 70, height: 28, flare: 0, wall: 2.4, floor: 3 } },
  ],
  body: `
const rt = topD / 2;
// keep the foot at least 40 % of the rim, whatever the flare
const tanE = Math.min(Math.tan(flare * Math.PI / 180), rt * 0.6 / height);
const rb = rt - height * tanE;
const wh = wall * Math.sqrt(1 + tanE * tanE);           // wall measured across, horizontally
const fl = Math.min(floor, height - 4);
const xw = (z) => rb - wh + z * tanE;                   // inside face of the wall at height z
const zc = height - wh / 2, xo = rb + zc * tanE;        // where the rim's round top starts
const rim = (N = 12) => Array.from({ length: N + 1 }, (_, i) => {
  const a = Math.PI * i / N;                            // over the top, outside to inside
  return [xo - wh / 2 + (wh / 2) * Math.cos(a), zc + (wh / 2) * Math.sin(a)];
});
const cove = Math.max(0.5, Math.min(8, (height - fl) * 0.3, xw(fl) * 0.3));
const bowl = revolve(360, polygon([
  [0, 0], [rb, 0], ...rim(),
  [xw(fl + cove), fl + cove], [xw(fl) - cove, fl], [0, fl],
]));
if (feeder === "none") return bowl;

// slow feeder: walls up from the floor
const rIn = xw(fl);
const top = Math.min(fl + ridgeH * (height - fl), height - wh);
const finT = Math.max(2, Math.min(wall, 4));
const hubR = Math.max(6, rIn * 0.14);
const across = (pts, w) => translate([0, w / 2, 0], rotate([90, 0, 0], linearExtrude({ h: w }, polygon(pts))));
const parts = [bowl, translate([0, 0, fl - 0.2], cylinder({ r: hubR, h: top - fl + 0.2, $fn: 48 }))];
if (feeder === "fins") {
  for (let i = 0; i < ridges; i++) {
    // even fins run into the wall; odd ones stop short so the pockets connect
    const short = i % 2 === 1 && ridges > 2;
    const end = short ? [[Math.max(hubR + 8, rIn - 18), fl - 0.2], [Math.max(hubR + 8, rIn - 18), top]]
      : [[xw(fl) + wh / 2, fl - 0.2], [xw(top) + wh / 2, top]];
    const fin = across([[hubR - 1, fl - 0.2], ...end, [hubR - 1, top]], finT);
    parts.push(rotate([0, 0, i * 360 / ridges], fin));
  }
} else {
  const nR = Math.max(1, Math.min(Math.round(ridges / 2), Math.floor((rIn - hubR) / 18)));
  for (let k = 1; k <= nR; k++) {
    const r = hubR + (rIn - hubR) * k / (nR + 1);
    const gapW = Math.min(28, r);
    const ring = difference(
      translate([0, 0, fl - 0.2], cylinder({ r: r + finT / 2, h: top - fl + 0.2, $fn: 96 })),
      translate([0, 0, fl - 1], cylinder({ r: r - finT / 2, h: top - fl + 2, $fn: 96 })),
      rotate([0, 0, k % 2 ? 0 : 180], translate([0, -gapW / 2, fl - 1], cube([r + finT, gapW, top - fl + 2]))),
    );
    parts.push(ring);
  }
}
return union(...parts);
`,
};
