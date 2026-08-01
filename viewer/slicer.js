// A slicer that does ONE thing: brick-staggered perimeters.
//
// Not a competitor to Orca and not trying to be. Orca has a decade of tuning
// and a thousand settings; this has a handful, and it exists because of a
// feature none of them expose — perimeters that interlock like brickwork
// instead of stacking in straight vertical seams.
//
// WHY THE OUTER WALL DOES NOT MOVE. The obvious reading of "stagger every
// layer" is to shift all the walls, and it is wrong: shifting the outermost
// one makes the part's own surface ripple in and out by half a bead, which
// both looks like corduroy and puts the finished dimension half a bead off on
// alternate layers. So the outer wall sits at a fixed offset — the surface and
// the tolerance stay exactly where they belong — and the INNER walls alternate.
// The interlock happens where it does any good, inside the shell, and costs
// nothing where it would do harm.
//
// Everything here is a MESH operation. It never touches the CAD kernel, so it
// cannot slow a build down, and the module is loaded on demand — nobody who
// never slices anything pays for it.
//
// NB build-site.mjs rewrites the /node_modules path below for the static site.

let clipperReady = null;

// Test hook: node has no window, so the suite injects ClipperLib itself
// (same pattern as curved.js/_setReplicad and simplify.js/_setSimplifier).
export function _setClipper(c) {
  clipperReady = Promise.resolve(c);
}

const getClipper = () => (clipperReady ??= import("/node_modules/clipper-lib/clipper.js")
  .then(() => globalThis.ClipperLib));

// Clipper is integer-only — it works in scaled fixed point, and feeding it
// millimetres directly quantises every coordinate to the nearest 1mm, which
// turns a 0.4mm wall into nothing at all.
const SCALE = 1000;
const toClip = (pts) => pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
const fromClip = (path) => path.map((p) => [p.X / SCALE, p.Y / SCALE]);

// ---------------------------------------------------------------- slicing

// Every triangle crossing z, as a loose set of 2D segments.
export function sliceTriangles(tris, z) {
  const segs = [];
  for (const t of tris) {
    const d = [t[0][2] - z, t[1][2] - z, t[2][2] - z];
    const hit = [];
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3], da = d[e], db = d[(e + 1) % 3];
      if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) continue;
      const f = da / (da - db);
      hit.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    if (hit.length === 2 && Math.hypot(hit[1][0] - hit[0][0], hit[1][1] - hit[0][1]) > 1e-9) {
      segs.push(hit);
    }
  }
  return segs;
}

