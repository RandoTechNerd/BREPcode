// PrintMotor C as an assembly: a hairpin (bar-wound) stator around a Halbach
// rotor (a rebuild of PrintMotor/printmotor_hairpin.py). Z is the motor axis,
// the stator core runs z = 0..40.
//
// The winding is four copper bars per slot, printed as three parts: two crown
// rings of 36 hairpins each (legs down into the slots, crowns up, printed
// upside down on their flat crown tops) and the weld ring of twisted bar ends
// under the core. The bars are tube() sweeps, so those three parts and the
// housing (its helical coolant groove is a tube too) build on the mesh lane;
// everything else is exact. The 32 magnet segments come in four types whose
// arrows turn -90 degrees per step: a Halbach array, field on the outside only.

const slots = 36;
const stack = 40;             // core z 0..stack
const span = 6;               // a hairpin jumps six slots
const boreR = 34;
const coreRo = 56;
const slotR0 = 34.3, slotR1 = 45.6, slotW = 3.4, slitW = 1.2;
const coolR = 50.5, coolHole = 1.4;
const barR = 1.3;             // octagonal bar, about 2.6 mm across
const legEnd = -4;            // crown legs stop here; the weld ring butts on below
const riseInner = 9;
const riseOuter = 13;
const ramp = 0.22;            // share of each crown spent rising: flat tops print on the bed
const fit = 0.2;
const jacketRo = 62;
const rearIn = -14;           // rear wall inner face
const rearT = 5;
const front = 61;             // lid inner face
const lidT = 5;
const segs = 32;              // Halbach segments, 4 per wavelength
const magRi = 22.2, magRo = 32.4;

const pitch = 360 / slots;
const layers = [35.6, 38.4, 41.2, 44.0];
const crownZ0 = stack + 2;
const plateZ0 = -13, plateZ1 = -11.4;
const jacketRi = coreRo + fit;
const sleeveRi = 32.55, sleeveRo = 33.3, hubRi = 18, hubRo = 22;
const brgSeatR = 11.05, brgW = 7;
const rearBrgZ = rearIn - rearT + 0.5;
const frontBrgZ = front - 1 - brgW;
const shaftEnd = front + lidT + 0.5;
const screws = [45, 135, 225, 315], screwR = 64.5;
const leadPhi = [100, 120, 140];
const keyPhi = 5;

// ---- helpers ---------------------------------------------------------------
const rad = (d) => d * Math.PI / 180;
const disc = (r, z0, z1) => translate([0, 0, z0], cylinder({ r, h: z1 - z0 }));
const taper = (r1, r2, z0, z1) => translate([0, 0, z0], cylinder({ r1, r2, h: z1 - z0 }));
const ring = (ri, ro, z0, z1) => difference(disc(ro, z0, z1), disc(ri, z0 - 1, z1 + 1));
const hexPrism = (af, z0, z1) => translate([0, 0, z0], cylinder({ r: af / Math.sqrt(3), h: z1 - z0, $fn: 6 }));
const radialBox = (r0, r1, w, z0, z1, phi) =>
  rotate([0, 0, phi], translate([r0, -w / 2, z0], cube([r1 - r0, w, z1 - z0])));
