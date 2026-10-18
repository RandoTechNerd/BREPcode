// A big finger loop that makes something small easy to pull: a zip's tiny
// tab, a plug in a socket, a fan's pull chain. One flat rounded shape with a
// finger hole and, at the other end, either a small hole for a split ring or
// cord, or a snap-on clip for a power cord just behind the plug.

export default {
  id: "pull-loop",
  category: "access",
  title: "Zipper pull",
  summary: "a big finger loop for a zip, a plug or a pull cord, with a ring hole or a snap-on cord clip.",
  print: "flat as shown, no supports.",
  names: ["zipper pull", "zip pull", "zipper puller", "zipper pull tab", "zip puller", "jacket zipper pull", "backpack zipper pull",
    "finger loop pull", "zipper pull loop", "zip tag"],
  nouns: ["pull", "puller", "loop"],
  keywords: ["zipper", "zip", "pull", "loop", "finger", "plug", "cord", "arthritis"],
  fits: ["cable"],
  fromSpec: (s) => ({ holeD: s.dims.d, attach: "clip" }),
  tips: ["bigger finger hole", "with a cord clip", "thicker"],
  examples: ["I want a zipper pull", "make me a plug puller for my lamp cord",
    "zipper pull with a 35mm finger hole", "a pull for my ceiling fan chain"],
  params: {
    loopD: { default: 28, min: 14, max: 50, unit: "mm", label: "finger hole", say: ["finger", "loop", "hole"], more: ["bigger"], less: ["smaller"] },
    band: { default: 4, min: 2.5, max: 8, unit: "mm", label: "band width round the hole", say: ["band", "rim"] },
    attach: { default: "ring", unit: "choice", choices: ["ring", "clip"], label: "small hole or cord clip",
      words: { clip: ["clip", "cord", "cable", "plug", "snap"], ring: ["ring", "split ring", "zipper", "zip", "chain", "string"] } },
    holeD: { default: 4, min: 2, max: 12, unit: "mm", label: "ring hole or cord diameter", say: ["cord", "cable", "chain", "ring"] },
    tabL: { default: 14, min: 6, max: 40, unit: "mm", label: "tab length", say: ["tab", "long", "length"] },
    thick: { default: 4, min: 2, max: 10, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker", "sturdier"] },
  },
  things: [
    { names: ["plug puller", "plug pull handle", "power cord puller", "plug pull ring", "outlet plug puller", "plug grip", "cord pull handle"],
      title: "Plug puller", params: { attach: "clip", holeD: 6.5, loopD: 30, thick: 5 } },
    { names: ["ceiling fan pull", "fan pull chain handle", "pull chain handle", "light pull", "fan chain pull"], title: "Pull-chain handle",
      params: { attach: "ring", holeD: 3, loopD: 24, tabL: 12 } },
    { names: ["blind cord pull", "curtain cord pull", "shade cord pull"], title: "Blind cord pull", params: { attach: "ring", holeD: 3.5, loopD: 26 } },
    { names: ["suitcase zipper pull", "luggage zipper pull", "big zipper pull"], title: "Luggage zipper pull", params: { loopD: 34, thick: 5, band: 5 } },
    { names: ["glove zipper pull", "winter coat zipper pull", "mitten zipper pull"], title: "Glove-friendly zipper pull", params: { loopD: 40, band: 5, thick: 5 } },
  ],
  body: `
// lying flat: the finger hole at the origin, the tab out along +x
const Ro = loopD / 2 + band;
const tw = holeD + 2 * Math.max(3, band);        // tab width
const tx = Ro + tabL;                            // the tab's attachment centre
const outer = hull(cylinder({ r: Ro, h: thick, $fn: 48 }), translate([tx, 0, 0], cylinder({ r: tw / 2, h: thick, $fn: 32 })));
const cuts = [translate([0, 0, -1], cylinder({ r: loopD / 2, h: thick + 2, $fn: 48 })),
  translate([tx, 0, -1], cylinder({ r: holeD / 2 + (attach === "clip" ? 0.1 : 0.2), h: thick + 2, $fn: 24 }))];
// a cord clip: a mouth narrower than the cord, so it snaps on
if (attach === "clip") cuts.push(translate([tx, -holeD * 0.36, -1], cube([tw, holeD * 0.72, thick + 2])));
return translate([-tx / 2, 0, 0], difference(outer, ...cuts));
`,
};
