// A bird feeder tray: a round dish with a thick rim and three cord holes to
// hang it by. As a bottle feeder, a twelve-sided socket in the middle takes
// an upside-down plastic bottle of seed, which runs out through pointed
// ports at its foot as the birds eat. Without the socket it is a platform
// feeder; with a sloping floor and no drains, a bird bath.

export default {
  id: "bird-feeder",
  category: "garden",
  title: "Bird feeder",
  summary: "a hanging seed tray with a socket for an upside-down bottle of seed; also a platform feeder or a bird bath.",
  print: "upright as shown, no supports. Hang it by the three rim holes; push a filled bottle into the socket.",
  names: ["bird feeder", "bottle bird feeder", "hanging bird feeder", "bird seed feeder", "seed feeder",
    "bird feeding tray", "bird seed tray", "diy bird feeder"],
  nouns: ["feeder", "tray", "dish", "bath"],
  keywords: ["bird", "birds", "seed", "garden", "bottle", "hanging", "feed"],
  fits: ["bottle-neck"],
  fromSpec: (s) => ({ neckD: s.dims.d }),
  primary: "trayD",
  tips: ["200 mm across", "platform feeder", "bird bath"],
  examples: ["I want a bird feeder", "make me a bottle bird feeder for a 2 liter bottle",
    "bird seed tray 200mm across", "a bird bath I can hang"],
  params: {
    trayD: { default: 160, min: 90, max: 240, unit: "mm", label: "tray diameter", say: ["across", "diameter", "wide", "tray"], more: ["bigger", "wider"], less: ["smaller"] },
    rimH: { default: 18, min: 8, max: 50, unit: "mm", label: "rim height", say: ["rim", "deep", "tall"], more: ["deeper"], less: ["shallower"] },
    neckD: { default: 27.4, min: 15, max: 45, unit: "mm", label: "bottle thread diameter", say: ["neck", "thread"] },
    sockH: { default: 30, min: 15, max: 60, unit: "mm", label: "socket height", say: ["socket"] },
    ports: { default: 4, min: 2, max: 8, unit: "count", label: "seed ports", say: ["port", "opening"] },
    style: { default: "bottle", unit: "choice", choices: ["bottle", "tray", "bath"], label: "bottle feeder, platform tray or bird bath",
      words: { bath: ["bird bath", "birdbath", "water dish", "bath"], tray: ["platform", "tray feeder", "open tray"], bottle: ["bottle"] } },
  },
  things: [
    { names: ["soda bottle bird feeder", "2 liter bird feeder", "pop bottle bird feeder"], title: "Soda bottle bird feeder", spec: "soda-bottle-neck" },
    { names: ["platform bird feeder", "platform feeder", "tray bird feeder", "open bird feeder"], title: "Platform bird feeder", params: { style: "tray", trayD: 200, rimH: 15 } },
    { names: ["bird bath", "birdbath", "hanging bird bath", "bird water dish"], title: "Bird bath", params: { style: "bath", trayD: 220, rimH: 40 } },
    { names: ["butterfly feeder", "butterfly puddler", "bee waterer", "bee watering dish"], title: "Butterfly puddler", params: { style: "bath", trayD: 150, rimH: 15 } },
    { names: ["window bird feeder tray", "small bird feeder"], title: "Small bird feeder", params: { trayD: 120, rimH: 14, ports: 3 } },
    { names: ["squirrel feeder tray", "ground feeder tray"], title: "Ground feeder tray", params: { style: "tray", trayD: 240, rimH: 20 } },
  ],
  body: `
const R = trayD / 2, rimT = 6;                            // a thick rim takes the cord holes
const fl = Math.min(3, rimH / 3);
const bath = style === "bath";
// the dish, from plain cylinders (cheaper to cut than a lathed profile):
// a bath's floor is a cone sloping down to the middle, a tray's is flat
const scoop = bath
  ? translate([0, 0, fl], cylinder({ r1: R * 0.25, r2: R - rimT, h: rimH - fl + 0.01 }))
  : translate([0, 0, fl], cylinder({ r: R - rimT, h: rimH }));
const above = translate([0, 0, rimH - 0.01], cylinder({ r: R - rimT, h: 2 }));
// square cord holes and drain slots: boxes cut far faster than round holes in a round dish
const cord = [0, 1, 2].map((i) => rotate([0, 0, 120 * i + 30], translate([R - rimT / 2 - 1.75, -1.75, -1], cube([3.5, 3.5, rimH + 2]))));
const drains = style === "tray" ? [0, 1, 2, 3].map((i) => rotate([0, 0, 90 * i + 45], translate([R * 0.3, -0.8, -1], cube([R * 0.3, 1.6, fl + 2])))) : [];
const dish = cylinder({ r: R, h: rimH });
if (style !== "bottle") return difference(dish, scoop, ...(bath ? [above] : []), ...cord, ...drains);

// the bottle socket: twelve flat sides that bite the thread, on the tray floor
const rb = neckD / 2 + 0.2, rc = rb / Math.cos(Math.PI / 12);
const outerR = rc + 2.4;
const sock = translate([0, 0, fl - 0.01], rotate([0, 0, 15], cylinder({ r: outerR / Math.cos(Math.PI / 12), h: sockH, $fn: 12 })));
const bore = translate([0, 0, fl], rotate([0, 0, 15], cylinder({ r: rc, h: sockH + 1, $fn: 12 })));
// pointed seed ports through the flats at the socket's foot (no flat top to bridge)
const pw = Math.min(14, 2 * rb * Math.tan(Math.PI / 12) * 1.8), ph = pw * 1.1;
// the triangle stands in the y-z plane and runs out along x through the wall
const port = (i) => rotate([0, 0, 360 * i / ports], translate([rb - 1, -pw / 2, fl - 0.5], rotate([90, 90, 0], linearExtrude({ h: outerR - rb + 4 }, polygon([[0, 0], [pw, 0], [pw / 2, ph]])))));
return difference(union(difference(dish, scoop), sock), bore, ...cord, ...Array.from({ length: ports }, (_, i) => port(i)));
`,
};
