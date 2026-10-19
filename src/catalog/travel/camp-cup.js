// A camping cup: a turned, slightly flared cup with an upright loop handle
// on its side. The handle's hole runs up and down, the way a carabiner clips
// through it, so the handle is a plan-view ring extruded straight up from the
// bed and nothing overhangs. The flare is gentle, so the cup wall needs no
// support either.

export default {
  id: "camp-cup",
  category: "travel",
  title: "Camping cup",
  summary: "a flared camping cup with an upright loop handle a carabiner clips through.",
  print: "upright as shown, no supports. PETG; layer lines hold grime, so keep it for camp use, and not for hot drinks in PLA.",
  names: ["camping cup", "camp cup", "camping mug", "camp mug", "outdoor cup", "hiking cup", "backpacking cup", "trail cup", "picnic cup"],
  nouns: ["cup", "mug"],
  keywords: ["camping", "camp", "hiking", "backpacking", "outdoor", "carabiner", "trail"],
  tips: ["taller", "no handle", "100 mm across"],
  examples: ["I want a camping cup", "make me a camp mug 100mm tall",
    "a backpacking cup with no handle", "camping cup 90mm across"],
  params: {
    topD: { default: 85, min: 50, max: 120, unit: "mm", label: "rim diameter", say: ["across", "diameter", "wide", "rim"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    bottomD: { default: 70, min: 40, max: 110, unit: "mm", label: "base diameter", say: ["base", "bottom"] },
    height: { default: 90, min: 40, max: 140, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    wall: { default: 2.4, min: 1.6, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    loop: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "loop handle",
      words: { no: ["no handle", "without handle", "without a handle", "handleless", "stacking"], yes: ["handle", "loop", "with handle"] } },
    loopW: { default: 24, min: 12, max: 40, unit: "mm", label: "handle hole width", say: ["handle", "loop", "finger"] },
  },
  things: [
    { names: ["stacking cup", "stackable camping cup", "nesting cup"], title: "Stacking cup", params: { loop: "no", topD: 85, bottomD: 68 } },
    { names: ["backpacking mug", "ultralight cup", "lightweight camping cup"], title: "Backpacking mug", params: { topD: 80, bottomD: 70, height: 70, wall: 1.8 } },
    { names: ["camping tumbler", "camp tumbler"], title: "Camping tumbler", params: { loop: "no", topD: 80, bottomD: 64, height: 110 } },
    { names: ["kids camping cup", "small camping cup", "espresso camping cup"], title: "Small camping cup", params: { topD: 65, bottomD: 55, height: 60, loopW: 18 } },
  ],
  body: `
const rt = topD / 2;
const rb = Math.min(bottomD / 2, rt);              // never wider at the foot: that would overhang
const floor = Math.max(3, wall + 0.6);
const outside = polygon([[0, 0], [rb, 0], [rt, height], [0, height]]);
const bore = polygon([[0, floor], [rb - wall, floor], [rt - wall, height + 1], [0, height + 1]]);
let cup = revolve({ angle: 360, $fn: 96 }, outside);
if (loop === "yes") {
  // a ring standing beside the cup, joined to it by a web; it rises 60 percent of the way
  const hh = height * 0.6;
  const band = Math.max(4, wall + 2);
  const cx = rt + loopW / 2;                       // clear of the flare all the way up
  const web = translate([rb - 2, -band / 2, 0], cube([rt - band / 2 - rb + 2, band, hh]));   // stops at the ring, not across its hole
  const ring = difference(
    translate([cx, 0, 0], cylinder({ r: loopW / 2 + band, h: hh, $fn: 48 })),
    translate([cx, 0, -1], cylinder({ r: loopW / 2, h: hh + 2, $fn: 48 })),
  );
  // turned a quarter round, off the lathe's seam line
  cup = union(cup, rotate([0, 0, 90], union(web, ring)));
}
return difference(cup, revolve({ angle: 360, $fn: 96 }, bore));
`,
};
