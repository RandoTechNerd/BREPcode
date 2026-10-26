const T = 10, H = 105, W = 5;
const outline = polygon([
  [-388, 0], [330, 0], [330, 180], [401, 265], [401, 315], [300, 335],
  [300, 540], [250, 650], [0, 658.6], [-30, 600], [-120, 430],
  [-250, 350], [-388, 240],
]);
const plate = linearExtrude({ h: T }, outline);
const tubX0 = -230, tubX1 = 250, tubY1 = 301;
const tub = translate([tubX0, 0, 0], cube([tubX1 - tubX0, tubY1, H]));
const cavity = translate([tubX0 + W, W, T], cube([tubX1 - tubX0 - 2 * W, tubY1 - 2 * W, H - T + 1]));

const hubL = [-100, 175];
const hubU = [0, 412.75];

let body = difference(union(plate, tub), cavity);
body = union(
  body,
  translate([hubL[0], hubL[1], 0], cylinder({ r: 70, h: H })),
  translate([hubU[0], hubU[1], 0], cylinder({ r: 60, h: 40 })),
);
body = difference(body, translate([hubL[0], hubL[1], -1], cylinder({ r: 57.5, h: H + 2 })));
body = difference(body, translate([hubU[0], hubU[1], -1], cylinder({ r: 45, h: 42 })));

const holes = [
  [-346.52, 215], [-266.2, 258], [-195.42, 326], [-188.61, 276.64], [-81, 441],
  [-320.66, 71.08], [-258.04, 34.33], [-365.58, 23.44], [20, 633.31], [237, 633.31],
  [275, 514.88], [275, 376.02], [297.39, 276.64], [380, 290.26], [297.39, 193.6], [319.17, 61.55],
];
return difference(body, ...holes.map(([x, y]) => translate([x, y, -1], cylinder({ r: 4, h: T + 2 }))));