// A desk cup for pens, brushes or utensils: round, hex or octagonal, with
// optional radial dividers. A low $fn on a cylinder IS the polygon, so the
// hex cup is just a six-sided cylinder, and the walls stay a true `wall`
// thick because the inner radius is pushed out by 1/cos(180/n).

export default {
  id: "pen-cup",
  category: "desk",
  title: "Pen holder",
  summary: "a desk cup for pens, brushes or utensils, round or hexagonal, with optional dividers.",
  print: "upright as shown, no supports.",
  names: ["pen holder", "pencil holder", "pen cup", "pencil cup", "pen pot", "desk organizer", "desk tidy",
    "marker holder", "brush holder", "makeup brush holder", "paint brush holder", "utensil holder", "pen organizer"],
  nouns: ["cup", "pot", "organizer", "caddy"],
  keywords: ["pen", "pencil", "desk", "marker", "brush", "office"],
  tips: ["hexagonal", "3 compartments", "120 mm tall"],
  examples: ["I want a pen holder", "make me a hexagonal pencil cup with 3 compartments",
    "desk organizer 90mm across", "a makeup brush holder"],
  params: {
    diameter: { default: 80, min: 30, max: 200, unit: "mm", label: "outside diameter", say: ["across", "diameter", "wide"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    height: { default: 100, min: 30, max: 250, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    wall: { default: 2, min: 1.2, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 2.5, min: 1.5, max: 6, unit: "mm", label: "floor thickness", say: ["floor"] },
    compartments: { default: 1, min: 1, max: 6, unit: "count", label: "compartments", say: ["compartment", "section", "divider", "slot"] },
    form: { default: "round", unit: "choice", choices: ["round", "hex", "octagon"], label: "outline",
      words: { hex: ["hex", "hexagon", "hexagonal"], octagon: ["octagon", "octagonal"], round: ["round", "circular", "cylinder"] } },
  },
  things: [
    { names: ["makeup brush holder", "cosmetic brush holder"], title: "Makeup brush holder", params: { diameter: 90, height: 120, compartments: 3 } },
    { names: ["utensil holder", "kitchen utensil holder", "utensil crock", "spatula holder"], title: "Utensil holder", params: { diameter: 120, height: 160, compartments: 3, wall: 2.4 } },
    { names: ["paint brush holder", "art brush holder"], title: "Paint brush holder", params: { diameter: 90, height: 110, compartments: 4, form: "hex" } },
    { names: ["hex pen holder", "hexagonal pen holder", "honeycomb pen holder"], title: "Hex pen holder", params: { form: "hex" } },
  ],
  body: `
const sides = form === "hex" ? 6 : form === "octagon" ? 8 : 96;
const r = diameter / 2;
const apothem = r * Math.cos(Math.PI / sides);
const ri = r - wall / Math.cos(Math.PI / sides);    // keeps the wall \`wall\` thick on the flats
const cup = difference(
  cylinder({ r, h: height, $fn: sides }),
  translate([0, 0, floor], cylinder({ r: ri, h: height, $fn: sides })),
);
if (compartments < 2) return cup;
const divT = Math.max(1.2, wall * 0.8), divH = height * 0.85;
const reach = apothem - wall / 2;                 // ends buried in the wall on every side
const walls = compartments === 2
  ? [translate([-reach, -divT / 2, floor - 0.1], cube([2 * reach, divT, divH - floor + 0.1]))]
  : Array.from({ length: compartments }, (_, i) =>
      rotate([0, 0, i * 360 / compartments + 90], translate([-divT / 2, 0, floor - 0.1], cube([divT, reach, divH - floor + 0.1]))));
// radial walls only meet at a point: a post at the centre closes the gap between them
if (compartments > 2) walls.push(translate([0, 0, floor - 0.1], cylinder({ r: divT, h: divH - floor + 0.1, $fn: 16 })));
return union(cup, ...walls);
`,
};
