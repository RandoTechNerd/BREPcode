const L = 140, W = 60, H = 45, t = 6;

let body = difference(
  cube([L, W, H]),
  translate([-1, t, t], cube([L + 2, W - 2 * t, H])),
);

// base holes (Ø8.5) through the web
for (const x of [25, 70, 115]) {
  body = difference(body, translate([x, 30, -1], cylinder({ r: 8.5 / 2, h: t + 2 })));
}

// front wall holes (Ø6.6) through the Y=0 wall
for (const x of [35, 105]) {
  body = difference(body, translate([x, -1, 28], rotate([-90, 0, 0], cylinder({ r: 6.6 / 2, h: t + 2 }))));
}

return body;
