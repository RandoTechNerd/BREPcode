// PrintMotor as a full assembly: every printed part of the 12-slot / 8-pole
// display motor (a rebuild of PrintMotor/printmotor.py). Z is the motor axis
// and z = 0 is the inner face of the rear wall.
//
// Most parts are drawn where they sit in the motor; `print` turns the lid and
// the busbar crown over for the bed. The coil pod and the terminal lugs are
// drawn in the frame they PRINT in and moved into place by `place`.
// Parts > Explode opens it up like a manual drawing (pods slide out along
// their spokes, everything else along the axis); Check fit intersects every
// pair; Export parts writes one STL per part in print pose plus parts.csv.

const slots = 12;
const poles = 8;
const fit = 0.2;            // sliding clearance per side
const coreFrom = 8;         // rear face of the stator core
const coreLen = 40;
const boreR = 25;           // stator bore
const airGap = 0.75;
const bridgeR = 27;         // the tooth tips are joined by a ring boreR..bridgeR
const toothW = 7;
const toothEndR = 50;       // teeth key into the yoke out to here
const yokeRi = 47;
const yokeRo = 54;
const housingR = 60;        // outer wall
const finR = 66;            // fin tips and rear flange
const rearWall = 5;
const frontRim = 65;        // the lid seats here
const plateT = 5;
const podLayers = 6;
const layerH = 3;
const podClear = 0.35;      // gap between neighbouring pods, each side

const coreTo = coreFrom + coreLen, coreMid = coreFrom + coreLen / 2;
const rotorR = boreR - airGap;
const boreFit = yokeRo + fit;
const podHoleW = toothW + 0.5, podHoleL = coreLen + 0.5;
const podRo = bridgeR + podLayers * layerH;
const busR = [33, 37.5, 42];          // phase A/B/C busbar rings
const busW = 3, crownT = 2.5, busDepth = [8, 5.5, 3];
const winRi = 18, winRo = 50, nWin = 5, sweep = 0.8, winSpan = 40, spoke0 = 90;
const lugPhi = busR.map((R, k) => spoke0 + sweep * (R - winRi) + [-11, 0, 11][k]);
const lugBlade = 3.5, lugShoulder = 5.2, lugThk = 2, lugTipR = 70.5;
const brgW = 7, brgSeatR = 11.05;     // 608 bearing, 8 x 22 x 7
const screws = [45, 135, 225, 315], screwR = 62.5;
const shaftEnd = frontRim + plateT + 0.5;
const frontBrgZ = frontRim - 1 - brgW;

// each coil layer is as thick as the slot allows at its radius
const half = Math.PI / slots;
const layerT = Array.from({ length: podLayers }, (_, k) =>
  Math.floor(((bridgeR + layerH * k) * Math.tan(half) - podClear / Math.cos(half) - podHoleW / 2) * 10) / 10);
const layerTax = layerT.map((t) => Math.min(t, 6));

// ---- helpers ---------------------------------------------------------------
const disc = (r, z0, z1) => translate([0, 0, z0], cylinder({ r, h: z1 - z0 }));
const taper = (r1, r2, z0, z1) => translate([0, 0, z0], cylinder({ r1, r2, h: z1 - z0 }));
const ring = (ri, ro, z0, z1) => difference(disc(ro, z0, z1), disc(ri, z0 - 1, z1 + 1));
const hexPrism = (af, z0, z1) => translate([0, 0, z0], cylinder({ r: af / Math.sqrt(3), h: z1 - z0, $fn: 6 }));
// a box spanning radius r0..r1, width w, height z0..z1, turned to phi
const radialBox = (r0, r1, w, z0, z1, phi) =>
  rotate([0, 0, phi], translate([r0, -w / 2, z0], cube([r1 - r0, w, z1 - z0])));
const ringOf = (n, make, phase = 0) => Array.from({ length: n }, (_, i) => make(phase + (360 * i) / n));
const atScrews = (r, z0, z1) => screws.map((phi) => {
  const a = phi * Math.PI / 180;
  return translate([screwR * Math.cos(a), screwR * Math.sin(a), z0], cylinder({ r, h: z1 - z0 }));
});

// ---- stator ----------------------------------------------------------------
function toothStar() {
  const s = union(ring(boreR, bridgeR, coreFrom, coreTo),
    ...ringOf(slots, (phi) => radialBox(bridgeR - 0.5, toothEndR, toothW, coreFrom, coreTo, phi)));
  // slot-opening grooves in the bore, between the teeth
  return difference(s, ...ringOf(slots, (phi) => radialBox(boreR - 1, boreR + 0.8, 1.2, coreFrom - 1, coreTo + 1, phi), 15));
}

function yoke() {
  return difference(ring(yokeRi, yokeRo, coreFrom, coreTo),
    ...ringOf(slots, (phi) => radialBox(yokeRi - 1, toothEndR + 0.3, toothW + 2 * fit, coreFrom - 1, coreTo + 1, phi)),
    radialBox(yokeRo - 1.8, yokeRo + 1, 3.6, coreFrom - 1, coreTo + 1, 15));      // key notch for the housing rib
}

