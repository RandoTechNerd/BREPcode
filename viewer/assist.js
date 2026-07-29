// Authoring help for the BrepScript viewer: the vocabulary shown in the cheat
// sheet and autocomplete, plus friendly diagnosis of common mistakes.

export const SPECS = [
  // --- shapes -------------------------------------------------------------
  {
    name: "cube", group: "Shapes", sig: "cube([X, Y, Z])",
    snippet: "cube([20, 20, 10])", argStart: 5,
    hint: "Size in mm — [width, depth, height]. Its corner sits at the origin.",
  },
  {
    name: "cylinder", group: "Shapes", sig: "cylinder({ r, h })",
    snippet: "cylinder({ r: 8, h: 20, $fn: 48 })", argStart: 9,
    hint: "r = radius, h = height. Stands up the Z axis from z=0. $fn = smoothness.",
  },
  {
    name: "sphere", group: "Shapes", sig: "sphere({ r })",
    snippet: "sphere({ r: 10, $fn: 48 })", argStart: 7,
    hint: "r = radius, centred on the origin. $fn = smoothness (try 32–64).",
  },
  {
    name: "cone", group: "Shapes", sig: "cone({ r1, r2, h })",
    snippet: "cone({ r1: 10, r2: 0, h: 20, $fn: 48 })", argStart: 5,
    hint: "r1 = bottom radius, r2 = top radius (0 for a point), h = height.",
  },
  {
    name: "torus", group: "Shapes", sig: "torus({ r, tube })",
    snippet: "torus({ r: 14, tube: 4, $fn: 48 })", argStart: 6,
    hint: "r = ring radius, tube = thickness of the ring. Lies flat in XY.",
  },
  {
    name: "linearExtrude", group: "Shapes", sig: "linearExtrude({ h }, polygon([...]))",
    snippet: "linearExtrude({ h: 10 }, polygon([[0, 0], [20, 0], [10, 15]]))", argStart: 14,
    hint: "Extrudes a flat outline up the Z axis. Points are [x, y] pairs in mm.",
  },

  // --- smoothing & lathe --------------------------------------------------
  {
    name: "fillet", group: "Smooth & lathe", sig: "fillet(radius, shape)",
    snippet: "fillet(3, cube([30, 30, 16]))", argStart: 7,
    hint: "Rounds every edge of a shape. fillet({ r: 3, faces: 'top' }, ...) rounds just one side.",
  },
  {
    name: "chamfer", group: "Smooth & lathe", sig: "chamfer(distance, shape)",
    snippet: "chamfer(2.5, cube([30, 30, 16]))", argStart: 8,
    hint: "Bevels every edge with a flat 45° cut instead of a round.",
  },
  {
    name: "revolve", group: "Smooth & lathe", sig: "revolve(angle, polygon([...]))",
    snippet: "revolve(360, polygon([[0, 0], [12, 0], [12, 3], [6, 20], [5, 20], [10, 4], [0, 4]]))", argStart: 8,
    hint: "Spins a 2D profile around the x=0 axis — vases, knobs, turned parts. Keep all points at x ≥ 0, touching x = 0.",
  },

  // --- editing imported / existing parts ----------------------------------
  // These carry a `wrap`: click one with a model already in the editor (e.g.
  // straight after Import) and it wraps THAT model automatically — no retyping.
  {
    name: "add a hole", group: "Edit a part", sig: "add a hole (drill)",
    wrap: "difference(\n  $MODEL$,\n  translate([10, 12, -1], cylinder({ r: 2.6, h: 60, $fn: 32 })),\n)",
    snippet: 'difference(\n  importedMesh("mount.stl", { split: true }),\n  translate([10, 12, -1], cylinder({ r: 2.6, h: 60, $fn: 32 })),\n)', argStart: 11,
    hint: "Drill a hole into a part (mounting / magnet holes). With a model already in the editor, clicking this wraps it for you. Move the cylinder to place the hole; make h taller than the part so it punches through. Add more cylinders for more holes.",
  },
  {
    name: "drill on a face", group: "Edit a part", sig: "drill on a face (click a face)",
    wrap: "difference(\n  $MODEL$,\n  drill([0, 0, 20], [0, 0, 1], { d: 4, depth: 20 }),\n)",
    snippet: 'difference(\n  importedMesh("mount.stl"),\n  drill([0, 0, 20], [0, 0, 1], { d: 4, depth: 20 }),\n)', argStart: 11,
    hint: "Bore a hole straight into a face. Easiest way: press the drill icon in the editor header (or ⋮ → “Drill a hole on a face”), then click the face — it fills in the point and normal for you. drill(point, normal, { d, depth, through }): d = diameter, depth = how deep, through: true = punch clean through.",
  },
  {
    name: "split & fill the middle", group: "Edit a part", sig: "split & fill the middle (stretch)",
    wrap: 'stretch({ axis: "x", by: 25, at: 0 }, $MODEL$)',
    snippet: 'stretch({ axis: "x", by: 76, at: 0 }, importedMesh("tray.stl", { split: true }))', argStart: 8,
    hint: "Split a part down a plane and fill the gap with material using its own cross-section — the classic “make it longer through the middle.” With a model in the editor, clicking this wraps it. Then just drag it on the model: the green CUT PLANE slides where the split happens (`at`), and the yellow ARROW opens the gap (`by`). Land the cut on a plain stretch of the part, not through a hole. A NEGATIVE `by` does the reverse — it takes that much out of the middle and closes the gap.",
  },
  {
    name: "cut the middle out (narrow it)", group: "Edit a part", sig: "cut the middle out (stretch, negative)",
    wrap: 'stretch({ axis: "x", by: -25, at: 0 }, $MODEL$)',
    snippet: 'stretch({ axis: "x", by: -60, at: 0 }, importedMesh("frame.stl"))', argStart: 8,
    hint: "The exact opposite of “split & fill”: it deletes a slab |by| wide from the middle and slides the two ends together, so a 120mm frame with by:-60 comes out 60mm wide with BOTH original ends intact and the height and depth untouched. This is the one to reach for when someone says “make it half as wide” — scaling would shrink the whole part, and hand-writing two intersections against guessed bounding-box numbers is how cutters end up missing the part entirely. It lands anchored on its low edge, so a centred part ends up shifted by HALF what you removed — wrap it in translate([25/2, 0, 0], …) to bring it back. Anything that lived inside the removed slab is gone, which is the point. Same drag handles as split & fill: green plane moves the cut (`at`), yellow arrow sets how much comes out (`by`). Land the cut on a plain stretch of the part, not through a hole.",
  },
  {
    name: "shave off the bottom", group: "Edit a part", sig: "cut feet / a lip off flat",
    wrap: 'translate([0, 0, -3],\n  difference($MODEL$,\n    translate([-200, -200, -1], cube([400, 400, 4]))))',
    snippet: 'translate([0, 0, -3],\n  difference(importedMesh("part.stl", { split: true }),\n    translate([-200, -200, -1], cube([400, 400, 4]))))', argStart: 15,
    hint: "Shears the lowest few millimetres off an import — feet, a raised lip, a brim. An import always sits ON z=0 with nothing below it, so the cut plane is a POSITIVE height: the 4 here is 1mm of overshoot under the bed plus the 3mm you're removing. Change the 3 and the 4 together, then the -3 drops the part back onto the bed. To leave a glue pocket where each foot was, add cylinder() cutters that start at that same height and run UPWARD into the new face.",
  },
  {
    name: "thicken walls / rails", group: "Edit a part", sig: "scale up, then shrink the middle back",
    wrap: 'translate([60, 32.5, 0],\n  stretch({ axis: "y", by: -65 },\n    stretch({ axis: "x", by: -120 },\n      scale([2, 2, 1], $MODEL$))))',
    snippet: 'translate([60, 32.5, 0],\n  stretch({ axis: "y", by: -65 },\n    stretch({ axis: "x", by: -120 },\n      scale([2, 2, 1], importedMesh("frame.stl")))))', argStart: 10,
    hint: "Makes a frame's rails (or a box's walls) thicker WITHOUT changing how big the part is. Scaling doubles the rails but doubles the outside too; the two negative stretches then take the added width and height back out of the middle, so the outside returns to its original size and only the rails stay fat. Put the part's ORIGINAL width and height in as the negative numbers, and half of each in the translate to recentre. Whatever sat in the middle — a centre bar, an inner boss — is removed; union() it back if you want it.",
  },
  {
    name: "rotate / orient", group: "Edit a part", sig: "rotate([X, Y, Z], model) — stand it up",
    wrap: "rotate([90, 0, 0], $MODEL$)",
    snippet: 'rotate([90, 0, 0], importedMesh("part.stl"))', argStart: 7,
    hint: "Turn an imported model in space — degrees about X, Y, Z. Clicking this wraps the model already in the editor, so a part that imported lying down stands up. Common: [90,0,0] tips it upright, [0,0,90] spins it flat, [180,0,0] flips it over. The rotation is baked into the mesh, so drill/split/fins all work on the new orientation. Add translate([...], …) around it to reposition.",
  },
  {
    name: "lay flat / flip", group: "Edit a part", sig: "flip a model over (rotate 180°)",
    wrap: "rotate([180, 0, 0], $MODEL$)",
    snippet: 'rotate([180, 0, 0], importedMesh("part.stl"))', argStart: 7,
    hint: "Turn a part upside down — useful when it imported with the printable face upward. Combine with the Fins button afterwards to add supports to whichever side now needs them.",
  },
  {
    name: "support fins", group: "Edit a part", sig: "fins({ side, count, sprues }, model)",
    wrap: 'fins({\n  side: "-x", count: 3, sprues: 3,\n  height: 30, depth: 14, skirt: 5,\n  at: [0, -10, 10],\n}, $MODEL$)',
    snippet: 'fins({\n  side: "-x", count: 3, sprues: 3,\n  height: 30, depth: 14, skirt: 5,\n  at: [0, -10, 10],\n}, importedMesh("part.stl"))', argStart: 5,
    hint: "Removable print supports: 45° buttress fins that DON'T touch the part. Each carries level sprues — bars the same width as the fin, rooted INSIDE the plate (so no lean or angle can ever leave one floating), flat on top, running out to a tip that stops `clearance` (0.2mm default) short of the surface. A clean print leaves daylight and nothing fuses; the part only rests on a sprue if it shifts. Easiest way: press the fin icon in the editor header (or ⋮ → “Add support fins”): it probes the model with rays, puts the fins where there's the most material to brace against, and places each tooth only where the part actually is — so a frame or bracket doesn't get teeth poking into its holes, and a recessed face still gets a longer tooth. Then edit angle (slope, 45° default), height, clearance, tooth (tooth size), count/sprues/side/skirt — or take full control with positions: [x1, x2, x3] and sprueAt: [[z…], [z…]] (one list per fin; { z, reach } sets a tooth's exact length). Knobs worth knowing: nozzle: 0.6 rescales the fin width, teeth and clearance in one go for a bigger nozzle; lean slopes the contact edge to match a part printed on a slant (it DEFAULTS to 45 — pass lean: 0 for a plumb wall, and the tool measures the real angle for you); maxDepth stops the fins spilling outside the part's own footprint; and a deliberately long reach turns a tooth into a finger that pokes in to hold a recessed pocket. Move the model afterwards? Press the tool again — it re-probes and re-fits instead of nesting.",
  },
  {
    name: "LED / glow", group: "Edit a part", sig: "glow(color, intensity, shape)",
    snippet: 'glow("#ff3b30", 2, sphere({ r: 2.5 }))', argStart: 5,
    hint: "A lit LED, lamp or screen: the shape emits its own light in the viewer (and in GLB/embed exports). glow(\"#39ff14\", 1.5, panel) makes a lit display. Looks only — geometry and STL/3MF are unchanged.",
  },
  {
    name: "glass / lens", group: "Edit a part", sig: "glass(opacity, shape)",
    snippet: "glass(0.25, cylinder({ r: 12, h: 2 }))", argStart: 6,
    hint: "Optically clear with a real reflection — binocular lenses, LCD windows, acrylic covers. Lower opacity = clearer (0.15 for a display window). The reflection environment loads only when glass is first used, so plain models pay nothing. Looks only — exports unchanged.",
  },
  {
    name: "surface texture", group: "Edit a part", sig: "texture({ pattern, depth, scale, faces }, model)",
    wrap: 'texture({ pattern: "knurl", depth: 0.6, scale: 3, faces: "sides" }, $MODEL$)',
    snippet: 'texture({ pattern: "knurl", depth: 0.6, scale: 3, faces: "sides" }, cube([30, 30, 12]))', argStart: 9,
    hint: 'REAL displaced geometry — the pattern survives into the exported STL/3MF and prints. Patterns: "knurl" (diamond grip), "fuzzy" (fuzzy skin), "layers" (proud layer lines), "bumps" (grip dots), "waffle". faces: "sides" / "top" / "bottom" / "all". depth in mm, scale = pattern size.',
  },
  {
    name: "photo emboss", group: "Edit a part", sig: "heightmap({ map, w, h, side, depth }, model)",
    act: "emboss-btn",
    hint: "A greyscale photo as relief on one face — clicking this OPENS the tool: pick an image, then click the face that should carry it. Darker pixels stand out further; invert: true flips that. The image grid is embedded in the code, so you never type it by hand.",
  },
  {
    name: "importedMesh", group: "Edit a part", sig: 'importedMesh("file.stl", { split })',
    snippet: 'importedMesh("mount.stl", { split: true })', argStart: 13,
    hint: "Brings in an STL/OBJ/3MF mesh you imported (use the Import button first). { split: true } splits a multi-body file into separate solids. Wrap it in difference() to drill, union() to add, or stretch() to lengthen. Note: mesh geometry, not editable CAD parameters.",
  },

  // --- combining ----------------------------------------------------------
  {
    name: "difference", group: "Combine", sig: "difference(shape, ...cutters)",
    snippet: "difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cylinder({ r: 6, h: 14, $fn: 48 })),\n)", argStart: 11,
    hint: "Cuts every later shape out of the first one. Great for holes and pockets.",
  },
  {
    name: "union", group: "Combine", sig: "union(a, b, ...)",
    snippet: "union(\n  cube([20, 20, 5]),\n  translate([0, 0, 5], cylinder({ r: 6, h: 12, $fn: 48 })),\n)", argStart: 6,
    hint: "Glues shapes together into one solid.",
  },
  {
    name: "intersection", group: "Combine", sig: "intersection(a, b, ...)",
    snippet: "intersection(\n  cube([20, 20, 20]),\n  sphere({ r: 13, $fn: 48 }),\n)", argStart: 13,
    hint: "Keeps only the volume where the shapes overlap.",
  },
  {
    name: "hull", group: "Combine", sig: "hull(a, b, ...)",
    snippet: "hull(\n  translate([-12, 0, 0], cylinder({ r: 4, h: 8, $fn: 48 })),\n  translate([12, 0, 0], cylinder({ r: 4, h: 8, $fn: 48 })),\n)", argStart: 5,
    hint: "Wraps the shapes in one convex skin (a smooth swept connector). Also works in pasted OpenSCAD as hull().",
  },

  // --- text & codes -------------------------------------------------------
  {
    name: "text", group: "Text & codes", sig: "text({ text, size, height })",
    snippet: 'union(\n  cube([55, 16, 3]),\n  translate([27, 8, 3], text({ text: "LABEL", size: 9, height: 1.2 })),\n)', argStart: 0,
    hint: "Real 3D letters. union(plate, text(...)) raises them; difference(plate, text({..., mode:\"deboss\"})) engraves them. size = cap height mm, height = relief. Loads the text engine on first use.",
  },
  {
    name: "stencil", group: "Text & codes", sig: "stencil({ text, size, thickness })",
    snippet: 'stencil({ text: "OPEN", size: 16, thickness: 2 })', argStart: 9,
    hint: "A paint/spray stencil: the letters are cut clean through a plate, with automatic tabs bridging each letter's inner island (O, A, P, 0…) so nothing falls out. tab / margin / thickness are adjustable.",
  },
  {
    name: "qrcode", group: "Text & codes", sig: "qrcode({ text })",
    snippet: 'qrcode({ text: "https://brepcode.com", module: 1.8 })', argStart: 8,
    hint: "A scannable QR tag: raised modules on a base plate. module = mm per square (1.2+ scans off FDM). Options: relief, base, border. Print the modules in a contrasting filament (colorize + 2-colour 3MF). Loads the code engine on first use.",
  },
  {
    name: "datamatrix", group: "Text & codes", sig: "datamatrix({ text, label })",
    snippet: 'datamatrix({ text: "PART-0001", module: 2, label: "PART-0001" })', argStart: 12,
    hint: "A compact 2D DataMatrix tag — good for tiny part marks. Add label:\"…\" to print human-readable text under it. Same options as qrcode().",
  },
  {
    name: "barcode", group: "Text & codes", sig: "barcode({ text })",
    snippet: 'barcode({ text: "0001-A", module: 0.6, height: 14 })', argStart: 9,
    hint: "A 1D Code-128 barcode as raised bars. module = narrowest bar width; height = bar length in mm.",
  },

  // --- moving -------------------------------------------------------------
  {
    name: "translate", group: "Move", sig: "translate([X, Y, Z], shape)",
    snippet: "translate([10, 0, 0], cube([10, 10, 10]))", argStart: 10,
    hint: "Moves a shape. [X, Y, Z] in mm.",
  },
  {
    name: "rotate", group: "Move", sig: "rotate([X, Y, Z], shape)",
    snippet: "rotate([0, 0, 45], cube([20, 10, 5]))", argStart: 7,
    hint: "Rotates a shape. Angles in DEGREES, around each axis.",
  },
  {
    name: "scale", group: "Move", sig: "scale([X, Y, Z], shape)",
    snippet: "scale([2, 1, 1], cube([10, 10, 10]))", argStart: 6,
    hint: "Stretches a shape. 1 = unchanged, 2 = twice as big.",
  },
  {
    name: "mirror", group: "Move", sig: "mirror([X, Y, Z], shape)",
    snippet: "mirror([1, 0, 0], translate([5, 0, 0], cube([10, 10, 10])))", argStart: 7,
    hint: "Flips a shape through a plane. [1,0,0] mirrors left-right across X.",
  },
];

