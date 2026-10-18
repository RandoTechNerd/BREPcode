// A tiered step riser for a cupboard shelf: each row of jars sits a step
// higher than the one in front, so every label shows. One side profile, a
// frame of treads, risers, a floor bar and a back post with the space under
// the stairs left open, extruded across the width. It prints lying on that
// profile, so every wall is vertical while printing and the layers run along
// the treads, the way the load goes.

export default {
  id: "spice-rack",
  category: "kitchen",
  title: "Tiered spice rack",
  summary: "a step riser that lifts each row of spice jars above the one in front, with a lip on every step.",
  print: "lying on its side (the stair profile on the bed), no supports. Stand it up to use.",
  names: ["spice rack", "spice riser", "tiered spice rack", "spice stand", "spice organizer", "spice step rack",
    "cabinet spice rack", "shelf riser", "tiered shelf riser", "step riser", "cabinet riser", "spice jar rack", "spice tier"],
  nouns: ["rack", "riser", "organizer", "tier"],
  keywords: ["spice", "jar", "cabinet", "cupboard", "pantry", "tiered", "step", "seasoning"],
  fits: ["jar", "round"],
  fromSpec(s) {
    const d = s.dims.d, h = s.dims.h || s.dims.len || 100;
    return { stepD: Math.min(140, d + 10), stepH: Math.min(80, Math.max(12, h * 0.35)) };
  },
  specNote: "each step is a jar plus 10 mm deep and rises about a third of a jar",
  triple: ["width", "stepD", "stepH"],
  tips: ["4 tiers", "250 mm wide", "taller steps"],
  examples: ["I want a spice rack", "make me a 4 tier spice rack 250 mm wide",
    "a spice riser for my cabinet", "tiered shelf riser for canned food"],
  params: {
    tiers: { default: 3, min: 2, max: 6, unit: "count", label: "tiers (rows)", say: ["tier", "row", "step", "level"] },
    width: { default: 200, min: 60, max: 250, unit: "mm", label: "width (side to side)", say: ["wide", "width", "long", "length"], more: ["wider", "longer"], less: ["narrower", "shorter"] },
    stepD: { default: 55, min: 25, max: 140, unit: "mm", label: "depth of each step", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    stepH: { default: 30, min: 12, max: 80, unit: "mm", label: "rise of each step", say: ["rise", "tall", "high", "height"], more: ["taller", "higher"], less: ["lower"] },
    wall: { default: 4, min: 2.4, max: 8, unit: "mm", label: "wall thickness", say: ["thick", "thickness", "wall"], more: ["stronger", "thicker", "sturdier"] },
    lipH: { default: 6, min: 0, max: 20, unit: "mm", label: "lip on the front of each step (0 = none)", say: ["lip", "edge"] },
  },
  things: [
    { names: ["2 tier spice rack", "two tier spice rack", "small spice riser"], title: "2-tier spice rack", params: { tiers: 2, width: 150 } },
    { names: ["4 tier spice rack", "four tier spice rack", "large spice rack", "big spice rack"], title: "4-tier spice rack", params: { tiers: 4, width: 240, stepH: 28 } },
    { names: ["canned food riser", "soup can riser", "canned goods riser", "tin can riser"], title: "Can riser", spec: "can-303", params: { tiers: 3, width: 250, wall: 5, lipH: 8 } },
    { names: ["hot sauce rack", "hot sauce riser", "sauce bottle riser"], title: "Hot sauce rack", params: { tiers: 2, stepD: 45, stepH: 40, width: 160 } },
    { names: ["essential oil rack", "essential oil riser", "essential oil stand", "dropper bottle riser"], title: "Essential oil rack", params: { tiers: 4, stepD: 30, stepH: 16, width: 150, wall: 3, lipH: 4 } },
    { names: ["vitamin rack", "vitamin bottle riser", "supplement riser", "medicine cabinet riser", "pill bottle riser"], title: "Vitamin bottle riser", params: { tiers: 3, stepD: 65, stepH: 40, width: 220 } },
    { names: ["condiment riser", "fridge condiment riser", "pantry shelf riser", "pantry step riser"], title: "Pantry riser", params: { tiers: 3, stepD: 80, stepH: 40, width: 240, wall: 5 } },
    { names: ["k cup riser", "coffee pod riser", "pod step rack"], title: "Coffee pod riser", params: { tiers: 3, stepD: 55, stepH: 25, width: 220, lipH: 4 } },
  ],
  body: `
// side profile: x runs front to back, y runs up; extruded across the width
const t = wall;
const lip = Math.min(lipH, stepH * 2);
const D = tiers * stepD;
const yk = (k) => t + k * stepH;                 // top of tread k (0 = front row, on the floor plate)
const outline = [[0, 0], [D, 0], [D, yk(tiers - 1)]];
for (let k = tiers - 1; k >= 0; k--) {
  const x = k * stepD;
  if (lip > 0) outline.push([x + t, yk(k)], [x + t, yk(k) + lip], [x, yk(k) + lip]);
  else outline.push([x, yk(k)]);
  if (k > 0) outline.push([x, yk(k - 1)]);
}
let part = linearExtrude({ h: width }, polygon(outline));

// the space under the stairs, leaving \`wall\` all round
if (stepH > t + 3 && stepD > 2 * t + 4) {
  const win = [[stepD + t, t], [D - t, t], [D - t, yk(tiers - 1) - t]];
  for (let k = tiers - 1; k >= 1; k--) {
    win.push([k * stepD + t, yk(k) - t]);
    if (k > 1) win.push([k * stepD + t, yk(k - 1) - t]);
  }
  part = difference(part, translate([0, 0, -1], linearExtrude({ h: width + 2 }, polygon(win))));
}
return translate([-D / 2, -(yk(tiers - 1) + lip) / 2, 0], part);
`,
};
