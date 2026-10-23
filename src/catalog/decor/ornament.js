// Flat hanging decorations for every holiday: a star, snowflake, tree, heart,
// bell, bauble, candy cane, gingerbread man, Easter egg, pumpkin, ghost,
// crescent moon, a bunting pennant or a gift tag. Each is an outline printed
// flat, with a smaller raised copy on top for relief, and a loop with a neck
// that wraps over the top so even a pointed star tip holds the ribbon.

export default {
  id: "ornament",
  category: "decor",
  title: "Ornament",
  summary: "a flat hanging ornament or decoration in a dozen holiday shapes, with a ribbon loop.",
  print: "flat as shown, no supports. Change filament at the relief layer for two colours.",
  names: ["christmas ornament", "xmas ornament", "holiday ornament", "hanging ornament", "flat ornament",
    "tree ornament", "christmas decoration", "holiday decoration", "hanging decoration", "christmas tree decoration ornament"],
  nouns: ["ornament", "decoration", "bauble"],
  keywords: ["christmas", "xmas", "holiday", "tree", "hanging", "halloween", "easter", "festive", "valentine"],
  primary: "size",
  tips: ["a snowflake", "100 mm tall", "no relief", "6 points"],
  examples: ["I want a christmas ornament", "make me a snowflake ornament 90mm",
    "a star ornament with 6 points", "halloween ghost decoration", "a heart ornament for valentines"],
  params: {
    shape: { default: "star", unit: "choice", label: "shape",
      choices: ["star", "snowflake", "tree", "heart", "bell", "bauble", "cane", "gingerbread", "egg", "pumpkin", "ghost", "moon", "pennant", "tag"],
      words: { gingerbread: ["gingerbread"], snowflake: ["snowflake", "snow flake", "snowflakes"], cane: ["candy cane", "cane"], star: ["star"],
        heart: ["heart", "valentine", "love"], bell: ["bell", "jingle bell"], bauble: ["bauble", "ball", "round"], egg: ["egg", "easter"],
        pumpkin: ["pumpkin", "jack o lantern"], ghost: ["ghost", "spooky"], moon: ["moon", "crescent"], pennant: ["pennant", "bunting", "flag", "banner"],
        tag: ["gift tag", "tag", "label"], tree: ["christmas tree", "tree shape", "pine tree", "fir tree"] } },
    size: { default: 70, min: 25, max: 160, unit: "mm", label: "height", say: ["tall", "high", "size", "across", "big", "wide"], more: ["bigger", "larger"], less: ["smaller"] },
    thick: { default: 3, min: 1.2, max: 8, unit: "mm", label: "thickness", say: ["thick", "thickness"] },
    relief: { default: 1, min: 0, max: 4, unit: "mm", label: "raised inner layer (0 = flat)", say: ["relief", "raised", "layer"] },
    holeD: { default: 4, min: 0, max: 8, unit: "mm", label: "ribbon hole (0 = none)", say: ["hole", "ribbon", "string"] },
    points: { default: 5, min: 4, max: 12, unit: "count", label: "points (star) or arms (snowflake)", say: ["point", "arm", "ray"] },
  },
  things: [
    { names: ["star ornament", "christmas star", "star decoration", "hanging star"], title: "Star ornament", params: { shape: "star" } },
    { names: ["snowflake ornament", "snowflake decoration", "hanging snowflake", "snowflake"], title: "Snowflake ornament", params: { shape: "snowflake", points: 6, size: 80 } },
    { names: ["christmas tree ornament", "tree shaped ornament", "fir tree ornament"], title: "Tree ornament", params: { shape: "tree" } },
    { names: ["heart ornament", "valentine heart", "hanging heart", "heart decoration"], title: "Heart ornament", params: { shape: "heart" } },
    { names: ["bell ornament", "christmas bell", "jingle bell ornament"], title: "Bell ornament", params: { shape: "bell" } },
    { names: ["bauble ornament", "flat bauble", "ball ornament", "round ornament"], title: "Bauble", params: { shape: "bauble" } },
    { names: ["candy cane ornament", "candy cane", "candy cane decoration"], title: "Candy cane", params: { shape: "cane", size: 90 } },
    { names: ["gingerbread man ornament", "gingerbread ornament", "gingerbread man"], title: "Gingerbread man", params: { shape: "gingerbread", size: 80 } },
    { names: ["easter egg ornament", "easter egg decoration", "hanging easter egg", "easter egg"], title: "Easter egg", params: { shape: "egg" } },
    { names: ["pumpkin decoration", "halloween pumpkin", "pumpkin ornament", "hanging pumpkin"], title: "Pumpkin", params: { shape: "pumpkin" } },
    { names: ["ghost decoration", "halloween ghost", "ghost ornament", "hanging ghost"], title: "Ghost", params: { shape: "ghost" } },
    { names: ["moon ornament", "crescent moon", "moon decoration", "ramadan moon", "eid moon decoration"], title: "Crescent moon", params: { shape: "moon" } },
    { names: ["bunting flag", "pennant banner", "party bunting", "bunting pennant", "garland flag"], title: "Bunting pennant",
      params: { shape: "pennant", size: 90, relief: 0, thick: 2 } },
    { names: ["gift tag", "present tag", "christmas gift tag", "blank gift tag"], title: "Gift tag", params: { shape: "tag", size: 60, relief: 0, thick: 2 } },
  ],
  body: `
// flat in x/y, about 'size' tall and centred on the origin
const S = size;
const ring = (cx, cy, r, n = 48) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]);
const prism = (pts, z0, h) => translate([0, 0, z0], linearExtrude({ h }, polygon(pts)));
const disc = (x, y, r, z0, h) => translate([x, y, z0], cylinder({ r, h, $fn: 40 }));
const bar = (x0, y0, x1, y1, w, z0, h) => {
  const len = Math.hypot(x1 - x0, y1 - y0);
  return translate([x0, y0, z0], rotate([0, 0, Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI], translate([-w / 2, -w / 2, 0], cube([len + w, w, h]))));
};
// each shape: its outline (scaled by k for the relief), or built solids for the
// stroke shapes (thinner strokes for the relief); and where its top is
let outline = null, built = null, yTop = S / 2, loop = true;
if (shape === "star") {
  const ri = S / 2 * (points <= 5 ? 0.45 : 0.55);
  outline = (k) => Array.from({ length: 2 * points }, (_, i) => {
    const a = Math.PI / 2 + i * Math.PI / points, r = (i % 2 ? ri : S / 2) * k;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
} else if (shape === "heart") {
  const s = S / 29;
  outline = (k) => Array.from({ length: 72 }, (_, i) => {
    const t = 2 * Math.PI * i / 72;
    return [16 * Math.sin(t) ** 3 * s * k, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) * s * k];
  });
  yTop = 7.5 * s;                                    // the cleft between the lobes
} else if (shape === "bell") {
  const half = [[0, 0.5], [0.12, 0.49], [0.2, 0.42], [0.24, 0.25], [0.26, 0.05], [0.31, -0.18], [0.4, -0.31], [0.44, -0.37], [0.3, -0.36], [0, -0.34]];
  outline = (k) => [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])].map(([x, y]) => [x * S * k, y * S * k]);
} else if (shape === "bauble") {
  outline = (k) => [...ring(0, -0.06 * S * k, 0.44 * S * k, 64)];
  yTop = 0.38 * S;
} else if (shape === "egg") {
  outline = (k) => Array.from({ length: 64 }, (_, i) => {
    const t = 2 * Math.PI * i / 64;
    return [0.36 * S * Math.sin(t) * (1 - 0.15 * Math.cos(t)) * k, 0.5 * S * Math.cos(t) * k];
  });
} else if (shape === "pumpkin") {
  outline = (k) => Array.from({ length: 96 }, (_, i) => {
    const t = 2 * Math.PI * i / 96, r = 0.42 * S * (1 - 0.1 * Math.abs(Math.sin(3 * t))) * k;
    return [1.12 * r * Math.cos(t), 0.9 * r * Math.sin(t) - 0.05 * S * k];
  });
  yTop = 0.29 * S;                                 // the dip where a stem would be
} else if (shape === "ghost") {
  const w = 0.33 * S, b = -0.4 * S, bump = w / 3;
  outline = (k) => [
    ...Array.from({ length: 25 }, (_, i) => [w * Math.cos(Math.PI * i / 24), 0.17 * S + w * Math.sin(Math.PI * i / 24)]),
    ...[-2, 0, 2].flatMap((c) => Array.from({ length: 12 }, (_, i) => {
      const t = Math.PI + Math.PI * i / 11;
      return [c * bump + bump * Math.cos(t), b + bump * Math.sin(t)];
    })),
  ].map(([x, y]) => [x * k, y * k]);
} else if (shape === "tree") {
  const half = [[0.08, -0.5], [0.08, -0.38], [0.45, -0.38], [0.15, -0.08], [0.36, -0.08], [0.12, 0.18], [0.26, 0.18], [0, 0.5]];
  outline = (k) => [...half, ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y])].map(([x, y]) => [x * S * (k < 1 ? 0.72 : 1), (-0.05 + (y + 0.05) * (k < 1 ? 0.9 : 1)) * S]);
} else if (shape === "pennant") {
  outline = (k) => [[-0.35 * S * k, 0.5 * S * k], [0, -0.5 * S * k], [0.35 * S * k, 0.5 * S * k]].map(([x, y]) => [x, y + (k < 1 ? -0.05 * S : 0)]);
  loop = false;
} else if (shape === "tag") {
  outline = (k) => [[-0.3, -0.5], [0.3, -0.5], [0.3, 0.35], [0.15, 0.5], [-0.15, 0.5], [-0.3, 0.35]].map(([x, y]) => [x * S * k, y * S * k - (k < 1 ? 0.03 * S : 0)]);
  loop = false;
} else if (shape === "moon") {
  built = (g, z0, h) => difference(disc(0, 0, S / 2 - g, z0, h), disc(0.22 * S, 0.06 * S, 0.42 * S + g, z0 - 1, h + 2));
} else if (shape === "cane") {
  const w = 0.13 * S, rc = 0.12 * S, cy = 0.25 * S;
  yTop = cy + rc + w / 2;
  built = (g, z0, h) => {
    const ww = w - 2 * g;
    const band = Array.from({ length: 25 }, (_, i) => [rc + ww / 2, Math.PI * 1.1 * i / 24])
      .concat(Array.from({ length: 25 }, (_, i) => [rc - ww / 2, Math.PI * 1.1 * (24 - i) / 24]))
      .map(([r, a]) => [r * Math.cos(a), cy + r * Math.sin(a)]);
    return union(prism(band, z0, h), translate([rc - ww / 2, -0.5 * S + g, z0], cube([ww, cy + 0.5 * S - g + 0.5, h])));
  };
} else if (shape === "gingerbread") {
  built = (g, z0, h) => {
    const f = g > 0 ? 0.6 : 1;
    const limb = (x0, y0, x1, y1, r) => hull(disc(x0 * S, y0 * S, r * S * f, z0, h), disc(x1 * S, y1 * S, r * S * f, z0, h));
    return union(disc(0, 0.32 * S, 0.17 * S * f, z0, h), limb(0, 0.08, 0, -0.18, 0.17),
      limb(-0.12, 0.1, -0.36, 0, 0.075), limb(0.12, 0.1, 0.36, 0, 0.075),
      limb(-0.08, -0.2, -0.2, -0.42, 0.08), limb(0.08, -0.2, 0.2, -0.42, 0.08));
  };
  yTop = 0.49 * S;
} else {
  // snowflake: each arm one outline (a bar with two pairs of branches), round a hexagon
  const R = S / 2;
  built = (g, z0, h) => {
    const hw = Math.max(1, 0.035 * S) * (g > 0 ? 0.45 : 1);       // half the bar width
    const th = 0.9;                                               // branches leave the arm at about 52 degrees
    const twigs = [[R * 0.42, R * 0.32], [R * 0.68, R * 0.22]];   // where along the arm, how long
    // the arms start just clear of each other, inside the hub
    const r0 = hw / Math.sin(Math.PI / points) + 0.3;
    const hub = (r0 + hw) / Math.cos(Math.PI / 6) + 0.5;
    // one side of the arm, from the root out to the tip, with its branches, for y sign sd
    const side = (sd) => {
      const pts = [[r0, sd * hw]];
      for (const [d, L] of twigs) {
        const ux = Math.cos(th), uy = sd * Math.sin(th);
        const nx = Math.sin(th), ny = -sd * Math.cos(th);       // the branch side toward the tip
        const tIn = (hw - 0.8 * hw * Math.cos(th)) / Math.sin(th), tOut = (hw + 0.8 * hw * Math.cos(th)) / Math.sin(th);
        const e = (s1, t) => [d + s1 * 0.8 * hw * nx + t * ux, sd * 0 + s1 * 0.8 * hw * ny + t * uy];
        pts.push(e(-1, tIn), e(-1, L), e(1, L), e(1, tOut));
      }
      pts.push([R - hw, sd * hw]);
      return pts;
    };
    const arm = [...side(1), [R, 0], ...side(-1).reverse()];
    const arms = Array.from({ length: points }, (_, i) => rotate([0, 0, 90 + 360 * i / points], prism(arm, z0, h)));
    return union(prism(ring(0, 0, hub, 6), z0, h), ...arms);
  };
}
const solidAt = (rel, z0, h) => built ? built(rel ? Math.max(1, 0.03 * S) : 0, z0, h) : prism(outline(rel ? 0.8 : 1), z0, h);
const parts = [solidAt(false, 0, thick)];
// the relief sinks 0.4 mm into the base: a hair's overlap makes slivers that are slow to union
if (relief > 0) parts.push(solidAt(true, thick - 0.4, relief + 0.4));
const rl = holeD / 2 + 2.2;
const cuts = [];
if (holeD > 0 && loop) {
  // a ring above the top, and a neck that wraps over it
  const cy = yTop + rl - 1.2;
  parts.push(disc(0, cy, rl, 0, thick), translate([-rl * 0.6, yTop - 4, 0], cube([rl * 1.2, cy - yTop + 4, thick])));
  cuts.push(translate([0, cy, -1], cylinder({ r: holeD / 2, h: thick + 2, $fn: 24 })));
} else if (holeD > 0) {
  const ys = shape === "tag" ? [[0, 0.36 * S]] : [[-0.25 * S, 0.42 * S], [0.25 * S, 0.42 * S]];
  ys.forEach(([x, y]) => cuts.push(translate([x, y, -1], cylinder({ r: holeD / 2, h: thick + relief + 2, $fn: 24 }))));
}
const piece = union(...parts);
return cuts.length ? difference(piece, ...cuts) : piece;
`,
};
