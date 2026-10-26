const OD = 80, ID = 40, H = 25, C = 1.5;
const pcdR = 30, holeD = 5.5, cskD = 10;
const radD = 5, radZ = 12.5;

// outer ring with C1.5 chamfers on the outer top and bottom edges
const outer = union(
  cylinder({ r1: OD / 2 - C, r2: OD / 2, h: C }),
  translate([0, 0, C - 0.5], cylinder({ r: OD / 2, h: H - 2 * C + 1 })),
  translate([0, 0, H - C], cylinder({ r1: OD / 2, r2: OD / 2 - C, h: C })),
);

let part = difference(outer, translate([0, 0, -1], cylinder({ r: ID / 2, h: H + 2 })));

// 3x countersunk holes on the Ø60 PCD, first one at +Y
for (let i = 0; i < 3; i++) {
  const a = (90 + i * 120) * Math.PI / 180;
  part = difference(part,
    drill([pcdR * Math.cos(a), pcdR * Math.sin(a), H], [0, 0, 1],
      { d: holeD, through: true, csink: { d: cskD, angle: 90 } }));
}

// radial Ø5 hole through the +X wall into the bore, at mid-height
part = difference(part,
  translate([ID / 2 - 1, 0, radZ], rotate([0, 90, 0], cylinder({ r: radD / 2, h: OD / 2 - ID / 2 + 2 }))));

return part;