const ringOf = (n, make, phase = 0) => Array.from({ length: n }, (_, i) => make(phase + (360 * i) / n));
const atXY = (r, phi, s) => translate([r * Math.cos(rad(phi)), r * Math.sin(rad(phi)), 0], s);
const pt = (r, a, z) => [r * Math.cos(rad(a)), r * Math.sin(rad(a)), z];
// an annular sector as one outline, extruded
function sector(r0, r1, a0, a1, z0, z1, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(pt(r1, a0 + ((a1 - a0) * i) / n, 0).slice(0, 2));
  for (let i = n; i >= 0; i--) pts.push(pt(r0, a0 + ((a1 - a0) * i) / n, 0).slice(0, 2));
  return translate([0, 0, z0], linearExtrude({ h: z1 - z0 }, polygon(pts)));
}
// the same annular sector as a cutter with TRUE arcs: a ring trimmed by two
// square corners. sector() draws its arcs as straight facets, and twelve
// faceted windows took the exact kernel 40 s where these take about 4.
// (a1 - a0 under 90 degrees, so one quarter-turn corner from each side covers it)
function arcSector(r0, r1, a0, a1, z0, z1) {
  const R = r1 + 5, h = z1 - z0 + 2;
  const corner = (a) => rotate([0, 0, a], translate([0, 0, z0 - 1], cube([R, R, h])));
  return intersection(ring(r0, r1, z0, z1), corner(a0), corner(a1 - 90));
}
const bar = (path) => tube(path, { r: barR, sides: 8, caps: "flat" });
// a weld bead: a ball 2.4 mm round, as a 0.1 mm tube with round caps so it
// joins the bars on the mesh lane. 72 exact spheres cost SMLib 4 s to merge;
// these cost under half a second, the same volume within 0.04%.
const bead = (c) => tube([[c[0], c[1], c[2] - 0.05], [c[0], c[1], c[2] + 0.05]], { r: 2.4, sides: 24 });

// ---- stator ----------------------------------------------------------------
function statorCore() {
  return difference(ring(boreR, coreRo, 0, stack),
    ...ringOf(slots, (a) => radialBox(slotR0, slotR1, slotW, -1, stack + 1, a)),
    ...ringOf(slots, (a) => radialBox(boreR - 1, slotR0 + 0.2, slitW, -1, stack + 1, a)),     // semi-closed slot mouths
    ...ringOf(slots, (a) => atXY(coolR, a, disc(coolHole, -1, stack + 1)), pitch / 2),      // cooling holes
    radialBox(coreRo - 1.8, coreRo + 1, 3.6, -1, stack + 1, keyPhi));                       // key notch
}

// 36 hairpins: layer la of slot i up, across six slots, down into layer lb
function crownRing(la, lb, rise) {
  const fs = [0, ramp, 0.5, 1 - ramp, 1];
  const pins = [];
  for (let i = 0; i < slots; i++) {
    const a0 = pitch * i, a1 = pitch * (i + span);
    const path = [pt(layers[la], a0, legEnd)];
    for (const f of fs) {
      const z = crownZ0 + rise * Math.min(1, f / ramp, (1 - f) / ramp);
      path.push(pt(layers[la] + (layers[lb] - layers[la]) * f, a0 + (a1 - a0) * f, z));
    }
    path.push(pt(layers[lb], a1, legEnd));
    pins.push(bar(path));
  }
  return union(...pins);
}

// twisted bar ends welded in pairs, on a connection plate with the phase leads
function weldRing() {
  const bits = [];
  for (let i = 0; i < slots; i++) {
    const a = pitch * i;
    layers.forEach((r, k) => {
      const d = (k % 2 === 0 ? 1.5 : -1.5) * pitch;             // neighbouring layers twist toward each other
      const rm = (layers[k - (k % 2)] + layers[k - (k % 2) + 1]) / 2;
      // a short straight start keeps the bar end square to the crown leg it butts against
      bits.push(bar([pt(r, a, legEnd - 0.1), pt(r, a, legEnd - 1.6), pt(r, a + d * 0.45, legEnd - 4.5), pt(rm + (r - rm) * 0.4, a + d, plateZ1 + 2)]));
      if (k % 2 === 0) bits.push(bead(pt(rm, a + d, plateZ1 + 1.6)));
    });
  }
  let plate = difference(ring(layers[0] - 2, coolR + 2.2, plateZ0, plateZ1),
    ...ringOf(12, (a) => arcSector(layers[0] - 0.4, layers[3] + 1.4, a + 6, a + 24, plateZ0 - 1, plateZ1 + 1), 3));
  plate = union(plate,
    ...[pitch / 2, 120 + pitch / 2, 240 + pitch / 2].map((a) => atXY(coolR, a, union(
      disc(2.4, plateZ1 - 0.01, -0.01), disc(coolHole - 0.2, -0.2, 4)))),            // posts + pins into the core
    ...leadPhi.map((phi) => radialBox(46.5, 50.5, 2.4, rearIn - rearT - 3, plateZ0 + 0.01, phi)));
  return union(plate, ...bits);
}

