// Scannable-code geometry: QR, DataMatrix, Code 128 — built on bwip-js (MIT),
// the reference barcode encoder, so the output actually scans instead of being
// a hand-rolled approximation. Lazy: this module (and the ~200 KB encoder) only
// load when a model calls qrcode()/datamatrix()/barcode().
//
// The module grid is read back off a 1-pixel-per-module canvas render — the one
// technique that behaves identically in every browser and Node build of
// bwip-js. Dark modules become raised (or sunken) cuboids on a base plate;
// consecutive dark modules in a row merge into ONE cuboid (a v3 QR has ~450
// dark modules but ~120 row-runs), and it all lands in a group() (no booleans)
// so even dense codes build fast.
//
// Print advice baked into the defaults: modules >= 1.2 mm, relief >= 0.6 mm,
// dark-on-light contrast — codes that scan reliably off an FDM part.

import * as dsl from "../src/dsl.js";

let bwip = null;
export async function loadCodes() {
  if (!bwip) bwip = await import("/node_modules/bwip-js/dist/bwip-js.mjs");
  return bwip;
}

// A binary grid extruded into ONE watertight mesh, imported as a single solid.
// This is the key to letters and sunken codes: a difference()/union() with one
// mesh is a single boolean, whereas unioning hundreds of little cubes runs the
// kernel's O(n) boolean chain and locks the tab. Only the boundary of the filled
// region gets side walls (shared edges between filled cells carry none), so the
// mesh is manifold. Deterministic name -> identical geometry reuses one import.
function gridToMesh(grid, w, h, module, height, xoff = 0, yoff = 0, tag = "") {
  const F = [];
  const filled = (x, y) => x >= 0 && x < w && y >= 0 && y < h && grid[y][x];
  const facet = (nx, ny, nz, a, b, c) =>
    F.push(`facet normal ${nx} ${ny} ${nz}\nouter loop\nvertex ${a[0]} ${a[1]} ${a[2]}\nvertex ${b[0]} ${b[1]} ${b[2]}\nvertex ${c[0]} ${c[1]} ${c[2]}\nendloop\nendfacet`);
  const quad = (nx, ny, nz, p, q, r, s) => { facet(nx, ny, nz, p, q, r); facet(nx, ny, nz, p, r, s); };
  const H = height, m = module;
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      if (!grid[gy][gx]) continue;
      const x0 = xoff + gx * m, x1 = x0 + m;
      const y0 = yoff + (h - 1 - gy) * m, y1 = y0 + m;   // row 0 = top -> upright
      const A = [x0, y0], B = [x1, y0], C = [x1, y1], D = [x0, y1];
      quad(0, 0, 1, [...A, H], [...B, H], [...C, H], [...D, H]);    // top +Z
      quad(0, 0, -1, [...A, 0], [...D, 0], [...C, 0], [...B, 0]);   // bottom -Z
      // side wall only where the neighbour is empty -> boundary is manifold
      if (!filled(gx - 1, gy)) quad(-1, 0, 0, [x0, y0, 0], [x0, y0, H], [x0, y1, H], [x0, y1, 0]);
      if (!filled(gx + 1, gy)) quad(1, 0, 0, [x1, y0, 0], [x1, y1, 0], [x1, y1, H], [x1, y0, H]);
      if (!filled(gx, gy + 1)) quad(0, -1, 0, [x0, y0, 0], [x1, y0, 0], [x1, y0, H], [x0, y0, H]);
      if (!filled(gx, gy - 1)) quad(0, 1, 0, [x1, y1, 0], [x0, y1, 0], [x0, y1, H], [x1, y1, H]);
    }
  }
  if (!F.length) throw new Error("nothing to build");
  let hash = 0; for (let i = 0; i < F.length; i += 7) hash = (hash * 131 + F[i].length) | 0;
  const name = `__glyph_${tag}_${(hash >>> 0).toString(36)}_${F.length}.stl`;
  if (!dsl.listImports().includes(name)) dsl.registerImport(name, `solid g\n${F.join("\n")}\nendsolid g\n`);
  return dsl.importedMesh(name);
}

const BCID = { qrcode: "qrcode", datamatrix: "datamatrix", barcode: "code128" };

