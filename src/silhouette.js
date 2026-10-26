// Outline compare: the model drawn in the drawing's own views, its filled
// outline diffed against the same view cut out of the picture. A rib that
// stops short of the hub, a missing shoulder or step, a taper drawn square:
// the outline shows them where a feature table may not. Shared by the chat
// (viewer/index.html, canvas pixels) and bench/cadgen (lib/tiles.py --gray).
//
//   drawingMask(gray, w, h)              -> { mask, box } the view's filled outline, or null
//   projectFaces(faces, view)            -> the model's triangles in the view's (u, v) mm
//   alignModel(tris, drawing, w, h)      -> { s, ox, oy, iou } where the model sits on the crop
//   compareView(gray, w, h, faces, view) -> { iou, lines } feedback in model mm
//   outlineLines(results)                -> the lines for the AI
//
// view: { name, right: "+x", up: "+z", cut?: { axis: "+y", at: 0 } } as the
// feature table's "views" give it (src/imageread.js). Plain arrays in,
// plain objects out; no DOM, no kernel.

const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
function axisOf(s) {
  const m = /^([+-]?)([xyz])$/i.exec(String(s || "").trim());
  if (!m) return null;
  const v = AX[m[2].toLowerCase()];
  return m[1] === "-" ? v.map((c) => -c) : v.slice();
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ------------------------------------------------------------ the drawing

function dilate(m, w, h, r) {
  if (r <= 0) return m;
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && m[y * w + xx]) v = 1; }
    t[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && t[yy * w + x]) v = 1; }
    o[y * w + x] = v;
  }
  return o;
}
const invert = (m) => m.map((v) => 1 - v);
const erode = (m, w, h, r) => invert(dilate(invert(m), w, h, r));

// Fill everything the paper cannot reach from the border.
function fillHoles(m, w, h) {
  const out = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const c = st.pop();
    if (out[c] || m[c]) continue;
    out[c] = 1;
    const x = c % w, y = (c - x) / w;
    if (x > 0) st.push(c - 1); if (x < w - 1) st.push(c + 1); if (y > 0) st.push(c - w); if (y < h - 1) st.push(c + w);
  }
  return invert(out);
}

// 4-connected components of the 1s: [{ size, cells }] largest first
function components(m, w, h) {
  const lab = new Int32Array(w * h).fill(-1), out = [];
  const st = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    const id = out.length, cells = [];
    let sp = 0; st[sp++] = i; lab[i] = id;
    while (sp) {
      const c = st[--sp]; cells.push(c);
      const x = c % w, y = (c - x) / w;
      for (const n of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) {
        if (n >= 0 && m[n] && lab[n] < 0) { lab[n] = id; st[sp++] = n; }
      }
    }
    out.push({ size: cells.length, cells });
  }
  return out.sort((a, b) => b.size - a.size);
}

function boxOf(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

// The part's filled outline in a crop of a line drawing (gray 0-255, white
// paper): ink, closed over dashes and tiny gaps, filled from the paper
// inward, thin strokes (dimension and leader lines, text) opened away, and
// the main blob kept. null when nothing closed shows (a sketchy view).
export function drawingMask(gray, w, h, { ink = 245 } = {}) {
  let m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = gray[i] < ink ? 1 : 0;
  const closed = dilate(m, w, h, Math.max(1, Math.round(Math.max(w, h) / 350)));
  let fill = fillHoles(closed, w, h);   // flood the paper from the border
  const r = Math.max(2, Math.round(Math.max(w, h) / 160));
  fill = dilate(erode(fill, w, h, r), w, h, r);
  const comps = components(fill, w, h);
  if (!comps.length || comps[0].size < 0.02 * w * h) return null;
  const keep = new Uint8Array(w * h);
  for (const c of comps) if (c.size >= 0.15 * comps[0].size) for (const i of c.cells) keep[i] = 1;
  return { mask: keep, box: boxOf(keep, w, h) };
}

// ------------------------------------------------------------ the model

function clipTri(tri, n, at) {
  // the part beyond the cut: dot(p, n) >= at
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = tri[i], b = tri[(i + 1) % 3], da = dot(a, n) - at, db = dot(b, n) - at;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]); }
  }
  return out;
}

