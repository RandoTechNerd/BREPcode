// Free-form corners: the balls must sit on the part.
//
// They did not. A freeform()'s points are written in the call's own LOCAL
// coordinates, but everything that consumes them works in world space — the
// handles are positioned in the scene, the drag delta comes from a raycast
// against the scene, and the commit path replaces the transform wrapper and
// writes world numbers back. So a freeform inside translate([40,0,0], …) put
// its corner balls exactly 40mm from the part: "they translate away from the
// object", which is exactly how it was reported.
//
// The fix gives existingFreeformPoints a matrix for the enclosing wrappers.
// The matrix is the risky part: an Euler convention that disagreed with the
// kernel would be worse than not supporting rotate at all. So the arithmetic is
// checked against geometry the kernel really builds, not against itself.

import { cube, translate, rotate, scale, mirror, build, toSTL } from "../index.js";
import { Matrix4, Euler, Vector3 } from "three";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// The viewer's matrix construction, transcribed from wrapperTransform. Kept in
// step by the source checks at the bottom, which fail if the viewer stops using
// these exact THREE calls.
const D = Math.PI / 180;
function stepMatrix(verb, [a = 0, b = 0, c = 0]) {
  const m = new Matrix4();
  if (verb === "translate") m.makeTranslation(a, b, c);
  else if (verb === "scale") m.makeScale(a, b, c);
  else if (verb === "rotate") m.makeRotationFromEuler(new Euler(a * D, b * D, c * D, "XYZ"));
  else if (verb === "mirror") {
    const n = new Vector3(a, b, c).normalize();
    m.set(1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
      -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
      -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0, 0, 0, 0, 1);
  }
  return m;
}

async function bboxOf(shape) {
  const stl = toSTL(await build(shape), "t");
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
    for (let i = 0; i < 3; i++) {
      const v = +m[i + 1];
      lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v);
    }
  }
  return { lo, hi };
}

const SZ = [20, 10, 6];
const CORNERS = [];
for (const x of [0, SZ[0]]) for (const y of [0, SZ[1]]) for (const z of [0, SZ[2]]) CORNERS.push([x, y, z]);

// Transform the corners ourselves, and compare to where the kernel actually
// put the solid. If these agree, a handle placed by the same maths lands on the
// real corner.
async function agrees(label, verb, vec, wrap) {
  const { lo, hi } = await bboxOf(wrap(cube(SZ)));
  const M = stepMatrix(verb, vec);
  const v = new Vector3();
  const plo = [Infinity, Infinity, Infinity], phi = [-Infinity, -Infinity, -Infinity];
  for (const p of CORNERS) {
    v.set(p[0], p[1], p[2]).applyMatrix4(M);
    for (const [i, n] of [v.x, v.y, v.z].entries()) {
      plo[i] = Math.min(plo[i], n); phi[i] = Math.max(phi[i], n);
    }
  }
  const err = Math.max(
    ...lo.map((n, i) => Math.abs(n - plo[i])),
    ...hi.map((n, i) => Math.abs(n - phi[i])),
  );
  check(`${label} — corners land where the kernel put them`, err < 0.02, `${err.toFixed(4)} mm out`);
}

console.log("\nthe wrapper maths matches the kernel, not just itself\n");

await agrees("translate", "translate", [40, 5, -3], (s) => translate([40, 5, -3], s));
await agrees("rotate about Z", "rotate", [0, 0, 90], (s) => rotate([0, 0, 90], s));
await agrees("rotate about X", "rotate", [90, 0, 0], (s) => rotate([90, 0, 0], s));
// The one that would expose a wrong Euler order — three axes at once, none of
// them a right angle, so any convention mismatch shows up as millimetres.
await agrees("rotate on all three axes", "rotate", [30, 45, 60], (s) => rotate([30, 45, 60], s));
await agrees("scale", "scale", [2, 3, 0.5], (s) => scale([2, 3, 0.5], s));
await agrees("mirror", "mirror", [1, 0, 0], (s) => mirror([1, 0, 0], s));

