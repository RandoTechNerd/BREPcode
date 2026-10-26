// An engineering drawing of a practice part, in the style of CADGenBench's
// inputs: a white sheet with a border, three hidden-line orthographic views in
// third-angle projection (TOP above FRONT, RIGHT beside FRONT), an isometric,
// overall dimensions, hole/slot/boss callouts with leaders, baseline position
// dimensions for every feature, extra dimensions the part asks for, notes and
// a title block.
//
// The views are OpenCASCADE hidden-line projections (replicad) of the ground
// truth STEP itself, so the picture is the exact solid that is scored.
//
// replicad's named views, measured (bench/cadgen/README.md): "bottom" looks
// DOWN the -Z axis (its "top" looks up from below), "front" looks along +Y,
// "left" looks along -X. Sheet mapping of a model point:
//   TOP   (x, -y)    FRONT (x, -z)    RIGHT (y, -z)

import { initReplicad } from "./occ.mjs";
import { mergeSvgPaths } from "../../../viewer/curved.js";

const VIEW_OF_DIR = (dir) => (Math.abs(dir[2]) > 0.5 ? "top" : Math.abs(dir[1]) > 0.5 ? "front" : "right");
const MAP = {
  top: ([x, y]) => [x, -y],
  front: ([x, , z]) => [x, -z],
  right: ([, y, z]) => [y, -z],
};
const fmt = (v) => {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function calloutText(f, n = 1) {
  const pre = n > 1 ? `${n}X ` : "";
  if (f.kind === "hole") {
    const lines = [`${pre}Ø${fmt(f.d)} ${f.through ? "THRU" : `↧ ${fmt(f.depth)}`}`];
    if (f.cbore) lines.push(`⌴ Ø${fmt(f.cbore.d)} ↧ ${fmt(f.cbore.depth)}`);
    if (f.csk) lines.push(`⌵ Ø${fmt(f.csk.d)} X ${fmt(f.csk.angle ?? 90)}°`);
    return lines;
  }
  if (f.kind === "slot") return [`${pre}SLOT ${fmt(f.w)} WIDE`, `${fmt(f.len)} CTR-CTR ${f.through ? "THRU" : `↧ ${fmt(f.depth)}`}`];
  if (f.kind === "pocket") return [`${pre}POCKET ${fmt(f.l)} X ${fmt(f.w)}`, `↧ ${fmt(f.depth)}${f.r ? ` R${fmt(f.r)}` : ""}`];
  if (f.kind === "boss") return [`${pre}BOSS Ø${fmt(f.d)} X ${fmt(f.h)} HIGH`, ...(f.bore ? [`BORE Ø${fmt(f.bore)} THRU BOSS`] : [])];
  return [];
}
const calloutKey = (f) => JSON.stringify([VIEW_OF_DIR(f.dir), calloutText(f)]);

// part: { title, features, dims?, leaders?, notes? }   bbox: { min, max } of the GT (centred)
export async function drawingSVG(stepText, part, bbox) {
  const r = await initReplicad();
  const shape = await r.importSTEP(new Blob([stepText]));

  const project = (cam) => {
    let visible, hidden;
    try { ({ visible, hidden } = r.drawProjection(shape, cam)); } catch { return { vis: "", hid: "", box: null }; }
    const svgOf = (d) => { try { return d?.toSVG() || ""; } catch { return ""; } };
    const vs = svgOf(visible);
    const vb = (vs.match(/viewBox="([^"]+)"/)?.[1] || "0 0 10 10").split(/\s+/).map(Number);
    return { vis: mergeSvgPaths(vs), hid: mergeSvgPaths(svgOf(hidden)), box: vb };
  };
  const views = { top: project("bottom"), front: project("front"), right: project("left") };
  const isoCam = new r.ProjectionCamera([100, -100, 100]);
  isoCam.lookAt([0, 0, 0]);
  const iso = project(isoCam);

  const [X0, Y0, Z0] = bbox.min, [X1, Y1, Z1] = bbox.max;
  const SX = X1 - X0, SY = Y1 - Y0, SZ = Z1 - Z0;

  // ---- sheet layout (A-size landscape, px) --------------------------------
  const W = 2400, H = 1697, M = 40;
  const TB = { w: 760, h: 230 };
  const GAP = 250;   // between views: room for stacked dimensions
  const areaW = W * 0.64 - 2 * M - 2 * GAP, areaH = H - 2 * M - 2 * GAP + 60;
  const S = Math.min(areaW / (SX + SY), areaH / (SY + SZ));
  // view origins: sheet position of the view's 2D point (u, v) = o + (u, v) * S
  const topO = [M + GAP + 20 - X0 * S, M + GAP - 60 + Y1 * S];
  const frontO = [topO[0], M + GAP - 60 + SY * S + GAP + Z1 * S];
  const rightO = [topO[0] + X1 * S + GAP - Y0 * S, frontO[1]];
  const O = { top: topO, front: frontO, right: rightO };
  const toSheet = (view, p3) => { const [u, v] = MAP[view](p3); return [O[view][0] + u * S, O[view][1] + v * S]; };

  const out = [];
  const LINE = `stroke="#000" stroke-width="1.6" fill="none"`;
  const THIN = `stroke="#000" stroke-width="1" fill="none"`;
  const FONT = `font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#000"`;

  const viewSVG = (p, o, sc, hidden = true) => {
    if (!p.box) return "";
    const sw = 1.8 / sc;
    return `<g transform="translate(${o[0]} ${o[1]}) scale(${sc})">
  <g fill="none" stroke="#555" stroke-width="${sw * 0.7}" stroke-dasharray="${sw * 6} ${sw * 4}">${hidden ? p.hid : ""}</g>
  <g fill="none" stroke="#000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p.vis}</g>
</g>`;
  };
  for (const v of ["top", "front", "right"]) out.push(viewSVG(views[v], O[v], S));
  // isometric in the top-right, above the title block
  if (iso.box) {
    const [ix, iy, iw, ih] = iso.box;
    const bx = W * 0.64, by = M + 30, bw = W - M - 30 - bx, bh = H - M - TB.h - 80 - by;
    const isc = 0.85 * Math.min(bw / iw, bh / ih);
    out.push(viewSVG(iso, [bx + (bw - iw * isc) / 2 - ix * isc, by + (bh - ih * isc) / 2 - iy * isc], isc, false));
  }

  // ---- dimension primitives ------------------------------------------------
  const arrow = (x, y, dx, dy) => {
    const L = 16, w = 5;
    return `<path d="M${x} ${y} L${x - dx * L - dy * w} ${y - dy * L + dx * w} L${x - dx * L + dy * w} ${y - dy * L - dx * w} Z" fill="#000" stroke="none"/>`;
  };
  // horizontal dimension between sheet x-coords a,b with witness lines down/up to y-coords ya,yb; dim line at yd
  const dimH = (a, ya, b, yb, yd, text) => {
    const [l, rr] = a < b ? [a, b] : [b, a];
    const s = Math.sign(yd - ya) || -1;
    const inside = rr - l > 60;
    let g = `<line x1="${a}" y1="${ya + 6 * s}" x2="${a}" y2="${yd + 10 * s}" ${THIN}/><line x1="${b}" y1="${yb + 6 * s}" x2="${b}" y2="${yd + 10 * s}" ${THIN}/>`;
    if (inside) g += `<line x1="${l}" y1="${yd}" x2="${rr}" y2="${yd}" ${THIN}/>${arrow(l, yd, -1, 0)}${arrow(rr, yd, 1, 0)}`;
    else g += `<line x1="${l - 40}" y1="${yd}" x2="${rr + 40}" y2="${yd}" ${THIN}/>${arrow(l, yd, 1, 0)}${arrow(rr, yd, -1, 0)}`;
    const tx = inside ? (l + rr) / 2 : rr + 46 + text.length * 7;
    g += `<text x="${tx}" y="${yd - 7}" text-anchor="middle" ${FONT}>${esc(text)}</text>`;
    return g;
  };
  const dimV = (a, xa, b, xb, xd, text) => {
    const [t, bt] = a < b ? [a, b] : [b, a];
    const s = Math.sign(xd - xa) || -1;
    const inside = bt - t > 60;
    let g = `<line x1="${xa + 6 * s}" y1="${a}" x2="${xd + 10 * s}" y2="${a}" ${THIN}/><line x1="${xb + 6 * s}" y1="${b}" x2="${xd + 10 * s}" y2="${b}" ${THIN}/>`;
    if (inside) g += `<line x1="${xd}" y1="${t}" x2="${xd}" y2="${bt}" ${THIN}/>${arrow(xd, t, 0, -1)}${arrow(xd, bt, 0, 1)}`;
    else g += `<line x1="${xd}" y1="${t - 40}" x2="${xd}" y2="${bt + 40}" ${THIN}/>${arrow(xd, t, 0, 1)}${arrow(xd, bt, 0, -1)}`;
    const ty = inside ? (t + bt) / 2 : t - 46 - text.length * 7;
    g += `<text x="${xd - 8}" y="${ty}" text-anchor="middle" transform="rotate(-90 ${xd - 8} ${ty})" ${FONT}>${esc(text)}</text>`;
    return g;
  };
  const leader = (x, y, tx, ty, lines) => {
    const right = tx >= x;
    const w = Math.max(...lines.map((l) => l.length)) * 13 + 10;
    const sx = right ? tx + w : tx - w;
    let g = `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" ${THIN}/><line x1="${tx}" y1="${ty}" x2="${sx}" y2="${ty}" ${THIN}/>`;
    const L = Math.hypot(x - tx, y - ty) || 1;
    g += arrow(x, y, (x - tx) / L, (y - ty) / L);
    lines.forEach((l, i) => {
      g += `<text x="${right ? tx + 6 : tx - 6}" y="${ty - 8 + i * 30}" text-anchor="${right ? "start" : "end"}" ${FONT}>${esc(l)}</text>`;
    });
    return g;
  };

  // view extents on the sheet
  const ext = {};
  for (const v of ["top", "front", "right"]) {
    const corners = [];
    for (const x of [X0, X1]) for (const y of [Y0, Y1]) for (const z of [Z0, Z1]) corners.push(toSheet(v, [x, y, z]));
    ext[v] = { x0: Math.min(...corners.map((c) => c[0])), x1: Math.max(...corners.map((c) => c[0])), y0: Math.min(...corners.map((c) => c[1])), y1: Math.max(...corners.map((c) => c[1])) };
  }
  const STEP = 40;
  // Everything drawn registers the box it occupies, so callouts can be put
  // where nothing else is (a fixed slot per view collided on busy parts).
  const occ = [];
  const take = (x0, y0, x1, y1) => occ.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
  const free = (r) => r.x0 > M + 10 && r.x1 < W - M - 10 && r.y0 > M + 10 && r.y1 < H - M - 10
    && !occ.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
  for (const v of ["top", "front", "right"]) take(ext[v].x0 - 8, ext[v].y0 - 8, ext[v].x1 + 8, ext[v].y1 + 8);
  take(W * 0.64, M, W - M, H - M);   // isometric, notes and title block column

  // stacks of dimensions per side of each view (how many already placed)
  const stack = { top: { above: 0, left: 0, below: 0, right: 0 }, front: { above: 0, left: 0, below: 0, right: 0 }, right: { above: 0, left: 0, below: 0, right: 0 } };
  const placeH = (view, side, xa, xb, value, ya = null, yb = null) => {
    const e = ext[view];
    const n = ++stack[view][side];
    const yd = side === "above" ? e.y0 - 30 - (n - 1) * STEP : e.y1 + 50 + (n - 1) * STEP;
    const edge = side === "above" ? e.y0 : e.y1;
    out.push(dimH(xa, ya ?? edge, xb, yb ?? edge, yd, fmt(value)));
    const inside = Math.abs(xb - xa) > 60;
    take(Math.min(xa, xb) - (inside ? 4 : 50), yd - 34, Math.max(xa, xb) + (inside ? 4 : 120), yd + 6);
    take(Math.min(xa, xb) - 2, Math.min(edge, yd), Math.max(xa, xb) + 2, Math.max(edge, yd));
  };
  const placeV = (view, side, ya, yb, value, xa = null, xb = null) => {
    const e = ext[view];
    const n = ++stack[view][side];
    const xd = side === "left" ? e.x0 - 30 - (n - 1) * STEP : e.x1 + 40 + (n - 1) * STEP;
    const edge = side === "left" ? e.x0 : e.x1;
    out.push(dimV(ya, xa ?? edge, yb, xb ?? edge, xd, fmt(value)));
    const inside = Math.abs(yb - ya) > 60;
    take(xd - 36, Math.min(ya, yb) - (inside ? 4 : 120), xd + 6, Math.max(ya, yb) + (inside ? 4 : 50));
    take(Math.min(edge, xd), Math.min(ya, yb) - 2, Math.max(edge, xd), Math.max(ya, yb) + 2);
  };

  // ---- overall sizes ------------------------------------------------------
  placeH("top", "above", ext.top.x0, ext.top.x1, SX);
  placeV("top", "left", ext.top.y0, ext.top.y1, SY);
  placeV("front", "left", ext.front.y0, ext.front.y1, SZ);
  placeH("right", "below", ext.right.x0, ext.right.x1, SY);

  // ---- feature positions --------------------------------------------------
  const feats = part.features || [];
  // baseline position dims from the view's left / bottom edge to every feature centre
  for (const view of ["top", "front", "right"]) {
    const vf = feats.filter((f) => VIEW_OF_DIR(f.dir) === view && !f.noPos);
    const us = [...new Set(vf.map((f) => Math.round(toSheet(view, f.at)[0] * 100) / 100))].sort((a, b) => a - b);
    const vs = [...new Set(vf.map((f) => Math.round(toSheet(view, f.at)[1] * 100) / 100))].sort((a, b) => b - a);
    const e = ext[view];
    for (const u of us) {
      const val = (u - e.x0) / S;
      if (val < 0.05 || Math.abs(u - e.x1) < 0.5) continue;
      const fy = toSheet(view, vf.find((f) => Math.abs(toSheet(view, f.at)[0] - u) < 0.02).at)[1];
      placeH(view, "below", e.x0, u, val, e.y1, fy);
    }
    for (const v of vs) {
      const val = (e.y1 - v) / S;
      if (val < 0.05 || Math.abs(v - e.y0) < 0.5) continue;
      const fx = toSheet(view, vf.find((f) => Math.abs(toSheet(view, f.at)[1] - v) < 0.02).at)[0];
      placeV(view, view === "right" ? "right" : "left", e.y1, v, val, view === "right" ? e.x1 : e.x0, fx);
    }
  }

  // ---- part-specific dimensions --------------------------------------------
  // dims: { view, a: [x,y,z], b: [x,y,z], axis: "h" | "v", side?, value? }
  for (const d of part.dims || []) {
    const A = toSheet(d.view, d.a), B = toSheet(d.view, d.b);
    const value = d.value ?? (d.axis === "h" ? Math.abs(B[0] - A[0]) : Math.abs(B[1] - A[1])) / S;
    if (d.axis === "h") placeH(d.view, d.side ?? "below", A[0], B[0], value, A[1], B[1]);
    else placeV(d.view, d.side ?? "left", A[1], B[1], value, A[0], B[0]);
  }

  // view labels, placed (and registered) before the callouts look for room
  const label = (x, y, t) => { take(x - 50, y - 26, x + 50, y + 6); out.push(`<text x="${x}" y="${y}" text-anchor="middle" ${FONT} font-weight="bold">${t}</text>`); };
  label((ext.top.x0 + ext.top.x1) / 2, ext.top.y0 - 30 - stack.top.above * STEP - 10, "TOP");
  label((ext.front.x0 + ext.front.x1) / 2, ext.front.y1 + 50 + stack.front.below * STEP + 20, "FRONT");
  label((ext.right.x0 + ext.right.x1) / 2, ext.right.y1 + 50 + stack.right.below * STEP + 20, "RIGHT");

  // ---- callouts: one per group of identical features, then the part's own ----
  const groups = new Map();
  for (const f of feats) {
    const k = calloutKey(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const callouts = [...groups.values()].map((fs) => {
    const f = fs[0], view = VIEW_OF_DIR(f.dir);
    const rad = (f.kind === "hole" ? (f.cbore?.d ?? f.csk?.d ?? f.d) : f.kind === "boss" ? f.d : f.kind === "slot" ? f.w : Math.min(f.w, f.l)) / 2 * S;
    return { p: toSheet(view, f.at), rad, lines: calloutText(f, fs.length) };
  });
  // leaders: { view, at: [x,y,z], text: "R5 TYP" | [lines], dx?, dy? } (dx/dy: preferred spot)
  for (const l of part.leaders || []) callouts.push({ p: toSheet(l.view, l.at), rad: 0, lines: [].concat(l.text), hint: l.dx != null ? [l.dx, l.dy ?? -70] : null });
  const ANGLES = [-40, -60, -20, 40, 20, 60, -120, -140, -160, 120, 140, 160, -90, 90, 0, 180];
  for (const c of callouts) {
    const [px, py] = c.p;
    const w = Math.max(...c.lines.map((l) => l.length)) * 13 + 14, h = 30 * c.lines.length;
    const box = (tx, ty, right) => ({ x0: right ? tx : tx - w, x1: right ? tx + w : tx, y0: ty - 32, y1: ty - 32 + h + 6 });
    const tries = [];
    if (c.hint) tries.push([px + c.hint[0], py + c.hint[1]]);
    for (const r of [70, 110, 160, 220, 290, 370, 460, 560, 680]) for (const a of ANGLES) {
      const t = (a * Math.PI) / 180;
      tries.push([px + (c.rad + r) * Math.cos(t), py + (c.rad + r) * Math.sin(t)]);
    }
    let pick = tries[tries.length - 1];
    for (const [tx, ty] of tries) if (free(box(tx, ty, tx >= px))) { pick = [tx, ty]; break; }
    const [tx, ty] = pick, right = tx >= px;
    const ang = Math.atan2(ty - py, tx - px);
    out.push(leader(px + Math.cos(ang) * c.rad, py + Math.sin(ang) * c.rad, tx, ty, c.lines));
    const bx = box(tx, ty, right);
    take(bx.x0 - 6, bx.y0 - 6, bx.x1 + 6, bx.y1 + 6);
  }

  // ---- labels, notes, border, title block ----------------------------------
  const notes = ["NOTES:", "1. ALL DIMENSIONS IN MM.", "2. THIRD-ANGLE PROJECTION.", ...(part.notes || []).map((n, i) => `${i + 3}. ${n}`)];
  notes.forEach((n, i) => out.push(`<text x="${W - M - TB.w}" y="${H - M - TB.h - 30 - (notes.length - 1 - i) * 30}" ${FONT} font-size="21">${esc(n)}</text>`));

  const tbx = W - M - TB.w, tby = H - M - TB.h;
  const title = `<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" ${LINE} stroke-width="3"/>
<rect x="${tbx}" y="${tby}" width="${TB.w}" height="${TB.h}" ${LINE} stroke-width="2"/>
<line x1="${tbx}" y1="${tby + 80}" x2="${tbx + TB.w}" y2="${tby + 80}" ${LINE}/>
<line x1="${tbx}" y1="${tby + 155}" x2="${tbx + TB.w}" y2="${tby + 155}" ${LINE}/>
<line x1="${tbx + 380}" y1="${tby + 80}" x2="${tbx + 380}" y2="${tby + TB.h}" ${LINE}/>
<text x="${tbx + 20}" y="${tby + 52}" ${FONT} font-size="34" font-weight="bold">${esc(part.title || "PART")}</text>
<text x="${tbx + 20}" y="${tby + 125}" ${FONT}>UNITS: MM</text>
<text x="${tbx + 400}" y="${tby + 125}" ${FONT}>SCALE: ${S >= 1 ? fmt(S / 3.78) : fmt(S / 3.78)}</text>
<text x="${tbx + 20}" y="${tby + 200}" ${FONT}>MATERIAL: AL 6061</text>
<text x="${tbx + 400}" y="${tby + 200}" ${FONT}>BREPcode practice set</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
${title}
${out.join("\n")}
</svg>`;
}

// SVG -> PNG through the pre-installed Chromium.
let browser = null;
export async function svgToPNG(svg, outPath, { scale = 1.28 } = {}) {
  let pw;
  try { pw = await import("playwright"); }
  catch { pw = (await import("node:module")).createRequire("/opt/node-tools/node_modules/")("playwright"); }
  const { chromium } = pw;
  browser ??= await chromium.launch();
  const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(`<html><body style="margin:0">${svg.replace(/^<\?xml[^>]*>/, "")}</body></html>`);
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
}
export async function closeBrowser() { if (browser) await browser.close(); browser = null; }