// Triangles of the model projected on the view's (right, up) plane, a
// section clipped to the part beyond its cut. [[u, v] x3] in model mm.
export function projectFaces(faces, view, { shift = [0, 0, 0] } = {}) {
  const R = axisOf(view.right), U = axisOf(view.up);
  if (!R || !U || Math.abs(dot(R, U)) > 0.5) return null;
  const cut = view.cut && axisOf(view.cut.axis) ? { n: axisOf(view.cut.axis), at: +view.cut.at + dot(shift, axisOf(view.cut.axis)) } : null;
  const tris = [];
  for (const f of faces) {
    const P = f.positions, I = f.index || Array.from({ length: P.length / 3 }, (_, i) => i);
    for (let t = 0; t + 2 < I.length; t += 3) {
      let poly = [0, 1, 2].map((k) => [P[3 * I[t + k]], P[3 * I[t + k] + 1], P[3 * I[t + k] + 2]]);
      if (cut) poly = clipTri(poly, cut.n, cut.at);
      for (let k = 1; k + 1 < poly.length; k++) tris.push([poly[0], poly[k], poly[k + 1]].map((p) => [dot(p, R), dot(p, U)]));
    }
  }
  return tris;
}

// Rasterise projected triangles into a w x h mask: model (u, v) in mm to
// pixels x = ox + u * s, y = oy - v * s (one scale: a view is drawn to scale).
export function rasterise(tris, w, h, { s, ox, oy }) {
  const m = new Uint8Array(w * h);
  for (const t of tris) {
    const a = [ox + t[0][0] * s, oy - t[0][1] * s], b = [ox + t[1][0] * s, oy - t[1][1] * s], c = [ox + t[2][0] * s, oy - t[2][1] * s];
    const xa = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), xb = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const ya = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), yb = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const X = x + 0.5, Y = y + 0.5;
      const w0 = ((b[0] - X) * (c[1] - Y) - (b[1] - Y) * (c[0] - X)) / area;
      const w1 = ((c[0] - X) * (a[1] - Y) - (c[1] - Y) * (a[0] - X)) / area;
      if (w0 >= -1e-6 && w1 >= -1e-6 && 1 - w0 - w1 >= -1e-6) m[y * w + x] = 1;
    }
  }
  return m;
}

function spanOf(tris) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const t of tris) for (const [u, v] of t) { if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  return { u0, u1, v0, v1 };
}

