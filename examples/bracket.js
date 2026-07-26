// A mounting bracket: a slab with four corner bolt holes and a lightening pocket.
// Run:  node ../src/cli.js bracket.js -o bracket.stl -D holeR=3

import {
  cube, cylinder, union, difference, translate,
} from "brepscript";

export default (params = {}) => {
  const W = params.width ?? 60;
  const D = params.depth ?? 40;
  const T = params.thickness ?? 6;
  const holeR = params.holeR ?? 2.5;
  const inset = params.inset ?? 7;

  const plate = cube([W, D, T]);

  const boltHole = (x, y) =>
    translate([x, y, -1], cylinder({ r: holeR, h: T + 2, $fn: 32 }));

  const bolts = union(
    boltHole(inset, inset),
    boltHole(W - inset, inset),
    boltHole(inset, D - inset),
    boltHole(W - inset, D - inset),
  );

  const pocket = translate([W / 2, D / 2, -1], cylinder({ r: 10, h: T + 2, $fn: 48 }));

  return difference(plate, bolts, pocket);
};