// What each pasted dialect actually supports. BREPcode runs natively; the other
// three are TRANSLATED into it, so each has real edges — listed honestly here so
// the cheat sheet stops implying everything works everywhere.
export const DIALECTS = [
  {
    id: "openscad",
    label: "OpenSCAD",
    blurb: "Paste .scad source and it's translated to BREPcode — a best-effort match, not the real OpenSCAD engine. Anything it can't do warns in the status bar and passes the contents through unchanged rather than failing.",
    docs: [
      { label: "OpenSCAD cheat sheet", url: "https://openscad.org/cheatsheet/" },
      { label: "OpenSCAD manual", url: "https://en.wikibooks.org/wiki/OpenSCAD_User_Manual" },
    ],
    works: [
      "cube, sphere, cylinder, square, circle, polygon",
      "linear_extrude, offset, hull",
      "translate, rotate, scale, mirror",
      "union, difference, intersection",
      "module and function definitions, children()",
      "for / if / let, list comprehensions, $fn",
      "a little BOSL2: cuboid (with rounding), prismoid, xcopies/ycopies/zcopies, grid_copies",
      "% modifier is accepted and ignored",
    ],
    limits: [
      "rotate_extrude — only linear_extrude is wired",
      "text() — not wired into the DSL yet",
      "minkowski, projection, surface, polyhedron",
      "import(), multmatrix(), resize()",
    ],
    sample: `difference() {
  cube([40, 40, 12], center = true);
  translate([0, 0, -1]) cylinder(h = 20, r = 8, $fn = 48);
}`,
  },
  {
    id: "jscad",
    label: "JSCAD",
    blurb: "Paste a whole @jscad/modeling module — require, main(), module.exports and all. The module skeleton is rewritten and run. Returning an ARRAY from main() keeps the parts as separate solids (fast, and each keeps its own colour).",
    docs: [
      { label: "JSCAD user guide", url: "https://openjscad.xyz/dokuwiki/doku.php" },
      { label: "@jscad/modeling API", url: "https://openjscad.xyz/docs/" },
    ],
    works: [
      "3D primitives: cube, cuboid, roundedCuboid, sphere, ellipsoid, geodesicSphere, cylinder, cylinderElliptic, roundedCylinder, torus, polyhedron",
      "2D primitives: polygon, rectangle, roundedRectangle, square, circle, ellipse, star, triangle",
      "booleans: union, subtract, intersect",
      "transforms: translate/rotate/scale/mirror (+ X/Y/Z variants)",
      "hulls: hull, hullChain — this is how you loft/flare/taper (no minkowski needed)",
      "extrusions: extrudeLinear, extrudeRotate (lathe)",
      "expansions: offset / expand — 2D outlines only",
      "colors: colorize, glow, hexToRgb, rgbToHex, colorToRgba",
      "maths: degToRad, radToDeg",
      "main() returning one solid or an array of them",
    ],
    limits: [
      "main must be its own declaration — `const main = () => …` or `function main()`. A main that only exists as a property inside module.exports = { main: () => … } gets stripped with the exports line.",
      "measureBoundingBox / measureVolume / center / align — they need built geometry, which doesn't exist while the model is still being described. Keep your sizes in variables and use those.",
      "offset/expand on a 3D solid (that's a Minkowski sum) — scale() or rebuild at size",
      "text geometry, curves, and raw geometries",
    ],
    sample: `const { primitives, booleans, transforms, hulls, colors } = require('@jscad/modeling');
const { cylinder, roundedCylinder } = primitives;
const { subtract } = booleans;
const { translate } = transforms;
const { hull } = hulls;
const { colorize } = colors;

// hull() across a stack of discs is how you loft a flared/bell body
const body = hull(
  cylinder({ radius: 34, height: 2, center: [0, 0, 1] }),
  cylinder({ radius: 22, height: 2, center: [0, 0, 26] }),
  cylinder({ radius: 24, height: 2, center: [0, 0, 72] }),
);

const main = () => colorize([0.85, 0.7, 0.15], subtract(
  body,
  translate([0, 0, 12], roundedCylinder({ height: 90, radius: 19, roundRadius: 6, segments: 48 })),
  translate([0, 0, -1], cylinder({ radius: 7.5, height: 20 })),
));

module.exports = { main };`,
  },
  {
    id: "py",
    label: "build123d",
    blurb: "Paste build123d or CadQuery Python — ALGEBRA MODE only (flat assignments, no with-blocks). Watch the origin difference: build123d primitives are CENTRED, while BREPcode's cube() sits corner-at-origin — the translation accounts for it, but keep it in mind when reading numbers.",
    works: [
      "from build123d import *  (the import line is ignored, not required)",
      "3D: Box · Cylinder · Cone · Sphere · Torus · Wedge · ConvexPolyhedron · Hole / CounterBoreHole / CounterSinkHole — all centred",
      "2D sketches: Rectangle(Rounded) · Circle · Ellipse · Polygon · RegularPolygon · Triangle · Trapezoid · SlotOverall / SlotCenterToCenter / SlotCenterPoint — combine with + − &, then extrude(sketch, amount=h, both=True)",
      "1D lines: Line · Polyline · FilletPolyline · PolarLine · Spline · Bezier · CenterArc · EllipticalCenterArc · ThreePointArc · RadiusArc · SagittaArc · JernArc — chain with +, close with make_face(...), then extrude",
      "Pos(x, y, z) * shape · Rot(…) * shape — they move sketches and wires in-plane too",
      "part = A - B, A + B, A & B and part -= / += / &= compound assignment",
      "plain math on variables and tuple unpacking (l, w, t = 40, 60, 10)",
      "CadQuery basics: cq.Workplane(\"XY\").box(…).union(…).cut(…).translate(…)",
    ],
    limits: [
      "builder mode — with BuildPart() as …: (rewrite in algebra mode, it is usually shorter)",
      "indented blocks — if / for / def / with",
      "exotic curves — Airfoil, BSpline, TangentArc, Helix, conic arcs (the supported arc set covers most outlines)",
      "Text (use BREPcode's text() instead) · drawing annotations (use the SVG blueprint export) · revolve/sweep/loft",
      "CadQuery selectors & sketching — .faces(\">Z\"), .edges(), .workplane(), .fillet(), .extrude()",
    ],
    docs: [
      { label: "build123d docs (readthedocs)", url: "https://build123d.readthedocs.io/en/latest/" },
      { label: "build123d cheat sheet", url: "https://build123d.readthedocs.io/en/latest/cheat_sheet.html" },
      { label: "CadQuery docs", url: "https://cadquery.readthedocs.io/en/latest/" },
    ],
    sample: `from build123d import *

l, w, t = 40, 60, 10
part = Box(l, w, t)
part -= Pos(0, 0, 0) * Cylinder(8, t + 2)
part += Pos(0, 25, 0) * Sphere(6)`,
  },
];

