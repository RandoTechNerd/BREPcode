// Exact first.
//
// BREPcode builds on two lanes (src/engine.js): the Rust B-rep kernel for
// exact solids, and manifold for meshes, with the old JS kernel as the
// fallback when Rust refuses. A model stays exact, fast and STEP-clean only
// while every step in it is exact, and most of the ways an AI drops it off
// that lane are habits with an exact equivalent: hull() for a rounded box,
// roundedGrow() to soften one, a hole drilled down a revolve's axis, a stack
// of overlapping cutters in one difference().
//
// This module is the one place those rules live. EXACT_CORE rides in the
// always-on chat harness (it has a size budget, see test/toolholder.js); the
// full EXACT_RULES go with every exact-pass request, and the #exact recipe
// (viewer/recipes/exact.md) carries them for requests that touch the usual
// traps. LLM_PROMPT.md says the same for outside models. The chat loop asks
// exactAdvice() after every AI build: when the model left the exact lane for
// a reason it could have avoided, the AI gets one targeted rewrite request
// (the working model is kept if the rewrite does not do better). The request
// speaks the model's own language: OpenSCAD and JSCAD are translated onto the
// same exact shapes (src/exactshapes.js), so they get their own rules rather
// than being told to use BREPcode words they do not have.
//
// Every number here was measured on the split engine (2026-10-19):
//   rounded box, hull() of 4 corner cylinders      mesh   245 ms
//   ...hull({ exact: true }) of the same           exact  0.24 s (a filleted prism, src/exactshapes.js)
//   stadium / capsule / 8 corner spheres, exact    exact  0.08 / 0.46 / 0.19 s
//   hull({ exact: true }) of flat-sided pieces     exact  0.1-0.35 s (src/hullstep.js)
//   ...of two unequal spheres, 328 faces           4.7 s exact vs 0.09 s as a mesh, so it stays a mesh
//   gridfinityBin with every hull a polyhedron     70 s, then refused (0.5 s as meshes)
//   rounded box, fillet({ r, edges: "z" }, cube)   exact  310 ms, 272 tris
//   rounded box, roundedGrow()                     mesh   751 ms, 13k tris
//   rounded-off cylinder, fillet of the whole thing   JS fallback (it picks the seam edge)
//   ...the top rim, then the bottom rim            exact  0.5 s
//   cup, revolve() + hole on the axis              JS fallback (Rust: self-intersects)
//   cup, cones + the same hole                     exact   43 ms
//   hex pot, 6 tilted cutters in one difference()  2.5 s at 12 sides, refused at 4 and 8
//   ...the same cutters one difference() at a time exact  66-323 ms
//   fillet() after hull()                          JS fallback (a mesh has no edges)

// Always on: the one paragraph every request pays for.
export const EXACT_CORE = `EXACT B-REP FIRST. Mesh verbs (plain hull, roundedGrow/minkowski(mm), tube, texture, blob/blend, importedMesh) turn the model to triangles (no fillet after); a refused step falls back to a slow kernel. Mesh only when needed, and last. hull({ exact: true }, ...) stays exact over equal corner cylinders, coaxial discs, 2 or 8 equal spheres, or flat pieces. Rounded box: fillet({ r, edges: "z" }, cube(...)). Taper: cylinder({ r1, r2 }). No hole down a revolve() axis. Overlapping cutters: one difference() each. Fillet pieces before union, r < half the thinnest wall. #exact has the rest.`;

