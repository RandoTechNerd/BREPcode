// Casefinity: a printed hinged case whose cavity is a Casefinity grid, and the
// bins, lids and separator frames that register in it.
//
// CREDIT
//
// The interface follows the Casefinity Liner Interior & Accessory
// Specification (proposed v0.3) by Chris Agocs, https://casefinity.net
// (generator source: github.com/chrisagocs). Casefinity is built on
// "Gridfinity for Hardcases", designed by the Unemployed Architect. Gridfinity
// itself is Zack Freedman's open standard. The geometry here is written from
// the published spec's numbers, not copied from either project's code.
//
// THE INTERFACE (spec section 2, never changed here)
//
//   P  module pitch      15 mm (42 for a Gridfinity-size grid)
//   w  rib width          3.00 at the wall face
//   b  bump height        1.50 (ribs stand b proud, sockets are b deep)
//   c  clearance          0.10 per face (the one tuning knob, 0.10 to 0.20)
//   θ  draft              2° about the wall NORMAL, never about Z
//
// A bin n modules wide is n*P - 2c across its wall faces. Ribs stand on its
// -X and +Y faces, sockets (w + 2c wide) are cut into its +X and -Y faces, one
// of each per module centre, full height. The case cavity is exactly N*P and
// carries the mirror set: ribs on its -Y and +X walls, line-to-line grooves on
// +Y and -X. So a bin registers against the case and against its neighbours.
// A thin bin wall (under 2b) gets an interior boss behind each socket so the
// socket stays a blind pocket (REQ-4.4).
//
// What is ours rather than the spec's: the case itself (hinge, snap latch,
// lid seal tongue), the press-fit bin lid (the spec names a sliding lock but
// publishes no geometry for it), and the separator frame, which is a bin with
// no floor, registering exactly like one.

import {
  cube, cylinder, translate, rotate, difference, union, group,
  polygon, linearExtrude, fillet, chamfer, colorize,
} from "./dsl.js";

export const CASEFINITY = Object.freeze({
  pitch: 15, rib: 3.0, bump: 1.5, clear: 0.1, draft: 2, pullTab: 5,
  // ours, not the spec's
  wall: 1.2, floor: 1.2, lidPlate: 1.6,
});

// Case defaults (mm). Everything a person types into the builder.
const CASE = Object.freeze({
  wall: 4, floor: 2, lidHeight: 18, corner: 6,
  // lid-to-body clearance per side. 0.2 printed tight on the smallest case
  tongue: 2, shoulder: 1.8, lidFit: 0.3,
  pin: 1.75, pinClear: 0.15, knuckle: 5.4, knuckles: 5, hingeGap: 0.4,
  // pinFit rides on top of pinClear for EVERY filament pin (the lid hinge,
  // the swing latch's pivot). 0 is the measured tight fit: it held, but the
  // filament had to be forced in and would not come back out. 0.1 is the
  // default: in and out by hand.
  pinFit: 0.1,
  // the "hook" clasp: a blade on the lid with a window, its bottom bar hooking
  // under a wedge on the body. 1.6 thick flexing 0.6 over 11 mm is ~1.2 %
  // strain (PLA holds to ~2.5 %); the first cut's 1.3 x 1.6 bar on 3 mm legs
  // snapped off, so the legs are 4 and the bar 2.4
  latchWidth: 20, latchThick: 1.6, latchDrop: 11, latchCatch: 0.9, latchGap: 0.3,
  latchLeg: 4, latchBar: 2.4,
  // the "round" clasp: a round bead along the body's front rolls over a round
  // lip on a SOLID blade. No window, no flat underside anywhere: nothing to
  // support. The blade stands roundGap off the wall; the lip (radius roundLip,
  // mostly buried in the blade) stands roundLipOut in from it, 0.1 clear of
  // the wall at rest; the bead stands roundBead out, just touching the blade.
  // Passing costs roundBead + roundLipOut - roundGap = 0.6 of flex (~1.2 %),
  // and the lip sits 0.6 under the bead when closed
  roundBead: 0.7, roundLip: 0.9, roundLipOut: 0.6, roundGap: 0.7,
  topClear: 0.5,
  tabLean: 1.2,   // the bin's pull tab leans this far in off the front face, clear of the lid's wall
  // the "Koch Box" style, after Luca Koch's Parametric Hinged Storage Box
  // (printables.com/model/1517296): eight vertical ribs standing ribDepth
  // proud of the walls, chamfered on their bed-side edge, and a swing latch:
  // a plate on a filament pin between two lugs on the lid, whose lip slides
  // into a pocket in a pad on the body's front. Under load the pad's roof
  // pushes the lip down inboard of the pin, which turns the latch INTO the
  // body, so it cannot shake open; the lip is a snug 0.1 a side in its pocket.
  ribDepth: 3, ribMin: 4, ribChamfer: 2.5,
  swingThick: 2, swingBoss: 5, swingLipIn: 2.2, swingGap: 0.2, swingPinOut: 5.5, swingPinUp: 8,
  lugWidth: 4, lugHalf: 5, lugR: 2.5, padDrop: 10, padRoof: 3, pocketH: 4, pocketDepth: 2.2,
  // print-in-place pivots: a printed pin (radius pipPin) through a hole
  // pipClear bigger, the moving part pipGap off whatever it swings past and
  // pipLug off the lugs either side. Printed with the lid upside down, so
  // the pin is a horizontal cylinder in a horizontal hole: the standard
  // print-in-place hinge
  pipPin: 1.5, pipClear: 0.35, pipGap: 0.5, pipLug: 0.4,
  // the snap: a round bar across the pad face, standing beadBite further out
  // than the plate's resting gap, with a matching groove in the plate. The
  // plate flexes beadBite outward on the way in and clicks into the groove
  // at closed, so the latch holds pressed to the pad instead of hanging;
  // the lip under the roof still takes the lifting load
  beadBite: 0.3, beadDrop: 1.0,
  // the folding toggle latch (see toggleLatch): a lever on a print-in-place
  // pin, a bail on a living hinge you fold after printing, a round catch
  // bar on the body's pad. Over-centre by toggleStretch of bail tension
  toggleUp: 10, leverLen: 12, leverThick: 2, living: 0.6, livingLen: 3,
  bailArm: 2.2, bailThick: 1.6, bailBar: 1.2, catchBar: 1.5, catchOut: 3, catchDrop: 5.3, toggleStretch: 0.25,
  leadIn: 0.6,    // chamfer on the tongue top and the lid skirt's mouth: the lid finds its own way on
  footChamfer: 0.5, // on the body's base and the lid's top (both bed-side edges): no elephant foot
  // the optional gasket: a ridge along the tongue top, a trench in the lid
  // groove's ceiling. Rigid labyrinth, 0.15 a side, not a squashed bead.
  crest: 0.8, crestHeight: 0.8, trenchClear: 0.15, trenchDepth: 1.0,
});

