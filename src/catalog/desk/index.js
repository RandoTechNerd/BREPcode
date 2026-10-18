// Catalog category: desk. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the desk category alone, so parallel work on other
// categories never touches it.

import phoneStand from "./phone-stand.js";
import headphoneHanger from "./headphone-hanger.js";
import penCup from "./pen-cup.js";
import verticalOrganizer from "./vertical-organizer.js";
import riserLeg from "./riser-leg.js";
import laptopStand from "./laptop-stand.js";
import cableGrommet from "./cable-grommet.js";
import wristRest from "./wrist-rest.js";
import noteTray from "./note-tray.js";
import monitorShelf from "./monitor-shelf.js";
import bookend from "./bookend.js";
import underDeskTray from "./under-desk-tray.js";
import tapeDispenser from "./tape-dispenser.js";

export const FAMILIES = [phoneStand, headphoneHanger, penCup, verticalOrganizer, riserLeg, laptopStand, cableGrommet,
  wristRest, noteTray, monitorShelf, bookend, underDeskTray, tapeDispenser];

// Laptops: w x d x t in mm (closed), from the makers' spec sheets.
const laptop = (id, names, w, d, t, note) => ({ id, kind: "laptop", names, dims: { w, d, t }, label: names[0], note });
// Keyboards: w x d (and height at the back) in mm. Layouts vary by maker; the
// generic sizes are typical cases for that layout and say so.
const keyboard = (id, names, w, d, h, note) => ({ id, kind: "keyboard", names, dims: { w, d, h }, label: names[0], note });
// Cards that stand on edge in a holder, and paper that lies flat: w x h in mm.
const card = (id, names, w, h, note) => ({ id, kind: "card", names, dims: { w, h }, label: names[0], note });
const paper = (id, names, w, h, note) => ({ id, kind: "paper", names, dims: { w, h }, label: names[0], note });
// Holes cut through a desktop for cables (d = hole diameter).
const hole = (id, names, d, note) => ({ id, kind: "grommet", names, dims: { d }, label: names[0], note });
// Tape rolls: core = inside diameter, w = tape width, d = full roll diameter.
const tape = (id, names, core, w, d, note) => ({ id, kind: "tape", names, dims: { core, w, d }, label: names[0], note });
// Boxy things held under a desk: w x h cross-section, len along it.
const strip = (id, names, w, h, len, note) => ({ id, kind: "strip", names, dims: { w, h, len }, label: names[0], note });

