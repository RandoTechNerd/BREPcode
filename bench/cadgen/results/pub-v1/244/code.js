const part = importedSolid("input.step");
const R = 50;
const zBot = -15.99, zTop = 6.01;
const H = zTop - zBot;

// exact R50 centre (-81.42, -20.36), nudged 0.15 mm along the bisector toward the corner
const C = [-81.42 + 0.15 * 0.5, -20.36 + 0.15 * 0.866];

// filler: tab-side point (inside tab), corner (inside material), slant-side point (inside body)
const fillProfile = polygon([
  [-83.0, 30.3],
  [-50.0, 31.0],
  [-36.69, 3.16],
]);
const prism = translate([0, 0, zBot], linearExtrude({ h: H }, fillProfile));
const cutter = translate([C[0], C[1], zBot - 1], cylinder({ r: R, h: H + 2, $fn: 256 }));
const fill = difference(prism, cutter);

return union(part, fill);