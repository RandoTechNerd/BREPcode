// Catalog category: gaming. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the gaming category alone, so parallel work on other
// categories never touches it.

import controllerStand from "./controller-stand.js";
import controllerWallMount from "./controller-wall-mount.js";
import headsetStand from "./headset-stand.js";
import consoleMount from "./console-mount.js";
import cartridgeHolder from "./cartridge-holder.js";
import diceTower from "./dice-tower.js";
import deckBox from "./deck-box.js";
import tokenTray from "./token-tray.js";
import mouseBungee from "./mouse-bungee.js";
import displayRiser from "./display-riser.js";
import mediaStand from "./media-stand.js";

export const FAMILIES = [controllerStand, controllerWallMount, headsetStand, consoleMount, cartridgeHolder, diceTower, deckBox,
  tokenTray, mouseBungee, displayRiser, mediaStand];

// Controllers: w = across the grips, d = top edge to the bottom of the grips,
// t = thickest point (triggers included), from the makers' published sizes.
const controller = (id, names, w, d, t, note) => ({ id, kind: "controller", names, dims: { w, d, t }, label: names[0], note });
// Consoles standing on edge: t = thickness (what a bracket or stand grips),
// w = depth front to back, h = height. Without any stand fitted.
const consoleSpec = (id, names, w, h, t, note) => ({ id, kind: "console", names, dims: { w, h, t }, label: names[0], note });
// Things that stand upright in a pocket: w x h face, t thick.
const cart = (id, names, w, h, t, note) => ({ id, kind: "cart", names, dims: { w, h, t }, label: names[0], note });
// Flat media shown or stored on edge: cases, sleeves, slabs. w x h face, t thick.
const media = (id, names, w, h, t, note) => ({ id, kind: "media", names, dims: { w, h, t }, label: names[0], note });
// Card decks: one card w x h, t per card (sleeved where it says), n cards.
const deck = (id, names, w, h, t, n, note) => ({ id, kind: "deck", names, dims: { w, h, t, n }, label: names[0], note });

