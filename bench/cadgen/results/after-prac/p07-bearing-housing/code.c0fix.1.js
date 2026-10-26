const W = 100, T = 12, H = 42, R = 10;
const bossD = 76, boreD = 40, cbD = 52, cbDepth = 15;
const holeD = 9, inset = 12;
const cx = W / 2, cy = W / 2;

// flange with R10 vertical corners, filleted before the union
const flange = fillet({ r: R, edges: "z" }, cube([W, W, T]));
// boss runs 0.5 mm down into the flange so the two pieces fuse
const boss = translate([cx, cy, T - 0.5], cylinder({ d: bossD, h: H - T + 0.5 }));

let part = union(flange, boss);

// Ø40 bore through, with a Ø52 counterbore 15 deep from the top face
part = difference(part, drill([cx, cy, H], [0, 0, 1], { d: boreD, through: true, cbore: { d: cbD, depth: cbDepth } }));

// 4X Ø9 through holes in the flange
for (const [x, y] of [[inset, inset], [W - inset, inset], [inset, W - inset], [W - inset, W - inset]]) {
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: holeD, through: true }));
}

return part;