const S = 300, Rc = 30, H = 270, TF = 35, BF = 35;
const LOBE_D = 339.4, LOBE_W = 328, LOBE_H = 131.8;
const FLOOR = 176, BORE_R = 50, HP = 120, SCALLOP_R = 60;
const SLOT_W = 110, SLOT_L = 290, POCKET_R = 120, FUNNEL_R = 100;

const sq = (s, z0, h, r) =>
  fillet({ r, edges: "z" }, translate([-s / 2, -s / 2, z0], cube([s, s, h])));

const lobe = intersection(
  cylinder({ r: LOBE_D / 2, h: LOBE_H }),
  translate([-LOBE_W / 2, -LOBE_W / 2, -1], cube([LOBE_W, LOBE_W, LOBE_H + 2])),
);

let part = union(sq(S, 0, H, Rc), lobe);

// top pocket: round pocket plus a cross
part = difference(part, translate([0, 0, FLOOR], cylinder({ r: POCKET_R, h: H })));
part = difference(part, translate([-SLOT_L / 2, -SLOT_W / 2, FLOOR], cube([SLOT_L, SLOT_W, H])));
part = difference(part, translate([-SLOT_W / 2, -SLOT_L / 2, FLOOR], cube([SLOT_W, SLOT_L, H])));
// funnel
part = difference(part, translate([0, 0, FLOOR - 0.5], cylinder({ r1: BORE_R, r2: FUNNEL_R, h: H - FLOOR + 1 })));
// central blind bore, z 35 to 176
part = difference(part, translate([0, 0, BF], cylinder({ r: BORE_R, h: FLOOR - BF + 1 })));

// corner scallops and bolt holes
for (const [x, y] of [[HP, HP], [-HP, HP], [HP, -HP], [-HP, -HP]]) {
  part = difference(part, translate([x, y, BF], cylinder({ r: SCALLOP_R, h: H - TF - BF })));
  part = difference(part, translate([x, y, H - TF - 1], cylinder({ r: 15, h: TF + 2 })));
  part = difference(part, translate([x, y, -1], cylinder({ r: 12.5, h: BF + 2 })));
}

return part;