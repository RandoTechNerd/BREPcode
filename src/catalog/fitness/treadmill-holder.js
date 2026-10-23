// A tablet or phone holder that hooks over the top edge of a treadmill,
// exercise bike or rower console: an inverted U hangs on the edge, the
// device leans on the back plate and stands in a ledge with a front lip.
// One side profile, printed lying on its side, so it has no overhang at
// all; print two narrow ones for a tablet, or one wide.

export default {
  id: "treadmill-holder",
  category: "fitness",
  title: "Treadmill tablet holder",
  summary: "hooks over a treadmill or exercise bike console and holds a tablet or phone in a ledge.",
  print: "lying on its side as shown, no supports. Two narrow ones hold a tablet steadier than one wide one.",
  names: ["treadmill tablet holder", "treadmill tablet mount",
    "exercise machine tablet holder", "fitness equipment tablet holder", "gym equipment phone holder", "console tablet clip",
    "exercise machine holder", "gym machine holder"],
  nouns: ["holder", "mount", "clip"],
  keywords: ["treadmill", "exercise", "bike", "elliptical", "rower", "gym", "tablet", "ipad", "phone", "console"],
  fits: ["phone", "tablet"],
  fromSpec: (s) => ({ deviceT: s.dims.t + 4 }),
  specNote: "the slot allows a few mm for a case",
  ask: {
    unless: ["consoleT"],
    text: "How thick is the console edge it hooks over? Say “40 mm console”; I used 30 mm.",
  },
  tips: ["40 mm console", "for an iPad", "wider"],
  examples: ["I want a treadmill tablet holder", "make me a tablet holder for my exercise bike",
    "treadmill holder for my ipad with a 40mm console", "a phone holder for my rowing machine"],
  params: {
    deviceT: { default: 12, min: 5, max: 30, unit: "mm", label: "device thickness with its case", say: ["device", "tablet", "phone", "slot", "case"] },
    consoleT: { default: 30, min: 5, max: 80, unit: "mm", label: "console edge thickness", say: ["console", "edge", "rail"] },
    hookD: { default: 25, min: 10, max: 60, unit: "mm", label: "how far the hook reaches down behind", say: ["hook", "reach"] },
    backH: { default: 80, min: 40, max: 200, unit: "mm", label: "back height", say: ["tall", "high", "back", "height"], more: ["taller"], less: ["shorter"] },
    lipH: { default: 12, min: 5, max: 30, unit: "mm", label: "front lip height", say: ["lip"] },
    width: { default: 40, min: 15, max: 200, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 5, min: 3, max: 10, unit: "mm", label: "thickness", say: ["thick", "wall"], more: ["stronger", "thicker"] },
    lean: { default: 10, min: 0, max: 30, unit: "deg", label: "lean back from upright", say: ["lean", "angle", "tilt", "degree"] },
  },
  things: [
    { names: ["treadmill holder", "treadmill tablet stand"], title: "Treadmill tablet holder" },
    { names: ["treadmill ipad holder", "ipad holder for treadmill", "treadmill ipad mount"], title: "Treadmill iPad holder", spec: "ipad" },
    { names: ["treadmill phone holder", "treadmill phone mount"], title: "Treadmill phone holder", params: { deviceT: 12, backH: 60, width: 60 } },
    { names: ["exercise bike tablet holder", "exercise bike holder", "spin bike tablet mount", "stationary bike tablet holder", "exercise bike phone holder", "spin bike holder"], title: "Exercise bike tablet holder", params: { consoleT: 35, hookD: 30 } },
    { names: ["elliptical tablet holder", "elliptical phone holder", "elliptical holder"], title: "Elliptical tablet holder", params: { consoleT: 25 } },
    { names: ["rowing machine phone holder", "rowing machine holder", "rower phone holder", "rowing machine tablet holder", "rower holder"], title: "Rowing machine phone holder", params: { consoleT: 20, backH: 60, width: 60 } },
    { names: ["treadmill book holder", "exercise bike book holder", "treadmill book rest"], title: "Treadmill book holder", params: { deviceT: 30, backH: 120, width: 60, lipH: 15 } },
    { names: ["treadmill laptop holder", "walking pad laptop shelf"], title: "Treadmill laptop holder", params: { deviceT: 25, backH: 60, width: 80, lipH: 15, wall: 7 } },
    { names: ["wide treadmill tablet holder", "one piece treadmill tablet holder"], title: "Wide treadmill tablet holder", params: { width: 160 } },
  ],
  body: `
// side profile: x towards you, y up; printed lying on it, stretched across the width
const t = wall, g = deviceT + 1, H = backH;
const s = Math.tan(lean * Math.PI / 180);
const xb = -H * s;                                        // the back plate's front face at the top
const hk = Math.min(hookD, H - t);
const outline = [
  [g + t, 0], [g + t, t + lipH], [g, t + lipH], [g, t],   // the lip and the ledge the device stands in
  [-t * s, t], [xb, H],                                   // up the back plate
  [xb, H + t], [xb - 2 * t - consoleT, H + t],            // over the top of the console edge
  [xb - 2 * t - consoleT, H + t - hk], [xb - t - consoleT, H + t - hk],   // and down behind it
  [xb - t - consoleT, H], [xb - t, H],                    // the underside the console edge sits against
  [-t, 0],
];
const left = xb - 2 * t - consoleT;
return translate([-(left + g + t) / 2, -(H + t) / 2, 0], linearExtrude({ h: width }, polygon(outline)));
`,
};
