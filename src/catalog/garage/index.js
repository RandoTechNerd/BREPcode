// Catalog category: garage. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the garage category alone, so parallel work on other
// categories never touches it.
//
// Sizes are standards where one exists (socket drive squares, PVC pipe OD per
// ASTM D1785 schedule 40, saw and grinder arbor bores, bench-dog holes) and the
// maker's published numbers otherwise. Hose sizes are the trap: a "2-1/2 inch"
// shop-vac hose ends in a cuff that measures 2-1/4 inch, so the spec gives
// what the PART meets, and the note says so.

import broomHolder from "./broom-holder.js";
import toolRack from "./tool-rack.js";
import bitIndex from "./bit-index.js";
import socketRail from "./socket-rail.js";
import hoseAdapter from "./hose-adapter.js";
import ropeWinder from "./rope-winder.js";
import sandingBlock from "./sanding-block.js";
import bladePeg from "./blade-peg.js";
import ladderHook from "./ladder-hook.js";
import benchDog from "./bench-dog.js";
import batteryHolder from "./battery-holder.js";

export const FAMILIES = [broomHolder, toolRack, bitIndex, socketRail, hoseAdapter, ropeWinder, sandingBlock, bladePeg,
  ladderHook, benchDog, batteryHolder];

// socket drive squares: w = the square across its flats, p = a rail spacing that clears that drive's sockets
const drive = (id, names, w, p, note) => ({ id, kind: "socket-drive", names, dims: { w, p }, label: names[0], note });
// hoses and pipes: od = something the part slips OVER, id = something it goes INTO
const hose = (id, names, dims, note) => ({ id, kind: "hose", names, dims, label: names[0], note });
// a centre hole something hangs by: saw-blade and grinder arbors, tape cores
const bore = (id, kind, names, d, note) => ({ id, kind, names, dims: { d }, label: names[0], note });
// cordless tool packs, outside size: l x w x h, from the maker's published spec
const pack = (id, names, l, w, h, note) => ({ id, kind: "battery-pack", names, dims: { l, w, h }, label: names[0], note });

