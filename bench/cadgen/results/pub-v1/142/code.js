const T = 74;
const ribZ0 = 15, ribW = 44;
const C1 = [56.1, 81.6], R1 = 49.5;      // outer bend
const C2 = [56.1, 69.6], R2 = 19.3;      // inner bend
const CT = [56.1, 0], RT = 9.85;         // tip circle
const CE = [173.9, 110], RE = 21.1;      // arm end
const d2r = Math.PI / 180;
const arcPts = (c, r, a0, a1, n) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * d2r;
    p.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return p;
};
const bez = (P0, P1, P2, P3, t0, t1, n) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * i / n, u = 1 - t;
    p.push([
      u*u*u*P0[0] + 3*u*u*t*P1[0] + 3*u*t*t*P2[0] + t*t*t*P3[0],
      u*u*u*P0[1] + 3*u*u*t*P1[1] + 3*u*t*t*P2[1] + t*t*t*P3[1],
    ]);
  }
  return p;
};
const B0 = [C1[0] - R1, C1[1]], B1 = [C1[0] - R1, 45], B2 = [45, 4];
const B3 = [CT[0] + RT * Math.cos(235 * d2r), CT[1] + RT * Math.sin(235 * d2r)];

let pts = [];
pts.push(...arcPts(C1, R1, 90, 180, 24));
pts.push(...bez(B0, B1, B2, B3, 0, 1, 30).slice(1));
pts.push(...arcPts(CT, RT, 235, 420, 30).slice(1));
pts.push([56.8, 4.5], [53.5, 9.5], [29.4, 61.2], [37.6, 61.2], [36.8, 63]);
pts.push(...arcPts(C2, R2, 180, 90, 16).slice(1));
pts.push(...arcPts(CE, RE, -90, 90, 30));

const fixOrient = (p) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a < 0 ? p.slice().reverse() : p;
};

const body = linearExtrude({ h: T }, polygon(fixOrient(pts)));

// crown rib, 6.9 proud of the outer curve
let curve = arcPts(C1, R1, 125, 180, 16);
curve.push(...bez(B0, B1, B2, B3, 0, 0.9, 24).slice(1));
const outer = [], inner = [];
for (let i = 0; i < curve.length; i++) {
  const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i + 1)];
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const nx = dy, ny = -dx;
  outer.push([curve[i][0] + 6.9 * nx, curve[i][1] + 6.9 * ny]);
  inner.push([curve[i][0] - 2 * nx, curve[i][1] - 2 * ny]);
}
const ribPts = fixOrient([...outer, ...inner.reverse()]);
const rib = translate([0, 0, ribZ0], linearExtrude({ h: ribW }, polygon(ribPts)));

const pin = translate([83.9, 123.1, -10], cylinder({ r: 8, h: 10.5 }));

let part = union(body, rib, pin);
// fork gap: square-ended open cut between the two clevis arms
part = difference(part, translate([78.9, 85, ribZ0], cube([130, 60, ribW])));
part = difference(part, drill([173.9, 110, T], [0, 0, 1], { d: 22, through: true }));
part = difference(part, drill([38.0, 29.1, T], [0, 0, 1], { d: 6, through: true }));
return part;