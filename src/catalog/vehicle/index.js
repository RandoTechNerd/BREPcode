// Catalog category: vehicle. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the vehicle category alone, so parallel work on other
// categories never touches it.
//
// Bar sizes are the bike industry's standard clamp diameters; bottle sizes are
// the makers' published body diameters; hitch receivers are the SAE class
// sizes. Car cup holders and headrest posts are NOT standard (holders run
// about 66 to 100 mm, posts 8 to 14 mm), so the families that meet them ask
// instead of guessing from a table.

import ventPhoneMount from "./vent-phone-mount.js";
import cupHolderAdapter from "./cup-holder-adapter.js";
import coinHolder from "./coin-holder.js";
import headrestHook from "./headrest-hook.js";
import visorClip from "./visor-clip.js";
import bikeHanger from "./bike-hanger.js";
import handlebarMount from "./handlebar-mount.js";
import bottleCage from "./bottle-cage.js";
import tireLever from "./tire-lever.js";
import wheelChock from "./wheel-chock.js";
import hitchCover from "./hitch-cover.js";

export const FAMILIES = [ventPhoneMount, cupHolderAdapter, coinHolder, headrestHook, visorClip, bikeHanger, handlebarMount,
  bottleCage, tireLever, wheelChock, hitchCover];

const bar = (id, names, d, note) => ({ id, kind: "bar", names, dims: { d }, label: names[0], note });
const bottle = (id, names, d, note, len) => ({ id, kind: "round", names, dims: len ? { d, len } : { d }, label: names[0], note });
const hitch = (id, names, d, note) => ({ id, kind: "hitch", names, dims: { d }, label: names[0], note });

export const SPECS = [
  // ---- bars: the standard clamp diameters
  bar("bar-22-2", ["22.2mm handlebar", "22.2 mm bar", "22.2mm bar", "7/8 inch handlebar", "7/8 handlebar", "flat bar", "mtb grips",
    "scooter handlebar", "motorcycle handlebar", "grip area"], 22.2, "a 22.2 mm (7/8 inch) bar, at the grips of flat bars, scooters and most motorcycles"),
  bar("bar-25-4", ["25.4mm handlebar", "25.4 mm bar", "25.4mm bar", "1 inch handlebar", "1 inch bar"], 25.4, "a 25.4 mm (1 inch) bar"),
  bar("bar-31-8", ["31.8mm handlebar", "31.8 mm bar", "31.8mm bar", "31.8 bar", "oversize handlebar", "road handlebar", "drop bar",
    "stem clamp"], 31.8, "a 31.8 mm bar, by the stem on most modern bikes"),
  bar("bar-35", ["35mm handlebar", "35 mm bar", "35mm bar", "35 bar"], 35, "a 35 mm bar, by the stem on newer mountain bikes"),
  bar("seatpost-27-2", ["27.2 seatpost", "27.2mm seatpost", "27.2 mm seat post"], 27.2, "a 27.2 mm seatpost"),
  bar("seatpost-30-9", ["30.9 seatpost", "30.9mm seatpost", "30.9 mm seat post"], 30.9, "a 30.9 mm seatpost"),
  bar("seatpost-31-6", ["31.6 seatpost", "31.6mm seatpost", "31.6 mm seat post"], 31.6, "a 31.6 mm seatpost"),

  // ---- bottles: outside body diameter, from the makers' published sizes
  bottle("nalgene-32", ["nalgene", "nalgene 32 oz", "32 oz nalgene", "nalgene bottle", "wide mouth nalgene"], 89,
    "a 32 oz wide-mouth Nalgene (89 mm across, 215 mm tall)", 215),
  bottle("hydro-flask-32", ["hydro flask", "hydroflask", "hydro flask 32 oz", "32 oz hydro flask", "hydro flask 32"], 90.5,
    "a 32 oz wide-mouth Hydro Flask (about 90.5 mm across)"),
  bottle("hydro-flask-21", ["hydro flask 21 oz", "21 oz hydro flask", "hydro flask standard mouth", "hydro flask 21"], 73,
    "a 21 oz standard-mouth Hydro Flask (73 mm across)"),
  bottle("yeti-rambler-26", ["yeti", "yeti rambler", "yeti 26 oz", "yeti rambler 26 oz", "yeti bottle"], 86,
    "a 26 oz Yeti Rambler bottle (about 86 mm across)"),
  bottle("pet-500ml", ["500ml bottle", "500 ml bottle", "half liter bottle", "plastic water bottle", "soda bottle"], 65,
    "a 500 ml PET bottle (about 65 mm across; brands vary a little)"),

  // ---- trailer hitch receivers: inside of the receiver tube
  hitch("hitch-1-25", ["1 1/4 inch receiver", "1 1/4 receiver", "1.25 inch receiver", "1 1/4 inch hitch", "1.25 inch hitch", "class 1 hitch",
    "class 2 hitch"], 31.75, "a 1-1/4 inch (31.75 mm) receiver, class I and II"),
  hitch("hitch-2", ["2 inch receiver", "2 inch hitch", "class 3 hitch", "class 4 hitch", "2 receiver"], 50.8,
    "a 2 inch (50.8 mm) receiver, class III and IV"),
  hitch("hitch-2-5", ["2 1/2 inch receiver", "2.5 inch receiver", "2 1/2 inch hitch", "2.5 inch hitch", "class 5 hitch"], 63.5,
    "a 2-1/2 inch (63.5 mm) receiver, class V"),
];
