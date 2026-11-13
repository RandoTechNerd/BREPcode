// The cookie-cutter front door (brepcode.com/cutter, ?cutter=1, and the Toolbox).
//
// Someone who arrives wanting a cookie cutter should see cookie cutters: a
// shelf of popular shapes, each a picture of the cutter it makes, one click
// from being on the plate. Under them, "Design your own": the icon search and
// the choice of kit (cutter, cutter and stamp, stencil, roller), which is the
// same card the Toolbox opens.
//
// The shapes are DRAWN HERE, from a few lines of arithmetic each, not traced
// from anyone's artwork: nothing to license, nothing to download, and each one
// is a single clean outline, which is what makes a cutter that prints first
// time. A star's points are rounded off a little and no neck is thinner than
// the blade can cut, for the same reason.
//
// PURE where it counts: EXAMPLES and previewSvg() touch no DOM, so the shapes
// are tested as geometry (closed, simple, a sensible size) and built through
// the real kernel in test/cutterkit.js.

const TAU = Math.PI * 2;
const round3 = (v) => +v.toFixed(3);
// a closed loop from a radius function of the angle
const polar = (r, n = 96, x = (a) => Math.cos(a), y = (a) => Math.sin(a)) =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU; const k = r(a); return [round3(k * x(a)), round3(k * y(a))]; });

function star() {
  // five points, the tips and the valleys rounded: a sharp tip tears dough
  const pts = [];
  const N = 5, R = 36, r = 16, steps = 6;
  for (let i = 0; i < N * 2; i++) {
    const a0 = (i / (N * 2)) * TAU + Math.PI / 2, rad = i % 2 ? r : R, soft = i % 2 ? 0.16 : 0.1;
    for (let s = -steps; s <= steps; s++) {
      const t = s / steps, a = a0 + t * soft;
      pts.push([round3(Math.cos(a) * rad * (1 - 0.06 * t * t)), round3(Math.sin(a) * rad * (1 - 0.06 * t * t))]);
    }
  }
  return pts;
}
// ROUND OUT, SHARP IN. Every shape here bulges outward in arcs and turns
// inward only at a corner. The exact kernel builds those in a fraction of a
// second; an outline that curves smoothly INWARD (the parametric heart, a
// cosine flower) makes it refuse the rim's cut, and the build falls back to
// the slow kernel: 5 s for the same cutter (measured, both ways).
function heart() {
  // two circles and a point: the lobes are arcs, the sides straight tangents
  const cx = 17, cy = 12, r = 17.5, tip = [0, -34], n = 16;
  // where the lobes meet, seen from the right one, stopped a little short:
  // the notch between them gets a small flat floor, not a knife-edge corner
  // (which the kernel refuses, and which would tear the dough anyway)
  const dip = Math.atan2(Math.sqrt(r * r - cx * cx), -cx) - 0.5;
  const d = Math.hypot(cx - tip[0], cy - tip[1]);
  const tan = Math.atan2(tip[1] - cy, tip[0] - cx) + Math.acos(r / d);         // where the right side leaves its lobe
  const right = Array.from({ length: n + 1 }, (_, i) => { const a = tan + (i / n) * (dip - tan); return [round3(cx + r * Math.cos(a)), round3(cy + r * Math.sin(a))]; });
  const left = right.slice(0, -1).reverse().map(([x, y]) => [round3(-x), y]);
  return [tip, ...right, ...left];
}
function flower() {
  // six round petals: arcs that meet at a corner between each pair
  const N = 6, R = 22, r = 13, n = 8;
  // from a petal's middle to just short of where it meets the next: a small
  // flat between petals, for the same reason as the heart's notch
  const half = Math.PI / 2 + Math.PI / N - Math.acos((R * Math.sin(Math.PI / N)) / r) - 0.28;
  const pts = [];
  for (let k = 0; k < N; k++) {
    const c = (k / N) * TAU;
    for (let j = -n; j <= n; j++) { const a = c + (j / n) * half; pts.push([round3(R * Math.cos(c) + r * Math.cos(a)), round3(R * Math.sin(c) + r * Math.sin(a))]); }
  }
  return pts;
}
const biscuit = () => polar((a) => 32 + 3 * Math.abs(Math.cos(6 * a)), 144);
const egg = () => polar(() => 1, 96, (a) => 27 * Math.cos(a), (a) => 36 * Math.sin(a) * (1 + 0.12 * Math.sin(a)) - 2);
function moon() {
  // a crescent: the outside of one circle, back along the inside of another
  const pts = [];
  const R = 34, r = 27, off = 15, n = 48;
  const a0 = Math.acos((off * off + R * R - r * r) / (2 * off * R));        // where the circles cross
  for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (TAU - 2 * a0); pts.push([round3(R * Math.cos(a)), round3(R * Math.sin(a))]); }
  const b0 = Math.atan2(R * Math.sin(-a0), R * Math.cos(-a0) - off);
  const b1 = Math.atan2(R * Math.sin(a0), R * Math.cos(a0) - off);
  // ...the LONG way round the inner circle, through its far side: the short
  // way closes the outline across the open mouth and makes a blob, not a moon
  const span = -(TAU - (b1 - b0));
  const m = 14;                                                             // few, flat facets: see ROUND OUT, SHARP IN
  for (let i = 1; i < m; i++) { const b = b0 + (i / m) * span; pts.push([round3(off + r * Math.cos(b)), round3(r * Math.sin(b))]); }
  return pts.map(([x, y]) => [round3(x - 6), y]);
}
function tree() {
  // three tiers and a trunk, right-hand side up then mirrored back down
  const right = [[5, -36], [5, -26], [27, -26], [12, -8], [21, -8], [8, 10], [15, 10], [0, 36]];
  const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
  return [...right, ...left];
}
function house() {
  return [[-28, -30], [28, -30], [28, 4], [34, 4], [0, 36], [-34, 4], [-28, 4]];
}
function cloud() {
  // a flat-bottomed cloud: lumps along the top
  return polar((a) => {
    const s = Math.sin(a);
    return s < -0.2 ? 30 / Math.max(0.55, -s * 1.6 + 0.2) * 0.62 : 26 + 6 * Math.abs(Math.cos(3.5 * a));
  }, 144, (a) => 1.35 * Math.cos(a), (a) => 0.85 * Math.sin(a));
}

// What is on the shelf. `loops` is the outline at about 70 mm, centred.
export const EXAMPLES = [
  { id: "star", label: "Star", blurb: "the one everyone starts with", make: star },
  { id: "heart", label: "Heart", blurb: "Valentine's, weddings, any day", make: heart },
  { id: "flower", label: "Flower", blurb: "six round petals", make: flower },
  { id: "tree", label: "Tree", blurb: "three tiers and a trunk", make: tree },
  { id: "moon", label: "Moon", blurb: "a crescent", make: moon },
  { id: "house", label: "House", blurb: "gingerbread, flat-packed", make: house },
  { id: "egg", label: "Egg", blurb: "Easter, or a plain oval", make: egg },
  { id: "biscuit", label: "Scalloped round", blurb: "the classic biscuit edge", make: biscuit },
].map((e) => ({ ...e, loops: [{ hole: false, points: e.make() }] }));

