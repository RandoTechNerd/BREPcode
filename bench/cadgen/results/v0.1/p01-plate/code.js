const W = 120, D = 80, T = 12, R = 8;
const holeD = 6.6, cbD = 11, cbDepth = 6.5;
const holeXs = [12, 108], holeYs = [12, 68];
const boreD = 30, boreX = 60, boreY = 40;
const slotW = 8, slotC = 30, slotX = 60, slotY = 15;

let part = fillet({ r: R, edges: "z" }, cube([W, D, T]));

for (const x of holeXs) {
  for (const y of holeYs) {
    part = difference(part, drill([x, y, T], [0, 0, 1], { d: holeD, through: true, cbore: { d: cbD, depth: cbDepth } }));
  }
}

part = difference(part, translate([boreX, boreY, -1], cylinder({ r: boreD / 2, h: T + 2 })));

const slot = hull({ exact: true },
  translate([slotX - slotC / 2, slotY, -1], cylinder({ r: slotW / 2, h: T + 2 })),
  translate([slotX + slotC / 2, slotY, -1], cylinder({ r: slotW / 2, h: T + 2 })),
);
part = difference(part, slot);

return part;
