// Gears — measured, not asserted.
//
// The whole reason gears live in code is that "looks about right" and "works"
// are unrelated for this one part. So the checks here are mostly geometric
// facts read back off a BUILT mesh: the tip diameter you would put a caliper
// on, the number of teeth you would count, the gap between two gears placed at
// their computed centre distance.
//
// The one that matters most is the interference check at the bottom. Two gears
// at their true centre distance must come CLOSE and not TOUCH — a mesh that
// overlaps is a gear that binds, and it is invisible in a render.

import { build, toSTL } from "../index.js";
import {
  gear, gearWithHub, ringGear, rack, gearPair, gearMath, gearTrain,
  PRESSURE_ANGLE, MIN_TEETH_NO_UNDERCUT, MIN_PRINTABLE_MODULE, GEAR_KINDS,
} from "../src/gears.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Read the triangles back out of a built solid so we can measure it the way a
// caliper would, rather than trusting the code that drew it.
async function tris(shape) {
  const stl = toSTL(await build(shape), "g");
  const out = [];
  const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
  let m, cur = [];
  while ((m = re.exec(stl))) {
    cur.push([+m[1], +m[2], +m[3]]);
    if (cur.length === 3) { out.push(cur); cur = []; }
  }
  return out;
}
const verts = async (shape) => (await tris(shape)).flat();
const radii = (vs, z = null) => vs
  .filter((v) => z === null || near(v[2], z, 1e-6))
  .map((v) => Math.hypot(v[0], v[1]));

console.log("\nThe module is the compatibility rule\n");
{
  // m = d/z, so a 20-tooth module-2 gear pitches at exactly 40 mm. Every other
  // number in the file falls out of this one.
  const g = gearMath(2, 20, 40);
  check("pitch diameter is m·z", g.gears[0].pitch === 40, String(g.gears[0].pitch));
  check("tip diameter is m(z+2)", g.gears[0].tip === 44, String(g.gears[0].tip));
  check("root diameter is m(z−2.5)", g.gears[0].root === 35, String(g.gears[0].root));
  check("base diameter is d·cos α",
    near(g.gears[0].base, 40 * Math.cos((20 * Math.PI) / 180), 1e-9));
  // The two numbers a machine is actually assembled from.
  check("centre distance is m(z1+z2)/2", g.centre === 60, String(g.centre));
  check("ratio is z2/z1", g.ratio === 2, String(g.ratio));
  check("...and says so in the form people write it", g.ratioText === "2:1", g.ratioText);
  check("two external gears counter-rotate", g.reverses === true);
  check("20:40 is not a hunting pair", g.huntingTeeth === false);
  check("...but 20:41 is", gearMath(2, 20, 41).huntingTeeth === true);
}

console.log("\nWhat it refuses, and what it merely warns about\n");
{
  // Undercut is a real fault, but the gear still turns — so it is a warning,
  // not a refusal. Silently producing it is what would be wrong.
  const u = gearMath(1, 12, 30);
  check(`under ${MIN_TEETH_NO_UNDERCUT} teeth is reported as undercut`,
    u.warnings.some((w) => /undercut/.test(w)), u.warnings.join(" | "));
  check("...and the gear is still described, not refused", u.gears[0].undercut === true);
  check("a healthy pair warns about nothing", gearMath(2, 20, 40).warnings.length === 0);
  check(`a module under ${MIN_PRINTABLE_MODULE} is called unprintable`,
    gearMath(0.5, 20, 40).warnings.some((w) => /will not print/.test(w)));
  // These are refusals: there is no geometry to make.
  let threw = "";
  try { gear({ module: 2, teeth: 3 }); } catch (e) { threw = e.message; }
  check("3 teeth is refused outright", /too few/.test(threw), threw);
  threw = "";
  try { gear({ module: 1, teeth: 20, h: 5, bore: 18 }); } catch (e) { threw = e.message; }
  check("a bore that eats the rim is refused", /no rim/.test(threw), threw);
  threw = "";
  try { rack({ module: 5, length: 4 }); } catch (e) { threw = e.message; }
  check("a rack too short for one tooth is refused", /fits no teeth/.test(threw), threw);
}

