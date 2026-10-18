// A U-shaped cradle on a wall plate, for anything round that lies across it:
// a rolled yoga mat, a foam roller, a coiled hose. One flat profile, printed
// on its side, so every layer runs the length of the hook and there is no
// overhang anywhere. The inner circle touches the plate face, and the corner
// under it is filled solid, which is the gusset that takes the load.

export default {
  id: "cradle-hook",
  category: "wall",
  title: "Wall cradle hook",
  summary: "a U-shaped wall hook that cradles anything round: mats, rollers, coiled hoses and cords.",
  print: "on its side as shown (no supports); the flat back goes against the wall. Long things want two.",
  names: ["cradle hook", "u hook", "wall cradle", "round hook", "wall hanger", "cradle hanger", "saddle hook"],
  nouns: ["hook", "hanger", "holder", "rack", "mount", "cradle"],
  keywords: ["wall", "hang", "roll", "rolled", "coil", "store"],
  fits: ["round"],
  primary: "itemD",
  fromSpec: (s) => ({ itemD: s.dims.d }),
  tips: ["for a foam roller", "200 mm across", "60 mm wide", "deeper lip"],
  examples: ["make me a hook for yoga roll", "a wall hook for my foam roller",
    "hose hanger for the garage", "cradle hook that holds something 120mm across"],
  params: {
    itemD: { default: 80, min: 20, max: 300, unit: "mm", label: "diameter of what it holds", say: ["diameter", "across", "round", "roll", "mat", "roller"], more: ["bigger", "larger"], less: ["smaller"] },
    gap: { default: 3, min: 0, max: 20, unit: "mm", label: "room around it", say: ["gap", "clearance", "room"] },
    width: { default: 40, min: 15, max: 160, unit: "mm", label: "hook width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 6, min: 3, max: 14, unit: "mm", label: "thickness", say: ["thick", "thickness", "strong"], more: ["stronger", "thicker", "sturdier"] },
    lipAngle: { default: 35, min: 0, max: 80, unit: "deg", label: "how far the front lip curls up", say: ["lip", "angle", "degree"], more: ["deeper"], less: ["shallower"] },
    above: { default: 25, min: 14, max: 80, unit: "mm", label: "plate height above the cradle", say: ["plate", "above"] },
    screwD: { default: 4.5, min: 3, max: 6.5, unit: "mm", label: "screw hole diameter", say: ["screw", "hole"] },
  },
  things: [
    { names: ["yoga mat hook", "yoga mat holder", "yoga mat hanger", "yoga mat wall mount", "yoga mat rack", "yoga mat storage", "mat hook"],
      title: "Yoga mat hook", spec: "yoga-mat", params: { width: 40 } },
    { names: ["foam roller holder", "foam roller hook", "foam roller mount", "foam roller rack"],
      title: "Foam roller holder", spec: "foam-roller", params: { width: 40 } },
    { names: ["hose hanger", "hose holder", "garden hose hook", "hose hook", "hose rack"],
      title: "Hose hanger", spec: "garden-hose", params: { width: 70, wall: 9, lipAngle: 50 } },
    { names: ["extension cord hanger", "cord hanger", "cable coil hook", "extension cord holder", "cord storage hook"],
      title: "Cord hanger", spec: "extension-cord", params: { width: 50, wall: 7 } },
    { names: ["bat hanger", "bat holder", "baseball bat holder", "bat rack"],
      title: "Bat holder", spec: "baseball-bat", params: { width: 30, lipAngle: 45 } },
    { names: ["poster tube holder", "blueprint holder", "rolled poster holder"],
      title: "Poster tube holder", spec: "poster-tube", params: { width: 30 } },
    { names: ["towel roll holder", "rolled towel holder"], title: "Rolled towel holder", spec: "towel-rolled", params: { width: 50 } },
    { names: ["wrapping paper holder", "gift wrap holder", "wrapping paper storage", "wrapping paper rack", "wrapping paper hanger"],
      title: "Wrapping paper holder", spec: "wrapping-paper", params: { width: 30, lipAngle: 45 } },
  ],
  body: `
// side profile: x runs out from the wall, y runs up; printed lying on it
const R = itemD / 2 + gap;                       // inside of the cradle
const Ro = R + wall;
const cx = wall + R, cy = Ro;                    // inner circle touches the plate face
const top = cy + above;                          // top of the wall plate
const lip = lipAngle * Math.PI / 180;
const arc = (r, a0, a1, N = 48) => Array.from({ length: N + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / N;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
});
const outline = [
  [0, 0],
  ...arc(Ro, -Math.PI / 2, lip),                 // under and round the front, up to the lip
  ...arc(R, lip, -Math.PI),                      // back along the inside to the plate
  [wall, top], [0, top],
];
const piece = linearExtrude({ h: width }, polygon(outline));

// countersunk screw holes through the plate, above the cradle
const yh = cy + above / 2;
const zs = width < 45 ? [width / 2] : [width * 0.25, width * 0.75];
const k = screwD / 2;                            // 90 degree countersink depth
const holes = zs.flatMap((z) => [
  translate([-1, yh, z], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: wall + 2, $fn: 24 }))),
  translate([wall - k + 0.02, yh, z], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]);
return difference(piece, ...holes);
`,
};
