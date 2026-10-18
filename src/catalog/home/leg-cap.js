// A cap that slips over the end of a chair, table or stool leg (round or
// square) so it glides instead of scratching the floor. Printed with its
// floor on the bed and the socket open upward; the floor edge has a small
// 45-degree chamfer so it slides over a rug instead of catching. For legs that
// splay, the socket can lean while the floor stays flat.

export default {
  id: "leg-cap",
  category: "home",
  title: "Chair leg cap",
  summary: "a glide cap that slips over a chair or table leg to protect the floor.",
  print: "floor down as shown, no supports. TPU for grip and quiet, PETG for gliding.",
  names: ["leg cap", "furniture leg cap", "leg tip", "leg protector", "furniture glide", "floor protector",
    "leg end cap", "chair glide", "furniture leg protector"],
  nouns: ["cap", "glide", "tip", "protector", "foot"],
  keywords: ["chair", "stool", "table", "leg", "floor", "scratch", "glide", "tube"],
  fits: ["leg"],
  fromSpec: (s) => ({ legSize: s.dims.d, shape: s.dims.sq ? "square" : "round" }),
  specNote: "with 0.3 mm of room each side; TPU can go tighter",
  primary: "legSize",
  ask: { unless: ["legSize"], text: "How thick is the leg? Measure across its end (“25 mm”, or “for a 1 inch square tube”); I used 25 mm round." },
  tips: ["22 mm", "square", "deeper socket", "tilted 8 degrees"],
  examples: ["I want a chair glide", "make me a chair leg cap for a 22mm tube",
    "a square leg cap 30mm", "table leg cap 40mm across"],
  params: {
    legSize: { default: 25, min: 8, max: 80, unit: "mm", label: "leg diameter (or side, if square)", say: ["leg", "diameter", "size", "across", "side"] },
    shape: { default: "round", unit: "choice", choices: ["round", "square"], label: "leg shape",
      words: { square: ["square", "box", "rectangular"], round: ["round", "circular", "tube"] } },
    depth: { default: 15, min: 5, max: 40, unit: "mm", label: "how far the leg goes in", say: ["deep", "depth", "socket"], more: ["deeper"], less: ["shallower"] },
    wall: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    floorT: { default: 3, min: 1.6, max: 8, unit: "mm", label: "floor thickness", say: ["floor", "bottom", "thick"] },
    fit: { default: 0.3, min: 0, max: 1, unit: "mm", label: "room around the leg, each side", say: ["fit", "clearance", "room"] },
    tilt: { default: 0, min: 0, max: 15, unit: "deg", label: "leg splay angle", say: ["tilt", "splay", "angle", "degree"] },
  },
  things: [
    { names: ["chair leg cap", "chair leg protector", "chair leg tip", "chair foot", "chair leg glide", "chair floor protector"],
      title: "Chair leg cap" },
    { names: ["table leg cap", "table leg protector", "table glide", "table leg tip"], title: "Table leg cap", params: { legSize: 40, depth: 18 } },
    { names: ["square leg cap", "square chair leg cap", "square tube cap", "square glide"], title: "Square leg cap", spec: "leg-square-25",
      params: { shape: "square" } },
    { names: ["stool leg cap", "bar stool leg cap", "stool foot", "stool glide"], title: "Stool leg cap", params: { legSize: 25, depth: 20 } },
    { names: ["folding chair foot", "folding chair leg cap", "folding chair glide"], title: "Folding chair foot", spec: "leg-tube-22",
      params: { depth: 18 } },
    { names: ["angled chair glide", "splayed leg glide", "tilted chair glide", "angled leg cap"], title: "Angled chair glide",
      params: { tilt: 8, floorT: 4 } },
    { names: ["wooden chair leg cap", "wood chair glide", "dining chair glide"], title: "Wooden chair leg cap", spec: "leg-wood-chair",
      params: { depth: 12, tilt: 5 } },
  ],
  body: `
const inner = legSize + 2 * fit;
const Ro = inner / 2 + wall;
const H = floorT + depth;
const sq = shape === "square";
const c = tilt > 0 ? 0 : Math.min(1.2, wall * 0.5);   // 45 degree chamfer round the floor edge
// a rounded square (or a circle) w across, from z0 to z0 + h
const ring = (w, r, z0, h) => sq
  ? hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => translate([sx * (w / 2 - r), sy * (w / 2 - r), z0], cylinder({ r, h, $fn: 24 }))))
  : translate([0, 0, z0], cylinder({ r: w / 2, h, $fn: 64 }));
const rc = Math.min(wall + 1, Ro - 0.5);
const lean = tilt * Math.PI / 180;
// the socket floor rises with the lean so its low side keeps the full floor
const floorZ = floorT / Math.cos(lean) + (inner / 2) * Math.tan(lean);
const body = c > 0
  ? hull(ring(2 * Ro - 2 * c, Math.max(0.5, rc - c), 0, 0.01), ring(2 * Ro, rc, c, H - c))
  : ring(2 * Ro, rc, -Ro, H + Ro);
const socket = ring(inner, Math.max(0.5, rc - wall), floorZ, H + Ro);
const cup = difference(body, socket);
if (tilt <= 0) return cup;
// lean the cup and cut the floor flat again
return intersection(rotate([tilt, 0, 0], cup), translate([-2 * Ro - 10, -2 * Ro - 10, 0], cube([4 * Ro + 20, 4 * Ro + 20, H + Ro])));
`,
};
