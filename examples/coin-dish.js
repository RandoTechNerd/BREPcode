// Rounded coin dish — the "manual fillets" tutorial model.
//
//   node src/cli.js examples/coin-dish.js -o dish.stl
//
// There is no fillet() in a mesh kernel, but three composable tricks give you
// smooth everywhere (the same tricks used in the LTT collar):
//
//   1. ROUNDED PUCK   — union a narrower core, a shorter wide band, and two
//                       tori: the outer edges become perfect quarter-rounds.
//   2. SPHERE SCOOP   — subtract one big sphere: an instant organic bowl.
//   3. EDGE ROLL      — subtract a thin torus along a sharp rim to roll it.

import {
  cylinder, sphere, torus, union, difference, translate,
} from "brepscript";

export default (params = {}) => {
  const R = params.radius ?? 40;      // dish radius
  const H = params.height ?? 16;      // dish height
  const rr = params.round ?? 6;       // outer roundover radius
  const scoopR = params.scoopR ?? 60; // bowl curvature (bigger = shallower)
  const depth = params.depth ?? 10;   // bowl depth
  const FN = params.$fn ?? 96;

  // 1. the rounded puck: core + band + two torus roundovers
  const puck = union(
    cylinder({ r: R - rr, h: H, $fn: FN }),
    translate([0, 0, rr], cylinder({ r: R, h: H - 2 * rr, $fn: FN })),
    translate([0, 0, rr], torus({ r: R - rr, tube: rr, $fn: FN })),
    translate([0, 0, H - rr], torus({ r: R - rr, tube: rr, $fn: FN })),
  );

  // 2. the scoop: one big sphere, centred high, carves the bowl
  const scoop = translate([0, 0, H - depth + scoopR], sphere({ r: scoopR, $fn: FN }));

  // rim radius where the scoop meets the top face (for the edge roll)
  const rimR = Math.sqrt(scoopR * scoopR - (scoopR - depth) ** 2);

  // 3. the edge roll: a slim torus rolls the scoop's sharp rim
  const rimRoll = translate([0, 0, H], torus({ r: rimR, tube: 2, $fn: FN }));

  return difference(puck, scoop, rimRoll);
};
