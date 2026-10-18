// A freestanding roll stand: a heavy round base and a tall post the roll's
// core drops over, for a spare toilet roll by the toilet or the kitchen roll
// on the counter. It is lathed in two pieces: a solid base disc with a
// rounded-off edge, and a hollow post (open underneath, with a pointed roof
// inside) that tapers a little toward the top. The post is limited to what
// fits a printer, so a 280 mm paper towel roll stands a little taller than it.

export default {
  id: "roll-stand",
  category: "bathroom",
  title: "Roll stand",
  summary: "a freestanding post on a weighted base for spare toilet rolls or a kitchen paper towel roll.",
  print: "upright as shown, no supports. The post is at most 250 mm tall so it fits a printer; a paper towel roll stands a little above it.",
  names: ["toilet paper stand", "toilet roll stand", "tp stand", "roll stand", "freestanding toilet paper holder",
    "standing toilet paper holder", "free standing toilet paper holder", "toilet paper holder stand", "floor toilet paper holder"],
  nouns: ["stand", "tower", "holder"],
  keywords: ["toilet", "tp", "paper", "roll", "rolls", "towel", "countertop", "freestanding", "spare"],
  fits: ["core"],
  fromSpec: (s) => ({ postD: s.dims.d - 6 }),
  specNote: "the post is 6 mm smaller, so the roll spins freely",
  primary: "postD",
  tips: ["250 mm tall", "160 mm base", "thicker post"],
  examples: ["I want a toilet paper stand", "make me a toilet roll stand 200 mm tall",
    "a freestanding toilet paper holder with a 160 mm base", "tp stand for the bathroom"],
  params: {
    postD: { default: 34, min: 16, max: 50, unit: "mm", label: "post diameter (roll cores are about 42 mm inside)", say: ["post", "diameter"], more: ["thicker"], less: ["thinner"] },
    height: { default: 160, min: 60, max: 250, unit: "mm", label: "overall height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    baseD: { default: 150, min: 70, max: 240, unit: "mm", label: "base diameter", say: ["base", "across", "wide", "foot"], more: ["wider", "bigger"], less: ["smaller"] },
    baseT: { default: 9, min: 4, max: 20, unit: "mm", label: "base thickness", say: ["thick", "thickness", "heavy"], more: ["heavier"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "post wall thickness", say: ["wall"], more: ["stronger"] },
  },
  things: [
    { names: ["spare toilet paper stand", "toilet paper tower", "spare toilet paper holder", "toilet paper reserve", "extra toilet paper stand", "spare roll stand"],
      title: "Spare toilet paper tower (two rolls)", spec: "bath-toilet-roll-core", params: { height: 245, baseD: 150, baseT: 11, postD: 36, wall: 3.5 } },
    { names: ["paper towel holder", "paper towel stand", "countertop paper towel holder", "kitchen roll holder", "kitchen roll stand", "paper towel holder stand", "kitchen paper towel holder"],
      title: "Paper towel holder", spec: "bath-paper-towel-core", params: { height: 250, baseD: 165, baseT: 12, postD: 36, wall: 3.5 } },
    { names: ["scrunchie holder", "scrunchie stand", "hair tie holder", "hair tie stand", "headband stand"],
      title: "Scrunchie and hair tie stand", params: { postD: 26, height: 170, baseD: 95, baseT: 9 } },
    { names: ["single toilet roll stand", "small toilet paper stand", "toilet roll holder stand"],
      title: "Single roll stand", params: { height: 135, baseD: 135 } },
  ],
  body: `
// the base: a disc with a softened top edge
const rB = baseD / 2;
const e = Math.min(baseT * 0.6, 4);
const base = revolve(360, polygon([[0, 0], [rB, 0], [rB, baseT - e], [rB - e, baseT], [0, baseT]]));

// the post: a root cone into the base, a slight taper, a bevelled top
const R = Math.min(postD / 2, rB - 8);
const H = Math.max(height, baseT + 40);
const rTop = R - Math.min(1.5, R * 0.08);
const root = Math.min(8, R * 0.5);
const bev = Math.min(3, rTop / 3);
const post = revolve(360, polygon([
  [0, baseT - 0.5], [R + root, baseT - 0.5], [R + root, baseT], [R, baseT + root],
  [rTop, H - bev], [rTop - bev, H], [0, H],
]));
// hollow inside, open underneath, roofed at 45 degrees so it prints
const ri = Math.max(2, rTop - wall);
const roofZ = H - Math.max(3, wall) - ri;
const inside = revolve(360, polygon([[0, -1], [ri, -1], [ri, roofZ], [0, roofZ + ri]]));
return difference(union(base, post), inside);
`,
};
