// Catalog category: garden. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the garden category alone, so parallel work on other
// categories never touches it.

import plantPot from "./plant-pot.js";
import selfWateringPlanter from "./self-watering-planter.js";
import hangingPlanter from "./hanging-planter.js";
import wallPlanter from "./wall-planter.js";
import windowBox from "./window-box.js";
import seedlingTray from "./seedling-tray.js";
import plantMarker from "./plant-marker.js";
import plantClip from "./plant-clip.js";
import hoseGuide from "./hose-guide.js";
import bottleWaterer from "./bottle-waterer.js";
import birdhouse from "./birdhouse.js";
import birdFeeder from "./bird-feeder.js";
import rainGauge from "./rain-gauge.js";
import potFeet from "./pot-feet.js";

export const FAMILIES = [plantPot, selfWateringPlanter, hangingPlanter, wallPlanter, windowBox, seedlingTray,
  plantMarker, plantClip, hoseGuide, bottleWaterer, birdhouse, birdFeeder, rainGauge, potFeet];

// ---- real objects the garden families are sized from
//
//   stake  a cane, rod or rebar a clip or spool goes round. d = diameter.
//   neck   a bottle's threaded neck a push-on socket fits over. d = thread
//          outside diameter, h = threaded length down to the support ring.
//   bird   a nest box species: hole = entrance diameter, floor = inside floor
//          (square), height = wall height used here, holeH = hole centre
//          above the floor.
//
// Sources: rebar by ASTM A615 bar size (#3 = 3/8 in, #4 = 1/2 in nominal);
// soda and water bottles by the PCO 1881 neck finish (thread 27.4 mm across);
// bird sizes from the Cornell Lab NestWatch and Audubon nest box tables.
// Their recommended box heights run to 10-12 in for some birds; these use
// the low end so a box prints on a 256 mm bed, which the birds accept.

const stake = (id, names, d, note) => ({ id, kind: "stake", names, dims: { d }, label: names[0], note });
// "bottle-neck", not "neck": the wall category's "neck" is an instrument's
// nut width, and a kind means one shape across the whole catalog.
const neck = (id, names, d, h, note) => ({ id, kind: "bottle-neck", names, dims: { d, h }, label: names[0], note });
const bird = (id, names, hole, floor, height, holeH, note) => ({ id, kind: "bird", names, dims: { hole, floor, height, holeH }, label: names[0], note });
const IN = 25.4;

export const SPECS = [
  stake("bamboo-cane", ["bamboo cane", "bamboo stake", "garden cane", "bamboo pole"], 10, "a garden bamboo cane (sold 6 to 16 mm; 10 mm is common)"),
  stake("rebar-3", ["3 rebar", "3 8 rebar", "3 8 inch rebar", "10 mm rebar"], 9.5, "#3 rebar (3/8 inch, 9.5 mm)"),
  stake("rebar-4", ["rebar", "4 rebar", "1 2 rebar", "half inch rebar", "1 2 inch rebar"], 12.7, "#4 rebar (1/2 inch, 12.7 mm), the commonest garden stake"),
  stake("steel-garden-stake", ["garden stake", "steel garden stake", "green garden stake", "coated garden stake"], 11, "a plastic-coated steel garden stake (11 mm, sold as 7/16 inch)"),
  stake("dowel-half-inch", ["1 2 inch dowel", "half inch dowel"], 12.7, "a 1/2 inch wooden dowel (12.7 mm)"),

  neck("soda-bottle-neck", ["soda bottle", "2 liter bottle", "two liter bottle", "2 litre bottle", "pop bottle", "plastic bottle",
    "water bottle neck", "pco 1881"], 27.4, 17, "a soda or water bottle neck (PCO 1881 finish, thread 27.4 mm across)"),
  neck("wine-bottle-neck", ["wine bottle neck", "wine bottle"], 29.5, 30, "a 750 ml wine bottle neck (about 29.5 mm across at the lip)"),

  bird("chickadee", ["chickadee", "black capped chickadee", "carolina chickadee"], 1.125 * IN, 4 * IN, 8 * IN, 6 * IN,
    "a chickadee box: 1-1/8 inch hole, 4 x 4 inch floor, hole 6 inch up"),
  bird("house-wren", ["house wren", "wren"], 1.125 * IN, 4 * IN, 6 * IN, 4.5 * IN,
    "a house wren box: 1-1/8 inch hole (keeps sparrows out), 4 x 4 inch floor"),
  bird("eastern-bluebird", ["eastern bluebird", "bluebird", "western bluebird"], 1.5 * IN, 5 * IN, 8 * IN, 6 * IN,
    "a bluebird box: 1-1/2 inch hole, 5 x 5 inch floor, hole 6 inch up"),
  bird("tree-swallow", ["tree swallow", "swallow"], 1.5 * IN, 5 * IN, 6.5 * IN, 4.5 * IN,
    "a tree swallow box: 1-1/2 inch hole, 5 x 5 inch floor"),
  bird("tufted-titmouse", ["tufted titmouse", "titmouse"], 1.25 * IN, 4 * IN, 8.5 * IN, 6.5 * IN,
    "a titmouse box: 1-1/4 inch hole, 4 x 4 inch floor (the tables say 10-12 in tall; this is shorter to print)"),
  bird("white-breasted-nuthatch", ["white breasted nuthatch", "nuthatch"], 1.25 * IN, 4 * IN, 8.5 * IN, 6.5 * IN,
    "a nuthatch box: 1-1/4 inch hole, 4 x 4 inch floor"),
  bird("house-finch", ["house finch", "finch"], 2 * IN, 6 * IN, 6 * IN, 4 * IN,
    "a house finch box: 2 inch hole, 6 x 6 inch floor"),
  bird("downy-woodpecker", ["downy woodpecker", "woodpecker"], 1.25 * IN, 4 * IN, 8.5 * IN, 6.5 * IN,
    "a downy woodpecker box: 1-1/4 inch hole, 4 x 4 inch floor (put wood shavings in it)"),
  bird("carolina-wren", ["carolina wren"], 1.5 * IN, 4 * IN, 6.5 * IN, 4.5 * IN,
    "a Carolina wren box: 1-1/2 inch hole, 4 x 4 inch floor"),
  bird("purple-martin", ["purple martin", "martin"], 2.125 * IN, 6 * IN, 6 * IN, 1.5 * IN,
    "a purple martin compartment: 2-1/8 inch hole only 1-1/2 inch above a 6 x 6 inch floor"),
  bird("prothonotary-warbler", ["prothonotary warbler", "warbler"], 1.25 * IN, 4 * IN, 6.5 * IN, 4.5 * IN,
    "a prothonotary warbler box: 1-1/4 inch hole, 4 x 4 inch floor"),
];
