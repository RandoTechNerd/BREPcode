// Housing: built along local Z (w = 0..100), up = +Y, then rotated so axis = world Y, up = world Z
const W = 100;
const rad = (a) => a * Math.PI / 180;

// octagon body
const oct = [[48, 96], [-48, 96], [-96, 48], [-96, -52], [-48, -100], [48, -100], [96, -52], [96, 48]];
let part = linearExtrude({ h: W }, polygon(oct));

// TAB: side tabs, 22 tall, w 0..34 + R11 end
const tab = (x0) => union(
  translate([x0, -11, 0], cube([6.1, 22, 34])),
  translate([x0, 0, 34], rotate([0, 90, 0], cylinder({ r: 11, h: 6.1 }))),
);

// T: top tube with 6 lobes on PCD 75 (along +Y)
const TY0 = 88, TY1 = 118, PR = 37.5, TW = 50;
const angs = [0, 60, 120, 180, 240, 300];
const ycyl = (x, z, r, y0, y1) => translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h: y1 - y0 })));
const tube = union(
  ycyl(0, TW, 40, TY0, TY1),
  ...angs.map((a) => ycyl(PR * Math.cos(rad(a)), TW + PR * Math.sin(rad(a)), 7.5, TY0, TY1)),
);

part = union(part, tab(95), tab(-101.1), tube);

// W: cavity at the tab end, Ø170 to w=30, cone from r42.15 @30 to r85 @45
part = difference(part, translate([0, 0, -1], cylinder({ r: 85, h: 31 })));
part = difference(part, translate([0, 0, 30], cylinder({ r1: 42.15, r2: 85.86, h: 15.3 })));
// W: cavity at the far end, Ø170 from w=70.5, cone from r85 @54.5 to r42.15 @70.5
part = difference(part, translate([0, 0, 70.5], cylinder({ r: 85, h: 31 })));
part = difference(part, translate([0, 0, 54.2], cylinder({ r1: 85.8, r2: 42.15, h: 16.3 })));

// hub bore steps
part = difference(part, translate([0, 0, 28], cylinder({ r: 25, h: 45 })));
part = difference(part, translate([0, 0, 28], cylinder({ r: 30, h: 17 })));
part = difference(part, translate([0, 0, 54], cylinder({ r: 30, h: 18 })));

// C: 7X Ø27.5 THRU on Ø130
for (const a of [18, 162, 198, 234, 270, 306, 342]) {
  part = difference(part, translate([65 * Math.cos(rad(a)), 65 * Math.sin(rad(a)), 20], cylinder({ r: 13.75, h: 60 })));
}

// B: 8X Ø10 THRU on Ø195
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  part = difference(part, translate([97.5 * Math.cos(rad(a)), 97.5 * Math.sin(rad(a)), -1], cylinder({ r: 5, h: W + 2 })));
}

// E: tube bore Ø65 down to y=45
part = difference(part, ycyl(0, TW, 32.5, 45, TY1 + 1));
// F: Ø27 drop into the hub, Ø35 counterbore at the tube floor
part = difference(part, ycyl(0, TW, 13.5, 20, 46));
part = difference(part, ycyl(0, TW, 17.5, 42, 46));
// D: 6X Ø7 in the lobes
for (const a of angs) {
  part = difference(part, ycyl(PR * Math.cos(rad(a)), TW + PR * Math.sin(rad(a)), 3.5, 60, TY1 + 1));
}

// J: tab holes Ø10, 11 deep, at w=34
part = difference(part, translate([90.1, 0, 34], rotate([0, 90, 0], cylinder({ r: 5, h: 12 }))));
part = difference(part, translate([-102.1, 0, 34], rotate([0, 90, 0], cylinder({ r: 5, h: 12 }))));

// G + H: slot (R12.5, 20 between centres, 10 deep) and 4X Ø10 on each diagonal flat
const dU = 144 / Math.SQRT2, dL = 148 / Math.SQRT2;
for (const [th, d] of [[45, dU], [135, dU], [-45, dL], [-135, dL]]) {
  const place = (s) => translate([d * Math.cos(rad(th)), d * Math.sin(rad(th)), 0], rotate([0, 0, th], s));
  const slot = place(translate([0, 0, TW], rotate([0, 90, 0],
    translate([-22.5, -10, -10], fillet({ r: 12.4, edges: "z" }, cube([45, 25, 15]))))));
  part = difference(part, slot);
  for (const sy of [-1, 1]) {
    for (const zw of [20, 80]) {
      part = difference(part, place(translate([-20, sy * 12.5, zw], rotate([0, 90, 0], cylinder({ r: 5, h: 25 })))));
    }
  }
}

// SKIP R10: concave blends between the tube lobes are not modelled
// SKIP fillets R5/R3/R2.5/R1.5/R7: small blends omitted for a robust exact solid
// SKIP rib pockets: the web face relief is not quantified; the web is modelled solid, as Section A-A shows
return rotate([90, 0, 0], part);