export const exampleById = (id) => EXAMPLES.find((e) => e.id === id) || null;

// A picture of what that outline makes, the way it sits on the printer's
// plate: the rim down, the blade standing on it, seen from above and in front.
// Drawn, not rendered, so it is on screen the moment a shape is clicked and
// follows every dial (blade height, handle, bars, kit) without a build.
//
// How it is drawn. The outline is laid down flat (squashed, as a circle seen
// at an angle is an ellipse) and split in two: the part of the wall whose
// OUTSIDE faces you, and the part whose inside does. Each is drawn again and
// again, a little higher each time, so the stack of thin lines IS the wall;
// the far half first and darker, the near half over it. A sideways gradient
// laid over each stack is the light: one bright band down the left shoulder,
// shade toward the right. The rim is the same trick with a fat round-jointed
// line, which is also why its corners come out rounded, as the real rim's are.
let previewSeq = 0;
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const DARK = "#141833";
const TURN = 0.17;                                     // how far round to the left the cutter is seen from
const RIMS = { none: 0, standard: 6, wide: 10, comfort: 6 };   // cutterkit's HANDLES, in mm

function bounds(src) {
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const l of src) for (const [x, y] of l.points) { lo = [Math.min(lo[0], x), Math.min(lo[1], y)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y)]; }
  return { lo, hi, w: hi[0] - lo[0], h: hi[1] - lo[1] };
}
const solidOf = (loops) => {
  const s = (loops || []).filter((l) => !l.hole && l.points?.length >= 3);
  return s.length ? s : (loops || []).slice(0, 1);
};
const svgOpen = (S, size, id) => `<svg viewBox="0 0 ${round3(S)} ${round3(S)}" width="${size}" height="${size}" fill="none" aria-hidden="true">`
  + `<defs><path id="${id}" `;

