// A low wedge with one slot leaning back: it stands an album sleeve, a
// trading card, a graded slab or a game case up for show. The slot is cut
// into the wedge's side profile, which is printed lying on its side, so the
// slot's walls print as plain vertical walls.

export default {
  id: "media-stand",
  category: "gaming",
  title: "Display slot stand",
  summary: "a low wedge with a leaning slot that stands up a record sleeve, trading card, graded slab or game case.",
  print: "lying on its side as shown, no supports.",
  names: ["slot display stand", "media display stand", "display easel", "mini easel", "slot stand", "card and album stand",
    "tabletop display easel"],
  nouns: ["stand", "easel", "display"],
  keywords: ["display", "show", "vinyl", "record", "card", "slab", "case", "album"],
  fits: ["media"],
  fromSpec: (s) => ({ slotT: Math.min(30, s.dims.t + 0.8), width: Math.min(250, Math.max(30, Math.round(s.dims.w * 0.55))) }),
  specNote: "the slot is 0.8 mm wider than it",
  tips: ["15 degrees", "a 6 mm slot", "120 mm wide"],
  examples: ["make me a now playing vinyl stand", "a stand for my graded card",
    "trading card stand", "slot display stand with a 6mm slot"],
  params: {
    slotT: { default: 5, min: 0.8, max: 30, unit: "mm", label: "slot width (what it holds)", say: ["slot", "thick", "thickness", "gap"] },
    lean: { default: 12, min: 0, max: 30, unit: "deg", label: "lean back from upright", say: ["lean", "angle", "tilt", "degree"], more: ["further back"] },
    depth: { default: 60, min: 25, max: 160, unit: "mm", label: "depth front to back", say: ["deep", "depth"], more: ["deeper"] },
    width: { default: 100, min: 20, max: 250, unit: "mm", label: "width", say: ["wide", "width", "long", "length"], more: ["wider", "longer"], less: ["narrower", "shorter"] },
    frontH: { default: 10, min: 4, max: 60, unit: "mm", label: "height at the front", say: ["front"] },
    backH: { default: 22, min: 6, max: 80, unit: "mm", label: "height at the back", say: ["back", "tall", "high", "height"] },
    slotDepth: { default: 14, min: 4, max: 60, unit: "mm", label: "slot depth", say: ["slot", "sink"] },
  },
  things: [
    { names: ["now playing stand", "now playing vinyl stand", "vinyl record stand", "record display stand", "album display stand",
      "vinyl display stand", "record stand", "lp stand", "vinyl stand"], title: "Now playing record stand", spec: "media-vinyl",
    params: { depth: 70, frontH: 10, backH: 24, slotDepth: 15 } },
    { names: ["trading card stand", "trading card display stand", "pokemon card stand", "sports card stand", "single card stand"], title: "Trading card stand",
      spec: "media-trading-card", params: { depth: 30, frontH: 6, backH: 12, slotDepth: 7, lean: 10 } },
    { names: ["graded card stand", "psa slab stand", "slab stand", "graded slab display", "graded card display"], title: "Graded card stand",
      spec: "media-psa-slab", params: { depth: 45, frontH: 8, backH: 18, slotDepth: 12 } },
    { names: ["top loader stand", "toploader stand", "toploader display stand"], title: "Toploader stand", spec: "media-toploader",
      params: { depth: 35, frontH: 7, backH: 14, slotDepth: 9 } },
    { names: ["game case display stand", "game case stand", "game box display stand"], title: "Game case display stand", spec: "media-bluray-case",
      params: { depth: 60, backH: 25, slotDepth: 14 } },
    { names: ["switch case stand", "switch game case stand", "switch case display stand"], title: "Switch case stand", spec: "media-switch-case",
      params: { depth: 55, backH: 22, slotDepth: 14 } },
    { names: ["comic book stand", "comic display stand", "comic book display"], title: "Comic book stand", spec: "media-comic",
      params: { depth: 60, backH: 28, slotDepth: 16, lean: 15 } },
    { names: ["cd display stand", "cd stand", "album cd stand"], title: "CD display stand", spec: "media-cd-case", params: { depth: 50, backH: 20 } },
  ],
  body: `
// side profile: x runs front to back, y runs up; printed lying on it, \`width\` thick
const D = Math.max(depth, slotT + 20);
const a = lean * Math.PI / 180;
const u = [Math.sin(a), Math.cos(a)];            // up the slot, leaning back
const nb = [Math.cos(a), -Math.sin(a)];          // across the slot, toward the back
const k = (backH - frontH) / D;
const topY = (x) => frontH + k * x;
const xs = Math.min(D - slotT - 6, Math.max(D * 0.45, slotT / 2 + 6));
const B = [xs, Math.max(3, topY(xs) - slotDepth)];   // the slot's bottom centre
const Fb = [B[0] - nb[0] * slotT / 2, B[1] - nb[1] * slotT / 2];
const Bb = [B[0] + nb[0] * slotT / 2, B[1] + nb[1] * slotT / 2];
// where a line up the slot from P meets the top
const hit = (P) => { const t = (frontH + k * P[0] - P[1]) / (u[1] - k * u[0]); return [P[0] + t * u[0], P[1] + t * u[1]]; };
const outline = [[0, 0], [D, 0], [D, backH], hit(Bb), Bb, Fb, hit(Fb), [0, frontH]];
return translate([-D / 2, -backH / 2, 0], linearExtrude({ h: width }, polygon(outline)));
`,
};
