const C = 45;
const FLANGE_D = 90, FLANGE_T = 10;
const HUB_D = 45, H = 40;
const BORE_D = 25;
const KEY_W = 8, KEY_L = 7, KEY_CY = 57.5;
const BOLT_D = 6.6, PCD = 72;
const SET_D = 5, SET_DEPTH = 12, SET_Z = 28;

let part = union(
  translate([C, C, 0], cylinder({ r: FLANGE_D / 2, h: FLANGE_T })),
  translate([C, C, FLANGE_T - 0.5], cylinder({ r: HUB_D / 2, h: H - FLANGE_T + 0.5 })),
);

// A: bore through
part = difference(part, translate([C, C, -1], cylinder({ r: BORE_D / 2, h: H + 2 })));

// B: keyway pocket, full height
part = difference(part,
  translate([C - KEY_W / 2, KEY_CY - KEY_L / 2, -1], cube([KEY_W, KEY_L, H + 2])));

// C: bolt holes on the PCD at 45°
for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = difference(part, translate([C + (PCD / 2) * Math.cos(a), C + (PCD / 2) * Math.sin(a), -1],
    cylinder({ r: BOLT_D / 2, h: FLANGE_T + 2 })));
}

// D: radial set-screw hole from the -Y face
part = difference(part, drill([C, C - HUB_D / 2, SET_Z], [0, -1, 0], { d: SET_D, depth: SET_DEPTH }));

// E: radial set-screw hole from the +X face
part = difference(part, drill([C + HUB_D / 2, C, SET_Z], [1, 0, 0], { d: SET_D, depth: SET_DEPTH }));

return part;