// Catalog category: kitchen. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the kitchen category alone, so parallel work on other
// categories never touches it.

import bagClip from "./bag-clip.js";
import measuringScoop from "./measuring-scoop.js";
import funnel from "./funnel.js";
import spiceRack from "./spice-rack.js";
import spiceDrawer from "./spice-drawer.js";
import podTower from "./pod-tower.js";
import lidRack from "./lid-rack.js";
import eggTray from "./egg-tray.js";
import mugTree from "./mug-tree.js";
import bottleRack from "./bottle-rack.js";
import cookieCutter from "./cookie-cutter.js";
import spoonRest from "./spoon-rest.js";
import citrusJuicer from "./citrus-juicer.js";

export const FAMILIES = [bagClip, measuringScoop, funnel, spiceRack, spiceDrawer, podTower, lidRack, eggTray, mugTree, bottleRack, cookieCutter, spoonRest, citrusJuicer];

// Kitchen objects, measured where the part meets them.
//
//   jar      a jar with a screw lid: d = lid outside diameter, mouth = the
//            opening inside the threads, h = height.
//   basket   an espresso filter basket: d = inside diameter at the top (the
//            size it is sold by, and the tamper size).
//
// Sources: mason jar mouths are a standard (regular mouth 70 mm lid, about
// 60 mm opening; wide mouth 86 mm lid, about 76 mm opening). Basket sizes are
// the makers' named sizes (58 mm commercial / E61, 54 mm Breville-Sage, 51 mm
// De'Longhi).

const jar = (id, names, d, mouth, h, note) => ({ id, kind: "jar", names, dims: { d, mouth, h }, label: names[0], note });
const basket = (id, names, d, note) => ({ id, kind: "basket", names, dims: { d }, label: names[0], note });

