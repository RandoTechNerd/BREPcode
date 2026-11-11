// Cookie-cutter kits, as code generators.
//
// Everything here turns an OUTLINE — a set of point loops — into the OpenSCAD
// for one of the four things people sell: a cutter, a cutter with a stamp and
// a twist knob, a stencil sheet, or a rolling stamp. The geometry rules behind
// each are in viewer/recipes/cutterkit.md and #cookiecutter; this is the same
// knowledge in executable form, so the Toolbox button and the AI emit the same
// verified shapes rather than two dialects that drift apart.
//
// PURE. No DOM, no network, no kernel — outline in, source string out. That is
// what makes it testable, and a cutter generator that is not tested is a
// generator that quietly loses an arm off a gingerbread man.

// The numbers the recipe justifies. Exported so a caller can override one
// without re-deriving the set.
export const DEFAULTS = {
  height: 15,        // blade height
  wall: 0.9,         // blade thickness — never below 0.8, see #cookiecutter
  rim: 6,            // the flange you press on: printed on the plate, the blade rising from it
  rimHeight: 2.5,
  size: 70,          // across, in mm
  relief: 1.6,       // how proud stamp detail stands
  plate: 3,          // stamp backing plate
  sheet: 1.2,        // stencil sheet thickness
  clearance: 0.35,   // bayonet fit, per side
  tolerance: 0.25,   // how far a simplified outline may stray, in mm — see below
  // ---- the choices a cutter designer offers (the Toolbox card's controls) ----
  sharp: false,      // thin the cutting edge: a cleaner cut, a more fragile blade
  edge: 0.45,        // ...to this, one extrusion line wide
  edgeHeight: 2,     // ...over the last 2 mm
  handle: "standard", // the rim you press on: standard | wide | comfort | none
  bars: 0,           // centre bars across the opening: 0, 1 (one bar) or 2 (a cross)
  barWidth: 4,
  mirror: false,     // flip left to right (a stamp presses its picture backwards)
};

// The handles on offer. A cutter is pressed with the flat of the hand, so the
// rim is most of how it feels: standard is the classic 6 mm lip, wide spreads
// the push over more palm for stiff dough, comfort adds a second, narrower
// tier on top so the edge under your hand is stepped rather than square, and
// none leaves the bare blade (for a cutter that nests inside another).
export const HANDLES = [
  { id: "standard", label: "Standard", blurb: "a 6 mm rim" },
  { id: "wide", label: "Wide", blurb: "a 10 mm rim for stiff dough" },
  { id: "comfort", label: "Comfort", blurb: "a stepped rim, easier on the hand" },
  { id: "none", label: "None", blurb: "the bare blade" },
];
export const BARS = [
  { id: 0, label: "Off" },
  { id: 1, label: "One bar" },
  { id: 2, label: "Cross" },
];

// Left to right, as in a mirror. The points are reversed as well so each loop
// still winds the way it did: a mirrored outline with its winding flipped
// turns holes into solids in anything that reads the winding.
export function mirrorLoops(loops) {
  return loops.map((l) => ({ ...l, points: l.points.map(([x, y]) => [x === 0 ? 0 : -x, y]).reverse() }));
}

const num = (n) => {
  const v = +n;
  if (!Number.isFinite(v)) throw new Error(`cutter: ${n} is not a number`);
  return +v.toFixed(3);
};

// A loop -> an OpenSCAD points literal. Kept on one line per loop so the
// generated source stays readable when someone opens it to change a number.
export function loopLiteral(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("cutter: an outline loop needs at least 3 points");
  }
  return "[" + points.map(([x, y]) => `[${num(x)},${num(y)}]`).join(",") + "]";
}

// ------------------------------------------------------------- simplify
//
// Traced artwork arrives far denser than a cookie cutter can use. A detailed
// icon comes out around 1,400 points — 569 on the outline alone, which at
// 80 mm is a point every half-millimetre. A 0.4 mm nozzle cannot print that
// detail, but offset() still has to compute it, and the blade it produces is a
// mesh of thousands of triangles describing bumps nobody can see. Measured on
// a gingerbread man: the un-simplified version had not finished translating
// after ninety seconds.
//
// So the points are thinned before they reach the generator. The tolerance is
// in millimetres of the finished part, which is the units a person can reason
// about: 0.25 mm is under half a nozzle width, so nothing is lost that could
// have been printed.