export const RECIPES = [
  {
    label: "Fluorescence microscope (color demo)",
    note: "colorize + glow showcase, every part labeled",
    code: `const { primitives, transforms, booleans, colors } = require('@jscad/modeling');
const { cuboid, cylinder, cylinderElliptic, sphere } = primitives;
const { translate, rotateX, rotateY, rotateZ, scale } = transforms;
const { colorize, glow, hexToRgb } = colors;

// ── tiny 3D stick-font for labels ──
const FONT = {
  A:[[[0,0],[0,3],[1,4],[2,3],[2,0]],[[0,2],[2,2]]],
  B:[[[0,0],[0,4],[1.5,4],[2,3.4],[2,2.6],[1.5,2],[0,2]],[[1.5,2],[2,1.4],[2,0.6],[1.5,0],[0,0]]],
  C:[[[2,3.5],[1.5,4],[0.5,4],[0,3.5],[0,0.5],[0.5,0],[1.5,0],[2,0.5]]],
  D:[[[0,0],[0,4],[1.4,4],[2,3],[2,1],[1.4,0],[0,0]]],
  E:[[[2,4],[0,4],[0,0],[2,0]],[[0,2],[1.5,2]]],
  F:[[[2,4],[0,4],[0,0]],[[0,2],[1.5,2]]],
  G:[[[2,3.5],[1.5,4],[0.5,4],[0,3.5],[0,0.5],[0.5,0],[1.5,0],[2,0.5],[2,1.6],[1,1.6]]],
  H:[[[0,4],[0,0]],[[2,4],[2,0]],[[0,2],[2,2]]],
  I:[[[0.5,4],[1.5,4]],[[1,4],[1,0]],[[0.5,0],[1.5,0]]],
  J:[[[2,4],[2,0.5],[1.5,0],[0.6,0],[0,0.6]]],
  K:[[[0,4],[0,0]],[[2,4],[0,2],[2,0]]],
  L:[[[0,4],[0,0],[2,0]]],
  M:[[[0,0],[0,4],[1,2.4],[2,4],[2,0]]],
  N:[[[0,0],[0,4],[2,0],[2,4]]],
  O:[[[0.5,0],[1.5,0],[2,0.5],[2,3.5],[1.5,4],[0.5,4],[0,3.5],[0,0.5],[0.5,0]]],
  P:[[[0,0],[0,4],[1.5,4],[2,3.4],[2,2.6],[1.5,2],[0,2]]],
  R:[[[0,0],[0,4],[1.5,4],[2,3.4],[2,2.6],[1.5,2],[0,2]],[[1,2],[2,0]]],
  S:[[[2,3.5],[1.5,4],[0.5,4],[0,3.5],[0,2.5],[0.5,2],[1.5,2],[2,1.5],[2,0.5],[1.5,0],[0.5,0],[0,0.5]]],
  T:[[[0,4],[2,4]],[[1,4],[1,0]]],
  U:[[[0,4],[0,0.5],[0.5,0],[1.5,0],[2,0.5],[2,4]]],
  W:[[[0,4],[0.5,0],[1,2],[1.5,0],[2,4]]],
  V:[[[0,4],[1,0],[2,4]]], X:[[[0,4],[2,0]],[[2,4],[0,0]]], Y:[[[0,4],[1,2],[2,4]],[[1,2],[1,0]]], ' ':[],
};
const seg = (a, b, t, col) => {
  const dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz)||0.001, ang=Math.atan2(dz,dx);
  return glow(col, translate([(a[0]+b[0])/2,0,(a[1]+b[1])/2], rotateY(-ang, cuboid({ size:[len+t, t*0.9, t] }))), 0.8);
};
const label = (text, { pos=[0,0,0], size=6, color=hexToRgb('#00ffd0') }) => {
  const t=size*0.14, adv=size*1.6, out=[]; let cx=0;
  for (const ch of text.toUpperCase()) {
    for (const poly of (FONT[ch]||FONT[' '])) for (let i=0;i+1<poly.length;i++)
      out.push(seg([cx+poly[i][0]*size/2, poly[i][1]*size/2],[cx+poly[i+1][0]*size/2, poly[i+1][1]*size/2], t, color));
    cx += adv;
  }
  const w=cx-(adv-size), off=[pos[0]-w/2, pos[1], pos[2]];
  return out.map((s)=>translate(off, s));
};

const main = () => {
  const bodyPaint=hexToRgb('#eeeeee'), darkPlastic=hexToRgb('#2b2b2b'), rubber=hexToRgb('#111111');
  const metal=hexToRgb('#cccccc'), darkMetal=hexToRgb('#5f6a78'), navy=hexToRgb('#2c3550'), brass=hexToRgb('#b5a642');
  const glass=hexToRgb('#2288ff'), neon=hexToRgb('#00e6ff'), cordCol=hexToRgb('#181818');
  const btnRed=hexToRgb('#e23b3b'), ledGrn=hexToRgb('#39e05a');
  const P=(c,o)=>colorize(c,o);

  // continuous CABLE: cylinders between points + spheres at joints (matched radii)
  const cable = (pts, r, col=cordCol) => {
    const parts=[];
    for (let i=0;i<pts.length;i++){
      parts.push(P(col, translate(pts[i], sphere({ radius:r, segments:14 }))));
      if (i+1<pts.length){
        const a=pts[i], b=pts[i+1], dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2];
        const L=Math.hypot(dx,dy,dz)||0.001, phi=Math.atan2(dy,dx), theta=Math.acos(Math.max(-1,Math.min(1,dz/L)));
        parts.push(P(col, translate([(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],
          rotateZ(phi, rotateY(theta, cylinder({ radius:r, height:L, segments:14 }))))));
      }
    }
    return parts;
  };

  // 1. base, arm, feet
  const base = P(bodyPaint, translate([0,-14,20], cuboid({ size:[160,220,40] })));
  const baseAccent = P(navy, translate([0,-80,45], cuboid({ size:[160,60,10] })));
  const arm = P(bodyPaint, translate([0,60,140], cuboid({ size:[70,80,220] })));
  const foot = (x,y)=>P(rubber, translate([x,y,3], cylinder({ radius:9, height:6 })));
  const chassis = [base, baseAccent, arm, foot(-65,85), foot(65,85), foot(-65,-105), foot(65,-105)];

  // 2. focus knobs
  const focusAssembly = [
    P(darkPlastic, translate([0,40,75], rotateY(Math.PI/2, cylinder({ radius:28, height:110 })))),
    P(metal, translate([0,40,75], rotateY(Math.PI/2, cylinder({ radius:15, height:130 })))),
  ];

  // 3. stage + slide + TOP-DOWN spring clip
  const stagePlate = P(navy, translate([0,-20,130], cuboid({ size:[130,110,12] })));
  const slideHolder = P(metal, translate([0,-30,138], cuboid({ size:[80,40,4] })));
  const slide = P(glass, translate([0,-30,140], cuboid({ size:[75,25,1] })));
  const clip = [
    P(metal, translate([-30,-12,146], cylinder({ radius:3, height:14 }))),
    P(metal, translate([-30,-19,152], rotateX(-Math.PI/3, cuboid({ size:[5,20,3] })))),
    P(metal, translate([-30,-27,143], rotateX(Math.PI/2, cuboid({ size:[5,8,3] })))),
    P(metal, translate([-30,-30,141.5], cuboid({ size:[10,10,2] }))),
  ];
  const stageAssembly = [stagePlate, slideHolder, slide, ...clip];

  // 4. coaxial STAGE-DRIVE knob (x/y slide movement)
  const stageDrive = [
    P(metal, translate([50,-40,112], cylinder({ radius:6, height:44 }))),
    P(darkPlastic, translate([50,-40,104], cylinder({ radius:16, height:14 }))),
    P(metal, translate([50,-40,92], cylinder({ radius:11, height:12 }))),
    P(darkPlastic, translate([50,-40,86], cylinder({ radius:6, height:8 }))),
  ];

  // 5. condenser + field lens
  const substageAssembly = [
    P(metal, translate([0,-20,110], cylinder({ radius:25, height:25 }))),
    P(darkPlastic, translate([-40,-20,100], rotateY(Math.PI/2, cylinder({ radius:10, height:15 })))),
    glow(glass, translate([0,-20,41], cylinder({ radius:30, height:5 })), 0.5),
    P(darkPlastic, translate([0,-20,42], cylinder({ radius:35, height:4 }))),
  ];

  // 6. NOSEPIECE turret + radial objectives (equal spacing, flush, tilt out; one at slide)
  const mountZ = 186;
  const turret = [
    P(darkMetal, translate([0,-20,203], cylinder({ radius:36, height:13 }))),
    P(metal, translate([0,-20,195], cylinderElliptic({ startRadius:24, endRadius:36, height:16 }))),
    P(darkPlastic, translate([0,-20,203], cylinder({ radius:38, height:5 }))),
  ];
  const objective = (bandCol, len, ringCol) => [
    P(darkPlastic, translate([0,0,-3], cylinder({ radius:12.5, height:6, segments:16 }))),
    P(metal, translate([0,0,-len/2-5], cylinder({ radius:10.5, height:len }))),
    P(bandCol, translate([0,0,-len*0.4-5], cylinder({ radius:11.3, height:5 }))),
    P(ringCol, translate([0,0,-len-4], cylinder({ radius:11, height:2 }))),
  ];
  const R = 15;
  const mountObj = (parts, angleDeg, tiltDeg) => {
    const a = angleDeg*Math.PI/180, cx = R*Math.cos(a), cy = R*Math.sin(a);
    return parts.map((p)=>translate([cx,-20+cy,mountZ], rotateZ(a+Math.PI/2, rotateX(tiltDeg*Math.PI/180, p))));
  };
  const objectives = [
    ...mountObj(objective(hexToRgb('#e23b3b'), 44, brass), 270, 0),   // red 100x — at the slide
    ...mountObj(objective(hexToRgb('#3ba0e2'), 34, glass), 30, 20),   // blue 40x — tilted out
    ...mountObj(objective(hexToRgb('#e2c93b'), 26, glass), 150, 20),  // yellow 10x — tilted out
  ];
  const nosepiece = [...turret, ...objectives];

  // 7. FILTER-CUBE WHEEL (fluorescence block turret)
  const filterWheel = [
    P(navy, translate([-46,20,192], cuboid({ size:[46,60,44] }))),
    P(darkPlastic, translate([-72,20,192], rotateY(Math.PI/2, cylinder({ radius:9, height:14 })))),
    P(metal, translate([-80,20,192], rotateY(Math.PI/2, cylinder({ radius:4, height:8 })))),
    P(darkPlastic, translate([-46,-14,192], cuboid({ size:[30,8,30] }))),
    glow(hexToRgb('#8fe0ff'), translate([-46,20,170], cylinder({ radius:6, height:6 })), 0.5),
  ];

  // 8. head + oculars
  const viewingHead = P(bodyPaint, translate([0,-10,240], cuboid({ size:[90,80,55] })));
  const trinoPort = P(darkPlastic, translate([0,25,258], cylinder({ radius:14, height:24 })));
  const ocular = (x)=>[
    P(darkPlastic, translate([x,-45,275], rotateX(Math.PI/4, cylinder({ radius:12, height:50 })))),
    P(rubber, translate([x,-60,295], rotateX(Math.PI/4, cylinder({ radius:16, height:15 })))),
    glow(glass, translate([x,-64.5,301], rotateX(Math.PI/4, cylinder({ radius:10, height:2 }))), 0.4),
  ];
  const headAssembly = [viewingHead, trinoPort, ...ocular(-25), ...ocular(25)];
  const epiPort = P(darkPlastic, translate([48,60,150], cuboid({ size:[26,26,26] })));

  // SEPARATE LAMPHOUSE with on/off switch
  const LB=[180,105,0];
  const lampHouse = [
    P(darkMetal, translate([LB[0],LB[1],65], cuboid({ size:[90,100,120] }))),
    P(metal, translate([LB[0],LB[1]+52,90], cuboid({ size:[70,10,60] }))),
    P(darkPlastic, translate([LB[0],LB[1]-52,80], cuboid({ size:[70,8,70] }))),
    glow(hexToRgb('#dff3ff'), translate([LB[0],LB[1]-56,80], cylinder({ radius:14, height:4, segments:32 })), 1.2),
    P(darkPlastic, translate([LB[0],LB[1]-56,118], rotateX(Math.PI/2, cylinder({ radius:5, height:14 })))),
    P(btnRed, translate([LB[0],LB[1]-58,118], rotateX(Math.PI/2, cylinder({ radius:3.5, height:8 })))),
    glow(ledGrn, translate([LB[0]+22,LB[1]-56,100], sphere({ radius:3 })), 1.4),
    P(rubber, translate([LB[0]-33,LB[1]-40,4], cylinder({ radius:6, height:8 }))),
    P(rubber, translate([LB[0]+33,LB[1]-40,4], cylinder({ radius:6, height:8 }))),
    P(rubber, translate([LB[0]-33,LB[1]+40,4], cylinder({ radius:6, height:8 }))),
    P(rubber, translate([LB[0]+33,LB[1]+40,4], cylinder({ radius:6, height:8 }))),
  ];
  const lampCable = cable([[LB[0]-45,LB[1]-30,110],[LB[0]-95,LB[1]-15,116],[LB[0]-140,LB[1]+8,112],[130,30,150],[70,55,155],[52,60,163]], 4);
  const lampAssembly = [...lampHouse, ...lampCable];

  // SEPARATE 45° LCD SCREEN box with a neon FISH
  const SC=[-165,-60,0];
  const screenBox = [
    P(darkPlastic, translate([SC[0],SC[1],8], cuboid({ size:[70,55,16] }))),
    P(darkPlastic, translate([SC[0],SC[1]+12,40], rotateX(-Math.PI/4, cuboid({ size:[80,10,56] })))),
    glow(neon, translate([SC[0],SC[1]+8,40], rotateX(-Math.PI/4, cuboid({ size:[68,2,44] }))), 1.1),
  ];
  const fishOn=(o)=>translate([SC[0],SC[1]+4,40], rotateX(-Math.PI/4, o));
  const fish = [
    fishOn(glow(neon, scale([1.7,1,1], sphere({ radius:8 })), 1.6)),
    fishOn(glow(neon, translate([-15,0,0], rotateY(Math.PI/2, cylinder({ radius:7, height:1, segments:3 }))), 1.6)),
    fishOn(glow(neon, translate([2,0,7], scale([1.2,1,0.5], sphere({ radius:4.5 }))), 1.6)),
    fishOn(glow(hexToRgb('#ffffff'), translate([7,0,1], sphere({ radius:1.8 })), 1.2)),
  ];
  const scrCable = cable([[SC[0]+28,SC[1],12],[SC[0]+70,SC[1]+12,15],[-80,-32,30],[-52,-30,44]], 4);
  const screenAssembly = [...screenBox, ...fish, ...scrCable];

  const labels = [
    label('OCULARS',     { pos:[-108,-70,300], size:7 }),
    label('HEAD',        { pos:[100,-40,252], size:7 }),
    label('FILTER WHEEL',{ pos:[-95,20,225], size:6 }),
    label('NOSEPIECE',   { pos:[100,-20,200], size:6 }),
    label('OBJECTIVES',  { pos:[110,-40,160], size:6 }),
    label('STAGE',       { pos:[-120,-20,138], size:7 }),
    label('SLIDE CLIP',  { pos:[-118,-8,158], size:6 }),
    label('STAGE DRIVE', { pos:[95,-42,96], size:6 }),
    label('CONDENSER',   { pos:[-128,-22,104], size:6 }),
    label('FOCUS',       { pos:[-122,42,72], size:7 }),
    label('BASE',        { pos:[-108,-14,18], size:7 }),
    label('LAMPHOUSE',   { pos:[LB[0],LB[1],150], size:8, color:hexToRgb('#ffd0a0') }),
    label('ON OFF',      { pos:[LB[0],LB[1]-70,140], size:6, color:hexToRgb('#ffd0a0') }),
    label('LCD SCREEN',  { pos:[SC[0],SC[1],80], size:7, color:neon }),
  ].flat();

  return [
    ...chassis, ...focusAssembly, ...stageAssembly, ...stageDrive, ...substageAssembly,
    ...nosepiece, ...filterWheel, ...headAssembly, epiPort,
    ...lampAssembly, ...screenAssembly, ...labels,
  ];
};

module.exports = { main };`,
  },
  {
    label: "Plate with 4 bolt holes",
    code: `const W = 60, D = 40, T = 6, r = 2.5, inset = 7;
const hole = (x, y) => translate([x, y, -1], cylinder({ r, h: T + 2, $fn: 32 }));
return difference(
  cube([W, D, T]),
  hole(inset, inset),
  hole(W - inset, inset),
  hole(inset, D - inset),
  hole(W - inset, D - inset),
);`,
  },
  {
    label: "Hollow box (open top)",
    code: `difference(
  cube([40, 30, 20]),
  translate([3, 3, 3], cube([34, 24, 20])),
)`,
  },
  {
    label: "Rounded peg on a base",
    code: `union(
  cube([24, 24, 6]),
  translate([12, 12, 6], cylinder({ r: 5, h: 14, $fn: 48 })),
  translate([12, 12, 20], sphere({ r: 5, $fn: 48 })),
)`,
  },
  {
    label: "Rounded coin dish (manual fillets)",
    note: "three hand-rolled fillet tricks — takes ~20s to build",
    code: `// Manual fillets, three tricks: rounded puck, sphere scoop, rim roll.
const R = 40, H = 16, rr = 6, scoopR = 60, depth = 10, FN = 96;

// 1. rounded puck: core + wide band + two torus roundovers
const puck = union(
  cylinder({ r: R - rr, h: H, $fn: FN }),
  translate([0, 0, rr], cylinder({ r: R, h: H - 2 * rr, $fn: FN })),
  translate([0, 0, rr], torus({ r: R - rr, tube: rr, $fn: FN })),
  translate([0, 0, H - rr], torus({ r: R - rr, tube: rr, $fn: FN })),
);

// 2. sphere scoop: one big sphere carves an organic bowl
const scoop = translate([0, 0, H - depth + scoopR], sphere({ r: scoopR, $fn: FN }));

// 3. rim roll: a slim torus rounds off the scoop's sharp edge
const rimR = Math.sqrt(scoopR * scoopR - (scoopR - depth) ** 2);
return difference(puck, scoop, translate([0, 0, H], torus({ r: rimR, tube: 2, $fn: FN })));`,
  },
  {
    label: "LTT screwdriver collar (TPU, screw-mount)",
    note: "print in TPU upright — flat bottom on the bed; measure your driver's waist and tune waistD — ~15s build",
    code: `// Printable "balloony" LTT collar: push the handle's waist in from the front,
// the arms flex, it clicks home. FLAT BOTTOM (no supports), rounded top, and two
// countersunk screw holes driven from INSIDE the bore out through the flat back
// to wall-mount it. waistD is an ESTIMATE — measure your driver and adjust.
const params = {};
const waistD = params.waistD ?? 31.0;
const clearance = 0.3, snap = 2.2;
const H = 17, wall = 4.5, backX = 22, off = 2.5, lipR = 2.0, rr = 5.5, cornerR = 3.0;
const screwD = 4.0, headD = 7.0, screwY = 5.0, FN = 96;

const gripD = waistD + clearance;
const Rin = gripD / 2;
const Rout = Rin + wall + off + 0.35;

// outer outline: barrel + flat back, blended with tangent fillets
const filletCy = Math.sqrt((Rout - cornerR) ** 2 - (backX - off - cornerR) ** 2);
const filletC = [-(backX - cornerR), filletCy];
const tAng = Math.atan2(filletCy, filletC[0] + off);
const pts = [];
const arc = (cx, cy, r, a0, a1, n) => {
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
};
pts.push([-backX, -filletCy]);
pts.push([-backX, filletCy]);
arc(filletC[0], filletC[1], cornerR, Math.PI, tAng, 10);
arc(-off, 0, Rout, tAng, -tAng, FN);
arc(filletC[0], -filletC[1], cornerR, -tAng, -Math.PI, 10);
const outline = translate([0, 0, -H / 2], linearExtrude({ h: H }, polygon(pts)));

// the C opening: wedge + round lips + tangent entry flares
const opening = gripD - 2 * snap;
const RmidB = Rin + lipR;
const g = opening / 2 + lipR;
const lipX = Math.sqrt(Math.max(RmidB * RmidB - g * g, 1));
const wedge = translate([0, 0, -(H + 2) / 2], linearExtrude({ h: H + 2 }, polygon([
  [lipX, g], [Rout + 4, g + 10], [Rout + 4, -(g + 10)], [lipX, -g],
])));
const lip = (sy) => translate([lipX, sy * g, -H / 2 - 0.5], cylinder({ r: lipR, h: H + 1, $fn: 40 }));
const u = Math.SQRT1_2, flareR = 8;
const flare = (sy) => translate(
  [lipX + (lipR + flareR) * u, sy * (g + (lipR + flareR) * u), -(H + 2) / 2],
  cylinder({ r: flareR, h: H + 2, $fn: 64 }));
const opened = union(difference(outline, wedge, flare(1), flare(-1)), lip(1), lip(-1));

// balloony envelope: straight sides, FLAT bottom, ONE rounded top rim
const envelope = union(
  translate([-off, 0, -H / 2], cylinder({ r: Rout, h: H - rr, $fn: FN })),
  translate([-off, 0, -H / 2], cylinder({ r: Rout - rr, h: H, $fn: FN })),
  translate([-off, 0, H / 2 - rr], torus({ r: Rout - rr, tube: rr, $fn: FN })),
);
const body = intersection(opened, envelope);

// straight bore (no inward squeeze), mouths rolled open
const bore = translate([0, 0, -(H + 2) / 2], cylinder({ r: Rin, h: H + 2, $fn: FN }));
const mouth = (sz) => translate([0, 0, sz * (H / 2)], torus({ r: Rin + 0.4, tube: 1.4, $fn: FN }));

// countersunk screw holes drilled from the inside: wide head recess opens into
// the bore, small shank exits the flat back — mount with screws from inside.
const shank = (y) => translate([-(backX + 3), y, 0],
  rotate([0, 90, 0], cylinder({ r: screwD / 2, h: backX + 8, $fn: 32 })));
const head = (y) => translate([-(Rin + 3), y, 0],
  rotate([0, 90, 0], cylinder({ r: headD / 2, h: Rin + 8, $fn: 40 })));
const screw = (y) => union(shank(y), head(y));

return difference(body, bore, mouth(1), mouth(-1), screw(screwY), screw(-screwY));`,
  },
];