export const SPECS = [
  drive("drive-1-4", ["1/4 drive", "1/4 inch drive", "quarter inch drive", "1/4 sockets", "1/4 inch sockets"], 6.35, 18,
    "1/4 inch drive (6.35 mm square)"),
  drive("drive-3-8", ["3/8 drive", "3/8 inch drive", "3/8 sockets", "3/8 inch sockets"], 9.525, 26,
    "3/8 inch drive (9.53 mm square)"),
  drive("drive-1-2", ["1/2 drive", "1/2 inch drive", "half inch drive", "1/2 sockets", "1/2 inch sockets"], 12.7, 34,
    "1/2 inch drive (12.7 mm square)"),
  drive("drive-3-4", ["3/4 drive", "3/4 inch drive", "3/4 sockets", "3/4 inch sockets"], 19.05, 50,
    "3/4 inch drive (19.05 mm square)"),

  hose("shop-vac-hose", ["shop vac hose", "shop vac", "2 1/2 inch shop vac hose", "2.5 inch shop vac hose", "2 1/2 inch vac hose", "wet dry vac hose"],
    { od: 57.2 }, "a 2-1/2 inch shop-vac hose, whose cuff measures 2-1/4 inch (57.2 mm) across; labels are nominal, so caliper yours"),
  hose("dust-hose-4in", ["4 inch dust collection hose", "4 inch dust hose", "4 inch dust collector hose", "dust collector hose"],
    { id: 101.6 }, "a 4 inch dust-collection hose (4 inch, 101.6 mm, bore)"),
  hose("dust-port-4in", ["4 inch dust port", "4 inch dust collection port", "4 inch blast gate", "4 inch port"],
    { od: 101.6 }, "a 4 inch dust port or fitting (4 inch, 101.6 mm, outside)"),
  hose("pvc-1-25in", ["1 1/4 inch pvc", "1 1/4 pvc", "1.25 inch pvc"], { od: 42.16 }, "1-1/4 inch schedule 40 PVC pipe (42.2 mm outside)"),
  hose("pvc-1-5in", ["1 1/2 inch pvc", "1 1/2 pvc", "1.5 inch pvc"], { od: 48.26 }, "1-1/2 inch schedule 40 PVC pipe (48.3 mm outside)"),
  hose("pvc-2in", ["2 inch pvc", "2 pvc", "2 inch pvc pipe"], { od: 60.33 }, "2 inch schedule 40 PVC pipe (60.3 mm outside)"),
  hose("pvc-3in", ["3 inch pvc", "3 inch pvc pipe"], { od: 88.9 }, "3 inch schedule 40 PVC pipe (88.9 mm outside)"),
  hose("pvc-4in", ["4 inch pvc", "4 inch pvc pipe"], { od: 114.3 }, "4 inch schedule 40 PVC pipe (114.3 mm outside)"),

  bore("arbor-5-8", "arbor", ["5/8 arbor", "5/8 inch arbor", "5/8 inch bore", "10 inch saw blade", "7 1/4 inch saw blade", "table saw blade",
    "circular saw blade", "saw blade"], 15.875, "a 5/8 inch (15.9 mm) arbor: 7-1/4, 8-1/4 and 10 inch blades"),
  bore("arbor-1in", "arbor", ["1 inch arbor", "1 inch bore", "12 inch saw blade", "miter saw blade"], 25.4,
    "a 1 inch (25.4 mm) arbor, usual on 12 inch blades (some are 5/8: check yours)"),
  bore("arbor-30mm", "arbor", ["30mm arbor", "30 mm bore", "30mm bore"], 30, "a 30 mm metric arbor"),
  bore("arbor-20mm", "arbor", ["20mm arbor", "20 mm bore", "20mm bore"], 20, "a 20 mm metric arbor"),
  bore("arbor-7-8", "arbor", ["7/8 arbor", "7/8 inch arbor", "grinder disc", "angle grinder disc", "cutoff wheel", "cut off wheel", "flap disc",
    "grinding wheel", "grinding disc"], 22.23, "a 7/8 inch (22.2 mm) arbor: 4-1/2 to 5 inch grinder discs"),
  bore("core-3in", "core", ["duct tape", "masking tape", "painters tape", "painter's tape", "packing tape", "3 inch core", "tape roll"], 76.2,
    "a 3 inch (76.2 mm) tape core: duct, masking and packing tape"),

  { id: "dog-3-4", kind: "dog-hole", names: ["3/4 dog hole", "3/4 inch dog hole", "3/4 inch dog holes", "19mm dog hole"], dims: { d: 19.05 },
    label: "3/4 inch dog hole", note: "a 3/4 inch (19.05 mm) dog hole" },
  { id: "dog-20", kind: "dog-hole", names: ["20mm dog hole", "20 mm dog hole", "20mm dog holes", "20mm holes", "mft table", "mft top", "mft holes"], dims: { d: 20 },
    label: "20 mm dog hole", note: "a 20 mm dog hole (MFT-style tops)" },

  // only packs whose size the maker publishes; the rest are asked for (see battery-holder)
  pack("bosch-gba-18v-4ah", ["bosch gba 18v", "bosch 18v battery", "bosch 18v", "bosch battery", "gba 18v 4.0ah", "bosch gba"], 115, 74, 56,
    "a Bosch GBA 18V 4.0Ah pack (115 x 74 x 56 mm, Bosch datasheet)"),
  pack("makita-bl1850b", ["makita bl1850b", "bl1850b", "bl1850", "makita 18v battery", "makita lxt battery", "makita battery", "makita 18v"], 113, 75, 62,
    "a Makita BL1850B 5.0Ah pack (113 x 75 x 62 mm); the 3Ah BL1830B is thinner and fits loosely"),
];