const num = (v, name, d) => {
  const n = v == null ? d : +v;
  if (!Number.isFinite(n)) throw new Error(`casefinity: ${name} must be a number, got ${v}`);
  return n;
};
const int1 = (v, d) => Math.max(1, Math.round(num(v, "count", d)));
const tanD = (deg) => Math.tan((deg * Math.PI) / 180);

// ------------------------------------------------------------------ sizing

// How a case of these OUTSIDE (or inside) measurements comes out: whole
// modules in the cavity, the walls taking up whatever is left over (the
// cavity never stretches, INV-7). Pure numbers, used by the builder's grid.
export function casefinityFit(width, depth, height, opts = {}) {
  const P = num(opts.pitch, "pitch", CASEFINITY.pitch);
  const wall = num(opts.wall, "wall", CASE.wall);
  const floor = num(opts.floor, "floor", CASE.floor);
  const inside = opts.inside === true;
  let W = num(width, "width"), D = num(depth, "depth"), Ht = num(height, "height");
  if (inside) { W += 2 * wall; D += 2 * wall; }
  const lidHeight = num(opts.lidHeight, "lidHeight", CASE.lidHeight);
  if (inside) Ht += floor + lidHeight;                // inside height = the body's cavity depth
  const cols = Math.max(0, Math.floor((W - 2 * wall) / P));
  const rows = Math.max(0, Math.floor((D - 2 * wall) / P));
  const bodyH = Ht - lidHeight;
  const cavityH = bodyH - floor + CASE.tongue;        // floor to the top of the tongue
  return {
    cols, rows, pitch: P,
    width: W, depth: D, height: Ht, bodyHeight: bodyH, lidHeight,
    inner: [cols * P, rows * P, bodyH - floor],
    wallX: (W - cols * P) / 2, wallY: (D - rows * P) / 2,
    binHeight: +(cavityH - CASE.topClear).toFixed(2),
    // headroom in the closed lid, above a full-height bin, for the pull tab
    headroom: +(lidHeight - floor - CASE.tongue + CASE.topClear).toFixed(2),
    fits: cols > 0 && rows > 0 && bodyH > floor + 10,
  };
}

// ------------------------------------------------- registration features

// One outline with every rib, groove, socket and boss of a part drawn into it,
// so a whole part is ONE extrusion (or one extrusion cut). Building each rib as
// its own prism made a case forty features long, and the kernel's cost grows
// with the feature count much faster than with the outline's point count.
//
// Walks a w x d rectangle (centred) counter-clockwise from its front-left
// corner. `sides` = { front, right, back, left }, each
//   { at: [centres along that side, in world X or Y], width, depth, out, taper }
// out +1 stands the feature proud of the outline, -1 notches it in. A tapered
// feature is `width` at the outline and narrows by 2*tan(draft) per mm of
// depth (REQ-4.5); an untapered one (a boss) is square.
export function featuredOutline(w, d, sides, draft) {
  const t = tanD(draft), hw = w / 2, hd = d / 2;
  const S = [
    { k: "front", start: [-hw, -hd], dir: [1, 0], n: [0, -1], u: (c) => c + hw },
    { k: "right", start: [hw, -hd], dir: [0, 1], n: [1, 0], u: (c) => c + hd },
    { k: "back", start: [hw, hd], dir: [-1, 0], n: [0, 1], u: (c) => hw - c },
    { k: "left", start: [-hw, hd], dir: [0, -1], n: [-1, 0], u: (c) => hd - c },
  ];
  const pts = [];
  for (const s of S) {
    pts.push(s.start);
    const f = sides[s.k];
    if (!f) continue;
    const at = (u, v) => [s.start[0] + u * s.dir[0] + v * f.out * s.n[0], s.start[1] + u * s.dir[1] + v * f.out * s.n[1]];
    const fw = f.width / 2, tw = f.width / 2 - (f.taper === false ? 0 : f.depth * t);
    for (const u of f.at.map(s.u).sort((a, b) => a - b)) {
      pts.push(at(u - fw, 0), at(u - tw, f.depth), at(u + tw, f.depth), at(u + fw, 0));
    }
  }
  return polygon(pts);
}
export const prism = (outline, z0, h) => translate([0, 0, z0], linearExtrude({ h }, outline));
const spec = (opts) => ({
  pitch: num(opts.pitch, "pitch", CASEFINITY.pitch),
  rib: CASEFINITY.rib,
  bump: CASEFINITY.bump,
  clear: Math.min(0.2, Math.max(0.1, num(opts.clear, "clear", CASEFINITY.clear))),
  draft: num(opts.draft, "draft", CASEFINITY.draft),
});
const centres = (n, P) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * P);

// ------------------------------------------------------------------- bins

