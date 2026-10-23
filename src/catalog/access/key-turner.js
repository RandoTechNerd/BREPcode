// A key turner: a big flat paddle that clamps the head of a key, so turning
// it takes a whole-hand twist instead of a pinch. Two identical halves, each
// with a shallow pocket for half the key's thickness; two bolts either side
// of the key head squeeze them together. Both print flat, pocket up.

export default {
  id: "key-turner",
  category: "access",
  title: "Key turner",
  summary: "a big paddle that clamps a key's head between two bolted halves, for turning keys with a weak grip.",
  print: "both halves flat as shown, pockets up, no supports. Two M3 bolts and nuts clamp the key between them.",
  names: ["key turner", "key turning aid", "key grip", "key holder for arthritis", "easy grip key holder", "key handle",
    "key lever", "key turning handle", "key grip aid", "big key holder"],
  nouns: ["turner", "grip"],
  keywords: ["key", "keys", "arthritis", "grip", "turn", "lock", "weak"],
  tips: ["for a car key", "bigger handle", "small key"],
  examples: ["I want a key turner", "a key grip for arthritis", "make me a key turner for my car key",
    "key turning aid with a 100mm handle"],
  params: {
    keyW: { default: 26, min: 15, max: 45, unit: "mm", label: "key head width", say: ["key", "head", "wide", "width"] },
    keyL: { default: 28, min: 15, max: 50, unit: "mm", label: "key head length", say: ["shank", "bow"] },
    keyT: { default: 2.6, min: 1.5, max: 6, unit: "mm", label: "key thickness", say: ["thick", "thickness"] },
    gripL: { default: 70, min: 30, max: 140, unit: "mm", label: "handle length beyond the key", say: ["handle", "long", "length", "grip"], more: ["longer", "bigger"], less: ["shorter", "smaller"] },
    gripW: { default: 55, min: 30, max: 100, unit: "mm", label: "handle width", say: ["wide", "width"], more: ["wider"] },
    halfT: { default: 5, min: 3, max: 10, unit: "mm", label: "thickness of each half", say: ["half", "plate"] },
    boltD: { default: 3.4, min: 2.5, max: 5.5, unit: "mm", label: "bolt hole diameter", say: ["bolt", "screw"] },
  },
  things: [
    { names: ["house key turner", "door key turner", "front door key holder"], title: "House key turner" },
    { names: ["car key turner", "car key holder for arthritis", "ignition key turner"], title: "Car key turner",
      params: { keyW: 32, keyL: 36, keyT: 3.2, gripL: 80 } },
    { names: ["small key turner", "padlock key turner", "mailbox key turner", "locker key turner"], title: "Small key turner",
      params: { keyW: 18, keyL: 18, keyT: 2, gripL: 55, gripW: 45 } },
  ],
  body: `
// one half, lying flat: x runs from the key's tip end along the handle, y across
const m = boltD / 2 + 3;                         // room for a bolt beside the key head
const W0 = keyW + 2 * (2 * m);                   // width at the key end
const L = keyL + gripL;
const r = Math.min(14, gripW / 4);
const half = () => {
  const plate = hull(
    translate([0, -W0 / 2, 0], cube([1, W0, halfT])),
    ...[-1, 1].map((s) => translate([L - r, s * (gripW / 2 - r), 0], cylinder({ r, h: halfT, $fn: 32 }))));
  const pocket = translate([-1, -(keyW + 0.8) / 2, halfT - keyT / 2 - 0.2], cube([keyL + 1, keyW + 0.8, keyT]));
  const holes = [-1, 1].map((s) => translate([keyL * 0.55, s * (keyW / 2 + 0.4 + m), -1], cylinder({ r: boltD / 2, h: halfT + 2, $fn: 20 })));
  const hang = translate([L - r, 0, -1], cylinder({ r: Math.min(4, r / 2), h: halfT + 2, $fn: 20 }));
  return difference(plate, pocket, ...holes, hang);
};
const pitch = Math.max(W0, gripW) + 8;
return translate([-L / 2, -pitch / 2, 0], group(half(), translate([0, pitch, 0], half())));
`,
};
