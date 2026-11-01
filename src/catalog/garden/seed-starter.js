// A self-watering seed starter: a rounded-square water reservoir, a drop-in
// tray whose square seats flare at the top, and square pots that taper out
// toward the rim so they drop in and lift out cleanly. Water goes in through
// a pour-in spout, or an upside-down soda bottle twists into a socket and
// keeps the level topped up: the socket is twelve-sided, so its flats bite a
// PCO 1881 thread with no thread to print (the bottle waterer's trick), and
// the bottle only lets air in once the water drops below the socket's mouth.
//
// Every piece stays on the exact lane: the seats and the pots are square
// frustums made of eight planed sides, cut one at a time. This is
// also brepcode.com/seedstarter (viewer/seedstarter.js).

export default {
  id: "seed-starter",
  category: "garden",
  title: "Self-watering seed starter",
  summary: "a water reservoir, a drop-in tray of square seats and tapered square pots, filled by a spout or a twist-in soda bottle.",
  print: "reservoir upright, tray flat, pots upright; no supports. PETG for the reservoir. Set assembled to no to see the parts laid out.",
  names: ["self watering seed starter", "self watering seed tray", "self watering seedling tray", "seed starter with reservoir",
    "seed starter with pots", "square seed starter", "bottle seed starter", "soda bottle seed starter", "self watering seed starting tray",
    "seed starting system", "seed starter kit"],
  nouns: ["starter", "tray"],
  keywords: ["seed", "seedling", "seedlings", "self", "watering", "reservoir", "bottle", "sprout", "starter", "germinate"],
  // the reservoir, the tray and every pot are separate prints, each already
  // the right way up in the assembly: Export > 3MF parts lays them out, and
  // test/catalog.js checks each one as its own print
  separate: true,
  triple: ["cols", "rows"],
  primary: "potTop",
  tips: ["4 x 4 pots", "use a bottle", "taller pots"],
  examples: ["I want a self watering seed starter", "make me a self watering seed starter with 4 x 4 pots",
    "a seed starter with a reservoir that a soda bottle twists into", "self watering seedling tray with square pots"],
  params: {
    cols: { default: 3, min: 1, max: 5, unit: "count", label: "pots across", say: ["across", "column", "columns", "wide"] },
    rows: { default: 3, min: 1, max: 5, unit: "count", label: "pots deep", say: ["row", "rows", "deep"] },
    pitch: { default: 52, min: 40, max: 80, unit: "mm", label: "pot spacing", say: ["pitch", "spacing", "apart"] },
    potTop: { default: 48, min: 30, max: 75, unit: "mm", label: "pot width at the rim", say: ["pot", "pots", "rim", "square"], more: ["bigger"], less: ["smaller"] },
    potBot: { default: 36, min: 20, max: 70, unit: "mm", label: "pot width at the floor", say: ["bottom", "base"] },
    potH: { default: 50, min: 25, max: 90, unit: "mm", label: "pot height, rim included", say: ["tall", "height", "high"], more: ["taller"], less: ["shorter"] },
    potCorner: { default: 5, min: 1, max: 12, unit: "mm", label: "pot corner chamfer at the rim", say: ["chamfer", "corner"] },
    potWall: { default: 1.2, min: 0.8, max: 3, unit: "mm", label: "pot wall", say: ["wall"] },
    potFloor: { default: 1.2, min: 0.8, max: 3, unit: "mm", label: "pot floor", say: ["floor"] },
    flange: { default: 1.6, min: 1, max: 4, unit: "mm", label: "how far the rim flange sticks out past the pot", say: ["flange", "lip"] },
    flangeT: { default: 1.6, min: 1, max: 3, unit: "mm", label: "rim flange thickness", say: ["flange"] },
    slotW: { default: 1.6, min: 0, max: 3, unit: "mm", label: "drain slot width (0 = solid floor)", say: ["slot", "slots", "drain", "wick"] },
    trayT: { default: 2.4, min: 1.6, max: 4, unit: "mm", label: "tray thickness", say: ["tray"] },
    leadIn: { default: 1.5, min: 0, max: 4, unit: "mm", label: "how much each seat flares at the top", say: ["flare", "lead"] },
    seatClear: { default: 0.4, min: 0.1, max: 1, unit: "mm", label: "gap between pot and seat, per side", say: ["clearance", "gap", "fit"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "reservoir wall", say: ["wall"] },
    floorT: { default: 1.6, min: 1, max: 4, unit: "mm", label: "reservoir floor", say: ["floor"] },
    ledgeW: { default: 3, min: 2, max: 5, unit: "mm", label: "ledge the tray rests on", say: ["ledge"] },
    trayGap: { default: 0.3, min: 0.1, max: 1, unit: "mm", label: "tray clearance in its pocket, per side", say: ["clearance"] },
    margin: { default: 1, min: 0, max: 10, unit: "mm", label: "extra space around the pot grid", say: ["margin", "border"] },
    resH: { default: 58, min: 40, max: 120, unit: "mm", label: "reservoir height", say: ["reservoir", "water", "base"], more: ["deeper"], less: ["shallower"] },
    cornerR: { default: 14, min: 4, max: 30, unit: "mm", label: "reservoir corner radius", say: ["round", "rounded", "radius", "corners"] },
    grooves: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "two decorative grooves round the reservoir",
      words: { yes: ["grooves", "grooved"], no: ["no grooves", "plain", "smooth"] } },
    notch: { default: 12, min: 0, max: 20, unit: "mm", label: "finger notch radius at the sides (0 = none)", say: ["notch", "finger"] },
    water: { default: "spout", unit: "choice", choices: ["spout", "bottle"], label: "water in by a pour-in spout or a twist-in bottle",
      words: { spout: ["spout", "pour", "pour in", "funnel", "no bottle"], bottle: ["bottle", "soda bottle", "twist in", "upside down bottle", "water bottle"] } },
    spoutW: { default: 44, min: 25, max: 80, unit: "mm", label: "spout width", say: ["spout"] },
    spoutOut: { default: 26, min: 12, max: 40, unit: "mm", label: "spout depth out from the wall", say: ["spout"] },
    spoutH: { default: 30, min: 12, max: 55, unit: "mm", label: "spout height", say: ["spout"] },
    neckD: { default: 27.4, min: 20, max: 40, unit: "mm", label: "bottle thread diameter (27.4 = soda / water bottle)", say: ["neck", "thread", "cap"] },
    sockH: { default: 14, min: 8, max: 24, unit: "mm", label: "socket depth the bottle twists into", say: ["socket"] },
    levelZ: { default: 14, min: 6, max: 30, unit: "mm", label: "water level the bottle keeps, from the floor", say: ["level"] },
    cradleR: { default: 34, min: 20, max: 50, unit: "mm", label: "bottle shoulder cradle radius at the top", say: ["cradle", "shoulder"] },
    assembled: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "assembled (no = parts laid out for printing)",
      words: { yes: ["assembled", "together"], no: ["laid out", "apart", "exploded", "print layout"] } },
  },
  things: [
    { names: ["bottle fed seed starter", "bottle watered seed starter", "soda bottle self watering seed starter"], title: "Bottle-fed seed starter", params: { water: "bottle" } },
    { names: ["4 x 4 seed starter", "16 pot seed starter", "sixteen pot seed starter"], title: "16-pot seed starter", params: { cols: 4, rows: 4 } },
    { names: ["2 x 2 seed starter", "4 pot seed starter", "four pot seed starter", "windowsill seed starter"], title: "4-pot seed starter", params: { cols: 2, rows: 2 } },
    { names: ["tomato seed starter", "deep seed starter", "self watering tomato seedling tray"], title: "Deep-pot seed starter", params: { potTop: 60, potBot: 44, potH: 75, pitch: 64, resH: 70 } },
    { names: ["microgreens seed starter", "herb seed starter", "small pot seed starter"], title: "Small-pot seed starter", params: { cols: 5, rows: 4, potTop: 36, potBot: 28, potH: 40, pitch: 40, potCorner: 4 } },
  ],
  body: `
// ---- shared shapes
const rbox = (w, d, h, r) => fillet({ r, edges: "z" }, cube([w, d, h], { center: true }));
const oct = (s, c) => {                                   // a square of side s with its corners chamfered by c
  const a = s / 2, b = s / 2 - c;
  return polygon([[b, -a], [a, -b], [a, b], [b, a], [-b, a], [-a, b], [-a, -b], [-b, -a]]);
};
// A square frustum with chamfered corners, made exact by planing each of the eight sides with a tilted cube, one at a time.
const taperOct = (s0, c0, s1, c1, z0, z1) => {
  const h = z1 - z0, big = Math.max(s0, s1) + 6, L = 2 * big + 4 * h + 20;
  const ap = (s, c, k) => (k % 2 === 0 ? s / 2 : (s - c) / Math.SQRT2);   // apothem of side k (even = flat, odd = chamfer)
  let t = translate([0, 0, z0], linearExtrude({ h }, oct(big, c1 * big / s1)));
  for (let k = 0; k < 8; k++) {
    const a0 = ap(s0, c0, k), a1 = ap(s1, c1, k), tilt = Math.atan((a1 - a0) / h) * 180 / Math.PI;
    t = difference(t, rotate([0, 0, 45 * k], translate([a0, 0, z0], rotate([0, tilt, 0], translate([0, -L / 2, -L / 2], cube([L, L, L]))))));
  }
  return t;
};

// ---- the grid
const gridW = cols * pitch + 2 * margin, gridD = rows * pitch + 2 * margin;
const pocketW = gridW, pocketD = gridD;                    // the tray pocket holds the grid
const innerW = pocketW - 2 * ledgeW, innerD = pocketD - 2 * ledgeW;
const W = pocketW + 2 * wall, D = pocketD + 2 * wall;
const seatXY = [];
for (let i = 0; i < cols; i++) {
  for (let j = 0; j < rows; j++) {
    seatXY.push([(i - (cols - 1) / 2) * pitch, (j - (rows - 1) / 2) * pitch]);
  }
}

// ---- one pot: a square frustum, a rim flange, a hollow, slots across the floor.
// The frustums are planed (taperOct), not hull({ exact: true }) of two squares:
// a hulled pot built in 1 s at the origin but 10 s at some grid positions on
// the Rust kernel, the same shape to 0.1 % of its volume.
const bodyTopZ = potH - flangeT;
const sideAt = (z) => potBot + (potTop - potBot) * z / bodyTopZ;   // pot width at height z
const makePot = () => {
  let p = union(
    taperOct(potBot, potCorner * potBot / potTop, potTop, potCorner, 0, bodyTopZ + 0.5),
    translate([0, 0, bodyTopZ], linearExtrude({ h: flangeT }, oct(potTop + 2 * flange, potCorner + flange * 0.6))),
  );
  const inBot = sideAt(potFloor) - 2 * potWall, inTop = sideAt(potH + 1) - 2 * potWall, cIn = Math.max(0.6, potCorner - potWall * 0.6);
  p = difference(p, taperOct(inBot, cIn * inBot / inTop, inTop, cIn, potFloor, potH + 1));
  if (slotW > 0) {
    const reach = (inBot - 4) / 2, cuts = [];
    for (let k = -1; k <= 1; k++) cuts.push(translate([k * reach * 0.6 - slotW / 2, -reach, -1], cube([slotW, 2 * reach, potFloor + 2])));
    p = difference(p, ...cuts);
  }
  return p;
};

// ---- tray: a sheet with square seats that flare at the top (the lead-in), sitting flush with the rim
const trayW = pocketW - 2 * trayGap, trayD = pocketD - 2 * trayGap;
const seatW = potTop + 2 * seatClear;                      // the seat clears the pot at its widest point
let tray = translate([0, 0, trayT / 2], rbox(trayW, trayD, trayT, Math.max(1, cornerR - wall - trayGap)));
const k0 = seatW, k1 = seatW + 2 * leadIn, slope = (k1 - k0) / trayT;
const seat = taperOct(k0 - slope, potCorner + seatClear, k1 + slope, potCorner + seatClear + leadIn, -0.5, trayT + 0.5);
for (const [x, y] of seatXY) {
  tray = difference(tray, translate([x, y, 0], seat));     // one seat at a time keeps the exact kernel
}

// ---- reservoir: rounded square, cavity, tray pocket, grooves, finger notches
const trayZ = resH - trayT;                                   // tray top flush with the rim
let body = fillet({ r: 2, edges: "bottom" }, translate([0, 0, resH / 2], rbox(W, D, resH, cornerR)));
body = difference(body, translate([0, 0, floorT + (resH + 1) / 2], rbox(innerW, innerD, resH + 1, Math.max(1, cornerR - wall - ledgeW))));
body = difference(body, translate([0, 0, trayZ + (resH + 1) / 2], rbox(pocketW, pocketD, resH + 1, Math.max(1, cornerR - wall))));
if (grooves === "yes") {
  for (const gz of [resH * 0.32, resH * 0.40]) {
    const band = difference(translate([0, 0, gz], rbox(W + 4, D + 4, 1.2, cornerR + 2)), translate([0, 0, gz], rbox(W - 1.6, D - 1.6, 2, cornerR - 0.8)));
    body = difference(body, band);
  }
}
if (notch > 0) body = difference(body, translate([0, 0, resH], rotate([0, 90, 0], cylinder({ r: notch, h: W + 10, center: true, $fn: 64 }))));

// ---- water in: a pour-in spout, or a twist-in bottle socket that holds the level at levelZ
const frontY = -D / 2;
if (water === "spout") {
  const sb = translate([0, frontY - spoutOut / 2 + 1, spoutH / 2], rbox(spoutW, spoutOut + 2, spoutH, 6));
  const sh = translate([0, frontY - spoutOut / 2 + 1 + wall / 2, floorT + spoutH / 2], rbox(spoutW - 2 * wall, spoutOut + 2 - wall, spoutH, Math.max(1, 6 - wall)));
  const mouth = translate([-(spoutW - 2 * wall - 6) / 2, frontY - 2, floorT], cube([spoutW - 2 * wall - 6, wall + 4, spoutH - floorT - 3]));
  body = difference(difference(difference(union(body, sb), sh), mouth), translate([0, 0, floorT + (resH + 1) / 2], rbox(innerW, innerD, resH + 1, Math.max(1, cornerR - wall - ledgeW))));
} else {
  const rb = neckD / 2 + 0.2, rc = rb / Math.cos(Math.PI / 12), outerR = rc + 3;
  const cy = frontY - outerR + 3;                          // the tower runs 3 mm into the front wall
  const topZ = levelZ + sockH;
  const tower = translate([0, cy, 0], cylinder({ r: outerR, h: topZ, $fn: 96 }));
  const cradleTop = Math.min(resH + 12, topZ + (cradleR - outerR) * 1.1);
  const cradle = difference(
    translate([0, cy, topZ - 0.5], cylinder({ r1: outerR, r2: cradleR + 2, h: cradleTop - topZ + 0.5, $fn: 96 })),
    translate([0, cy, topZ - 0.01], cylinder({ r1: rc + 0.8, r2: cradleR, h: cradleTop - topZ + 0.02, $fn: 96 })));   // throat clears the socket's corners
  const bore = translate([0, cy, levelZ], rotate([0, 0, 15], cylinder({ r: rc, h: sockH + 0.6, $fn: 12 })));
  const channel = translate([-7, cy, floorT], cube([14, -cy + frontY + wall + 6, levelZ - floorT + 1]));
  const under = translate([0, cy, floorT], cylinder({ r: rc - 2, h: levelZ - floorT + 0.5, $fn: 48 }));
  body = difference(difference(difference(union(body, tower, cradle), bore), under), channel);
}

// ---- assembly or print layout
const green = "#4e9a64", cream = "#e9e2d0";
const potZ = resH + flangeT - potH;                           // the flange rests on the tray top
if (assembled === "yes") {
  return group(
    colorize(green, body),
    translate([0, 0, trayZ], colorize(cream, tray)),
    ...seatXY.map(([x, y]) => translate([x, y, potZ], colorize(cream, makePot()))),
  );
}
const lay = pitch + 6;
return group(
  colorize(green, body),
  translate([W + 20, 0, 0], colorize(cream, tray)),
  ...seatXY.map(([x, y], i) => translate([(i % cols - (cols - 1) / 2) * lay, D / 2 + 30 + lay / 2 + Math.floor(i / cols) * lay, 0], colorize(cream, makePot()))),
);
`,
};