// A bin x by y modules, h tall, centred on the origin and standing on z = 0.
//   bottom: false  makes a FRAME (no floor): separators that register like a bin
//   divide: true   adds a wall on every module line inside it
//   tab:    true   the spec's 5 mm pull tab on the front (-Y) wall
//   solid:  true   the spec's Solid Block (no cavity, same features)
export function casefinityBin(opts = {}) {
  const o = spec(opts);
  const x = int1(opts.x, 1), y = int1(opts.y, 1);
  const wall = num(opts.wall, "wall", CASEFINITY.wall);
  const floor = num(opts.floor, "floor", CASEFINITY.floor);
  const h = num(opts.h, "h", 40);
  const bottom = opts.bottom !== false, solid = !!opts.solid;
  const tab = !!opts.tab && !solid;
  const tabH = CASEFINITY.pullTab;
  const bw = x * o.pitch - 2 * o.clear, bd = y * o.pitch - 2 * o.clear;
  if (h <= (bottom ? floor : 0) + 3) throw new Error(`casefinity: a ${h} mm bin is too short`);
  const s = o.rib + 2 * o.clear;
  const xs = centres(x, o.pitch), ys = centres(y, o.pitch);

  // the outside: sockets in the front and right faces, ribs on the back and left
  const sock = (at) => ({ at, width: s, depth: o.bump, out: -1 });
  const rib = (at) => ({ at, width: o.rib, depth: o.bump, out: 1 });
  const outside = featuredOutline(bw, bd, { front: sock(xs), right: sock(ys), back: rib(xs), left: rib(ys) }, o.draft);
  let body = prism(outside, 0, h);
  if (!solid) {
    // REQ-4.4: a b-deep socket cuts clean through a thin wall, so the inside
    // outline steps in round a boss behind each one
    const boss = (at) => ({ at, width: s + 2 * o.rib, depth: o.bump, out: -1, taper: false });
    const thin = wall < 2 * o.bump;
    const inside = featuredOutline(bw - 2 * wall, bd - 2 * wall, thin ? { front: boss(xs), right: boss(ys) } : {}, o.draft);
    const z0 = bottom ? floor : -1;
    body = difference(body, prism(inside, z0, h - z0 + 1));
  }
  const adds = [];
  if (!solid && opts.divide) {
    const zb = bottom ? floor - 0.4 : 0;
    const top = h - (opts.lidded ? 3 : 0);
    for (let i = 1; i < x; i++) {
      const lx = -bw / 2 + o.clear + i * o.pitch;
      adds.push(translate([lx - wall / 2, -bd / 2 + wall - 0.4, zb], cube([wall, bd - 2 * wall + 0.8, top - zb])));
    }
    for (let j = 1; j < y; j++) {
      const ly = -bd / 2 + o.clear + j * o.pitch;
      adds.push(translate([-bw / 2 + wall - 0.4, ly - wall / 2, zb], cube([bw - 2 * wall + 0.8, wall, top - zb])));
    }
  }
  if (tab) {
    // the pull tab stands on the front wall in pieces, leaving the sockets
    // open above the rim so a taller neighbour's rib still slides past. It
    // leans IN at 45° for its first tabLean, then rises straight: flush with
    // the bin's front face it sat 0.1 from the case lid's inner wall and
    // jammed the lid; set in, the lid passes it with room
    const tw = Math.min(bw - 4, 16), lean = CASE.tabLean, y1 = -bd / 2;
    let spans = [[-tw / 2, tw / 2]];
    for (const xx of xs) {
      spans = spans.flatMap(([a, b]) => [[a, Math.min(b, xx - s / 2 - 0.2)], [Math.max(a, xx + s / 2 + 0.2), b]]).filter(([a, b]) => b - a >= 2);
    }
    const prof = [[y1, h - 0.4], [y1 + wall, h - 0.4], [y1 + wall, h], [y1 + wall + lean, h + lean],
      [y1 + wall + lean, h + tabH], [y1 + lean, h + tabH], [y1 + lean, h + lean], [y1, h]];
    const flip = prof.map(([yy, zz]) => [-zz, yy]);
    for (const [a, b] of spans) adds.push(translate([a, 0, 0], rotate([0, 90, 0], linearExtrude({ h: b - a }, polygon(flip)))));
  }
  return adds.length ? union(body, ...adds) : body;
}

// The press-fit lid for a casefinityBin of the same x, y and wall: a plate the
// size of the bin's footprint with a plug ring that drops inside its walls
// (inside the socket bosses too). Printed plate-down.
export function casefinityBinLid(opts = {}) {
  const o = spec(opts);
  const x = int1(opts.x, 1), y = int1(opts.y, 1);
  const wall = num(opts.wall, "wall", CASEFINITY.wall);
  const t = num(opts.thick, "thick", CASEFINITY.lidPlate);
  const fit = num(opts.fit, "fit", 0.2);
  const bw = x * o.pitch - 2 * o.clear, bd = y * o.pitch - 2 * o.clear;
  const inset = wall + (wall < 2 * o.bump ? o.bump : 0) + fit;
  const pw = bw - 2 * inset, pd = bd - 2 * inset, ring = 1.2, ph = 2.5;
  const plate = translate([-bw / 2, -bd / 2, 0], cube([bw, bd, t]));
  const plug = difference(
    translate([-pw / 2, -pd / 2, t - 0.4], cube([pw, pd, ph + 0.4])),
    translate([-pw / 2 + ring, -pd / 2 + ring, t - 1], cube([pw - 2 * ring, pd - 2 * ring, ph + 2])));
  // a fingernail notch on the front edge, clear of the plug
  const notch = translate([-5, -bd / 2 - 0.5, -0.5], cube([10, 0.5 + wall * 0.7, t + 1]));
  return difference(union(plate, plug), notch);
}

// ------------------------------------------------------------------- case