// Ramer–Douglas–Peucker. Iterative, not recursive: an outline can be thousands
// of points long and a recursive version blows the stack on the pathological
// case where every point is kept.
function rdp(pts, tol) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let far = -1, worst = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      // squared distance from the point to the segment, not to the line: a
      // degenerate segment (a === b, which closed loops produce) would divide
      // by zero and drop everything between them.
      let d2;
      if (len2 === 0) { const ex = px - ax, ey = py - ay; d2 = ex * ex + ey * ey; }
      else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
        d2 = ex * ex + ey * ey;
      }
      if (d2 > worst) { worst = d2; far = i; }
    }
    if (far > 0 && worst > tol2) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function simplifyLoops(loops, tol = 0.25) {
  if (!(+tol > 0)) return loops;
  return loops.map((l) => {
    // A closed loop has no natural endpoints for RDP to anchor on, and picking
    // point 0 arbitrarily can flatten a corner that happens to sit there. Split
    // it at its two most distant points and simplify each half, so both anchors
    // are real features of the shape.
    const p = l.points;
    if (p.length < 8) return l;
    let far = 1, best = -1;
    for (let i = 1; i < p.length; i++) {
      const d = (p[i][0] - p[0][0]) ** 2 + (p[i][1] - p[0][1]) ** 2;
      if (d > best) { best = d; far = i; }
    }
    // The second half runs from the far anchor back round to point 0 — note
    // the p[0] appended to it. Without that the closing segment, from the last
    // point back to the first, is never examined and the last point is dropped
    // whatever it is. On a traced gingerbread man that put a 6 mm notch in the
    // outline at every tolerance, which is a wrong shape, not a coarse one.
    const a = rdp(p.slice(0, far + 1), tol);
    const b = rdp([...p.slice(far), p[0]], tol);
    const out = a.concat(b.slice(1, -1));
    // Never hand back something that has stopped being a shape. If a loop is
    // small enough that the tolerance eats it, keep it as it was and let the
    // build be slow rather than wrong.
    return out.length >= 3 ? { ...l, points: out } : l;
  });
}

// Name the loops so the generated code reads like something a person wrote.
// Simplification happens HERE because all four generators come through it, so
// a fifth one added later gets it without anyone remembering.
// The same outline twice is one cutter, built twice. Two-tone icons draw their
// shape once per tone, and each copy is its own blade, rim and set of cuts: a
// traced dinosaur took 31 s with its outline doubled and 6 s without.
export function dedupeLoops(loops) {
  const same = (a, b) => a.hole === b.hole && a.points.length === b.points.length
    && a.points.every(([x, y], i) => Math.abs(x - b.points[i][0]) < 0.05 && Math.abs(y - b.points[i][1]) < 0.05);
  const out = [];
  for (const l of loops) if (!out.some((k) => same(k, l))) out.push(l);
  return out;
}

function loopVars(loops0, tol) {
  const loops = dedupeLoops(loops0);
  const src = tol === 0 ? loops : simplifyLoops(loops, tol ?? DEFAULTS.tolerance);
  const solid = src.filter((l) => !l.hole);
  const holes = src.filter((l) => l.hole);
  if (!solid.length) throw new Error("cutter: that outline has no filled shape to cut around");
  const lines = [];
  solid.forEach((l, i) => lines.push(`o${i} = ${loopLiteral(l.points)};`));
  holes.forEach((l, i) => lines.push(`h${i} = ${loopLiteral(l.points)};`));
  return { lines, nSolid: solid.length, nHoles: holes.length };
}

