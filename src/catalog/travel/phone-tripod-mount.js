// A phone tripod mount: a U-shaped jaw the phone stands in on its long edge,
// on a base with a pocket for a 1/4-20 nut, so it screws onto any camera
// tripod, selfie stick or GorillaPod. The cross-section is one profile
// extruded along the phone; the nut pocket opens on the bed, so its ceiling
// is a short bridge.

export default {
  id: "phone-tripod-mount",
  category: "travel",
  title: "Phone tripod mount",
  summary: "a jaw that holds a phone on its long edge, with a 1/4-20 nut pocket for any camera tripod.",
  print: "upright as shown, no supports (the nut pocket roof is a short bridge). Press a 1/4-20 nut in from below.",
  names: ["phone tripod mount", "phone tripod adapter", "tripod phone holder", "tripod phone mount", "phone tripod clamp",
    "tripod adapter for phone", "phone tripod holder", "tripod mount for phone"],
  nouns: ["mount", "adapter", "holder", "clamp"],
  keywords: ["tripod", "camera", "selfie", "photo", "video", "vlog", "monopod"],
  fits: ["phone", "tablet"],
  fromSpec: (s) => ({ phoneT: Math.round((s.dims.t + 3) * 10) / 10 }),
  specNote: "the jaw allows a few mm for a case",
  bridgeArea: (v) => 0.9 * v.nutAF * v.nutAF + 20,
  ask: {
    unless: ["phoneT"],
    text: "Which phone? Name it (“for a Pixel 9”) and I’ll size the jaw; I used 12 mm, a typical phone in a case.",
  },
  tips: ["for an iPhone 16", "taller jaws", "wider"],
  examples: ["I want a phone tripod mount", "make me a tripod phone holder for my iPhone 15",
    "phone tripod adapter 60mm wide", "tablet tripod mount"],
  params: {
    phoneT: { default: 12, min: 6, max: 20, unit: "mm", label: "phone thickness with its case", say: ["thick", "thickness", "case", "phone"] },
    jawH: { default: 18, min: 8, max: 40, unit: "mm", label: "jaw height", say: ["jaw", "tall", "high"], more: ["taller"], less: ["lower"] },
    jawT: { default: 6, min: 3, max: 12, unit: "mm", label: "jaw thickness", say: ["jaw"], more: ["stiffer"] },
    width: { default: 40, min: 20, max: 90, unit: "mm", label: "width along the phone", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    baseH: { default: 10, min: 8, max: 20, unit: "mm", label: "base height", say: ["base"] },
    nutAF: { default: 11.1, min: 6, max: 16, unit: "mm", label: "nut across flats (1/4-20 = 11.1)", say: ["nut"] },
  },
  things: [
    { names: ["tablet tripod mount", "ipad tripod mount", "tablet tripod holder"], title: "Tablet tripod mount", params: { phoneT: 10, jawH: 24, width: 70 } },
    { names: ["selfie stick phone holder", "monopod phone holder", "gorillapod phone mount"], title: "Selfie stick phone holder", params: { width: 34 } },
    { names: ["landscape phone tripod mount", "vlogging phone mount"], title: "Vlogging phone mount", params: { jawH: 22, width: 50 } },
  ],
  body: `
// cross-section: x across the phone's thickness, z up; extruded along y (the phone's length)
const gapW = phoneT + 0.6;
const bw = Math.max(gapW + 2 * jawT, nutAF / Math.cos(Math.PI / 6) + 6);
const H = baseH + jawH;
const plate = (pts) => translate([0, width / 2, 0], rotate([90, 0, 0], linearExtrude({ h: width }, polygon(pts))));
const outline = [[-bw / 2, 0], [bw / 2, 0], [bw / 2, baseH], [gapW / 2 + jawT, baseH], [gapW / 2 + jawT, H], [gapW / 2, H], [gapW / 2, baseH],
  [-gapW / 2, baseH], [-gapW / 2, H], [-gapW / 2 - jawT, H], [-gapW / 2 - jawT, baseH], [-bw / 2, baseH]];
const nutH = nutAF * 0.5;                         // a 1/4-20 nut is 7/32 inch (5.6 mm) thick
const cuts = [
  // the nut pocket opens on the bed, the bolt's clearance hole runs on above it
  translate([0, 0, -1], cylinder({ r: (nutAF + 0.3) / 2 / Math.cos(Math.PI / 6), h: nutH + 1.4, $fn: 6 })),
  translate([0, 0, nutH], cylinder({ r: 3.4, h: Math.max(2, baseH - nutH - 1.5), $fn: 24 })),
];
return difference(plate(outline), ...cuts);
`,
};
