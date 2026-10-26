// Picture -> model, step one: READ the picture into a feature table before
// writing any code. Shared by the app's chat (viewer/index.html) and the
// benchmark generator (bench/cadgen/run.mjs), so the same rules read a
// dimensioned drawing, a hand sketch, a photo of a part or a screenshot.
//
//   READ_RULES / TABLE_SCHEMA     what the AI is told (one text, both callers)
//   parseReply(text)              -> { table, tableText, code, prose, zoom }
//   normalizeTable(t)             -> the table with numbers coerced, plus warnings
//   tableRows(t) / tableText(t)   -> the table for people (the chat's summary)
//   tileRects(w, h)               -> overview + zoomed tiles for a large image
//   zoomRects(zoom, w, h)         -> crops the AI asked to see closer
//   fixPrompt / lookPrompt / candidateHint   follow-up turns
//   wantsModelFromImage(text)     the chat's "make this from the picture" test
//
// The step after building is src/selfcheck.js: measure the exact model and
// diff it against this table.

export const TABLE_SCHEMA = `{ "kind": "drawing | sketch | photo | screenshot | render",
  "scale": { "source": "dimensions | stated | reference | estimated | unknown", "basis": "what the sizes come from" },
  "frame": "where the origin is and which way each axis points (a min-corner origin with Z up is easiest)",
  "overall": { "x": .., "y": .., "z": .. },
  "bbox": { "min": [x, y, z], "max": [x, y, z] },
  "body": [ "each base solid / step / rib / boss block / cut-out with its size and position" ],
  "features": [ { "id": "A", "type": "hole|cbore|csk|tapped|slot|pocket|boss|keyway|chamfer|fillet", "count": n,
                  "positions": [[x, y, z], ...],   // centre ON the surface it enters, in your frame
                  "axis": "+z|-z|+x|-x|+y|-y",     // outward normal of that surface
                  "dia": .., "depth": .. or "thru", "cbore": {"d": .., "depth": ..}, "csk": {"d": .., "angle": ..},
                  "width": .., "length": .., "along": "x|y|<degrees in XY>",   // slots: overall length, its direction
                  "height": ..,                                              // bosses
                  "source": "the callout or the evidence you read", "confidence": "high|medium|low" } ],
  "guessed": [ "every number you did not read off the image, and why you chose it" ],
  "zoom": [ [x0, y0, x1, y1], ... ]   // optional: regions of the WHOLE image (fractions 0-1) you could not read and want to see closer
}`;

export const READ_RULES = `READING A PICTURE INTO A MODEL — two steps, always in this order.
STEP 1, THE FEATURE TABLE: before any code, write what the picture shows as a JSON table (schema below). STEP 2, THE CODE: BREPcode that builds exactly that table. The app measures the finished model against your table (overall size, every hole's axis, position, diameter, depth, counterbore, countersink, slot ends) and sends back every disagreement, so a careful table is what makes the model right.

What kind of picture is it?
- A DIMENSIONED DRAWING (views, dimension lines, callouts, a title block): every number comes from the drawing. Units are mm unless stated. Third-angle projection unless stated: the TOP/plan view looks down -Z (X right, Y up the sheet), FRONT looks along +Y (X right, Z up), RIGHT looks along -X (Y right, Z up); first-angle swaps their places, so check the projection symbol. Sections (hatched) show the inside; hidden (dashed) lines show internal features; a detail view is a zoomed region. Derive positions from chains of dimensions, symmetry and centre lines. Do not measure pixels when a number exists; if one is truly missing, estimate it from the drawing's scale against a known dimension and list it under "guessed".
- Callouts: "4X Ø6.6 THRU" = four Ø6.6 holes through. "⌴ Ø11 ↧ 6.5" / "CBORE Ø11 X 6.5 DEEP" = counterbore. "⌵ Ø12 X 90°" / "CSK" / "CSINK" = countersink (diameter at the surface, included angle). "↧ 10" = depth 10. "M6x1" / "M12x1.75-6H - 15 DEEP" tapped = model the tap-drill diameter (M3 2.5, M4 3.3, M5 4.2, M6 5, M8 6.8, M10 8.5, M12 10.2, M16 14) to the thread depth. "R5 TYP" = all similar corners. "PCD"/"B.C." = bolt-circle diameter; "EQ SP" = equally spaced. "8X 1.5 x 45°" = chamfers.
- A HAND SKETCH: read the numbers written on it; proportions between them come from the sketch. Sketches are rarely to scale, so never measure one where a number exists.
- A PHOTO of a part, a SCREENSHOT or a RENDER with no dimensions: work out the solids and cuts that make it (a plate, bosses, holes, a slot), and get the SIZE from, in order: a size the user stated (scale.source "stated"); a known object in the picture, such as a ruler, a coin, a hand, a standard bolt or a USB port (source "reference", say which); otherwise ask. In a chat, if no size was stated and nothing in the picture gives one, ask for ONE key size in one short question instead of writing the table; if the user told you to go ahead anyway, choose a sensible size, set scale.source "estimated", round every derived number and list it under "guessed". Never present an estimated size as if you read it.
Mark each feature's "confidence"; anything inferred goes in "guessed". If text is too small to read, say so and add its region to "zoom" rather than guessing silently.`;

