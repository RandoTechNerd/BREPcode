const L = 100, C = 152.2, SX = 97, SZ = 99;
const RB = 85, BC = 97.5;
const cylY = (x, z, r, y0, y1) => translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h: y1 - y0 })));

// octagon prism along Y
const oct = [[SX, C - SX], [C - SZ, SZ], [-(C - SZ), SZ], [-SX, C - SX], [-SX, -(C - SX)], [-(C - SZ), -SZ], [C - SZ, -SZ], [SX, -(C - SX)]];
const prism = rotate([-90, 0, 0], linearExtrude({ h: L }, polygon(oct.map(([x, z]) => [x, -z]))));

// side tabs: straight to y 34, R11 end around the hole (ends at y 45)
const TO = 101.6;
const tab = (s) => s > 0
  ? union(translate([96.5, 0, -11], cube([TO - 96.5, 34, 22])),
          translate([96.5, 34, 0], rotate([0, 90, 0], cylinder({ r: 11, h: TO - 96.5 }))))
  : union(translate([-TO, 0, -11], cube([TO - 96.5, 34, 22])),
          translate([-TO, 34, 0], rotate([0, 90, 0], cylinder({ r: 11, h: TO - 96.5 }))));

// top boss with lobes
const BZ0 = 95, BZ1 = 119;
const lobes = [];
for (let i = 0; i < 6; i++) {
  const a = i * 60 * Math.PI / 180;
  lobes.push(translate([38 * Math.cos(a), 50 + 38 * Math.sin(a), BZ0], cylinder({ r: 7.5, h: BZ1 - BZ0 })));
}
const boss = union(translate([0, 50, BZ0], cylinder({ r: 37.5, h: BZ1 - BZ0 })), ...lobes);

let part = union(prism, tab(1), tab(-1), boss);

// cavities: profile (r, y) lathed about Z, then Z -> +Y
const lathe = (pts) => rotate([-90, 0, 0], revolve(360, polygon(pts)));
const frontCut = lathe([
  [0, -1], [RB, -1], [RB, 45], [42.15, 29.4], [30, 29.4], [30, 45], [25, 45], [25, 54.3], [0, 54.3],
]);
const rearCut = lathe([
  [0, 53.8], [30, 53.8], [30, 69.5], [42.15, 69.5], [RB, 55], [RB, L + 1], [0, L + 1],
]);
part = difference(part, frontCut);
part = difference(part, rearCut);

// lens: web above z 58 removed under the boss
part = difference(part, intersection(cylY(0, 0, RB, 38, 62), translate([-90, 37, 58], cube([180, 26, 40]))));

// boss bore Ø65, Ø35 and Ø27 drillings into the hub bore
part = difference(part, translate([0, 50, 58], cylinder({ r: 32.5, h: BZ1 - 58 + 1 })));
part = difference(part, translate([0, 50, 42], cylinder({ r: 17.5, h: 17 })));
part = difference(part, translate([0, 50, 20], cylinder({ r: 13.5, h: 23 })));

// 8X Ø10 thru on Ø195
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  const t = a * Math.PI / 180;
  part = difference(part, cylY(BC * Math.cos(t), BC * Math.sin(t), 5, -1, L + 1));
}
// 7X Ø27.5 thru the web on Ø130
for (const a of [18, 162, 198, 234, 270, 306, 342]) {
  const t = a * Math.PI / 180;
  part = difference(part, cylY(65 * Math.cos(t), 65 * Math.sin(t), 13.75, 15, 85));
}
// tab holes
part = difference(part, drill([TO, 34, 0], [1, 0, 0], { d: 10, depth: 11 }));
part = difference(part, drill([-TO, 34, 0], [-1, 0, 0], { d: 10, depth: 11 }));

// 6X Ø7 in the boss
for (let i = 0; i < 6; i++) {
  const a = i * 60 * Math.PI / 180;
  part = difference(part, drill([38 * Math.cos(a), 50 + 38 * Math.sin(a), BZ1], [0, 0, 1], { d: 7, depth: 20 }));
}

// slot pockets (25 wide, 20 c-c, 10 deep) on all four diagonal flats; 4X Ø10 on the upper two
const SD = 10, h2 = 0.7071;
const slotCut = (ctr, theta) => translate(ctr, rotate([0, theta, 0],
  hull({ exact: true },
    translate([0, -10, -SD], cylinder({ r: 12.5, h: SD + 2 })),
    translate([0, 10, -SD], cylinder({ r: 12.5, h: SD + 2 })),
  )));
const PZ = C - 75;
for (const s of [1, -1]) {
  // upper flat
  const P0 = [75 * s, 50, PZ];
  const n = [h2 * s, 0, h2];
  const u = [-h2 * s, 0, h2];
  part = difference(part, slotCut([P0[0] - 2.5 * u[0], 50, P0[2] - 2.5 * u[2]], 45 * s));
  for (const k of [-12.5, 12.5]) {
    for (const y of [20, 80]) {
      part = difference(part, drill([P0[0] + k * u[0], y, P0[2] + k * u[2]], n, { d: 10, depth: 25 }));
    }
  }
  // lower flat
  part = difference(part, slotCut([75 * s, 50, -PZ], 135 * s));
}

// SKIP R7/R1.5/R5/R3/R2.5/R10 rounds: small blends kept off for a robust exact solid
// SKIP ribs/pockets on the web faces: rib geometry not dimensioned
return part;