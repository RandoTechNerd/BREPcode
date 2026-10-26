const W = 120, D = 80, T = 12, R = 8;
const hx = [12, 108], hy = [12, 68];
const plate = fillet({ r: R, edges: "z" }, cube([W, D, T]));

let part = difference(
  plate,
  translate([60, 40, -1], cylinder({ r: 15, h: T + 2 })),
);

for (const x of hx) for (const y of hy) {
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: 6.6, through: true, cbore: { d: 11, depth: 6.5 } }));
}

const slot = hull({ exact: true },
  translate([45, 15, -1], cylinder({ r: 4, h: T + 2 })),
  translate([75, 15, -1], cylinder({ r: 4, h: T + 2 })),
);
part = difference(part, slot);

return part;
