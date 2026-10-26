const box = (x0, x1, y0, y1, z0, z1) => translate([x0, y0, z0], cube([x1 - x0, y1 - y0, z1 - z0]));

const flange = translate([-72.5, -25, 8], fillet({ r: 5, edges: "z" }, cube([145, 50, 2])));
const tabs = union(
  box(-47.5, -33.5, 24.5, 35, 8, 10),
  box(33.5, 47.5, 24.5, 35, 8, 10),
  box(-30, -16, -33, -24.5, 8, 10),
  box(16, 30, -33, -24.5, 8, 10),
);
const trayOuter = box(-70.5, 70.5, -18.5, 18.5, 3, 8.5);
const deepOuter = union(
  box(-67, -12, -12.5, 12.5, 0, 3.5),
  box(-14, 5, -10, 8, 0, 3.5),
);

let part = union(flange, tabs, trayOuter, deepOuter);

part = difference(part, box(-68.5, 68.5, -16.5, 16.5, 5, 11));
part = difference(part, box(-65, -14, -10.5, 10.5, 2, 6));
part = difference(part, box(-14, 3, -8, 6, 2, 6));

const plateHoles = [[-55, 19], [-55, -19], [53.5, 19], [53.5, -19], [19, 19], [-4, -19]];
for (const [x, y] of plateHoles) {
  const boss = y > 0 ? box(x - 3.5, x + 3.5, 13, 18, 3.5, 10) : box(x - 3.5, x + 3.5, -18, -13, 3.5, 10);
  part = union(part, boss);
}

part = difference(part, box(38.5, 48.5, -9, 1, 2, 6));
part = difference(part, box(25, 30, 12.5, 16, 2, 6));
part = difference(part, hull({ exact: true },
  translate([-40.5, 14.5, 2], cylinder({ r: 1.8, h: 4 })),
  translate([-19.5, 14.5, 2], cylinder({ r: 1.8, h: 4 })),
));

const holes = [...plateHoles, [-40.5, 26.3], [40.5, 26.3], [-23, -29], [23, -29]];
for (const [x, y] of holes) {
  part = difference(part, drill([x, y, 10], [0, 0, 1], { d: 3, through: true }));
}

return part;