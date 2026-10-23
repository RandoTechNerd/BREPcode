// A filament guide that snaps over an aluminium frame extrusion (2020,
// 3030, 4040) with an arm that holds the filament, or a PTFE tube, through
// an eyelet. The clamp's arms carry small barbs that click into the
// extrusion's side slots. One profile across the extrusion, printed lying
// down; the eyelet runs across the arm and is a teardrop, so its roof is 45
// degrees rather than a sagging arch.

export default {
  id: "filament-guide",
  category: "printer",
  title: "Filament guide",
  summary: "a guide that snaps onto a 2020, 3030 or 4040 frame extrusion and leads filament or PTFE tube through an eyelet.",
  print: "flat as shown, no supports.",
  names: ["filament guide", "filament guide arm", "filament feed guide", "ptfe guide", "ptfe tube guide",
    "bowden tube guide", "filament runner guide", "extrusion filament guide", "filament eyelet", "filament feeder guide"],
  nouns: ["guide", "eyelet"],
  keywords: ["filament", "ptfe", "bowden", "extrusion", "frame", "printer", "ender", "2020"],
  fits: ["extrusion"],
  fromSpec: (s) => ({ extrusion: s.dims.size, slotW: s.dims.slot }),
  tips: ["for 3030 extrusion", "80 mm arm", "PTFE hole 4.3 mm"],
  examples: ["make me a filament guide", "filament guide for 2020 extrusion with a 60mm arm",
    "ptfe tube guide for 3030", "a filament guide for my ender 3"],
  params: {
    extrusion: { default: 20, min: 15, max: 45, unit: "mm", label: "extrusion size", say: ["extrusion", "frame", "profile", "rail"] },
    slotW: { default: 6, min: 3, max: 10, unit: "mm", label: "slot opening", say: ["slot"] },
    armL: { default: 40, min: 10, max: 100, unit: "mm", label: "arm length", say: ["arm", "long", "length", "tall", "high"], more: ["longer", "taller"], less: ["shorter"] },
    holeD: { default: 4.5, min: 2.5, max: 8, unit: "mm", label: "eyelet hole", say: ["hole", "eyelet", "tube", "ptfe"] },
    thickness: { default: 10, min: 6, max: 20, unit: "mm", label: "clip thickness", say: ["thick", "thickness", "wide", "width"] },
    wallT: { default: 3, min: 2, max: 5, unit: "mm", label: "wall thickness", say: ["wall", "strong"], more: ["stronger"] },
  },
  things: [
    { names: ["2020 filament guide", "2020 extrusion filament guide"], title: "2020 filament guide", spec: "extrusion-2020" },
    { names: ["3030 filament guide", "3030 extrusion filament guide"], title: "3030 filament guide", spec: "extrusion-3030" },
    { names: ["4040 filament guide"], title: "4040 filament guide", spec: "extrusion-4040", params: { wallT: 4 } },
    { names: ["ender 3 filament guide", "ender filament guide", "cr 10 filament guide"], title: "Ender 3 filament guide", spec: "extrusion-2020", params: { armL: 50 } },
    { names: ["ptfe tube holder", "bowden tube holder", "ptfe tube clip"], title: "PTFE tube holder", params: { holeD: 4.3, thickness: 12, armL: 30 } },
  ],
  body: `
// profile across the extrusion: x sideways, y up; extruded \`thickness\` along the extrusion
const w = wallT, f = 0.2;
const hx = extrusion / 2 + f;                        // inside of the clamp
const top = extrusion / 2 + f;                       // underside of its top bar
const low = -extrusion / 4;                          // the arms reach past the side slots' middle
const bs = Math.min(slotW * 0.8, extrusion / 3), bd = Math.min(1.2, slotW / 4);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const sw = Math.max(holeD + 2 * w, 8);               // the arm's width
const yTop = top + w + armL;
const pieces = [
  rect(-hx - w, top, hx + w, top + w),
  rect(-hx - w, low, -hx, top + 0.01),
  rect(hx, low, hx + w, top + 0.01),
  // barbs that click into the side slots
  [[-hx - 0.01, -bs / 2], [-hx + bd, 0], [-hx - 0.01, bs / 2]],
  [[hx + 0.01, -bs / 2], [hx + 0.01, bs / 2], [hx - bd, 0]],
  rect(-sw / 2, top + w - 0.01, sw / 2, yTop),
];
const solid = union(...pieces.map((p) => linearExtrude({ h: thickness }, polygon(p))),
  translate([0, yTop, 0], cylinder({ r: sw / 2, h: thickness, $fn: 32 })));
// the eyelet: across the arm, a teardrop pointing up the print
const r = Math.min(holeD / 2, (thickness / 2 - 0.8) / 1.42);
const zc = thickness / 2;
const eyelet = hull(
  translate([-sw, yTop, zc], rotate([0, 90, 0], cylinder({ r, h: 2 * sw, $fn: 24 }))),
  translate([-sw, yTop - 0.01, zc + r * 1.41 - 0.01], cube([2 * sw, 0.02, 0.02])),
);
return difference(solid, eyelet);
`,
};