// The blade: an outline offset outward and inward, the gap between them being
// the wall. Every loop gets its own ring — dropping one is deleting part of the
// model, which is the failure this whole file exists to avoid.
function bladeModule(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  // PRINTED THE WAY IT STANDS: the rim, the wide part, lies on the plate and
  // the blade rises from it to the cutting edge. That is the most plastic on
  // the first layer (it sticks, it cannot tip), no overhang anywhere, and the
  // edge that cuts is the last thing printed, so it is the cleanest. Turn it
  // over to use it: the flat that was on the plate is what you press on.
  //
  // A sharp edge: the last EDGE_H of the blade, at the top, is one extrusion
  // line wide. It overlaps the full wall by 0.4 so the two are one body rather
  // than two stacked on a shared face.
  const blade = o.sharp
    ? `module blade(pts) {
  linear_extrude(H - EDGE_H) difference() {
    offset(delta = WALL/2) polygon(pts);
    offset(delta = -WALL/2) polygon(pts);
  }
  // the cutting edge, thinned from the OUTSIDE so the inside stays the outline
  translate([0, 0, H - EDGE_H - 0.4]) linear_extrude(EDGE_H + 0.4) difference() {
    offset(delta = EDGE - WALL/2) polygon(pts);
    offset(delta = -WALL/2) polygon(pts);
  }
}`
    : `module blade(pts) {
  linear_extrude(H) difference() {
    offset(delta = WALL/2) polygon(pts);
    offset(delta = -WALL/2) polygon(pts);
  }
}`;
  const flange = o.handle === "none"
    ? `module flange(pts) { }   // no rim: the bare blade`
    : `module flange(pts) {
  // on the plate, the blade standing in it. offset(r) rounds every corner the
  // outline turns outward at, so a star's rim has soft points, not spikes.
  linear_extrude(RIM_H) difference() {
    offset(r = RIM) polygon(pts);
    polygon(pts);   // ends INSIDE the blade's wall, not flush with its inner face
  }${o.handle === "comfort" ? `
  // the comfort tier: a narrower step on the rim, sunk 0.4 into it
  translate([0, 0, RIM_H - 0.4]) linear_extrude(RIM_H * 0.6 + 0.4) difference() {
    offset(r = RIM * 0.55) polygon(pts);
    polygon(pts);
  }` : ""}
}`;
  // Centre bars: strips across the opening at the rim's height, cut to the
  // inside of the outline. They stop a big cutter flexing and give the fingers
  // something to lift it by. On the plate with the rim, so they print flat.
  const bars = o.bars > 0
    ? `
module bars(pts) {
  linear_extrude(RIM_H) intersection() {
    offset(delta = WALL/2) polygon(pts);
    union() {
      square([SPAN * 2, BAR_W], center = true);${o.bars > 1 ? "\n      square([BAR_W, SPAN * 2], center = true);" : ""}
    }
  }
}`
    : "";
  return blade + "\n" + flange + bars;
}

function header(opts) {
  const o = { ...DEFAULTS, ...opts };
  // the wall never goes under the nozzle floor, whatever a dial says
  o.wall = Math.max(0.8, +o.wall || DEFAULTS.wall);
  o.height = Math.max(6, +o.height || DEFAULTS.height);
  if (!HANDLES.some((h) => h.id === o.handle)) o.handle = DEFAULTS.handle;
  if (o.handle === "wide" && !(opts && "rim" in opts)) o.rim = 10;
  o.bars = [0, 1, 2].includes(+o.bars) ? +o.bars : 0;
  return { o, text: `$fn = 48;
H = ${num(o.height)};        // blade height
WALL = ${num(o.wall)};       // blade thickness — 0.8 is the floor at a 0.4 nozzle
RIM = ${num(o.rim)};         // the rim: on the plate when printed, under your hand when cutting
RIM_H = ${num(o.rimHeight)};
`
    + (o.sharp ? `EDGE = ${num(Math.min(o.edge, o.wall))};      // the cutting edge, one line wide
EDGE_H = ${num(o.edgeHeight)};      // ...over the last of the blade
` : "")
    + (o.bars ? `BAR_W = ${num(o.barWidth)};       // centre bars across the opening
SPAN = ${num(o.size)};       // long enough to cross it
` : "") };
}