// ---- housing and lid -------------------------------------------------------
// mounting ear: two round ends joined by their outer tangents, ONE outline
function ear() {
  const [x1, r1, x2, r2] = [60, 14, 76, 7];
  const a = Math.acos((r1 - r2) / (x2 - x1));
  const at = (x, r, t) => [x + r * Math.cos(t), r * Math.sin(t)];
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
    translate([0, 0, rearIn - rearT], linearExtrude({ h: rearT }, outline)),
    translate([x2, 0, rearIn - rearT - 1], cylinder({ r: 2.75, h: rearT + 2 })));
}

function housingC() {
  const zBack = rearIn - rearT;
  let h = union(
    disc(jacketRo, zBack, front),
    ...screws.map((phi) => rotate([0, 0, phi], ear())),
    ...screws.map((phi) => radialBox(jacketRo - 1, jacketRo + 5, 12, rearIn, front, phi)),
    ...[2, 8, 14, 20, 26, 32, 38, 44, 50].map((z) => ring(jacketRo - 0.5, jacketRo + 1.6, z, z + 2)));   // cooling ribs
  h = difference(h, disc(jacketRi + 0.05, 0, front + 1));              // core seat (+0.05 covers mesh facets)
  h = difference(h, disc(53, rearIn, 0.01));                           // weld-end chamber
  h = union(h, radialBox(jacketRi - 1.6, jacketRi + 0.5, 3, 0, stack, keyPhi),   // key rib
    disc(15, rearIn - 0.01, rearIn + 3));                              // rear bearing boss
  h = difference(h, disc(brgSeatR, rearBrgZ, rearBrgZ + brgW));
  h = difference(h, disc(6, zBack - 1, rearIn + 4));
  h = difference(h, ...leadPhi.map((phi) => radialBox(46, 51, 3, zBack - 1, rearIn + 1, phi)));
  h = difference(h, ...screws.map((phi) => atXY(screwR, phi, disc(1.3, front - 14, front + 1))));
  // hose barbs at both ends of the coolant spiral
  const turns = (stack - 6) / 7;
  const barbAt = (z, phi) => rotate([0, 0, phi], translate([jacketRo - 2, 0, z], rotate([0, 90, 0], union(
    cylinder({ r: 3, h: 14 }), translate([0, 0, 10], cylinder({ r1: 3.6, r2: 3, h: 2.5 }))))));
  // the holes start inside the groove: piercing the bore itself makes the kernel
  // triangulate the bore face with chords that cut into the core
  const holeAt = (z, phi) => rotate([0, 0, phi], translate([jacketRi + 1.0, 0, z], rotate([0, 90, 0], cylinder({ r: 1.4, h: 30 }))));
  const endPhi = (360 * turns) % 360;
  // the top barb sits 0.1 mm low: at stack - 3 its round top just touched the
  // top face of the rib at z 38..40, and SMLib refuses that grazing union
  h = union(h, barbAt(3, 0), barbAt(stack - 3.1, endPhi));
  h = difference(h, holeAt(3, 0), holeAt(stack - 3, endPhi));
  // the coolant spiral itself: a groove in the bore, closed by the core
  return difference(h, translate([0, 0, 3], tube(helix({ r: jacketRi + 1.3, pitch: 7, turns, steps: 48 }), { r: 1.5, sides: 8 })));
}