export const SPECS = [
  jar("mason-regular", ["mason jar", "regular mouth mason jar", "regular mouth jar", "ball jar", "canning jar"], 70, 60, 130,
    "a regular-mouth mason jar (70 mm lid, about 60 mm opening)"),
  jar("mason-wide", ["wide mouth mason jar", "wide mouth jar", "wide mouth ball jar", "wide mouth canning jar"], 86, 76, 135,
    "a wide-mouth mason jar (86 mm lid, about 76 mm opening)"),
  basket("basket-58", ["58 mm portafilter", "58 mm basket", "58mm portafilter", "e61", "gaggia classic", "rancilio silvia", "commercial portafilter"], 58,
    "a 58 mm espresso basket"),
  basket("basket-54", ["54 mm portafilter", "54 mm basket", "breville portafilter", "breville barista express", "sage barista express", "barista express"], 54,
    "a 54 mm Breville / Sage basket"),
  basket("basket-53", ["53 mm portafilter", "53 mm basket"], 53, "a 53 mm espresso basket"),
  basket("basket-51", ["51 mm portafilter", "51 mm basket", "delonghi portafilter", "delonghi dedica", "dedica"], 51,
    "a 51 mm De'Longhi basket"),

  // spice jars vary by brand: these are the common round sizes, measure yours
  jar("spice-jar", ["spice jar", "spice jars", "spice bottle", "seasoning jar", "mccormick jar"], 45, 30, 100,
    "a standard round spice jar (about 45 mm across, 100 mm tall; brands vary, measure yours)"),
  jar("spice-jar-large", ["large spice jar", "4 oz spice jar", "tall spice jar"], 52, 34, 120,
    "a large 4 oz spice jar (about 52 mm across, 120 mm tall)"),

  // pods and capsules: d = rim diameter, h = height. Makers do not publish
  // these, so they are measured sizes; Vertuo and Dolce Gusto vary by blend.
  { id: "k-cup", kind: "pod", names: ["k cup", "kcup", "k cups", "keurig pod", "keurig pods", "keurig cup", "k cup pod"], dims: { d: 51, h: 45 },
    label: "K-cup", note: "a Keurig K-cup (about 51 mm across the lid, 45 mm tall)" },
  { id: "nespresso", kind: "pod", names: ["nespresso", "nespresso capsule", "nespresso pod", "nespresso original", "originalline", "original line capsule"], dims: { d: 37, h: 30 },
    label: "Nespresso capsule", note: "a Nespresso OriginalLine capsule (37 mm across, about 30 mm tall)" },
  { id: "vertuo", kind: "pod", names: ["vertuo", "nespresso vertuo", "vertuo capsule", "vertuo pod", "vertuoline"], dims: { d: 56, h: 47 },
    label: "Vertuo capsule", note: "a Nespresso Vertuo capsule (about 56 mm across; the tall mug size, espresso ones are shorter)" },
  { id: "dolce-gusto", kind: "pod", names: ["dolce gusto", "dolce gusto capsule", "dolce gusto pod", "nescafe dolce gusto"], dims: { d: 53, h: 52 },
    label: "Dolce Gusto capsule", note: "a Dolce Gusto capsule (about 53 mm across, 52 mm tall)" },
  { id: "ese-pod", kind: "pod", names: ["ese pod", "ese pods", "espresso pod", "paper espresso pod"], dims: { d: 44, h: 10 },
    label: "ESE pod", note: "an ESE paper espresso pod (the 44 mm standard, about 10 mm thick)" },
  { id: "cotton-pad", kind: "pod", names: ["cotton pad", "cotton pads", "cotton round", "cotton rounds", "makeup remover pad", "makeup pad"], dims: { d: 58, h: 5 },
    label: "cotton pad", note: "a round cotton pad (about 58 mm across; brands run 55 to 60, measure yours)" },
  { id: "tea-light", kind: "pod", names: ["tea light", "tealight", "tea lights", "tea light candle"], dims: { d: 38, h: 16 },
    label: "tea light", note: "a standard tea light (38 mm across, 16 mm tall in its cup)" },

  // eggs: d = across the middle, len = end to end. Graded by weight, so the
  // sizes are typical, not exact.
  { id: "egg-large", kind: "egg", names: ["egg", "eggs", "large egg", "large eggs", "chicken egg", "chicken eggs"], dims: { d: 44, len: 57 },
    label: "large egg", note: "a large chicken egg (about 44 mm across, 57 mm long)" },
  { id: "egg-jumbo", kind: "egg", names: ["jumbo egg", "jumbo eggs", "extra large egg", "extra large eggs"], dims: { d: 48, len: 63 },
    label: "jumbo egg", note: "a jumbo / extra-large egg (about 48 mm across, 63 mm long)" },
  { id: "egg-duck", kind: "egg", names: ["duck egg", "duck eggs"], dims: { d: 50, len: 66 },
    label: "duck egg", note: "a duck egg (about 50 mm across, 66 mm long)" },
  { id: "egg-quail", kind: "egg", names: ["quail egg", "quail eggs"], dims: { d: 26, len: 33 },
    label: "quail egg", note: "a quail egg (about 26 mm across, 33 mm long)" },

  { id: "beer-bottle", kind: "round", names: ["beer bottle", "beer bottles", "longneck", "long neck bottle", "12 oz bottle"], dims: { d: 62, len: 230 },
    label: "beer bottle", note: "a 12 oz long-neck beer bottle (about 62 mm across)" },
  { id: "rolling-pin", kind: "round", names: ["rolling pin"], dims: { d: 50, len: 450 },
    label: "rolling pin", note: "a rolling pin (about 50 mm across; measure yours)" },

  // citrus, across the middle: produce is graded, so these are typical sizes
  { id: "lime", kind: "citrus", names: ["lime", "limes", "key lime"], dims: { d: 48 }, label: "lime", note: "a lime (about 48 mm across)" },
  { id: "lemon", kind: "citrus", names: ["lemon", "lemons"], dims: { d: 60 }, label: "lemon", note: "a lemon (about 60 mm across)" },
  { id: "orange", kind: "citrus", names: ["orange", "oranges", "navel orange"], dims: { d: 78 }, label: "orange", note: "an orange (about 78 mm across)" },
  { id: "grapefruit", kind: "citrus", names: ["grapefruit", "grapefruits", "pomelo"], dims: { d: 105 }, label: "grapefruit", note: "a grapefruit (about 105 mm across)" },

  // food cans by the trade's size codes: 300 x 407 is 3 0/16 in by 4 7/16 in
  { id: "can-300", kind: "round", names: ["15 oz can", "can of beans", "300 x 407 can", "bean can"], dims: { d: 76.2, len: 112.7 },
    label: "15 oz can", note: "a 15 oz food can (300 x 407: 76 mm across, 113 mm tall)" },
  { id: "can-303", kind: "round", names: ["soup can", "can of soup", "food can", "tin can", "canned food", "14.5 oz can", "303 x 406 can", "can of tomatoes"], dims: { d: 81, len: 111.1 },
    label: "14.5 oz can", note: "a 14.5 oz food can (303 x 406: 81 mm across, 111 mm tall)" },
];
