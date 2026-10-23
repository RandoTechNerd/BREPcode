// A stand for a soldering iron: a base with two open-topped cradles that
// hold the iron tip-down at an angle (the rear one cups the grip, the front
// one the thinner shaft), and a walled tray in front for a sponge or brass
// wool. Every cradle is a plate standing straight up off the base, so it
// prints with nothing hanging.

export default {
  id: "soldering-stand",
  category: "electronics",
  title: "Soldering iron stand",
  summary: "a stand that rests a soldering iron at an angle in two cradles, with a tray for the tip-cleaning sponge.",
  print: "upright as shown, no supports. PETG or ABS near the tip.",
  names: ["soldering iron stand", "soldering iron holder", "solder iron stand", "soldering stand", "soldering iron rest",
    "soldering iron cradle", "soldering pen stand", "solder station stand"],
  nouns: ["stand", "rest", "cradle"],
  keywords: ["soldering", "solder", "iron", "electronics", "pinecil", "ts100", "workbench"],
  tips: ["for a 20 mm grip", "steeper", "no sponge tray"],
  examples: ["make me a soldering iron stand", "soldering iron holder for a pinecil",
    "a soldering stand at 35 degrees", "soldering iron rest without a sponge tray"],
  params: {
    ironD: { default: 16, min: 8, max: 30, unit: "mm", label: "grip diameter", say: ["grip", "handle", "iron", "diameter"] },
    angle: { default: 25, min: 10, max: 45, unit: "deg", label: "angle of the iron", say: ["angle", "tilt", "degree"], more: ["steeper"], less: ["flatter"] },
    length: { default: 150, min: 90, max: 220, unit: "mm", label: "base length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 70, min: 40, max: 140, unit: "mm", label: "base width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "wall thickness", say: ["wall", "strong"], more: ["sturdier"] },
    sponge: { default: "yes", unit: "choice", choices: ["no", "yes"], label: "sponge tray",
      words: { no: ["no sponge", "without a sponge", "without sponge", "no tray", "without a sponge tray", "no sponge tray"], yes: ["sponge", "brass wool", "tray"] } },
  },
  things: [
    { names: ["pinecil stand", "pinecil holder", "pinecil rest"], title: "Pinecil stand", keywords: ["pinecil"], params: { ironD: 14, length: 130 } },
    { names: ["ts100 stand", "ts101 stand", "ts80 stand", "ts100 holder"], title: "TS100 stand", keywords: ["ts100", "ts101", "ts80"], params: { ironD: 13, length: 130 } },
    { names: ["soldering station iron holder", "weller iron stand", "hakko iron stand"], title: "Station iron stand", keywords: ["weller", "hakko", "station"], params: { ironD: 22, length: 170, width: 80 } },
  ],
  body: `
const baseT = Math.max(3, wall);
const r = Math.min(8, width / 4);
const base = hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * (length / 2 - r), sy * (width / 2 - r), 0], cylinder({ r, h: baseT, $fn: 24 }))));
// cradles: the tip points to -x, down the slope
const ct = Math.max(5, wall * 1.6);                  // cradle thickness along the iron
const x2 = length / 2 - ct - 6, span = length * 0.5;
const x1 = x2 - span;
const r1 = ironD * 0.35 + 1, r2 = ironD / 2 + 1;     // front cups the shaft, rear the grip
const z1 = baseT + r1 + 8, z2 = z1 + span * Math.tan(angle * Math.PI / 180);
// a cradle: a trapezoid across the base (y, z) with a U notch on top, standing at x
// rotate([90, 90, 0]) sends the profile's x to y, its y to z, and the extrusion to +x
const cradle = (x, zc, rn) => {
  // narrower at the top than the bottom, so the sides never lean out
  const bh = Math.min(width / 2 - 2, rn + wall + 13), hw = Math.min(rn + wall + 3, bh);
  const top = zc + rn * 0.6;
  const plate = translate([x, 0, 0], rotate([90, 90, 0], linearExtrude({ h: ct },
    polygon([[-bh, 0], [bh, 0], [hw, top], [-hw, top]]))));
  return difference(plate,
    translate([x - 1, 0, zc], rotate([0, 90, 0], cylinder({ r: rn, h: ct + 2, $fn: 32 }))),
    translate([x - 1, -rn, zc], cube([ct + 2, 2 * rn, top])));
};
const parts = [base, cradle(x1, z1, r1), cradle(x2, z2, r2)];
// the sponge tray, in front of the front cradle
const trayL = x1 - (-length / 2) - 10;
if (sponge === "yes" && trayL > 25) {
  const tw = width - 8, tx = -length / 2 + 4 + trayL / 2;
  parts.push(difference(
    translate([tx - trayL / 2, -tw / 2, baseT - 0.01], cube([trayL, tw, 10.01])),
    translate([tx - trayL / 2 + wall, -tw / 2 + wall, baseT], cube([trayL - 2 * wall, tw - 2 * wall, 11]))));
}
return union(...parts);
`,
};
