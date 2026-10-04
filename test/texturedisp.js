// Real displacement textures: the pattern must survive into exported geometry,
// and — the part that matters for printing — the displaced shell must stay
// WATERTIGHT. Volume is measured from the exported STL, never trusted.

import { build, toSTL } from "../index.js";
import { cube, cylinder, sphere, difference, translate, texture, heightmap, displacedPositions, TEXTURE_PATTERNS } from "../src/dsl.js";
import { remeshForTexture } from "../src/texmesh.js";

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

// ---- wrapped label: heightmap side:"wrap" around a cylinder ---------------
//
// The can-label case: the image bends AROUND the model, displacing radially.
// What must hold: the relief lands on the wall (radius grows by ~depth where
// the image is dark), the caps stay put (their normals have no radial
// component), an arc-limited label leaves the far side untouched, and the
// shell survives the kernel.
{
  // left half black (stands out), right half white (flat): 4×4 grid
  const mapB64 = Buffer.from(new Uint8Array([
    0, 0, 255, 255,
    0, 0, 255, 255,
    0, 0, 255, 255,
    0, 0, 255, 255,
  ])).toString("base64");
  const r = await build(heightmap(
    { map: mapB64, w: 4, h: 4, side: "wrap", depth: 2 },
    cylinder({ r: 10, h: 20, $fn: 64 }),
  ));
  const pts = soupOf(r);
  const radii = pts.filter((p) => p[2] > 1 && p[2] < 19).map((p) => Math.hypot(p[0] - 0, p[1] - 0));
  check("wrap: the dark half of the label stands proud",
    Math.max(...radii) > 11.5, `max r ${Math.max(...radii).toFixed(2)}`);
  check("...and the white half stays at the wall",
    Math.min(...radii) > 9.4 && Math.min(...radii) < 10.3, `min r ${Math.min(...radii).toFixed(2)}`);
  const bb = boundsOf(r);
  check("...the caps don't move", near(bb.z[0], 0, 0.01) && near(bb.z[1], 20, 0.01), JSON.stringify(bb.z));
  check("...and it went through the kernel watertight", volumeOf(r) > Math.PI * 100 * 20 * 0.98);
}
{
  // a 90° label: three quarters of the can must be untouched
  const dark = Buffer.from(new Uint8Array(16).fill(0)).toString("base64");
  const r = await build(heightmap(
    { map: dark, w: 4, h: 4, side: "wrap", depth: 2, arc: 90, start: 0 },
    cylinder({ r: 10, h: 12, $fn: 96 }),
  ));
  const pts = soupOf(r).filter((p) => p[2] > 1 && p[2] < 11);
  // start 0, running rightward-from-outside = θ in [-90°, 0°]: x>0, y<0 quadrant
  const inLabel = pts.filter((p) => p[0] > 0 && p[1] < 0).map((p) => Math.hypot(p[0], p[1]));
  const offLabel = pts.filter((p) => p[0] < 0).map((p) => Math.hypot(p[0], p[1]));
  check("a 90° label raises its own quadrant", Math.max(...inLabel) > 11.5,
    `max in-label r ${Math.max(...inLabel).toFixed(2)}`);
  check("...and leaves the far side of the can alone", Math.max(...offLabel) < 10.1,
    `max off-label r ${Math.max(...offLabel).toFixed(2)}`);
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

// ---- knurl on a ROUND part varies AROUND it, not just up it ----------------
// It used to measure "around" as position . tangent, which is zero everywhere
// on a cylinder centred on its axis: the diamonds collapsed into rings.
{
  const seg = 96, R = 15, H = 12, soup = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI;
    const p = (a, z) => [R * Math.cos(a), R * Math.sin(a), z];
    soup.push(...p(a0, 0), ...p(a1, 0), ...p(a1, H), ...p(a0, 0), ...p(a1, H), ...p(a0, H));
  }
  const out = displacedPositions(new Float64Array(soup), { pattern: "knurl", depth: 1, scale: 3, faces: "sides", maxTris: 60000 });
  // Walk round the circle at half height and count how often the surface
  // flips between in and out. A real knurl of ~31 diamonds flips ~50-60 times;
  // the old bug (no real "around" coordinate) gave facet-scale noise, ~380.
  const pts = [];
  for (let i = 0; i < out.length; i += 3) {
    if (Math.abs(out[i + 2] - H / 2) < 1e-6) pts.push([Math.atan2(out[i + 1], out[i]), Math.hypot(out[i], out[i + 1])]);
  }
  const ring = [...new Map(pts.map((q) => [q[0].toFixed(5), q])).values()].sort((a, b) => a[0] - b[0]);
  const mean = ring.reduce((a, q) => a + q[1], 0) / ring.length;
  let flips = 0;
  for (let i = 0; i < ring.length; i++) if ((ring[i][1] - mean) * (ring[(i + 1) % ring.length][1] - mean) < 0) flips++;
  check("knurl on a cylinder makes diamonds around it, not rings or noise", flips > 30 && flips < 120, `${flips} flips over ${ring.length} points`);
}

