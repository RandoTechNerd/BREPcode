// An indoor boomerang: light, flat blades round a hub, each blade's
// trailing edge bevelled on top so it behaves like a wing. The bevel side
// sets the hand it is for. Every blade is one outline (a hub circle and a
// tip circle joined by tangents), extruded thin and joined; the bevel is a
// plane cut along each blade, so the whole thing prints flat.

export default {
  id: "boomerang",
  category: "kids",
  title: "Indoor boomerang",
  summary: "a light, flat indoor boomerang with 2 to 5 bevelled blades, for right or left hands.",
  print: "flat as shown, bevels up; no supports. Light and thin for indoors, still never throw it at people.",
  names: ["boomerang", "indoor boomerang", "rotor boomerang", "toy boomerang", "flying boomerang", "boomerang toy",
    "kids boomerang", "returning boomerang"],
  nouns: ["boomerang", "rotor"],
  keywords: ["throw", "flying", "fly", "indoor", "outdoor", "returning", "toy"],
  primary: "length",
  tips: ["4 blades", "left handed", "longer blades"],
  examples: ["I want a boomerang", "make me a 4 blade boomerang", "a left handed indoor boomerang", "boomerang with 90mm blades"],
  params: {
    blades: { default: 3, min: 2, max: 5, unit: "count", label: "blades", say: ["blade", "wing", "arm"] },
    length: { default: 75, min: 40, max: 120, unit: "mm", label: "centre to blade tip", say: ["long", "length", "size"], more: ["longer", "bigger"], less: ["shorter", "smaller"] },
    bladeW: { default: 24, min: 12, max: 40, unit: "mm", label: "blade width at the hub", say: ["wide", "width"] },
    thick: { default: 2.5, min: 1.5, max: 5, unit: "mm", label: "thickness", say: ["thick", "thickness"] },
    bevel: { default: 15, min: 0, max: 30, unit: "deg", label: "trailing-edge bevel (0 = flat)", say: ["bevel", "angle", "degree"] },
    hand: { default: "right", unit: "choice", choices: ["right", "left"], label: "thrower's hand",
      words: { left: ["left", "left handed", "lefty"], right: ["right", "right handed"] } },
  },
  things: [
    { names: ["three blade boomerang", "3 blade boomerang", "tri blade boomerang"], title: "Three-blade boomerang", params: { blades: 3 } },
    { names: ["four blade boomerang", "cross boomerang", "4 blade boomerang"], title: "Four-blade boomerang", params: { blades: 4, length: 70 } },
    { names: ["classic boomerang", "v boomerang", "two blade boomerang", "traditional boomerang"], title: "Classic boomerang", params: { blades: 2, length: 110, bladeW: 30, thick: 3 } },
    { names: ["left handed boomerang", "lefty boomerang"], title: "Left-handed boomerang", params: { hand: "left" } },
    { names: ["mini boomerang", "desk boomerang", "small boomerang"], title: "Mini boomerang", params: { length: 45, bladeW: 16, thick: 2 } },
    { names: ["five blade boomerang", "star boomerang"], title: "Five-blade boomerang", params: { blades: 5, length: 65, bladeW: 20 } },
  ],
  body: `
const r0 = bladeW / 2, r1 = Math.max(4, bladeW * 0.35);   // hub and tip radii
const L = Math.max(length, r0 + r1 + 5);
// one blade along +x: tangent lines between the hub circle and the tip circle
const outline = (n = 20) => {
  const w = Math.acos(Math.max(-1, Math.min(1, (r0 - r1) / L)));
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = w + (2 * Math.PI - 2 * w) * i / n; pts.push([r0 * Math.cos(t), r0 * Math.sin(t)]); }
  for (let i = 0; i <= n; i++) { const t = -w + 2 * w * i / n; pts.push([L + r1 * Math.cos(t), r1 * Math.sin(t)]); }
  return pts;
};
const side = hand === "left" ? 1 : -1;                    // which edge trails as it spins
const bw = r0 * 0.8;                                      // bevel width across the blade
const ang = Math.min(bevel, Math.atan((thick - 0.8) / bw) * 180 / Math.PI);
let blade = linearExtrude({ h: thick }, polygon(outline()));
if (ang > 0) {
  // everything above a plane that starts bw in from the trailing edge and tips down across it
  const cut = translate([0, side * (r0 - bw), thick], rotate([-side * ang, 0, 0], translate([r0, side > 0 ? 0 : -50, 0], cube([L + r1 + 5, 50, 20]))));
  blade = difference(blade, cut);
}
const spread = blades === 2 ? [-50, 50] : Array.from({ length: blades }, (_, i) => 360 * i / blades);
return union(...spread.map((a) => rotate([0, 0, a], blade)));
`,
};
