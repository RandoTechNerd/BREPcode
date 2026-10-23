// A vase: a classic, bulb, bud, urn, trumpet or straight outline, either
// turned smooth or made of flat facets (a polygon) that can twist as it
// rises. The outline is a radius at each height, held to widen no faster
// than 45 degrees, or narrow faster (inside, a neck overhangs too), so it
// prints upright with no supports; a faceted vase is a
// stack of hulls between turned polygons, which is what keeps every facet
// flat. Thin-walled but solid, so it holds water without vase mode.

export default {
  id: "vase",
  category: "decor",
  title: "Vase",
  summary: "a thin-walled vase, smooth or faceted and twisted, in several classic outlines.",
  print: "upright as shown, no supports. PETG holds water best; 3 walls.",
  names: ["vase", "flower vase", "decorative vase", "table vase", "vase for flowers", "flower holder vase"],
  nouns: ["vase"],
  keywords: ["flower", "flowers", "stem", "bouquet", "decor", "table", "dried"],
  primary: "height",
  tips: ["250 mm tall", "twisted hexagon", "a bud vase", "wider"],
  examples: ["I want a vase", "make me a flower vase 200mm tall", "a twisted hexagon vase",
    "a small bud vase 120mm tall", "vase 150mm tall and 120mm wide"],
  params: {
    height: { default: 180, min: 40, max: 250, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter", "lower"] },
    width: { default: 100, min: 30, max: 200, unit: "mm", label: "widest diameter", say: ["wide", "width", "across", "diameter"], more: ["wider", "fatter"], less: ["narrower", "slimmer"] },
    shape: { default: "classic", unit: "choice", choices: ["classic", "bulb", "bud", "urn", "trumpet", "cylinder"], label: "outline",
      words: { bud: ["bud", "single stem"], bulb: ["bulb", "round", "belly", "globe"], urn: ["urn", "amphora"], trumpet: ["trumpet", "flared", "flare", "tulip"], cylinder: ["cylinder", "straight", "tube", "column"], classic: ["classic"] } },
    neck: { default: 0.55, min: 0.2, max: 1, unit: "ratio", label: "opening as a share of the width", say: ["neck", "opening", "mouth"] },
    sides: { default: 0, min: 0, max: 12, unit: "count", label: "facets (0 = smooth, 3 to 12 = a polygon)", say: ["side", "facet", "face"] },
    twist: { default: 0, min: 0, max: 180, unit: "deg", label: "twist over the height (faceted only)", say: ["twist", "twisted", "spiral", "turn"] },
    wall: { default: 1.6, min: 0.8, max: 4, unit: "mm", label: "wall thickness", say: ["wall", "thick"] },
    floor: { default: 2, min: 1.2, max: 6, unit: "mm", label: "floor thickness", say: ["floor", "base"] },
  },
  things: [
    { names: ["bud vase", "small bud vase", "single flower vase", "mini vase"], title: "Bud vase", params: { shape: "bud", height: 120, width: 60, neck: 0.4 } },
    { names: ["tall vase", "tall flower vase", "floor vase"], title: "Tall vase", params: { height: 250, width: 100 } },
    { names: ["twisted vase", "twist vase", "spiral vase", "swirl vase"], title: "Twisted vase", params: { sides: 6, twist: 90, shape: "classic" } },
    { names: ["twisted hexagon vase", "twisted hex vase", "spiral hexagon vase", "hexagon twist vase"], title: "Twisted hexagon vase", params: { sides: 6, twist: 90, shape: "classic", width: 90 } },
    { names: ["hexagon vase", "hexagonal vase", "hex vase"], title: "Hexagon vase", params: { sides: 6, shape: "cylinder", width: 90 } },
    { names: ["geometric vase", "low poly vase", "faceted vase", "polygon vase"], title: "Geometric vase", params: { sides: 7, twist: 40, shape: "bulb" } },
    { names: ["cylinder vase", "straight vase", "tube vase", "column vase"], title: "Cylinder vase", params: { shape: "cylinder", width: 80, height: 200 } },
    { names: ["urn vase", "amphora vase", "urn"], title: "Urn vase", params: { shape: "urn", width: 120, height: 200 } },
    { names: ["trumpet vase", "flared vase", "tulip vase"], title: "Trumpet vase", params: { shape: "trumpet", width: 120, height: 200 } },
    { names: ["bulb vase", "round vase", "globe vase", "bubble vase"], title: "Bulb vase", params: { shape: "bulb", width: 130, height: 160, neck: 0.4 } },
    { names: ["dried flower vase", "pampas grass vase", "pampas vase"], title: "Pampas vase", params: { height: 250, width: 120, neck: 0.5 } },
    { names: ["single stem vase", "stem vase", "skinny vase"], title: "Single stem vase", params: { shape: "bud", height: 160, width: 45, neck: 0.3 } },
    { names: ["octagon vase", "octagonal vase"], title: "Octagon vase", params: { sides: 8, twist: 22.5, shape: "cylinder", width: 90 } },
  ],
  body: `
// the outline: a radius at each height, from control points (height share,
// radius share) passed through smoothly
const R = width / 2;
const k = neck;
const ctrl = {
  classic: [[0, 0.62], [0.38, 1], [0.82, k], [1, Math.min(1, k + 0.12)]],
  bulb: [[0, 0.55], [0.42, 1], [0.85, k * 0.8], [1, k * 0.9]],
  bud: [[0, 0.72], [0.35, 1], [0.78, k], [1, k * 1.15]],
  urn: [[0, 0.55], [0.12, 0.5], [0.55, 1], [0.85, Math.max(k, 0.6)], [1, Math.max(k, 0.6) + 0.1]],
  trumpet: [[0, 0.5], [0.3, 0.52], [1, 1]],
  cylinder: [[0, 1], [1, 1]],
}[shape];
const lerp = (u) => {
  // Catmull-Rom through the control points
  let i = 0;
  while (i < ctrl.length - 2 && u > ctrl[i + 1][0]) i++;
  const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
  const s = (u - p1[0]) / (p2[0] - p1[0]);
  const m1 = (p2[1] - p0[1]) / 2, m2 = (p3[1] - p1[1]) / 2;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p1[1] + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2[1] + (s3 - s2) * m2;
};
const faceted = sides >= 3;
const n = faceted ? Math.max(8, Math.min(16, Math.ceil(twist / 12) + 8)) : 28;
const zs = Array.from({ length: n + 1 }, (_, i) => height * i / n);
// never widen or narrow faster than 45 degrees (a narrowing neck overhangs on
// the inside), a bit less for twisted facets; never thinner than the wall allows
const climb = faceted ? 0.7 : 0.95;
const rs = [];
zs.forEach((z, i) => {
  const want = Math.max(wall + 3, R * lerp(z / height));
  const dz = i === 0 ? 0 : z - zs[i - 1];
  rs.push(i === 0 ? want : Math.max(rs[i - 1] - climb * dz, Math.min(want, rs[i - 1] + climb * dz)));
});
if (!faceted) {
  const outer = zs.map((z, i) => [rs[i], z]);
  const inner = zs.map((z, i) => [rs[i] - wall, z]).filter(([, z]) => z > floor).reverse();
  return revolve(360, polygon([[0, 0], ...outer, ...inner, [rs[0] - wall, floor], [0, floor]]));
}
// faceted: hulls between consecutive turned polygons
const ring = (z, r) => {
  const a0 = twist * Math.PI / 180 * z / height;
  return translate([0, 0, z], linearExtrude({ h: 0.01 }, polygon(Array.from({ length: sides }, (_, i) =>
    [r * Math.cos(a0 + 2 * Math.PI * i / sides), r * Math.sin(a0 + 2 * Math.PI * i / sides)]))));
};
const stack = (dr, z0, top) => union(...zs.slice(0, -1).map((z, i) => {
  const za = Math.max(z, z0), zb = i === n - 1 ? top : zs[i + 1];
  if (zb <= za + 0.02) return null;
  const ra = rs[i] + (rs[i + 1] - rs[i]) * (za - z) / (zs[i + 1] - z) - dr;
  return hull(ring(za, ra), ring(zb - 0.01, rs[i + 1] - dr));
}).filter(Boolean));
// the inner polygon's flats sit a wall's thickness inside the outer's
const dr = wall / Math.cos(Math.PI / sides);
return difference(stack(0, 0, height), stack(dr, floor, height + 1));
`,
};
