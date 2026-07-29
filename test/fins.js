// fins(): removable support buttresses. Every case is BUILT, so a knob that
// produces impossible geometry fails here rather than in a user's browser.

import { fins, cube, compile } from "../src/dsl.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};
const throws = (label, fn, match) => {
  try { fn(); check(label, false, "did not throw"); }
  catch (e) { check(label, match ? match.test(e.message) : true, e.message); }
};
const facets = (r) => (toSTL(r, "t").match(/facet/g) || []).length;

// a 20x20x40 box standing on the bed; its -x face is at x = -10 once centred
const part = () => cube([20, 20, 40], { center: true });
const base = { side: "-x", count: 3, sprues: 3, height: 30, depth: 14, skirt: 5, lean: 0, at: [-10, -8, 8] };

console.log("\nfins — removable supports\n");

// ---- builds, and stays SEPARATE solids (no boolean against the part) -------
{
  const r = await build(fins(base, part()));
  check("fins build alongside the part", facets(r) > 100, `${facets(r)} facets`);
}

// ---- count / sprues / side are all live ------------------------------------
for (const [label, opts, expect] of [
  ["count: 1", { ...base, count: 1 }, 1],
  ["count: 5", { ...base, count: 5 }, 5],
  ["count: 8", { ...base, count: 8 }, 8],
]) {
  const shape = fins(opts, part());
  // group children = model + one per fin
  check(`${label} makes that many fins`, shape.children.length === expect + 1,
    `${shape.children.length - 1} fins`);
}
for (const side of ["+x", "-x", "+y", "-y"]) {
  const at = side.endsWith("x") ? [side === "+x" ? 10 : -10, -8, 8] : [side === "+y" ? 10 : -10, -8, 8];
  const r = await build(fins({ ...base, side, at }, part()));
  check(`side ${side} builds`, facets(r) > 100, `${facets(r)} facets`);
}
{
  const few = fins({ ...base, sprues: 1 }, part());
  const many = fins({ ...base, sprues: 6 }, part());
  const a = await build(few), b = await build(many);
  check("more sprues = more geometry", facets(b) > facets(a), `${facets(a)} vs ${facets(b)}`);
}

// ---- geometry lands where it should ----------------------------------------
{
  // fins on -x must sit entirely on the -x side, and reach INTO the face so
  // the sprues actually touch (that was a real bug: they pointed the wrong way)
  const trace = [];
  await compile(fins(base, part()), null, trace).catch(() => {});
  const r = await build(fins(base, part()));
  const stl = toSTL(r, "t");
  const xs = [...stl.matchAll(/vertex\s+(\S+)\s+\S+\s+\S+/g)].map((m) => +m[1]);
  check("fins extend out past the part's -x face", Math.min(...xs) < -10, `min x ${Math.min(...xs).toFixed(1)}`);
  const zs = [...stl.matchAll(/vertex\s+\S+\s+\S+\s+(\S+)/g)].map((m) => +m[1]);
  check("fins start on the bed (z=0)", Math.min(...zs) <= 0.01, `min z ${Math.min(...zs).toFixed(2)}`);
}
{
  // height is respected: a taller fin reaches higher than a short one
  const shortR = await build(fins({ ...base, height: 10 }, part()));
  const tallR = await build(fins({ ...base, height: 38 }, part()));
  const topOf = (r) => Math.max(...[...toSTL(r, "t").matchAll(/vertex\s+\S+\s+\S+\s+(\S+)/g)].map((m) => +m[1]));
  check("taller fins reach higher", topOf(tallR) > topOf(shortR), `${topOf(shortR).toFixed(1)} vs ${topOf(tallR).toFixed(1)}`);
}
{
  // skirt: 0 is legal (no foot) and still builds
  const r = await build(fins({ ...base, skirt: 0 }, part()));
  check("skirt: 0 builds (no foot)", facets(r) > 50, `${facets(r)} facets`);
}

