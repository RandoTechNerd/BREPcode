// A wall bracket for a gamepad: a narrow channel the controller's bottom
// edge drops into, between its grips, with the controller leaning back on
// the wall plate. A gusset under the channel takes the weight back into the
// plate. One side profile, printed lying on its side.

export default {
  id: "controller-wall-mount",
  category: "gaming",
  title: "Controller wall mount",
  summary: "a narrow wall bracket a gamepad drops into between its grips, screwed through the plate.",
  print: "lying on its side as shown, no supports. Countersunk screws go through the plate into the wall.",
  names: ["controller wall mount", "controller wall holder", "wall controller holder", "gamepad wall mount", "controller wall hanger",
    "controller wall bracket", "wall mounted controller holder", "controller wall rack"],
  nouns: ["mount", "bracket", "hanger"],
  keywords: ["wall", "controller", "gamepad", "xbox", "ps5", "gaming", "hang"],
  fits: ["controller", "tablet"],
  fromSpec(s) {
    if (s.kind === "controller") return { seatD: Math.round(s.dims.t * 0.5 + 3), width: Math.round(Math.min(60, s.dims.w * 0.28)) };
    return { seatD: Math.min(80, s.dims.t + 3), width: 60, lipH: 25 };
  },
  specNote: "the bracket fits between the grips",
  tips: ["for a PS5 controller", "taller plate", "45 mm wide"],
  examples: ["I want a controller wall mount", "wall mount for my xbox controller",
    "gamepad wall mount 40mm wide", "a wall bracket for my ps5 controller"],
  params: {
    seatD: { default: 32, min: 10, max: 80, unit: "mm", label: "channel depth (the controller's thickness)", say: ["thick", "thickness", "deep", "depth", "channel"] },
    lipH: { default: 15, min: 5, max: 50, unit: "mm", label: "front lip height", say: ["lip", "front"] },
    plateH: { default: 70, min: 35, max: 160, unit: "mm", label: "wall plate height", say: ["plate", "tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    width: { default: 36, min: 16, max: 90, unit: "mm", label: "width (fits between the grips)", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 5, min: 3, max: 10, unit: "mm", label: "thickness", say: ["wall"], more: ["sturdier", "stronger"] },
    screwD: { default: 4, min: 3, max: 5.5, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["xbox controller wall mount", "xbox controller wall holder", "xbox controller hanger"], title: "Xbox controller wall mount", spec: "pad-xbox" },
    { names: ["ps5 controller wall mount", "ps5 controller wall holder", "dualsense wall mount", "ps5 controller hanger"], title: "PS5 controller wall mount", spec: "pad-dualsense" },
    { names: ["ps4 controller wall mount", "ps4 controller wall holder", "dualshock wall mount"], title: "PS4 controller wall mount", spec: "pad-dualshock-4" },
    { names: ["switch pro controller wall mount", "pro controller wall mount"], title: "Switch Pro Controller wall mount", spec: "pad-switch-pro" },
    { names: ["steam deck wall mount", "steam deck wall holder", "handheld wall mount"], title: "Steam Deck wall mount", spec: "steam-deck",
      params: { plateH: 90, wall: 6 } },
  ],
  body: `
// side profile: x runs out from the wall, y runs up; printed lying on it, \`width\` thick
const g = Math.min(25, seatD);                   // gusset under the channel
const x1 = wall + seatD, x2 = x1 + wall;
const outline = [[0, -g], [wall, -g], [wall + g, 0], [x2, 0], [x2, wall + lipH], [x1, wall + lipH], [x1, wall],
  [wall, wall], [wall, plateH], [0, plateH]];
const piece = linearExtrude({ h: width }, polygon(outline));
// countersunk screw holes through the plate, above the channel
const k = screwD / 2;
const ys = plateH > 80 ? [plateH - 12, (plateH + wall) / 2] : [plateH - Math.min(14, (plateH - wall) / 2)];
const holes = ys.flatMap((y) => [
  translate([-1, y, width / 2], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: wall + 2, $fn: 24 }))),
  translate([wall - k + 0.02, y, width / 2], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]);
return translate([-x2 / 2, (g - plateH) / 2, 0], difference(piece, ...holes));
`,
};
