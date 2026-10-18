// Catalog category: access. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the access category alone, so parallel work on other
// categories never touches it.

import jarOpener from "./jar-opener.js";
import keyTurner from "./key-turner.js";
import utensilGrip from "./utensil-grip.js";
import knobLever from "./knob-lever.js";
import buttonHook from "./button-hook.js";
import pullLoop from "./pull-loop.js";
import pageHolder from "./page-holder.js";
import cardHandHolder from "./card-hand-holder.js";
import cupHandle from "./cup-handle.js";
import pillSplitter from "./pill-splitter.js";
import plateGuard from "./plate-guard.js";
import caneHolder from "./cane-holder.js";
import phoneGrip from "./phone-grip.js";
import sockAid from "./sock-aid.js";

export const FAMILIES = [jarOpener, keyTurner, utensilGrip, knobLever, buttonHook, pullLoop, pageHolder, cardHandHolder,
  cupHandle, pillSplitter, plateGuard, caneHolder, phoneGrip, sockAid];

// Screw caps and jar lids, d = across the cap. Closures are made to standard
// neck sizes (a "70 mm" jar takes a 70-450 cap), so the cap is a little over
// its nominal size; where it varies the note says "about".
const lid = (id, names, d, note) => ({ id, kind: "lid", names, dims: { d }, label: names[0], note });
// Round knobs a lever clamps onto, d = across the widest part.
const knobSpec = (id, names, d, note) => ({ id, kind: "knob", names, dims: { d }, label: names[0], note });
// Canes, crutches and the tubes they are clipped to, d = shaft diameter.
const cane = (id, names, d, note) => ({ id, kind: "cane", names, dims: { d }, label: names[0], note });
// Plates a guard clips to: d = across, t = rim thickness.
const plate = (id, names, d, t, note) => ({ id, kind: "plate", names, dims: { d, t }, label: names[0], note });
// Cups and cans a handle clamps round, d = across.
const cup = (id, names, d, note) => ({ id, kind: "cup", names, dims: { d }, label: names[0], note });

export const SPECS = [
  // ---- caps and lids
  lid("lid-soda-cap", ["soda bottle cap", "soda bottle", "pop bottle", "coke bottle", "water bottle cap", "plastic bottle cap"], 30,
    "a PCO 28 mm soda or water bottle cap (about 30 mm across)"),
  lid("lid-milk-jug", ["milk jug cap", "milk jug", "gallon jug cap", "juice bottle cap"], 40, "a 38 mm milk or juice jug cap (about 40 mm across)"),
  lid("lid-pill-bottle", ["pill bottle", "pill bottle cap", "medicine bottle", "prescription bottle", "child proof cap"], 42,
    "a typical pharmacy vial cap (about 42 mm across)"),
  lid("lid-mason-regular", ["mason jar", "canning jar", "regular mouth jar", "jam jar"], 72, "a regular-mouth canning jar band (70 mm closure, about 72 mm across)"),
  lid("lid-mason-wide", ["wide mouth jar", "wide mouth mason jar", "wide mouth lid"], 88, "a wide-mouth canning jar band (86 mm closure, about 88 mm across)"),
  lid("lid-sauce-jar", ["pasta sauce jar", "sauce jar", "salsa jar", "baby food jar"], 66, "a typical 63 mm lug-cap sauce jar (about 66 mm across)"),
  lid("lid-pickle-jar", ["pickle jar", "pickle jar lid"], 84, "a typical 82 mm lug-cap pickle jar (about 84 mm across)"),
  lid("lid-peanut-butter", ["peanut butter jar", "peanut butter lid", "mayonnaise jar", "mayo jar"], 91, "an 89 mm peanut butter or mayo jar cap (about 91 mm across)"),

  // ---- knobs
  knobSpec("knob-door", ["door knob", "doorknob", "round door knob", "door handle knob"], 56, "a typical round door knob (about 56 mm across)"),
  knobSpec("knob-faucet", ["faucet knob", "tap handle", "faucet handle", "tap knob", "bath tap"], 45, "a typical round faucet handle (about 45 mm across)"),
  knobSpec("knob-stove", ["stove knob", "oven knob", "cooker knob", "range knob"], 38, "a typical stove or oven knob (about 38 mm across)"),
  knobSpec("knob-radiator", ["radiator valve", "radiator knob", "thermostatic valve", "trv"], 50, "a radiator valve head (about 50 mm across)"),
  knobSpec("knob-lamp", ["lamp knob", "lamp switch knob", "small knob"], 18, "a small lamp-switch knob (about 18 mm across)"),

  // ---- canes, crutches and frames (aluminium mobility aids are made from 7/8 and 1 inch tube)
  cane("cane-aluminium", ["walking cane", "aluminum cane", "aluminium cane", "quad cane", "cane shaft"], 22.2, "a 7/8 in (22 mm) aluminium cane shaft"),
  cane("cane-wooden", ["walking stick", "wooden cane", "wood cane"], 25.4, "a 1 in (25 mm) wooden walking stick"),
  cane("cane-crutch", ["crutch", "crutches", "forearm crutch", "elbow crutch"], 22.2, "a 7/8 in (22 mm) forearm crutch tube"),
  cane("cane-walker", ["walker", "rollator", "walker frame", "walker leg"], 25.4, "a 1 in (25 mm) walker or rollator tube"),
  cane("cane-wheelchair", ["wheelchair", "wheelchair frame", "wheelchair tube"], 22.2, "a 7/8 in (22 mm) wheelchair frame tube"),
  cane("cane-bed-rail", ["bed rail", "bed handle", "grab bar"], 31.8, "a 1-1/4 in (32 mm) bed rail or grab bar"),

  // ---- plates
  plate("plate-dinner", ["dinner plate", "large plate", "10 inch plate"], 267, 4, "a 10.5 in dinner plate (267 mm across)"),
  plate("plate-9in", ["9 inch plate", "lunch plate", "medium plate"], 229, 4, "a 9 in lunch plate (229 mm across)"),
  plate("plate-salad", ["salad plate", "side plate", "8 inch plate", "dessert plate"], 203, 3.5, "an 8 in salad plate (203 mm across)"),
  plate("plate-kids", ["kids plate", "child plate", "toddler plate"], 190, 3.5, "a 7.5 in child's plate (190 mm across)"),

  // ---- cups
  cup("cup-slim-can", ["slim can", "sleek can", "tall slim can", "energy drink can", "seltzer can"], 58, "a slim 12 oz can (58 mm across)"),
  cup("cup-coffee-mug", ["coffee mug", "mug", "coffee cup", "tea cup"], 82, "a typical straight-sided coffee mug (about 82 mm across)"),
  cup("cup-tumbler", ["tumbler", "drinking glass", "glass of water", "pint glass"], 75, "a typical drinking glass (about 75 mm across)"),
];
