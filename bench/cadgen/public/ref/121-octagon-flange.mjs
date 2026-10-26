// A hand-built REFERENCE for CADGenBench public sample 121 (octagonal flange
// with a hub, sloped ribs and pockets), read off the public drawing by a
// person. The benchmark's real ground truth is private: this is NOT it. It
// exists so before/after runs on 121 get a CAD Score against the same
// yardstick. Where the drawing is ambiguous the choice is noted.
//
// The octagon is 300 across flats (the side view's 300.00; the holes at
// 136.54 sit 13.5 in from the flats); the 278.56 octagon is the pockets' outer
// edges (97.50 + 41.78 = 139.28).
// Frame: Z up, the hub's open end at z = 0, the plate z 50..65 (side view:
// 65 overall, 15 plate, 50 hub), the octagon's flats on X and Y.
import {
  cylinder, cube, union, difference, translate, rotate, polygon, linearExtrude, fillet,
} from "brepscript";

const AF = 300, T = 15, H = 65, ZP = H - T;    // across flats, plate, overall, plate underside
const C22 = Math.cos(Math.PI / 8);
const RHUB = 87.5, RBORE = 77.5, SPOKE = 7.5;      // hub OD from SECTION A-A's scale; bore Ø155; spoke pockets 7.50 deep
const RRIB = 266.43 / 2, RIBT = 12;               // SECTION C-C 266.43 across the ribs; thickness assumed (iso)
const STEP = 21.51 - 15, TAPER = 25.12, RIBLOW = 24.36;
const deg = (a) => (a * Math.PI) / 180;

function octagon(apothem, h, turn = 0) {
  const R = apothem / C22;
  return linearExtrude({ h }, polygon(Array.from({ length: 8 }, (_, i) => {
    const a = deg(22.5 + 45 * i + turn);
    return [R * Math.cos(a), R * Math.sin(a)];
  })));
}

// rib profile in (r, z), extruded RIBT thick, centred on its angle
function rib(angle) {
  const rFlat = RHUB + (ZP - STEP - RIBLOW) / Math.tan(deg(TAPER));
  const prof = polygon([[RHUB - 1, RIBLOW], [rFlat, ZP - STEP], [RRIB, ZP - STEP], [RRIB, ZP + 0.5], [RHUB - 1, ZP + 0.5]]);
  // profile in XZ: polygon (x, y) -> extrude along +Z, then turn so y -> z
  const slab = translate([0, RIBT / 2, 0], rotate([90, 0, 0], linearExtrude({ h: RIBT }, prof)));
  return rotate([0, 0, angle], slab);
}

// DETAIL D window: 61 wide at the outer edge, sides at 67.5°, 41.78 deep
// radially, R5 TYP corners, inner edge on R97.5. Through: SECTION A-A
// leaves it unhatched where its cut crosses one.
function pocket(angle) {
  const h = 41.78, wOut = 61, wIn = wOut - 2 * h / Math.tan(deg(67.5)), r0 = 97.5;
  const cut = fillet({ r: 5, edges: "z" }, linearExtrude({ h: T + 2 }, polygon([[r0, -wIn / 2], [r0 + h, -wOut / 2], [r0 + h, wOut / 2], [r0, wIn / 2]])));
  return rotate([0, 0, angle], translate([0, 0, ZP - 1], cut));
}

const holes = [];
for (let i = 0; i < 8; i++) {
  const a = deg(22.5 + 45 * i);
  holes.push({ kind: "hole", at: [147.79 * Math.cos(a), 147.79 * Math.sin(a), H], dir: [0, 0, 1], d: 12.5, depth: T, through: true });
}
const pins = [];
for (let i = 0; i < 8; i++) {
  const a = deg(22.5 + 45 * i);
  pins.push({ kind: "hole", at: [85.36 * Math.cos(a), 85.36 * Math.sin(a), 0], dir: [0, 0, -1], d: 10, depth: 20, ctx: 2 });
}

export default {
  title: "OCTAGON FLANGE (reference)",
  model: ({ applyFeatures, features }) => {
    let plate = octagon(AF / 2, T);
    plate = translate([0, 0, ZP], plate);
    // the hub as a tube (bore cut first: the kernel refuses it after the ribs
    // join), with a Ø18 lobe round each Ø10 hole on its rim (iso view)
    const lobes = Array.from({ length: 8 }, (_, i) => { const a = deg(22.5 + 45 * i); return translate([85.36 * Math.cos(a), 85.36 * Math.sin(a), 0], cylinder({ r: 9, h: ZP + 0.5 })); });
    const hub = difference(union(cylinder({ r: RHUB, h: ZP + 0.5 }), ...lobes), translate([0, 0, -1], cylinder({ r: RBORE, h: ZP + 1 })));
    const shoulder = translate([0, 0, ZP - STEP], cylinder({ r: 97.5, h: STEP + 0.5 }));
    let body = union(plate, hub, shoulder, ...Array.from({ length: 8 }, (_, i) => rib(22.5 + 45 * i)));
    for (let i = 0; i < 8; i++) body = difference(body, pocket(45 * i));
    // 12 spoke pockets 7.50 deep in the plate face round the bore, spokes
    // 7.50° wide (DETAIL B), r 36..72
    const half = deg(15 - 3.75);
    const spoke = translate([0, 0, H - SPOKE], linearExtrude({ h: SPOKE + 1 }, polygon([[36, -36 * Math.tan(half)], [72, -72 * Math.tan(half)], [72, 72 * Math.tan(half)], [36, 36 * Math.tan(half)]])));
    for (let i = 0; i < 12; i++) body = difference(body, rotate([0, 0, 15 + 30 * i], spoke));
    // Ø60 through the floor with four notches (iso view)
    const notch = (a) => rotate([0, 0, a], translate([28, -2.5, ZP - 1], cube([7, 5, T + 2])));
    body = difference(body, translate([0, 0, ZP - 1], cylinder({ r: 30, h: T + 2 })), notch(45), notch(135), notch(225), notch(315));
    return applyFeatures(body, features);
  },
  features: [...holes, ...pins],
};