// ---------------------------------------------------------------- 1. cutter
export function cutterScad(loops, opts = {}) {
  // the bars have to reach across whatever came in, sized or not
  let span = 0;
  for (const l of loops) for (const [x, y] of l.points) span = Math.max(span, Math.abs(x), Math.abs(y));
  const { o, text } = header({ ...opts, size: Math.max(+opts.size || 0, span * 2, 10) });
  // the blade goes round the outside: interior detail is the stamp's, not a hole in the wall
  const outer = loops.filter((l) => !l.hole);
  const { lines, nSolid } = loopVars(o.mirror ? mirrorLoops(outer) : outer, opts.tolerance);
  const calls = Array.from({ length: nSolid }, (_, i) => `blade(o${i}); flange(o${i});${o.bars ? ` bars(o${i});` : ""}`);
  return `// Cookie cutter\n${text}\n${lines.join("\n")}\n\n${bladeModule(o)}\n\n${calls.join("\n")}\n`;
}

// ------------------------------------------------- 2. cutter + stamp + knob
export function stampScad(loops, opts = {}) {
  const { o, text } = header({ ...opts, bars: 0 });   // a stamp drops through the opening: no bars across it
  const { lines, nSolid, nHoles } = loopVars(o.mirror ? mirrorLoops(loops) : loops, opts.tolerance);
  const blades = Array.from({ length: nSolid }, (_, i) => `blade(o${i}); flange(o${i});`);
  // The stamp face: the outline shrunk so it drops inside the blade, with the
  // holes raised as the detail that presses into the dough.
  const detail = nHoles
    ? Array.from({ length: nHoles }, (_, i) => `      polygon(h${i});`).join("\n")
    : `      // no interior detail in this outline — a ring reads well on its own\n`
      + `      difference() { offset(delta=-4) polygon(o0); offset(delta=-5.2) polygon(o0); }`;
  return `// Cutter + stamp + twist knob — three parts, printed flat
${text}
PLATE = ${num(o.plate)};     // stamp backing
RELIEF = ${num(o.relief)};   // how proud the detail stands — 1.2-1.8 presses well
CLR = ${num(o.clearance)};   // bayonet clearance PER SIDE; under 0.25 will not turn
POST = 6; LUG = 2.2; LUGH = 2.4; BOSS_R = 11; BOSS_H = 14;

${lines.join("\n")}

${bladeModule(o)}

// ---- the cutter ----
${blades.join("\n")}

// ---- the stamp, set aside so both print flat on one plate ----
translate([${num(o.size * 1.15)}, 0, 0]) {
  difference() {
    union() {
      linear_extrude(PLATE) offset(delta = -0.5) polygon(o0);   // clears the blade
      translate([0,0,PLATE]) linear_extrude(RELIEF) union() {
${detail}
      }
      translate([0,0,PLATE]) cylinder(h = BOSS_H, r = BOSS_R);
    }
    translate([0,0,PLATE+2]) cylinder(h = BOSS_H, r = POST+CLR);
    for (a = [0,180]) rotate([0,0,a])
      translate([-(POST+LUG+CLR), -(2.4+CLR), PLATE+BOSS_H-LUGH-1.2])
        cube([POST+LUG+CLR, (2.4+CLR)*2, LUGH+2]);
    translate([0,0,PLATE+BOSS_H-LUGH*2-1.2-CLR])
      cylinder(h = LUGH+2*CLR, r = POST+LUG+CLR);
  }
}

// ---- the knob: quarter-turn bayonet, no threads, no supports ----
translate([${num(o.size * 2.1)}, 0, 0]) {
  cylinder(h = 10, r = 11);
  translate([0,0,10]) cylinder(h = 12, r = POST);
  for (a = [0,180]) rotate([0,0,a])
    translate([-(POST+LUG), -2.4, 19.5]) cube([POST+LUG, 4.8, LUGH]);
}
`;
}

