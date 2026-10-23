// A strap clip for anything flat: an LED strip, a ribbon or flat cable. A
// bridge that stands over the strip with a tab on each side for a screw or a
// piece of tape. One profile, printed on its side, so the bridge is never a
// bridge to the printer: every layer is the whole outline.

export default {
  id: "strip-clip",
  category: "electronics",
  title: "LED strip clip",
  summary: "a strap clip that holds an LED strip or a flat cable to a wall, screwed or taped down.",
  print: "on its side as shown, no supports.",
  names: ["led strip clip", "led strip holder", "led strip mount", "led strip bracket", "strip light clip",
    "flat cable clip", "ribbon cable clip", "led strip mounting clip", "light strip clip", "led strip clamp"],
  nouns: ["clip", "clamp", "strap"],
  keywords: ["led", "strip", "ribbon", "flat", "light", "tape"],
  fits: ["ledstrip"],
  fromSpec: (s) => ({ stripW: s.dims.w, stripT: s.dims.t }),
  primary: "stripW",
  specNote: "with a little room round the strip",
  tips: ["for a 12 mm strip", "tape on", "wider clip"],
  examples: ["make me an led strip clip", "led strip clip for a 10mm strip with screw holes",
    "flat cable clip 20mm wide", "an led strip holder for ws2812b"],
  params: {
    // no "strip" or "clip" in a say list: in "ws2812b strip clip" the 2812 is a part number
    stripW: { default: 10, min: 3, max: 40, unit: "mm", label: "strip width", say: ["ribbon", "flat", "across"] },
    stripT: { default: 3, min: 1, max: 14, unit: "mm", label: "strip thickness", say: ["thick", "thickness"] },
    clipW: { default: 8, min: 4, max: 20, unit: "mm", label: "clip width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 1.6, min: 1.2, max: 3, unit: "mm", label: "clip thickness", say: ["wall", "strong"], more: ["stronger"] },
    tabL: { default: 7, min: 0, max: 20, unit: "mm", label: "side tab length (0 = none)", say: ["tab", "ear"] },
    mount: { default: "screw", unit: "choice", choices: ["tape", "screw"], label: "how it fixes on",
      words: { tape: ["tape", "adhesive", "sticky", "stick on", "glue"], screw: ["screw", "screws", "screw holes", "nail"] } },
  },
  things: [
    { names: ["ws2812b clip", "neopixel strip clip", "addressable led clip"], title: "WS2812B strip clip", spec: "ledstrip-ws2812b" },
    { names: ["silicone led strip clip", "waterproof led strip clip", "outdoor led strip clip"], title: "Waterproof strip clip", spec: "ledstrip-waterproof" },
    { names: ["neon flex clip", "led neon clip", "neon strip clip"], title: "Neon flex clip", spec: "ledstrip-neon-flex" },
    { names: ["ribbon cable holder", "wide flat cable clip", "idc cable clip"], title: "Ribbon cable clip", params: { stripW: 30, stripT: 1.6, tabL: 6 } },
    { names: ["led strip corner clip", "stick on led strip clip", "adhesive led strip clip"], title: "Stick-on strip clip", params: { mount: "tape", tabL: 6 } },
  ],
  body: `
// profile: x across the strip, y up off the wall; extruded clipW along the strip
const sw = stripW + 0.6, st = stripT + 0.4, w = wall;
const t = tabL >= 1 ? tabL : 0;
const outline = t
  ? [[-sw / 2 - w - t, 0], [-sw / 2, 0], [-sw / 2, st], [sw / 2, st], [sw / 2, 0], [sw / 2 + w + t, 0],
     [sw / 2 + w + t, w], [sw / 2 + w, w], [sw / 2 + w, st + w], [-sw / 2 - w, st + w], [-sw / 2 - w, w], [-sw / 2 - w - t, w]]
  : [[-sw / 2 - w, 0], [-sw / 2, 0], [-sw / 2, st], [sw / 2, st], [sw / 2, 0], [sw / 2 + w, 0], [sw / 2 + w, st + w], [-sw / 2 - w, st + w]];
const clip = linearExtrude({ h: clipW }, polygon(outline));
const d = Math.min(3.4, clipW - 2, t - 1.5);
if (mount !== "screw" || d < 1.5) return clip;
// screw holes up through the tabs (across the print, so small and round)
const holes = [-1, 1].map((s) => translate([s * (sw / 2 + w + t / 2), -1, clipW / 2], rotate([-90, 0, 0], cylinder({ d, h: w + 2, $fn: 16 }))));
return difference(clip, ...holes);
`,
};
