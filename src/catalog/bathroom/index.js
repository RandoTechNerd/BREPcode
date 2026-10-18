// Catalog category: bathroom. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the bathroom category alone, so parallel work on other
// categories never touches it.

import toothbrushStand from "./toothbrush-stand.js";
import toothbrushRack from "./toothbrush-rack.js";
import soapDish from "./soap-dish.js";
import toothpasteSqueezer from "./toothpaste-squeezer.js";
import toiletRollHolder from "./toilet-roll-holder.js";
import rollStand from "./roll-stand.js";
import wallRingHolder from "./wall-ring-holder.js";
import swabJar from "./swab-jar.js";
import drainStrainer from "./drain-strainer.js";
import mirrorClip from "./mirror-clip.js";
import showerShelf from "./shower-shelf.js";
import showerCurtainRing from "./shower-curtain-ring.js";

export const FAMILIES = [toothbrushStand, toothbrushRack, soapDish, toothpasteSqueezer, toiletRollHolder, rollStand,
  wallRingHolder, swabJar, drainStrainer, mirrorClip, showerShelf, showerCurtainRing];

// Real bathroom objects, measured the way the part meets them. Most of these
// vary from brand to brand, so each note says "about" and asks for a quick
// measurement; the parts leave a margin around them.
//
//   soap        a bar (or sponge) a dish holds: w x d x h
//   toothbrush  a handle or brush head a hole holds: d = its widest part
//   drain       a drain a strainer sits in: d = the opening the cup drops into, rim = the flange it rests on
//   mirror      a sheet a clip holds by its edge: t = thickness
//   rod         a rod a ring hangs on: d = diameter
//   core        the cardboard core a roll slides on by: d = inside diameter
//   collar      a tool that hangs nose-down in a tapered ring: top / bottom = the ring that holds it, gap = room for a hose
//   swab        a cotton swab: len, d (for the swab canister's height)
const soap = (id, names, w, d, h, note) => ({ id, kind: "soap", names, dims: { w, d, h }, label: names[0], note });
const brush = (id, names, d, note) => ({ id, kind: "toothbrush", names, dims: { d }, label: names[0], note });
const drain = (id, names, d, rim, note) => ({ id, kind: "drain", names, dims: { d, rim }, label: names[0], note });
const sheet = (id, names, t, note) => ({ id, kind: "mirror", names, dims: { t }, label: names[0], note });
const collar = (id, names, dims, note) => ({ id, kind: "collar", names, dims, label: names[0], note });

