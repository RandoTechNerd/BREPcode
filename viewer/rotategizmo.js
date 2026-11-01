// The rotate gizmo's arithmetic, kept free of three.js and the DOM so it can
// be unit-tested in Node (test/rotategizmo.js). index.html owns the rings,
// the raycasts and the preview; everything that decides an ANGLE or the TEXT
// written on release lives here.
//
// Conventions match src/dsl.js rotate() exactly: degrees, XYZ Euler, built
// the way three's makeRotationFromEuler builds it (M = Rx·Ry·Rz), and read
// back the way Euler.setFromRotationMatrix reads it. A gizmo that disagreed
// with the kernel by a convention would turn the part one way on screen and
// another way on rebuild.

const D2R = Math.PI / 180;

// ---------------------------------------------------------------- angles

// Any angle difference folded into (-PI, PI]. A drag reads the angle fresh
// every frame and adds only this wrapped step to a running total, so crossing
// the atan2 seam at +-180 is a 2-degree step, never a 358-degree flip.
export function wrapDelta(rad) {
  let d = rad % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

// The fixed in-plane basis for each ring, chosen so atan2(v, u) grows with a
// right-handed turn about the axis: X ring (u=Y, v=Z), Y ring (u=Z, v=X),
// Z ring (u=X, v=Y). A positive angle here is a positive rotate() about it.
const BASIS = [[1, 2], [2, 0], [0, 1]];

// Below this |cos| between the view ray and the ring's axis the ring is seen
// nearly edge-on, and the hit point races along the plane for a pixel of
// mouse travel: the angle is unreadable, so the frame is skipped.
export const EDGE_ON = 0.15;

// Where the cursor ray crosses the ring's plane, as an angle in radians, or
// null when that cannot be read (edge-on, or the plane is behind the camera).
export function ringAngle(origin, dir, center, axis) {
  const dn = dir[axis];
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  if (Math.abs(dn / len) < EDGE_ON) return null;
  const t = (center[axis] - origin[axis]) / dn;
  if (!(t > 0)) return null;
  const [ui, vi] = BASIS[axis];
  const du = origin[ui] + dir[ui] * t - center[ui];
  const dv = origin[vi] + dir[vi] * t - center[vi];
  if (Math.hypot(du, dv) < 1e-9) return null;      // dead centre: no direction
  return Math.atan2(dv, du);
}

// The running total for a drag: feed it each frame's raw angle.
export function makeAngleTracker(startRad) {
  let last = startRad, total = 0;
  return {
    update(rad) {
      if (rad == null) return total;                 // unreadable frame: hold
      total += wrapDelta(rad - last);
      last = rad;
      return total;
    },
    get total() { return total; },
  };
}

// Shift (hard) snaps to 15 degrees; otherwise a soft snap pulls onto a
// multiple of 45 only within 7 degrees of it, so 90 is easy to hit and 37.5
// is still possible.
export const HARD_STEP = 15, SOFT_STEP = 45, SOFT_RANGE = 7;
export function snapAngle(deg, hard = false) {
  if (hard) return Math.round(deg / HARD_STEP) * HARD_STEP || 0;
  const near = Math.round(deg / SOFT_STEP) * SOFT_STEP;
  if (Math.abs(deg - near) <= SOFT_RANGE) return near || 0;
  return Math.round(deg * 10) / 10 || 0;
}

export const AXIS_NAMES = ["X", "Y", "Z"];
export function readout(deg, axis) {
  const s = Number.isInteger(deg) ? String(deg) : deg.toFixed(1);
  return `${s}° about ${AXIS_NAMES[axis]}`;
}

// ---------------------------------------------------------------- matrices
// Affine maps as { L: 3x3 rows, t: [3] }: x -> L x + t.

const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const IDENTITY = () => ({ L: I3(), t: [0, 0, 0] });

function mul3(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  }
  return C;
}
const app3 = (A, v) => [0, 1, 2].map((i) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]);

// a ∘ b: apply b first, then a
export function compose(a, b) {
  const t = app3(a.L, b.t);
  return { L: mul3(a.L, b.L), t: [t[0] + a.t[0], t[1] + a.t[1], t[2] + a.t[2]] };
}