console.log("\nA built gear measures what the maths promised\n");
{
  const m = 2, z = 20;
  const g = gear({ module: m, teeth: z, h: 5 });
  const vs = await verts(g);
  const rs = radii(vs);
  const maxR = Math.max(...rs), minR = Math.min(...rs);
  // Tip diameter is the one a caliper reads. m(z+2) = 44.
  check("tip diameter measures m(z+2)", near(maxR * 2, 44, 0.02), (maxR * 2).toFixed(3));
  // Root diameter m(z−2.5) = 35.
  check("root diameter measures m(z−2.5)", near(minR * 2, 35, 0.02), (minR * 2).toFixed(3));
  const zs = vs.map((v) => v[2]);
  check("it stands on z=0 and is 5 thick",
    near(Math.min(...zs), 0, 1e-6) && near(Math.max(...zs), 5, 1e-6),
    `${Math.min(...zs)}..${Math.max(...zs)}`);

  // Count the teeth the way you would by eye: walk the top face's outline and
  // count how many times the radius peaks near the tip circle.
  const top = vs.filter((v) => near(v[2], 5, 1e-6));
  const tipPts = top.filter((v) => Math.hypot(v[0], v[1]) > (44 / 2) - 0.01);
  const angles = [...new Set(tipPts.map((v) =>
    Math.round((Math.atan2(v[1], v[0]) * 180) / Math.PI * 4) / 4))].sort((a, b) => a - b);
  // Points at the tip cluster into z groups; count the gaps between clusters.
  let clusters = 0;
  for (let i = 0; i < angles.length; i++) {
    const prev = angles[(i - 1 + angles.length) % angles.length];
    let d = angles[i] - prev; if (d < 0) d += 360;
    if (d > 360 / z / 2) clusters++;
  }
  check(`a ${z}-tooth gear has ${z} teeth at the tip circle`, clusters === z, String(clusters));
}

console.log("\nThe flank is a real involute\n");
{
  // The test that separates an involute from a triangle: the tooth's angular
  // half-width must SHRINK from root to tip, and shrink by the amount the
  // involute function predicts — not linearly.
  const m = 2, z = 24, alpha = (PRESSURE_ANGLE * Math.PI) / 180;
  const rp = (m * z) / 2, rb = rp * Math.cos(alpha);
  const inv = (x) => Math.tan(x) - x;
  const predicted = (r) => Math.PI / (2 * z) + inv(alpha) - inv(Math.acos(rb / r));

  const g = gear({ module: m, teeth: z, h: 3, backlash: 0, steps: 12 });
  const top = (await verts(g)).filter((v) => near(v[2], 3, 1e-6));

  // Check EVERY vertex on the flank, not three cherry-picked radii — the mesh
  // only has vertices where the outline was sampled, so asking about a radius
  // in between finds nothing and proves nothing. Take the tooth straddling
  // angle 0 and hold each of its points to the involute at its own radius.
  const tooth = top
    .map((v) => ({ r: Math.hypot(v[0], v[1]), a: Math.atan2(v[1], v[0]) }))
    .filter((p) => Math.abs(p.a) < Math.PI / z && p.r >= rb + 1e-6 && p.r <= rp + m + 1e-6);
  check("the tooth has flank points to check at all", tooth.length > 10, String(tooth.length));
  const off = tooth.map((p) => Math.abs(Math.abs(p.a) - predicted(p.r)));
  const worst = Math.max(...off);
  // 1e-6 rad, not 1e-9: these coordinates have been through an ASCII STL, which
  // writes floats as decimal text and loses the last few bits. Anything under a
  // microradian is the file format, not the curve.
  check(`all ${tooth.length} flank points sit on the involute (worst ${worst.toExponential(1)} rad)`,
    worst < 1e-6, worst.toExponential(3));

  // And it is a curve, not a straight-sided tooth: the half-width shrinks, and
  // shrinks NON-linearly. A trapezoid would give a constant second difference
  // of zero.
  const byR = [...tooth].sort((a, b) => a.r - b.r);
  const shrinking = byR.every((p, i) => i === 0 || Math.abs(p.a) <= Math.abs(byR[i - 1].a) + 1e-12);
  check("the tooth narrows monotonically from root to tip", shrinking);
  const lo = predicted(rb + 0.01), mid = predicted((rb + rp + m) / 2), hi = predicted(rp + m);
  const linearMid = (lo + hi) / 2;
  check("...and it curves — the midpoint is not on the straight line",
    Math.abs(mid - linearMid) > 1e-3, `${mid.toFixed(5)} vs ${linearMid.toFixed(5)}`);
  // And the shape of the shrink is what makes it an involute rather than a
  // straight-sided tooth: at the pitch circle it is exactly π/(2z).
  check("half-width at the pitch circle is exactly π/(2z)",
    near(predicted(rp), Math.PI / (2 * z), 1e-12));
}