console.log("\nnesting composes in the right order\n");
{
  // translate(A, rotate(B, shape)) is A·B, not B·A. Walking outward from the
  // shape finds B first, so each new wrapper must PRE-multiply.
  const A = [10, 0, 0], B = [0, 0, 90];
  const { lo, hi } = await bboxOf(translate(A, rotate(B, cube(SZ))));
  const M = stepMatrix("translate", A).multiply(stepMatrix("rotate", B));
  const wrong = stepMatrix("rotate", B).multiply(stepMatrix("translate", A));
  const spread = (mat) => {
    const v = new Vector3();
    const plo = [Infinity, Infinity, Infinity], phi = [-Infinity, -Infinity, -Infinity];
    for (const p of CORNERS) {
      v.set(p[0], p[1], p[2]).applyMatrix4(mat);
      for (const [i, n] of [v.x, v.y, v.z].entries()) {
        plo[i] = Math.min(plo[i], n); phi[i] = Math.max(phi[i], n);
      }
    }
    return Math.max(...lo.map((n, i) => Math.abs(n - plo[i])), ...hi.map((n, i) => Math.abs(n - phi[i])));
  };
  check("outer∘inner matches the built solid", spread(M) < 0.02, `${spread(M).toFixed(4)} mm`);
  check("...and the reversed order does not, so this test can actually fail",
    spread(wrong) > 1, `reversed was only ${spread(wrong).toFixed(4)} mm out`);
}

console.log("\nthe viewer really does this\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");

  check("there is a matrix for the enclosing transforms", /function enclosingTransforms\(text, site\)/.test(HTML));
  check("...built with the same Euler order the DSL uses",
    /new THREE\.Euler\(a \* D, b \* D, c \* D, "XYZ"\)/.test(HTML),
    "a different order would disagree with the kernel by degrees");
  check("...composed outward, so nesting is not reversed", /full\.premultiply\(step\)/.test(HTML));
  check("the points handed to the handles are transformed",
    /const enc = enclosingTransforms\(text, site\);[\s\S]{0,600}?applyMatrix4\(M\)/.test(HTML));
  check("ancestors are found by a real paren scan, not a tail regex",
    /function callAncestors\(text, site\)/.test(HTML),
    "the text before a shape inside difference(a, b) is 'difference(', which no tail regex can walk past");
  check("...that claims nothing when the text is unbalanced",
    /if \(stack\.length\) return \[\];/.test(HTML));
  check("difference/union are stepped over, never treated as transforms",
    /if \(!XFORM_NAMES\.has\(anc\.name\)\) continue;/.test(HTML));
  check("transforms outside the replaced span are tracked separately",
    /if \(anc\.start < consumed\.start\) kept\.premultiply\(step\);/.test(HTML),
    "those survive the rewrite, so the committed points must pass through their inverse");

  // Bail-outs. Being wrong here is worse than doing nothing, because a
  // half-applied transform moves the handles somewhere plausible but false.
  check("a wrapper whose vector is an expression stops the walk",
    /if \(nums\.some\(\(n\) => !Number\.isFinite\(n\)\)\) return null;/.test(HTML));
  check("a zero scale axis stops it too", /if \(!a \|\| !b \|\| !c\) return null;/.test(HTML),
    "not invertible, so a dragged corner could not be written back");
  check("a degenerate mirror normal stops it", /if \(n\.lengthSq\(\) < 1e-12\) return null;/.test(HTML));

  // The unwrapped case is every freeform that has been committed once, since
  // committing strips the wrapper. It must not pay for any of this.
  check("an unwrapped call returns its numbers untouched",
    /if \(M\.equals\(IDENTITY4\)\) return pts;/.test(HTML));
  check("...and IDENTITY4 is declared before the function that reads it",
    HTML.indexOf("const IDENTITY4") < HTML.indexOf("function existingFreeformPoints"),
    "a const used by an earlier function is a TDZ crash waiting to happen");
}