// six stacked "turns"; print frame: X tangential, Y axial, Z radial inward
// (outer face on the bed)
function coilPod() {
  const plate = (w, l, r, z, hgt) => translate([-w / 2, -l / 2, z], fillet({ r, edges: "z" }, cube([w, l, hgt])));
  const layers = [];
  for (let k = 0; k < podLayers; k++) {
    const t = layerT[k], ta = layerTax[k];
    const z0 = (podLayers - 1 - k) * layerH;
    const w = podHoleW + 2 * t, l = podHoleL + 2 * ta, r = 0.9 * Math.min(t, ta) + 0.5;
    layers.push(plate(w, l, r, z0, layerH - 0.4), plate(w - 1, l - 1, r - 0.5, z0 + layerH - 0.4, 0.4));
  }
  return difference(union(...layers), translate([-podHoleW / 2, -podHoleL / 2, -1], cube([podHoleW, podHoleL, podLayers * layerH + 2])));
}

// three busbar rings hanging from a flat crown, a tab down to every third pod
function crown() {
  const zb0 = frontRim - crownT;
  const coilFaceZ = (R) => {
    let tax = 0;
    for (let k = 0; k < podLayers; k++) {
      if (bridgeR + layerH * k < R + busW / 2 && bridgeR + layerH * (k + 1) > R - busW / 2) tax = Math.max(tax, layerTax[k]);
    }
    return coreMid + podHoleL / 2 + tax;
  };
  const bits = [ring(30, 45, zb0, frontRim)];
  busR.forEach((R, ph) => {
    bits.push(ring(R - busW / 2, R + busW / 2, zb0 - busDepth[ph], zb0));
    for (let i = ph; i < slots; i += 3) bits.push(radialBox(R - 1.5, R + 1.5, 3, coilFaceZ(R) + 0.2, zb0 - busDepth[ph] + 0.01, (360 * i) / slots));
  });
  return difference(union(...bits),
    ...busR.map((R, k) => radialBox(R - lugShoulder / 2 - 0.2, R + lugShoulder / 2 + 0.2, lugThk + 0.4, zb0 - 0.01, frontRim + 1, lugPhi[k])));
}

// a flat terminal; print frame: X along the motor axis, Y radial, Z thickness
function lug(R) {
  const eyeV = lugTipR - R - 3.5;
  return difference(
    union(
      translate([0, -lugShoulder / 2, 0], cube([crownT, lugShoulder, lugThk])),
      translate([crownT, -lugBlade / 2, 0], cube([16.5 - crownT, lugBlade, lugThk])),
      translate([12.5, -lugBlade / 2, 0], cube([4, lugTipR - R - 3 + lugBlade / 2, lugThk])),
      translate([14.5, eyeV, 0], cylinder({ r: 3.6, h: lugThk }))),
    translate([14.5, eyeV, -1], cylinder({ r: 1.7, h: lugThk + 2 })));
}
// stand a lug in its crown slot: X up the axis, Y out along its spoke
const placeLug = (k) => (s) => rotate([0, 0, lugPhi[k]],
  translate([busR[k], -lugThk / 2, frontRim - crownT], rotate([0, 0, -90], rotate([0, -90, 0], s))));

// ---- rotor and shaft -------------------------------------------------------
function rotor() {
  return difference(
    disc(rotorR, coreFrom, coreTo),
    ...ringOf(poles, (a) => radialBox(rotorR - 1, rotorR + 1, 2, coreFrom - 1, coreTo + 1, a)),           // pole grooves
    hexPrism(14.3, coreFrom - 1, coreTo + 1),
    ...ringOf(poles, (a) => radialBox(18.35, 21.65, 10.3, coreFrom - 1, coreTo + 1, a), 180 / poles),     // magnet pockets
    ...ringOf(poles, (a) => rotate([0, 0, a], translate([13, 0, coreFrom - 1], cylinder({ r: 1.6, h: coreLen + 2 })))));
}

function shaft() {
  return union(
    taper(3.5, 4, -4.5, -4), disc(4, -4, 3),                     // rear journal (608)
    taper(4, 5.5, 3, 4.5), taper(5.5, 9, 4.5, coreFrom - 1), disc(9, coreFrom - 1, coreFrom),
    hexPrism(14, coreFrom, coreTo),                             // drives the rotor
    disc(4, coreTo, shaftEnd),                                  // front journal
    hexPrism(6, shaftEnd, shaftEnd + 12));
}

const spacer = () => union(ring(4.15, 10, coreTo, coreTo + 4), ring(4.15, 5.75, coreTo + 4, frontBrgZ));

