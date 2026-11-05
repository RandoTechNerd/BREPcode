// Pulley assembly: a test model for Design mode's Explode and Cut view.
// Eight parts, each its own body in group(): a base plate with a boss, a
// steel shaft, a bearing, a two-flange pulley round the bearing, a brass cap
// and four screws. Explode lifts the shaft stack off in order; Cut X or ¼
// shows the shaft in its bore, the bearing inside the pulley and the screws
// in their holes.
const plateW = 60;
const plateD = 40;
const plateT = 6;
const shaftR = 4;
const shaftTop = 46;
const fit = 0.2;          // running clearance round the shaft and the bearing

const cx = plateW / 2, cy = plateD / 2;
const holes = [[8, 8], [plateW - 8, 8], [8, plateD - 8], [plateW - 8, plateD - 8]];

// the plate, its boss, the shaft bore and the four screw holes
let base = union(
  fillet({ r: 3, edges: "z" }, cube([plateW, plateD, plateT])),
  translate([cx, cy, plateT], cylinder({ r: 9, h: 10 })));
base = difference(base, translate([cx, cy, plateT], cylinder({ r: shaftR + fit, h: 11 })));
for (const [x, y] of holes) base = difference(base, translate([x, y, -1], cylinder({ r: 2.5, h: plateT + 2 })));

const shaft = translate([cx, cy, plateT], cylinder({ r: shaftR, h: shaftTop - plateT }));

const bearing = translate([cx, cy, 27.5], difference(
  cylinder({ r: 11, h: 7 }),
  translate([0, 0, -1], cylinder({ r: shaftR + fit, h: 9 }))));

// two flanges and a hub between them: the belt groove
const pulley = translate([cx, cy, 26], difference(
  union(
    cylinder({ r: 20, h: 3 }),
    translate([0, 0, 3], cylinder({ r: 14, h: 4 })),
    translate([0, 0, 7], cylinder({ r: 20, h: 3 }))),
  translate([0, 0, -1], cylinder({ r: 11 + fit, h: 12 }))));

const cap = translate([cx, cy, shaftTop], cylinder({ r: 7, h: 3 }));

const screw = (x, y) => translate([x, y, 0], union(
  cylinder({ r: 2.3, h: plateT }),
  translate([0, 0, plateT], cylinder({ r: 4.5, h: 2.5 }))));

return group(
  finish("Aluminum", base),
  finish("Steel", shaft),
  colorize("#5a6b8c", bearing),
  colorize("#e05a5a", pulley),
  finish("Brass", cap),
  ...holes.map(([x, y]) => finish("Steel", screw(x, y))));