export const NAMES = SPECS.map((s) => s.name);
export const specOf = (name) => SPECS.find((s) => s.name === name) || null;

// Things people reach for out of habit that BrepScript genuinely doesn't have.
const NOT_HERE = {
  linear_extrude: "here it's linearExtrude({ h: 10 }, polygon([[x, y], ...])) — or paste OpenSCAD and it translates",
  rotate_extrude: "not supported yet — only linear extrusion is",
  circle: "use cylinder({ r, h }) for a round solid, or polygon(...) + linearExtrude",
  square: "use cube([X, Y, Z]), or polygon(...) + linearExtrude",
  hull: "not implemented",
  minkowski: "not implemented",
  fillet: "not wired up yet — it needs edge selection",
  chamfer: "not wired up yet — it needs edge selection",
  extrude: "not wired up yet",
  revolve: "not wired up yet",
  color: "the viewer shades everything the same way",
  text: "not wired up in the DSL yet",
};

function editDistance(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(
        m[i - 1][j] + 1,
        m[i][j - 1] + 1,
        m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return m[a.length][b.length];
}

export function closestName(word) {
  const w = String(word).toLowerCase();
  let best = null, bestD = Infinity;
  for (const n of NAMES) {
    const d = editDistance(w, n.toLowerCase());
    if (d < bestD) { bestD = d; best = n; }
  }
  return bestD <= Math.max(2, Math.floor(w.length / 2)) ? best : null;
}

// Which function call is the caret sitting inside? Used for the live hint line.
export function enclosingCall(src, pos) {
  let depth = 0;
  for (let i = pos - 1; i >= 0; i--) {
    const ch = src[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      if (depth === 0) {
        const m = src.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/);
        return m ? m[1] : null;
      }
      depth--;
    }
  }
  return null;
}

