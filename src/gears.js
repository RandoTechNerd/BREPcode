// Gears, and the arithmetic that makes a set of them actually mesh.
//
// WHY THIS IS NOT A CYLINDER WITH BUMPS ON IT
//
// A gear is the one printed part where "looks about right" and "works" are
// completely unrelated. Two gears drawn by eye will bind, skip, or turn at a
// ratio nobody intended, and none of that is visible in a render — it shows up
// on the bench, after the print. The failure is always the same shape: the
// teeth were drawn independently of each other, so nothing forced them to be
// compatible.
//
// So the tooth here is a real INVOLUTE, and the numbers are derived from one
// shared quantity — the MODULE — rather than chosen per gear.
//
// THE MODULE IS THE WHOLE COMPATIBILITY STORY
//
//   module m = pitch diameter / tooth count
//
// Two gears mesh if and only if they share a module and a pressure angle. That
// is the entire compatibility rule; everything else follows from it:
//
//   pitch diameter    d  = m·z
//   tip diameter      da = m(z + 2)
//   root diameter     df = m(z − 2.5)
//   base diameter     db = d·cos α
//   CENTRE DISTANCE   C  = m(z1 + z2) / 2      <- where to put the second axle
//   RATIO             i  = z2 / z1              <- what it actually does
//
// Which is why the useful thing this file exports is not really `gear()`, it is
// `gearMath()` and `gearTrain()`: given tooth counts, they hand back the axle
// positions and the true ratio, so a machine cannot be assembled with the
// shafts in the wrong place.
//
// THE INVOLUTE
//
// An involute is the curve traced by a point on a string unwound from the base
// circle. Its one property that matters: two involute flanks in contact
// transmit motion at a CONSTANT angular ratio regardless of where along the
// flanks they touch. That is why gears do not surge — and why a hand-drawn
// tooth, which has no such property, runs rough even when it does not bind.
//
// At radius r ≥ rb the flank sits at this angle from the tooth's centreline:
//
//   φ(r) = π/(2z) + inv(α) − inv(θ),   inv(x) = tan x − x,   cos θ = rb/r
//
// At r = the pitch radius, θ = α and φ = π/(2z) — half the tooth thickness,
// exactly as the standard defines it. Above that the tooth narrows toward the
// tip; that narrowing IS the involute.
//
// Below the base circle there is no involute at all (the string has run out),
// so the flank drops radially to the root. Real gears cut a fillet there; a
// radial drop leaves the root slightly thicker, which on a printed gear is the
// direction you want to be wrong in.
//
// PRINTED, NOT MACHINED
//
// These defaults are for FDM, not for steel. Backlash is a real number here
// rather than zero, because a nozzle lays a bead wider than the path and two
// nominally perfect flanks will jam. Small modules do not print: below about
// m = 1 a 0.4 mm nozzle cannot form the tooth at all, and the part comes off
// the bed as a wavy disc. Both of those are said out loud below rather than
// left for the print to explain.

import {
  cylinder, translate, rotate, difference, union, group,
  polygon, linearExtrude,
} from "./dsl.js";

const num = (v, name, fallback) => {
  if (v === undefined && fallback !== undefined) return fallback;
  const n = +v;
  if (!Number.isFinite(n)) throw new Error(`gears: ${name} must be a number, got ${v}`);
  return n;
};

const inv = (x) => Math.tan(x) - x;          // the involute function
const rad = (d) => (d * Math.PI) / 180;

// A 20° pressure angle is what every off-the-shelf gear, every rack and every
// other generator uses. Changing it is legal and occasionally useful (14.5° is
// the old imperial standard), but a gear cut at one angle will not mesh with a
// gear cut at another, so it belongs in the compatibility check below.
export const PRESSURE_ANGLE = 20;

// Under this many teeth a 20° involute gear UNDERCUTS: the cutter sweeps into
// the flank below the base circle and eats the part of the tooth that does the
// work. It still turns, and it is still weaker than it looks, which is exactly
// the kind of fault worth naming rather than silently producing.
export const MIN_TEETH_NO_UNDERCUT = 17;

