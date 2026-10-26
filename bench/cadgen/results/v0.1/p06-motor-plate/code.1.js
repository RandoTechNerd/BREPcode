const W = 70, D = 70, T = 6;
const cornerD = 5.5, cornerAt = [6, 64];
const cbAt = [19.5, 50.5], cbHoleD = 3.4, cbD = 6.5, cbDepth = 3.5;
const boreD = 22.5, boreAt = 35;

let part = cube([W, D, T]);
part = difference(part, drill([boreAt, boreAt, T], [0, 0, 1], { d: boreD, through: true }));
for (const x of cornerAt) for (const y of cornerAt)
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: cornerD, through: true }));
for (const x of cbAt) for (const y of cbAt)
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: cbHoleD, through: true, cbore: { d: cbD, depth: cbDepth } }));
return part;
