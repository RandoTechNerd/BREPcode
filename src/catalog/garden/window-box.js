// A long, rounded trough planter: a window box, a herb trough, a balcony
// planter. The outside is a hull of rounded corners, a little wider at the
// top than the foot (every wall leans out less than 45 degrees), and the
// inside is the same shape a wall thickness smaller, with drain holes in a
// row down the middle.

export default {
  id: "window-box",
  category: "garden",
  title: "Window box planter",
  summary: "a long rounded trough planter with drain holes, for a windowsill, balcony or herb garden.",
  print: "upright as shown, no supports. PETG or ASA outdoors.",
  names: ["window box", "window box planter", "trough planter", "rectangular planter", "long planter",
    "planter box", "flower box", "window planter", "windowsill planter", "rectangle planter"],
  nouns: ["planter", "box", "trough"],
  keywords: ["window", "windowsill", "sill", "balcony", "herb", "flower", "long", "rectangular"],
  triple: ["length", "depth", "height"],
  primary: "length",
  tips: ["240 x 100 x 90", "4 drain holes", "shallower"],
  examples: ["I want a window box", "make me a trough planter 240 x 100 x 90",
    "a long planter for my windowsill", "rectangular planter 200mm long with 4 drain holes"],
  params: {
    length: { default: 220, min: 80, max: 250, unit: "mm", label: "length", say: ["long", "length", "wide"], more: ["longer"], less: ["shorter"] },
    depth: { default: 90, min: 50, max: 200, unit: "mm", label: "front to back", say: ["deep", "depth", "front"], more: ["deeper"], less: ["slimmer"] },
    height: { default: 80, min: 30, max: 200, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["shallower", "lower"] },
    taper: { default: 6, min: 0, max: 20, unit: "mm", label: "how much wider the top is, each side", say: ["taper", "flare"] },
    wall: { default: 2.4, min: 1.2, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    cornerR: { default: 10, min: 2, max: 40, unit: "mm", label: "corner radius", say: ["corner", "round"] },
    drains: { default: 3, min: 0, max: 8, unit: "count", label: "drain holes", say: ["drain", "hole"] },
    drainD: { default: 8, min: 3, max: 15, unit: "mm", label: "drain hole diameter", say: ["drainage"] },
  },
  things: [
    { names: ["herb trough", "herb planter box", "kitchen herb trough"], title: "Herb trough", params: { length: 240, depth: 100, height: 100 } },
    { names: ["balcony planter", "balcony box", "railing planter box"], title: "Balcony planter", params: { length: 250, depth: 130, height: 120, wall: 2.8, drains: 4 } },
    { names: ["microgreens tray", "microgreen tray", "sprouting tray", "wheatgrass tray"], title: "Microgreens tray",
      params: { length: 220, depth: 150, height: 35, taper: 3, cornerR: 8, drains: 8, drainD: 4 } },
    { names: ["succulent trough", "long succulent planter", "shallow trough"], title: "Succulent trough", params: { length: 220, depth: 80, height: 50, drains: 3, drainD: 6 } },
    { names: ["cat grass planter", "cat grass tray"], title: "Cat grass planter", params: { length: 160, depth: 80, height: 70, cornerR: 14 } },
    { names: ["strawberry planter", "lettuce trough"], title: "Strawberry planter", params: { length: 250, depth: 160, height: 140, wall: 2.8, drains: 4 } },
    { names: ["windowsill herb garden", "mini window box"], title: "Mini window box", params: { length: 150, depth: 70, height: 65, cornerR: 8, drains: 2 } },
  ],
  body: `
const t = Math.min(taper, depth / 2 - 6, length / 2 - 6);
const rr = Math.max(1, Math.min(cornerR, depth / 2 - t - 2, length / 2 - t - 2));
// four corner discs of a w x d rounded rectangle, standing at z
const corners = (w, d, r, z) => [[r, r], [w - r, r], [r, d - r], [w - r, d - r]].map(([x, y]) =>
  translate([x - w / 2, y - d / 2, z], cylinder({ r, h: 0.5, $fn: 32 })));
// a rounded box, inset by t at its foot, from z0 up to z1
const flared = (w, d, r, z0, z1) => hull(...corners(w - 2 * t, d - 2 * t, r, z0), ...corners(w, d, r, z1 - 0.5));
const outer = flared(length, depth, rr, 0, height);
const fl = Math.max(2, wall);
const inner = flared(length - 2 * wall, depth - 2 * wall, Math.max(0.6, rr - wall), fl, height + 1);
const holes = Array.from({ length: drains }, (_, i) =>
  translate([(i - (drains - 1) / 2) * (length - 2 * t - 4 * wall - drainD) / Math.max(1, drains), 0, -1], cylinder({ r: drainD / 2, h: fl + 2, $fn: 24 })));
return difference(outer, inner, ...holes);
`,
};
