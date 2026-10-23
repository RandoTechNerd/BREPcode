// A bike bottle cage: a C-shaped sleeve that springs round the bottle, open
// at the front, with a half floor it stands on and a spine on the back that
// bolts to the frame's two cage bosses (64 mm apart on nearly every frame) or
// takes two hook-and-loop straps where there are none. Printed standing, so
// the sleeve is a straight wall; the side windows are diamonds, whose top
// edges are steep enough to bridge themselves.

export default {
  id: "bottle-cage",
  category: "vehicle",
  title: "Bike bottle cage",
  summary: "a bottle cage that bolts to a bike's cage bosses (or straps on), sized to the bottle.",
  print: "standing as shown, no supports. PETG or nylon so it springs without cracking.",
  names: ["bottle cage", "bike bottle cage", "water bottle cage", "bike bottle holder", "bicycle bottle cage",
    "bicycle bottle holder", "bike water bottle holder", "bidon cage", "cycling bottle cage"],
  nouns: ["cage", "holder"],
  keywords: ["bike", "bicycle", "bottle", "cycling", "frame", "water", "scooter"],
  fits: ["round"],
  primary: "bottleD",
  fromSpec: (s) => ({ bottleD: s.dims.d }),
  bridgeArea: (v) => v.mount === "strap" ? 2 * 3.4 * Math.max(26, v.bottleD / 3 + 2) : 0,
  tips: ["for a Nalgene", "strap on", "taller", "no windows"],
  examples: ["I want a bike bottle cage", "make me a bottle cage for a nalgene",
    "bike bottle holder that straps on", "water bottle cage for a 70mm bottle"],
  params: {
    bottleD: { default: 74, min: 50, max: 100, unit: "mm", label: "bottle diameter", say: ["bottle", "diameter", "across"], more: ["bigger"], less: ["smaller"] },
    grip: { default: 0.6, min: 0, max: 2, unit: "mm", label: "how much smaller than the bottle (grip)", say: ["grip", "tight"] },
    wall: { default: 3, min: 2, max: 5, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stiffer"] },
    height: { default: 120, min: 60, max: 180, unit: "mm", label: "cage height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    mouth: { default: 0.7, min: 0.5, max: 0.9, unit: "ratio", label: "front opening, as a fraction of the bottle", say: ["mouth", "opening"] },
    spacing: { default: 64, min: 40, max: 90, unit: "mm", label: "bolt spacing (64 on nearly every frame)", say: ["spacing", "bolt", "boss"] },
    plateT: { default: 4, min: 3, max: 8, unit: "mm", label: "spine thickness", say: ["spine", "plate"] },
    mount: { default: "bolts", unit: "choice", choices: ["bolts", "strap"], label: "bolts to the bosses, or straps on",
      words: { strap: ["strap", "straps", "strap on", "velcro", "no bosses", "zip tie"], bolts: ["bolt", "bolts", "bosses"] } },
    windows: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "side windows",
      words: { no: ["no windows", "solid", "closed"], yes: ["windows", "cutouts"] } },
  },
  things: [
    { names: ["bike soda holder", "bike beer holder", "bike drink holder", "soda bike cage", "beer bike cage"], title: "Bike can holder",
      spec: "soda-can", params: { height: 90 } },
    { names: ["nalgene bike cage", "nalgene bottle cage", "nalgene bike mount"], title: "Nalgene bike cage", spec: "nalgene-32", params: { height: 130, wall: 3.5 } },
    { names: ["hydro flask bike cage", "hydro flask bike mount", "insulated bottle cage"], title: "Hydro Flask bike cage", spec: "hydro-flask-21" },
    { names: ["strap on bottle cage", "scooter bottle holder", "bottle cage without bosses", "strap bottle cage"], title: "Strap-on bottle cage",
      params: { mount: "strap", plateT: 6 } },
    { names: ["large bottle cage", "big bottle cage", "1 liter bottle cage"], title: "Large bottle cage", params: { bottleD: 80, height: 140 } },
  ],
  body: `
// z is the bottle's axis; the frame is behind (-y), the mouth in front (+y)
const R = bottleD / 2 - grip;                    // a touch smaller: it springs round the bottle
const ro = R + wall;
const floor = Math.max(2.4, wall);
const m = bottleD * mouth;
const strap = mount === "strap";
const pt = strap ? Math.max(plateT, 6) : plateT;
const sw = Math.max(24, bottleD / 3);            // spine width
const sleeve = difference(
  cylinder({ r: ro, h: height, $fn: 96 }),
  translate([0, 0, floor], cylinder({ r: R, h: height, $fn: 96 })),
  translate([-m / 2, 0, -1], cube([m, ro + 1, height + 2])),     // the mouth, floor and all
);
const spine = translate([-sw / 2, -ro - pt, 0], cube([sw, pt + wall - 0.3, height]));
const cuts = [];
const zc = height / 2;
if (strap) {
  // two tunnels across the spine for hook-and-loop straps
  for (const z of [height * 0.22, height * 0.78]) cuts.push(translate([-sw / 2 - 1, -ro - pt + 1.2, z - 10.5], cube([sw + 2, 3.2, 21])));
} else {
  for (const z of [zc - spacing / 2, zc + spacing / 2]) {
    // a short upright slot for each bolt, countersunk inside so the bottle rides over the head
    cuts.push(hull(...[-2, 2].map((dz) => translate([0, -R + 1, z + dz], rotate([90, 0, 0], cylinder({ r: 2.75, h: pt + wall + 2, $fn: 24 }))))));
    cuts.push(translate([0, -R + 0.01, z], rotate([90, 0, 0], cylinder({ r1: 5.2, r2: 2.75, h: 2.45, $fn: 24 }))));
  }
}
if (windows === "yes" && height > 70) {
  // a tall diamond through each side wall
  const ww = R * 0.9, hw = Math.min(height - 2 * floor - 30, 1.6 * ww);
  // (drawn in y-z, then turned so it runs along x through both side walls)
  if (hw > 20) cuts.push(translate([-ro - 1, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: 2 * ro + 2 },
    polygon([[0, zc - hw / 2], [ww / 2, zc], [0, zc + hw / 2], [-ww / 2, zc]]))))));
}
return difference(union(sleeve, spine), ...cuts);
`,
};
