// A rounded storage box with an optional friction-fit lid and dividers. The
// rounded outline is a hull of four corner cylinders: one cheap convex solid
// instead of filleting twelve edges. The lid prints upside down beside the
// box, its insert lip pointing up.

export default {
  id: "storage-box",
  category: "storage",
  title: "Storage box",
  summary: "a rounded box with an optional push-fit lid and dividers.",
  print: "as shown: box upright, lid upside down beside it. No supports.",
  names: ["storage box", "box with lid", "box with a lid", "lidded box", "small box", "parts box",
    "container with lid", "storage container", "organizer box", "trinket box", "storage bin"],
  nouns: ["box", "container", "bin"],
  keywords: ["storage", "lid", "organizer", "store", "divider", "compartment"],
  triple: ["width", "depth", "height"],
  tips: ["150 x 100 x 60", "3 dividers", "no lid"],
  examples: ["I want a storage box with a lid", "make me a box with lid 120 x 80 x 50",
    "small parts box with 3 dividers", "storage container 60mm tall"],
  params: {
    width: { default: 100, min: 20, max: 250, unit: "mm", label: "outside width", say: ["wide", "width", "long", "length"], more: ["wider", "longer"], less: ["narrower"] },
    depth: { default: 70, min: 20, max: 250, unit: "mm", label: "outside depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    height: { default: 50, min: 10, max: 200, unit: "mm", label: "box height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    wall: { default: 2, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    cornerR: { default: 6, min: 1, max: 20, unit: "mm", label: "corner radius", say: ["corner", "round"] },
    divX: { default: 0, min: 0, max: 8, unit: "count", label: "dividers across", say: ["divider", "compartment", "section", "slot"] },
    divY: { default: 0, min: 0, max: 8, unit: "count", label: "dividers along", say: ["row"] },
    lid: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "lid",
      words: { no: ["no lid", "without lid", "without a lid", "open top", "lidless", "tray"], yes: ["with lid", "lid", "cover"] } },
    fit: { default: 0.3, min: 0.1, max: 0.8, unit: "mm", label: "lid clearance per side", say: ["fit", "clearance", "tolerance"] },
  },
  things: [
    { names: ["jewelry box", "jewellery box", "ring box", "earring box"], title: "Jewelry box",
      params: { width: 120, depth: 80, height: 40, divX: 2, divY: 1, cornerR: 8 } },
    { names: ["pill box", "pill organizer", "weekly pill box", "pill case"], title: "Pill box",
      params: { width: 150, depth: 32, height: 24, divX: 6, cornerR: 3, wall: 1.6 } },
    { names: ["screw organizer", "parts organizer", "hardware organizer", "bead organizer"], title: "Parts organizer",
      params: { width: 160, depth: 100, height: 40, divX: 3, divY: 2 } },
    { names: ["sd card box", "memory card box"], title: "SD card box", params: { width: 70, depth: 40, height: 30, divX: 3, cornerR: 4 } },
    { names: ["tea box", "tea bag box", "tea bag organizer"], title: "Tea box", params: { width: 170, depth: 90, height: 75, divX: 2 } },
    { names: ["desk tray", "catch all tray", "valet tray", "key tray"], title: "Desk tray", params: { width: 160, depth: 100, height: 25, lid: "no", cornerR: 12 } },
  ],
  body: `
const rr = Math.max(0.6, Math.min(cornerR, width / 2 - 1, depth / 2 - 1));
// a rounded rectangle w x d, h tall, centred, standing at z
const rounded = (w, d, h, r, z = 0) => hull(...[[r, r], [w - r, r], [r, d - r], [w - r, d - r]].map(([x, y]) =>
  translate([x - w / 2, y - d / 2, z], cylinder({ r, h, $fn: 40 }))));
const floor = Math.max(1.6, wall);
const iw = width - 2 * wall, id = depth - 2 * wall;
const lipD = Math.min(4, height / 4);            // how far the lid's insert goes in
const divH = height - floor - (lid === "yes" ? lipD + 1 : 0);
const divT = Math.max(1.2, wall * 0.8);
const dividers = [
  ...Array.from({ length: divX }, (_, i) => translate([-iw / 2 + (i + 1) * iw / (divX + 1) - divT / 2, -id / 2 - 0.1, floor - 0.1], cube([divT, id + 0.2, divH + 0.1]))),
  ...Array.from({ length: divY }, (_, i) => translate([-iw / 2 - 0.1, -id / 2 + (i + 1) * id / (divY + 1) - divT / 2, floor - 0.1], cube([iw + 0.2, divT, divH + 0.1]))),
];
const tub = difference(rounded(width, depth, height, rr), rounded(iw, id, height, Math.max(0.5, rr - wall), floor));
const box = dividers.length ? union(tub, ...dividers) : tub;
if (lid !== "yes") return box;
const lw = iw - 2 * fit, ld = id - 2 * fit, lr = Math.max(0.5, rr - wall - fit);
const cap = union(
  rounded(width, depth, 2, rr),
  difference(rounded(lw, ld, lipD + 2, lr, 1.9), rounded(lw - 3.2, ld - 3.2, lipD + 3, Math.max(0.4, lr - 1.6), 1.5)),
);
return group(box, translate([width + 10, 0, 0], cap));
`,
};