// five swept windows, wider toward the hub, always leaving a 9 mm spoke
function windows() {
  const winRi = 18, winRo = 50, nWin = 5, sweep = 0.8, spoke0 = 90;
  const spanAt = (r) => Math.min(40 * 36 / r, 360 / nWin - (9 / r) * 180 / Math.PI);
  // each side is six smooth curves through the edge (within 0.01 mm of it),
  // not 24 straight facets: the facets made the lid a 15 s build, this < 1 s
  return ringOf(nWin, (c0) => {
    const c = spoke0 + c0 + 360 / nWin / 2, n = 6;
    const edge = (j, side) => {
      const r = winRi + ((winRo - winRi) * j) / n;
      return pt(r, c + sweep * (r - winRi) + side * spanAt(r) / 2, 0).slice(0, 2);
    };
    // the edge's direction a third of a step along, for the curve's handles
    const lean = (j, side) => {
      const e = 1e-3, p = edge(j - e, side), q = edge(j + e, side);
      return [(q[0] - p[0]) / (6 * e), (q[1] - p[1]) / (6 * e)];
    };
    const run = (side, from, to) => {
      const out = [], s = Math.sign(to - from);
      for (let j = from; j !== to; j += s) {
        const a = edge(j, side), b = edge(j + s, side), da = lean(j, side), db = lean(j + s, side);
        out.push(bezierTo([a[0] + s * da[0], a[1] + s * da[1]], [b[0] - s * db[0], b[1] - s * db[1]], b));
      }
      return out;
    };
    const outline = path2d(edge(0, -1), ...run(-1, 0, n), edge(n, 1), ...run(1, n, 0));
    return translate([0, 0, front - 1], linearExtrude({ h: lidT + 2 }, outline));
  });
}

function lidC() {
  const z1 = front + lidT;
  // screw holes first, while the plate is still plain: cut after the windows
  // they stall the exact kernel where the counterbores meet the rim chamfer
  let p = union(disc(jacketRo + 5, front, z1 - 1.5), taper(jacketRo + 5, jacketRo + 3.5, z1 - 1.5, z1));
  for (const phi of screws) p = difference(p, atXY(screwR, phi, union(disc(1.7, front - 1, z1 + 1), disc(3.25, z1 - 2, z1 + 1))));
  p = union(p, ring(53.6, jacketRi - fit, stack + 0.2, front + 0.01),     // long spigot clamps the core
    disc(15, frontBrgZ - 3, front + 0.01));                               // bearing boss
  return difference(p, ...windows(), disc(brgSeatR, frontBrgZ - 0.01, frontBrgZ + brgW), disc(6, frontBrgZ - 4, z1 + 1));
}

// ---- rotor -----------------------------------------------------------------
const segTypes = ["out", "cw", "in", "ccw"];       // magnetisation turns -90 deg per segment
// one segment in its print frame: centred on +X, bottom on z = 0, arrow on top
function segment(kind) {
  const half = 360 / segs / 2 - 0.25, top = stack - 0.4, rm = (magRi + magRo) / 2;
  const turn = { out: 0, ccw: 90, in: 180, cw: -90 }[kind];
  const arrow = rotate([0, 0, turn], union(
    translate([-2.3, -0.55, 0], cube([3.4, 1.1, 1])),
    linearExtrude({ h: 1 }, polygon([[1.0, -1.35], [2.5, 0], [1.0, 1.35]]))));
  return difference(
    union(sector(magRi, magRo, -half, half, 0, top), radialBox(magRi - 1, magRi + 0.1, 1.2, 0, top, 0)),
    translate([rm, 0, top - 0.6], arrow));
}
const segAngle = (j) => (360 * j) / segs + 180 / segs;

function rotorHub() {
  return difference(
    union(ring(hubRi, hubRo, -2, stack), ring(4.4, 8, -2, stack),
      ...ringOf(6, (a) => radialBox(7.5, 18.5, 3.5, -2, stack - 4, a), 30),
      ring(hubRi, sleeveRo, -2, 0)),                                       // flange under the magnets
    ...ringOf(segs, (a) => radialBox(magRi - 1.2, hubRo + 0.5, 1.6, -0.01, stack + 1, a), 180 / segs),
    hexPrism(8.3, -3, stack + 1),
    ...ringOf(6, (a) => atXY(19.4, a, disc(1.25, stack - 6, stack + 1))));
}

