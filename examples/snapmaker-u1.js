// ============================================================
//  Mini Snapmaker U1 — 100% BREPcode. No imported mesh.
//  Near-cubic body, open back, spools on both sides with their
//  feeders, one head on the beam, four toolheads docked behind.
//
//  Built against photographs. The notes through this file are the
//  things that turned out to be wrong the first time; the numbers
//  in them were measured, not guessed.
// ============================================================
const EPS = 0.01;

// ---- envelope: the real machine is close to a cube, not a wide box ----
const W = 100, D = 95, H = 100;
const X0 = -W / 2, X1 = W / 2;
const FRONT_Y = -D / 2, REAR_Y = D / 2;
const WALL = 4;

const WHITE = "#F2F1EC", GREY = "#C9CBCA", BLACK = "#1C1E21", DARK = "#101215";
const TAN = "#C89A62", ORANGE = "#E8890C", STEEL = "#8E9296", YELLOW = "#E7B800";
const PTFE = "#DEDEDA";

// ============================================================
//  1. enclosure — rounded corners, open top well, open BACK
// ============================================================
const DOOR_W = 66, DOOR_H = 50, DOOR_Z0 = 8;    // door aperture, top at z=58
const WELL_D = 15;                              // how deep the top well is

// Rounded vertical corners, flat top and bottom. A HULL of four corner
// cylinders, NOT roundedGrow(): the offset rounds all twelve edges and costs a
// heavy mesh that then has to survive four booleans — 44 s and 18.5k triangles,
// against 5 s here, for a silhouette nobody can tell apart from outside.
const CORNER = 6;
const corner = (x, y) => translate([x, y, 0], cylinder({ r: CORNER, h: H, $fn: 16 }));
const box = hull(
  corner(X0 + CORNER, FRONT_Y + CORNER), corner(X1 - CORNER, FRONT_Y + CORNER),
  corner(X0 + CORNER, REAR_Y - CORNER), corner(X1 - CORNER, REAR_Y - CORNER),
);

const shell = colorize(WHITE, difference(
  box,
  // The top well — the open bay the gantry and the docks sit in. Note it is
  // INSET from the walls, which is why the front panel still runs to z=100.
  translate([X0 + WALL, FRONT_Y + WALL, H - WELL_D], cube([W - 2 * WALL, D - 2 * WALL, WELL_D + 10])),
  // the printing chamber
  translate([X0 + WALL, FRONT_Y + WALL, WALL], cube([W - 2 * WALL, D - 2 * WALL, H - WELL_D - WALL])),
  // the door aperture
  translate([-DOOR_W / 2, FRONT_Y - EPS, DOOR_Z0], cube([DOOR_W, WALL + 2 * EPS, DOOR_H])),
  // ...and the BACK is open on the real machine — you see straight through it
  translate([-DOOR_W / 2, REAR_Y - WALL - EPS, DOOR_Z0], cube([DOOR_W, WALL + 2 * EPS, DOOR_H])),
));

// The interior is a LINING, not a solid block — and there is no rear panel,
// because the back is open. Filling the cavity with one dark box did make the
// door read as deep, and it also sealed the bed inside where nobody could see
// it, which is the one thing the door exists to show.
const CH_TOP = H - WELL_D - WALL;
const linings = [
  translate([X0 + WALL, FRONT_Y + WALL, WALL], cube([2, D - 2 * WALL, CH_TOP - WALL])),
  translate([X1 - WALL - 2, FRONT_Y + WALL, WALL], cube([2, D - 2 * WALL, CH_TOP - WALL])),
  translate([X0 + WALL, FRONT_Y + WALL, WALL], cube([W - 2 * WALL, D - 2 * WALL, 2])),
];
const lining = colorize(DARK, union(...linings));

// Same-coloured pieces are UNIONED into one solid wherever they sit near each
// other. Solid count, not triangle count, is what the build time follows:
// 81 solids / 11.5k triangles took 18.9 s, 35 solids / 11.4k took 13 s.
const feet = colorize(BLACK, union(...[[-40, -38], [32, -38], [-40, 30], [32, 30]]
  .map(([x, y]) => translate([x, y, -2.4], cube([8, 8, 2.4])))));

// ============================================================
//  2. the print bed — everything else sits above this
// ============================================================
const BED_Z = 30;
const bedPlate = colorize(STEEL, translate([-34, -32, BED_Z], cube([68, 62, 2])));
const bedSheet = colorize("#3A3E42", translate([-33, -31, BED_Z + 2], cube([66, 60, 0.8])));
const bedFrame = colorize(BLACK, translate([-36, -34, BED_Z - 3], cube([72, 66, 3])));

