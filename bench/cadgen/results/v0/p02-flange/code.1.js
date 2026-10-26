const R = 70, T = 14, H = 36, hubR = 35, boreD = 40;
const pcdR = 55, boltD = 13.5, C = 2;

// flange disc with a C2 chamfer on the top outer edge
const chamferCutter = difference(
  translate([0, 0, T - C], cylinder({ r: R + 5, h: C + 3 })),
  translate([0, 0, T - C - 0.5], cylinder({ r1: R + 0.5, r2: R - C - 3, h: C + 3.5 })),
);
const disc = difference(cylinder({ r: R, h: T }), chamferCutter);

const hub = translate([0, 0, T - 0.5], cylinder({ r: hubR, h: H - T + 0.5 }));

let part = union(disc, hub);

// bore
part = difference(part, translate([0, 0, -1], cylinder({ d: boreD, h: H + 2 })));

// bolt holes
const holes = [];
for (let i = 0; i < 6; i++) {
  const a = (i * 60) * Math.PI / 180;
  holes.push(translate([pcdR * Math.cos(a), pcdR * Math.sin(a), -1], cylinder({ d: boltD, h: T + 2 })));
}
part = difference(part, ...holes);

return part;
