// A draining soap dish: a rounded tray with raised ribs the bar sits on and
// drain slots through the floor between them, so the soap dries instead of
// sitting in a puddle. A drip tray with its own low supports prints beside
// it; the dish sits in the tray on those supports and the water collects
// underneath. The walls lean out a few degrees, well inside what prints
// without support, and every cut is vertical.

export default {
  id: "soap-dish",
  category: "bathroom",
  title: "Soap dish",
  summary: "a draining soap dish with raised ribs and drain slots, with an optional drip tray it sits in.",
  print: "upright as shown, dish and drip tray side by side, no supports. PETG takes hot water and soap better than PLA.",
  names: ["soap dish", "draining soap dish", "soap saver", "bar soap holder", "soap holder", "soap tray",
    "soap dish with drain", "self draining soap dish", "soap dish with tray", "soap bar holder"],
  nouns: ["dish", "tray", "saver"],
  keywords: ["soap", "bar", "drain", "draining", "shower", "sink", "bathroom", "sponge"],
  triple: ["width", "depth", "height"],
  fits: ["soap"],
  fromSpec(s) {
    const w = s.dims.w + 20, d = s.dims.d + 20;
    return Math.abs(w - d) < 6 ? { width: w, depth: d, cornerR: d / 2 } : { width: w, depth: d };
  },
  specNote: "the dish leaves 10 mm all round it",
  tips: ["no drip tray", "round", "130 x 90 x 25", "more ribs"],
  examples: ["I want a soap dish", "make me a draining soap dish with a drip tray",
    "soap saver 100 x 70 without a tray", "a holder for bar soap"],
  params: {
    width: { default: 110, min: 50, max: 200, unit: "mm", label: "outside width at the base", say: ["wide", "width", "long", "length"], more: ["wider", "longer", "bigger"], less: ["narrower", "smaller"] },
    depth: { default: 80, min: 40, max: 160, unit: "mm", label: "outside depth at the base", say: ["deep", "depth"], more: ["deeper"] },
    height: { default: 20, min: 8, max: 50, unit: "mm", label: "dish height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower", "flatter"] },
    cornerR: { default: 16, min: 3, max: 80, unit: "mm", label: "corner radius (half the depth = round ends)", say: ["corner", "round"] },
    wall: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "floor thickness", say: ["floor"] },
    ribs: { default: 7, min: 0, max: 20, unit: "count", label: "ribs the soap sits on", say: ["rib", "ridge", "bar"] },
    ribH: { default: 3, min: 1, max: 8, unit: "mm", label: "rib height", say: ["rib", "ridge"] },
    drainW: { default: 3, min: 0, max: 6, unit: "mm", label: "drain slot width (0 = none)", say: ["drain", "slot"] },
    tray: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "drip tray beside it",
      words: { no: ["no tray", "without tray", "without a tray", "no drip tray", "without a drip tray", "no saucer", "dish only"], yes: ["drip tray", "with tray", "with a tray", "tray", "saucer"] } },
  },
  things: [
    { names: ["shampoo bar holder", "shampoo bar dish", "conditioner bar holder", "shampoo bar saver", "round soap dish"],
      title: "Shampoo bar holder", spec: "bath-shampoo-bar", params: { width: 90, depth: 90, cornerR: 45, height: 18, ribs: 6 } },
    { names: ["sponge holder", "kitchen sponge holder", "sink sponge tray", "sponge tray", "sponge dish", "sink sponge holder"],
      title: "Sponge holder", spec: "bath-kitchen-sponge", params: { width: 130, depth: 90, height: 22, cornerR: 12, ribs: 8, drainW: 4 } },
    { names: ["travel soap dish", "small soap dish", "guest soap dish", "hotel soap dish"],
      title: "Small soap dish", params: { width: 80, depth: 58, height: 16, cornerR: 14, ribs: 5, tray: "no" } },
    { names: ["large soap dish", "big soap dish", "double soap dish", "family soap dish"],
      title: "Large soap dish", params: { width: 160, depth: 90, height: 22, cornerR: 18, ribs: 11 } },
    { names: ["oval soap dish", "pebble soap dish"], title: "Oval soap dish",
      params: { width: 115, depth: 78, cornerR: 39, height: 18, ribs: 7 } },
    { names: ["shower soap dish", "shower soap holder", "shower soap saver"], title: "Shower soap dish",
      params: { width: 110, depth: 75, height: 22, tray: "no", drainW: 4 } },
    { names: ["dish brush holder", "scrub brush holder", "dish brush tray"], title: "Scrub brush tray",
      params: { width: 130, depth: 70, height: 20, cornerR: 12, ribs: 9 } },
  ],
  body: `
const k = Math.tan(8.5 * Math.PI / 180);             // the walls lean out 8.5 degrees
const rr = Math.max(wall + 1, Math.min(cornerR, width / 2, depth / 2));
// a rounded box from half-sizes; the corner centres stay put as r changes, so offsets stay concentric
const rbox = (hw, hd, r, z, h, grow) => hull(...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) =>
  translate([sx * Math.max(0, hw - r), sy * Math.max(0, hd - r), z], cylinder({ r1: r, r2: r + grow, h, $fn: 40 }))));
const hw = width / 2, hd = depth / 2;
const fl = Math.min(floor, height - 3);
const ihw = hw - wall + fl * k, ihd = hd - wall + fl * k, ir = rr - wall + fl * k;
const dishBody = difference(
  rbox(hw, hd, rr, 0, height, height * k),
  rbox(ihw, ihd, ir, fl, height - fl + 1, (height - fl + 1) * k),
);

// ribs across the floor, clipped to the inside so they run right into the walls
const rh = Math.min(ribH, height - fl - 1);
const pitch = 2 * ihw / (ribs + 1);
const ribT = Math.max(1.6, Math.min(3, pitch * 0.3));
const parts = [dishBody];
if (ribs > 0) {
  const bar = (x) => translate([x, hd + 1, fl - 0.01], rotate([90, 0, 0], linearExtrude({ h: depth + 2 },
    polygon([[-ribT / 2, 0], [ribT / 2, 0], [ribT / 4, rh + 0.01], [-ribT / 4, rh + 0.01]]))));
  const bars = Array.from({ length: ribs }, (_, i) => bar(-ihw + (i + 1) * pitch));
  parts.push(intersection(union(...bars), rbox(ihw + 0.4, ihd + 0.4, ir + 0.4, fl - 0.02, rh + 0.03, rh * k)));
}
let dish = union(...parts);

// drain slots between the ribs, stopping 3 mm short of the walls
const sw = Math.min(drainW, pitch - ribT - 1);
if (sw >= 1) {
  const m = 3;
  const slotBars = Array.from({ length: ribs + 1 }, (_, j) => translate([-ihw + (j + 0.5) * pitch - sw / 2, -hd, -1], cube([sw, depth, fl + 2])));
  dish = difference(dish, intersection(union(...slotBars), rbox(ihw - m, ihd - m, Math.max(0.5, ir - m), -1.5, fl + 3, 0)));
}
if (tray !== "yes") return dish;

// the drip tray: the dish sits inside it on three low supports
const c = 2 + height * k * 0.4;                      // room round the dish, which leans out as it rises
const tw = Math.max(2, wall * 0.8), tf = Math.max(2, floor * 0.8), sup = Math.max(2.5, ribH * 0.6);
const tH = Math.max(8, Math.min(14, height * 0.6));
const thw = hw + c + tw, thd = hd + c + tw, tr = rr + c + tw;
const nS = Math.max(2, Math.round(depth / 28));
const supports = intersection(
  union(...Array.from({ length: nS }, (_, i) => translate([-thw, -thd + (i + 0.5) * 2 * thd / nS - 1.5, tf - 0.01], cube([2 * thw, 3, sup + 0.01])))),
  rbox(thw - tw + 0.3, thd - tw + 0.3, tr - tw + 0.3, tf - 0.02, sup + 0.03, 0),
);
const trayPart = union(difference(rbox(thw, thd, tr, 0, tH, 0), rbox(thw - tw, thd - tw, tr - tw, tf, tH, 0)), supports);
return group(dish, translate([0, hd + height * k + 10 + thd, 0], trayPart));
`,
};
