const bx = -25.79, bz = 0;
const vx = -25.79, vy = -4.07, vR = 23;   // Ø46 vertical bore
const yIn = 14, yOut = 58.93;
const fillR = 12.55;                      // Ø25 bore + 0.05 overlap
const newD = 20;                          // Ø25 reduced by 5 mm
const alongY = (r, y0, y1) =>
  translate([bx, y0, bz], rotate([-90, 0, 0], cylinder({ r, h: y1 - y0, $fn: 96 })));

// plug for the old bore, trimmed so it never enters the vertical bore
const plug = difference(
  alongY(fillR, yIn, yOut + 0.02),
  translate([vx, vy, -40], cylinder({ r: vR, h: 80, $fn: 128 })),
);

const part = importedSolid("input.step");
const filled = union(part, plug);
// new smaller horizontal bore, overshooting both ends
return difference(filled, alongY(newD / 2, yIn, yOut + 1.5));