const zTop = 74.87, discT = 10.5;          // disc slab kept from the original
const hubR = 44.6, hubZ0 = -15.13;          // hub incl. Ø30 bore
const nBlades = 5, bladeT = 3;
const rIn = 42, rOut = 178, sweep = 60;     // blade sweep-back, degrees
const bladeZ0 = -45, bladeZ1 = zTop - discT + 1;
const bore = 15;

const part = importedSolid("input.step");

// keep the disc and the hub from the original
const disc = intersection(part, translate([-200, -200, zTop - discT], cube([400, 400, discT + 5])));
const hub = intersection(part, translate([0, 0, hubZ0 - 1], cylinder({ r: hubR, h: zTop - hubZ0 + 5, $fn: 96 })));

// one swept-back blade profile (centerline offset ±t/2)
const N = 24, pts = [], back = [];
for (let i = 0; i <= N; i++) {
  const t = i / N;
  const r = rIn + (rOut - rIn) * t;
  const a = (-sweep * t * t) * Math.PI / 180;
  // tangent direction for offset
  const t2 = Math.min(1, t + 0.001), t1 = Math.max(0, t - 0.001);
  const p = (s) => { const rr = rIn + (rOut - rIn) * s, aa = (-sweep * s * s) * Math.PI / 180; return [rr * Math.cos(aa), rr * Math.sin(aa)]; };
  const A = p(t1), B = p(t2);
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const nx = -dy * bladeT / 2, ny = dx * bladeT / 2;
  const c = [r * Math.cos(a), r * Math.sin(a)];
  pts.push([c[0] + nx, c[1] + ny]);
  back.unshift([c[0] - nx, c[1] - ny]);
}
const blade = translate([0, 0, bladeZ0],
  linearExtrude({ h: bladeZ1 - bladeZ0 }, polygon(pts.concat(back))));

const blades = [];
for (let k = 0; k < nBlades; k++) blades.push(rotate([0, 0, k * 360 / nBlades], blade));

const body = union(disc, hub, ...blades);
// re-open the centre bore through everything
return difference(body,
  translate([0, 0, bladeZ0 - 1], cylinder({ r: bore, h: zTop - bladeZ0 + 2, $fn: 64 })));