// Segments -> closed loops. A watertight mesh gives every segment exactly one
// neighbour at each end, so this is a walk rather than a search.
export function chainLoops(segs, tol = 1e-3) {
  const key = (p) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
  const ends = new Map();
  segs.forEach((s, i) => {
    for (const e of [0, 1]) {
      const k = key(s[e]);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push([i, e]);
    }
  });
  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const loop = [segs[i][0], segs[i][1]];
    for (;;) {
      const nxt = (ends.get(key(loop[loop.length - 1])) || []).find(([j]) => !used[j]);
      if (!nxt) break;
      used[nxt[0]] = true;
      loop.push(segs[nxt[0]][1 - nxt[1]]);
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

// --------------------------------------------------------------- booleans

async function boolOp(subject, clip, type, fill) {
  const C = await getClipper();
  const c = new C.Clipper();
  if (subject.length) c.AddPaths(subject.map(toClip), C.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip.map(toClip), C.PolyType.ptClip, true);
  const out = new C.Paths();
  const f = fill ?? C.PolyFillType.pftNonZero;
  c.Execute(type, out, f, f);
  return out.map(fromClip).filter((p) => p.length > 2);
}

// Raw slice loops come out of chainLoops in whatever direction the triangles
// happened to run — on a box with a hole through it the outer loop is CW and
// the hole CCW, the opposite of what every boolean below assumes. A union
// under the even-odd rule states the region without caring about direction,
// and Clipper hands the answer back in its own convention: outers CCW, holes
// CW. So this is the one call that has to come first.
export async function normalizeLoops(loops) {
  const C = await getClipper();
  return boolOp(loops, [], C.ClipType.ctUnion, C.PolyFillType.pftEvenOdd);
}

export async function differenceLoops(a, b) {
  if (!a.length) return [];
  if (!b.length) return a;
  const C = await getClipper();
  return boolOp(a, b, C.ClipType.ctDifference);
}

export async function intersectLoops(a, b) {
  if (!a.length || !b.length) return [];
  const C = await getClipper();
  return boolOp(a, b, C.ClipType.ctIntersection);
}

export async function unionLoops(a, b) {
  if (!a.length) return b;
  if (!b.length) return a;
  const C = await getClipper();
  return boolOp(a, b, C.ClipType.ctUnion);
}

// ------------------------------------------------------------- offsetting

// Inset (negative delta) or outset the loops. Clipper handles the part people
// get wrong by hand: when a wall is thinner than twice the offset the region
// collapses and must DISAPPEAR rather than turn inside out.
export async function offsetLoops(loops, delta) {
  if (!loops.length) return [];
  if (delta === 0) return loops;
  const C = await getClipper();
  const co = new C.ClipperOffset(2, 0.25);
  co.AddPaths(loops.map(toClip), C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, delta * SCALE);
  return out.map(fromClip).filter((p) => p.length > 2);
}

// Shrink then grow by the same amount. Anything narrower than 2r cannot
// survive the shrink, so it vanishes — which is how you get rid of the
// hairline slivers that a difference between two near-identical layers
// leaves behind, without disturbing anything of real size.
export async function openLoops(loops, r) {
  if (!loops.length || r <= 0) return loops;
  const shrunk = await offsetLoops(loops, -r);
  if (!shrunk.length) return [];
  return offsetLoops(shrunk, r);
}

// ------------------------------------------------------------------ fill

// Parallel lines at angleDeg, clipped to the region, ordered so the nozzle
// snakes back and forth instead of returning to one side every time.
//
// The line positions are anchored to the ORIGIN rather than to the region's
// own bounding box: two layers of different size then put their infill on the
// same set of lines, so the strands stack on each other and actually bond,
// instead of drifting by half a spacing every layer.
export async function infillLines(region, spacing, angleDeg) {
  if (!region.length || !(spacing > 0) || !Number.isFinite(spacing)) return [];
  const C = await getClipper();

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of region) {
    for (const [x, y] of p) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const R = Math.hypot(maxX - minX, maxY - minY) / 2 + spacing;

  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);      // along each line
  const nx = -dy, ny = dx;                        // across them
  const tc = cx * nx + cy * ny;
  const lines = [];
  for (let k = Math.ceil((tc - R) / spacing); k <= Math.floor((tc + R) / spacing); k++) {
    const t = k * spacing;
    const px = nx * t, py = ny * t;               // point on the line nearest the origin
    const s = (cx - px) * dx + (cy - py) * dy;    // slide along it to face the region
    lines.push([
      [px + dx * (s - R), py + dy * (s - R)],
      [px + dx * (s + R), py + dy * (s + R)],
    ]);
  }
  if (!lines.length) return [];

  // open subject paths against a closed clip: the lines come back trimmed to
  // the region, already split around any holes
  const c = new C.Clipper();
  c.AddPaths(lines.map(toClip), C.PolyType.ptSubject, false);
  c.AddPaths(region.map(toClip), C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  c.Execute(C.ClipType.ctIntersection, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  const segs = C.Clipper.OpenPathsFromPolyTree(tree)
    .map(fromClip)
    .filter((p) => p.length >= 2);

  // Group the strands into LANES before ordering them. A hole cuts every line
  // that passes it into two pieces, and simply zigzagging down the list then
  // hops the hole twice per line — on a tube that is dozens of crossings a
  // layer, every one of them a retraction. Strands that sit on consecutive
  // lines AND overlap along the line are reachable from each other without
  // crossing anything, so they belong to one lane; the slicer finishes a lane
  // before moving to the next, and the hole gets crossed once instead.
  const items = segs.map((s) => {
    const a = s[0][0] * dx + s[0][1] * dy;
    const b = s[s.length - 1][0] * dx + s[s.length - 1][1] * dy;
    return {
      s,
      t: Math.round((s[0][0] * nx + s[0][1] * ny) / spacing),
      lo: Math.min(a, b), hi: Math.max(a, b),
    };
  });
  items.sort((A, B) => A.t - B.t || A.lo - B.lo);

  const lanes = [];
  let prev = [], cur = [], curT = null;
  for (const it of items) {
    if (it.t !== curT) { prev = cur; cur = []; curT = it.t; }
    let lane = null;
    for (const L of prev) {
      const p = L[L.length - 1];
      if (p.t === it.t - 1 && p.lo < it.hi && it.lo < p.hi) { lane = L; break; }
    }
    if (lane) prev.splice(prev.indexOf(lane), 1);
    else { lane = []; lanes.push(lane); }
    lane.push(it);
    cur.push(lane);
  }

  // walk the lanes nearest-first, flipping each strand so its near end comes
  // first — which is what makes the path a boustrophedon rather than a comb
  const out = [];
  let at = null;
  const left = lanes.slice();
  while (left.length) {
    let pick = 0;
    if (at) {
      let best = Infinity;
      left.forEach((L, i) => {
        const e = L[0].s[0], f = L[L.length - 1].s[0];
        const d = Math.min(Math.hypot(e[0] - at[0], e[1] - at[1]),
          Math.hypot(f[0] - at[0], f[1] - at[1]));
        if (d < best) { best = d; pick = i; }
      });
    }
    for (const it of left.splice(pick, 1)[0]) {
      const s = it.s;
      if (at) {
        const da = Math.hypot(s[0][0] - at[0], s[0][1] - at[1]);
        const db = Math.hypot(s[s.length - 1][0] - at[0], s[s.length - 1][1] - at[1]);
        if (db < da) s.reverse();
      }
      out.push(s);
      at = s[s.length - 1];
    }
  }
  return out;
}

// -------------------------------------------------- crossing the outline

// Do these two points see each other without leaving the part?
function segCross(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

// Whether a straight hop from a to b leaves the material.
//
// This is what decides a retraction, and distance alone is NOT the test:
// stepping to the neighbouring infill strand is a 2.7mm hop at 15% density,
// which a plain "retract over 2mm" rule turns into a retraction on every
// single strand — thousands per part, minutes of wasted time, and a filament
// path ground to dust for no benefit. What actually strings is a hop that
// crosses OPEN AIR, so that is the thing to test for.
export function crossesLoops(a, b, loops) {
  for (const p of loops) {
    for (let i = 0; i < p.length; i++) {
      if (segCross(a, b, p[i], p[(i + 1) % p.length])) return true;
    }
  }
  return false;
}

// -------------------------------------------------------------- printers

// Retraction is a property of the extruder, not of the part. A Bowden tube has
// a metre of springy filament between the gear and the melt zone and needs
// centimetres of pull to unload it; a direct drive has millimetres. Getting
// this wrong is the difference between a clean part and a cobweb, so it is
// attached to the machine rather than left as a number to guess.
export const PRINTERS = {
  bambu: {
    label: "Bambu Lab — X1 / P1 / A1",
    bedX: 256, bedY: 256, retract: 0.8, retractSpeed: 30, zhop: 0.4,
  },
  ender_dd: {
    label: "Ender 3 S1 / V3 — direct drive",
    bedX: 220, bedY: 220, retract: 1.0, retractSpeed: 40, zhop: 0.2,
  },
  ender_bowden: {
    label: "Ender 3 / Pro / V2 — Bowden",
    bedX: 220, bedY: 220, retract: 5.0, retractSpeed: 45, zhop: 0.2,
  },
};

// -------------------------------------------------------------- the slice

export const DEFAULTS = {
  layer: 0.2,
  nozzle: 0.4,
  walls: 3,
  topLayers: 4,        // solid skin under a top surface
  bottomLayers: 4,     // ...and over a bottom one
  infill: 0.15,        // 0 = leave it hollow
  filament: 1.75,
  feed: 1800,          // mm/min, walls
  solidFeed: 2100,     // mm/min, solid skin
  infillFeed: 2700,    // mm/min, sparse infill — nothing shows, so run it
  travel: 7200,        // mm/min, not printing
  firstLayer: 0.5,     // fraction of normal speed for layer 1
  temp: 210,
  bed: 60,
  retract: 0.8,
  retractSpeed: 30,    // mm/s
  retractMin: 1.5,     // never worth retracting for a hop this short
  retractLong: 8,      // ...but always worth it for one this long, air or not
  zhop: 0.4,
  bedX: 256,
  bedY: 256,           // 0 disables centring and leaves model coordinates alone
  stagger: true,       // the whole point
  supports: false,     // off unless asked: most parts do not need them
  supportAngle: 45,    // degrees from vertical before an overhang needs holding
  supportXY: 0.7,      // sideways gap so it does not weld itself to the model
  supportZ: 1,         // layers of air underneath the overhang
  supportDensity: 0.12,
  supportMinArea: 4,   // mm2 — under this it is slice noise, not an overhang
};

// One layer's worth of wall loops, outermost first.
//
// Offsets without stagger:   0.5, 1.5, 2.5 nozzles in from the surface
// with stagger, odd layers:  0.5, 2.0, 3.0   <- inner walls shifted half a bead
//
// The first number never changes. That is the outer wall, and it is what the
// part measures.
export async function wallsForLayer(loops, opt, layerIndex) {
  const { nozzle, walls, stagger } = opt;
  const shift = stagger && (layerIndex % 2 === 1) ? nozzle / 2 : 0;
  const out = [];
  for (let w = 0; w < walls; w++) {
    const d = nozzle * (0.5 + w) + (w === 0 ? 0 : shift);
    const ring = await offsetLoops(loops, -d);
    if (!ring.length) break;                 // wall thinner than the shell: stop
    out.push(ring);
  }
  return out;
}

const staggerShift = (opt, i) => (opt.stagger && i % 2 === 1 ? opt.nozzle / 2 : 0);

// Everything inside the walls, which is what infill has to fill. On staggered
// layers the innermost wall has moved half a bead further in, so the fill
// boundary has to follow it or the first infill strand lands on top of it.
const fillBoundary = (outline, opt, i) =>
  offsetLoops(outline, -(opt.nozzle * opt.walls + staggerShift(opt, i)));

// Pass one: the geometry of every layer, with no decisions taken yet.
export async function planLayers(tris, opt, onProgress) {
  const zs = [];
  for (const t of tris) for (const p of t) zs.push(p[2]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const nLayers = Math.max(1, Math.floor((zmax - zmin) / opt.layer));
  const layers = [];

  for (let i = 0; i < nLayers; i++) {
    // sample at the MIDDLE of the layer, not its floor: a slice taken exactly
    // on a flat top or bottom face lands in the plane of the triangles there
    // and comes back as noise
    const z = zmin + i * opt.layer + opt.layer / 2;
    const raw = chainLoops(sliceTriangles(tris, z));
    if (!raw.length) { layers.push(null); onProgress?.(i + 1, nLayers); continue; }
    const outline = await normalizeLoops(raw);
    const walls = await wallsForLayer(outline, opt, i);
    if (!walls.length) { layers.push(null); onProgress?.(i + 1, nLayers); continue; }
    // `ref` deliberately ignores the stagger. Comparing layer to layer is how
    // top and bottom surfaces get found, and if the regions being compared
    // breathed in and out by half a bead every layer the comparison would
    // report a ring of false top surface on every single one.
    const ref = await offsetLoops(outline, -opt.nozzle * opt.walls);
    const fill = staggerShift(opt, i) ? await fillBoundary(outline, opt, i) : ref;
    layers.push({ i, outline, walls, ref, fill });
    onProgress?.(i + 1, nLayers);
  }
  return { layers, nLayers, zmin, zmax };
}

// Where this layer needs to be solid, and where sparse infill will do.
//
// A patch is sparse only if it is buried: covered by every one of the next
// `topLayers` and carried by every one of the previous `bottomLayers`. Since
//     (ref - above) u (ref - below)  ==  ref - (above n below)
// the two skins fall out of a single difference rather than two.
export async function skinFor(layers, i, opt) {
  const L = layers[i];
  if (!L || !L.fill.length) return { solid: [], sparse: [] };

  const buried = async (dir, n) => {
    let acc = L.ref;
    for (let k = 1; k <= n; k++) {
      const nb = layers[i + dir * k];
      if (!nb || !nb.ref.length) return [];      // open to the air: nothing is buried
      acc = await intersectLoops(acc, nb.ref);
      if (!acc.length) return [];
    }
    return acc;
  };
  const above = await buried(+1, opt.topLayers);
  const below = await buried(-1, opt.bottomLayers);
  const core = await intersectLoops(above, below);

  let solid = await differenceLoops(L.fill, core);
  // A difference between two layers that are almost the same shape leaves
  // hairline rings behind — a faceted cylinder whose facets shift by a few
  // microns is enough to do it. Anything narrower than one bead cannot be
  // printed as solid whatever we decide, so open the region by half a bead
  // and let those vanish; otherwise a plain tube grows a random solid layer
  // in the middle of it.
  solid = await openLoops(solid, opt.nozzle / 2);
  // ...and the opening still leaves specks behind, because a facet that moves
  // a few microns between layers makes a blob rather than a hairline. A patch
  // this small holds no useful solid infill and is not a surface anyone will
  // ever see, so it is slice noise by definition: measured on a plain tube,
  // one layer in a hundred came out with 0.23mm2 of "top surface" on it.
  const minArea = (3 * opt.nozzle) ** 2;
  solid = solid.filter((p) => Math.abs(polyArea(p)) >= minArea);
  // recompute the sparse side from what actually survived, so solid + sparse
  // covers the fill region exactly and nothing is left as a void
  const sparse = await differenceLoops(L.fill, solid);
  return { solid, sparse };
}

function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

// -------------------------------------------------------------- supports

// Where the part needs holding up, layer by layer.
//
// A layer can only reach so far past the one below it before the bead has
// nothing underneath: at `supportAngle` degrees off vertical that reach is
// `layer * tan(angle)`, which at the usual 45 degrees is exactly one layer
// height. Anything beyond it is an overhang, and an overhang needs a column
// standing under it all the way down to the bed or to whatever part of the
// model is underneath.
//
// So this walks DOWNWARD, accumulating: each layer adds its own overhangs to
// what it inherited from above, and subtracts the model, which is what makes
// a column stop when it lands on something solid instead of tunnelling
// through it.
export async function planSupports(layers, opt) {
  const n = layers.length;
  const out = new Array(n).fill(null).map(() => []);
  if (!opt.supports) return out;

  const reach = opt.layer * Math.tan((opt.supportAngle * Math.PI) / 180);
  const need = new Array(n).fill(null).map(() => []);
  let carry = [];
  for (let i = n - 2; i >= 0; i--) {
    const here = layers[i]?.outline || [];
    const above = layers[i + 1]?.outline || [];
    const held = here.length ? await offsetLoops(here, reach) : [];
    carry = await unionLoops(carry, await differenceLoops(above, held));
    if (here.length) carry = await differenceLoops(carry, here);
    carry = carry.filter((p) => Math.abs(polyArea(p)) >= opt.supportMinArea);
    need[i] = carry;
  }

  // Drop the whole column by supportZ layers. That leaves the top of it
  // sitting in air under the overhang, which is the only reason the support
  // ever comes off again — printed hard against the underside it fuses, and
  // you are chiselling.
  for (let i = 0; i < n; i++) {
    const src = need[Math.min(n - 1, i + opt.supportZ)];
    if (!src.length) continue;
    const here = layers[i]?.outline || [];
    const clear = here.length ? await offsetLoops(here, opt.supportXY) : [];
    let s = await differenceLoops(src, clear);
    // pull in half a bead, the same as the outer wall does, so the strand
    // sits inside the overhang's footprint instead of half hanging off it
    s = await offsetLoops(s, -opt.nozzle / 2);
    out[i] = s.filter((p) => Math.abs(polyArea(p)) >= opt.supportMinArea);
  }
  return out;
}

// ---------------------------------------------------------------- G-code

// E per mm of travel: the bead this move lays down, expressed as filament.
export const ePerMm = (opt) =>
  (opt.layer * opt.nozzle) / (Math.PI * (opt.filament / 2) ** 2);

export function gcodeHeader(opt, name) {
  const skin = opt.topLayers || opt.bottomLayers
    ? `${opt.bottomLayers} bottom / ${opt.topLayers} top solid layers` : "no solid skin";
  return [
    `; ${name} — sliced by BREPcode`,
    `; brick-staggered perimeters: outer wall fixed, inner walls alternate by ${(opt.nozzle / 2).toFixed(2)}mm`,
    `; layer ${opt.layer}mm · nozzle ${opt.nozzle}mm · ${opt.walls} walls`,
    `; ${Math.round(opt.infill * 100)}% infill · ${skin}`,
    "G21 ; millimetres",
    "G90 ; absolute positioning",
    "M82 ; absolute extrusion",
    `M140 S${opt.bed}`,
    `M104 S${opt.temp}`,
    `M190 S${opt.bed}`,
    `M109 S${opt.temp}`,
    "G28 ; home",
    "G92 E0",
  ];
}

export const gcodeFooter = () => [
  "M104 S0 ; nozzle off",
  "M140 S0 ; bed off",
  "M107 ; fan off",
  "G91", "G1 Z5 F600 ; lift", "G90",
  "G28 X0 Y0",
  "M84 ; steppers off",
];

// --------------------------------------------------------------- preview

// Read the emitted G-code back into per-layer polylines for drawing.
//
// Parsing the FILE rather than keeping the paths around as they are generated
// is the whole point: a preview built from a separate code path can disagree
// with what actually gets printed, and then it is worse than no preview at
// all. This one can only show what is in the file.
export function parseGcode(text) {
  const layers = [];
  let cur = null, type = "WALL-OUTER", path = null;
  let x = 0, y = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith(";LAYER:")) {
      cur = { i: +line.slice(7), z: 0, runs: [] };
      layers.push(cur);
      path = null;
      continue;
    }
    if (line.startsWith(";TYPE:")) { type = line.slice(6); path = null; continue; }
    if (!cur || (line[0] !== "G") || (line[1] !== "0" && line[1] !== "1")) continue;
    const mx = /X(-?[\d.]+)/.exec(line), my = /Y(-?[\d.]+)/.exec(line);
    if (!mx || !my) {
      // a bare Z is the layer change; a bare E is a retract or a prime
      const mz = /Z(-?[\d.]+)/.exec(line);
      if (mz && !cur.z) cur.z = +mz[1];
      path = null;
      continue;
    }
    const nx = +mx[1], ny = +my[1];
    if (line[1] === "1" && / E-?[\d.]+/.test(line)) {
      if (!path) { path = { type, pts: [[x, y]] }; cur.runs.push(path); }
      path.pts.push([nx, ny]);
    } else {
      path = null;                       // a travel breaks the run
    }
    x = nx; y = ny;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const L of layers) {
    for (const r of L.runs) {
      for (const [px, py] of r.pts) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  return { layers, bounds: layers.length ? { minX, minY, maxX, maxY } : null };
}

// What each kind of extrusion is drawn as. Support is deliberately the odd
// one out — the point of looking at a preview is usually to check where it
// landed.
export const PREVIEW_COLOURS = {
  "WALL-OUTER": "#ff8a3d",
  "WALL-INNER": "#b3592a",
  SOLID: "#e8c547",
  FILL: "#4d7fd6",
  SUPPORT: "#22b8a6",
};

// tris: [[[x,y,z] x3], …] world space. Returns { gcode, stats }.
export async function sliceToGcode(tris, options = {}, onProgress) {
  const opt = { ...DEFAULTS, ...options };
  const { layers, nLayers, zmin, zmax } = await planLayers(tris, opt,
    (d, t) => onProgress?.(d, t, "Slicing"));
  const supports = await planSupports(layers, opt);

  // The model sits wherever it sat in the editor, which for anything built
  // with center:true means straddling the origin — half of it at negative X,
  // i.e. off the front left corner of the bed. Put its footprint in the middle
  // of the plate instead, and drop it onto the bed in Z.
  let ox = 0, oy = 0;
  if (opt.bedX > 0 && opt.bedY > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tris) {
      for (const p of t) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }
    ox = opt.bedX / 2 - (minX + maxX) / 2;
    oy = opt.bedY / 2 - (minY + maxY) / 2;
  }
  const fx = (p) => (p[0] + ox).toFixed(3);
  const fy = (p) => (p[1] + oy).toFixed(3);

  const EPMM = ePerMm(opt);
  const g = gcodeHeader(opt, options.name || "model");
  let E = 0, last = null, z = 0;
  let extrude = 0, travel = 0, retracts = 0, staggered = 0, minutes = 0;
  let supportLayers = 0;
  const dist = { wall: 0, solid: 0, infill: 0, support: 0, travel: 0 };
  const wallCounts = [];

  let outline = [];
  const travelTo = (p) => {
    const d = last ? Math.hypot(p[0] - last[0], p[1] - last[1]) : 0;
    dist.travel += d;
    minutes += d / opt.travel;
    // Retract when the hop crosses air, or when it is long enough that the
    // nozzle would drool across the part even inside it. A short hop to the
    // next strand is neither, and retracting on those is what turns a slice
    // into thousands of pointless retractions.
    const air = last && d >= opt.retractMin
      && (d >= opt.retractLong || crossesLoops(last, p, outline));
    if (opt.retract > 0 && air) {
      const rf = Math.round(opt.retractSpeed * 60);
      g.push(`G1 E${(E - opt.retract).toFixed(5)} F${rf} ; retract`);
      if (opt.zhop > 0) g.push(`G1 Z${(z + opt.zhop).toFixed(3)} F${opt.travel}`);
      g.push(`G0 X${fx(p)} Y${fy(p)} F${opt.travel}`);
      if (opt.zhop > 0) g.push(`G1 Z${z.toFixed(3)} F${opt.travel}`);
      g.push(`G1 E${E.toFixed(5)} F${rf} ; prime`);
      retracts++;
      minutes += (2 * opt.retract) / (opt.retractSpeed * 60);
    } else {
      g.push(`G0 X${fx(p)} Y${fy(p)} F${opt.travel}`);
    }
    travel++;
    last = p;
  };

  const extrudeTo = (p, feed, kind) => {
    const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
    if (d < 1e-4) return;
    E += d * EPMM;
    dist[kind] += d;
    minutes += d / feed;
    g.push(`G1 X${fx(p)} Y${fy(p)} E${E.toFixed(5)} F${feed}`);
    extrude++;
    last = p;
  };

  const run = (path, closed, feed, kind) => {
    const pts = closed ? [...path, path[0]] : path;
    travelTo(pts[0]);
    for (let k = 1; k < pts.length; k++) extrudeTo(pts[k], feed, kind);
  };

  for (let i = 0; i < nLayers; i++) {
    const L = layers[i];
    onProgress?.(i + 1, nLayers, "Writing G-code");
    if (!L) continue;
    const { solid, sparse } = await skinFor(layers, i, opt);
    outline = L.outline;
    if (opt.stagger && i % 2 === 1) staggered++;
    wallCounts.push(L.walls.length);

    // The first layer goes down slower: it is being ironed onto glass rather
    // than laid on plastic, and speed there is what makes prints let go.
    const s = i === 0 ? opt.firstLayer : 1;
    const wallF = Math.round(opt.feed * s);
    const solidF = Math.round(opt.solidFeed * s);
    const infillF = Math.round(opt.infillFeed * s);

    z = (i + 1) * opt.layer;
    g.push(`;LAYER:${i}`, `G1 Z${z.toFixed(3)} F${opt.travel}`);

    // Walls INNERMOST FIRST, outer wall last. The outer wall is the one the
    // part is measured on and the only one anybody sees, and it comes out
    // crisper when it is extruded against something solid instead of having
    // the inner walls pushed into its back afterwards.
    //
    // Grouped by ISLAND, not by ring. A tube's layer holds three rings around
    // the outside and three around the bore; walking them ring by ring hops
    // between the two five times a layer, and every hop crosses the bore.
    // Clipper hands back outer boundaries wound positive and holes negative,
    // so the sign of the area says which side of the material a ring belongs
    // to, and the centroid separates one hole from the next.
    const islands = new Map();
    for (let w = L.walls.length - 1; w >= 0; w--) {
      for (const path of L.walls[w]) {
        const a = polyArea(path);
        let cx = 0, cy = 0;
        for (let k = 0; k < path.length; k++) {
          const p = path[k], q = path[(k + 1) % path.length];
          const cr = p[0] * q[1] - q[0] * p[1];
          cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
        }
        const key = a ? `${a > 0 ? "+" : "-"}${Math.round(cx / (6 * a) * 2)},${Math.round(cy / (6 * a) * 2)}` : "0";
        if (!islands.has(key)) islands.set(key, []);
        islands.get(key).push({ w, path });
      }
    }
    for (const ring of islands.values()) {
      for (const { w, path } of ring) {
        g.push(w === 0 ? ";TYPE:WALL-OUTER" : ";TYPE:WALL-INNER");
        run(path, true, wallF, "wall");
      }
    }

    if (solid.length) {
      g.push(";TYPE:SOLID");
      // 45/135 by layer: strands cross the ones below instead of stacking in
      // the same grooves, which is what makes a skin stiff
      const lines = await infillLines(solid, opt.nozzle, 45 + (i % 2) * 90);
      for (const seg of lines) run(seg, false, solidF, "solid");
    }
    if (sparse.length && opt.infill > 0) {
      g.push(";TYPE:FILL");
      const lines = await infillLines(sparse, opt.nozzle / opt.infill, 45 + (i % 2) * 90);
      for (const seg of lines) run(seg, false, infillF, "infill");
    }

    // Support goes down LAST, and at one fixed angle rather than alternating
    // with the layer. Strands that stack in the same plane make a row of thin
    // vertical fins: rigid enough to hold an overhang up, and they snap
    // sideways with a thumbnail. Cross-hatching them would make a solid block
    // welded to the part, which holds just as well and never comes off.
    if (supports[i]?.length) {
      g.push(";TYPE:SUPPORT");
      supportLayers++;
      // One loop round each island first. Without it the fill lines stop a
      // whole spacing short of the extremes — on a round overhang the rim
      // ends up with nothing under it, because a horizontal line never
      // reaches the top or bottom of a circle. It also means the whole
      // support lifts off as one piece instead of crumbling into strands.
      for (const path of supports[i]) run(path, true, infillF, "support");
      const lines = await infillLines(supports[i], opt.nozzle / opt.supportDensity, 0);
      for (const seg of lines) run(seg, false, infillF, "support");
    }
  }
  g.push(...gcodeFooter());

  const mm3 = (mm) => +(mm * opt.layer * opt.nozzle).toFixed(1);
  return {
    gcode: g.join("\n"),
    stats: {
      layers: nLayers,
      layersWithWalls: wallCounts.length,
      staggeredLayers: staggered,
      wallsPerLayer: wallCounts.length
        ? Math.round(wallCounts.reduce((a, b) => a + b, 0) / wallCounts.length) : 0,
      extrudeMoves: extrude,
      travelMoves: travel,
      retractions: retracts,
      wallMm: +dist.wall.toFixed(1),
      solidMm: +dist.solid.toFixed(1),
      infillMm: +dist.infill.toFixed(1),
      supportMm: +dist.support.toFixed(1),
      travelMm: +dist.travel.toFixed(1),
      wallMm3: mm3(dist.wall),
      solidMm3: mm3(dist.solid),
      infillMm3: mm3(dist.infill),
      supportMm3: mm3(dist.support),
      supportLayers,
      filamentMm: +E.toFixed(1),
      filamentMm3: +(E * Math.PI * (opt.filament / 2) ** 2).toFixed(1),
      minutes: +minutes.toFixed(1),
      height: +(zmax - zmin).toFixed(2),
    },
  };
}