export const EXACT_RULES = `EXACT B-REP FIRST — the app builds on an exact B-rep kernel: true planes, cylinders and cones, fast booleans, and STEP export with real curved surfaces. A model stays on it only while EVERY step is exact; one mesh step turns the rest of that branch into triangles (no fillet after it, faceted STEP), and a step the kernel refuses drops the whole model to the slow fallback kernel. So build from exact pieces and reach for a mesh verb only when the design truly needs it:
· EXACT: cube, cylinder, cone / cylinder({r1, r2}), sphere, torus, polygon + linearExtrude, revolve, path2d, text() (true letter outlines), union / difference / intersection, fillet, chamfer, drill, the hardware parts, and the shelf parts except gridfinityBin and gridfinityBase (meshes).
· EXACT HULLS: write hull({ exact: true }, ...). It stays exact when its pieces are equal upright cylinders spanning the same heights (a rounded box, plate or slot: built as a prism with filleted corners), cylinders and cones on one shared axis (a taper or a lathe), two equal spheres (a capsule, a handle bar), eight equal spheres on a box's corners (a box rounded all round), or a FEW flat-sided pieces (boxes, extruded polygons, cylinders with $fn 3-8: up to 64 hull faces). Any other mix, or plain hull(), is a mesh.
· EXACT MINKOWSKI: minkowski(box, sphere({ r })), minkowski(upright cylinder, sphere({ r })) and minkowski(box, upright cylinder) build as exact fillets. minkowski(mm, part) is roundedGrow, a mesh.
· MESH (fine when the design needs it, but apply it LAST and never fillet() or chamfer() after it): plain hull, roundedGrow / minkowski(mm, ...) / roundedShrink, tube, texture / heightmap, blob / smoothUnion / blend, text with a font: of your own or pixel: true, stencil, the scannable codes, importedMesh, gridfinityBin / gridfinityBase.
· A ROUNDED BOX is fillet({ r, edges: "z" }, cube([x, y, z])): rounded vertical corners, flat top and bottom, exact (then fillet({ r, edges: "top" }, ...) for a soft top edge). hull({ exact: true }, four equal corner cylinders) builds the same solid. NOT roundedGrow() (a mesh).
· A ROUNDED-OFF CYLINDER is fillet({ r, edges: "bottom" }, fillet({ r, edges: "top" }, cylinder({ r: R, h }))): one rim at a time. One fillet of the whole cylinder is refused (it picks up the seam edge).
· A TAPER is a cone: cylinder({ r1, r2, h, $fn: 96 }) for round pots, cups and bosses. A tapered POLYGON (hex pot, square planter) is linearExtrude of the polygon with each side planed off by a tilted cube, one difference() at a time. hull({ exact: true }, two flat polygon slabs) also gives an exact frustum.
· NO HOLE DOWN A revolve() AXIS: the kernel refuses the cut (the lathe's seam self-intersects) and the model falls back. A round body with a centre hole is built from cylinders and cones instead; off-axis holes in a revolve are fine.
· OVERLAPPING CUTTERS GO ONE AT A TIME: difference(a, t1, t2, t3) unions t1..t3 first, and tilted or crossing tools that overlap each other are where that slows down or is refused. Nest them, difference(difference(a, t1), t2), or loop. Disjoint tools (a row of holes) are fine in one call.
· NO GRAZING CONTACT: two solids that only touch along an edge or a line (a flare that starts exactly at another solid's top edge) are refused. Run one 0.5-1 mm into the other, on the same surface line, so the faces truly cross.
· FILLET PIECES, NOT JOINS: one fillet over a part where a rib, gusset or post meets a plate is refused (inside and outside corners meet), and so is a radius bigger than a face it touches. Fillet each box on its own, r under half its thinnest side, then union them; inside corners stay sharp, which is stronger anyway.
· mirror() IS EXACT for boxes, round cylinders and cones, spheres, tori, polygon extrusions, rounded boxes and full revolves: use it freely for symmetric parts. For a $fn 3-8 cylinder or a curved path2d profile, mirror the points yourself.
· $fn: a cylinder with $fn 3-8 is a real polygon prism (cylinder({r, h, $fn: 6}) is a hex nut); above 8 it is a true circle whatever the number. A cone with $fn 3-8 is refused: make a tapered polygon as above.`;

