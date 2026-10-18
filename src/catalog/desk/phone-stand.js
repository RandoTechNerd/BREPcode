// A phone (or tablet) leaning back on a slanted support, sitting on a raised
// seat so a charging plug can go straight down through it and out the front.
// One side profile, extruded across the width, with a window cut through the
// wedge under the support so it is a frame rather than a brick.

export default {
  id: "phone-stand",
  category: "desk",
  title: "Phone stand",
  summary: "leans a phone back at a reading angle, with a charging-cable hole through the seat.",
  print: "upright as shown, no supports.",
  names: ["phone stand", "phone holder", "phone dock", "phone cradle", "cell phone stand",
    "mobile stand", "charging stand", "desk phone stand", "phone rest", "smartphone stand"],
  nouns: ["stand", "holder", "dock", "cradle", "rest"],
  keywords: ["phone", "iphone", "pixel", "galaxy", "android", "desk", "charging", "nightstand"],
  fits: ["phone", "tablet"],
  fromSpec(s) {
    const { h, w, t } = s.dims;
    if (s.kind === "phone") return { deviceT: t + 3 };
    // tablets and handhelds: a wider, taller back and a lower seat
    return { deviceT: t + 4, width: Math.min(200, Math.max(90, w * 0.5)), backH: Math.min(200, Math.max(60, h * 0.5)), seatH: 12, cableW: 14 };
  },
  specNote: "the slot allows a few mm for a case",
  ask: {
    unless: ["deviceT"],
    text: "Which phone is it for? Name it (“for an iPhone 16”) and I’ll size the slot to it; I used 12 mm, a typical phone in a case.",
  },
  tips: ["for a Pixel 9", "75 degrees", "90 mm wide", "no cable hole"],
  examples: ["I want a phone holder", "make me a phone stand for my iPhone 15 Pro",
    "phone stand at 70 degrees, 90mm wide", "a charging stand for my galaxy s24"],
  params: {
    deviceT: { default: 12, min: 5, max: 30, unit: "mm", label: "device thickness with its case", say: ["thick", "thickness", "case", "slot"] },
    angle: { default: 65, min: 45, max: 80, unit: "deg", label: "lean angle from the desk", say: ["angle", "lean", "tilt", "degree"], more: ["upright", "steeper"], less: ["flatter", "reclined"] },
    width: { default: 70, min: 30, max: 220, unit: "mm", label: "stand width", say: ["wide", "width"], more: ["wider"], less: ["narrower", "slimmer"] },
    backH: { default: 80, min: 40, max: 220, unit: "mm", label: "back support length", say: ["tall", "high", "height", "back"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    seatH: { default: 22, min: 4, max: 60, unit: "mm", label: "seat height above the desk", say: ["seat", "lift", "raise"] },
    lipH: { default: 10, min: 4, max: 30, unit: "mm", label: "front lip height", say: ["lip"] },
    cableW: { default: 12, min: 0, max: 20, unit: "mm", label: "cable hole width (0 = none)", say: ["cable", "charger", "plug"] },
    wall: { default: 4, min: 2.4, max: 8, unit: "mm", label: "wall thickness", say: ["wall"] },
  },
  things: [
    { names: ["tablet stand", "ipad stand", "ipad holder", "tablet holder", "ipad dock"], title: "Tablet stand",
      params: { deviceT: 11, width: 120, backH: 130, seatH: 12, lipH: 12, cableW: 14 } },
    { names: ["kindle stand", "e reader stand", "ereader stand", "kindle holder"], title: "E-reader stand", spec: "kindle",
      params: { width: 90, backH: 100, seatH: 10, cableW: 0 } },
    { names: ["switch stand", "nintendo switch stand", "switch holder"], title: "Switch stand", spec: "switch",
      params: { width: 120, backH: 70, seatH: 16, lipH: 8, cableW: 14 } },
    { names: ["nightstand phone stand", "bedside phone stand", "bedside phone holder"], title: "Bedside phone stand",
      params: { angle: 70, width: 80 } },
  ],
  body: `
// side profile: x runs front to back, y runs up; extruded across the width
const gapX = deviceT + 1;                       // a millimetre of room around the device
const lipT = wall;
const x0 = lipT + gapX;                         // the back support starts here
const a = angle * Math.PI / 180;
const u = [Math.cos(a), Math.sin(a)];           // up the support
const n = [Math.sin(a), -Math.cos(a)];          // through the support, away from the phone
const S = [x0, seatH];
const Ti = [S[0] + backH * u[0], S[1] + backH * u[1]];
const To = [Ti[0] + wall * n[0], Ti[1] + wall * n[1]];
const depth = To[0];
const outline = [[0, 0], [depth, 0], To, Ti, S, [lipT, seatH], [lipT, seatH + lipH], [0, seatH + lipH]];

// the window through the wedge under the support, leaving \`wall\` all round
const m = wall;
const Q = [S[0] + (wall + m) * n[0], S[1] + (wall + m) * n[1]];
const onLine = (x) => Q[1] + ((x - Q[0]) / u[0]) * u[1];
const xBack = depth - m, xFront = x0 + m;
let win = null;
if (onLine(xBack) > m + 3) {
  if (onLine(xFront) > m + 1) win = [[xFront, m], [xBack, m], [xBack, onLine(xBack)], [xFront, onLine(xFront)]];
  else {
    const x1 = Q[0] + ((m - Q[1]) / u[1]) * u[0];
    if (x1 < xBack - 3) win = [[x1, m], [xBack, m], [xBack, onLine(xBack)]];
  }
}

// a side profile turned up and stretched across y from y0 to y0 + h
const across = (pts, h, y0) => translate([0, y0 + h, 0], rotate([90, 0, 0], linearExtrude({ h }, polygon(pts))));

const cuts = [];
if (win) cuts.push(across(win, width + 2, -1));
if (cableW > 0) {
  // down through the seat, then out the front along the desk
  cuts.push(translate([lipT + 0.5, (width - cableW) / 2, -1], cube([gapX - 1, cableW, seatH + 2])));
  cuts.push(translate([-1, (width - cableW) / 2, -1], cube([x0, cableW, Math.min(8, seatH - 2) + 1])));
}
const stand = cuts.length ? difference(across(outline, width, 0), ...cuts) : across(outline, width, 0);
return translate([-depth / 2, -width / 2, 0], stand);
`,
};
