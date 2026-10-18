// The front door.
//
// Two cards, both for people who did not arrive by a share link:
//
//  1. WELCOME, on a first visit. The app used to open on a grey box with a
//     hole in it and a small "Editor" pill, which says nothing about what the
//     tool can do. This says it in one line and offers the four things worth
//     doing first: describe a part, bring an STL, try an example, take the
//     tour. It shows once; any choice (or the x) retires it.
//
//  2. A TOOL CARD, for links like brepcode.com/?tool=texture. An article or a
//     video points at one tool; the visitor lands on that tool, ready to go:
//     drop an STL (or pick a file) and it runs straight away, or try it on the
//     example already on the plate. Generators (Gridfinity, cookie cutters,
//     the parts shelf, the chat) just open.
//
// The app owns everything that touches the model; this module only asks for
// it through the hooks passed in, so it can be read (and changed) on its own.

import { icon } from "./icons.js";

const WELCOMED_KEY = "brepcode-welcomed";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

// Every tool a link can open. `run` is what the app runs on a model:
// a toolbox button id, "wrap:<Edit a part entry>", or "fizz" / "fins" for the
// FizzCore dialog. `kind`: "mesh" wants a model (dropped, or the example);
// "panel" just opens.
export const TOOL_LINKS = {
  fizzcore: { run: "fizz", kind: "mesh", icon: "fizz", title: "FizzCore bubble infill", line: "Fill any STL with graded, printable bubbles: less plastic, still strong." },
  fins: { run: "fins", kind: "mesh", icon: "fins", title: "Support fins for tilted prints", line: "Tilt a part 45° and get snap-off fins that catch it if it teeters." },
  texture: { run: "texture-btn", kind: "mesh", icon: "texture", title: "Surface texture", line: "Knurl, fuzzy skin or bumps on any STL, as real geometry that prints." },
  emboss: { run: "emboss-btn", kind: "mesh", icon: "emboss", title: "Photo emboss / label", line: "Turn an image into relief on any face of a part." },
  qr: { run: "code-qr-btn", kind: "mesh", icon: "qr", title: "QR code on a part", line: "Stamp a scannable QR code onto any face." },
  datamatrix: { run: "code-dm-btn", kind: "mesh", icon: "datamatrix", title: "DataMatrix on a part", line: "Stamp a tiny scannable DataMatrix onto any face." },
  drill: { run: "drill-btn", kind: "mesh", icon: "drill", title: "Drill a hole in an STL", line: "Click a face and bore a hole straight into it." },
  hole: { run: "wrap:add a hole", kind: "mesh", icon: "hole", title: "Add a hole", line: "A hole you place by number, for screws and magnets." },
  stretch: { run: "wrap:split & fill the middle", kind: "mesh", icon: "stretch", title: "Make an STL longer", line: "Split it through the middle and fill the gap with its own shape." },
  narrow: { run: "wrap:cut the middle out (narrow it)", kind: "mesh", icon: "narrow", title: "Make an STL narrower", line: "Take a slab out of the middle and keep both ends intact." },
  "shave-bottom": { run: "wrap:shave off the bottom", kind: "mesh", icon: "shaveBottom", title: "Shave off the bottom", line: "Cut feet, a lip or a brim off flat." },
  thicken: { run: "wrap:thicken walls / rails", kind: "mesh", icon: "thicken", title: "Thicken walls", line: "Fatter rails and walls, same outside size." },
  whisker: { run: "shave-btn", kind: "mesh", icon: "whisker", title: "Shave a whisker", line: "Click a strand and it is cut off at its root." },
  scale: { run: "scale-btn", kind: "mesh", icon: "scale", title: "Scale an STL", line: "By a factor, or to an exact size in mm." },
  rotate: { run: "wrap:rotate / orient", kind: "mesh", icon: "rotate", title: "Rotate / stand it up", line: "Turn a part in X, Y and Z." },
  flip: { run: "wrap:lay flat / flip", kind: "mesh", icon: "flip", title: "Flip it over", line: "Upside down, printable face down." },
  measure: { run: "measure-btn", kind: "mesh", icon: "measure", title: "Measure an STL", line: "Click corners, edges or faces for real numbers." },
  gridfinity: { run: "gfin-row", kind: "panel", icon: "gridfinity", title: "Gridfinity generator", line: "Drag out a bin or a baseplate." },
  "cookie-cutter": { run: "cutter-row", kind: "panel", icon: "cutter", title: "Cookie cutter maker", line: "Search a shape and get a blade, stamp, stencil or roller." },
  parts: { run: "shelf-row", kind: "panel", icon: "shelf", title: "Parts shelf", line: "Hinges, snaps, vents and standoffs, already written." },
  chat: { run: "chat-btn", kind: "panel", icon: "chat", title: "Describe a part", line: "Say what you want and get editable code." },
};