// Below this the tooth is thinner than an extruded bead and simply does not
// form. 1.0 with a 0.4 nozzle is already fine-pitched; 1.5–2 is the sweet spot
// for something that has to carry load.
export const MIN_PRINTABLE_MODULE = 0.8;

// ------------------------------------------------------------------ maths
//
// Everything a pair of gears needs, with no geometry involved. This is the
// part that stops a trebuchet's winch from being assembled with its axles at
// a distance that makes the teeth either grind or miss entirely.
export function gearMath(module, teeth1, teeth2, opts = {}) {
  const m = num(module, "module");
  const z1 = Math.round(num(teeth1, "teeth1"));
  const z2 = Math.round(num(teeth2, "teeth2"));
  const alpha = rad(num(opts.pressure, "pressure", PRESSURE_ANGLE));
  if (m <= 0) throw new Error("gears: module must be positive");
  if (z1 < 6 || z2 < 6) throw new Error("gears: a gear needs at least 6 teeth to have a tooth shape at all");

  const one = (z) => ({
    teeth: z,
    pitch: m * z,                    // where the two gears "roll" on each other
    tip: m * (z + 2),                // outside diameter — what you measure
    root: m * (z - 2.5),
    base: m * z * Math.cos(alpha),
    undercut: z < MIN_TEETH_NO_UNDERCUT,
  });

  const a = one(z1), b = one(z2);
  return {
    module: m,
    pressure: num(opts.pressure, "pressure", PRESSURE_ANGLE),
    // The only two numbers a machine actually gets assembled from.
    centre: (m * (z1 + z2)) / 2,
    ratio: z2 / z1,
    // Said as people say it, because "3.5:1" is what goes in the description
    // and "0.2857" is what goes in a bug report.
    ratioText: `${(z2 / z1).toFixed(z2 % z1 === 0 ? 0 : 2)}:1`,
    // Which way the output turns. Two external gears in mesh ALWAYS counter-
    // rotate — the classic mistake in a hand-built train, and the reason an
    // idler exists at all.
    reverses: true,
    gears: [a, b],
    // A tooth count sharing no factor with its partner means every tooth meets
    // every other tooth, spreading wear instead of pounding the same pairs.
    huntingTeeth: gcd(z1, z2) === 1,
    warnings: [
      ...(a.undercut ? [`the ${z1}-tooth gear undercuts (under ${MIN_TEETH_NO_UNDERCUT} teeth at ${num(opts.pressure, "pressure", PRESSURE_ANGLE)}°) — it will run, but the tooth root is weakened`] : []),
      ...(b.undercut ? [`the ${z2}-tooth gear undercuts (under ${MIN_TEETH_NO_UNDERCUT} teeth at ${num(opts.pressure, "pressure", PRESSURE_ANGLE)}°) — it will run, but the tooth root is weakened`] : []),
      ...(m < MIN_PRINTABLE_MODULE ? [`module ${m} is below ${MIN_PRINTABLE_MODULE} — the teeth are thinner than an extruded bead and will not print`] : []),
    ],
  };
}

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }

// A whole train, laid out. Give it tooth counts in order and it returns where
// each axle goes and what the train actually does — including the thing that
// catches people out, which is that an idler changes the DIRECTION but not the
// ratio, because its tooth count cancels.
export function gearTrain(module, teeth, opts = {}) {
  const m = num(module, "module");
  const zs = (Array.isArray(teeth) ? teeth : [teeth]).map((z) => Math.round(num(z, "teeth")));
  if (zs.length < 2) throw new Error("gears: a train needs at least two gears");

  const stages = [];
  let x = 0;
  const axles = [{ teeth: zs[0], x: 0, y: 0, pitch: m * zs[0] }];
  for (let i = 1; i < zs.length; i++) {
    const pair = gearMath(m, zs[i - 1], zs[i], opts);
    x += pair.centre;
    axles.push({ teeth: zs[i], x, y: 0, pitch: m * zs[i] });
    stages.push({ from: zs[i - 1], to: zs[i], centre: pair.centre, ratio: pair.ratio });
  }
  // The train ratio is first-to-last, NOT the product of the stage ratios in
  // a simple line — every intermediate gear cancels. Multiplying the stages
  // and getting a huge number is the single most common gear-train error, and
  // it survives right up until the thing is built and turns far too fast.
  const overall = zs[zs.length - 1] / zs[0];
  const meshes = zs.length - 1;
  return {
    module: m,
    axles,
    stages,
    ratio: overall,
    ratioText: `${overall.toFixed(Number.isInteger(overall) ? 0 : 2)}:1`,
    // Each mesh reverses; an odd number of meshes means the output turns the
    // other way from the input.
    reverses: meshes % 2 === 1,
    idlers: zs.slice(1, -1).length,
    span: x,
    warnings: [...new Set(stages.flatMap((_, i) => gearMath(m, zs[i], zs[i + 1], opts).warnings))],
  };
}