// -------------------------------------------------------------------- text
// Real filled letters (any installed font) via the same canvas-readback trick:
// render the string, read the pixels, build run-merged cuboids. No font file to
// bundle, no glyph-outline math — and it reads far better than a stick font.
export function textGrid(str, o = {}) {
  const px = Math.max(16, Math.round(o.px ?? 48));      // render height in pixels
  const family = o.font || "Arial, sans-serif";
  const weight = o.bold === false ? "normal" : "bold";  // bold prints/scans better
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d");
  ctx.font = `${weight} ${px}px ${family}`;
  const s = String(str);
  const w = Math.ceil(ctx.measureText(s).width) + 4;
  const h = Math.ceil(px * 1.35);
  cv.width = Math.max(1, w); cv.height = h;
  const c2 = cv.getContext("2d");
  c2.font = `${weight} ${px}px ${family}`;
  c2.textBaseline = "middle";
  c2.fillStyle = "#000";
  c2.fillText(s, 2, h / 2);
  const data = c2.getImageData(0, 0, cv.width, cv.height).data;
  // crop to ink bounds so there's no dead border baked into the geometry
  let minX = cv.width, minY = cv.height, maxX = 0, maxY = 0;
  const dark = (x, y) => data[(y * cv.width + x) * 4 + 3] > 40;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    if (dark(x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < minX) throw new Error("nothing to render");
  const gw = maxX - minX + 1, gh = maxY - minY + 1;
  const grid = [];
  for (let y = 0; y < gh; y++) {
    const row = new Uint8Array(gw);
    for (let x = 0; x < gw; x++) row[x] = dark(minX + x, minY + y) ? 1 : 0;
    grid.push(row);
  }
  return { grid, w: gw, h: gh };
}

// text+kind -> { grid: rows of 0/1, w, h }. Renders at scale S with no padding,
// then samples the centre of each SxS block so edge anti-aliasing never flips a
// module. Canvas width / S == module count exactly (padding is off).
export function codeGrid(kind, text, S = 6) {
  if (!bwip) throw new Error("codes engine not loaded");
  const cv = document.createElement("canvas");
  bwip.toCanvas(cv, {
    bcid: BCID[kind], text: String(text),
    scale: S, paddingwidth: 0, paddingheight: 0,
    includetext: false, backgroundcolor: "FFFFFF", barcolor: "000000",
    // Code 128 needs a usable bar height; matrix codes ignore it
    ...(kind === "barcode" ? { height: 8 } : {}),
  });
  const w = Math.round(cv.width / S), h = Math.round(cv.height / S);
  const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  const dark = (cx, cy) => {
    const i = (cy * cv.width + cx) * 4;
    // luminance < 128 and not transparent => a dark module
    return px[i + 3] > 20 && (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) < 128;
  };
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w);
    const cy = Math.min(cv.height - 1, y * S + (S >> 1));
    for (let x = 0; x < w; x++) row[x] = dark(Math.min(cv.width - 1, x * S + (S >> 1)), cy) ? 1 : 0;
    grid.push(row);
  }
  return { grid, w, h };
}

// base plate + one cuboid per horizontal run of dark modules.
// mode "emboss" (default) raises the code; "deboss" sinks it via difference.
// A scannable code needs DARK-ON-LIGHT contrast, and on a print that means two
// filaments. The raised modules are therefore tagged near-black and the plate
// near-white by default, which is what makes the 2-colour 3MF export come out
// scannable straight off the printer. Pass color/baseColor to override, or
// baseColor: null to leave the plate the model's own colour.
const toHexColor = (c) => {
  if (c == null) return null;
  if (Array.isArray(c)) {
    const to = (v) => Math.max(0, Math.min(255, Math.round((v ?? 0) * 255))).toString(16).padStart(2, "0");
    return "#" + to(c[0]) + to(c[1]) + to(c[2]);
  }
  const s = String(c).trim();
  if (s[0] === "#") return s.length === 4 ? "#" + s.slice(1).split("").map((x) => x + x).join("") : s;
  return ({ black: "#111111", white: "#f2f2f2", red: "#cc2222", blue: "#2244cc", green: "#22aa44" })[s.toLowerCase()] || s;
};
const tint = (shape, hex) => { if (shape && hex) shape.color = hex; return shape; };