// What the code must do to match the table (the self-check's language).
export const BUILD_RULES = `Building from the table:
- Work in the table's frame: the numbers in the code are the numbers in the table. ONE solid: union the body pieces (overlap by 0.5 mm, never just touch), then cut.
- Holes: drill([x, y, z], [nx, ny, nz], { d, depth }) with the point ON the entry surface and the outward normal; { through: true } for THRU; counterbore cbore: { d, depth }; countersink csink: { d, angle } (d at the surface). Never put $fn on a cylinder, cone or hole.
- rotate([a, b, c]) turns about Z FIRST, then Y, then X (three.js Euler order, not OpenSCAD's). Turn about one axis per call and nest calls for two.
- Slots: hull({ exact: true }, cylinder, cylinder) between the two end centres. Rounded rectangles: fillet({ r, edges: "z" }, cube(...)).`;

export function readerRules({ schema = true } = {}) {
  return [READ_RULES, schema ? `The table (JSON; drop keys that do not apply):\n${TABLE_SCHEMA}` : "", BUILD_RULES].filter(Boolean).join("\n\n");
}

// ------------------------------------------------------------ the reply

// JSON as models write it: // comments, trailing commas, "..".
export function parseLooseJSON(s) {
  if (typeof s !== "string") return null;
  try { return JSON.parse(s); } catch { /* loosen */ }
  let t = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { t += c; if (c === "\\") { t += s[++i] ?? ""; } else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; t += c; continue; }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; t += "\n"; continue; }
    if (c === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i + 2); if (i < 0) break; i++; continue; }
    t += c;
  }
  t = t.replace(/,\s*([}\]])/g, "$1").replace(/:\s*\.\.(?=\s*[,}])/g, ": null");
  try { return JSON.parse(t); } catch { return null; }
}

