// Tool insert from a photo: lay the tool on plain paper, take a picture from
// straight above, and get a printable insert with a pocket the tool's shape.
//
//   detectTool(imageData)   the outline, found automatically: Otsu threshold
//                           (trace.js autoMask), the biggest shape that does not
//                           touch the photo's edge (the table round the paper
//                           does), simplified
//   outlineMm(...)          that outline in mm, from the tool's real length
//   offsetRing(ring, d)     grown by the clearance
//   insertCode(...)         BREPcode for the block: pocket, floor, margin and a
//                           finger scoop across the middle, sizes as dials
//   caseSize(...)           the case builder's inside measurements round it
//
// Pure functions: the card in index.html draws and drives them, test/toolinsert.js
// checks them on painted images.

import { toMask, marchingSquares, rdp, signedArea, autoMask } from "./trace.js";

const r2 = (v) => Math.round(v * 100) / 100;

// -> { ring: [[x, y] px], W, H, threshold, invert } or { ring: null, why }
export function detectTool(imageData, { threshold = null, invert = null, simplify = 1.5 } = {}) {
  const auto = autoMask(imageData);
  const t = threshold ?? auto.threshold, inv = invert ?? auto.invert;
  const { mask, W, H } = toMask(imageData, { threshold: t, invert: inv });
  const loops = marchingSquares(mask, W, H).filter((lp) => lp.length >= 3);
  const touches = (lp) => lp.some(([x, y]) => x <= 1 || y <= 1 || x >= W - 2 || y >= H - 2);
  // the tool: the biggest closed shape clear of the photo's border
  let best = null, bestA = 0;
  for (const lp of loops) {
    if (touches(lp)) continue;
    const a = Math.abs(signedArea(lp));
    if (a > bestA) { best = lp; bestA = a; }
  }
  if (!best || bestA < 0.002 * W * H) {
    return { ring: null, W, H, threshold: t, invert: inv, why: "no shape found: try the threshold, or Invert for a light tool on a dark sheet" };
  }
  return { ring: rdp(best, simplify), W, H, threshold: t, invert: inv, area: bestA };
}

const bbox = (ring) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
};

// pixels -> mm, the longer side `length` mm, Y up, centred; counter-clockwise
export function outlineMm(ring, length) {
  const b = bbox(ring);
  const s = length / (Math.max(b.w, b.h) || 1);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  let out = ring.map(([x, y]) => [r2((x - cx) * s), r2((cy - y) * s)]);
  if (signedArea(out) < 0) out = out.reverse();
  return out;
}

// Grow a counter-clockwise ring by d mm: each corner moves along its
// bisector, clamped so a sharp spike does not shoot off (a miter limit of 2d).
export function offsetRing(ring, d) {
  if (!d) return ring.map((p) => [...p]);
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n], c = ring[i], q = ring[(i + 1) % n];
    const e1 = [c[0] - p[0], c[1] - p[1]], e2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    // outward normals of a CCW ring point right of the travel direction
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2];
    let bx = n1[0] + n2[0], by = n1[1] + n2[1];
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) { bx = n1[0]; by = n1[1]; } else { bx /= bl; by /= bl; }
    const cos = bx * n1[0] + by * n1[1];
    const k = Math.min(d / Math.max(cos, 1e-6), 2 * Math.abs(d));
    out.push([r2(c[0] + bx * k), r2(c[1] + by * k)]);
  }
  return out;
}

export const INSERT_DEFAULTS = Object.freeze({ clearance: 1, depth: 15, floor: 3, margin: 10, scoop: true });

// The block round the grown outline, in mm.
export function insertSize(pocket, { depth = 15, floor = 3, margin = 10 } = {}) {
  const b = bbox(pocket);
  return { width: r2(b.w + 2 * margin), depth: r2(b.h + 2 * margin), height: r2(depth + floor), pocket: b };
}

// BREPcode for the insert. The pocket's points are baked (re-open the tool to
// change the clearance or the scale); the block's sizes are dials.
export function insertCode(pocket, o = {}, { name = "tool", length = null } = {}) {
  const p = { ...INSERT_DEFAULTS, ...o };
  const s = insertSize(pocket, p);
  const cx = r2((s.pocket.x0 + s.pocket.x1) / 2), cy = r2((s.pocket.y0 + s.pocket.y1) / 2);
  const pts = pocket.map(([x, y]) => `[${r2(x - cx)}, ${r2(y - cy)}]`).join(", ");
  const scoopR = r2(Math.min(p.depth * 0.8, 14));
  const lines = [
    `// Tool insert for ${name}, from a photo (Tool insert from a photo).`,
    `// The pocket is the traced outline${length ? ` (${length} mm long)` : ""} grown by ${p.clearance} mm of clearance;`,
    `// open the tool again to change the scale or the clearance.`,
    `const margin = ${p.margin};   // mm of block round the pocket`,
    `const depth = ${p.depth};    // pocket depth`,
    `const floor = ${p.floor};    // under the pocket`,
    `const pocket = polygon([${pts}]);`,
    `const W = ${r2(s.pocket.w)} + 2 * margin, D = ${r2(s.pocket.h)} + 2 * margin;`,
    `difference(`,
    `  translate([-W / 2, -D / 2, 0], cube([W, D, floor + depth])),`,
    `  translate([0, 0, floor], linearExtrude({ h: depth + 1 }, pocket))${p.scoop ? "," : ""}`,
  ];
  // a finger scoop across the middle of the pocket, so the tool lifts out
  // (a cylinder along +z, turned to run along -y, centred across the pocket)
  if (p.scoop) lines.push(`  translate([0, ${r2(s.pocket.h / 2 + 1)}, floor + depth], rotate([90, 0, 0], cylinder({ r: ${scoopR}, h: ${r2(s.pocket.h + 2)} })))`);
  lines.push(`)`);
  return lines.join("\n") + "\n";
}

// The case builder's INSIDE size for the insert: its footprint plus a little
// play, and room over the tool for the lid.
export function caseSize(size, { play = 1, headroom = 5 } = {}) {
  return {
    width: Math.ceil(size.width + 2 * play),
    depth: Math.ceil(size.depth + 2 * play),
    height: Math.ceil(size.height + headroom),
  };
}