export const SPECS = [
  // ---- controllers (Microsoft, Sony, Nintendo product pages)
  controller("pad-xbox", ["Xbox controller", "Xbox Series controller", "Xbox One controller", "Xbox wireless controller", "Xbox Elite controller"],
    152, 102, 61, "an Xbox Wireless Controller (152 x 102 x 61 mm)"),
  controller("pad-dualsense", ["DualSense", "PS5 controller", "PlayStation 5 controller", "DualSense Edge"], 160, 106, 66,
    "a PS5 DualSense controller (160 x 106 x 66 mm)"),
  controller("pad-dualshock-4", ["DualShock 4", "PS4 controller", "PlayStation 4 controller"], 162, 98, 52, "a PS4 DualShock 4 (162 x 98 x 52 mm)"),
  controller("pad-switch-pro", ["Switch Pro controller", "Pro controller", "Nintendo Pro controller"], 152, 106, 60,
    "a Nintendo Switch Pro Controller (152 x 106 x 60 mm)"),
  controller("pad-generic", ["gamepad", "game controller", "controller"], 155, 104, 62, "a typical full-size gamepad (about 155 x 104 x 62 mm)"),

  // ---- consoles (thickness is the widest point, PS5 at its curved side panels)
  consoleSpec("console-ps5", ["PS5", "PlayStation 5", "PS5 disc", "PS5 digital"], 260, 390, 104, "a launch PS5 (390 x 260 mm, 104 mm at its widest)"),
  consoleSpec("console-ps5-slim", ["PS5 Slim", "PlayStation 5 Slim"], 216, 358, 96, "a PS5 Slim (358 x 216 mm, 96 mm at its widest)"),
  consoleSpec("console-ps5-pro", ["PS5 Pro", "PlayStation 5 Pro"], 216, 388, 89, "a PS5 Pro (388 x 216 x 89 mm)"),
  consoleSpec("console-ps4", ["PS4", "PlayStation 4", "PS4 Slim"], 288, 265, 39, "a PS4 Slim (265 x 288 x 39 mm)"),
  consoleSpec("console-ps4-pro", ["PS4 Pro"], 327, 295, 55, "a PS4 Pro (295 x 327 x 55 mm)"),
  consoleSpec("console-xbox-series-x", ["Xbox Series X"], 151, 301, 151, "an Xbox Series X (151 x 151 x 301 mm)"),
  consoleSpec("console-xbox-series-s", ["Xbox Series S"], 151, 275, 63.5, "an Xbox Series S (275 x 151 x 63.5 mm)"),
  consoleSpec("console-xbox-one-s", ["Xbox One S", "Xbox One X", "Xbox One"], 230, 295, 64, "an Xbox One S (295 x 230 x 64 mm)"),
  consoleSpec("console-switch-dock", ["Switch dock", "Nintendo Switch dock", "Switch OLED dock"], 54, 104, 54,
    "a Nintendo Switch dock (173 x 104 x 54 mm)"),
  consoleSpec("console-wii", ["Wii", "Nintendo Wii"], 215, 157, 44, "a Nintendo Wii (157 x 215 x 44 mm)"),
  consoleSpec("console-apple-tv", ["Apple TV", "Apple TV 4K"], 93, 93, 31, "an Apple TV 4K (93 x 93 x 31 mm)"),

  // ---- cartridges and cards that stand in pockets
  cart("cart-switch", ["Switch game", "Switch games", "Switch cartridge", "Switch game card", "Switch cart"], 21.5, 31, 3.3,
    "a Nintendo Switch game card (21.5 x 31 x 3.3 mm)"),
  cart("cart-game-boy", ["Game Boy cartridge", "Game Boy game", "Game Boy Color cartridge", "GBC cartridge", "Game Boy cart"], 57, 65, 8,
    "a Game Boy cartridge (57 x 65 x 8 mm)"),
  cart("cart-gba", ["GBA cartridge", "Game Boy Advance cartridge", "GBA game", "GBA cart"], 57, 35, 8, "a Game Boy Advance cartridge (57 x 35 x 8 mm)"),
  cart("cart-ds", ["DS game", "DS cartridge", "3DS game", "3DS cartridge", "DS card", "3DS card"], 35, 33, 3.8,
    "a DS / 3DS game card (35 x 33 x 3.8 mm)"),
  cart("cart-n64", ["N64 cartridge", "N64 game", "Nintendo 64 cartridge"], 116, 75, 18, "an N64 cartridge (about 116 x 75 x 18 mm)"),
  cart("cart-nes", ["NES cartridge", "NES game"], 120, 133, 17, "a US NES cartridge (about 120 x 133 x 17 mm)"),
  cart("cart-sd-card", ["SD card", "SD cards", "memory card"], 24, 32, 2.1, "an SD card (24 x 32 x 2.1 mm)"),
  cart("cart-microsd", ["microSD card", "micro SD card", "microSD cards", "TF card"], 11, 15, 1, "a microSD card (11 x 15 x 1 mm)"),
  cart("cart-joycon", ["Joy-Con", "Joy Con", "Joycon", "Joy-Cons"], 35.9, 102, 28.4, "a Switch Joy-Con (102 x 35.9 x 28.4 mm)"),

  // ---- flat media
  media("media-switch-case", ["Switch game case", "Switch case", "Nintendo Switch case"], 105, 170, 11, "a Switch game case (105 x 170 x 11 mm)"),
  media("media-bluray-case", ["Blu-ray case", "Bluray case", "PS5 game case", "PS4 game case", "PS5 case", "PS4 case"], 135, 171, 12.5,
    "a Blu-ray / PlayStation game case (135 x 171 x 12.5 mm)"),
  media("media-dvd-case", ["DVD case", "Xbox game case", "Wii game case", "Xbox case"], 135, 190, 14, "a DVD-size game case (135 x 190 x 14 mm)"),
  media("media-cd-case", ["CD case", "jewel case", "CD jewel case"], 142, 125, 10.4, "a CD jewel case (142 x 125 x 10.4 mm)"),
  media("media-vinyl", ["vinyl record", "vinyl", "LP", "record sleeve", "album cover", "12 inch record"], 314, 314, 4,
    "a 12 in LP in its sleeve (314 x 314 mm, about 4 mm thick)"),
  media("media-psa-slab", ["PSA slab", "graded card", "graded slab", "BGS slab", "card slab"], 82, 136, 7.6, "a PSA graded-card slab (about 82 x 136 x 7.6 mm)"),
  media("media-trading-card", ["trading card", "Pokemon card", "sports card", "baseball card"], 63, 88, 0.4, "a standard trading card (63 x 88 mm)"),
  media("media-toploader", ["top loader", "toploader"], 76, 101, 1.5, "a 3 x 4 in toploader (76 x 101 x 1.5 mm)"),
  media("media-comic", ["comic book", "comic", "comics"], 170, 260, 3, "a US comic book (about 170 x 260 mm)"),

  // ---- card decks (card sizes from the publishers; sleeved thickness is a typical standard sleeve)
  deck("deck-mtg", ["MTG deck", "Magic deck", "Magic the Gathering deck", "60 card deck"], 66, 91, 0.65, 60,
    "a 60-card Magic deck in standard sleeves (66 x 91 mm sleeves)"),
  deck("deck-commander", ["commander deck", "EDH deck", "100 card deck"], 66, 91, 0.65, 100,
    "a 100-card Commander deck in standard sleeves"),
  deck("deck-pokemon", ["Pokemon deck", "PTCG deck", "Pokemon card deck"], 66, 91, 0.65, 60, "a 60-card Pokemon deck in standard sleeves"),
  deck("deck-yugioh", ["Yu-Gi-Oh deck", "Yugioh deck", "Yu Gi Oh deck"], 62, 89, 0.6, 55,
    "a Yu-Gi-Oh deck in small sleeves (62 x 89 mm, main plus extra deck)"),
  deck("deck-poker", ["deck of cards", "playing cards", "poker deck", "poker cards", "card deck"], 63.5, 88.9, 0.3, 54,
    "a standard 54-card poker deck (63.5 x 88.9 mm)"),
  deck("deck-bridge", ["bridge deck", "bridge cards"], 57.2, 88.9, 0.3, 54, "a 54-card bridge deck (57 x 89 mm)"),
  deck("deck-uno", ["Uno cards", "Uno deck", "Uno"], 56, 87, 0.3, 112, "a 112-card Uno deck (56 x 87 mm)"),
  deck("deck-tarot", ["tarot cards", "tarot deck", "oracle cards"], 70, 120, 0.35, 78, "a 78-card tarot deck (70 x 120 mm)"),
];
