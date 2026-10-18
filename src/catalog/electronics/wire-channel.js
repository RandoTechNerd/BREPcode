// A channel for running cables or an LED strip along a wall or under a
// shelf. One cross-section, extruded along the run and printed on its back.
// "open" has a V groove near the top of each wall for a diffuser strip to
// slide in (an LED profile); "covered" has 45 degree lips that a snap-in
// cover catches under (a cable raceway), and the cover prints beside it,
// upside down with its barbs pointing up. Every slope is 45 degrees, so the
// long overhangs a groove or lip would make never appear.

export default {
  id: "wire-channel",
  category: "electronics",
  title: "Cable channel",
  summary: "a channel that runs cables or an LED strip along a wall, open with a diffuser groove or with a snap-on cover.",
  print: "on its back as shown, cover beside it, no supports. Longer runs: print several end to end.",
  names: ["cable raceway", "wire channel", "cable channel", "led channel", "led strip channel", "cord cover",
    "cable cover", "wire cover", "led strip diffuser", "led profile", "cable duct", "wire raceway", "led diffuser channel",
    "cord channel", "wire duct"],
  nouns: ["channel", "raceway", "duct"],
  keywords: ["cable", "wire", "cord", "led", "strip", "wall", "diffuser"],
  fits: ["ledstrip"],
  fromSpec: (s) => ({ innerW: s.dims.w + 1 }),
  primary: "innerW",
  tips: ["250 mm long", "20 mm wide inside", "with a cover", "screw holes"],
  examples: ["make me a cable raceway", "led strip channel for a 10mm strip",
    "cord cover 30mm wide with a cover", "a wire channel 250 mm long with screw holes"],
  params: {
    length: { default: 200, min: 30, max: 250, unit: "mm", label: "length of the run", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    innerW: { default: 12, min: 5, max: 60, unit: "mm", label: "inside width", say: ["wide", "width", "inside"], more: ["wider"], less: ["narrower"] },
    innerH: { default: 8, min: 4, max: 40, unit: "mm", label: "inside depth", say: ["deep", "depth", "tall", "high"], more: ["deeper"], less: ["shallower"] },
    wall: { default: 1.6, min: 1.2, max: 3, unit: "mm", label: "wall thickness", say: ["wall"] },
    lip: { default: 1.2, min: 0.6, max: 3, unit: "mm", label: "groove or lip size", say: ["lip", "groove"] },
    style: { default: "open", unit: "choice", choices: ["open", "covered"], label: "open with diffuser groove, or covered",
      words: { covered: ["cover", "covered", "lid", "raceway", "snap", "closed"], open: ["open", "diffuser", "led"] } },
    mount: { default: "tape", unit: "choice", choices: ["tape", "screw"], label: "how it fixes on",
      words: { screw: ["screw", "screws", "screw holes", "nail"], tape: ["tape", "adhesive", "sticky", "stick on"] } },
  },
  things: [
    { names: ["ws2812b channel", "neopixel channel", "addressable led channel"], title: "WS2812B strip channel", spec: "ledstrip-ws2812b" },
    { names: ["under cabinet led channel", "led light bar channel", "shelf led channel"], title: "Under-shelf LED channel", params: { innerW: 12, innerH: 10, mount: "screw" } },
    { names: ["wall cable raceway", "tv cable cover", "wall cord cover", "tv wire cover"], title: "Wall cable cover",
      params: { style: "covered", innerW: 30, innerH: 12, wall: 2 } },
    { names: ["desk cable raceway", "small cable raceway", "single cable cover"], title: "Small raceway", params: { style: "covered", innerW: 12, innerH: 8 } },
    { names: ["large wire duct", "big cable raceway", "power cable duct"], title: "Large wire duct", params: { style: "covered", innerW: 45, innerH: 30, wall: 2.4, lip: 2 } },
    { names: ["cob led channel", "slim led channel"], title: "Slim LED channel", spec: "ledstrip-cob", params: { innerH: 6 } },
  ],
  body: `
// cross-section: x across, z up; extruded along y
const W = innerW + 2 * wall, H = wall + innerH;
const iw = innerW / 2;
const g = Math.min(lip, wall - 0.6, (innerH - 1.5) / 2);   // groove depth: never through the wall or the floor
const l = Math.min(lip, innerW / 4, innerH - 1);     // lip size: never closes the opening
const zg = H - g - 1;
const section = style === "covered"
  ? [[-W / 2, 0], [W / 2, 0], [W / 2, H], [iw - l, H], [iw, H - l], [iw, wall], [-iw, wall], [-iw, H - l], [-iw + l, H], [-W / 2, H]]
  : [[-W / 2, 0], [W / 2, 0], [W / 2, H], [iw, H], [iw, zg + g], [iw + g, zg], [iw, zg - g], [iw, wall],
     [-iw, wall], [-iw, zg - g], [-iw - g, zg], [-iw, zg + g], [-iw, H], [-W / 2, H]];
// rotate([90, 0, 0]) keeps the profile's x, sends its y to z, and the extrusion to -y
const run = (pts) => translate([0, length / 2, 0], rotate([90, 0, 0], linearExtrude({ h: length }, polygon(pts))));
let channel = run(section);
if (mount === "screw") {
  const n = Math.max(1, Math.round(length / 100));
  const holes = Array.from({ length: n }, (_, i) => {
    const y = (i + 0.5) * length / n - length / 2;
    const d = Math.min(3.5, innerW - 1.5);
    return union(translate([0, y, -1], cylinder({ d, h: wall + 2, $fn: 16 })),
      translate([0, y, wall - d / 2 + 0.01], cylinder({ r1: d / 2, r2: d, h: d / 2, $fn: 16 })));
  });
  channel = difference(channel, ...holes);
}
if (style !== "covered") return channel;
// the cover, printed upside down: a plate with two legs whose barbs catch under the lips
const fit = Math.min(0.25, wall / 5), b = Math.min(l * 0.8, 1);
const xo = iw - l - fit;
const legT = Math.max(0.6, Math.min(1.2, xo - 0.5));
const zb = wall + l + 0.3;
const cover = [[-W / 2, 0], [W / 2, 0], [W / 2, wall], [xo, wall], [xo, zb], [xo + b, zb + b], [xo, zb + 2 * b],
  [xo - legT, zb + 2 * b], [xo - legT, wall], [-(xo - legT), wall], [-(xo - legT), zb + 2 * b], [-xo, zb + 2 * b],
  [-xo - b, zb + b], [-xo, zb], [-xo, wall], [-W / 2, wall]];
return group(channel, translate([W + 6, 0, 0], run(cover)));
`,
};