export function previewSvg(loops, { size = 132, tint = "#49b9c9", top = null, height = 15, handle = "standard", bars = 0, sharp = false, kind = "cutter", squash = 0.56 } = {}) {
  const flat = solidOf(loops);
  // Seen from a little to the left as well as from above. Head on, a wall that
  // runs front to back is edge on, a hairline, and the blade reads as a front
  // and a back with gaps between them. Turned, every wall has a face to show.
  // The turn is a shear of the outline (further back sits further right), so
  // everything below draws it exactly as it drew the outline before.
  const src = kind === "stencil" || kind === "roller" ? flat
    : flat.map((l) => ({ ...l, points: l.points.map(([x, y]) => [x + y * TURN, y]) }));
  const hiCol = top || mix(tint, "#ffffff", 0.35), loCol = tint;
  if (kind === "stencil") return stencilSvg(src, { size, tint: loCol });
  if (kind === "roller") return rollerSvg(src, { size, tint: loCol, top: hiCol });
  const { lo, hi, w, h } = bounds(src);
  // every measure below was tuned on a 70 mm outline: U carries it to any size
  const U = (Math.max(w, h) || 1) / 70;
  const SQ = Math.max(0.4, Math.min(0.9, +squash || 0.56));   // how flat the plate looks from here
  const H = Math.max(8, Math.min(30, +height || 15)) * 1.25 * U;
  const RIM = (RIMS[handle] ?? 6) * U, RIM_H = RIM ? 2.6 * U : 0;
  const WALL = 2.3 * U;
  const stamp = kind === "stamp";
  const lift = stamp ? 30 * U : 0;                   // room above for the stamp and its knob
  const d = h * SQ, pad = RIM + 6 * U;
  const W = w + pad * 2, T = d + H + lift + pad * 2 + 4 * U, S = Math.max(W, T);
  const ox = (S - W) / 2 + pad - lo[0], oy = (S - T) / 2 + pad + H + lift + hi[1] * SQ;
  const X = (x) => round3(x + ox), Y = (y) => round3(oy - y * SQ);
  const id = `ckp${++previewSeq}`;

  // the outline whole, and the blade as short pieces of wall, each knowing
  // whether its OUTSIDE faces you (near) or its inside does (far)
  let full = "";
  const walls = [];
  for (const l of src) {
    const p = l.points, n = p.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    full += p.map(([x, y], i) => `${i ? "L" : "M"}${X(x)} ${Y(y)}`).join("") + "Z";
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1];
      const near = area > 0 ? dx > 0 : dx < 0;
      // a long straight run is cut up, so each piece has one depth to be sorted by
      const k = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (10 * U)));
      for (let j = 0; j < k; j++) {
        walls.push({ near, a: [a[0] + (dx * j) / k, a[1] + (dy * j) / k], b: [a[0] + (dx * (j + 1)) / k, a[1] + (dy * (j + 1)) / k] });
      }
    }
  }
  // furthest first: each piece is painted over the ones behind it, so a wall
  // at the back never shows through one in front, whichever way either faces
  walls.sort((u, v) => (v.a[1] + v.b[1]) - (u.a[1] + u.b[1]));
  const up = (ref, z, attrs) => `<use href="#${id}${ref}" transform="translate(0 ${round3(-z)})" ${attrs}/>`;
  const x0 = X(lo[0]) - WALL, x1 = X(hi[0]) + WALL;
  const stop = (o, c, a) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`;
  let out = svgOpen(S, size, id) + `d="${full}"/>`
    + `<linearGradient id="${id}gn" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">`
    + stop(0, "#fff", 0) + stop(0.15, "#fff", 0.04) + stop(0.26, "#fff", 0.55) + stop(0.36, "#fff", 0.1) + stop(0.6, "#fff", 0) + stop(0.84, "#000", 0.12) + stop(1, "#000", 0.26) + `</linearGradient>`
    + `<linearGradient id="${id}gf" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">`
    + stop(0, "#000", 0.24) + stop(0.4, "#000", 0.04) + stop(0.72, "#fff", 0.16) + stop(1, "#fff", 0.02) + `</linearGradient>`
    + `<filter id="${id}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${round3(2.6 * U)}"/></filter>`
    + `<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${round3(S)}" height="${round3(S)}"><rect width="${round3(S)}" height="${round3(S)}" fill="#fff"/>${up("", RIM_H, 'fill="#000"')}</mask>`
    + `<clipPath id="${id}c"><use href="#${id}"/></clipPath></defs>`;
  const round = `stroke-linejoin="round" stroke-linecap="round"`;
  // its shadow on the plate, and the plate a little darker inside the ring
  out += `<use href="#${id}" transform="translate(${round3(3.5 * U)} ${round3(4.5 * U)})" stroke="rgba(18,20,36,.34)" stroke-width="${round3(2 * RIM + 5 * U)}" ${round} filter="url(#${id}b)"/>`;
  out += `<use href="#${id}" fill="rgba(18,20,36,.09)"/>`;
  // the rim, lying on the plate; the mask keeps it outside the blade
  if (RIM) {
    let rim = "";
    for (let i = 0; i <= 3; i++) rim += up("", (i / 3) * RIM_H, `stroke="${mix(mix(loCol, DARK, 0.42), mix(loCol, DARK, 0.12), i / 3)}" stroke-width="${round3(2 * RIM)}"`);
    rim += up("", RIM_H, `stroke="${mix(loCol, "#ffffff", 0.16)}" stroke-width="${round3(2 * RIM - 1.1 * U)}"`);
    // the light along its shoulder
    rim += `<use href="#${id}" transform="translate(${round3(-0.9 * U)} ${round3(-RIM_H - 0.5 * U)})" stroke="rgba(255,255,255,.34)" stroke-width="${round3(2 * RIM - 2.6 * U)}"/>`;
    rim += up("", RIM_H, `stroke="${mix(loCol, "#ffffff", 0.16)}" stroke-width="${round3(2 * RIM - 4.4 * U)}"`);
    if (handle === "comfort") {
      const t0 = RIM_H, t1 = RIM_H * 1.7, tw = 2 * RIM * 0.55;
      for (let i = 0; i <= 2; i++) rim += up("", t0 + (i / 2) * (t1 - t0), `stroke="${mix(loCol, DARK, 0.3 - 0.1 * i)}" stroke-width="${round3(tw)}"`);
      rim += up("", t1, `stroke="${mix(loCol, "#ffffff", 0.26)}" stroke-width="${round3(tw - 1.1 * U)}"`);
    }
    out += `<g mask="url(#${id}m)" ${round}>${rim}</g>`;
  }
  // centre bars, across the opening at the rim's height
  if (+bars > 0) {
    const BW = 4.6 * U, z = RIM_H || 2.6 * U;
    const strips = (dz, fill) => `<g transform="translate(0 ${round3(-dz)})" fill="${fill}">`
      + `<rect x="${X(lo[0])}" y="${Y(BW / 2)}" width="${round3(w)}" height="${round3(BW * SQ)}"/>`
      + (+bars > 1 ? `<path d="M${X(-BW / 2 + hi[1] * TURN)} ${Y(hi[1])}L${X(BW / 2 + hi[1] * TURN)} ${Y(hi[1])}L${X(BW / 2 + lo[1] * TURN)} ${Y(lo[1])}L${X(-BW / 2 + lo[1] * TURN)} ${Y(lo[1])}Z"/>` : "") + `</g>`;
    out += `<g clip-path="url(#${id}c)">${strips(0, mix(loCol, DARK, 0.36))}${strips(z, mix(loCol, "#ffffff", 0.14))}</g>`;
  }
  // THE BLADE. Each piece of wall is one four-sided patch from the plate to the
  // cutting edge, coloured rim to edge as a gradient spool prints, the inside
  // faces darker. A patch seen edge on would be nothing at all, so each is
  // outlined in its own colour: the wall has a thickness, and a blade that
  // runs straight at you is a post, not a gap.
  //
  // The light (a bright band down the left shoulder, shade to the right) is
  // laid over the whole blade in one piece, or it would step from patch to
  // patch. What it is laid through is the blade painted once more in black
  // and white, in the same back-to-front order: white where a near face is
  // what you end up seeing, black where something else is in front of it.
  const thick = `stroke-width="${round3(WALL * 0.8)}"`;
  const W2 = round3(S);
  let grads = "", blade = "", seenNear = "", seenFar = "", edgeNear = "", edgeFar = "";
  walls.forEach((wl, i) => {
    const ax = X(wl.a[0]), ay = Y(wl.a[1]), bx = X(wl.b[0]), by = Y(wl.b[1]);
    const shade = wl.near ? 0 : 0.36;
    const yb = round3((ay + by) / 2), g = `${id}w${i}`;
    const d = `d="M${ax} ${ay}L${bx} ${by}L${bx} ${round3(by - H)}L${ax} ${round3(ay - H)}Z"`;
    // rim to edge ACROSS the patch, square to its foot: on a wall that slants up
    // the picture the colour then runs level with the plate, and meets the
    // next patch's without a step
    const L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L, ny = (bx - ax) / L, reach = -H * ny;
    const run = Math.abs(reach) > 0.2 * H ? [ax, ay, ax + nx * reach, ay + ny * reach] : [0, yb, 0, yb - H];
    grads += `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${round3(run[0])}" y1="${round3(run[1])}" x2="${round3(run[2])}" y2="${round3(run[3])}"><stop offset="0" stop-color="${mix(loCol, DARK, shade)}"/><stop offset="1" stop-color="${mix(hiCol, DARK, shade)}"/></linearGradient>`;
    blade += `<path ${d} fill="url(#${g})" stroke="url(#${g})"/>`;
    seenNear += `<path ${d} fill="${wl.near ? "#fff" : "#000"}" stroke="${wl.near ? "#fff" : "#000"}"/>`;
    seenFar += `<path ${d} fill="${wl.near ? "#000" : "#fff"}" stroke="${wl.near ? "#000" : "#fff"}"/>`;
    const top = `M${ax} ${round3(ay - H)}L${bx} ${round3(by - H)}`;
    if (wl.near) edgeNear += top; else edgeFar += top;
  });
  const seen = (r, body) => `<mask id="${id}${r}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W2}" height="${W2}"><g ${round} ${thick}>${body}</g></mask>`;
  const light = (r) => `<rect width="${W2}" height="${W2}" fill="url(#${id}g${r})" mask="url(#${id}${r}m)"/>`;
  // the cutting edge, catching the light; brighter on the side that faces you
  const edge = (r, d, k) => (d ? `<path d="${d}" mask="url(#${id}${r}m)" stroke="${mix(hiCol, "#ffffff", k)}" stroke-width="${round3((sharp ? 0.8 : 1.3) * U)}"/>` : "");
  out += `<defs>${grads}${seen("n", seenNear)}${seen("f", seenFar)}</defs><g ${round}><g ${thick}>${blade}</g>${light("f")}${light("n")}${edge("f", edgeFar, 0.3)}`;
  // GLITTER: flake in the plastic, a soft glow each, a few caught square by
  // the light. Placed by a fixed scatter from the outline itself, so a shape's
  // picture is the same every time it is drawn.
  let seed = src[0].points.length * 7919 + Math.round(w * 131);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 40; i++) {
    const pts = src[Math.floor(rnd() * src.length)].points;
    const p = pts[Math.floor(rnd() * pts.length)], z = 1.5 * U + rnd() * (H - 3 * U);
    const x = round3(p[0] + ox + (rnd() - 0.5) * U), y = round3(oy - p[1] * SQ - z);
    if (i % 10 === 0) {
      const r = (1.5 + rnd() * 0.9) * U, k = 0.3 * U;
      out += `<path d="M${round3(x - r)} ${y}L${x} ${round3(y - k)}L${round3(x + r)} ${y}L${x} ${round3(y + k)}ZM${x} ${round3(y - r)}L${round3(x + k)} ${y}L${x} ${round3(y + r)}L${round3(x - k)} ${y}Z" fill="#fff" opacity=".9"/>`;
    } else {
      out += `<circle cx="${x}" cy="${y}" r="${round3((0.28 + rnd() * 0.36) * U)}" fill="#fff" opacity="${round3(0.3 + rnd() * 0.4)}"/>`;
    }
  }
  out += edge("n", edgeNear, 0.62) + `</g>`;
  out += `</g>`;
  // CUTTER + STAMP: the stamp hangs over the opening it drops into, knob up
  if (stamp) {
    const cx = (lo[0] + hi[0]) / 2 + ox, cy = oy - ((lo[1] + hi[1]) / 2) * SQ;
    const base = H + 9 * U, plate = 3 * U, K = 0.82;
    const lay = (z, attrs) => `<use href="#${id}" transform="translate(${round3(cx * (1 - K))} ${round3(cy * (1 - K) - z)}) scale(${K})" ${attrs}/>`;
    out += lay(base - 5 * U, `fill="rgba(18,20,36,.16)" filter="url(#${id}b)"`);
    for (let i = 0; i <= 3; i++) out += lay(base + (i / 3) * plate, `fill="${mix(hiCol, DARK, 0.34 - 0.08 * i)}"`);
    out += lay(base + plate, `fill="${mix(hiCol, "#ffffff", 0.18)}"`);
    const kr = 8.5 * U, kh = 12 * U, ky = cy - base - plate;
    out += `<path d="M${round3(cx - kr)} ${round3(ky)}v${round3(-kh)}h${round3(2 * kr)}v${round3(kh)}a${round3(kr)} ${round3(kr * SQ)} 0 0 1 ${round3(-2 * kr)} 0z" fill="${mix(loCol, DARK, 0.1)}"/>`
      + `<rect x="${round3(cx - kr)}" y="${round3(ky - kh)}" width="${round3(2 * kr)}" height="${round3(kh)}" fill="url(#${id}gn)"/>`
      + `<ellipse cx="${round3(cx)}" cy="${round3(ky - kh)}" rx="${round3(kr)}" ry="${round3(kr * SQ)}" fill="${mix(loCol, "#ffffff", 0.3)}"/>`;
  }
  return out + `</svg>`;
}

