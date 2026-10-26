const R1 = 130.94 / 2, Rb = 122 / 2, Rn = 118 / 2, Rt = 112.91 / 2;
const L = 420, zThread = 366.82, zNeck = 343.13, zGroove = 360.03, zCollar = 57.42;
const rB = 94 / 2, rC = 103.13 / 2, cbDepth = 101, zStep = L - cbDepth;
const rings = [67.42, 93.42, 119.42], ringW = 20;
const pocketDepth = 2, pocketW = 6;
const gD = 1.55, gHalf = gD * Math.tan(30 * Math.PI / 180);
const grooves = [zGroove + 1.6, zGroove + 5.2];

const pts = [[rB, 0], [R1, 0], [R1, zCollar], [Rb, zCollar]];
for (const z of rings) {
  pts.push([Rb, z], [R1, z], [R1, z + ringW], [Rb, z + ringW]);
}
pts.push([Rb, zNeck], [Rn, zNeck]);
for (const g of grooves) {
  pts.push([Rn, g - gHalf], [Rn - gD, g], [Rn, g + gHalf]);
}
pts.push(
  [Rn, zThread], [Rt, zThread],
  [Rt, L], [rC, L],
  [rC, zStep], [rB, zStep],
);

let part = rotate([0, 0, 15], revolve(360, polygon(pts)));

const slotLen = rings[2] + ringW - rings[0];
for (let i = 0; i < 12; i++) {
  part = difference(part, rotate([0, 0, i * 30],
    translate([R1 - pocketDepth, -pocketW / 2, rings[0] - 1],
      cube([pocketDepth + 2, pocketW, slotLen + 2]))));
}
return part;