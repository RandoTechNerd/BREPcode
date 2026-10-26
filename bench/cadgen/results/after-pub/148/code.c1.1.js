const L = 100;
const S2 = Math.SQRT1_2;
const along = (s) => rotate([-90, 0, 0], s); // maps Z to Y

// octagon prism along Y
const oct = [[-48, 96], [48, 96], [96, 48], [96, -48], [44, -100], [-44, -100], [-96, -48], [-96, 48]];
const body = along(linearExtrude({ h: L }, polygon(oct.map(([x, z]) => [x, -z]))));
const bore = along(translate([0, 0, -1], cylinder({ r: 85, h: L + 2 })));

// web: half-section from B-B (r, Y), a ring spun about Y
const web = along(revolve(360, polygon([
  [25, 46.7], [30, 46.7], [30, 30.4], [42.15, 30.4], [86, 47.1],
  [86, 53.9], [42.15, 70.6], [30, 70.6], [30, 54.3], [25, 54.3],
])));

// side tabs
const tab = (s) => {
  const x0 = s > 0 ? 95 : -101.1;
  return union(
    translate([x0, 66, -11], cube([6.1, 34, 22])),
    translate([x0, 66, 0], rotate([0, 90, 0], cylinder({ r: 11, h: 6.1 }))),
  );
};

// top tube with 6 lobes
const TZ0 = 90, TZ1 = 118, PCD = 37.5;
const angs = [0, 60, 120, 180, 240, 300];
const rad = (a) => a * Math.PI / 180;
const tube = union(
  translate([0, 50, TZ0], cylinder({ r: 37.5, h: TZ1 - TZ0 })),
  ...angs.map((a) => translate([PCD * Math.cos(rad(a)), 50 + PCD * Math.sin(rad(a)), TZ0], cylinder({ r: 7.5, h: TZ1 - TZ0 }))),
);

let part = union(difference(body, bore), web, tab(1), tab(-1), tube);

// E: tube bore Ø65 down to z=45
part = difference(part, translate([0, 50, 45], cylinder({ r: 32.5, h: TZ1 - 45 + 1 })));
// F: Ø27 hole into hub, Ø35 counterbore
part = difference(part, drill([0, 50, 45], [0, 0, 1], { d: 27, depth: 30, cbore: { d: 35, depth: 3 } }));
// D: 6X Ø7 tube holes
for (const a of angs) {
  part = difference(part, drill([PCD * Math.cos(rad(a)), 50 + PCD * Math.sin(rad(a)), TZ1], [0, 0, 1], { d: 7, depth: 25 }));
}

// B: 8X Ø10 THRU on Ø195
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  part = difference(part, drill([97.5 * Math.cos(rad(a)), 0, 97.5 * Math.sin(rad(a))], [0, -1, 0], { d: 10, through: true }));
}

// C: 7X Ø27.5 THRU on Ø130
for (const a of [18, 162, 198, 234, 270, 306, 342]) {
  part = difference(part, drill([65 * Math.cos(rad(a)), 0, 65 * Math.sin(rad(a))], [0, -1, 0], { d: 27.5, through: true }));
}

// J: tab holes Ø10, 11 deep
part = difference(part, drill([101.1, 66, 0], [1, 0, 0], { d: 10, depth: 11 }));
part = difference(part, drill([-101.1, 66, 0], [-1, 0, 0], { d: 10, depth: 11 }));

// G + H: slot and 4 holes on each diagonal flat
for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
  const b = Math.atan2(sx, sz) * 180 / Math.PI;
  const cx = 72 * sx, cz = 72 * sz;
  const dx = sx * S2, dz = -sz * S2;
  const slot = translate([cx + 2.5 * dx, 50, cz + 2.5 * dz], rotate([0, b, 0], hull({ exact: true },
    translate([0, -10, -10], cylinder({ r: 12.5, h: 11 })),
    translate([0, 10, -10], cylinder({ r: 12.5, h: 11 })),
  )));
  part = difference(part, slot);
  for (const k of [-1, 1]) {
    for (const Y of [20, 80]) {
      part = difference(part, drill([cx + 12.5 * k * dx, Y, cz + 12.5 * k * dz], [sx * S2, 0, sz * S2], { d: 10, depth: 20 }));
    }
  }
}

// SKIP T-R10: concave R10 blends between the tube lobes are not modelled
// SKIP fillets R5/R3/R2.5/R1.5/R7: small blends omitted for a robust exact solid
// SKIP rib pockets: the web face relief is not quantified; the web is modelled solid per Section B-B
return part;