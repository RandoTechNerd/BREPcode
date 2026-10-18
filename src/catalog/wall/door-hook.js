// An over-the-door hook: a thin strap that sits on top of the door (doors
// close over about 3 mm of it), a short leg down the back, and a longer strap
// down the front ending in a hook. One side profile printed on its side, so
// the strap's layers run along its length and it bends rather than snaps.

export default {
  id: "door-hook",
  category: "wall",
  title: "Over-the-door hook",
  summary: "a hook that hangs over the top of a door, no screws; also a wreath hanger.",
  print: "on its side as shown, no supports. PETG; keep the top strap thin enough for the door to close.",
  names: ["over the door hook", "over door hook", "door hook", "over the door hanger", "door hanger hook",
    "door top hook", "over door hanger", "hook for the door", "door coat hook"],
  nouns: ["hook", "hanger"],
  keywords: ["door", "over", "closet", "bedroom", "back"],
  fits: ["door"],
  fromSpec: (s) => ({ doorT: s.dims.t }),
  specNote: "the slot allows a millimetre each side",
  primary: "doorT",
  ask: { unless: ["doorT"], text: "How thick is the door? Most inside doors are 35 mm (1-3/8 inch) and front doors 44 mm; I used 35 mm. Say “for a front door” or “40 mm door”." },
  tips: ["for a front door", "two hooks", "hang it 150 mm lower"],
  examples: ["I want an over the door hook", "make me a door hook for a 40mm door",
    "a wreath hanger for my front door", "over door hook with 2 hooks"],
  params: {
    doorT: { default: 35, min: 15, max: 60, unit: "mm", label: "door thickness", say: ["door", "thick", "thickness"] },
    drop: { default: 60, min: 20, max: 250, unit: "mm", label: "how far down the door it hangs", say: ["drop", "down", "hang", "low", "long", "length"], more: ["lower", "longer"], less: ["higher", "shorter"] },
    width: { default: 25, min: 10, max: 60, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    strapT: { default: 4, min: 2.5, max: 8, unit: "mm", label: "strap thickness", say: ["strap"], more: ["stronger", "sturdier"] },
    bridgeT: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "top strap thickness (the door closes over it)", say: ["top", "bridge"] },
    backDrop: { default: 25, min: 10, max: 60, unit: "mm", label: "leg down the back of the door", say: ["back", "leg"] },
    reach: { default: 35, min: 15, max: 100, unit: "mm", label: "how far the hook sticks out", say: ["reach", "out", "deep"], more: ["deeper"] },
    armT: { default: 6, min: 3, max: 14, unit: "mm", label: "hook arm thickness", say: ["arm", "thick"] },
    tipH: { default: 15, min: 0, max: 50, unit: "mm", label: "how far the tip turns up", say: ["tip", "lip"] },
    angle: { default: 10, min: 0, max: 40, unit: "deg", label: "upward tilt of the arm", say: ["angle", "tilt", "degree"] },
    hooks: { default: 1, min: 1, max: 2, unit: "count", label: "hooks (2 = one halfway down too)", say: ["hook"] },
  },
  things: [
    { names: ["wreath hanger", "wreath hook", "door wreath hanger", "christmas wreath hanger", "over door wreath hanger", "wreath holder"],
      title: "Wreath hanger", spec: "door-exterior", keywords: ["wreath", "christmas"], params: { drop: 220, tipH: 20, reach: 30, width: 20 } },
    { names: ["closet door hook", "bedroom door hook", "over the door coat hook"], title: "Closet door hook", spec: "door-interior",
      params: { drop: 80, reach: 40 } },
    { names: ["cabinet door hook", "over cabinet door hook", "cupboard door hook"], title: "Cabinet door hook", spec: "door-cabinet",
      params: { drop: 40, reach: 25, width: 20, strapT: 3, backDrop: 15, armT: 5, tipH: 10 } },
    { names: ["double over door hook", "double door hook", "two hook door hanger"], title: "Double over-the-door hook",
      params: { hooks: 2, drop: 130 } },
    { names: ["front door hook", "over front door hook"], title: "Front door hook", spec: "door-exterior", params: { drop: 80 } },
    { names: ["heavy duty door hook", "strong over door hook"], title: "Heavy-duty door hook",
      params: { strapT: 6, armT: 10, width: 35, bridgeT: 3, reach: 45 } },
  ],
  body: `
// side profile, printed lying on it: the door is x = 0 to D, its top at y = 0.
// The hook is drawn with u running out into the room from the strap's door
// face, then flipped (x = -u) so the room is on the left.
const D = doorT + 2;
const S = strapT;
const t = Math.tan(angle * Math.PI / 180);
const tipT = Math.max(3, armT * 0.8);
const gus = Math.min(armT, reach * 0.3);
const L = Math.max(S + reach, S + gus + tipT + 3);
const arm = (u0, y0) => {
  const yb = (u) => y0 + (u - u0) * t;
  const top = yb(L) + armT + tipH;
  return [[u0, y0], [L, yb(L)], [L, top], [L - tipT, top], [L - tipT, yb(L - tipT) + armT],
    [S + gus, yb(S + gus) + armT], [S, yb(S) + armT + gus]];
};
const outline = [
  ...arm(0, -drop),
  [S, bridgeT], [-(D + S), bridgeT], [-(D + S), -backDrop], [-D, -backDrop], [-D, 0], [0, 0],
].map(([u, y]) => [-u, y]);
const parts = [linearExtrude({ h: width }, polygon(outline))];
const yMid = -drop / 2;
if (hooks > 1 && drop >= 2 * (armT + gus + tipH) + 20) {
  const second = arm(S - 0.5, yMid);
  second.push([S - 0.5, second[second.length - 1][1]]);
  parts.push(linearExtrude({ h: width }, polygon(second.map(([u, y]) => [-u, y]))));
}
return parts.length > 1 ? union(...parts) : parts[0];
`,
};
