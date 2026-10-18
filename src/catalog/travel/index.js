// Catalog category: travel. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the travel category alone, so parallel work on other
// categories never touches it.
//
// Earbud cases are the makers' published sizes; webbing comes in standard
// widths (3/4, 1, 1-1/2 and 2 inch, and their 20/25/38/50 mm cousins); tent
// pole sizes are the outside diameters the pole makers name them by.

import travelCase from "./travel-case.js";
import tentStake from "./tent-stake.js";
import carabiner from "./carabiner.js";
import strapSlider from "./strap-slider.js";
import bottleClip from "./bottle-clip.js";
import campCup from "./camp-cup.js";
import strapBuckle from "./strap-buckle.js";
import lineTensioner from "./line-tensioner.js";
import phoneTripodMount from "./phone-tripod-mount.js";
import poleSleeve from "./pole-sleeve.js";

export const FAMILIES = [travelCase, tentStake, carabiner, strapSlider, bottleClip, campCup, strapBuckle, lineTensioner,
  phoneTripodMount, poleSleeve];

// something a case is made to carry: l x w x t, lying flat
const item = (id, names, l, w, t, note) => ({ id, kind: "pocket-item", names, dims: { l, w, t }, label: names[0], note });
const webbing = (id, names, w, note) => ({ id, kind: "webbing", names, dims: { w }, label: names[0], note });
const pole = (id, names, d, note) => ({ id, kind: "pole", names, dims: { d }, label: names[0], note });

export const SPECS = [
  // ---- earbud cases (Apple and Samsung spec pages)
  item("airpods-pro-2", ["airpods pro", "airpods pro 2", "airpods pro case", "airpods pro 2 case"], 60.6, 45.2, 21.7,
    "an AirPods Pro 2 case (60.6 x 45.2 x 21.7 mm)"),
  item("airpods-4", ["airpods", "airpods 4", "airpods case", "airpods 4 case"], 50.1, 46.2, 21.2, "an AirPods 4 case (50.1 x 46.2 x 21.2 mm)"),
  item("galaxy-buds3-pro", ["galaxy buds", "galaxy buds 3 pro", "galaxy buds3 pro", "buds 3 pro", "galaxy buds case"], 58.9, 48.7, 24.4,
    "a Galaxy Buds3 Pro case (58.9 x 48.7 x 24.4 mm)"),

  // ---- webbing widths
  webbing("webbing-3-4in", ["3/4 inch webbing", "3/4 inch strap", "3/4 webbing", "3/4 strap"], 19.05, "3/4 inch (19 mm) webbing"),
  webbing("webbing-20mm", ["20mm webbing", "20mm strap", "20 mm webbing", "20 mm strap"], 20, "20 mm webbing"),
  webbing("webbing-1in", ["1 inch webbing", "1 inch strap", "one inch webbing", "1 webbing"], 25.4, "1 inch (25.4 mm) webbing"),
  webbing("webbing-25mm", ["25mm webbing", "25mm strap", "25 mm webbing", "25 mm strap"], 25, "25 mm webbing"),
  webbing("webbing-1-5in", ["1 1/2 inch webbing", "1.5 inch webbing", "1 1/2 inch strap", "1.5 inch strap"], 38.1, "1-1/2 inch (38 mm) webbing"),
  webbing("webbing-38mm", ["38mm webbing", "38mm strap", "38 mm webbing", "38 mm strap"], 38, "38 mm webbing"),
  webbing("webbing-2in", ["2 inch webbing", "2 inch strap", "two inch webbing"], 50.8, "2 inch (50.8 mm) webbing"),
  webbing("webbing-50mm", ["50mm webbing", "50mm strap", "50 mm webbing", "50 mm strap"], 50, "50 mm webbing"),

  // ---- cord
  { id: "paracord", kind: "cable", names: ["paracord", "550 paracord", "550 cord", "parachute cord"], dims: { d: 4 }, label: "paracord",
    note: "550 paracord (about 4 mm)" },

  // ---- tent poles: named by outside diameter
  pole("pole-8-5", ["8.5mm tent pole", "8.5 mm pole", "8.5mm pole", "dac 8.5"], 8.5, "an 8.5 mm aluminium tent pole"),
  pole("pole-9-5", ["9.5mm tent pole", "9.5 mm pole", "9.5mm pole", "dac 9.5"], 9.5, "a 9.5 mm tent pole"),
  pole("pole-10-25", ["10.25mm tent pole", "10.25 mm pole", "dac featherlite", "dac 10.25"], 10.25,
    "a 10.25 mm aluminium tent pole (DAC Featherlite NSL)"),
  pole("pole-11", ["11mm tent pole", "11 mm pole", "11mm pole", "dac 11"], 11, "an 11 mm tent pole"),
];
