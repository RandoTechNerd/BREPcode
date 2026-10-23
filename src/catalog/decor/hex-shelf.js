// A honeycomb wall shelf: a hexagonal frame (or triangle, square, octagon)
// hung with a flat side down, open or with a back, with an optional shelf
// across the middle. Printed lying on its back so every wall stands straight
// up off the bed; an open frame hangs by two screws through its top wall.

export default {
  id: "hex-shelf",
  category: "decor",
  title: "Hexagon shelf",
  summary: "a honeycomb (or triangle, square, octagon) wall shelf, open or with a back.",
  print: "lying flat as shown, no supports. PETG or PLA, 3 walls.",
  names: ["hexagon shelf", "hex shelf", "hexagonal shelf", "honeycomb wall shelf", "honeycomb shelf", "hexagon wall shelf",
    "hexagon shelves", "honeycomb shelves"],
  nouns: ["shelf"],
  keywords: ["hexagon", "hex", "honeycomb", "geometric", "wall", "display", "plant", "decor"],
  tips: ["with a back", "240 mm across", "a triangle", "a shelf across the middle"],
  examples: ["I want a hexagon shelf", "make me a honeycomb shelf 180mm across",
    "a hexagon wall shelf with a back", "a triangle shelf 120mm deep"],
  params: {
    size: { default: 200, min: 80, max: 250, unit: "mm", label: "across the corners", say: ["across", "size", "wide", "width", "big"], more: ["bigger", "wider"], less: ["smaller"] },
    depth: { default: 100, min: 30, max: 200, unit: "mm", label: "how deep", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    wall: { default: 4, min: 2, max: 10, unit: "mm", label: "wall thickness", say: ["wall", "thick", "thickness"], more: ["stronger", "thicker"] },
    sides: { default: 6, min: 3, max: 8, unit: "count", label: "sides", say: ["side", "sided"] },
    backT: { default: 0, min: 0, max: 6, unit: "mm", label: "back thickness (0 = open frame)", say: ["back"] },
    shelves: { default: 0, min: 0, max: 2, unit: "count", label: "shelves across the inside", say: ["shelf", "divider", "level"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["triangle shelf", "triangular shelf", "triangle wall shelf"], title: "Triangle shelf", params: { sides: 3, size: 220, depth: 90 } },
    { names: ["octagon shelf", "octagonal shelf", "octagon wall shelf"], title: "Octagon shelf", params: { sides: 8 } },
    { names: ["square wall shelf", "square box shelf", "cube wall shelf", "box wall shelf"], title: "Square box shelf", params: { sides: 4, size: 220 } },
    { names: ["geometric shelf", "geometric wall shelf", "modern wall shelf"], title: "Geometric shelf", params: { sides: 6, shelves: 1 } },
    { names: ["hexagon shadow box", "hexagon box shelf", "hex box shelf", "hexagon shelf with back"], title: "Hexagon box shelf", params: { backT: 3 } },
    { names: ["small hexagon shelf", "mini hexagon shelf", "small hex shelf"], title: "Small hexagon shelf", params: { size: 130, depth: 70, wall: 3 } },
    { names: ["hexagon plant shelf", "honeycomb plant shelf", "hexagon succulent shelf"], title: "Hexagon plant shelf", params: { size: 220, depth: 120, shelves: 0, backT: 2.4 } },
  ],
  body: `
// lying on its back: x across, y up the wall (as hung), z out from the wall
const R = size / 2;
// a flat side at the bottom (as hung): rotate so one edge is horizontal
const a0 = -Math.PI / 2 - Math.PI / sides;
const ngon = (r) => polygon(Array.from({ length: sides }, (_, i) => [r * Math.cos(a0 + 2 * Math.PI * i / sides), r * Math.sin(a0 + 2 * Math.PI * i / sides)]));
const inR = R - wall / Math.cos(Math.PI / sides);
const frame = difference(linearExtrude({ h: depth }, ngon(R)), translate([0, 0, backT > 0 ? backT : -1], linearExtrude({ h: depth + 2 }, ngon(inR))));
const parts = [frame];
// shelves across the inside, clipped to the opening
const apo = R * Math.cos(Math.PI / sides);           // centre to the bottom flat
for (let i = 1; i <= shelves; i++) {
  const y = -apo + 2 * apo * i / (shelves + 1);
  parts.push(intersection(translate([-R, y - wall / 2, 0], cube([2 * R, wall, depth])), linearExtrude({ h: depth }, ngon(inR + 0.5))));
}
const piece = parts.length > 1 ? union(...parts) : frame;
// two screws: through the back near the top, or through the top wall of an open frame
const k = Math.min(screwD / 2, Math.max(backT, wall) - 1);
const top = Math.max(...Array.from({ length: sides }, (_, i) => R * Math.sin(a0 + 2 * Math.PI * i / sides)));   // a flat, or a corner
const xs = [-R * 0.22, R * 0.22];
const holes = backT > 0
  ? xs.flatMap((x) => [
      translate([x, apo * 0.55, -1], cylinder({ r: screwD / 2, h: backT + 2, $fn: 24 })),
      translate([x, apo * 0.55, backT - k + 0.02], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 })),
    ])
  : xs.map((x) => translate([x, top + 1, depth / 2], rotate([90, 0, 0], cylinder({ r: screwD / 2, h: top - apo + 2.5 * wall / Math.cos(Math.PI / sides) + 2, $fn: 24 }))));
return difference(piece, ...holes);
`,
};
