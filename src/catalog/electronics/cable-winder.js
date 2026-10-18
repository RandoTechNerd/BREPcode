// A flat bobbin to wind a cable round: a narrow bar between two wide ends,
// so the coil cannot slide off, with a slit in each end that grips the cable
// so the plug and the tail stay put. Earbuds, chargers, or a whole extension
// cord at the large end. One flat profile: a few minutes to print.

export default {
  id: "cable-winder",
  category: "electronics",
  title: "Cable winder",
  summary: "a flat bobbin a cable winds round, with slits in the ends that grip the plug and the tail.",
  print: "flat as shown, no supports.",
  names: ["cable winder", "cord winder", "cord wrap", "cable wrap", "cable wrapper", "wire winder", "cable bobbin",
    "cord keeper", "cable wrangler", "cord wrapper", "cable spool winder"],
  nouns: ["winder", "wrap", "wrapper", "bobbin"],
  keywords: ["cable", "cord", "wire", "travel", "earbud", "charger", "headphone", "wind"],
  fits: ["cable"],
  fromSpec: (s) => ({ cableD: s.dims.d }),
  tips: ["90 mm long", "for a 6 mm cable", "thicker"],
  examples: ["make me a cable winder", "a cord wrap for my laptop charger",
    "earbud cable winder 50mm long", "cable wrap for usb c cables"],
  params: {
    length: { default: 70, min: 30, max: 200, unit: "mm", label: "length", say: ["long", "length"], more: ["longer", "bigger"], less: ["shorter", "smaller"] },
    barW: { default: 18, min: 8, max: 80, unit: "mm", label: "middle bar width", say: ["bar", "narrow"] },
    endW: { default: 40, min: 15, max: 120, unit: "mm", label: "end width", say: ["wide", "width", "end"], more: ["wider"], less: ["narrower"] },
    endL: { default: 10, min: 5, max: 30, unit: "mm", label: "end length", say: ["flange"] },
    plateT: { default: 3, min: 2, max: 8, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"], less: ["thinner"] },
    cableD: { default: 3.5, min: 1.5, max: 12, unit: "mm", label: "cable diameter", say: ["cable", "cord", "wire", "diameter"] },
  },
  things: [
    { names: ["earbud cable winder", "earbud winder", "earphone cord wrap", "earbud cord wrap"], title: "Earbud winder",
      spec: "audio", params: { length: 45, barW: 12, endW: 28, endL: 7, plateT: 2.4 } },
    { names: ["headphone cord wrap", "headphone cable winder", "headphone cable wrap"], title: "Headphone cord wrap",
      spec: "audio", params: { length: 60, barW: 16, endW: 36 } },
    { names: ["usb cable winder", "charger cable wrap", "phone charger cord wrap", "usb c cable wrap", "charging cable winder"], title: "Charger cable wrap",
      spec: "usb-c", params: { length: 70 } },
    { names: ["laptop charger cord wrap", "laptop cord wrap", "power brick cord wrap"], title: "Laptop charger cord wrap",
      spec: "laptop-power", params: { length: 120, barW: 30, endW: 60, endL: 14, plateT: 4 } },
    { names: ["extension cord winder", "extension cord wrap", "extension cord reel", "power cord winder"], title: "Extension cord winder",
      spec: "extension-lead", params: { length: 200, barW: 60, endW: 120, endL: 25, plateT: 6 } },
    { names: ["hdmi cable wrap", "hdmi cable winder"], title: "HDMI cable wrap", spec: "hdmi", params: { length: 110, barW: 26, endW: 56, endL: 14, plateT: 4 } },
  ],
  body: `
const ew = Math.max(endW, barW + 6);                 // the ends always stand out past the bar
const el = Math.min(endL, length / 3);
const L = length / 2, B = barW / 2, E = ew / 2;
const outline = [[-L, -E], [-L + el, -E], [-L + el, -B], [L - el, -B], [L - el, -E], [L, -E],
  [L, E], [L - el, E], [L - el, B], [-L + el, B], [-L + el, E], [-L, E]];
const winder = linearExtrude({ h: plateT }, polygon(outline));
// a slit into each end, in the part that stands out past the bar, with a round seat for the cable
const sy = (B + E) / 2, sw = cableD * 0.75, sl = el * 0.7;
const slits = [-1, 1].flatMap((s) => [
  translate([s > 0 ? L - sl : -L - 1, sy - sw / 2, -1], cube([sl + 1, sw, plateT + 2])),
  translate([s * (L - sl), sy, -1], cylinder({ d: cableD + 0.2, h: plateT + 2, $fn: 20 })),
]);
return difference(winder, ...slits);
`,
};
