const C = 45, FD = 90, FT = 10, HD = 45, HH = 40;
const bore = 25, kw = 8, kl = 7, kyC = 57.5;
const pcdR = 36, boltD = 6.6, setD = 5, setDepth = 12, setZ = 28;

let part = union(
  translate([C, C, 0], cylinder({ d: FD, h: FT })),
  translate([C, C, 0], cylinder({ d: HD, h: HH })),
);

part = difference(part, translate([C, C, -1], cylinder({ d: bore, h: HH + 2 })));
part = difference(part, translate([C - kw / 2, kyC - kl / 2, -1], cube([kw, kl, HH + 2])));

for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = difference(part, translate([C + pcdR * Math.cos(a), C + pcdR * Math.sin(a), -1],
    cylinder({ d: boltD, h: FT + 2 })));
}

part = difference(part, drill([C, C - HD / 2, setZ], [0, -1, 0], { d: setD, depth: setDepth }));
part = difference(part, drill([C + HD / 2, C, setZ], [1, 0, 0], { d: setD, depth: setDepth }));

return part;