const C = 45, FR = 45, FT = 10, HR = 22.5, H = 40;
const boreD = 25, pcdR = 36, boltD = 6.6, radD = 5, radDepth = 12, radZ = 28;

let part = union(
  translate([C, C, 0], cylinder({ r: FR, h: FT })),
  translate([C, C, 0], cylinder({ r: HR, h: H })),
);

// through bore
part = difference(part, translate([C, C, -1], cylinder({ r: boreD / 2, h: H + 2 })));

// keyway pocket 8 x 7, centred at y = 57.5, full depth
part = difference(part, translate([C - 4, 57.5 - 3.5, -1], cube([8, 7, H + 2])));

// 4 bolt holes on PCD 72 at 45 deg
for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = difference(part, translate([C + pcdR * Math.cos(a), C + pcdR * Math.sin(a), -1],
    cylinder({ r: boltD / 2, h: FT + 2 })));
}

// radial holes, 12 deep from the hub surface
part = difference(part, drill([C, C - HR, radZ], [0, -1, 0], { d: radD, depth: radDepth }));
part = difference(part, drill([C + HR, C, radZ], [1, 0, 0], { d: radD, depth: radDepth }));

return part;
