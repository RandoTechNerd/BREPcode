// A desk stand for a gamepad: a narrow spine that fits between the grips,
// a raised seat with a front lip for the controller's bottom edge, and a
// sloped back it leans on, so it stands up facing you with its grips hanging
// either side. The seat is high enough that the grips clear the desk. One
// side profile with a window through it, printed lying on its side.

export default {
  id: "controller-stand",
  category: "gaming",
  title: "Controller stand",
  summary: "a narrow desk stand that holds a gamepad upright between its grips, leaning back on a sloped spine.",
  print: "lying on its side as shown, no supports.",
  names: ["controller stand", "controller holder", "gamepad stand", "gamepad holder", "controller display stand",
    "game controller stand", "game controller holder", "controller desk stand"],
  nouns: ["stand", "holder", "display"],
  keywords: ["controller", "gamepad", "xbox", "playstation", "ps5", "ps4", "gaming", "desk"],
  fits: ["controller", "tablet"],
  fromSpec(s) {
    if (s.kind === "controller") {
      const { w, d, t } = s.dims;
      return { seatD: Math.round(t * 0.5 + 3), width: Math.round(Math.min(60, w * 0.28)), backL: Math.round(d * 0.6) };
    }
    return { seatD: Math.min(70, s.dims.t + 3), width: 60, backL: Math.round(Math.min(150, s.dims.h * 0.6)), seatH: 25 };
  },
  specNote: "the spine fits between the grips",
  ask: { unless: ["seatD"], text: "Which controller is it for? Say “for a PS5 controller” or “for an Xbox controller” and I’ll size the seat to it." },
  tips: ["for a PS5 controller", "70 degrees", "50 mm seat height"],
  examples: ["I want a controller stand", "a stand for my ps5 controller",
    "xbox controller stand at 65 degrees", "gamepad holder for my desk"],
  params: {
    angle: { default: 62, min: 40, max: 80, unit: "deg", label: "lean angle from the desk", say: ["angle", "lean", "tilt", "degree"], more: ["upright", "steeper"], less: ["flatter", "reclined"] },
    seatH: { default: 45, min: 15, max: 90, unit: "mm", label: "seat height (the grips hang below it)", say: ["seat", "high", "height", "tall", "lift"], more: ["higher", "taller"], less: ["lower", "shorter"] },
    seatD: { default: 32, min: 8, max: 70, unit: "mm", label: "seat depth (the controller's thickness where it sits)", say: ["thick", "thickness", "deep", "depth"] },
    backL: { default: 65, min: 30, max: 150, unit: "mm", label: "back support length", say: ["back", "support"], more: ["longer"], less: ["shorter"] },
    width: { default: 42, min: 16, max: 90, unit: "mm", label: "spine width (fits between the grips)", say: ["wide", "width", "spine"], more: ["wider"], less: ["narrower", "slimmer"] },
    lipH: { default: 10, min: 3, max: 30, unit: "mm", label: "front lip height", say: ["lip"] },
    wall: { default: 6, min: 4, max: 12, unit: "mm", label: "frame thickness", say: ["wall", "frame"], more: ["sturdier", "stronger"] },
    baseD: { default: 110, min: 60, max: 220, unit: "mm", label: "base length front to back", say: ["base", "foot", "long", "length"], more: ["longer"] },
  },
  things: [
    { names: ["xbox controller stand", "xbox controller holder", "xbox gamepad stand", "xbox series controller stand"], title: "Xbox controller stand", spec: "pad-xbox" },
    { names: ["ps5 controller stand", "ps5 controller holder", "dualsense stand", "dualsense holder", "playstation controller stand"],
      title: "PS5 controller stand", spec: "pad-dualsense" },
    { names: ["ps4 controller stand", "ps4 controller holder", "dualshock stand", "dualshock 4 stand"], title: "PS4 controller stand", spec: "pad-dualshock-4" },
    { names: ["switch pro controller stand", "pro controller stand", "switch pro controller holder", "nintendo pro controller stand"],
      title: "Switch Pro Controller stand", spec: "pad-switch-pro" },
    { names: ["steam deck stand", "steam deck holder", "steam deck display stand"], title: "Steam Deck stand", spec: "steam-deck",
      params: { angle: 65, wall: 7 } },
    { names: ["rog ally stand", "handheld pc stand", "handheld console stand", "legion go stand"], title: "Handheld PC stand",
      params: { seatD: 36, width: 60, backL: 70, seatH: 25, angle: 65, wall: 7 } },
  ],
  body: `
// side profile: x runs front to back, y runs up; printed lying on it, \`width\` thick
const a = angle * Math.PI / 180;
const lipT = wall;
const S = [lipT + seatD, seatH];                 // where the controller's back meets the support
const u = [Math.cos(a), Math.sin(a)], n = [Math.sin(a), -Math.cos(a)];
const T = [S[0] + backL * u[0], S[1] + backL * u[1]];
const Tb = [T[0] + wall * n[0], T[1] + wall * n[1]];
const D = Math.max(baseD, Tb[0] + 15);
const outline = [[0, 0], [D, 0], [D, wall], [Tb[0], wall], Tb, T, S, [lipT, seatH], [lipT, seatH + lipH], [0, seatH + lipH]];
// a window through the spine, leaving \`wall\` of frame all round
const m = wall, xR = Tb[0] - m, yB = 2 * m;
const under = (x) => S[1] + (x - S[0]) * Math.tan(a) - m / Math.cos(a);
const xk = S[0] + (m / Math.cos(a) - m) / Math.tan(a);
let win = null;
if (seatH - m - yB > 6 && xR - m > 8) {
  win = xk < xR - 2 && under(xR) > seatH - m
    ? [[m, yB], [xR, yB], [xR, under(xR)], [xk, seatH - m], [m, seatH - m]]
    : [[m, yB], [xR, yB], [xR, seatH - m], [m, seatH - m]];
}
const spine = linearExtrude({ h: width }, polygon(outline));
const piece = win ? difference(spine, translate([0, 0, -1], linearExtrude({ h: width + 2 }, polygon(win)))) : spine;
return translate([-D / 2, -Math.max(T[1], seatH + lipH) / 2, 0], piece);
`,
};
