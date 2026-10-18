// A clip-on handle for a can, glass or bottle: a split ring that springs
// round it, and a D handle big enough for the whole hand. The handle is one
// side profile; its top arm climbs from the ring to the top of the grip bar
// at 50 degrees, so it prints standing up with nothing to support.

export default {
  id: "cup-handle",
  category: "access",
  title: "Can handle",
  summary: "a split ring that springs round a can, glass or bottle, with a big D handle for the whole hand.",
  print: "upright as shown, no supports. PETG springs better than PLA.",
  names: ["can handle", "soda can handle", "can holder with handle", "cup handle", "clip on cup handle", "drink handle",
    "can grip handle", "cup handle for arthritis", "beverage handle", "clip on handle for cups"],
  nouns: ["handle"],
  keywords: ["can", "cup", "glass", "bottle", "drink", "mug", "arthritis", "grip"],
  fits: ["round", "cup"],
  primary: "itemD",
  fromSpec: (s) => ({ itemD: s.dims.d }),
  ask: { unless: ["itemD"], text: "What is it for? Name it (“for a slim can”, “for a water bottle”) or give the diameter; I sized it for a standard 12 oz can." },
  tips: ["for a slim can", "for a water bottle", "taller"],
  examples: ["I want a can handle", "a handle for my water bottle",
    "clip on cup handle for a 75mm glass", "soda can handle"],
  params: {
    itemD: { default: 66.3, min: 25, max: 110, unit: "mm", label: "diameter of the can or cup", say: ["diameter", "across", "can", "cup", "glass"] },
    ringH: { default: 60, min: 25, max: 120, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "ring wall", say: ["wall"], more: ["stronger", "stiffer"] },
    gap: { default: 28, min: 15, max: 45, unit: "mm", label: "finger room inside the handle", say: ["finger", "room", "gap"], more: ["roomier"] },
    handleT: { default: 14, min: 8, max: 25, unit: "mm", label: "handle thickness", say: ["thick", "thickness"], more: ["thicker", "chunkier"] },
    split: { default: 8, min: 0, max: 30, unit: "mm", label: "split in the ring (0 = closed ring that slides on)", say: ["split", "opening"] },
  },
  things: [
    { names: ["slim can handle", "energy drink can handle", "seltzer can handle"], title: "Slim can handle", spec: "cup-slim-can" },
    { names: ["water bottle handle", "bottle handle", "bottle grip handle"], title: "Bottle handle", spec: "water-bottle", params: { ringH: 70 } },
    { names: ["glass handle", "drinking glass handle", "tumbler handle"], title: "Glass handle", spec: "cup-tumbler" },
    { names: ["mug handle adapter", "big mug handle", "coffee mug handle"], title: "Mug handle", spec: "cup-coffee-mug", params: { ringH: 70, gap: 32 } },
  ],
  body: `
// the ring stands on the bed; x runs out through the handle
const tight = split > 0 ? -0.5 : 0.3;            // a split ring grips; a closed one slides on
const ri = itemD / 2 + tight;
const R = ri + wall;
const H = ringH;
const rise = Math.tan(50 * Math.PI / 180);
const armT = Math.max(4, handleT * 0.35), armV = armT / Math.cos(50 * Math.PI / 180);
const xi = R - wall / 2;                         // the handle starts inside the ring wall
const room = Math.max(10, Math.min(gap, (H - armV - armT - 8) / rise - (R - xi)));
const xb = R + room, barT = Math.max(6, handleT * 0.6);
const zr = H - armV - (xb - xi) * rise;          // where the top arm meets the ring
const side = [[xi, 0], [xb + barT, 0], [xb + barT, H], [xi, zr + armV], [xi, zr], [xb, H - armV], [xb, armT], [xi, armT]];
const grip = translate([0, handleT / 2, 0], rotate([90, 0, 0], linearExtrude({ h: handleT }, polygon(side))));
const ring = difference(hull(cylinder({ r: R, h: H, $fn: 72 })), translate([0, 0, -1], cylinder({ r: ri, h: H + 2, $fn: 72 })));
const all = union(ring, grip);
const cut = split > 0 ? difference(all, translate([-R - 1, -split / 2, -1], cube([wall + 2, split, H + 2]))) : all;
return translate([-(xb + barT - R) / 2, 0, 0], cut);
`,
};
