const FLANGE_D = 140, FLANGE_T = 14, CH = 2;
const HUB_D = 70, TOTAL_H = 36;
const BORE_D = 40;
const PCD = 110, BOLT_D = 13.5, BOLTS = 6;

const R = FLANGE_D / 2;

// Flange: straight disc up to the start of the chamfer, then a C2 cone to the top face.
const disc = cylinder({ r: R, h: FLANGE_T - CH + 0.5 });
const chamferRing = translate([0, 0, FLANGE_T - CH], cylinder({ r1: R, r2: R - CH, h: CH }));

// Hub starts 0.5 mm inside the flange so the union overlaps.
const hub = translate([0, 0, FLANGE_T - 0.5], cylinder({ r: HUB_D / 2, h: TOTAL_H - FLANGE_T + 0.5 }));

let part = union(disc, chamferRing, hub);

// Central bore, through the whole part.
part = difference(part, translate([0, 0, -1], cylinder({ r: BORE_D / 2, h: TOTAL_H + 2 })));

// Six bolt holes, equally spaced on the PCD, starting on the +X axis.
const holes = [];
for (let i = 0; i < BOLTS; i++) {
  const a = (i * 360 / BOLTS) * Math.PI / 180;
  holes.push(translate([(PCD / 2) * Math.cos(a), (PCD / 2) * Math.sin(a), -1],
    cylinder({ r: BOLT_D / 2, h: FLANGE_T + 2 })));
}
part = difference(part, ...holes);

return part;