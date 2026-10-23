// A curtain rod bracket: a wall plate, an arm braced from below, and an
// open-topped U on the arm the rod drops into (straight-sided, so a rigid rod
// can); two cradles for a double
// rod (sheers behind, curtains in front). One side profile, printed on its
// side, so the arm's layers run out from the wall and the cradle's round
// the rod.

export default {
  id: "rod-bracket",
  category: "home",
  title: "Curtain rod bracket",
  summary: "a wall bracket with an open cradle that a curtain rod or closet pole drops into.",
  print: "on its side as shown, no supports. PETG; print one per end and one per metre between.",
  names: ["curtain rod bracket", "curtain rod holder", "curtain bracket", "curtain rod hook", "curtain rod support",
    "drapery rod bracket", "curtain pole bracket", "curtain pole holder", "curtain rod mount"],
  nouns: ["bracket", "holder", "support", "mount"],
  keywords: ["curtain", "rod", "pole", "drape", "drapery", "window", "closet", "blind"],
  fits: ["rod", "handle"],
  fromSpec: (s) => ({ rodD: s.dims.d }),
  specNote: "the cradle allows half a millimetre round the rod",
  primary: "rodD",
  ask: { unless: ["rodD"], text: "How thick is the rod? Say “for a 1 inch rod”, “28 mm pole” or “cafe rod”; I used 1 inch (25.4 mm), the common decorative size." },
  tips: ["for a 28 mm pole", "double", "120 mm from the wall"],
  examples: ["I want a curtain rod bracket", "make me a curtain bracket for a 28mm pole",
    "double curtain rod bracket", "a curtain rod holder 120mm from the wall"],
  params: {
    rodD: { default: 25.4, min: 8, max: 50, unit: "mm", label: "rod diameter", say: ["rod", "pole", "diameter", "dowel"] },
    projection: { default: 80, min: 30, max: 160, unit: "mm", label: "rod centre from the wall", say: ["projection", "from", "off", "out", "reach", "clearance"], more: ["further", "deeper"], less: ["closer"] },
    rods: { default: 1, min: 1, max: 2, unit: "count", label: "rods", say: ["rod"] },
    plateH: { default: 70, min: 40, max: 140, unit: "mm", label: "wall plate height", say: ["tall", "high", "height", "plate"] },
    width: { default: 20, min: 12, max: 50, unit: "mm", label: "bracket width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    plateT: { default: 6, min: 4, max: 10, unit: "mm", label: "wall plate thickness", say: ["back"] },
    armT: { default: 9, min: 5, max: 16, unit: "mm", label: "arm thickness", say: ["arm", "thick"], more: ["stronger", "thicker", "sturdier"] },
    wallT: { default: 4, min: 2.5, max: 8, unit: "mm", label: "cradle wall", say: ["wall"] },
    sideH: { default: 10, min: 0, max: 40, unit: "mm", label: "how far the cradle sides rise above the rod centre", say: ["side", "lip", "sides"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["closet rod bracket", "closet pole bracket", "closet rod support", "wardrobe rail bracket", "closet pole holder"],
      title: "Closet rod bracket", spec: "closet-rod-wood", params: { projection: 45, sideH: 20, armT: 11 } },
    { names: ["double curtain rod bracket", "double rod bracket", "double curtain bracket", "double curtain rod holder"],
      title: "Double curtain rod bracket", params: { rods: 2, projection: 120 } },
    { names: ["cafe rod bracket", "small curtain rod bracket", "sash rod bracket", "cafe curtain bracket"], title: "Cafe rod bracket",
      spec: "rod-cafe", params: { projection: 40, plateH: 50, width: 15, armT: 7, wallT: 3 } },
    { names: ["dowel bracket", "rod bracket", "wooden dowel bracket", "rod support bracket"], title: "Rod bracket",
      spec: "dowel-1in", params: { projection: 50 } },
    { names: ["extended curtain rod bracket", "long curtain bracket", "curtain bracket for blinds", "outside mount curtain bracket"],
      title: "Extended curtain bracket", params: { projection: 140, armT: 12, plateH: 80 } },
    { names: ["heavy curtain pole bracket", "35mm pole bracket", "thick curtain rod bracket"], title: "Heavy pole bracket",
      spec: "rod-35", params: { armT: 12, wallT: 5, width: 25 } },
  ],
  body: `
// side profile: x runs out from the wall, y runs up; printed lying on it
const R = rodD / 2 + 0.5;                          // the rod drops in with half a millimetre
const Ro = R + wallT;
const P = Math.max(projection, plateT + (rods > 1 ? 3 * Ro + 8 : Ro + 2));
const gusL = Math.min(P * 0.6, 40);
const gusH = Math.min(gusL, 25);
const below = 7 * screwD;                          // two screws stacked under the brace
const qa = below + gusH;                           // underside of the arm
const H = Math.max(plateH, qa + armT + 2);
const pEnd = P + Ro * 0.6;
const outline = [
  [0, 0], [plateT, 0], [plateT, qa - gusH], [plateT + gusL, qa], [pEnd, qa],
  [pEnd, qa + armT], [plateT, qa + armT], [plateT, H], [0, H],
];
const parts = [linearExtrude({ h: width }, polygon(outline))];
// a U on the arm, straight-sided above the rod's centre so the rod drops in
const cradle = (cx) => {
  const cy = qa + armT - wallT / 2 + Ro;
  const at = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const n = 32;
  const top = cy + Math.max(0.4, sideH);
  return polygon([
    [cx - Ro, top], ...Array.from({ length: n + 1 }, (_, i) => at(Ro, Math.PI + Math.PI * i / n)), [cx + Ro, top],
    [cx + R, top], ...Array.from({ length: n + 1 }, (_, i) => at(R, 2 * Math.PI - Math.PI * i / n)), [cx - R, top],
  ]);
};
parts.push(linearExtrude({ h: width }, cradle(P)));
if (rods > 1) parts.push(linearExtrude({ h: width }, cradle(P - 2 * Ro - 6)));
// countersunk screws through the plate, under the brace
const k = Math.min(screwD / 2, plateT - 1.5);
const holes = [below * 0.25, below * 0.72].flatMap((y) => [
  translate([-1, y, width / 2], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: plateT + 2, $fn: 24 }))),
  translate([plateT - k + 0.02, y, width / 2], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]);
return difference(union(...parts), ...holes);
`,
};
