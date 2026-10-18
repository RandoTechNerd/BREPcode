// A U bracket that holds a box-shaped gadget against a wall: a router, a
// modem, a power strip, a network switch, a USB hub, a hard drive. The device
// drops into the U and leans on the back plate; use two, one near each end.
// One side profile printed on its side (as the cradle hook is), so nothing
// overhangs; the screw holes run across the print and are countersunk on
// the inside so the device covers the heads.

export default {
  id: "device-bracket",
  category: "electronics",
  title: "Device wall bracket",
  summary: "a U bracket that holds a router, modem, power strip, switch, hub or drive against a wall or under a shelf.",
  print: "on its side as shown, no supports. Use a pair.",
  names: ["device bracket", "device wall mount", "electronics wall mount", "gadget wall mount", "wall mount bracket",
    "u bracket", "cradle bracket", "device holder bracket", "electronics bracket", "gadget holder"],
  nouns: ["bracket", "mount", "cradle"],
  keywords: ["wall", "router", "modem", "hub", "switch", "drive", "device", "electronics", "network"],
  fits: ["device"],
  fromSpec: (s) => ({ deviceT: s.dims.t }),
  primary: "deviceT",
  specNote: "with a millimetre of room",
  ask: {
    unless: ["deviceT"],
    text: "How thick is the device? Say “45 mm thick” (or name it) and I’ll size the U; I used 35 mm, a typical router on its edge.",
  },
  tips: ["45 mm thick", "taller lip", "tape on"],
  examples: ["make me a router wall mount", "wall power strip mount for a 40mm thick strip",
    "a wall bracket for my network switch", "usb hub mount with tape"],
  params: {
    deviceT: { default: 35, min: 5, max: 120, unit: "mm", label: "device thickness", say: ["thick", "thickness", "device", "deep"], more: ["thicker"], less: ["thinner"] },
    lipH: { default: 15, min: 5, max: 60, unit: "mm", label: "front lip height", say: ["lip", "front"], more: ["taller"] },
    backH: { default: 45, min: 20, max: 150, unit: "mm", label: "back plate height", say: ["back", "tall", "high", "height"] },
    width: { default: 25, min: 10, max: 100, unit: "mm", label: "bracket width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 4, min: 2.5, max: 8, unit: "mm", label: "thickness", say: ["wall", "strong"], more: ["stronger", "sturdier"] },
    room: { default: 1, min: 0.3, max: 5, unit: "mm", label: "room round the device", say: ["clearance", "room", "loose"] },
    screwD: { default: 4, min: 3, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw", "hole"] },
    mount: { default: "screw", unit: "choice", choices: ["tape", "screw"], label: "how it fixes on",
      words: { tape: ["tape", "adhesive", "sticky", "stick on", "command strip"], screw: ["screw", "screws", "screw holes"] } },
  },
  things: [
    { names: ["router wall mount", "router mount", "router holder", "router bracket", "wifi router mount", "wifi router holder"],
      title: "Router wall mount", keywords: ["router", "wifi", "mesh"], params: { deviceT: 35, backH: 60, lipH: 20, width: 30 } },
    { names: ["modem wall mount", "modem mount", "modem holder", "cable modem mount", "modem bracket"], title: "Modem wall mount", keywords: ["modem"],
      params: { deviceT: 50, backH: 70, lipH: 22, width: 30 } },
    { names: ["wall power strip mount", "power strip wall bracket", "power bar wall mount", "surge protector wall mount"],
      title: "Power strip mount", keywords: ["power strip", "surge protector", "power bar"], params: { deviceT: 42, backH: 40, lipH: 20, width: 25 } },
    { names: ["usb hub mount", "usb hub holder", "usb hub bracket", "usb dock holder"], title: "USB hub mount", keywords: ["hub", "dock"],
      params: { deviceT: 18, backH: 35, lipH: 12, width: 20 } },
    { names: ["network switch mount", "ethernet switch mount", "network switch holder", "network switch bracket"], title: "Network switch mount",
      spec: "device-switch-5port", params: { backH: 50, lipH: 18 } },
    { names: ["hard drive mount", "hard drive holder", "hdd mount", "nas drive bracket", "3.5 drive holder"], title: "Hard drive mount",
      spec: "device-hdd-35", params: { backH: 60, lipH: 20, width: 30 } },
    { names: ["external ssd holder", "portable ssd mount", "ssd mount", "t7 ssd holder"], title: "Portable SSD holder",
      spec: "device-samsung-t7", params: { backH: 30, lipH: 10, width: 20, wall: 3 } },
    { names: ["2.5 drive holder", "laptop drive bracket", "external hard drive holder"], title: "2.5 inch drive holder",
      spec: "device-drive-25", params: { backH: 40, lipH: 14, width: 25, wall: 3 } },
    { names: ["power brick wall mount", "charger brick wall mount", "power adapter wall mount", "power supply wall mount"],
      title: "Power brick holder", params: { deviceT: 32, backH: 45, lipH: 18, width: 25 } },
  ],
  body: `
// side profile: x out from the wall, y up; printed lying on it
const w = wall, g = deviceT + room;
const lip = Math.max(lipH, w + 2);
const c = Math.min(3, g / 3);                        // a small gusset in the inside corner
const back = Math.max(backH, w + c + 6);
const outline = [[0, 0], [2 * w + g, 0], [2 * w + g, lip], [w + g, lip], [w + g, w], [w + c, w], [w, w + c], [w, back], [0, back]];
const piece = linearExtrude({ h: width }, polygon(outline));
if (mount !== "screw") return piece;
// countersunk holes through the back plate, above the cradle, heads on the inside
const yh = w + c + (back - w - c) / 2;
const zs = width < 45 ? [width / 2] : [width * 0.25, width * 0.75];
const k = Math.min(screwD / 2, w - 1);
const holes = zs.flatMap((z) => [
  translate([-1, yh, z], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: w + 2, $fn: 24 }))),
  translate([w - k + 0.02, yh, z], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]);
return difference(piece, ...holes);
`,
};
