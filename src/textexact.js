// Exact text: real glyph outlines, extruded on the B-rep kernel.
//
// text() used to draw the string on a canvas, trace the pixels and import the
// result as a mesh, so lettering was always triangles: no true curves in a
// STEP, nothing to fillet. Here the letters come from a font file instead
// (opentype.js reads it), the way an SVG's paths do: every contour is lines
// and quadratic curves, each quadratic is raised to the cubic bezierTo() that
// path2d() already extrudes exactly, and the counters (the holes in o, e, a,
// 8) are cut out of the letter they sit in.
//
// The caller hands in a parsed opentype Font; this module does no loading, so
// it runs the same in the viewer (a fetched font) and in node (a file).

import { path2d, bezierTo, linearExtrude, difference, union, translate } from "./dsl.js";

// one closed contour per M ... Z, as path2d items in font units, y up
function contoursOf(path) {
  const out = [];
  let cur = null, at = null, start = null;
  const close = () => { if (cur && cur.length > 1) out.push(cur); cur = null; };
  for (const c of path.commands) {
    if (c.type === "M") { close(); start = at = [c.x, -c.y]; cur = [at]; }
    else if (c.type === "L") { at = [c.x, -c.y]; cur.push(at); }
    else if (c.type === "Q") {
      // a quadratic is a cubic with its controls 2/3 of the way to the knot
      const q = [c.x1, -c.y1], p = [c.x, -c.y];
      const c1 = [at[0] + (2 / 3) * (q[0] - at[0]), at[1] + (2 / 3) * (q[1] - at[1])];
      const c2 = [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])];
      cur.push(bezierTo(c1, c2, p)); at = p;
    } else if (c.type === "C") {
      const p = [c.x, -c.y];
      cur.push(bezierTo([c.x1, -c.y1], [c.x2, -c.y2], p)); at = p;
    } else if (c.type === "Z") {
      // path2d closes itself; drop a last point that repeats the first
      const last = cur?.[cur.length - 1];
      if (Array.isArray(last) && start && Math.hypot(last[0] - start[0], last[1] - start[1]) < 1e-9 && cur.length > 1) cur.pop();
      close();
    }
  }
  close();
  return out;
}

const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
function inside(p, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// text as exact solids. size = the ink height of the whole string in mm, as
// the canvas text() measured it; height = extrusion; center (default true)
// puts the ink box's middle on the origin; deboss runs it 0.2 below z = 0
// and 0.2 above the top, so a difference() cuts cleanly.
export function exactText(font, str, o = {}) {
  const size = o.size ?? 8;
  const depth = o.height ?? o.depth ?? 1;
  const deboss = o.mode === "deboss";
  const H = depth + (deboss ? 0.4 : 0);
  const glyphPath = font.getPath(String(str), 0, 0, font.unitsPerEm, { kerning: true });
  const loops = contoursOf(glyphPath)
    .map((items) => ({ items, prof: path2d(items) }))
    .filter((l) => Math.abs(area(l.prof.pts)) > 1e-6 * font.unitsPerEm * font.unitsPerEm);
  if (!loops.length) throw new Error("text(): nothing to render");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of loops) for (const [x, y] of l.prof.pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const k = size / ((maxY - minY) || 1);
  const xoff = o.center === false ? -minX * k : -((minX + maxX) / 2) * k;
  const yoff = o.center === false ? -minY * k : -((minY + maxY) / 2) * k;
  const mm = (q) => [q[0] * k + xoff, q[1] * k + yoff];
  const scaled = loops.map((l) => {
    const items = l.items.map((it) => (it?.__bezierTo ? bezierTo(...it.__bezierTo.map(mm)) : mm(it)));
    const prof = path2d(items);
    return { prof, depth: 0 };
  });
  // nesting depth decides it: inside an even number of others is ink, odd is a counter
  for (const a of scaled) for (const b of scaled) if (a !== b && inside(a.prof.pts[0], b.prof.pts)) a.depth++;
  const ink = scaled.filter((l) => l.depth % 2 === 0);
  const solids = ink.map((outer) => {
    const body = linearExtrude({ h: H }, outer.prof);
    const counters = scaled.filter((h) => h.depth === outer.depth + 1 && inside(h.prof.pts[0], outer.prof.pts));
    if (!counters.length) return body;
    // counters run a hair past both faces so the cut is clean
    return difference(body, ...counters.map((h) => translate([0, 0, -0.1], linearExtrude({ h: H + 0.2 }, h.prof))));
  });
  const shape = solids.length === 1 ? solids[0] : union(...solids);
  return deboss ? translate([0, 0, -0.2], shape) : shape;
}