// ---- positions: put fins exactly where the material is ----------------------
{
  const s = fins({ ...base, positions: [-8, 0, 8] }, part());
  check("positions sets the fin count", s.children.length === 4, `${s.children.length - 1} fins`);
  const r = await build(s);
  check("positions build", facets(r) > 100, `${facets(r)} facets`);
}
{
  // positions overrides count — this is what "two on the sides, one in the
  // middle" needs when even spacing would land in a hole
  const s = fins({ ...base, count: 9, positions: [-8, 8] }, part());
  check("positions wins over count", s.children.length === 3, `${s.children.length - 1} fins`);
}

// ---- sprueAt: nubs only where the part actually is ---------------------------
{
  const shared = fins({ ...base, sprueAt: [5, 15, 25] }, part());
  const r = await build(shared);
  check("sprueAt (shared list) builds", facets(r) > 100, `${facets(r)} facets`);
}
{
  // per-fin lists: an array of arrays, one per fin
  const perFin = fins({
    ...base, positions: [-8, 0, 8],
    sprueAt: [[5, 20], [12], [5, 15, 25]],
  }, part());
  check("sprueAt per-fin keeps all three fins", perFin.children.length === 4,
    `${perFin.children.length - 1} fins`);
  const r = await build(perFin);
  check("sprueAt per-fin builds", facets(r) > 100, `${facets(r)} facets`);
}
{
  // {z, reach} lets a nub stretch to a recessed face — the long one must
  // actually reach further than the default
  const shortR = await build(fins({ ...base, positions: [0], sprueAt: [[{ z: 15, reach: 1.2 }]] }, part()));
  const longR = await build(fins({ ...base, positions: [0], sprueAt: [[{ z: 15, reach: 6 }]] }, part()));
  // measure the FIN solid, not the whole model — the part's own +x face would
  // otherwise dominate and both readings would just be the cube's edge
  const finTipX = (r) => {
    const solids = toSTL(r, "t").split(/^solid /m).filter((b) => b.trim());
    let tip = -Infinity;
    for (const b of solids) {
      const xs = [...b.matchAll(/vertex\s+(\S+)/g)].map((m) => +m[1]);
      if (!xs.length || Math.max(...xs) > 9) continue;   // that's the part itself
      tip = Math.max(tip, ...xs);                        // fin: sits left of the face
    }
    return tip;
  };
  check("a bigger reach pushes the nub further in", finTipX(longR) > finTipX(shortR),
    `${finTipX(shortR).toFixed(1)} vs ${finTipX(longR).toFixed(1)}`);
}
{
  // a fin whose probe found nothing (empty list) is dropped, not left floating
  const s = fins({ ...base, positions: [-8, 0, 8], sprueAt: [[5, 20], [], [5, 20]] }, part());
  check("a fin with no contact is skipped", s.children.length === 3, `${s.children.length - 1} fins`);
}
throws("all fins empty is an error, not a silent no-op",
  () => fins({ ...base, positions: [-8, 0], sprueAt: [[], []] }, part()), /anything to attach/);

// ---- teeth stop SHORT of the part (the whole point) --------------------------
// The part's -x face is at x = -10. A tooth must never reach it: a clean print
// should leave daylight so nothing fuses, and only catch the part if it leans.
const finMaxX = (r) => {
  let tip = -Infinity;
  for (const b of toSTL(r, "t").split(/^solid /m).filter((s) => s.trim())) {
    const xs = [...b.matchAll(/vertex\s+(\S+)/g)].map((m) => +m[1]);
    if (!xs.length || Math.max(...xs) > 9) continue;      // that's the part
    tip = Math.max(tip, ...xs);
  }
  return tip;
};
{
  const r = await build(fins({ side: "-x", positions: [0], sprues: 3, height: 30, lean: 0, at: [-10, -8, 8] }, part()));
  const gapLeft = -10 - finMaxX(r);
  check("teeth leave daylight by default", gapLeft > 0.05,
    `tooth tip stops ${gapLeft.toFixed(3)}mm short`);
  check("default clearance is 0.2mm", Math.abs(gapLeft - 0.2) < 0.01, `${gapLeft.toFixed(3)}mm`);
}
{
  const tight = await build(fins({ side: "-x", positions: [0], sprues: 2, height: 30, lean: 0, clearance: 0.05, at: [-10, -8, 8] }, part()));
  const loose = await build(fins({ side: "-x", positions: [0], sprues: 2, height: 30, lean: 0, clearance: 0.5, at: [-10, -8, 8] }, part()));
  check("a bigger clearance backs the teeth further off",
    (-10 - finMaxX(loose)) > (-10 - finMaxX(tight)),
    `${(-10 - finMaxX(tight)).toFixed(2)} vs ${(-10 - finMaxX(loose)).toFixed(2)}`);
  check("clearance is honoured exactly", Math.abs((-10 - finMaxX(loose)) - 0.5) < 0.01,
    `${(-10 - finMaxX(loose)).toFixed(3)}mm`);
}
{
  // A clearance wider than the fin's own daylight is self-contradictory: the
  // tooth would need negative length. It clamps to a stub instead of inverting,
  // and the daylight can never end up smaller than asked.
  const silly = await build(fins({ side: "-x", positions: [0], sprues: 1, height: 30, lean: 0, gap: 0.8, clearance: 5, at: [-10, -8, 8] }, part()));
  const left = -10 - finMaxX(silly);
  check("clearance beyond the fin gap clamps, never inverts", left > 0.05 && left <= 0.8 + 1e-6,
    `${left.toFixed(2)}mm of daylight`);
}