// ---- remeshing before displacement ---------------------------------------
//
// The kernel tessellates for shape: a 96-segment knob wall is 1.1 x 18 mm
// slivers. Subdividing those keeps them slivers, and a 3 mm knurl sampled on
// 9 mm-tall triangles reads as scattered spikes. texture() now remeshes the
// textured faces into near-equilateral triangles at the pattern's spacing
// first. These pin down: it actually engages on real kernel output, the
// triangles are good, the shell stays closed where textured walls meet plain
// caps and holes, the knurl comes out crease-exact, and the build stays fast.

const flatSoup = (r) => Float64Array.from(soupOf(r).flat());
const knobShape = () => difference(cylinder({ r: 17, h: 18, $fn: 96 }), translate([0, 0, -1], cylinder({ r: 6.5, h: 7, $fn: 6 })));
const sidesWanted = (n) => Math.abs(n[2]) < 0.99;
const soupVolume = (f) => {
  let v = 0;
  for (let i = 0; i < f.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = f.subarray(i, i + 9);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
};
const toSoup = (r) => {
  const out = new Float64Array(r.faces.length * 3);
  for (let f = 0; f < r.faces.length; f++) for (let a = 0; a < 3; a++) out[f * 3 + a] = r.verts[r.faces[f] * 3 + a];
  return out;
};
// radius ratio: 1 = equilateral, 0 = degenerate
function triQuality(f, i) {
  const p = [0, 3, 6].map((o) => [f[i + o], f[i + o + 1], f[i + o + 2]]);
  const l = [0, 1, 2].map((k) => Math.hypot(p[k][0] - p[(k + 1) % 3][0], p[k][1] - p[(k + 1) % 3][1], p[k][2] - p[(k + 1) % 3][2]));
  const s = (l[0] + l[1] + l[2]) / 2;
  const A2 = Math.max(0, s * (s - l[0]) * (s - l[1]) * (s - l[2]));
  return { q: (8 * A2) / (s * l[0] * l[1] * l[2]), maxEdge: Math.max(...l) };
}
const qualityOn = (f, pick) => {
  const qs = [];
  let maxEdge = 0;
  for (let i = 0; i < f.length; i += 9) {
    if (!pick(f, i)) continue;
    const t = triQuality(f, i);
    qs.push(t.q); maxEdge = Math.max(maxEdge, t.maxEdge);
  }
  qs.sort((a, b) => a - b);
  return { n: qs.length, min: qs[0], p05: qs[Math.floor(qs.length * 0.05)], med: qs[qs.length >> 1], maxEdge };
};
const facetNz = (f, i) => {
  const ux = f[i + 3] - f[i], uy = f[i + 4] - f[i + 1], uz = f[i + 5] - f[i + 2];
  const vx = f[i + 6] - f[i], vy = f[i + 7] - f[i + 1], vz = f[i + 8] - f[i + 2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return cz / (Math.hypot(cx, cy, cz) || 1);
};
const onSide = (f, i) => Math.abs(facetNz(f, i)) < 0.99;

{
  const shapes = {
    "knob (96-segment wall, hex nut pocket)": knobShape(),
    "box": cube([20, 20, 10]),
    "box with a bore (inward cylinder)": difference(cube([30, 30, 10]), translate([15, 15, -1], cylinder({ r: 5, h: 12, $fn: 48 }))),
    "sphere (no plane or cylinder to unroll)": sphere({ r: 10 }),
  };
  for (const [name, shape] of Object.entries(shapes)) {
    const soup = flatSoup(await build(shape));
    const r = remeshForTexture(soup, { L: 1.5, wants: sidesWanted, maxTris: 20000 });
    check(`remesh engages on the kernel's ${name}`, !!r, `declined: ${remeshForTexture.why}`);
    if (!r) continue;
    const out = toSoup(r);
    check(`...${name}: still watertight`, isWatertight(out));
    const v0 = soupVolume(soup), v1 = soupVolume(out);
    check(`...${name}: same solid (volume within 0.5%)`, Math.abs(v1 - v0) / v0 < 0.005, `${v0.toFixed(1)} -> ${v1.toFixed(1)}`);
    const q = qualityOn(out, onSide);
    // A sphere can't be unrolled flat, so it is remeshed facet by facet: the
    // kernel's own facets bound the quality there. Planes and cylinders get
    // the real lattice.
    const curved = /sphere/.test(name);
    const good = curved ? q.med > 0.75 && q.min > 0.25 : q.med > 0.9 && q.p05 > 0.55 && q.min > 0.25;
    check(`...${name}: textured faces are ${curved ? "decent (per-facet)" : "near-equilateral"}`, good,
      `median ${q.med?.toFixed(3)}, 5th pct ${q.p05?.toFixed(3)}, worst ${q.min?.toFixed(3)} over ${q.n}`);
    check(`...${name}: and as small as the pattern asks`, q.maxEdge < 1.5 * 2, `longest textured edge ${q.maxEdge.toFixed(2)} mm`);
  }
}
{
  // the regression itself: knob wall triangles used to stay 9 mm tall
  const soup = flatSoup(await build(knobShape()));
  const out = displacedPositions(soup, { pattern: "knurl", depth: 0.6, scale: 3, faces: "sides", maxTris: 6000 });
  check("knurled knob: displaced shell watertight", isWatertight(out));
  const q = qualityOn(out, (f, i) => {
    for (let k = 0; k < 9; k += 3) if (Math.hypot(f[i + k], f[i + k + 1]) < 16.9 || f[i + k + 2] < 0.5 || f[i + k + 2] > 17.5) return false;
    return true;
  });
  // (measured after displacement: the diamond slopes stretch the 1.5 mm lattice edges a little)
  check("knurled knob: wall triangles are small now (were ~9 mm tall)", q.n > 1000 && q.maxEdge < 2, `longest ${q.maxEdge.toFixed(2)} mm over ${q.n}`);
  check("knurled knob: within the triangle budget", out.length / 9 <= 6000, `${out.length / 9} tris`);
  // a plain cap that needed no splitting is left exactly as the kernel made it
  const capTris = (f) => { let n = 0; for (let i = 0; i < f.length; i += 9) if (facetNz(f, i) > 0.999 && f[i + 2] > 17.9) n++; return n; };
  check("knurled knob: the plain top cap is untouched", capTris(out) === capTris(soup), `${capTris(soup)} -> ${capTris(out)}`);
}
{
  // Crease-exact knurl. The diamonds are piecewise LINEAR in (u, w), and the
  // lattice follows their creases, so on (nearly) every wall triangle the
  // pattern is linear: the mean of its corners equals its value at the
  // centroid. Sampled on arbitrary triangles that fails on most of them.
  const R = 17, H = 18, s = 3, depth = 0.6;
  const soup = flatSoup(await build(cylinder({ r: R, h: H, $fn: 96 })));
  const N = Math.max(4, Math.round((2 * Math.PI * R) / s));
  const tw = (t) => Math.abs(t - Math.floor(t) - 0.5) * 2;
  const knurl = (x, y, z) => {
    const u = (Math.atan2(y, x) / (2 * Math.PI)) * N, w = z / s;
    return Math.max(0, tw(u + w) + tw(u - w) - 1);
  };
  const linearShare = (out) => {
    let linear = 0, total = 0;
    for (let i = 0; i < out.length; i += 9) {
      const P = [0, 3, 6].map((o) => [out[i + o], out[i + o + 1], out[i + o + 2]]);
      if (P.some((p) => p[2] < 1.5 || p[2] > H - 1.5)) continue;          // the rim bands are irregular by design
      // undo the radial push to get the wall point back, then compare
      const base = P.map((p) => { const r = Math.hypot(p[0], p[1]); return [(p[0] / r) * R, (p[1] / r) * R, p[2], (r - R) / depth]; });
      const mean = (base[0][3] + base[1][3] + base[2][3]) / 3;
      const c = [0, 1, 2].map((a) => (base[0][a] + base[1][a] + base[2][a]) / 3);
      total++;
      if (Math.abs(mean - knurl(c[0], c[1], c[2])) < 0.02) linear++;
    }
    return { linear, total };
  };
  const got = linearShare(displacedPositions(soup, { pattern: "knurl", depth, scale: s, faces: "sides", maxTris: 20000 }));
  check("knurl lattice follows the creases: the pattern is linear on the wall triangles",
    got.total > 1000 && got.linear / got.total > 0.9, `${got.linear}/${got.total} linear`);
}
{
  // budget: a big part at a fine scale trades spacing for staying interactive
  const soup = flatSoup(await build(cylinder({ r: 40, h: 60, $fn: 128 })));
  const out = displacedPositions(soup, { pattern: "fuzzy", depth: 0.4, scale: 1, faces: "sides", maxTris: 6000 });
  check("over-budget remesh coarsens instead of blowing the budget", out.length / 9 <= 6600 && isWatertight(out), `${out.length / 9} tris`);
}
{
  // A thin bore at a coarse spacing: the unrolled tube is a narrow strip whose
  // two long edges are the same seam, and a lattice point mid-strip used to
  // join both copies of one vertex (a doubled edge, so the remesh gave up).
  const soup = flatSoup(await build(difference(cube([60, 60, 20]), translate([30, 30, -1], cylinder({ r: 2.7, h: 22, $fn: 32 })))));
  const r = remeshForTexture(soup, { L: 6, wants: sidesWanted, maxTris: 1e9 });
  check("a thin bore at a coarse spacing doesn't fold across its seam", !!r && isWatertight(toSoup(r)), r ? "" : remeshForTexture.why);
}
{
  // the old uniform path is still there as the fallback, and still closed
  const out = displacedPositions(cubeSoup(10), { pattern: "knurl", depth: 0.6, scale: 2.5, faces: "sides", maxTris: 24000, remesh: false });
  check("uniform-subdivision fallback still watertight", isWatertight(out) && out.length > 12 * 9);
}
{
  // and the whole thing stays interactive: a 35 mm knurled knob through the kernel
  const t0 = Date.now();
  const r = await build(texture({ pattern: "knurl", depth: 0.6, scale: 3, faces: "sides" }, knobShape()));
  const secs = (Date.now() - t0) / 1000;
  check("35 mm knurled knob builds in under 5 s", secs < 5 && volumeOf(r) > 15000, `${secs.toFixed(1)} s`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
