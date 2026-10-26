const W = 210, D = 120, H = 80, T = 30, Ro = 60, Ri = 30;
const AY = 85, AZ = 80;
const alongY = (x, z, r) => translate([x, -1, z], rotate([-90, 0, 0], cylinder({ r, h: D + 2 })));
const alongX = (x0, len, r) => translate([x0, AY, AZ], rotate([0, 90, 0], cylinder({ r, h: len })));

const outer = intersection(
  cube([W, D, H]),
  union(
    translate([0, 0, Ro], cube([W, D, 40])),
    translate([Ro, 0, 0], cube([W - 2 * Ro, D, H])),
    alongY(Ro, Ro, Ro),
    alongY(W - Ro, Ro, Ro),
  ),
);
const innerCut = union(
  alongY(T + Ri, T + Ri, Ri),
  alongY(W - T - Ri, T + Ri, Ri),
  translate([T + Ri, -1, T], cube([W - 2 * T - 2 * Ri, D + 2, 200])),
  translate([T, -1, T + Ri], cube([W - 2 * T, D + 2, 200])),
);
let U = difference(outer, innerCut);

const tri = rotate([0, 0, 90], rotate([90, 0, 0],
  linearExtrude({ h: W }, polygon([[15, 79], [62, 100], [85, 79]]))));
const filletCut = translate([-1, 21.6, 120], rotate([0, 90, 0], cylinder({ r: 40, h: W + 2 })));
const upper = union(difference(tri, filletCut), alongX(0, W, 35));
const legs = union(cube([T, D, 200]), translate([W - T, 0, 0], cube([T, D, 200])));
const bosses = intersection(upper, legs);

const rings = union(
  alongX(-3, 3.5, 30), alongX(T - 0.5, 3.5, 30),
  alongX(W - T - 3, 3.5, 30), alongX(W - 0.5, 3.5, 30),
);

let part = union(U, bosses, rings);

// bore
part = difference(part, alongX(-10, W + 20, 20));
// Ø6 from the boss tops into the bore
part = difference(part, drill([15, AY, 115], [0, 0, 1], { d: 6, depth: 25 }));
part = difference(part, drill([195, AY, 115], [0, 0, 1], { d: 6, depth: 25 }));

// floor pocket (detail A)
const pr = 56.9 / 2, PY = 60;
part = difference(part, hull({ exact: true },
  translate([105 - 57 + pr, PY, 20], cylinder({ r: pr, h: 11 })),
  translate([105 + 57 - pr, PY, 20], cylinder({ r: pr, h: 11 })),
));
part = difference(part, translate([63, 60, -1], cylinder({ r: 4, h: 25 })));

// M12 tapped holes in the front face
for (const [x, z] of [[15, 58], [195, 58], [50, 17], [160, 17]]) {
  part = difference(part, drill([x, 0, z], [0, -1, 0], { d: 10.2, depth: 24 }));
}

// Ø5 blind holes in the outer ring faces
part = difference(part, drill([-3, 110.49, 88.55], [-1, 0, 0], { d: 5, depth: 10 }));
part = difference(part, drill([213, 110.49, 88.55], [1, 0, 0], { d: 5, depth: 10 }));

return part;