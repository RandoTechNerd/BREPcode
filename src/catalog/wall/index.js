// Catalog category: wall. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the wall category alone, so parallel work on other
// categories never touches it.

import cradleHook from "./cradle-hook.js";
import wallShelf from "./wall-shelf.js";
import coatHook from "./coat-hook.js";
import keyRack from "./key-rack.js";
import guitarHanger from "./guitar-hanger.js";
import frenchCleat from "./french-cleat.js";
import cleatHook from "./cleat-hook.js";
import pegboardHook from "./pegboard-hook.js";
import pegboardBin from "./pegboard-bin.js";
import mailHolder from "./mail-holder.js";
import pictureHook from "./picture-hook.js";
import doorHook from "./door-hook.js";
import sHook from "./s-hook.js";

export const FAMILIES = [cradleHook, wallShelf, coatHook, keyRack, guitarHanger, frenchCleat, cleatHook,
  pegboardHook, pegboardBin, mailHolder, pictureHook, doorHook, sHook];

// Real objects the wall families are sized for.
//
//   neck       a stringed instrument's neck at the nut, where a hanger's fork
//              takes it: w = nut width. Headstocks are wider, which is what
//              rests on the prongs. Common factory sizes; they vary by maker.
//   door       a door a hook hangs over: t = thickness. US interior doors are
//              1-3/8 in, exterior 1-3/4 in, cabinet doors 3/4 in.
//   skadis     IKEA Skadis: 5 x 15 mm slots on a 40 mm grid, alternate
//              columns offset 20 mm both ways, in a 5 mm board (IKEA does not
//              publish a drawing; these are the sizes accessory makers use).
//   pegboard   hardboard pegboard: 1/4 in holes on 1 in centres in 1/4 in
//              board, or 3/16 in holes on 1 in centres in 1/8 in board.
//   adhesive   3M Command refill strips (strip size, pull tab included).
//   round      a rolled thing a cradle holds: d = diameter, len = length.

const neck = (id, names, w, note) => ({ id, kind: "neck", names, dims: { w }, label: names[0], note });
const door = (id, names, t, note) => ({ id, kind: "door", names, dims: { t }, label: names[0], note });
const strip = (id, names, w, len, note) => ({ id, kind: "adhesive", names, dims: { w, len }, label: names[0], note });

export const SPECS = [
  neck("neck-electric", ["electric guitar", "stratocaster", "telecaster", "les paul"], 42.5,
    "an electric guitar (nut about 42 to 43 mm)"),
  neck("neck-acoustic", ["acoustic guitar", "steel string guitar", "dreadnought"], 44, "an acoustic guitar (nut about 43 to 45 mm)"),
  neck("neck-classical", ["classical guitar", "nylon string guitar", "spanish guitar"], 52, "a classical guitar (nut about 52 mm)"),
  neck("neck-bass", ["bass guitar", "electric bass", "bass", "p bass", "precision bass", "jazz bass"], 41.3,
    "a bass guitar (nut 38 mm on a Jazz, 41 mm on a Precision)"),
  neck("neck-ukulele", ["ukulele", "uke", "concert ukulele", "soprano ukulele"], 35, "a ukulele (nut about 35 mm)"),
  neck("neck-violin", ["violin", "fiddle"], 24, "a violin (nut about 24 mm)"),
  neck("neck-mandolin", ["mandolin"], 28.6, "a mandolin (nut 1-1/8 inch, 28.6 mm)"),
  neck("neck-banjo", ["banjo", "5 string banjo"], 32, "a banjo (nut about 1-1/4 inch, 32 mm)"),

  door("door-interior", ["interior door", "bedroom door", "closet door", "inside door", "hollow core door"], 34.9,
    "an interior door, 1-3/8 inch (35 mm) thick"),
  door("door-exterior", ["front door", "exterior door", "entry door", "outside door", "back door"], 44.5,
    "an exterior door, 1-3/4 inch (44.5 mm) thick"),
  door("door-euro", ["euro door", "european door", "40mm door", "40 mm door"], 40, "a European interior door, 40 mm thick"),
  door("door-cabinet", ["cabinet door", "cupboard door", "kitchen cabinet door", "wardrobe door"], 19,
    "a cabinet door, 3/4 inch (19 mm) thick"),

  { id: "skadis", kind: "skadis", names: ["skadis", "ikea skadis", "skadis pegboard", "skadis board"],
    dims: { slotW: 5, slotH: 15, pitch: 20, t: 5 }, label: "IKEA Skadis",
    note: "an IKEA Skadis board (5 x 15 mm slots, 5 mm thick)" },
  { id: "pegboard-quarter", kind: "pegboard", names: ["pegboard", "peg board", "hardboard pegboard", "quarter inch pegboard", "garage pegboard"],
    dims: { hole: 6.35, pitch: 25.4, t: 6.35 }, label: "1/4 inch pegboard",
    note: "1/4 inch pegboard (1/4 inch holes on 1 inch centres)" },
  { id: "pegboard-eighth", kind: "pegboard", names: ["thin pegboard", "eighth inch pegboard", "small hole pegboard"],
    dims: { hole: 4.76, pitch: 25.4, t: 3.2 }, label: "1/8 inch pegboard",
    note: "1/8 inch pegboard (3/16 inch holes on 1 inch centres)" },

  strip("command-small", ["small command strip", "small command strips"], 16, 44, "a small Command strip (5/8 x 1-3/4 inch)"),
  strip("command-medium", ["command strip", "command strips", "3m command strip", "medium command strip", "adhesive strip"], 19, 70,
    "a medium Command strip (3/4 x 2-3/4 inch)"),
  strip("command-large", ["large command strip", "large command strips"], 19, 92, "a large Command strip (3/4 x 3-5/8 inch)"),

  { id: "wrapping-paper", kind: "round", names: ["wrapping paper", "gift wrap", "wrapping paper roll", "gift wrap roll"],
    dims: { d: 70, len: 762 }, label: "wrapping paper roll", note: "a roll of gift wrap (about 70 mm across, 30 inch long)" },
];
