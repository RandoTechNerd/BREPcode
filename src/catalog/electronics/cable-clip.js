// A row of snap-in cable clips on a flat base. Each clip is a ring with its
// top cut open narrower than the cable, so the cable pushes in past the
// mouth and stays. Flat bottom for adhesive tape, or screw tabs at the ends.

export default {
  id: "cable-clip",
  category: "electronics",
  title: "Cable clip",
  summary: "a row of snap-in clips that hold cables along a desk edge or wall.",
  print: "upright as shown; small rings print fine without supports.",
  names: ["cable clip", "cable organizer", "cable holder", "cord clip", "cord organizer", "wire clip",
    "cable management clip", "desk cable clip", "cable tidy", "cord holder", "charger holder", "cable keeper"],
  nouns: ["clip", "organizer", "tidy", "keeper"],
  keywords: ["cable", "cord", "wire", "desk", "charger", "management"],
  fits: ["cable"],
  primary: "cableD",
  fromSpec: (s) => ({ cableD: s.dims.d }),
  tips: ["for 5 cables", "6 mm cable", "with screw holes"],
  examples: ["make me a cable clip for 3 cables", "cable organizer for usb c cables",
    "desk cable clip for 4 cords with screw holes", "ethernet cable clip"],
  params: {
    cableD: { default: 4, min: 1.5, max: 16, unit: "mm", label: "cable diameter", say: ["cable", "cord", "wire", "diameter", "thick"] },
    count: { default: 3, min: 1, max: 10, unit: "count", label: "how many cables", say: ["cable", "cord", "wire", "slot", "clip", "charger"] },
    clipWall: { default: 1.6, min: 1.2, max: 3, unit: "mm", label: "clip wall thickness", say: ["wall", "stiff"] },
    depth: { default: 10, min: 5, max: 30, unit: "mm", label: "clip length along the cable", say: ["deep", "long", "length"] },
    mount: { default: "tape", unit: "choice", choices: ["tape", "screw"], label: "how it fixes on",
      words: { screw: ["screw", "screws", "screw hole", "nail"], tape: ["tape", "adhesive", "sticky", "command strip", "stick on"] } },
  },
  things: [
    { names: ["usb cable clip", "charger cable clip", "charging cable organizer", "phone charger holder"], title: "Charger cable clip", spec: "usb-c", params: { count: 3 } },
    { names: ["ethernet cable clip", "network cable clip", "lan cable clip"], title: "Ethernet cable clip", spec: "ethernet", params: { count: 2 } },
    { names: ["hdmi cable clip"], title: "HDMI cable clip", spec: "hdmi", params: { count: 2 } },
    { names: ["power cord clip", "power cable clip"], title: "Power cord clip", spec: "extension-lead", params: { count: 1, mount: "screw" } },
    { names: ["nightstand cable clip", "bedside cable holder"], title: "Bedside cable clip", spec: "usb-c", params: { count: 2 } },
    { names: ["speaker wire clip", "speaker cable clip"], title: "Speaker wire clip", spec: "speaker-wire", params: { count: 2, mount: "screw" } },
    { names: ["laptop charger clip", "laptop cable clip", "laptop cord clip"], title: "Laptop charger clip", spec: "laptop-power", params: { count: 1 } },
    { names: ["lamp cord clip", "lamp cable clip", "light cord clip"], title: "Lamp cord clip", spec: "lamp-cord", params: { count: 1, mount: "screw" } },
    { names: ["headphone cable clip", "aux cable clip", "audio cable clip"], title: "Audio cable clip", spec: "audio", params: { count: 2 } },
    { names: ["lightning cable clip", "iphone cable clip"], title: "Lightning cable clip", spec: "lightning", params: { count: 3 } },
    { names: ["single cable clip", "single cord clip", "single wire clip"], title: "Single cable clip", params: { count: 1 } },
  ],
  body: `
const r = cableD / 2 + 0.2;                     // snug round the cable
const ro = r + clipWall;
const pitch = 2 * ro + 1.5;
const tab = mount === "screw" ? 12 : 0;         // a screw tab at each end
const span = count * pitch + 2 * tab + 2;
const base = Math.max(2, clipWall);             // the strip the clips stand on
const mouth = cableD * 0.75;                    // narrower than the cable: it snaps in
const zc = Math.max(base + r, ro);              // ring centre: never through the bottom
const xs = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * pitch);
// each ring, plus a block under it: the ring's underside just above the base
// would otherwise be a ledge too steep to print
const rings = xs.flatMap((x) => [
  translate([x, 0, zc], rotate([90, 0, 0], cylinder({ r: ro, h: depth, center: true, $fn: 48 }))),
  translate([x - 0.72 * ro, -depth / 2, 0], cube([1.44 * ro, depth, zc])),
]);
const cuts = xs.flatMap((x) => [
  translate([x, 0, zc], rotate([90, 0, 0], cylinder({ r, h: depth + 2, center: true, $fn: 48 }))),
  translate([x - mouth / 2, -depth / 2 - 1, zc], cube([mouth, depth + 2, ro + 1])),
]);
if (tab) {
  for (const s of [-1, 1]) {
    const x = s * (span / 2 - tab / 2 - 1);
    cuts.push(translate([x, 0, -1], cylinder({ r: 1.75, h: base + 2, $fn: 20 })));
    cuts.push(translate([x, 0, base - 1.5 + 0.02], cylinder({ r1: 1.75, r2: 3.25, h: 1.5, $fn: 20 })));
  }
}
return difference(union(translate([-span / 2, -depth / 2, 0], cube([span, depth, base])), ...rings), ...cuts);
`,
};
