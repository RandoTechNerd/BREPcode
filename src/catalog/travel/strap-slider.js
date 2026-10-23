// Strap hardware for flat webbing: a tri-glide slider that adjusts a strap's
// length, a single-slot keeper that tidies the loose end, a rectangle ring and
// a D-ring. Each is a flat outline with its slots cut through, so it prints
// flat in a few minutes; the slots are sized from the webbing.

export default {
  id: "strap-slider",
  category: "travel",
  title: "Strap slider",
  summary: "flat strap hardware for webbing: a tri-glide adjuster, a keeper loop, a rectangle ring or a D-ring.",
  print: "flat as shown, no supports. PETG or nylon. Not load-rated: bags and straps, not anything you hang from.",
  names: ["strap adjuster", "strap slider", "webbing slider", "webbing adjuster", "tri glide", "triglide", "tri glide slider",
    "strap hardware", "webbing hardware", "strap length adjuster"],
  nouns: ["adjuster", "slider", "keeper", "ring"],
  keywords: ["strap", "webbing", "backpack", "bag", "belt", "luggage", "camera", "lanyard"],
  fits: ["webbing"],
  fromSpec: (s) => ({ strapW: s.dims.w }),
  tips: ["for 1 inch webbing", "a keeper loop", "a D-ring", "thicker"],
  examples: ["I want a strap adjuster", "make me a tri glide for 1 inch webbing",
    "strap keeper for 25mm webbing", "a dring for 38mm straps"],
  params: {
    kind: { default: "slider", unit: "choice", choices: ["slider", "keeper", "rectangle", "dring"], label: "which piece",
      words: { keeper: ["keeper", "strap loop", "retainer"], rectangle: ["rectangle ring", "rectangular ring", "square ring"],
        dring: ["dring", "d ring", "half moon"], slider: ["slider", "tri glide", "triglide", "adjuster"] } },
    strapW: { default: 25.4, min: 10, max: 52, unit: "mm", label: "webbing width", say: ["wide", "width"] },
    strapT: { default: 2.5, min: 1, max: 5, unit: "mm", label: "webbing thickness", say: ["thick"] },
    bar: { default: 3.5, min: 2, max: 6, unit: "mm", label: "bar width", say: ["bar"], more: ["stronger"] },
    thick: { default: 3, min: 2, max: 6, unit: "mm", label: "part thickness", say: ["thickness"], more: ["thicker"] },
  },
  things: [
    { names: ["strap keeper", "strap loop", "webbing keeper", "strap retainer", "webbing loop keeper"], title: "Strap keeper", params: { kind: "keeper" } },
    { names: ["rectangle ring", "rectangular ring", "strap ring", "webbing ring"], title: "Rectangle ring", params: { kind: "rectangle", bar: 4 } },
    { names: ["dring", "d ring", "half moon ring", "semicircle ring", "webbing dring", "webbing d ring"], title: "D-ring", params: { kind: "dring", bar: 4 } },
    { names: ["backpack strap adjuster", "backpack buckle slider", "backpack strap slider"], title: "Backpack strap adjuster", spec: "webbing-25mm" },
    { names: ["luggage strap adjuster", "suitcase strap slider"], title: "Luggage strap adjuster", spec: "webbing-38mm", params: { bar: 4.5, thick: 3.5 } },
    { names: ["camera strap adjuster", "camera strap slider"], title: "Camera strap adjuster", spec: "webbing-1in" },
    { names: ["lanyard slider", "lanyard adjuster"], title: "Lanyard slider", spec: "webbing-20mm", params: { strapT: 1.5, bar: 2.5, thick: 2.4 } },
    { names: ["2 inch strap adjuster", "wide strap adjuster", "cargo strap slider"], title: "2 inch strap adjuster", spec: "webbing-2in", params: { bar: 5, thick: 4 } },
  ],
  body: `
const sw = strapW + 1;                            // slot length: the webbing plus room
const sh = strapT + 0.8;                          // slot height
const rc = Math.min(2.5, bar);                    // corner rounding
const plate = (w, d) => hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
  translate([sx * (w / 2 - rc), sy * (d / 2 - rc), 0], cylinder({ r: rc, h: thick, $fn: 24 }))));
const slotAt = (y, h) => translate([-sw / 2, y - h / 2, -1], cube([sw, h, thick + 2]));
const W = sw + 2 * bar;
if (kind === "dring") {
  // a straight bar for the webbing and a half-round loop opposite it
  const R = W / 2;
  // the straight side is the bottom edge; the round half sits on top of it
  const outer = hull(translate([-W / 2, 0, 0], cube([W, R, thick])), translate([0, R, 0], cylinder({ r: R, h: thick, $fn: 64 })));
  const inner = hull(translate([-sw / 2, bar, -1], cube([sw, R - bar, thick + 2])), translate([0, R, -1], cylinder({ r: R - bar, h: thick + 2, $fn: 64 })));
  return translate([0, -R, 0], difference(outer, inner));
}
if (kind === "slider") {
  // two slots either side of a centre bar
  const D = 2 * sh + 3 * bar;
  return difference(plate(W, D), slotAt(-(sh + bar) / 2, sh), slotAt((sh + bar) / 2, sh));
}
// a keeper has one snug slot; a rectangle ring a roomier one
const h = kind === "keeper" ? 2 * sh : Math.max(2 * sh, sw * 0.4);
return difference(plate(W, h + 2 * bar), slotAt(0, h));
`,
};