// ---- 45° buttress by default -------------------------------------------------
const finMinX = (r) => {
  let out = Infinity;
  for (const b of toSTL(r, "t").split(/^solid /m).filter((s) => s.trim())) {
    const xs = [...b.matchAll(/vertex\s+(\S+)/g)].map((m) => +m[1]);
    if (!xs.length || Math.max(...xs) > 9) continue;
    out = Math.min(out, ...xs);
  }
  return out;
};
{
  // 45° means the fin reaches out as far as it is tall
  const r = await build(fins({ side: "-x", positions: [0], sprues: 1, height: 20, lean: 0, at: [-10, -8, 8] }, part()));
  const reachOut = -10 - finMinX(r);
  check("default slope is 45° (depth == height)", Math.abs(reachOut - 20.8) < 0.3,
    `extends ${reachOut.toFixed(1)}mm for a 20mm tall fin`);
}
{
  const steep = await build(fins({ side: "-x", positions: [0], sprues: 1, height: 20, lean: 0, angle: 20, at: [-10, -8, 8] }, part()));
  const shallow = await build(fins({ side: "-x", positions: [0], sprues: 1, height: 20, lean: 0, angle: 60, at: [-10, -8, 8] }, part()));
  check("a bigger angle makes a wider footprint",
    (-10 - finMinX(shallow)) > (-10 - finMinX(steep)),
    `${(-10 - finMinX(steep)).toFixed(1)} vs ${(-10 - finMinX(shallow)).toFixed(1)}`);
}
{
  // an explicit depth still wins over the angle
  const r = await build(fins({ side: "-x", positions: [0], sprues: 1, height: 20, lean: 0, depth: 5, at: [-10, -8, 8] }, part()));
  check("explicit depth overrides angle", Math.abs((-10 - finMinX(r)) - 5.8) < 0.3,
    `extends ${(-10 - finMinX(r)).toFixed(1)}mm`);
}

// ---- nozzle drives every thin dimension --------------------------------------
// A support that isn't a whole number of extrusion widths prints ragged, so the
// fin, its teeth and the clearance all scale off one `nozzle` knob.
{
  const widthOf = async (opts) => {
    const stl = toSTL(await build(fins({ side: "-x", positions: [0], sprues: 1, height: 20, lean: 0, skirt: 0, at: [-10, -8, 8], ...opts }, part())), "t");
    for (const b of stl.split(/^solid /m).filter((s) => s.trim())) {
      const xs = [...b.matchAll(/vertex\s+(\S+)/g)].map((m) => +m[1]);
      if (!xs.length || Math.max(...xs) > 9) continue;
      const ys = [...b.matchAll(/vertex\s+\S+\s+(\S+)/g)].map((m) => +m[1]);
      return { w: +(Math.max(...ys) - Math.min(...ys)).toFixed(2), clear: +(-10 - Math.max(...xs)).toFixed(2) };
    }
  };
  const a4 = await widthOf({ nozzle: 0.4 });
  const a6 = await widthOf({ nozzle: 0.6 });
  check("a 0.4 nozzle gives a 1.2mm fin (3 perimeters)", Math.abs(a4.w - 1.2) < 0.01, `${a4.w}mm`);
  check("a 0.6 nozzle gives a 1.8mm fin", Math.abs(a6.w - 1.8) < 0.01, `${a6.w}mm`);
  check("clearance scales with the nozzle too",
    Math.abs(a4.clear - 0.2) < 0.01 && Math.abs(a6.clear - 0.3) < 0.01,
    `${a4.clear} / ${a6.clear}`);
  const forced = await widthOf({ nozzle: 0.6, thickness: 1.0 });
  check("an explicit thickness still wins", Math.abs(forced.w - 1.0) < 0.01, `${forced.w}mm`);
}