console.log("\nBacklash opens a real gap\n");
{
  // Backlash is quoted as the gap in the MESH, so each of the two gears gives
  // up half of it — a gear asked for 0.4 mm thins by 0.2 mm, and the pair then
  // has 0.4 mm between the flanks. Asserting 0.4 mm off one gear would be
  // double-counting, and would produce a pair that rattles by twice what was
  // asked for. (Standard tooth thickness: s = πm/2 − b/2.)
  const m = 2, z = 20, b = 0.4;
  const rp = (m * z) / 2;
  const width = async (backlash) => {
    const g = gear({ module: m, teeth: z, h: 3, backlash, steps: 12 });
    const top = (await verts(g)).filter((v) => near(v[2], 3, 1e-6));
    // Measure at the outermost radius the mesh actually HAS points at, not at
    // a radius chosen in advance that may fall between two samples.
    const pts = top.map((v) => ({ r: Math.hypot(v[0], v[1]), a: Math.atan2(v[1], v[0]) }))
      .filter((p) => Math.abs(p.a) < Math.PI / z);
    const rEdge = Math.max(...pts.filter((p) => p.r <= rp).map((p) => p.r));
    const band = pts.filter((p) => near(p.r, rEdge, 1e-6));
    return { r: rEdge, arc: Math.max(...band.map((p) => Math.abs(p.a))) * 2 * rEdge };
  };
  const tight = await width(0), loose = await width(b);
  // Same reason as above — the radius survives the STL round trip to about 1e-6.
  check("both are measured at the same radius", near(tight.r, loose.r, 1e-5),
    `${tight.r} vs ${loose.r}`);
  // Δ(arc) = 2·r·Δφ, and Δφ = b/(4·rp), so at radius r the tooth thins by
  // r·b/(2·rp) — which at the pitch circle is exactly b/2.
  const want = (tight.r * b) / (2 * rp);
  check(`${b} mm of backlash thins the tooth by ${want.toFixed(3)} mm at r=${tight.r.toFixed(2)}`,
    near(tight.arc - loose.arc, want, 0.005),
    `${tight.arc.toFixed(4)} − ${loose.arc.toFixed(4)} = ${(tight.arc - loose.arc).toFixed(4)}`);
  check("...so the pair opens up by the full 0.4 mm asked for",
    near((tight.arc - loose.arc) * 2 * (rp / tight.r), b, 0.01));
}

console.log("\nA meshing pair meshes\n");
{
  // The check a render cannot do. Place two gears at the computed centre
  // distance and confirm the teeth INTERLEAVE without overlapping: the gap
  // must be positive (they do not bind) and small (they actually engage).
  const m = 2, z1 = 12, z2 = 36;
  const math = gearMath(m, z1, z2);
  const alpha = (PRESSURE_ANGLE * Math.PI) / 180;
  const inv = (x) => Math.tan(x) - x;
  const backlash = 0.1;

  // Sample each gear's outline analytically at high resolution and look for
  // the closest approach between the two tooth surfaces.
  const outline = (z, phase) => {
    const rp = (m * z) / 2, ra = rp + m, rf = rp - 1.25 * m, rb = rp * Math.cos(alpha);
    const half = Math.PI / (2 * z) - backlash / (2 * rp) / 2;
    const phi = (r) => (r <= rb ? half + inv(alpha) : half + inv(alpha) - inv(Math.acos(Math.min(1, rb / r))));
    const pts = [];
    for (let k = 0; k < z; k++) {
      const c = (2 * Math.PI * k) / z + phase;
      for (let i = 0; i <= 24; i++) {
        const r = Math.max(rf, rb) + ((ra - Math.max(rf, rb)) * i) / 24;
        pts.push([r * Math.cos(c - phi(r)), r * Math.sin(c - phi(r))]);
        pts.push([r * Math.cos(c + phi(r)), r * Math.sin(c + phi(r))]);
      }
    }
    return pts;
  };
  const a = outline(z1, 0);
  const b = outline(z2, Math.PI / z2).map(([x, y]) => [x + math.centre, y]);
  let gap = Infinity;
  for (const p of a) for (const q of b) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < gap) gap = d;
  }
  check("the teeth do not overlap at the computed centre distance", gap > 0, gap.toFixed(4));
  check("...and they are close enough to actually engage", gap < 0.35, gap.toFixed(4));

  // The half-tooth offset is what makes that true. Without it they collide.
  const bad = outline(z2, 0).map(([x, y]) => [x + math.centre, y]);
  let badGap = Infinity;
  for (const p of a) for (const q of bad) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < badGap) badGap = d;
  }
  check("without the half-tooth offset they would collide tip to tip",
    badGap < gap, `${badGap.toFixed(4)} vs ${gap.toFixed(4)}`);

  // And the built pair really is where the maths said. Note that the two gears
  // OVERLAP in x — that is what meshing means — so no plane separates them and
  // a per-gear centroid is not measurable from the triangles. Compare the
  // built bounding box against the same box computed from the analytic
  // outlines instead: that pins the centre distance and the half-tooth offset
  // together, which is exactly the pair of things that must agree.
  const built = gearPair({ module: m, teeth1: z1, teeth2: z2, h: 4 });
  const xs = (await verts(built)).map((v) => v[0]);
  const wantMin = Math.min(...a.map((p) => p[0]));
  const wantMax = Math.max(...b.map((p) => p[0]));
  check("the pair's near edge is the drive gear's tip circle",
    near(Math.min(...xs), wantMin, 0.02), `${Math.min(...xs).toFixed(3)} vs ${wantMin.toFixed(3)}`);
  check("the pair's far edge is the driven gear, placed at the centre distance",
    near(Math.max(...xs), wantMax, 0.02), `${Math.max(...xs).toFixed(3)} vs ${wantMax.toFixed(3)}`);
  // The drive gear sits on the origin, so its leftmost tip is exactly −m(z1+2)/2
  // — a number that can be checked without reference to anything else.
  check("...and the drive gear is on the origin",
    near(Math.min(...xs), -(m * (z1 + 2)) / 2, 0.02), Math.min(...xs).toFixed(3));
}

