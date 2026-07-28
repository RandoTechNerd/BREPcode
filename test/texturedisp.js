// Real displacement textures: the pattern must survive into exported geometry,
// and — the part that matters for printing — the displaced shell must stay
// WATERTIGHT. Volume is measured from the exported STL, never trusted.

import { build, toSTL } from "../index.js";
import { cube, cylinder, texture, heightmap, displacedPositions, TEXTURE_PATTERNS } from "../src/dsl.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function soupOf(r) {
  return [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)]
    .map((m) => [+m[1], +m[2], +m[3]]);
}
function volumeOf(r) {
  const v3 = soupOf(r);
  let v = 0;
  for (let i = 0; i < v3.length; i += 3) {
    const [a, b, c] = [v3[i], v3[i + 1], v3[i + 2]];
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(v);
}
function boundsOf(r) {
  const p = soupOf(r);
  const ax = (i) => [Math.min(...p.map((q) => q[i])), Math.max(...p.map((q) => q[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}

// every undirected edge of a closed shell is shared by exactly two triangles
function isWatertight(flat) {
  const edges = new Map();
  const key = (x, y, z) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  for (let i = 0; i < flat.length; i += 9) {
    const k = [0, 3, 6].map((o) => key(flat[i + o], flat[i + o + 1], flat[i + o + 2]));
    for (let e = 0; e < 3; e++) {
      const ek = [k[e], k[(e + 1) % 3]].sort().join("|");
      edges.set(ek, (edges.get(ek) || 0) + 1);
    }
  }
  return [...edges.values()].every((n) => n === 2);
}

// a 10mm cube as a 12-triangle soup, corner at origin
function cubeSoup(s = 10) {
  const q = (a, b, c, d) => [a, b, c, a, c, d];
  const P = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]];
  const faces = [
    q(P[0], P[3], P[2], P[1]),          // bottom (wound to face -z)
    q(P[4], P[5], P[6], P[7]),          // top
    q(P[0], P[1], P[5], P[4]),          // -y
    q(P[2], P[3], P[7], P[6]),          // +y
    q(P[0], P[4], P[7], P[3]),          // -x
    q(P[1], P[2], P[6], P[5]),          // +x
  ];
  return Float64Array.from(faces.flat(2));
}

console.log("\nDisplacement textures\n");

// ---- pure pipeline (no kernel) -------------------------------------------
{
  const base = cubeSoup(10);
  check("the raw cube soup is watertight (sanity)", isWatertight(base));
  for (const pattern of TEXTURE_PATTERNS) {
    const out = displacedPositions(base, { pattern, depth: 0.6, scale: 2.5, faces: "sides", maxTris: 24000 });
    check(`${pattern}: displaced shell stays watertight`, isWatertight(out));
    check(`${pattern}: geometry actually got finer`, out.length > base.length, `${out.length / 9} tris`);
  }
}
{
  // displacement is outward-only, bounded by depth
  const out = displacedPositions(cubeSoup(10), { pattern: "knurl", depth: 0.8, scale: 2.5, faces: "sides", maxTris: 24000 });
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < out.length; i += 3) { minX = Math.min(minX, out[i]); maxX = Math.max(maxX, out[i]); }
  check("knurl pushes OUT, never in", minX >= -0.81 && minX <= 0.01 && maxX >= 9.99 && maxX <= 10.81,
    `x span ${minX.toFixed(2)}..${maxX.toFixed(2)}`);
}
{
  // faces: "sides" leaves the top face flat
  const out = displacedPositions(cubeSoup(10), { pattern: "bumps", depth: 1, scale: 3, faces: "sides", maxTris: 24000 });
  let maxZ = -Infinity;
  for (let i = 2; i < out.length; i += 3) maxZ = Math.max(maxZ, out[i]);
  check('faces:"sides" leaves the top alone', maxZ <= 10.35, `top reached z=${maxZ.toFixed(2)}`);
}

// ---- heightmap ------------------------------------------------------------
{
  const w = 8, h = 8;
  const white = Buffer.from(new Uint8Array(w * h).fill(255)).toString("base64");
  const black = Buffer.from(new Uint8Array(w * h).fill(0)).toString("base64");
  const rw = await build(heightmap({ map: white, w, h, side: "+x", depth: 2 }, cube([10, 10, 10])));
  const rb = await build(heightmap({ map: black, w, h, side: "+x", depth: 2 }, cube([10, 10, 10])));
  const vw = volumeOf(rw), vb = volumeOf(rb);
  check("all-white map = no relief", near(vw, 1000, 15), `got ${vw.toFixed(1)}`);
  check("all-black map = full relief on that face", vb > vw + 50, `white ${vw.toFixed(0)} vs black ${vb.toFixed(0)}`);
  const bb = boundsOf(rb);
  check("...and only that face moved", near(bb.x[1], 12, 0.4) && near(bb.y[0], 0, 0.2) && near(bb.y[1], 10, 0.2),
    JSON.stringify(bb));
}

// ---- through the kernel ---------------------------------------------------
{
  const r = await build(texture({ pattern: "knurl", depth: 0.6, scale: 2.5 }, cube([20, 20, 10])));
  const v = volumeOf(r);
  check("knurled cube builds through the kernel", v > 0);
  check("...volume grew but stayed sane", v > 4000 && v < 4000 * 1.25, `got ${v.toFixed(1)}`);
  const bb = boundsOf(r);
  check("...within depth of the original bounds", bb.x[1] <= 20.65 && bb.z[1] <= 10.65, JSON.stringify(bb));
}
{
  const r = await build(texture({ pattern: "fuzzy", depth: 0.4, scale: 1.5 }, cylinder({ r: 8, h: 20, $fn: 48 })));
  check("fuzzy cylinder builds", volumeOf(r) > 0);
}

// ---- guard rails ----------------------------------------------------------
try {
  texture({ pattern: "sparkles" }, cube([10, 10, 10]));
  check("unknown pattern is refused", false);
} catch (e) {
  check("unknown pattern is refused", /sparkles/.test(e.message) && /knurl/.test(e.message), e.message);
}
try {
  heightmap({ side: "+x" }, cube([10, 10, 10]));
  check("heightmap without a map explains itself", false);
} catch (e) {
  check("heightmap without a map explains itself", /Photo emboss|map/.test(e.message), e.message);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
