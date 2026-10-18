// A small wall shelf with its brackets built in, hung on keyhole slots so the
// screws go in first and the shelf drops onto them.
//
// Printed lying on its back plate: the shelf board and the gussets then stand
// straight up off the bed, and each gusset narrows toward the board as it
// rises, so no layer overhangs the one below. The keyholes open on the bed
// side, which is the side that faces the wall.

export default {
  id: "wall-shelf",
  category: "wall",
  title: "Wall shelf",
  summary: "a small shelf with built-in brackets that hangs on two keyhole slots.",
  print: "lying on its back plate as shown, no supports.",
  names: ["shelf", "wall shelf", "small shelf", "floating shelf", "hanging shelf", "mini shelf", "ledge shelf", "display shelf"],
  nouns: ["shelf", "ledge"],
  keywords: ["wall", "display", "small", "mini"],
  tips: ["300 mm long", "150 mm deep", "with a 15 mm lip"],
  examples: ["I want a shelf", "make me a small wall shelf 250mm long and 120mm deep",
    "a floating shelf with a lip", "a little shelf for my router"],
  params: {
    length: { default: 200, min: 60, max: 300, unit: "mm", label: "shelf length", say: ["long", "length", "wide", "width"], more: ["longer", "wider"], less: ["shorter", "narrower"] },
    depth: { default: 100, min: 40, max: 220, unit: "mm", label: "how far it sticks out", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    shelfT: { default: 5, min: 3, max: 10, unit: "mm", label: "shelf board thickness", say: ["board"] },
    backH: { default: 60, min: 30, max: 160, unit: "mm", label: "back plate height", say: ["tall", "high", "height", "back"], more: ["taller"], less: ["lower"] },
    plateT: { default: 4, min: 3, max: 8, unit: "mm", label: "back plate thickness", say: ["thick", "thickness"] },
    lipH: { default: 0, min: 0, max: 30, unit: "mm", label: "front lip height (0 = none)", say: ["lip", "rail", "edge"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw shank diameter", say: ["screw"] },
  },
  things: [
    { names: ["spice shelf", "spice rack shelf"], title: "Spice shelf", params: { length: 250, depth: 70, lipH: 15 } },
    { names: ["router shelf", "modem shelf", "wifi router shelf"], title: "Router shelf", params: { length: 260, depth: 160, backH: 80 } },
    { names: ["speaker shelf", "smart speaker shelf", "echo shelf", "alexa shelf"], title: "Speaker shelf", params: { length: 140, depth: 120 } },
    { names: ["plant shelf", "succulent shelf"], title: "Plant shelf", params: { length: 220, depth: 110, lipH: 10 } },
    { names: ["figure shelf", "collectible shelf", "funko shelf", "lego shelf"], title: "Display shelf", params: { length: 240, depth: 90, lipH: 6 } },
    { names: ["phone shelf", "charging shelf", "outlet shelf"], title: "Charging shelf", params: { length: 120, depth: 90, lipH: 8 } },
    { names: ["picture ledge", "photo ledge", "picture shelf", "art ledge", "picture rail shelf"], title: "Picture ledge",
      params: { length: 280, depth: 50, lipH: 12, backH: 40 } },
    { names: ["candle shelf", "candle ledge"], title: "Candle shelf", params: { length: 160, depth: 100, lipH: 6 } },
    { names: ["security camera shelf", "camera shelf", "baby monitor shelf"], title: "Camera shelf", params: { length: 110, depth: 90, backH: 70 } },
    { names: ["book ledge", "kids book ledge", "book display ledge", "bookshelf ledge"], title: "Book ledge",
      params: { length: 280, depth: 80, lipH: 25, backH: 50 } },
  ],
  body: `
// print orientation: x along the shelf, y up the wall, z out from the wall
const gT = Math.max(4, plateT);                     // gusset thickness
const shelfY = backH - shelfT;                      // underside of the shelf board
const gD = depth * 0.8;                             // how far out the gussets reach
const gH = Math.min(shelfY - 3, gD * 0.9);          // and how far down the wall
const gN = Math.max(2, Math.ceil(length / 150) + 1);
// a triangle drawn in (y, z) and stood up at x
// rotate([90, 90, 0]) sends the profile's x to y, its y to z, and the extrusion to +x
const inYZ = (pts, x, w) => translate([x, 0, 0], rotate([90, 90, 0], linearExtrude({ h: w }, polygon(pts))));
const gussets = Array.from({ length: gN }, (_, i) =>
  inYZ([[shelfY + 0.01, plateT - 0.01], [shelfY + 0.01, gD], [shelfY - gH, plateT - 0.01]], i * (length - gT) / (gN - 1), gT));
const parts = [
  cube([length, backH, plateT]),                    // back plate
  translate([0, shelfY, 0], cube([length, shelfT, depth])),
  ...gussets,
];
if (lipH > 0) {
  // a 45 degree lip, so it prints standing without a ledge
  parts.push(inYZ([[backH - 0.01, depth - 3 - lipH], [backH + lipH, depth - 3], [backH + lipH, depth], [backH - 0.01, depth]], 0, length));
}

// keyholes: the head goes in the round end, then the shelf drops so the
// shank rides up the slot with the head trapped in the recess behind it
const head = screwD * 2;
const keyY = Math.max(head, shelfY - gH - head * 1.5);
const keyX = [length * 0.2, length * 0.8];
const keys = keyX.flatMap((x) => [
  translate([x, keyY, -1], cylinder({ d: head, h: plateT + 2, $fn: 32 })),
  translate([x - screwD / 2, keyY, -1], cube([screwD, head, plateT + 2])),
  translate([x - head / 2, keyY, -1], cube([head, head, plateT - 1.6 + 1])),
]);
return translate([-length / 2, -backH / 2, 0], difference(union(...parts), ...keys));
`,
};
