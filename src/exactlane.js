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
// exactAdvice() after
// every AI build: when the model left the exact lane for a reason it could
// have avoided, the AI gets one targeted rewrite request (the working model
// is kept if the rewrite does not do better).
//
// Every number here was measured on the split engine (2026-10-19):
//   rounded box, hull() of 4 corner cylinders      mesh   245 ms
//   hull({ exact: true }) of flat-sided pieces     exact  0.1-0.35 s (src/hullstep.js)
//   ...of two spheres, 328 faces                   4.7 s exact vs 0.09 s as a mesh
//   gridfinityBin with every hull exact            70 s, then refused (0.5 s as meshes)
//   rounded box, two cubes + 4 corner cylinders    exact  361 ms
//   rounded box, fillet({ r, edges: "z" }, cube)   exact  310 ms, 272 tris
//   rounded box, roundedGrow()                     mesh   751 ms, 13k tris
//   cup, revolve() + hole on the axis              JS fallback (Rust: self-intersects)
//   cup, cones + the same hole                     exact   43 ms
//   hex pot, 6 tilted cutters in one difference()  2.5 s at 12 sides, refused at 4 and 8
//   ...the same cutters one difference() at a time exact  66-323 ms
//   fillet() after hull()                          JS fallback (a mesh has no edges)

// Always on: the one paragraph every request pays for.
export const EXACT_CORE = `EXACT B-REP FIRST — the fast kernel is exact B-rep. Mesh verbs (hull, roundedGrow/minkowski, tube, texture, blob/blend, text, importedMesh) turn the model to triangles (no fillet after); a refused step falls back to a slow kernel. Mesh only when needed, and last. Rounded box: fillet({ r, edges: "z" }, cube(...)). Taper: cylinder({ r1, r2 }). No hole down a revolve() axis. Overlapping cutters: one difference() at a time. #exact has the rest.`;

export const EXACT_RULES = `EXACT B-REP FIRST — the app builds on an exact B-rep kernel: true planes, cylinders and cones, fast booleans, and STEP export with real curved surfaces. A model stays on it only while EVERY step is exact; one mesh step turns the rest of that branch into triangles (no fillet after it, faceted STEP), and a step the kernel refuses drops the whole model to the slow fallback kernel. So build from exact pieces and reach for a mesh verb only when the design truly needs it:
· EXACT: cube, cylinder, cone / cylinder({r1, r2}), sphere, torus, polygon + linearExtrude, revolve, path2d, union / difference / intersection, fillet, chamfer, drill, the hardware and shelf parts, and hull({ exact: true }, ...) of a FEW flat-sided pieces (boxes, extruded polygons, cylinders with $fn 3-8: up to 64 hull faces; many stacked exact hulls are very slow).
· MESH (fine when the design needs it, but apply it LAST and never fillet() or chamfer() after it): hull (unless { exact: true }), roundedGrow / minkowski / roundedShrink, tube, texture / heightmap, blob / smoothUnion / blend, text and the scannable codes, importedMesh.
· A ROUNDED BOX is fillet({ r, edges: "z" }, cube([x, y, z])): rounded vertical corners, flat top and bottom, exact (then fillet({ r, edges: "top" }, ...) for a soft top edge). NOT roundedGrow() (a mesh).
· A TAPER is a cone: cylinder({ r1, r2, h, $fn: 96 }) for round pots, cups and bosses. A tapered POLYGON (hex pot, square planter) is linearExtrude of the polygon with each side planed off by a tilted cube, one difference() at a time. hull({ exact: true }, two flat polygon slabs) also gives an exact frustum.
· NO HOLE DOWN A revolve() AXIS: the kernel refuses the cut (the lathe's seam self-intersects) and the model falls back. A round body with a centre hole is built from cylinders and cones instead; off-axis holes in a revolve are fine.
· OVERLAPPING CUTTERS GO ONE AT A TIME: difference(a, t1, t2, t3) unions t1..t3 first, and tilted or crossing tools that overlap each other are where that slows down or is refused. Nest them, difference(difference(a, t1), t2), or loop. Disjoint tools (a row of holes) are fine in one call.
· NO GRAZING CONTACT: two solids that only touch along an edge or a line (a flare that starts exactly at another solid's top edge) are refused. Run one 0.5-1 mm into the other, on the same surface line, so the faces truly cross.
· $fn: a cylinder with $fn 3-8 is a real polygon prism (cylinder({r, h, $fn: 6}) is a hex nut); above 8 it is a true circle whatever the number. A cone with $fn 3-8 is refused: make a tapered polygon as above.`;

