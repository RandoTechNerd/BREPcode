const S = 300, Rc = 30, H = 270, TF = 35, BF = 35;
const LOBE_D = 339.4, LOBE_W = 328, LOBE_H = 131.8;
const FLOOR = 176, BORE_R = 50, HP = 120;

const sq = (s, z0, h, r) =>
  fillet({ r, edges: "z" }, translate([-s / 2, -s / 2, z0], cube([s, s, h])));

const lobe = intersection(
  cylinder({ r: LOBE_D / 2, h: LOBE_H }),
  translate([-LOBE_W / 2, -LOBE_W / 2, -1], cube([LOBE_W, LOBE_W, LOBE_H + 2])),
);

let part = union(sq(S, 0, H, Rc), lobe);

// top pocket: round pocket plus a cross
part = difference(part, translate([0, 0, FLOOR], cylinder({ r: 120, h: H })));
part = difference(part, translate([-145, -60, FLOOR], cube([290, 120, H])));
part = difference(part, translate([-60, -145, FLOOR], cube([120, 290, H])));
// funnel
part = difference(part, translate([0, 0, FLOOR - 0.5], cylinder({ r1: BORE_R, r2: 100, h: H - FLOOR + 1 })));
// central bore
part = difference(part, translate([0, 0, BF], cylinder({ r: BORE_R, h: FLOOR - BF + 1 })));

// corner bolts
for (const [x, y] of [[HP, HP], [-HP, HP], [HP, -HP], [-HP, -HP]]) {
  part = difference(part, translate([x, y, BF], cylinder({ r: 30, h: H - TF - BF })));
  part = difference(part, translate([x, y, H - TF - 1], cylinder({ r: 15, h: TF + 2 })));
  part = difference(part, translate([x, y, -1], cylinder({ r: 12.5, h: BF + 2 })));
}

return part;