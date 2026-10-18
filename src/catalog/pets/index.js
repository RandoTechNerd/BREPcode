// Catalog category: pets. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the pets category alone, so parallel work on other
// categories never touches it.

import petFoodScoop from "./pet-food-scoop.js";
import bowlStand from "./bowl-stand.js";
import petBowl from "./pet-bowl.js";
import poopBagDispenser from "./poop-bag-dispenser.js";
import leashRack from "./leash-rack.js";
import aquariumClip from "./aquarium-clip.js";
import feedingRing from "./feeding-ring.js";
import treatRoller from "./treat-roller.js";
import catWallStep from "./cat-wall-step.js";
import smallAnimalHide from "./small-animal-hide.js";
import petFoodCanLid from "./pet-food-can-lid.js";

export const FAMILIES = [petFoodScoop, bowlStand, petBowl, poopBagDispenser, leashRack, aquariumClip, feedingRing, treatRoller, catWallStep, smallAnimalHide, petFoodCanLid];

// Real things these parts fit. Pet gear is sold by nominal size, not by a
// standard, so every size here is the common one and says "about": the part
// that uses it leaves room, and the note asks people to measure their own.
//
//   pet-bowl        a stainless bowl with a rolled rim. d = across the rim,
//                   h = how deep it hangs below the rim.
//   bag-roll        a refill roll of dog waste bags. d = across, len = long.
//   aquarium-tube   airline tubing, CO2 line, filter hose, heater, probe.
//                   d = outside diameter.
//   aquarium-glass  the glass (or frame) a clip hangs over. t = thickness.
//   pet-can         a pet food can. d = across the rim (the seam).
const bowl = (id, names, d, h, note) => ({ id, kind: "pet-bowl", names, dims: { d, h }, label: names[0], note });
const tube = (id, names, d, note) => ({ id, kind: "aquarium-tube", names, dims: { d }, label: names[0], note });
const glass = (id, names, t, note) => ({ id, kind: "aquarium-glass", names, dims: { t }, label: names[0], note });
const can = (id, names, d, note) => ({ id, kind: "pet-can", names, dims: { d }, label: names[0], note });