const countOf = (src, ch) => src.split(ch).length - 1;

// ------------------------------------------------------- inline keyword swapper

// Groups the swapper cycles through. Booleans and transforms share argument
// shapes, so those swaps are literal; primitives get their arguments converted.
export const SWAP_GROUPS = [
  ["cube", "cylinder", "sphere", "cone", "torus"],
  ["union", "difference", "intersection"],
  ["translate", "rotate", "scale", "mirror"],
];

export function swapTarget(word, dir = 1) {
  for (const group of SWAP_GROUPS) {
    const i = group.indexOf(word);
    if (i >= 0) return group[(i + dir + group.length) % group.length];
  }
  return null;
}

export function wordAt(text, pos) {
  let s = pos, e = pos;
  while (s > 0 && /[\w$]/.test(text[s - 1])) s--;
  while (e < text.length && /[\w$]/.test(text[e])) e++;
  return s === e ? null : { start: s, end: e, word: text.slice(s, e) };
}

// The number the caret is in or immediately after (so "10|" and "1|0" both hit).
export function numberAt(text, pos) {
  for (const m of text.matchAll(/-?\d+\.?\d*/g)) {
    if (pos >= m.index && pos <= m.index + m[0].length) {
      return { start: m.index, end: m.index + m[0].length, value: parseFloat(m[0]) };
    }
  }
  return null;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

// Every primitive call site in the source, in textual order, with the span of
// the whole call. Textual order equals emission order for straight-line code —
// the viewer verifies the kind sequence against the compile trace before
// trusting the mapping.
const PRIM_WORDS = /\b(freeform|hull|cube|cuboid|sphere|spheroid|cylinder|cyl|cone|torus|importedMesh)\s*\(/g;
const KIND_CODES = {
  cube: ["P.CU"], cuboid: ["P.CU"],
  sphere: ["P.S"], spheroid: ["P.S"],
  cylinder: ["P.CY", "P.CO"], cyl: ["P.CY", "P.CO"],
  cone: ["P.CO"], torus: ["P.T"],
  importedMesh: ["IMPORT3D"],
  // hull() (and freeform(), which is a hull of corner markers) builds its
  // children in a THROWAWAY history and re-imports the result, so it reaches
  // the trace as a single IMPORT3D no matter how many shapes went in.
  freeform: ["IMPORT3D"], hull: ["IMPORT3D"],
};

export function primitiveSites(text) {
  const sites = [];
  // Shapes written INSIDE a hull()/freeform() are built in a throwaway history
  // and re-imported as one mesh, so they never reach the trace. Counting them
  // as sites made the sequences disagree and killed the whole map.
  let swallowUntil = -1;
  for (const m of text.matchAll(PRIM_WORDS)) {
    const open = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) { end = i + 1; break; }
    }
    if (end < 0) continue;
    if (m.index < swallowUntil) continue;          // nested inside a hull
    if (m[1] === "hull" || m[1] === "freeform") swallowUntil = end;
    sites.push({ kind: m[1], start: m.index, end, codes: KIND_CODES[m[1]] });
  }
  return sites;
}

