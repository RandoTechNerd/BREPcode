const part = importedSolid("input.step");
const zTop = 108.77, R = 3, zc = zTop - R;   // fillet centre height 105.77
const FN = 192;

// annulus ri..ro between z0 and z1
const ring = (ri, ro, z0, z1) => translate([0, 0, z0], difference(
  cylinder({ r: ro, h: z1 - z0, $fn: FN }),
  translate([0, 0, -1], cylinder({ r: ri, h: z1 - z0 + 2, $fn: FN })),
));

// outer edge, rim r = 150: fillet centre r = 147
const outerTool = difference(
  ring(150 - R, 152, zc, zTop + 1.5),
  translate([0, 0, zc], torus({ r: 150 - R, tube: R, $fn: FN })),
);

// inner edge, bore r = 100: refill the 3 mm chamfer, then cut the fillet (centre r = 103)
const innerFill = revolve(360, polygon([
  [100, zc],          // fillet tangent point on the bore
  [100.4, 105.3],     // into material
  [104, 105.3],
  [104, zTop + 0.5],  // above top, trimmed by the cutter below
  [99.5, zTop + 0.5],
  [99.5, 106.6],      // in the bore, removed again by the cutter
]));
const innerTool = difference(
  ring(99, 100 + R, zc, zTop + 1.5),
  translate([0, 0, zc], torus({ r: 100 + R, tube: R, $fn: FN })),
);
// trim what the fill left above the top face, outside the fillet zone
const topTrim = ring(102.9, 104.5, zTop, zTop + 1.5);

let out = difference(part, outerTool);
out = union(out, innerFill);
out = difference(out, innerTool);
out = difference(out, topTrim);
return out;