export function gridToShape(g, o) {
  const module = o.module ?? 1.6;                  // mm per module — 1.2+ scans reliably
  const oneD = g.h <= 2;                            // Code 128 is a single tall row
  const barH = o.barHeight ?? (oneD ? (o.height ?? 12) : module);
  const relief = o.relief ?? 0.8;
  const border = o.border ?? 2 * module;           // quiet zone — scanners need it
  const baseT = o.base ?? 2;

  const darkHex = toHexColor(o.color ?? o.codeColor ?? o.dark ?? "#111111");
  const baseHex = "baseColor" in o || "plateColor" in o
    ? toHexColor(o.baseColor ?? o.plateColor)
    : toHexColor("#f2f2f2");

  const codeW = g.w * module;
  const codeH = oneD ? barH : g.h * module;
  const base = tint(dsl.cube([codeW + 2 * border, codeH + 2 * border, baseT]), baseHex);

  // Codes are RAISED (emboss) only — that's the right form for scanning off a
  // print: raise the dark modules and print them in a contrasting filament (see
  // the 2-colour 3MF export). Deboss is deliberately not offered for codes: a
  // QR is hundreds of disconnected modules, which makes a cut that either locks
  // the tab or produces empty geometry. A group() (no boolean) stays fast even
  // for a dense QR. (text()/stencil() DO support cutting — they're connected.)
  const bars = [];
  for (let y = 0; y < g.h; y++) {
    const row = g.grid[y];
    for (let x = 0; x < g.w; x++) {
      if (!row[x]) continue;
      let x2 = x;
      while (x2 + 1 < g.w && row[x2 + 1]) x2++;     // merge the run
      const runW = (x2 - x + 1) * module;
      const yPos = border + (oneD ? 0 : (g.h - 1 - y) * module);  // row 0 = top, read upright
      const barD = oneD ? barH : module;
      bars.push(dsl.translate([border + x * module, yPos, baseT],
        tint(dsl.cube([runW, barD, relief]), darkHex)));
      x = x2;
    }
  }
  if (!bars.length) throw new Error("empty code — nothing to build");
  const shape = dsl.group(base, ...bars);
  // center:true puts the plate's middle on the origin, which is what placing a
  // code on a face needs: the click point becomes the code's centre.
  if (!o.center) return shape;
  const plateW = codeW + 2 * border, plateH = codeH + 2 * border;
  return dsl.translate([-plateW / 2, -plateH / 2, 0], shape);
}

// Letters -> solids. `size` = cap height in mm; run-merged per row. Centred in
// XY by default (labels want that); center:false puts a corner at the origin.
// Combine it yourself: union(plate, text(...)) embosses, difference(plate,
// text({..., mode:'deboss'})) embeds.
function textToShape(g, o) {
  const size = o.size ?? 8;                              // cap height in mm
  const module = size / g.h;
  const depth = o.height ?? o.depth ?? 1;
  const deboss = o.mode === "deboss";
  // deboss cutters run a touch below z=0 so the boolean cuts cleanly
  const H = depth + (deboss ? 0.4 : 0);
  const xoff = o.center === false ? 0 : -(g.w * module) / 2;
  const yoff = o.center === false ? 0 : -(g.h * module) / 2;
  const zshift = deboss ? -0.2 : 0;
  const mesh = gridToMesh(g.grid, g.w, g.h, module, H, xoff, yoff, "t");
  return zshift ? dsl.translate([0, 0, zshift], mesh) : mesh;
}

// STENCIL: a plate with the letters cut all the way through, and auto "tabs" —
// thin uncut bridges — that hold each letter's inner island (the counter of O,
// A, P, R, 0, 4, 6, 8, 9…) to the frame so it doesn't fall out. Sprayed through,
// the holes read as the letters. Built as plate − ONE mesh cutter.
function stencilCut(g, o) {
  const size = o.size ?? 12;
  const module = size / g.h;
  const pad = Math.max(2, Math.round((o.margin ?? size * 0.6) / module));
  const W = g.w + 2 * pad, H = g.h + 2 * pad;
  const ink = Array.from({ length: H }, () => new Uint8Array(W));   // 1 = cut
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.grid[y][x]) ink[y + pad][x + pad] = 1;

  // material (non-ink) reachable from the border = "attached" to the frame
  const attached = Array.from({ length: H }, () => new Uint8Array(W));
  const stack = [];
  const push = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H && !ink[y][x] && !attached[y][x]) { attached[y][x] = 1; stack.push([x, y]); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) { const [x, y] = stack.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }

  // each enclosed island (non-ink, not attached) gets one tab: the shortest
  // straight run of ink connecting it to attached material, carved back to solid
  const tabW = Math.max(1, Math.round((o.tab ?? Math.max(0.8, module * 1.1)) / module));
  const seen = Array.from({ length: H }, () => new Uint8Array(W));
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    if (ink[y0][x0] || attached[y0][x0] || seen[y0][x0]) continue;
    const comp = []; const st = [[x0, y0]]; seen[y0][x0] = 1;
    while (st.length) {
      const [cx, cy] = st.pop(); comp.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && !ink[ny][nx] && !attached[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = 1; st.push([nx, ny]); }
      }
    }
    let best = null;
    for (const [cx, cy] of comp) {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        let nx = cx + dx, ny = cy + dy, len = 0;
        while (nx >= 0 && nx < W && ny >= 0 && ny < H && ink[ny][nx]) { nx += dx; ny += dy; len++; }
        if (len > 0 && nx >= 0 && nx < W && ny >= 0 && ny < H && attached[ny][nx] && (!best || len < best.len)) best = { cx, cy, dx, dy, len };
      }
    }
    if (best) {
      const perp = best.dx ? [0, 1] : [1, 0];
      for (let s = 1; s <= best.len; s++) {
        const bx = best.cx + best.dx * s, by = best.cy + best.dy * s;
        for (let t = -(tabW >> 1); t <= tabW >> 1; t++) {
          const tx = bx + perp[0] * t, ty = by + perp[1] * t;
          if (tx >= 0 && tx < W && ty >= 0 && ty < H) ink[ty][tx] = 0;   // leave a tab
        }
      }
    }
  }

  const thickness = o.thickness ?? o.height ?? 2;
  const plateW = W * module, plateH = H * module;
  const plate = dsl.cube([plateW, plateH, thickness]);
  const cutter = dsl.translate([0, 0, -0.4], gridToMesh(ink, W, H, module, thickness + 0.8, 0, 0, "s"));
  const stencil = dsl.difference(plate, cutter);
  return o.center === false ? stencil : dsl.translate([-plateW / 2, -plateH / 2, 0], stencil);
}

