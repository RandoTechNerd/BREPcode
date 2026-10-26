const L = 120, W = 60, H = 45;
const z1 = 15, z2 = 30;
const ys = [15, 45];

let part = cube([L, W, H]);
part = difference(part, translate([-1, -1, z1], cube([41, W + 2, H])));
part = difference(part, translate([40, -1, z2], cube([40, W + 2, H])));

const holes = [
  { x: 20, z: z1, d: 6.8, depth: 12 },
  { x: 60, z: z2, d: 6.8, depth: 15 },
  { x: 100, z: H, d: 8, depth: 20 },
];
for (const h of holes) {
  for (const y of ys) {
    part = difference(part, drill([h.x, y, h.z], [0, 0, 1], { d: h.d, depth: h.depth }));
  }
}
return part;