// The same rules for a model written in OpenSCAD: the translator lands these
// forms on the exact shapes above (src/openscad.js, src/exactshapes.js).
export const EXACT_SCAD = `EXACT B-REP FIRST (OpenSCAD) — the app translates OpenSCAD onto an exact B-rep kernel: true planes, cylinders and cones, fast booleans, STEP with real curves. Keep the model in OpenSCAD, and keep every step one of the forms that translate EXACTLY:
· cube, cylinder (h, r or r1/r2 for a taper), sphere, the booleans, translate / rotate / mirror, linear_extrude of polygons, squares and circles, and rotate_extrude of a profile that touches the axis (also a circle away from it, a torus, or a full-turn rectangle or trapezoid away from it, a ring).
· hull() whose children are equal upright cylinders spanning the same heights (a rounded box, plate or slot), cylinders on one shared axis (a taper), two equal spheres (a capsule) or eight equal spheres on a box's corners, or a few flat cubes and extrusions. Any other hull() is a triangle mesh.
· minkowski() of a cube with a sphere, of an upright cylinder with a sphere, or of a cube with an upright cylinder. Any other minkowski() is a mesh.
· offset(r = ...) of a convex outline before linear_extrude is an exact rounded prism.
· Never difference() a hole down a rotate_extrude axis: the kernel refuses it. Build that round body from cylinders.
· Overlapping cutters one difference() at a time; solids that only touch along an edge run 0.5-1 mm into each other.`;

// ...and for a JSCAD (@jscad/modeling) module.
export const EXACT_JSCAD = `EXACT B-REP FIRST (JSCAD) — the app translates JSCAD onto an exact B-rep kernel: true planes, cylinders and cones, fast booleans, STEP with real curves. Keep the module in JSCAD, and keep every step one of the forms that translate EXACTLY:
· cuboid, cylinder, cylinderElliptic with equal radii, sphere, torus, roundedCuboid, roundedCylinder, extrudeLinear of polygons, rectangles, circles and roundedRectangle, extrudeRotate of a profile touching the axis, the booleans and transforms.
· hull() / hullChain() whose pieces are equal upright cylinders spanning the same heights, cylinders on one shared axis, two equal spheres or eight equal spheres on a box's corners, or a few flat cuboids and extrusions. Any other hull is a triangle mesh.
· offset({ delta, corners: "round" }) of a convex outline before extrudeLinear is an exact rounded prism.
· Overlapping cutters one subtract() at a time; solids that only touch along an edge run 0.5-1 mm into each other.`;

// Each mesh verb, and whether an exact build usually replaces it, per language.
const AVOIDABLE = {
  hull: "hull() (a triangle mesh): write hull({ exact: true }, ...), which stays exact over equal upright corner cylinders, cylinders and cones on one axis, two or eight equal spheres, or a few flat-sided pieces; a rounded box is also fillet({ r, edges: \"z\" }, cube([x, y, z])); a taper is cylinder({ r1, r2 }); a tapered polygon is a linearExtrude planed by tilted cubes one difference() at a time",
  roundedGrow: "roundedGrow() (a triangle mesh): round the edges with fillet() or chamfer() instead, and size the part to its finished dimensions",
  minkowski: "minkowski() (a triangle mesh unless it is a box or an upright cylinder with a sphere, or a box with an upright cylinder): round the edges with fillet() or chamfer() instead",
  roundedShrink: "roundedShrink() (a triangle mesh): build the smaller part directly, then fillet() it",
};
const AVOIDABLE_SCAD = {
  hull: "hull() over pieces the translator cannot make exact: keep its children to equal upright cylinders spanning the same heights at the corners (a rounded box or slot), cylinders on one axis (a taper), two equal spheres, eight equal spheres on a box's corners, or a few flat cubes and extrusions; a taper on its own is cylinder(h, r1, r2)",
  minkowski: "minkowski() of pieces with no exact form: a cube or an upright cylinder with a sphere, or a cube with an upright cylinder, translate exactly; or round a convex outline with offset(r = ...) before linear_extrude",
};
const AVOIDABLE_JSCAD = {
  hull: "hull() over pieces the translator cannot make exact: keep them to equal upright cylinders spanning the same heights (a rounded box or slot), cylinders on one axis, two equal spheres, eight equal spheres on a box's corners, or a few flat cuboids; a rounded box is roundedCuboid() or extrudeLinear of roundedRectangle()",
  hullChain: "hullChain() over pieces the translator cannot make exact: the same rules as hull() for every consecutive pair",
};
const INHERENT = ["tube", "texture", "heightmap", "blob", "smoothUnion", "blend", "text", "stencil",
  "qrcode", "datamatrix", "barcode", "importedMesh", "creature", "freeform", "gridfinityBin", "gridfinityBase"];