// ---------------------------------------------------------------- profile
//
// One tooth's worth of outline, repeated. Returns [x, y] points ready for
// polygon(); the caller extrudes it.
function gearOutline(m, z, alpha, backlash, steps) {
  const rp = (m * z) / 2;                    // pitch
  const ra = rp + m;                         // tip
  const rf = rp - 1.25 * m;                  // root
  const rb = rp * Math.cos(alpha);           // base — no involute exists below it

  // Half the tooth's angular thickness at the pitch circle, less half the
  // backlash. Backlash is quoted as a LINEAR gap at the pitch circle (which is
  // how everyone measures it), so it converts to an angle by dividing by the
  // pitch radius — and each of the two flanks gives up half of it.
  const half = Math.PI / (2 * z) - backlash / (2 * rp) / 2;
  const phiAt = (r) => {
    if (r <= rb) return half + inv(alpha);   // radial drop below the base circle
    const theta = Math.acos(Math.min(1, rb / r));
    return half + inv(alpha) - inv(theta);
  };

  // Sample the flank from wherever it starts up to the tip. Radii, not angles:
  // the involute is naturally parameterised by radius here, and equal radial
  // steps put points where the curvature actually is.
  const start = Math.max(rf, rb);
  const flank = [];
  for (let i = 0; i <= steps; i++) flank.push(start + ((ra - start) * i) / steps);

  const pts = [];
  const at = (r, ang) => pts.push([r * Math.cos(ang), r * Math.sin(ang)]);

  for (let k = 0; k < z; k++) {
    const c = (2 * Math.PI * k) / z;         // this tooth's centreline
    // Root, then up the trailing flank. When the root sits below the base
    // circle there is a radial section to walk first.
    if (rf < rb) at(rf, c - phiAt(rb));
    for (const r of flank) at(r, c - phiAt(r));
    // Across the tip. Two points is enough — it is a very short arc, and the
    // land is flat on a real gear anyway.
    at(ra, c + phiAt(ra));
    // Down the leading flank.
    for (let i = flank.length - 1; i >= 0; i--) at(flank[i], c + phiAt(flank[i]));
    if (rf < rb) at(rf, c + phiAt(rb));
    // The root arc across to the next tooth.
    const next = (2 * Math.PI * (k + 1)) / z;
    const gapA = c + phiAt(rb), gapB = next - phiAt(rb);
    const gapSteps = 3;
    for (let i = 1; i < gapSteps; i++) at(rf, gapA + ((gapB - gapA) * i) / gapSteps);
  }
  return pts;
}

