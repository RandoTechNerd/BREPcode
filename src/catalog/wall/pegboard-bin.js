// A bin, cup or shelf for 1/4 inch (or 1/8 inch) pegboard. Printed upright,
// open side up. The pegs on the back are diamond-section prisms, so their
// faces lean 45 degrees and the round hole takes the diamond's diagonal; the
// top pegs turn up behind the board, and a straight peg one hole (1 inch)
// lower stops the bin swinging. The upturn grows up out of the peg, which is
// what lets this print upright: a Skadis bin's hooks would point down and
// start in mid-air, so this one is for pegboard.

export default {
  id: "pegboard-bin",
  category: "wall",
  title: "Pegboard bin",
  summary: "a bin, cup or shelf that hangs on 1/4 inch pegboard by its own pegs.",
  print: "upright as shown, no supports. PETG if it will carry tools.",
  names: ["pegboard bin", "peg board bin", "pegboard basket", "pegboard box", "pegboard container",
    "pegboard storage", "pegboard holder", "pegboard organizer"],
  nouns: ["bin", "cup", "basket", "tray", "box"],
  keywords: ["pegboard", "peg", "garage", "workshop", "wall", "board"],
  fits: ["pegboard"],
  fromSpec: (s) => ({ board: s.dims.t < 5 ? "small" : "pegboard" }),
  triple: ["width", "depth", "height"],
  tips: ["a round cup", "100 x 60 x 50", "1/8 inch pegboard"],
  examples: ["I want a pegboard bin", "make me a pegboard bin 120 x 60 x 50",
    "a pegboard cup for screwdrivers", "a bin for my pegboard"],
  params: {
    width: { default: 80, min: 30, max: 200, unit: "mm", label: "width (or cup diameter)", say: ["wide", "width", "across", "diameter"], more: ["wider"], less: ["narrower"] },
    depth: { default: 50, min: 20, max: 150, unit: "mm", label: "depth out from the board", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    height: { default: 60, min: 15, max: 150, unit: "mm", label: "bin height", say: ["tall", "high", "height"], more: ["taller"], less: ["lower", "shorter"] },
    backH: { default: 0, min: 0, max: 80, unit: "mm", label: "back plate above the rim", say: ["back", "plate"] },
    wall: { default: 1.8, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 2, min: 1.2, max: 5, unit: "mm", label: "floor thickness", say: ["floor"] },
    cornerR: { default: 5, min: 1, max: 20, unit: "mm", label: "front corner radius", say: ["corner", "round"] },
    shape: { default: "box", unit: "choice", choices: ["box", "cup"], label: "shape",
      words: { cup: ["cup", "round", "cylinder", "tube"], box: ["box", "square", "bin"] } },
    board: { default: "pegboard", unit: "choice", choices: ["pegboard", "small"], label: "board (small = 1/8 in pegboard)",
      words: { small: ["1/8 pegboard", "1 8 pegboard", "thin pegboard", "small hole pegboard", "eighth inch"], pegboard: ["pegboard", "1/4 pegboard", "quarter inch"] } },
  },
  things: [
    { names: ["pegboard cup", "pegboard pen cup", "pegboard tool cup", "round pegboard bin"], title: "Pegboard cup",
      params: { shape: "cup", width: 60, height: 80 } },
    { names: ["pegboard shelf", "peg board shelf", "pegboard tray", "pegboard ledge"], title: "Pegboard shelf",
      params: { width: 150, depth: 80, height: 20, backH: 40 } },
    { names: ["deep pegboard bin", "large pegboard bin", "big pegboard bin"], title: "Large pegboard bin",
      params: { width: 150, depth: 90, height: 80, wall: 2.2 } },
    { names: ["small pegboard bin", "mini pegboard bin", "pegboard parts bin"], title: "Small pegboard bin",
      params: { width: 55, depth: 40, height: 40, cornerR: 4 } },
    { names: ["1/8 pegboard bin", "thin pegboard bin", "pegboard bin for 1/8 inch board"], title: "Bin for 1/8 inch pegboard",
      spec: "pegboard-eighth", params: { width: 80, depth: 45, height: 50 } },
  ],
  body: `
// x across, y out from the board (the board's face is y = 0), z up
const small = board === "small";
const tB = small ? 3.2 : 6.35;                       // board thickness
const hd = (small ? 4.76 : 6.35) - 0.45;             // diamond diagonal: just under the hole
const s = hd / Math.SQRT2;                           // the upturn's square section
const rise = small ? 5 : 7;                          // how far it turns up behind the board
const backT = Math.max(3, wall);
const top = height + backH;
const zU = top - hd / 2 - 2;                         // the hooking pegs
const zL = zU - 25.4;                                // the resting pegs, one hole down
const span = Math.floor((width - 2 * wall - hd) / 25.4);
const xs = span >= 1 ? [-span * 25.4 / 2, span * 25.4 / 2] : [0];
const diamond = polygon([[0, -hd / 2], [hd / 2, 0], [0, hd / 2], [-hd / 2, 0]]);
// a peg straight back from the plate: the diamond stretched along -y
const peg = (x, z, len) => translate([x, 0.5, z], rotate([90, 0, 0], linearExtrude({ h: len + 0.5 }, diamond)));
const reachBack = tB + 0.4 + s;
const pegs = xs.flatMap((x) => [
  peg(x, zU, reachBack),
  translate([x - s / 2, -reachBack, zU], cube([s, s, hd / 2 + rise])),
  ...(zL >= hd / 2 + 0.5 ? [peg(x, zL, tB - 0.6)] : []),
]);

let bin;
if (shape === "cup") {
  const R = width / 2;
  const outer = union(
    translate([0, R, 0], cylinder({ r: R, h: height, $fn: 64 })),
    translate([-R, 0, 0], cube([2 * R, backT, top])),
  );
  bin = difference(outer, translate([0, R, floor], cylinder({ r: R - wall, h: top, $fn: 64 })));
} else {
  const rr = Math.max(0.6, Math.min(cornerR, width / 2 - 1, depth / 2 - 1));
  // a flat back against the board, rounded front corners
  const box = (w, d, y0, z0, h, r) => hull(
    translate([-w / 2, y0, z0], cube([w, 0.1, h])),
    translate([-w / 2 + r, y0 + d - r, z0], cylinder({ r, h, $fn: 32 })),
    translate([w / 2 - r, y0 + d - r, z0], cylinder({ r, h, $fn: 32 })),
  );
  const outer = backH > 0
    ? union(box(width, depth, 0, 0, height, rr), translate([-width / 2, 0, 0], cube([width, backT, top])))
    : box(width, depth, 0, 0, height, rr);
  bin = difference(outer, box(width - 2 * wall, depth - backT - wall, backT, floor, top, Math.max(0.5, rr - wall)));
}
return union(bin, ...pegs);
`,
};