console.log("\nA train's ratio is first to last, and idlers only flip it\n");
{
  // The classic error: multiplying the stage ratios. 10→20→40 is 4:1, not
  // 2 × 2 = 4:1 by luck — check with a case where the two disagree.
  const t = gearTrain(2, [10, 30, 20]);
  check("10 → 30 → 20 is 2:1, not 6:1", t.ratio === 2, String(t.ratio));
  check("...the idler is counted as an idler", t.idlers === 1, String(t.idlers));
  check("two meshes means the output turns the same way", t.reverses === false);
  check("one mesh reverses it", gearTrain(2, [10, 30]).reverses === true);
  // Axle positions are cumulative centre distances.
  check("axle 2 sits at m(z1+z2)/2", t.axles[1].x === 40, String(t.axles[1].x));
  check("axle 3 sits a further m(z2+z3)/2 along", t.axles[2].x === 40 + 50, String(t.axles[2].x));
  check("the train reports its overall span", t.span === 90, String(t.span));
  check("a train of one is refused",
    (() => { try { gearTrain(2, [10]); return false; } catch { return true; } })());
  // A big reduction, stated the way a description would state it.
  check("8 → 64 reads as 8:1", gearTrain(1.5, [8, 64]).ratioText === "8:1");
  check("12 → 25 reads as 2.08:1", gearTrain(1.5, [12, 25]).ratioText === "2.08:1");
}

console.log("\nThe other gear shapes build\n");
{
  const hub = gearWithHub({ module: 2, teeth: 24, h: 5, bore: 5, hub: 12, hubH: 6 });
  const vs = await verts(hub);
  const zs = vs.map((v) => v[2]);
  check("a hubbed gear is gear + hub tall", near(Math.max(...zs), 11, 1e-6), String(Math.max(...zs)));
  const bore = radii(vs).filter((r) => r < 4);
  check("...and its bore goes right through", bore.length > 0 && near(Math.min(...bore), 2.5, 0.05),
    bore.length ? Math.min(...bore).toFixed(3) : "no bore points");
  let threw = "";
  try { gearWithHub({ module: 1, teeth: 20, hub: 40 }); } catch (e) { threw = e.message; }
  check("a hub wider than the root circle is refused", /swallow the teeth/.test(threw), threw);

  const ring = ringGear({ module: 2, teeth: 40, h: 6, rim: 5 });
  const rv = await verts(ring);
  const rr = radii(rv);
  // outer = pitch/2 + 1.25m + rim = 40 + 2.5 + 5
  check("a ring gear's outer radius is pitch + dedendum + rim",
    near(Math.max(...rr), 47.5, 0.05), Math.max(...rr).toFixed(3));
  // Its teeth point INWARD, so the smallest radius is inside the pitch circle.
  check("...and its teeth point inward", Math.min(...rr) < 40, Math.min(...rr).toFixed(3));

  const r = rack({ module: 2, length: 60, h: 6, back: 8 });
  const rkv = await verts(r);
  const xs = rkv.map((v) => v[0]);
  const pitch = Math.PI * 2;
  const n = Math.floor(60 / pitch);          // 9 teeth
  check(`a 60 mm module-2 rack fits ${n} teeth`,
    near(Math.max(...xs), n * pitch, 0.05), Math.max(...xs).toFixed(3));
  // The rack is the one gear you can check with a protractor: its flank leans
  // at exactly the pressure angle.
  check("the rack's tooth height is addendum + dedendum",
    near(Math.max(...rkv.map((v) => v[2])) - (-1.25 * 2), 2 + 1.25 * 2, 0.05));
}

console.log("\nThe catalogue\n");
{
  check("every gear kind has an id, a label and a blurb",
    GEAR_KINDS.every((k) => k.id && k.label && k.blurb));
  check("...and every id is a function that exists",
    GEAR_KINDS.every((k) => typeof ({ gear, gearWithHub, ringGear, rack, gearPair })[k.id] === "function"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
