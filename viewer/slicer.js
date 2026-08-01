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

// ------------------------------------------------------------- offsetting

// Inset (negative delta) or outset the loops. Clipper handles the part people
// get wrong by hand: when a wall is thinner than twice the offset the region
// collapses and must DISAPPEAR rather than turn inside out.
export async function offsetLoops(loops, delta) {
  const C = await getClipper();
  const co = new C.ClipperOffset(2, 0.25);
  co.AddPaths(loops.map(toClip), C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, delta * SCALE);
  return out.map(fromClip).filter((p) => p.length > 2);
}

// -------------------------------------------------------------- the slice

export const DEFAULTS = {
  layer: 0.2,
  nozzle: 0.4,
  walls: 3,
  filament: 1.75,
  feed: 1800,          // mm/min, printing
  travel: 7200,        // mm/min, non-printing
  temp: 210,
  bed: 60,
  stagger: true,       // the whole point
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

// ---------------------------------------------------------------- G-code

// E per mm of travel: the bead this move lays down, expressed as filament.
export const ePerMm = (opt) =>
  (opt.layer * opt.nozzle) / (Math.PI * (opt.filament / 2) ** 2);

export function gcodeHeader(opt, name) {
  return [
    `; ${name} — sliced by BREPcode`,
    `; brick-staggered perimeters: outer wall fixed, inner walls alternate by ${(opt.nozzle / 2).toFixed(2)}mm`,
    `; layer ${opt.layer}mm · nozzle ${opt.nozzle}mm · ${opt.walls} walls`,
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

// tris: [[[x,y,z] x3], …] world space. Returns { gcode, stats }.
export async function sliceToGcode(tris, options = {}, onProgress) {
  const opt = { ...DEFAULTS, ...options };
  const zs = [];
  for (const t of tris) for (const p of t) zs.push(p[2]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const nLayers = Math.max(1, Math.floor((zmax - zmin) / opt.layer));
  const EPMM = ePerMm(opt);

  const g = gcodeHeader(opt, options.name || "model");
  let E = 0, extrude = 0, travel = 0, staggered = 0;
  const wallCounts = [];

  for (let i = 0; i < nLayers; i++) {
    // sample at the MIDDLE of the layer, not its floor: a slice taken exactly
    // on a flat top or bottom face lands in the plane of the triangles there
    // and comes back as noise
    const z = zmin + i * opt.layer + opt.layer / 2;
    const loops = chainLoops(sliceTriangles(tris, z));
    if (!loops.length) continue;
    const rings = await wallsForLayer(loops, opt, i);
    if (!rings.length) continue;
    if (opt.stagger && i % 2 === 1) staggered++;
    wallCounts.push(rings.length);

    g.push(`;LAYER:${i}`, `G1 Z${(zmin + (i + 1) * opt.layer - zmin).toFixed(3)} F${opt.travel}`);
    for (const ring of rings) {
      for (const path of ring) {
        const closed = [...path, path[0]];
        g.push(`G0 X${closed[0][0].toFixed(3)} Y${closed[0][1].toFixed(3)} F${opt.travel}`);
        travel++;
        for (let k = 1; k < closed.length; k++) {
          const d = Math.hypot(closed[k][0] - closed[k - 1][0], closed[k][1] - closed[k - 1][1]);
          if (d < 1e-4) continue;
          E += d * EPMM;
          g.push(`G1 X${closed[k][0].toFixed(3)} Y${closed[k][1].toFixed(3)} E${E.toFixed(5)} F${opt.feed}`);
          extrude++;
        }
      }
    }
    onProgress?.(i + 1, nLayers);
  }
  g.push(...gcodeFooter());

  return {
    gcode: g.join("\n"),
    stats: {
      layers: nLayers, layersWithWalls: wallCounts.length,
      staggeredLayers: staggered,
      wallsPerLayer: wallCounts.length ? Math.round(wallCounts.reduce((a, b) => a + b, 0) / wallCounts.length) : 0,
      extrudeMoves: extrude, travelMoves: travel,
      filamentMm: +E.toFixed(1),
      filamentMm3: +(E * Math.PI * (opt.filament / 2) ** 2).toFixed(1),
      height: +(zmax - zmin).toFixed(2),
    },
  };
}