function caseDims(opts) {
  const o = spec(opts);
  const c = { ...CASE };
  for (const k of Object.keys(CASE)) if (opts[k] != null) c[k] = num(opts[k], k);
  const fit = casefinityFit(num(opts.width, "width", 200), num(opts.depth, "depth", 140),
    num(opts.height, "height", 70), { pitch: o.pitch, wall: c.wall, floor: c.floor, lidHeight: c.lidHeight, inside: opts.inside });
  const cols = opts.cols != null ? int1(opts.cols) : fit.cols;
  const rows = opts.rows != null ? int1(opts.rows) : fit.rows;
  if (!cols || !rows) throw new Error(`casefinity: a ${fit.width} x ${fit.depth} case holds no whole ${o.pitch} mm module`);
  const Lin = cols * o.pitch, Win = rows * o.pitch;
  const L = Math.max(fit.width, Lin + 2 * c.wall), W = Math.max(fit.depth, Win + 2 * c.wall);
  const H = fit.bodyHeight;
  if (H < c.floor + 12) throw new Error(`casefinity: height ${fit.height} leaves a ${H} mm body under an ${c.lidHeight} mm lid`);
  const tongueT = c.wall - c.shoulder;
  const R = Math.min(c.corner, c.shoulder * 3.3, Math.min(L, W) / 4);
  // the tongue (and the lid's groove for it) follow the body's rounded
  // corners, one shoulder in. A square tongue inside a round corner left the
  // lid skirt with no wall at all at each corner.
  const rT = Math.max(0.6, R - c.shoulder);
  const kr = c.knuckle / 2, axisOff = c.hingeGap + kr;
  const koch = opts.style === "koch";
  // Koch ribs: width a tenth of the depth (4 at least), a fifth of the length
  // in from each end on the front and back, a quarter of the depth in on the
  // sides, pulled inboard where a small case's corner rounding would take them
  const ribW = Math.max(c.ribMin, W / 10);
  const ribX = Math.min(L / 2 - L / 5, L / 2 - R - ribW / 2);
  const ribY = Math.min(W / 4, W / 2 - R - ribW / 2);
  const lw = Math.max(8, Math.min(24, L / 8));    // the swing latch's width
  // the hinge sits between the back ribs in the Koch style
  const hingeLen = koch ? 2 * (ribX - ribW / 2) - 2 * c.hingeGap : L - 2 * R - 6;
  const segLen = (hingeLen - (c.knuckles - 1) * c.hingeGap) / c.knuckles;
  // the Koch style's latch: "swing" on a filament pin (a separate part),
  // "swingpip" the same latch printed in place on the lid, "toggle" the
  // folding over-centre latch. The smooth style keeps its hook and round clasps.
  const latch = koch
    ? (["swing", "swingpip", "toggle"].includes(opts.latch) ? opts.latch : "swingpip")
    : opts.latch === "round" ? "round" : "hook";
  const toggle = latch === "toggle";
  // how far the front hardware stands off the front wall, body side and lid side
  const latchOut = koch ? c.ribDepth + (toggle ? c.catchOut + c.catchBar : 0) : latch === "round" ? c.roundBead : c.latchCatch;
  const lidOut = koch ? (toggle ? c.ribDepth + c.pipGap + c.leverThick / 2 + c.lugR : c.swingPinOut + c.lugR) : (latch === "round" ? c.roundGap : c.latchGap) + c.latchThick;
  // every filament pin hole: the pin, the measured clearance, the fit slider
  const pinR = c.pin / 2 + c.pinClear + c.pinFit;
  return { o, c, cols, rows, Lin, Win, L, W, H, tongueT, R, rT, kr, axisOff, axisY: W / 2 + axisOff, hingeLen, segLen,
    gasket: opts.gasket === true, latch, toggle, latchOut, lidOut, koch, ribW, ribX, ribY, lw, pinR };
}

const roundedBlock = (L, W, h, r, z = 0) =>
  translate([-L / 2, -W / 2, z], fillet({ r, edges: "z" }, cube([L, W, h])));

// Convex hull of 2D points (monotone chain), for the knuckle profiles.
function hull2(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
// Clip a convex polygon of [y, z] points to the half-plane sgn * (z - z0) >= 0.
function clipZ(pts, z0, sgn) {
  const out = [];
  const inside = (p) => sgn * (p[1] - z0) >= -1e-9;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (z0 - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), z0]);
    }
  }
  return out;
}

// A knuckle: the ring about the axis, plus an arm back to its own wall. The
// arm stays on its owner's side of the parting line (0.2 clear of it): the
// lid's back-bottom edge swings on a circle just outside the ring, and an arm
// that crossed the line (the first cut's plain convex hull did, by 0.6 mm)
// both collides with the other part when closed and stops the lid opening.
// Two flat-sided extrusions along X per segment.
function knuckles(d, owner) {
  const { c, kr, axisY, H, W, axisOff } = d;
  const ring = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * 2 * Math.PI;
    return [axisY + kr * Math.cos(a), H + kr * Math.sin(a)];
  });
  const sgn = owner === "lid" ? 1 : -1;
  const zArm = H + sgn * 0.2;
  const wallPts = [[W / 2 - 1, zArm], [W / 2 - 1, H + sgn * (kr + axisOff)]];
  const arm = clipZ(hull2([...ring, ...wallPts]), zArm, sgn);
  // profiles in (y, z); extruded along +Z then turned so +Z runs along +X
  const flip = (pts) => pts.map(([yy, zz]) => [-zz, yy]);
  const ringProf = flip(ring), armProf = flip(arm);
  const out = [];
  for (let k = owner === "lid" ? 1 : 0; k < c.knuckles; k += 2) {
    const x0 = -d.hingeLen / 2 + k * (d.segLen + c.hingeGap);
    const seg = (prof) => translate([x0, 0, 0], rotate([0, 90, 0], linearExtrude({ h: d.segLen }, polygon(prof))));
    out.push(seg(ringProf), seg(armProf));
  }
  return out;
}
function pinHole(d) {
  const r = d.pinR;
  const ring = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI;
    return [-(d.H + r * Math.sin(a)), d.axisY + r * Math.cos(a)];
  });
  return translate([-d.hingeLen / 2 - 1, 0, 0], rotate([0, 90, 0], linearExtrude({ h: d.hingeLen + 2 }, polygon(ring))));
}