// Examples worth showing off: each one builds in a second or two in the app's
// own language, and shows something a mesh editor cannot do (live text, sizes
// you change by editing one number). A knurled knob was the first pick and
// was dropped from here: a real displaced texture takes 10+ seconds to build,
// which is the wrong first impression. It still ships, for the texture link.
export const EXAMPLES = {
  box: {
    title: "Box with a lid",
    line: "A box and its lid side by side. Change the sizes and both follow.",
    code: `// A box and its lid, side by side. Change the sizes and both follow.
const w = 50, d = 36, h = 24;
const wall = 2, fit = 0.3;
union(
  difference(
    cube([w, d, h]),
    translate([wall, wall, wall], cube([w - 2 * wall, d - 2 * wall, h])),
  ),
  translate([w + 8, 0, 0], union(
    cube([w, d, wall]),
    translate([wall + fit, wall + fit, wall], cube([w - 2 * (wall + fit), d - 2 * (wall + fit), 4])),
  )),
)`,
  },
  knob: {
    title: "Knurled knob",
    line: "Real knurled grip you can print, with a hex nut pocket underneath.",
    code: `// Knurled grip knob: real knurl you can print, a hex nut pocket underneath.
// Change any number and it rebuilds.
const knob_d = 34;
const height = 18;
const nut = 8.2;
// Knurl the outside first, THEN cut the pocket and bore: knurling the finished
// part textures their walls too, and the nut and bolt no longer fit.
difference(
  texture({ pattern: "knurl", depth: 0.7, scale: 3, faces: "sides" },
    cylinder({ r: knob_d / 2, h: height, $fn: 96 })),
  translate([0, 0, -1], cylinder({ r: nut / 2 / Math.cos(Math.PI / 6), h: 7, $fn: 6 })),
  translate([0, 0, -1], cylinder({ r: 2.6, h: height + 2, $fn: 32 })),
)`,
  },
  // Every setting is a named line at the top, so each one is a control in
  // Parameters: text, choices and colours as well as sizes. The tag and the
  // letters stay two solids (group, not union) so they keep their own colours
  // and a 3MF prints them in two filaments. `coach` walks a first-timer to
  // those controls once it has built.
  tag: {
    title: "Name tag",
    line: "Your name, font and colours on a keyring tag, every setting a slider.",
    coach: "nametag",
    code: `// Name tag. Every setting below is a control in Parameters (the sliders
// button under this editor): change the name, font, colours and sizes there,
// or right here. They are the same numbers.
/* [Text] */
const name = "RANDO";
const font = "Arial Black"; // [Arial Black, Arial, Impact, Georgia, Verdana, Trebuchet MS, Courier New, Comic Sans MS]
const text_size = 9;        // [4:0.5:16] letter height
const text_height = 1.4;    // [0.4:0.2:4] how far the letters stand up
const text_color = "#ffffff";
/* [Tag] */
const width = 62;           // [30:1:120]
const tag_height = 20;      // [12:1:50]
const thickness = 3;        // [1.2:0.2:8]
const corner_r = 4;         // [0:0.5:10] rounded corners, 0 for square
const edge_fillet = 0.6;    // [0:0.2:1.5] round over the top edge
const hole_d = 5;           // [0:0.5:10] keyring hole, 0 for none
const tag_color = "#7b4fe0";

// The tag: a post at each corner, hulled. With a fillet, each post is a bit
// shorter and wears a ring (torus) of the fillet's radius on top, so the hull
// comes out rounded over the top edge too.
const r = Math.min(corner_r, tag_height / 2 - 0.01);
const e = Math.min(edge_fillet, thickness / 2 - 0.01, r > 0 ? r - 0.05 : edge_fillet);   // over half the thickness it would dip below the bed
const corners = [[r, r], [width - r, r], [width - r, tag_height - r], [r, tag_height - r]];
const tag = r > 0
  ? hull(
      ...corners.map(([x, y]) => translate([x, y, 0], cylinder({ r, h: thickness - Math.max(e, 0), $fn: 48 }))),
      ...(e > 0 ? corners.map(([x, y]) => translate([x, y, thickness - e], torus({ r: r - e, tube: e, $fn: 48 }))) : []),
    )
  : e > 0 ? fillet({ r: e, faces: "top" }, cube([width, tag_height, thickness]))
  : cube([width, tag_height, thickness]);
const holeX = Math.max(hole_d / 2 + 2, r);
const textX = hole_d > 0 ? (width + holeX + hole_d / 2) / 2 : width / 2;
group(
  colorize(tag_color, hole_d > 0
    ? difference(tag, translate([holeX, tag_height / 2, -1], cylinder({ r: hole_d / 2, h: thickness + 2, $fn: 40 })))
    : tag),
  colorize(text_color, translate([textX, tag_height / 2, thickness],
    text({ text: name, size: text_size, height: text_height, font }))),
)`,
  },
  // Ported from a customizer .scad (rounded-corners-with-all-the-options-best-box)
  // into BREPcode, so it builds in seconds: the original bead was ~1,150
  // unioned spheres. Same settings, plus a lid that prints top-down.
  tpubox: {
    title: "TPU box",
    line: "A soap box whose lid snaps over a bead, with a drainage riser. Print in TPU.",
    coach: "tpubox",
    // where it came from, shown as a small dismissable card once it loads
    note: {
      heading: "This box began life in OpenSCAD",
      blurb: "Printed in TPU: the lid snaps over a bead and seals.",
      video: "https://youtu.be/UCiVWNFtfVw",
      printables: "",  // the Printables model URL, added once known
    },
    code: `// TPU snap box: a base with a bead round the outside, a lid with a matching
// groove that snaps over it (TPU flexes, then holds), and an optional riser
// with drainage holes, so a bar of soap sits dry. Every setting is a control
// in Parameters; the lid's groove follows the bead on its own.
/* [Box] */
const inner_length = 100;   // [30:1:200] inside, mm
const inner_width = 60;     // [30:1:150]
const inner_height = 30;    // [10:1:100]
const wall = 3;             // [1.2:0.2:6] wall thickness
const corner_r = 2;         // [0.5:0.5:6] rounding on every edge
const show = "all";         // [all, base, lid, riser]
/* [Lid and seal] */
const lid_height = 13;      // [6:1:40] outside height of the lid
const lid_gap = 0.4;      // [0:0.1:1.2] lid gap, total (half each side)
const bead_from_top = 5;    // [1:0.5:10] where the bead sits, down from the rim
const bead_r = 0.5;         // [0.2:0.1:2] the bead's radius
const groove_r = 1.1;       // [0.3:0.1:2.5] the lid's groove, a bit bigger
/* [Soap riser] */
const riser = true;
const riser_height = 5;     // [2:0.5:10]
const riser_gap = 0.5;      // [0.2:0.1:1.5] gap to the walls
const pattern = "hearts";   // [holes, slits, hearts, solid]
const pattern_size = 4;     // [2:0.5:10]
const pattern_spacing = 8;  // [4:0.5:15]
const lift_cross = true;    // finger liftSlot to lift it out

// Outside of the base, and the lid that slides over it.
const L = inner_length + 2 * wall, W = inner_width + 2 * wall, H = inner_height + wall;
const LL = L + lid_gap + 2 * wall, LW = W + lid_gap + 2 * wall;
const r = Math.min(corner_r, wall - 0.01, H / 2, lid_height / 2);

// a box rounded on every edge: a ball at each of its eight corners, hulled
const roundBox = (l, w, h, rr) => hull(...[[rr, rr], [l - rr, rr], [rr, w - rr], [l - rr, w - rr]]
  .flatMap(([x, y]) => [rr, h - rr].map((z) => translate([x, y, z], sphere({ r: rr, $fn: 24 })))));
// a round-section ring that follows a rounded rectangle: four tori, hulled
// (the hull is a disc; whatever pokes past the wall is the bead or groove)
const ring = (x0, y0, l, w, rr, tube, z) => hull(...[[x0 + rr, y0 + rr], [x0 + l - rr, y0 + rr], [x0 + rr, y0 + w - rr], [x0 + l - rr, y0 + w - rr]]
  .map(([x, y]) => translate([x, y, z], torus({ r: rr, tube, $fn: 24 }))));

// BASE: rounded box, bead round the outside, hollowed
const base = difference(
  union(roundBox(L, W, H, r), ring(0, 0, L, W, r, bead_r, H - bead_from_top)),
  translate([wall, wall, wall], cube([inner_length, inner_width, H])),
);

// LID: modelled the way it prints, top face down on the bed. Its inside is
// the base's outside plus the lid_gap; the groove lands on the bead when
// the lid is pushed home (its ceiling on the base's rim).
const inside = lid_height - wall;                      // how far the lid reaches down
const lidCavity = (() => {
  const ir = r + lid_gap / 2, cx = wall, cy = wall, cl = L + lid_gap, cw = W + lid_gap;
  return hull(...[[cx + ir, cy + ir], [cx + cl - ir, cy + ir], [cx + ir, cy + cw - ir], [cx + cl - ir, cy + cw - ir]]
    .map(([x, y]) => translate([x, y, wall], cylinder({ r: ir, h: inside + 1, $fn: 24 }))));
})();
const lid = difference(
  roundBox(LL, LW, lid_height, r),
  lidCavity,
  // upside down, the groove is bead_from_top in from the open rim
  ring(wall, wall, L + lid_gap, W + lid_gap, r + lid_gap / 2, groove_r, lid_height - (inside - bead_from_top)),
);

// RISER: a rounded plate with drain holes, little feet, and a lift liftSlot
const RL = inner_length - 2 * riser_gap, RW = inner_width - 2 * riser_gap;
const grid = (step) => {
  const nx = Math.max(1, Math.floor((RL - 2 * pattern_spacing) / step) + 1);
  const ny = Math.max(1, Math.floor((RW - 2 * pattern_spacing) / step) + 1);
  const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    out.push([(RL - (nx - 1) * step) / 2 + i * step, (RW - (ny - 1) * step) / 2 + j * step]);
  }
  return out;
};
const size = Math.min(pattern_size, pattern_spacing * 0.9);   // drains must not touch
const thru = riser_height + 2;                                 // cutters poke out both faces
// a heart: two round lobes meeting a V, its sides tangent to the lobes, as
// ONE outline (three shapes unioned per heart doubled the build time)
const heart = (s) => {
  const lobe = s / 4, pts = [[0, -s / 4 - (s * Math.SQRT2) / 4]];     // the tip
  const arc = (ox, a0, a1) => {
    for (let i = 0; i <= 7; i++) {
      const a = ((a0 + ((a1 - a0) * i) / 7) * Math.PI) / 180;
      pts.push([ox + lobe * Math.cos(a), lobe * Math.sin(a)]);
    }
  };
  arc(lobe, -45, 180);                  // right lobe, up and over to the dip
  arc(-lobe, 15, 225);                  // left lobe (from just past the dip), round and down
  return linearExtrude({ h: thru }, polygon(pts));
};
const drains =
  pattern === "holes" ? grid(pattern_spacing).map(([x, y]) => translate([x, y, -1], cylinder({ r: size / 2, h: thru, $fn: 20 })))
  : pattern === "slits" ? grid(pattern_spacing).filter(([x], i, a) => x === a[0][0])
      .map(([, y]) => translate([pattern_spacing, y - size / 2, -1], cube([RL - 2 * pattern_spacing, size, thru])))
  : pattern === "hearts" ? grid(pattern_spacing * 1.5).map(([x, y]) => translate([x, y, -1], heart(size * 1.2)))
  : [];
// the lift slot: a cross you can get a fingertip into, no longer than the
// drained middle of the plate (a fixed 30mm arm cut a narrow riser in pieces)
const armX = Math.min(30, RL - 2 * pattern_spacing), armY = Math.min(30, RW - 2 * pattern_spacing);
const liftSlot = pattern !== "solid" && lift_cross
  ? [...(armX > 4 ? [translate([RL / 2 - armX / 2, RW / 2 - 2, -1], cube([armX, 4, thru]))] : []),
     ...(armY > 4 ? [translate([RL / 2 - 2, RW / 2 - armY / 2, -1], cube([4, armY, thru]))] : [])]
  : [];
// The plate is built from plain boxes and cylinders on purpose: cutting
// dozens of drains out of exact solids takes the kernel a second or two,
// out of a hulled (mesh) plate it took 20 to 30.
const pr = Math.min(r, RL / 2, RW / 2);
const plate = union(
  translate([pr, 0, 0], cube([RL - 2 * pr, RW, riser_height])),
  translate([0, pr, 0], cube([RL, RW - 2 * pr, riser_height])),
  ...[[pr, pr], [RL - pr, pr], [pr, RW - pr], [RL - pr, RW - pr]].map(([x, y]) =>
    translate([x, y, 0], cylinder({ r: pr, h: riser_height, $fn: 24 }))),
);
// Little feet lift a drained riser off the floor of the box. They stand in
// the solid margin round the drains and go on BEFORE the cutting: adding them
// to an already-holed plate cost the kernel four seconds on its own.
const lift = pattern === "solid" ? 0 : 2;
const fi = Math.min(pr + 2.5, pattern_spacing / 2);
const feet = lift ? [[fi, fi], [RL - fi, fi], [fi, RW - fi], [RL - fi, RW - fi], [RL / 2, fi], [RL / 2, RW - fi]]
  .map(([x, y]) => translate([x, y, 0], cylinder({ r: 2, h: lift + 0.01, $fn: 20 }))) : [];
const body = feet.length ? union(translate([0, 0, lift], plate), ...feet) : plate;
const soapRiser = drains.length || liftSlot.length
  ? difference(body, ...[...drains, ...liftSlot].map((c) => translate([0, 0, lift], c)))
  : body;

return group(
  ...(show === "all" || show === "base" ? [colorize("#4fb3bf", base)] : []),
  ...(show === "all" || show === "lid" ? [colorize("#8fd3dc", translate([show === "all" ? L + 14 : 0, 0, 0], lid))] : []),
  ...((riser || show === "riser") && (show === "all" || show === "riser") ? [colorize("#f2a3c7", translate([wall, show === "all" ? W + 14 : 0, 0], soapRiser))] : []),
)`,
  },
};

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const css = document.createElement("style");
  css.textContent = `
  .wl-card { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 9000;
    width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto;
    background: var(--card, #121826); color: var(--text, #dfe6f3); border: 1px solid var(--border, #26314a);
    border-radius: 16px; box-shadow: 0 24px 80px rgba(0,0,0,.6); font: 14px/1.5 system-ui, sans-serif; }
  .wl-head { padding: 18px 20px 4px; position: relative; }
  .wl-head h2 { margin: 0; font-size: 21px; line-height: 1.25; padding-right: 28px; }
  .wl-head p { margin: 6px 0 0; color: var(--muted, #8ea0c0); font-size: 13.5px; }
  .wl-x { position: absolute; right: 12px; top: 10px; background: none; border: 0; font-size: 22px; line-height: 1;
    color: var(--muted, #8ea0c0); cursor: pointer; padding: 4px 8px; border-radius: 6px; }
  .wl-x:hover { background: var(--hover, #1a2334); color: var(--text, #fff); }
  .wl-body { padding: 12px 20px 18px; display: flex; flex-direction: column; gap: 8px; }
  .wl-act { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; padding: 11px 13px;
    border-radius: 11px; border: 1px solid var(--border-soft, #1c2437); background: var(--input-bg, #0d1320);
    color: inherit; font: inherit; cursor: pointer; }
  .wl-act:hover, .wl-act:focus-visible { background: var(--hover-strong, #1d2a44); border-color: var(--border-focus, #3a5788); outline: none; }
  .wl-act.hero { border-color: var(--border-focus, #3a5788); }
  .wl-act .ic { width: 28px; flex: none; display: flex; justify-content: center; color: var(--muted6, #93a7c8); }
  .wl-act:hover .ic { color: var(--text, #dfe6f3); }
  .wl-head h2 { display: flex; align-items: center; gap: 10px; }
  .wl-ti { display: inline-flex; color: var(--muted6, #93a7c8); }
  .wl-act b { display: block; font-size: 14px; }
  .wl-act small { display: block; color: var(--muted, #8ea0c0); font-size: 12px; }
  .wl-act > span:not(.ic) { min-width: 0; }
  /* one row that scrolls sideways: wrapped chips pushed the card past a phone screen */
  .wl-ex { display: flex; gap: 4px; flex-wrap: nowrap; max-width: 100%; overflow-x: auto; margin: 4px 0 0; scrollbar-width: thin; }
  .wl-chip { flex: none; white-space: nowrap; font: inherit; font-size: 11px; padding: 5px 7px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text2, #d8e2f5); }
  .wl-chip:hover { background: var(--hover-strong, #1d2a44); }
  .wl-foot { padding: 0 20px 16px; color: var(--muted2, #6f83a6); font-size: 12px; }
  .wl-drop { border: 2px dashed var(--border-focus, #3a5788); border-radius: 12px; padding: 18px; text-align: center;
    color: var(--text2, #d8e2f5); }
  .wl-drop b { font-size: 15px; }
  .wl-drop small { display: block; color: var(--muted, #8ea0c0); margin-top: 4px; }
  .wl-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .wl-btn { flex: 1; min-width: 150px; padding: 10px 12px; border-radius: 10px; cursor: pointer; font: 600 13.5px system-ui;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text, #dfe6f3); }
  .wl-btn.go { border-color: var(--accent, #1c66e5); color: #fff; background: var(--accent, #1c66e5); }
  .wl-btn:hover { background: var(--hover-strong, #1d2a44); }
  .wl-btn.go:hover { background: var(--accent-hover, #2e76f2); }
  /* bottom-left, above the view cube: the one corner the cards and the dock
     never open into, so it never covers a control */
  .wl-next { position: fixed; left: 16px; bottom: 112px; z-index: 8500;
    display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 12px;
    background: var(--card, #121826); border: 1px solid var(--border, #26314a); box-shadow: 0 10px 30px rgba(0,0,0,.45);
    font: 13px system-ui, sans-serif; max-width: calc(100vw - 32px); }
  .wl-nb { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 8px; cursor: pointer; font: 600 13px system-ui;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text, #dfe6f3); white-space: nowrap; }
  .wl-nb:hover { background: var(--hover-strong, #1d2a44); }
  .wl-nb.go { background: var(--accent, #1c66e5); border-color: var(--accent, #1c66e5); color: #fff; }
  .wl-nb.go:hover { background: var(--accent-hover, #2e76f2); }
  .wl-nx { background: none; border: 0; color: var(--muted, #8ea0c0); font-size: 20px; line-height: 1; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
  .wl-nx:hover { background: var(--hover, #1a2334); color: var(--text, #fff); }
  @media (max-width: 520px) { .wl-head h2 { font-size: 18px; } }`;
  document.head.appendChild(css);
}

