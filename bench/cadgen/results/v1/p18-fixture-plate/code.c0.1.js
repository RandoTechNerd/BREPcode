const L = 160, W = 100, T = 15;
const top = T;

let part = cube([L, W, T]);

// A: 4X Ø9 THRU with counterbore Ø15 x 9 deep
for (const [x, y] of [[10, 10], [150, 10], [10, 90], [150, 90]]) {
  part = difference(part, drill([x, y, top], [0, 0, 1], { d: 9, through: true, cbore: { d: 15, depth: 9 } }));
}

// B: 2X Ø8 x 10 deep
for (const [x, y] of [[10, 50], [150, 50]]) {
  part = difference(part, drill([x, y, top], [0, 0, 1], { d: 8, depth: 10 }));
}

// C: 15X Ø6.8 x 12 deep, 25 mm pitch grid starting at (30, 25)
const grid = [];
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 3; j++) {
    grid.push(drill([30 + 25 * i, 25 + 25 * j, top], [0, 0, 1], { d: 6.8, depth: 12 }));
  }
}
part = difference(part, ...grid);

return part;