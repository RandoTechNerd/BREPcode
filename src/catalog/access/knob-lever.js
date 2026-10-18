// Turns a round knob into a lever: a ring that clamps round a door knob,
// tap or stove knob, and a long tapering arm you can push with a palm or an
// elbow. The arm is split from the bore for a short way and a bolt across
// the split pinches the ring tight. One flat shape, printed lying down.

export default {
  id: "knob-lever",
  category: "access",
  title: "Door knob lever",
  summary: "a clamp-on lever for a round door knob, tap or stove knob, turned with a push instead of a grip.",
  print: "flat as shown, no supports. An M4 bolt and nut across the split pinch it onto the knob; a strip of rubber inside helps it grip.",
  names: ["door knob lever", "door knob adapter", "door knob turner", "knob to lever converter", "doorknob lever", "knob lever adapter",
    "door knob extender", "knob turner", "door knob lever adapter", "lever for door knob"],
  nouns: ["lever", "turner", "adapter"],
  keywords: ["knob", "door", "tap", "faucet", "stove", "arthritis", "turn", "grip"],
  fits: ["knob"],
  primary: "knobD",
  fromSpec: (s) => ({ knobD: s.dims.d }),
  ask: { unless: ["knobD"], text: "How big is the knob across its widest part? I made the ring for 56 mm, a typical door knob." },
  tips: ["for a 60 mm knob", "longer lever", "for a faucet knob"],
  examples: ["I want a door knob lever", "a lever for my door knob 60mm across",
    "tap turner for a faucet knob", "make me a stove knob turner"],
  params: {
    knobD: { default: 56, min: 15, max: 90, unit: "mm", label: "knob diameter", say: ["knob", "diameter", "across", "ring"] },
    leverL: { default: 100, min: 40, max: 180, unit: "mm", label: "lever length", say: ["lever", "long", "length", "arm"], more: ["longer"], less: ["shorter"] },
    ringH: { default: 22, min: 8, max: 45, unit: "mm", label: "ring height", say: ["tall", "high", "height", "thick"] },
    wall: { default: 5, min: 3, max: 10, unit: "mm", label: "ring wall", say: ["wall"], more: ["sturdier", "stronger"] },
    leverW: { default: 22, min: 12, max: 40, unit: "mm", label: "lever end width", say: ["wide", "width"], more: ["wider"] },
    boltD: { default: 4.4, min: 3, max: 6.5, unit: "mm", label: "clamp bolt hole", say: ["bolt", "screw"] },
  },
  things: [
    { names: ["faucet knob turner", "tap turner", "faucet lever adapter", "tap handle lever", "faucet turner", "tap lever adapter", "tap lever", "faucet lever"],
      title: "Tap turner", spec: "knob-faucet", params: { leverL: 80, ringH: 18 } },
    { names: ["stove knob turner", "oven knob turner", "cooker knob turner", "stove knob lever"], title: "Stove knob turner", spec: "knob-stove",
      params: { leverL: 70, ringH: 14, wall: 4 } },
    { names: ["radiator valve turner", "radiator knob lever", "radiator valve lever"], title: "Radiator valve turner", spec: "knob-radiator",
      params: { leverL: 80, ringH: 20 } },
    { names: ["lamp knob turner", "small knob turner", "lamp switch lever"], title: "Lamp knob turner", spec: "knob-lamp",
      params: { leverL: 50, ringH: 10, wall: 3, leverW: 14, boltD: 3.4 } },
  ],
  body: `
// lying flat: x runs out along the lever from the knob's centre
const rb = knobD / 2 + 0.4;                      // the bore
const Ro = rb + wall;
const tipR = leverW / 2;
const armH = Math.min(ringH, Math.max(10, ringH * 0.7));   // the arm tapers down toward its end
const paddle = hull(cylinder({ r: Ro, h: ringH, $fn: 64 }), translate([Ro + leverL - tipR, 0, 0], cylinder({ r: tipR, h: armH, $fn: 32 })));
// the split, and a bolt across it to close the ring on the knob
const xb = Ro + boltD / 2 + 3;
const split = translate([0, -1, -1], cube([xb + boltD / 2 + 6, 2, ringH + 2]));
const bolt = translate([xb, Ro + 1, ringH / 2], rotate([90, 0, 0], cylinder({ r: boltD / 2, h: 2 * Ro + 2, $fn: 20 })));
return translate([-(Ro + leverL - Ro) / 2, 0, 0], difference(paddle, translate([0, 0, -1], cylinder({ r: rb, h: ringH + 2, $fn: 64 })), split, bolt));
`,
};
