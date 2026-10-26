const T = 3;
const plate = (x0, y0, z0, x1, y1, z1) => translate([x0, y0, z0], cube([x1 - x0, y1 - y0, z1 - z0]));
const body = union(
  plate(12.3, -15, 0, 156.3, 105.5, T),
  plate(47.3, -57, 0, 121.3, -14.5, T),
  plate(70.3, -74.1, 0, 98.3, -56, T),
  translate([84.3, -74.1, 0], cylinder({ r: 14, h: T })),
  plate(47.8, 105, 0, 63.8, 165, T),
  plate(104.8, 105, 0, 120.8, 165, T),
  plate(12.3, 0, 0, 15.3, 105, 15),
  plate(153.3, 0, 0, 156.3, 105, 15),
  plate(47.3, -55, 0, 50.3, -15, 23),
  plate(118.3, -55, 0, 121.3, -15, 23),
  plate(47.8, 105, 0, 50.8, 165, 34),
  plate(117.8, 105, 0, 120.8, 165, 34),
  plate(63.3, 104.5, 0, 105.3, 107.5, 60),
);
// short X-axis cutter: from x0, length L
const xHole = (x0, y, z, r, L) => translate([x0, y, z], rotate([0, 90, 0], cylinder({ r, h: L })));
let p = body;
// top lug holes, one per lug
p = difference(p, xHole(45.8, 146.1, 18, 6.5, 7));
p = difference(p, xHole(115.8, 146.1, 18, 6.5, 7));
// lower lug holes
p = difference(p, xHole(45.3, -35, 15, 4.5, 7));
p = difference(p, xHole(116.3, -35, 15, 4.5, 7));
// side flange holes
p = difference(p, xHole(10.3, 7.2, 11, 1.5, 7));
p = difference(p, xHole(10.3, 99, 11, 1.5, 7));
p = difference(p, xHole(151.3, 7.2, 11, 1.5, 7));
p = difference(p, xHole(151.3, 99, 11, 1.5, 7));
// base holes
p = difference(p,
  translate([84.3, -74.1, -1], cylinder({ r: 6, h: T + 2 })),
  translate([63.8, 6.3, -1], cylinder({ r: 3, h: T + 2 })),
  translate([63.8, -8, -1], cylinder({ r: 3, h: T + 2 })),
  translate([104.8, 6.3, -1], cylinder({ r: 3, h: T + 2 })),
  translate([104.8, -8, -1], cylinder({ r: 3, h: T + 2 })),
);
// slot
p = difference(p, hull({ exact: true },
  translate([84.3, 55.4, -1], cylinder({ r: 5, h: T + 2 })),
  translate([84.3, 84.7, -1], cylinder({ r: 5, h: T + 2 })),
));
// keyhole in tab
const ky = (z, r) => translate([84.3, 100, z], rotate([-90, 0, 0], cylinder({ r, h: 12 })));
p = difference(p, ky(19.5, 6));
p = difference(p, ky(26, 3.5));
p = difference(p, ky(13, 3.5));
return p;