// A wall-mounted snap clip for anything with a straight handle. The ring is a
// little smaller than the handle and its mouth narrower still, so the handle
// pushes in and is held by the plastic springing back. Printed standing as
// mounted, so the ring is a straight wall and the plate needs no support.

export default {
  id: "broom-holder",
  category: "garage",
  title: "Broom holder",
  summary: "a wall clip that snaps onto a broom, mop or tool handle.",
  print: "upright as shown, no supports. PETG flexes without cracking.",
  names: ["broom holder", "broom hanger", "mop holder", "broom clip", "mop clip", "tool clip", "handle clip",
    "broom mount", "wall broom holder", "broom grip", "mop hanger", "tool holder clip"],
  nouns: ["holder", "clip", "grip", "mount", "hanger"],
  keywords: ["broom", "mop", "garage", "handle", "wall", "closet", "tool"],
  fits: ["handle"],
  primary: "handleD",
  fromSpec: (s) => ({ handleD: s.dims.d }),
  tips: ["for a 28 mm handle", "taller", "stand it 20 mm off the wall"],
  examples: ["I want a broom holder", "make me a mop holder for the closet",
    "clip for a rake handle", "broom holder for a 25mm handle"],
  params: {
    handleD: { default: 24, min: 10, max: 50, unit: "mm", label: "handle diameter", say: ["handle", "diameter", "thick", "pole", "broom"] },
    grip: { default: 0.6, min: 0, max: 2, unit: "mm", label: "how much smaller than the handle (grip)", say: ["tight", "tighter"] },
    ringT: { default: 3.5, min: 2, max: 6, unit: "mm", label: "ring thickness", say: ["ring"], more: ["stronger", "stiffer"] },
    height: { default: 25, min: 12, max: 60, unit: "mm", label: "clip height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    plateW: { default: 64, min: 40, max: 140, unit: "mm", label: "wall plate width", say: ["plate", "wide", "width"] },
    plateT: { default: 5, min: 3, max: 8, unit: "mm", label: "wall plate thickness", say: ["thickness"] },
    offWall: { default: 3, min: 0, max: 40, unit: "mm", label: "distance off the wall", say: ["standoff", "away", "off", "out"] },
    opening: { default: 0.82, min: 0.6, max: 0.95, unit: "ratio", label: "mouth width, as a fraction of the handle", say: ["mouth", "opening"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["rake holder", "rake hanger", "garden tool holder"], title: "Rake holder", spec: "rake" },
    { names: ["shovel holder", "spade holder"], title: "Shovel holder", spec: "shovel", params: { ringT: 4.5, height: 35 } },
    { names: ["swiffer holder", "swiffer hanger"], title: "Swiffer holder", spec: "swiffer" },
    { names: ["umbrella holder", "umbrella clip"], title: "Umbrella clip", spec: "umbrella" },
    { names: ["hockey stick holder", "hockey stick rack"], title: "Hockey stick holder", spec: "hockey-stick" },
    { names: ["pool cue holder", "cue holder"], title: "Pool cue holder", spec: "pool-cue" },
    { names: ["closet rod holder", "dowel holder", "rod clip"], title: "Rod clip", spec: "dowel-1in" },
  ],
  body: `
const r = handleD / 2 - grip;                    // a touch smaller: it grips
const ro = r + ringT;
const cy = plateT + offWall + ro - 0.5;         // ring centre, out from the wall
const mouth = handleD * opening;                 // narrower than the handle: it snaps
const flare = ringT * 0.8;
const pw = Math.max(plateW, 2 * ro + 30);        // room for a screw each side of the ring
const body = union(
  translate([-pw / 2, 0, 0], cube([pw, plateT, height])),
  translate([-ro * 0.6, plateT - 0.5, 0], cube([ro * 1.2, cy - plateT + 0.5, height])),
  translate([0, cy, 0], cylinder({ r: ro, h: height, $fn: 72 })),
);
const k = screwD / 2;
const cuts = [
  translate([0, cy, -1], cylinder({ r, h: height + 2, $fn: 72 })),
  // the mouth, flared so the handle finds its way in
  hull(
    translate([-mouth / 2, cy + r * 0.4, -1], cube([mouth, 0.01, height + 2])),
    translate([-mouth / 2 - flare, cy + ro + 0.5, -1], cube([mouth + 2 * flare, 0.01, height + 2])),
  ),
  ...[-1, 1].flatMap((s) => {
    const x = s * (pw / 2 - 9);
    return [
      translate([x, -1, height / 2], rotate([-90, 0, 0], cylinder({ r: screwD / 2, h: plateT + 2, $fn: 24 }))),
      translate([x, plateT - k + 0.02, height / 2], rotate([-90, 0, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
    ];
  }),
];
return translate([0, -cy, 0], difference(body, ...cuts));
`,
};
