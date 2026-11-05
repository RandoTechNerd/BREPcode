// PrintMotor, two of its parts as an assembly: the finned housing and the
// twelve stacked coil pods that ring the stator (a rebuild of
// PrintMotor/printmotor.py's housing() and coil_pod_local()).
//
// Each part is modelled in the frame it PRINTS in. The pod lies with its
// outer face on the bed (z = 0) and its window along Y; polar() stands each
// copy up on its spoke, window along the motor axis, outer face outward.
// Parts > Check fit intersects every pair; Export parts writes one STL per
// part in print pose plus parts.csv.

const housingR = 60;        // outer wall
const finR = 66;            // fin tips and rear flange
const rearWall = 5;
const frontRim = 65;        // front plate seats here
const boreR = 54.2;         // stator yoke 54 + 0.2 fit
const coreFrom = 8;         // rear face of the stator core
const coreLen = 40;
const podHoleW = 7.5;       // the pod slides over a 7 mm tooth
const podLayers = 6;
const layerH = 3;
const podClear = 0.35;      // gap between neighbouring pods, each side
const slots = 12;

// a box spanning radius r0..r1, width w, height z0..z1, turned to phi
const radialBox = (r0, r1, w, z0, z1, phi) =>
  rotate([0, 0, phi], translate([r0, -w / 2, z0], cube([r1 - r0, w, z1 - z0])));
const disc = (r, z0, z1) => translate([0, 0, z0], cylinder({ r, h: z1 - z0 }));

// mounting ear: two round ends joined by their outer tangents, drawn as ONE
// outline (arcs as Bezier quarters) so it extrudes to a single exact body
function ear() {
  const [x1, r1, x2, r2] = [58, 14, 74, 7];
  const a = Math.acos((r1 - r2) / (x2 - x1));
  const at = (x, r, t) => [x + r * Math.cos(t), r * Math.sin(t)];
  // an arc as Bezier pieces of at most 90 degrees each
  const arc = (x, r, t0, t1) => {
    const n = Math.ceil(Math.abs(t1 - t0) / (Math.PI / 2)), out = [];
    for (let i = 0; i < n; i++) {
      const s = t0 + ((t1 - t0) * i) / n, e = t0 + ((t1 - t0) * (i + 1)) / n, k = (4 / 3) * Math.tan((e - s) / 4);
      const p0 = at(x, r, s), p3 = at(x, r, e);
      out.push(bezierTo([p0[0] - k * r * Math.sin(s), p0[1] + k * r * Math.cos(s)],
        [p3[0] + k * r * Math.sin(e), p3[1] - k * r * Math.cos(e)], p3));
    }
    return out;
  };
  const outline = path2d(at(x1, r1, a), ...arc(x1, r1, a, 2 * Math.PI - a), at(x2, r2, -a), ...arc(x2, r2, -a, a));
  return difference(
    translate([0, 0, -rearWall], linearExtrude({ h: rearWall }, outline)),
    translate([x2, 0, -rearWall - 1], cylinder({ r: 2.75, h: rearWall + 2 })));
}

function housing() {
  const screws = [45, 135, 225, 315];
  const nearScrew = (phi) => screws.some((s) => Math.abs(((phi - s + 540) % 360) - 180) < 9);
  const fins = [];
  for (let i = 0; i < 36; i++) {
    const phi = 10 * i + 5;
    if (!nearScrew(phi)) fins.push(radialBox(housingR - 1, finR, 2.2, 0, frontRim - 0.5, phi));
  }
  let h = union(
    disc(housingR, -rearWall, frontRim),
    disc(finR, -rearWall, 0),
    ...screws.map((phi) => rotate([0, 0, phi], ear())),
    ...fins,
    ...screws.map((phi) => radialBox(housingR - 1, finR, 12, 0, frontRim, phi)),
  );
  h = difference(h, disc(boreR, coreFrom, frontRim + 1));
  h = difference(h, disc(50, 0, coreFrom + 0.01));
  h = union(h, radialBox(boreR - 1.6, boreR + 0.5, 3, coreFrom, frontRim - 4.5, 15),   // key rib
    disc(15, -0.01, 3));                                                              // rear bearing boss
  h = difference(h, disc(11.05, -4, 3.5));                                            // 608 bearing seat
  h = difference(h, disc(6, -rearWall - 1, 0.5));
  for (const phi of screws) {
    const a = phi * Math.PI / 180;
    h = difference(h, translate([62.5 * Math.cos(a), 62.5 * Math.sin(a), frontRim - 14], cylinder({ r: 1.3, h: 15 })));
  }
  return h;
}

// six stacked "turns", each as thick as the slot allows at its radius
function coilPod() {
  const half = Math.PI / slots;
  const holeL = coreLen + 0.5;
  const plate = (w, l, r, z, hgt) => translate([-w / 2, -l / 2, z], fillet({ r, edges: "z" }, cube([w, l, hgt])));
  const layers = [];
  for (let k = 0; k < podLayers; k++) {
    const rIn = 27 + layerH * k;
    const t = Math.floor((rIn * Math.tan(half) - podClear / Math.cos(half) - podHoleW / 2) * 10) / 10;
    const ta = Math.min(t, 6);
    const z0 = (podLayers - 1 - k) * layerH;
    const w = podHoleW + 2 * t, l = holeL + 2 * ta, r = 0.9 * Math.min(t, ta) + 0.5;
    layers.push(plate(w, l, r, z0, layerH - 0.4), plate(w - 1, l - 1, r - 0.5, z0 + layerH - 0.4, 0.4));
  }
  return difference(union(...layers), translate([-podHoleW / 2, -holeL / 2, -1], cube([podHoleW, holeL, podLayers * layerH + 2])));
}

return assembly({
  housing: { shape: housing(), color: "#8a8f98", finish: "aluminium", explode: [0, 0, -60] },
  coil_pod: {
    shape: coilPod(), color: "#c8702a", finish: "copper", count: slots,
    // outer face out at r = 45, centred on the stator stack
    place: polar(slots, { at: [27 + podLayers * layerH, 0, coreFrom + coreLen / 2], rotate: [90, -90, 0] }),
    explode: [0, 0, -40],         // in the pod's own frame: straight out along its spoke
  },
});