export function invert(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m.L;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const L = [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
  const t = app3(L, m.t).map((n) => -n);
  return { L, t };
}

export function eulerToMatrix([rx = 0, ry = 0, rz = 0]) {
  const a = Math.cos(rx * D2R), b = Math.sin(rx * D2R);
  const c = Math.cos(ry * D2R), d = Math.sin(ry * D2R);
  const e = Math.cos(rz * D2R), f = Math.sin(rz * D2R);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ];
}

export function matrixToEuler(L) {
  const clamp = (n) => Math.min(Math.max(n, -1), 1);
  const y = Math.asin(clamp(L[0][2]));
  let x, z;
  if (Math.abs(L[0][2]) < 0.9999999) {
    x = Math.atan2(-L[1][2], L[2][2]);
    z = Math.atan2(-L[0][1], L[0][0]);
  } else {
    x = Math.atan2(L[2][1], L[1][1]);
    z = 0;
  }
  return [x / D2R, y / D2R, z / D2R];
}

export function axisRotation(axis, deg) {
  const v = [0, 0, 0];
  v[axis] = deg;
  return eulerToMatrix(v);
}

// One transform call as an affine map, mirroring index.html xformMatrix().
export function xformAffine(name, nums) {
  const [a = 0, b = 0, c = 0] = nums;
  if (name === "translate") return { L: I3(), t: [a, b, c] };
  if (name === "rotate") return { L: eulerToMatrix([a, b, c]), t: [0, 0, 0] };
  if (name === "scale") {
    if (!a || !b || !c) return null;
    return { L: [[a, 0, 0], [0, b, 0], [0, 0, c]], t: [0, 0, 0] };
  }
  if (name === "mirror") {
    const n = Math.hypot(a, b, c);
    if (n < 1e-12) return null;
    const [x, y, z] = [a / n, b / n, c / n];
    return {
      L: [[1 - 2 * x * x, -2 * x * y, -2 * x * z],
          [-2 * y * x, 1 - 2 * y * y, -2 * y * z],
          [-2 * z * x, -2 * z * y, 1 - 2 * z * z]],
      t: [0, 0, 0],
    };
  }
  return null;
}

// --------------------------------------------------------------- the text

// Call spans strictly enclosing [span.start, span.end), innermost first.
// Strings are skipped so a ")" inside a text() label cannot unbalance it.
function ancestors(text, span) {
  const stack = [], out = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === "\\") i++;
      continue;
    }
    if (ch === "(") {
      let j = i - 1;
      while (j >= 0 && /\s/.test(text[j])) j--;
      let k = j;
      while (k >= 0 && /[A-Za-z0-9_$.]/.test(text[k])) k--;
      stack.push({ name: k < j ? text.slice(k + 1, j + 1) : "", start: k < j ? k + 1 : i, open: i });
    } else if (ch === ")") {
      const c = stack.pop();
      if (c && c.open < span.start && i + 1 >= span.end && c.start !== span.start) {
        out.push({ ...c, end: i + 1 });
      }
    }
  }
  if (stack.length) return null;
  return out.sort((a, b) => (a.end - a.start) - (b.end - b.start));
}

const XFORMS = new Set(["translate", "rotate", "scale", "mirror"]);

// A transform call's leading vector (or the DSL's scalar forms), with where
// that argument ends, or null when it is an expression.
function leadArg(text, anc) {
  const m = /^\s*(\[[^\]]*\]|-?[\d.]+)\s*,/.exec(text.slice(anc.open + 1, anc.open + 160));
  if (!m) return null;
  const argEnd = anc.open + 1 + m[0].length;
  if (m[1][0] !== "[") {
    const v = Number(m[1]);
    if (!Number.isFinite(v)) return null;
    if (anc.name === "rotate") return { nums: [0, 0, v], argEnd };
    if (anc.name === "scale") return { nums: [v, v, v], argEnd };
    return null;
  }
  const nums = m[1].slice(1, -1).split(",").map((s) => Number(s.trim()));
  if (!nums.length || nums.some((n) => !Number.isFinite(n))) return null;
  return { nums, argEnd };
}

const r2 = (n) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};
const fmt = (v) => `[${v.map(r2).join(", ")}]`;

