// A drain strainer / hair catcher: a cup that drops into the drain, with a
// floor full of small holes, slits round its side, a cone-shaped flange that
// rests on the drain's rim and a post in the middle to lift it out by. The
// flange is a cone steeper than 45 degrees rather than a flat ledge and the
// slits are pointed at the top, so it prints upright, as it sits. Made
// shallow (under 8 mm) it becomes a flat perforated cover with a short plug
// that keeps it centred in the drain, printed upside down, plug up.

export default {
  id: "drain-strainer",
  category: "bathroom",
  title: "Drain strainer",
  summary: "a hair catcher or sink strainer: a perforated cup with a cone flange and a lift post, or a flat drain cover.",
  print: "as shown, no supports: a strainer cup upright as it sits; a flat cover upside down, its plug pointing up. PETG takes hot water best.",
  names: ["drain strainer", "hair catcher", "drain hair catcher", "sink strainer", "drain catcher", "drain protector",
    "hair stopper", "drain stopper strainer", "drain guard", "hair trap"],
  nouns: ["strainer", "catcher", "cover", "basket"],
  keywords: ["drain", "hair", "sink", "shower", "tub", "bathtub", "plug"],
  fits: ["drain"],
  fromSpec: (s) => ({ cupD: Math.max(16, s.dims.d - 1.5), flangeD: Math.min(s.dims.rim, s.dims.d + 18) }),
  specNote: "the cup is 1.5 mm smaller than the opening and the flange rests about 9 mm out on the rim",
  primary: "cupD",
  ask: { unless: ["cupD"], text: "Which drain is it for (shower, tub, bathroom or kitchen sink)? Or measure across the opening: I used 38 mm, a typical tub drain." },
  tips: ["for a kitchen sink drain", "45 mm across", "shallower", "no lift post"],
  examples: ["I want a drain strainer", "make me a hair catcher for my shower drain",
    "a sink strainer 80 mm across", "drain hair catcher for the bathtub drain"],
  params: {
    cupD: { default: 38, min: 16, max: 110, unit: "mm", label: "cup diameter (drops into the drain)", say: ["across", "diameter", "opening", "drain", "wide", "cup"], more: ["bigger", "wider"], less: ["smaller", "narrower"] },
    depth: { default: 22, min: 2, max: 80, unit: "mm", label: "cup depth (under 8 = a flat cover, this being its plug)", say: ["deep", "depth", "tall"], more: ["deeper"], less: ["shallower", "flatter"] },
    flangeD: { default: 56, min: 24, max: 170, unit: "mm", label: "flange diameter (rests on the rim)", say: ["flange", "rim", "top"] },
    wall: { default: 1.8, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall", "thick"] },
    floorT: { default: 2, min: 1.2, max: 5, unit: "mm", label: "floor thickness", say: ["floor"] },
    holeD: { default: 2.5, min: 1.2, max: 6, unit: "mm", label: "floor hole size", say: ["hole", "holes"] },
    slits: { default: 12, min: 0, max: 36, unit: "count", label: "slits round the side", say: ["slit", "slot"] },
    slitW: { default: 1.8, min: 1, max: 4, unit: "mm", label: "slit width", say: ["slit"] },
    postH: { default: 10, min: 0, max: 40, unit: "mm", label: "lift post height above the rim (0 = none)", say: ["post", "lift", "handle"] },
    postD: { default: 7, min: 4, max: 14, unit: "mm", label: "lift post diameter", say: ["post"] },
  },
  things: [
    { names: ["shower drain hair catcher", "shower hair catcher", "shower drain strainer", "shower drain catcher", "shower drain protector"],
      title: "Shower drain hair catcher", spec: "bath-shower-drain", params: { depth: 22, slits: 16 } },
    { names: ["tub drain hair catcher", "bathtub hair catcher", "bathtub drain strainer", "tub strainer", "bath drain hair catcher", "bathtub drain hair catcher"],
      title: "Bathtub drain hair catcher", spec: "bath-tub-drain", params: { depth: 24 } },
    { names: ["bathtub drain cover", "tub drain cover", "bath drain cover", "flat drain cover", "drain cover"],
      title: "Bathtub drain cover", spec: "bath-tub-drain", params: { depth: 5, floorT: 2.5, holeD: 2.2 } },
    { names: ["kitchen sink strainer", "kitchen drain strainer", "sink strainer basket", "sink basket strainer", "kitchen sink basket", "kitchen sink drain strainer"],
      title: "Kitchen sink strainer", spec: "bath-kitchen-sink-drain", params: { depth: 38, wall: 2.2, floorT: 2.4, holeD: 3, slits: 24, slitW: 2, postH: 12, postD: 9 } },
    { names: ["bathroom sink strainer", "bathroom sink hair catcher", "vanity drain strainer", "sink hair catcher", "bathroom sink drain catcher"],
      title: "Bathroom sink strainer", spec: "bath-bathroom-sink-drain", params: { depth: 16, holeD: 2, slits: 10, slitW: 1.5, postH: 8, postD: 6 } },
    { names: ["floor drain cover", "basement drain cover", "floor drain strainer", "utility drain cover"],
      title: "Floor drain cover", spec: "bath-floor-drain", params: { depth: 3, floorT: 3, wall: 2.4, holeD: 4, postH: 0 } },
    { names: ["drain basket", "deep drain basket", "sink drain basket", "garbage disposal strainer", "disposal strainer"],
      title: "Deep drain basket", spec: "bath-kitchen-sink-drain", params: { depth: 60, wall: 2.2, floorT: 2.4, holeD: 3, slits: 24, slitW: 2, postH: 14, postD: 9 } },
    { names: ["laundry sink strainer", "utility sink strainer", "laundry tub strainer", "slop sink strainer"],
      title: "Laundry sink strainer", spec: "bath-kitchen-sink-drain", params: { depth: 30, wall: 2.2, holeD: 3.5, slits: 20, slitW: 2.4, postH: 12, postD: 9 } },
  ],
  body: `
const cupR = cupD / 2;
const flR = Math.max(flangeD / 2, cupR + 7);         // at least a 7 mm ledge to rest on
const fT = floorT;
const cover = depth < 8;                                // shallow: a flat cover with a short plug
// Everything is built from convex pieces, each hull()ed into a faceted solid:
// the many small holes then cut it in well under a second.
const disc = (r, z, h) => hull(translate([0, 0, z], cylinder({ r, h, $fn: 72 })));
let solid, cavity, top;
if (cover) {
  // printed upside down: the cover flat on the bed (its top face down), the plug that sits in the drain pointing up
  const c = Math.min(0.8, fT / 3);
  solid = union(
    hull(cylinder({ r1: flR - c, r2: flR, h: c, $fn: 72 }), translate([0, 0, c], cylinder({ r: flR, h: fT - c, $fn: 72 }))),
    disc(cupR, fT - 0.01, depth + 0.01),
  );
  cavity = disc(cupR - wall, fT, depth + 1);
  top = fT + depth;
} else {
  const s = Math.tan(49 * Math.PI / 180);               // the flange climbs at 49 degrees: steeper than 45
  const e = wall * Math.sqrt(1 + s * s);                // its thickness measured straight up
  const rim = depth + (flR - cupR) * s;
  const zi = depth + e - wall * s;                      // where the inside of the cup meets the flange
  solid = union(
    disc(cupR, 0, depth + 0.01),
    hull(translate([0, 0, depth], cylinder({ r1: cupR, r2: flR, h: rim - depth, $fn: 72 })),
      translate([0, 0, rim - 0.01], cylinder({ r: flR, h: e + 0.01, $fn: 72 }))),
  );
  cavity = union(
    disc(cupR - wall, fT, zi - fT + 0.01),
    hull(translate([0, 0, zi], cylinder({ r1: cupR - wall, r2: flR + 0.01, h: rim + e - zi, $fn: 72 })),
      translate([0, 0, rim + e - 0.01], cylinder({ r: flR + 1, h: 1, $fn: 72 }))),
  );
  top = rim + e;
}

const cuts = [cavity];
// floor holes in rings, as many as fit with 1.6 mm of plastic between them
const pR = postH > 0 && !cover ? postD / 2 : 0;
const pitch = Math.max(holeD + 1.6, Math.sqrt(cupR * cupR / 40));
const inner = Math.max(pR + holeD / 2 + 1.2, 0);
const outer = cupR - wall - holeD / 2 - 0.8;
for (let rr = outer; rr >= inner - 0.01; rr -= pitch) {
  const n = rr < pitch / 2 ? 1 : Math.floor(2 * Math.PI * rr / pitch);
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * (i + (Math.round(rr / pitch) % 2) * 0.5) / n;
    cuts.push(translate([rr * Math.cos(t), rr * Math.sin(t), -1], cylinder({ r: holeD / 2, h: fT + 2, $fn: 12 })));
  }
}
// slits up the side, pointed at the top so they print
const z0 = fT + 1.5, z1 = depth - 2 - slitW / 2;
const w = Math.min(slitW, 2 * Math.PI * (cupR - wall) / Math.max(1, slits) - 1.5);
if (!cover && slits > 0 && w >= 0.8 && z1 - z0 > 3) {
  const prof = polygon([[-w / 2, z0], [w / 2, z0], [w / 2, z1], [0, z1 + w / 2], [-w / 2, z1]]);
  for (let i = 0; i < slits; i++) {
    cuts.push(rotate([0, 0, i * 360 / slits], translate([0, -(cupR - wall - 1), 0], rotate([90, 0, 0], linearExtrude({ h: wall + 2 }, prof)))));
  }
}
let part = difference(solid, ...cuts);
// the lift post, with a small flared grip on top
if (pR > 0) {
  const pTop = top + postH;
  part = union(part,
    translate([0, 0, fT - 0.1], cylinder({ r: pR, h: pTop - fT - 1.9, $fn: 24 })),
    translate([0, 0, pTop - 2.01], cylinder({ r1: pR, r2: pR + 1.5, h: 1.51, $fn: 24 })),
    translate([0, 0, pTop - 0.51], cylinder({ r: pR + 1.5, h: 0.51, $fn: 24 })));
}
return part;
`,
};
