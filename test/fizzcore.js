// FizzCore: graded bubble infill. Every case is BUILT and the result is
// checked as a solid, because a bubble that breaks the skin or two bubbles
// that merge would print as a hole or a weak spot, not fail loudly.

import { fizzcore, loadManifold, manifoldToSoup, soupToManifold, soupToBinaryStl, weld, overhangs, bestTilt, tiltSoup, orientSoup } from "../src/fizzcore.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

console.log("\nfizzcore — bubble infill\n");
const wasm = await loadManifold();
const W = 60, D = 40, H = 30;
const box = manifoldToSoup(wasm.Manifold.cube([W, D, H]));

const skinOf = (bubbles, tear) => Math.min(...bubbles.map(([x, y, z, r]) =>
  Math.min(x - r, W - x - r, y - r, D - y - r, z - r, H - z - r * (tear ? Math.SQRT2 : 1))));
const webOf = (bubbles) => {
  let m = Infinity;
  for (let i = 0; i < bubbles.length; i++) for (let j = i + 1; j < bubbles.length; j++) {
    const a = bubbles[i], b = bubbles[j];
    m = Math.min(m, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - a[3] - b[3]);
  }
  return m;
};

{
  const r = await fizzcore(box, {}, { wasm });
  const s = r.stats;
  check("makes bubbles", s.bubbles > 50, `${s.bubbles}`);
  check("removes plastic", s.saved > 0.1 && s.volumeAfter < s.volumeBefore, `${(s.saved * 100).toFixed(1)}%`);
  check("result is a closed solid", soupToManifold(wasm, r.part).volume() > 0);
  check("skin is kept (teardrop apex included)", skinOf(r.bubbles, true) >= 1.2 - 1e-6, skinOf(r.bubbles, true).toFixed(3));
  check("webs are kept between bubbles", webOf(r.bubbles) >= 0.8 - 1e-6, webOf(r.bubbles).toFixed(3));
  check("radii honour the smallest bubble", s.smallest >= 1.2 - 1e-6, `${s.smallest}`);
  check("volume removed matches the bubbles (no merged or escaped voids)",
    Math.abs((s.volumeBefore - s.volumeAfter) - r.bubbles.reduce((a, b) => a + 4.155 * b[3] ** 3, 0)) / (s.volumeBefore - s.volumeAfter) < 0.08);
  check("infill-equivalent is a fraction", s.infillEquivalent > 0 && s.infillEquivalent < 1);
}
{
  const a = await fizzcore(box, { fillGaps: true }, { wasm });
  const b = await fizzcore(box, { fillGaps: false }, { wasm });
  check("filling gaps adds bubbles and saves more", a.stats.bubbles > b.stats.bubbles && a.stats.saved > b.stats.saved,
    `${a.stats.bubbles}/${b.stats.bubbles}`);
}
{
  const r = await fizzcore(box, { maxBubble: 3, minBubble: 2 }, { wasm });
  check("max bubble is a ceiling", r.stats.largest <= 3 + 1e-6, `${r.stats.largest}`);
  check("min bubble is a floor", r.stats.smallest >= 2 - 1e-6, `${r.stats.smallest}`);
}
{
  const r = await fizzcore(box, { teardrop: false }, { wasm });
  check("round bubbles keep the skin", skinOf(r.bubbles, false) >= 1.2 - 1e-6);
}
{
  const r = await fizzcore(box, { web: 4 }, { wasm });
  check("hybrid (wide) webs are kept", webOf(r.bubbles) >= 4 - 1e-6, webOf(r.bubbles).toFixed(2));
}
{
  const a = await fizzcore(box, { seed: 3 }, { wasm });
  const b = await fizzcore(box, { seed: 3 }, { wasm });
  check("same settings, same bubbles", a.stats.bubbles === b.stats.bubbles && a.bubbles[0][0] === b.bubbles[0][0]);
}
{
  const r = await fizzcore(box, { fins: { side: "-x", count: 3 } }, { wasm });
  check("fins are made", r.fins && r.stats.fins.length === 3, JSON.stringify(r.stats.fins));
  const fins = soupToManifold(wasm, r.fins);
  check("fins never touch the part", fins.intersect(soupToManifold(wasm, box)).volume() < 1e-6);
  const bb = fins.boundingBox();
  check("fins stand on the -x side, on the bed", bb.max[0] <= 0 + 1e-6 && Math.abs(bb.min[2]) < 1e-6, JSON.stringify(bb));
}
{
  const thin = manifoldToSoup(wasm.Manifold.cube([40, 40, 2]));
  const r = await fizzcore(thin, {}, { wasm });
  check("a plate too thin for bubbles comes back whole", r.stats.bubbles === 0 && Math.abs(r.stats.saved) < 1e-9);
}
{
  const open = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
  let msg = "";
  try { await fizzcore(open, {}, { wasm }); } catch (e) { msg = e.message; }
  check("an open mesh is refused with advice", /Repair/.test(msg), msg);
}
{
  const r = await fizzcore(box, {}, { wasm });
  const stl = soupToBinaryStl([r.part, r.fins]);
  check("binary STL has the right size", stl.length === 84 + 50 * (r.part.length / 9));
  check("weld drops nothing on a clean mesh", weld(box).tris.length === box.length / 3);
}