// text() needs no encoder — canvas is always there — so it builds synchronously
// once this module is loaded.
// Render resolution: pick pixels-per-text-height so a module is ~0.4mm and the
// cutter mesh stays light (facet count, and thus boolean time, scales with it).
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const autoPx = (size, target = 0.42, lo = 20, hi = 40) => clamp(Math.round(size / target), lo, hi);

export function makeTextOp() {
  return (optsOrText, maybeOpts) => {
    const o = typeof optsOrText === "string" ? { text: optsOrText, ...(maybeOpts || {}) } : (optsOrText || {});
    const s = o.text ?? o.string ?? o.value;
    if (s == null || s === "") throw new Error('text() needs a string, e.g. text({ text: "PART-01", size: 8 })');
    const px = o.px ?? autoPx(o.size ?? 8, o.mode === "stencil" ? 0.45 : 0.42, o.mode === "stencil" ? 24 : 20, 44);
    const grid = textGrid(s, { ...o, px });
    return o.mode === "stencil" ? stencilCut(grid, o) : textToShape(grid, o);
  };
}

// Dedicated op so `stencil("OPEN")` reads naturally and can't be confused with
// emboss/deboss text. Same engine, mode forced to stencil.
export function makeStencilOp() {
  return (optsOrText, maybeOpts) => {
    const o = typeof optsOrText === "string" ? { text: optsOrText, ...(maybeOpts || {}) } : (optsOrText || {});
    const s = o.text ?? o.string ?? o.value;
    if (s == null || s === "") throw new Error('stencil() needs a string, e.g. stencil({ text: "OPEN", size: 14 })');
    return stencilCut(textGrid(s, { ...o, px: o.px ?? autoPx(o.size ?? 12, 0.45, 24, 44) }), o);
  };
}

// Async-behind-a-sync-op: the DSL vocab is synchronous, but encoding is async
// (the engine lazy-loads). First call kicks off the encode and throws a
// friendly "generating…"; onReady re-runs the build; the retry hits the cache.
const gridCache = new Map();
const pending = new Map();

export function makeCodeOp(kind, onReady) {
  return (optsOrText, maybeOpts) => {
    const o = typeof optsOrText === "string"
      ? { text: optsOrText, ...(maybeOpts || {}) }
      : (optsOrText || {});
    const text = o.text ?? o.data ?? o.value;
    if (text == null || text === "") {
      throw new Error(`${kind}() needs the text to encode, e.g. ${kind}({ text: "https://brepcode.com" })`);
    }
    const key = `${kind}|${text}`;
    const cached = gridCache.get(key);
    if (cached) {
      if (cached.error) throw new Error(`${kind}(): ${cached.error}`);
      const codeShape = gridToShape(cached, o);
      // `label` prints human-readable text under the code (the standard
      // DataMatrix-plus-part-number layout). Uses the same text engine.
      if (o.label) {
        const module = o.module ?? 1.6;
        const codeW = cached.w * module;
        const txtSize = o.labelSize ?? Math.max(3, module * 2.5);
        const lg = textGrid(String(o.label), { px: 32 });
        const txt = textToShape(lg, { size: txtSize, height: o.relief ?? 0.8, center: true });
        const yBelow = -(o.border ?? 2 * module) - txtSize * 0.8;   // just under the plate
        const xCenter = codeW / 2 + (o.border ?? 2 * module);       // code's own centre
        const placed = dsl.translate([xCenter, yBelow, o.base ?? 2], txt);
        return dsl.group(codeShape, placed);                        // raised label under the code
      }
      return codeShape;
    }
    if (!pending.has(key)) {
      pending.set(key, (async () => {
        try {
          await loadCodes();
          gridCache.set(key, codeGrid(kind, text));
        } catch (e) {
          gridCache.set(key, { error: String(e?.message || e).slice(0, 120) });
        }
        pending.delete(key);
        onReady?.();                               // viewer re-runs the build
      })());
    }
    throw new Error(`Generating the ${kind === "barcode" ? "barcode" : kind.toUpperCase()}… one moment.`);
  };
}
