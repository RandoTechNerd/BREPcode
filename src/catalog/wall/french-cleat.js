// The wall half of a French cleat: a strip screwed to the wall whose top is
// bevelled at 45 degrees down toward the wall, so anything with the matching
// cleat (the cleat hooks and shelves, or a board you cut yourself) drops onto
// it and is pulled tight against the wall by its own weight. Printed lying on
// its back: the bevel then leans out at exactly 45 degrees.

export default {
  id: "french-cleat",
  category: "wall",
  title: "French cleat rail",
  summary: "a 45-degree wall strip that cleat hooks, shelves and holders hang on.",
  print: "lying on its back as shown, no supports. Print several and butt them end to end for a long wall.",
  names: ["french cleat", "french cleat rail", "french cleat strip", "cleat rail", "cleat strip", "wall cleat",
    "french cleat wall strip", "french cleat system", "french cleat wall"],
  nouns: ["cleat", "rail", "strip"],
  keywords: ["french", "wall", "workshop", "garage", "tool", "hang"],
  tips: ["250 mm long", "5 screw holes", "thicker"],
  examples: ["I want a french cleat", "make me a french cleat rail 250mm long",
    "a cleat strip with 4 screw holes", "french cleat for the garage wall"],
  params: {
    length: { default: 200, min: 40, max: 250, unit: "mm", label: "rail length", say: ["long", "length", "wide", "width"], more: ["longer"], less: ["shorter"] },
    cleatH: { default: 40, min: 20, max: 80, unit: "mm", label: "rail height", say: ["tall", "high", "height"], more: ["taller"], less: ["lower"] },
    cleatT: { default: 12, min: 6, max: 20, unit: "mm", label: "rail thickness (the bevel is as deep)", say: ["thick", "thickness", "deep", "depth"], more: ["thicker", "stronger"], less: ["thinner"] },
    holes: { default: 3, min: 0, max: 8, unit: "count", label: "screw holes", say: ["hole", "screw"] },
    screwD: { default: 4.5, min: 3, max: 6.5, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["picture hanging cleat", "picture cleat", "mirror cleat", "artwork cleat", "z bar hanger", "z clip hanger"],
      title: "Picture cleat", params: { length: 150, cleatH: 30, cleatT: 8, holes: 2, screwD: 4 } },
    { names: ["headboard cleat", "headboard hanger", "headboard wall mount"], title: "Headboard cleat",
      params: { length: 250, cleatH: 50, cleatT: 14, holes: 3 } },
    { names: ["cabinet cleat", "cabinet hanging cleat", "wall cabinet cleat"], title: "Cabinet cleat",
      params: { length: 250, cleatH: 60, cleatT: 16, holes: 4, screwD: 5 } },
    { names: ["short french cleat", "small french cleat", "mini french cleat"], title: "Short French cleat",
      params: { length: 100, holes: 2 } },
  ],
  body: `
// cross-section: y up the wall, z out from it, stretched along x
const H = Math.max(cleatH, cleatT + 3 * screwD + 4);
const section = [[0, 0], [H - cleatT, 0], [H, cleatT], [0, cleatT]];   // the bevel rises as far as it runs: 45 degrees
// rotate([90, 90, 0]) sends the outline's x to y, its y to z, and the length to +x
const rail = rotate([90, 90, 0], linearExtrude({ h: length }, polygon(section)));
if (holes < 1) return translate([-length / 2, -H / 2, 0], rail);
// countersunk screws in the full-thickness band under the bevel
const yh = (H - cleatT) / 2;
const edge = Math.min(25, length / 4);
const xs = holes === 1 ? [length / 2] : Array.from({ length: holes }, (_, i) => edge + (length - 2 * edge) * i / (holes - 1));
const k = Math.min(screwD / 2, cleatT - 2);
const cuts = xs.flatMap((x) => [
  translate([x, yh, -1], cylinder({ r: screwD / 2, h: cleatT + 2, $fn: 24 })),
  translate([x, yh, cleatT - k + 0.02], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 })),
]);
return translate([-length / 2, -H / 2, 0], difference(rail, ...cuts));
`,
};
