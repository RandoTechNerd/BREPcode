const FB = 314, TB = 35, RB = 60;
const FT = 304, RT = 30, H = 270, ZT = 235;
const RC = 164;
const topW = 285;
const ZF = 170;              // cavity floor / hub top
const hubR = 65, boreR = 50, ribT = 15;

const baseFlange = translate([-FB / 2, -FB / 2, 0], fillet({ r: RB, edges: "z" }, cube([FB, FB, TB])));
const topFlange = translate([-FT / 2, -FT / 2, ZT - 0.5], fillet({ r: RT, edges: "z" }, cube([FT, FT, H - ZT + 0.5])));
const lowerRound = union(
  cylinder({ r: RC, h: 100 }),
  translate([0, 0, 99.5], cylinder({ r1: RC, r2: 130, h: 32.3 })),
);
const drafted = hull({ exact: true },
  translate([-FB / 2, -FB / 2, TB - 0.5], cube([FB, FB, 1])),
  translate([-topW / 2, -topW / 2, ZT - 1], cube([topW, topW, 1.5])),
);

let part = union(baseFlange, lowerRound, drafted, topFlange);

// E: open top cavity above z 170
part = difference(part, translate([-110, -110, ZF], fillet({ r: 40, edges: "z" }, cube([220, 220, H - ZF + 2]))));
// F: cross-shaped cavity, z 35..170.5
part = difference(part, translate([-125, -55, TB], fillet({ r: 20, edges: "z" }, cube([250, 110, ZF - TB + 0.5]))));
part = difference(part, translate([-55, -125, TB], fillet({ r: 20, edges: "z" }, cube([110, 250, ZF - TB + 0.5]))));

// hub and diagonal ribs
const hub = translate([0, 0, TB - 0.5], cylinder({ r: hubR, h: ZF - TB + 0.5 }));
const ribs = [45, 135, 225, 315].map(a =>
  rotate([0, 0, a], translate([hubR - 5, -ribT / 2, TB - 0.5], cube([40, ribT, ZF - TB + 0.5]))));
part = union(part, hub, ...ribs);

// G: central bore Ø100, z 35..170
part = difference(part, translate([0, 0, TB], cylinder({ r: boreR, h: ZF - TB + 2 })));

const sx = [1, -1];
for (const a of sx) for (const b of sx) {
  part = difference(part, translate([a * 122, b * 122, 120], cylinder({ r: 20, h: ZT - 120 })));
  part = difference(part, translate([a * 120, b * 120, TB], cylinder({ r: 20, h: 90 })));
  part = difference(part, translate([a * 122, b * 122, ZT - 5], cylinder({ r: 15, h: H - ZT + 7 })));
  part = difference(part, translate([a * 120, b * 120, -1], cylinder({ r: 12.5, h: TB + 2 })));
}

return part;