function rotorCap() {
  return difference(
    union(ring(hubRi, sleeveRo, stack, stack + 2), ring(4.4, 8, stack, stack + 2),
      ...ringOf(6, (a) => radialBox(7.5, 18.5, 3.5, stack, stack + 2, a), 30),
      ...ringOf(6, (a) => atXY(19.4, a, disc(1.05, stack - 5.5, stack + 0.01)))),
    hexPrism(8.3, stack - 1, stack + 3));
}

function shaftC() {
  return difference(union(
    taper(3.5, 4, rearBrgZ - 0.5, rearBrgZ), disc(4, rearBrgZ, -2),
    hexPrism(8, -2, stack),                                               // drives the hub
    disc(4, stack, shaftEnd),
    hexPrism(6, shaftEnd, shaftEnd + 11.5)),
  disc(2, rearBrgZ - 1, shaftEnd + 13));                                  // hollow
}

function outputHub() {
  const z0 = shaftEnd, z1 = shaftEnd + 20;
  let body = union(disc(12, z0, z0 + 3), disc(9, z0 + 3, z0 + 6), disc(8, z0 + 6, z1 - 1.05), taper(8, 7, z1 - 1.05, z1));
  body = difference(body, hexPrism(6.3, z0 - 1, z0 + 12));
  body = difference(body, disc(4, z0 + 13, z1 + 1));
  return union(body, ...ringOf(16, (a) => radialBox(7.7, 9.2, 1.6, z0 + 6, z1 - 1.3, a)));
}

// ---- the assembly ----------------------------------------------------------
// Listed from the inside out, so the motor builds outward on screen: shaft and
// rotor first, then the stator and its copper, the housing last. Order never
// changes the build time (the kernel hosts are balanced by size, heaviest
// first); it only changes which part lands first.
// Explode opens the stack along the axis: housing and weld ring drop back,
// the crowns lift off the core, and the rotor rises out through the front with
// its magnet segments fanning outward.
const copper = { color: "#c8702a", finish: "copper" };
const metal = { color: "#c9ccd1", finish: "metal" };
// eight of each segment type; copy i of type k is segment 4i + k round the rotor
const magnets = Object.fromEntries(segTypes.map((kind, k) => [`magnet_${kind}`, {
  shape: segment(kind), count: segs / 4, color: kind === "out" || kind === "in" ? "#4a4f57" : "#b23a2e", finish: "metal",
  place: (s, i) => rotate([0, 0, segAngle(4 * i + k)], s),
  explode: [14, 0, 225],          // in the segment's own frame: outward, then up with the hub
}]));
return assembly({
  shaft: { shape: shaftC(), ...metal, explode: [0, 0, 225] },
  spacer_rear: { shape: ring(4.15, 6, rearBrgZ + brgW, -2), ...metal, explode: [0, 0, 195] },
  spacer_front: { shape: ring(4.15, 6, stack + 2, frontBrgZ), ...metal, explode: [0, 0, 330] },
  output_hub: { shape: outputHub(), ...metal, explode: [0, 0, 400] },
  rotor_hub: { shape: rotorHub(), ...metal, explode: [0, 0, 225] },
  ...magnets,
  sleeve: { shape: ring(sleeveRi, sleeveRo, 0, stack), color: "#1c1f24", finish: "gloss", explode: [0, 0, 270] },
  rotor_cap: { shape: rotorCap(), ...metal, print: "flip", explode: [0, 0, 300] },
  stator_core: { shape: statorCore(), color: "#6f7680", finish: "steel" },
  crown_inner: { shape: crownRing(0, 1, riseInner), ...copper, print: "flip", explode: [0, 0, 60] },
  crown_outer: { shape: crownRing(2, 3, riseOuter), ...copper, print: "flip", explode: [0, 0, 135] },
  weld_ring: { shape: weldRing(), ...copper, explode: [0, 0, -65] },
  lid: { shape: lidC(), color: "#1c1f24", finish: "gloss", print: "flip", explode: [0, 0, 360] },
  housing: { shape: housingC(), color: "#b9bec6", finish: "aluminium", explode: [0, 0, -130] },
});
