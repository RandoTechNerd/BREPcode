const R = 70, T = 14, H = 36, hubR = 35, boreD = 40, pcdR = 55, holeD = 13.5, C = 2;

// flange disc with its C2 top edge: the cone reaches r=70 at z=12 and r=68 at z=14
const flange = intersection(
  cylinder({ r: R, h: T }),
  cylinder({ r1: R + (T - C), r2: R - C, h: T }),
);

const hub = translate([0, 0, T - 0.5], cylinder({ r: hubR, h: H - T + 0.5 }));

let part = union(flange, hub);

part = difference(part, translate([0, 0, -1], cylinder({ r: boreD / 2, h: H + 2 })));

for (let i = 0; i < 6; i++) {
  const a = (i * 60) * Math.PI / 180;
  part = difference(part,
    translate([pcdR * Math.cos(a), pcdR * Math.sin(a), -1], cylinder({ r: holeD / 2, h: T + 2 })));
}

return part;