// ============================================================
//  3. the acrylic door — clear enough to read as glazing
// ============================================================
const DOOR_T = 1.6, FRAME_T = 3;
const DOOR_Y = FRONT_Y - DOOR_T + 0.3;
const doorFrame = colorize("#2A2D31", difference(
  translate([-DOOR_W / 2 - 2, DOOR_Y, DOOR_Z0 - 2], cube([DOOR_W + 4, DOOR_T, DOOR_H + 4])),
  translate([-DOOR_W / 2 + FRAME_T - 2, DOOR_Y - EPS, DOOR_Z0 + FRAME_T - 2],
    cube([DOOR_W + 4 - FRAME_T * 2, DOOR_T + 2 * EPS, DOOR_H + 4 - FRAME_T * 2]))));

// A light tint at low opacity: on the real machine you read the bed through the
// door easily. A dark smoked pane went black against a dark chamber and stopped
// looking like glazing at all.
const doorGlass = colorize("#9FB4BE", glass(0.17,
  translate([-DOOR_W / 2 + 1, DOOR_Y + 0.4, DOOR_Z0 - 1],
    cube([DOOR_W - 2, 0.7, DOOR_H + 2]))));

const doorHandle = colorize("#2A2D31",
  translate([DOOR_W / 2 - 1, DOOR_Y - 1.2, DOOR_Z0 + 10], cube([1.6, 1.4, DOOR_H - 20])));

// ============================================================
//  4. logo and screen, on the front panel above the door
// ============================================================
// THE TRAP: the top well is cut INSET from the walls, so the front panel is not
// 85 tall — it runs the full 100. Measuring the band from the well's floor put
// both of these 15mm too low. The usable band is the top of the door (58) to
// the top of the PANEL (100), and its centre is 79.
const BAND_LO = DOOR_Z0 + DOOR_H;               // 58, top of the door
const BAND_HI = H;                              // 100, top of the front panel

const logoText = colorize(BLACK,
  translate([-26, FRONT_Y + 0.2, 90],
    rotate([90, 0, 0], text({ text: "snapmaker", size: 5.5, height: 1 }))));

const SCR_W = 34, SCR_H = 22, SCR_T = 1.6;      // tall landscape touchscreen
const SCR_X = 4, SCR_Z = (BAND_LO + BAND_HI) / 2 - SCR_H / 2 + 1.5;   // 69.5
const screenBezel = colorize(BLACK,
  translate([SCR_X, FRONT_Y - SCR_T + 0.3, SCR_Z], cube([SCR_W, SCR_T, SCR_H])));
const screenGlow = glow("#35c4ff", 1.0,
  translate([SCR_X + 1.8, FRONT_Y - SCR_T + 0.1, SCR_Z + 1.8],
    cube([SCR_W - 3.6, 0.6, SCR_H - 3.6])));

// ============================================================
//  5. gantry — chrome rods, and ONE head riding on the beam
// ============================================================
const RAIL_Z = H - 9;
const yRails = colorize(STEEL, union(...[X0 + 11, X1 - 11].map((x) =>
  tube([[x, FRONT_Y + 9, RAIL_Z], [x, REAR_Y - 9, RAIL_Z]], { r: 1.4, caps: "flat" }))));

const BEAM_Y = -8;
const beam = colorize(STEEL,
  tube([[X0 + 10, BEAM_Y, RAIL_Z], [X1 - 10, BEAM_Y, RAIL_Z]], { r: 1.6, caps: "flat" }));
const beamEnds = colorize(BLACK, union(...[X0 + 8, X1 - 12].map((x) =>
  translate([x, BEAM_Y - 4, RAIL_Z - 4], cube([4, 8, 8])))));

const HEAD_W = 15, HEAD_D = 13, HEAD_H = 15;
const headBody = colorize(GREY, chamfer(1.5,
  translate([-HEAD_W / 2, BEAM_Y - HEAD_D / 2, RAIL_Z - HEAD_H + 3], cube([HEAD_W, HEAD_D, HEAD_H]))));
const headDial = colorize(ORANGE,
  translate([0, BEAM_Y - HEAD_D / 2 + 0.4, RAIL_Z - HEAD_H / 2 + 1],
    rotate([90, 0, 0], cylinder({ r: 2.6, h: 1.6, $fn: 28 }))));
const headNozzle = colorize(BLACK,
  translate([0, BEAM_Y, RAIL_Z - HEAD_H + 0.5], cone({ r1: 0.9, r2: 3, h: 3, $fn: 24 })));

