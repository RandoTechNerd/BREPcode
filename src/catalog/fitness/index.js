// Catalog category: fitness. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the fitness category alone, so parallel work on other
// categories never touches it.

import pushUpHandles from "./push-up-handles.js";
import yogaBlock from "./yoga-block.js";
import ballStand from "./ball-stand.js";
import sportsWallRack from "./sports-wall-rack.js";
import bandAnchor from "./band-anchor.js";
import jumpRopeHandles from "./jump-rope-handles.js";
import treadmillHolder from "./treadmill-holder.js";
import dumbbellCradle from "./dumbbell-cradle.js";
import platePeg from "./plate-peg.js";
import puckStand from "./puck-stand.js";

export const FAMILIES = [pushUpHandles, yogaBlock, ballStand, sportsWallRack, bandAnchor, jumpRopeHandles,
  treadmillHolder, dumbbellCradle, platePeg, puckStand];

// ---- real objects the fitness families are sized from
//
//   ball        a ball on a display ring. d = diameter.
//   disc        a flat round thing stood in a slot. d = diameter, t = thickness.
//   plate-bore  a weight plate's centre hole. d = hole diameter.
//   bar         a bar's sleeve, for a floor cradle. d = sleeve diameter.
//   grip        a racket or paddle handle that drops between two pegs. d = handle width.
//
// Sources: ball sizes from the governing rules (USGA/R&A golf ball 42.67 mm
// minimum; ITF tennis ball 6.54-6.86 cm; ITTF 40 mm table tennis ball; MLB
// 9-9.25 in circumference; USA Pickleball 2.87-2.97 in; FIFA size 5 68-70 cm
// circumference; FIBA size 7 74.9-78 cm; FIVB 65-67 cm; USBC bowling ball 8.5 in;
// WPA pool ball 2-1/4 in), each taken at its middle. Puck: 3 in x 1 in (NHL).
// Plates: Olympic plates have a 2 in (50.8 mm) hole on a 50 mm sleeve;
// standard "1 inch" plates about 1-1/8 in. Handle widths vary with grip size
// and tape; these are typical, and the pegs leave room.

const ball = (id, names, d, note) => ({ id, kind: "ball", names, dims: { d }, label: names[0], note });
const disc = (id, names, d, t, note) => ({ id, kind: "disc", names, dims: { d, t }, label: names[0], note });
const bore = (id, names, d, note) => ({ id, kind: "plate-bore", names, dims: { d }, label: names[0], note });
const bar = (id, names, d, note) => ({ id, kind: "bar", names, dims: { d }, label: names[0], note });
const grip = (id, names, d, note) => ({ id, kind: "grip", names, dims: { d }, label: names[0], note });

