// Catalog category: kids. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the kids category alone, so parallel work on other
// categories never touches it.

import fidgetSpinner from "./fidget-spinner.js";
import spinningTop from "./spinning-top.js";
import ringToy from "./ring-toy.js";
import buildingBrick from "./building-brick.js";
import tangram from "./tangram.js";
import mazePuzzle from "./maze-puzzle.js";
import blockPuzzle from "./block-puzzle.js";
import gameDice from "./game-dice.js";
import marbleRun from "./marble-run.js";
import boomerang from "./boomerang.js";
import toyWheels from "./toy-wheels.js";
import bubbleWand from "./bubble-wand.js";

export const FAMILIES = [fidgetSpinner, spinningTop, ringToy, buildingBrick, tangram, mazePuzzle, blockPuzzle,
  gameDice, marbleRun, boomerang, toyWheels, bubbleWand];

// ---- real objects the kids families are sized from
//
//   bearing  a ball bearing pressed into a spinner: od, bore, w (width).
//   coin     a coin used as a spinner weight: d, t.
//   marble   a marble a run or maze has to pass: d.
//   axle     a skewer, dowel or rod a toy wheel turns on: d.
//   brick    the common stud-brick system (for reference): pitch, stud, h, plate.
//
// Sources: bearings by ISO 15 (608: 8 x 22 x 7) and the inch R188 (1/4 x 1/2 x
// 3/16 in); coins from the US Mint, the ECB and the Royal Mint; marbles are
// sold as 5/8 in (16 mm) standard and 1 in (25 mm) shooters. The brick system's
// public measurements: 8 mm stud pitch, 4.8 mm studs, 9.6 mm bricks of three
// 3.2 mm plates.
//
// Small-parts note for toys: a part that fits inside a 31.7 mm cylinder
// (US 16 CFR 1501) is a choking hazard for children under 3. Bearings, coins,
// marbles and the smallest bricks all are.

const bearing = (id, names, od, bore, w, note) => ({ id, kind: "bearing", names, dims: { od, bore, w }, label: names[0], note });
const coin = (id, names, d, t, note) => ({ id, kind: "coin", names, dims: { d, t }, label: names[0], note });
const marble = (id, names, d, note) => ({ id, kind: "marble", names, dims: { d }, label: names[0], note });
const axle = (id, names, d, note) => ({ id, kind: "axle", names, dims: { d }, label: names[0], note });

export const SPECS = [
  bearing("608-bearing", ["608 bearing", "608", "608zz", "skate bearing", "skateboard bearing", "608 bearings"], 22, 8, 7, "a 608 skate bearing (22 mm across, 7 mm thick)"),
  bearing("688-bearing", ["688 bearing", "688"], 16, 8, 5, "a 688 bearing (16 mm across, 5 mm thick)"),
  bearing("r188-bearing", ["r188 bearing", "r188", "r 188"], 12.7, 6.35, 4.76, "an R188 spinner bearing (1/2 in across, 3/16 in thick)"),

  coin("us-quarter", ["quarter", "quarters", "us quarter", "25 cent coin"], 24.26, 1.75, "a US quarter (24.26 mm)"),
  coin("us-nickel", ["nickel", "nickels", "us nickel"], 21.21, 1.95, "a US nickel (21.21 mm)"),
  coin("us-penny", ["penny", "pennies", "us penny"], 19.05, 1.52, "a US penny (19.05 mm)"),
  coin("euro-1", ["1 euro coin", "euro coin", "one euro"], 23.25, 2.33, "a 1 euro coin (23.25 mm)"),
  coin("euro-2", ["2 euro coin", "two euro"], 25.75, 2.2, "a 2 euro coin (25.75 mm)"),
  coin("uk-pound", ["pound coin", "1 pound coin"], 23.43, 2.8, "a UK pound coin (23.43 mm across its corners)"),

  marble("marble", ["marble", "marbles", "glass marble", "16 mm marble", "standard marble"], 16, "a standard 5/8 in glass marble (16 mm)"),
  marble("shooter-marble", ["shooter marble", "big marble", "25 mm marble", "large marble"], 25, "a 1 in shooter marble (25 mm)"),
  marble("mini-marble", ["mini marble", "peewee marble", "small marble"], 13, "a 1/2 in peewee marble (13 mm)"),

  axle("bamboo-skewer", ["bamboo skewer", "skewer", "kebab skewer", "bbq skewer"], 3, "a bamboo skewer (about 3 mm)"),
  axle("eighth-inch-dowel", ["1 8 inch dowel", "1 8 dowel", "eighth inch dowel"], 3.2, "a 1/8 in dowel (3.2 mm)"),
  axle("quarter-inch-dowel", ["1 4 inch dowel", "quarter inch dowel", "1 4 dowel"], 6.35, "a 1/4 in dowel (6.35 mm)"),
  axle("pencil-axle", ["pencil", "wooden pencil"], 7.5, "a wooden pencil (about 7.5 mm across)"),
  axle("rod-3mm", ["3 mm rod", "3 mm steel rod", "3 mm axle"], 3, "a 3 mm rod"),
  axle("rod-4mm", ["4 mm rod", "4 mm axle"], 4, "a 4 mm rod"),

  { id: "stud-brick-system", kind: "brick", names: ["stud brick system", "building brick system", "toy brick system"],
    dims: { pitch: 8, stud: 4.8, h: 9.6, plate: 3.2 }, label: "the common stud-brick system",
    note: "studs 4.8 mm across on an 8 mm pitch; a brick is 9.6 mm, three 3.2 mm plates" },
];
