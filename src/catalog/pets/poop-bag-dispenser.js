// A dog waste bag dispenser: an upright tube with a closed bottom that the
// refill roll drops into, a slot down the side the bags pull out through, a
// fin with a strap window so it threads onto a leash, and a push-fit cap
// printed beside it. The strap window is tall and narrow, so its roof is only
// the strap's thickness across: a bridge a few millimetres long.

export default {
  id: "poop-bag-dispenser",
  category: "pets",
  title: "Poop bag dispenser",
  summary: "a tube for a refill roll of dog waste bags, with a pull-out slot, a leash loop and a push-fit cap.",
  print: "upright as shown, cap beside it, no supports. PETG takes knocks and cold best.",
  names: ["poop bag dispenser", "poop bag holder", "dog bag dispenser", "waste bag dispenser", "doggie bag holder",
    "dog poop bag holder", "pet waste bag dispenser", "dog waste bag holder", "poo bag holder", "poop bag carrier", "dog bag holder"],
  nouns: ["dispenser", "holder", "carrier"],
  keywords: ["poop", "poo", "bag", "leash", "dog", "waste", "walk"],
  fits: ["bag-roll"],
  fromSpec: (s) => ({ rollD: s.dims.d, rollL: s.dims.len }),
  specNote: "with room to spare; rolls vary, measure yours",
  tips: ["for a 1 inch leash", "40 mm roll", "no leash loop", "looser cap"],
  examples: ["I want a poop bag dispenser", "make me a poop bag holder for my leash",
    "dog bag dispenser for a 1 inch leash", "waste bag dispenser with no leash loop"],
  params: {
    rollD: { default: 33, min: 20, max: 60, unit: "mm", label: "bag roll diameter", say: ["roll", "diameter", "across"], more: ["bigger", "wider"], less: ["smaller", "slimmer"] },
    rollL: { default: 58, min: 30, max: 120, unit: "mm", label: "bag roll length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    fit: { default: 1.5, min: 0.5, max: 4, unit: "mm", label: "room around the roll", say: ["room", "clearance"] },
    wall: { default: 2, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall", "thick"], more: ["stronger", "sturdier"] },
    slotW: { default: 4, min: 2, max: 10, unit: "mm", label: "width of the slot the bags pull through", say: ["slot", "opening"] },
    loop: { default: "leash", unit: "choice", choices: ["leash", "none"], label: "leash loop on the side, or none",
      words: { none: ["no leash loop", "no loop", "without a loop", "without loop", "no strap", "no leash"], leash: ["leash loop", "loop", "strap"] } },
    strapW: { default: 26, min: 10, max: 50, unit: "mm", label: "leash or strap width the loop takes", say: ["strap", "leash", "belt", "webbing"] },
    strapT: { default: 5, min: 3, max: 12, unit: "mm", label: "room for the strap's thickness", say: ["strap"] },
    capFit: { default: 0.25, min: 0.1, max: 0.8, unit: "mm", label: "cap clearance per side (more = looser)", say: ["fit", "tolerance", "cap"], more: ["looser"], less: ["tighter"] },
  },
  bridgeArea: (v) => (v.loop === "leash" ? v.strapT * Math.max(4, v.wall * 2) : 0) + v.slotW * v.wall,
  things: [
    { names: ["leash bag holder", "leash poop bag holder", "leash bag dispenser", "leash waste bag holder", "poop bag leash attachment"],
      title: "Leash bag holder (3/4 inch leash)", params: { strapW: 21, strapT: 5 } },
    { names: ["slim poop bag holder", "mini poop bag holder", "small poop bag dispenser", "compact poop bag holder"],
      title: "Slim poop bag holder", params: { fit: 1, wall: 1.6, strapW: 18, strapT: 4, slotW: 3.5 } },
    { names: ["belt poop bag holder", "belt bag dispenser", "belt poop bag dispenser", "waist bag holder", "backpack strap bag holder"],
      title: "Belt poop bag holder", params: { strapW: 42, strapT: 6, wall: 2.4 } },
    { names: ["jumbo poop bag dispenser", "large roll bag dispenser", "large poop bag dispenser", "big poop bag holder"],
      title: "Large-roll bag dispenser", params: { rollD: 42, rollL: 68, wall: 2.4 } },
    { names: ["poop bag canister", "car poop bag dispenser", "poop bag case", "bag roll case", "poop bag tube"],
      title: "Poop bag canister (no loop)", params: { loop: "none" } },
  ],
  body: `
const Ri = rollD / 2 + fit, Ro = Ri + wall;
const floorT = Math.max(1.6, wall);
const lipD = Math.min(8, Math.max(4, rollD * 0.18));      // how far the cap plugs in
const H = floorT + rollL + 2 * fit + lipD + 1;
const can = revolve(360, polygon([[0, 0], [Ro, 0], [Ro, H], [Ri, H], [Ri, floorT], [0, floorT]]));
const parts = [can];
const cuts = [];
// the slot the bags pull out of, down the +x side
const z0 = floorT + 2, z1 = Math.min(floorT + rollL, H - lipD - 3);
cuts.push(translate([Ri - 1, -slotW / 2, z0], cube([wall + 2, slotW, z1 - z0])));
if (loop === "leash") {
  // a fin on the -x side with a tall window the strap threads through
  const finT = Math.max(4, wall * 2), border = 4;
  const finH = Math.min(H, strapW + 2 * border);
  const xWin = Ro + 0.8;                                   // keep a web between window and tube
  const finOut = xWin + strapT + border;
  parts.push(translate([-finOut, -finT / 2, 0], cube([finOut - Ri - wall / 2, finT, finH])));
  cuts.push(translate([-(xWin + strapT), -finT / 2 - 1, border], cube([strapT, finT + 2, finH - 2 * border])));
}
const dispenser = difference(union(...parts), ...cuts);
// the cap, upside down beside it: a disc a little wider than the tube, and a plug ring
const capT = Math.max(2, wall), ro = Ri - capFit, ri = ro - 1.6;
const cap = revolve(360, polygon([[0, 0], [Ro + 1, 0], [Ro + 1, capT], [ro, capT], [ro, capT + lipD], [ri, capT + lipD], [ri, capT], [0, capT]]));
return group(dispenser, translate([0, 2 * Ro + 8, 0], cap));
`,
};