// ---- tilt + leaning fins: a part printed on a 45 degree slant
{
  const tall = manifoldToSoup(wasm.Manifold.cube([20, 30, 50]));
  const wide = manifoldToSoup(wasm.Manifold.cube([90, 30, 20]));
  const opp = { "-x": "+x", "+x": "-x", "-y": "+y", "+y": "-y" };
  for (const toward of ["-x", "+x", "-y", "+y"]) {
    const r = await fizzcore(tall, { tilt: 45, tiltToward: toward, bubbles: false, fins: { side: "auto", count: 3 } }, { wasm });
    const part = soupToManifold(wasm, r.part), fins = soupToManifold(wasm, r.fins);
    const pb = part.boundingBox();
    check(`tilted ${toward}: part sits on the bed`, Math.abs(pb.min[2]) < 1e-4, `${pb.min[2]}`);
    // the top really did move toward the lean side
    const axis = toward[1] === "x" ? 0 : 1, sgn = toward[0] === "+" ? 1 : -1;
    let hiZ = -Infinity, hiA = 0;
    for (let i = 0; i < r.part.length; i += 3) if (r.part[i + 2] > hiZ) { hiZ = r.part[i + 2]; hiA = r.part[i + axis]; }
    check(`tilted ${toward}: the top leans that way`, sgn * (hiA - (pb.min[axis] + pb.max[axis]) / 2) > 0);
    check(`tilted ${toward}: a TALL part gets fins under its lean`, r.stats.fins.length === 3 && r.stats.fins.every((f) => f.side === toward),
      r.stats.fins.map((f) => f.side).join());
    check(`tilted ${toward}: fins measure the 45 degree face`, r.stats.fins.every((f) => Math.abs(f.lean - 45) <= 1), r.stats.fins.map((f) => f.lean).join());
    check(`tilted ${toward}: fins never touch it (0.2 mm square to the face)`, part.minGap(fins, 5) >= 0.19, part.minGap(fins, 5).toFixed(3));
    const w = await fizzcore(wide, { tilt: 45, tiltToward: toward, bubbles: false, fins: { side: "auto", count: 3 } }, { wasm });
    check(`tilted ${toward}: a WIDE part tips the other way, and its fins follow`,
      w.stats.fins.length === 3 && w.stats.fins.every((f) => f.side === opp[toward]), w.stats.fins.map((f) => f.side).join());
  }
  // A LUMPY part: radius wanders with height and angle and the axis snakes,
  // so the face has undersides and dips. The first fins on this overlapped
  // it by 4.9 mm3 (straight edges between probe heights cut through an
  // underside); carving against the real outline is what fixed it.
  {
    const blob = wasm.Manifold.levelSet(([x, y, z]) => {
      const cx = 6 * Math.sin(z / 11), cy = 4 * Math.sin(z / 7 + 1);
      const a = Math.atan2(y - cy, x - cx), r = Math.hypot(x - cx, y - cy);
      const R = 13 + 4 * Math.sin(z / 6) + 2.5 * Math.sin(3 * a + z / 9) + 1.5 * Math.cos(5 * a - z / 5);
      return Math.min(R - r, z, 70 - z);
    }, { min: [-35, -35, -1], max: [35, 35, 71] }, 1.2, 0);
    const r = await fizzcore(manifoldToSoup(blob), { tilt: 45, tiltToward: "-x", bubbles: false, fins: { side: "auto", count: 4 } }, { wasm });
    const part = soupToManifold(wasm, r.part), fins = soupToManifold(wasm, r.fins);
    check("lumpy part: fins carved to its outline", r.stats.fins.length >= 3 && r.stats.fins.every((f) => f.carved));
    check("lumpy part: fins never overlap it", fins.intersect(part).volume() < 1e-6, fins.intersect(part).volume().toFixed(4));
    check("lumpy part: and never touch it", part.minGap(fins, 5) >= 0.19, part.minGap(fins, 5).toFixed(3));
    const fb = fins.boundingBox(), pb = part.boundingBox();
    check("lumpy part: fins stay a sensible size (no spears across the bed)",
      fb.max[0] - fb.min[0] < Math.max(...r.stats.fins.map((f) => f.height)) * 2, `${(fb.max[0] - fb.min[0]).toFixed(0)} mm long`);
  }
  // the FINS must print too: grown from the bed a layer at a time, so no
  // piece floats and no face hangs past 45 degrees (a few degrees of slack
  // for the smoothing of the layer steps)
  {
    const blob = wasm.Manifold.levelSet(([x, y, z]) => {
      const cx = 6 * Math.sin(z / 11), cy = 4 * Math.sin(z / 7 + 1);
      const a = Math.atan2(y - cy, x - cx), r = Math.hypot(x - cx, y - cy);
      const R = 13 + 4 * Math.sin(z / 6) + 2.5 * Math.sin(3 * a + z / 9) + 1.5 * Math.cos(5 * a - z / 5);
      return Math.min(R - r, z, 70 - z);
    }, { min: [-35, -35, -1], max: [35, 35, 71] }, 1.2, 0);
    for (const shape of ["slim", "buttress"]) {
      const r = await fizzcore(manifoldToSoup(blob), { tilt: 45, tiltToward: "-x", bubbles: false, fins: { side: "auto", count: 4, shape } }, { wasm });
      const pieces = soupToManifold(wasm, r.fins).decompose();
      check(`${shape} fins: nothing floats (every piece stands on the bed)`, pieces.every((p) => p.boundingBox().min[2] < 0.05),
        pieces.map((p) => p.boundingBox().min[2].toFixed(2)).join());
      // maxDeg 38 = only faces clearly flatter than the 45 degree rule (the
      // grown slopes sit at 44-46 degrees from straight down, i.e. ON the rule)
      const oh = overhangs(r.fins, { maxDeg: 38 });
      check(`${shape} fins: nothing hangs past ~45 degrees`, oh.area < 5, `${oh.area.toFixed(1)} mm2`);
    }
  }
  {
    const cube = manifoldToSoup(wasm.Manifold.cube([20, 20, 20]));
    check("overhangs: an upright cube has none", overhangs(cube).area < 1e-6);
    check("overhangs: a cube at 45 degrees has none (its faces sit exactly at the limit)", overhangs(tiltSoup(cube, 45, "-x")).area < 1e-6);
    check("overhangs: at 60 degrees one 20x20 face hangs", Math.abs(overhangs(tiltSoup(cube, 60, "-x")).area - 400) < 1);
    const b = bestTilt(tiltSoup(cube, 60, "-x"));
    check("bestTilt finds a tilt with no overhang", b.area < 1e-6, JSON.stringify({ tilt: b.tilt, toward: b.toward, area: b.area }));
    const r = await fizzcore(cube, { tilt: 60, tiltToward: "-x", bubbles: false }, { wasm });
    check("the run reports the overhang it leaves", Math.abs(r.stats.overhangArea - 400) < 1);
  }
  {
    // orient: a 10x20x30 box turned 90 degrees about X stands 20 tall, on the bed
    const b = manifoldToSoup(wasm.Manifold.cube([10, 20, 30]));
    const o = orientSoup(b, [1, 0, 0, 0, 0, -1, 0, 1, 0]);
    let lo = Infinity, hi = -Infinity;
    for (let i = 2; i < o.length; i += 3) { lo = Math.min(lo, o[i]); hi = Math.max(hi, o[i]); }
    check("orient: a turned part lands on the bed at its new height", Math.abs(lo) < 1e-4 && Math.abs(hi - 20) < 1e-4, `${lo}..${hi}`);
    const r = await fizzcore(b, { orient: [1, 0, 0, 0, 0, -1, 0, 1, 0], bubbles: false }, { wasm });
    check("orient: the run uses the turned part", Math.abs(soupToManifold(wasm, r.part).boundingBox().max[2] - 20) < 1e-3);
  }
  {
    // fin HEIGHT: auto stops a little above the centre of mass; full goes up
    const tallBox = manifoldToSoup(wasm.Manifold.cube([30, 20, 50]));
    const auto = await fizzcore(tallBox, { tilt: 45, tiltToward: "-x", bubbles: false, fins: { side: "auto", count: 3 } }, { wasm });
    const full = await fizzcore(tallBox, { tilt: 45, tiltToward: "-x", bubbles: false, fins: { side: "auto", count: 3, height: "full" } }, { wasm });
    const partH = soupToManifold(wasm, auto.part).boundingBox().max[2];
    const hA = Math.max(...auto.stats.fins.map((f) => f.height)), hF = Math.max(...full.stats.fins.map((f) => f.height));
    check("auto fin height stops well short of the top (the box holds itself up)", hA < partH * 0.75, `${hA} of ${partH.toFixed(0)}`);
    check("full fin height reaches the top", hF > partH * 0.9, `${hF} of ${partH.toFixed(0)}`);
    // (on this box auto lands right at the top of its leaning face, so it
    // drops only the sliver along the top face that a box never needed)
    check("auto fins never weigh more than full ones", auto.stats.gramsFins <= full.stats.gramsFins + 1e-6,
      `${auto.stats.gramsFins.toFixed(1)} g vs ${full.stats.gramsFins.toFixed(1)} g`);
    const custom = await fizzcore(tallBox, { tilt: 45, tiltToward: "-x", bubbles: false, fins: { side: "auto", count: 3, height: 15 } }, { wasm });
    check("a custom fin height in mm is honoured", Math.max(...custom.stats.fins.map((f) => f.height)) <= 15.5);
    check("auto fins still have pokes", auto.stats.fins.every((f) => f.teeth >= 1), auto.stats.fins.map((f) => f.teeth).join());
    // pokes are tiny: every fin piece is a slim plate, and the poke gap holds
    const part = soupToManifold(wasm, auto.part), fins = soupToManifold(wasm, auto.fins);
    check("poke gap: tips stop ~0.2 mm short", part.minGap(fins, 3) >= 0.18 && part.minGap(fins, 3) < 0.35, part.minGap(fins, 3).toFixed(3));
    const touch = await fizzcore(tallBox, { tilt: 45, tiltToward: "-x", bubbles: false, fins: { side: "auto", count: 3, clearance: 0 } }, { wasm });
    const tg = soupToManifold(wasm, touch.part).minGap(soupToManifold(wasm, touch.fins), 3);
    check("poke gap 0: tips just touch (a hair, never fused)", tg < 0.06 && soupToManifold(wasm, touch.fins).intersect(soupToManifold(wasm, touch.part)).volume() < 1e-6, tg.toFixed(3));
  }
  {
    // advanced fin settings: spacing overrides count, thickness in lines, distance from model
    const longBox = manifoldToSoup(wasm.Manifold.cube([30, 80, 40]));
    const base = { tilt: 45, tiltToward: "-x", bubbles: false };
    const sp = await fizzcore(longBox, { ...base, fins: { side: "-x", count: 3, spacing: 10 } }, { wasm });
    check("space between fins: a 10 mm gap on an ~80 mm side makes ~8 fins", sp.stats.fins.length >= 7 && sp.stats.fins.length <= 9, `${sp.stats.fins.length}`);
    const thin = await fizzcore(longBox, { ...base, fins: { side: "-x", count: 3, lines: 2 } }, { wasm });
    const thick = await fizzcore(longBox, { ...base, fins: { side: "-x", count: 3, lines: 4 } }, { wasm });
    check("fin thickness in lines: 4 lines weigh about twice 2 lines", thick.stats.gramsFins / thin.stats.gramsFins > 1.6 && thick.stats.gramsFins / thin.stats.gramsFins < 2.4,
      `${thin.stats.gramsFins.toFixed(2)} g vs ${thick.stats.gramsFins.toFixed(2)} g`);
    const far = await fizzcore(longBox, { ...base, fins: { side: "-x", count: 3, gap: 2, teethEvery: 0 } }, { wasm });
    const g = soupToManifold(wasm, far.part).minGap(soupToManifold(wasm, far.fins), 5);
    check("distance from model: no pokes, the fin stands ~2 mm off", g > 1.5 && g < 2.3, g.toFixed(2));
  }
  const plumb = await fizzcore(tall, { bubbles: false, fins: { side: "-x", count: 3 } }, { wasm });
  check("an upright wall gets plumb fins", plumb.stats.fins.every((f) => f.lean === 0), plumb.stats.fins.map((f) => f.lean).join());
  const r = await fizzcore(tall, { tilt: 45, bubbles: false }, { wasm });
  check("bubbles: false leaves the part solid", r.stats.bubbles === 0 && Math.abs(r.stats.saved) < 1e-6);
  const both = await fizzcore(tall, { tilt: 45, tiltToward: "-x", fins: { side: "auto" } }, { wasm });
  check("bubbles and tilt together: closed solid with bubbles", both.stats.bubbles > 0 && soupToManifold(wasm, both.part).volume() > 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
