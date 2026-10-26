const Zf = 3, Tf = 15, Zb = Zf + Tf, Hb = 14.5, Ztop = Zb + Hb;
const Rdisc = 125, Rhub = 100, Rbore = 60, BC = 115, holeD = 12, lobeR = 20;
const armA = 157.4, armW = 55, armL = 220;
const tabA = -135, tabW = 39, tabL = 160;
const holeAngles = [119, 67, 17, -25, -95, 196];
const rad = (a) => a * Math.PI / 180;

const lobes = holeAngles.map(a =>
  translate([BC * Math.cos(rad(a)), BC * Math.sin(rad(a)), Zf], cylinder({ r: lobeR, h: Tf })));

const arm = translate([0, 0, Zf], rotate([0, 0, armA], translate([0, -armW / 2, 0], cube([armL, armW, Tf]))));
const tab = translate([0, 0, Zf], rotate([0, 0, tabA], translate([0, -tabW / 2, 0], cube([tabL, tabW, Tf]))));

let part = union(
  cylinder({ r: Rhub, h: Zf + 0.5 }),
  translate([0, 0, Zf], cylinder({ r: Rdisc, h: Tf })),
  ...lobes,
  arm,
  tab,
  translate([0, 0, Zb - 0.5], cylinder({ r: Rhub, h: Hb + 0.5 })),
);

// bore with Ø150 x 6 counterbore at the hub top
part = difference(part, translate([0, 0, -1], cylinder({ r: Rbore, h: Ztop + 2 })));
part = difference(part, translate([0, 0, Ztop - 6], cylinder({ r: 75, h: 7 })));
// internal groove
part = difference(part, translate([0, 0, 8], cylinder({ r: 66, h: 6 })));

part = difference(part, ...holeAngles.map(a =>
  translate([BC * Math.cos(rad(a)), BC * Math.sin(rad(a)), -1], cylinder({ d: holeD, h: Ztop + 2 }))));

// arm pocket, 3.5 deep
const pocket = translate([0, 0, Zb - 3.5], rotate([0, 0, armA],
  translate([140, -39 / 2, 0], fillet({ r: 6, edges: "z" }, cube([72, 39, 5])))));
part = difference(part, pocket);

// slot through the arm, R3 ends at r = 157 and r = 199
const slot = translate([0, 0, -1], rotate([0, 0, armA], hull({ exact: true },
  translate([157, 0, 0], cylinder({ r: 3, h: Ztop + 2 })),
  translate([199, 0, 0], cylinder({ r: 3, h: Ztop + 2 })),
)));
part = difference(part, slot);

// small hole on the hub face
part = difference(part, translate([88 * Math.cos(rad(-118)), 88 * Math.sin(rad(-118)), Ztop - 5],
  cylinder({ d: 4, h: 6 })));

return part;