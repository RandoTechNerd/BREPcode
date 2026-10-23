// Everyday objects a holder, hook or clip has to fit, measured the way the
// part meets them.
//
//   round    something held across its diameter: a rolled mat, a foam roller,
//            a coiled hose. d = diameter, len = length along its axis.
//   handle   a straight shaft gripped by a clip: broom, mop, rake. d = diameter.
//   cable    a cord a clip snaps over. d = outside diameter.
//
// Rolled and coiled sizes vary with how tightly they are wound, so these are
// the loose, everyday sizes and the parts that use them leave a margin.
// Sources: common retail sizes (a standard mat is 61 cm wide, 6 mm thick;
// foam rollers are sold as 6 inch; US broom handles are 15/16 or 1-1/8 inch).

const round = (id, names, d, len, note) => ({ id, kind: "round", names, dims: { d, len }, label: names[0], note });
const handle = (id, names, d, note) => ({ id, kind: "handle", names, dims: { d }, label: names[0], note });
const cable = (id, names, d) => ({ id, kind: "cable", names, dims: { d }, label: names[0] });

export const SPECS = [
  // ---- round things
  round("yoga-mat", ["yoga mat", "yoga roll", "exercise mat", "workout mat", "pilates mat"], 150, 610,
    "a standard 6 mm yoga mat, loosely rolled (about 150 mm across, 610 mm long)"),
  round("yoga-mat-thick", ["thick yoga mat", "thick mat", "10mm mat"], 200, 610,
    "a thick 10 to 12 mm mat, rolled (about 200 mm across)"),
  round("yoga-mat-thin", ["travel yoga mat", "thin yoga mat"], 110, 610, "a thin travel mat, rolled (about 110 mm across)"),
  round("foam-roller", ["foam roller", "foam roll", "massage roller"], 152, 450, "a 6 inch foam roller (152 mm across)"),
  round("foam-roller-small", ["small foam roller", "mini foam roller"], 102, 300, "a 4 inch mini roller (102 mm across)"),
  round("towel-rolled", ["rolled towel", "towel"], 100, 600, "a rolled bath towel (about 100 mm across)"),
  round("garden-hose", ["garden hose", "hose"], 230, 60, "a coiled 15 m garden hose (hangs on a 230 mm saddle)"),
  round("extension-cord", ["extension cord", "extension lead", "power cord coil"], 180, 60, "a coiled extension cord"),
  round("paper-towel", ["paper towel roll", "kitchen roll"], 120, 280, "a paper towel roll (120 mm across, 280 mm tall)"),
  round("toilet-roll", ["toilet paper", "toilet roll", "tp roll"], 115, 100, "a toilet roll (115 mm across, 100 mm wide)"),
  round("poster-tube", ["poster tube", "rolled poster", "blueprints"], 80, 900, "a rolled poster or drawing tube"),
  round("baseball-bat", ["baseball bat", "bat"], 66, 840, "a baseball bat barrel (about 66 mm)"),
  round("water-bottle", ["water bottle", "bottle"], 75, 250, "a typical reusable bottle (75 mm across)"),
  round("soda-can", ["soda can", "drink can", "can of soda", "beer can"], 66.3, 122, "a 12 oz / 355 ml can (66 mm across)"),
  round("wine-bottle", ["wine bottle"], 76, 300, "a 750 ml wine bottle (76 mm across)"),

  // ---- handles
  handle("broom", ["broom", "broom handle", "broomstick"], 24, "a standard broom handle (15/16 inch, 24 mm)"),
  handle("mop", ["mop", "mop handle"], 24, "a mop handle (about 24 mm)"),
  handle("swiffer", ["swiffer"], 19, "a Swiffer handle (about 19 mm)"),
  handle("rake", ["rake", "garden rake", "leaf rake"], 29, "a wooden rake handle (1-1/8 inch, 29 mm)"),
  handle("shovel", ["shovel", "spade"], 32, "a shovel handle (about 32 mm)"),
  handle("hockey-stick", ["hockey stick"], 30, "a hockey stick shaft (about 30 mm)"),
  handle("umbrella", ["umbrella"], 20, "a folded umbrella shaft (about 20 mm)"),
  handle("pool-cue", ["pool cue", "cue"], 30, "a pool cue butt (about 30 mm)"),
  handle("dowel-1in", ["1 inch dowel", "closet rod"], 25.4, "a 1 inch rod (25.4 mm)"),

  // ---- cables
  cable("usb-c", ["usb c", "usb-c", "usbc cable", "phone charger", "charging cable", "charger cable"], 4),
  cable("lightning", ["lightning cable", "iphone cable"], 3.5),
  cable("micro-usb", ["micro usb"], 3.5),
  cable("hdmi", ["hdmi"], 7.5),
  cable("ethernet", ["ethernet", "cat6", "cat 6", "network cable", "lan cable"], 6),
  cable("cat5", ["cat5", "cat 5"], 5.3),
  cable("laptop-power", ["laptop charger", "laptop power", "power brick cable"], 6.5),
  cable("lamp-cord", ["lamp cord", "lamp cable"], 6),
  cable("extension-lead", ["extension cord cable", "power cord", "power cable"], 8),
  cable("audio", ["headphone cable", "aux cable", "audio cable"], 3.2),
  cable("speaker-wire", ["speaker wire"], 4.5),
];
