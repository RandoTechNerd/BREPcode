const C = 45, flangeD = 90, flangeT = 10, hubD = 45, H = 40;
const boreD = 25, pcd = 72, boltD = 6.6;
const keyW = 8, keyL = 7, keyCY = 57.5;
const radD = 5, radDepth = 12, radZ = 28;

const flange = translate([C, C, 0], cylinder({ r: flangeD / 2, h: flangeT }));
const hub = translate([C, C, flangeT - 0.5], cylinder({ r: hubD / 2, h: H - flangeT + 0.5 }));
let part = union(flange, hub);

// bore
part = difference(part, translate([C, C, -1], cylinder({ r: boreD / 2, h: H + 2 })));

// keyway pocket 8 x 7, through the full height
part = difference(part, translate([C - keyW / 2, keyCY - keyL / 2, -1], cube([keyW, keyL, H + 2])));

// bolt holes on Ø72 PCD at 45°
const pr = pcd / 2;
for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = difference(part, translate([C + pr * Math.cos(a), C + pr * Math.sin(a), -1],
    cylinder({ r: boltD / 2, h: flangeT + 2 })));
}

// radial holes Ø5 depth 12
part = difference(part, drill([C, C - hubD / 2, radZ], [0, -1, 0], { d: radD, depth: radDepth }));
part = difference(part, drill([C + hubD / 2, C, radZ], [1, 0, 0], { d: radD, depth: radDepth }));

return part;