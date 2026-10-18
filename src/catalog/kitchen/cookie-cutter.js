// A cookie cutter: a thin blade standing on a wider flange. Each outline is
// built from a few disks and polygons (a heart is two disks and a triangle),
// and read back as a star-shaped outline by casting rays from the middle and
// keeping the farthest exit. The blade's outside is that outline grown by the
// wall, worked out the same way: along every ray, the farthest point of any
// disk of radius `wall` centred on the outline. That is an exact offset, so
// the wall is the same thickness round a star's points as along its flats,
// and it can never cross itself.

export default {
  id: "cookie-cutter",
  category: "kitchen",
  title: "Cookie cutter",
  summary: "a cookie or biscuit cutter in a choice of shapes, with a flange to press on.",
  print: "flange down as shown, no supports. Food contact: PLA or PETG from a food-safe spool, hand wash cool, not for the dishwasher.",
  names: ["cookie cutter", "biscuit cutter", "dough cutter", "pastry cutter", "fondant cutter", "cookie cutter shape",
    "cookie mold", "cutter for cookies"],
  nouns: ["cutter"],
  keywords: ["cookie", "cookies", "biscuit", "dough", "baking", "fondant", "pastry", "shape"],
  primary: "size",
  tips: ["heart", "90 mm", "fluted"],
  examples: ["I want a cookie cutter", "make me a star cookie cutter 80mm",
    "heart shaped cookie cutter", "a round biscuit cutter 65 mm across"],
  params: {
    shape: { default: "round", unit: "choice", label: "shape",
      choices: ["round", "fluted", "heart", "star", "flower", "square", "hexagon", "egg", "bone", "fish"],
      words: { fluted: ["fluted", "scalloped", "crinkle", "wavy"], heart: ["heart", "valentine"], star: ["star"],
        flower: ["flower", "daisy", "blossom"], square: ["square", "ravioli"], hexagon: ["hexagon", "hex", "hexagonal"],
        egg: ["egg", "easter", "oval"], bone: ["bone", "dog treat", "dog biscuit"], fish: ["fish", "cat treat"],
        round: ["round", "circle", "circular"] } },
    size: { default: 70, min: 20, max: 200, unit: "mm", label: "size (the longer way across)", say: ["across", "size", "wide", "diameter", "big"], more: ["bigger", "larger"], less: ["smaller"] },
    height: { default: 20, min: 8, max: 45, unit: "mm", label: "blade height", say: ["tall", "high", "height", "deep"], more: ["taller", "deeper"], less: ["shorter"] },
    wall: { default: 1, min: 0.6, max: 2.4, unit: "mm", label: "blade thickness", say: ["blade", "wall", "thick"], more: ["thicker", "stronger"], less: ["thinner", "sharper"] },
    flangeW: { default: 4, min: 0, max: 10, unit: "mm", label: "flange width (0 = none)", say: ["flange", "lip", "rim"] },
    flangeT: { default: 2, min: 1, max: 4, unit: "mm", label: "flange thickness", say: ["flange"] },
  },
  things: [
    { names: ["round cookie cutter", "circle cookie cutter", "round biscuit cutter", "scone cutter", "circle cutter"], title: "Round cutter", params: { shape: "round", size: 65 } },
    { names: ["fluted cookie cutter", "fluted biscuit cutter", "scalloped cookie cutter", "crinkle cutter", "fluted pastry cutter"], title: "Fluted cutter", params: { shape: "fluted", size: 65 } },
    { names: ["heart cookie cutter", "heart shaped cookie cutter", "heart cutter", "valentine cookie cutter"], title: "Heart cutter", params: { shape: "heart" } },
    { names: ["star cookie cutter", "star cutter", "star shaped cookie cutter", "christmas star cookie cutter"], title: "Star cutter", params: { shape: "star" } },
    { names: ["flower cookie cutter", "flower cutter", "daisy cookie cutter", "fondant flower cutter"], title: "Flower cutter", params: { shape: "flower" } },
    { names: ["square cookie cutter", "ravioli cutter", "square cutter", "square biscuit cutter"], title: "Square cutter", params: { shape: "square", size: 60 } },
    { names: ["hexagon cookie cutter", "hexagon cutter", "honeycomb cookie cutter"], title: "Hexagon cutter", params: { shape: "hexagon" } },
    { names: ["egg cookie cutter", "easter egg cookie cutter", "oval cookie cutter", "egg cutter"], title: "Easter egg cutter", params: { shape: "egg", size: 80 } },
    { names: ["dog bone cookie cutter", "dog treat cutter", "dog biscuit cutter", "bone cookie cutter", "dog treat cookie cutter"], title: "Dog bone cutter", params: { shape: "bone", size: 90 } },
    { names: ["fish cookie cutter", "cat treat cutter", "fish cutter", "cat treat cookie cutter"], title: "Fish cutter", params: { shape: "fish", size: 80 } },
    { names: ["mini cookie cutter", "small cookie cutter", "mini fondant cutter", "tiny cookie cutter"], title: "Mini cutter", params: { size: 35, height: 14, flangeW: 3 } },
  ],
  body: `
// ---- the outline, as pieces: disks [x, y, r] and polygons [[x, y], ...], about 2 across
const ngon = (n, r, a0 = 0) => Array.from({ length: n }, (_, i) => [r * Math.cos(a0 + 2 * Math.PI * i / n), r * Math.sin(a0 + 2 * Math.PI * i / n)]);
const disks = [], polys = [];
if (shape === "round") disks.push([0, 0, 1]);
if (shape === "fluted") { disks.push([0, 0, 0.9]); for (let i = 0; i < 12; i++) disks.push([0.9 * Math.cos(i * Math.PI / 6), 0.9 * Math.sin(i * Math.PI / 6), 0.18]); }
if (shape === "heart") { disks.push([-0.5, 0.35, 0.55], [0.5, 0.35, 0.55]); polys.push([[-0.913, -0.014], [0, -1.05], [0.913, -0.014], [0, 0.3]]); }   // sides tangent to the lobes
if (shape === "star") polys.push(Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.45 : 1, a = Math.PI / 2 + i * Math.PI / 5; return [r * Math.cos(a), r * Math.sin(a)]; }));
if (shape === "flower") { disks.push([0, 0, 0.5]); for (let i = 0; i < 5; i++) disks.push([0.55 * Math.cos(Math.PI / 2 + i * 2 * Math.PI / 5), 0.55 * Math.sin(Math.PI / 2 + i * 2 * Math.PI / 5), 0.42]); }
if (shape === "square") { polys.push([[-0.82, -1], [0.82, -1], [1, -0.82], [1, 0.82], [0.82, 1], [-0.82, 1], [-1, 0.82], [-1, -0.82]]); }
if (shape === "hexagon") polys.push(ngon(6, 1));
// an ellipse squeezed toward the top: an egg; a lens with a forked tail: a fish
const oval = (a, b, x0, squeeze, n = 48) => Array.from({ length: n }, (_, i) => {
  const t = 2 * Math.PI * i / n;
  return [x0 + a * Math.cos(t) * (1 - squeeze * Math.sin(t)), b * Math.sin(t)];
});
if (shape === "egg") polys.push(oval(0.76, 1, 0, 0.16));
if (shape === "bone") { polys.push([[-0.75, -0.2], [0.75, -0.2], [0.75, 0.2], [-0.75, 0.2]]); for (const x of [-0.78, 0.78]) for (const y of [-0.2, 0.2]) disks.push([x, y, 0.26]); }
if (shape === "fish") { polys.push(oval(0.62, 0.42, -0.18, 0)); polys.push([[0.3, 0], [1, 0.5], [0.86, 0], [1, -0.5]]); }

// ---- farthest exit of a ray from the middle, through every piece
const exitOf = (ux, uy, pad = 0) => {
  let best = 0;
  for (const [cx, cy, r] of disks) {
    const b = cx * ux + cy * uy, q = b * b - (cx * cx + cy * cy) + (r + pad) * (r + pad);
    if (q >= 0) best = Math.max(best, b + Math.sqrt(q));
  }
  for (const pts of polys) pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], ex = q[0] - p[0], ey = q[1] - p[1];
    const den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-12) return;
    const t = (p[0] * ey - p[1] * ex) / den, s = (p[0] * uy - p[1] * ux) / den;
    if (s >= 0 && s <= 1) best = Math.max(best, t);
  });
  return best;
};
const rays = (n = 96) => Array.from({ length: n }, (_, i) => [Math.cos(2 * Math.PI * i / n), Math.sin(2 * Math.PI * i / n)]);
const unit = rays().map(([ux, uy]) => { const t = exitOf(ux, uy); return [t * ux, t * uy]; });
const xs = unit.map((p) => p[0]), ys = unit.map((p) => p[1]);
const k = size / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
const cx0 = (Math.max(...xs) + Math.min(...xs)) / 2, cy0 = (Math.max(...ys) + Math.min(...ys)) / 2;
const inner = unit.map(([x, y]) => [k * x, k * y]);

// ---- the same outline grown by d: along each ray, the farthest point of a disk of radius d
// centred anywhere on the outline (its edges sampled every half millimetre)
const along = inner.flatMap((p, i) => {
  const q = inner[(i + 1) % inner.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.5));
  return Array.from({ length: n }, (_, j) => [p[0] + (q[0] - p[0]) * j / n, p[1] + (q[1] - p[1]) * j / n]);
});
const grown = (d) => rays().map(([ux, uy]) => {
  let best = 0;
  for (const [px, py] of along) {
    const b = px * ux + py * uy, q = b * b - (px * px + py * py) + d * d;
    if (q >= 0) best = Math.max(best, b + Math.sqrt(q));
  }
  return [best * ux, best * uy];
});
const prism = (pts, h, z = 0) => translate([0, 0, z], linearExtrude({ h }, polygon(pts)));
const solid = flangeW > 0 ? union(prism(grown(wall + flangeW), flangeT), prism(grown(wall), height)) : prism(grown(wall), height);
return translate([-k * cx0, -k * cy0, 0], difference(solid, prism(inner, height + 2, -1)));
`,
};