// Place the model on the drawing's view: one scale, the offset and scale
// that overlap the drawing's filled outline best. Starts from fitting the
// outline's box (which dimension lines may have stretched), then searches
// smaller scales and shifts, so stray filled areas round the part cost
// little.
export function alignModel(tris, d, w, h) {
  const sp = spanOf(tris);
  const du = sp.u1 - sp.u0, dv = sp.v1 - sp.v0;
  if (!(du > 0) || !(dv > 0)) return null;
  const bw = d.box.x1 - d.box.x0, bh = d.box.y1 - d.box.y0;
  const s0 = Math.min(bw / du, bh / dv);
  // the model rasterised once at s0, its pixels as (u, v) samples
  const R = 1;
  const base = rasterise(tris, Math.ceil(du * s0) + 2, Math.ceil(dv * s0) + 2, { s: s0, ox: 1 - sp.u0 * s0, oy: 1 + sp.v1 * s0 });
  const bwid = Math.ceil(du * s0) + 2, samples = [];
  for (let i = 0; i < base.length; i++) if (base[i]) { const x = i % bwid, y = (i - x) / bwid; samples.push([(x + 0.5 - 1) / s0 + sp.u0, sp.v1 - (y + 0.5 - 1) / s0]); }
  let dCount = 0;
  for (let i = 0; i < w * h; i++) dCount += d.mask[i];
  const step = Math.max(1, Math.floor(samples.length / 6000));
  const score = (s, ox, oy) => {
    let hit = 0, n = 0;
    for (let i = 0; i < samples.length; i += step) {
      n++;
      const x = Math.floor(ox + samples[i][0] * s), y = Math.floor(oy - samples[i][1] * s);
      if (x >= 0 && y >= 0 && x < w && y < h && d.mask[y * w + x]) hit++;
    }
    const mArea = samples.length * (s / s0) ** 2, inter = (hit / Math.max(1, n)) * mArea;
    return inter / (mArea + dCount - inter);
  };
  let best = null;
  for (let k = 0; k <= 12; k++) {
    const s = s0 * (1.03 - 0.025 * k);
    const cx = (d.box.x0 + d.box.x1) / 2, cy = (d.box.y0 + d.box.y1) / 2;
    const ox0 = cx - ((sp.u0 + sp.u1) / 2) * s, oy0 = cy + ((sp.v0 + sp.v1) / 2) * s;
    const slackX = Math.max(2, (bw - du * s) / 2 + 0.03 * bw), slackY = Math.max(2, (bh - dv * s) / 2 + 0.03 * bh);
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const ox = ox0 + (i / 4) * slackX, oy = oy0 + (j / 4) * slackY;
      const v = score(s, ox, oy);
      if (!best || v > best.iou) best = { s, ox, oy, iou: v };
    }
  }
  // refine around the best
  for (let r = 0; r < 2; r++) {
    const b = best;
    for (const ds of [0.99, 1, 1.01]) for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const v = score(b.s * ds, b.ox + i, b.oy + j);
      if (v > best.iou) best = { s: b.s * ds, ox: b.ox + i, oy: b.oy + j, iou: v };
    }
  }
  return { ...best, span: sp };
}

// ------------------------------------------------------------ the compare

const fmt = (v) => String(Math.round(v));