// -------------------------------------------------------- 3. stencil sheet
export function stencilScad(loops, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const cols = Math.max(1, Math.round(o.cols ?? 4));
  const rows = Math.max(1, Math.round(o.rows ?? 3));
  const cell = num(o.cell ?? 26);
  const { lines, nSolid } = loopVars(loops, opts.tolerance);
  const motif = Array.from({ length: nSolid }, (_, i) => `      polygon(o${i});`).join("\n");
  // The motif is scaled to sit inside its cell with a margin, so neighbours
  // never merge into one another.
  return `// Stencil sheet — ${cols} x ${rows}
// ${cols * rows} motifs. The polygon boolean is what costs the time here:
// about 45 s at 24 motifs, so keep the grid small while you are iterating.
$fn = 32;
T = ${num(o.sheet)};      // 1.0-1.5mm: thinner warps, thicker blurs the powder edge
COLS = ${cols}; ROWS = ${rows}; PITCH = ${cell};
FIT = ${num((o.cell ?? 26) * 0.78 / (o.size || 70))};   // motif scaled into its cell

${lines.join("\n")}

module motif() {
  scale([FIT, FIT]) union() {
${motif}
  }
}

linear_extrude(T) difference() {
  translate([-PITCH*COLS/2, -PITCH*ROWS/2]) square([PITCH*COLS, PITCH*ROWS]);
  for (c = [0:COLS-1]) for (r = [0:ROWS-1])
    translate([-PITCH*COLS/2 + PITCH*(c+0.5), -PITCH*ROWS/2 + PITCH*(r+0.5)]) motif();
}
`;
}

// --------------------------------------------------------- 4. rolling stamp
export function rollerScad(loops, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const R = num(o.radius ?? 18);
  const len = num(o.length ?? 60);
  const around = Math.max(2, Math.round(o.around ?? 4));
  const along = Math.max(1, Math.round(o.along ?? 3));
  const { lines, nSolid } = loopVars(loops, opts.tolerance);
  const motif = Array.from({ length: nSolid }, (_, i) => `      polygon(o${i});`).join("\n");
  return `// Rolling stamp — ${around} around x ${along} along
// Circumference is 2*PI*R = ${num(2 * Math.PI * (o.radius ?? 18))}mm, so ${around} motifs
// land every ${num((2 * Math.PI * (o.radius ?? 18)) / around)}mm. Match the motif to
// that spacing or the pattern jumps where it wraps.
$fn = 48;
R = ${R}; LEN = ${len}; N = ${around}; M = ${along};
RELIEF = ${num(o.relief ?? 1.4)};
AXLE = ${num(o.axle ?? 4.2)};     // for a 4mm rod
FIT = ${num((o.motifFit ?? 12) / (o.size || 70))};

${lines.join("\n")}

module motif() {
  scale([FIT, FIT]) union() {
${motif}
  }
}

difference() {
  union() {
    rotate([0,90,0]) cylinder(h = LEN, r = R);
    for (i = [0:N-1]) rotate([i*360/N, 0, 0])
      for (k = [0:M-1])
        // sinks 0.5 INTO the barrel: resting exactly on it is the
        // coincident-face trap that leaves a hole
        translate([LEN/(M+1)*(k+1), 0, R-0.5]) linear_extrude(RELIEF) motif();
  }
  rotate([0,90,0]) translate([0,0,-1]) cylinder(h = LEN+2, r = AXLE/2);
}
`;
}

export const KINDS = [
  { id: "cutter", label: "Cutter", blurb: "blade + rim, the classic", make: cutterScad },
  { id: "stamp", label: "Cutter + stamp + knob", blurb: "three parts, twist-in handle", make: stampScad },
  { id: "stencil", label: "Stencil sheet", blurb: "repeating grid, cut through", make: stencilScad },
  { id: "roller", label: "Rolling stamp", blurb: "motif repeated around a roller", make: rollerScad },
];

// What the user is about to wait for, and why.
//
// Cost is driven by the number of SEPARATE pieces, not by point count. Measured
// on this kernel at 80 mm, after thinning: one blade 3.4 s, three 11.8 s, five
// 35 s. Thinning the outline from 1,430 points to 202 barely moved it; adding a
// fourth piece nearly doubles it.
//
// The answer is not to drop pieces — a multi-part icon that comes back missing
// its arms is the failure this whole file exists to avoid — so the answer is to
// say so first. A wait you were warned about is a wait; the same wait unannounced
// is a hang.
//
// OUTLINES and PIECES are different counts, and saying so wrongly is worse
// than saying nothing. A traced salmon comes in as four outlines — body, tail,
// fin, gill — that all overlap, so their blades fuse into ONE cutter. Counting
// outlines and calling them "4 cutters" told the user something false about
// what would come off the printer.
//
// Build cost still tracks OUTLINES, because each one is its own offset and
// boolean. So the two are reported separately: how long it will take comes
// from the outline count, how many cutters they get comes from the groups.
function pieceGroups(solid) {
  const box = (l) => {
    const xs = l.points.map((p) => p[0]), ys = l.points.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const boxes = solid.map(box);
  // Bounding boxes, not true polygon intersection: overlapping boxes on
  // outlines that do not quite touch would merge two groups into one and
  // UNDER-report the count. That is the safe direction to be wrong in — it
  // promises fewer separate cutters than you might get, never more.
  const parent = boxes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const hit = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (hit(boxes[i], boxes[j])) parent[find(i)] = find(j);
    }
  }
  return new Set(boxes.map((_, i) => find(i))).size;
}

