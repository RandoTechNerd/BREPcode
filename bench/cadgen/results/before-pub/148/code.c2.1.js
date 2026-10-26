const L = 100, F = 98, DG = 107.6, BORE = 85;
const c = 54.2;
const oct = linearExtrude({ h: L }, polygon([[F, c], [c, F], [-c, F], [-F, c], [-F, -c], [-c, -F], [c, -F], [F, -c]]));
const tabs = union(
  translate([97.5, -11, 0], cube([7.5, 22, 50])),
  translate([-105, -11, 0], cube([7.5, 22, 50])),
);
const lobeAngles = [0, 60, 120, 180, 240, 300];
const rad = (a) => a * Math.PI / 180;
const bossLocal = union(
  cylinder({ r: 37.5, h: 20.5 }),
  ...lobeAngles.map(a => translate([37.5 * Math.cos(rad(a)), 37.5 * Math.sin(rad(a)), 0], cylinder({ r: 7.5, h: 20.5 }))),
);
const toTop = (s) => translate([0, 97.5, 50], rotate([-90, 0, 0], s));
const shell = difference(
  union(oct, tabs, toTop(bossLocal)),
  translate([0, 0, -1], cylinder({ r: BORE, h: L + 2 })),
);
const web = revolve(360, polygon([[25, 47], [30, 47], [30, 34], [42.15, 34], [85.5, 45], [85.5, 55], [30, 70], [30, 54], [25, 54]]));
let part = union(shell, web);

const cutters = [];
// boss bore and boss holes
cutters.push(toTop(translate([0, 0, 2.5], cylinder({ r: 32.5, h: 20 }))));
for (const a of lobeAngles) {
  cutters.push(toTop(translate([37.5 * Math.cos(rad(a)), 37.5 * Math.sin(rad(a)), 5.5], cylinder({ r: 3.5, h: 16 }))));
}
cutters.push(translate([0, 80, 50], rotate([-90, 0, 0], cylinder({ r: 13.5, h: 22 }))));
// flange bolt holes
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  cutters.push(translate([97.5 * Math.cos(rad(a)), 97.5 * Math.sin(rad(a)), -1], cylinder({ r: 5, h: L + 2 })));
}
// web holes
for (const a of [18, -18, -54, -90, -126, -162, 162]) {
  cutters.push(translate([65 * Math.cos(rad(a)), 65 * Math.sin(rad(a)), 25], cylinder({ r: 13.75, h: 55 })));
}
// diagonal faces: holes and slot
const yHole = (x, y0, z, r, h) => translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h })));
for (const s of [1, -1]) {
  const rot = (shape) => rotate([0, 0, -45 * s], shape);
  for (const x of [-12.5, 12.5]) for (const z of [20, 80]) {
    cutters.push(rot(yHole(x, DG - 30, z, 5, 31)));
  }
  const sx = 2.5 * s;
  const slot = union(
    translate([sx - 12.5, DG - 10, 40], cube([25, 11, 20])),
    yHole(sx, DG - 10, 40, 12.5, 11),
    yHole(sx, DG - 10, 60, 12.5, 11),
  );
  cutters.push(rot(slot));
}
// tab holes
cutters.push(translate([94, 0, 34], rotate([0, 90, 0], cylinder({ r: 5, h: 12 }))));
cutters.push(translate([-106, 0, 34], rotate([0, 90, 0], cylinder({ r: 5, h: 12 }))));

for (const t of cutters) part = difference(part, t);
return part;