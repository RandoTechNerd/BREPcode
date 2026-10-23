// A rail with a row of pegs: keys, coats, caps, necklaces, belts. Printed
// lying on its back with the pegs standing up. Each peg flares into the rail
// at its root and ends in a round tip no wider than the shaft, and leans
// toward the top of the wall by a few degrees, so what hangs on it stays on
// without a knob that would overhang. The mounting holes sit outside the row
// of pegs, where a screwdriver can reach them.

export default {
  id: "key-rack",
  category: "wall",
  title: "Key rack",
  summary: "a wall rail with a row of pegs for keys, coats, caps or necklaces.",
  print: "lying on its back as shown, pegs up, no supports. PETG for coats.",
  names: ["key rack", "key holder", "key hanger", "wall key holder", "key hook rack", "key rail",
    "peg rail", "peg rack", "hook rack", "wall peg rack", "key organizer"],
  nouns: ["rack", "rail", "holder", "hanger"],
  keywords: ["key", "keys", "peg", "entryway", "hallway", "wall", "hang"],
  fits: ["adhesive"],
  fromSpec: () => ({ mount: "adhesive" }),
  specNote: "the back is flat for adhesive strips; use two or more",
  triple: ["length", "boardH", "pegL"],
  tips: ["6 pegs", "250 mm long", "keyhole slots", "tilt 25 degrees"],
  examples: ["I want a key holder", "make me a key rack with 5 hooks", "a peg rail 250mm long with 6 pegs",
    "key hanger for the entryway with keyholes"],
  params: {
    length: { default: 180, min: 60, max: 250, unit: "mm", label: "rail length", say: ["long", "length", "wide", "width"], more: ["longer", "wider"], less: ["shorter", "narrower"] },
    boardH: { default: 60, min: 30, max: 150, unit: "mm", label: "rail height", say: ["tall", "high", "height"], more: ["taller"], less: ["lower"] },
    boardT: { default: 6, min: 4, max: 12, unit: "mm", label: "rail thickness", say: ["thick", "thickness"] },
    pegs: { default: 4, min: 1, max: 12, unit: "count", label: "pegs", say: ["peg", "hook", "key", "spot"] },
    pegD: { default: 10, min: 5, max: 20, unit: "mm", label: "peg diameter", say: ["diameter", "peg"], more: ["stronger", "thicker"], less: ["thinner"] },
    pegL: { default: 35, min: 15, max: 80, unit: "mm", label: "how far each peg sticks out", say: ["reach", "out", "deep", "depth"], more: ["deeper"], less: ["shallower"] },
    tilt: { default: 15, min: 0, max: 35, unit: "deg", label: "upward lean of the pegs", say: ["tilt", "lean", "angle", "degree"] },
    cornerR: { default: 6, min: 0.5, max: 20, unit: "mm", label: "corner radius", say: ["corner", "round"] },
    mount: { default: "screw", unit: "choice", choices: ["screw", "keyhole", "adhesive"], label: "mounting",
      words: { keyhole: ["keyhole", "keyholes", "key hole slot"], adhesive: ["adhesive", "command strip", "command", "stick on", "no drill", "no screws", "tape"], screw: ["screw", "screwed"] } },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  bridgeArea: (v) => v.mount === "keyhole" ? 2 * (2 * v.screwD) ** 2 : 0,
  things: [
    { names: ["coat rack", "wall coat rack", "coat hook rail", "jacket rack", "entryway coat rack"], title: "Coat rack",
      params: { pegs: 5, length: 250, boardH: 80, boardT: 9, pegD: 16, pegL: 60, tilt: 12 } },
    { names: ["hat rack", "cap rack", "hat holder", "cap holder", "baseball cap rack", "hat display"], title: "Hat rack",
      params: { pegs: 4, length: 240, boardH: 70, pegD: 14, pegL: 70, tilt: 25 } },
    { names: ["necklace hanger", "necklace holder", "jewelry hanger", "jewellery hanger", "bracelet hanger", "necklace rack"], title: "Necklace hanger",
      params: { pegs: 10, length: 200, boardH: 40, boardT: 5, pegD: 5, pegL: 18, tilt: 25, cornerR: 4, screwD: 3.5 } },
    { names: ["belt rack", "belt hanger", "belt holder", "tie rack", "tie hanger", "scarf rack"], title: "Belt and tie rack",
      params: { pegs: 6, length: 240, boardH: 50, pegD: 10, pegL: 45, tilt: 20 } },
    { names: ["lanyard hanger", "lanyard holder", "badge lanyard rack"], title: "Lanyard hanger",
      params: { pegs: 6, length: 220, boardH: 45, pegD: 8, pegL: 30, tilt: 20 } },
    { names: ["shaker peg rail", "shaker pegs", "shaker peg board", "wooden peg rail"], title: "Shaker peg rail",
      params: { pegs: 4, length: 250, boardH: 70, boardT: 10, pegD: 18, pegL: 70, tilt: 6, cornerR: 2 } },
    { names: ["adhesive key holder", "stick on key holder", "no drill key holder", "adhesive key rack"], title: "Stick-on key holder",
      spec: "command-medium", params: { pegs: 3, length: 120, boardH: 45 } },
    { names: ["keychain rack", "keychain holder", "keyring holder"], title: "Keychain rack",
      params: { pegs: 6, length: 200, pegD: 7, pegL: 28, tilt: 20 } },
  ],
  body: `
// print orientation: x along the rail, y up the wall, z out from it
const r = pegD / 2;
const flare = Math.min(4, r);
const lean = tilt * Math.PI / 180;
const holed = mount !== "adhesive";
// leave room at each end for a screw head clear of the first peg
const m = holed ? Math.max(length / (2 * pegs), 2 * (screwD + r + flare + 1)) : length / (2 * pegs);
const xs = pegs === 1 ? [length / 2] : Array.from({ length: pegs }, (_, i) => m + (length - 2 * m) * i / (pegs - 1));
const pegY = Math.max(r + flare + 2, boardH * 0.38);
// sink each peg deep enough that its leaning root never lifts off the rail
const embed = 0.5 + (r + flare) * Math.sin(lean);
const len = pegL + embed;
const peg = union(
  cylinder({ r1: r + flare, r2: r, h: flare, $fn: 32 }),
  cylinder({ r, h: len - r, $fn: 32 }),
  translate([0, 0, len - r], sphere({ r, $fn: 32 })),
);
const cr = Math.max(0.5, Math.min(cornerR, boardH / 2 - 0.5, length / 2 - 0.5));
const board = hull(...[[cr, cr], [length - cr, cr], [cr, boardH - cr], [length - cr, boardH - cr]].map(([x, y]) =>
  translate([x, y, 0], cylinder({ r: cr, h: boardT, $fn: 32 }))));
// a leaning root can poke through the back of a thin rail: trim it flush
const railed = difference(
  union(board, ...xs.map((x) => translate([x, pegY, boardT - embed], rotate([-tilt, 0, 0], peg)))),
  translate([-1, -50, -40], cube([length + 2, boardH + 150, 40])),
);
if (!holed) return translate([-length / 2, -boardH / 2, 0], railed);

const hx = [m / 2, length - m / 2];
let cuts;
if (mount === "keyhole") {
  // the head goes in the round end, then the rail drops onto the shank
  const head = screwD * 2;
  const ky = boardH / 2 - head / 2;
  cuts = hx.flatMap((x) => [
    translate([x, ky, -1], cylinder({ d: head, h: boardT + 2, $fn: 32 })),
    translate([x - screwD / 2, ky, -1], cube([screwD, head, boardT + 2])),
    translate([x - head / 2, ky, -1], cube([head, head, boardT - 1.6 + 1])),
  ]);
} else {
  const k = Math.min(screwD / 2, boardT - 1.5);
  cuts = hx.flatMap((x) => [
    translate([x, boardH / 2, -1], cylinder({ r: screwD / 2, h: boardT + 2, $fn: 24 })),
    translate([x, boardH / 2, boardT - k + 0.02], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 })),
  ]);
}
return translate([-length / 2, -boardH / 2, 0], difference(railed, ...cuts));
`,
};
