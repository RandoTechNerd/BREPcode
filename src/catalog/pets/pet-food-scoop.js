// An open-front shovel scoop for kibble, seed and feed, or with a slotted
// floor for litter. The bowl is a racetrack (a revolve stretched straight in
// the middle): a round back, straight sides flaring out as they rise, and the
// front cut off so it slides under food. The side walls slope down toward the
// front. Capacity is solved from the shape: the volume of a unit-sized scoop
// is integrated slice by slice, and every length scales by the cube root.
// The flat handle lies on the bed; a raised spine along it runs up into the
// back wall, so the handle is stiff without anything overhanging.

export default {
  id: "pet-food-scoop",
  category: "pets",
  title: "Pet food scoop",
  summary: "an open-front shovel scoop that holds a set volume of kibble or feed, with a stiff spined handle; slotted, it sifts litter.",
  print: "upright as shown, no supports. Food contact: PETG or PLA from a food-safe spool, hand wash, replace it once scratched. Litter scoops want PETG.",
  names: ["pet food scoop", "dog food scoop", "kibble scoop", "pet scoop", "dog food shovel", "pet food shovel",
    "kibble shovel", "feed scoop", "dry food scoop", "pet food scooper"],
  nouns: ["scoop", "scooper", "shovel"],
  keywords: ["kibble", "pet", "dog", "cat", "food", "litter", "feed", "ml"],
  primary: "volume",
  tips: ["300 ml", "longer handle", "flat handle", "slotted floor"],
  examples: ["I want a dog food scoop", "make me a kibble scoop that holds 300 ml",
    "a pet food scoop with a long handle", "litter scoop with 8mm slots"],
  params: {
    volume: { default: 237, min: 30, max: 1000, unit: "count", label: "capacity in millilitres, level to the walls (1 cup = 237)", say: ["ml", "milliliter", "millilitre", "cc", "capacity"] },
    deep: { default: 0.55, min: 0.3, max: 0.9, unit: "ratio", label: "back wall height as a share of the floor width" },
    long: { default: 1, min: 0.4, max: 1.6, unit: "ratio", label: "straight floor length as a share of its width" },
    front: { default: 0.3, min: 0.15, max: 1, unit: "ratio", label: "side wall height at the front, as a share of the back (lower = more open)" },
    flare: { default: 15, min: 0, max: 40, unit: "deg", label: "how far the walls lean out", say: ["flare", "lean", "angle", "degree"] },
    wall: { default: 2.4, min: 1.6, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "floor thickness", say: ["floor", "bottom"] },
    handleL: { default: 90, min: 40, max: 180, unit: "mm", label: "handle length past the scoop", say: ["handle", "long", "length"], more: ["longer"], less: ["shorter"] },
    handleW: { default: 26, min: 14, max: 40, unit: "mm", label: "handle width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    handleT: { default: 5, min: 3, max: 10, unit: "mm", label: "handle thickness", say: ["thick", "thickness"], more: ["thicker", "stronger", "sturdier"], less: ["thinner"] },
    grip: { default: "spine", unit: "choice", choices: ["spine", "flat"], label: "handle: a raised spine, or flat",
      words: { flat: ["flat handle", "no spine", "low handle"], spine: ["spine", "ridge", "raised handle", "stiff handle"] } },
    floorType: { default: "solid", unit: "choice", choices: ["solid", "slotted"], label: "floor: solid, or slotted to sift litter",
      words: { solid: ["solid floor", "no slots", "unslotted"], slotted: ["slotted", "slots", "sifting", "sifter", "sieve", "litter"] } },
    slotW: { default: 6, min: 3, max: 12, unit: "mm", label: "sifting slot width (slotted floor)", say: ["slot", "sift", "gap"] },
    hangHole: { default: 6, min: 0, max: 12, unit: "mm", label: "hanging hole in the handle (0 = none)", say: ["hole", "hang"] },
  },
  things: [
    { names: ["cat food scoop", "cat kibble scoop", "half cup pet food scoop", "cat food scooper"], title: "Cat food scoop (1/2 cup)",
      params: { volume: 118, handleL: 70, handleW: 22 } },
    { names: ["puppy food scoop", "small dog food scoop", "three quarter cup dog food scoop"], title: "Puppy food scoop (3/4 cup)",
      params: { volume: 177, handleL: 80, handleW: 24 } },
    { names: ["large dog food scoop", "big dog food scoop", "two cup dog food scoop", "2 cup dog food scoop", "big kibble scoop"], title: "Large dog food scoop (2 cups)",
      params: { volume: 474, handleL: 110, handleW: 30, handleT: 6, wall: 2.8, floor: 3 } },
    { names: ["pet food measuring scoop", "dog food measuring cup", "dog food measuring scoop", "cat food measuring cup", "kibble measuring cup"], title: "Pet food measuring scoop (1 cup)",
      params: { volume: 237, deep: 0.6, front: 0.7, long: 0.8 } },
    { names: ["litter scoop", "cat litter scoop", "litter box scoop", "litter sifter scoop", "kitty litter scoop", "litter scooper"], title: "Litter scoop",
      params: { floorType: "slotted", volume: 600, deep: 0.35, front: 0.15, long: 1.3, flare: 10, handleL: 130, handleW: 30, handleT: 6, wall: 2.8, floor: 3, slotW: 6 } },
    { names: ["bird seed scoop", "birdseed scoop", "bird food scoop", "seed scoop"], title: "Bird seed scoop",
      params: { volume: 120, flare: 10, deep: 0.65, handleL: 60, handleW: 20 } },
    { names: ["chicken feed scoop", "poultry feed scoop", "livestock feed scoop", "horse feed scoop", "grain scoop"], title: "Feed scoop (1 quart)",
      params: { volume: 946, handleL: 120, handleW: 34, handleT: 7, wall: 3, floor: 3 } },
    { names: ["small animal food scoop", "hamster food scoop", "rabbit pellet scoop", "guinea pig food scoop"], title: "Small animal food scoop",
      params: { volume: 60, handleL: 60, handleW: 18, handleT: 4, hangHole: 5 } },
    { names: ["fish food scoop", "fish pellet scoop", "koi food scoop"], title: "Fish food scoop",
      params: { volume: 30, handleL: 50, handleW: 14, handleT: 3, wall: 1.8, floor: 1.8, hangHole: 4 } },
  ],
  body: `
// a scoop with a floor 1 wide: walls lean out by the flare, the back is
// deep tall, the straight floor long, the sides fall to front x the back
const tanF = Math.tan(flare * Math.PI / 180);
const hb1 = deep, hf1 = deep * front;
const area = (z) => {
  const r = 0.5 + z * tanF;
  const xc = z <= hf1 ? long : long * (hb1 - z) / Math.max(1e-6, hb1 - hf1);
  return Math.PI * r * r / 2 + 2 * r * xc;            // round back + straight part, at this height
};
const integrate = (f, a, b, n = 96) => {
  let t = 0;
  for (let i = 0; i < n; i++) t += f(a + (b - a) * (i + 0.5) / n);
  return t * (b - a) / n;
};
const s = Math.cbrt(volume * 1000 / integrate(area, 0, hb1));   // mm per unit
const r0 = s / 2, L = long * s, Hb = hb1 * s, Hf = hf1 * s;
const H = floor + Hb;
const Rb = r0 + wall - floor * tanF;                  // outside radius at the bed
const Rt = r0 + wall + Hb * tanF;                     // and at the top

// a racetrack: round end centred on x = 0, straight sides running len along +x
const track = (pts, len) => translate([len / 2, 0, 0], revolve({ stretch: len }, polygon(pts)));
// a side profile (x, z) stood up and stretched across y, centred
const across = (pts, w) => translate([0, w / 2, 0], rotate([90, 0, 0], linearExtrude({ h: w }, polygon(pts))));

const outer = track([[0, 0], [Rb, 0], [Rt, H], [0, H]], L);
const cavity = track([[0, floor], [r0, floor], [r0 + (Hb + 2) * tanF, H + 2], [0, H + 2]], L + Rt + 10);
// cut the front open at x = L and slope the walls down toward it
const B = Rt + 5;
const zTop = (x) => H + 0.01 - (Hb - Hf) * x / L;
const keep = across([[-B, -1], [L, -1], [L, zTop(L)], [-B, zTop(-B)]], 2 * Rt + 4);

// the handle: a flat tongue on the bed running out the back (-x)
const w = Math.min(handleW, 2 * Rb - 2);
const t = Math.min(handleT, H);
const xt = -(Rb + handleL);                            // centre of the rounded tip
const parts = [
  intersection(outer, keep),
  hull(translate([-Rb + 1, -w / 2, 0], cube([1, w, t])), translate([xt, 0, 0], cylinder({ r: w / 2, h: t, $fn: 40 }))),
];
if (grip === "spine") {
  // a fin standing on the tongue, from high on the back wall down to the tip
  const ribT = Math.min(w * 0.35, Math.max(3, t));
  const ribTop = Math.max(t + 1, H * 0.7);
  const xOut = -(Rb + ribTop * tanF);
  const xEnd = xt + w / 2 + 1;
  parts.push(across([[-r0 + 1, 0], [-r0 + 1, ribTop], [xOut, ribTop], [xEnd, t], [xEnd, 0]], ribT));
}
const cuts = [cavity];
if (floorType === "slotted") {
  // straight slots through the floor, front to back, leaving a solid border
  const m = Math.max(4, wall + 2);
  const pitch = slotW + Math.max(2.4, slotW * 0.6);
  const ny = Math.max(1, Math.floor((2 * (r0 - m) - slotW) / pitch) + 1);
  for (let i = 0; i < ny; i++) {
    const y = (i - (ny - 1) / 2) * pitch;
    if (Math.abs(y) + slotW / 2 > r0 - m) continue;
    const x0 = -Math.sqrt(Math.max(0, (r0 - m) ** 2 - y * y)) + slotW / 2, x1 = L - m;
    if (x1 - x0 > slotW) cuts.push(translate([x0, y - slotW / 2, -1], cube([x1 - x0, slotW, floor + 2])));
  }
}
const hr = Math.min(hangHole, w - 6) / 2;
if (hr > 1) cuts.push(translate([xt, 0, -1], cylinder({ r: hr, h: t + 2, $fn: 24 })));
const scoop = difference(union(...parts), ...cuts);
return translate([-(L + xt - w / 2) / 2, 0, 0], scoop);
`,
};
