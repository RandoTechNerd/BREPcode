// Catalog category: decor. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the decor category alone, so parallel work on other
// categories never touches it.

import vase from "./vase.js";
import candleHolder from "./candle-holder.js";
import coaster from "./coaster.js";
import ornament from "./ornament.js";
import napkinRing from "./napkin-ring.js";
import cardStand from "./card-stand.js";
import trinketDish from "./trinket-dish.js";
import hexShelf from "./hex-shelf.js";
import christmasTree from "./christmas-tree.js";
import lampShade from "./lamp-shade.js";
import lightClip from "./light-clip.js";

export const FAMILIES = [vase, candleHolder, coaster, ornament, napkinRing, cardStand, trinketDish,
  hexShelf, christmasTree, lampShade, lightClip];

// Real objects the decor families are sized for.
//
//   candle      d = diameter at the base, h = height, cup = how deep a holder's
//               cup should be for it. A tealight is 38 mm across in its metal
//               cup; US tapers are 7/8 inch at the base; pillars are sold by
//               inch (2, 3); Hanukkah candles are about 10 mm.
//   card        something that stands in a slot: w x h, t = thickness.
//               Photo paper is about 0.3 mm, card stock 0.4, instant film 1.
//   lampholder  the hole a shade's fitter ring needs: an E27/E26 holder's
//               shade-ring thread is about 40 mm, an E14's about 28 to 29, a
//               harp's top stud 1/4 inch.

const candle = (id, names, d, h, cup, note) => ({ id, kind: "candle", names, dims: { d, h, cup }, label: names[0], note });
const card = (id, names, w, h, t, note) => ({ id, kind: "card", names, dims: { w, h, t }, label: names[0], note });
const holder = (id, names, d, note) => ({ id, kind: "lampholder", names, dims: { d }, label: names[0], note });

export const SPECS = [
  candle("candle-tealight", ["tealight", "tea light", "tealights", "tea lights", "led tealight", "tealight candle"], 38, 16, 12,
    "a tealight (38 mm across in its cup)"),
  candle("candle-tealight-maxi", ["maxi tealight", "large tealight", "jumbo tealight"], 58, 24, 18, "a maxi tealight (58 mm across)"),
  candle("candle-taper", ["taper candle", "taper candles", "taper", "tapers", "dinner candle", "dinner candles"], 22.2, 254, 20,
    "a taper candle (7/8 inch, 22 mm at the base)"),
  candle("candle-votive", ["votive", "votive candle", "votives", "votive candles"], 45, 64, 30, "a votive candle (about 45 mm across; they vary 38 to 50)"),
  candle("candle-pillar", ["pillar candle", "pillar candles", "3 inch pillar candle", "pillar"], 76, 102, 8, "a 3 inch (76 mm) pillar candle"),
  candle("candle-pillar-small", ["2 inch pillar candle", "small pillar candle", "advent candle", "advent candles"], 51, 76, 8,
    "a 2 inch (51 mm) pillar candle"),
  candle("candle-hanukkah", ["hanukkah candle", "hanukkah candles", "chanukah candle", "chanukah candles", "menorah candle", "menorah candles"],
    10, 100, 12, "a Hanukkah candle (about 10 mm at the base)"),
  candle("candle-birthday", ["birthday candle", "birthday candles", "cake candle", "cake candles"], 6, 60, 10, "a birthday candle (about 6 mm)"),
  candle("candle-chime", ["chime candle", "chime candles", "spell candle", "mini taper"], 13, 100, 15, "a chime or spell candle (about 13 mm)"),

  card("card-photo-4x6", ["4x6 photo", "4 x 6 photo", "6x4 photo", "4x6 picture"], 152.4, 101.6, 0.3, "a 4 x 6 inch photo"),
  card("card-photo-5x7", ["5x7 photo", "5 x 7 photo", "7x5 photo", "5x7 picture"], 177.8, 127, 0.3, "a 5 x 7 inch photo"),
  card("card-place", ["place card", "place cards", "name card", "name cards", "tent card"], 89, 51, 0.4, "a place card (3.5 x 2 inch card stock)"),
  card("card-postcard", ["postcard", "post card", "greeting card", "postcards"], 152, 102, 0.4, "a postcard (6 x 4 inch)"),
  card("card-instax-mini", ["instax mini", "instax", "instax photo", "instax print"], 54, 86, 1, "an Instax Mini print (54 x 86 mm)"),
  card("card-polaroid", ["polaroid", "polaroid photo", "polaroid picture"], 88, 107, 1, "a Polaroid print (88 x 107 mm)"),
  card("card-acrylic-3mm", ["3mm acrylic", "3 mm acrylic", "acrylic sign", "acrylic sheet"], 100, 150, 3, "a 3 mm acrylic sign"),
  card("card-index", ["index card", "recipe card", "3x5 card", "index cards"], 127, 76, 0.3, "a 3 x 5 inch index card"),

  holder("lampholder-e27", ["e27 bulb", "e27 socket", "e27 lamp holder", "e26 bulb", "e26 socket", "medium base bulb"], 40.5,
    "an E27/E26 lamp holder (40.5 mm fitter hole)"),
  holder("lampholder-e14", ["e14 bulb", "e14 socket", "e14 lamp holder", "e12 bulb", "e12 socket", "candelabra bulb"], 29,
    "an E14/E12 lamp holder (29 mm fitter hole)"),
  holder("lampholder-harp", ["lamp harp", "harp", "spider fitter", "harp fitter"], 7, "a lamp harp (1/4 inch stud, 7 mm hole)"),
];
