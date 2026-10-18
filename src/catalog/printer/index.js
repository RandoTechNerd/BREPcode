// Catalog category: printer. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the printer category alone, so parallel work on other
// categories never touches it.

import spoolHolder from "./spool-holder.js";
import spoolAdapter from "./spool-adapter.js";
import filamentClip from "./filament-clip.js";
import filamentGuide from "./filament-guide.js";
import nozzleHolder from "./nozzle-holder.js";
import calibrationCube from "./calibration-cube.js";
import toleranceTest from "./tolerance-test.js";
import bridgeTest from "./bridge-test.js";
import overhangTest from "./overhang-test.js";
import tempTower from "./temp-tower.js";
import printerFoot from "./printer-foot.js";
import bedClip from "./bed-clip.js";
import filamentSwatch from "./filament-swatch.js";

export const FAMILIES = [spoolHolder, spoolAdapter, filamentClip, filamentGuide, nozzleHolder, calibrationCube,
  toleranceTest, bridgeTest, overhangTest, tempTower, printerFoot, bedClip, filamentSwatch];

// Filament spools: outside diameter, width and hub hole. Brands differ by a
// few millimetres (a 1 kg hub hole runs 52 to 56 mm), so these are the
// common sizes and the parts that use them leave room.
const spool = (id, names, d, w, bore, note) => ({ id, kind: "spool", names, dims: { d, w, bore }, label: names[0], note });

// Aluminium frame extrusions: the profile's size and its slot opening
// (B-type 20 series: 6 mm; 30 and 40 series: 8 mm).
const extrusion = (id, names, size, slot) => ({ id, kind: "extrusion", names, dims: { size, slot }, label: names[0],
  note: `${names[0]} extrusion (${size} mm square, ${slot} mm slot)` });

export const SPECS = [
  spool("spool-1kg", ["1kg spool", "1 kg spool", "standard spool", "1kg filament spool", "1kg roll"], 200, 65, 53,
    "a typical 1 kg spool (200 mm across, about 65 mm wide, 52 to 56 mm hub hole)"),
  spool("spool-mini", ["250g spool", "250 g spool", "sample spool", "mini spool", "small spool", "0.5kg spool", "500g spool"], 140, 45, 32,
    "a small 250 to 500 g spool (about 140 mm across, 45 mm wide, 32 mm hub hole)"),
  spool("spool-3kg", ["3kg spool", "3 kg spool", "big spool", "large spool", "3kg roll"], 300, 100, 53,
    "a 3 kg spool (about 300 mm across, 100 mm wide, 52 mm hub hole)"),
  spool("spool-cardboard", ["cardboard spool", "paper spool", "recycled spool"], 200, 68, 56,
    "a 1 kg cardboard spool (200 mm across, about 68 mm wide, 56 mm hub hole)"),

  extrusion("extrusion-2020", ["2020", "2020 extrusion", "20x20 extrusion", "2040", "ender 3", "ender", "v slot", "v-slot"], 20, 6),
  extrusion("extrusion-3030", ["3030", "3030 extrusion", "30x30 extrusion"], 30, 8),
  extrusion("extrusion-4040", ["4040", "4040 extrusion", "40x40 extrusion"], 40, 8),
];
