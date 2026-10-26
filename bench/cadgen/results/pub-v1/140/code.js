const pipeZ = 45;
const xcyl = (r, x0, x1, y = 0, z = pipeZ) =>
  translate([x0, y, z], rotate([0, 90, 0], cylinder({ r, h: x1 - x0 })));

// annular wall profile (radius, z), revolved, so no cut runs down the axis
const profile = polygon([
  [95, 0], [97.5, 0], [97.5, 5], [100, 5], [100, 88], [92.5, 92], [85.5, 130],
  [30, 130], [30, 105], [33, 105], [33, 127], [82.5, 127], [89.5, 92], [95, 89],
]);
const shell = rotate([0, 0, 45], revolve(360, profile));

// side features, trimmed so their inner ends sit inside the wall (r 95-100)
const addons = difference(
  union(
    xcyl(30, 80, 120),
    xcyl(30, -120, -80),
    translate([80, 28, 39], cube([20, 22, 12])),
    translate([80, -50, 39], cube([20, 22, 12])),
    translate([-100, 28, 39], cube([20, 22, 12])),
    translate([-100, -50, 39], cube([20, 22, 12])),
    translate([-40, -105, 22], cube([80, 25, 36])),
  ),
  translate([0, 0, -1], cylinder({ r: 96, h: 140 })),
);

let body = union(shell, addons);
body = difference(body, xcyl(25, 70, 121));
body = difference(body, xcyl(25, -121, -70));

for (const s of [1, -1]) {
  for (const y of [45, -45]) {
    body = difference(body, drill([s * 100, y, pipeZ], [s, 0, 0], { d: 5, depth: 10 }));
  }
}
for (const x of [-30, 30]) {
  body = difference(body, drill([x, -105, 40], [0, -1, 0], { d: 5, depth: 10 }));
}

return body;