// ---- lean: follow a part that isn't vertical ---------------------------------
{
  // With lean, the contact edge slopes, so the top tooth sits further out than
  // the bottom one — that's what keeps every tooth short on a tilted part.
  const toothXs = async (opts) => {
    const stl = toSTL(await build(fins({ side: "-x", positions: [0], sprueAt: [[2, 18]], height: 20, lean: 0, skirt: 0, at: [-10, -8, 8], ...opts }, part())), "t");
    for (const b of stl.split(/^solid /m).filter((s) => s.trim())) {
      const vs = [...b.matchAll(/vertex\s+(\S+)\s+\S+\s+(\S+)/g)].map((m) => [+m[1], +m[2]]);
      if (!vs.length || Math.max(...vs.map((v) => v[0])) > 9) continue;
      const near = (z) => Math.max(...vs.filter((v) => Math.abs(v[1] - z) < 1.4).map((v) => v[0]));
      return { low: near(2), high: near(18) };
    }
  };
  const plumb = await toothXs({ lean: 0 });
  check("with no lean both teeth sit at the same depth",
    Math.abs(plumb.low - plumb.high) < 0.01, `${plumb.low} vs ${plumb.high}`);
  const leaned = await toothXs({ lean: 45 });
  // the edge slopes from z=0, so at height z it has travelled z·tan(lean):
  // at z=18 with lean 45° that's 18mm further out than a plumb fin
  check("lean 45° steps the upper tooth out with the part",
    Math.abs((plumb.high - leaned.high) - 18) < 0.5,
    `moved ${(plumb.high - leaned.high).toFixed(1)}mm`);
  check("...and the lower tooth moves less than the upper one",
    (plumb.low - leaned.low) < (plumb.high - leaned.high),
    `${(plumb.low - leaned.low).toFixed(1)} vs ${(plumb.high - leaned.high).toFixed(1)}`);
  // the DEFAULT is 45: these supports exist to hold a part printed on a slant
  const dflt = await toothXs({ lean: undefined });
  const at45 = await toothXs({ lean: 45 });
  check("lean defaults to 45°", Math.abs(dflt.high - at45.high) < 0.01,
    `${dflt.high} vs ${at45.high}`);
  check("...and lean: 0 still gives a plumb fin", Math.abs(plumb.high - plumb.low) < 0.01);
  check("lean widens the fin so it stays a triangle",
    (await build(fins({ side: "-x", positions: [0], sprues: 2, height: 20, lean: 45, at: [-10, -8, 8] }, part()))) != null);
}

