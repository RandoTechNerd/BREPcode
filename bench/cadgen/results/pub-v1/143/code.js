const H = 58, FLOOR = 14, PD = H - FLOOR;

const outline = polygon([
  [2.1, 31.9], [2.1, 47.9], [79.8, 191.5], [98.9, 196.8], [122.3, 186.2],
  [164.9, 164.9], [335.1, 164.9], [351.1, 170.2], [364.9, 207.4], [388.3, 218.1],
  [414.9, 212.8], [594.7, 53.2], [590.4, 26.6], [563.8, 7.4], [537.2, 7.4],
  [379.8, 47.9], [266, 44.7], [124.5, -18.1], [111.7, -26.6], [69.1, 3.2], [13.8, 10.6],
]);
let part = linearExtrude({ h: H }, outline);

// top pockets, floor 14 thick
const rpocket = (x0, y0, x1, y1) =>
  translate([x0, y0, FLOOR], fillet({ r: 4, edges: "z" }, cube([x1 - x0, y1 - y0, PD + 2])));
const pockets = [
  translate([0, 0, FLOOR], linearExtrude({ h: PD + 2 }, polygon([[111.7, 138.3], [45.7, 47.9], [148.9, 42.6]]))),
  rpocket(225, 92, 265, 150),
  rpocket(272, 110, 327, 153),
  rpocket(346, 85, 385, 160),
  rpocket(405, 120, 450, 165),
  translate([0, 0, FLOOR], hull({ exact: true },
    translate([440, 80, 0], cylinder({ r: 12, h: PD + 2 })),
    translate([528, 50, 0], cylinder({ r: 12, h: PD + 2 })))),
];
for (const p of pockets) part = difference(part, p);

// vertical through holes
const holes = [
  [99, 175.5, 23.35], [194.7, 58.5, 21.06], [202, 133, 22.78], [210.6, 95.7, 12.48],
  [308.5, 92.6, 5.36], [327.7, 101, 11.57], [388.3, 189.4, 29.01], [563.8, 37.2, 26.47],
  [479.8, 111.7, 21.06], [31.9, 24.5, 11.33], [81.9, 18.1, 11.33], [404, 117, 4.0], [420, 112, 4.0],
];
for (const [x, y, d] of holes) {
  part = difference(part, translate([x, y, -1], cylinder({ d, h: H + 2 })));
}

return part;