// Map compile-trace entries (feature id + kind code) onto textual sites. Only
// trusted when the sequences agree — loops, helper functions, and reused shape
// variables all make them diverge, and then we simply don't map.
export function mapTraceToSites(trace, text) {
  const sites = primitiveSites(text);

  // Best case: the sequences agree outright, so every shape maps.
  if (trace.length === sites.length
    && trace.every((t, i) => sites[i].codes.includes(t.code))) {
    const byId = {};
    trace.forEach((t, i) => { byId[t.id] = sites[i]; });
    return byId;
  }

  // Otherwise DEGRADE PER SHAPE rather than giving up on the document. This
  // used to return null, which meant one loop, helper or unrecognised call made
  // every shape in the model unclickable, with no way to tell why.
  //
  // The safety rule is unchanged: only map where the answer is provably right,
  // because a WRONG mapping is far worse than none — dragging one shape would
  // silently rewrite another shape's numbers. So a code is only mapped when the
  // trace and the source contain the SAME NUMBER of it. Then the nth of that
  // code in the trace must be the nth in the source, since the compiler emits
  // in source order. Any code whose counts disagree is left unmapped, and only
  // those shapes go dead.
  //
  // A site may accept several codes (cylinder covers both P.CY and P.CO). Pin
  // it to one by seeing which of them the trace actually contains; if more than
  // one does, the document mixes them and there is no safe way to tell which
  // site produced which, so that site is left out.
  const present = new Set(trace.map((t) => t.code));
  const byCode = new Map();
  sites.forEach((s, i) => {
    const hits = s.codes.filter((c) => present.has(c));
    if (hits.length !== 1) return;
    const list = byCode.get(hits[0]) || [];
    list.push(i);
    byCode.set(hits[0], list);
  });
  const traceByCode = new Map();
  trace.forEach((t, i) => {
    const list = traceByCode.get(t.code) || [];
    list.push(i);
    traceByCode.set(t.code, list);
  });

  const byId = {};
  let mapped = 0;
  for (const [code, tIdx] of traceByCode) {
    const sIdx = byCode.get(code);
    if (!sIdx || sIdx.length !== tIdx.length) continue;   // counts disagree: skip this code
    tIdx.forEach((t, k) => { byId[trace[t].id] = sites[sIdx[k]]; mapped++; });
  }
  return mapped ? byId : null;
}

// Innermost union/difference/intersection call span containing pos, or null.
export function enclosingBooleanSpan(text, pos) {
  let best = null;
  for (const m of text.matchAll(/\b(union|difference|intersection)\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) { end = i + 1; break; }
    }
    if (end < 0) continue;
    if (pos > m.index && pos < end) {
      if (!best || m.index > best.start) best = { start: m.index, end, op: m[1], open };
    }
  }
  return best;
}

// When the dragged primitive is the FIRST shape inside a boolean, moving "the
// shape" should move the whole boolean — its cutters ride along.
export function dragSpanFor(text, site) {
  const op = enclosingBooleanSpan(text, site.start);
  if (op) {
    const first = primitiveSites(text).find((s) => s.start > op.open && s.start < op.end);
    if (first && first.start === site.start) {
      return { start: op.start, end: op.end, label: `${op.op}(…)`, whole: true };
    }
  }
  return { start: site.start, end: site.end, label: site.kind, whole: false };
}

// The number to edit when resizing `site` along world axis 0/1/2 (x/y/z).
// Returns {numStart, numEnd, value, label} with offsets absolute in `text`.
export function findResizeTarget(text, site, axis) {
  const s = text.slice(site.start, site.end);
  const numMatches = [...s.matchAll(/-?\d+\.?\d*/g)];
  const mk = (mm, label) => mm ? {
    numStart: site.start + mm.index,
    numEnd: site.start + mm.index + mm[0].length,
    value: parseFloat(mm[0]),
    label,
  } : null;

  if (site.kind === "cube" || site.kind === "cuboid") {
    const vec = /\[([^\]]*)\]/.exec(s);
    if (vec) {
      const inner = [...vec[1].matchAll(/-?\d+\.?\d*/g)];
      const target = inner[axis] ?? inner[0];
      if (!target) return null;
      return {
        numStart: site.start + vec.index + 1 + target.index,
        numEnd: site.start + vec.index + 1 + target.index + target[0].length,
        value: parseFloat(target[0]),
        label: ["width (x)", "depth (y)", "height (z)"][axis],
      };
    }
    return mk(numMatches[0], "size");
  }
  if (site.kind === "cylinder" || site.kind === "cyl" || site.kind === "cone") {
    if (axis === 2) {
      const h = /\bh\s*:\s*(-?\d+\.?\d*)/.exec(s);
      if (h) return { numStart: site.start + h.index + h[0].length - h[1].length,
                      numEnd: site.start + h.index + h[0].length, value: parseFloat(h[1]), label: "height" };
      return null;
    }
    const r = /\br1?\s*:\s*(-?\d+\.?\d*)/.exec(s);
    if (r) return { numStart: site.start + r.index + r[0].length - r[1].length,
                    numEnd: site.start + r.index + r[0].length, value: parseFloat(r[1]), label: "radius" };
    return null;
  }
  if (site.kind === "sphere" || site.kind === "spheroid") {
    const r = /\br\s*:\s*(-?\d+\.?\d*)/.exec(s);
    if (r) return { numStart: site.start + r.index + r[0].length - r[1].length,
                    numEnd: site.start + r.index + r[0].length, value: parseFloat(r[1]), label: "radius" };
    return mk(numMatches[0], "radius");
  }
  if (site.kind === "torus") {
    // side handles grow the ring; top/bottom handles grow the tube
    const key = axis === 2 ? "tube" : "r";
    const m = new RegExp(`\\b${key}\\s*:\\s*(-?\\d+\\.?\\d*)`).exec(s);
    if (m) return { numStart: site.start + m.index + m[0].length - m[1].length,
                    numEnd: site.start + m.index + m[0].length, value: parseFloat(m[1]),
                    label: key === "r" ? "ring radius" : "tube" };
    return null;
  }
  return null;
}

// Every size-carrying number of a primitive call, for corner-handle uniform
// scaling. Deliberately named params only — a blind "all numbers" would scale
// $fn and positions too.
export function findScaleTargets(text, site) {
  const s = text.slice(site.start, site.end);
  const abs = (m, grp = 1) => {
    const numStr = m[grp];
    const off = m.index + m[0].lastIndexOf(numStr);
    return { numStart: site.start + off, numEnd: site.start + off + numStr.length, value: parseFloat(numStr) };
  };
  const out = [];
  const named = (keys) => {
    for (const k of keys) {
      const m = new RegExp(`\\b${k}\\s*:\\s*(-?\\d+\\.?\\d*)`).exec(s);
      if (m) out.push(abs(m));
    }
  };
  switch (site.kind) {
    case "cube": case "cuboid": {
      const vec = /\[([^\]]*)\]/.exec(s);
      if (vec) {
        for (const m of vec[1].matchAll(/-?\d+\.?\d*/g)) {
          out.push({
            numStart: site.start + vec.index + 1 + m.index,
            numEnd: site.start + vec.index + 1 + m.index + m[0].length,
            value: parseFloat(m[0]),
          });
        }
      }
      break;
    }
    case "cylinder": case "cyl": named(["r", "r1", "r2", "h"]); break;
    case "cone": named(["r1", "r2", "h"]); break;
    case "sphere": case "spheroid": named(["r"]); break;
    case "torus": named(["r", "tube"]); break;
  }
  return out;
}