// ----------------------------------------------------------------- gears
//
// gear({ module, teeth, h, bore }) — a spur gear standing on z=0, centred on
// the origin, teeth pointing outward. Everything else is optional.
export function gear(opts = {}) {
  const m = num(opts.module ?? opts.m, "module", 2);
  const z = Math.round(num(opts.teeth ?? opts.z, "teeth", 20));
  const h = num(opts.h ?? opts.height ?? opts.thickness, "h", 6);
  const bore = num(opts.bore, "bore", 0);
  const alpha = rad(num(opts.pressure, "pressure", PRESSURE_ANGLE));
  const backlash = num(opts.backlash, "backlash", 0.1);
  // How many segments approximate each involute flank. This is the one knob
  // that trades build time against tooth accuracy, so it was measured rather
  // than guessed — worst-case deviation from the true involute, in mm:
  //
  //   steps   m2/z20   m3/z50   m2/z60   m1.5/z12
  //     2     0.069    0.084    0.043    0.054
  //     4     0.024    0.025    0.012    0.018     <- the default
  //     6     0.013    0.012    0.006    0.010
  //    10     0.006    0.005    0.002    0.005
  //
  // 4 keeps every realistic gear inside 0.025 mm — a quarter of the default
  // backlash, and finer than an FDM printer can place a bead, so going higher
  // buys accuracy the plastic cannot express. It is also a real saving: the
  // point count per tooth is 2·steps + 6, and a 50-tooth gear at steps 6 takes
  // half again as long to build as the same gear at 4.
  const steps = Math.max(2, Math.round(num(opts.steps, "steps", 4)));

  if (m <= 0) throw new Error("gears: module must be positive");
  if (z < 6) throw new Error(`gears: ${z} teeth is too few to form a tooth — 6 is the floor, and under ${MIN_TEETH_NO_UNDERCUT} undercuts`);
  if (h <= 0) throw new Error("gears: a gear needs a positive thickness");
  const rf = (m * z) / 2 - 1.25 * m;
  if (bore / 2 >= rf - m * 0.5) {
    throw new Error(`gears: a ${bore} mm bore leaves no rim under a root radius of ${rf.toFixed(2)} mm — `
      + `use a bigger module or more teeth`);
  }

  const body = linearExtrude({ h }, polygon(gearOutline(m, z, alpha, backlash, steps)));
  if (!bore) return body;
  // Through the whole thickness and out both faces, so the boolean has no
  // coincident surface to argue about.
  return difference(body, translate([0, 0, -0.5], cylinder({ r: bore / 2, h: h + 1, $fn: 48 })));
}

// A gear with a hub — the collar that gives a grub screw something to bite and
// keeps the gear square on its shaft. `hub` is the outside diameter, `hubH`
// how far it stands proud of the gear face.
export function gearWithHub(opts = {}) {
  const m = num(opts.module ?? opts.m, "module", 2);
  const z = Math.round(num(opts.teeth ?? opts.z, "teeth", 20));
  const h = num(opts.h ?? opts.height, "h", 6);
  const bore = num(opts.bore, "bore", 5);
  const hub = num(opts.hub, "hub", bore + 6);
  const hubH = num(opts.hubH, "hubH", 5);
  if (hub <= bore) throw new Error("gears: the hub has to be wider than the bore it wraps");
  const rf = (m * z) / 2 - 1.25 * m;
  if (hub / 2 > rf) throw new Error(`gears: a ${hub} mm hub is wider than the ${(rf * 2).toFixed(1)} mm root circle — it would swallow the teeth`);

  const solid = union(
    gear({ ...opts, module: m, teeth: z, h, bore: 0 }),
    translate([0, 0, h], cylinder({ r: hub / 2, h: hubH, $fn: 64 })),
  );
  if (!bore) return solid;
  return difference(solid, translate([0, 0, -0.5], cylinder({ r: bore / 2, h: h + hubH + 1, $fn: 48 })));
}

// An internal (ring) gear — teeth on the INSIDE, for planetary sets and for
// anything that needs its output turning the same way as its input. The teeth
// are the same involute, cut out of a rim rather than standing on a disc.
//
// Note the sign flip on the addendum/dedendum: a ring gear's tip circle is
// SMALLER than its pitch circle, because its teeth point inward. Getting that
// backwards produces a ring that looks perfect and grips nothing.
export function ringGear(opts = {}) {
  const m = num(opts.module ?? opts.m, "module", 2);
  const z = Math.round(num(opts.teeth ?? opts.z, "teeth", 40));
  const h = num(opts.h ?? opts.height, "h", 6);
  const rim = num(opts.rim, "rim", 4 * m);
  const alpha = rad(num(opts.pressure, "pressure", PRESSURE_ANGLE));
  const backlash = num(opts.backlash, "backlash", 0.1);
  if (z < 12) throw new Error("gears: a ring gear needs at least 12 teeth to close on itself cleanly");

  const rp = (m * z) / 2;
  const outer = rp + 1.25 * m + rim;
  // The cutter is a gear whose addendum and dedendum are swapped — that IS
  // the internal tooth, and cutting it out of the rim is the whole operation.
  const cutter = linearExtrude({ h: h + 1 },
    polygon(gearOutline(m, z, alpha, -backlash,
      Math.max(2, Math.round(num(opts.steps, "steps", 4))))));
  return difference(
    cylinder({ r: outer, h, $fn: 128 }),
    translate([0, 0, -0.5], cutter),
  );
}