// the outline as one filled path, k times its size, centred on (cx, cy)
function motif(src, k, cx, cy, ky = k) {
  const { lo, hi } = bounds(src);
  const mx = (lo[0] + hi[0]) / 2, my = (lo[1] + hi[1]) / 2;
  return src.map((l) => l.points.map(([x, y], i) => `${i ? "L" : "M"}${round3(cx + (x - mx) * k)} ${round3(cy - (y - my) * ky)}`).join("") + "Z").join("");
}

// A stencil sheet: a thin plate lying flat, the shape cut through it in rows.
function stencilSvg(src, { size, tint }) {
  const { w, h } = bounds(src);
  const S = 100, SQ = 0.56, cols = 4, rows = 3, pitch = 20, id = `ckp${++previewSeq}`;
  const sw = cols * pitch + 6, sd = (rows * pitch + 6) * SQ, x = (S - sw) / 2, y = (S - sd) / 2 + 2;
  const k = (pitch * 0.74) / (Math.max(w, h) || 1);
  let holes = "";
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) holes += motif(src, k, x + 3 + pitch * (c + 0.5), y + (3 + pitch * (r + 0.5)) * SQ, k * SQ);
  const sheet = (dy, fill) => `<rect x="${x}" y="${round3(y - dy)}" width="${sw}" height="${round3(sd)}" rx="3" fill="${fill}"/>`;
  return svgOpen(S, size, id) + `d="${holes}"/><filter id="${id}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>`
    + `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="${mix(tint, "#ffffff", 0.34)}"/><stop offset="1" stop-color="${mix(tint, DARK, 0.1)}"/></linearGradient></defs>`
    + `<rect x="${x + 3}" y="${round3(y + 4)}" width="${sw}" height="${round3(sd)}" rx="3" fill="rgba(18,20,36,.3)" filter="url(#${id}b)"/>`
    + sheet(0, mix(tint, DARK, 0.4)) + sheet(1.6, `url(#${id}g)`)
    + `<use href="#${id}" transform="translate(0 -1.1)" fill="${mix(tint, DARK, 0.5)}"/><use href="#${id}" transform="translate(0 -0.2)" fill="#e9e6e1"/>`
    + `<rect x="${x}" y="${round3(y - 1.6)}" width="${sw}" height="${round3(sd)}" rx="3" stroke="rgba(255,255,255,.45)" stroke-width=".6"/></svg>`;
}

// A rolling stamp: a barrel on its side, the shape standing proud around it.
function rollerSvg(src, { size, tint, top }) {
  const { w, h } = bounds(src);
  const S = 100, R = 19, L = 68, x = (S - L) / 2 - 3, cy = 52, id = `ckp${++previewSeq}`;
  const k = 15 / (Math.max(w, h) || 1);
  let marks = "";
  for (const a of [-52, 0, 52]) {
    const s = Math.sin((a * Math.PI) / 180), c = Math.cos((a * Math.PI) / 180);
    for (let i = 0; i < 3; i++) marks += motif(src, k, x + (L / 4) * (i + 1), cy - R * s, k * c);
  }
  return svgOpen(S, size, id) + `d="${marks}"/><filter id="${id}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>`
    + `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(tint, DARK, 0.18)}"/><stop offset=".24" stop-color="${mix(tint, "#ffffff", 0.42)}"/><stop offset=".5" stop-color="${tint}"/><stop offset="1" stop-color="${mix(tint, DARK, 0.5)}"/></linearGradient>`
    + `<clipPath id="${id}c"><rect x="${x}" y="${cy - R}" width="${L}" height="${R * 2}"/></clipPath></defs>`
    + `<ellipse cx="50" cy="${cy + R + 3}" rx="${L / 2 + 4}" ry="5" fill="rgba(18,20,36,.34)" filter="url(#${id}b)"/>`
    + `<ellipse cx="${x}" cy="${cy}" rx="6" ry="${R}" fill="${mix(tint, DARK, 0.4)}"/>`
    + `<rect x="${x}" y="${cy - R}" width="${L}" height="${R * 2}" fill="url(#${id}g)"/>`
    + `<g clip-path="url(#${id}c)"><use href="#${id}" transform="translate(.7 .9)" fill="${mix(tint, DARK, 0.5)}"/><use href="#${id}" fill="${mix(top, "#ffffff", 0.3)}"/></g>`
    + `<ellipse cx="${x + L}" cy="${cy}" rx="6" ry="${R}" fill="${mix(tint, "#ffffff", 0.22)}"/>`
    + `<ellipse cx="${x + L}" cy="${cy}" rx="1.5" ry="4.4" fill="${mix(tint, DARK, 0.7)}"/></svg>`;
}

