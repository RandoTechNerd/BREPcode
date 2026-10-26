const T = 40;
const outline = [
  [0, 108.8], [34.1, 74.7], [164, 74.7], [180, 60], [200, 38], [225, 15], [250, 3.5], [272, 0],
  [650, 0], [650, 201.5], [368.8, 201.5], [120, 174.6], [14.6, 174.6], [0, 160],
];
let part = linearExtrude({ h: T }, polygon(outline));

const box = (x0, x1, y0, y1, z0, z1) => translate([x0, y0, z0], cube([x1 - x0, y1 - y0, z1 - z0]));
const rbox = (x0, x1, y0, y1, z0, z1, r) =>
  translate([x0, y0, z0], fillet({ r, edges: "z" }, cube([x1 - x0, y1 - y0, z1 - z0])));

// pockets and steps
part = difference(part, rbox(358.8, 620, 14.9, 109.9, 14.75, T + 1, 5));
part = difference(part, box(368.8, 450.9, 165.9, 203, 24.2, T + 1));
part = difference(part, box(603.8, 651, 165.9, 203, 24.2, T + 1));
part = difference(part, box(-1, 121, 124.7, 176, 29.75, T + 1));
part = difference(part, rbox(129.4, 206.2, 85, 165, 29.75, T + 1, 10));
// feature 47: D15 round end of the detail-A hook, 10 deep
part = difference(part, translate([207.5, 157.15, 30], cylinder({ r: 7.5, h: T - 30 + 1 })));

// main bore with counterbore
const C = [275.6, 89.2];
part = difference(part, translate([C[0], C[1], 20], cylinder({ r: 62.5, h: T })));
part = difference(part, translate([C[0], C[1], -1], cylinder({ r: 50, h: T + 2 })));

// notches beside the counterbore
const notch = (a, b) => hull({ exact: true },
  translate([a[0], a[1], 20], cylinder({ r: 8, h: 21 })),
  translate([b[0], b[1], 20], cylinder({ r: 8, h: 21 })));
part = difference(part, notch([201.75, 119.2], [217.95, 112.4]));
part = difference(part, notch([349.75, 119.2], [333.55, 112.39]));

// through slots in the pocket floor
const slot = (x0, x1, y) => hull({ exact: true },
  translate([x0, y, -1], cylinder({ r: 5, h: T + 2 })),
  translate([x1, y, -1], cylinder({ r: 5, h: T + 2 })));
part = difference(part, slot(378.8, 403.8, 84.9));
part = difference(part, slot(543.8, 563.8, 84.9));

// vertical holes
const up = [0, 0, 1];
const holes = [];
const add = (pts, z, opts) => pts.forEach(p => holes.push(drill([p[0], p[1], z], up, opts)));

add([[199.12, 169.65], [220.62, 169.65], [220.62, 139.65]], T, { d: 5, depth: 9 });
add([[390.8, 184.9], [424.3, 184.9]], 24.2, { d: 6, depth: 18.2, csink: { d: 7.6, angle: 90 } });
add([[618.8, 184.9], [634.8, 184.9]], 24.2, { d: 6, depth: 18.2 });
add([[433.8, 84.9], [558.82, 29.9]], 14.75, { d: 6.8, depth: 12 });
add([[275.75, 145.2], [201.75, 119.2], [349.75, 119.2], [217.95, 112.4], [333.55, 112.39],
     [332.15, 88.94], [219.35, 88.27], [275.75, 33.2]], 20, { d: 7, depth: 16, csink: { d: 8, angle: 90 } });
add([[376.3, 194.9], [409.3, 194.9], [442.3, 194.9], [610.8, 194.9], [642.8, 194.9],
     [376.3, 172.9], [409.3, 172.9], [442.26, 172.9], [610.8, 172.9], [642.8, 172.9]],
    24.2, { d: 8, depth: 18, csink: { d: 9.6, angle: 90 } });
add([[148.72, 154.65], [148.72, 124.59]], 29.75, { d: 8.5, depth: 15 });
add([[82.5, 148.17], [37.5, 148.15]], 29.75, { d: 8.5, depth: 20 });
// M10 L15 in the 14.75 mm pocket floor: through
add([[481.8, 84.9], [529.8, 84.9], [577.8, 84.9],
     [433.8, 29.9], [481.8, 29.9], [529.8, 29.9], [577.8, 29.9]], 14.75, { d: 8.5, through: true });
add([[625.8, 84.9], [625.8, 29.9]], 14.75, { d: 8.5, depth: 14.7 });
add([[60, 160.73], [104.95, 160.68], [14.94, 160.65], [104.98, 135.84], [15.09, 135.67], [60, 135.67]],
    29.75, { d: 12, depth: 24.5 });

for (const h of holes) part = difference(part, h);

// side tapped holes from the front face
part = difference(part, drill([104.6, 74.7, 25.1], [0, -1, 0], { d: 10.2, depth: 30, csink: { d: 12, angle: 90 } }));
part = difference(part, drill([335, 0, 17.2], [0, -1, 0], { d: 14, depth: 32, csink: { d: 16, angle: 90 } }));

return part;