function outputHub() {
  const z0 = shaftEnd, z1 = shaftEnd + 20;
  // bore the plain barrel first, then add the grip splines (which never reach
  // the bore): the exact kernel refuses the cuts through the splined body
  let body = union(disc(12, z0, z0 + 3), disc(9, z0 + 3, z0 + 6), disc(8, z0 + 6, z1 - 1.05), taper(8, 7, z1 - 1.05, z1));
  body = difference(body, hexPrism(6.3, z0 - 1, z0 + 12));
  body = difference(body, disc(4, z0 + 13, z1 + 1));
  return union(body, ...ringOf(16, (a) => radialBox(7.7, 9.2, 1.6, z0 + 6, z1 - 1.3, a)));
}

// ---- case ------------------------------------------------------------------
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
  h = difference(h, disc(boreFit, coreFrom, frontRim + 1));
  h = difference(h, disc(50, 0, coreFrom + 0.01));
  h = union(h, radialBox(boreFit - 1.6, boreFit + 0.5, 3, coreFrom, frontRim - 4.5, 15),   // key rib
    disc(15, -0.01, 3));                                                                  // rear bearing boss
  h = difference(h, disc(brgSeatR, -4, 3.5));                                             // 608 bearing seat
  h = difference(h, disc(6, -rearWall - 1, 0.5));
  return difference(h, ...atScrews(1.3, frontRim - 14, frontRim + 1));
}

// five swept windows, wider toward the hub, always leaving a 9 mm spoke
function windows() {
  const span = (r) => Math.min(winSpan * 36 / r, 360 / nWin - (9 / r) * 180 / Math.PI);
  const n = 24, out = [];
  for (let w = 0; w < nWin; w++) {
    const c = spoke0 + (360 * (w + 0.5)) / nWin, pts = [];
    const edge = (j, side) => {
      const r = winRi + ((winRo - winRi) * j) / n, a = (c + sweep * (r - winRi) + side * span(r) / 2) * Math.PI / 180;
      return [r * Math.cos(a), r * Math.sin(a)];
    };
    for (let j = 0; j <= n; j++) pts.push(edge(j, -1));
    for (let j = n; j >= 0; j--) pts.push(edge(j, 1));
    out.push(translate([0, 0, frontRim - 1], linearExtrude({ h: plateT + 2 }, polygon(pts))));
  }
  return out;
}

function lid() {
  const z1 = frontRim + plateT;
  return difference(
    union(disc(finR, frontRim, z1 - 1.5), taper(finR, finR - 1.5, z1 - 1.5, z1),
      ring(boreFit - 2.2, boreFit - fit, frontRim - 4, frontRim + 0.01),                 // spigot
      disc(15, frontRim - 10, frontRim + 0.01)),                                         // bearing boss
    ...windows(),
    disc(brgSeatR, frontRim - 10.5, frontBrgZ + brgW),
    disc(6, frontRim - 11, z1 + 1),
    ...busR.map((R, k) => radialBox(R - lugBlade / 2 - 0.2, R + lugBlade / 2 + 0.2, lugThk + 0.4, frontRim - 1, z1 + 1, lugPhi[k])),
    ...atScrews(1.7, frontRim - 1, z1 + 1), ...atScrews(3.25, z1 - 2, z1 + 1));
}

// ---- the assembly ----------------------------------------------------------
// explode vectors are in each part's own frame; at full slider the stack
// opens about 120 mm toward the rear and 210 mm toward the front
return assembly({
  housing: { shape: housing(), color: "#8a8f98", finish: "aluminium", explode: [0, 0, -120] },
  yoke: { shape: yoke(), color: "#6f7680", finish: "steel", explode: [0, 0, -65] },
  tooth_star: { shape: toothStar(), color: "#6f7680", finish: "steel" },
  coil_pod: {
    shape: coilPod(), color: "#c8702a", finish: "copper", count: slots,
    // outer face out at podRo, centred on the stator stack
    place: polar(slots, { at: [podRo, 0, coreMid], rotate: [90, -90, 0] }),
    explode: [0, 0, -30],         // straight out along its spoke
  },
  rotor: { shape: rotor(), color: "#c9ccd1", finish: "metal", explode: [0, 0, 55] },
  shaft: { shape: shaft(), color: "#c9ccd1", finish: "metal", explode: [0, 0, 55] },
  spacer: { shape: spacer(), color: "#c9ccd1", finish: "metal", explode: [0, 0, 100] },
  busbar_crown: { shape: crown(), color: "#c8702a", finish: "copper", print: "flip", explode: [0, 0, 120] },
  lug_A: { shape: lug(busR[0]), color: "#c8702a", finish: "copper", place: placeLug(0), explode: [150, 0, 0] },
  lug_B: { shape: lug(busR[1]), color: "#c8702a", finish: "copper", place: placeLug(1), explode: [150, 0, 0] },
  lug_C: { shape: lug(busR[2]), color: "#c8702a", finish: "copper", place: placeLug(2), explode: [150, 0, 0] },
  lid: { shape: lid(), color: "#1c1f24", finish: "gloss", print: "flip", explode: [0, 0, 175] },
  output_hub: { shape: outputHub(), color: "#c9ccd1", finish: "metal", explode: [0, 0, 210] },
});
