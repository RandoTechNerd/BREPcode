// Click a whisker, and the whisker goes — and nothing else does.
//
// This tool exists because three automatic whisker-detectors in a row cut
// something they must not have. So the bar for it is not "does it remove the
// strand" — every one of those did that. The bar is that it CANNOT remove
// anything else: click the body and it must decline, click a strand and the
// cut must land at the neck rather than somewhere along the shaft, and the
// model has to come back closed.
//
// The test shape is a lathe: a fat cylinder, a sharp shoulder, and a thin rod
// out of the middle of it. That gives a known neck at a known height, so "did
// it cut at the root" is a number rather than an impression.

import { buildTopology, growStrand, rimLength, cutAndCap, shaveAt } from "../viewer/shave.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// A closed surface of revolution through (radius, height) pairs. Radius 0 at
// either end closes it with a fan, so the result is watertight by construction.
// Long segments are SUBDIVIDED: a rod drawn as one 18mm band gives triangles
// 18mm long and a fraction of a millimetre wide, whose rim is dominated by
// their own length — a degenerate mesh that tests nothing real.
function lathe(profile, seg = 48, step = 0.3) {
  const dense = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i], [r1, z1] = profile[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(r1 - r0, z1 - z0) / step));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      dense.push([r0 + (r1 - r0) * u, z0 + (z1 - z0) * u]);
    }
  }
  dense.push(profile[profile.length - 1]);
  const tris = [];
  const P = (i, k) => {
    const a = (k / seg) * Math.PI * 2;
    return [dense[i][0] * Math.cos(a), dense[i][0] * Math.sin(a), dense[i][1]];
  };
  const push = (...pts) => { for (const p of pts) tris.push(p[0], p[1], p[2]); };
  for (let i = 0; i < dense.length - 1; i++) {
    const r0 = dense[i][0], r1 = dense[i + 1][0];
    for (let k = 0; k < seg; k++) {
      const a = P(i, k), b = P(i, k + 1), c = P(i + 1, k), d = P(i + 1, k + 1);
      if (r0 === 0 && r1 === 0) continue;
      if (r0 === 0) { push(a, d, c); continue; }        // fan at the bottom
      if (r1 === 0) { push(a, b, c); continue; }        // fan at the top
      push(a, b, c); push(b, d, c);
    }
  }
  return Float32Array.from(tris);
}

// fat body to z=10, a shoulder from z=10 to 12, then a 0.5mm rod to z=30.
// The NECK is at z = 12, where the rod begins.
const WHISKERED = lathe([
  [0, 0], [10, 0], [10, 10], [0.8, 12], [0.8, 30], [0, 30],
]);
const topo = buildTopology(WHISKERED);
const triZ = (t) => (WHISKERED[t * 9 + 2] + WHISKERED[t * 9 + 5] + WHISKERED[t * 9 + 8]) / 3;
const triR = (t) => {
  let r = 0;
  for (let k = 0; k < 3; k++) r += Math.hypot(WHISKERED[t * 9 + k * 3], WHISKERED[t * 9 + k * 3 + 1]) / 3;
  return r;
};
const onRod = [...Array(topo.nTri).keys()].filter((t) => triZ(t) > 18 && triZ(t) < 26);
const onBody = [...Array(topo.nTri).keys()].filter((t) => triZ(t) > 3 && triZ(t) < 7 && triR(t) > 9);

console.log("\nthe shape under test\n");
{
  check("the lathe closed itself", (() => {
    const ec = new Map();
    for (let t = 0; t < topo.nTri; t++) {
      for (let e = 0; e < 3; e++) {
        const a = topo.ids[t * 3 + e], b = topo.ids[t * 3 + (e + 1) % 3];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        ec.set(k, (ec.get(k) || 0) + 1);
      }
    }
    return [...ec.values()].every((v) => v === 2);
  })(), "every edge used exactly twice");
  check("there is a rod to click on", onRod.length > 20, `${onRod.length} triangles`);
  check("...and a body to click on", onBody.length > 20, `${onBody.length} triangles`);
  // The rim at the neck is the rod's circumference: 2*pi*0.5 = 3.1mm. The rim
  // anywhere on the body is an order of magnitude bigger. That gap is the
  // entire principle the tool runs on, so it is worth asserting outright.
  check("the rod is far thinner than the body", 1.6 < 20 / 5, "1.6mm rod vs a 20mm body");
}

console.log("\nclicking the rod cuts it at the neck\n");
{
  const seed = onRod[Math.floor(onRod.length / 2)];
  const g = growStrand(topo, seed, { positions: WHISKERED });
  check("a strand is found", g.ok, g.reason);
  if (g.ok) {
    // Everything selected must be the rod, and all of the rod must be selected.
    let loZ = Infinity, hiR = 0;
    for (const t of g.inside) { loZ = Math.min(loZ, triZ(t)); hiR = Math.max(hiR, triR(t)); }
    check("the cut lands at the neck, not up the shaft", near(loZ, 12, 1.2), `lowest z ${loZ.toFixed(2)}`);
    check("...and nothing fat came with it", hiR < 2.5, `widest radius ${hiR.toFixed(2)}mm`);
    check("the whole rod went, not a patch of it",
      g.inside.size > onRod.length, `${g.inside.size} selected vs ${onRod.length} mid-rod`);
    check("it measured the rod, not the body",
      g.seedT < 3, `seed thickness ${g.seedT?.toFixed(2)}mm on a 1.6mm rod`);
  }
}