// The answer: a ```json table, then a ```js block (the LAST code fence wins,
// so a model that writes a draft and then the fix is read as the fix).
export function parseReply(text) {
  const s = String(text ?? "");
  const fences = [...s.matchAll(/```([\w-]*)[ \t]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), body: m[2] }));
  const jsonF = fences.find((f) => f.lang === "json") || fences.find((f) => !f.lang && /^\s*\{[\s\S]*"features"/.test(f.body));
  const codeF = [...fences].reverse().find((f) => f !== jsonF && /^(js|javascript|jsx|ts|typescript|)$/.test(f.lang) && !/^\s*\{\s*"/.test(f.body));
  let code = codeF?.body ?? null;
  // cut off by the token limit: an opening fence with no close
  if (!code) {
    const open = /```(?:js|javascript)?[ \t]*\n((?:(?!```)[\s\S])*)$/.exec(s);
    if (open && open[1].trim() && !/^\s*\{\s*"/.test(open[1])) code = open[1];
  }
  const tableText = jsonF?.body ?? null;
  const table = tableText ? parseLooseJSON(tableText) : null;
  const prose = s.replace(/```[\w-]*[ \t]*\n[\s\S]*?```/g, "").replace(/```[\w-]*[ \t]*\n[\s\S]*$/, "").trim();
  return { table, tableText, code: code?.trim() || null, prose, zoom: zoomOf(table) };
}

function zoomOf(t) {
  const z = t?.zoom;
  if (!Array.isArray(z)) return [];
  return z.filter((r) => Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(+v))).map((r) => r.map(Number)).slice(0, 4);
}

const n = (v) => (v == null || v === "" ? null : Number.isFinite(+v) ? +v : null);

// Coerce what the model wrote into what the self-check reads, and say what
// is missing. Never invents a value: a missing number stays missing.
export function normalizeTable(t) {
  const warnings = [];
  if (!t || typeof t !== "object") return { table: null, warnings: ["no feature table"] };
  const out = { ...t };
  if (t.overall) out.overall = { x: n(t.overall.x), y: n(t.overall.y), z: n(t.overall.z) };
  else warnings.push("no overall size");
  out.features = (Array.isArray(t.features) ? t.features : []).map((f, i) => {
    const g = { ...f, id: f.id ?? String.fromCharCode(65 + (i % 26)) };
    g.type = String(f.type || "hole").toLowerCase();
    if (!Array.isArray(g.positions) && Array.isArray(f.position)) g.positions = [f.position];
    if (Array.isArray(g.positions) && g.positions.length && !Array.isArray(g.positions[0])) g.positions = [g.positions];
    g.positions = (g.positions || []).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [n(p[0]) ?? 0, n(p[1]) ?? 0, n(p[2]) ?? 0]);
    if (f.dia == null && f.d != null) g.dia = f.d;
    if (typeof g.depth === "string" && /thru|through/i.test(g.depth)) g.depth = "thru";
    if (f.count != null && g.positions.length && +f.count !== g.positions.length) warnings.push(`${g.id}: count ${f.count} but ${g.positions.length} positions`);
    if (!g.positions.length && !/chamfer|fillet/.test(g.type)) warnings.push(`${g.id}: no positions`);
    return g;
  });
  out.guessed = Array.isArray(t.guessed) ? t.guessed : Array.isArray(t.uncertain) ? t.uncertain : [];
  return { table: out, warnings };
}

// ------------------------------------------------------------ for people

const f2 = (v) => (v == null ? "" : String(Math.round(+v * 100) / 100));
const posText = (p) => `(${p.map(f2).join(", ")})`;

export function tableRows(t) {
  const rows = [];
  if (!t) return rows;
  if (t.overall) rows.push({ id: "", what: "overall", size: ["x", "y", "z"].map((k) => f2(t.overall[k]) || "?").join(" × "), where: t.frame || "", source: t.scale ? `${t.scale.source || ""}${t.scale.basis ? `: ${t.scale.basis}` : ""}` : "", confidence: "" });
  for (const f of t.features || []) {
    const pos = f.positions || [];
    const size = [
      f.dia != null ? `Ø${f2(f.dia)}` : "",
      f.width != null ? `${f2(f.width)} wide` : "", f.length != null ? `${f2(f.length)} long` : "",
      f.depth === "thru" ? "THRU" : f.depth != null ? `↧${f2(f.depth)}` : "",
      f.cbore ? `⌴Ø${f2(f.cbore.d)}↧${f2(f.cbore.depth)}` : "", f.csk ? `⌵Ø${f2(f.csk.d)}×${f2(f.csk.angle ?? 90)}°` : "",
      f.height != null ? `${f2(f.height)} high` : "",
    ].filter(Boolean).join(" ");
    rows.push({
      id: f.id, what: `${pos.length > 1 ? `${pos.length}× ` : ""}${f.type}`, size,
      where: `${pos.slice(0, 4).map(posText).join(" ")}${pos.length > 4 ? " …" : ""}${f.axis ? ` along ${f.axis}` : ""}`,
      source: f.source || "", confidence: f.confidence || "",
    });
  }
  return rows;
}

// Plain text: a chat bubble, a log, or the box the user edits.
export function tableText(t) {
  const rows = tableRows(t);
  const lines = rows.map((r) => `${r.id ? `${r.id}. ` : ""}${r.what}  ${r.size}  ${r.where}${r.confidence && r.confidence !== "high" ? `  [${r.confidence}]` : ""}`);
  if (t?.guessed?.length) lines.push(`guessed: ${t.guessed.join("; ")}`);
  return lines.join("\n");
}

// ------------------------------------------------------------ the image

// An overview plus zoomed tiles. A tile never shows more than ~1.15x the
// pixels the model will see (maxEdge), so small text stays readable; a small
// image is sent whole and alone.
export function tileRects(w, h, { maxEdge = 1568, overlap = 0.12 } = {}) {
  const rects = [{ name: "overview", x: 0, y: 0, w, h }];
  const long = Math.max(w, h);
  if (long <= maxEdge * 1.15) return rects;
  const fitN = (n) => Math.min(3, Math.max(1, Math.ceil(n / (maxEdge * 1.15))));
  const cols = Math.max(fitN(w), w >= h ? 2 : 1), rows = Math.max(fitN(h), h > w ? 2 : 1);
  const tw = w / cols, th = h / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = Math.max(0, Math.floor(c * tw - overlap * tw)), x1 = Math.min(w, Math.ceil((c + 1) * tw + overlap * tw));
    const y0 = Math.max(0, Math.floor(r * th - overlap * th)), y1 = Math.min(h, Math.ceil((r + 1) * th + overlap * th));
    rects.push({ name: `tile_${r}${c}`, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return rects;
}

export function tilesNote(rects) {
  if (rects.length <= 1) return "";
  const t = rects.slice(1).map((r) => r.name.replace("tile_", "")).map(([r, c]) => `row ${+r + 1} col ${+c + 1}`);
  return `The picture comes as the whole image first, then ${rects.length - 1} zoomed tiles of it (${t.join(", ")}; they overlap a little). Read numbers from the tiles.`;
}

// Regions the AI asked to see closer, as pixel rects (padded 5%, at least
// 1/8 of the image so a tiny box keeps some context).
export function zoomRects(zoom, w, h) {
  return (zoom || []).map((z, i) => {
    let [x0, y0, x1, y1] = z.map((v) => Math.min(1, Math.max(0, v)));
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hw = Math.max((x1 - x0) * 0.55, 1 / 16), hh = Math.max((y1 - y0) * 0.55, 1 / 16);
    const X0 = Math.max(0, cx - hw), X1 = Math.min(1, cx + hw), Y0 = Math.max(0, cy - hh), Y1 = Math.min(1, cy + hh);
    const x = Math.round(X0 * w), y = Math.round(Y0 * h);
    return { name: `zoom_${i}`, x, y, w: Math.round(X1 * w) - x, h: Math.round(Y1 * h) - y };
  }).filter((r) => r.w > 8 && r.h > 8);
}

// ------------------------------------------------------------ follow-ups

// The self-check's disagreements, for the AI to fix. Both may be wrong: the
// table can be misread as easily as the code can be mistyped.
export function fixPrompt(diffText, { notes = [] } = {}) {
  return `The app measured the model you built against your own feature table. These disagree:\n${diffText}`
    + (notes.length ? `\nAlso noticed:\n${notes.map((x) => `- ${x}`).join("\n")}` : "")
    + `\n\nFor each one, look at the picture again and decide which is wrong: the TABLE (a misread number, a wrong position or axis) or the CODE (it does not build what the table says). Fix whichever is wrong. Answer again in the same two blocks: the corrected \`\`\`json table, then the complete \`\`\`js code.`;
}

export function lookPrompt({ selfCheck = "" } = {}) {
  return `LOOK-COMPARE. The first picture is the original. The next one is a 3-view drawing of the model you built, drawn by the app from the exact solid (third-angle: TOP above FRONT, RIGHT beside FRONT, an isometric in the corner, overall sizes dimensioned; hidden edges dashed).`
    + `${selfCheck ? ` The self-check against your table: ${selfCheck}.` : ""}`
    + ` Compare them view by view: the outline, every step and boss, every hole (count, position, size, through or blind), slots, pockets, chamfers and fillets, and which side each feature is on. If the model matches the original, answer exactly NO CHANGES. Otherwise list each difference in one line, then answer in the same two blocks: the corrected \`\`\`json table, then the complete \`\`\`js code.`;
}

// Extra candidates differ on purpose, so a misreading in one is not repeated
// in all.
export const CANDIDATE_HINTS = [
  "",
  "Build this candidate from a fresh reading: re-derive every position from the dimension chains (not from your earlier table), and check the projection (which view is TOP, FRONT, RIGHT) before placing anything.",
  "Build this candidate with the simplest construction that matches every dimension: one base body, then each feature as its own cut, in table order. Re-check each hole's entry face and axis.",
];
export function candidateHint(i) { return CANDIDATE_HINTS[i % CANDIDATE_HINTS.length]; }

// ------------------------------------------------------------ the chat's test

// "make this from the drawing", "model this part", "turn this sketch into 3D"
// with a picture attached: the requests the two-step reader is for. A logo to
// emboss or a texture is not one of them.
export function wantsModelFromImage(text, { hasImage = true } = {}) {
  if (!hasImage) return false;
  const s = String(text || "").toLowerCase();
  if (/\b(emboss|deboss|engrave|stamp|logo|stencil|texture|heightmap|lithophane|cookie)\b/.test(s)) return false;
  if (/\b(drawing|blueprint|sketch|dimensions?|dimensioned|sheet|schematic|technical drawing)\b/.test(s)) return true;
  if (/\b(make|model|build|recreate|reproduce|copy|replicate|turn|convert|create|cad)\b[\s\S]{0,40}\b(this|it|that|the (?:part|picture|image|photo|one))\b/.test(s)) return true;
  if (/\b(from|of) (?:this|the|my) (?:picture|image|photo|screenshot|sketch|drawing)\b/.test(s)) return true;
  return s.trim().length < 3;   // a bare picture sent with no words
}
