// A tapered plant pot with a flared rim, drainage holes, and a matching
// saucer printed beside it. Round pots are cones, so every curve is a true
// surface until export; polygon pots (square, hex, octagon...) are
// linearExtruded regular polygons with their sides planed to the taper,
// which revolve() cannot make. Both stay exact B-rep end to end.
//
// The three rules that keep a pot a pot (viewer/recipes/vessel.md): the
// cavity starts AT the floor, the drain holes run z -1..floor+1 inside the
// cavity's footprint, and the saucer is its own solid with its own solid
// floor, printed beside the pot.

export default {
  id: "plant-pot",
  category: "garden",
  title: "Plant pot",
  summary: "a tapered round or polygon pot with drainage holes and a matching saucer.",
  print: "upright as shown, no supports. PETG if it will stay wet.",
  names: ["plant pot", "planter", "flower pot", "flowerpot", "succulent pot", "herb pot", "pot for plants",
    "plant pot with saucer", "pot with saucer", "cactus pot", "indoor planter",
    "planter with drip tray", "pot with drip tray", "planter with drainage holes", "pot with drainage holes"],
  nouns: ["pot", "planter"],
  keywords: ["plant", "flower", "succulent", "herb", "garden", "cactus", "drainage", "drip"],
  tips: ["120 mm across", "taller", "no saucer", "6 sides", "4 drain holes"],
  examples: ["I want a plant pot", "make me a planter 120mm across with a saucer",
    "a small succulent pot", "flower pot 150 mm tall without saucer",
    "a hex planter with drip holes and a drip tray", "an octagon planter 140 mm across with 4 drain holes"],
  params: {
    topD: { default: 100, min: 30, max: 240, unit: "mm", label: "top width (across the flats)", say: ["across", "diameter", "wide", "top"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    bottomD: { default: 75, min: 20, max: 240, unit: "mm", label: "bottom width", say: ["bottom", "base"] },
    height: { default: 90, min: 20, max: 240, unit: "mm", label: "height", say: ["tall", "high", "deep", "height"], more: ["taller", "deeper"], less: ["shorter", "shallower"] },
    sides: { default: 0, min: 0, max: 12, unit: "count", label: "sides (0 = round, 4-12 = polygon)", say: ["side", "sided"] },
    wall: { default: 2.4, min: 1.2, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 3, min: 1.6, max: 8, unit: "mm", label: "floor thickness", say: ["floor"] },
    rim: { default: 3, min: 0, max: 10, unit: "mm", label: "rim overhang", say: ["rim"] },
    drain: { default: 10, min: 0, max: 30, unit: "mm", label: "drain hole size (0 = none)", say: ["drain", "drainage", "hole"] },
    holes: { default: 1, min: 1, max: 8, unit: "count", label: "drain holes", say: ["hole", "drain"] },
    saucer: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "matching saucer",
      words: { no: ["no saucer", "without saucer", "without a saucer", "no tray", "no drip tray", "without a tray", "without a drip tray"], yes: ["saucer", "drip tray", "with tray"] } },
  },
  things: [
    { names: ["succulent pot", "cactus pot", "small planter", "tiny pot"], title: "Succulent pot", params: { topD: 70, bottomD: 55, height: 60, drain: 6 } },
    { names: ["herb pot", "kitchen herb planter"], title: "Herb pot", params: { topD: 120, bottomD: 95, height: 110 } },
    { names: ["seedling pot", "seed starter", "seed starting pot"], title: "Seedling pot", params: { topD: 50, bottomD: 40, height: 50, wall: 1.6, saucer: "no", drain: 6 } },
    { names: ["large planter", "big plant pot", "large pot"], title: "Large planter", params: { topD: 200, bottomD: 150, height: 180, wall: 3, floor: 4 } },
    { names: ["bonsai pot", "bonsai planter", "bonsai tray"], title: "Bonsai pot", params: { topD: 160, bottomD: 140, height: 45, rim: 2, drain: 14, saucer: "no" } },
    { names: ["succulent bowl", "shallow planter", "bowl planter", "shallow pot"], title: "Succulent bowl", params: { topD: 150, bottomD: 95, height: 55, drain: 8 } },
    { names: ["tall planter", "cylinder planter", "straight planter", "tall pot"], title: "Tall planter", params: { topD: 120, bottomD: 120, height: 170, wall: 2.6 } },
    { names: ["nursery pot", "grow pot", "plastic nursery pot"], title: "Nursery pot", params: { topD: 100, bottomD: 80, height: 90, wall: 1.6, rim: 2, saucer: "no" } },
    { names: ["desk planter", "mini planter", "tiny succulent planter"], title: "Desk planter", params: { topD: 60, bottomD: 48, height: 55, drain: 6 } },
    { names: ["orchid pot", "orchid planter"], title: "Orchid pot", params: { topD: 130, bottomD: 100, height: 120, drain: 26 } },
    { names: ["hex planter", "hexagonal planter", "hexagon planter", "hex pot", "hexagonal pot", "hexagon pot",
      "hex plant pot", "hexagonal plant pot", "honeycomb planter"], title: "Hex planter",
      params: { sides: 6, topD: 110, bottomD: 90, holes: 6, drain: 6 } },
    { names: ["octagon planter", "octagonal planter", "octagon pot", "octagonal pot", "octagon plant pot"], title: "Octagon planter",
      params: { sides: 8, topD: 120, bottomD: 95, holes: 4, drain: 7 } },
    { names: ["square planter", "square pot", "square plant pot", "cube planter"], title: "Square planter",
      params: { sides: 4, topD: 100, bottomD: 80, holes: 4, drain: 7 } },
    { names: ["pentagon planter", "pentagonal planter", "pentagon pot"], title: "Pentagon planter",
      params: { sides: 5, topD: 110, bottomD: 90, holes: 5, drain: 6 } },
  ],
  body: `
const n = sides > 0 ? Math.min(12, Math.max(4, Math.round(sides))) : 0;   // 1-3 sides means round
const rt = topD / 2, rb = Math.min(bottomD, topD) / 2;   // never wider at the foot: that would overhang
const lip = Math.min(rim, 0.6 * (height - floor - 2));
// sizes are apothems (flat to centre); a corner sits 1 / cos(PI / n) further out
const k = n ? 1 / Math.cos(Math.PI / n) : 1;
const rbi = rb - wall;
// drain holes: through the floor only (z -1..floor+1), inside the cavity's footprint
const ring = holes > 1 ? 0.45 * rbi : 0;
const hd = drain > 0 ? Math.min(drain, holes > 1 ? Math.min(0.7 * 2 * Math.PI * ring / holes, 2 * (rbi - ring - 2)) : rbi) : 0;
const drains = hd > 0 ? Array.from({ length: holes }, (_, i) => translate(
  [ring * Math.cos(2 * Math.PI * i / holes + Math.PI / 2), ring * Math.sin(2 * Math.PI * i / holes + Math.PI / 2), -1],
  cylinder({ r: hd / 2, h: floor + 2, $fn: 24 }))) : [];
// Everything below is a native exact solid, so the Rust B-rep kernel builds
// it in one pass: cones (not a lathe, whose axis seam it refuses to cut a
// centre hole through) and prisms cut by flat blocks (not hull(), which is
// a triangle mesh). Every cut overlaps by a margin: no face ever just grazes
// another, which is where an exact boolean slows down or gives up.
const DEG = 180 / Math.PI;
// a regular n-gon by its apothem, a flat facing the front
const ngon = (a) => polygon(Array.from({ length: n }, (_, i) => {
  const t = Math.PI / n - Math.PI / 2 + 2 * Math.PI * i / n;
  return [a * k * Math.cos(t), a * k * Math.sin(t)];
}));
// a tapered solid, apothem (radius when round) a0 at z0 to a1 at z1
const frustum = (a0, z0, a1, z1) => {
  const h = z1 - z0;
  if (!n) return translate([0, 0, z0], cylinder({ r1: a0, r2: a1, h, $fn: 96 }));
  if (Math.abs(a1 - a0) < 1e-6) return translate([0, 0, z0], linearExtrude({ h }, ngon(a0)));
  // a prism a little wider than the widest end, each side planed off by a
  // block tilted to the taper. One block at a time: handing difference() all
  // n blocks at once makes the kernel union the overlapping blocks first,
  // which took 2.5 s at 12 sides and was refused outright at 4 and 8.
  const big = Math.max(a0, a1) + 1, L = 2 * (big * k + h) + 10;
  const tilt = Math.atan((a1 - a0) / h) * DEG;
  let solid = translate([0, 0, z0], linearExtrude({ h }, ngon(big)));
  for (let i = 0; i < n; i++) solid = difference(solid, rotate([0, 0, -90 + 360 * i / n],
    translate([a0, 0, z0], rotate([0, tilt, 0], translate([0, -L, -L], cube([L, 2 * L, 2 * L]))))));
  return solid;
};
const slope = (rt - rb) / (height - lip);
// the rim flares out (45 degrees unless the pot is too short). Body and rim
// each run a little past the knee, so their side faces cross there instead
// of the rim just touching the body's top edge, which the exact kernel
// refuses (an octagon pot did).
const over = Math.min(1, lip / 2);
let outer = frustum(rb, 0, rt + slope * over, height - lip + over);
if (lip > 0) outer = union(outer, frustum(rt - rim / lip, height - lip - 1, rt + rim, height));
// the cavity starts AT the floor and runs past the top
const cavity = frustum(rbi, floor, rbi + slope * (height + 1 - floor), height + 1);
const pot = difference(difference(outer, cavity), ...drains);
if (saucer !== "yes") return pot;
// the saucer: its own solid with a solid 2 mm floor, never cut by the pot's holes
const rs = rb + 10, sh = 14, tf = 2;
const dish = difference(frustum(rs, 0, rs + 4, sh), frustum(rs - 2, tf, rs + 2.3, sh + 1));
return group(pot, translate([(rt + rim) * k + (rs + 4) * k + 10, 0, 0], dish));
`,
};
