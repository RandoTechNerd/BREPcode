const W = 110, T = 8, Rc = 5;
const P = 70, Pd = 3, Pr = 6;
const holeD = 5.5, cskD = 11;

let plate = fillet({ r: Rc, edges: "z" }, cube([W, W, T]));

// centred 70x70 pocket, 3 deep, R6 corners; cutter overshoots the top face by 1 mm
const pocket = translate([(W - P) / 2, (W - P) / 2, T - Pd],
  fillet({ r: Pr, edges: "z" }, cube([P, P, Pd + 1])));
plate = difference(plate, pocket);

const pts = [[10,10],[55,10],[100,10],[10,55],[100,55],[10,100],[55,100],[100,100]];
for (const [x, y] of pts) {
  plate = difference(plate,
    drill([x, y, T], [0, 0, 1], { d: holeD, through: true, csk: { d: cskD, angle: 90 } }));
}

return plate;
