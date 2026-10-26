const H = 40, AW = 85.41, IW = 61.41, AL = 81.43, PLATE = 12, ANG = 15.37, OFF = -3.5;
const RING_R = 50, BORE_R = 38, HOLE_R = 2.5, HR = 56.3, EAR_R = 5.5, CZ = 10;
const SLOT_D = 62.43, SLOT_C = IW / 2, SLOT_R = 4;
const WALL_V = IW / 2 + 6;

const armLocal = () => {
  let a = translate([-10, OFF - AW / 2, 0], cube([AL + 10, AW, H]));
  a = difference(a, translate([-11, OFF - IW / 2, -1], cube([AL + 12, IW, H - PLATE + 1])));
  a = difference(a, hull({ exact: true },
    translate([SLOT_D, OFF - SLOT_C, H - PLATE - 1], cylinder({ r: SLOT_R, h: PLATE + 2 })),
    translate([SLOT_D, OFF + SLOT_C, H - PLATE - 1], cylinder({ r: SLOT_R, h: PLATE + 2 }))));
  for (const u of [AL - 6, 42]) {
    for (const s of [-1, 1]) {
      a = difference(a, drill([u, OFF + s * WALL_V, 0], [0, 0, -1], { d: 5, depth: 10 }));
    }
  }
  return a;
};

const right = rotate([0, 0, ANG], armLocal());
const left = mirror([1, 0, 0], right);

const holeAngles = [90 - 20.91, 90 + 20.91, -90 + 38.29, -90 - 38.29];
const ears = holeAngles.map(d => {
  const a = d * Math.PI / 180;
  return translate([HR * Math.cos(a), HR * Math.sin(a), CZ], cylinder({ r: EAR_R, h: H - CZ }));
});

let body = union(
  right,
  left,
  translate([0, 0, CZ], cylinder({ r: RING_R, h: H - CZ })),
  ...ears,
);

body = difference(body, translate([0, 0, -1], cylinder({ r: RING_R, h: CZ + 1 })));
body = difference(body, translate([0, 0, -1], cylinder({ r: BORE_R, h: H + 2 })));
for (const d of holeAngles) {
  const a = d * Math.PI / 180;
  body = difference(body, translate([HR * Math.cos(a), HR * Math.sin(a), -1], cylinder({ r: HOLE_R, h: H + 2 })));
}
return body;