const H = 81, t = 2, R = 90, LX = -105, LR = 40, FT = 2;
const PIPE_Z = 134, TOP = 146, PO = 25.5, PI = 22.5, CB = 60;

const flangePts = [[-150,-22],[-150,22],[-88,95],[0,105],[85,97],[105,15],[105,-15],[85,-97],[0,-105],[-88,-95]];
const flange = linearExtrude({ h: FT }, polygon(flangePts));

const foot = (off, z0, h) => union(
  translate([0, 0, z0], cylinder({ r: R - off, h })),
  translate([LX, 0, z0], cylinder({ r: LR - off, h })),
  translate([LX, -(LR - off), z0], cube([-LX, 2 * (LR - off), h])),
);

const outer = union(
  foot(0, 0, H),
  intersection(
    translate([LX, 0, H - 2], cylinder({ r1: CB, r2: PO, h: PIPE_Z - (H - 2) })),
    foot(0, H - 3, 70),
  ),
  translate([LX, 0, PIPE_Z - 0.5], cylinder({ r: PO, h: TOP - PIPE_Z + 0.5 })),
  flange,
);

const inner = union(
  foot(t, -1, H - t + 1),
  intersection(
    translate([LX, 0, H - t - 0.5], cylinder({ r1: CB - t, r2: PI, h: PIPE_Z - (H - t - 0.5) })),
    foot(t, H - t - 1, 70),
  ),
  translate([LX, 0, PIPE_Z - 0.5], cylinder({ r: PI, h: TOP - PIPE_Z + 2 })),
);

let part = difference(outer, inner);
part = difference(part, translate([0, 0, H - 5], cylinder({ r: 25, h: 10 })));

const holes = [[-75, 78], [-75, -78], [70, 80], [70, -80]];
for (const [x, y] of holes) {
  part = difference(part, translate([x, y, -1], cylinder({ r: 6, h: FT + 2 })));
}
return part;