// Rewrite several number spans in one pass (descending offset order so earlier
// spans stay valid).
export function rewriteNumbers(text, targets, transform) {
  let out = text;
  for (const t of [...targets].sort((a, b) => b.numStart - a.numStart)) {
    const v = Math.max(Math.round(transform(t.value) * 10) / 10, 0.2);
    out = out.slice(0, t.numStart) + String(v) + out.slice(t.numEnd);
  }
  return out;
}

// Best-effort argument conversion when swapping one primitive for another.
// Reads the numbers out of the old call and writes idiomatic arguments for the
// new shape; anything unparseable falls back to a literal keyword swap.
export function convertPrimitiveCall(text, site, target) {
  const argText = text.slice(site.start, site.end);
  const nums = [...argText.matchAll(/-?\d+\.?\d*/g)].map((m) => parseFloat(m[0]))
    .filter((n) => Number.isFinite(n));
  const kind = site.kind;

  // derive rough dimensions from the source shape
  let x = 10, y = 10, z = 10, r = 5;
  if ((kind === "cube" || kind === "cuboid") && nums.length) {
    [x, y, z] = [nums[0], nums[1] ?? nums[0], nums[2] ?? nums[1] ?? nums[0]];
    r = x / 2;
  } else if (kind === "sphere" || kind === "spheroid") {
    r = nums[0] ?? 5; x = y = z = 2 * r;
  } else if (kind === "cylinder" || kind === "cyl" || kind === "cone") {
    r = nums[0] ?? 5; z = nums[nums.length >= 2 ? 1 : 0] ?? 10; x = y = 2 * r;
  } else if (kind === "torus") {
    r = nums[0] ?? 10; x = y = 2 * (nums[0] ?? 10); z = 2 * (nums[1] ?? 2);
  }

  const R = round3(r), X = round3(x), Y = round3(y), Z = round3(z);
  switch (target) {
    case "cube": return `cube([${X}, ${Y}, ${Z}])`;
    case "sphere": return `sphere({ r: ${R}, $fn: 48 })`;
    case "cylinder": return `cylinder({ r: ${R}, h: ${Z}, $fn: 48 })`;
    case "cone": return `cone({ r1: ${R}, r2: 0, h: ${Z}, $fn: 48 })`;
    case "torus": return `torus({ r: ${R}, tube: ${round3(Math.max(r / 4, 0.5))}, $fn: 48 })`;
    default: return null;
  }
}

// ---------------------------------------------- pasted BrepScript module files
//
// The CLI's file format is an ES module (import from "brepscript", export
// default a params function). Pasting one into the editor should just work,
// so strip the module skeleton and call the exported function with defaults.

export function isBrepscriptModule(src) {
  return /\bimport\s*\{[^}]*\}\s*from\s*["']brepscript["']/.test(src)
    || /\bexport\s+default\b/.test(src);
}

export function prepareBrepscriptModule(src) {
  let code = src
    .replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']*["']\s*;?/g, "")
    .replace(/import\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s*["'][^"']*["']\s*;?/g, "");
  code = code.replace(/\bexport\s+default\b/, "const __default__ =");
  code = code.replace(/\bexport\s+(const|let|var|function)\b/g, "$1");
  return code + `
;return (typeof __default__ === "function") ? __default__({})
  : (typeof __default__ !== "undefined") ? __default__ : undefined;`;
}

// Pasted LLM replies usually arrive fenced (```openscad ... ```), sometimes with
// prose around the fence. Extract the code; leave unfenced text untouched.
export function stripFences(src) {
  const fenced = [...src.matchAll(/```[ \t]*[\w+-]*[ \t]*\r?\n([\s\S]*?)```/g)];
  if (fenced.length) return fenced.map((m) => m[1]).join("\n").trim();
  // a lone opening fence (reply got cut off, or user pasted the top half)
  const open = src.match(/```[ \t]*[\w+-]*[ \t]*\r?\n([\s\S]*)$/);
  if (open) return open[1].trim();
  return src;
}

const CLOSER = { "(": ")", "[": "]", "{": "}" };

// Forgiving mode: repair the small stuff people leave behind while typing.
// Only ever *appends* what's missing — never rewrites or deletes what was typed —
// and returns the patched source separately so the editor text is left alone.
// Statement-form code that ends in a bare shape expression is missing only a
// `return`. LLMs produce this constantly — `const w = 40; difference(...)` — and
// it used to fail with "Almost — add return". Find the last TOP-LEVEL statement
// (tracking brackets and strings so nested semicolons don't fool us) and, if it
// reads as an expression rather than a declaration or control flow, return it.
// Returns null when there's nothing sensible to do, so callers can fall through.
// Insert the `return` an author (human or model) forgot on the final shape.
//
// Two things used to defeat this, and between them they defeated it almost
// always — the user hit "add return before your final shape" over and over and
// had to press Fix each time:
//
//   1. A TRAILING SEMICOLON. The scan moved the statement boundary past every
//      `;` at depth 0, including the last one, so the tail came out empty and
//      it gave up. Practically all generated code ends in `;`.
//   2. The word "return" ANYWHERE — including inside a comment or a string.
//      `// return the narrowed frame` was enough to switch the whole thing off,
//      and so was text({ text: "return" }).
//
// So: mask comments and strings before looking for a real `return`, and keep
// every statement boundary so an empty tail can fall back to the previous one.
export function addImplicitReturn(src) {
  let depth = 0, quote = null;
  const bounds = [0];
  let masked = "";                    // src with comments/strings blanked out
  for (let i = 0; i < src.length; i++) {
    const c = src[i], prev = src[i - 1];
    if (quote) {
      if (c === quote && prev !== "\\") quote = null;
      masked += " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; masked += " "; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") { masked += " "; i++; }
      masked += "\n";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i);
      if (end < 0) return null;                    // unterminated block comment
      masked += " ".repeat(end + 2 - i);
      i = end + 1;
      continue;
    }
    masked += c;
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if ((c === ";" || c === "}") && depth === 0) bounds.push(i + 1);
  }
  // A real `return` in code (not in a comment or string) means it already returns.
  if (/\breturn\b/.test(masked)) return null;

  // Walk boundaries from the end for the last one with real content after it.
  // With a trailing `;` the final boundary is at end-of-string, so this steps
  // back to the statement before it — exactly the case that used to bail.
  for (let b = bounds.length - 1; b >= 0; b--) {
    const head = src.slice(0, bounds[b]);
    const tail = src.slice(bounds[b]);
    if (!tail.trim()) continue;

    // Step over whitespace and any comment lines so `return` lands before the
    // actual expression. A model that writes "// narrow the frame" above its
    // final line should not lose the fix over a remark.
    let k = 0;
    for (;;) {
      const rest = tail.slice(k);
      const ws = /^\s*/.exec(rest)[0].length;
      k += ws;
      const at = tail.slice(k);
      if (at.startsWith("//")) { const nl = at.indexOf("\n"); if (nl < 0) return null; k += nl + 1; continue; }
      if (at.startsWith("/*")) { const e = at.indexOf("*/"); if (e < 0) return null; k += e + 2; continue; }
      break;
    }
    const expr = tail.slice(k);
    if (!expr.trim()) continue;                    // only comments after this boundary

    // A model that finishes on `const part = union(...);` has assigned the
    // thing it meant to hand back and simply not handed it back. Returning the
    // name is unambiguous, so do that rather than making the user press Fix.
    const decl = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(expr);
    if (decl) {
      const rest = src.slice(bounds[b] + k + decl[0].length);
      // only when it really is the last thing — no further statements after it
      if (!/;[\s\S]*\S/.test(rest.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""))) {
        return `${src.replace(/\s*$/, "")}\nreturn ${decl[1]};`;
      }
      return null;
    }
    // control flow and the rest have nothing to return
    if (/^(?:function\b|class\b|if\b|for\b|while\b|switch\b|try\b|do\b|export\b|import\b)/.test(expr)) return null;
    return `${head}${tail.slice(0, k)}return ${expr}`;
  }
  return null;
}

export function autoFix(src) {
  const notes = [];
  let code = src;

  const before = code;
  code = code
    .replace(/[“”]/g, '"')          // smart double quotes
    .replace(/[‘’]/g, "'")          // smart single quotes
    .replace(/[‒–—−]/g, "-");  // en/em dash, unicode minus
  if (code !== before) notes.push("straightened smart quotes/dashes");

  // Copy-paste junk from web pages: non-breaking / zero-width spaces break
  // tokenizers with an invisible "unexpected character", so normalise them.
  const beforeWs = code;
  code = code.replace(/ /g, " ").replace(/[​-‍﻿⁠]/g, "");
  if (code !== beforeWs) notes.push("removed invisible/nbsp characters");

  // Code copied out of rendered HTML arrives entity-encoded (`x =&gt; y`,
  // `include &lt;lib&gt;`). Decode the handful that show up in CAD code — &amp;
  // last so we don't double-decode. Only touches real entities.
  if (/&(lt|gt|amp|quot|#0?39|apos);/.test(code)) {
    code = code
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
      .replace(/&amp;/g, "&");
    notes.push("decoded HTML entities (&lt; &gt; …)");
  }

  // Walk the source tracking strings and comments so brackets inside them don't count.
  const stack = [];
  let inString = null, inLine = false, inBlock = false, mismatched = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i], n = code[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inString) {
      if (c === "\\") { i++; continue; }
      if (c === inString) inString = null;
      else if (c === "\n" && inString !== "`") inString = null;   // unterminated line string
      continue;
    }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue; }
    if (c === "(" || c === "[" || c === "{") stack.push(c);
    else if (c === ")" || c === "]" || c === "}") {
      const want = { ")": "(", "]": "[", "}": "{" }[c];
      if (stack[stack.length - 1] === want) stack.pop();
      else mismatched = true;   // wrong or extra closer — see below
    }
  }

  // If the brackets are genuinely crossed (`cube([1,1,1)`), appending closers just
  // produces different broken code. Leave it and let diagnose() name the problem.
  if (mismatched) return { code: src, notes: [] };

  if (inString) {
    code += inString;
    notes.push("closed an unterminated string");
  }
  if (stack.length) {
    const closers = stack.reverse().map((o) => CLOSER[o]).join("");
    code += closers;
    notes.push(`closed ${stack.length} open bracket${stack.length > 1 ? "s" : ""} with ${closers}`);
  }

  return { code, notes };
}

