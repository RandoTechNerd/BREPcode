// A phone holder that clips onto a car's air vent. Seen from the side it is a
// C that grips the phone by two edges, with a fork on its back that pinches
// one vent slat a little tighter than it is thick. The whole side view is one
// profile, extruded across the width and printed lying on that side, so
// every wall is vertical. A plate on the bed end stops the phone sliding out.

export default {
  id: "vent-phone-mount",
  category: "vehicle",
  title: "Car vent phone mount",
  summary: "a phone holder that clips onto a car air vent slat and grips the phone by two edges.",
  print: "on its side as shown, no supports. PETG: PLA softens in a hot car.",
  names: ["car phone mount", "car phone holder", "vent phone mount", "vent phone holder", "air vent phone holder",
    "air vent phone mount", "car vent mount", "car vent phone holder", "car vent clip", "phone vent clip", "car mount for phone", "car vent holder", "air vent holder"],
  nouns: ["mount", "holder", "clip", "cradle"],
  keywords: ["car", "vent", "dashboard", "driving", "gps", "phone", "navigation"],
  fits: ["phone"],
  fromSpec: (s) => ({ phoneT: Math.round((s.dims.t + 3) * 10) / 10, phoneW: Math.round((s.dims.w + 2) * 10) / 10, phoneLen: Math.round((s.dims.h + 2) * 10) / 10 }),
  specNote: "the grip allows a few mm for a case",
  ask: {
    unless: ["phoneT"],
    text: "Which phone is it for? Name it (“for an iPhone 16”) and I’ll size the grip to it; I used a typical phone in a case, held sideways.",
  },
  tips: ["for a Pixel 9", "portrait", "50 mm wide", "for 3 mm vent slats"],
  examples: ["I want a car phone mount", "make me a vent phone holder for my iPhone 15 Pro",
    "car phone holder in portrait", "air vent phone mount for a galaxy s24"],
  params: {
    phoneW: { default: 80, min: 55, max: 100, unit: "mm", label: "phone width with its case", say: [] },
    phoneLen: { default: 160, min: 110, max: 190, unit: "mm", label: "phone length with its case", say: ["length", "long"] },
    phoneT: { default: 12, min: 6, max: 20, unit: "mm", label: "phone thickness with its case", say: ["thick", "thickness", "case"] },
    orient: { default: "landscape", unit: "choice", choices: ["landscape", "portrait"], label: "phone held sideways or upright",
      words: { portrait: ["portrait", "upright", "vertical", "vertically"], landscape: ["landscape", "sideways", "horizontal", "horizontally"] } },
    width: { default: 40, min: 25, max: 70, unit: "mm", label: "mount width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    lipH: { default: 6, min: 3, max: 15, unit: "mm", label: "how far the lips wrap the phone's face", say: ["lip"] },
    wall: { default: 3.5, min: 2.5, max: 6, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stronger", "stiffer"] },
    slatT: { default: 2, min: 1, max: 5, unit: "mm", label: "vent slat thickness", say: ["slat", "vent"] },
    clipL: { default: 18, min: 10, max: 30, unit: "mm", label: "how far the clip reaches into the vent", say: ["clip", "reach", "deep"] },
  },
  things: [
    { names: ["portrait car phone mount", "upright car phone holder", "vertical car phone mount"], title: "Portrait vent phone mount", params: { orient: "portrait" } },
    { names: ["gps vent mount", "sat nav vent mount", "gps car holder"], title: "GPS vent mount", params: { phoneW: 88, phoneT: 18, width: 50 } },
    { names: ["small phone car mount", "mini vent phone holder"], title: "Small phone vent mount", spec: "phone-small", params: { width: 34 } },
  ],
  body: `
// side profile: x runs out of the vent toward the driver, y runs up; printed lying on it
const span = (orient === "portrait" ? phoneLen : phoneW) + 1;   // between the two jaws
const H = span + 2 * wall;
const D = wall + phoneT + 1 + wall;              // back, phone, front lip
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const slab = (pts) => linearExtrude({ h: width }, polygon(pts));
const parts = [
  slab(box(0, 0, wall, H)),                                  // back plate
  slab(box(0, 0, D, wall)),                                  // bottom jaw
  slab(box(D - wall, 0, D, wall + lipH)),                    // its lip over the phone's face
  slab(box(0, H - wall, D, H)),                              // top jaw
  slab(box(D - wall, H - wall - lipH, D, H)),                // and its lip
];
// the fork: two tines that pinch a slat, a touch closer than the slat is thick
const g = Math.max(0.6, slatT - 0.4);
const tine = Math.max(2.6, wall * 0.75);
const yc = H / 2;
parts.push(slab(box(-clipL, yc + g / 2, 0.5, yc + g / 2 + tine)));
parts.push(slab(box(-clipL, yc - g / 2 - tine, 0.5, yc - g / 2)));
parts.push(slab(box(0.4 - 2 * clipL / 5, yc - g / 2 - tine - 2, 0.5, yc + g / 2 + tine + 2)));   // root block between the tines and the plate
// an end stop on the bed side so the phone cannot slide out that way
parts.push(linearExtrude({ h: 2 }, polygon(box(0, 0, D, H))));
// the slot between the tines, flared at the mouth so a slat finds its way in
const xEnd = 0.4 - 2 * clipL / 5;
const tineGap = translate([0, 0, -1], linearExtrude({ h: width + 2 }, polygon([
  [-clipL - 1, yc - g / 2 - 1.2], [-clipL + 3, yc - g / 2], [xEnd, yc - g / 2],
  [xEnd, yc + g / 2], [-clipL + 3, yc + g / 2], [-clipL - 1, yc + g / 2 + 1.2],
])));
return translate([-D / 2, -H / 2, 0], difference(union(...parts), tineGap));
`,
};