// One view: the drawing crop (gray, w x h) against the model's faces.
// Returns the IoU of the outlines, feedback lines in model mm, and the
// placed model mask (for an overlay picture).
export function compareView(gray, w, h, faces, view, { shift = [0, 0, 0], grid = 14, minFrac = 0.012 } = {}) {
  const name = view.name || "view";
  // a detail view is a magnified piece of the part, not its whole outline
  if (/detail|enlarged|scale\s*\d+\s*:\s*1/i.test(name)) return { name, skipped: "a detail view shows only part of the model" };
  const d = drawingMask(gray, w, h);
  if (!d) return { name, skipped: "no closed outline found in the drawing's view" };
  const tris = projectFaces(faces, view, { shift });
  if (!tris) return { name, skipped: "the view has no right/up axes" };
  if (!tris.length) return { name, skipped: "nothing of the model is beyond the section's cut" };
  const al = alignModel(tris, d, w, h);
  if (!al) return { name, skipped: "the model projects to nothing" };
  // the outer outline, like the drawing's: through-holes and windows filled
  const mask = fillHoles(rasterise(tris, w, h, al), w, h);
  const { u0, u1, v0, v1 } = al.span;
  const lines = [];
  const rn = String(view.right).replace("+", ""), un = String(view.up).replace("+", "");
  const prefix = `${name} (${view.right} right, ${view.up} up${view.cut ? `, cut at ${view.cut.axis.replace("+", "")} = ${view.cut.at}` : ""})`;
  // compare inside the model's placed box, grown 8%: dimension lines and
  // notes round the view stay out of it
  const bx0 = Math.max(0, Math.floor(al.ox + u0 * al.s - 0.08 * (u1 - u0) * al.s)), bx1 = Math.min(w, Math.ceil(al.ox + u1 * al.s + 0.08 * (u1 - u0) * al.s));
  const by0 = Math.max(0, Math.floor(al.oy - v1 * al.s - 0.08 * (v1 - v0) * al.s)), by1 = Math.min(h, Math.ceil(al.oy - v0 * al.s + 0.08 * (v1 - v0) * al.s));
  let inter = 0, uni = 0;
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const i = y * w + x; if (d.mask[i] && mask[i]) inter++; if (d.mask[i] || mask[i]) uni++; }
  const iou = uni ? inter / uni : 0;
  const toU = (x) => (x - al.ox) / al.s, toV = (y) => (al.oy - y) / al.s;
  const cw = (bx1 - bx0) / grid, ch = (by1 - by0) / grid, total = Math.max(1, (u1 - u0) * (v1 - v0) * al.s * al.s);
  const flag = (want) => {
    const cells = [];
    for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
      let n = 0, c = 0;
      for (let y = Math.floor(by0 + gy * ch); y < Math.floor(by0 + (gy + 1) * ch); y++) for (let x = Math.floor(bx0 + gx * cw); x < Math.floor(bx0 + (gx + 1) * cw); x++) {
        c++;
        const a = d.mask[y * w + x], b = mask[y * w + x];
        if (want === "missing" ? a && !b : b && !a) n++;
      }
      if (c && n / c > 0.35) cells.push([gx, gy, n]);
    }
    const left = new Set(cells.map(([x, y]) => `${x},${y}`)), byKey = new Map(cells.map((c) => [`${c[0]},${c[1]}`, c]));
    const regions = [];
    for (const c of cells) {
      const k0 = `${c[0]},${c[1]}`;
      if (!left.has(k0)) continue;
      left.delete(k0);
      const st = [c], reg = [];
      while (st.length) {
        const [x, y] = st.pop(); reg.push(byKey.get(`${x},${y}`));
        for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const k = `${a},${b}`; if (left.has(k)) { left.delete(k); st.push([a, b]); } }
      }
      const px = reg.reduce((s, r) => s + r[2], 0);
      if (px / total < minFrac) continue;
      const gx0 = Math.min(...reg.map((r) => r[0])), gx1 = Math.max(...reg.map((r) => r[0])) + 1;
      const gy0 = Math.min(...reg.map((r) => r[1])), gy1 = Math.max(...reg.map((r) => r[1])) + 1;
      regions.push({ frac: px / total, u: [toU(bx0 + gx0 * cw), toU(bx0 + gx1 * cw)], v: [toV(by0 + gy1 * ch), toV(by0 + gy0 * ch)] });
    }
    return regions.sort((a, b) => b.frac - a.frac).slice(0, 3);
  };
  for (const r of flag("missing")) lines.push(`${prefix}: the drawing shows material the model lacks around ${rn} ${fmt(r.u[0])}..${fmt(r.u[1])}, ${un} ${fmt(r.v[0])}..${fmt(r.v[1])} (${Math.round(r.frac * 100)}% of the view): a rib that stops short, a missing step, shoulder or boss? (or a dimension line; check the overlay)`);
  for (const r of flag("extra")) lines.push(`${prefix}: the model has material the drawing does not show around ${rn} ${fmt(r.u[0])}..${fmt(r.u[1])}, ${un} ${fmt(r.v[0])}..${fmt(r.v[1])} (${Math.round(r.frac * 100)}% of the view): too long or too tall there, or a cut, notch or chamfer missing?`);
  return { name, iou: Math.round(iou * 1000) / 1000, lines, mask, drawing: d.mask, place: { s: al.s, ox: al.ox, oy: al.oy } };
}

// The drawing crop with the placed model over it, as RGB bytes: the model's
// outline in red, the model's material lightly tinted, so the AI can tell a
// real difference from a dimension line.
export function overlayRGB(gray, w, h, mask) {
  const o = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, g = gray[i], m = mask[i];
    const edge = m && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]);
    if (edge) { o[3 * i] = 230; o[3 * i + 1] = 0; o[3 * i + 2] = 0; }
    else if (m) { o[3 * i] = g; o[3 * i + 1] = Math.round(g * 0.82); o[3 * i + 2] = Math.round(g * 0.82); }
    else { o[3 * i] = g; o[3 * i + 1] = g; o[3 * i + 2] = g; }
  }
  return o;
}

// The views worth reporting, as lines for the AI (src/imageread.js fixPrompt
// / lookPrompt take them as `outline`).
export function outlineLines(results, { max = 8 } = {}) {
  return results.filter((r) => r && r.lines?.length).flatMap((r) => r.lines).slice(0, max);
}