// Profile points (y, z) extruded along +X from x0 for w; and (x, z) along +Y.
const alongX = (pts, x0, w) => translate([x0, 0, 0], rotate([0, 90, 0], linearExtrude({ h: w }, polygon(pts.map(([yy, zz]) => [-zz, yy])))));
const alongY = (pts, y0, w) => translate([0, y0, 0], rotate([-90, 0, 0], linearExtrude({ h: w }, polygon(pts.map(([xx, zz]) => [xx, -zz])))));

// The Koch Box's eight ribs for the body (chamfered at the base) or the lid
// (chamfered at the top, its bed side). Each is one flat-sided extrusion,
// let 0.5 into the wall.
function kochRibs(d, owner) {
  const { c, L, W, H } = d, rd = c.ribDepth, ch = c.ribChamfer, rw = d.ribW;
  const z0 = owner === "lid" ? H : 0, z1 = owner === "lid" ? H + c.lidHeight : H;
  // (u, z): u outward from the wall face
  const prof = owner === "lid"
    ? [[-0.5, z0], [rd, z0], [rd, z1 - ch], [rd - ch, z1], [-0.5, z1]]
    : [[-0.5, z0], [rd - ch, z0], [rd, z0 + ch], [rd, z1], [-0.5, z1]];
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    out.push(alongX(prof.map(([u, z]) => [sy * (W / 2 + u), z]), sx * d.ribX - rw / 2, rw));
    out.push(alongY(prof.map(([u, z]) => [sx * (L / 2 + u), z]), sy * d.ribY - rw / 2, rw));
  }
  return out;
}

// The swing latch's pin: along X through the lid's lugs and the latch boss.
function swingPin(d, r, x0, len) {
  const { c, W, H } = d;
  return translate([x0, -W / 2 - c.swingPinOut, H + c.swingPinUp], rotate([0, 90, 0], cylinder({ r, h: len })));
}

// The Koch Box's back ribs stand right at the ends of the hinge, and the
// filament goes in along the axis from outside them: a rib in the way made
// the pin a blind push. Each back rib is notched round the axis to the
// knuckle's radius plus half a millimetre (body and lid alike), so the
// filament has a clear run into the first knuckle. The notch stops 0.1
// short of the knuckle itself.
function hingeNotches(d) {
  const { c, kr, axisY, H } = d, rw = d.ribW;
  const r = kr + 0.5, len = rw + 2 * (c.hingeGap - 0.1);
  return [-1, 1].map((sx) => translate([sx * d.ribX - len / 2, axisY, H], rotate([0, 90, 0], cylinder({ r, h: len }))));
}

// The folding toggle latch, closed, in case coordinates, as it prints: the
// lever hanging from its pin, the living hinge below it, the bail straight
// below that (you fold it round to hook the catch). Over-centre: the pin P
// sits on the lever's centre line, the catch bar B stands further out, so
// the lever locked against the pad is inboard of the line P-B and the
// bail is a hair short of reaching B along it; passing dead centre
// stretches the bail by toggleStretch, then it snaps home pressing on the
// pad. The bail's length comes out of that geometry, not a guess.
function toggleLatch(d) {
  const { c, W, H, lw } = d;
  const fy = -W / 2, rd = c.ribDepth;
  const yP = fy - rd - c.pipGap - c.leverThick / 2, zP = H + c.toggleUp;
  const yB = fy - rd - c.catchOut, zB = H - c.catchDrop - c.catchBar - c.bailBar;   // the bail bar's centre, hooked
  const zQ = zP - c.leverLen, zHinge = zQ - c.livingLen / 2;
  const D = Math.hypot(yB - yP, zB - zP);
  const Lb = Math.max(4, D + c.toggleStretch - (zP - zHinge));      // living hinge to bail bar centre
  const zBar = zHinge - Lb;
  const along = (y, z, r, x0, len) => translate([x0, y, z], rotate([0, 90, 0], cylinder({ r, h: len })));
  const box = (x0, x1, y0, y1, z0, z1) => translate([x0, y0, z0], cube([x1 - x0, y1 - y0, z1 - z0]));
  const hole = c.pipPin + c.pipClear;
  const lever = difference(
    union(
      along(yP, zP, hole + 1.4, -lw / 2, lw),                                          // the boss
      box(-lw / 2, lw / 2, yP - c.leverThick / 2, yP + c.leverThick / 2, zQ, zP),       // the plate
    ),
    along(yP, zP, hole, -lw / 2 - 1, lw + 2));
  const strip = box(-lw / 2, lw / 2, yP - c.living / 2, yP + c.living / 2, zQ - c.livingLen, zQ + 0.2);
  const arm = (x0) => box(x0, x0 + c.bailArm, yP - c.bailThick / 2, yP + c.bailThick / 2, zBar, zQ - c.livingLen + 0.2);
  const bar = along(yP, zBar, c.bailBar, -lw / 2, lw);
  return union(lever, strip, arm(-lw / 2), arm(lw / 2 - c.bailArm), bar);
}