export const SPECS = [
  ball("golf-ball", ["golf ball", "golf balls"], 42.7, "a golf ball (42.7 mm)"),
  ball("table-tennis-ball", ["table tennis ball"], 40, "a table tennis ball (40 mm)"),
  ball("squash-ball", ["squash ball"], 40, "a squash ball (40 mm)"),
  ball("racquetball", ["racquetball", "racquet ball"], 57, "a racquetball (57 mm)"),
  ball("billiard-ball", ["billiard ball", "pool ball", "8 ball", "eight ball"], 57.2, "a pool ball (2-1/4 in, 57 mm)"),
  ball("snooker-ball", ["snooker ball"], 52.5, "a snooker ball (52.5 mm)"),
  ball("lacrosse-ball", ["lacrosse ball", "massage ball"], 63.5, "a lacrosse ball (63.5 mm)"),
  ball("tennis-ball", ["tennis ball", "tennis balls"], 67, "a tennis ball (67 mm)"),
  ball("cricket-ball", ["cricket ball"], 72, "a cricket ball (72 mm)"),
  ball("baseball", ["baseball", "base ball", "signed baseball"], 74, "a baseball (74 mm)"),
  ball("pickleball", ["pickleball", "pickle ball"], 74, "a pickleball (74 mm)"),
  ball("softball", ["softball", "12 inch softball"], 97, "a 12 inch softball (97 mm)"),
  ball("bocce-ball", ["bocce ball", "bocce"], 107, "a bocce ball (107 mm)"),
  ball("volleyball", ["volleyball", "volley ball"], 210, "a volleyball (210 mm)"),
  ball("soccer-ball", ["soccer ball", "size 5 soccer ball", "size 5 football", "match ball"], 220, "a size 5 soccer ball (220 mm)"),
  ball("soccer-ball-4", ["size 4 soccer ball", "size 4 football"], 205, "a size 4 soccer ball (205 mm)"),
  ball("soccer-ball-3", ["size 3 soccer ball", "size 3 football"], 188, "a size 3 soccer ball (188 mm)"),
  ball("basketball", ["basketball", "size 7 basketball"], 241, "a size 7 basketball (241 mm)"),
  ball("basketball-6", ["size 6 basketball", "womens basketball"], 232, "a size 6 basketball (232 mm)"),
  ball("basketball-5", ["size 5 basketball", "youth basketball"], 223, "a size 5 basketball (223 mm)"),
  ball("bowling-ball", ["bowling ball"], 216, "a ten-pin bowling ball (8.5 in, 216 mm)"),

  disc("hockey-puck", ["hockey puck", "ice hockey puck", "puck"], 76.2, 25.4, "an ice hockey puck (3 x 1 in)"),
  disc("disc-golf-disc", ["disc golf disc", "disc golf driver", "golf disc", "disc golf putter"], 212, 20, "a disc golf disc (about 212 mm across, 20 mm tall)"),
  disc("ultimate-disc", ["ultimate disc", "flying disc", "175 g disc"], 274, 32, "a 175 g ultimate disc (274 mm across, 32 mm tall)"),
  disc("race-medal", ["race medal", "finisher medal", "marathon medal"], 80, 5, "a typical race finisher's medal (about 80 mm, 5 mm thick)"),
  disc("challenge-coin", ["challenge coin", "military coin"], 45, 3.5, "a challenge coin (usually 38-50 mm; 45 x 3.5 mm here)"),
  disc("poker-chip", ["poker chip", "casino chip"], 39, 3.3, "a casino poker chip (39 x 3.3 mm)"),

  bore("olympic-plate", ["olympic plate", "olympic plates", "olympic weight plate", "bumper plate", "bumper plates", "2 inch plate"], 50.8,
    "an Olympic plate (2 in, 50.8 mm hole)"),
  bore("standard-plate", ["standard plate", "standard plates", "standard weight plate", "1 inch plate", "1 inch plates"], 28.6,
    "a standard 1 inch plate (about 1-1/8 in, 28.6 mm hole)"),

  bar("olympic-barbell", ["olympic barbell", "olympic bar", "barbell", "ez curl bar"], 50, "an Olympic bar's 50 mm sleeve"),
  bar("standard-barbell", ["standard barbell", "standard bar", "1 inch bar"], 25.4, "a standard 1 inch bar"),

  grip("tennis-racket", ["tennis racket", "tennis racquet"], 34, "a tennis racket handle (about 34 mm across)"),
  grip("pickleball-paddle", ["pickleball paddle"], 34, "a pickleball paddle handle (about 34 mm across)"),
  grip("table-tennis-paddle", ["table tennis paddle", "table tennis bat", "table tennis racket"], 28, "a table tennis paddle handle (about 28 mm)"),
  grip("badminton-racket", ["badminton racket", "badminton racquet"], 26, "a badminton racket handle (about 26 mm)"),
  grip("squash-racket", ["squash racket", "squash racquet"], 31, "a squash racket handle (about 31 mm)"),
  grip("lacrosse-stick", ["lacrosse stick", "lacrosse shaft"], 26, "a lacrosse shaft (1 in, about 26 mm)"),
];
