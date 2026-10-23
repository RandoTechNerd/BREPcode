// A clip that carries a bottle by its neck: a snap ring that springs round
// the neck just under the cap's support ring, on a tab that threads onto a
// backpack strap or takes a carabiner. One flat outline, printed flat.

export default {
  id: "bottle-clip",
  category: "travel",
  title: "Bottle clip",
  summary: "a clip that snaps round a bottle's neck under the cap ring and hangs it from a strap or carabiner.",
  print: "flat as shown, no supports. PETG or nylon so the ring springs. Not load-rated beyond a full bottle.",
  names: ["bottle clip", "water bottle clip", "bottle holder clip", "backpack bottle clip", "bottle neck clip", "bottle strap clip",
    "bottle hanger clip", "bottle neck holder"],
  nouns: ["clip", "hanger"],
  keywords: ["bottle", "water", "backpack", "strap", "hiking", "neck", "soda"],
  primary: "neckD",
  ask: {
    unless: ["neckD"],
    text: "Measure the bottle's neck just under the cap's ring; I used 26 mm, about right for a soda or water bottle with a 28 mm cap.",
  },
  tips: ["for a 30 mm neck", "a carabiner hole instead", "for 38 mm straps"],
  examples: ["I want a water bottle clip", "make me a bottle clip for a 30mm neck",
    "backpack bottle clip for a 38mm strap", "bottle neck clip with a carabiner hole"],
  params: {
    neckD: { default: 26, min: 15, max: 70, unit: "mm", label: "bottle neck diameter (under the cap ring)", say: ["neck", "bottle", "diameter"] },
    band: { default: 3.5, min: 2.4, max: 6, unit: "mm", label: "ring band width", say: ["band", "ring"], more: ["stronger"] },
    thick: { default: 5, min: 3, max: 10, unit: "mm", label: "thickness", say: ["thick", "thickness"] },
    mouth: { default: 0.82, min: 0.6, max: 0.95, unit: "ratio", label: "ring mouth, as a fraction of the neck", say: ["mouth", "opening"] },
    mount: { default: "strap", unit: "choice", choices: ["strap", "hole"], label: "threads onto a strap, or a carabiner hole",
      words: { hole: ["carabiner", "hole", "keyring", "key ring", "lanyard"], strap: ["strap", "webbing", "backpack strap"] } },
    strapW: { default: 25.4, min: 10, max: 52, unit: "mm", label: "strap width", say: ["strap", "webbing"] },
    holeD: { default: 8, min: 4, max: 20, unit: "mm", label: "carabiner hole", say: ["hole"] },
  },
  things: [
    { names: ["backpack bottle holder", "bottle holder for backpack", "strap bottle holder"], title: "Backpack bottle holder", params: { mount: "strap", strapW: 38.1 } },
    { names: ["soda bottle hanger", "soda bottle clip"], title: "Soda bottle clip", params: { neckD: 25, mount: "hole" } },
    { names: ["bottle keychain", "bottle neck keychain"], title: "Bottle keychain", params: { mount: "hole", holeD: 6, thick: 4 } },
    { names: ["wide mouth bottle clip", "big bottle neck clip"], title: "Wide-mouth bottle clip", params: { neckD: 56, band: 4.5, thick: 6 } },
  ],
  body: `
const r = neckD / 2 + 0.3;
const ro = r + band;
const m = neckD * mouth;
// the ring, its mouth facing -x
const ring = difference(
  cylinder({ r: ro, h: thick, $fn: 72 }),
  translate([0, 0, -1], cylinder({ r, h: thick + 2, $fn: 72 })),
  translate([-ro - 1, -m / 2, -1], cube([ro + 1 - r * 0.3, m, thick + 2])),
);
// the tab beyond the ring, +x: a slot for the strap or a hole for a carabiner
const slotW = strapW + 1, slotH = 3.5;
const tabL = mount === "strap" ? slotH + 2 * band + 2 : holeD + 2 * band + 2;
const tabW = mount === "strap" ? slotW + 2 * band : Math.max(holeD + 2 * band, ro);
const x0 = ro - 1.5;
const tab = translate([x0, -tabW / 2, 0], cube([tabL + 1.5, tabW, thick]));
const hole = mount === "strap"
  ? translate([x0 + 1.5 + band, -slotW / 2, -1], cube([slotH, slotW, thick + 2]))
  : translate([x0 + 1.5 + band + holeD / 2, 0, -1], cylinder({ r: holeD / 2, h: thick + 2, $fn: 32 }));
return difference(union(ring, tab), hole);
`,
};