// The swing latch itself, closed, in case coordinates: a plate hanging from a
// boss round the pin, ending in a lip that sits in the body's pocket. One
// extrusion along X, lw wide, with the pin hole through the boss.
export function casefinitySwingLatch(opts = {}) {
  const d = caseDims({ ...opts, style: "koch" });
  const { c, W, H, lw } = d;
  // printed in place it swings pipGap off the pad (0.2 would fuse to the
  // lid), and its lip's overhanging face gets a bigger chamfer to print
  const pip = d.latch !== "swing";
  const fy = -W / 2, yi = fy - c.ribDepth - (pip ? c.pipGap : c.swingGap), yo = yi - c.swingThick, yb = yi - c.swingBoss;
  const zp = H + c.swingPinUp, zl0 = H - c.padRoof - c.pocketH + 0.1, zl1 = H - c.padRoof - 0.1;
  const li = yi + c.swingLipIn, e = pip ? 1.1 : 0.6;
  const beadR = (pip ? c.pipGap : c.swingGap) + c.beadBite, zBead = H - c.beadDrop;
  const prof = [
    [li - e, zl0], [li, zl0 + e], [li, zl1 - e], [li - e, zl1],   // the lip, chamfered to lead in
    [yi, zl1], [yi, zp + 3],                                     // the inner face, straight to the boss top
    [yb + 1.5, zp + 3], [yb, zp + 1.5], [yb, zp - 3],              // the boss, its outer top corner eased
    [yo, zp - 3], [yo, zl0],                                     // the plate's outer face
  ];
  const latch = difference(alongX(prof, -lw / 2, lw),
    swingPin(d, pip ? c.pipPin + c.pipClear : c.pin / 2 + 0.2 + c.pinFit, -lw / 2 - 1, lw + 2),
    // the detent groove in the inner face, where the pad's bead sits at closed
    translate([-lw / 2 - 1, yi, zBead], rotate([0, 90, 0], cylinder({ r: beadR + 0.1, h: lw + 2 }))));
  if (!opts.print) return latch;
  // printed on its side: the flat end face down, so the pin hole stands
  // vertical and the profile prints true
  return translate([0, 0, lw / 2], rotate([0, -90, 0], latch));
}

// The case body, standing on z = 0, cavity N*P exactly, Casefinity ribs and
// grooves on its walls, the hinge's end knuckles on the back, the latch catch
// on the front.
export function casefinityCase(opts = {}) {
  const d = caseDims(opts);
  const { o, c, Lin, Win, L, W, H, tongueT } = d;
  const top = H + c.tongue;
  const fy = -W / 2;
  const extraCuts = [];
  let latchCatch;
  let bead = null;
  if (d.koch) {
    // the latch pad: flush with the ribs, with the lip's pocket let into its
    // outer face under a roof padRoof thick (a short bridge when printed)
    const padW = d.lw + 8, rd = c.ribDepth;
    const padParts = [translate([-padW / 2, fy - rd, H - c.padDrop], cube([padW, rd + 0.5, c.padDrop]))];
    if (d.toggle) {
      // the catch: a round bar on a block out from the pad, long enough for
      // the bail's arms to straddle, that the bail hooks under
      const bl = d.lw + 6, zc = H - c.catchDrop;
      padParts.push(
        translate([-bl / 2, fy - rd - c.catchOut, zc - c.catchBar], cube([bl, c.catchOut + 0.5, 2 * c.catchBar])),
        translate([-bl / 2, fy - rd - c.catchOut, zc], rotate([0, 90, 0], cylinder({ r: c.catchBar, h: bl }))));
    } else {
      extraCuts.push(translate([-(d.lw + 0.6) / 2, fy - rd - 1, H - c.padRoof - c.pocketH], cube([d.lw + 0.6, c.pocketDepth + 1, c.pocketH])));
      // the snap bar across the pad face, half buried, standing beadBite into
      // the plate's path; the plate's groove drops over it at closed
      const beadR = (d.latch === "swing" ? c.swingGap : c.pipGap) + c.beadBite;
      bead = translate([-(d.lw + 0.6) / 2, fy - rd, H - c.beadDrop], rotate([0, 90, 0], cylinder({ r: beadR, h: d.lw + 0.6 })));
    }
    latchCatch = union(...padParts, ...kochRibs(d, "body"));
    extraCuts.push(...hingeNotches(d));
  } else if (d.latch === "round") {
    // a round bead along the front, half buried in the wall, sitting just
    // above where the lid blade's lip comes to rest (0.15 play)
    const bw = c.latchWidth - 4, zc = H - c.latchDrop + 2 * c.roundLip + c.roundBead + 0.15;
    latchCatch = translate([-bw / 2, fy, zc], rotate([0, 90, 0], cylinder({ r: c.roundBead, h: bw })));
  } else {
    // wedge: flat underside the blade's bar hooks under, a long ramp on top it
    // rides over (2.5x the catch depth, so the blade bends gently rather than
    // snagging). Narrower than the blade's window by 1 a side
    const cw = c.latchWidth - 2 * c.latchLeg - 2, z0 = H - c.latchDrop + c.latchBar + 0.2;
    const out = fy - c.latchCatch;
    const catchProf = [[z0, fy + 0.4], [z0, out], [z0 + 0.6, out], [z0 + 0.6 + c.latchCatch * 2.5, fy + 0.4]]
      .map(([zz, yy]) => [-zz, yy]);
    latchCatch = translate([-cw / 2, 0, 0], rotate([0, 90, 0], linearExtrude({ h: cw }, polygon(catchProf))));
  }
  // The cavity, exactly N*P, as one outline: liner ribs on -Y and +X are
  // notched IN (the wall keeps them), line-to-line grooves on +Y and -X stand
  // OUT (the cut takes them). One cut makes every registration feature.
  const rib = (at) => ({ at, width: o.rib, depth: o.bump, out: -1 });
  const groove = (at) => ({ at, width: o.rib, depth: o.bump, out: 1 });
  const xs = centres(d.cols, o.pitch), ys = centres(d.rows, o.pitch);
  const cavity = featuredOutline(Lin, Win, { front: rib(xs), right: rib(ys), back: groove(xs), left: groove(ys) }, o.draft);
  const Lt = Lin + 2 * tongueT, Wt = Win + 2 * tongueT;
  const adds = [
    // the body, its base edge chamfered against elephant foot
    chamfer({ d: c.footChamfer, edges: "bottom" }, roundedBlock(L, W, H, d.R)),
    // the seal tongue: the inner part of the wall, standing above the rim,
    // rounded with the corners, its top edge chamfered as a lead-in
    chamfer({ d: c.leadIn, edges: "top" }, roundedBlock(Lt, Wt, c.tongue + 0.4, d.rT, H - 0.4)),
    ...knuckles(d, "body"),
    latchCatch,
  ];
  if (d.gasket) {
    // the crest: a ridge along the tongue's centre line, clear of the lead-in
    const inset = (tongueT - c.crest) / 2;
    adds.push(difference(
      roundedBlock(Lt - 2 * inset, Wt - 2 * inset, c.crestHeight + 0.2, Math.max(0.3, d.rT - inset), top - 0.2),
      roundedBlock(Lt - 2 * (inset + c.crest), Wt - 2 * (inset + c.crest), c.crestHeight + 1, Math.max(0.3, d.rT - inset - c.crest), top - 0.6),
    ));
  }
  const body = difference(
    union(...adds),
    prism(cavity, c.floor, top - c.floor + 1),
    pinHole(d),
    ...extraCuts,
  );
  return bead ? union(body, bead) : body;
}

