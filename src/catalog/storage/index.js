// Catalog category: storage. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the storage category alone, so parallel work on other
// categories never touches it.

import storageBox from "./storage-box.js";
import stackableBin from "./stackable-bin.js";
import gridfinityBin from "./gridfinity-bin.js";
import gridfinityBaseplate from "./gridfinity-baseplate.js";
import drawerDivider from "./drawer-divider.js";
import batteryOrganizer from "./battery-organizer.js";
import cardHolder from "./card-holder.js";
import labelHolder from "./label-holder.js";
import drawerCabinet from "./drawer-cabinet.js";
import capsuleTube from "./capsule-tube.js";

export const FAMILIES = [storageBox, stackableBin, gridfinityBin, gridfinityBaseplate, drawerDivider,
  batteryOrganizer, cardHolder, labelHolder, drawerCabinet, capsuleTube];

// Batteries: diameter and length (round cells), or width / thickness /
// length (flat ones), from the IEC 60086 sizes and the makers' data sheets.
// A coin cell is stored standing on its edge, so its "length" is its
// diameter. Lithium rechargeables vary a little with protection circuits.
const battery = (id, names, dims, note) => ({ id, kind: "battery", names, dims, label: names[0], note });

// Memory cards and USB plugs: width x height x thickness from the SD
// Association, CompactFlash and CFexpress specs, and the USB plug sizes.
const card = (id, names, w, h, t, note) => ({ id, kind: "card", names, dims: { w, h, t }, label: names[0], note });

// Coins: diameter and thickness from the issuing mints (US Mint, ECB, Royal Mint).
const coin = (id, names, d, t) => ({ id, kind: "coin", names, dims: { d, t }, label: names[0],
  note: `${names[0]} (${d} mm across, ${t} mm thick)` });

export const SPECS = [
  battery("aa", ["AA", "AA battery", "AA batteries", "double a", "LR6", "14500"], { d: 14.5, len: 50.5 }, "an AA cell (14.5 mm across, 50.5 mm long)"),
  battery("aaa", ["AAA", "AAA battery", "AAA batteries", "triple a", "LR03", "10440"], { d: 10.5, len: 44.5 }, "an AAA cell (10.5 mm across, 44.5 mm long)"),
  battery("c-cell", ["C battery", "C batteries", "C cell", "LR14"], { d: 26.2, len: 50 }, "a C cell (26.2 mm across, 50 mm long)"),
  battery("d-cell", ["D battery", "D batteries", "D cell", "LR20"], { d: 34.2, len: 61.5 }, "a D cell (34.2 mm across, 61.5 mm long)"),
  battery("18650", ["18650", "18650 battery", "18650 cell", "18650 cells"], { d: 18.6, len: 65.5 }, "an 18650 cell (18.6 mm across, 65.5 mm long; protected cells run to 69)"),
  battery("21700", ["21700", "21700 battery", "21700 cell"], { d: 21.7, len: 70.5 }, "a 21700 cell (21.7 mm across, 70.5 mm long)"),
  battery("26650", ["26650", "26650 battery"], { d: 26.5, len: 65.5 }, "a 26650 cell (26.5 mm across, 65.5 mm long)"),
  battery("cr123a", ["CR123A", "CR123", "16340", "123A battery"], { d: 17, len: 34.5 }, "a CR123A cell (17 mm across, 34.5 mm long)"),
  battery("9v", ["9V", "9V battery", "9 volt", "9 volt battery", "PP3"], { d: 26.5, t: 17.5, len: 48.5 }, "a 9 V block (26.5 x 17.5 x 48.5 mm)"),
  battery("cr2032", ["CR2032", "2032", "coin cell", "coin cells", "button cell"], { d: 20, t: 3.2, len: 20 }, "a CR2032 coin cell (20 mm across, 3.2 mm thick)"),
  battery("cr2025", ["CR2025"], { d: 20, t: 2.5, len: 20 }, "a CR2025 coin cell (20 mm across, 2.5 mm thick)"),
  battery("cr2016", ["CR2016"], { d: 20, t: 1.6, len: 20 }, "a CR2016 coin cell (20 mm across, 1.6 mm thick)"),
  battery("cr2450", ["CR2450"], { d: 24.5, t: 5, len: 24.5 }, "a CR2450 coin cell (24.5 mm across, 5 mm thick)"),
  battery("lr44", ["LR44", "AG13", "357 battery", "A76"], { d: 11.6, t: 5.4, len: 11.6 }, "an LR44 button cell (11.6 mm across, 5.4 mm thick)"),

  card("sd-card", ["SD card", "SD cards", "SDHC", "SDXC", "SD memory card"], 24, 32, 2.1, "a full-size SD card (24 x 32 x 2.1 mm)"),
  card("microsd", ["micro SD", "microSD", "micro SD card", "TF card", "microSDHC", "microSDXC"], 11, 15, 1, "a microSD card (11 x 15 x 1 mm)"),
  card("usb-stick", ["USB stick", "USB drive", "flash drive", "thumb drive", "pen drive", "USB key"], 12, 12.5, 4.5,
    "a USB-A plug (12 x 4.5 mm, about 12 mm long): the stick is held by its plug"),
  card("usb-c-stick", ["USB C stick", "USB C drive", "USB C flash drive"], 8.4, 7, 2.6, "a USB-C plug (8.4 x 2.6 mm, about 7 mm long)"),
  card("cf-card", ["CF card", "CompactFlash", "Compact Flash card"], 43, 36, 3.3, "a CompactFlash card (43 x 36 x 3.3 mm)"),
  card("cfexpress-b", ["CFexpress", "CFexpress B", "XQD", "XQD card"], 38.5, 29.6, 3.8, "a CFexpress type B or XQD card (38.5 x 29.6 x 3.8 mm)"),

  coin("us-quarter", ["quarter", "quarters", "US quarter"], 24.26, 1.75),
  coin("us-dime", ["dime", "dimes"], 17.91, 1.35),
  coin("us-nickel", ["nickel", "nickels"], 21.21, 1.95),
  coin("us-penny", ["penny", "pennies", "cent coin"], 19.05, 1.52),
  coin("us-half-dollar", ["half dollar", "half dollars"], 30.61, 2.15),
  coin("us-dollar-coin", ["dollar coin", "dollar coins", "sacagawea dollar"], 26.49, 2.0),
  coin("euro-2", ["2 euro", "2 euro coin", "euro coin", "euro coins", "euros"], 25.75, 2.2),
  coin("euro-1", ["1 euro", "1 euro coin"], 23.25, 2.33),
  coin("gbp-1", ["pound coin", "1 pound coin", "pound coins"], 23.43, 2.8),
  coin("gbp-2", ["2 pound coin", "two pound coin"], 28.4, 2.5),
  coin("cad-loonie", ["loonie", "loonies"], 26.5, 1.95),
  coin("cad-toonie", ["toonie", "toonies"], 28, 1.8),
];
