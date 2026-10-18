// Gets the last of the toothpaste out. The slider is a thick flat bar with a
// narrow slit the flattened tube threads through, and a round finger pad at
// each end: slide it toward the cap and the slit irons the tube flat. The key
// is the other classic: a slotted post the crimped end slides into, with a
// flat grip at the bottom, wound like a sardine key. Both print in the
// orientation shown with every surface vertical or facing up.

export default {
  id: "toothpaste-squeezer",
  category: "bathroom",
  title: "Toothpaste squeezer",
  summary: "a slit slider (or a winding key) that squeezes the last of the toothpaste, cream or paint out of a tube.",
  print: "flat as shown (the key stands on its grip), no supports. PLA or PETG.",
  names: ["toothpaste squeezer", "tube squeezer", "toothpaste tube squeezer", "toothpaste saver", "tube wringer",
    "toothpaste slider", "squeezer for toothpaste", "tube saver"],
  nouns: ["squeezer", "wringer", "roller", "key"],
  keywords: ["toothpaste", "tube", "squeeze", "lotion", "cream", "paint"],
  primary: "tubeW",
  tips: ["as a key", "both", "70 mm wide tube", "thicker"],
  examples: ["I want a toothpaste squeezer", "make me a tube squeezer for a 50 mm wide tube",
    "toothpaste squeezer key", "a squeezer for lotion tubes"],
  params: {
    tubeW: { default: 60, min: 20, max: 120, unit: "mm", label: "flattened tube width (slit length)", say: ["tube", "wide", "width", "slit"], more: ["wider", "bigger"], less: ["narrower", "smaller"] },
    slitW: { default: 2.4, min: 1, max: 6, unit: "mm", label: "slit gap", say: ["gap", "slit", "opening"], more: ["looser"], less: ["tighter"] },
    plateT: { default: 7, min: 4, max: 16, unit: "mm", label: "slider thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"], less: ["thinner"] },
    depth: { default: 24, min: 14, max: 50, unit: "mm", label: "slider front-to-back size", say: ["deep", "depth"] },
    grip: { default: 18, min: 8, max: 40, unit: "mm", label: "finger pad size each side", say: ["grip", "pad", "finger"], more: ["bigger grip"] },
    style: { default: "slider", unit: "choice", choices: ["slider", "key", "both"], label: "style",
      words: { both: ["both", "slider and key", "key and slider", "set"], key: ["key", "winding key", "roller", "winder", "wind up", "roll up"], slider: ["slider", "slide"] } },
  },
  things: [
    { names: ["toothpaste key", "toothpaste tube key", "toothpaste roller", "toothpaste tube roller", "tube winding key", "tube roller key", "tube key"],
      title: "Toothpaste tube key", params: { style: "key" } },
    { names: ["lotion tube squeezer", "lotion squeezer", "body lotion tube squeezer", "sunscreen tube squeezer"],
      title: "Lotion tube squeezer", params: { tubeW: 72, slitW: 3, depth: 26 } },
    { names: ["paint tube squeezer", "paint tube wringer", "artist paint squeezer", "oil paint tube squeezer", "acrylic paint squeezer"],
      title: "Paint tube squeezer", params: { tubeW: 40, slitW: 2, grip: 14, depth: 20 } },
    { names: ["cream tube squeezer", "hand cream squeezer", "ointment tube squeezer"],
      title: "Cream tube squeezer", params: { tubeW: 50, slitW: 2.4 } },
    { names: ["kids toothpaste squeezer", "travel toothpaste squeezer", "small tube squeezer"],
      title: "Small tube squeezer", params: { tubeW: 45, grip: 14, depth: 20 } },
    { names: ["tube squeezer set", "squeezer and key set", "toothpaste squeezer set"],
      title: "Tube squeezer and key", params: { style: "both" } },
    { names: ["tomato paste tube squeezer", "glue tube squeezer"],
      title: "Kitchen and workshop tube squeezer", params: { tubeW: 45, slitW: 3, plateT: 8 } },
  ],
  body: `
const L = tubeW + 2;                                  // slit length, a millimetre of room each side
const gap = Math.min(slitW, depth / 3);

// the slider: a bar with a round finger pad at each end
const padR = Math.max(depth / 2 + 2, grip / 2 + 4);
const xPad = L / 2 + 3 + padR * 0.7;
const pad = (sx) => translate([sx * xPad, 0, 0], cylinder({ r: padR, h: plateT, $fn: 48 }));
const barShape = hull(
  translate([-xPad, -depth / 2, 0], cube([2 * xPad, depth, plateT])),
  pad(-1), pad(1),
);
// the slit, with a 45 degree lead-in along its top edges so the tube finds it
const lead = Math.min(1.5, plateT / 3);
const slitCut = union(
  hull(translate([-L / 2 + gap / 2, 0, -1], cylinder({ r: gap / 2, h: plateT + 2, $fn: 16 })),
    translate([L / 2 - gap / 2, 0, -1], cylinder({ r: gap / 2, h: plateT + 2, $fn: 16 }))),
  translate([-L / 2, 0, plateT - lead], rotate([90, 90, 0], linearExtrude({ h: L }, polygon([[-gap / 2, 0], [gap / 2, 0], [gap / 2 + lead + 0.01, lead + 0.01], [-gap / 2 - lead - 0.01, lead + 0.01]])))),
);
// a shallow thumb dish in each pad
const dimple = (sx) => translate([sx * xPad, 0, plateT + padR * 2.2 - Math.min(1.6, plateT / 4)], sphere({ r: padR * 2.2, $fn: 64 }));
const slider = difference(barShape, slitCut, dimple(-1), dimple(1));

// the key: a slotted post standing on a flat paddle grip; the slot is as
// long as the tube is wide, because the crimped end goes in along the post
const postR = Math.max(7, gap / 2 + 5);
const finH = Math.min(26, 14 + grip / 2), finT = Math.max(5, Math.min(8, plateT));
const slotZ = finH + 2;
const postH = slotZ + L + 4;
const finW = 2 * postR + 2 * grip;
const fc = Math.min(6, grip / 2);
const fin = translate([0, finT / 2, 0], rotate([90, 0, 0], linearExtrude({ h: finT }, polygon([
  [-finW / 2, 0], [finW / 2, 0], [finW / 2, finH - fc], [finW / 2 - fc, finH], [-finW / 2 + fc, finH], [-finW / 2, finH - fc]]))));
const post = union(
  cylinder({ r: postR, h: postH - 2, $fn: 40 }),
  translate([0, 0, postH - 2.01], cylinder({ r1: postR, r2: postR - 2, h: 2.01, $fn: 40 })),
);
const keyPart = difference(union(post, fin),
  translate([-gap / 2, -postR - 1, slotZ], cube([gap, 2 * postR + 2, postH])));

if (style === "key") return keyPart;
if (style === "both") return group(slider, translate([0, depth / 2 + padR + postR + 12, 0], keyPart));
return slider;
`,
};
