// A wall peg for weight plates: a round peg sized to the plate's bore, on
// a plate with four countersunk screws, a cone at the root to take the
// bending and a flared lip at the tip so plates cannot slide off. The peg
// is one lathed profile; it prints standing up off the wall plate, the lip
// flaring at 50 degrees.

export default {
  id: "plate-peg",
  category: "fitness",
  title: "Weight plate peg",
  summary: "a wall peg sized to a weight plate's centre hole, with a flared lip and a screw plate.",
  print: "on its back as shown, no supports. PETG, 6 walls, 50% infill; screw into a stud and keep the heavy plates near the wall.",
  names: ["weight plate holder", "weight plate peg", "weight plate storage", "plate storage peg", "weight plate rack",
    "gym plate holder", "barbell plate holder", "weight plate hanger", "plate tree peg"],
  nouns: ["peg", "holder", "storage", "hanger"],
  keywords: ["weight", "plate", "plates", "olympic", "bumper", "gym", "barbell", "wall"],
  fits: ["plate-bore"],
  fromSpec: (s) => ({ pegD: Math.round(s.dims.d - 4) }),
  specNote: "the peg is 4 mm under the plate's hole so plates slide on easily",
  tips: ["for olympic plates", "150 mm long", "bigger lip"],
  examples: ["I want a weight plate holder", "make me a weight plate peg for olympic plates",
    "plate storage peg 150mm long", "a wall holder for my bumper plates"],
  params: {
    pegD: { default: 46, min: 20, max: 60, unit: "mm", label: "peg diameter", say: ["peg", "diameter", "across"] },
    pegL: { default: 120, min: 40, max: 220, unit: "mm", label: "peg length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    plateW: { default: 90, min: 60, max: 160, unit: "mm", label: "wall plate width", say: ["wide", "width"] },
    plateH: { default: 120, min: 60, max: 200, unit: "mm", label: "wall plate height", say: ["tall", "high", "height"] },
    plateT: { default: 8, min: 5, max: 15, unit: "mm", label: "wall plate thickness", say: ["thick", "thickness"] },
    collar: { default: 4, min: 0, max: 10, unit: "mm", label: "tip lip height (0 = none)", say: ["lip", "collar"] },
  },
  things: [
    { names: ["olympic plate holder", "olympic plate peg", "olympic weight plate holder"], title: "Olympic plate peg", spec: "olympic-plate" },
    { names: ["bumper plate holder", "bumper plate peg", "bumper plate storage"], title: "Bumper plate peg", spec: "olympic-plate", params: { pegL: 160 } },
    { names: ["standard plate holder", "standard weight plate holder", "1 inch plate holder"], title: "Standard plate peg", spec: "standard-plate" },
    { names: ["change plate holder", "fractional plate holder", "small plate peg"], title: "Change plate peg", spec: "olympic-plate", params: { pegL: 70 } },
    { names: ["barbell collar holder", "collar storage peg", "barbell clip holder"], title: "Barbell collar peg", params: { pegD: 46, pegL: 60, collar: 3 } },
    { names: ["resistance band peg", "band storage peg", "jump rope peg"], title: "Band storage peg", params: { pegD: 25, pegL: 80, plateW: 60, plateH: 80, collar: 5 } },
  ],
  body: `
const rp = pegD / 2;
const H = Math.max(plateH, 2 * rp + 50);                  // room above and below the peg for the screws
const W = plateW;
// four countersunk screws in the plate's corners, cut before the peg goes on
const screwCut = (x, y) => [translate([x, y, -1], cylinder({ r: 2.6, h: plateT + 2, $fn: 16 })), translate([x, y, plateT - 2.6], cylinder({ r1: 2.6, r2: 5.3, h: 2.61, $fn: 16 }))];
const sx = W / 2 - 12, sy = H / 2 - 12;
const wallPlate = difference(translate([-W / 2, -H / 2, 0], cube([W, H, plateT])),
  ...screwCut(-sx, -sy), ...screwCut(sx, -sy), ...screwCut(-sx, sy), ...screwCut(sx, sy));
// the peg: a root cone, the shank, and a lip flaring out at 50 degrees
const z0 = plateT - 0.5, L = pegL + 0.5, lipH = collar * 1.2;
const prof = [[0, 0], [rp + 8, 0], [rp, 8]];
if (collar > 0) prof.push([rp, L - lipH - 2], [rp + collar, L - 2], [rp + collar, L]);
else prof.push([rp, L]);
prof.push([0, L]);
return union(wallPlate, translate([0, 0, z0], revolve(360, polygon(prof))));
`,
};
