// A napkin ring: a band round a rolled napkin, round or faceted, and the
// facets can twist. Printed standing up, as a tube. A faceted ring is a
// stack of hulls between turned polygons; a round one is two cylinders.

export default {
  id: "napkin-ring",
  category: "decor",
  title: "Napkin ring",
  summary: "a round or faceted, optionally twisted, ring for a rolled napkin; a set at once.",
  print: "standing up as shown, no supports.",
  names: ["napkin ring", "napkin rings", "table napkin ring", "napkin band", "cloth napkin ring"],
  nouns: ["ring", "band"],
  keywords: ["napkin", "serviette", "table", "dinner", "wedding", "party", "place setting"],
  tips: ["a set of 6", "hexagon", "twisted", "wider band"],
  examples: ["I want a napkin ring", "make me 6 napkin rings", "a twisted hexagon napkin ring",
    "napkin ring 30mm wide"],
  params: {
    innerD: { default: 42, min: 25, max: 70, unit: "mm", label: "inside diameter", say: ["inside", "inner", "diameter", "across"] },
    height: { default: 25, min: 8, max: 60, unit: "mm", label: "band width", say: ["wide", "width", "tall", "high", "band"], more: ["wider"], less: ["narrower"] },
    wall: { default: 3, min: 1.6, max: 8, unit: "mm", label: "wall thickness", say: ["thick", "thickness", "wall"] },
    sides: { default: 0, min: 0, max: 12, unit: "count", label: "facets (0 = round, 3 to 12 = a polygon)", say: ["side", "facet", "face"] },
    twist: { default: 0, min: 0, max: 90, unit: "deg", label: "twist across the band (faceted only)", say: ["twist", "twisted", "spiral"] },
    count: { default: 1, min: 1, max: 8, unit: "count", label: "how many", say: ["ring", "napkin", "piece", "set"] },
  },
  things: [
    { names: ["serviette ring", "serviette holder ring", "serviette rings"], title: "Serviette ring" },
    { names: ["hexagon napkin ring", "hex napkin ring", "geometric napkin ring"], title: "Hexagon napkin ring", params: { sides: 6, wall: 3.5 } },
    { names: ["twisted napkin ring", "spiral napkin ring", "twist napkin ring"], title: "Twisted napkin ring", params: { sides: 8, twist: 45, wall: 3.5 } },
    { names: ["napkin ring set", "set of napkin rings", "napkin rings set of 4", "wedding napkin rings"], title: "Napkin ring set", params: { count: 4 } },
    { names: ["scarf ring", "scarf clip ring", "bandana ring"], title: "Scarf ring", params: { innerD: 28, height: 14, wall: 2.4 } },
  ],
  body: `
const ri = innerD / 2;
const faceted = sides >= 3;
// a faceted ring's flats sit a wall's thickness outside the hole
const ro = faceted ? (ri + wall) / Math.cos(Math.PI / sides) : ri + wall;
const one = () => {
  if (!faceted) return difference(cylinder({ r: ro, h: height, $fn: 96 }), translate([0, 0, -1], cylinder({ r: ri, h: height + 2, $fn: 96 })));
  const ring = (z, a) => translate([0, 0, z], linearExtrude({ h: 0.01 }, polygon(Array.from({ length: sides }, (_, i) =>
    [ro * Math.cos(a + 2 * Math.PI * i / sides), ro * Math.sin(a + 2 * Math.PI * i / sides)]))));
  const n = twist > 0 ? 4 : 1;
  const tw = twist * Math.PI / 180;
  const band = union(...Array.from({ length: n }, (_, i) => hull(ring(height * i / n, tw * i / n), ring(height * (i + 1) / n - 0.01, tw * (i + 1) / n))));
  return difference(band, translate([0, 0, -1], cylinder({ r: ri, h: height + 2, $fn: 96 })));
};
const step = 2 * ro + 5;
const cols = Math.min(count, 4);
const rings = Array.from({ length: count }, (_, i) => translate([(i % cols) * step, Math.floor(i / cols) * step, 0], one()));
return rings.length > 1 ? group(...rings) : rings[0];
`,
};