// ============================================================
//  6. four toolheads DOCKED at the back of the well
// ============================================================
const DOCK_W = 12, DOCK_D = 11, DOCK_H = 19;
const DOCK_Y = REAR_Y - WALL - DOCK_D - 2;
const DOCK_Z = H - WELL_D + 1;
const DOCK_XS = [-33, -11, 11, 33];
const DOCK_FACE = DOCK_Y + DOCK_D / 2;

const dockBodies = colorize("#212428", chamfer(1, union(...DOCK_XS.map((x) =>
  translate([x - DOCK_W / 2, DOCK_Y, DOCK_Z], cube([DOCK_W, DOCK_D, DOCK_H]))))));
const dockLabels = colorize(YELLOW, union(...DOCK_XS.map((x) =>
  translate([x - 3.5, DOCK_Y - 0.4, DOCK_Z + DOCK_H - 7], cube([7, 0.5, 3.5])))));
const dockNozzles = colorize(BLACK, union(...DOCK_XS.map((x) =>
  translate([x, DOCK_FACE, DOCK_Z - 2.5], cone({ r1: 0.9, r2: 2.6, h: 2.6, $fn: 20 })))));

// ============================================================
//  7. bowden loops — TALL and NARROW, as on the machine
// ============================================================
// The real loops rise and come straight back down almost beside themselves,
// held by a clip. A wide arc was wrong; so was a 7mm turn, which draws as one
// straight line however tall it is. About a 10mm span over a 34mm rise.
const LOOP_TOP = H + 34;
const LOOP_BACK = REAR_Y + 1;                   // comes down onto the ledge
const loops = colorize(PTFE, union(...DOCK_XS.map((x) =>
  tube([
    [x, DOCK_FACE, DOCK_Z + DOCK_H - 1],
    [x, DOCK_FACE, LOOP_TOP],
    [x, LOOP_BACK, LOOP_TOP],
    [x, LOOP_BACK, H - 2],
  ], { r: 1.1, bend: 5 }))));

// The little shelf on the top rear that every tube lands on. It stands slightly
// proud of the back wall, which is what makes it read as a ledge rather than a
// thicker wall.
const LEDGE_Y = REAR_Y - 3, LEDGE_D = 9, LEDGE_Z = H - 6;
const ledge = colorize(WHITE,
  translate([-40, LEDGE_Y, LEDGE_Z], cube([80, LEDGE_D, 6])));

const loopClips = colorize(BLACK, union(...DOCK_XS.map((x) =>
  translate([x - 2, DOCK_FACE - 1, LOOP_TOP - 16], cube([4, 12, 3])))));

// ============================================================
//  8. spools — TWO PER SIDE, front one low, rear one higher
// ============================================================
const SPOOL_R = 17, SPOOL_W = 9, FLANGE_T = 1.3;
const FILAMENT = ["#D93A2B", "#EDE6D6", "#E7B800", "#2C6BB0"];

const SPOOLS = [
  { side: -1, y: -16, z: 34, c: 0, dock: 0 },
  { side: -1, y: 18, z: 56, c: 1, dock: 1 },
  { side: +1, y: -16, z: 34, c: 2, dock: 2 },
  { side: +1, y: 18, z: 56, c: 3, dock: 3 },
];

// A rim, not a disc: a solid flange hides the filament from the only angle you
// ever look at a spool from, which on a four-colour machine is the whole story.
const flange = () => difference(
  cylinder({ r: SPOOL_R, h: FLANGE_T, $fn: 32 }),
  translate([0, 0, -EPS], cylinder({ r: SPOOL_R - 6, h: FLANGE_T + 2 * EPS, $fn: 32 })),
);

const spoolLo = (s) => Math.min(s.side < 0 ? X0 - 1 : X1 + 1,
  (s.side < 0 ? X0 - 1 : X1 + 1) + s.side * SPOOL_W);

const flanges = colorize(TAN, union(...SPOOLS.flatMap((s) => {
  const lo = spoolLo(s);
  return [
    translate([lo, s.y, s.z], rotate([0, 90, 0], flange())),
    translate([lo + SPOOL_W - FLANGE_T, s.y, s.z], rotate([0, 90, 0], flange())),
  ];
})));

// the rolls stay four separate solids — they are four different colours, which
// is the one thing that cannot be unioned away
const rolls = SPOOLS.map((s) => colorize(FILAMENT[s.c],
  translate([spoolLo(s) + FLANGE_T, s.y, s.z],
    rotate([0, 90, 0], cylinder({ r: SPOOL_R - 3, h: SPOOL_W - 2 * FLANGE_T, $fn: 32 })))));

