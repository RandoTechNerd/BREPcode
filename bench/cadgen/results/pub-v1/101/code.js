const H = 30, roofZ = 24, bossH = 35, lobeTop = 45;
const R = 100, Y = 60, rf = 18;
const Ri = 94, Yi = 54, rfi = 12;
const bx = 57, by = 60, bossR = 14;
const A = [40, 0], RA = 41, B = [-20, 15], RB = 30, rw = 10;

const outline = (Rr, Yy, r) => {
  const fx = Math.sqrt((Rr - r) ** 2 - (Yy - r) ** 2), fy = Yy - r;
  const k = Rr / (Rr - r), tx = fx * k, ty = fy * k;
  return path2d(
    [-fx, -Yy], [fx, -Yy],
    arcTo([tx, -ty], { center: [fx, -fy] }),
    arcTo([tx, ty], { center: [0, 0] }),
    arcTo([fx, Yy], { center: [fx, fy] }),
    [-fx, Yy],
    arcTo([-tx, ty], { center: [-fx, fy] }),
    arcTo([-tx, -ty], { center: [0, 0] }),
    arcTo([-fx, -Yy], { center: [-fx, -fy] }),
  );
};

// outer solid + corner bosses
let solid = linearExtrude({ h: H }, outline(R, Y, rf));
for (const sx of [-1, 1]) for (const sy of [-1, 1])
  solid = union(solid, translate([sx * bx, sy * by, 0], cylinder({ r: bossR, h: bossH })));

// cavity tool, stopping at the bosses
let cavity = translate([0, 0, -1], linearExtrude({ h: roofZ + 1 }, outline(Ri, Yi, rfi)));
for (const sx of [-1, 1]) for (const sy of [-1, 1])
  cavity = difference(cavity, translate([sx * bx, sy * by, -5], cylinder({ r: bossR, h: 40 })));
let part = difference(solid, cavity);

// lobe plate with R10 waists
const dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy);
const ux = dx / d, uy = dy / d;
const dA = RA + rw, dB = RB + rw;
const a = (dA * dA - dB * dB + d * d) / (2 * d), hh = Math.sqrt(dA * dA - a * a);
const pts = [], cuts = [];
for (const s of [1, -1]) {
  const cx = A[0] + ux * a - s * uy * hh, cy = A[1] + uy * a + s * ux * hh;
  const ta = [A[0] + (cx - A[0]) * RA / dA, A[1] + (cy - A[1]) * RA / dA];
  const tb = [B[0] + (cx - B[0]) * RB / dB, B[1] + (cy - B[1]) * RB / dB];
  pts.push({ ta, tb });
  cuts.push(translate([cx, cy, -1], cylinder({ r: rw, h: 20 })));
}
const quad = polygon([pts[0].ta, pts[0].tb, pts[1].tb, pts[1].ta]);
const lobeH = lobeTop - H + 0.5;
let bridge = linearExtrude({ h: lobeH }, quad);
for (const c of cuts) bridge = difference(bridge, c);
const lobes = translate([0, 0, H - 0.5], union(
  translate([A[0], A[1], 0], cylinder({ r: RA, h: lobeH })),
  translate([B[0], B[1], 0], cylinder({ r: RB, h: lobeH })),
  bridge,
));
part = union(part, lobes);

// bosses hanging under the roof
part = union(part, translate([A[0], A[1], 19], cylinder({ r: 25, h: roofZ - 19 + 0.5 })));
part = union(part, translate([B[0], B[1], 19], cylinder({ r: 19, h: roofZ - 19 + 0.5 })));

// main bores
part = difference(part, translate([A[0], A[1], -1], cylinder({ r: 20, h: 50 })));
part = difference(part, drill([B[0], B[1], lobeTop], [0, 0, 1], { d: 28, through: true, cbore: { d: 35, depth: 5 } }));

// 6x M12 tapped on PCD 61
for (let i = 0; i < 6; i++) {
  const ang = (30 + 60 * i) * Math.PI / 180;
  part = difference(part, drill([A[0] + 30.5 * Math.cos(ang), A[1] + 30.5 * Math.sin(ang), lobeTop], [0, 0, 1],
    { d: 10.2, depth: 15, csink: { d: 12, angle: 90 } }));
}

// 4x Ø12 thru corner holes, 1.5x45 chamfer top and bottom
for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
  part = difference(part, drill([sx * bx, sy * by, bossH], [0, 0, 1], { d: 12, through: true, csink: { d: 15, angle: 90 } }));
  part = difference(part, drill([sx * bx, sy * by, 0], [0, 0, -1], { d: 12, depth: 3, csink: { d: 15, angle: 90 } }));
}

return part;