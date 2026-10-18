// A little shelf that sits on top of a monitor: a short front tab in front
// of the bezel, a longer leg down the back, and a flat top for a webcam,
// a phone or a speaker. One side profile (with a gusset where the shelf
// runs out past the back leg), printed lying on its side.

export default {
  id: "monitor-shelf",
  category: "desk",
  title: "Monitor top shelf",
  summary: "a small shelf that hooks over the top edge of a monitor, for a webcam, phone or speaker.",
  print: "lying on its side as shown, no supports.",
  names: ["monitor shelf", "monitor top shelf", "screen top shelf", "screen shelf", "shelf for top of monitor",
    "monitor topper", "over monitor shelf", "monitor top tray"],
  nouns: ["shelf", "topper", "tray"],
  keywords: ["monitor", "screen", "display", "top", "webcam", "camera"],
  tips: ["monitor 15 mm thick", "120 mm wide", "deeper shelf"],
  examples: ["I want a monitor shelf", "a webcam shelf for my monitor",
    "monitor top shelf 150mm wide for a 25mm thick monitor", "shelf for top of monitor"],
  params: {
    monitorT: { default: 22, min: 4, max: 80, unit: "mm", label: "monitor thickness at the top edge", say: ["thick", "thickness", "monitor", "screen", "bezel"] },
    shelfD: { default: 90, min: 20, max: 220, unit: "mm", label: "shelf depth", say: ["deep", "depth", "shelf"], more: ["deeper"], less: ["shallower"] },
    width: { default: 100, min: 30, max: 250, unit: "mm", label: "shelf width", say: ["wide", "width", "long"], more: ["wider", "longer"], less: ["narrower", "shorter"] },
    frontDrop: { default: 10, min: 3, max: 40, unit: "mm", label: "front tab down the bezel", say: ["front", "tab"] },
    backDrop: { default: 45, min: 10, max: 150, unit: "mm", label: "back leg down the monitor", say: ["back", "leg", "drop"] },
    wall: { default: 4, min: 2.4, max: 10, unit: "mm", label: "thickness", say: ["wall", "sturdy"], more: ["sturdier", "stronger"] },
    lipH: { default: 5, min: 0, max: 30, unit: "mm", label: "lip round the shelf top", say: ["lip", "rim", "edge"] },
  },
  things: [
    { names: ["webcam shelf", "monitor webcam shelf", "webcam mount for monitor", "monitor webcam mount", "webcam holder for monitor", "camera shelf for monitor", "webcam mount", "webcam holder"],
      title: "Webcam shelf", params: { shelfD: 55, width: 70, lipH: 3 } },
    { names: ["laptop screen shelf", "laptop lid shelf", "laptop webcam shelf", "shelf for laptop screen"], title: "Laptop screen shelf",
      params: { monitorT: 6, frontDrop: 5, backDrop: 25, width: 60, shelfD: 45, wall: 3 } },
    { names: ["tv top shelf", "shelf for top of tv", "tv topper shelf", "tv webcam shelf"], title: "TV top shelf",
      params: { monitorT: 45, shelfD: 160, width: 200, backDrop: 80, wall: 6, lipH: 6 } },
    { names: ["monitor phone shelf", "phone shelf for monitor", "monitor speaker shelf", "monitor figure shelf"], title: "Monitor phone shelf",
      params: { shelfD: 110, width: 160, lipH: 10 } },
    { names: ["imac shelf", "imac top shelf"], title: "iMac top shelf", params: { monitorT: 12, backDrop: 40, shelfD: 80, width: 120 } },
  ],
  body: `
// side profile: x runs front to back, y runs up (the monitor's top edge at y = 0)
const xb = wall + monitorT;                      // inside face of the back leg
const depth = Math.max(shelfD, xb + wall);
const top = wall + (lipH > 0 ? lipH : 0);
const g = Math.max(0, Math.min(depth - xb - wall - 2, backDrop - 2, 40));   // gusset under the overhang
const outline = [[0, -frontDrop], [wall, -frontDrop], [wall, 0], [xb, 0], [xb, -backDrop], [xb + wall, -backDrop],
  ...(g > 4 ? [[xb + wall, -g], [xb + wall + g, 0]] : depth > xb + wall + 0.01 ? [[xb + wall, 0]] : []),
  [depth, 0]];
if (lipH > 0) outline.push([depth, top], [depth - wall, top], [depth - wall, wall], [wall, wall], [wall, top], [0, top]);
else outline.push([depth, wall], [0, wall]);
return translate([-depth / 2, (backDrop - top) / 2, 0], linearExtrude({ h: width }, polygon(outline)));
`,
};