const hubs = colorize(BLACK, union(...SPOOLS.map((s) =>
  translate([spoolLo(s) - 2, s.y, s.z],
    rotate([0, 90, 0], cylinder({ r: 3.5, h: SPOOL_W + 4, $fn: 20 }))))));

// ---- the feeder box, and the filament path through it ----
// ONE unit per side, on the wall toward the BACK and below the midline. Both
// spools on that side pay out REARWARD into it.
const FEED_W = 8, FEED_D = 15, FEED_H = 16;
const FEED_Y = 24, FEED_Z = 36;
const feedFace = (side) => side * (W / 2 + FEED_W / 2);

const feeders = colorize(BLACK, union(...[-1, 1].map((side) =>
  translate([side < 0 ? X0 - FEED_W : X1, FEED_Y, FEED_Z - FEED_H / 2],
    cube([FEED_W, FEED_D, FEED_H])))));

const feedHousings = colorize("#E4E5E3", union(...[-1, 1].map((side) =>
  translate([side < 0 ? X0 - FEED_W - 2.5 : X1 + FEED_W, FEED_Y + 2, FEED_Z - 5],
    cube([2.5, 10, 11])))));

// Coloured filament, both rolls paying out on their REAR side into the one box.
// Keep every tube path monotonic: an earlier version put the last point behind
// the middle one, so the tube folded back through itself and the kernel had to
// swallow a self-intersecting mesh — about 4.5 s of the build.
const FEED_IN = FEED_Y + 6;
const strands = SPOOLS.map((s) => {
  const cx = s.side * (W / 2 + SPOOL_W / 2 + 0.5);
  const exit = s.y + SPOOL_R - 3;               // tangent off the BACK of the roll
  return colorize(FILAMENT[s.c], tube([
    [cx, exit, s.z - 2],
    [cx, Math.max(exit, FEED_IN) - 1, (s.z + FEED_Z + 8) / 2],
    [cx, FEED_IN, FEED_Z + 5],
  ], { r: 0.8 }));                              // leave `bend` at its default
});

// PTFE: out the BACK of the feeder first, then up behind the machine, then in
// onto the ledge. These stay FOUR separate solids on purpose — unioning
// same-coloured parts is usually the cheap move, but these four each cross the
// whole machine, so their bounding boxes all overlap and the boolean cost 9 s
// on its own. Merge things that sit near each other; leave spanning runs alone.
const sideFeeds = SPOOLS.map((s) => {
  const fx = feedFace(s.side);
  const dx = DOCK_XS[s.dock];
  const lane = s.y > 0 ? 3 : -3;                // the two runs from a side stay apart
  return colorize(PTFE, tube([
    [fx, FEED_Y + 7 + lane, FEED_Z + FEED_H / 2 - 1],
    [fx, REAR_Y + 13 + lane, FEED_Z + 5],       // straight OUT THE BACK first
    [fx, REAR_Y + 13 + lane, H - 12],           // then turns up, behind the machine
    [dx, LEDGE_Y + 4, LEDGE_Z + 2],             // and in onto the ledge
  ], { r: 1.0, bend: 6 }));
});

// ---- rear I/O, outboard of the opening ----
// The rear aperture spans x -33..33, so these sit on solid wall beyond it.
const IO_X = 35;
const iecInlet = colorize(BLACK, union(
  translate([IO_X, REAR_Y - 1.5, 10], cube([13, 3, 11])),        // IEC C14 inlet
  translate([IO_X, REAR_Y - 1.5, 32], cube([13, 2.5, 6])),       // USB / net cluster
));
const iecPins = colorize("#4A4E52",
  translate([IO_X + 2.5, REAR_Y + 0.6, 13], cube([8, 1, 5])));
const powerSwitch = colorize("#C0392B",
  translate([IO_X + 2, REAR_Y - 1.5, 23], cube([9, 3.2, 6])));
const usbPorts = colorize("#8E9296", union(
  translate([IO_X + 1.5, REAR_Y + 0.4, 33.5], cube([4, 1, 3])),
  translate([IO_X + 7.5, REAR_Y + 0.4, 33.5], cube([4, 1, 3])),
));

return group(
  shell, lining, feet,
  bedFrame, bedPlate, bedSheet,
  doorFrame, doorGlass, doorHandle,
  logoText, screenBezel, screenGlow,
  yRails, beam, beamEnds,
  headBody, headDial, headNozzle,
  dockBodies, dockLabels, dockNozzles,
  ledge, loops, loopClips,
  flanges, ...rolls, hubs,
  feeders, feedHousings, ...strands, ...sideFeeds,
  iecInlet, iecPins, powerSwitch, usbPorts,
);
