const L = 120, W = 80, T = 12, R = 8;
const holeD = 6.6, cbD = 11, cbDepth = 6.5;
const bigD = 30, bigX = 60, bigY = 40;
const slotW = 8, slotCC = 30, slotX = 60, slotY = 15;

let part = fillet({ r: R, edges: "z" }, cube([L, W, T]));

part = difference(part, translate([bigX, bigY, -1], cylinder({ r: bigD / 2, h: T + 2 })));

const slot = hull({ exact: true },
  translate([slotX - slotCC / 2, slotY, -1], cylinder({ r: slotW / 2, h: T + 2 })),
  translate([slotX + slotCC / 2, slotY, -1], cylinder({ r: slotW / 2, h: T + 2 })),
);
part = difference(part, slot);

for (const [x, y] of [[12, 12], [108, 12], [12, 68], [108, 68]]) {
  part = drill([x, y, T], [0, 0, 1], { d: holeD, through: true, cbore: { d: cbD, depth: cbDepth } }, part);
}

return part;