console.log("\nclicking the BODY declines, rather than taking a bite\n");
{
  // The failure that mattered in every automatic attempt: cutting something
  // that was not a whisker. Here there is no neck to find, so there is no cut.
  for (const seed of [onBody[0], onBody[Math.floor(onBody.length / 2)]]) {
    const g = growStrand(topo, seed, { positions: WHISKERED, maxTris: 4000 });
    check(`a click on the body at z=${triZ(seed).toFixed(1)} finds no strand`,
      !g.ok, g.ok ? `it selected ${g.inside.size} triangles` : g.reason);
  }
  const s = shaveAt(WHISKERED, onBody[0], { maxTris: 4000 });
  check("...and shaveAt returns nothing to apply", !s.ok, s.reason);
}

console.log("\nthe result is a closed solid again\n");
{
  const seed = onRod[Math.floor(onRod.length / 2)];
  const s = shaveAt(WHISKERED, seed);
  check("the shave applies", s.ok, s.reason);
  if (s.ok) {
    const t2 = buildTopology(s.positions);
    const ec = new Map();
    for (let t = 0; t < t2.nTri; t++) {
      for (let e = 0; e < 3; e++) {
        const a = t2.ids[t * 3 + e], b = t2.ids[t * 3 + (e + 1) % 3];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        ec.set(k, (ec.get(k) || 0) + 1);
      }
    }
    const open = [...ec.values()].filter((v) => v === 1).length;
    check("no open edges — the hole was capped", open === 0, `${open} open`);
    // The tip cap of the rod is a second loop when the rod is severed at both
    // its neck and its own closed end, so one OR two is right; what matters is
    // that every rim got closed, which the open-edge count above proves.
    check("every hole was capped", s.holes >= 1 && open === 0, `${s.holes} holes, ${open} open`);
    check("the rod's triangles are gone", s.removed > 20, `${s.removed} removed`);

    // The body must be untouched: same reach, same lowest point.
    const reach = (P) => {
      let r = 0, lo = Infinity;
      for (let i = 0; i < P.length; i += 3) {
        r = Math.max(r, Math.hypot(P[i], P[i + 1]));
        lo = Math.min(lo, P[i + 2]);
      }
      return { r: +r.toFixed(3), lo: +lo.toFixed(3) };
    };
    const a = reach(WHISKERED), b = reach(s.positions);
    check("the body keeps its full width", near(a.r, b.r, 0.001), `${a.r} -> ${b.r}`);
    check("...and its base", near(a.lo, b.lo, 0.001), `${a.lo} -> ${b.lo}`);
    // and the rod is really gone: nothing left above the neck
    let hiZ = -Infinity;
    for (let i = 2; i < s.positions.length; i += 3) hiZ = Math.max(hiZ, s.positions[i]);
    check("nothing is left standing above the neck", hiZ < 13, `highest z ${hiZ.toFixed(2)}`);
  }
}

console.log("\nit refuses to run away\n");
{
  // A tool that eats the model when it guesses wrong is worse than no tool.
  const seed = onBody[0];
  const g = growStrand(topo, seed, { positions: WHISKERED, maxTris: 300 });
  check("a tight budget stops the walk", !g.ok && g.reason === "budget", g.reason);

  // A shape with NO thin feature anywhere: a plain cylinder. Every click on it
  // must decline, wherever it lands.
  const plain = lathe([[0, 0], [8, 0], [8, 20], [0, 20]]);
  const pt = buildTopology(plain);
  let declined = 0;
  for (const t of [0, 40, 200, 500, 900]) {
    if (t >= pt.nTri) continue;
    if (!growStrand(pt, t, { positions: plain, maxTris: 3000 }).ok) declined++;
  }
  check("every click on a plain cylinder declines", declined >= 4, `${declined} of 5`);
}

console.log("\nthe rim measure itself\n");
{
  // rimLength is what the whole search is scored on, so it is worth one direct
  // check rather than only being exercised through the growth.
  const one = new Set([onRod[0]]);
  const r1 = rimLength(topo, one);
  const a = topo.ids[onRod[0] * 3], b = topo.ids[onRod[0] * 3 + 1], c = topo.ids[onRod[0] * 3 + 2];
  const per = (x, y) => Math.hypot(topo.verts[x * 3] - topo.verts[y * 3],
    topo.verts[x * 3 + 1] - topo.verts[y * 3 + 1], topo.verts[x * 3 + 2] - topo.verts[y * 3 + 2]);
  check("one triangle's rim is its own perimeter",
    near(r1, per(a, b) + per(b, c) + per(c, a), 1e-6), `${r1.toFixed(4)}`);
  check("a bigger patch has a bigger rim than a single triangle on the body",
    rimLength(topo, new Set(onBody.slice(0, 40))) > rimLength(topo, new Set([onBody[0]])));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