console.log("\nfreeform never overwrites what it did not select\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");

  // The commit replaces transformWrapSpan(site) — a span whose walk stops at
  // any call holding more than this one shape. So the difference()/union()
  // around a converted cube survives, cut intact.
  check("the commit replaces the wrap-span, not an enclosing boolean",
    /const span = transformWrapSpan\(text, drag\.site\);[\s\S]{0,900}?next = text\.slice\(0, span\.start\) \+ freeformCall\(pts\) \+ text\.slice\(span\.end\);/.test(HTML));
  check("...and that walk refuses a wrapper with other children in it",
    /if \(text\.slice\(end, close - 1\)\.replace\(\/\[\\s,\]\/g, ""\) !== ""\) break;/.test(HTML),
    "swallowing translate(v, union(a, b)) would delete b");
  check("surviving outer transforms are inverted out of the written points",
    /const inv = enc\.kept\.clone\(\)\.invert\(\);/.test(HTML),
    "translate(A, difference(cube, cyl)) must not apply A twice after conversion");

  // Only box-like shapes may be converted. The hull of a cylinder's 8 bounding
  // corners is not a skewed cylinder — it is a box, i.e. the tool silently
  // replacing a function the user wrote with a different one.
  check("conversion is limited to cube / cuboid / freeform",
    /\$\("freeform"\)\.checked\s*\n?\s*&& \["cube", "cuboid", "freeform"\]\.includes\(hSite\.kind\)/.test(HTML),
    "a cylinder's corner ball falls through to the ordinary scale instead");
}

console.log("\nstretching keeps the cut true\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");

  // Stretching difference(cube, cylinder) used to scale the RESULT mesh, hole
  // and all — the bore went oval until release, then "snapped" round when the
  // kernel rebuilt. Now the exact text a release would commit is built live in
  // the worker while the drag is still moving.
  check("the resize commit text is computed in ONE place",
    /function resizeNextText\(text, drag, amount\)/.test(HTML)
      && /next = resizeNextText\(text, drag, drag\.amount\);/.test(HTML),
    "if the live preview and the commit computed it separately, the model would shift at release");
  check("the live build sends exactly that text",
    /resizeNextText\(code\.value, drag, amount\)/.test(HTML));
  check("...to the worker under its own key",
    /workerCall\(\{ op: "build", key: "drag", json \}\)/.test(HTML),
    "the real model's cached build must not be evicted by drag chatter");
  check("one build in flight, never a queue", /if \(L\.inflight \|\| L\.dead\) return;/.test(HTML));
  check("heavy models keep the cheap preview",
    /estimateBuild\(shape\)\.sec > 3\) \{ L\.dead = true; return; \}/.test(HTML),
    "seconds-per-pass builds cannot land at drag rate; a stale true build reads worse than an honest scale");
  check("a result landing after release is discarded",
    /if \(liveDrag !== L \|\| !drag\) return;\s*\/\/ discard, never paint stale/.test(HTML));
  check("the preview outlives the release until the commit build lands",
    /buildAfterToolEdit\(\)\.then\(\(\) => clearDragPreview\(\)\)/.test(HTML),
    "clearing at release snapped the model back to its old size for the whole rebuild");
  check("...and is retired the frame the committed geometry arrives",
    /modelGroup\.updateMatrixWorld\(true\);[\s\S]{0,220}clearDragPreview\(\);/.test(HTML));
  check("the hidden real meshes are hidden, not removed",
    /L\.hidden = drag\.meshes\.filter\(\(m\) => m\.visible\);/.test(HTML),
    "a failed build after release needs them back exactly as they were");
  check("...and clearing brings them back",
    /if \(liveDrag\?\.hidden\) for \(const m of liveDrag\.hidden\) m\.visible = true;/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
