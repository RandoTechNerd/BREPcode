// Catalog category: home. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the home category alone, so parallel work on other
// categories never touches it.

import furnitureFoot from "./furniture-foot.js";
import legCap from "./leg-cap.js";
import bedRiser from "./bed-riser.js";
import cabinetKnob from "./cabinet-knob.js";
import drawerPull from "./drawer-pull.js";
import doorWedge from "./door-wedge.js";
import shelfPin from "./shelf-pin.js";
import wallPlate from "./wall-plate.js";
import rodBracket from "./rod-bracket.js";
import doorBumper from "./door-bumper.js";
import spacer from "./spacer.js";
import holePlug from "./hole-plug.js";
import barrelHinge from "./barrel-hinge.js";

export const FAMILIES = [furnitureFoot, legCap, bedRiser, cabinetKnob, drawerPull, doorWedge, shelfPin,
  wallPlate, rodBracket, doorBumper, spacer, holePlug, barrelHinge];

// Real objects the home families are sized for.
//
//   leg        a chair, table or furniture leg end a cap or riser fits: d =
//              diameter (or side, with sq: 1 for a square tube).
//   rod        a curtain rod or closet pole a bracket or S hook holds: d.
//              US rods are 5/8, 3/4, 1, 1-1/8 and 1-3/8 inch; European poles
//              16, 19, 20, 25, 28 and 35 mm; wooden closet poles 1-5/16 inch.
//   pin-hole   a shelf-pin hole: the 32 mm cabinet system (and IKEA) drills
//              5 mm, American cabinets often 1/4 inch.
//   screw      a machine screw or bolt a knob, spacer or foot takes: d =
//              nominal diameter. Cabinet knobs use 8-32 (US) or M4 (Europe);
//              furniture legs M8 or 5/16 inch hanger bolts.

const leg = (id, names, d, note, sq) => ({ id, kind: "leg", names, dims: sq ? { d, sq: 1 } : { d }, label: names[0], note });
const rod = (id, names, d, note) => ({ id, kind: "rod", names, dims: { d }, label: names[0], note });
const screw = (id, names, d, note) => ({ id, kind: "screw", names, dims: { d }, label: names[0], note });

export const SPECS = [
  leg("leg-tube-22", ["metal chair leg", "folding chair leg", "22mm tube", "22 mm tube", "22mm chair leg"], 22.2,
    "a 7/8 inch (22 mm) round chair tube"),
  leg("leg-tube-25", ["1 inch tube", "25mm tube", "25 mm tube", "1 inch chair leg", "round tube leg"], 25.4, "a 1 inch (25.4 mm) round tube"),
  leg("leg-tube-19", ["19mm tube", "19 mm tube", "three quarter inch tube"], 19.05, "a 3/4 inch (19 mm) round tube"),
  leg("leg-square-25", ["1 inch square tube", "25mm square tube", "square tube leg", "square chair leg"], 25.4,
    "a 1 inch (25.4 mm) square tube", true),
  leg("leg-wood-chair", ["wooden chair leg", "wood chair leg", "dining chair leg"], 35,
    "a wooden chair leg (about 35 mm; measure yours, they run 30 to 40)"),
  leg("leg-bed", ["bed frame leg", "bed post", "bed leg end"], 50, "a bed leg (about 50 mm; measure yours)"),

  rod("rod-curtain", ["curtain rod", "curtain pole", "drapery rod", "drape rod"], 25.4,
    "a 1 inch (25.4 mm) curtain rod, the common decorative size"),
  rod("rod-cafe", ["cafe rod", "cafe curtain rod", "sash rod", "16mm curtain rod", "16mm pole", "16 mm pole"], 16, "a 16 mm (5/8 inch) cafe rod"),
  rod("rod-19", ["19mm curtain rod", "19mm pole", "19 mm pole", "three quarter inch curtain rod"], 19, "a 19 mm (3/4 inch) rod"),
  rod("rod-28", ["28mm curtain pole", "28mm pole", "28 mm pole", "28mm curtain rod"], 28, "a 28 mm curtain pole"),
  rod("rod-35", ["35mm curtain pole", "35mm pole", "35 mm pole", "heavy curtain pole"], 35, "a 35 mm (1-3/8 inch) heavy pole"),
  rod("closet-rod-wood", ["wooden closet rod", "closet pole", "wood closet pole", "wardrobe rail", "clothes rail"], 33.3,
    "a wooden closet pole, 1-5/16 inch (33 mm)"),

  { id: "shelf-hole-5", kind: "pin-hole", names: ["5mm shelf hole", "5 mm shelf hole", "ikea shelf", "ikea bookcase", "billy bookcase", "euro shelf hole"],
    dims: { d: 5 }, label: "5 mm shelf-pin hole", note: "a 5 mm shelf-pin hole (32 mm system, IKEA)" },
  { id: "shelf-hole-quarter", kind: "pin-hole", names: ["quarter inch shelf hole", "american shelf hole", "6mm shelf hole"],
    dims: { d: 6.35 }, label: "1/4 inch shelf-pin hole", note: "a 1/4 inch (6.35 mm) shelf-pin hole" },

  screw("screw-m3", ["m3 screw", "m3 bolt", "m 3 screw"], 3, "an M3 screw"),
  screw("screw-m4", ["m4 screw", "m4 bolt", "m 4 screw"], 4, "an M4 screw (the European cabinet-knob screw)"),
  screw("screw-m5", ["m5 screw", "m5 bolt"], 5, "an M5 screw"),
  screw("screw-m6", ["m6 screw", "m6 bolt"], 6, "an M6 bolt"),
  screw("screw-m8", ["m8 screw", "m8 bolt", "m8 hanger bolt", "m8 threaded rod"], 8, "an M8 bolt (common furniture-leg thread)"),
  screw("screw-8-32", ["8-32 screw", "8 32 screw", "8-32 bolt", "knob screw", "cabinet knob screw"], 4.17,
    "an 8-32 machine screw (the US cabinet-knob screw)"),
  screw("screw-quarter-20", ["1/4-20 bolt", "1/4-20 screw", "quarter inch bolt"], 6.35, "a 1/4-20 bolt"),
  screw("screw-5-16", ["5/16 bolt", "5/16 hanger bolt", "five sixteenths bolt"], 7.94, "a 5/16 inch bolt (US furniture-leg thread)"),
];