function card(html, onClose) {
  style();
  const el = document.createElement("div");
  el.className = "wl-card";
  el.setAttribute("role", "dialog");
  el.innerHTML = html;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener("keydown", key, true); onClose?.(); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", key, true);
  el.querySelector(".wl-x")?.addEventListener("click", close);
  return { el, close };
}

export const welcomed = () => lsGet(WELCOMED_KEY) === "1";

/**
 * The first-visit card.
 * hooks: { openChat(), pickFile(), loadExample(code), startTour(), openTool(name) }
 */
export function showWelcome(hooks) {
  const { el, close } = card(`
    <div class="wl-head">
      <h2>Free CAD in your browser</h2>
      <p>Type it, describe it, or drop in an STL and upgrade it. Real solid modelling, no install, no account, and nothing leaves your machine.</p>
      <button class="wl-x" title="Close" aria-label="Close">&times;</button>
    </div>
    <div class="wl-body">
      <button class="wl-act" data-w="chat"><span class="ic">${icon("chat", 20)}</span>
        <span><b>Describe a part</b><small>"a 40 mm phone stand with a cable slot": get code you can edit</small></span></button>
      <button class="wl-act hero" data-w="stl"><span class="ic">${icon("part", 20)}</span>
        <span><b>Fix or upgrade an STL</b><small>drop one anywhere: bubble infill, support fins, texture, QR codes, drill, stretch, thicken…</small></span></button>
      <div class="wl-act" style="cursor:default"><span class="ic">${icon("example", 20)}</span>
        <span><b>Try an example</b><small>a real model, ready to change</small>
        <span class="wl-ex">
          <button class="wl-chip" data-ex="tag">Name tag</button>
          <button class="wl-chip" data-ex="box">Box with a lid</button>
          <button class="wl-chip" data-ex="tpubox">TPU box</button>
          <button class="wl-chip" data-tool="gridfinity">Gridfinity bin</button>
          <button class="wl-chip" data-tool="cookie-cutter">Cookie cutter</button>
        </span></span></div>
      <button class="wl-act" data-w="tour"><span class="ic">${icon("tour", 20)}</span>
        <span><b>Take the 2-minute tour</b><small>where everything is, and the three languages you can paste</small></span></button>
    </div>
    <div class="wl-foot">Also reads OpenSCAD, JSCAD and build123d. Exports STL, 3MF, STEP, GLB.</div>`,
  () => lsSet(WELCOMED_KEY, "1"));
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-w],[data-ex],[data-tool]");
    if (!b) return;
    close();
    if (b.dataset.w === "chat") hooks.openChat?.();
    if (b.dataset.w === "stl") hooks.pickFile?.();
    if (b.dataset.w === "tour") hooks.startTour?.();
    if (b.dataset.ex) {
      const ex = EXAMPLES[b.dataset.ex];
      hooks.loadExample?.(ex.code, ex.title, ex.coach, ex.note);
    }
    if (b.dataset.tool) hooks.openTool?.(b.dataset.tool);
    // Anything but the tour leaves you in the app with the card gone. A slim
    // bar keeps the way forward (and back) in reach until you close it.
    if (b.dataset.w !== "tour") showNextBar(hooks);
  });
}