// The lid, modelled CLOSED in case coordinates (z from the body height up).
// casefinityCaseLid({ ..., print: true }) turns it over onto the bed.
export function casefinityCaseLid(opts = {}) {
  const d = caseDims(opts);
  const { c, Lin, Win, L, W, H, tongueT } = d;
  const gap = d.latch === "round" ? c.roundGap : c.latchGap;
  const y0 = -W / 2 - gap - c.latchThick, zb = H - c.latchDrop, lh = c.lidHeight;
  // the blade hangs from a block let into the lid's front wall
  const root = translate([-c.latchWidth / 2, y0, H + 1], cube([c.latchWidth, c.latchThick + gap + 1.4, lh * 0.6 - 1]));
  const extraCuts = [];
  let tab;
  if (d.koch) {
    // two lugs either side of the latch, each a gusset from the front wall
    // to a round boss about the pin. On a filament pin the hole runs
    // through both; printed in place the pin is solid between them and the
    // latch hangs on it, part of the lid
    const { lw } = d, pip = d.latch !== "swing";
    const yp = d.toggle ? -W / 2 - c.ribDepth - c.pipGap - c.leverThick / 2 : -W / 2 - c.swingPinOut;
    const zp = d.toggle ? H + c.toggleUp : H + c.swingPinUp;
    const lg = pip ? c.pipLug : 0.3;
    const ring = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * 2 * Math.PI;
      return [yp + c.lugR * Math.cos(a), zp + c.lugR * Math.sin(a)];
    });
    const prof = hull2([...ring, [-W / 2 + 1, zp - c.lugHalf], [-W / 2 + 1, zp + c.lugHalf]]);
    const pinAt = (r, x0, len) => translate([x0, yp, zp], rotate([0, 90, 0], cylinder({ r, h: len })));
    const parts = [
      alongX(prof, -(lw / 2 + lg + c.lugWidth), c.lugWidth),
      alongX(prof, lw / 2 + lg, c.lugWidth),
      ...kochRibs(d, "lid"),
    ];
    if (pip) {
      parts.push(pinAt(c.pipPin, -(lw / 2 + lg + c.lugWidth) + 0.5, lw + 2 * lg + 2 * c.lugWidth - 1));
      // in case coordinates, never the separate part's on-its-side print pose:
      // the lid as a whole is turned over for printing further down
      parts.push(d.toggle ? toggleLatch(d) : casefinitySwingLatch({ ...opts, print: false }));
    } else {
      extraCuts.push(pinAt(d.pinR, -(lw / 2 + lg + c.lugWidth + 1), lw + 2 * (lg + c.lugWidth) + 2));
    }
    tab = union(...parts);
    extraCuts.push(...hingeNotches(d));
  } else if (d.latch === "round") {
    // a solid blade with a round lip along its inner bottom edge: it rolls
    // over the body's bead and sits under it. Round both ways, so it prints
    // without supports and opens as smoothly as it closes
    const blade = translate([-c.latchWidth / 2, y0, zb], cube([c.latchWidth, c.latchThick, c.latchDrop + lh * 0.6]));
    const lip = translate([-c.latchWidth / 2 + 1, y0 + c.latchThick - (c.roundLip - c.roundLipOut), zb + c.roundLip],
      rotate([0, 90, 0], cylinder({ r: c.roundLip, h: c.latchWidth - 2 })));
    tab = union(blade, lip, root);
  } else {
    tab = difference(
      union(
        // the blade, its free bottom edge chamfered so it rides the catch's ramp
        translate([-c.latchWidth / 2, y0, zb],
          chamfer({ d: Math.min(c.leadIn, c.latchThick * 0.45), edges: "bottom" }, cube([c.latchWidth, c.latchThick, c.latchDrop + lh * 0.6]))),
        root,
      ),
      // the window the body's wedge pokes through; what is left under it is the bar that hooks
      translate([-(c.latchWidth - 2 * c.latchLeg) / 2, y0 - 1, zb + c.latchBar], cube([c.latchWidth - 2 * c.latchLeg, c.latchThick + 2, c.latchDrop - c.latchBar - 1])),
    );
  }
  // the groove for the tongue: rounded with it, with a flared mouth (a cutter
  // that is leadIn wider at the parting line and tapers to the groove above
  // it) so the skirt steers itself onto the tongue
  const Lg = Lin + 2 * (tongueT + c.lidFit), Wg = Win + 2 * (tongueT + c.lidFit), rg = d.rT + c.lidFit;
  const cuts = [
    translate([-Lin / 2, -Win / 2, H - 1], cube([Lin, Win, lh - c.floor + 1])),
    roundedBlock(Lg, Wg, c.tongue + c.lidFit + 1, rg, H - 1),
    chamfer({ d: c.leadIn, edges: "top" }, roundedBlock(Lg + 2 * c.leadIn, Wg + 2 * c.leadIn, 1 + c.leadIn + 0.1, rg + c.leadIn, H - 1)),
    pinHole(d),
    ...extraCuts,
  ];
  if (d.gasket) {
    // the trench the body's crest drops into, in the groove's ceiling
    const tw = c.crest + 2 * c.trenchClear, inset = (tongueT - tw) / 2, zc = H + c.tongue + c.lidFit;
    const Lt = Lin + 2 * tongueT, Wt = Win + 2 * tongueT;
    cuts.push(difference(
      roundedBlock(Lt - 2 * inset, Wt - 2 * inset, c.trenchDepth + 0.5, Math.max(0.3, d.rT - inset), zc - 0.5),
      roundedBlock(Lt - 2 * (inset + tw), Wt - 2 * (inset + tw), c.trenchDepth + 1.5, Math.max(0.3, d.rT - inset - tw), zc - 1),
    ));
  }
  const lid = difference(
    union(
      // the lid, its top edge (the bed side once printed) chamfered against elephant foot
      chamfer({ d: c.footChamfer, edges: "top" }, roundedBlock(L, W, lh, d.R, H)),
      ...knuckles(d, "lid"), tab),
    ...cuts,
  );
  if (!opts.print) return lid;
  return translate([0, 0, H + lh], rotate([180, 0, 0], lid));
}