// Which language the code is in, from its shape alone (the translators' own
// detectors live in modules this one must not pull into the chat bundle).
export function codeLanguage(src = "") {
  const s = String(src);
  if (/^\s*(from|import)\s+(build123d|cadquery)\b/m.test(s)) return "python";
  if (/@jscad\/modeling|\bmodule\.exports\b/.test(s)) return "jscad";
  if (!/\breturn\b/.test(s) && (/^\s*\$fn\s*=/m.test(s) || /\bmodule\s+\w+\s*\(/.test(s)
    || /\b(cube|cylinder|sphere|translate|rotate|difference|union|intersection|hull|minkowski|linear_extrude|rotate_extrude|offset)\s*\([^()]*\)\s*[{;]/.test(s))) return "openscad";
  return "brepcode";
}
const RULES_FOR = { brepcode: EXACT_RULES, openscad: EXACT_SCAD, jscad: EXACT_JSCAD, python: EXACT_RULES };
const KEEP_LANGUAGE = { openscad: "Keep it in OpenSCAD. ", jscad: "Keep it a JSCAD module. ", python: "Keep it in build123d. ", brepcode: "" };

// Strings and comments blanked, so a word inside a label or a remark is not a call.
function codeOnly(src) {
  let out = "", quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
      out += " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += " "; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i);
      if (end < 0) break;
      out += " ".repeat(end + 2 - i);
      i = end + 1;
      continue;
    }
    out += c;
  }
  return out;
}
const calls = (src, words) => words.filter((w) => new RegExp(`\\b${w}\\s*\\(`).test(src));

