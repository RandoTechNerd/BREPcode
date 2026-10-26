const H = 54.1, HA = 115, floor = 10, holeD = 40;
const outline = polygon([
  [-38, -134], [-38, 0], [-20, 30], [0, 38], [181, 99], [405, 99], [446, 61],
  [440, 30], [350, -120], [325, -118], [300, -112], [242, -32], [30, -168],
  [0, -172], [-28, -162],
]);
const plate = linearExtrude({ h: H }, outline);
const boss = (x, y, r, h) => translate([x, y, 0], cylinder({ r, h }));
let body = plate;
body = union(body, boss(0, 0, 40, HA));
body = union(body, boss(0, -134, 40, H));
body = union(body, boss(181, 56, 35, H));
body = union(body, boss(408, 61, 40, H));
body = union(body, boss(325, -83, 40, H));
const gusset = translate([0, -5, 0], rotate([90, 0, 0], linearExtrude({ h: 10 }, polygon([[30, H - 0.5], [88, H - 0.5], [30, 106]]))));
body = union(body, translate([0, 10, 0], gusset));
const pocket = (pts) => translate([0, 0, floor], linearExtrude({ h: H + 10 }, polygon(pts)));
body = difference(body, pocket([[48, 40], [140, 72], [150, 12], [48, 8]]));
body = difference(body, pocket([[45, -35], [225, -35], [40, -150], [25, -95], [20, -60]]));
body = difference(body, pocket([[245, 89], [298, 89], [300, -35], [280, -50], [252, -20]]));
body = difference(body, pocket([[320, 89], [372, 89], [380, 40], [345, -45], [318, -45]]));
const holes = [[0, 0, HA], [0, -134, H], [181, 56, H], [287, 12, H], [408, 61, H], [325, -83, H]];
for (const [x, y, z] of holes) {
  body = difference(body, translate([x, y, -1], cylinder({ d: holeD, h: z + 2 })));
}
return body;