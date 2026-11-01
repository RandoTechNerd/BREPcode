// The rotate gizmo: the angle a drag reads, the snapping, and the rotate()
// edit written on release. The edit is checked by APPLYING it: the corners of
// the part, pushed through the old code's transforms and then the turn, must
// land where the new code's transforms put them.

import * as THREE from "three";
import {
  wrapDelta, ringAngle, makeAngleTracker, snapAngle, readout,
  eulerToMatrix, matrixToEuler, rotateEdit, xformAffine, compose, IDENTITY, axisRotation,
} from "../viewer/rotategizmo.js";
import { primitiveSites } from "../viewer/assist.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearV = (a, b, eps = 1e-6) => a.every((n, i) => near(n, b[i], eps));
const D = Math.PI / 180;

console.log("\nrotate gizmo: angles\n");

check("wrapDelta folds 350° to -10°", near(wrapDelta(350 * D), -10 * D));
check("wrapDelta folds -350° to 10°", near(wrapDelta(-350 * D), 10 * D));
check("wrapDelta keeps 180°", near(wrapDelta(Math.PI), Math.PI));

{
  // crossing the atan2 seam at ±180 must keep counting, never flip
  const tr = makeAngleTracker(170 * D);
  let total = 0;
  for (const a of [175, 179, -178, -170, -100, 0, 90, 179, -179]) total = tr.update(a * D);
  check("tracker runs past 360° without flipping", near(total / D, 360 + 11, 1e-6), String(total / D));
  check("tracker holds on an unreadable frame", near(tr.update(null), total));
}

{
  const c = [0, 0, 0];
  // camera above, looking straight down at the Z ring
  const a = ringAngle([10, 0, 50], [0, 0, -1], c, 2);
  check("Z ring: point on +X reads 0°", a != null && near(a, 0));
  const b = ringAngle([0, 10, 50], [0, 0, -1], c, 2);
  check("Z ring: point on +Y reads +90° (right-handed)", b != null && near(b, 90 * D));
  // X ring: u=Y, v=Z
  check("X ring: +Z reads +90°", near(ringAngle([50, 0, 10], [-1, 0, 0], c, 0), 90 * D));
  // Y ring: u=Z, v=X
  check("Y ring: +X reads +90°", near(ringAngle([10, 50, 0], [0, -1, 0], c, 1), 90 * D));
  check("edge-on ray is rejected", ringAngle([0, 0, 50], [1, 0, -0.1], c, 2) === null);
  check("plane behind the camera is rejected", ringAngle([10, 0, -50], [0, 0, -1], c, 2) === null);
  check("just past edge-on is read", ringAngle([0, 0, 5], [1, 0, -0.2], c, 2) !== null);
}

console.log("\nrotate gizmo: snapping\n");
check("soft snap pulls 41° to 45°", snapAngle(41) === 45);
check("soft snap leaves 37.5°", snapAngle(37.5) === 37.5);
check("soft snap pulls 87° to 90°", snapAngle(87) === 90);
check("soft snap pulls -3° to 0", snapAngle(-3) === 0 && !Object.is(snapAngle(-3), -0));
check("hard snap 22° → 15°", snapAngle(22, true) === 15);
check("hard snap 23° → 30°", snapAngle(23, true) === 30);
check("readout", readout(37.5, 2) === "37.5° about Z" && readout(90, 0) === "90° about X");

console.log("\nrotate gizmo: matrices match three.js\n");
{
  let worst = 0;
  for (const e of [[30, 0, 0], [0, 45, 0], [0, 0, 60], [10, 20, 30], [-75, 33, 170], [90, 90, 0], [123, -45, -12]]) {
    const ours = eulerToMatrix(e);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(e[0] * D, e[1] * D, e[2] * D, "XYZ"));
    const te = m.elements;
    const theirs = [[te[0], te[4], te[8]], [te[1], te[5], te[9]], [te[2], te[6], te[10]]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) worst = Math.max(worst, Math.abs(ours[i][j] - theirs[i][j]));
    const back = matrixToEuler(ours);
    const eu = new THREE.Euler().setFromRotationMatrix(m, "XYZ");
    if (!nearV(back, [eu.x / D, eu.y / D, eu.z / D], 1e-9)) worst = Infinity;
  }
  check("eulerToMatrix / matrixToEuler agree with three (XYZ)", worst < 1e-12, String(worst));
}