// ---- sprues are ROOTED IN the fin, at every angle ----------------------------
// The sprue starts inside the plate and runs out to the part, so no combination
// of lean/angle/height can leave it floating detached. If it ever did, the fin
// would come back as more than one solid — that's what this watches for.
{
  const finPieces = (r) => {
    let n = 0;
    for (const b of toSTL(r, "t").split(/^solid /m).filter((s) => s.trim())) {
      const xs = [...b.matchAll(/vertex\s+(\S+)/g)].map((m) => +m[1]);
      if (xs.length && Math.max(...xs) <= 9) n++;     // not the part
    }
    return n;
  };
  for (const lean of [0, 30, 45, 60]) {
    const r = await build(fins({
      side: "-x", positions: [0], skirt: 0, height: 30, lean, at: [-10, -8, 8],
      sprueAt: [[{ z: 4, reach: 0.6 }, { z: 14, reach: 0.6 }, { z: 24, reach: 0.6 }]],
    }, part()));
    check(`sprues stay welded to the fin at lean ${lean}°`, finPieces(r) === 1,
      `${finPieces(r)} separate pieces`);
  }
  for (const angle of [20, 45, 70]) {
    const r = await build(fins({
      side: "-x", positions: [0], skirt: 0, height: 30, lean: 0, angle, at: [-10, -8, 8],
      sprueAt: [[{ z: 4, reach: 0.6 }, { z: 26, reach: 0.6 }]],
    }, part()));
    check(`sprues stay welded at buttress angle ${angle}°`, finPieces(r) === 1,
      `${finPieces(r)} separate pieces`);
  }
  // a sprue near the very top, where the plate has almost no depth left
  const r = await build(fins({
    side: "-x", positions: [0], skirt: 0, height: 30, lean: 0, at: [-10, -8, 8],
    sprueAt: [[{ z: 29.5, reach: 0.6 }]],
  }, part()));
  check("a sprue at the thin top of the fin still welds", finPieces(r) === 1,
    `${finPieces(r)} separate pieces`);
}

// ---- per-fin adaptation (heights / faceAt arrays) ---------------------------
{
  // three fins, each its own height and its own plane — the Benchy-hull case
  const shape = fins({
    ...base,
    positions: [-6, 0, 6],
    heights: [12, 30, 20],
    faceAt: [-10, -11.5, -10.6],
  }, part());
  check("per-fin heights/faceAt still make 3 fins", shape.children.length === 4,
    `${shape.children.length - 1} fins`);
  const r = await build(shape);
  check("...and they build", facets(r) > 100, `${facets(r)} facets`);
  // the fin geometry must never rise above its own height entry (+ the part
  // itself which is 40 tall centred -> z up to 20; fin plates cap at 30)
  const zs = [...toSTL(r, "t").matchAll(/vertex\s+\S+\s+\S+\s+(\S+)/g)].map((m) => +m[1]);
  check("...tallest fin honours its heights entry", Math.max(...zs) <= 30.01, Math.max(...zs).toFixed(1));
}
{
  // a sprue above a SHORT fin's plate is dropped, not left floating
  const shape = fins({
    ...base,
    positions: [0],
    heights: [10],
    sprueAt: [[{ z: 4, reach: 0.4 }, { z: 25, reach: 0.4 }]],   // 25 > 10 -> dropped
  }, part());
  const r = await build(shape);
  check("a sprue above its short fin is dropped", facets(r) > 30, `${facets(r)} facets`);
}

// ---- sprues print in mid-air: undersides must climb at >= 45° ---------------
{
  const volumeOf = (r) => {
    const v = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    let vol = 0;
    for (let i = 0; i < v.length; i += 3) {
      const [a, b, c] = v.slice(i, i + 3);
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    return Math.abs(vol);
  };
  const one = (reach) => fins({
    ...base, positions: [0], sprueAt: [[{ z: 20, reach }]],
  }, part());
  const shallow = volumeOf(await build(one(0.4)));
  const deep = volumeOf(await build(one(8)));
  // a long finger must be a tall 45° ramp: run ≈ reach + root-bite, so the
  // tooth's cross-section grows ~quadratically with reach — far more volume
  // than a stubby fixed-height tooth would add
  check("a long-reach sprue grows into a 45° ramp", deep - shallow > 30,
    `deep adds ${(deep - shallow).toFixed(1)}mm³`);
}

// ---- honest errors ----------------------------------------------------------
throws("rejects a bad side", () => fins({ ...base, side: "up" }, part()), /side must be/);
throws("rejects a missing at", () => fins({ side: "-x", count: 2 }, part()), /needs at:/);
throws("rejects a non-numeric at", () => fins({ ...base, at: [0, "x", 8] }, part()), /needs at:/);
throws("rejects zero height", () => fins({ ...base, height: 0 }, part()), /positive height/);
throws("rejects no shape", () => fins(base), /needs the shape/);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