// `return` alone at the end of a line throws the model away.
//
// JavaScript inserts a semicolon after a bare `return`, so
//
//     return
//     torus({ r: 14, tube: 4 })
//
// is `return;` followed by an expression nobody reads — it evaluates to
// undefined and the user is told their code "didn't make a shape", which is
// true and completely unhelpful. Nothing else in the language does this, and it
// is invisible: the code looks right.
//
// It also defeated the missing-return repair, because that refuses to act when
// it sees the word `return` — so this had to be handled before it, not by it.
// Returns the joined-up source, or null when there is no dangling return.
export function fixDanglingReturn(src) {
  let quote = null, masked = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { masked += "  "; i++; continue; }
      if (c === quote) quote = null;
      masked += c === "\n" ? "\n" : " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; masked += " "; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") { masked += " "; i++; }
      masked += "\n";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (; i < stop; i++) masked += src[i] === "\n" ? "\n" : " ";
      i--;
      continue;
    }
    masked += c;
  }

  // A `return` with nothing after it on its line, and a real expression on a
  // later one. Not `return;` (deliberate) and not `return }` (an empty exit).
  const m = /\breturn[ \t]*\r?\n[\s\r\n]*(?=[^\s;})\]])/.exec(masked);
  if (!m) return null;
  const at = m.index + m[0].length;
  return `${src.slice(0, m.index)}return ${src.slice(at)}`;
}

// How many top-level statements are bare shape expressions?
//
// Three shapes written one after another is the other half of the same
// misunderstanding — people reasonably expect a list of shapes to BE the model,
// and in BREPcode only the returned one counts. Knowing there are several lets
// the error say "combine them" instead of "that didn't make a shape".
export function looseShapeCount(src, vocabulary = NAMES) {
  const known = new Set(vocabulary);
  let depth = 0, quote = null, count = 0, stmt = "";
  const take = () => {
    const word = /^[\s;]*([A-Za-z_$][\w$]*)\s*\(/.exec(stmt)?.[1];
    if (word && known.has(word) && !/^\s*(return|const|let|var)\b/.test(stmt)) count++;
    stmt = "";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; stmt += c; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; stmt += c; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (depth === 0 && (c === ";" || c === "\n")) { stmt += c; take(); continue; }
    stmt += c;
  }
  take();
  return count;
}

// Which BREPcode words does this source declare as its own variable?
//
// The vocabulary reaches user code as function PARAMETERS, so `const fins = []`
// is not a shadowing warning — it is `Identifier 'fins' has already been
// declared`, a SyntaxError thrown before a single line runs. Nothing downstream
// can recover from it: addImplicitReturn never gets to look at the code, and the
// user sees a raw JS error for what is, from their side, a perfectly ordinary
// variable name. It cost a real generation ("a bracket with support fins" — the
// model called its array `fins`, which is also a support operator).
//
// Rather than forbid ~200 words, drop the ones the author claimed. Their own
// declaration wins, which is what they meant by writing it.
export function declaredNames(src, vocabulary = NAMES) {
  let quote = null;
  let masked = "";                     // src with comments/strings blanked out
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { masked += "  "; i++; continue; }
      if (c === quote) quote = null;
      masked += c === "\n" ? "\n" : " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; masked += " "; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") { masked += " "; i++; }
      masked += "\n";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (; i < stop; i++) masked += src[i] === "\n" ? "\n" : " ";
      i--;
      continue;
    }
    masked += c;
  }

  const found = new Set();
  const known = new Set(vocabulary);
  // `const a = 1, fins = [...]` declares both, so read the whole binding list up
  // to the statement end. Destructuring counts too: `const { text } = opts`.
  const DECL = /\b(const|let|var|function|class)\s+([^;\n]*)/g;
  for (const m of masked.matchAll(DECL)) {
    // `function makeFin(cube)` declares makeFin — `cube` is a PARAMETER, bound
    // only inside that function. Dropping it would leave the rest of the file
    // calling a word we no longer inject. Same for `class Foo extends Bar`.
    if (m[1] === "function" || m[1] === "class") {
      const first = m[2].match(/[A-Za-z_$][\w$]*/);
      if (first && known.has(first[0])) found.add(first[0]);
      continue;
    }

    // Split the binding list on commas at depth 0, so a comma inside the VALUE
    // (`cube([1, 2, 3])`) doesn't look like the start of another binding.
    const parts = [];
    let depth = 0, part = "";
    for (const c of m[2]) {
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      if (c === "," && depth === 0) { parts.push(part); part = ""; continue; }
      part += c;
    }
    parts.push(part);

    for (const binding of parts) {
      // Everything after the first `=` is the value, where a mention of `cube`
      // is a legitimate CALL rather than a declaration.
      const target = binding.split("=")[0];
      for (const word of target.matchAll(/[A-Za-z_$][\w$]*/g)) {
        if (known.has(word[0])) found.add(word[0]);
      }
    }
  }
  return [...found];
}

// Turn a raw JS error into something that says what to do next.
export function diagnose(src, err, result) {
  const msg = String(err?.message ?? err ?? "");

  // 1. Unbalanced brackets — by far the most common thing while mid-typing.
  //    Walk a stack so we can name the *innermost* unclosed bracket, which is the
  //    one the user needs to close first.
  const CLOSES = { ")": "(", "]": "[", "}": "{" };
  const LABEL = { "(": "round bracket (", "[": "square bracket [", "{": "curly brace {" };
  const SHUT = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  for (const ch of src) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (CLOSES[ch]) {
      if (!stack.length) return `There's an extra "${ch}" — delete it.`;
      const open = stack.pop();
      if (open !== CLOSES[ch]) {
        return `Mismatched brackets: "${open}" is closed by "${ch}". Use "${SHUT[open]}" instead.`;
      }
    }
  }
  if (stack.length) {
    const inner = stack[stack.length - 1];
    const more = stack.length > 1 ? ` (${stack.length} still open in total)` : "";
    return `Unfinished ${LABEL[inner]} — add "${SHUT[inner]}"${more}.`;
  }

  // 2. A word we don't have.
  const undef = msg.match(/([A-Za-z_$][\w$]*) is not defined/);
  if (undef) {
    const word = undef[1];
    if (NOT_HERE[word]) return `"${word}" isn't available here — ${NOT_HERE[word]}.`;
    const near = closestName(word);
    return near
      ? `"${word}" isn't a BREPcode word. Did you mean ${near}()?`
      : `"${word}" isn't a BREPcode word. Open the cheat sheet to see what you can use.`;
  }

  // 3. Called something that isn't callable.
  const notFn = msg.match(/([A-Za-z_$][\w$]*) is not a function/);
  if (notFn) return `"${notFn[1]}" isn't something you can call with (). Check the cheat sheet.`;

  // 4. Wrong argument type coming back out of the DSL.
  if (/Expected a shape/.test(msg)) {
    return `${msg} — shapes go inside shapes, e.g. translate([10, 0, 0], cube([10, 10, 10])).`;
  }

  // 5a. Several shapes written one after another. People reasonably expect a
  //     list of shapes to BE the model; in BREPcode only the returned one
  //     counts, so say how to join them rather than restating the symptom.
  if (!err && result === undefined && looseShapeCount(src) > 1) {
    return "That's several separate shapes — only one can be the model. "
      + "Wrap them in union(…) to fuse them into one solid, or group(…) to keep them "
      + "as separate parts, and return that. Give each a translate([x, y, z], …) "
      + "or they'll all sit on top of each other at the origin.";
  }

  // 5. It ran but didn't hand back a shape.
  if (!err) {
    if (typeof result === "function") {
      const spec = SPECS.find((s) => s.name === result.name);
      return spec
        ? `You typed "${spec.name}" on its own. Give it values: ${spec.snippet.split("\n")[0]}`
        : `That's a command name on its own — add () with values after it.`;
    }
    if (result === undefined && /\b(const|let|var|=>|;)\b/.test(src)) {
      return `Almost — add "return" before your final shape, e.g. return cube([20, 20, 10]);`;
    }
    return `That ran, but didn't make a shape. End with a shape like cube([20, 20, 10]).`;
  }

  // 6. Syntax errors, reworded.
  // Two calls jammed together with nothing between them, e.g.
  // `rotate([45,0,0], importedMesh("part.stl"))cube([20,20,10])`. That's OpenSCAD
  // habit (or a paste that landed mid-expression) and it's the single most common
  // way BREPcode source fails to parse, so name the spot instead of saying "typo".
  const jux = findJuxtaposedCall(src);
  if (jux) {
    return `Line ${jux.line}: "${jux.before})" and "${jux.after}(" are jammed together with nothing between them. `
      + `Pick one — delete the extra shape, or combine them with union(a, b).`;
  }
  if (/Unexpected end of input/.test(msg)) return "Unfinished line — something still needs closing.";
  if (/Unexpected token/.test(msg)) return `Typo somewhere: ${msg.replace("Unexpected token", "unexpected")}.`;
  if (/Invalid or unexpected token/.test(msg)) return "There's a stray character in there.";

  return msg;
}

// Locate `…)name(` — a call immediately followed by another with no operator,
// comma or semicolon between. Only ever consulted after the code has already
// failed to parse, so the control-flow forms it skips (`if (x) foo()`) would
// have been valid anyway.
const CONTROL = /\b(if|for|while|switch|catch)\s*$/;
function findJuxtaposedCall(src) {
  if (typeof src !== "string") return null;
  const re = /\)[ \t]*([A-Za-z_$][\w$]*)[ \t]*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const head = src.slice(0, m.index);
    // Walk back over the closing call's arguments to name what precedes it.
    let depth = 0, i = head.length - 1;
    for (; i >= 0; i--) {
      const c = head[i];
      if (c === ")") depth++;
      else if (c === "(") { if (depth === 0) break; depth--; }
    }
    const before = head.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/);
    if (!before || CONTROL.test(head.slice(0, i))) continue;
    return {
      line: src.slice(0, m.index).split("\n").length,
      before: before[1],
      after: m[1],
    };
  }
  return null;
}