export function pieceNote(loops) {
  const solid = (loops || []).filter((l) => !l.hole);
  const n = solid.length;
  if (n <= 1) return "";
  const groups = pieceGroups(solid);
  const slow = n >= 3
    ? " — the build grows steeply past three outlines (about 12 s for three, 35 s for five)"
    : "";
  if (groups === 1) return `${n} overlapping outlines that fuse into one cutter${slow}`;
  return `${n} outlines in ${groups} separate pieces — that is ${groups} cutters${slow}`;
}

export function makeKit(kind, loops, opts) {
  const k = KINDS.find((x) => x.id === kind);
  if (!k) throw new Error(`cutter: unknown kit "${kind}" — try ${KINDS.map((x) => x.id).join(", ")}`);
  return k.make(loops, opts);
}

// ----------------------------------------------- an outline already on the plate
//
// "Make a cutter from THIS" is the common case: the user traced a photo, or
// wrote an extrude, and wants a blade round what they already have. Both
// dialects spell a 2D outline the same way — polygon([[x,y], ...]) — so one
// reader covers BREPcode and OpenSCAD without knowing which it is looking at.
//
// Text, not geometry, on purpose. The alternative is slicing the built mesh at
// z, which needs the kernel, a built model, and a guess about which z is the
// interesting one. The source already says what the outline is.

// Balanced-paren scan. A regex cannot do this: point lists contain brackets and
// nested calls, and stopping at the first ")" truncates the outline — which
// would silently lose the tail of a shape, the exact failure this file exists
// to avoid.
function callArgs(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") { if (--depth === 0) return src.slice(open + 1, i); }
    else if (c === '"' || c === "'") { while (++i < src.length && src[i] !== c) if (src[i] === "\\") i++; }
  }
  return null;
}

const PAIR = /\[\s*(-?[\d.]+(?:e-?\d+)?)\s*,\s*(-?[\d.]+(?:e-?\d+)?)\s*\]/g;

const pointList = (text) => {
  // the first [[..],[..]] literal in the argument text, whatever precedes it
  const m = text.match(/\[\s*\[[\s\S]*\]\s*\]/);
  if (!m) return null;
  const pts = [];
  for (const pair of m[0].matchAll(PAIR)) {
    const x = +pair[1], y = +pair[2];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    pts.push([x, y]);
  }
  // ALL of them, or none. A point written as an expression — [W, 0], [0, S*2] —
  // cannot be read from text, and keeping the pairs that happen to be numeric
  // hands back an outline that is a different shape from the one on screen. So
  // if anything that looked like a point did not parse as one, decline and let
  // the caller fall back to icon search.
  if (/\[/.test(m[0].replace(PAIR, "").slice(1, -1))) return null;
  return pts.length >= 3 ? pts : null;
};

const inside = (pt, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1])
      && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi) hit = !hit;
  }
  return hit;
};

