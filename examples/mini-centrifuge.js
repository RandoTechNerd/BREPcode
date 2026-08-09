// Mini hand-crank centrifuge.
//
// Run:  node ../src/cli.js mini-centrifuge.js -o centrifuge.stl
//
//   crank  ->  51-tooth gear  ->  17-tooth pinion  ->  rotor, six 1.5 mL tubes
//
// The point of this example is the DRIVE DIRECTION. A centrifuge is a STEP-UP:
// you crank slowly and the rotor spins fast, so the BIG gear drives the small
// one — the opposite way round from a winch, where a small gear drives a big
// one for torque. Build it backwards and you get a centrifuge that will not
// spin, and nothing in the render tells you.
//
// Every position here comes out of gearMath(). Nothing is typed by hand, so
// the two axles cannot end up at a distance where the teeth grind or miss.

import {
  cube, cylinder, cone, union, difference, translate, rotate, hull, fillet, group,
  gear, gearWithHub, gearMath,
} from "brepscript";

export default () => {

// ---- the drive ------------------------------------------------------------
const M = 1.5;                       // one module for the whole machine
const CRANK_T = 51, ROTOR_T = 17;
const g = gearMath(M, CRANK_T, ROTOR_T);
// g.centre 51 mm exactly · g.ratioText "3:1 step-up" · g.speedFactor 3
// Three turns of the rotor per turn of the handle, turning the opposite way.
// 17 teeth is the floor: one fewer and gearMath warns that the pinion undercuts.

const GEAR_H = 6;
const DECK = 6;                      // base plate
const GEAR_Z = DECK + 2;             // gears float 2 mm clear of the deck
const SHAFT = 5;                     // 5 mm steel rod

// ---- the rotor ------------------------------------------------------------
const TUBE_D = 11.4;                 // 1.5 mL tube is 10.8 across the rim, + fit
const TILT = 20;                     // degrees from vertical
const TUBES = 6;
const ROTOR_R = 32, ROTOR_H = 28;
const MOUTH_R = 23;                  // where a pocket breaks the top face
const POCKET = 26;                   // how deep the tube sits

const ROTOR_Z = GEAR_Z + GEAR_H + 2;
// The crank arm sweeps over the rotor, so it has to clear the top of it.
const ARM_Z = ROTOR_Z + ROTOR_H + 4;

// ---- base -----------------------------------------------------------------
const X0 = -(g.gears[0].tip / 2) - 6;          // clear of the crank gear
const X1 = g.centre + ROTOR_R + 6;             // clear of the rotor
const BW = X1 - X0, BD = 2 * (ROTOR_R + 8);

const post = (x, h) => translate([x, 0, 0],
  difference(
    cylinder({ r: 7, h, $fn: 48 }),
    translate([0, 0, -0.5], cylinder({ r: SHAFT / 2 + 0.15, h: h + 1, $fn: 32 })),
  ));

const base = union(
  // NB: roundedCuboid() is JSCAD vocabulary, not BREPcode. Here a rounded box
  // is fillet() over a cube.
  translate([X0, -BD / 2, 0], fillet({ radius: 4 }, cube([BW, BD, DECK]))),
  post(0, GEAR_Z),
  post(g.centre, GEAR_Z),
);

// ---- crank gear + handle --------------------------------------------------
const crankGear = translate([0, 0, GEAR_Z],
  gearWithHub({ module: M, teeth: CRANK_T, h: GEAR_H,
    bore: SHAFT + 0.4, hub: 16, hubH: 5 }));

// 30, not 34: at 34 the knob passed 2.0 mm from the rotor hub, which is not a
// clearance on a printed arm that flexes. 30 leaves 6.
const ARM = 30;
const crank = translate([0, 0, GEAR_Z + GEAR_H], union(
  // the column carrying the arm up over the rotor
  difference(
    cylinder({ r: 6, h: ARM_Z - GEAR_Z - GEAR_H, $fn: 40 }),
    translate([0, 0, -0.5], cylinder({ r: SHAFT / 2 + 0.15, h: 60, $fn: 32 })),
  ),
  translate([0, 0, ARM_Z - GEAR_Z - GEAR_H], union(
    hull(
      cylinder({ r: 6, h: 6, $fn: 40 }),
      translate([ARM, 0, 0], cylinder({ r: 5, h: 6, $fn: 40 })),
    ),
    // knob, standing up so a finger can spin it
    translate([ARM, 0, 6], fillet({ radius: 2.5 }, cylinder({ r: 6, h: 18, $fn: 40 }))),
  )),
));

// ---- pinion + rotor -------------------------------------------------------
// Half a tooth of rotation so the teeth INTERLEAVE instead of colliding. Without
// it the two gears are drawn tip to tip and overlap, which renders beautifully
// and is a solid lump of plastic.
const pinion = translate([g.centre, 0, GEAR_Z],
  rotate([0, 0, 180 / ROTOR_T],
    gear({ module: M, teeth: ROTOR_T, h: GEAR_H, bore: SHAFT + 0.4 })));

// One tube pocket, standing on its tip and leaning out by TILT. Six of these
// converge as they go down — at 20° they stay 14.1 mm apart at the deepest
// point, which clears an 11.4 mm tube. Tilt them further and they merge.
const tipR = MOUTH_R - POCKET * Math.sin(TILT * Math.PI / 180);
const tipZ = ROTOR_H - POCKET * Math.cos(TILT * Math.PI / 180);
const pocket = (i) => rotate([0, 0, (360 * i) / TUBES],
  translate([tipR, 0, tipZ],
    rotate([0, TILT, 0], union(
      // run long so it breaks the top face cleanly
      cylinder({ r: TUBE_D / 2, h: POCKET + 25, $fn: 40 }),
      // 1.5 mL tubes are conical at the bottom
      translate([0, 0, -5], cone({ r1: 0.6, r2: TUBE_D / 2, h: 5, $fn: 40 })),
    ))));

const rotor = translate([g.centre, 0, ROTOR_Z], difference(
  union(
    cylinder({ r: ROTOR_R, h: ROTOR_H, $fn: 96 }),
    cylinder({ r: 9, h: ROTOR_H + 4, $fn: 48 }),      // hub around the shaft
  ),
  translate([0, 0, -0.5], cylinder({ r: SHAFT / 2 + 0.15, h: ROTOR_H + 6, $fn: 32 })),
  ...Array.from({ length: TUBES }, (_, i) => pocket(i)),
));

// Still missing, and worth saying out loud rather than pretending otherwise:
// a LID (a rotor that can throw a tube wants one), and bearings — the rotor
// runs on a bare printed hub here, which will wear oval. A 625 (5 mm bore)
// pressed into the hub and the base post is the fix.
return group(base, crankGear, crank, pinion, rotor);
};
