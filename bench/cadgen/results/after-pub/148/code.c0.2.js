const L = 100, C = 152, SX = 97, SZ = 101;
const RB = 85, BC = 97.5;
const cylY = (x, z, r, y0, y1) => translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h: y1 - y0 })));

// octagon prism along Y
const oct = [[SX, C - SX], [C - SZ, SZ], [-(C - SZ), SZ], [-SX, C - SX], [-SX, -(C - SX)], [-(C - SZ), -SZ], [C - SZ, -SZ], [SX, -(C - SX)]];
const prism = rotate([-90, 0, 0], linearExtrude({ h: L }, polygon(oct.map(([x, z]) => [x, -z]))));

// side tabs
const tabs = union(
  translate([96.5, 0, -11], cube([4.5, 50, 22])),
  translate([-101, 0, -11], cube([4.5, 50, 22])),
);

// top boss with lobes
const BZ0 = 90, BZ1 = 119;
const lobes = [];
for (let i = 0; i < 6; i++) {
  const a = i * 60 * Math.PI / 180;
  lobes.push(translate([38 * Math.cos(a), 50 + 38 * Math.sin(a), BZ0], cylinder({ r: 7.5, h: BZ1 - BZ0 })));
}
const boss = union(translate([0, 50, BZ0], cylinder({ r: 37.5, h: BZ1 - BZ0 })), ...lobes);

let part = union(prism, tabs, boss);

// cavities as lathe cutters (SECTION B-B half-section, r along X, y along Y of the profile)
// rotate([-90,0,0]) maps profile (r, y) -> revolve about Z then Z -> +Y
const lathe = (pts) => rotate([-90, 0, 0], revolve(360, polygon(pts.map(([r, y]) => [r, -y]))));
const frontCut = lathe([
  [0, -1], [RB, -1], [RB, 45], [42.15, 29.4], [30, 29.4], [30, 45], [25, 45], [25, 54.3], [0, 54.3],
]);
const rearCut = lathe([
  [0, 53.8], [30, 53.8], [30, 69.5], [42.15, 69.5], [RB, 55], [RB, L + 1], [0, L + 1],
]);
part = difference(part, frontCut);
part = difference(part, rearCut);

// 8X Ø10 thru on Ø195
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  const t = a * Math.PI / 180;
  part = difference(part, cylY(BC * Math.cos(t), BC * Math.sin(t), 5, -1, L + 1));
}
// 7X Ø27.5 thru on Ø130
for (const a of [18, 162, 198, 234, 270, 306, 342]) {
  const t = a * Math.PI / 180;
  part = difference(part, cylY(65 * Math.cos(t), 65 * Math.sin(t), 13.75, 15, 85));
}
// tab holes
part = difference(part, drill([101, 34, 0], [1, 0, 0], { d: 10, depth: 11 }));
part = difference(part, drill([-101, 34, 0], [-1, 0, 0], { d: 10, depth: 11 }));

// boss bore, Ø27 drilling, 6X Ø7
part = difference(part, translate([0, 50, 40], cylinder({ r: 32.5, h: BZ1 - 40 + 1 })));
part = difference(part, translate([0, 50, 24], cylinder({ r: 13.5, h: 17 })));
for (let i = 0; i < 6; i++) {
  const a = i * 60 * Math.PI / 180;
  part = difference(part, drill([38 * Math.cos(a), 50 + 38 * Math.sin(a), BZ1], [0, 0, 1], { d: 7, depth: 20 }));
}

// pads on the upper diagonal flats: 4X Ø10 (60 x 25) and a slot pocket
const SD = 8;
for (const s of [1, -1]) {
  const P0 = [71 * s, 50, 81];
  const n = [0.7071 * s, 0, 0.7071];
  const u = [-0.7071 * s, 0, 0.7071];
  const slot = translate(P0, rotate([0, 45 * s, 0], translate([2.5 * s, 0, 0],
    hull({ exact: true },
      translate([0, -10, -SD], cylinder({ r: 12.5, h: SD + 2 })),
      translate([0, 10, -SD], cylinder({ r: 12.5, h: SD + 2 })),
    ))));
  part = difference(part, slot);
  for (const k of [-12.5, 12.5]) {
    for (const y of [20, 80]) {
      part = difference(part, drill([P0[0] + k * u[0], y, P0[2] + k * u[2]], n, { d: 10, depth: 30 }));
    }
  }
}

// SKIP R7/R1.5/R5/R3/R2.5/R10 rounds: small blends kept off to stay on the exact lane
// SKIP ribs/pockets on the web front face: rib geometry not fully dimensioned
// SKIP lens cavity R35 in A-A: approximated by the Ø65 boss bore
return part;