export function loopsFromCode(src) {
  if (typeof src !== "string") return [];
  const raw = [];
  for (const m of src.matchAll(/\bpolygon\s*\(/g)) {
    const args = callArgs(src, m.index + m[0].length - 1);
    const pts = args && pointList(args);
    if (pts) raw.push(pts);
  }
  if (!raw.length) return [];

  // Which loops are holes is decided by CONTAINMENT, not by reading the
  // difference() around them. A ring nested inside another is a hole at odd
  // depth and an island again at even depth, which is what an O inside a Q
  // needs — and it works the same whether the source spelled it as a
  // difference, a second module, or a list comprehension.
  return raw.map((pts) => {
    const depth = raw.reduce((n, other) =>
      other !== pts && inside(pts[0], other) ? n + 1 : n, 0);
    return { hole: depth % 2 === 1, points: pts };
  });
}

// Scale an outline so its longest side is `size` mm, keeping it centred. The
// generators take millimetres and do not rescale — a 500-unit SVG trace fed
// straight in produces a half-metre cutter with a 0.9 mm wall.
export function scaleLoops(loops, size) {
  if (!Array.isArray(loops) || !loops.length) return loops;
  if (!Number.isFinite(+size) || +size <= 0) throw new Error(`cutter: ${size} is not a size in mm`);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of loops) for (const [x, y] of l.points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0)) throw new Error("cutter: that outline has no size to scale");
  const k = +size / span, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return loops.map((l) => ({
    hole: l.hole,
    points: l.points.map(([x, y]) => [+((x - cx) * k).toFixed(3), +((y - cy) * k).toFixed(3)]),
  }));
}

// ------------------------------------------------------------- Iconify
//
// api.iconify.design serves ~200k icons and sends
// access-control-allow-origin: *, so the browser can fetch it directly with no
// key and no proxy. Verified against the live API.
export const ICONIFY = "https://api.iconify.design";

export async function searchIcons(query, { limit = 48, fetchImpl = fetch } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `${ICONIFY}/search?query=${encodeURIComponent(q)}&limit=${Math.min(999, limit)}`;
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error(`icon search failed (${r.status})`);
  const j = await r.json();
  return Array.isArray(j?.icons) ? j.icons : [];
}

// "mdi:heart" -> its SVG text. Solid, filled icons make good cutters; a
// stroke-only icon has no area to cut around and svgToLoops says so.
export async function iconSvg(name, { size = 256, fetchImpl = fetch } = {}) {
  const id = String(name || "").trim();
  if (!/^[\w.-]+:[\w.-]+$/.test(id)) {
    throw new Error(`"${name}" is not an icon id — they look like "mdi:heart"`);
  }
  const [prefix, icon] = id.split(":");
  const r = await fetchImpl(`${ICONIFY}/${prefix}/${icon}.svg?height=${size}`);
  if (!r.ok) throw new Error(`could not fetch ${id} (${r.status})`);
  const text = await r.text();
  if (!/<svg/i.test(text)) throw new Error(`${id} did not come back as an SVG`);
  return text;
}

// Many icons in a few requests: one per icon set, each carrying every icon
// asked of it. A search shows 48 cutters, and fetching 48 SVGs one by one is
// what gets a visitor rate-limited after their third search. Returns a Map of
// "set:name" -> SVG text; an icon the answer leaves out is simply not in it.
export async function iconSvgs(names, { fetchImpl = fetch } = {}) {
  const sets = new Map();
  for (const n of names || []) {
    const [prefix, icon, more] = String(n).split(":");
    if (more !== undefined || !/^[\w.-]+$/.test(prefix || "") || !/^[\w.-]+$/.test(icon || "")) continue;
    if (!sets.has(prefix)) sets.set(prefix, []);
    sets.get(prefix).push(icon);
  }
  const out = new Map();
  await Promise.all([...sets].map(async ([prefix, icons]) => {
    try {
      const r = await fetchImpl(`${ICONIFY}/${prefix}.json?icons=${icons.join(",")}`);
      if (!r.ok) return;
      const j = await r.json();
      for (const icon of icons) {
        const d = j?.icons?.[icon];
        if (typeof d?.body !== "string") continue;
        const box = [d.left ?? j.left ?? 0, d.top ?? j.top ?? 0, d.width ?? j.width ?? 16, d.height ?? j.height ?? 16];
        out.set(`${prefix}:${icon}`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(" ")}">${d.body}</svg>`);
      }
    } catch { /* that set is fetched icon by icon instead */ }
  }));
  return out;
}

export const iconPreview = (name, size = 48) => {
  const [prefix, icon] = String(name).split(":");
  return `${ICONIFY}/${prefix}/${icon}.svg?height=${size}`;
};
