// A tabletop Christmas tree: a cone with a skirt of branches at each tier,
// each skirt's underside sloping up at a little over 45 degrees, so it prints
// upright with no supports. Faceted tiers (a hull of turned polygons) can
// turn a little more at each level for a low-poly spiral; round tiers are
// turned. An optional stand disc keeps it steady.

export default {
  id: "christmas-tree",
  category: "decor",
  title: "Christmas tree",
  summary: "a tiered tabletop Christmas tree, round or low-poly and twisting, on a stand.",
  print: "upright as shown, no supports. Green PLA, or swap colour for the stand.",
  names: ["christmas tree", "xmas tree", "printed christmas tree", "christmas tree model", "christmas tree decoration",
    "tiered christmas tree", "christmas tree figure"],
  nouns: ["tree"],
  keywords: ["christmas", "xmas", "holiday", "festive", "table", "decoration", "pine", "fir"],
  primary: "height",
  tips: ["200 mm tall", "low poly", "6 tiers", "round"],
  examples: ["I want a christmas tree", "make me a mini christmas tree 100mm tall",
    "a low poly christmas tree with 5 tiers", "a round xmas tree"],
  params: {
    height: { default: 140, min: 40, max: 250, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter", "smaller"] },
    width: { default: 90, min: 30, max: 200, unit: "mm", label: "width of the lowest branches", say: ["wide", "width", "across", "diameter"], more: ["wider", "fuller"], less: ["narrower", "slimmer"] },
    tiers: { default: 4, min: 2, max: 8, unit: "count", label: "tiers of branches", say: ["tier", "level", "layer"] },
    sides: { default: 8, min: 0, max: 12, unit: "count", label: "facets (0 = round)", say: ["side", "facet", "point"] },
    twist: { default: 15, min: 0, max: 45, unit: "deg", label: "turn at each tier (faceted)", say: ["twist", "turn", "spiral"] },
    trunkH: { default: 12, min: 0, max: 40, unit: "mm", label: "trunk height below the branches", say: ["trunk"] },
    trunkD: { default: 14, min: 5, max: 40, unit: "mm", label: "trunk diameter", say: ["thick"] },
    standD: { default: 50, min: 0, max: 150, unit: "mm", label: "stand diameter (0 = none)", say: ["stand", "base"] },
  },
  things: [
    { names: ["mini christmas tree", "small christmas tree", "tiny christmas tree", "mini xmas tree"], title: "Mini Christmas tree",
      params: { height: 80, width: 55, tiers: 3, trunkH: 8, trunkD: 10, standD: 35 } },
    { names: ["tabletop christmas tree", "table christmas tree", "desk christmas tree", "tabletop xmas tree"], title: "Tabletop Christmas tree",
      params: { height: 200, width: 120, tiers: 5, standD: 70 } },
    { names: ["low poly christmas tree", "low poly tree", "geometric christmas tree", "faceted christmas tree"], title: "Low-poly Christmas tree",
      params: { sides: 6, twist: 30, tiers: 5 } },
    { names: ["spiral christmas tree", "twisted christmas tree", "swirl christmas tree"], title: "Spiral Christmas tree",
      params: { sides: 5, twist: 36, tiers: 7, height: 170 } },
    { names: ["round christmas tree", "cone christmas tree", "smooth christmas tree"], title: "Round Christmas tree", params: { sides: 0, tiers: 4 } },
    { names: ["star christmas tree", "christmas tree with points", "pointy christmas tree"], title: "Star-point Christmas tree",
      params: { sides: 10, twist: 18, tiers: 5 } },
  ],
  body: `
// the lowest skirt flares out from the trunk at a little over 45 degrees; the
// rest sit on a cone (the core) above it, each a short 45-degree underside and
// a long slope back in to the core, so the silhouette is the stepped cone of a
// tree, every skirt starts inside the one below, and nothing overhangs
const rt = trunkD / 2;
const z0 = (standD > 0 ? 3 : 0) + trunkH;          // underside of the lowest skirt
const H = height - z0;
const R = Math.max(rt + 2, Math.min(width / 2, rt + 0.45 * H / 1.05));   // too wide for its height flares less
const zw0 = z0 + 1.05 * (R - rt);                  // the lowest skirt's widest ring
const step = (height - zw0) / Math.max(1, tiers - 0.4);
const lip0 = Math.min(R * 0.32, step * 0.85);
const Rc = R - lip0;                                 // the core's radius at zw0, down to a point at the top
const core = (z) => Math.max(0.4, Rc * (1 - (z - zw0) / (height - zw0)));
const tiersOut = Array.from({ length: tiers }, (_, i) => {
  const top = i === tiers - 1;
  if (i === 0) {
    const zt = top ? height : Math.min(height, zw0 + step * 0.9);
    return { zb: z0, rin: rt, Rk: R, zw: zw0, zt, rTop: top ? 0.4 : core(zt) };
  }
  const zb = zw0 + (i - 0.5) * step;
  const zt = top ? height : Math.min(height, zb + step * 1.4);
  const rin = core(zb) * 0.95;
  const lip = Math.max(0.5, Math.min(lip0 * (1 - 0.4 * (i - 1) / Math.max(1, tiers - 2)), (zt - zb - 1.5) / 1.05));
  return { zb, rin, Rk: rin + lip, zw: zb + 1.05 * lip, zt, rTop: top ? 0.4 : core(zt) };
});
const facet = sides >= 3;
const ring = (z, r, a) => translate([0, 0, z], linearExtrude({ h: 0.01 }, polygon(Array.from({ length: sides }, (_, i) =>
  [r * Math.cos(a + 2 * Math.PI * i / sides), r * Math.sin(a + 2 * Math.PI * i / sides)]))));
const tierSolid = (t, i) => facet
  ? hull(ring(t.zb, t.rin, twist * Math.PI / 180 * i), ring(t.zw, t.Rk, twist * Math.PI / 180 * i), ring(t.zt - 0.01, t.rTop, twist * Math.PI / 180 * i))
  : revolve(360, polygon([[0, t.zb], [t.rin, t.zb], [t.Rk, t.zw], [t.rTop, t.zt], [0, t.zt]]));
const parts = tiersOut.map(tierSolid);
// the trunk runs up into the lowest tier
parts.push(cylinder({ r: rt, h: z0 + 2, $fn: 32 }));
if (standD > 0) parts.push(cylinder({ r: Math.max(standD / 2, rt + 3), h: 3, $fn: 64 }));
return union(...parts);
`,
};
