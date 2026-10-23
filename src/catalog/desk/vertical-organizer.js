// A base with upright dividers: laptops, tablets, mail, folders or notebooks
// stand on edge in the slots between them. The whole thing is one comb-shaped
// end profile pushed back the depth of the stand, so it prints upright with
// every wall vertical. A "step" makes each divider taller than the last, the
// stepped file sorter where every folder's top edge shows.

export default {
  id: "vertical-organizer",
  category: "desk",
  title: "Vertical organizer",
  summary: "a base with upright dividers that holds laptops, tablets, mail or folders on edge.",
  print: "upright as shown, no supports.",
  names: ["vertical organizer", "vertical dock", "upright organizer", "slotted stand",
    "desk sorter", "vertical holder", "desktop sorter"],
  nouns: ["organizer", "sorter", "dock", "stand"],
  keywords: ["vertical", "upright", "laptop", "tablet", "mail", "file", "folder", "slot", "desk"],
  fits: ["laptop", "tablet", "media"],
  fromSpec: (s) => ({ slotW: Math.min(60, s.dims.t + (s.kind === "media" ? 1.5 : 4)) }),
  specNote: "each slot leaves a little room round it",
  tips: ["3 slots", "25 mm slots", "120 mm deep", "stepped 15 mm"],
  examples: ["make me a vertical laptop stand", "a mail sorter with 4 slots",
    "vertical stand for my macbook pro 14", "file sorter 100mm tall"],
  params: {
    slots: { default: 2, min: 1, max: 8, unit: "count", label: "slots", say: ["slot", "section", "compartment", "device", "laptop"] },
    slotW: { default: 22, min: 3, max: 60, unit: "mm", label: "slot width", say: ["slot", "gap", "thick", "thickness"], more: ["looser"], less: ["tighter"] },
    finH: { default: 60, min: 15, max: 200, unit: "mm", label: "divider height", say: ["tall", "high", "height", "divider"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    depth: { default: 100, min: 30, max: 250, unit: "mm", label: "depth front to back", say: ["deep", "depth", "long", "length"], more: ["deeper", "longer"], less: ["shallower", "shorter"] },
    finT: { default: 8, min: 3, max: 20, unit: "mm", label: "divider thickness", say: ["fin", "wall", "sturdy"], more: ["sturdier", "thicker"], less: ["thinner"] },
    baseT: { default: 4, min: 2, max: 12, unit: "mm", label: "base thickness", say: ["base", "floor"] },
    step: { default: 0, min: 0, max: 40, unit: "mm", label: "each divider taller than the last by", say: ["step", "stepped", "staggered"] },
  },
  things: [
    { names: ["vertical laptop stand", "laptop vertical stand", "vertical laptop holder", "vertical laptop dock",
      "macbook vertical stand", "vertical macbook stand", "closed laptop stand", "clamshell laptop stand", "vertical stand for laptop", "vertical stand for macbook"],
      title: "Vertical laptop stand", params: { slots: 1, slotW: 20, finH: 55, depth: 120, finT: 12 } },
    { names: ["dual laptop stand", "double laptop stand", "two laptop stand", "laptop and tablet dock", "laptop and tablet stand",
      "multi device dock", "multi laptop stand"], title: "Laptop and tablet dock", params: { slots: 3, slotW: 20, finH: 60, depth: 110 } },
    { names: ["vertical tablet stand", "vertical ipad stand", "ipad organizer", "tablet organizer", "ipad storage stand"],
      title: "Vertical tablet stand", params: { slots: 2, slotW: 12, finH: 50, depth: 80, finT: 6 } },
    { names: ["mail sorter", "letter sorter", "desk mail organizer", "desk letter holder", "desk mail sorter"],
      title: "Mail organizer", params: { slots: 3, slotW: 18, finH: 70, depth: 60, finT: 5, step: 15 } },
    { names: ["file sorter", "file organizer", "folder holder", "desk file organizer", "folder organizer", "binder holder"],
      title: "File sorter", params: { slots: 4, slotW: 30, finH: 100, depth: 120, finT: 6, step: 20 } },
    { names: ["notebook organizer", "notebook holder", "sketchbook holder", "journal holder", "planner holder"],
      title: "Notebook holder", params: { slots: 4, slotW: 16, finH: 80, depth: 140, finT: 5 } },
    { names: ["desk book rack", "desktop book rack", "book organizer", "desktop bookshelf"],
      title: "Desktop book rack", params: { slots: 5, slotW: 35, finH: 90, depth: 150, finT: 6 } },
    { names: ["switch game case holder", "switch game case organizer", "switch case holder", "switch game shelf"],
      title: "Switch game case holder", spec: "media-switch-case", params: { slots: 8, finH: 50, depth: 90, finT: 3 } },
    { names: ["game case holder", "video game holder", "game case organizer", "ps5 game holder", "xbox game holder", "video game organizer"],
      title: "Game case holder", spec: "media-bluray-case", params: { slots: 6, finH: 60, depth: 100, finT: 3 } },
    { names: ["dvd holder", "dvd organizer", "blu ray holder", "dvd rack", "movie case holder"], title: "DVD holder", spec: "media-dvd-case",
      params: { slots: 6, finH: 70, depth: 100, finT: 3 } },
    { names: ["cd holder", "cd organizer", "cd rack", "jewel case holder"], title: "CD holder", spec: "media-cd-case",
      params: { slots: 8, finH: 50, depth: 90, finT: 3 } },
    { names: ["vinyl record holder", "record holder", "vinyl holder", "lp holder", "vinyl storage rack", "record storage stand"],
      title: "Vinyl record holder", params: { slots: 3, slotW: 60, finH: 120, depth: 150, finT: 6 } },
    { names: ["multi phone stand", "phone parking station", "phone storage stand", "family phone stand"],
      title: "Multi-phone stand", params: { slots: 4, slotW: 14, finH: 45, depth: 70, finT: 6 } },
  ],
  body: `
// end profile: x runs across the slots, y runs up; pushed back \`depth\` along y
const pitch = slotW + finT;
const width = slots * pitch + finT;
const c = Math.min(1.5, finT / 3);               // a small chamfer on each divider top
const pts = [[0, 0], [width, 0]];
for (let k = slots; k >= 0; k--) {
  const x0 = k * pitch, x1 = x0 + finT, h = baseT + finH + k * step;
  pts.push([x1, h - c], [x1 - c, h], [x0 + c, h], [x0, h - c]);
  if (k > 0) pts.push([x0, baseT], [x0 - slotW, baseT]);
}
const comb = rotate([90, 0, 0], linearExtrude({ h: depth }, polygon(pts)));
return translate([-width / 2, depth / 2, 0], comb);
`,
};