// ------------------------------------------------------------------- kit

export const CASEKIT_COLORS = Object.freeze({
  case: "#8796ab", lid: "#b4c0d0", box: "#3fae7a", lidbox: "#4b86e6", binlid: "#8fb6f5", frame: "#f0a23b",
  latch: "#e8703a",
});

// Everything to print for a case and its layout, laid out flat with a gap
// between parts, each in its grid colour. `layout` is a list of regions on the
// module grid, from the front-left module:
//   { at: [col, row], size: [cols, rows], kind: "box" | "lidbox" | "frame", split }
// box     a bin              split: one 1x1 bin per module instead of one big bin
// lidbox  a bin with a lid   (same)
// frame   separators         split: a wall on every module line, otherwise just the rim
// Regions that fall outside the grid (the case got smaller) are skipped.
export function caseKit(opts = {}) {
  const d = caseDims(opts);
  const o = d.o;
  const fit = casefinityFit(d.L, d.W, d.H + d.c.lidHeight, { pitch: o.pitch, wall: d.c.wall, floor: d.c.floor, lidHeight: d.c.lidHeight });
  const full = fit.binHeight;
  const tab = opts.tab !== false && fit.headroom >= CASEFINITY.pullTab;
  const gap = num(opts.gap, "gap", 6);
  // [shape, minX, maxX, minY, maxY]: each part's real footprint about its
  // own origin, so the packing below never lets two parts touch
  const parts = [];
  const binOpts = { pitch: o.pitch, clear: o.clear, draft: o.draft, wall: opts.binWall };
  const addBin = (x, y, kind, divide) => {
    const lidded = kind === "lidbox";
    const h = lidded ? full - CASEFINITY.lidPlate : full;
    const bw = x * o.pitch - 2 * o.clear, bd = y * o.pitch - 2 * o.clear;
    parts.push([colorize(CASEKIT_COLORS[kind], casefinityBin({
      ...binOpts, x, y, h, bottom: kind !== "frame", divide, lidded, tab: tab && !lidded && kind !== "frame",
    })), -bw / 2 - CASEFINITY.bump, bw / 2, -bd / 2, bd / 2 + CASEFINITY.bump]);
    if (lidded) parts.push([colorize(CASEKIT_COLORS.binlid, casefinityBinLid({ ...binOpts, x, y })), -bw / 2, bw / 2, -bd / 2, bd / 2]);
  };
  for (const r of opts.layout || []) {
    const [c0, r0] = r.at || [0, 0];
    const [w, h] = r.size || [1, 1];
    if (c0 < 0 || r0 < 0 || c0 + w > d.cols || r0 + h > d.rows || w < 1 || h < 1) continue;
    const kind = ["box", "lidbox", "frame"].includes(r.kind) ? r.kind : "box";
    if (kind !== "frame" && r.split) {
      for (let i = 0; i < w * h; i++) addBin(1, 1, kind, false);
    } else addBin(w, h, kind, kind === "frame" ? !!r.split : false);
  }
  if (opts.includeCase !== false) {
    const back = d.axisY + d.kr, front = d.W / 2 + d.latchOut;
    const lidFront = d.W / 2 + d.lidOut, side = d.L / 2 + (d.koch ? d.c.ribDepth : 0);
    if (d.koch && d.latch === "swing") {
      // the swing latch on its side: its profile's z runs along -X once turned
      const zTop = d.H + d.c.swingPinUp + 3, zBot = d.H - d.c.padRoof - d.c.pocketH;
      parts.unshift([colorize(CASEKIT_COLORS.latch, casefinitySwingLatch({ ...opts, print: true })),
        -zTop, -zBot, -(d.W / 2 + d.c.ribDepth + d.c.swingGap + d.c.swingBoss), -(d.W / 2 + d.c.ribDepth + d.c.swingGap - d.c.swingLipIn)]);
    }
    parts.unshift([colorize(CASEKIT_COLORS.lid, casefinityCaseLid({ ...opts, print: true })), -side, side, -back, lidFront]);
    parts.unshift([colorize(CASEKIT_COLORS.case, casefinityCase(opts)), -side, side, -front, back]);
  }
  if (!parts.length) throw new Error("casefinity: nothing to print: add a box or a frame to the grid, or include the case");
  return group(...shelfPack(parts, gap));
}

// Shelf-pack [shape, minX, maxX, minY, maxY] parts in rows, front to back,
// `gap` apart; the 3MF export repacks onto the printer's own plates, so this
// only has to read well on screen. Shared with the KUGGIS kit.
export function shelfPack(parts, gap = 6) {
  const rowW = Math.max(240, ...parts.map((p) => p[2] - p[1]));
  const placed = [];
  let x = 0, y = 0, rowD = 0;
  for (const [shape, x0, x1, y0, y1] of parts) {
    const w = x1 - x0, dd = y1 - y0;
    if (x > 0 && x + w > rowW) { x = 0; y += rowD + gap; rowD = 0; }
    placed.push(translate([x - x0, y - y0, 0], shape));
    x += w + gap; rowD = Math.max(rowD, dd);
  }
  return placed;
}