export const SPECS = [
  // ---- laptops (Apple, Dell, Lenovo, Microsoft spec sheets)
  laptop("laptop-macbook-air-13", ["MacBook Air 13", "MacBook Air", "MacBook Air M2", "MacBook Air M3"], 304.1, 215, 11.3,
    "a 13 inch MacBook Air (304 x 215 x 11.3 mm)"),
  laptop("laptop-macbook-air-15", ["MacBook Air 15"], 340.4, 237.6, 11.5, "a 15 inch MacBook Air (340 x 238 x 11.5 mm)"),
  laptop("laptop-macbook-pro-14", ["MacBook Pro 14", "MacBook Pro"], 312.6, 221.2, 15.5, "a 14 inch MacBook Pro (313 x 221 x 15.5 mm)"),
  laptop("laptop-macbook-pro-16", ["MacBook Pro 16"], 355.7, 248.1, 16.8, "a 16 inch MacBook Pro (356 x 248 x 16.8 mm)"),
  laptop("laptop-xps-13", ["XPS 13", "Dell XPS 13"], 295.3, 199.1, 15.3, "a Dell XPS 13 (295 x 199 x 15.3 mm)"),
  laptop("laptop-xps-15", ["XPS 15", "Dell XPS 15"], 344.4, 230.1, 18, "a Dell XPS 15 (344 x 230 x 18 mm)"),
  laptop("laptop-thinkpad-x1", ["ThinkPad X1 Carbon", "ThinkPad X1", "ThinkPad"], 315.6, 222.5, 15.4, "a ThinkPad X1 Carbon (316 x 223 x 15.4 mm)"),
  laptop("laptop-surface", ["Surface Laptop"], 308, 223, 14.5, "a 13.5 inch Surface Laptop (308 x 223 x 14.5 mm)"),
  laptop("laptop-gaming", ["gaming laptop", "big laptop", "17 inch laptop"], 395, 270, 25,
    "a typical 17 inch gaming laptop (about 395 x 270 x 25 mm)"),
  laptop("laptop-chromebook", ["Chromebook", "school laptop"], 290, 205, 19, "a typical 11 to 13 inch Chromebook (about 290 x 205 x 19 mm)"),

  // ---- keyboards
  keyboard("keyboard-full", ["full size keyboard", "full keyboard", "keyboard with numpad", "MX Keys", "104 key keyboard"], 440, 135, 22,
    "a full-size keyboard with number pad (about 440 mm wide; a Logitech MX Keys is 430 x 132 mm)"),
  keyboard("keyboard-tkl", ["TKL keyboard", "tenkeyless keyboard", "tenkeyless", "87 key keyboard", "80 percent keyboard"], 360, 135, 30,
    "a tenkeyless (TKL) keyboard (about 360 mm wide)"),
  keyboard("keyboard-75", ["75 percent keyboard", "75 keyboard", "84 key keyboard"], 325, 130, 30, "a 75% keyboard (about 325 mm wide)"),
  keyboard("keyboard-65", ["65 percent keyboard", "65 keyboard", "68 key keyboard"], 315, 108, 30, "a 65% keyboard (about 315 mm wide)"),
  keyboard("keyboard-60", ["60 percent keyboard", "60 keyboard", "61 key keyboard"], 295, 105, 30, "a 60% keyboard (about 295 mm wide)"),
  keyboard("keyboard-magic", ["Magic Keyboard", "Apple keyboard"], 278.9, 114.9, 11, "an Apple Magic Keyboard (279 x 115 mm)"),
  keyboard("keyboard-laptop-deck", ["laptop keyboard"], 300, 90, 15, "a 13 inch laptop's keyboard deck (about 300 mm wide)"),

  // ---- cards and paper
  card("card-business", ["business card", "business cards", "visiting card", "name card"], 88.9, 50.8,
    "a US business card (3.5 x 2 in, 89 x 51 mm)"),
  card("card-business-eu", ["european business card", "eu business card"], 85, 55, "a European business card (85 x 55 mm)"),
  paper("paper-post-it-3x3", ["post it", "post it note", "post it notes", "sticky note", "sticky notes", "3x3 sticky note"], 76, 76,
    "a 3 x 3 in sticky note pad (76 x 76 mm)"),
  paper("paper-post-it-3x5", ["3x5 sticky note", "3x5 post it", "large sticky note"], 127, 76, "a 3 x 5 in sticky note pad (127 x 76 mm)"),
  paper("paper-post-it-4x4", ["4x4 sticky note", "4x4 post it"], 101, 101, "a 4 x 4 in sticky note pad (101 x 101 mm)"),
  paper("paper-index-card", ["index card", "index cards", "3x5 card", "3x5 index card"], 127, 76.2, "a 3 x 5 in index card (127 x 76 mm)"),
  paper("paper-index-card-4x6", ["4x6 index card", "4x6 card"], 152.4, 101.6, "a 4 x 6 in index card (152 x 102 mm)"),
  paper("paper-memo-pad", ["memo pad", "notepad", "scratch pad"], 90, 90, "a cube memo pad (about 90 x 90 mm)"),

  // ---- desk cable holes (the sizes office-furniture makers drill)
  hole("grommet-60", ["standard grommet hole", "desk grommet hole", "60mm hole", "60 mm hole"], 60,
    "the standard 60 mm (2-3/8 in) desk grommet hole"),
  hole("grommet-80", ["large grommet hole", "80mm hole", "80 mm hole"], 80, "a large 80 mm (3-1/8 in) desk grommet hole"),
  hole("grommet-51", ["2 inch hole", "2 inch grommet hole", "50mm hole"], 50.8, "a 2 in (51 mm) desk hole"),
  hole("grommet-35", ["small grommet hole", "35mm hole", "35 mm hole"], 35, "a small 35 mm cable hole"),

  // ---- tape rolls
  tape("tape-scotch", ["scotch tape", "clear tape", "magic tape", "sticky tape", "sellotape"], 25.4, 19, 55,
    "a 3/4 in roll of office tape on a 1 in core (about 55 mm across)"),
  tape("tape-masking", ["masking tape", "painters tape", "painter's tape"], 76.2, 24, 110,
    "a 1 in roll of masking tape on a 3 in core (about 110 mm across)"),
  tape("tape-washi", ["washi tape", "decorative tape"], 25.4, 15, 40, "a 15 mm washi tape roll on a 1 in core (about 40 mm across)"),

  // ---- under-desk things
  strip("strip-power-strip", ["power strip", "surge protector", "power bar", "extension block"], 50, 40, 280,
    "a typical 6-outlet power strip (about 50 x 40 mm across, 280 mm long)"),
  strip("strip-laptop-brick", ["laptop power brick", "power brick", "laptop charger brick"], 65, 30, 140,
    "a typical 90 to 130 W laptop power brick (about 140 x 65 x 30 mm)"),
];
