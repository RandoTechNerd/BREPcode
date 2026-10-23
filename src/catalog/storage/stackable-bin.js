// An open-front parts bin that stacks. The front wall is cut low so you can
// reach in even with another bin sitting on top; the side and back walls run
// full height, and the bottom steps in by a wall's thickness behind a 45
// degree chamfer, so the next bin's foot drops inside these walls and its
// chamfer rests on their top edges. The chamfer is what keeps it printable:
// the step faces down at exactly 45 degrees, never a flat ledge.

export default {
  id: "stackable-bin",
  category: "storage",
  title: "Stackable parts bin",
  summary: "an open-front parts bin whose foot nests into the bin below, so a column of them stays put.",
  print: "upright as shown, no supports: the stacking step is a 45 degree chamfer.",
  names: ["stackable bin", "stacking bin", "parts bin", "pick bin", "hopper bin", "open front bin",
    "stackable storage bin", "stacking storage bin", "stackable parts bin", "open front storage bin",
    "stackable organizer bin", "nesting bin"],
  nouns: ["bin", "tote"],
  keywords: ["stack", "stackable", "stacking", "parts", "workshop", "shelf", "hardware"],
  triple: ["width", "depth", "height"],
  tips: ["120 x 180 x 90", "2 dividers", "front 40 mm high"],
  examples: ["make me a stackable bin", "stackable parts bin 100 x 150 x 70",
    "an open front bin with 2 dividers", "a stacking bin for screws"],
  params: {
    width: { default: 80, min: 30, max: 200, unit: "mm", label: "outside width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    depth: { default: 120, min: 40, max: 220, unit: "mm", label: "outside depth, front to back", say: ["deep", "depth", "long", "length"], more: ["deeper", "longer"], less: ["shallower"] },
    height: { default: 60, min: 25, max: 150, unit: "mm", label: "height at the back", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    frontH: { default: 25, min: 6, max: 100, unit: "mm", label: "front wall height", say: ["front"] },
    wall: { default: 1.6, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stronger", "sturdier"] },
    cornerR: { default: 5, min: 1, max: 15, unit: "mm", label: "corner radius", say: ["corner", "round"] },
    divX: { default: 0, min: 0, max: 5, unit: "count", label: "dividers, front to back", say: ["divider", "compartment", "section"] },
    stack: { default: "yes", unit: "choice", choices: ["no", "yes"], label: "stacking foot",
      words: { no: ["flat bottom", "no stacking", "not stackable", "without stacking"], yes: ["stackable", "stacking", "stack"] } },
  },
  things: [
    { names: ["small parts bin", "small stackable bin", "mini parts bin"], title: "Small parts bin",
      params: { width: 60, depth: 100, height: 50, frontH: 20 } },
    { names: ["screw bin", "hardware bin", "nut and bolt bin", "fastener bin", "nail bin"], title: "Screw bin",
      params: { width: 80, depth: 120, height: 60, frontH: 25, divX: 1 } },
    { names: ["large parts bin", "workshop bin", "big stackable bin", "garage parts bin"], title: "Large parts bin",
      params: { width: 140, depth: 200, height: 100, frontH: 40, wall: 2.4, cornerR: 8 } },
    { names: ["craft bin", "craft supply bin", "art supply bin", "sewing bin"], title: "Craft bin",
      params: { width: 120, depth: 150, height: 80, frontH: 35, divX: 1 } },
    { names: ["divided parts bin", "compartment bin", "sorting bin"], title: "Divided parts bin",
      params: { width: 120, depth: 120, height: 60, frontH: 25, divX: 2 } },
    { names: ["electronics parts bin", "component bin", "resistor bin"], title: "Component bin",
      params: { width: 60, depth: 90, height: 40, frontH: 15, wall: 1.2, cornerR: 3 } },
  ],
  body: `
const s = wall + 0.4;                               // how far the foot steps in
const floor = Math.max(1.2, Math.min(wall, 2));
const footH = floor + 0.8;                          // the part that drops into the bin below
const stacks = stack === "yes";
// the corners must stay round through the step, inside and out
const rr = Math.min(Math.max(cornerR, stacks ? s + wall + 0.6 : 0.8), width / 2 - 1, depth / 2 - 1);
const cx = width / 2 - rr, cy = depth / 2 - rr;     // corner centres, the same at every height
const corners = (r1, r2, z, h) => hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * cx, sy * cy, z], cylinder({ r1, r2, h, $fn: 32 }))));
// the bin's outline offset inward by \`inset\`, from z0 up to z1: foot, 45 degree step, full size
const stepped = (inset, z0, z1) => {
  const r = rr - inset;
  if (!stacks) return corners(r, r, z0, z1 - z0);
  return union(
    corners(r - s, r - s, z0, footH - z0 + 0.01),
    corners(r - s, r, footH, s),
    corners(r, r, footH + s - 0.01, z1 - footH - s + 0.01),
  );
};
const fh = Math.max(floor + 2, Math.min(frontH, height - 8));
const iw = width - 2 * wall, id = depth - 2 * wall;
const cuts = [
  stepped(wall, floor, height + 1),
  // the front wall, cut down to fh; the side walls stay full height
  translate([-iw / 2, -depth / 2 - 1, fh], cube([iw, wall + 1.01, height])),
];
const divH = height - (stacks ? footH + 1 : 0) - floor;
const dividers = Array.from({ length: divX }, (_, i) =>
  translate([-iw / 2 + (i + 1) * iw / (divX + 1) - 0.6, -id / 2 - 0.1, floor - 0.1], cube([1.2, id + 0.2, divH + 0.1])));
const bin = difference(stepped(0, 0, height), ...cuts);
return dividers.length ? union(bin, ...dividers) : bin;
`,
};
