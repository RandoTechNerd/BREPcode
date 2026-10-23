// A hand citrus juicer: a ribbed cone in the middle of a dish that catches
// the juice, with a pour notch in the rim. The dish is two lathed solids, the
// outside and the hollow; the ribs are thin triangular fins standing on the
// floor along the cone, a little proud of it so they tear the pulp. Cone,
// fins and dish walls all face up or lean in as they rise, so it prints
// upright with no support.

export default {
  id: "citrus-juicer",
  category: "kitchen",
  title: "Citrus juicer",
  summary: "a ribbed reamer cone in a juice-catching dish with a pour notch, sized to the fruit.",
  print: "upright as shown, no supports. Food contact: PETG or food-safe PLA, hand wash; acid juice etches PLA over time.",
  names: ["citrus juicer", "lemon squeezer", "lemon juicer", "lemon reamer", "orange juicer", "hand juicer", "manual juicer",
    "citrus reamer", "citrus press", "juice squeezer", "lime squeezer"],
  nouns: ["juicer", "reamer", "squeezer"],
  keywords: ["lemon", "lime", "orange", "citrus", "grapefruit", "juice", "kitchen"],
  fits: ["citrus"],
  fromSpec: (s) => ({ reamD: Math.min(110, s.dims.d * 0.85), reamH: Math.min(90, s.dims.d * 0.62) }),
  specNote: "the cone is a little narrower than half the fruit",
  tips: ["for oranges", "bigger dish", "more ribs"],
  examples: ["I want a citrus juicer", "make me a lemon squeezer",
    "an orange juicer with a 180 mm dish", "citrus reamer for limes"],
  params: {
    dishD: { default: 140, min: 80, max: 230, unit: "mm", label: "dish diameter at the rim", say: ["dish", "across", "diameter", "wide"], more: ["wider", "bigger"], less: ["smaller"] },
    dishH: { default: 26, min: 12, max: 60, unit: "mm", label: "dish depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    reamD: { default: 56, min: 25, max: 110, unit: "mm", label: "cone diameter at its base", say: ["cone", "reamer"] },
    reamH: { default: 40, min: 15, max: 90, unit: "mm", label: "cone height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    ribs: { default: 10, min: 0, max: 18, unit: "count", label: "ribs on the cone", say: ["rib", "ridge", "fin"] },
    wall: { default: 2.4, min: 1.6, max: 4, unit: "mm", label: "wall thickness", say: ["wall", "thick"], more: ["thicker", "sturdier"] },
    spoutW: { default: 14, min: 0, max: 30, unit: "mm", label: "pour notch width (0 = none)", say: ["spout", "pour", "notch"] },
  },
  things: [
    { names: ["lime squeezer", "lime juicer", "lime reamer", "small citrus juicer"], title: "Lime juicer", spec: "lime", params: { dishD: 110 } },
    { names: ["lemon squeezer", "lemon juicer", "lemon reamer", "lemon press"], title: "Lemon juicer", spec: "lemon" },
    { names: ["orange juicer", "orange squeezer", "orange reamer", "orange press"], title: "Orange juicer", spec: "orange", params: { dishD: 170, dishH: 32 } },
    { names: ["grapefruit juicer", "grapefruit reamer", "large citrus juicer"], title: "Grapefruit juicer", spec: "grapefruit", params: { dishD: 210, dishH: 36 } },
    { names: ["juicer cone", "reamer cone only", "lemon cone"], title: "Reamer cone", params: { dishD: 80, dishH: 12, spoutW: 0 } },
  ],
  body: `
const lean = Math.tan(30 * Math.PI / 180);       // dish walls lean out 30 degrees
const R = dishD / 2;
const rb = Math.max(R - dishH * lean, reamD / 2 + 8);
const floorT = Math.max(2, wall);
const outside = revolve(360, polygon([[0, 0], [rb, 0], [R, dishH], [0, dishH]]));
const hollow = revolve(360, polygon([[0, floorT], [rb - wall, floorT], [R - wall, dishH + 0.01], [R - wall, dishH + 1], [0, dishH + 1]]));
const rc = Math.min(reamD / 2, rb - wall - 2);
const reamer = translate([0, 0, floorT - 0.01], cylinder({ r1: rc, r2: 0.8, h: reamH, $fn: 48 }));
// fins in vertical planes through the axis, a little proud of the cone
const proud = Math.min(3, rc * 0.12);
const finT = Math.max(1.2, wall * 0.6);
const fin = rotate([90, 0, 0], linearExtrude({ h: finT, center: true },
  polygon([[0, floorT - 0.01], [rc + proud, floorT - 0.01], [proud * 0.3, floorT + reamH * 0.96]])));
const blades = Array.from({ length: ribs }, (_, i) => rotate([0, 0, 360 * (i + 0.5) / ribs], fin));
let part = union(difference(outside, hollow), reamer, ...blades);
if (spoutW > 0) {
  const w = Math.min(spoutW, R * 0.5);
  part = difference(part, translate([R - wall - 2, 0, dishH - w * 0.7], rotate([45, 0, 0], cube([wall + 4, w, w], { center: false }))));
}
return part;
`,
};
