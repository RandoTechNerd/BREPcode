// Brackets for a games console standing on edge: either a wall bracket (a
// plate with a ledge and front lip the console's bottom edge sits in) or a
// pair of floor feet (a channel between two walls, buttressed out to wide
// feet). Use two, one near each end. Both are one flat profile printed
// lying on its side, so nothing hangs.

export default {
  id: "console-mount",
  category: "gaming",
  title: "Console wall mount",
  summary: "brackets that hold a games console on edge, on the wall or as a vertical stand.",
  print: "lying on their side as shown, no supports. Use one near each end of the console.",
  names: ["console wall mount", "game console wall mount", "console wall bracket", "console mount", "console vertical stand",
    "vertical console stand", "console stand", "console holder", "game console stand", "console bracket"],
  nouns: ["mount", "bracket", "stand"],
  keywords: ["console", "playstation", "xbox", "nintendo", "wall", "vertical", "gaming", "tv"],
  fits: ["console"],
  fromSpec: (s) => ({ consoleT: s.dims.t, width: Math.round(Math.min(60, Math.max(25, s.dims.w * 0.2))) }),
  specNote: "the channel fits its widest point",
  ask: { unless: ["consoleT"], text: "Which console is it for? Say “for a PS5 Slim” or “for an Xbox Series S” and I’ll size the channel to it." },
  tips: ["for an Xbox Series S", "vertical stand", "taller lip"],
  examples: ["I want a console wall mount", "ps5 slim vertical stand",
    "a wall mount for my xbox series s", "console stand for something 60mm thick"],
  params: {
    consoleT: { default: 64, min: 15, max: 170, unit: "mm", label: "console thickness", say: ["thick", "thickness", "channel"] },
    mount: { default: "wall", unit: "choice", choices: ["wall", "stand"], label: "wall bracket or floor stand",
      words: { stand: ["vertical stand", "stand", "upright", "vertical", "feet", "on the desk", "on the floor"], wall: ["wall mount", "wall bracket", "on the wall", "wall"] } },
    lipH: { default: 15, min: 5, max: 60, unit: "mm", label: "lip height", say: ["lip", "tall", "high"] },
    width: { default: 40, min: 15, max: 100, unit: "mm", label: "bracket width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 5, min: 3, max: 12, unit: "mm", label: "thickness", say: ["wall"], more: ["sturdier", "stronger"] },
    plateH: { default: 60, min: 30, max: 150, unit: "mm", label: "wall plate height", say: ["plate"] },
    foot: { default: 35, min: 10, max: 120, unit: "mm", label: "foot reach each side (stand)", say: ["foot", "feet", "base"] },
    pieces: { default: 2, min: 1, max: 4, unit: "count", label: "brackets", say: ["bracket", "piece", "stand"] },
    screwD: { default: 4, min: 3, max: 5.5, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["ps5 wall mount", "playstation 5 wall mount", "ps5 wall bracket", "ps5 wall holder"], title: "PS5 wall mount", spec: "console-ps5",
      params: { lipH: 25, plateH: 80, wall: 6 } },
    { names: ["ps5 slim wall mount", "ps5 slim wall bracket"], title: "PS5 Slim wall mount", spec: "console-ps5-slim", params: { lipH: 22, plateH: 70 } },
    { names: ["ps5 slim vertical stand", "ps5 slim stand", "ps5 slim vertical holder", "ps5 slim feet"], title: "PS5 Slim vertical stand",
      spec: "console-ps5-slim", params: { mount: "stand", lipH: 20, foot: 50 } },
    { names: ["ps5 pro vertical stand", "ps5 pro stand", "ps5 pro vertical holder"], title: "PS5 Pro vertical stand", spec: "console-ps5-pro",
      params: { mount: "stand", lipH: 20, foot: 50 } },
    { names: ["xbox series x wall mount", "series x wall mount", "xbox series x wall bracket"], title: "Xbox Series X wall mount", spec: "console-xbox-series-x",
      params: { lipH: 30, plateH: 90, wall: 6 } },
    { names: ["xbox series s wall mount", "series s wall mount", "xbox series s wall bracket"], title: "Xbox Series S wall mount", spec: "console-xbox-series-s" },
    { names: ["xbox series s vertical stand", "series s vertical stand", "xbox series s stand", "series s stand"], title: "Xbox Series S vertical stand",
      spec: "console-xbox-series-s", params: { mount: "stand", foot: 40 } },
    { names: ["xbox series x vertical stand", "xbox series x stand", "series x stand", "series x vertical stand"], title: "Xbox Series X stand",
      spec: "console-xbox-series-x", params: { mount: "stand", foot: 40, lipH: 20, wall: 6 } },
    { names: ["ps4 vertical stand", "ps4 stand", "ps4 slim vertical stand", "ps4 slim stand"], title: "PS4 vertical stand", spec: "console-ps4",
      params: { mount: "stand", foot: 45, lipH: 12 } },
    { names: ["ps4 pro vertical stand", "ps4 pro stand"], title: "PS4 Pro vertical stand", spec: "console-ps4-pro", params: { mount: "stand", foot: 45 } },
    { names: ["xbox one s vertical stand", "xbox one vertical stand", "xbox one stand"], title: "Xbox One S vertical stand", spec: "console-xbox-one-s",
      params: { mount: "stand", foot: 40 } },
    { names: ["switch dock wall mount", "nintendo switch dock wall mount", "switch dock mount", "switch dock wall bracket"], title: "Switch dock wall mount",
      spec: "console-switch-dock", params: { lipH: 20 } },
    { names: ["wii vertical stand", "wii stand", "nintendo wii stand"], title: "Wii vertical stand", spec: "console-wii", params: { mount: "stand", foot: 30 } },
    { names: ["apple tv wall mount", "apple tv mount", "streaming box wall mount", "apple tv bracket"], title: "Apple TV wall mount", spec: "console-apple-tv",
      params: { lipH: 10, width: 30, plateH: 45, pieces: 1 } },
  ],
  body: `
// one flat profile, printed lying on it, \`width\` thick
const gap = consoleT + 0.8;
let outline, holes = [], rowH;
if (mount === "wall") {
  // x runs out from the wall, y runs up; the console's bottom edge sits in the channel
  const g = Math.min(25, gap * 0.5, plateH * 0.5);
  const x1 = wall + gap, x2 = x1 + wall;
  outline = [[0, -g], [wall, -g], [wall + g, 0], [x2, 0], [x2, wall + lipH], [x1, wall + lipH], [x1, wall],
    [wall, wall], [wall, plateH], [0, plateH]];
  const k = screwD / 2, y = plateH - Math.min(14, (plateH - wall) / 2);
  holes = [
    translate([-1, y, width / 2], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: wall + 2, $fn: 24 }))),
    translate([wall - k + 0.02, y, width / 2], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
  ];
  rowH = plateH + g;
} else {
  // x runs across the channel, y runs up; walls buttressed out to the feet
  const xL = foot, xR = foot + 2 * wall + gap, W = xR + foot;
  const b = Math.min(foot * 0.8, lipH * 0.8);
  outline = [[0, 0], [W, 0], [W, wall], [xR + b, wall], [xR, wall + b], [xR, wall + lipH], [xR - wall, wall + lipH], [xR - wall, wall],
    [xL + wall, wall], [xL + wall, wall + lipH], [xL, wall + lipH], [xL, wall + b], [xL - b, wall], [0, wall]];
  rowH = wall + lipH;
}
const one = holes.length ? difference(linearExtrude({ h: width }, polygon(outline)), ...holes) : linearExtrude({ h: width }, polygon(outline));
const all = Array.from({ length: pieces }, (_, i) => translate([0, i * (rowH + 8), 0], one));
return translate([-40, -(pieces * (rowH + 8)) / 2, 0], group(...all));
`,
};
