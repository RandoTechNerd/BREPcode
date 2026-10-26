const L = 100;
const S2 = Math.SQRT1_2;
const along = (s) => rotate([-90, 0, 0], s); // local Z -> world Y
const rad = (a) => a * Math.PI / 180;
// cylinder along Y from y0 to y1, radius r (or cone r1 at y0 -> r2 at y1)
const ycyl = (r, y0, y1) => translate([0, y0, 0], along(cylinder({ r, h: y1 - y0 })));
const ycone = (r1, r2, y0, y1) => translate([0, y0, 0], along(cylinder({ r1, r2, h: y1 - y0 })));

// octagon prism along Y
const oct = [[-48, 96], [48, 96], [96, 48], [96, -48], [44, -100], [-44, -100], [-96, -48], [-96, 48]];
const body = along(linearExtrude({ h: L }, polygon(oct.map(([x, z]) => [x, -z]))));

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
const tube = union(
  translate([0, 50, TZ0], cylinder({ r: 37.5, h: TZ1 - TZ0 })),
  ...angs.map((a) => translate([PCD * Math.cos(rad(a)), 50 + PCD * Math.sin(rad(a)), TZ0], cylinder({ r: 7.5, h: TZ1 - TZ0 }))),
);

let part = union(body, tab(1), tab(-1), tube);

// W: cavities with a conical web (slope 2.626 mm radius per mm of Y)
const k = (86 - 42.15) / (47.1 - 30.4);
const rTop = 42.15 + 17.7 * k;
const frontCav = difference(ycyl(85, -1, 47.1), ycone(42.15, rTop, 30.4, 30.4 + 17.7));
const backCav = difference(ycyl(85, 53.9, L + 1), ycone(rTop, 42.15, 70.6 - 17.7, 70.6));
part = difference(part, frontCav);
part = difference(part, backCav);

// hub bore
part = difference(part, ycyl(25, 29, 72));
part = difference(part, ycyl(30, 29, 46.7));
part = difference(part, ycyl(30, 54.3, 72));

// E: tube bore Ø65 down to z=45
part = difference(part, translate([0, 50, 45], cylinder({ r: 32.5, h: TZ1 - 45 + 1 })));
// F: Ø27 hole into hub with Ø35 counterbore below the tube floor
part = difference(part, translate([0, 50, 14], cylinder({ r: 13.5, h: 32 })));
part = difference(part, translate([0, 50, 42], cylinder({ r: 17.5, h: 4 })));
// D: 6X Ø7 tube holes
for (const a of angs) {
  part = difference(part, translate([PCD * Math.cos(rad(a)), 50 + PCD * Math.sin(rad(a)), TZ1 - 25], cylinder({ r: 3.5, h: 26 })));
}

// B: 8X Ø10 THRU on Ø195
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  part = difference(part, translate([97.5 * Math.cos(rad(a)), 0, 97.5 * Math.sin(rad(a))], ycyl(5, -1, L + 1)));
}

// C: 7X Ø27.5 THRU on Ø130
for (const a of [18, 162, 198, 234, 270, 306, 342]) {
  part = difference(part, translate([65 * Math.cos(rad(a)), 0, 65 * Math.sin(rad(a))], ycyl(13.75, 20, 80)));
}

// J: tab holes Ø10, 11 deep
part = difference(part, translate([90.1, 66, 0], rotate([0, 90, 0], cylinder({ r: 5, h: 12 }))));
part = difference(part, translate([-102.1, 66, 0], rotate([0, 90, 0], cylinder({ r: 5, h: 12 }))));

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
  for (const s of [-1, 1]) {
    for (const Y of [20, 80]) {
      const hole = translate([cx + 12.5 * s * dx, Y, cz + 12.5 * s * dz], rotate([0, b, 0], translate([0, 0, -20], cylinder({ r: 5, h: 21 }))));
      part = difference(part, hole);
    }
  }
}

// SKIP T-R10: concave R10 blends between the tube lobes are not modelled
// SKIP fillets R5/R3/R2.5/R1.5/R7: small blends omitted for a robust exact solid
// SKIP rib pockets: the web face relief is not quantified; the web is modelled solid per Section A-A
return part;