export const SPECS = [
  // ---- soap and sponges
  soap("bath-soap-bar", ["bar of soap", "soap bar", "bar soap", "bath soap bar"], 90, 60, 25,
    "a standard bath bar of soap (about 90 x 60 x 25 mm; bars vary, so measure yours)"),
  soap("bath-shampoo-bar", ["shampoo bar", "conditioner bar"], 70, 70, 25,
    "a round shampoo bar (about 70 mm across; measure yours)"),
  { id: "bath-kitchen-sponge", kind: "soap", names: ["kitchen sponge", "dish sponge", "scrub sponge"], dims: { w: 110, d: 70, h: 30 },
    label: "kitchen sponge", note: "a kitchen scrub sponge (about 110 x 70 x 30 mm)" },

  // ---- toothbrushes
  brush("bath-electric-toothbrush", ["electric toothbrush", "oral b", "oral b handle", "sonicare", "sonicare handle", "electric toothbrush handle"], 31,
    "an electric toothbrush handle (Oral-B and Sonicare handles are about 28 to 32 mm across at the base; measure yours)"),
  brush("bath-toothbrush-head", ["toothbrush head", "brush head", "oral b head", "oral b brush head", "sonicare head", "sonicare brush head",
    "electric toothbrush head", "replacement head"], 10.5,
    "an electric toothbrush replacement head (about 10 to 12 mm across at its base)"),
  brush("bath-manual-toothbrush", ["manual toothbrush", "regular toothbrush", "toothbrush handle"], 14,
    "a manual toothbrush handle (about 12 to 15 mm at its widest)"),

  // ---- drains
  drain("bath-kitchen-sink-drain", ["kitchen sink drain", "kitchen drain", "kitchen sink basket"], 80, 112,
    "a US kitchen sink drain (a 3.5 in / 89 mm sink hole; the basket seat inside is about 80 mm across; measure yours)"),
  drain("bath-bathroom-sink-drain", ["bathroom sink drain", "vanity drain", "lavatory drain", "bathroom drain"], 31, 46,
    "a bathroom sink drain (about 1.25 in / 32 mm inside; measure yours)"),
  drain("bath-tub-drain", ["bathtub drain", "tub drain", "bath drain", "bath tub drain"], 38, 70,
    "a bathtub drain (about 1.5 in / 38 mm open inside a 2.75 in / 70 mm flange; measure yours)"),
  drain("bath-shower-drain", ["shower drain", "shower floor drain"], 50, 105,
    "a round shower drain (a 2 in / 50 mm pipe under a cover about 4 in / 105 mm across; measure yours)"),
  drain("bath-floor-drain", ["floor drain", "basement drain", "utility drain"], 90, 130,
    "a floor drain (about 90 mm open, 130 mm across the grate; measure yours)"),

  // ---- mirror and sheet thicknesses
  sheet("bath-mirror-3mm", ["3 mm mirror", "3mm mirror", "eighth inch mirror", "1/8 inch mirror"], 3.2,
    "a 1/8 in (3 mm) mirror"),
  sheet("bath-mirror-4mm", ["4 mm mirror", "4mm mirror", "5/32 inch mirror"], 4, "a 4 mm mirror"),
  sheet("bath-mirror-5mm", ["5 mm mirror", "5mm mirror", "3/16 inch mirror"], 5, "a 5 mm (3/16 in) mirror"),
  sheet("bath-mirror-6mm", ["6 mm mirror", "6mm mirror", "quarter inch mirror", "1/4 inch mirror"], 6.35,
    "a 1/4 in (6 mm) mirror, the usual bathroom mirror"),
  sheet("bath-acrylic-sheet", ["acrylic sheet", "plexiglass sheet", "plexiglass", "acrylic panel", "perspex sheet"], 3,
    "a 3 mm (1/8 in) acrylic sheet (sheets also come 2, 4.5 and 6 mm; measure yours)"),
  sheet("bath-glass-panel", ["glass panel", "glass sheet", "glass pane"], 6,
    "a 6 mm glass panel (panels run 4 to 10 mm; measure yours)"),

  // ---- rods and roll cores
  { id: "bath-shower-rod", kind: "rod", names: ["shower rod", "shower curtain rod", "curved shower rod", "shower curtain pole", "bathtub rod"],
    dims: { d: 25.4 }, label: "shower rod", note: "a standard 1 in (25.4 mm) shower rod (some are 3/4 or 1-1/4 in; measure yours)" },
  { id: "bath-toilet-roll-core", kind: "core", names: ["toilet roll core", "toilet paper core", "toilet paper tube", "toilet roll tube"],
    dims: { d: 42 }, label: "toilet roll core", note: "a toilet roll's cardboard core (about 40 to 45 mm inside; measure yours)" },
  { id: "bath-paper-towel-core", kind: "core", names: ["paper towel core", "paper towel tube", "kitchen roll core"],
    dims: { d: 42 }, label: "paper towel core", note: "a paper towel roll's core (about 40 to 45 mm inside; measure yours)" },

  // ---- tools that hang nose-down in a ring
  collar("bath-hair-dryer", ["hair dryer", "blow dryer", "hairdryer", "hair drier"], { top: 74, bottom: 56 },
    "a hair dryer, nose down (the barrel is about 65 to 75 mm across, the nozzle about 50 mm; measure yours)"),
  collar("bath-curling-iron", ["curling iron", "curling wand", "curling tong"], { top: 40, bottom: 30 },
    "a curling iron, barrel down (barrels are about 19 to 32 mm; the handle rests on the ring)"),
  collar("bath-flat-iron", ["flat iron", "hair straightener", "straightener", "straightening iron"], { top: 46, bottom: 36 },
    "a closed flat iron (about 30 x 25 mm across the plates; measure yours)"),
  collar("bath-shower-head", ["handheld shower head", "hand shower", "shower head", "shower wand", "shower sprayer"], { top: 34, bottom: 26, gap: 17 },
    "a handheld shower head (handles are about 25 to 30 mm; the hose is about 15 mm; measure yours)"),
  collar("bath-spray-bottle", ["spray bottle", "trigger spray bottle"], { top: 34, bottom: 30, gap: 25 },
    "a trigger spray bottle, hung by its neck (necks are about 28 mm; measure yours)"),
  collar("bath-hair-brush", ["hair brush", "hairbrush", "paddle brush", "round brush"], { top: 36, bottom: 26 },
    "a hair brush, handle down (handles are about 20 to 30 mm thick; measure yours)"),

  // ---- swabs
  { id: "bath-cotton-swab", kind: "swab", names: ["cotton swab", "q tip", "qtip", "cotton bud"], dims: { len: 76, d: 6 },
    label: "cotton swab", note: "cotton swabs (about 76 mm / 3 in long)" },
];