// The "what now?" bar after a welcome choice: back to the welcome card, on to
// the tour, or close it. One at a time; the tour or the x retires it.
let nextBar = null;
export function showNextBar(hooks) {
  style();
  nextBar?.remove();
  const bar = document.createElement("div");
  bar.className = "wl-next";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Getting started");
  bar.innerHTML = `
    <button class="wl-nb" data-n="back" title="Back to the start card">${icon("open", 15)}<span>Back</span></button>
    <button class="wl-nb go" data-n="tour" title="Take the 2-minute tour">${icon("tour", 15)}<span>Tour</span></button>
    <button class="wl-nx" data-n="close" title="Close" aria-label="Close">&times;</button>`;
  document.body.appendChild(bar);
  nextBar = bar;
  const done = () => { bar.remove(); if (nextBar === bar) nextBar = null; };
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (!b) return;
    done();
    if (b.dataset.n === "back") showWelcome(hooks);
    if (b.dataset.n === "tour") hooks.startTour?.();
  });
}

/**
 * The card for brepcode.com/?tool=<name>.
 * hooks: { armDrop(spec), pickFile(), runOnCurrent(spec), runPanel(spec) }
 * Returns false for an unknown tool name, so the caller can fall back.
 */
export function showToolCard(name, hooks) {
  const spec = TOOL_LINKS[String(name || "").toLowerCase()];
  if (!spec) return false;
  if (spec.kind === "panel") { hooks.runPanel?.(spec); return true; }
  hooks.armDrop?.(spec);
  const { el, close } = card(`
    <div class="wl-head">
      <h2><span class="wl-ti">${icon(spec.icon, 20)}</span>${esc(spec.title)}</h2>
      <p>${esc(spec.line)}</p>
      <button class="wl-x" title="Close" aria-label="Close">&times;</button>
    </div>
    <div class="wl-body">
      <div class="wl-drop"><b>Drop your STL, 3MF or OBJ anywhere</b><small>it opens straight into ${esc(spec.title.toLowerCase())}</small></div>
      <div class="wl-row">
        <button class="wl-btn go" data-c="file">Choose a file…</button>
        <button class="wl-btn" data-c="example">Try it on the example</button>
      </div>
    </div>
    <div class="wl-foot">Free and private: your file never leaves this browser.</div>`,
  () => hooks.disarmDrop?.());
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    if (b.dataset.c === "file") hooks.pickFile?.();
    if (b.dataset.c === "example") { close(); hooks.runOnCurrent?.(spec); }
  });
  return { close };
}

// The order the examples are offered in (toolbox, cheat sheet), most fun first.
export const EXAMPLE_ORDER = ["tag", "tpubox", "box", "knob"].filter((k) => EXAMPLES[k]);