// What the fallback's message says, translated into the rule that avoids it.
function refusalHints(msg, src, lang) {
  const hints = [];
  if (/self.?intersect/i.test(msg) && /\b(revolve|rotate_extrude|extrudeRotate)\s*\(/.test(src)) {
    hints.push(lang === "openscad"
      ? "a hole or cutter running down a rotate_extrude() axis: build that round body from cylinders (cylinder(h, r1, r2)) instead"
      : "a hole or cutter running down a revolve() axis: build that round body from cylinders and cones (cylinder({ r1, r2 })) instead of revolve()");
  }
  if (/\b(fillet|chamfer)\b/i.test(msg) && (/mesh|STL|none of the .* references/i.test(msg))) {
    hints.push("fillet() or chamfer() after a hull() or a mesh step: round the pieces before the hull, or replace the mesh step (roundedGrow, tube, texture) with an exact one; a fillet cannot yet find the edges of a hull, even an exact one");
  }
  if (/fillet/i.test(msg) && /blended|seam/i.test(msg)) {
    hints.push("a fillet over a whole cylinder or a revolve picks up its seam edge: fillet the rims one at a time, fillet({ r, edges: \"top\" }, ...) then fillet({ r, edges: \"bottom\" }, ...)");
  }
  if (/sided cone|\$fn=\d/i.test(msg)) {
    hints.push("a cone with $fn 3-8: a tapered polygon is linearExtrude of the polygon planed by tilted cubes, one difference() at a time");
  }
  if (/genus|tool union|union.*failed|boolean assembly/i.test(msg)) {
    hints.push("overlapping cutters in one difference(), or solids that only touch along an edge: subtract overlapping tools one at a time, and run touching solids 0.5-1 mm into each other");
  }
  if (/reflection|orientation rever/i.test(msg)) {
    hints.push(lang === "openscad"
      ? "a mirror() of a piece that is not its own mirror image (a polygon-sided cylinder or an import): mirror the polygon's points yourself, or rotate() the copy"
      : "a mirror() of a piece that is not its own mirror image (a $fn 3-8 cylinder, a curved path2d profile, an import): mirror that profile's points yourself (negate one coordinate and reverse the list), or rotate() the copy; mirror() of boxes, round cylinders, cones, spheres and polygon extrusions is already exact");
  }
  if (/fillet|chamfer/i.test(msg) && /too large|setback/i.test(msg)) {
    hints.push("a fillet or chamfer bigger than a face it touches: keep r under half the thinnest wall or plate it rounds, or round each piece before the union so it only meets that piece's own faces");
  }
  if (/fillet|chamfer/i.test(msg) && /convexity|concave/i.test(msg)) {
    hints.push("one fillet over edges where an inside corner meets an outside one (a plate with a rib or gusset joined to it): fillet each piece on its own, fillet({ r }, cube([...])), then union them, or pick edges: \"z\" / \"top\" on a single piece");
  }
  if (/tangent/i.test(msg)) {
    hints.push("two solids that touch tangentially (a cylinder resting on a face, a fillet meeting another piece's edge): run one 0.5-1 mm into the other so the surfaces truly cross");
  }
  if (!hints.length) hints.push("the step the kernel names above: rebuild it from exact pieces, overlap solids 0.5-1 mm instead of letting them touch, and subtract overlapping cutters one at a time");
  return hints;
}

// engine: what the build reported ({ engine: "exact" | "mesh" | "js",
// fallback, fallbackKind }). Returns null when there is nothing worth asking
// for: it is exact already, the slow kernel was not the code's fault (Rust
// still downloading), or the mesh comes from a verb the design needs.
// Otherwise { lane, why, note, ask, lang }: `note` is one line for the user
// and `ask` the request to the AI, in the code's own language.
//
// request: what the user asked for. A mesh verb they NAMED ("use hull()",
// "roundedGrow it") is their call, not a habit to correct.
export function exactAdvice(engine, code = "", request = "") {
  if (!engine || engine.engine === "exact") return null;
  const lang = codeLanguage(code);
  const src = codeOnly(String(code || ""));
  const asked = String(request || "").toLowerCase();
  const rules = RULES_FOR[lang];
  const keep = `${KEEP_LANGUAGE[lang]}Keep every size, hole, colour and the const dials exactly as they are; change only how the shape is built. Return the complete model.\n\n`;
  if (engine.engine === "js") {
    if (engine.fallbackKind !== "refused" || !engine.fallback) return null;
    const msg = String(engine.fallback);
    const hints = refusalHints(msg, src, lang);
    return {
      lane: "js", lang,
      why: msg,
      note: "It built, but the exact kernel refused one step, so it fell back to the slow kernel.",
      ask: `That built, but the exact B-rep kernel refused it and the model fell back to the slow JS kernel. The kernel said: ${msg.slice(0, 300)}\n`
        + `Most likely cause: ${hints.join("; ")}.\n`
        + "Rewrite the construction so every step is exact. " + keep + rules,
    };
  }
  if (engine.engine === "mesh") {
    const table = lang === "openscad" ? AVOIDABLE_SCAD : lang === "jscad" ? AVOIDABLE_JSCAD : AVOIDABLE;
    const avoidable = calls(src, Object.keys(table)).filter((w) => !asked.includes(w.toLowerCase()));
    if (!avoidable.length) return null;              // tube, texture, text...: a mesh on purpose
    const inherent = calls(src, INHERENT);
    return {
      lane: "mesh", lang,
      why: avoidable.map((w) => `${w}()`).join(", "),
      note: `It built, but ${avoidable.map((w) => `${w}()`).join(" and ")} made it a triangle mesh instead of an exact solid.`,
      ask: `That built, but as a triangle MESH, not an exact B-rep solid, because of ${avoidable.map((w) => table[w]).join("; ")}.\n`
        + (inherent.length ? `Keep ${inherent.map((w) => `${w}()`).join(", ")} if the design needs it, but apply it last.\n` : "")
        + "Rewrite the construction with exact pieces. " + keep + rules,
    };
  }
  return null;
}
