// A small dish: a ring dish, trinket or key dish, candy dish, a decorative
// bowl, or an incense holder with a raised boss that holds the stick
// upright. Round ones are turned in one profile (the boss and its blind hole
// included, so nothing is cut down the axis); faceted ones are a hull of two
// polygons, hollowed. The sides lean out no more than 45 degrees.

export default {
  id: "trinket-dish",
  category: "decor",
  title: "Trinket dish",
  summary: "a small round or faceted dish for rings, keys, sweets or incense.",
  print: "upright as shown, no supports.",
  names: ["trinket dish", "trinket bowl", "small dish", "decorative dish", "catchall dish"],
  nouns: ["dish", "bowl"],
  keywords: ["trinket", "ring", "jewelry", "jewellery", "incense", "decor", "candy", "key", "table", "bedside"],
  tips: ["120 mm across", "hexagon", "deeper", "for incense"],
  examples: ["I want a trinket dish", "make me a ring dish 80mm across",
    "an incense holder", "a hexagon trinket bowl 120mm wide"],
  params: {
    diameter: { default: 90, min: 30, max: 200, unit: "mm", label: "top diameter", say: ["across", "diameter", "wide", "width", "size"], more: ["wider", "bigger"], less: ["smaller"] },
    height: { default: 20, min: 6, max: 70, unit: "mm", label: "height", say: ["tall", "high", "height", "deep", "depth"], more: ["deeper", "taller"], less: ["shallower", "flatter"] },
    baseD: { default: 60, min: 20, max: 200, unit: "mm", label: "base diameter", say: ["base", "bottom", "foot"] },
    wall: { default: 2, min: 1.2, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 2, min: 1.2, max: 6, unit: "mm", label: "floor thickness", say: ["floor"] },
    sides: { default: 0, min: 0, max: 12, unit: "count", label: "facets (0 = round, 3 to 12 = a polygon)", say: ["side", "facet"] },
    stickHole: { default: 0, min: 0, max: 6, unit: "mm", label: "incense stick hole in a centre boss (0 = none)", say: ["stick", "incense"] },
  },
  things: [
    { names: ["ring dish", "ring holder dish", "jewelry dish", "jewellery dish", "earring dish"], title: "Ring dish", params: { diameter: 80, height: 15, baseD: 55 } },
    { names: ["incense holder", "incense stick holder", "incense burner", "incense dish", "incense plate"], title: "Incense holder",
      params: { stickHole: 2.2, diameter: 110, height: 12, baseD: 90 } },
    { names: ["candy dish", "sweets dish", "bonbon dish", "sweet dish"], title: "Candy dish", params: { diameter: 140, height: 40, baseD: 80 } },
    { names: ["hexagon dish", "hexagon bowl", "hex dish", "geometric dish"], title: "Hexagon dish", params: { sides: 6, diameter: 110, height: 25, baseD: 70 } },
    { names: ["key dish", "key bowl", "entryway dish", "change dish", "coin dish"], title: "Key dish", params: { diameter: 130, height: 25, baseD: 90 } },
    { names: ["decorative bowl", "display bowl", "small decorative bowl", "potpourri bowl"], title: "Decorative bowl",
      params: { diameter: 160, height: 60, baseD: 90, wall: 2.4 } },
  ],
  body: `
const rt = diameter / 2;
const rb = Math.max(Math.min(baseD / 2, rt - 2), rt - height * 0.95);   // the sides lean out at 45 degrees at most
if (sides >= 3) {
  // two polygons hulled into a tapered tray, minus the same, inset, from the floor up
  const ngon = (r, z) => translate([0, 0, z], linearExtrude({ h: 0.01 }, polygon(Array.from({ length: sides }, (_, i) =>
    [r * Math.cos(2 * Math.PI * i / sides), r * Math.sin(2 * Math.PI * i / sides)]))));
  const k = 1 / Math.cos(Math.PI / sides);           // corner radius over flat radius
  const slope = (rt - rb) / height;
  const dr = wall * Math.sqrt(1 + slope * slope);
  const outer = hull(ngon(rb * k, 0), ngon(rt * k, height - 0.01));
  const inner = hull(ngon((rb + slope * floor - dr) * k, floor), ngon((rt - dr) * k, height + 1));
  return difference(outer, inner);
}
// turned: outer wall, rim, inner wall, floor, and an optional boss with a
// blind hole for an incense stick
const slope = (rt - rb) / height;
const dr = wall * Math.sqrt(1 + slope * slope);
const ri = (z) => rb + slope * z - dr;
const boss = stickHole > 0
  ? [[Math.max(stickHole / 2 + 3, 6), floor], [Math.max(stickHole / 2 + 3, 6) - 2, floor + Math.min(14, height * 0.8)],
     [stickHole / 2, floor + Math.min(14, height * 0.8)], [stickHole / 2, floor * 0.5], [0, floor * 0.5]]
  : [[0, floor]];
return revolve(360, polygon([[0, 0], [rb, 0], [rt, height], [rt - dr, height], [ri(floor), floor], ...boss]));
`,
};
