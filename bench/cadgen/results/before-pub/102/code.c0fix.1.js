const T = 15, ringTop = 29.5, PCD = 230;
const rad = (a) => a * Math.PI / 180;
const holeAngles = [17, 67, 119, 196, 265, 334];

const lobes = holeAngles.map(a =>
  translate([PCD / 2 * Math.cos(rad(a)), PCD / 2 * Math.sin(rad(a)), 0], cylinder({ r: 20, h: T })));

const tab = (ang, w, r0, r1, fr) =>
  rotate([0, 0, ang], translate([r0, -w / 2, 0], fillet({ r: fr, edges: "z" }, cube([r1 - r0, w, T]))));

let part = union(
  cylinder({ r: 125, h: T }),
  ...lobes,
  tab(160, 55, 100, 220, 10),
  tab(226, 39, 100, 160, 4),
  translate([0, 0, T - 0.5], cylinder({ r: 100, h: ringTop - T + 0.5 })),
  translate([0, 0, -3], cylinder({ r: 100, h: 3.5 })),
);

part = difference(part, drill([0, 0, ringTop], [0, 0, 1], { d: 120, through: true, cbore: { d: 150, depth: 4 } }));

for (const a of holeAngles) {
  part = difference(part, drill([PCD / 2 * Math.cos(rad(a)), PCD / 2 * Math.sin(rad(a)), T], [0, 0, 1], { d: 11, through: true }));
}

// Slot C: 39 long overall, 8 wide, centred at r148 along 160 degrees
const slotR = 148, slotL = 39, slotW = 8;
const half = (slotL - slotW) / 2;
const slotLocal = union(
  translate([slotR - half, 0, -1], cylinder({ r: slotW / 2, h: T + 2 })),
  translate([slotR + half, 0, -1], cylinder({ r: slotW / 2, h: T + 2 })),
  translate([slotR - half, -slotW / 2, -1], cube([2 * half, slotW, T + 2])),
);
part = difference(part, rotate([0, 0, 160], slotLocal));

const pinR = 175.3 / 2, pinA = 243;
part = difference(part, drill([pinR * Math.cos(rad(pinA)), pinR * Math.sin(rad(pinA)), ringTop], [0, 0, 1], { d: 4, depth: 6 }));

return part;