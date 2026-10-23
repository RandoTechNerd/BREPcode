// A small stand with a slot that holds a photo, place card, table number or
// sign, leaning back a few degrees. A block, a wedge with a sloped front, or
// a round puck, printed the way it stands: the slot is cut down from the top,
// and leans less than 25 degrees, so its front wall barely overhangs. A set
// of place-card holders comes out as one print.

export default {
  id: "card-stand",
  category: "decor",
  title: "Card stand",
  summary: "a slotted stand for a photo, place card, table number or small sign.",
  print: "upright as shown, no supports.",
  names: ["card stand", "photo card stand", "card display stand", "slotted card stand", "card holder stand",
    "stand for a card", "display card stand"],
  nouns: ["stand", "holder"],
  keywords: ["card", "photo", "picture", "table", "wedding", "display", "sign", "number", "postcard"],
  fits: ["card"],
  fromSpec: (s) => ({ slotW: s.dims.t + 0.8, length: Math.min(250, Math.max(30, s.dims.w * 0.55)), slotDepth: Math.min(30, Math.max(8, s.dims.h * 0.12)) }),
  specNote: "the slot is 0.8 mm wider than the card",
  tips: ["a set of 8 stands", "for 3 mm acrylic", "leaning back 15 degrees", "round"],
  examples: ["I want a card stand", "make me a photo stand for a 4x6 photo",
    "8 place card holders", "table number holder for a wedding", "a sign holder for 3mm acrylic"],
  params: {
    length: { default: 60, min: 20, max: 250, unit: "mm", label: "length", say: ["long", "length", "wide", "width"], more: ["longer", "wider"], less: ["shorter"] },
    depth: { default: 25, min: 12, max: 80, unit: "mm", label: "depth", say: ["deep", "depth"], more: ["deeper"] },
    height: { default: 16, min: 6, max: 60, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["lower"] },
    slotW: { default: 1.2, min: 0.4, max: 6, unit: "mm", label: "slot width (card thickness plus room)", say: ["slot", "card", "thick", "thickness"] },
    slotDepth: { default: 10, min: 4, max: 50, unit: "mm", label: "how deep the card sits", say: ["sit", "grip"] },
    lean: { default: 10, min: 0, max: 25, unit: "deg", label: "lean back", say: ["lean", "angle", "tilt", "degree"] },
    shape: { default: "block", unit: "choice", choices: ["block", "wedge", "round"], label: "shape",
      words: { wedge: ["wedge", "sloped", "slanted"], round: ["round", "circle", "puck", "disc"], block: ["block", "square", "rectangle"] } },
    count: { default: 1, min: 1, max: 12, unit: "count", label: "how many", say: ["holder", "stand", "card", "piece", "set"] },
  },
  things: [
    { names: ["photo stand", "photo holder", "picture stand", "photo display stand", "photo print stand", "photo base"], title: "Photo stand",
      spec: "card-photo-4x6", params: { height: 16, depth: 28, lean: 12 } },
    { names: ["place card holder", "place card holders", "place card stand", "name card holder", "escort card holder", "seating card holder"],
      title: "Place card holder", spec: "card-place", params: { length: 30, depth: 18, height: 12, count: 4, slotDepth: 8 } },
    { names: ["table number holder", "table number stand", "table sign holder", "wedding table number holder"], title: "Table number holder",
      params: { length: 80, depth: 35, height: 24, slotDepth: 16, lean: 5, slotW: 1.6, shape: "wedge" } },
    { names: ["postcard stand", "postcard holder", "greeting card stand", "art card stand"], title: "Postcard stand", spec: "card-postcard",
      params: { depth: 30, height: 18 } },
    { names: ["polaroid stand", "polaroid holder", "instax stand", "instax photo stand"], title: "Polaroid stand", spec: "card-instax-mini",
      params: { shape: "round", depth: 30, height: 14 } },
    { names: ["menu holder", "menu stand", "sign holder", "acrylic sign holder", "sign stand"], title: "Sign holder", spec: "card-acrylic-3mm",
      params: { length: 100, depth: 35, height: 22, slotDepth: 15, lean: 8, shape: "wedge" } },
    { names: ["recipe card stand", "note card stand", "index card stand"], title: "Index card stand", spec: "card-index", params: { depth: 30, height: 18, lean: 15 } },
  ],
  body: `
// x along the stand, y front to back, z up; the slot runs along x
const ys = depth * 0.55;                             // where the slot comes out of the top
const sd = Math.min(slotDepth, height - 2);
let block;
if (shape === "round") {
  block = cylinder({ r: Math.max(length, depth) / 2, h: height, $fn: 72 });
} else {
  // side outline in (y, z), stood up and stretched along x
  const side = shape === "wedge"
    ? [[0, 0], [depth, 0], [depth, height], [ys + 2, height], [0, height * 0.45]]
    : [[0, 0], [depth, 0], [depth, height], [0, height]];
  block = translate([-length / 2, -depth / 2, 0], rotate([90, 90, 0], linearExtrude({ h: length }, polygon(side))));
}
const L = shape === "round" ? Math.max(length, depth) + 2 : length + 2;
// the slot: a thin box leaning back by 'lean', its top well above the stand
const groove = translate([0, ys - depth / 2, height], rotate([-lean, 0, 0],
  translate([-L / 2, -slotW / 2, -sd], cube([L, slotW, sd + 20]))));
const one = () => difference(block, groove);
const D = shape === "round" ? Math.max(length, depth) : depth;
const W = shape === "round" ? D : length;
const cols = Math.min(count, Math.max(1, Math.floor(230 / (W + 6))));
const pieces = Array.from({ length: count }, (_, i) => translate([(i % cols) * (W + 6), Math.floor(i / cols) * (D + 6), 0], one()));
return pieces.length > 1 ? group(...pieces) : pieces[0];
`,
};
