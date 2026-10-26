const T = 3;
const box = (x0, x1, y0, y1) => translate([x0, y0, 0], cube([x1 - x0, y1 - y0, T]));
const hole = (x, y, d) => translate([x, y, -1], cylinder({ d, h: T + 2 }));
const slot = (x0, y0, x1, y1, w) => hull({ exact: true },
  translate([x0, y0, -1], cylinder({ d: w, h: T + 2 })),
  translate([x1, y1, -1], cylinder({ d: w, h: T + 2 })));

const body = union(
  box(0, 35, 5, 38.8),
  box(34.5, 175, 0, 38.8),
  box(174.4, 332, -28.4, 43.5),
  box(174, 300, 43, 60.6),
  box(56, 175, 38, 99),
  box(27, 128, 98.5, 146.1),
  box(128, 170, 86, 151.4),
  translate([41.5, 131.1, 0], cylinder({ r: 15, h: T })),
  translate([162, 151.4, 0], cylinder({ r: 9, h: T })),
);

let part = body;
part = difference(part, hole(41.5, 131.1, 8));
part = difference(part, slot(70, 131.1, 76, 131.1, 4.4));
part = difference(part, hole(111.8, 134, 8));
part = difference(part, hole(162, 151.4, 6));
part = difference(part, hole(154.2, 118.4, 17));
part = difference(part, slot(84.4, 75, 102.4, 93.4, 6));
part = difference(part, hole(13.7, 27.5, 6));
part = difference(part, hole(8.9, 13.5, 5));
part = difference(part, hole(83.5, 14.2, 6));
part = difference(part, hole(232.6, 33, 6));
part = difference(part, hole(320.4, 33, 6));
part = difference(part, hole(245.8, -18.9, 8));
return part;