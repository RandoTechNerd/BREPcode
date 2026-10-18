// A rounded travel case with a lid that slips over a neck, so the outside is
// flush when it is shut: a toothbrush case, a soap box with drain holes, a
// divided pill case, a case for earbuds or glasses. The base's wall steps in
// at 45 degrees under the neck, so the neck stands on plastic rather than
// air, and the lid prints upside down beside the base.

export default {
  id: "travel-case",
  category: "travel",
  title: "Travel case",
  summary: "a rounded case with a flush slip-on lid: toothbrush, soap, pills, earbuds, glasses and more.",
  print: "base upright and lid upside down beside it, no supports. PETG for anything that gets wet.",
  names: ["travel case", "travel box", "carry case", "travel container", "pocket case", "slip lid case", "case with lid",
    "small travel case", "protective case"],
  nouns: ["case", "box", "container"],
  keywords: ["travel", "trip", "pocket", "carry", "bag", "luggage", "suitcase", "camping"],
  fits: ["pocket-item"],
  // the neck is the narrowest place, so the opening there clears the object
  fromSpec: (s) => ({ length: Math.round(s.dims.l + 9), width: Math.round(s.dims.w + 9), height: Math.round(s.dims.t + 7) }),
  specNote: "with about a millimetre all round",
  triple: ["length", "width", "height"],
  tips: ["200 x 30 x 26", "drain holes", "4 compartments", "rounder"],
  examples: ["I want a travel case", "make me a toothbrush travel case",
    "travel case for my airpods pro", "travel soap case with drain holes"],
  params: {
    length: { default: 90, min: 30, max: 250, unit: "mm", label: "outside length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 60, min: 15, max: 120, unit: "mm", label: "outside width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    height: { default: 35, min: 12, max: 80, unit: "mm", label: "closed height", say: ["tall", "high", "height", "deep"], more: ["taller", "deeper"], less: ["shallower"] },
    wall: { default: 1.8, min: 1.2, max: 3, unit: "mm", label: "wall thickness", say: ["wall"] },
    cornerR: { default: 12, min: 2, max: 60, unit: "mm", label: "corner radius", say: ["corner", "round"], more: ["rounder"] },
    split: { default: 0.65, min: 0.3, max: 0.8, unit: "ratio", label: "how much of the height is the base", say: ["split"] },
    fit: { default: 0.25, min: 0.1, max: 0.6, unit: "mm", label: "lid clearance per side", say: ["fit", "clearance", "loose", "tight"] },
    drain: { default: "no", unit: "choice", choices: ["no", "yes"], label: "drain holes in the floor",
      words: { yes: ["drain", "drain holes", "drainage", "vent holes", "holes"], no: ["no drain", "no holes", "watertight", "solid"] } },
    divs: { default: 0, min: 0, max: 7, unit: "count", label: "dividers in the base", say: ["divider", "compartment", "section", "day"] },
  },
  things: [
    { names: ["toothbrush case", "toothbrush travel case", "travel toothbrush case", "travel toothbrush holder", "toothbrush cover case", "toothbrush box"],
      title: "Toothbrush case", params: { length: 205, width: 30, height: 28, cornerR: 15, split: 0.5, drain: "yes" } },
    { names: ["electric toothbrush case", "electric toothbrush travel case", "sonicare travel case", "oral b travel case"], title: "Electric toothbrush case",
      params: { length: 248, width: 40, height: 40, cornerR: 20, split: 0.5, drain: "yes" } },
    { names: ["travel soap case", "soap travel case", "travel soap box", "soap case", "soap container", "bar soap case"], title: "Travel soap case",
      params: { length: 100, width: 70, height: 42, cornerR: 16, drain: "yes" } },
    { names: ["travel pill case", "pill travel case", "travel pill box", "travel pill organizer", "pocket pill case"], title: "Travel pill case",
      params: { length: 120, width: 34, height: 22, cornerR: 8, divs: 6 } },
    { names: ["earbud case", "earbuds case", "airpods case", "airpods pro case", "earphone case", "earbud travel case"], title: "Earbud case", spec: "airpods-pro-2", params: { cornerR: 14 } },
    { names: ["glasses case", "eyeglasses case", "sunglasses case", "spectacles case"], title: "Glasses case",
      params: { length: 165, width: 64, height: 42, cornerR: 28, split: 0.55 } },
    { names: ["retainer case", "retainer box", "mouthguard case", "mouth guard case", "night guard case"], title: "Retainer case",
      params: { length: 85, width: 78, height: 36, cornerR: 32, drain: "yes" } },
    { names: ["match case", "matchbox", "match box", "match holder"], title: "Match case", params: { length: 70, width: 24, height: 22, cornerR: 10 } },
    { names: ["razor case", "travel razor case", "razor travel case", "razor cover"], title: "Razor case", params: { length: 150, width: 52, height: 34, cornerR: 12 } },
    { names: ["first aid case", "travel first aid kit", "first aid box", "first aid kit case"], title: "First aid case",
      params: { length: 160, width: 100, height: 55, cornerR: 14 } },
    { names: ["fishing lure box", "tackle box", "lure box", "fishing hook box", "fly box"], title: "Tackle box",
      params: { length: 150, width: 90, height: 32, cornerR: 8, divs: 4 } },
    { names: ["cotton swab case", "q tip case", "q tip holder travel"], title: "Cotton swab case", params: { length: 95, width: 34, height: 26, cornerR: 12 } },
    { names: ["hearing aid case", "hearing aid box"], title: "Hearing aid case", params: { length: 72, width: 52, height: 32, cornerR: 18, drain: "no" } },
  ],
  body: `
// a rounded rectangle inset d from the outline, h tall, standing at z
const rr = Math.max(1, Math.min(cornerR, width / 2 - 0.5, length / 2 - 0.5));
const rounded = (d, h, z) => {
  const w = length - 2 * d, dp = width - 2 * d, r = Math.max(0.5, rr - d);
  return hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
    translate([sx * (w / 2 - r), sy * (dp / 2 - r), z], cylinder({ r, h, $fn: 40 }))));
};
const lidH = Math.max(wall + 4, height * (1 - split));
const hb = height - lidH;                         // base height up to its shoulder
const neckT = Math.max(1.2, wall * 0.8);
const nh = Math.min(10, lidH - wall - 0.5);       // how far the neck reaches into the lid
const step = wall + fit + neckT;                  // the neck's inside, from the outline
const ch = step - wall;                           // the base wall steps in this much, at 45 degrees
const base = union(rounded(0, hb, 0), rounded(wall + fit, nh + 0.01, hb - 0.01));
// the inside is one convex hull: straight up, in at 45 degrees, straight up
// through the neck (stacked pieces would meet face to face, which leaks)
const cavity = hull(rounded(wall, 0.01, wall), rounded(wall, 0.01, Math.max(wall + 0.1, hb - ch)),
  rounded(step, 0.01, hb), rounded(step, 0.01, hb + nh + 1));
let box = difference(base, cavity);
if (divs > 0) {
  const iw = length - 2 * wall, divT = 1.2, divH = hb - ch - wall;
  box = union(box, ...Array.from({ length: divs }, (_, i) =>
    translate([-iw / 2 + (i + 1) * iw / (divs + 1) - divT / 2, -(width - 2 * wall) / 2 - 0.1, wall - 0.1], cube([divT, width - 2 * wall + 0.2, divH + 0.1]))));
}
if (drain === "yes") {
  const nx = Math.max(1, Math.floor((length - 2 * rr) / 12) + 1), ny = Math.max(1, Math.floor((width - 2 * wall - 6) / 10));
  const holes = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = nx > 1 ? -(length - 2 * rr) / 2 + i * (length - 2 * rr) / (nx - 1) : 0;
    const y = ny > 1 ? -(width - 2 * wall - 8) / 2 + j * (width - 2 * wall - 8) / (ny - 1) : 0;
    holes.push(translate([x, y, -1], cylinder({ r: 1.6, h: wall + 2, $fn: 16 })));
  }
  box = difference(box, ...holes);
}
// the lid, upside down: its top on the bed, open side up
const lid = difference(rounded(0, lidH, 0), rounded(wall, lidH, wall));
return group(box, translate([0, width + 8, 0], lid));
`,
};