console.log("\nrotate gizmo: the code edit\n");

// Apply every transform enclosing a site (as text) to a point, innermost first.
// A little evaluator for the test's own fixtures: numeric wrappers only.
function worldOf(text, site, p) {
  let m = IDENTITY();
  const heads = [];
  let depth = 0;
  for (let i = site.start - 1; i >= 0; i--) {
    if (text[i] === ")") depth++;
    else if (text[i] === "(") {
      if (depth) { depth--; continue; }
      const name = /([A-Za-z]+)\s*$/.exec(text.slice(0, i))?.[1];
      if (["translate", "rotate", "scale", "mirror"].includes(name)) {
        const v = /^\(\s*\[([^\]]*)\]/.exec(text.slice(i))[1].split(",").map(Number);
        heads.push(xformAffine(name, v));
      }
    }
  }
  for (const h of heads) m = compose(h, m);
  return [0, 1, 2].map((r) => m.L[r][0] * p[0] + m.L[r][1] * p[1] + m.L[r][2] * p[2] + m.t[r]);
}
function turned(p, pivot, axis, deg) {
  const R = axisRotation(axis, deg);
  const d = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
  return [0, 1, 2].map((r) => R[r][0] * d[0] + R[r][1] * d[1] + R[r][2] * d[2] + pivot[r]);
}
const parses = (src) => { try { new Function(`return (${src});`); return true; } catch { return false; } };
const CORNERS = [[0, 0, 0], [7, 0, 0], [0, 5, 0], [0, 0, 3], [7, 5, 3]];

// Turn the n-th `kind` call; check the edit moves its corners exactly as the
// gizmo previewed them.
function verify(label, text, kind, n, axis, deg, pivot, spanOf = (s) => s) {
  const site = primitiveSites(text).filter((s) => s.kind === kind)[n];
  const span = spanOf(site, text);
  const r = rotateEdit(text, span, pivot, axis, deg);
  if (r.refuse) { check(label, false, r.refuse); return null; }
  const next = text.slice(0, r.start) + r.text + text.slice(r.end);
  const site2 = primitiveSites(next).filter((s) => s.kind === kind)[n];
  let worst = 0;
  for (const c of CORNERS) {
    const want = turned(worldOf(text, site, c), pivot, axis, deg);
    const got = worldOf(next, site2, c);
    worst = Math.max(worst, ...want.map((w, i) => Math.abs(w - got[i])));
  }
  check(label, worst < 0.02 && parses(next), `off by ${worst.toFixed(4)}\n${next}`);
  return next;
}

const starter = `difference(
  cube([30, 30, 12]),
  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),
)`;