export const SPECS = [
  // ---- stainless pet bowls, by their usual capacity names
  bowl("pet-bowl-cat", ["cat bowl", "8 oz bowl", "8 oz pet bowl", "half pint bowl", "1 cup pet bowl"], 120, 40,
    "a small 8 oz stainless cat bowl (about 120 mm across the rim, 40 mm deep; sizes vary, measure yours)"),
  bowl("pet-bowl-1pt", ["1 pint bowl", "pint bowl", "16 oz bowl", "16 oz dog bowl", "one pint bowl"], 160, 50,
    "a 1 pint (16 oz) stainless bowl (about 160 mm across the rim, 50 mm deep; measure yours)"),
  bowl("pet-bowl-1qt", ["1 quart bowl", "quart bowl", "32 oz bowl", "1 qt bowl", "one quart bowl", "32 oz dog bowl"], 200, 65,
    "a 1 quart (32 oz) stainless bowl (about 200 mm across the rim, 65 mm deep; measure yours)"),
  bowl("pet-bowl-2qt", ["2 quart bowl", "2 qt bowl", "64 oz bowl", "two quart bowl", "half gallon bowl"], 240, 80,
    "a 2 quart (64 oz) stainless bowl (about 240 mm across the rim, 80 mm deep; measure yours)"),
  bowl("pet-bowl-3qt", ["3 quart bowl", "3 qt bowl", "96 oz bowl", "three quart bowl"], 275, 90,
    "a 3 quart (96 oz) stainless bowl (about 275 mm across the rim, 90 mm deep; measure yours)"),

  // ---- dog waste bag refill rolls
  { id: "pet-bag-roll", kind: "bag-roll", names: ["poop bag roll", "dog bag roll", "waste bag roll", "bag refill roll", "poop bag refill", "dog waste bag roll"],
    dims: { d: 33, len: 58 }, label: "poop bag roll",
    note: "a standard refill roll of dog waste bags (about 30 to 35 mm across and 55 to 60 mm long; brands vary, measure yours)" },

  // ---- aquarium tubing, hose and in-tank gear (outside diameters)
  tube("aq-airline", ["airline tubing", "airline tube", "air line tubing", "airline", "air tubing", "3/16 airline", "standard airline tubing"], 4.8,
    "standard 3/16 inch airline tubing (about 4.8 mm across; some brands run closer to 6 mm, measure yours)"),
  tube("aq-tube-4-6", ["4/6 mm tubing", "4/6 tubing", "4/6 mm hose", "co2 tubing", "co2 tube", "co2 line", "silicone airline"], 6,
    "4/6 mm tubing, the usual CO2 and silicone airline size (6 mm outside)"),
  tube("aq-hose-9-12", ["9/12 hose", "9/12 mm hose", "9/12 tubing"], 12, "9/12 mm filter hose (12 mm outside)"),
  tube("aq-hose-12-16", ["12/16 hose", "12/16 mm hose", "12/16 tubing", "canister hose", "filter hose", "aquarium hose", "fish tank hose"], 16,
    "12/16 mm canister filter hose (16 mm outside)"),
  tube("aq-hose-16-22", ["16/22 hose", "16/22 mm hose", "16/22 tubing", "large canister hose"], 22,
    "16/22 mm canister filter hose (22 mm outside)"),
  tube("aq-heater", ["aquarium heater", "fish tank heater", "tank heater", "submersible heater"], 28,
    "a typical submersible aquarium heater (about 25 to 32 mm across; measure yours)"),
  tube("aq-thermometer", ["aquarium thermometer", "fish tank thermometer", "stick thermometer", "glass thermometer"], 9,
    "a glass stick aquarium thermometer (about 8 to 10 mm across; measure yours)"),
  tube("aq-probe", ["ph probe", "ph electrode", "aquarium probe"], 12, "a standard 12 mm pH electrode"),

  // ---- the glass a clip hangs on
  glass("aq-glass-nano", ["nano tank", "rimless nano tank", "small rimless tank"], 5,
    "a small rimless tank (about 4 to 5 mm glass; measure yours)"),
  glass("aq-glass-rimless", ["rimless tank", "rimless aquarium", "60 cm rimless tank"], 6,
    "a mid-size rimless tank (most 45 to 90 cm tanks use 5 to 8 mm glass; measure yours)"),
  glass("aq-glass-large", ["large rimless tank", "90 cm rimless tank", "120 cm rimless tank"], 10,
    "a large rimless tank (about 10 to 12 mm glass; measure yours)"),
  glass("aq-glass-framed", ["framed tank", "rimmed tank", "tank with a plastic rim", "plastic tank frame"], 14,
    "the plastic top frame of a standard rimmed tank (about 12 to 16 mm across the top; measure yours)"),

  // ---- pet food cans, across the rim
  can("pet-can-cat-3oz", ["3 oz cat food can", "3 oz can", "small cat food can", "cat food can", "3 ounce can"], 68,
    "a 3 oz cat food can (about 68 mm across the rim; measure yours)"),
  can("pet-can-cat-5oz", ["5.5 oz cat food can", "5.5 oz can", "5 oz can", "5.5 ounce can"], 76,
    "a 5.5 oz cat food can (about 76 mm across the rim; measure yours)"),
  can("pet-can-dog-13oz", ["13 oz dog food can", "13 oz can", "12.5 oz can", "dog food can", "13 ounce can"], 76,
    "a 13 oz dog food can (about 76 mm, 3 in, across the rim; measure yours)"),
  can("pet-can-dog-22oz", ["22 oz dog food can", "22 oz can", "large dog food can", "22 ounce can"], 87,
    "a 22 oz dog food can (about 87 mm across the rim; measure yours)"),
];
