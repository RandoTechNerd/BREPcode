// A light-duty carabiner: a racetrack loop with a gap in one long side and a
// thin springy gate inside it, rooted on one side of the gap and resting
// against the band on the other. Push the gate in and it opens; let go and it
// springs back. All of it is one flat outline, printed flat.

export default {
  id: "carabiner",
  category: "travel",
  title: "Carabiner clip",
  summary: "a light-duty carabiner clip with a springy flex gate, for keys, bottles and light gear.",
  print: "flat as shown, no supports. PETG or nylon so the gate springs. Not for climbing or any load that matters: keys, a bottle, light gear.",
  names: ["carabiner", "carabiner clip", "carabiner hook", "printed carabiner", "spring clip", "snap clip", "gate clip"],
  nouns: ["clip", "biner"],
  keywords: ["keys", "keychain", "backpack", "bottle", "belt", "gear", "hiking", "camping"],
  tips: ["50 mm long", "thicker", "wider gap"],
  examples: ["I want a carabiner", "make me a carabiner clip 70mm long",
    "keychain carabiner", "a carabiner for my water bottle"],
  params: {
    length: { default: 60, min: 30, max: 120, unit: "mm", label: "length", say: ["long", "length"], more: ["longer", "bigger"], less: ["shorter", "smaller"] },
    width: { default: 30, min: 16, max: 60, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    band: { default: 5, min: 3, max: 9, unit: "mm", label: "loop band width", say: ["band"], more: ["stronger"] },
    thick: { default: 6, min: 3, max: 10, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker"] },
    gap: { default: 9, min: 4, max: 20, unit: "mm", label: "gate opening", say: ["gap", "opening"], more: ["wider"] },
    gateT: { default: 1.4, min: 0.8, max: 2.4, unit: "mm", label: "gate thickness (springiness)", say: ["stiff"] },
  },
  things: [
    { names: ["keychain carabiner", "key carabiner", "key clip carabiner", "keyring carabiner"], title: "Keychain carabiner",
      params: { length: 50, width: 24, band: 4, thick: 5, gap: 7, gateT: 1.2 } },
    { names: ["mini carabiner", "small carabiner", "tiny carabiner"], title: "Mini carabiner", params: { length: 36, width: 18, band: 3.2, thick: 4, gap: 5, gateT: 1 } },
    { names: ["water bottle carabiner", "bottle carabiner", "flask carabiner"], title: "Bottle carabiner", params: { length: 70, width: 34, band: 5.5, thick: 7, gap: 10 } },
    { names: ["backpack carabiner", "bag carabiner", "gear carabiner", "accessory carabiner"], title: "Backpack carabiner", params: { length: 80, width: 38, band: 6, thick: 7, gap: 11 } },
    { names: ["large carabiner", "big carabiner"], title: "Large carabiner", params: { length: 100, width: 48, band: 7.5, thick: 9, gap: 14, gateT: 1.8 } },
    { names: ["belt carabiner", "belt loop clip"], title: "Belt carabiner", params: { length: 65, width: 30, band: 5, thick: 6, gap: 9 } },
  ],
  body: `
// a racetrack: straight sides along x, round ends; the gate is in the +y side
const W = Math.max(width, 2 * band + 8);
const L = Math.max(length, W + 6);
const R = W / 2;
const track = (r, h, z) => hull(translate([-(L / 2 - R), 0, z], cylinder({ r, h, $fn: 64 })), translate([L / 2 - R, 0, z], cylinder({ r, h, $fn: 64 })));
const loop = difference(track(R, thick, 0), track(R - band, thick + 2, -1));
const yi = R - band;                              // the band's inside edge on the gate side
const g = Math.min(gap, L - 2 * R - 2);           // the opening, within the straight side
// cut the opening through the band
const opening = translate([-g / 2, yi - 0.5, -1], cube([g, band + 1.5, thick + 2]));
// the gate: rooted to the band's inside past one end of the opening, its free
// end resting under the band past the other end, a hair clear of it
const free = -g / 2 - Math.min(4, L / 2 - R - g / 2);
const rootX = g / 2 + 3;
const gate = union(
  translate([free, yi - 0.4 - gateT, 0], cube([rootX + 4 - free, gateT, thick])),
  translate([rootX, yi - 0.4 - gateT, 0], cube([4, gateT + 0.41, thick])),
);
return union(difference(loop, opening), gate);
`,
};
