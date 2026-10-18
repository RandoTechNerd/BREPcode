// A clip that holds a frameless mirror (or a glass or acrylic panel) by its
// edge: a screw block against the wall, a channel the mirror's edge sits in
// and a front lip that laps over its face. The whole clip is one side profile
// extruded across its width and printed lying on its side, so the channel
// and the lip are walls standing on the bed. The screw hole, which then runs
// sideways, is a teardrop pointed up so it prints clean, and it is
// countersunk on the front so the head sits flush under the mirror's edge.
// Use a deeper "top" clip above the mirror: lift the mirror up into it,
// then drop it into the bottom clips.

export default {
  id: "mirror-clip",
  category: "bathroom",
  title: "Mirror clip",
  summary: "a screw-on clip that holds a frameless mirror, glass or acrylic panel by its edge.",
  print: "lying on its side as shown, no supports. PETG or ASA; four or more clips for a mirror, deeper ones along the top.",
  names: ["mirror clip", "frameless mirror clip", "mirror bracket", "mirror mounting clip", "bathroom mirror clip",
    "mirror holder clip", "mirror hanging clip", "mirror mount", "mirror retaining clip", "wall mirror clip"],
  nouns: ["clip", "bracket", "mount"],
  keywords: ["mirror", "glass", "acrylic", "panel", "frameless", "bathroom", "wall"],
  fits: ["mirror"],
  fromSpec: (s) => ({ mirrorT: s.dims.t }),
  specNote: "the channel adds the clearance below",
  primary: "mirrorT",
  ask: { unless: ["mirrorT"], text: "How thick is the mirror? Most bathroom mirrors are 1/4 in (6 mm); say \"for a 4 mm mirror\" and I'll size the channel. I used 6 mm." },
  tips: ["for a 4 mm mirror", "top clip", "30 mm wide", "deeper lip"],
  examples: ["I want a mirror clip", "make me a frameless mirror clip for a 6 mm mirror",
    "mirror bracket 30 mm wide", "bathroom mirror clip for a quarter inch mirror"],
  params: {
    mirrorT: { default: 6.35, min: 2, max: 12, unit: "mm", label: "mirror or panel thickness", say: ["glass", "panel", "sheet", "thick", "thickness", "acrylic"] },
    clear: { default: 0.8, min: 0.2, max: 2.5, unit: "mm", label: "room around the mirror in the channel", say: ["clearance", "room", "fit"] },
    lipH: { default: 8, min: 3, max: 30, unit: "mm", label: "how far the lip laps over the mirror", say: ["lip", "overlap", "deep", "depth"], more: ["deeper"], less: ["shallower"] },
    lipT: { default: 3, min: 2, max: 6, unit: "mm", label: "front lip thickness", say: ["lip"] },
    backT: { default: 3, min: 1.5, max: 10, unit: "mm", label: "how far the mirror stands off the wall", say: ["offset", "off", "away", "behind"] },
    width: { default: 20, min: 8, max: 60, unit: "mm", label: "clip width", say: ["wide", "width", "long"], more: ["wider"], less: ["narrower"] },
    screwD: { default: 4, min: 2.5, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
  },
  things: [
    { names: ["top mirror clip", "upper mirror clip", "deep mirror clip", "mirror top clip", "lift out mirror clip"],
      title: "Top mirror clip (deep, the mirror lifts into it)", params: { lipH: 20 } },
    { names: ["quarter inch mirror clip", "6 mm mirror clip", "6mm mirror clip", "standard mirror clip"],
      title: "Mirror clip for a 1/4 in (6 mm) mirror", spec: "bath-mirror-6mm" },
    { names: ["eighth inch mirror clip", "thin mirror clip", "eighth inch glass clip"],
      title: "Mirror clip for a 1/8 in (3 mm) mirror", spec: "bath-mirror-3mm", params: { lipT: 2.5 } },
    { names: ["acrylic sheet clip", "acrylic panel clip", "plexiglass clip", "perspex clip", "acrylic mount clip", "acrylic sign clip"],
      title: "Acrylic sheet clip", spec: "bath-acrylic-sheet", params: { lipH: 6, lipT: 2.5, width: 16 } },
    { names: ["glass panel clip", "glass clip", "glass sheet clip", "glass panel bracket", "glass pane clip"],
      title: "Glass panel clip", spec: "bath-glass-panel", params: { width: 28, lipT: 3.5 } },
    { names: ["heavy mirror clip", "large mirror clip", "heavy duty mirror clip", "big mirror bracket"],
      title: "Heavy mirror clip", params: { width: 40, lipT: 4, lipH: 10, screwD: 5 } },
    { names: ["offset mirror clip", "standoff mirror clip", "mirror spacer clip", "uneven wall mirror clip"],
      title: "Offset mirror clip", params: { backT: 8 } },
  ],
  body: `
// side profile: x out from the wall, y up the wall; extruded across the clip's width (z), printed lying on it
const gapX = mirrorT + clear;
const D = backT + gapX + lipT;                        // total depth from the wall
const blockH = Math.max(2 * screwD + 6, 12);          // the screw block under the mirror's edge
const yT = blockH + lipH;
const c = Math.min(1.5, lipT / 2);
const lead = Math.min(1, lipT / 3, lipH / 4);
const outline = polygon([
  [0, 0], [D - c, 0], [D, c],                         // bottom front corner, chamfered
  [D, yT - c], [D - c, yT],                           // top of the lip, chamfered
  [backT + gapX + lead, yT], [backT + gapX, yT - lead],  // a lead-in on the lip's inside edge
  [backT + gapX, blockH], [backT, blockH],            // the channel the edge sits in
  [backT, yT], [0, yT],                               // the back wall behind the mirror
]);
const body = linearExtrude({ h: width }, outline);

// a teardrop screw hole through the block (front to back), pointed up in print, countersunk on the front
const r = screwD / 2;
const tear = polygon([...Array.from({ length: 25 }, (_, i) => {
  const t = 3 * Math.PI / 4 + i * (3 * Math.PI / 2) / 24;
  return [r * Math.cos(t), r * Math.sin(t)];
}), [0, r * Math.SQRT2]]);
// rotate([90, 90, 0]) sends the profile's x to y, its y to z, and the extrusion to +x
const hole = translate([-1, blockH / 2, width / 2], rotate([90, 90, 0], linearExtrude({ h: D + 2 }, tear)));
const sink = translate([D + 0.01, blockH / 2, width / 2], rotate([0, -90, 0], cylinder({ r1: 2 * r, r2: r, h: r, $fn: 32 })));
return translate([-D / 2, -yT / 2, 0], difference(body, hole, sink));
`,
};