{
  const next = verify("starter hole: 90° about X about its centre", starter, "cylinder", 0, 0, 90, [15, 15, 6]);
  check("starter hole: one translate + one rotate, no nesting",
    next && /translate\(\[[^\]]+\], rotate\(\[90, 0, 0\], cylinder\(/.test(next) && (next.match(/translate/g) || []).length === 1, next);
  // and a second turn composes with the first rather than nesting
  if (next) {
    const again = verify("second turn composes onto the first", next, "cylinder", 0, 2, 45, [15, 15, 6]);
    check("second turn: still a single rotate()", again && (again.match(/rotate\(/g) || []).length === 1, again);
  }
}

{
  const t = `union(
  cube([20, 20, 4]),
  translate([5, 5, 4], rotate([0, 0, 30], cube([6, 6, 10]))),
)`;
  verify("part inside a union with an existing rotate (Y 37.5°)", t, "cube", 1, 1, 37.5, [8, 8, 9]);
  // composing back to zero drops the rotate() altogether
  const r = rotateEdit(t, primitiveSites(t).filter((s) => s.kind === "cube")[1], [0, 0, 0], 2, -30);
  check("turning back to 0° drops the rotate()", r.text && !/rotate/.test(r.text), r.text);
}

{
  // the body of a difference: the whole boolean turns, holes and all
  const whole = (site, text) => {
    const at = text.indexOf("difference");
    return { start: at, end: text.lastIndexOf(")") + 1 };
  };
  const next = verify("whole difference about Z", starter, "cube", 0, 2, 45, [15, 15, 6], whole);
  check("whole difference: wraps the boolean", next && /^translate\([^]*rotate\(\[0, 0, 45\], difference\(/.test(next), next);
}

{
  // transforms OUTSIDE the private wrappers stay put and are compensated for
  const t = `translate([100, 0, 0], rotate([0, 0, 90], union(
  cube([10, 10, 10]),
  translate([20, 0, 0], sphere(4)),
)))`;
  verify("inside an outer translate+rotate", t, "sphere", 0, 0, 60, [100, 20, 0]);
  const s = `scale([2, 2, 2], union(cube([10, 10, 10]), sphere(3)))`;
  verify("inside a uniform scale", s, "sphere", 0, 1, 30, [0, 0, 0]);
  const bad = `scale([1, 3, 1], union(cube([10, 10, 10]), sphere(3)))`;
  const r = rotateEdit(bad, primitiveSites(bad).find((x) => x.kind === "sphere"), [0, 0, 0], 0, 30);
  check("uneven scale outside: refuses", !!r.refuse, JSON.stringify(r));
  const expr = `translate([W, 0, 0], union(cube([10, 10, 10]), sphere(3)))`;
  const r2 = rotateEdit(expr, primitiveSites(expr).find((x) => x.kind === "sphere"), [0, 0, 0], 0, 30);
  check("expression-valued wrapper outside: refuses", !!r2.refuse);
}

{
  const r = rotateEdit(starter, primitiveSites(starter).find((s) => s.kind === "cylinder"), [15, 15, 6], 2, 0.01);
  check("a no-op turn writes nothing", !!r.refuse);
}

console.log("\nrotate gizmo: back down on the bed\n");

{
  // A 40 x 10 x 35 block standing on the bed, tipped 90 deg about X through
  // its centre: turned alone it would hang 12.5 mm up (its 35 mm height
  // becomes 10). dropZ = -12.5 is what the gizmo passes; the written code
  // must turn it AND set it down, every corner exactly where the preview put it.
  const text = "cube([40, 10, 35])";
  const site = primitiveSites(text).find((s) => s.kind === "cube");
  const pivot = [20, 5, 17.5];
  const r = rotateEdit(text, site, pivot, 0, 90, { dropZ: -12.5 });
  const next = text.slice(0, r.start) + r.text + text.slice(r.end);
  const site2 = primitiveSites(next).find((s) => s.kind === "cube");
  const box = [[0, 0, 0], [40, 0, 0], [0, 10, 0], [0, 0, 35], [40, 10, 35], [40, 10, 0], [0, 10, 35], [40, 0, 35]];
  let worst = 0, minZ = Infinity;
  for (const c of box) {
    const want = turned(c, pivot, 0, 90);
    want[2] += -12.5;
    const got = worldOf(next, site2, c);
    worst = Math.max(worst, ...want.map((w, i) => Math.abs(w - got[i])));
    minZ = Math.min(minZ, got[2]);
  }
  check("dropZ: the turn and the drop both land in the code", worst < 0.02 && parses(next), `off by ${worst}\n${next}`);
  check("dropZ: the tipped block sits on the bed (lowest corner at z = 0)", Math.abs(minZ) < 0.02, `min z ${minZ}`);

  const plain = rotateEdit(text, site, pivot, 0, 90);
  const withZero = rotateEdit(text, site, pivot, 0, 90, { dropZ: 0 });
  check("dropZ 0 writes exactly what no dropZ writes", plain.text === withZero.text);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
