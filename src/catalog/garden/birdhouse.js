// A birdhouse sized to the bird: the entrance hole, floor and height are
// what keeps a nest box for the bird you want (a 1-1/8 inch hole lets a
// chickadee in and keeps house sparrows out). The house is one gable profile
// extruded front to back with a 45 degree roof, so the inside of the roof is
// a slope, not a ceiling. It is open underneath: a separate floor with drain
// holes pushes in from below, so the box can be cleaned out each winter.
// No perch, on purpose: perches help predators, not the birds.

export default {
  id: "birdhouse",
  category: "garden",
  title: "Birdhouse",
  summary: "a nest box with the entrance hole, floor and height for a chosen bird, and a push-in floor for cleaning.",
  print: "house upright and floor flat beside it, no supports. PETG or ASA in a pale colour so it stays cool; screw it to a post or hang it by the tab.",
  names: ["birdhouse", "bird house", "nest box", "nesting box", "bird box", "bird nest box", "nesting house"],
  nouns: ["house", "box", "nest"],
  keywords: ["bird", "birds", "nest", "nesting", "garden", "songbird"],
  fits: ["bird"],
  fromSpec: (s) => ({ holeD: s.dims.hole, floorW: s.dims.floor, wallH: Math.min(220, s.dims.height), holeH: s.dims.holeH }),
  ask: {
    unless: ["holeD"],
    text: "Which bird is it for? The entrance hole is what matters (“for bluebirds”, “for wrens”); I used 1-1/8 inch, the chickadee size, which keeps house sparrows out.",
  },
  tips: ["for bluebirds", "for wrens", "38 mm hole"],
  examples: ["I want a birdhouse", "make me a bird house for bluebirds", "nest box for a chickadee",
    "birdhouse with a 32 mm hole"],
  params: {
    floorW: { default: 102, min: 70, max: 180, unit: "mm", label: "inside floor size (square)", say: ["floor", "inside", "wide"], more: ["bigger", "wider"], less: ["smaller"] },
    wallH: { default: 160, min: 80, max: 220, unit: "mm", label: "wall height to the eaves", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    holeD: { default: 28.6, min: 20, max: 60, unit: "mm", label: "entrance hole diameter", say: ["hole", "entrance", "opening"], more: ["bigger hole"] },
    holeH: { default: 120, min: 30, max: 200, unit: "mm", label: "hole centre above the floor", say: ["above"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "wall thickness", say: ["wall", "thick"] },
    fit: { default: 0.4, min: 0.1, max: 1, unit: "mm", label: "floor plug clearance per side", say: ["fit", "clearance"] },
  },
  things: [
    { names: ["chickadee house", "chickadee box", "chickadee nest box"], title: "Chickadee house", spec: "chickadee" },
    { names: ["wren house", "wren box", "house wren box"], title: "Wren house", spec: "house-wren" },
    { names: ["bluebird house", "bluebird box", "bluebird nest box"], title: "Bluebird house", spec: "eastern-bluebird" },
    { names: ["tree swallow house", "swallow box", "swallow nest box"], title: "Tree swallow house", spec: "tree-swallow" },
    { names: ["titmouse house", "titmouse box"], title: "Titmouse house", spec: "tufted-titmouse" },
    { names: ["nuthatch house", "nuthatch box"], title: "Nuthatch house", spec: "white-breasted-nuthatch" },
    { names: ["house finch nest box", "finch house", "finch box"], title: "House finch nest box", spec: "house-finch" },
    { names: ["woodpecker house", "downy woodpecker box"], title: "Downy woodpecker house", spec: "downy-woodpecker" },
    { names: ["carolina wren house", "carolina wren box"], title: "Carolina wren house", spec: "carolina-wren" },
    { names: ["purple martin house", "martin house", "martin gourd"], title: "Purple martin house", spec: "purple-martin" },
    { names: ["warbler house", "prothonotary warbler box"], title: "Warbler house", spec: "prothonotary-warbler" },
    { names: ["blue tit box", "tit box", "small garden bird box"], title: "Small bird box", params: { holeD: 25, floorW: 100, wallH: 150, holeH: 115 } },
  ],
  body: `
const W = floorW + 2 * wall;                              // outside of the walls
const ridge = wallH + W / 2;                              // 45 degree roof
// a front profile turned up and stretched front to back, y from y0 to y0 + h
const across = (pts, h, y0) => translate([0, y0 + h, 0], rotate([90, 0, 0], linearExtrude({ h }, polygon(pts))));
const outside = across([[-W / 2, 0], [W / 2, 0], [W / 2, wallH], [0, ridge], [-W / 2, wallH]], W, -W / 2);
const a = W / 2 - wall, s2 = wall * Math.SQRT2;           // inside: walls and roof a wall thickness in
const inside = across([[-a, -1], [a, -1], [a, wallH + wall - s2], [0, ridge - s2], [-a, wallH + wall - s2]], W - 2 * wall, -W / 2 + wall);
const hd = Math.min(holeD, floorW - 16);
const hz = Math.max(hd / 2 + 10, Math.min(holeH, wallH - hd / 2 - 6));
const alongY = (x, z, r, y0, h) => translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h, $fn: 40 })));
const alongX = (y, z, r, x0, h) => translate([x0, y, z], rotate([0, 90, 0], cylinder({ r, h, $fn: 16 })));
const house = difference(outside, inside,
  alongY(0, hz, hd / 2, -W / 2 - 1, wall + 2),                                 // the entrance
  alongX(0, wallH - 10, 3, -W / 2 - 1, W + 2),                                 // vents through both sides
  alongY(-W / 4, wallH * 0.3, 2.3, W / 2 - wall - 1, wall + 2),                 // screw holes for a post
  alongY(W / 4, wallH * 0.3, 2.3, W / 2 - wall - 1, wall + 2),
);
// a hanging tab on the ridge
const tabZ = ridge - 1.2 * wall;
const tab = difference(translate([-2, -14, tabZ], cube([4, 28, ridge + 16 - tabZ])), alongX(0, ridge + 8, 3.5, -3, 6));
// the floor: a plate with a lip that pushes up inside the walls, and drain holes
const lw = floorW - 2 * fit, lt = 2;
const lip = difference(translate([-lw / 2, -lw / 2, 2.99], cube([lw, lw, 8])), translate([-lw / 2 + lt, -lw / 2 + lt, 2], cube([lw - 2 * lt, lw - 2 * lt, 10])));
const plug = difference(union(translate([-W / 2, -W / 2, 0], cube([W, W, 3])), lip),
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => translate([i * lw / 4, j * lw / 4, -1], cylinder({ r: 3, h: 5, $fn: 16 }))));
return group(union(house, tab), translate([W + 8, 0, 0], plug));
`,
};