// Each mesh verb, and whether an exact build usually replaces it.
const AVOIDABLE = {
  hull: "hull() (a triangle mesh): hull({ exact: true }, ...) of a few flat-sided pieces (boxes, polygons, $fn 3-8 cylinders) is exact; a rounded box is fillet({ r, edges: \"z\" }, cube([x, y, z])); a taper is cylinder({ r1, r2 }); a tapered polygon is a linearExtrude planed by tilted cubes one difference() at a time",
  roundedGrow: "roundedGrow() (a triangle mesh): round the edges with fillet() or chamfer() instead, and size the part to its finished dimensions",
  minkowski: "minkowski() (a triangle mesh): round the edges with fillet() or chamfer() instead",
  roundedShrink: "roundedShrink() (a triangle mesh): build the smaller part directly, then fillet() it",
};
const INHERENT = ["tube", "texture", "heightmap", "blob", "smoothUnion", "blend", "text", "stencil",
  "qrcode", "datamatrix", "barcode", "importedMesh", "creature", "freeform"];

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
function refusalHints(msg, src) {
  const hints = [];
  if (/self.?intersect/i.test(msg) && /\brevolve\s*\(/.test(src)) {
    hints.push("a hole or cutter running down a revolve() axis: build that round body from cylinders and cones (cylinder({ r1, r2 })) instead of revolve()");
  }
  if (/\b(fillet|chamfer)\b/i.test(msg) && (/mesh|STL|none of the .* references/i.test(msg))) {
    hints.push("fillet() or chamfer() after a hull() or a mesh step: round the pieces before the hull, or replace the mesh step (roundedGrow, tube, texture) with an exact one; a fillet cannot yet find the edges of a hull, even an exact one");
  }
  if (/sided cone|\$fn=\d/i.test(msg)) {
    hints.push("a cone with $fn 3-8: a tapered polygon is linearExtrude of the polygon planed by tilted cubes, one difference() at a time");
  }
  if (/genus|tool union|union.*failed|boolean assembly/i.test(msg)) {
    hints.push("overlapping cutters in one difference(), or solids that only touch along an edge: subtract overlapping tools one at a time, and run touching solids 0.5-1 mm into each other");
  }
  if (!hints.length) hints.push("the step the kernel names above: rebuild it from exact pieces, overlap solids 0.5-1 mm instead of letting them touch, and subtract overlapping cutters one at a time");
  return hints;
}

// engine: what the build reported ({ engine: "exact" | "mesh" | "js",
// fallback, fallbackKind }). Returns null when there is nothing worth asking
// for: it is exact already, the slow kernel was not the code's fault (Rust
// still downloading), or the mesh comes from a verb the design needs.
// Otherwise { lane, why, note, ask }: `note` is one line for the user and
// `ask` the request to the AI.
//
// request: what the user asked for. A mesh verb they NAMED ("use hull()",
// "roundedGrow it") is their call, not a habit to correct.
export function exactAdvice(engine, code = "", request = "") {
  if (!engine || engine.engine === "exact") return null;
  const src = codeOnly(String(code || ""));
  const asked = String(request || "").toLowerCase();
  if (engine.engine === "js") {
    if (engine.fallbackKind !== "refused" || !engine.fallback) return null;
    const msg = String(engine.fallback);
    const hints = refusalHints(msg, src);
    return {
      lane: "js",
      why: msg,
      note: "It built, but the exact kernel refused one step, so it fell back to the slow kernel.",
      ask: `That built, but the exact B-rep kernel refused it and the model fell back to the slow JS kernel. The kernel said: ${msg.slice(0, 300)}\n`
        + `Most likely cause: ${hints.join("; ")}.\n`
        + "Rewrite the construction so every step is exact. Keep every size, hole, colour and the const dials exactly as they are; change only how the shape is built. Return the complete model.\n\n" + EXACT_RULES,
    };
  }
  if (engine.engine === "mesh") {
    const avoidable = calls(src, Object.keys(AVOIDABLE)).filter((w) => !asked.includes(w.toLowerCase()));
    if (!avoidable.length) return null;              // tube, texture, text...: a mesh on purpose
    const inherent = calls(src, INHERENT);
    return {
      lane: "mesh",
      why: avoidable.map((w) => `${w}()`).join(", "),
      note: `It built, but ${avoidable.map((w) => `${w}()`).join(" and ")} made it a triangle mesh instead of an exact solid.`,
      ask: `That built, but as a triangle MESH, not an exact B-rep solid, because of ${avoidable.map((w) => AVOIDABLE[w]).join("; ")}.\n`
        + (inherent.length ? `Keep ${inherent.map((w) => `${w}()`).join(", ")} if the design needs it, but apply it last.\n` : "")
        + "Rewrite the construction with exact pieces. Keep every size, hole, colour and the const dials exactly as they are; change only how the shape is built. Return the complete model.\n\n" + EXACT_RULES,
    };
  }
  return null;
}
