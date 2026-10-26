const W = 70, D = 70, T = 6;
const cornerD = 5.5, cornerAt = [6, 64];
const motorD = 3.4, motorAt = [19.5, 50.5], cbD = 6.5, cbDepth = 3.5;
const boreD = 22.5, C = 35;

let plate = cube([W, D, T]);

plate = difference(plate, drill([C, C, T], [0, 0, 1], { d: boreD, through: true }));

for (const x of cornerAt) for (const y of cornerAt) {
  plate = difference(plate, drill([x, y, T], [0, 0, 1], { d: cornerD, through: true }));
}

for (const x of motorAt) for (const y of motorAt) {
  plate = difference(plate, drill([x, y, T], [0, 0, 1], {
    d: motorD, through: true, cbore: { d: cbD, depth: cbDepth },
  }));
}

return plate;