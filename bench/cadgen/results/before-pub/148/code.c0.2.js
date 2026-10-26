const H = 100, A = 97, D = 107.6, RB = 85, RW = 88;
const v = D * Math.SQRT2 - A;
const oct = linearExtrude({ h: H }, polygon([
  [A, -v], [A, v], [v, A], [-v, A], [-A, v], [-A, -v], [-v, -A], [v, -A],
]));
const alongY = (s) => rotate([-90, 0, 0], s);

let body = difference(oct, translate([0, 0, -1], cylinder({ r: RB, h: H + 2 })));

// web, run 3 mm into the wall
const web = union(
  translate([0, 0, 29.4], cylinder({ r1: 42, r2: RW, h: 16.6 })),
  translate([0, 0, 45.5], cylinder({ r: RW, h: 10 })),
  translate([0, 0, 55], cylinder({ r1: RW, r2: 42, h: 15 })),
);

// top port with lobes
const PZ = 50, PY0 = 90, PTOP = 118.5;
const lobes = [];
for (let i = 0; i < 6; i++) {
  const a = i * 60 * Math.PI / 180;
  lobes.push(translate([40 * Math.cos(a), PY0, PZ + 40 * Math.sin(a)], alongY(cylinder({ r: 7.5, h: PTOP - PY0 }))));
}
const port = union(translate([0, PY0, PZ], alongY(cylinder({ r: 37.5, h: PTOP - PY0 }))), ...lobes);

// side tabs
const tabs = union(
  translate([95.5, -13, 55], cube([7, 26, 45])),
  translate([-102.5, -13, 55], cube([7, 26, 45])),
);

body = union(body, web);
body = union(body, port);
body = union(body, tabs);

// hub bores
body = difference(body, translate([0, 0, 20], cylinder({ r: 25, h: 60 })));
body = difference(body, translate([0, 0, 55], cylinder({ r: 30, h: 16 })));
body = difference(body, translate([0, 0, 28.4], cylinder({ r: 30, h: 19.4 })));

// 7X Ø27.5 web holes
for (const deg of [18, 162, 198, 234, 270, 306, 342]) {
  const a = deg * Math.PI / 180;
  body = difference(body, translate([65 * Math.cos(a), 65 * Math.sin(a), 20], cylinder({ r: 13.75, h: 60 })));
}

// port bore Ø65
body = difference(body, translate([0, 55, PZ], alongY(cylinder({ r: 32.5, h: 65 }))));

// 6X Ø7 port lobe holes
for (let i = 0; i < 6; i++) {
  const a = i * 60 * Math.PI / 180;
  body = difference(body, drill([40 * Math.cos(a), PTOP, PZ + 40 * Math.sin(a)], [0, 1, 0], { d: 7, depth: 15 }));
}

// 8X Ø10 flange holes thru
for (const deg of [30, 60, 120, 150, 210, 240, 300, 330]) {
  const a = deg * Math.PI / 180;
  body = difference(body, translate([97.5 * Math.cos(a), 97.5 * Math.sin(a), -1], cylinder({ r: 5, h: H + 2 })));
}

// upper diagonal faces: 4X Ø10 + obround pocket
for (const deg of [45, 135]) {
  const a = deg * Math.PI / 180;
  const n = [Math.cos(a), Math.sin(a), 0];
  const t = [-Math.sin(a), Math.cos(a), 0];
  for (const s of [-12.5, 12.5]) {
    for (const dz of [-30, 30]) {
      body = difference(body, drill([D * n[0] + s * t[0], D * n[1] + s * t[1], 50 + dz], n, { d: 10, depth: 25 }));
    }
  }
  const slot = hull({ exact: true },
    translate([-10, 0, 0], cylinder({ r: 12.5, h: 6 })),
    translate([10, 0, 0], cylinder({ r: 12.5, h: 6 })),
  );
  body = difference(body, translate([(D - 3) * n[0], (D - 3) * n[1], 50], rotate([0, 0, deg], rotate([0, 90, 0], slot))));
}

// 2X Ø10 tab holes
body = difference(body, drill([102.5, 0, 66], [1, 0, 0], { d: 10, depth: 11 }));
body = difference(body, drill([-102.5, 0, 66], [-1, 0, 0], { d: 10, depth: 11 }));

return body;