const W = 110, D = 110, T = 8, cornerR = 5;
const P = 70, pocketDepth = 3, pocketR = 6;
const holeD = 5.5, cskD = 11, cskAngle = 90;

let part = fillet({ r: cornerR, edges: "z" }, cube([W, D, T]));

const pocket = translate([(W - P) / 2, (D - P) / 2, T - pocketDepth],
  fillet({ r: pocketR, edges: "z" }, cube([P, P, pocketDepth + 1])));
part = difference(part, pocket);

const pts = [[10, 10], [55, 10], [100, 10], [10, 55], [100, 55], [10, 100], [55, 100], [100, 100]];
for (const [x, y] of pts) {
  part = difference(part,
    drill([x, y, T], [0, 0, 1], { d: holeD, through: true, csink: { d: cskD, angle: cskAngle } }));
}

return part;