// rim colour, edge colour: gradient spools, one pair a card
const TINTS = [
  ["#7a4fd8", "#3cc8bd"], ["#d8457a", "#ffb07a"], ["#3f6fe0", "#b46ff0"], ["#1f8a5a", "#b7e36a"],
  ["#2b2f6e", "#f0c64a"], ["#c8572f", "#ffd27a"], ["#6a4fd8", "#ff8fc0"], ["#b03a6a", "#ffc2a8"],
];
const tintOf = (i) => ({ tint: TINTS[i % TINTS.length][0], top: TINTS[i % TINTS.length][1] });

// A searched shape is one nobody has seen before, so its card looks down on
// it from higher up, over a lower wall: the outline has to read first. The
// shelf's shapes are known at a glance and keep the showier low angle.
const FOUND_VIEW = { squash: 0.78, height: 8 };

const STUDIO = "radial-gradient(120% 95% at 50% 12%, #ffffff 0%, #f4f2ef 46%, #dfdcd6 100%)";
const CSS = `
#ck-door { position: fixed; inset: 0; z-index: 100200; display: flex; align-items: center; justify-content: center;
  background: rgba(6, 8, 14, .68); backdrop-filter: blur(10px) saturate(1.2); padding: 18px; }
#ck-door .ck-box { width: min(1120px, 100%); height: min(820px, 100%); display: flex; flex-direction: column; border-radius: 22px; overflow: hidden;
  background: linear-gradient(180deg, #171d2c 0%, #10141f 100%); color: #e9eefb; border: 1px solid rgba(255, 255, 255, .09);
  box-shadow: 0 40px 120px rgba(0, 0, 0, .62), inset 0 1px 0 rgba(255, 255, 255, .07); font: 14px system-ui, sans-serif; }
#ck-door .ck-head { display: flex; align-items: center; gap: 18px; padding: 18px 22px 16px; border-bottom: 1px solid rgba(255, 255, 255, .07); flex: none; }
#ck-door .ck-title { flex: none; }
#ck-door h2 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -.01em; }
#ck-door .ck-sub { color: #93a1bd; margin: 2px 0 0; font-size: 12.5px; }
#ck-door .ck-search { flex: 1; position: relative; min-width: 0; }
#ck-door .ck-search svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #93a1bd; pointer-events: none; }
#ck-door .ck-q { width: 100%; box-sizing: border-box; height: 44px; border-radius: 14px; padding: 0 14px 0 42px; font: 15px system-ui, sans-serif;
  color: #f2f5fd; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .11); outline: none; transition: border-color .15s, box-shadow .15s, background .15s; }
#ck-door .ck-q::placeholder { color: #7f8dab; }
#ck-door .ck-q:focus { border-color: #7f9bff; background: rgba(255, 255, 255, .09); box-shadow: 0 0 0 4px rgba(96, 130, 255, .2); }
#ck-door .ck-x { flex: none; width: 36px; height: 36px; border-radius: 12px; border: 0; background: rgba(255, 255, 255, .06); color: #b8c3da; font-size: 20px; cursor: pointer; line-height: 1; }
#ck-door .ck-x:hover { background: rgba(255, 255, 255, .13); color: #fff; }
#ck-door .ck-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 356px; }
#ck-door .ck-left { min-height: 0; overflow: auto; padding: 16px 20px 20px 22px; }
#ck-door .ck-bar { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; min-height: 26px; color: #93a1bd; font-size: 12.5px; }
#ck-door .ck-bar b { color: #e9eefb; font-size: 13px; font-weight: 650; }
#ck-door .ck-chip { border: 1px solid rgba(255, 255, 255, .14); background: transparent; color: #cfd8ec; border-radius: 999px; padding: 4px 11px; font: 600 12px system-ui, sans-serif; cursor: pointer; }
#ck-door .ck-chip:hover { background: rgba(255, 255, 255, .08); }
#ck-door .ck-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 14px; }
#ck-door .ck-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 8px 11px; cursor: pointer;
  border-radius: 18px; border: 0; background: ${STUDIO}; color: #1b2230; font: inherit;
  box-shadow: 0 1px 0 rgba(255, 255, 255, .9) inset, 0 8px 22px rgba(0, 0, 0, .34);
  transition: transform .16s cubic-bezier(.2, .8, .2, 1), box-shadow .16s ease; }
#ck-door .ck-card:hover, #ck-door .ck-card:focus-visible { transform: translateY(-3px); outline: none;
  box-shadow: 0 1px 0 rgba(255, 255, 255, .9) inset, 0 16px 34px rgba(0, 0, 0, .46); }
#ck-door .ck-card[aria-pressed="true"] { box-shadow: 0 0 0 3px #7f9bff, 0 0 0 7px rgba(110, 140, 255, .24), 0 16px 34px rgba(0, 0, 0, .46); }
#ck-door .ck-card svg, #ck-door .ck-card canvas, #ck-door .ck-card .ck-wait { width: 132px; height: 132px; }
#ck-door .ck-thumb, #ck-door .ck-pic { display: contents; }
#ck-door .ck-card .ck-wait { display: block; border-radius: 14px; background: linear-gradient(100deg, rgba(27, 34, 48, .05) 30%, rgba(27, 34, 48, .12) 50%, rgba(27, 34, 48, .05) 70%) 0 0 / 300% 100%; animation: ck-wait 1.1s linear infinite; }
@keyframes ck-wait { to { background-position: -150% 0; } }
#ck-door .ck-card b { font-size: 13.5px; font-weight: 650; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ck-door .ck-card small { font-size: 11.5px; color: #636d7d; text-align: center; }
#ck-door .ck-card.ck-bad { opacity: .38; cursor: not-allowed; transform: none; }
#ck-door .ck-empty { color: #93a1bd; padding: 40px 10px; text-align: center; }
#ck-door .ck-hero { min-height: 0; overflow: auto; padding: 16px 22px 18px 16px; border-left: 1px solid rgba(255, 255, 255, .07); background: rgba(255, 255, 255, .025);
  display: flex; flex-direction: column; gap: 12px; }
#ck-door .ck-stage { position: relative; flex: none; border-radius: 20px; background: ${STUDIO}; display: flex; align-items: center; justify-content: center;
  aspect-ratio: 1 / .78; box-shadow: 0 1px 0 rgba(255, 255, 255, .9) inset, 0 14px 34px rgba(0, 0, 0, .42); overflow: hidden; }
#ck-door .ck-stage svg, #ck-door .ck-stage canvas { width: auto; height: 100%; max-width: 100%; }
#ck-door .ck-tag { position: absolute; left: 12px; bottom: 10px; right: 12px; display: flex; justify-content: space-between; gap: 8px;
  font: 600 11px system-ui, sans-serif; color: #4d5766; white-space: nowrap; }
#ck-door .ck-name { font-size: 17px; font-weight: 700; margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ck-door .ck-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
#ck-door .ck-kinds button { text-align: left; min-width: 0; border: 1px solid rgba(255, 255, 255, .11); background: rgba(255, 255, 255, .03); color: #e9eefb;
  border-radius: 12px; padding: 7px 10px; font: 600 12.5px system-ui, sans-serif; cursor: pointer; }
#ck-door .ck-kinds button:hover { background: rgba(255, 255, 255, .08); }
#ck-door .ck-kinds button[aria-pressed="true"] { background: linear-gradient(180deg, #6f8dff, #4f6ef0); border-color: transparent; color: #fff; box-shadow: 0 6px 16px rgba(79, 110, 240, .4); }
#ck-door .ck-kinds small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 400; font-size: 10.5px; opacity: .78; margin-top: 1px; }
#ck-door .ck-opts { display: grid; grid-template-columns: auto 1fr auto; gap: 7px 10px; align-items: center; font-size: 12.5px; color: #b8c3da; }
#ck-door .ck-opts output { color: #e9eefb; font-variant-numeric: tabular-nums; min-width: 46px; text-align: right; }
#ck-door .ck-opts input[type=range] { width: 100%; accent-color: #7f9bff; }
#ck-door .ck-opts select { grid-column: 2 / 4; background: rgba(255, 255, 255, .06); color: #e9eefb; border: 1px solid rgba(255, 255, 255, .11); border-radius: 9px; padding: 5px 8px; font: inherit; }
#ck-door .ck-opts select option { color: #111; }
#ck-door .ck-checks { grid-column: 1 / 4; display: flex; gap: 16px; }
#ck-door .ck-checks label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
#ck-door .ck-checks input { accent-color: #7f9bff; }
#ck-door [data-cutter-only][hidden] { display: none; }
#ck-door .ck-make { margin-top: auto; border: 0; border-radius: 14px; padding: 13px 16px; font: 700 15px system-ui, sans-serif; cursor: pointer; color: #fff;
  background: linear-gradient(180deg, #7391ff, #4a68ee); box-shadow: 0 10px 26px rgba(74, 104, 238, .45), inset 0 1px 0 rgba(255, 255, 255, .3); transition: transform .12s, filter .12s; }
#ck-door .ck-make:hover { filter: brightness(1.08); transform: translateY(-1px); }
#ck-door .ck-note { color: #93a1bd; font-size: 11.5px; line-height: 1.45; margin: 0; }
#ck-door .ck-own { display: flex; gap: 8px; }
#ck-door .ck-ghost { flex: 1; border: 1px solid rgba(255, 255, 255, .13); border-radius: 11px; padding: 8px 10px; font: 600 12.5px system-ui, sans-serif;
  cursor: pointer; background: transparent; color: #cfd8ec; }
#ck-door .ck-ghost:hover { background: rgba(255, 255, 255, .08); }
@media (max-width: 860px) {
  #ck-door { padding: 0; }
  #ck-door .ck-box { height: 100%; border-radius: 0; }
  #ck-door .ck-head { flex-wrap: wrap; gap: 10px; padding: 12px 14px; }
  #ck-door .ck-title { flex: 1; } #ck-door .ck-sub { display: none; }
  #ck-door .ck-search { order: 3; flex-basis: 100%; }
  #ck-door .ck-main { display: flex; flex-direction: column; overflow: auto; }
  #ck-door .ck-left, #ck-door .ck-hero { overflow: visible; padding: 14px; }
  #ck-door .ck-hero { order: -1; border-left: 0; border-bottom: 1px solid rgba(255, 255, 255, .07); }
  #ck-door .ck-stage { aspect-ratio: 1 / .62; } #ck-door .ck-stage svg, #ck-door .ck-stage canvas { width: auto; height: 100%; }
  #ck-door .ck-grid { grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); }
  #ck-door .ck-card svg, #ck-door .ck-card canvas, #ck-door .ck-card .ck-wait { width: 104px; height: 104px; }
}
`;