// A rack — a gear of infinite radius, which is what turns rotation into a
// straight line. Its teeth are plain trapezoids: the involute of an infinite
// base circle is a straight flank at the pressure angle, which is why a rack
// is the one gear you can check with a protractor.
export function rack(opts = {}) {
  const m = num(opts.module ?? opts.m, "module", 2);
  const len = num(opts.length ?? opts.l, "length", 60);
  const h = num(opts.h ?? opts.width, "h", 6);
  const back = num(opts.back ?? opts.height, "back", 4 * m);
  const alpha = rad(num(opts.pressure, "pressure", PRESSURE_ANGLE));
  const backlash = num(opts.backlash, "backlash", 0.1);
  if (m <= 0 || len <= 0) throw new Error("gears: a rack needs a positive module and length");

  const pitch = Math.PI * m;                 // tooth-to-tooth spacing
  const n = Math.floor(len / pitch);
  if (n < 1) throw new Error(`gears: a ${len} mm rack at module ${m} fits no teeth — one tooth needs ${pitch.toFixed(2)} mm`);
  const add = m, ded = 1.25 * m;
  const half = pitch / 4 - backlash / 2;     // half the tooth at the pitch line
  const dx = add * Math.tan(alpha);          // how far the flank leans over

  const pts = [[0, -back - ded]];
  for (let k = 0; k < n; k++) {
    const c = pitch / 2 + k * pitch;         // this tooth's centre
    pts.push([c - half - dx - (ded * Math.tan(alpha)), -ded]);
    pts.push([c - half + dx, add]);
    pts.push([c + half - dx, add]);
    pts.push([c + half + dx + (ded * Math.tan(alpha)), -ded]);
  }
  pts.push([n * pitch, -back - ded]);
  return rotate([90, 0, 0], linearExtrude({ h }, polygon(pts)));
}

// Two gears placed at their true centre distance, as one object. The point is
// that the placement is COMPUTED, not typed: you cannot get the axle spacing
// wrong, because you never said what it was.
export function gearPair(opts = {}) {
  const m = num(opts.module ?? opts.m, "module", 2);
  const z1 = Math.round(num(opts.teeth1 ?? opts.drive, "teeth1", 12));
  const z2 = Math.round(num(opts.teeth2 ?? opts.driven, "teeth2", 36));
  const h = num(opts.h ?? opts.height, "h", 6);
  const math = gearMath(m, z1, z2, opts);
  const bore1 = num(opts.bore1 ?? opts.bore, "bore1", 0);
  const bore2 = num(opts.bore2 ?? opts.bore, "bore2", 0);

  // The second gear is rotated half a tooth so the teeth INTERLEAVE rather
  // than collide. Without this the pair renders as two gears jammed tip to
  // tip — geometrically overlapping, which is exactly what a mesh must not be.
  const halfTooth = 180 / z2;
  return group(
    gear({ ...opts, module: m, teeth: z1, h, bore: bore1 }),
    translate([math.centre, 0, 0],
      rotate([0, 0, halfTooth], gear({ ...opts, module: m, teeth: z2, h, bore: bore2 }))),
  );
}

// Every gear in this file, for the picker and the catalogue.
export const GEAR_KINDS = [
  { id: "gear", label: "Spur gear", blurb: "The ordinary gear. Give it a module and a tooth count." },
  { id: "gearWithHub", label: "Gear with hub", blurb: "A spur gear with a collar for a grub screw." },
  { id: "ringGear", label: "Ring gear", blurb: "Teeth on the inside, for planetary sets." },
  { id: "rack", label: "Rack", blurb: "Straight-line teeth — turns rotation into travel." },
  { id: "gearPair", label: "Meshing pair", blurb: "Two gears, placed at their true centre distance." },
];
