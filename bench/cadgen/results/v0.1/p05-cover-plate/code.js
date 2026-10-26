const W = 110, D = 110, T = 8, R = 5;
const P = 70, PD = 3, PR = 6;
const plate = fillet({ r: R, edges: "z" }, cube([W, D, T]));
const pocketTool = translate([(W - P) / 2, (D - P) / 2, T - PD],
  fillet({ r: PR, edges: "z" }, cube([P, P, PD + 1])));
let part = difference(plate, pocketTool);
const pts = [[10,10],[55,10],[100,10],[10,55],[100,55],[10,100],[55,100],[100,100]];
for (const [x, y] of pts) {
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: 5.5, through: true, csink: { d: 11, angle: 90 } }));
}
return part;
