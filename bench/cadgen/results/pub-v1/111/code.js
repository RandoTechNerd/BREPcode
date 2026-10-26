const H = 80;
const CX = 147, CY = -137.85;

const epi = (R, e, n) => {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * i / n;
    const a = R * Math.cos(t) + e * Math.cos(3 * t);
    const b = R * Math.sin(t) + e * Math.sin(3 * t);
    pts.push([CX + b, CY + a]);
  }
  return pts;
};
const prism = (pts, z0, h) => translate([0, 0, z0], linearExtrude({ h }, polygon(pts)));

const outer = prism(epi(145, 13, 96), 0, H);
const skirt = prism([[17.3, -200], [281.7, -200], [281.7, -278.7], [257, -303.4], [37, -303.4], [17.3, -283.7]], 0, H);
const rightBlock = translate([240, -200.5, 0], cube([41.7, 145.5, H]));
const leftPad = translate([15, -240, 0], cube([45, 150, H]));
const webB = prism([[-10, 0], [8, 20], [60, -25], [40, -55]], 0, H);
const lugB = translate([0, 6, 0], cylinder({ r: 16, h: H }));
const lugC = prism([[200, 0], [300.7, 14], [300.7, 0], [290, -15], [235, -35]], 0, H);
const portBoss = translate([281.2, -198.5, 40], rotate([0, 90, 0], cylinder({ r: 19, h: 3 })));

let part = union(outer, skirt, rightBlock, leftPad, webB, lugB, lugC, portBoss);

// rotor bore
part = difference(part, prism(epi(103.5, 11.5, 96), -1, H + 2));

// 15x Ø13 through holes
const holes = [[125.1, 0], [182.7, -4.8], [230.8, -36.8], [258.6, -110.5], [258.6, -166.2],
  [230.8, -240], [182.7, -272], [125.1, -275.7], [89, -261.6], [59.9, -236],
  [41.3, -202], [35.4, -138.4], [41.3, -74.8], [59.9, -40.8], [89, -15.2]];
part = difference(part, ...holes.map(([x, y]) => translate([x, y, -1], cylinder({ d: 13, h: H + 2 }))));

// coolant slots between neighbouring holes
const slots = [];
for (let i = 0; i < holes.length; i++) {
  const p = holes[i], q = holes[(i + 1) % holes.length];
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const L = Math.hypot(dx, dy);
  const half = L / 2 - 16;
  if (half <= 0.5) continue;
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
  const ux = dx / L, uy = dy / L;
  slots.push(hull({ exact: true },
    translate([mx - ux * half, my - uy * half, -1], cylinder({ r: 4, h: H + 2 })),
    translate([mx + ux * half, my + uy * half, -1], cylinder({ r: 4, h: H + 2 }))));
}
part = difference(part, ...slots);

// lug B hole
part = difference(part, translate([0, 6, -1], cylinder({ d: 22, h: H + 2 })));

// lug C slot: width 14, length 30 (end centres 16 apart)
part = difference(part, hull({ exact: true },
  translate([260, -5, -1], cylinder({ r: 7, h: H + 2 })),
  translate([276, -5, -1], cylinder({ r: 7, h: H + 2 }))));

// side ports (D and E break into the rotor bore)
part = difference(part, drill([281.7, -78.5, 40], [1, 0, 0], { d: 36, depth: 60, cbore: { d: 46, depth: 10 } }));
part = difference(part, drill([284.2, -198.5, 40], [1, 0, 0], { d: 19, depth: 70, cbore: { d: 29, depth: 10 } }));
part = difference(part, drill([15, -110.5, 40], [-1, 0, 0], { d: 11, depth: 34.7, cbore: { d: 26, depth: 11.8 } }));
part = difference(part, drill([15, -166.3, 40], [-1, 0, 0], { d: 4, depth: 30 }));

return part;