const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// "mdi:cat-outline" -> "Cat outline"
const iconLabel = (name) => { const t = String(name).split(":").pop().replace(/[-_]+/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

// What each searched drawing traced to, kept for as long as the page is open:
// searching "cat" a second time, or reopening the window, draws at once.
const TRACED = new Map();                                // icon name -> { loops, drawn, cut } or an Error

// showCutterDoor({ kinds, kind, handles, bars, opts, tools, focusSearch, onMake, onPicture }) -> { close }
//   One window: the search along the top, the shelf (or what the search found)
//   on the left, each shape already drawn as the cutter it makes, and on the
//   right the chosen one large, with the kit and the dials. Nothing is built
//   until "Make it"; the picture follows every dial at once.
//   kinds / handles / bars: cutterkit's KINDS, HANDLES and BARS.
//   opts: the remembered { height, sharp, handle, bars, mirror }.
//   tools: { searchIcons, iconSvg, iconPreview, svgToLoops, scaleLoops } (cutterkit.js and svg.js),
//     and outline(loops, { detail }) (cutteroutline.js): a drawing's ink, at the size it
//     will be printed, to the silhouette a cutter goes round. Without it loops pass as they are.
//     render3d(loops, opts) -> a canvas (or a promise of one), or null: the cutter itself in
//     miniature (cutterview.js). Without it, or where it answers null, the drawing stays.
//   onMake({ loops, label, kind, size, opts }): loops are at `size` mm.
export function showCutterDoor({ kinds = [], kind = null, handles = [], bars = [], opts = {}, tools = {}, focusSearch = false, onMake, onPicture } = {}) {
  const st = {
    kind: kind || kinds[0]?.id || "cutter", size: 70,
    height: Number.isFinite(+opts.height) ? +opts.height : 15, sharp: !!opts.sharp, mirror: !!opts.mirror,
    handle: opts.handle || "standard", bars: +opts.bars || 0,
    sel: { key: EXAMPLES[0].id, label: EXAMPLES[0].label, loops: EXAMPLES[0].loops, n: 0 },
  };
  document.getElementById("ck-door")?.remove();
  if (!document.getElementById("ck-door-css")) {
    const css = document.createElement("style");
    css.id = "ck-door-css";
    css.textContent = CSS;
    document.head.appendChild(css);
  }
  const el = document.createElement("div");
  el.id = "ck-door";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Cookie cutters");
  const options = (list, cur) => list.map((o) => `<option value="${escHtml(o.id)}"${String(o.id) === String(cur) ? " selected" : ""}>${escHtml(o.blurb ? `${o.label}: ${o.blurb}` : o.label)}</option>`).join("");
  el.innerHTML = `<div class="ck-box">
    <div class="ck-head">
      <div class="ck-title"><h2>Cookie cutters</h2><p class="ck-sub">Pick a shape or search for one. Make it when it looks right.</p></div>
      <label class="ck-search"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5 14 14"/></svg>
        <input class="ck-q" type="search" placeholder="Search thousands of shapes: dinosaur, cat, snowflake, rocket…" autocomplete="off" spellcheck="false" aria-label="Search shapes" /></label>
      <button type="button" class="ck-x" title="Close (Esc)" aria-label="Close">×</button>
    </div>
    <div class="ck-main">
      <div class="ck-left"><div class="ck-bar"></div><div class="ck-grid" aria-live="polite"></div></div>
      <div class="ck-hero">
        <div class="ck-stage"><div class="ck-pic"></div><div class="ck-tag"><span class="ck-dims"></span><span>rim down, no supports</span></div></div>
        <p class="ck-name"></p>
        <div class="ck-kinds" role="group" aria-label="What to make">${kinds.map((k) => `<button type="button" data-kind="${escHtml(k.id)}" aria-pressed="${k.id === st.kind}">${escHtml(k.label)}<small>${escHtml(k.blurb)}</small></button>`).join("")}</div>
        <div class="ck-opts">
          <span>Size</span><input type="range" data-o="size" min="30" max="160" value="${st.size}" aria-label="Size" /><output data-out="size"></output>
          <span data-cutter-only>Blade</span><input data-cutter-only type="range" data-o="height" min="8" max="30" step="0.5" value="${st.height}" aria-label="Blade height" /><output data-cutter-only data-out="height"></output>
          <span data-cutter-only>Handle</span><select data-cutter-only data-o="handle" aria-label="Handle">${options(handles, st.handle)}</select>
          <span data-cutter-only data-bars>Bars</span><select data-cutter-only data-bars data-o="bars" aria-label="Centre bars">${options(bars, st.bars)}</select>
          <div class="ck-checks"><label data-cutter-only><input type="checkbox" data-o="sharp"${st.sharp ? " checked" : ""} /> Sharp edge</label><label><input type="checkbox" data-o="mirror"${st.mirror ? " checked" : ""} /> Mirror</label></div>
        </div>
        <button type="button" class="ck-make">Make it</button>
        <div class="ck-own">
          <button type="button" class="ck-ghost" data-act="svg" title="A shape you drew: any SVG with a filled outline">Open an SVG</button>
          <button type="button" class="ck-ghost" data-act="pic" title="A photo or a drawing (PNG, JPG): it is traced to an outline first">Trace a picture</button>
        </div>
        <p class="ck-note">Size, blade, edge, handle and bars stay editable as numbers in the code after it is made.</p>
        <input type="file" class="ck-file" accept=".svg,image/svg+xml" hidden />
      </div>
    </div>
  </div>`;
  const q = (s) => el.querySelector(s);
  const grid = q(".ck-grid"), bar = q(".ck-bar"), input = q(".ck-q");
  let seq = 0, timer = 0, closed = false;
  const close = () => { closed = true; seq++; clearTimeout(timer); removeEventListener("keydown", onKey, true); el.remove(); };
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (input.value) { input.value = ""; showShelf(); } else close();
  };
  addEventListener("keydown", onKey, true);

  const flip = (loops) => loops.map((l) => ({ ...l, points: l.points.map(([x, y]) => [x === 0 ? 0 : -x, y]).reverse() }));
  const cutterish = () => st.kind === "cutter" || st.kind === "stamp";
  // What will be made: a shelf shape as it is; a drawing (a searched icon,
  // an SVG) as its silhouette AT THIS SIZE, since what is too thin to print
  // depends on how big it is. Kept per selection, so a dial does not redo it.
  function shaped(sel = st.sel, size = st.size, detail = st.kind === "stamp") {
    const scaled = () => (tools.scaleLoops ? tools.scaleLoops(sel.loops, size) : sel.loops);
    if (!sel.drawn || !tools.outline) return scaled();
    const key = `${size}|${detail}`;
    if (sel.cut?.key !== key) sel.cut = { key, loops: tools.outline(scaled(), { detail }) };
    return sel.cut.loops;
  }
  // A PICTURE OF THE CUTTER, in `holder`. The drawing is there at once; the
  // rendered miniature (the real blade, rim and connectors, lit) replaces it
  // as soon as it is ready. A holder already showing a render keeps it until
  // the next one lands, so a dial being dragged does not flicker to a drawing
  // and back. A later call for the same holder wins over an earlier one.
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  function picture(holder, loops, o) {
    const mine = (holder.ckSeq = (holder.ckSeq || 0) + 1);
    const drawn = () => { holder.innerHTML = previewSvg(loops, o); };
    if (!holder.querySelector("canvas")) drawn();
    if (!tools.render3d) return Promise.resolve();
    return Promise.resolve().then(() => tools.render3d(loops, { ...o, px: Math.round((o.size || 132) * dpr), high: (o.squash || 0) > 0.7 }))
      .then((cv) => { if (holder.ckSeq !== mine) return; if (cv) holder.replaceChildren(cv); else drawn(); })
      .catch(() => { if (holder.ckSeq === mine) drawn(); });
  }
  function paintHero() {
    const cut = shaped();
    const loops = st.mirror ? flip(cut) : cut;
    picture(q(".ck-pic"), loops, { size: 320, ...tintOf(st.sel.n), height: st.height, handle: st.handle, bars: st.kind === "cutter" ? st.bars : 0, sharp: st.sharp, kind: st.kind });
    const { w, h } = bounds(solidOf(cut));
    const k = 1;
    q(".ck-dims").textContent = cutterish() ? `${Math.round(w * k)} × ${Math.round(h * k)} × ${st.height} mm` : `from a ${st.size} mm outline`;
    q(".ck-name").textContent = st.sel.label;
    q('[data-out="size"]').textContent = `${st.size} mm`;
    q('[data-out="height"]').textContent = `${st.height} mm`;
    for (const n of el.querySelectorAll("[data-cutter-only]")) n.hidden = !cutterish();
    for (const n of el.querySelectorAll("[data-bars]")) n.hidden = st.kind !== "cutter";   // a stamp drops through the opening
    q(".ck-make").textContent = `Make this ${(kinds.find((k2) => k2.id === st.kind)?.label || "cutter").toLowerCase()}`;
    for (const c of grid.querySelectorAll(".ck-card")) c.setAttribute("aria-pressed", String(c.dataset.key === st.sel.key));
  }
  const select = (sel) => { st.sel = sel; paintHero(); };
  function make() {
    const loops = shaped();
    if (!loops.some((l) => !l.hole)) return;
    close();
    onMake?.({ loops, label: st.sel.label, kind: st.kind, size: st.size, opts: { height: st.height, sharp: st.sharp, handle: st.handle, bars: st.bars, mirror: st.mirror } });
  }

  function showShelf() {
    seq++;
    bar.innerHTML = `<b>Popular shapes</b><span>one outline each, so they print first time</span>`;
    grid.innerHTML = EXAMPLES.map((e, i) => `<button type="button" class="ck-card" data-key="${e.id}" data-ex="${e.id}" data-n="${i}"><span class="ck-thumb"></span><b>${e.label}</b><small>${e.blurb}</small></button>`).join("");
    const mine = seq;
    // one after another: the window stays live, and the first row is first
    (async () => {
      for (const card of grid.querySelectorAll(".ck-card")) {
        if (mine !== seq) return;
        await picture(card.querySelector(".ck-thumb"), exampleById(card.dataset.ex).loops, tintOf(+card.dataset.n));
      }
    })();
    paintHero();
  }

  // what a search found, each one fetched and traced in turn so its card
  // becomes a picture of the cutter rather than of the icon
  const fetched = new Map();                             // icon name -> its SVG text, when a search fetched it in bulk
  const asDrawn = (loops) => {
    const sel = { loops, drawn: true };
    if (!shaped(sel, 70, false).some((l) => !l.hole)) throw new Error("too thin all over to print as a cutter");
    return sel;
  };
  async function trace(name) {
    if (!TRACED.has(name)) {
      let text;
      // not fetched is not the same as not usable: it is not remembered, so the next look tries again
      try { text = fetched.get(name) ?? await tools.iconSvg(name); }
      catch (err) { const e = err instanceof Error ? err : new Error(String(err)); e.offline = true; return e; }
      try { TRACED.set(name, asDrawn(await tools.svgToLoops(text, { maxSize: 70 }))); }
      catch (err) { TRACED.set(name, err instanceof Error ? err : new Error(String(err))); }
    }
    return TRACED.get(name);
  }
  async function runSearch(text) {
    const mine = ++seq;
    bar.innerHTML = `<b>Searching…</b>`;
    let names = [];
    try { names = await tools.searchIcons(text, { limit: 48 }); }
    catch (err) { if (mine === seq) { bar.innerHTML = `<b>Search did not answer</b><span>${escHtml(err.message || err)}</span><button type="button" class="ck-chip" data-shelf>Popular shapes</button>`; grid.innerHTML = ""; } return; }
    if (mine !== seq) return;
    bar.innerHTML = `<b>${names.length ? `${names.length} shapes for “${escHtml(text)}”` : `Nothing for “${escHtml(text)}”`}</b><span>${names.length ? "each drawn as the cutter it makes" : "try a plainer word"}</span><button type="button" class="ck-chip" data-shelf>Popular shapes</button>`;
    grid.innerHTML = names.map((n, i) => `<button type="button" class="ck-card" data-key="${escHtml(n)}" data-icon="${escHtml(n)}" data-n="${i}" title="${escHtml(n)}"><i class="ck-wait"></i><b>${escHtml(iconLabel(n))}</b><small>${escHtml(n.split(":")[0])}</small></button>`).join("")
      || `<div class="ck-empty">No shapes by that name. Try “cat”, “leaf” or “car”.</div>`;
    const cards = [...grid.querySelectorAll(".ck-card")];
    // every drawing in a handful of requests (one per icon set), not one each
    const need = names.filter((n) => !TRACED.has(n) && !fetched.has(n));
    if (need.length && tools.iconSvgs) {
      try { for (const [n, svg] of await tools.iconSvgs(need)) fetched.set(n, svg); } catch { /* one by one, below */ }
      if (mine !== seq) return;
    }
    const count = () => { const b = bar.querySelector("b"); if (b) b.textContent = `${grid.querySelectorAll(".ck-card").length} shapes for “${text}”`; };
    let next = 0;
    const worker = async () => {
      while (mine === seq && next < cards.length) {
        const card = cards[next++], got = await trace(card.dataset.icon);
        if (mine !== seq) return;
        // nothing printable in it (an empty drawing, hairlines): it leaves the shelf
        if (got instanceof Error) { card.remove(); count(); continue; }
        const thumb = document.createElement("span");
        thumb.className = "ck-thumb";
        card.querySelector(".ck-wait").replaceWith(thumb);
        await picture(thumb, shaped(got, 70, false), { ...tintOf(+card.dataset.n), ...FOUND_VIEW });
        await new Promise((r) => setTimeout(r));          // the window stays live while 48 are drawn
      }
    };
    for (let i = 0; i < 4; i++) worker();
  }
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (!text) { showShelf(); return; }
    timer = setTimeout(() => runSearch(text), 320);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    clearTimeout(timer);
    if (input.value.trim()) runSearch(input.value.trim());
  });

  el.addEventListener("click", async (e) => {
    if (e.target === el || e.target.closest(".ck-x")) { close(); return; }
    if (e.target.closest("[data-shelf]")) { input.value = ""; showShelf(); return; }
    const k = e.target.closest(".ck-kinds button");
    if (k) {
      st.kind = k.dataset.kind;
      for (const b of el.querySelectorAll(".ck-kinds button")) b.setAttribute("aria-pressed", String(b === k));
      paintHero();
      return;
    }
    const card = e.target.closest(".ck-card");
    if (card) {
      if (card.classList.contains("ck-bad")) return;
      if (card.dataset.key === st.sel.key) { make(); return; }     // a second click on the chosen one makes it
      if (card.dataset.ex) { const ex = exampleById(card.dataset.ex); select({ key: ex.id, label: ex.label, loops: ex.loops, n: +card.dataset.n }); return; }
      const name = card.dataset.icon, got = await trace(name);
      if (closed || got instanceof Error) return;
      select({ ...got, key: name, label: iconLabel(name), n: +card.dataset.n });
      return;
    }
    if (e.target.closest(".ck-make")) { make(); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "svg") q(".ck-file").click();
    if (act === "pic") { close(); onPicture?.(); }
  });
  el.addEventListener("input", (e) => {
    const o = e.target.dataset?.o;
    if (!o) return;
    if (o === "sharp" || o === "mirror") st[o] = e.target.checked;
    else if (o === "handle") st.handle = e.target.value;
    else st[o] = +e.target.value;
    paintHero();
  });
  q(".ck-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const label = file.name.replace(/\.svg$/i, "");
    try { select({ ...asDrawn(await tools.svgToLoops(await file.text(), { maxSize: 70 })), key: `file:${file.name}`, label, n: 2 }); }
    catch (err) { bar.innerHTML = `<b>${escHtml(label)} could not be used</b><span>${escHtml(err.message || err)}</span>`; }
    e.target.value = "";
  });
  document.body.appendChild(el);
  showShelf();
  if (focusSearch) input.focus(); else grid.querySelector(".ck-card")?.focus();
  return { close };
}
