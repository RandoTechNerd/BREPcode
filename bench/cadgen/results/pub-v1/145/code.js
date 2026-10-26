const R = 58, T = 20, rCore = 43.47, rWeb = 33.47, rHub = 20;
const padW = 29 * Math.SQRT1_2;
const halfPlan = 14.5;

let body = cylinder({ r: R, h: T });

// 1) tilt each pad: remove material outside the 45° slab, only beyond the core
for (let k = 0; k < 8; k++) {
  const zone = translate([0, 0, -1], difference(
    intersection(cylinder({ r: R + 4, h: T + 2 }), translate([0, -20, 0], cube([R + 6, 40, T + 2]))),
    translate([0, 0, -1], cylinder({ r: rCore + 0.5, h: T + 4 })),
  ));
  const half = (s) => translate([0, 0, T / 2], rotate([45, 0, 0],
    translate([30, s > 0 ? padW / 2 : -padW / 2 - 60, -60], cube([40, 60, 120]))));
  body = difference(body, rotate([0, 0, k * 45], intersection(zone, half(1))));
  body = difference(body, rotate([0, 0, k * 45], intersection(zone, half(-1))));
}

// 2) gaps between pads (plan view 29 wide pads)
for (let k = 0; k < 8; k++) {
  const wedge = intersection(
    translate([0, halfPlan, -1], cube([R + 30, R + 30, T + 2])),
    rotate([0, 0, 45], translate([0, -halfPlan - (R + 30), -1], cube([R + 30, R + 30, T + 2]))),
  );
  const tool = difference(wedge, translate([0, 0, -2], cylinder({ r: rCore, h: T + 4 })));
  body = difference(body, rotate([0, 0, k * 45], tool));
}

// 3) Ø8 holes through each pad, along the slab normal
for (let k = 0; k < 8; k++) {
  const h = translate([50.7, 0, T / 2],
    rotate([45, 0, 0], rotate([90, 0, 0], cylinder({ r: 4, h: 50, center: true }))));
  body = difference(body, rotate([0, 0, k * 45], h));
}

// 4) spoked pockets top and bottom
const sector = (k, z0) => {
  const a0 = k * 45 + 22.5;
  return rotate([0, 0, a0], translate([0, 0, z0],
    intersection(
      difference(cylinder({ r: rWeb, h: 6 }), translate([0, 0, -1], cylinder({ r: rHub, h: 8 }))),
      difference(
        rotate([0, 0, -22.5], translate([0, 3, -1], cube([rWeb + 2, rWeb + 2, 8]))),
        rotate([0, 0, 22.5], translate([0, -3, -1], cube([rWeb + 2, rWeb + 2, 8]))),
      ),
    )));
};
for (let k = 0; k < 8; k++) {
  body = difference(body, sector(k, -1));
  body = difference(body, sector(k, T - 5));
}

// 5) centre bore
body = difference(body, translate([0, 0, -1], cylinder({ r: 7.5, h: T + 2 })));

// 6) six counterbored holes on PCD 27.5
for (let k = 0; k < 6; k++) {
  const a = k * 60 * Math.PI / 180;
  const x = 13.75 * Math.cos(a), y = 13.75 * Math.sin(a);
  body = difference(body, translate([x, y, -1], cylinder({ r: 3.5, h: T + 2 })));
  body = difference(body, translate([x, y, T - 3], cylinder({ r: 5, h: 4 })));
}

return body;