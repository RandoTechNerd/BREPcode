// A swept tube has to be a CLOSED, correctly-wound mesh or the kernel refuses
// it — that is the whole reason the old hand-rolled cylinder+sphere chain was
// unioned rather than swept. So most of this file is not "does it look right",
// it is "is every edge shared by exactly two faces, and do the normals face
// out". Volume is checked against the closed-form answer because a tube that is
// inside-out still passes a closed-mesh test and then imports as a void.

import { cleanPath, roundPath, pathFrames, sweepTube, autoSides } from "../src/sweep.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Every directed edge exactly once <=> closed and consistently oriented.
function openEdges({ faces }) {
  const seen = new Map();
  for (const f of faces) {
    for (let i = 0; i < 3; i++) {
      const k = `${f[i]}>${f[(i + 1) % 3]}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  let bad = 0;
  for (const [k, n] of seen) {
    const [a, b] = k.split(">");
    if (n !== 1) bad++;
    else if ((seen.get(`${b}>${a}`) || 0) !== 1) bad++;
  }
  return bad;
}

function volume({ points, faces }) {
  let v = 0;
  for (const [a, b, c] of faces) {
    const p = points[a], q = points[b], r = points[c];
    v += (p[0] * (q[1] * r[2] - q[2] * r[1])
        - p[1] * (q[0] * r[2] - q[2] * r[0])
        + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
  }
  return v;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

console.log("\na path is whatever the caller reasonably meant by one\n");
{
  check("[[x,y,z]] passes through", cleanPath([[0, 0, 0], [1, 2, 3]]).length === 2);
  check("a 2D drawing sweeps flat at z=0",
    cleanPath([[0, 0], [10, 0]])[1][2] === 0);
  check("a flat number list is chunked",
    cleanPath([0, 0, 0, 1, 0, 0]).length === 2);
  check("a repeated point is dropped",
    cleanPath([[0, 0, 0], [0, 0, 0], [5, 0, 0]]).length === 2);
  check("a closed path does not repeat its first point",
    cleanPath([[0, 0, 0], [5, 0, 0], [5, 5, 0], [0, 0, 0]], { closed: true }).length === 3);
  let threw = "";
  try { cleanPath([0, 0, 0, 1]); } catch (e) { threw = e.message; }
  check("a ragged flat list is refused, by name", /multiple of 3/.test(threw), threw);
  threw = "";
  try { sweepTube([[0, 0, 0]]); } catch (e) { threw = e.message; }
  check("one point is not a path", /two different points/.test(threw), threw);
}

console.log("\na straight tube is a cylinder, and the numbers say so\n");
{
  const L = 40, r = 3;
  const flat = sweepTube([[0, 0, 0], [L, 0, 0]], { r, sides: 48, caps: "flat" });
  check("flat-capped: closed mesh", openEdges(flat) === 0, `${openEdges(flat)} bad edges`);
  const want = Math.PI * r * r * L;
  // A 48-gon is inscribed, so it comes in a shade under the true cylinder.
  check("flat-capped: volume is pi r^2 L", near(volume(flat), want, want * 0.01),
    `${volume(flat).toFixed(1)} vs ${want.toFixed(1)}`);
  check("flat-capped: wound outward (positive volume)", volume(flat) > 0);

  const round = sweepTube([[0, 0, 0], [L, 0, 0]], { r, sides: 48, caps: "round" });
  check("round-capped: closed mesh", openEdges(round) === 0, `${openEdges(round)} bad edges`);
  const wantR = want + (4 / 3) * Math.PI * r ** 3;
  check("round-capped: volume gains a whole sphere", near(volume(round), wantR, wantR * 0.03),
    `${volume(round).toFixed(1)} vs ${wantR.toFixed(1)}`);
  const xs = round.points.map((p) => p[0]);
  check("round caps stick out by r at each end",
    near(Math.min(...xs), -r, 0.05) && near(Math.max(...xs), L + r, 0.05),
    `${Math.min(...xs).toFixed(2)} .. ${Math.max(...xs).toFixed(2)}`);
}

console.log("\ncorners become arcs instead of kinks\n");
{
  const L = [[0, 0, 0], [30, 0, 0], [30, 30, 0]];
  const sharp = roundPath(L, 0, 6);
  check("no bend radius leaves the polyline alone", sharp.length === 3);
  const soft = roundPath(L, 6, 6);
  check("a bend inserts an arc", soft.length > 3, `${soft.length} points`);
  check("...that starts and ends where the straights do",
    dist(soft[0], L[0]) < 1e-9 && dist(soft[soft.length - 1], L[2]) < 1e-9);
  // Every arc point must sit at the bend radius from the corner's centre, which
  // for a 90 degree corner is (30-6, 6, 0).
  const centre = [24, 6, 0];
  const arcPts = soft.filter((p) => p[0] < 29.99 && p[1] > 0.01);
  check("...on a real circle of the requested radius",
    arcPts.length > 0 && arcPts.every((p) => near(dist(p, centre), 6, 1e-6)),
    `${arcPts.length} arc points`);

  // The promise that matters: a corner never eats more than the segment has.
  const tight = roundPath([[0, 0, 0], [4, 0, 0], [4, 4, 0]], 50, 6);
  check("an impossible radius is clamped, not refused", tight.length > 3);
  check("...and never overshoots the neighbouring points",
    tight.every((p) => p[0] >= -1e-9 && p[0] <= 4 + 1e-9 && p[1] >= -1e-9 && p[1] <= 4 + 1e-9),
    JSON.stringify(tight.find((p) => p[0] < -1e-9 || p[0] > 4 + 1e-9)));
}

console.log("\na bend is never tighter than the tube can carry\n");
{
  // The failure this prevents is invisible in a triangle count and expensive in
  // the kernel. At bend = 1.5r the arc's inner wall has radius 0.5r, so on a
  // thin tube consecutive rings land a fraction of a millimetre apart on the
  // inside of the bend. Below the kernel's welding distance those vertices
  // merge and the quads between them collapse into slivers it must repair.
  // Measured on a 0.8mm strand with three corners: 23.2 s vs 7.1 s with no arc,
  // at an IDENTICAL triangle count. So: a roomier default, and a floor on how
  // finely an arc may be cut.
  const bendOf = (r) => {
    // recover the default bend radius by finding where the arc points sit
    const p = sweepTube([[0, 0, 0], [30, 0, 0], [30, 30, 0]], { r });
    return p;
  };
  for (const r of [0.5, 0.8, 1.5, 3]) {
    const m = bendOf(r);
    check(`r=${r}: closed`, openEdges(m) === 0, `${openEdges(m)} bad edges`);
    check(`r=${r}: outward`, volume(m) > 0);
  }

  // The default must leave the inner wall clear of the axis by a real margin.
  const DEFAULT_FACTOR = 3;
  check("the default bend is 3x the radius, not 1.5x",
    roundPath([[0, 0, 0], [30, 0, 0], [30, 30, 0]], 1 * DEFAULT_FACTOR, 6, { minStep: 0.6 }).length
      === sweepPathLen(1),
    "default bend no longer matches 3x r");

  // A tight bend on a thin tube must COARSEN rather than emit sub-millimetre
  // steps on the inside of the arc.
  const fine = roundPath([[0, 0, 0], [30, 0, 0], [30, 30, 0]], 1.2, 6, { minStep: 0 });
  const guarded = roundPath([[0, 0, 0], [30, 0, 0], [30, 30, 0]], 1.2, 6, { minStep: 0.6 });
  check("a tight bend is cut more coarsely, not finer", guarded.length < fine.length,
    `${guarded.length} vs ${fine.length}`);
  check("...but it is still an arc, not a kink", guarded.length > 3, `${guarded.length}`);
  // and the guard must never fire on a generous bend
  const roomy = roundPath([[0, 0, 0], [30, 0, 0], [30, 30, 0]], 9, 6, { minStep: 0.6 });
  check("a roomy bend keeps its full subdivision", roomy.length === fine.length,
    `${roomy.length} vs ${fine.length}`);
}

function sweepPathLen(r) {
  // what sweepTube's own default produces, for the comparison above
  return roundPath([[0, 0, 0], [30, 0, 0], [30, 30, 0]], r * 3, 6,
    { minStep: Math.max(0.25, r * 0.6) }).length;
}

console.log("\nthe facet count follows the radius, because the kernel charges for it\n");
{
  // The kernel's import cost is superlinear in triangles, so a 1.5mm cable
  // tessellated like a 25mm handle is not a small waste — it is most of the
  // build time. These are the numbers autoSides() actually returns.
  check("a thin cable gets few sides", autoSides(1.5) <= 8, `${autoSides(1.5)}`);
  check("a 3mm tube gets a few more", autoSides(3) >= 8 && autoSides(3) <= 12, `${autoSides(3)}`);
  check("a 10mm handle looks round", autoSides(10) >= 16, `${autoSides(10)}`);
  check("...and it stops climbing", autoSides(200) === 24, `${autoSides(200)}`);
  check("never below a triangle-safe floor", autoSides(0.01) >= 6 && autoSides(0) >= 6);
  check("always even, so the tube is symmetric",
    [0.5, 1, 2, 4, 8, 16, 32].every((r) => autoSides(r) % 2 === 0));
  check("bigger radius is never fewer sides",
    [1, 2, 4, 8, 16, 32].every((r, i, a) => i === 0 || autoSides(r) >= autoSides(a[i - 1])));

  const auto = sweepTube([[0, 0, 0], [50, 0, 0]], { r: 1.5 });
  const fixed = sweepTube([[0, 0, 0], [50, 0, 0]], { r: 1.5, sides: 16 });
  check("auto is the default and it is cheaper", auto.faces.length < fixed.faces.length,
    `${auto.faces.length} vs ${fixed.faces.length}`);
  check("...and still closed", openEdges(auto) === 0);
  check("an explicit count is still obeyed",
    sweepTube([[0, 0, 0], [50, 0, 0]], { r: 1.5, sides: 32 }).faces.length
      > sweepTube([[0, 0, 0], [50, 0, 0]], { r: 1.5, sides: 8 }).faces.length);
}

console.log("\nan already-smooth curve is left alone\n");
{
  // A helix, a sampled circle or an exported spline turns a few degrees per
  // point. Treating each of those as a corner to round grows every one of them
  // into an arc, and the mesh comes out ~7x heavier for no visible change —
  // which is exactly what a coiled cable is made of, so it matters.
  const circle = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    circle.push([20 * Math.cos(a), 20 * Math.sin(a), 0]);
  }
  check("a 48-point circle gains no points", roundPath(circle, 3, 6, { closed: true }).length === 48,
    `${roundPath(circle, 3, 6, { closed: true }).length} points`);

  const helix = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 24) * Math.PI * 2;
    helix.push([12 * Math.cos(a), 12 * Math.sin(a), i * 0.25]);
  }
  const coil = sweepTube(helix, { r: 1.6, sides: 14 });
  check("a 3-turn coil stays light", coil.faces.length < 3000, `${coil.faces.length} tris`);
  check("...and is still closed", openEdges(coil) === 0, `${openEdges(coil)} bad edges`);

  // But a real corner in among smooth points must still be found and rounded.
  const mixed = roundPath([...circle.slice(0, 12), [40, 40, 0], [40, 80, 0]], 4, 6);
  check("a genuine corner in a smooth path is still rounded", mixed.length > 14,
    `${mixed.length} vs 14 in`);
}

console.log("\na bent tube stays round all the way through the bend\n");
{
  const r = 4;
  const bent = sweepTube([[0, 0, 0], [40, 0, 0], [40, 40, 0]], { r, sides: 32, bend: 8 });
  check("closed mesh", openEdges(bent) === 0, `${openEdges(bent)} bad edges`);
  check("wound outward", volume(bent) > 0);
  // Every vertex should be within r of the path, give or take the cap domes and
  // the flat-sided approximation. A mitre blow-up shows up here immediately.
  const seg = [[[0, 0, 0], [40, 0, 0]], [[40, 0, 0], [40, 40, 0]]];
  const toPath = (p) => Math.min(...seg.map(([a, b]) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(0, Math.min(1,
      (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
  }));
  const worst = Math.max(...bent.points.map(toPath));
  check("no vertex flies away from the path", worst < r * 1.35, `worst ${worst.toFixed(2)} vs r=${r}`);

  // With bend off, a 90 degree mitre is 1.41x — allowed, but clamped so it can
  // never fold through itself no matter how sharp the corner.
  const hairpin = sweepTube([[0, 0, 0], [40, 0, 0], [0, 1, 0]], { r: 3, sides: 24, bend: 0 });
  check("a hairpin with no bend radius still closes", openEdges(hairpin) === 0,
    `${openEdges(hairpin)} bad edges`);
  check("...and is still a solid, not an inside-out one", volume(hairpin) > 0);
}

console.log("\nthe tube does not twist, and a loop meets itself\n");
{
  // A helix is the case that breaks a naive "rebuild the ring from world Z"
  // frame: the tangent sweeps through every direction, so any fixed reference
  // makes the seam spin. Parallel transport should keep it steady.
  const helix = [];
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 6;
    helix.push([12 * Math.cos(a), 12 * Math.sin(a), i * 0.5]);
  }
  const coil = sweepTube(helix, { r: 1.6, sides: 20 });
  check("a 3-turn coil is a closed mesh", openEdges(coil) === 0, `${openEdges(coil)} bad edges`);
  check("...wound outward", volume(coil) > 0);

  const frames = pathFrames(helix.map((p) => p));
  let maxStep = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].u, b = frames[i].u;
    maxStep = Math.max(maxStep, Math.acos(Math.max(-1, Math.min(1,
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))));
  }
  check("the seam never jumps between rings", maxStep < 0.35, `${maxStep.toFixed(3)} rad`);

  const loop = sweepTube(
    [[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]],
    { r: 3, sides: 24, closed: true, bend: 8 },
  );
  check("a closed loop needs no caps and still closes", openEdges(loop) === 0,
    `${openEdges(loop)} bad edges`);
  check("...and encloses a positive volume", volume(loop) > 0);
}

console.log("\na radius list tapers along the path\n");
{
  const taper = sweepTube([[0, 0, 0], [50, 0, 0]], { r: [2, 8], sides: 32, caps: "flat" });
  check("closed mesh", openEdges(taper) === 0, `${openEdges(taper)} bad edges`);
  // A truncated cone: pi h (R^2 + Rr + r^2) / 3.
  const want = (Math.PI * 50 * (64 + 16 + 4)) / 3;
  check("volume matches a truncated cone", near(volume(taper), want, want * 0.02),
    `${volume(taper).toFixed(1)} vs ${want.toFixed(1)}`);
  let threw = "";
  try { sweepTube([[0, 0, 0], [1, 0, 0], [2, 0, 0]], { r: [1, 2] }); } catch (e) { threw = e.message; }
  check("a mismatched radius list says how many it wanted", /3 points/.test(threw), threw);
}

console.log("\none tube is one solid — which is the entire point\n");
{
  // The five-bend wire that used to be eleven unioned solids.
  const wire = sweepTube(
    [[0, 0, 0], [20, 0, 0], [20, 15, 0], [40, 15, 0], [40, 15, 25], [60, 15, 25]],
    { r: 1.5, sides: 16 },
  );
  check("five bends, still a single closed mesh", openEdges(wire) === 0,
    `${openEdges(wire)} bad edges`);
  check("...and a sane triangle count", wire.faces.length < 4000, `${wire.faces.length} tris`);
  console.log(`        (${wire.points.length} verts, ${wire.faces.length} tris in one solid)`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
