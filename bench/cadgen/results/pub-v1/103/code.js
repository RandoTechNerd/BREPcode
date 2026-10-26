const t = 2;

// floor: one outline, extruded
const floor = linearExtrude({ h: t }, polygon([
  [128, 30], [230, 30], [230, 130], [370, 130], [370, 170], [443, 170], [443, 200],
  [370, 200], [370, 430], [128, 430], [128, 390], [190, 390], [190, 70], [128, 70],
]));

// profile drawn in (x, z), extruded along Y from y0 to y1
const alongY = (y0, y1, pts) => translate([0, y1, 0], rotate([90, 0, 0], linearExtrude({ h: y1 - y0 }, polygon(pts))));
// profile drawn in (y, z), extruded along X from x0 to x1
const alongX = (x0, x1, pts) => translate([x0, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: x1 - x0 }, polygon(pts)))));

// left Z-brackets
const zProf = [[127.1, 0.5], [129.1, 0.5], [129.1, 84.7], [82.7, 84.7], [82.7, 82.7], [127.1, 82.7]];
const zUpper = alongY(390.2, 429.8, zProf);
const zLower = alongY(30.2, 69.8, zProf);

// top tab: two walls with inward ears, plus the lower middle wall
const earProf = [[428.5, 1], [430.5, 1], [430.5, 111.9], [402.1, 111.9], [402.1, 109.9], [428.5, 109.9]];
const earL = alongX(190, 220, earProf);
const earR = alongX(305, 335, earProf);
const midWall = translate([219.5, 428.7, 1], cube([86, 1.6, 83]));

// bottom tab with inward ear
const botTab = alongX(252.5, 272.5, [[129.5, 1], [131.5, 1], [131.5, 100.6], [159.4, 100.6], [159.4, 102.6], [129.5, 102.6]]);

// right arm: 75 deg incline, then flange
const rightArm = alongY(170.3, 199.7, [
  [440.4, 0.5], [442.43, 0.5], [463.5, 79.1], [504.3, 79.1], [504.3, 81.1], [461.9, 81.1],
]);

let part = union(floor, zUpper, zLower, earL, earR, midWall, botTab, rightArm);

const holeAt = (x, y, z) => translate([x, y, z - 5], cylinder({ d: 9, h: 10 }));
part = difference(part, holeAt(205, 414.1, 111));
part = difference(part, holeAt(320, 414.1, 111));
part = difference(part, holeAt(100.7, 410, 84));
part = difference(part, holeAt(100.7, 50, 84));
part = difference(part, holeAt(489.3, 185, 80));
part = difference(part, holeAt(262.5, 149.4, 101.6));

return part;