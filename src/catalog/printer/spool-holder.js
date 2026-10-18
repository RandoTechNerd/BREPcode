// A desk spool holder: a base with uprights whose tops are open U notches,
// and an axle that drops into them. The spool hangs on the axle through its
// hub hole, so the uprights only have to be tall enough for the spool to
// clear the base. The axle prints standing up beside the base; its top
// collar flares out at 45 degrees, its bottom collar sits on the bed, and
// both keep it from sliding out of the notches.

export default {
  id: "spool-holder",
  category: "printer",
  title: "Spool holder",
  summary: "a desk stand for filament spools: open-topped uprights and a drop-in axle through the spool's hub.",
  print: "base flat, axle standing beside it, no supports.",
  names: ["spool holder", "filament holder", "spool stand", "filament spool holder", "filament stand",
    "spool rack", "filament spool stand", "desk spool holder", "spool roller", "filament rack", "reel holder"],
  nouns: ["holder", "stand", "rack"],
  keywords: ["spool", "filament", "reel", "printer", "pla", "petg"],
  fits: ["spool"],
  fromSpec: (s) => ({ spoolD: s.dims.d, spoolW: s.dims.w, boreD: s.dims.bore }),
  specNote: "with room to turn",
  tips: ["for 2 spools", "for a 3kg spool", "axle 20 mm"],
  examples: ["make me a spool holder", "a filament spool holder for 2 spools",
    "spool stand for a 3kg spool", "filament holder for a spool 200mm across"],
  params: {
    // no "spool" in any say list: in "3kg spool" the 3 is a weight, not a size or a count
    spoolD: { default: 200, min: 60, max: 300, unit: "mm", label: "spool diameter", say: ["diameter", "across"] },
    spoolW: { default: 70, min: 30, max: 120, unit: "mm", label: "spool width", say: ["wide", "width"] },
    boreD: { default: 53, min: 15, max: 80, unit: "mm", label: "spool hub hole", say: ["hub", "bore", "hole", "center"] },
    axleD: { default: 16, min: 8, max: 30, unit: "mm", label: "axle diameter", say: ["axle", "rod", "shaft"] },
    spools: { default: 1, min: 1, max: 3, unit: "count", label: "spools side by side", say: ["spool", "roll", "colour", "color", "bay"] },
    wall: { default: 5, min: 3, max: 10, unit: "mm", label: "base and upright thickness", say: ["wall", "thick", "strong"], more: ["stronger", "sturdier"] },
  },
  things: [
    { names: ["1kg spool holder", "1 kg spool holder", "standard spool holder"], title: "1 kg spool holder", spec: "spool-1kg" },
    { names: ["dual spool holder", "double spool holder", "two spool holder", "2 spool holder"], title: "Dual spool holder", params: { spools: 2 } },
    { names: ["triple spool holder", "three spool holder"], title: "Triple spool holder", params: { spools: 3, spoolW: 66 } },
    { names: ["mini spool holder", "sample spool holder", "250g spool holder", "small spool holder"], title: "Mini spool holder", spec: "spool-mini" },
    { names: ["3kg spool holder", "3 kg spool holder", "large spool holder", "big spool holder"], title: "3 kg spool holder", spec: "spool-3kg", params: { axleD: 20, wall: 7 } },
    { names: ["solder spool holder", "solder reel holder", "solder wire holder"], title: "Solder reel holder",
      params: { spoolD: 60, spoolW: 45, boreD: 18, axleD: 10, wall: 4 } },
    { names: ["wire spool holder", "wire reel holder", "ribbon spool holder", "thread spool holder"], title: "Wire spool holder",
      params: { spoolD: 120, spoolW: 60, boreD: 30, axleD: 14, spools: 2 } },
  ],
  body: `
const ad = Math.min(axleD, boreD - 4);              // the axle has to go through the hub
const ut = Math.max(6, wall * 1.4);                 // upright thickness, along the axle
const bay = spoolW + 6;                             // room for one spool between uprights
const L = spools * bay + (spools + 1) * ut;         // base length, along the axle
const D = Math.max(60, spoolD * 0.5);               // base depth, front to back
// the spool hangs from the axle: its centre is (bore - axle) / 2 below the axle's
const axleZ = wall + 5 + spoolD / 2 + (boreD - ad) / 2;
const ar = ad / 2 + 0.6;                            // notch radius
const topZ = axleZ + ad * 0.5;
const uw = ad + 2 * wall + 8;                       // upright width at the top
const r = Math.min(8, D / 4);
const base = hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * (L / 2 - r), sy * (D / 2 - r), 0], cylinder({ r, h: wall, $fn: 24 }))));
// an upright: a trapezoid drawn across (y, z), standing at x
// rotate([90, 90, 0]) sends the profile's x to y, its y to z, and the extrusion to +x
const upright = (x) => translate([x, 0, 0], rotate([90, 90, 0], linearExtrude({ h: ut },
  polygon([[-D * 0.4, 0], [D * 0.4, 0], [uw / 2, topZ], [-uw / 2, topZ]]))));
const ups = Array.from({ length: spools + 1 }, (_, i) => upright(-L / 2 + i * (bay + ut)));
const notch = union(
  translate([-L / 2 - 1, 0, axleZ], rotate([0, 90, 0], cylinder({ r: ar, h: L + 2, $fn: 40 }))),
  translate([-L / 2 - 1, -ar, axleZ], cube([L + 2, 2 * ar, topZ])),
);
const stand = difference(union(base, ...ups), notch);
// the axle, standing: a collar on the bed, the shaft, a 45 degree flare on top
const ce = Math.min(3, (boreD - ad) / 2 - 0.5);
const shaftH = L + 1;
const ra = ad / 2;
const axle = revolve(360, polygon(ce >= 1
  ? [[0, 0], [ra + ce, 0], [ra + ce, 3], [ra, 3], [ra, 3 + shaftH], [ra + ce, 3 + shaftH + ce], [0, 3 + shaftH + ce]]
  : [[0, 0], [ra, 0], [ra, shaftH + 6], [0, shaftH + 6]]));
return group(stand, translate([0, D / 2 + ad / 2 + ce + 8, 0], axle));
`,
};
