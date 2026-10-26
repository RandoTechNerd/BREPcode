const L = 160, W = 100, T = 15;

let part = cube([L, W, T]);

// A: four counterbored through holes at the corners
for (const [x, y] of [[10, 10], [150, 10], [10, 90], [150, 90]]) {
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: 9, through: true, cbore: { d: 15, depth: 9 } }));
}

// B: two blind dowel holes
for (const [x, y] of [[10, 50], [150, 50]]) {
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: 8, depth: 10 }));
}

// C: grid of 15 blind holes
const grid = [];
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 3; j++) {
    grid.push(drill([30 + 25 * i, 25 + 25 * j, T], [0, 0, 1], { d: 6.8, depth: 12 }));
  }
}
part = difference(part, ...grid);

return part;
