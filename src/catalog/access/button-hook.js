// A button hook: a fat handle with a thin wire loop on the end that goes
// through the buttonhole, catches the button and pulls it back through, and
// (optionally) a small hook on the other end for a zip pull. Printed flat:
// the handle is thick and the loop is thin, so it is two flat shapes joined
// where the loop runs into the handle.

export default {
  id: "button-hook",
  category: "access",
  title: "Button hook",
  summary: "a fat-handled button hook with a thin wire loop, and a zip hook on the other end.",
  print: "flat as shown, no supports. PETG is tougher than PLA for the thin loop.",
  names: ["button hook", "button aid", "buttoning aid", "button hook aid", "button helper", "dressing aid", "button and zipper aid",
    "button hook with zipper pull", "button threader", "button puller"],
  nouns: ["hook", "aid"],
  keywords: ["button", "buttons", "dressing", "shirt", "zipper", "arthritis", "dexterity"],
  tips: ["longer handle", "no zip hook", "thicker loop"],
  examples: ["I want a button hook", "a buttoning aid with a zipper hook",
    "button hook with a 150mm handle", "dressing aid for shirt buttons"],
  params: {
    handleL: { default: 110, min: 60, max: 200, unit: "mm", label: "handle length", say: ["handle", "long", "length"], more: ["longer"], less: ["shorter"] },
    gripW: { default: 24, min: 14, max: 40, unit: "mm", label: "handle width", say: ["wide", "width", "fat"], more: ["fatter", "wider"] },
    gripT: { default: 14, min: 8, max: 25, unit: "mm", label: "handle thickness", say: ["thick", "thickness"], more: ["thicker"] },
    loopL: { default: 34, min: 20, max: 50, unit: "mm", label: "loop length", say: ["loop"] },
    loopW: { default: 14, min: 8, max: 24, unit: "mm", label: "loop width", say: ["loop width"] },
    wireT: { default: 2.6, min: 1.8, max: 4, unit: "mm", label: "loop wire thickness", say: ["wire"], more: ["stronger"] },
    zip: { default: "yes", unit: "choice", choices: ["no", "yes"], label: "zip hook on the other end",
      words: { no: ["no zip hook", "without zip hook", "without zipper hook", "no zipper hook", "button only"], yes: ["zip hook", "zipper hook", "zipper", "zip"] } },
  },
  things: [
    { names: ["long button hook", "long handled button hook", "button hook with long handle"], title: "Long button hook", params: { handleL: 180 } },
    { names: ["kids button hook", "small button hook", "child button hook"], title: "Small button hook",
      params: { handleL: 80, gripW: 18, gripT: 11, loopL: 26, loopW: 11 } },
    { names: ["zipper hook", "zip hook", "zipper puller hook", "back zipper hook"], title: "Zipper hook", params: { zip: "yes", handleL: 140 } },
    { names: ["button hook only", "plain button hook", "button hook without zip"], title: "Plain button hook", params: { zip: "no" } },
  ],
  body: `
// lying flat: x runs from the zip-hook end to the loop's tip, y across
const r = gripW / 2;
const grip = hull(translate([r, 0, 0], cylinder({ r, h: gripT, $fn: 40 })), translate([handleL - r, 0, 0], cylinder({ r, h: gripT, $fn: 40 })));
// the loop: a teardrop of wire running back into the end of the handle
const tipX = handleL + loopL - loopW / 2;
const outer = hull(translate([handleL - r, 0, 0], cylinder({ r: Math.min(r, loopW / 2), h: wireT, $fn: 24 })),
  translate([tipX, 0, 0], cylinder({ r: loopW / 2, h: wireT, $fn: 40 })));
const eye = hull(translate([handleL + 3, 0, -1], cylinder({ r: 0.8, h: wireT + 2, $fn: 12 })),
  translate([tipX, 0, -1], cylinder({ r: loopW / 2 - wireT, h: wireT + 2, $fn: 40 })));
const parts = [grip, difference(outer, eye)];
if (zip === "yes") {
  // a small open ring off the far end of the handle, for a zip pull
  const zr = 7, zt = Math.min(4, gripT);
  parts.push(difference(
    hull(translate([2, 0, 0], cylinder({ r: zr * 0.6, h: zt, $fn: 24 })), translate([-zr + 1, 0, 0], cylinder({ r: zr, h: zt, $fn: 32 }))),
    translate([-zr + 1, 0, -1], cylinder({ r: zr - 2.6, h: zt + 2, $fn: 32 })),
    translate([-zr + 1, -zr - 1, -1], cube([2.4, zr + 1, zt + 2]))));
}
return translate([-(handleL + loopL) / 2, 0, 0], union(...parts));
`,
};
