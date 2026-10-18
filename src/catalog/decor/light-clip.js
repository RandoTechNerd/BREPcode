// A clip for hanging Christmas or string lights outside: a hook that slips
// over a gutter's edge (or a flat tab that slides under a shingle, or a U
// over a fence board) with a snap-in C below for the light wire. One flat
// profile printed on its side, so the C springs along its layers.

export default {
  id: "light-clip",
  category: "decor",
  title: "Light clip",
  summary: "a gutter, shingle or fence clip that holds a string of holiday lights.",
  print: "on its side as shown, no supports. PETG or ASA outdoors; print a bag of them.",
  names: ["christmas light clip", "light clip", "holiday light clip", "christmas light hook", "outdoor light clip",
    "light hanging clip", "string light clip", "christmas light hanger"],
  nouns: ["clip", "hook", "hanger"],
  keywords: ["christmas", "holiday", "light", "lights", "gutter", "outdoor", "string", "roof", "shingle", "fence"],
  tips: ["for shingles", "for a 6 mm wire", "fence board 20 mm"],
  examples: ["I want christmas light clips", "make me a gutter clip for christmas lights",
    "shingle light clip", "string light clip for a 20mm fence board"],
  params: {
    mount: { default: "gutter", unit: "choice", choices: ["gutter", "shingle", "fence"], label: "what it clips on",
      words: { shingle: ["shingle", "shingles", "roof"], fence: ["fence", "railing", "board", "rail"], gutter: ["gutter", "eaves", "eave"] } },
    edgeT: { default: 3, min: 1, max: 40, unit: "mm", label: "thickness of the edge it goes over", say: ["edge", "board", "gutter", "fence", "railing"] },
    depth: { default: 15, min: 6, max: 50, unit: "mm", label: "how far it reaches down over the edge", say: ["deep", "depth", "down"] },
    wireD: { default: 5, min: 2, max: 14, unit: "mm", label: "light wire diameter", say: ["wire", "cable", "cord", "light"] },
    width: { default: 10, min: 6, max: 25, unit: "mm", label: "clip width", say: ["wide", "width"] },
    thick: { default: 2, min: 1.4, max: 4, unit: "mm", label: "clip thickness", say: ["thick", "thickness", "strong"], more: ["stronger", "stiffer"] },
  },
  things: [
    { names: ["gutter light clip", "gutter clip", "gutter hook for lights", "gutter clip for christmas lights", "gutter light hook"], title: "Gutter light clip" },
    { names: ["shingle light clip", "shingle clip", "roof light clip", "shingle tab clip"], title: "Shingle light clip", params: { mount: "shingle" } },
    { names: ["fence light clip", "railing light clip", "deck railing light clip", "fence board clip"], title: "Fence light clip",
      params: { mount: "fence", edgeT: 20, depth: 20 } },
    { names: ["icicle light clip", "c9 light clip", "c7 light clip", "big bulb light clip"], title: "Icicle light clip", params: { wireD: 7, width: 12 } },
    { names: ["fairy light clip", "led strip light clip", "mini light clip"], title: "Fairy light clip", params: { wireD: 3, width: 8, thick: 1.6 } },
  ],
  body: `
// side profile, printed lying on it: the edge it grips is x = 0 to edgeT,
// its top at y = 0; the wire clip hangs on the outside (negative x)
const T = thick;
const c = T * 0.15;                                  // a little room over the edge
const E = mount === "shingle" ? 1.5 : edgeT;
const parts = [];
if (mount === "shingle") {
  // a flat tab that slides up under a shingle, with a stop at its end
  parts.push(polygon([[-T, -T], [32, -T], [32, 0], [3, 0], [3, 1.5], [0, 1.5], [0, 0], [-T, 0]]));
} else {
  // an inverted U: a short leg inside, the outside leg down to the clip
  parts.push(polygon([[-T, T], [E + c + T, T], [E + c + T, -depth * 0.6], [E + c, -depth * 0.6], [E + c, 0], [0, 0], [0, -depth], [-T, -depth]]));
}
// the C for the wire: a ring with its mouth facing away from the edge
const rw = wireD / 2 + 0.2;
const yTop = mount === "shingle" ? -T : -depth;
const cx = -T - rw, cy = yTop - rw - T * 0.5;
const mouth = Math.asin(Math.min(0.9, 0.38 * wireD / rw));   // the opening is about 3/4 of the wire
const N = Math.max(24, Math.round(rw * 8));
const a0 = Math.PI + mouth, a1 = 3 * Math.PI - mouth;       // round from just past the mouth back to it
parts.push(polygon([
  ...Array.from({ length: N + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / N; return [cx + (rw + T) * Math.cos(a), cy + (rw + T) * Math.sin(a)]; }),
  ...Array.from({ length: N + 1 }, (_, i) => { const a = a1 - (a1 - a0) * i / N; return [cx + rw * Math.cos(a), cy + rw * Math.sin(a)]; }),
]));
// a neck joining the C to the leg (it stays clear of the C's hole)
parts.push(polygon([[-T, cy], [0, cy], [0, yTop + 0.5], [-T, yTop + 0.5]]));
return union(...parts.map((p) => linearExtrude({ h: width }, p)));
`,
};
