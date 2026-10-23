// A flag that snaps onto a cable so you can tell them apart behind the
// desk: a split ring that springs open over the cable and closes round it,
// and a flat tag to write on, colour-code or label. Flat on the bed with the
// ring standing up from it, so nothing overhangs.

export default {
  id: "cable-tag",
  category: "electronics",
  title: "Cable tag",
  summary: "a snap-on flag for a cable, to write on or colour-code so you can tell cables apart.",
  print: "flat as shown, no supports. Print a few in different colours.",
  names: ["cable label", "cable tag", "cord label", "cord tag", "wire label", "wire tag", "cable marker",
    "cable id tag", "cable identifier", "cable flag", "cord identifier", "plug label"],
  nouns: ["tag", "label", "marker", "flag"],
  keywords: ["cable", "cord", "wire", "plug", "identify", "colour", "color"],
  fits: ["cable"],
  fromSpec: (s) => ({ cableD: s.dims.d }),
  primary: "cableD",
  tips: ["for a 6 mm cable", "bigger tag", "taller ring"],
  examples: ["make me a cable label", "cable tag for ethernet cables",
    "a cord label for a 5mm cord", "wire tag 30mm long"],
  params: {
    cableD: { default: 5, min: 2, max: 14, unit: "mm", label: "cable diameter", say: ["cable", "cord", "wire", "diameter"] },
    tagL: { default: 25, min: 10, max: 60, unit: "mm", label: "tag length", say: ["long", "length"], more: ["longer", "bigger"], less: ["shorter", "smaller"] },
    tagH: { default: 12, min: 6, max: 30, unit: "mm", label: "tag height", say: ["tall", "high", "height", "wide"] },
    plateT: { default: 1.6, min: 1.2, max: 4, unit: "mm", label: "tag thickness", say: ["thick", "thickness"] },
    ringH: { default: 6, min: 2, max: 15, unit: "mm", label: "ring height along the cable", say: ["ring", "grip"] },
  },
  things: [
    { names: ["usb cable label", "charger cable tag", "usb cable tag"], title: "USB cable tag", spec: "usb-c" },
    { names: ["ethernet cable tag", "network cable label", "ethernet cable label"], title: "Ethernet cable tag", spec: "ethernet" },
    { names: ["power cord label", "power cord tag", "power cable label"], title: "Power cord tag", spec: "extension-lead" },
    { names: ["hdmi cable label", "hdmi cable tag"], title: "HDMI cable tag", spec: "hdmi" },
    { names: ["laptop charger label", "laptop charger tag"], title: "Laptop charger tag", spec: "laptop-power" },
  ],
  body: `
const ri = cableD / 2 + 0.2, ro = ri + 1.4;
const ring = difference(
  cylinder({ r: ro, h: ringH, $fn: 40 }),
  translate([0, 0, -1], cylinder({ r: ri, h: ringH + 2, $fn: 40 })),
  // the mouth, narrower than the cable, on the side away from the tag
  translate([-ro - 1, -cableD * 0.35, -1], cube([ro + 1, cableD * 0.7, ringH + 2])),
);
const tag = translate([ro - 0.5, -tagH / 2, 0], cube([tagL + 0.5, tagH, plateT]));
return translate([-tagL / 2, 0, 0], union(ring, difference(tag, translate([0, 0, -1], cylinder({ r: ri, h: plateT + 2, $fn: 40 })))));
`,
};
