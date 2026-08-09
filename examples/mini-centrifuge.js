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
//
// A FIXED-ANGLE rotor leans each tube so its CLOSED TIP points down and
// OUTWARD. That is the whole point of the angle: spinning throws the pellet to
// the outer wall near the bottom of the tube, where you can pour the liquid off
// it. Tilt them the other way — mouth outward, tip toward the middle — and the
// pellet forms on the wrong wall, up near the cap, and pours straight back out.
const TUBE_D = 11.4;                 // 1.5 mL tube is 10.8 across the rim, + fit
const TUBE_L = 39;                   // whole tube including its cap
const TILT = 20;                     // degrees from vertical
const TUBES = 6;
const ROTOR_R = 36, ROTOR_H = 30;
const MOUTH_R = 17;                  // where a pocket breaks the top face — INNER
const POCKET = 26;                   // how deep the tube sits

const ROTOR_Z = GEAR_Z + GEAR_H + 2;

// A tube is longer than its pocket, so 13 mm of it stands proud of the rotor,
// leaning inward as it rises. THAT is what the crank has to clear, not the
// rotor — the disc is 12 mm below the top of the tubes standing in it. Missing
// this is how a handle ends up flicking the caps off on every turn.
const STICKS_OUT = TUBE_L - POCKET;
// The last term is the one that is easy to drop: the tube's top face is a
// TILTED circle, so its high edge stands (D/2)·sin(TILT) above where the axis
// ends. Leaving it out put the top 1.9 mm lower than the mesh actually
// measures, and ate most of the clearance that was supposed to be there.
const TUBE_TOP = ROTOR_Z + ROTOR_H
  + STICKS_OUT * Math.cos(TILT * Math.PI / 180)
  + (TUBE_D / 2) * Math.sin(TILT * Math.PI / 180);
const ARM_Z = TUBE_TOP + 5;          // measured off the tubes, not the disc

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

// One pocket, standing on its tip. The tip sits at the OUTER radius and the
// mouth leans inward as it rises, so rotate by −TILT: that tips the cylinder's
// +Z axis toward −x, which is up-and-inward from the tip.
//
// Six of them spread apart as they go down, so the tight spot is the MOUTH
// circle — 17 mm between axes there, which clears an 11.4 mm tube.
const tipR = MOUTH_R + POCKET * Math.sin(TILT * Math.PI / 180);
const tipZ = ROTOR_H - POCKET * Math.cos(TILT * Math.PI / 180);
const pocket = (i) => rotate([0, 0, (360 * i) / TUBES],
  translate([tipR, 0, tipZ],
    rotate([0, -TILT, 0], union(
      // run long so it breaks the top face cleanly
      cylinder({ r: TUBE_D / 2, h: POCKET + 25, $fn: 40 }),
      // 1.5 mL tubes are conical at the bottom
      translate([0, 0, -5], cone({ r1: 0.6, r2: TUBE_D / 2, h: 5, $fn: 40 })),
    ))));

const rotor = translate([g.centre, 0, ROTOR_Z], difference(
  union(
    cylinder({ r: ROTOR_R, h: ROTOR_H, $fn: 96 }),
    cylinder({ r: 8, h: ROTOR_H + 4, $fn: 48 }),      // hub around the shaft
  ),
  translate([0, 0, -0.5], cylinder({ r: SHAFT / 2 + 0.15, h: ROTOR_H + 6, $fn: 32 })),
  ...Array.from({ length: TUBES }, (_, i) => pocket(i)),
));

// Six ghost tubes, to SEE that the closed tips point outward and that the caps
// stand clear of the crank. Off by default — they are not part of the print.
const SHOW_TUBES = false;
// ghostTube, not tube: tube() is a DSL function (it sweeps a profile along a
// path), and `const tube` shadows it into a redeclaration error.
const ghostTube = (i) => rotate([0, 0, (360 * i) / TUBES],
  translate([tipR, 0, tipZ],
    rotate([0, -TILT, 0], union(
      cylinder({ r: TUBE_D / 2 - 0.3, h: TUBE_L, $fn: 32 }),
      translate([0, 0, -4], cone({ r1: 0.8, r2: TUBE_D / 2 - 0.3, h: 4, $fn: 32 })),
    ))));
const tubes = SHOW_TUBES
  ? [translate([g.centre, 0, ROTOR_Z],
      union(...Array.from({ length: TUBES }, (_, i) => ghostTube(i))))]
  : [];

// Still missing, and worth saying out loud rather than pretending otherwise:
// a LID (a rotor that can throw a tube wants one), and bearings — the rotor
// runs on a bare printed hub here, which will wear oval. A 625 (5 mm bore)
// pressed into the hub and the base post is the fix.
return group(base, crankGear, crank, pinion, rotor, ...tubes);
};
