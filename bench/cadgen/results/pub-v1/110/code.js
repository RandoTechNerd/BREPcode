const T = 12, PD = 2, Rb = 17.5, rh = 7.75;
const yB = -15.7, yP = -5.7;

// truss plate outline and bosses
const outline = polygon([[0, yB], [235, yB], [233.5, 18.8], [127, 88], [96, 94], [36, 23], [0, 17.5]]);
const plate = union(
  linearExtrude({ h: T }, outline),
  translate([0, 0, 0], cylinder({ r: Rb, h: T })),
  translate([110, 84, 0], cylinder({ r: Rb, h: T })),
  translate([235, 0, 0], cylinder({ r: Rb, h: T })),
);

// pocket outlines
const pA = [[21, yP], [100, yP], [66.9, 36.2], [40, 6], [21, 6]];
const pB = [[92.5, 26.8], [92.5, 66.7], [75.8, 46.7]];
const pC = [[128.5, yP], [206.5, yP], [128.5, 81.1]];
const pocketTop = (pts) => translate([0, 0, T - PD], linearExtrude({ h: PD + 1 }, polygon(pts)));
const pocketBot = (pts) => translate([0, 0, -1], linearExtrude({ h: PD + 1 }, polygon(pts)));

let body = plate;
for (const p of [pA, pB, pC]) {
  body = difference(body, pocketTop(p));
  body = difference(body, pocketBot(p));
}

// downward leg and foot
const legX0 = 235 - 46.2, legW = 31;
const leg = translate([legX0, -4, -86], cube([legW, 8, 88.5]));
const foot = union(
  translate([legX0, -17.75, -98], cube([235 - legX0, 35.5, 12.5])),
  translate([235, 0, -98], cylinder({ r: 17.75, h: 12.5 })),
);

// upward arm
const diag = hull({ exact: true },
  translate([108, -15.7, 11.5], cube([8, 12, 5.5])),
  translate([166, 40, 50], cube([8, 12, 6])),
);
const bar = translate([166, 40, 11.5], cube([8, 12, 99.5]));
const eye = translate([166, 46, 111], rotate([0, 90, 0], cylinder({ r: 10, h: 8 })));

body = union(body, leg, foot, diag, bar, eye);

// holes
body = difference(body, translate([0, 0, -1], cylinder({ r: rh, h: T + 2 })));
body = difference(body, translate([110, 84, -1], cylinder({ r: rh, h: T + 2 })));
body = difference(body, translate([235, 0, -1], cylinder({ r: rh, h: T + 2 })));
body = difference(body, translate([235, 0, -99], cylinder({ r: rh, h: 14.5 })));
body = difference(body, translate([165, 46, 111], rotate([0, 90, 0], cylinder({ r: 5.5, h: 10 }))));

return body;