// The edit a rotate drag commits: turning `span` (one call, or a whole
// boolean when its body was grabbed) by `deg` about world axis `axis`
// through world point `pivot`.
//
// The translate()/rotate() wrappers that hold ONLY this span are folded into
// the result instead of being nested inside another rotate(): their matrix M
// and the turn W compose, and the outcome is written back as at most one
// translate([..], rotate([..], inner)). Transforms further out (K) stay where
// they are, so the new private matrix is M' = K^-1 · W · K · M.
//
// `dropZ` (mm, world Z) is added after the turn: the gizmo passes the lift
// that puts a part that was standing on the bed back down on it, so tipping
// a tall part over doesn't leave it floating, and standing a flat one up
// doesn't sink it through the bed.
//
// Returns { start, end, text } for text.slice(0, start) + text + slice(end),
// or { refuse } with a sentence saying why not.
export function rotateEdit(text, span, pivot, axis, deg, { dropZ = 0 } = {}) {
  if (!deg || Math.abs(deg) < 0.05) return { refuse: "No turn to write." };
  const ancs = ancestors(text, span);
  if (!ancs) return { refuse: "The code's brackets don't balance, so it can't be edited safely." };

  // 1. private translate/rotate wrappers, innermost first
  let start = span.start, end = span.end;
  let M = IDENTITY();
  let i = 0;
  for (; i < ancs.length; i++) {
    const a = ancs[i];
    if (a.name !== "translate" && a.name !== "rotate") break;
    const arg = leadArg(text, a);
    if (!arg) break;
    // anything else inside it means it holds more than this shape
    const rest = text.slice(arg.argEnd, start) + text.slice(end, a.end - 1);
    if (rest.replace(/[\s,]/g, "") !== "") break;
    M = compose(xformAffine(a.name, arg.nums), M);
    start = a.start; end = a.end;
  }

  // 2. every transform further out, which survives the rewrite
  let K = IDENTITY();
  for (; i < ancs.length; i++) {
    const a = ancs[i];
    if (!XFORMS.has(a.name)) continue;          // union()/difference() move nothing
    const arg = leadArg(text, a);
    const step = arg && xformAffine(a.name, arg.nums);
    if (!step) {
      return { refuse: `The ${a.name}() around this part uses an expression, so the turn can't be worked out here. Type a rotate() instead.` };
    }
    K = compose(step, K);
  }

  // 3. W turns the WORLD about the pivot; carry it into the private frame
  const R = axisRotation(axis, deg);
  const pv = pivot;
  const Rp = app3(R, pv);
  const W = { L: R, t: [pv[0] - Rp[0], pv[1] - Rp[1], pv[2] - Rp[2] + (Number(dropZ) || 0)] };
  const Kinv = invert(K);
  if (!Kinv) return { refuse: "A scale of zero around this part can't be undone." };
  const Mn = compose(Kinv, compose(W, compose(K, M)));

  // A stretch or mirror further out bends a turn into a shear: no rotate()
  // can say that, so refuse rather than write something that lies.
  const L = Mn.L;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const dot = L[0][r] * L[0][c] + L[1][r] * L[1][c] + L[2][r] * L[2][c];
    if (Math.abs(dot - (r === c ? 1 : 0)) > 1e-6) {
      return { refuse: "This part sits inside an uneven scale() or a mirror(), where a turn can't be written as rotate()." };
    }
  }
  const det = L[0][0] * (L[1][1] * L[2][2] - L[1][2] * L[2][1])
    - L[0][1] * (L[1][0] * L[2][2] - L[1][2] * L[2][0])
    + L[0][2] * (L[1][0] * L[2][1] - L[1][1] * L[2][0]);
  if (det < 0) return { refuse: "This part sits inside a mirror(), where a turn can't be written as rotate()." };

  const e = matrixToEuler(L).map(r2);
  const t = Mn.t.map(r2);
  let out = text.slice(span.start, span.end);
  if (e.some((n) => n !== 0)) out = `rotate(${fmt(e)}, ${out})`;
  if (t.some((n) => n !== 0)) out = `translate(${fmt(t)}, ${out})`;
  return { start, end, text: out, euler: e, translate: t };
}
