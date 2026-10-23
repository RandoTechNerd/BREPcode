// A plug that sits in a car's cup holder and holds something of a different
// size: a cup above it for a bottle too wide for the holder (an expander), a
// snug bore for a can that rattles in it (a reducer), a divided tray for
// coins and keys, or a tall bin with a drop-through lid for rubbish. The plug
// tapers like the holders do. An expander widens through a cone no flatter
// than 45 degrees, and the cup floor sits where the cone is already as wide
// as the bore, so nothing overhangs.

export default {
  id: "cup-holder-adapter",
  category: "vehicle",
  title: "Cup holder adapter",
  summary: "a plug for a car cup holder that holds a bottle too wide for it, a can that rattles in it, or a divided tray.",
  print: "upright as shown, no supports (the lid prints upside down beside it). PETG: PLA softens in a hot car.",
  names: ["cup holder adapter", "cup holder expander", "car cup holder adapter", "cup holder insert", "cup holder extender",
    "bottle cup holder adapter", "big bottle cup holder", "cup holder adaptor", "car cup holder insert", "cup holder converter"],
  nouns: ["adapter", "insert", "expander", "extender"],
  keywords: ["car", "cup", "holder", "bottle", "truck", "drink", "flask", "tumbler"],
  fits: ["round"],
  primary: "itemD",
  fromSpec: (s) => ({ itemD: s.dims.d }),
  specNote: "the cup allows a millimetre all round",
  ask: {
    unless: ["itemD", "holderD"],
    text: "What goes in it, and how wide is your car's cup holder at the top? Holders run from about 66 to 100 mm, so measure yours; I used 78 mm and a 90 mm bottle.",
  },
  tips: ["for a Nalgene", "car holder 72 mm", "3 compartments", "with a lid"],
  examples: ["I want a cup holder adapter", "make me a cup holder expander for my hydro flask 32 oz",
    "car cup holder insert for a soda can", "cup holder adapter for a 95mm bottle"],
  params: {
    itemD: { default: 90, min: 20, max: 120, unit: "mm", label: "what it holds: its diameter", say: ["bottle", "cup", "can", "drink", "tumbler", "flask"], more: ["bigger", "wider"], less: ["smaller"] },
    holderD: { default: 78, min: 60, max: 100, unit: "mm", label: "the car's cup holder, across the top", say: ["car"] },
    taper: { default: 1.5, min: 0, max: 4, unit: "deg", label: "plug taper (holders narrow toward the bottom)", say: ["taper", "degree"] },
    plugH: { default: 50, min: 20, max: 90, unit: "mm", label: "how deep it goes into the holder", say: ["plug", "deep", "depth"] },
    cupH: { default: 40, min: 5, max: 150, unit: "mm", label: "cup height above the holder", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    fit: { default: 1, min: 0.2, max: 3, unit: "mm", label: "room around what it holds", say: ["fit", "clearance", "room"] },
    wall: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    dividers: { default: 0, min: 0, max: 4, unit: "count", label: "compartments (0 = one open cup)", say: ["compartment", "divider", "section"] },
    lid: { default: "no", unit: "choice", choices: ["no", "yes"], label: "a press-on lid with a drop hole",
      words: { no: ["no lid", "without lid", "without a lid", "open top"], yes: ["with lid", "with a lid", "lid", "cover"] } },
    lidHole: { default: 40, min: 10, max: 80, unit: "mm", label: "lid drop hole", say: ["hole", "opening"] },
  },
  things: [
    { names: ["hydro flask cup holder adapter", "hydroflask cup holder adapter"], title: "Hydro Flask cup holder adapter", spec: "hydro-flask-32" },
    { names: ["nalgene cup holder adapter", "nalgene car adapter"], title: "Nalgene cup holder adapter", spec: "nalgene-32" },
    { names: ["yeti cup holder adapter", "yeti bottle cup holder"], title: "Yeti cup holder adapter", spec: "yeti-rambler-26" },
    { names: ["cup holder reducer", "cup holder spacer", "cup holder shim", "soda cup holder insert"],
      title: "Cup holder reducer", spec: "soda-can", params: { plugH: 55, cupH: 10 } },
    { names: ["cup holder organizer", "cup holder storage", "cup holder caddy", "car cup holder tray", "cup holder tray"],
      title: "Cup holder organizer", params: { itemD: 68, plugH: 50, cupH: 15, dividers: 3 } },
    { names: ["car trash can", "cup holder trash can", "car trash bin", "car garbage can", "cup holder bin", "car rubbish bin", "car trash container"],
      title: "Car trash can", params: { itemD: 68, plugH: 55, cupH: 90, lid: "yes", lidHole: 42 } },
    { names: ["cup holder phone holder", "cup holder phone stand"], title: "Cup holder phone holder", params: { itemD: 40, plugH: 50, cupH: 30, fit: 0.5 } },
  ],
  body: `
const t = Math.tan(taper * Math.PI / 180);
const rp = holderD / 2 - 0.5;                    // the plug at the holder's rim
const rb = rp - plugH * t;                       // and at its foot
const ri = itemD / 2 + fit;                      // the bore
const rc = ri + wall;                            // the cup's outside
// the outside is one turned profile: stacking a cone on a cylinder of the
// same radius leaves a seam some engines will not close
let outside, zb, top;
if (rc <= rp) {
  // a reducer: one tapered plug, the bore sunk into it
  top = plugH + cupH;
  outside = [[0, 0], [rb, 0], [rp, plugH], [rp, top], [0, top]];
  // where the plug is too thin round the bore, start the bore higher
  zb = ri + 1.2 > rb ? Math.max(2, (ri + 1.2 - rb) / Math.max(t, 1e-3)) : 2;   // a 2 mm floor at least
} else {
  // an expander: plug, a cone out to the cup, the cup
  const coneH = (rc - rp) * 1.1;
  top = plugH + coneH + cupH;
  outside = [[0, 0], [rb, 0], [rp, plugH], [rc, plugH + coneH], [rc, top], [0, top]];
  zb = plugH + (ri - rp) * 1.1 + 1;              // the cone is already as wide as the bore here
}
zb = Math.min(zb, top - 3);
let cup = difference(revolve({ angle: 360, $fn: 96 }, polygon(outside)),
  revolve({ angle: 360, $fn: 96 }, polygon([[0, zb], [ri, zb], [ri, top + 1], [0, top + 1]])));
if (dividers >= 2) {
  const divT = 1.6, divH = top - zb - 2;
  const walls = dividers === 2
    ? [translate([-ri - 0.5, -divT / 2, zb - 0.1], cube([2 * ri + 1, divT, divH]))]
    : Array.from({ length: dividers }, (_, i) => rotate([0, 0, i * 360 / dividers + 90], translate([-divT / 2, 0, zb - 0.1], cube([divT, ri + 0.5, divH]))));
  if (dividers > 2) walls.push(translate([0, 0, zb - 0.1], cylinder({ r: divT, h: divH, $fn: 16 })));
  cup = union(cup, ...walls);
}
if (lid !== "yes") return cup;
// the lid prints upside down: a disc with a ring that pushes into the bore
const R = Math.max(rc, rp);
const cap = difference(
  union(cylinder({ r: R, h: 2, $fn: 96 }), translate([0, 0, 1.9], cylinder({ r: ri - 0.3, h: 5, $fn: 96 }))),
  translate([0, 0, 1.5], cylinder({ r: ri - 1.9, h: 6, $fn: 96 })),
  translate([0, 0, -1], cylinder({ r: Math.min(lidHole / 2, ri - 3), h: 4, $fn: 64 })),
);
return group(cup, translate([2 * R + 8, 0, 0], cap));
`,
};
