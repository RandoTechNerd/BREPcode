const PT = 25, ZB = 111, ZT = 138, PD = 50, hd = 8;
const box = (x0, y0, z0, x1, y1, z1) => translate([x0, y0, z0], cube([x1 - x0, y1 - y0, z1 - z0]));
const rbox = (x0, y0, z0, x1, y1, z1, r) => translate([x0, y0, z0], fillet({ r, edges: "z" }, cube([x1 - x0, y1 - y0, z1 - z0])));
const post = (x, y, r, z0, z1) => translate([x, y, z0], cylinder({ r, h: z1 - z0 }));

const plate = rbox(-150, -111.75, 0, 150, 103.75, PT, 12.5);
const lower = box(-125, -72.25, PT - 0.5, 125, 80, ZB);
const lobes = [-105, -25, 55].map(x => post(x, -72.25, 20, PT - 0.5, ZB));
const boss = post(125, 11, 15, PT - 0.5, ZB);
const deck1 = box(-125, -34, ZB - 0.5, 105, 71, ZT);
const deck2 = box(-125, -61, ZB - 0.5, -35, -33.5, ZT);
const bump = post(-73.75, 69.75, 12.5, ZB - 0.5, ZT);

let part = union(plate, lower, ...lobes, boss, deck1, deck2, bump);

const zP = ZT - PD;
part = difference(part,
  rbox(-113, -9.5, zP, -52.5, 59, ZT + 1, 5),
  rbox(-32.5, -22, zP, 47.3, 59, ZT + 1, 5),
  rbox(53.3, -22, zP, 93, 59, ZT + 1, 5),
  rbox(-113, -49, zP, -47, -17, ZT + 1, 5),
);

const holes = [
  [-135, 86.75], [110, 86.75], [135, 86.75], [-137.5, -95.25], [135, -83.25],
  [-73.75, 69.75], [-110, 56.75], [-37.5, 56.75], [90, 56.75], [-42.5, 1.75],
  [-37.5, -18.25], [90, -18.25], [-110, -48.25], [-43, -55.75],
  [-105, -72.25], [-25, -72.25], [55, -72.25],
];
part = difference(part,
  ...holes.map(([x, y]) => post(x, y, hd / 2, -1, ZT + 1)),
  post(125, 11, 5, -1, ZT + 1),
);

return part;