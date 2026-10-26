// The BREPcode assistant: a hardcoded rule engine for simple requests, plus
// optional bring-your-own-key API mode (Gemini / Claude) that generates code.

import { matchRequest, catalogSummary, rankFamilies, keyTokens, stem } from "../src/catalog/match.js";
import { catalogOf, editCatalog, capabilities } from "../src/catalog/edit.js";
import { catalogStats, FAMILIES, SPECS, CATEGORIES } from "../src/catalog/index.js";
import { EXACT_CORE } from "../src/exactlane.js";
import { readerRules, wantsModelFromImage, parseReply, normalizeTable, tableRows, tableText } from "../src/imageread.js";

// The picture-to-model reader (src/imageread.js), shared with the benchmark
// generator. Re-exported so the viewer reaches it through the one lazy import.
export { wantsModelFromImage, parseReply, normalizeTable, tableRows, tableText };

// ------------------------------------------------------------ rule engine

// NB: "tube" is deliberately absent — it's the torus thickness parameter, and
// listing it as a cylinder synonym made "donut tube 3" parse as two shapes.
const SHAPE_WORDS = {
  cube: "cube", box: "cube", block: "cube", plate: "cube", slab: "cube",
  cylinder: "cylinder", rod: "cylinder", post: "cylinder", pipe: "cylinder", disc: "cylinder", disk: "cylinder",
  cone: "cone", spike: "cone",
  sphere: "sphere", ball: "sphere", orb: "sphere", dome: "sphere",
  torus: "torus", donut: "torus", doughnut: "torus", ring: "torus",
};

const DEFAULTS = {
  cube: { x: 20, y: 20, z: 20 },
  cylinder: { r: 8, h: 20 },
  cone: { r: 10, h: 18 },
  sphere: { r: 10 },
  torus: { r: 12, tube: 4 },
};

function findShapes(text) {
  const found = [];
  const re = new RegExp(`\\b(${Object.keys(SHAPE_WORDS).join("|")})(?:s|es)?\\b`, "gi");
  for (const m of text.matchAll(re)) {
    found.push({ kind: SHAPE_WORDS[m[1].toLowerCase()], at: m.index });
  }
  // "two cubes" / "a pair of spheres"
  if (found.length === 1 && /\b(two|2|pair of|couple of)\b/.test(text)) {
    found.push({ ...found[0], at: found[0].at });
  }
  return found;
}

// "box 30", "30mm box", "radius 10", "10 tall", "r 5".
// Named values are removed from the text before bare numbers are collected,
// otherwise "plate 40 with a hole radius 5" reads the 5 as a plate dimension.
function extractSizes(text) {
  const out = { numbers: [] };
  const named = {
    r: /\b(?:r|radius)\s*[:=]?\s*(\d+\.?\d*)/i,
    h: /\b(?:h|height)\s*[:=]?\s*(\d+\.?\d*)/i,
    hPost: /(\d+\.?\d*)\s*(?:mm\s*)?(?:tall|high)/i,
    tube: /\b(?:tube|thickness)\s*[:=]?\s*(\d+\.?\d*)/i,
  };
  let stripped = text;
  for (const [k, re] of Object.entries(named)) {
    const m = stripped.match(re);
    if (m) {
      out[k === "hPost" ? "h" : k] = parseFloat(m[1]);
      stripped = stripped.replace(m[0], " ");
    }
  }
  for (const m of stripped.matchAll(/(-?\d+\.?\d*)\s*(?:mm)?/g)) out.numbers.push(parseFloat(m[1]));
  return out;
}

function shapeCall(kind, dims) {
  const d = { ...DEFAULTS[kind], ...dims };
  switch (kind) {
    case "cube": return `cube([${d.x}, ${d.y}, ${d.z}])`;
    case "cylinder": return `cylinder({ r: ${d.r}, h: ${d.h}, $fn: 48 })`;
    case "cone": return `cone({ r1: ${d.r}, r2: 0, h: ${d.h}, $fn: 48 })`;
    case "sphere": return `sphere({ r: ${d.r}, $fn: 48 })`;
    case "torus": return `torus({ r: ${d.r}, tube: ${d.tube}, $fn: 48 })`;
  }
}

// footprint + height, for stacking
function footprint(kind, dims) {
  const d = { ...DEFAULTS[kind], ...dims };
  switch (kind) {
    case "cube": return { cx: d.x / 2, cy: d.y / 2, top: d.z, centred: false };
    case "cylinder": case "cone": return { cx: 0, cy: 0, top: d.h, centred: true };
    case "sphere": return { cx: 0, cy: 0, top: d.r, centred: true, liftZ: d.r };
    case "torus": return { cx: 0, cy: 0, top: d.tube, centred: true, liftZ: d.tube };
  }
}

function composeStack(base, top) {
  const fb = footprint(base.kind, base.dims);
  const ft = footprint(top.kind, top.dims);
  const baseLift = fb.liftZ ? `translate([0, 0, ${fb.liftZ}], ${shapeCall(base.kind, base.dims)})` : shapeCall(base.kind, base.dims);
  const topZ = (fb.liftZ ? fb.liftZ + fb.top : fb.top) + (ft.liftZ ?? 0);
  const dx = fb.centred ? 0 : fb.cx, dy = fb.centred ? 0 : fb.cy;
  return `union(\n  ${baseLift},\n  translate([${dx}, ${dy}, ${topZ}], ${shapeCall(top.kind, top.dims)}),\n)`;
}

function composeSideBySide(a, b) {
  const fa = footprint(a.kind, a.dims);
  const da = { ...DEFAULTS[a.kind], ...a.dims };
  const width = a.kind === "cube" ? da.x : (da.r ?? 10) * 2;
  const liftA = fa.liftZ ? `translate([0, 0, ${fa.liftZ}], ${shapeCall(a.kind, a.dims)})` : shapeCall(a.kind, a.dims);
  const fb = footprint(b.kind, b.dims);
  const gap = width + 6;
  const liftB = `translate([${gap}, 0, ${fb.liftZ ?? 0}], ${shapeCall(b.kind, b.dims)})`;
  return `union(\n  ${liftA},\n  ${liftB},\n)`;
}

function composeHole(base, holeR) {
  const d = { ...DEFAULTS[base.kind], ...base.dims };
  const f = footprint(base.kind, base.dims);
  const cx = f.centred ? 0 : d.x / 2, cy = f.centred ? 0 : d.y / 2;
  const depth = (f.liftZ ? f.liftZ * 2 : f.top) + 2;
  const baseCall = f.liftZ ? `translate([0, 0, ${f.liftZ}], ${shapeCall(base.kind, base.dims)})` : shapeCall(base.kind, base.dims);
  return `difference(\n  ${baseCall},\n  translate([${cx}, ${cy}, -1], cylinder({ r: ${holeR}, h: ${depth}, $fn: 48 })),\n)`;
}

function describeDefaults(shapes) {
  return shapes.map((s) => {
    const d = { ...DEFAULTS[s.kind], ...s.dims };
    if (s.kind === "cube") return `${s.kind} ${d.x}×${d.y}×${d.z}`;
    if (s.kind === "sphere") return `${s.kind} r${d.r}`;
    if (s.kind === "torus") return `${s.kind} r${d.r}/tube${d.tube}`;
    return `${s.kind} r${d.r}×h${d.h}`;
  }).join(" + ");
}

// ------------------------------------------------- guided flows (archetypes)

// Parse "40 x 60", "4x6" (small values read as inches), "102 by 152"
function parsePairMm(text) {
  const m = text.match(/(\d+\.?\d*)\s*(?:x|by|×)\s*(\d+\.?\d*)\s*(in|inch|inches|")?/i);
  if (!m) return null;
  let a = parseFloat(m[1]), b = parseFloat(m[2]);
  const inches = m[3] || (a <= 24 && b <= 24);
  if (inches) { a *= 25.4; b *= 25.4; }
  return [Math.round(a), Math.round(b)];
}

function genBracket(a) {
  const { W = 20, L = 40, H = 40, T = 4, holes = 2, holeR = 2.25 } = a;
  const lines = [`const W = ${W}, L = ${L}, H = ${H}, T = ${T}, holeR = ${holeR};`];
  const holeCalls = [];
  for (let i = 0; i < holes; i++) {
    const f = (i + 1) / (holes + 1);
    holeCalls.push(`  translate([W * ${f.toFixed(2)}, L * 0.6, -1], cylinder({ r: holeR, h: T + 2, $fn: 24 })),`);
    holeCalls.push(`  translate([W * ${f.toFixed(2)}, T + 1, H * ${(0.35 + 0.4 * f).toFixed(2)}], rotate([90, 0, 0], cylinder({ r: holeR, h: T + 2, $fn: 24 }))),`);
  }
  lines.push(`return difference(`, `  union(`, `    cube([W, L, T]),`, `    cube([W, T, H]),`, `  ),`, ...holeCalls, `);`);
  return lines.join("\n");
}

function genFrame(a) {
  const { pw = 102, ph = 152, border = 12, T = 5, rounded = false } = a;
  const r = Math.min(10, border - 1);
  const outer = rounded
    ? `union(
    translate([${r}, 0, 0], cube([OW - ${2 * r}, OH, T])),
    translate([0, ${r}, 0], cube([OW, OH - ${2 * r}, T])),
    translate([${r}, ${r}, 0], cylinder({ r: ${r}, h: T, $fn: 32 })),
    translate([OW - ${r}, ${r}, 0], cylinder({ r: ${r}, h: T, $fn: 32 })),
    translate([${r}, OH - ${r}, 0], cylinder({ r: ${r}, h: T, $fn: 32 })),
    translate([OW - ${r}, OH - ${r}, 0], cylinder({ r: ${r}, h: T, $fn: 32 })),
  )`
    : `cube([OW, OH, T])`;
  return `// picture frame for a ${a.inches ? a.inches + '" ' : ""}${pw} x ${ph} mm photo
const PW = ${pw}, PH = ${ph}, B = ${border}, T = ${T};
const OW = PW + 2 * B, OH = PH + 2 * B;
return difference(
  ${outer},
  // front opening (3mm lip holds the photo)
  translate([B + 3, B + 3, -1], cube([PW - 6, PH - 6, T + 2])),
  // rear pocket for photo + backing
  translate([B - 0.5, B - 0.5, T - 2], cube([PW + 1, PH + 1, 3])),
);`;
}

function genHolder(a) {
  const { d = 80, h = 100, wall = 3, mount = false, holeR = 2.25 } = a;
  const base = `difference(
  cylinder({ r: ${d / 2 + wall}, h: ${h + wall}, $fn: 96 }),
  translate([0, 0, ${wall}], cylinder({ r: ${d / 2}, h: ${h + 2}, $fn: 96 })),
)`;
  if (!mount) return `// ${d}mm x ${h}mm holder, ${wall}mm walls\nreturn ${base};`;
  return `// wall-mount holder: cup + screw tab
const R = ${d / 2 + wall};
return difference(
  union(
    ${base.split("\n").join("\n    ")},
    translate([-${(d + 2 * wall) / 4}, R - 1, 0], cube([${(d + 2 * wall) / 2}, ${wall}, ${h + wall + 20}])),
  ),
  translate([0, R + ${wall} + 1, ${h + wall + 10}], rotate([90, 0, 0], cylinder({ r: ${holeR}, h: ${wall} + 2, $fn: 24 }))),
);`;
}

// ------------------------------- natural-language transforms ("flip it")

// Wrap whatever is in the editor. Statement-form code gets its final
// `return <expr>` wrapped; expression-form is wrapped whole.
function wrapCurrent(currentCode, wrap) {
  const src = currentCode.trim();
  if (!src) return null;
  const at = topLevelReturn(src);
  if (at >= 0 && /\b(const|let|var)\b/.test(src)) {
    return src.slice(0, at) + `return ${wrap(`(${src.slice(at + 6).trim().replace(/;\s*$/, "")})`)};`;
  }
  return wrap(`(\n${src}\n)`);
}

// Where the model's own final `return` starts: the last one at brace depth 0.
// A regex for "a line starting with return" found the FIRST such line, which
// in any file with a helper function (`const arc = (…) => { … return [x, y]; }`)
// is the helper's, and the wrap then swallowed the rest of the file:
// "missing ) after argument list". Strings and comments are skipped so a
// bracket inside one cannot unbalance the count.
export function topLevelReturn(src) {
  const all = topLevelReturns(src);
  return all.length ? all[all.length - 1] : -1;
}

// Every return at the top level of the editor's code, in order: a design can
// return early (`if (compartments < 2) return cup;`), and an op wrapped round
// only the last return never reaches that one.
function topLevelReturns(src) {
  let depth = 0;
  const at = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && c === "r" && src.startsWith("return", i)
      && !/[\w$]/.test(src[i - 1] || "") && !/[\w$]/.test(src[i + 6] || "")) at.push(i);
  }
  return at;
}

// Where the statement starting at i ends: the first ";" outside brackets,
// strings and comments (or the end of the source).
function statementEnd(src, i) {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && c === ";") return i;
  }
  return src.length;
}

function tryTransform(lower, currentCode) {
  // "make a box and rotate it 45" is a creation request, not a transform
  if (/\b(make|create|build|add)\b/.test(lower) && findShapes(lower).length) return null;
  let wrap = null, what = null;

  const angle = () => {
    const n = lower.match(/(-?\d+\.?\d*)\s*(?:deg|degrees|°)?/);
    let a = n && n[1] !== "" ? parseFloat(n[1]) : 90;
    if (/counter|anti/.test(lower)) a = -a;
    return a;
  };
  const axis = /around\s+x|about\s+x|x.?axis/.test(lower) ? 0
    : /around\s+y|about\s+y|y.?axis/.test(lower) ? 1 : 2;

  if (/\bflip\b.*\b(side|over sideways)\b/.test(lower)) {
    wrap = (s) => `rotate([0, 180, 0], ${s})`; what = "flipped it sideways";
  } else if (/\bflip\b|\bupside.?down\b/.test(lower)) {
    wrap = (s) => `rotate([180, 0, 0], ${s})`; what = "flipped it upside down";
  } else if (/\bturn (it )?(a)?round\b|\bturn (it )?180\b/.test(lower)) {
    wrap = (s) => `rotate([0, 0, 180], ${s})`; what = "turned it around";
  } else if (/\blay (it )?(down|flat|on its side)\b/.test(lower)) {
    wrap = (s) => `rotate([90, 0, 0], ${s})`; what = "laid it on its side";
  } else if (/\bstand (it )?up\b|\bupright\b/.test(lower)) {
    wrap = (s) => `rotate([-90, 0, 0], ${s})`; what = "stood it up";
  } else if (/\b(rotate|spin|twist)\b/.test(lower)) {
    const a = angle();
    const v = [0, 0, 0]; v[axis] = a;
    wrap = (s) => `rotate([${v.join(", ")}], ${s})`;
    what = `rotated it ${a}° about ${"xyz"[axis].toUpperCase()}`;
  } else if (/\bmirror\b|\breflect\b/.test(lower)) {
    const v = /y/.test(lower.replace(/mirror|reflect/g, "")) ? [0, 1, 0] : [1, 0, 0];
    wrap = (s) => `mirror([${v.join(", ")}], ${s})`; what = "mirrored it";
  } else if (/\b(move|shift|slide|nudge|raise|lower)\b/.test(lower)) {
    const n = lower.match(/(-?\d+\.?\d*)/);
    const d = n ? parseFloat(n[1]) : 10;
    const dir =
      /\bup\b|\braise\b/.test(lower) ? [0, 0, d]
      : /\bdown\b|\blower\b/.test(lower) ? [0, 0, -d]
      : /\bleft\b/.test(lower) ? [-d, 0, 0]
      : /\bright\b/.test(lower) ? [d, 0, 0]
      : /\bback\b|\baway\b/.test(lower) ? [0, d, 0]
      : /\bforward\b|\bcloser\b|\bfront\b/.test(lower) ? [0, -d, 0]
      : null;
    if (dir) {
      wrap = (s) => `translate([${dir.join(", ")}], ${s})`;
      what = `moved it ${d}mm`;
    }
  } else if (/\b(bigger|larger|scale (it )?up|grow)\b|\btwice as big\b|\bdouble (it|the size)\b/.test(lower)) {
    const pct = lower.match(/(\d+\.?\d*)\s*%/);
    const times = lower.match(/(?:x|by |times )(\d+\.?\d*)/);
    const f = /twice|double/.test(lower) ? 2 : pct ? 1 + (+pct[1] / 100) : times ? +times[1] : 1.25;
    wrap = (s) => `scale(${f}, ${s})`; what = `scaled it ×${f}`;
  } else if (/\b(smaller|shrink|scale (it )?down)\b|\bhalf (the )?size\b|\bhalve\b/.test(lower)) {
    const pct = lower.match(/(\d+\.?\d*)\s*%/);
    const f = /half|halve/.test(lower) ? 0.5 : pct ? Math.max(0.05, 1 - (+pct[1] / 100)) : 0.8;
    wrap = (s) => `scale(${f}, ${s})`; what = `scaled it ×${f}`;
  }

  if (!wrap || !what) return null;
  const code = wrapCurrent(currentCode, wrap);
  if (!code) return { reply: "There's nothing in the editor to transform yet — make something first." };
  return { reply: `Done — ${what}. (◀ undoes it.)`, code };
}

// ---- resizing through the middle, without an LLM -------------------------
// "decrease width by 30%", "make it 50mm wide", "20mm longer" are arithmetic,
// not authorship: given the model's measured size there is exactly one right
// answer. Doing it here means it works with NO API key, costs nothing, and
// cannot hallucinate a bounding box — which is the failure this operation is
// famous for. Anything ambiguous falls through to the AI as before.
// Comparatives have to be listed as well as the nouns: "taller" does not
// contain the word "tall" under a \b match, and "make it 30% taller" is a
// perfectly ordinary thing to say.
const AXIS_WORDS = {
  x: /\b(width|wide|wider|narrow|narrower|across|horizontally)\b/,
  y: /\b(depth|deep|deeper|length|long|longer|shorter|front to back)\b/,
  z: /\b(height|tall|taller|high|higher|thickness|thick|thicker|thinner)\b/,
};
// Which way, from the verb or the comparative.
const SHRINK = /\b(decrease|reduce|narrow|narrower|shorten|shorter|shrink|smaller|thinner|less|trim|cut|take)\b/;
const GROW = /\b(increase|widen|wider|lengthen|longer|grow|bigger|taller|higher|deeper|thicker|more|add|extend)\b/;

// dims arrives either as a plain [x, y, z] size or as a full box. Face work
// ("off the top", "extend the right side") needs to know WHERE the part is, not
// just how big it is, so normalise to both and let a size-only caller keep
// working for the middle-cut cases.
export function boxOf(dims) {
  if (!dims) return null;
  if (Array.isArray(dims)) {
    const size = dims.map(Number);
    if (!size.every((n) => n > 0)) return null;
    // assume the viewer's usual placement: centred on x/y, sitting on z = 0
    return { size, min: [-size[0] / 2, -size[1] / 2, 0], max: [size[0] / 2, size[1] / 2, size[2]], assumed: true };
  }
  const { min, max } = dims;
  if (!min || !max) return null;
  return { size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], min: [...min], max: [...max], assumed: false };
}

// Which face a phrase is talking about. `hi` is the +side of the axis.
const FACES = {
  top:    { axis: "z", hi: true,  re: /\b(top|upper|highest)\b/ },
  bottom: { axis: "z", hi: false, re: /\b(bottom|underside|base|lowest|底)\b/ },
  right:  { axis: "x", hi: true,  re: /\bright(?:\s*(?:side|hand|edge|end))?\b/ },
  left:   { axis: "x", hi: false, re: /\bleft(?:\s*(?:side|hand|edge|end))?\b/ },
  back:   { axis: "y", hi: true,  re: /\b(back|rear)(?:\s*(?:side|edge|face))?\b/ },
  front:  { axis: "y", hi: false, re: /\bfront(?:\s*(?:side|edge|face))?\b/ },
};
const TRIM = /\b(take|shave|trim|cut|remove|shear|slice|knock|chop)\b/;
const EXTEND = /\b(extend|lengthen|add|grow|raise|build\s+out|push)\b/;
const MM = /(\d+(?:\.\d+)?)\s*(?:mm)?\b/;

// "take 0.2mm off the top", "extend the right side by 7mm" — one-sided work on
// a named face, which is a different operation from cutting the middle out:
// trimming removes material from that face, extending pushes it outward.
export function parseFaceEdit(text, dims) {
  const box = boxOf(dims);
  if (!box) return null;
  const lower = text.toLowerCase();

  let face = null;
  for (const [name, f] of Object.entries(FACES)) if (f.re.test(lower)) { face = { name, ...f }; break; }
  if (!face) return null;

  const trimming = TRIM.test(lower);
  const extending = EXTEND.test(lower);
  if (trimming === extending) return null;             // neither, or both — ask the AI

  const m = MM.exec(lower);
  if (!m) return null;
  const amount = +m[1];
  if (!(amount > 0)) return null;

  const i = { x: 0, y: 1, z: 2 }[face.axis];
  const current = box.size[i];
  if (trimming && amount >= current) {
    return { error: `${amount}mm off the ${face.name} would take the whole part — it is only ${round2(current)}mm on ${face.axis.toUpperCase()}.` };
  }
  return {
    kind: trimming ? "trim" : "extend",
    face: face.name, axis: face.axis, hi: face.hi, amount,
    current: round2(current),
    target: round2(trimming ? current - amount : current + amount),
    box,
  };
}

// "double the width", "half the height", "make it twice as wide", "scale to 150%"
// Scaling is NOT the same as cutting the middle out and the difference matters:
// scale multiplies every feature — a 2mm wall becomes 4mm, a round hole becomes
// an oval. The user asked for it by name, so do it, but say so.
const SCALE_WORDS = [
  [/\bdoubl(?:e|ing)\b|\btwice as\b|\b2x\b|\bx2\b/, 2],
  [/\btripl(?:e|ing)\b|\bthree times\b|\b3x\b/, 3],
  [/\bhalf\b|\bhalve\b|\b0\.5x\b/, 0.5],
  [/\bquarter\b/, 0.25],
];
export function parseScale(text, dims) {
  const box = boxOf(dims);
  if (!box) return null;
  const lower = text.toLowerCase();
  // stems, not whole words — \bdoubl\b can never match "double". A size
  // pair ("8 x 6", "120 x 80 x 50") is sizes, never a factor: the x must not
  // be followed by another number.
  if (!/\b(?:scal\w*|doubl\w*|tripl\w*|halv\w*|half|quarter|twice|times|\d+\s*x(?!\s*\d)|x\s*\d+)\b/.test(lower)) return null;
  if (/\b\d+(?:\.\d+)?\s*(?:x|by)\s*\d/.test(lower) && !/\bscal\w*\b/.test(lower)) return null;

  let k = null;
  for (const [re, v] of SCALE_WORDS) if (re.test(lower)) { k = v; break; }
  if (k === null) {
    const pct = /\bto\s+(\d+(?:\.\d+)?)\s*%/.exec(lower) || /\bscale[^\d]{0,12}(\d+(?:\.\d+)?)\s*%/.exec(lower);
    if (pct) k = +pct[1] / 100;
    else {
      const f = /\bby\s+(\d+(?:\.\d+)?)\s*(?:x|times)\b(?!\s*\d)/.exec(lower) || /\b(\d+(?:\.\d+)?)\s*(?:x|times)\b(?!\s*\d)/.exec(lower)
        // "scale it by 2", "scale it 1.5": the word scale makes a bare number a factor
        || /\bscal\w*\s+(?:it\s+|everything\s+|the\s+\w+\s+)?(?:up\s+|down\s+)?(?:by\s+)?(\d+(?:\.\d+)?)\b(?!\s*(?:%|mm|cm|x\s*\d))/.exec(lower);
      if (f) k = +f[1];
    }
  }
  if (!(k > 0) || k === 1) return null;

  // an axis word narrows it to one direction; otherwise scale everything
  let axis = null;
  for (const [a, re] of Object.entries(AXIS_WORDS)) if (re.test(lower)) { axis = a; break; }
  const i = { x: 0, y: 1, z: 2 }[axis];
  return {
    k, axis,
    current: axis ? round2(box.size[i]) : box.size.map(round2).join(" × "),
    target: axis ? round2(box.size[i] * k) : box.size.map((s) => round2(s * k)).join(" × "),
  };
}

export function parseResize(text, dims) {
  const box = boxOf(dims);
  if (!box) return null;
  dims = box.size;
  const lower = text.toLowerCase();

  let axis = null;
  for (const [a, re] of Object.entries(AXIS_WORDS)) if (re.test(lower)) { axis = a; break; }
  if (!axis) return null;
  const current = dims[{ x: 0, y: 1, z: 2 }[axis]];
  if (!(current > 0)) return null;

  const shrinking = SHRINK.test(lower);
  const growing = GROW.test(lower);

  // "by N" is a CHANGE; "to N" is a TARGET. Getting these the wrong way round
  // turns "reduce the depth by 10mm" into "set the depth to 10mm", which looks
  // like it worked and destroys the part.
  const byPct = /\bby\s+(\d+(?:\.\d+)?)\s*%/.exec(lower) || /(\d+(?:\.\d+)?)\s*%/.exec(lower);
  const byMm = /\bby\s+(\d+(?:\.\d+)?)\s*(?:mm)?\b/.exec(lower);
  const toMm = /\b(?:to|=)\s*(\d+(?:\.\d+)?)\s*(?:mm)?\b/.exec(lower);
  // "50mm wide", "20mm longer" — the number sits next to the axis word
  const bareMm = /\b(\d+(?:\.\d+)?)\s*mm\b/.exec(lower);
  const isDelta = /\b(longer|shorter|wider|narrower|taller|thicker|thinner|more|less)\b/.test(lower);

  // A RELATIVE change is meaningless without a direction — "30%" or "by 10mm"
  // could go either way, so those fall through to the AI. An ABSOLUTE target
  // ("50mm wide") needs no direction at all: the arithmetic decides.
  let by, target, how;
  if (byPct) {
    if (shrinking === growing) return null;           // neither, or contradictory
    const f = +byPct[1] / 100;
    by = shrinking ? -(current * f) : current * f;
    target = current + by;
    how = `${byPct[1]}% ${shrinking ? "smaller" : "larger"}`;
  } else if (byMm) {
    if (shrinking === growing) return null;
    const d = +byMm[1];
    by = shrinking ? -d : d;
    target = current + by;
    how = `${by > 0 ? "+" : ""}${round2(by)}mm`;
  } else if (toMm) {
    target = +toMm[1];
    by = target - current;
    how = `${round2(target)}mm`;
  } else if (bareMm) {
    const d = +bareMm[1];
    if (isDelta) {
      if (shrinking === growing) return null;
      by = shrinking ? -d : d; target = current + by; how = `${by > 0 ? "+" : ""}${round2(by)}mm`;
    } else { target = d; by = target - current; how = `${round2(target)}mm`; }
  } else return null;

  if (!Number.isFinite(by) || Math.abs(by) < 0.01) return null;
  // 0.12mm of plastic is not a part. Refuse rather than produce a sliver.
  if (target < 0.5) {
    return { error: `that would leave ${round2(target)}mm on ${axis.toUpperCase()} — there'd be nothing left to print.` };
  }
  return { axis, by: round2(by), current: round2(current), target: round2(target), how, shrinking: by < 0 };
}
const round2 = (n) => Math.round(n * 100) / 100;

// Wrap whatever is in the editor. A `return expr;` model has its expression
// wrapped in place so variables and comments above it survive.
export function resizeCode(currentCode, r) {
  const opts = `{ axis: "${r.axis}", by: ${r.by}, at: 0 }`;
  // Negative `by` anchors the result on its low edge, so recentre it — the part
  // was centred before and should still be afterwards.
  const shift = r.by < 0
    ? { x: `[${round2(-r.by / 2)}, 0, 0]`, y: `[0, ${round2(-r.by / 2)}, 0]`, z: `[0, 0, ${round2(-r.by / 2)}]` }[r.axis]
    : null;
  const wrap = (inner) => shift
    ? `translate(${shift},\n  stretch(${opts},\n    ${inner.replace(/\n/g, "\n    ")}))`
    : `stretch(${opts},\n  ${inner.replace(/\n/g, "\n  ")})`;

  return wrapModel(currentCode, wrap);
}

// Wrap whatever the editor's final expression is, leaving the variables and
// comments above it alone.
function wrapModel(currentCode, wrap) {
  const src = currentCode.trim();
  const rets = topLevelReturns(src);
  if (!rets.length) return `return ${wrap(src.replace(/;$/, ""))};`;
  const last = rets[rets.length - 1];
  let out = `return ${wrap(src.slice(last + 6).trim().replace(/;\s*$/, ""))};`, end = last;
  // the early returns, back to front so the offsets before them hold
  for (let k = rets.length - 2; k >= 0; k--) {
    const at = rets[k], stop = Math.min(statementEnd(src, at + 6), end);
    const expr = src.slice(at + 6, stop).trim();
    out = (expr ? `return ${wrap(expr)};` : src.slice(at, Math.min(stop + 1, end))) + src.slice(Math.min(stop + 1, end), end) + out;
    end = at;
  }
  return src.slice(0, end) + out;
}

// The chat's round wrap taken back off every return it went round (an early
// return gets one too), or null when there is none to take off.
export function unwrapRound(currentCode) {
  const src = currentCode.trim();
  const WRAP = /^fillet\((?:\d+(?:\.\d+)?|\{ r: \d+(?:\.\d+)?, pieces: true \}),\s*/;
  let out = "", from = 0, hit = false;
  for (const at of topLevelReturns(src)) {
    const stop = statementEnd(src, at + 6);
    const expr = src.slice(at + 6, stop).trim();
    const m = WRAP.exec(expr);
    if (!m || !expr.endsWith(")")) continue;
    out += src.slice(from, at) + `return ${expr.slice(m[0].length, -1).trim()}`;
    from = stop;
    hit = true;
  }
  return hit ? `${out}${src.slice(from)}\n` : null;
}

// ---- one-sided face work --------------------------------------------------
// Trimming cuts a slab off a named face; extending pushes that face outward by
// splitting just inside it and filling with its own cross-section. Both are
// built from the measured box, so the cutter is always where the part actually
// is — the whole reason not to leave this to a model that has to guess.
export function faceEditCode(currentCode, r) {
  const { box, axis, hi, amount } = r;
  const i = { x: 0, y: 1, z: 2 }[axis];
  const PAD = 5;                     // overshoot so the cut is unambiguous
  const n = (v) => round2(v);

  if (r.kind === "trim") {
    // a box covering the whole part on the other two axes, `amount` deep on this one
    const pos = [box.min[0] - PAD, box.min[1] - PAD, box.min[2] - PAD];
    const size = [box.size[0] + PAD * 2, box.size[1] + PAD * 2, box.size[2] + PAD * 2];
    if (hi) { pos[i] = box.max[i] - amount; size[i] = amount + PAD; }
    else { pos[i] = box.min[i] - PAD; size[i] = amount + PAD; }
    const cutter = `translate([${pos.map(n).join(", ")}],\n      cube([${size.map(n).join(", ")}]))`;
    // taking material off the BOTTOM leaves the part floating; drop it back down
    const settle = (!hi && axis === "z") ? `[0, 0, ${n(-amount)}]` : null;
    return wrapModel(currentCode, (inner) => {
      const cut = `difference(${inner.replace(/\n/g, "\n    ")},\n    ${cutter})`;
      return settle ? `translate(${settle},\n  ${cut.replace(/\n/g, "\n  ")})` : cut;
    });
  }

  // extend: split a little way inside the face so the slice is real material,
  // then stretch outward. Everything beyond the plane moves with it.
  const inset = Math.min(2, Math.max(0.5, box.size[i] * 0.1));
  const at = n(hi ? box.max[i] - inset : box.min[i] + inset);
  // a positive `by` grows toward +axis; to push the LOW face out we grow and
  // then slide the whole part back so the far face stays where it was
  const by = amount;
  const shift = hi ? null
    : { x: `[${n(-amount)}, 0, 0]`, y: `[0, ${n(-amount)}, 0]`, z: `[0, 0, ${n(-amount)}]` }[axis];
  return wrapModel(currentCode, (inner) => {
    const s = `stretch({ axis: "${axis}", by: ${n(by)}, at: ${at} },\n    ${inner.replace(/\n/g, "\n    ")})`;
    return shift ? `translate(${shift},\n  ${s.replace(/\n/g, "\n  ")})` : s;
  });
}

// ---- scale ----------------------------------------------------------------
export function scaleCode(currentCode, r) {
  const f = r.axis
    ? { x: [r.k, 1, 1], y: [1, r.k, 1], z: [1, 1, r.k] }[r.axis]
    : [r.k, r.k, r.k];
  return wrapModel(currentCode, (inner) =>
    `scale([${f.join(", ")}],\n  ${inner.replace(/\n/g, "\n  ")})`);
}

// ---- plain-English operations on whatever is already built ------------------
// "Punch a hole in it", "round the edges", "drop it to the floor" — each has
// exactly one sensible reading once you know the part's box, so none of them
// needs a model, an API key, or a follow-up question. Anything genuinely
// ambiguous is left alone and goes to the AI instead.
//
// EPS is the overshoot every subtraction gets. A cutter whose face lands
// exactly on the solid's face is a coincident-face case: the kernel may or may
// not close it, and a slicer will happily produce a shell with a hole in it.
// Overshooting by a hair costs nothing and removes the whole class of bug.
export const EPS = 0.01;

// Holes are tested FIRST: "put a round hole through it" names a hole, and
// "round" there is the hole's shape, not a verb. The round regex also skips
// a "round" that is directly followed by a noun.
const OPS = {
  hole: /\b(punch|bore|drill|put|cut|make|add|another|more|extra)\b[^.]{0,20}\bholes?\b|\btake a bite\b/,
  floor: /\b(drop|sit|sink|put|move|place)\b[^.]{0,24}\b(floor|bed|ground|z\s*=?\s*0|plate)\b|\bon the (floor|bed|plate)\b/,
  centre: /\b(cent(?:er|re)) (it|them|this|the (?:part|model|shape))\b|\bcent(?:er|re) (?:it|on) (?:the )?origin\b|^\s*cent(?:er|re)\s*(?:it)?\s*$/,
  round: /\b(round(?:ed|er)?(?!\s+(?:hole|holes|slot|cutout|base|tray|box|dish|disc|disk|peg|rod|bar|tube|pipe|knob|button|loop|ring|coin|magnet|cup|pot|window|opening|notch))|smooth(?:er)?|soften)\b[^.]{0,20}\b(edge|edges|corner|corners|it|off)\b|\bfillet\b|^\s*smooth it\s*$|\brounder edges\b/,
  bevel: /\bbevel\b|\bchamfer\b|\bslant\b[^.]{0,16}\bedge/,
};
const COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, pair: 2 };
// "add two more holes", "3 screw holes": how many, or 1 when it does not say
export function holeCount(lower) {
  const m = /\b(\d+|two|three|four|five|six|couple of|pair of)\s+(?:more\s+|extra\s+|new\s+|other\s+|further\s+)?(?:screw\s+|drill\s+|mounting\s+|bolt\s+)?holes\b/.exec(lower);
  if (!m) return 1;
  const n = COUNT_WORDS[m[1].split(" ")[0]] || +m[1];
  return Math.max(1, Math.min(8, n || 1));
}

export function parseOp(text, dims) {
  const box = boxOf(dims);
  if (!box) return null;
  const lower = text.toLowerCase();
  // a face word means the one-sided face editor owns this, not us
  if (/\b(top|bottom|left|right|front|back)\b/.test(lower) && !OPS.hole.test(lower)) return null;

  let kind = null;
  for (const [k, re] of Object.entries(OPS)) if (re.test(lower)) { kind = k; break; }
  if (!kind) return null;

  const [w, d, h] = box.size;
  const num = (re, fallback) => {
    const m = re.exec(lower);
    return m ? +m[1] : fallback;
  };

  if (kind === "floor") {
    if (Math.abs(box.min[2]) < 0.005) return { kind, already: true };
    return { kind, drop: round2(box.min[2]) };
  }
  if (kind === "centre") {
    const dx = round2(-(box.min[0] + box.max[0]) / 2), dy = round2(-(box.min[1] + box.max[1]) / 2);
    if (!dx && !dy) return { kind, already: true };
    return { kind, dx, dy };
  }
  if (kind === "round" || kind === "bevel") {
    // Proportional to the part, capped so it can never eat a thin wall: a 2mm
    // radius on a 3mm plate is not a rounded edge, it is a missing plate.
    const auto = round2(Math.min(Math.min(w, d, h) * 0.15, 3));
    const r = num(/(\d+(?:\.\d+)?)\s*mm\b/, null) ?? num(/\b(?:r|radius|by)\s*(\d+(?:\.\d+)?)/, null) ?? auto;
    if (!(r > 0)) return null;
    if (r >= Math.min(w, d, h) / 2) {
      return { error: `${r}mm is too big — the part is only ${round2(Math.min(w, d, h))}mm on its smallest axis, so that would consume it.` };
    }
    return { kind, r: round2(r) };
  }
  if (kind === "hole") {
    // Down the middle of the footprint, through the whole height, unless the
    // user gave a size. A third of the smaller footprint edge looks right and
    // always leaves a wall.
    // Several unsized holes are screw holes (5 mm), not a third of the part
    // each: "add 3 holes" to a 30 mm plate must fit.
    const askedCount = holeCount(lower);
    const dia = num(/(\d+(?:\.\d+)?)\s*mm\b/, null)
      ?? num(/\b(?:d|dia|diameter)\s*(?:of\s*)?(\d+(?:\.\d+)?)/, null)
      ?? round2(askedCount > 1 ? Math.min(5, Math.min(w, d) / 3) : Math.min(w, d) / 3);
    const byRadius = /\b(?:r|radius)\s*(?:of\s*)?(\d+(?:\.\d+)?)/.test(lower);
    const D = byRadius ? num(/\b(?:r|radius)\s*(?:of\s*)?(\d+(?:\.\d+)?)/, dia) * 2 : dia;
    if (!(D > 0)) return null;
    if (D >= Math.min(w, d)) {
      return { error: `a ${round2(D)}mm hole doesn't fit — the part is only ${round2(Math.min(w, d))}mm across at its narrowest.` };
    }
    // Several holes go in a row along the longer footprint edge, evenly
    // spaced, each at least a diameter in from the ends.
    const count = holeCount(lower);
    const axis = w >= d ? 0 : 1;
    const len = axis ? d : w;
    if (count > 1 && count * D * 1.5 > len) {
      return { error: `${count} holes of ${round2(D)}mm don't fit in a row — the part is only ${round2(len)}mm along that edge.` };
    }
    const margin = Math.max(D, len * 0.12);
    const other = round2((box.min[1 - axis] + box.max[1 - axis]) / 2);
    const spots = count === 1
      ? [[round2((box.min[0] + box.max[0]) / 2), round2((box.min[1] + box.max[1]) / 2)]]
      : Array.from({ length: count }, (_, i) => {
        const along = round2(box.min[axis] + margin + (i * (len - 2 * margin)) / (count - 1));
        return axis ? [other, along] : [along, other];
      });
    return {
      kind, dia: round2(D), count, axisName: axis ? "Y" : "X", spots,
      cx: spots[0][0], cy: spots[0][1],
      z0: round2(box.min[2] - EPS),
      height: round2(h + EPS * 2),
      box,
    };
  }
  return null;
}

export function opCode(currentCode, op) {
  const wrap = (fn) => wrapModel(currentCode, fn);
  switch (op.kind) {
    case "floor":
      return wrap((inner) => `translate([0, 0, ${round2(-op.drop)}],\n  ${inner.replace(/\n/g, "\n  ")})`);
    case "centre":
      return wrap((inner) => `translate([${op.dx}, ${op.dy}, 0],\n  ${inner.replace(/\n/g, "\n  ")})`);
    case "round":
      // pieces: true rounds each box the part is made of, then cuts the holes,
      // so a hole rim or countersink is never an edge the fillet has to take
      return wrap((inner) => `fillet({ r: ${op.r}, pieces: true },\n  ${inner.replace(/\n/g, "\n  ")})`);
    case "bevel":
      return wrap((inner) => `chamfer({ r: ${op.r}, pieces: true },\n  ${inner.replace(/\n/g, "\n  ")})`);
    case "hole": {
      // The cutter starts EPS below the base and runs EPS past the top, so
      // neither end is flush with a face it has to breach. Several holes are
      // several cutters in the same difference().
      const spots = op.spots || [[op.cx, op.cy]];
      const cutters = spots.map(([x, y]) =>
        `  translate([${x}, ${y}, ${op.z0}],\n    cylinder({ r: ${round2(op.dia / 2)}, h: ${op.height}, $fn: 64 }))`).join(",\n");
      return wrap((inner) =>
        `difference(\n  ${inner.replace(/\n/g, "\n  ")},\n`
        + `  // cutter${spots.length > 1 ? "s overshoot" : " overshoots"} both faces by ${EPS}mm so no face is coincident\n`
        + `${cutters})`);
    }
    default:
      return currentCode;
  }
}

// An all-over round or bevel must leave the part its own size. The exact
// kernel either rounds it in place or refuses, and where it refuses the JS
// fallback grows the part by about the radius on every face (a 10 mm light
// clip came out 27 mm thick at r 3), or now and then collapses it. The viewer
// builds the wrapped code, measures, and asks this whether to keep it.
// before/after are { min, max } boxes; null = keep it.
export const SIZE_GROW_TOL = 0.3;
export function sizeGuardVerdict(before, after, guard) {
  if (!before || !after || !guard) return null;
  const r = +guard.r || 0;
  const axes = ["X", "Y", "Z"];
  const size = (b, i) => b.max[i] - b.min[i];
  let worst = null;
  for (let i = 0; i < 3; i++) {
    const d = size(after, i) - size(before, i);
    if (d > SIZE_GROW_TOL || d < -2 * r) {
      if (!worst || Math.abs(d) > Math.abs(worst.d)) worst = { axis: axes[i], d, from: size(before, i), to: size(after, i) };
    }
  }
  if (!worst) return null;
  const did = guard.op === "bevel" ? "chamfer" : "round";
  const how = `${worst.axis} would go from ${round2(worst.from)} to ${round2(worst.to)} mm`;
  return {
    axis: worst.axis, grew: worst.d > 0,
    reply: `This design doesn't take an all-over ${did}: the edges it is built from can't all be ${did === "round" ? "rounded" : "chamfered"} in place, `
      + `so it would change the part's size (${how}). I put it back as it was. `
      + (did === "round" ? "Try “chamfer the edges”, or ask an AI to round the specific edges you mean."
        : "Ask an AI to bevel the specific edges you mean."),
    chips: did === "round" ? ["chamfer the edges"] : [],
  };
}

// A round/bevel that built but changed nothing: the exact kernel refused the
// edges and the fallback kernel handed the part back untouched ("returning
// clone"). Same volume to within tessellation noise = nothing happened, and
// the reply must not say otherwise.
export function noopVerdict(beforeVol, afterVol, guard) {
  if (!(beforeVol > 0) || !(afterVol > 0) || !guard) return null;
  if (Math.abs(afterVol - beforeVol) > Math.max(0.5, beforeVol * 1e-5)) return null;
  const round = guard.op !== "bevel";
  return {
    reply: `I couldn't ${round ? "round" : "chamfer"} this design's edges: none of them would take it, `
      + "so the part came back exactly as it was and I've left it that way. "
      + (round ? "“Chamfer the edges” may take where a round won't, or ask an AI to round the specific edges you mean."
        : "Ask an AI to bevel the specific edges you mean."),
    chips: round ? ["chamfer the edges"] : [],
  };
}

// Main entry. state persists between calls: { pending, flow }
// dims is the built model's measured [x, y, z] size in mm, when there is one.
// ---------------------------------------------------------------- catalog
//
// "I want a phone holder", "make me a hook for yoga roll": real objects the
// catalog has a tested, printable, parametric design for (src/catalog). A
// fresh request is matched there BEFORE the edit commands, because "a phone
// stand 90mm wide" is a new thing, not a resize of whatever is on screen. But
// with a model open, a request has to sound like a new thing ("I want…",
// "make me…", "a…") — "make the shelf deeper" is about the open model.
const NEW_THING = /\b(want|need|like|make me|make a|make an|make us|build|print|design|create|new|another|give me|how about|got a|got an|do a|do an|something|anything|some thing|a thing|a way to)\b|^(a|an|some)\s/;
const EDIT_THIS = /^(make|turn|set|change)\s+(it|this|that|the)\b|\b(it|this|that)\b.*\b(wider|narrower|taller|shorter|deeper|longer|bigger|smaller|thicker|thinner)\b/;
// A message about the model already on screen ("add a hole for the
// charger", "make it taller", "cut a heart in the back"), as opposed to a
// new thing ("make me a pen holder"). The chat sends these to an AI as an
// EDIT: keep the model, change only what was asked, think briefly.
export function isQuickEdit(text) {
  const lower = String(text || "").toLowerCase().trim();
  if (!lower || lower.split(/\s+/).length > 40) return false;
  if (EDIT_THIS.test(lower) || ADD_TO_THIS.test(lower)) return true;
  // "now a cable clip for 3 cables" names another thing: a new design
  return !NEW_THING.test(lower) && !matchCatalog(text);
}
// "add a hole for the charger", "cut a heart into the back", "put my name on
// the front": with a model open these change IT. Read as a request for a new
// thing, they asked "which did you mean?" with a list of unrelated designs,
// and the AI behind that rewrote the whole part from scratch.
const ADD_TO_THIS = /^(?:please\s+|can you\s+|could you\s+)?(?:add|put|cut|carve|engrave|emboss|deboss|stamp|drill|punch|attach|include|insert|stick|place|mount|give it|make room|remove|take off|take out|hollow)\b|\b(?:on|in|into|onto|to|through|from|off)\s+(?:it|this|that|the\s+(?:back|front|top|bottom|side|sides|base|middle|centre|center|end|edge|lid|wall|walls))\b/;

// Where to go when the built-in helper runs out. Every "can't do that" ends
// with the same three ways forward (the sliders, the code, an AI) and a human
// to ask, rendered as buttons by the viewer (actions on the reply).
export const CONTACT = { email: "RandoTechNerd@gmail.com", discord: "https://discord.gg/8fjQHDX8PQ" };
// `icon` names a line icon in viewer/icons.js: the row is drawn in one
// weight and one colour, never as a string of emoji.
export const HELP_ACTIONS = [
  { label: "Sliders", act: "params", icon: "sliders" },
  { label: "Editor", act: "editor", icon: "code" },
  { label: "Tour", act: "tour", icon: "tour" },
  { label: "Connect an AI", act: "ai", icon: "spark" },
  { label: "Email", act: "email", icon: "mail" },
  { label: "Discord", act: "discord", icon: "chat" },
];
const WAYS_ON = "Drag the sliders (≡ Params), change the code in the Editor, or connect an AI in ⚙ (free in your browser, or your own Gemini, Claude or OpenRouter key) and ask it in plain words. "
  + `Stuck? Email ${CONTACT.email} or ask on Discord.`;

const unitOf = (p) => p.unit === "deg" ? "°" : p.unit === "mm" ? " mm" : "";

// The colour words people actually use, as filament-ish swatches.
export const COLOURS = {
  red: "#e53935", orange: "#fb8c00", yellow: "#fdd835", lime: "#9ccc65", green: "#43a047",
  mint: "#98e2c6", teal: "#00897b", turquoise: "#26c6da", cyan: "#00bcd4", "sky blue": "#4fc3f7",
  blue: "#1e88e5", navy: "#1a237e", purple: "#8e24aa", violet: "#7e57c2", lavender: "#b39ddb",
  pink: "#ec407a", magenta: "#d81b60", coral: "#ff7f6e", maroon: "#7b1f2b", brown: "#6d4c41",
  tan: "#c8a27a", beige: "#d7c4a3", olive: "#7a7d2b", gold: "#d4af37", silver: "#c0c0c0",
  black: "#212121", white: "#f5f5f5", grey: "#9e9e9e", gray: "#9e9e9e", "dark grey": "#4a4a4a", "dark gray": "#4a4a4a",
};
// "make it purple", "paint it gold", "in black", "#ff8800", or just "purple"
export function parseColour(lower, { bare = true } = {}) {
  const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/.exec(lower);
  const names = Object.keys(COLOURS).sort((a, b) => b.length - a.length);
  const name = names.find((n) => new RegExp(`\\b${n}\\b`).test(lower));
  if (!hex && !name) return null;
  const verb = /\b(make|paint|colou?r|turn|change|in|switch|set)\b/.test(lower);
  const short = lower.trim().split(/\s+/).length <= 3;
  if (!verb && !(bare && short)) return null;
  return { hex: hex ? `#${hex[1]}` : COLOURS[name], name: name || `#${hex[1]}` };
}
// Recolour by wrapping the model; a colour already wrapped on is replaced,
// not nested, so "make it red" then "no, blue" stays one colorize().
export function colourCode(currentCode, hex) {
  const src = currentCode.trim();
  const at = topLevelReturn(src);
  const body = at >= 0 ? src.slice(at + 6).trim().replace(/;\s*$/, "") : src.replace(/;\s*$/, "");
  const prior = /^colorize\("#[0-9a-fA-F]{3,6}",\s*([\s\S]*)\)$/.exec(body);
  const inner = prior ? prior[1].trim() : body;
  const wrapped = `colorize("${hex}", ${inner})`;
  return at >= 0 ? `${src.slice(0, at)}return ${wrapped};` : `return ${wrapped};`;
}
const num1 = (v) => +(+v).toFixed(1);

function catalogReply(res, { refined = false } = {}) {
  const what = res.title.toLowerCase();
  const fmt = (u) => {
    const p = res.family.params[u.param];
    return `${p.label} ${num1(u.value)}${unitOf(p)}`;
  };
  let reply = refined ? `Updated the ${what}` : `Here's a ${what}`;
  if (res.spec && (!refined || res.changedSpec)) reply += `, sized for ${res.sizedFor?.[0] || res.spec.note || res.spec.label}`;
  if (refined && res.changes?.length) {
    // say what actually moved: "stand width 70 → 84 mm"
    const said = res.changes.slice(0, 3).map(({ k, from, to }) => {
      const p = res.family.params[k];
      if (typeof to === "string") return `${p.label}: ${to}`;
      return `${p.label} ${num1(from)} → ${num1(to)}${unitOf(p)}`;
    });
    if (res.changes.length > 3) said.push(`and ${res.changes.length - 3} more`);
    reply += `: ${said.join(", ")}`;
  } else if (res.used?.length) reply += ` (${res.used.map(fmt).join(", ")})`;
  reply += ".";
  for (const c of res.clamped || []) {
    const p = res.family.params[c.param];
    reply += ` ${p.label} stops at ${c.used}${unitOf(p)}, so I used that.`;
  }
  if (!refined && res.family.print) reply += ` Prints ${res.family.print.replace(/\.$/, "")}.`;
  if (res.question) reply += ` ${res.question.text}`;
  else if (refined) reply += " (◀ undoes it.)";
  else reply += " Every size is a slider (≡ Params), or tap a suggestion below.";
  if (!refined && res.alternatives?.length) reply += ` (If you meant a ${res.alternatives[0].toLowerCase()}, say so.)`;
  return reply;
}

// ---- hearing it right ------------------------------------------------------
//
// Two things people type that the matcher, read literally, cannot place:
// a typo ("fone stand") and a roundabout phrasing ("something to hold my
// phone"). Both are repaired here BEFORE matching, and a repair is only ever
// used when the repaired sentence actually lands on a family: a guess that
// matches nothing is thrown away, so this can never turn a request the
// catalog does not know into one it does.
//
// Words that are ordinary English, or the size words the matcher ties
// numbers with, are never touched: "wide" must not become "wire".
const COMMON = new Set(("a an the my our your this that these those it its i me we you they them him her " +
  "want wants need needs like would could should can make makes made build builds give get got have has had " +
  "with without for from into onto about over under near next between around through along across " +
  "and or but not no yes please thanks thank some any more less most least very bit little slightly quite " +
  "big bigger small smaller large larger wide wider narrow narrower tall taller short shorter long longer " +
  "deep deeper shallow thick thicker thin thinner high higher low lower huge tiny " +
  "side sides top bottom left right front back middle centre center edge edges corner corners " +
  "round rounded square flat sharp smooth hole holes screw screws " +
  "inch inches mm cm degree degrees angle size sized sizes same other another new one two three four five six " +
  "print printed printing printer design designed model thing things something way use used " +
  "hold holds holding hang hangs hanging stand stands keep keeps store stores carry carries fit fits " +
  "also just only really maybe perhaps again still now then there here what which where when how why " +
  "than too much many lid open closed").split(/\s+/));

let VOCAB = null;
// the catalog's own words, as stems, plus a loose "sounds like" index
function vocabulary() {
  if (VOCAB) return VOCAB;
  const words = new Set(), bySound = new Map();
  const add = (phrase) => { for (const w of keyTokens(phrase)) if (!/^\d/.test(w)) words.add(w); };
  for (const f of FAMILIES) {
    for (const n of [...f.names, ...(f.nouns || []), ...(f.keywords || [])]) add(n);
    for (const t of f.things || []) for (const n of t.names) add(n);
  }
  for (const s of SPECS) for (const n of s.names) add(n);
  for (const w of words) { const k = soundOf(w); if (!bySound.has(k)) bySound.set(k, []); bySound.get(k).push(w); }
  // shortest first: "shelf" before "shelves", the plain word before a variant
  for (const list of bySound.values()) list.sort((a, b) => a.length - b.length || a.localeCompare(b));
  VOCAB = { words, bySound };
  return VOCAB;
}
// Every catalog word that sounds like this one, other than itself. "shelve"
// is a real stem (a family's "shelves" keyword) and still means "shelf".
export function soundAlikes(word) {
  const w = stem(String(word).toLowerCase());
  return (vocabulary().bySound.get(soundOf(w)) || []).filter((v) => v !== w);
}
// The sentence with one word swapped for each of its sound-alikes, best
// guesses first. Used when the sentence as typed lands nowhere.
export function heardAs(text) {
  const lower = String(text).toLowerCase();
  const out = [];
  for (const m of lower.matchAll(/\b[a-z]{3,}\b/g)) {
    const w = m[0];
    if (COMMON.has(w)) continue;
    // a three-letter word is only ever re-heard when it is not a word the
    // catalog knows ("hok", never "cup")
    if (w.length === 3 && vocabulary().words.has(stem(w))) continue;
    for (const alt of soundAlikes(w)) {
      out.push({ text: lower.slice(0, m.index) + alt + lower.slice(m.index + w.length), fixes: [[w, alt]] });
    }
  }
  return out;
}
// "fone" and "phone" sound alike; so do "shelve" and "shelf"
export function soundOf(w) {
  return String(w).toLowerCase()
    .replace(/ph/g, "f").replace(/ck/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/qu/g, "kw")
    .replace(/z/g, "s").replace(/y/g, "i").replace(/ve\b/, "f").replace(/(.)\1+/g, "$1").replace(/[aeiou]+/g, "a");
}
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) m[i][j] = Math.min(m[i][j], m[i - 2][j - 2] + 1);
  }
  return m[a.length][b.length];
}
// The closest catalog word to a misspelt one, or null when nothing is close.
export function nearestWord(word) {
  const w = String(word).toLowerCase();
  if (w.length < 4 || /\d/.test(w) || COMMON.has(w)) return null;
  const V = vocabulary();
  const s = stem(w);
  if (V.words.has(s)) return null;                 // spelt right already
  const bySound = V.bySound.get(soundOf(s))?.[0];
  if (bySound) return bySound;
  const limit = w.length >= 7 ? 2 : 1;
  let best = null, bestD = limit + 1;
  for (const v of V.words) {
    if (v.length < 3) continue;
    const d = editDistance(s, v);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

// Roundabout ways of naming a thing, read as the thing. "something to hold
// my phone" is a phone holder; "a thing to hang my keys on" is a key hook.
const PARAPHRASES = [
  [/\b(?:something|some thing|a thing|anything|a way|a gadget|a gizmo|a part)\s+(?:to|that will|that can|which can|that|which)\s+(?:hold|holds|carry|carries|store|stores|keep|keeps|organi[sz]e|organi[sz]es|prop|props)\s+(?:up\s+)?(?:my|the|a|an|our|some|all my)?\s*([a-z0-9 ]{2,30}?)(?:\s+(?:on|at|by|near|next to|in|up|upright|together|tidy|safe)\b.*)?$/, "$1 holder"],
  [/\b(?:something|some thing|a thing|anything|a way)\s+(?:to|that)\s+(?:hang|hangs)\s+(?:up\s+)?(?:my|the|a|an|our)?\s*([a-z0-9 ]{2,30}?)(?:\s+(?:on|up|from|off|by)\b.*)?$/, "$1 hook"],
  [/\b(?:something|some thing|a thing|anything)\s+(?:to|that)\s+(?:stand|stands|lean|leans|sit|sits|rest|rests)\s+(?:up\s+)?(?:my|the|a|an)?\s*([a-z0-9 ]{2,30}?)(?:\s+(?:on|up|at|against)\b.*)?$/, "$1 stand"],
  [/\b(?:to|that will|that can)\s+(?:hold|carry|store|keep)\s+(?:my|the|a|an)?\s*([a-z0-9 ]{2,30}?)(?:\s+(?:on|at|in|together)\b.*)?$/, "$1 holder"],
];

// The request as the catalog would hear it, or null when nothing changes.
// `fixes` lists what was read differently, so the reply can say so.
export function understand(text) {
  let t = String(text).toLowerCase().trim();
  const fixes = [];
  for (const [re, to] of PARAPHRASES) {
    if (!re.test(t)) continue;
    const next = t.replace(re, to).replace(/\s+/g, " ").trim();
    if (next !== t) { fixes.push([t, next]); t = next; }
    break;
  }
  const fixed = t.replace(/\b[a-z]{4,}\b/g, (w) => {
    const near = nearestWord(w);
    if (!near || near === w) return w;
    fixes.push([w, near]);
    return near;
  });
  if (!fixes.length) return null;
  return { text: fixed, fixes };
}

// The catalog match, trying the sentence as typed and then as heard.
export function matchCatalog(text) {
  const direct = matchRequest(text);
  if (direct) return direct;
  // ONE repair at most. Two guesses compounding ("tour bus" heard as "tier
  // bass") can land on a thing nobody asked for, and sound confident doing it.
  const heard = understand(text);
  if (heard && heard.fixes.length === 1) {
    const m = matchRequest(heard.text);
    if (m) { m.heard = heard; return m; }
  }
  // a word that is spelt like one catalog word and sounds like another
  for (const alt of heardAs(text)) {
    const m = matchRequest(alt.text);
    if (m) { m.heard = alt; return m; }
  }
  return null;
}

// "hook", "a stand", "something for my desk": too vague to build, but not
// too vague to ASK about. Every family whose noun matched is a candidate;
// up to four become one-tap chips, so the follow-up is a tap rather than a
// guess. Shape words ("a box") stay with the rule engine, and the nouns the
// older guided flows own keep their flows.
const FLOW_NOUNS = /\b(bracket|frame|holder|cup|pen ?pot|bin|caddy)\b/;
export function catalogSuggest(text) {
  const lower = String(text).toLowerCase();
  if (findShapes(lower).length || FLOW_NOUNS.test(lower)) return null;
  // the noun may be misspelt ("a shelve"): rank the sentence as heard, and
  // failing that with each sound-alike swapped in, keeping the best reading.
  // (Called only when matchRequest found nothing, so a family over the
  // threshold here is one that tied with another and was not chosen.)
  const nouns = (s) => rankFamilies(s).filter((r) => r.score >= 4);
  let ranked = nouns(text);
  if (!ranked.length) {
    const heard = understand(text);
    if (heard) ranked = nouns(heard.text);
    if (!ranked.length) {
      for (const alt of heardAs(heard ? heard.text : text)) {
        const r = nouns(alt.text);
        if (r.length > ranked.length) ranked = r;
      }
    }
  }
  const seen = new Set(), picks = [];
  for (const r of ranked) {
    if (seen.has(r.family.id)) continue;
    seen.add(r.family.id);
    picks.push(r.family);
    if (picks.length === 4) break;
  }
  if (picks.length < 2) return null;
  const article = (n) => (/^[aeiou]/.test(n) ? "an" : "a");
  return {
    reply: `I know a few things like that. Which did you mean? Tap one, or say what it is for (“a hook for my yoga mat”) and I'll size it to that.`,
    chips: [...picks.map((f) => `${article(f.names[0])} ${f.names[0]}`), "what can you make"],
    fromCatalog: true, asked: true,
  };
}

// One-tap follow-ups under a catalog reply: the family's own tips, then the
// edits every catalog model understands. A tip is only offered when it would
// actually DO something on this code (dry-run through the editor): a chip
// that answers "I couldn't do that" teaches the wrong lesson.
function catalogChips(f, code = null) {
  const works = (tip) => {
    if (!code) return true;
    try {
      const e = editCatalog(f, code, tip);
      return !!(e && (e.code || /generic|ask-spec/.test(e.kind || "")));
    } catch { return false; }
  };
  const tips = (f.tips || []).filter(works).slice(0, 3);
  // "bigger" means nothing on a design whose every size is a fit or a count
  return [...tips, ...["bigger", "round the edges"].filter(works)];
}
const CATALOG_ACTIONS = [{ label: "Download STL", act: "stl", icon: "download" }, { label: "Sliders", act: "params", icon: "sliders" }];

// "This phone stand can change: …" when a follow-up is beyond its dials.
export function catalogCantDo(f, text, code = null) {
  const caps = capabilities(f);
  return {
    reply: `I couldn't do “${text}” with the built-in helper. This ${f.title.toLowerCase()} can change: ${caps.join(", ")}. `
      + `Say one with a number (“${(f.tips || ["90 mm wide"])[0]}”), “bigger” / “smaller”, or “round the edges”. ${WAYS_ON}`,
    chips: catalogChips(f, code),
    actions: HELP_ACTIONS,
    fromCatalog: true,
  };
}

// A one-sided cut or stretch ("take 10 mm off the bottom", "remove the top
// portion", "extend the back by 20") is the face editor's, in respond(): a
// number in it must never land on a dial.
const FACE = "(?:top|bottom|left|right|front|back)";
const FACE_CUT = new RegExp(`\\b(?:take|shave|trim|cut|remove|shear|slice|knock|chop|lop|shorten|delete|lose|extend|lengthen|grow|raise|push)\\b[^.]{0,20}\\b(?:off|from|out of|onto|to|at|on)?\\s*(?:the|its)?\\s*${FACE}\\b|\\b${FACE}\\s+(?:portion|part|section|bit|edge|face|side|half|third|quarter)\\b|\\b${FACE}\\s+(?:off|away)\\b`);
// a short acknowledgement, and a short "no", after the catalog has answered
const ACK = /^(ok|okay|yes|yep|yeah|sure|fine|good|great|cool|nice|perfect|thanks|thank you|thx|cheers|looks good|that'?s (?:fine|good|great|it|perfect)|love it|done)\b[.!]*$/;
const NAY = /^(no|nope|not that|not quite|not really|wrong|no thanks|hmm|meh)\b[.!]*$/;
const WANTS_FILE = /\b(download|export|save (?:it|the file|the stl)|get the (?:file|stl)|print it|send (?:it )?to (?:my |the )?(?:printer|slicer)|the stl|an stl)\b/;
const SMOOTH_ALONE = /^\s*(?:make it )?smooth(?:er)?(?: it)?(?: out| please)?\s*[.!]*$/;
const article = (n) => (/^[aeiou]/i.test(n) ? "an" : "a");

// Questions about the APP, not the model: the tour, help, how to download,
// where things are. Answered before anything tries to read them as shapes.
const APP_INTENTS = [
  // the tour, asked for as the tour ("a tour bus holder" is a holder)
  [/^(?:please\s+)?(?:i(?:'d| would)? (?:like|want|need) (?:to )?(?:take |see |do )?)?(?:take |start |show |give me |run |do |open |play )?(?:the |a |me the )?(?:guided )?(?:tour|tutorial|walk ?through)\b(?:\s*(?:please|now))?[.!]*$|^(?:show me around|how does this work|how do i use this|where is everything|getting started|i'?m lost|i am lost)\b/,
    () => ({ reply: "Starting the tour: two minutes, every control.", run: ["tour"], actions: HELP_ACTIONS })],
  [/\b(bug|broken|not working|doesn'?t work|crash|error|went wrong|report)\b/, () => ({
    reply: `Sorry about that. Press ◀ to step back, or “undo”. If it keeps happening, say what you typed and what you saw: email ${CONTACT.email} or ask on Discord, and a screenshot helps.`,
    actions: HELP_ACTIONS, asked: true })],
  [/\b(sliders?|params|parameters|where (are|is) the (sliders|numbers))\b/, () => ({ reply: "The sliders are under Params: every number in the code is one. Drag, and the model rebuilds.", run: ["params"], actions: CATALOG_ACTIONS })],
];
function appIntent(lower) {
  // a request that also names a thing ("a tour bus holder") is not about the app
  if (matchRequest(lower) || findShapes(lower).length) return null;
  for (const [re, fn] of APP_INTENTS) if (re.test(lower) && lower.split(/\s+/).length <= 12) return fn();
  return null;
}

// "what can you make": one line and a chip per category, not a wall of 212
// names; "what can you make for the kitchen" lists that category.
function catalogOverview(lower) {
  const s = catalogStats();
  const cats = Object.entries(CATEGORIES);
  const asked = cats.find(([id, label]) => new RegExp(`\\b${id}\\b`).test(lower) || lower.includes(label.toLowerCase().split(" ")[0]));
  if (asked) {
    const [id, label] = asked;
    const names = FAMILIES.filter((f) => f.category === id).map((f) => f.names[0]);
    return {
      reply: `${label}: ${names.join(", ")}. Ask for one by name, or say what it is for (“a hook for my yoga mat”) and any sizes.`,
      chips: [...names.slice(0, 6).map((n) => `${article(n)} ${n}`), "what can you make"], asked: true,
    };
  }
  return {
    reply: `I know ${s.families} tested designs covering ${s.things} things, in ${cats.length} groups. Tap a group to see what is in it, or just ask for a thing (“a phone stand”, “a hook for my yoga mat”, “a cable clip for 3 cables”) with any sizes.`,
    chips: cats.map(([id, label]) => `what can you make for ${label.split(" ")[0].toLowerCase()}`),
    asked: true,
  };
}

function catalogTurn(t, lower, state, currentCode, dims) {
  // a guided flow (bracket / frame / holder) hears its answer before the
  // catalog gets a look-in, unless the message plainly asks for a new thing
  if (state.flow && !NEW_THING.test(lower)) return null;
  // a bracket or a picture frame is the rule engine's own guided flow, even
  // when the sentence goes on to name a catalog thing ("a bracket for a shelf")
  if (/^(?:please\s+)?(?:i (?:want|need)|make me|make|build me|build|design me|give me)?\s*(?:an?\s+|the\s+)?(?:l[- ]?bracket|bracket|picture frame|photo frame)\b/.test(lower)) return null;
  if (/^(what can you (make|build|do)|what do you know|show me (the )?catalog|catalog|list)\b/.test(lower)) return catalogOverview(lower);
  const app = appIntent(lower);
  if (app) return app;
  const open = catalogOf(currentCode);
  let wantsNew = !currentCode.trim() || NEW_THING.test(lower);
  let fresh = wantsNew ? matchCatalog(t) : null;
  // the exact name of a DIFFERENT design, with one open ("phone tripod
  // mount" after a wrong guess): that is the new thing, "I want" or not
  if (!fresh && open && !wantsNew) {
    const byName = matchRequest(t);
    if (byName?.named && byName.familyId !== open.id && byName.score >= 12) { fresh = byName; wantsNew = true; }
  }
  // A new thing of a DIFFERENT kind wins over editing the open one: "I want a
  // phone stand 90 mm wide" with a shelf open is a phone stand, not a shelf
  // 90 mm long.
  if (open && !(fresh && fresh.familyId !== open.id)) {
    const what = open.title.toLowerCase();
    // a one-sided cut is the face editor's (respond), not a dial's
    if (FACE_CUT.test(lower) && !/\bhole/.test(lower)) return null;
    // the small talk round a model: "thanks", "no", "how do I get the file"
    if (lower.split(/\s+/).length <= 4 && ACK.test(lower)) {
      return { reply: `Kept the ${what} as it is. Change anything by name (“wider”, “for a Pixel 9”, “round the edges”), or drag a slider.`,
        chips: catalogChips(open, currentCode), actions: CATALOG_ACTIONS, fromCatalog: true, asked: true };
    }
    if (lower.split(/\s+/).length <= 3 && NAY.test(lower)) {
      return { reply: `What would you change about the ${what}? Say it with a number or a word (“90 mm wide”, “flatter”, “no cable hole”), tap one, or ◀ to undo the last change.`,
        chips: catalogChips(open, currentCode), actions: HELP_ACTIONS, fromCatalog: true, asked: true };
    }
    if (WANTS_FILE.test(lower) && !/\d/.test(lower)) {
      return { reply: "Download STL gives you the file; open it in your slicer and print. 3MF, STEP and the others are under the download menu in the Editor.",
        actions: CATALOG_ACTIONS, run: ["stl"], fromCatalog: true };
    }
    if (SMOOTH_ALONE.test(lower)) {
      return { reply: "Smoother how: rounder edges, or finer curves?", chips: ["round the edges", "finer curves"], fromCatalog: true, asked: true };
    }
    const specId = state.catalog?.familyId === open.id ? state.catalog.specId : null;
    // the cable a design makes room for is the charger's: "a hole for the
    // charger" is its cable-hole dial, not a new thing called a charger
    const tEdit = t.replace(/\b(?:phone\s+)?(?:charger|charging\s+(?:cable|cord|lead|port)|power\s+(?:cord|cable|lead)|usb(?:-?c)?(?:\s+(?:cable|cord|lead))?|lightning\s+(?:cable|cord)|cord|lead)\b/gi, "cable");
    const e = editCatalog(open, currentCode, tEdit, { specId });
    if (e?.kind === "round-generic") {
      // "sharp corners" on a design with no rounding dial: take off a fillet
      // the chat wrapped on earlier, or say the edges are sharp already
      if (/\b(sharp|square|unround|less round)\b/.test(lower)) {
        const sharp = unwrapRound(currentCode);
        if (sharp) return { reply: "Took the rounding off: the edges are sharp again. (◀ undoes it.)", code: sharp, fromCatalog: true, actions: CATALOG_ACTIONS };
        return { reply: `The ${what} has sharp edges already; this design has no rounding of its own to take off.`, chips: catalogChips(open, currentCode), fromCatalog: true };
      }
      const op = parseOp(/\bround|fillet/.test(lower) ? t : `round the edges ${t}`, dims) || { kind: "round", r: 1.5 };
      if (op.error) return { reply: `Can't do that: ${op.error}`, fromCatalog: true };
      const r = op.kind === "round" ? op.r : 1.5;
      return {
        reply: `Rounded the outside edges with up to a ${r} mm fillet (less where a wall is thinner), wrapped round the design so its sliders still work; `
          + "inside corners stay sharp, which is stronger. This one has no rounding slider of its own, "
          + "so to round particular edges, ask an AI for the ones you mean. (◀ undoes it.)",
        code: opCode(currentCode, { kind: "round", r }),
        // the viewer measures the build and takes it back if the size moved
        sizeGuard: { op: "round", r, before: dims || null },
        fromCatalog: true, actions: CATALOG_ACTIONS,
      };
    }
    if (e?.kind === "ask-spec") {
      // "bigger phone": which phone? the family's own question, with choices
      const q = open.ask;
      return { reply: q ? q.text : `Which one is it for? Name it (“for a Pixel 9”) and I'll size the ${what} to it.`,
        chips: q?.choices?.length ? q.choices : catalogChips(open, currentCode), fromCatalog: true, asked: true };
    }
    if (e?.kind === "missing-dial") {
      const names = e.missing.map((k) => `“${open.params[k].label}”`).join(", ");
      return {
        reply: `The ${names} line${e.missing.length > 1 ? "s are" : " is"} no longer a plain number in the code, so I can't turn ${e.missing.length > 1 ? "them" : "it"} from here. `
          + `Put it back as “const ${e.missing[0]} = …;”, press ◀ to undo, or change it in the Editor.`,
        actions: [{ label: "Undo", act: "undo", icon: "undo" }, { label: "Editor", act: "editor", icon: "code" }, { label: "Sliders", act: "params", icon: "sliders" }],
        fromCatalog: true,
      };
    }
    if (e?.kind === "no-change") {
      const c = e.clamped?.[0];
      const had = e.already ? open.params[e.already] : null;
      return { reply: c ? `${e.family.params[c.param].label} is already at its limit (${c.used}${unitOf(e.family.params[c.param])}).`
        : had ? `It already has that: ${had.label} is ${num1(e.values[e.already])}${unitOf(had)}. Say a size to change it, or “no ${(had.say || [])[0] || had.label}” to take it off.`
        : "That's how it is already.",
        chips: catalogChips(open, currentCode), fromCatalog: true };
    }
    if (e && e.code) {
      state.catalog = { familyId: open.id, specId: e.specId };
      let lead = null;
      const fx = (k) => +(+k).toFixed(2);
      if (e.kind === "scale") lead = `Scaled the ${what} ×${fx(e.note.factor)}; screw holes, clearances and wall thickness stay as they were`;
      if (e.kind === "scale-axis") lead = `Scaled ${e.note.dials.map((k) => open.params[k].label).join(" and ")} ×${fx(e.note.factor)}`;
      if (e.kind === "nudge") lead = `Made ${e.note.dials.map((k) => open.params[k].label).join(" and ")} ${e.note.factor > 1 ? "bigger" : "smaller"} (×${fx(e.note.factor)})`;
      if (e.kind === "thing") lead = `Set it up as the ${String(e.note.thing).toLowerCase()}`;
      // "make it blue and wider": the colour rides along with the edit
      const tint = parseColour(lower, { bare: false });
      if (tint) e.code = colourCode(e.code, tint.hex) + "\n";
      let reply = catalogReply({ ...e, title: open.title, changedSpec: !!e.spec, sizedFor: e.spec ? [e.spec.note || e.spec.label] : [] }, { refined: true });
      if (lead) reply = reply.replace(/^Updated the [^:.]+/, lead);
      if (tint) reply = reply.includes(" (◀ undoes it.)") ? reply.replace(" (◀ undoes it.)", ` In ${tint.name}. (◀ undoes it.)`) : `${reply} In ${tint.name}.`;
      return { reply, code: e.code, fromCatalog: true, actions: CATALOG_ACTIONS, chips: catalogChips(open, currentCode) };
    }
    if (e?.kind === "holes-generic") {
      const op = parseOp(/\bhole/.test(lower) ? t : `add a hole`, dims);
      if (op?.error) return { reply: `Can't do that: ${op.error}`, fromCatalog: true };
      if (op?.kind === "hole") {
        // a diameter was given ("a 8 mm hole"); a bare count was not
        const sized = /\d+(?:\.\d+)?\s*mm\b/.test(lower) || /\b(?:d|dia|diameter|r|radius)\s*(?:of\s*)?\d/.test(lower);
        const hole = sized ? op : { ...op, dia: 5 };
        const many = (hole.count || 1) > 1;
        return {
          reply: (many
            ? `Drilled ${hole.count} ${hole.dia} mm holes in a row along ${hole.axisName}, straight down through everything`
            : `Drilled a ${hole.dia} mm hole straight down through the middle`)
            + `${sized ? "" : " (screw size; say “a 8 mm hole” for another)"}. `
            + `This design has no hole-count slider, so the hole${many ? "s are" : " is"} placed by position: to move ${many ? "them" : "it"}, change the x and y in the translate([…]) line${many ? "s" : ""} in the Editor. (◀ undoes it.)`,
          code: opCode(currentCode, hole),
          fromCatalog: true,
        };
      }
    }
    // a different, vaguer thing ("I meant a hook"): ask which, with chips
    if (!fresh && wantsNew && !EDIT_THIS.test(lower) && !ADD_TO_THIS.test(lower)) {
      const sug = catalogSuggest(t);
      if (sug) return sug;
    }
    // anything else: let the general edits below try
    if (!fresh) return null;
  }
  if (currentCode.trim() && !open && (EDIT_THIS.test(lower) || !NEW_THING.test(lower))) return null;
  if (!fresh) {
    // nothing confident, but a noun the catalog knows: ask which, with chips
    if (wantsNew && !state.flow) {
      const sug = catalogSuggest(t);
      if (sug) { state.pending = null; return { ...sug, clearPending: true }; }
    }
    return null;
  }
  state.catalog = { familyId: fresh.familyId, specId: fresh.spec?.id || null };
  state.flow = null; state.pending = null;
  const tint = parseColour(lower, { bare: false });
  if (tint) fresh.code = colourCode(fresh.code, tint.hex) + "\n";
  // a typo or a roundabout phrase was read as something else: say so
  const heard = fresh.heard ? `I read that as “${fresh.heard.text}”. ` : "";
  // one-tap follow-ups: the question's own choices when it has them, else
  // the family's tips; and the near-misses as things to say instead
  const chips = fresh.question?.choices?.length ? fresh.question.choices : catalogChips(fresh.family, fresh.code);
  const alts = (fresh.alternativeNames || []).map((n) => `${article(n)} ${n}`).filter((c) => !chips.includes(c));
  return { reply: heard + catalogReply(fresh) + (tint ? ` In ${tint.name}.` : ""), code: fresh.code, clearPending: true, fromCatalog: true,
    chips: [...chips, ...alts], actions: CATALOG_ACTIONS };
}

// One message, two edits: "make it blue and wider", "remove the bottom
// portion and add an extra screw hole". With a model open, the clauses are
// answered in turn, each on the code the one before produced, and the
// replies are joined, so nothing said is silently dropped. A fresh request
// ("a box and a lid") is never split.
const CLAUSE_SPLIT = /\s+(?:and then|and also|and|then|also|plus)\s+|\s*;\s*|,\s*(?:then|and|also)\s+/;
export function respond(text, state = {}, currentCode = "", dims = null) {
  const t = String(text).trim();
  const lower = t.toLowerCase();
  const editing = currentCode.trim() && !NEW_THING.test(lower) && (catalogOf(currentCode) || !findShapes(lower).length)
    && !/\b(between|and a half|side by side|black and white|back and forth)\b/.test(lower);
  let clauses = editing ? t.split(CLAUSE_SPLIT).map((s) => s.trim()).filter(Boolean) : [t];
  if (clauses.length < 2) return respondOne(t, state, currentCode, dims);
  // A colour clause ("blue", "make it blue", "in red") is a coat of paint on
  // whatever the other clauses produce, not a step of its own: it goes on
  // last, and the reply says it in the same breath.
  const COLOUR_ONLY = /^(?:(?:make|paint|colou?r|turn|change|set)\s+)?(?:it|this|that|them)?\s*(?:in\s+)?(?:the\s+colou?r\s+)?([a-z #0-9]{3,18})$/;
  let tint = null;
  clauses = clauses.filter((c) => {
    const m = COLOUR_ONLY.exec(c.toLowerCase());
    const col = m && parseColour(m[1].trim());
    if (col && !tint) { tint = col; return false; }
    return true;
  });
  if (!clauses.length) return respondOne(t, state, currentCode, dims);
  if (clauses.length === 1 && !tint) return respondOne(clauses[0], state, currentCode, dims);
  let code = currentCode, any = false;
  const replies = [], run = [];
  let chips = null, actions = null, asked = false, cantDo = false, fromCatalog = false;
  for (const c of clauses) {
    const r = respondOne(c, state, code, dims);
    if (r.code !== undefined) { code = r.code; any = true; }
    replies.push(r.reply);
    if (!chips && r.chips?.length) chips = r.chips;
    if (r.actions?.length) actions = r.actions;
    if (r.run) run.push(...r.run);
    if (r.asked) asked = true;
    if (r.cantDo) cantDo = true;
    if (r.fromCatalog) fromCatalog = true;
    if (r.pending) state.pending = r.pending;
  }
  if (tint) {
    code = colourCode(code, tint.hex) + "\n";
    any = true;
    const last = replies.length - 1;
    replies[last] = replies[last].includes(" (◀ undoes it.)")
      ? replies[last].replace(" (◀ undoes it.)", ` In ${tint.name}. (◀ undoes it.)`)
      : `${replies[last]} In ${tint.name}.`;
  }
  const out = { reply: replies.join("\n"), fromCatalog };
  if (any) out.code = code;
  if (chips) out.chips = chips;
  if (actions) out.actions = actions;
  if (run.length) out.run = run;
  if (asked) out.asked = true;
  if (cantDo && !any) out.cantDo = true;
  return out;
}

function respondOne(text, state = {}, currentCode = "", dims = null) {
  const t = text.trim();
  const lower = t.toLowerCase();

  const fromCatalog = catalogTurn(t, lower, state, currentCode, dims);
  if (fromCatalog) return fromCatalog;

  // "undo" in the chat is the editor's ◀: one step back through the model's
  // history, whoever made the change. `run` is carried out by the viewer.
  if (/^(undo|go back|revert|put it back|undo that|take that back)\b/.test(lower)) {
    return { reply: "Stepped back one change (the editor's ◀). Say undo again for another step.", run: ["undo"],
      actions: [{ label: "Undo again", act: "undo", icon: "undo" }] };
  }

  if (currentCode.trim()) {
    const tint = parseColour(lower);
    if (tint) return { reply: `Made it ${tint.name}. (◀ undoes it.)`, code: colourCode(currentCode, tint.hex) };
  }

  if (/^(help|\?|what can you do)/.test(lower)) {
    return {
      reply: "Ask for a real thing: “I want a phone stand”, “a hook for my yoga mat”, “a cable clip for 3 cables”, “a small wall shelf”; say “what can you make” for the whole list. Simple shapes too: “box with a cone on top”, “plate with a hole”, “two cubes side by side”. I can also walk you through a bracket, a picture frame, or a holder: just name one. With a model on screen I can change it: “wider”, “make it 50mm wide”, “take 10 mm off the bottom”, “round the edges”, “add two holes”, “make it blue”, “scale it up 20%”, and “undo” steps back. Say “smoother” or “low poly” to change facets. Lost? The tour shows where everything is. "
        + WAYS_ON,
      chips: ["what can you make", "I want a phone stand", "a hook for my yoga mat"],
      actions: HELP_ACTIONS,
    };
  }

  // Resize before anything else: it works on whatever is already in the editor,
  // including an import, and it is pure arithmetic off the measured size.
  if (currentCode.trim() && dims) {
    // "remove the bottom portion", "cut off the top": a one-sided cut with no
    // amount is a question, not a guess. The chips are the answers.
    const faceWord = /\b(bottom|top|left|right|front|back)\b/.exec(lower)?.[1];
    const cutWords = /\b(remove|cut|take|shave|trim|chop|lop|slice|knock|shorten|get rid of|lose|delete)\b/.test(lower)
      || /\b(off|away|gone|portion|part|section|bit)\b/.test(lower);
    if (faceWord && cutWords && !/\d/.test(lower) && !/\bhole/.test(lower)) {
      const box = boxOf(dims);
      const axis = faceWord === "top" || faceWord === "bottom" ? 2 : faceWord === "left" || faceWord === "right" ? 0 : 1;
      const len = box ? Math.round(box.size[axis] * 10) / 10 : 0;
      const word = ["wide", "deep", "tall"][axis];
      const quarter = Math.max(1, Math.round(len / 4));
      return {
        reply: `How much off the ${faceWord}? The part is ${len} mm ${word} there. Tap an amount or say one (“take 12 mm off the ${faceWord}”).`,
        chips: [`take 5 mm off the ${faceWord}`, `take 10 mm off the ${faceWord}`, `take ${quarter} mm off the ${faceWord}`],
        asked: true,
      };
    }
    // A named face wins over a bare axis: "take 0.2mm off the top" is one-sided
    // work, not a cut through the middle, and reading it as the latter would
    // quietly delete a slab out of the centre of the part.
    const f = parseFaceEdit(t, dims);
    if (f?.error) return { reply: `Can't do that — ${f.error}` };
    if (f) {
      const verb = f.kind === "trim" ? "Shaved" : "Extended";
      const where = f.kind === "trim" ? `off the ${f.face}` : `onto the ${f.face}`;
      return {
        reply: `${verb} ${f.amount}mm ${where} — ${f.axis.toUpperCase()} goes ${f.current}mm → ${f.target}mm.`
          + `${f.kind === "trim" && f.face === "bottom" ? " The part is dropped back onto z = 0." : ""}`
          + `${f.box.assumed ? " (Working from the status-bar size; if the part isn't centred, check the result.)" : ""}`
          + " (◀ undoes it.)",
        code: faceEditCode(currentCode, f),
      };
    }

    // Plain-English operations with exactly one sensible reading: punch a hole,
    // round the edges, bevel, drop to the floor, centre it.
    const op = parseOp(t, dims);
    if (op?.error) return { reply: `Can't do that — ${op.error}` };
    if (op?.already) {
      return { reply: op.kind === "floor"
        ? "It's already sitting on z = 0 — nothing to drop."
        : "It's already centred on the origin." };
    }
    if (op) {
      const said = {
        floor: () => `Dropped it ${Math.abs(op.drop)}mm so the base sits exactly on z = 0.`,
        centre: () => `Centred it on the origin — moved ${op.dx}mm on X and ${op.dy}mm on Y.`,
        round: () => `Rounded the outside edges with up to a ${op.r}mm fillet (less where a wall is thinner); inside corners stay sharp.`,
        bevel: () => `Chamfered the edges by up to ${op.r}mm (less where a wall is thinner).`,
        hole: () => (op.count > 1
          ? `Drilled ${op.count} ${op.dia}mm holes in a row along ${op.axisName}, all the way through.`
          : `Punched a ${op.dia}mm hole straight down the middle, all the way through.`)
          + ` The cutter${op.count > 1 ? "s overshoot" : " overshoots"} both faces by ${EPS}mm so no face is left coincident:`
          + ` that's what stops a slicer seeing a lid over the hole.`,
      }[op.kind]();
      const guard = op.kind === "round" || op.kind === "bevel" ? { sizeGuard: { op: op.kind, r: op.r, before: dims || null } } : {};
      return { reply: `${said} (◀ undoes it.)`, code: opCode(currentCode, op), ...guard };
    }

    // Scale is its own thing and the user has to have asked for it by name —
    // it multiplies every feature, which is usually NOT what "make it wider"
    // means, so nothing routes here by accident.
    const sc = parseScale(t, dims);
    if (sc) {
      return {
        reply: `Scaled ${sc.axis ? sc.axis.toUpperCase() : "everything"} by ${sc.k}× — ${sc.current}mm → ${sc.target}mm.`
          + ` Note this multiplies every feature too: walls, holes and fillets all change by ${sc.k}×.`
          + ` If you wanted the outside size changed while the details stayed put, say “make it N mm wide” instead. (◀ undoes it.)`,
        code: scaleCode(currentCode, sc),
      };
    }

    let r = parseResize(t, dims);
    // a bare comparative ("make it wider", "taller") means a sensible 20%
    const bare = !r && !/\d/.test(lower) && /\b(wider|narrower|taller|shorter|longer|deeper|thicker|thinner)\b/.exec(lower);
    if (bare) r = parseResize(`make it 20% ${bare[1]}`, dims);
    if (r?.error) return { reply: `Can't do that — ${r.error}` };
    if (r) {
      const A = r.axis.toUpperCase();
      return {
        reply: `${r.shrinking ? "Cut" : "Added"} ${Math.abs(r.by)}mm ${r.shrinking ? "out of" : "into"} the middle on ${A}`
          + ` — ${r.current}mm → ${r.target}mm (${r.how}). The other two axes are untouched`
          + `${r.shrinking ? ", and anything that lived in the removed slab is gone" : ""}. (◀ undoes it.)`,
        code: resizeCode(currentCode, r),
      };
    }
  }
  if (/^(clear|start over|reset)\b/.test(lower)) {
    state.flow = null; state.pending = null;
    return { reply: "Cleared the editor.", code: "" };
  }
  if (/^(cancel|never ?mind|stop)\b/.test(lower)) {
    state.flow = null; state.pending = null;
    return { reply: "Okay, cancelled. What next?" };
  }

  // facet commands operate on the current code
  if (/\b(smoother|more facets|higher res|finer curves)\b/.test(lower)) {
    if (!/\$fn:\s*\d+/.test(currentCode)) {
      return { reply: "This model has no facet setting to raise: its curves are already as smooth as they get. If it is the edges you want softer, say “round the edges”.",
        chips: ["round the edges", "chamfer the edges"] };
    }
    const code = currentCode.replace(/\$fn:\s*(\d+)/g, (_, n) => `$fn: ${Math.min(+n * 2, 128)}`);
    return { reply: "Doubled the facet counts (capped at 128). Smoother, slower.", code };
  }
  if (/\b(low.?poly|fewer facets|faceted|chunky)\b/.test(lower)) {
    if (!/\$fn:\s*\d+/.test(currentCode)) return { reply: "No $fn values in the current model to lower." };
    const code = currentCode.replace(/\$fn:\s*(\d+)/g, (_, n) => `$fn: ${Math.max(Math.round(+n / 2), 8)}`);
    return { reply: "Halved the facet counts — nice and chunky.", code };
  }

  // ---- natural-language transforms on the current model ------------------
  const transformed = tryTransform(lower, currentCode);
  if (transformed) return transformed;

  // ---- active guided flow: interpret this message as the answer ----------
  // ...unless it is plainly a change of mind: a catalog thing named mid-flow
  // ("hook", while the holder flow waits for a size) drops the flow rather
  // than being read as "80 mm across".
  const FLOW_ANSWER = /\b(none|no|yes|yep|ok|okay|sure|go ahead|wall|mount|screw|hang|free|freestanding|standing|round|rounded|square)\b/;
  if (state.flow && !/\d/.test(lower) && !FLOW_ANSWER.test(lower) && (matchCatalog(t) || catalogSuggest(t))) {
    state.flow = null;
    const sug = matchCatalog(t) ? null : catalogSuggest(t);
    if (sug) return sug;
  }
  if (state.flow) {
    const f = state.flow;
    const sizes = extractSizes(lower);

    if (f.kind === "bracket") {
      if (f.step === 0) {
        const pair = parsePairMm(lower);
        if (pair) { f.a.L = pair[0]; f.a.H = pair[1]; }
        else if (sizes.numbers.length) { f.a.L = f.a.H = sizes.numbers[0]; if (sizes.numbers[1]) f.a.W = sizes.numbers[1]; }
        f.step = 1;
        return { reply: `Legs ${f.a.L ?? 40} × ${f.a.H ?? 40}, ${f.a.W ?? 20} wide. How many screw holes per leg — “2 holes 4mm”, or “none”?` };
      }
      if (f.step === 1) {
        if (/\bnone|no\b/.test(lower)) f.a.holes = 0;
        else {
          const n = lower.match(/(\d+)\s*(?:holes?|screws?)/) ?? [null, sizes.numbers[0]];
          if (n[1]) f.a.holes = Math.min(+n[1], 6);
          const d = lower.match(/(\d+\.?\d*)\s*mm/);
          if (d) f.a.holeR = +d[1] / 2;
        }
        state.flow = null;
        return { reply: `Here's your bracket — ${f.a.holes ?? 2} hole${(f.a.holes ?? 2) === 1 ? "" : "s"} per leg. Tune any number in the editor.`, code: genBracket(f.a) };
      }
    }
    if (f.kind === "frame") {
      if (f.step === 0) {
        const pair = parsePairMm(lower);
        if (pair) { f.a.pw = pair[0]; f.a.ph = pair[1]; f.a.inches = /in|"|^..?x..?$/.test(lower) ? lower.match(/(\d+\s*x\s*\d+)/)?.[1] : null; }
        f.step = 1;
        return { reply: `Frame for a ${f.a.pw ?? 102} × ${f.a.ph ?? 152} mm photo. Square corners or rounded?` };
      }
      if (f.step === 1) {
        f.a.rounded = /round/.test(lower);
        state.flow = null;
        return { reply: `Done — ${f.a.rounded ? "rounded" : "square"}-corner frame with a rear pocket for the photo. Print face-down for a clean front.`, code: genFrame(f.a) };
      }
    }
    if (f.kind === "holder") {
      if (f.step === 0) {
        if (sizes.numbers.length) { f.a.d = sizes.numbers[0]; if (sizes.numbers[1]) f.a.h = sizes.numbers[1]; }
        if (sizes.r) f.a.d = sizes.r * 2;
        if (sizes.h) f.a.h = sizes.h;
        f.step = 1;
        return { reply: `${f.a.d ?? 80} mm across, ${f.a.h ?? 100} mm deep. Freestanding, or wall-mount with a screw tab?` };
      }
      if (f.step === 1) {
        f.a.mount = /wall|mount|screw|hang/.test(lower) && !/free|stand|no\b/.test(lower);
        state.flow = null;
        return { reply: `Here's your ${f.a.mount ? "wall-mount" : "freestanding"} holder.`, code: genHolder(f.a) };
      }
    }
    // every step above returns; nothing falls through while a flow is active
  }

  // ---- start a guided flow -----------------------------------------------
  if (/\bbracket\b/.test(lower)) {
    state.flow = { kind: "bracket", step: 0, a: {} };
    const pre = parsePairMm(lower);
    if (pre) { state.flow.a.L = pre[0]; state.flow.a.H = pre[1]; }
    return { reply: "An L-bracket — nice. How long should the two legs be (e.g. “40 x 60”), and how wide? Or “go ahead” for 40 × 40 × 20." };
  }
  // A picture frame when something says so: a word for what goes in it, a
  // size, or "frame" being most of a short ask ("make a frame"). Frames of
  // other kinds ("a quadcopter drone frame with motor mounts", "bike frame")
  // are something else, and used to be asked what size photo they held.
  const forAPicture = /\b(picture|photo|poster|print|art|artwork|painting|canvas|diploma|certificate)s?\b/;
  const notAPicture = /\b(drone|quad\w*|bike|bicycle|bed|door|window|chassis|car|kart|glasses|tent)\b/;
  if (/\bframe\b/.test(lower) && !notAPicture.test(lower)
      && (forAPicture.test(lower) || parsePairMm(lower) || lower.trim().split(/\s+/).length <= 5)) {
    state.flow = { kind: "frame", step: 0, a: {} };
    const pre = parsePairMm(lower);
    if (pre) { state.flow.a.pw = pre[0]; state.flow.a.ph = pre[1]; state.flow.step = 1;
      return { reply: `Frame for ${pre[0]} × ${pre[1]} mm. Square corners or rounded?` }; }
    return { reply: "What size photo — “4x6”, “5x7”, or millimetres like “100 x 150”? (“go ahead” = 4x6.)" };
  }
  if (/\b(holder|cup|pen ?pot|organizer|bin|caddy)\b/.test(lower) && !/screw ?driver/.test(lower)) {
    state.flow = { kind: "holder", step: 0, a: {} };
    return { reply: "A holder — how big inside? e.g. “80 wide, 100 deep”, or “go ahead” for 80 × 100 mm." };
  }

  // Lexicon phrases the rule engine deliberately does NOT guess at. Each needs
  // a judgement the box alone cannot supply — a wall thickness, which face to
  // open, what shape to add, which of several solids to line up. Falling
  // through to "I didn't spot a shape I know" would be a useless answer to a
  // perfectly reasonable request, so name the missing piece instead.
  if (currentCode.trim()) {
    const defer = [
      [/\b(hollow|shell)\b/, "Hollowing needs a wall thickness — there's no shell operator, so it's a difference against an inset copy",
        "try “make it hollow with 2.4mm walls, open at the top”"],
      [/\b(on top|attach|stack|mount on)\b/, "Adding a shape on a face needs to know what shape and how big",
        "try “put a 20mm cone on top”"],
      [/\b(align|line up|flush)\b/, "Aligning needs at least two solids and which edges should match",
        "try “centre it” for a single part"],
    ].find(([re]) => re.test(lower));
    if (defer) {
      return { reply: `${defer[1]}. I can do the mechanical edits on my own — holes, fillets, chamfers, resizing, drop to the floor, centre it — but this one wants a real model. Otherwise ${defer[2]} and tell me the numbers. ${WAYS_ON}`, actions: HELP_ACTIONS, cantDo: true };
    }
  }

  // requests clearly beyond the built-in skills -> recommend the API
  if (/\b(gear|thread|text|logo|hinge|screw thread|dragon|figurine|organic|helix|spiral|enclosure with lid|case for)\b/.test(lower)) {
    return { reply: `That one's beyond my built-in tricks: I do the catalog (“what can you make”), simple shapes, holes, brackets, frames and holders. ${WAYS_ON}`, actions: HELP_ACTIONS, cantDo: true };
  }

  // follow-up: accept defaults for a pending proposal
  if (state.pending && /^(ok|yes|yep|sure|go ahead|do it|defaults?|fine)\b/.test(lower)) {
    const code = state.pending.make();
    const done = { reply: `Done — ${state.pending.summary}. Adjust any number in the editor, or just tell me new sizes.`, code, clearPending: true };
    return done;
  }

  // follow-up: sizes for a pending proposal
  if (state.pending) {
    const sizes = extractSizes(lower);
    if (sizes.numbers.length) {
      state.pending.applySizes(lower, sizes);
      const code = state.pending.make();
      return { reply: `Built with your sizes — ${state.pending.summary}.`, code, clearPending: true };
    }
  }

  const shapes = findShapes(lower);
  if (!shapes.length) {
    // a catalog model is open and this adds to it or cuts into it: an edit
    // of THIS model (its dials, or the AI), never a list of other designs
    const open = catalogOf(currentCode);
    if (open && ADD_TO_THIS.test(lower)) return { ...catalogCantDo(open, t, currentCode), cantDo: true, editOpen: true };
    // a noun the catalog knows several of ("I meant a hook"): ask which
    const sug = catalogSuggest(t);
    if (sug) return sug;
    // a catalog model is open: say what ITS dials can do instead
    if (open) return { ...catalogCantDo(open, t, currentCode), cantDo: true, editOpen: true };
    return {
      reply: `I didn't spot a shape or a thing I know. Try “I want a phone stand”, “a hook for my yoga mat”, or “make a box with a cone on top”; “what can you make” lists the catalog. ${WAYS_ON}`,
      chips: ["what can you make", "I want a phone stand", "a hook for my yoga mat"],
      actions: HELP_ACTIONS, cantDo: true,
    };
  }

  // per-shape local sizes: numbers immediately after the shape word
  const withDims = shapes.map((s, i) => {
    const from = s.at;
    const to = shapes[i + 1] ? shapes[i + 1].at : lower.length;
    const seg = lower.slice(from, to);
    const sz = extractSizes(seg);
    const dims = {};
    if (sz.r !== undefined) dims.r = sz.r;
    if (sz.h !== undefined) dims.h = sz.h;
    if (sz.tube !== undefined) dims.tube = sz.tube;
    if (s.kind === "cube" && sz.numbers.length) {
      const n = sz.numbers;
      dims.x = n[0]; dims.y = n[1] ?? n[0]; dims.z = n[2] ?? n[1] ?? n[0];
    } else if (sz.numbers.length && dims.r === undefined && s.kind !== "cube") {
      dims.r = sz.numbers[0];
      if (sz.numbers[1] !== undefined && dims.h === undefined) dims.h = sz.numbers[1];
    }
    return { kind: s.kind, dims };
  });

  const anySizes = withDims.some((s) => Object.keys(s.dims).length);
  const hole = /\bhole|bore|drill/.test(lower);
  const stacked = /\bon top\b|\bon (?:a|the|it)\b|\bstack/.test(lower);
  const sideBySide = /side by side|next to|beside/.test(lower);

  let make, summary;
  if (hole) {
    const base = withDims[0];
    const holeR = extractSizes(lower).r ?? Math.max(2, ({ ...DEFAULTS[base.kind], ...base.dims }.x ?? 20) / 5);
    make = () => composeHole(base, holeR);
    summary = `${describeDefaults([base])} with a ${holeR}mm-radius hole through it`;
  } else if (withDims.length >= 2 && sideBySide) {
    make = () => composeSideBySide(withDims[0], withDims[1]);
    summary = describeDefaults(withDims.slice(0, 2)) + " side by side";
  } else if (withDims.length >= 2) {
    // default two-shape relation: stack (covers "box with a cone on top")
    make = () => composeStack(withDims[0], withDims[1]);
    summary = describeDefaults(withDims.slice(0, 2)) + (stacked ? " stacked" : " stacked (say “side by side” if you meant that)");
  } else {
    const s = withDims[0];
    make = () => {
      const f = footprint(s.kind, s.dims);
      return f.liftZ ? `translate([0, 0, ${f.liftZ}], ${shapeCall(s.kind, s.dims)})` : shapeCall(s.kind, s.dims);
    };
    summary = describeDefaults([s]);
  }

  if (!anySizes) {
    const pending = {
      make, summary,
      applySizes(text2, sizes) {
        // re-parse the sizes message against the pending shapes
        const n = sizes.numbers;
        withDims.forEach((s, i) => {
          const v = n[i];
          if (v === undefined) return;
          if (s.kind === "cube") { s.dims.x = s.dims.y = s.dims.z = v; }
          else s.dims.r = v;
        });
        if (sizes.h !== undefined && withDims[1]) withDims[1].dims.h = sizes.h;
        else if (sizes.h !== undefined) withDims[0].dims.h = sizes.h;
        this.summary = describeDefaults(withDims);
      },
    };
    return {
      reply: `I can do that — I'd use ${summary}. Give me sizes (e.g. “${withDims.map((s) => s.kind + " " + (s.kind === "cube" ? "30" : "10")).join(", ")}”) or say “go ahead” for those defaults.`,
      pending,
    };
  }

  return { reply: `Done — ${summary}. Tweak numbers in the editor, or tell me changes.`, code: make() };
}

// ------------------------------------------------------------- API mode

// ---------------------------------------------------------------- harness
//
// The full instruction set sent with every AI request — the model's "job
// description". One string, provider-neutral: it rides as `system` on Claude
// and `systemInstruction` on Gemini, so keep it plain text with no
// provider-specific formatting. Users can edit it in ⚙ (stored per-browser);
// clearing the editor restores this default.
// The mission above, shrunk for models that see 4-8k tokens TOTAL. The full
// harness is ~3k tokens on its own — sent to a small in-browser model it
// crowded out the user's actual code and history until requests overflowed
// the context window outright. Small models also FOLLOW a short prompt
// better: vocabulary, a handful of hard rules, the output shape, done.
// Used automatically for the "browser" provider when the mission is the
// untouched default; a user-edited mission always wins.
// Pass 1: the SCULPTOR pass. Deliberately blocky — a small model juggling
// eight primitives and fillets at once hallucinates; the same model given
// five shapes and three combiners mostly gets the massing right. A/B'd on
// the 1.5B: the base-vocabulary BREPcode prompt was the only one of four
// runs (vs OpenSCAD, which the model has actually SEEN in pretraining) that
// produced code that BUILT. Rounding, colour and fancier forms come in the
// Polish pass below, on code that already works.
export const COMPACT_HARNESS = `You write BREPcode: JavaScript that RETURNS one shape. Millimetres. Z is up. Parts sit on z=0.
CATALOG CODE: keep a leading "From the BREPcode catalog: <id>." header, its "// Sized for" line and the const dials above the model exactly as they are; the app's follow-ups read them.
SHAPES (the ONLY primitives): cube([x,y,z]) corner at origin · cylinder({r,h,$fn:48}) rises +Z from origin · sphere({r}).
COMBINE: union(a,b,...) welds · difference(base, ...cutters) cuts holes · group(...parts) keeps parts separate — end multi-part assemblies with group(), never one big union.
MOVE: translate([x,y,z], shape) · rotate([rx,ry,rz], shape) degrees, turned about Z FIRST, then Y, then X (not OpenSCAD's order): for two turns nest one-axis calls.
RULES: sizes as named const at the top · cutters poke THROUGH faces (start 1mm below, end 1mm past) · keep it blocky and correct — rounding and colour come in a later Polish pass · there is no hole()/screw()/text()/fillet() here — build from the shapes above.
THIS IS JAVASCRIPT: call the functions and nest shapes as arguments. NEVER OpenSCAD-style {} blocks after translate/rotate, NEVER shapes inside a string — return the shape object itself.
EXAMPLE (a plate with one screw hole):
const W = 40, D = 20, T = 5;
return difference(
  cube([W, D, T]),
  translate([10, 10, -1], cylinder({ r: 2.5, h: T + 2 }))
);
REPLY SHAPE: one short sentence, then ONE fenced code block of complete runnable code ending in a return. Nothing after the fence. Never repeat the request back, never introduce yourself — build.`;

// Pass 2: POLISH. Runs only on code that already builds, so the model edits
// instead of inventing — the easier job. This is where the wider vocabulary
// unlocks, one step at a time, exactly the way a person sands after shaping.
export const POLISH_HARNESS = `You improve existing BREPcode: JavaScript that RETURNS one shape. Millimetres. Z is up. The code you are given ALREADY BUILDS — keep its structure and sizes, refine it.
Keep any leading "From the BREPcode catalog" header and its const dials as they are.
YOU MAY NOW ALSO USE: tube(path, {r}) sweeps a round profile along a point list — cables, bowden tubes, handles, hoops; ONE solid however many bends, with real arcs at the corners, so replace any chain of cylinders-and-spheres you find with it · helix({r,turns,pitch}) and circlePath({r}) give it point lists · fillet(r, shape) rounds all edges (r 1-2 typical) · chamfer(c, shape) bevels · roundedGrow(mm, shape) — also spelled minkowski(mm, shape) — rounds EVERY outside edge and corner at once and grows the part by that much on every face (a 20mm cube becomes 26mm at 3) · roundedShrink(mm, shape) takes an even layer off · cone({r1,r2,h}) · torus({R,r}) · colorize("#hex", shape) per part · colorByHeight({every|at, colors}, shape) bands by height as SEPARATE solids · scale([x,y,z], shape) · mirror([1,0,0], shape).
POLISH MEANS: fillet or chamfer edges a hand touches · colorize each logical part differently · swap a crude block for a cone/torus where the real object is round · keep every screw hole and mating size EXACTLY as it is.
ROUNDING, WHICH TO REACH FOR: fillet(r) when the part must keep its size — it rounds in place. roundedGrow(mm) when the whole thing should read as soft and pillowy, or when fillet() fails on the shape; it is the one that works on an imported mesh. It GROWS the part, so never use it on a mating face, a shaft or a bore — say in your sentence that the outside got mm bigger. Never use it to round a single edge, and never to make two parts FIT — that is clearance(gap, shape), which grows a shape about its own centre by the gap ON DIAMETER.
EXACT FIRST: fillet/chamfer/cone/hull({exact:true}) over roundedGrow/tube (meshes); never fillet after a mesh.
Do not add new features the user never asked for. Do not rename the consts.
REPLY SHAPE: one short sentence saying what you refined, then ONE fenced code block of the COMPLETE improved code ending in a return. Nothing after the fence.`;

export const DEFAULT_HARNESS = `MISSION
You are the modeling engine inside BREPcode, a browser CAD app. The user describes a physical object; you deliver working BREPcode that builds it. Your reply IS the product: every reply ends with one complete fenced code block containing the model. One short sentence of context before it is allowed. A reply with no code block is a failed reply.

You are not a chatbot that discusses CAD — you are the tool that does it. Never describe a technique instead of writing it. Never stop halfway to ask permission. If something can't be done exactly, build the closest real approximation and say so in one sentence.

If the request is not about building a model at all — a question about the app, a browser, a bug, anything else — say in one sentence that you only build models, and write NO code block. Do not answer it with JavaScript. Your code block is executed to build the part, so a reply containing browser code (fetch, document, window, localStorage…) is refused by the app and the user just sees a warning. One honest sentence is far more useful than a snippet that will not run.

LANGUAGE — BREPcode (JavaScript). This vocabulary is the whole language; nothing else exists:
cube([x,y,z]) corner-at-origin; cylinder({r,h,$fn}) +Z from z=0; cone({r1,r2,h}); sphere({r}); torus({r,tube}); polygon([[x,y],...]) + linearExtrude({h}, profile); union(...); difference(target,...cutters); intersection(...); translate([x,y,z],s); rotate([rx,ry,rz],s) degrees, about Z first, then Y, then X; scale([x,y,z],s); mirror([nx,ny,nz],s); fillet(r,s); chamfer(d,s); revolve(angle, polygon([...])) about x=0; stretch({axis:'x'|'y'|'z', by:mm, at:pos}, s) cuts at a plane and widens the middle — a NEGATIVE by removes that much from the middle instead (scale a part up then stretch it back down to thicken its walls/rails while keeping the original outside size; anything in the removed slab is deleted); hull(...shapes) wraps everything in one convex skin (a MESH unless hull({exact:true}, ...): see EXACT B-REP FIRST) — for lofting between PROFILES no cone, extrude or revolve makes (a boss blending into a plate). If the taper runs ALONG a line or round a bend, that is tube() with a radius list, not hull: hulling a row of discs along a path is the slow way to write a sweep and produces about seven times the triangles; roundedGrow(mm,s) / minkowski(mm,s) rounds every outside edge, grows by mm; roundedShrink(mm,s) the opposite; smoothUnion(k, ...s) soft-min blend, flesh not creases; blob([[x,y,z,r],...],{k}) metaballs; drill([x,y,z],[nx,ny,nz],{d,depth,through}) bores into a face along its normal; group(...) keeps parts separate (assemblies).
text({text, size, height, mode}) makes real 3D letters: union(plate, text(...)) embosses them, difference(plate, text({..., mode:'deboss'})) engraves them. stencil({text, size, thickness}) makes a spray/paint stencil — letters cut through a plate with auto tabs holding the counters (O, A, 0…).
Codes (ONLY when the user explicitly asks for one): qrcode({text}), datamatrix({text}) — datamatrix also takes {label:"…"} to print human-readable text under it — and barcode({text}); options {module, relief, base}. Codes are raised; print them in a contrasting filament (2-colour). Never add a code unprompted.
Colour: colorize([r,g,b], shape) tags a colour; a model with 2+ colours exports to 3MF as a colour group so a multi-material printer assigns a filament per colour (great for a coloured embossed label).
Soft joins: blend({k}, a, b) melts shapes into one another instead of leaving a seam — k is the blend in mm and reads like a fillet radius. It takes its OWN shapes: sphere3d({r}), box3d([x,y,z]), cylinder3d({r,h}), torus3d({R,t}), moved with move3d([x,y,z], s) — all centred on the origin, unlike cube/cylinder. blend({k, cut:true}, a, b) subtracts b with a soft rim; blend({k, intersect:true}, a, b) keeps the overlap. Reach for it on organic, moulded or hand-held forms — handles meeting bodies, a spout off a jug, a fairing — where fillet() would have to find an edge. The result is a mesh, so blend last and do not fillet() it afterwards.
Surface texture: texture({pattern, depth, scale, faces}, shape) displaces REAL geometry — the pattern survives into the exported STL/3MF. pattern: "knurl" (diamond grip), "fuzzy" (fuzzy skin), "layers", "bumps" (grip dots), "waffle"; faces: "sides" (default), "top", "bottom", "all"; depth in mm, scale = pattern size in mm. Use it when the user wants grip, knurling, fuzzy skin or a tactile finish. heightmap() also exists but its image grid comes from the app's Photo emboss tool — never fabricate map data yourself.
tube(path, {r}) — THE tool for anything that FOLLOWS A LINE, and far wider than it sounds. Pipes, spouts, elbows, funnels, horns, nozzles, ducts, handles, hoops, bent rod, cable and bowden runs. It sweeps a round profile along a list of points and rounds every corner into a real arc, so a 90-degree elbow is one point in the path, not a construction. tube([[0,0,0],[40,0,0],[40,30,0]], {r:2}). Options: r as a LIST of radii, one per point, TAPERS it — that is how you get a funnel, a horn or a cone-to-pipe transition in one call · sides (facets, auto from the radius) · bend (corner radius, defaults to 3x r; 0 for a mitre) · closed:true for a loop, no caps · caps:"flat" to leave the ends open. helix({r,turns,pitch}) and circlePath({r}) return point lists to feed it (pitch 0 = a flat spiral, which is how a cable prints without supports).
A HOLLOW pipe or funnel is two tubes on the same path: difference(tube(path,{r:outer}), tube(longerPath,{r:inner})). Make the inner path overshoot both open ends so no face lands exactly on a face.
THERE IS A SHELF OF COMMON PARTS, already written and already building: standoffs and insert bosses, keyhole and zip-tie slots, gussets, snap hooks and their catches, dovetails, living and pin hinges, enclosure shells with lid rebates, vents, honeycomb, knobs, handles, hooks, foot recesses, label plates, a pillow block, PCB standoffs and mounting plates for the common dev boards, panel cutouts for USB/HDMI/RJ45 and the rest, Gridfinity bins and baseplates, rounded slots, cable clips and a bolt-circle helper. Reach for one before modelling it by hand, then change its options — they are all parametric. Ask for #shelf to get the list with every call and its numbers; do not guess a name from this sentence.
STANDARD HARDWARE IS ALREADY WRITTEN — never recall a clearance hole or a bearing size, call for it. bearingPocket("608") is the seat, bearing("608") the part; screwHole("M3",{depth,head:"socket"|"button"|"flat",tap,close}) cuts DOWNWARD from z=0 so you place it where the head goes; insertBore("M3") for a heat-set insert; nutPocket("M3",{captive:true}) for a hex nut, with a slide-in slot if you ask; magnetPocket(d,h); plus screw()/nut() for a fit check. Every one is bored oversize by a stated fit and carries the real standard number, so "an M3 clearance hole" is 3.4 and not 3.2 without you having to know that. See #parts for the full range and the fits.
NEVER build a wire or tube as a chain of cylinders with spheres at the joints. That was the old workaround and it is now wrong: it costs one solid per segment plus one per joint, so a five-bend wire was eleven solids and a twenty-second build, and it still shows a kink at every bend. One tube() call is ONE solid with real arcs however many bends it has.
PICK THE RIGHT TOOL BEFORE YOU WRITE. Most failed replies are not bugs — they are the right shape built with the wrong verb, and they fail slowly.
· Follows a line, bends, or tapers along its length — pipe, spout, elbow, funnel, horn, duct, handle, cable → tube() with a radius list. MEASURED: a 90-degree tapering funnel is 1,280 triangles in 0.35s with tube(); the same funnel hand-rolled as hulled discs along the arc is 8,824 triangles in 16.3s.
· A taper → cylinder({r1, r2}). Blended profiles → hull({exact:true}, …).
· A wall standing on an outline, a blade, an inset or outset of a 2D shape → OpenSCAD's offset(). BREPcode has NO offset; insetting points yourself self-intersects the moment the outline turns inward.
· Rounding an existing edge → fillet()/chamfer(). Rounding EVERYTHING and growing the part → roundedGrow().
· Creature, mascot, snowman, fleshy → blob()/smoothUnion(), never plain union (creases).
· Two shapes melting together with no edge to find → blend().
· A box with rounded vertical corners → fillet({ r, edges: "z" }, cube([x, y, z])), exact (so is hull({exact:true}) of 4 equal corner cylinders). Never roundedGrow() (a mesh).
· roundedCuboid() and roundedCylinder() are JSCAD names and DO NOT EXIST here ("not defined" loses the whole build). A rounded box is fillet({ r, edges: "z" }, cube([x,y,z])); a rounded-off cylinder is fillet({ r, edges: "bottom" }, fillet({ r, edges: "top" }, cylinder({r, h}))), one rim at a time (a fillet of the whole cylinder is refused). Any name half-remembered from JSCAD or OpenSCAD that is not in the list above is not here.
IF YOU ARE HAND-ROLLING, STOP: a loop hulling discs along a path, or a helper unioning cylinders end to end, wants tube(); a loop nudging polygon points inward wants OpenSCAD offset(). The built-in is faster and already handles the corner cases.
${EXACT_CORE}
BUILD COST — these three cost real seconds and are easy to avoid. Merge same-coloured disjoint parts with union() into one solid (81 solids took 18.9s, the same model as 35 took 13s) — EXCEPT parts that each span the whole model diagonally, whose bounding boxes all overlap; unioning four of those cost 9s on its own. Leave tube()'s bend at its default; forcing it tight makes the inside of the arc weld into slivers the kernel must repair (12.7s for four thin strands). Keep every tube path monotonic — a point that doubles back makes a self-intersecting mesh.
PLACING DETAIL ON A FACE: a recessed bay cut into a box, inset from the walls, does NOT lower those walls — they still run to full height. Work out where a badge, screen or port goes from the FACE it sits on, not from the floor of the pocket behind it. To show the inside of an enclosure, LINE the cavity with thin panels; a solid dark block the size of the chamber hides whatever was in there.
FILAMENT BY NAME — ALWAYS use the comment form, on its own line at the TOP of the code: // filament: witchcraft
It works in every language you can write here. The JS call filament("x") only exists in BREPcode, and a cookie cutter is written as OpenSCAD, where it is silently ignored — so the comment is the form that always applies. The same line also survives being saved and reopened.
filament("witchcraft") sets the viewer's spool — real Cookiecad filaments, so "make a heart cutter in Witchcraft" or "print the star in Funfetti" is ONE request you answer in code, not prose. Names: funfetti, unicorn, ruby, witchcraft, mermaid, darkmagic, fairyfloss, golddust, pinkombre (case and spacing do not matter; "Pink Ombré", "gold dust" and "PETG Witchcraft" all work). Write it as a statement before the return — filament("funfetti"); return cutter; — or wrap a shape: filament("unicorn", cutter). Viewer only: the STL is identical whichever spool is named, so never let it change the geometry. If the user names a filament you do not recognise, say so and list these nine rather than guessing.
Looks (viewer only, geometry/export unchanged): look({...}) sets the SCENE - filament, metal, rough, ambient/key/fill/rim, exposure, filmic, bg - so you can light and finish the whole model, not just parts; glow(color, intensity, shape) is a lit LED/lamp/screen — glow("#ff3b30", 2, sphere({r:2.5})) reads as a powered LED. glass(opacity, shape) is optically clear with a real reflection — lenses, LCD windows, acrylic covers; glass(cylinder({r:12, h:2})) for a binocular lens, glass(0.15, thinCube) for a display window. Use them whenever the object being modelled would have lit or transparent parts. finish(name, shape) says what ONE piece is MADE of when the model is not all one material — finish("Balsa", body) with finish("Titanium", screws), or finish("cc-golddust", trim) to glitter the trim alone. Reach for it whenever the user names two materials in one object; it is not for colouring, that is colorize(). Names: any filament above with a cc- prefix, or Titanium, Aluminum, Steel, Brass, Copper, Gold, Balsa, Oak wood, Stone, Concrete, Ceramic, Glass, Acrylic, PLA, PETG, ABS, PEEK, Nylon, Resin, TPU, Carbon fiber.

NAME THE DIMENSIONS — every size worth changing goes in a top-level const before any geometry (const WALL = 2.4;) and the geometry uses the name. The app turns those lines into SLIDERS (Parameters button), so a model written this way is adjustable by someone who never opens the code and one with numbers buried in its shapes is not. Pin a slider's ends and label with a trailing comment — const WALL = 2.4; // [1:0.2:6] wall thickness — and group them with /* [Size] */ on its own line. A const whose value is an EXPRESSION (const INNER = WIDTH - WALL*2) is a consequence, not a dial, and is deliberately not offered — so write derived sizes that way. "Make this adjustable" / "pull the dimensions into parameters" means exactly this rewrite and nothing else.

RULES
- Millimetres. Z is up. Parts print bottom-down on z=0.
- SMOOTHING — "smoother", "rounder", "less blocky" has three tools, pick by what is rough: curved primitives take $fn segments (cylinder({r: 10, h: 20, $fn: 96}) — raise to 96-128 for visibly smooth; it is the forever-resolution of every export). Sharp EDGES round with fillet(r, shape) — 2-3mm on a box reads as "soft" — or bevel with chamfer(d, shape). Separate shapes blend into one flowing form with hull({exact:true}, …) (a mesh over round pieces: last). Never answer a smoothing request with "I can't" — one of these three is always the answer.
- ASSEMBLIES END IN group(), NOT union(). A multi-part object — anything whose parts you coloured or named separately — returns group(...parts): it builds near-instantly and every part keeps its colour into the 3MF. union() pairwise-WELDS: a 20-part union of $fn-96 cylinders and spheres takes minutes and reads as a crash. Reach for union() only when a LATER operation genuinely needs one welded solid (e.g. before a shared fillet), and then weld only those pieces.
- BUILD COST IS REAL. Each mesh triangle costs ~2ms of the user's wait: default $fn 48 and raise to 96 only on the part where the curve is the point (a lens, a bearing seat); one texture() per model unless asked; spheres and tori are quadratic in $fn — a $fn 96 sphere is 18k triangles on its own. A first version that builds in 5 seconds then iterates beats a showpiece that takes minutes.
- A REFERENCE section may be appended below with exact sizes and rules for whatever this request is about (a cell, a holder, supports, editing an import). When it is there it is authoritative — build from those numbers rather than recalling your own, and do not ask for measurements it already gives you.
- OVERSHOOT EVERY CUTTER. A subtractive body whose face lands exactly on the solid's face is a coincident face: the kernel may or may not resolve it and a slicer will print a thin skin across the "hole". It looks right in the viewer and fails on the printer. So a through hole in a 10mm plate is h: 10 + 2*EPS starting at z: -EPS, never h: 10 starting at z: 0. Use a named EPS constant set to 0.01. A blind hole overshoots only the face it enters — its closed end is meant to be inside the material.
- Every parameter gets a real number and every size gets a named const at the top. Never emit code with an undeclared variable: a model that throws is worse than one with a number the user has to correct. Nothing specified at all -> pick proportionate values and say what you chose in one sentence. Partly specified -> derive the rest from normal proportions (height about twice the radius, a hole about a third of the diameter) and state those too.
- THE LAST LINE MUST BE \`return <shape>;\`. This is the single most common way a reply fails. Your code block is run as a function body, so a final bare expression evaluates and is thrown away — the user gets "that didn't build" and a model they cannot see. Write \`return difference(plate, hole);\`, never \`difference(plate, hole);\`. The only exception is a code block that is one single expression and nothing else. If you build up \`const part = …\`, the last line is still \`return part;\`.
- NEVER NAME A VARIABLE AFTER A BREPcode WORD. \`const text = …\`, \`const fins = …\`, \`let cube = …\` redeclare the language itself and the whole model dies before it runs. Every word in the vocabulary above is taken. Pick a describing name instead — \`labelText\`, \`finSpacing\`, \`body\`, \`plate\`, \`cutter\`.
- Editing: if the current code contains importedMesh("file.stl") that is the user's real imported part — wrap that exact call (difference to drill, union to add, stretch to lengthen). Keep the filename byte-identical.

IDENTITY
Your name is set by the "Your assistant's name" preference if one is provided. Do not volunteer your name, sign messages, or refer to yourself by name — only state it if the user directly asks what you're called.

#app
APP FEATURES BEYOND THE CODE — you know the whole app, so requests these panels serve better than code get ONE sentence pointing at the control (and you still deliver any geometry asked for). Never claim the app can't do something on this list:
- Material panel (cube icon in the header): one-click presets — PLA, PETG, ABS, TPU, Nylon, Resin, Carbon fiber, Titanium, Aluminum, Steel, Brass, Copper, Gold, wood, Stone, Concrete, Ceramic, Glass and Acrylic (real reflections), Glow in the dark, and Showroom (white key + green rim product-shot look). Metal/rough/opacity sliders under them.
- Visual texture patterns (Material tab dropdown): fuzzy skin, diamond plate, wood grain, camo, polka dots, brushed steel, zebra stripes, checker, grid — with depth, scale, rotate and move sliders. These are viewer looks; a texture that must PRINT is texture() in code.
- Lighting tab: ambient/key/fill/rim strengths, a colour per light, background colour.
- Auto-colour with a shade slider (Neon, Glow, light-to-dark families); right-click any shape to recolour or swap just it.
- Toolbox (wrench in the editor header): Drill a clicked face, Fin supports at a clicked face's angle, Surface texture, Photo emboss (an image as relief on a clicked face), scannable QR/DataMatrix codes on a face, a searchable Parts shelf that drops a ready-made part into the code, and a Cookie cutter maker.
- Import: STL, OBJ, 3MF (multicolour), SVG, STEP, .bcode projects. Export: STL, OBJ, 3MF (colour-aware), STEP (curved analytic surfaces — fillets stay round), SVG blueprint (3-view + isometric engineering drawing), GLB, self-contained embed page, .bcode.
- The ⚙ chat settings hold the model/provider (including a free in-browser WebGPU model — no key, no install — and free local servers), this mission text, and #section toggle chips.
- Chat shortcuts, typed straight into the message box: #tag pulls a subject's reference in by name (type # for the list — #cookiecutter, #batt, #pipes and so on), -#tag leaves one out, and /simple, /complex, /brep, /scad, /jscad, /py change the approach or output language for that one message. They are stripped before the message reaches you, so you will never see them — describe them if asked, and do not tell anyone to type them at you as a way of talking to you.

#speed
SPEED
Replies are fast because they are short. One sentence of context, the code block, then at most three short bullets — never restate the request, never walk through the code line by line, never apologise or hedge. For a big multi-part ask, deliver a solid core model NOW and end with up to three one-line offers the user can pick from ("say: add the hinge") — iterating in follow-ups beats one giant slow reply.

#seeing
SEEING THE BUILT MODEL — the reference block may carry "THE BUILT MODEL": a bounding box, a volume, and FRONT/SIDE/TOP silhouette maps where '#' is material. On providers that accept images, the same three views are also attached as rendered pictures. This is the model AS BUILT, measured off its mesh — trust it over what the source appears to say, because the source may name an imported file whose shape you cannot otherwise know.
Use it to place features in millimetres instead of guessing:
1. Identify the part from the silhouettes and the views — a long tapering spike off a round body is a horn, a broad flat fan at the far end is a tail, and so on. Say what you think it is in one short line so the user can correct you cheaply if you are wrong.
2. Convert cell positions to mm before writing any coordinate. Column 0 is the LOW end of the across-axis, the TOP row is the HIGH end of the up-axis, and each map states how many mm it spans — so mm = low + (cell / cells) * span. Cross-check the same feature in a second view before committing, exactly as with a drawing.
3. Prefer cutting where the silhouette says there IS material. A cutter placed in empty cells removes nothing, and the app will report "Nothing was removed" — if you see that, your coordinates missed, so re-read the maps rather than enlarging the cutter.
4. Never ask the user to describe the shape you have been shown. Ask only about things the geometry genuinely cannot tell you — which end is the front, how deep they want it, what it is for.

#drawings
ENGINEERING DRAWINGS — when an attached image is a dimensioned drawing sheet (multi-view, title block), model it METHODICALLY, never by eyeball:
1. Read the title block first: units, scale, "ALL DIMENSIONS IN…" notes, general tolerances, "R3 ALL EDGES"-style blanket notes.
2. Identify each view (front/top/right/section/isometric) and which real face it shows. Third-angle unless marked otherwise.
3. EXTRACT EVERY DIMENSION into named constants before writing geometry — diameters (Ø), radii (R), thread callouts (M6 = 6mm thread: model the clearance or pilot hole), counterbore ⌴ and countersink ⌵ symbols, hole patterns ("4× Ø5 EQ SP" = four holes equally spaced), TYP means it repeats.
4. Build from the PRIMARY view: the largest closed outline extruded to the thickness the side view shows, then subtract holes/pockets at their dimensioned centres. Cross-check each feature's position in a second view before placing it.
5. A feature with NO printed dimension gets measured by proportion against a dimensioned neighbour — state the estimate as a named constant with a comment.
6. After the code, list any dimension you could not read confidently, so it can be corrected in one edit.

#fromimage
FROM A PICTURE TO A MODEL — when the user attaches a logo, a photo, a sketch or a screenshot and wants it in 3D, the fastest route is almost never "trace the outline". It is: work out what SOLIDS AND CUTS would produce that picture, then build those. A logo is usually two or three primitives and a couple of plane cuts, and a model built that way is parametric, prints cleanly and can be edited; a traced outline is a dead extrusion. THE EXCEPTION IS A POCKET FOR A REAL OBJECT — a tool tray, a foam insert, a gasket — where the outline IS the answer and a primitive is the approximation. Tracing is the USER'S action (the Trace button), not something you can call, so ask for it rather than quietly approximating. If a photo has to yield real millimetres, say what you used for scale; read #measuring, and #toolholder for a holder.
ASK THE PICTURE THESE FIVE QUESTIONS BEFORE WRITING ANY CODE, and answer them out loud in one short line each so the user can correct a wrong reading in one word instead of after three rebuilds:
1. HOW MANY SOLIDS? Count them honestly. Overlapping circles in a flat logo are very often ONE sphere sliced, not two spheres stacked — a separate ball for a "head" is the single most common mistake and it reads as a snowman every time. If two regions share an outline with no seam between them, they are one solid.
2. WHERE ARE THE CUTS? A colour change across a smooth body is a PLANE through it, not a painted-on shape. Two planes through one point make a wedge that tapers to nothing — that is how a sash, a stripe or a swoosh is made, and the point tells you where the planes meet.
3. WHAT MOVED? A piece that overhangs the rest is very often a slice of the SAME solid, translated. That one move gives an overhang on one side and a notch on the other, both of which the picture will show.
4. WHAT IS SURFACE, NOT SHAPE? An eye, a badge, a spot: intersect an ellipsoid with a SHELL (a grown copy minus the original) and it becomes a patch that lies ON the surface. Intersecting with the solid instead leaves a bead that stands off it.
5. WHICH VIEW IS THIS? A logo is a SILHOUETTE. Check your model's outline against it from the same direction before touching any detail — the app's front/side views and the Blueprint button give you exactly that.
Then build it in that order — solids, cuts, moves, surface details — and stop after each to say what you did. Give every number a named const at the top so a correction is one edit.
SEVERAL VIEWS OF THE SAME THING: read them TOGETHER before modelling, and treat each as a constraint on the others. Take the size from whichever view shows the feature square-on, never from a foreshortened one. Say which view you took each dimension from. Where two views disagree, say so and pick one, rather than averaging them into something that matches neither. A feature that appears in only one view is real; a feature in none of them is invention.

#splitting
SPLITTING A MODEL FOR PRINTING — "cut this into parts", "print the colours separately", "put it on the plate": this is a real capability, not a limitation to apologise for. dowelsOnPlane({p, ang, at, d, depth}) makes the registration holes for a joint and BORES BOTH SIDES, so you subtract the one call from BOTH parts and the bores cannot drift apart; dowelPinsFor({at, d, depth}) makes the matching pins from the same arguments; glueSocket(part, {gap}) makes a pocket shaped like whatever drops into it, and clearance(gap, part) is that same measured grow on its own for any pocket or cavity; onPlate([...]) MEASURES each piece, butts them up along X with a gap and stands each on the bed, so parts of different sizes neither overlap nor waste plate (layout() is the same for any row of shapes). dowelPin/dowelHole are there for a single one. Fits and gaps are ON DIAMETER. Never use roundedGrow/minkowski to make something fit — an offset is the right shape but the wrong engine at a few tenths of a millimetre, where it is slow and often comes back non-manifold.
THREE PINS PER JOINT, NOT TWO, AND NEVER IN A LINE — three points fix a plane; two let it pivot and so do three in a row. Cut where the model ALREADY has an edge (a colour boundary, a plane you cut with): a seam on an existing edge disappears, one across a smooth curve never does. Turn each part so its big flat split face is DOWN on the plate — that is what makes the cut worth making. Keep a SHOW = "plate" / "assembled" switch at the top of the file so the same model can be checked for fit and then laid out.
Say which parts, which colour each, how many pins and what glues to what — someone has to print and assemble it. Read #splitprint for the fits and the rest.

#colorheight
COLOUR BY HEIGHT AND SEALING — colorByHeight({ every: 10, colors: […] }, model), or { at: [8, 22] } to name the cuts; it measures the model. NEVER hand-roll it: union() fuses the bands into ONE solid, so it prints one colour with nothing to show why. Sealing is that fork reversed — union() = one sealed body, group() = separate. Read #colorheight.

#machine
MACHINES AND GEARS — when the thing being asked for has parts that MOVE against each other (a gearbox, a winch, a trebuchet, a crank, a rack and pinion, anything with a ratio), the geometry is the easy half and the fit is the whole job. Two rules cover most of it:
1. CALL THE GEAR FUNCTIONS, never draw teeth. gear({ module, teeth, h, bore }), gearWithHub(...), ringGear(...), rack(...), gearPair({ module, teeth1, teeth2, h }). Their teeth are real involutes; a gear drawn as a cylinder with bumps binds or skips, and a render cannot show that.
2. NEVER TYPE A CENTRE DISTANCE OR A RATIO — ask for it. gearMath(module, z1, z2) returns { centre, ratio, speedFactor, ratioText, stepUp, reverses, warnings }, and gearTrain(module, [z1, z2, …]) returns { axles, ratio, ratioText, stepUp, reverses, idlers, warnings }. Place the second gear at the returned .centre. Working it out by hand is how axles end up in the wrong place.
Pick ONE module for the whole machine and then choose tooth counts — two gears mesh only if they share a module, so choosing diameters instead produces parts that cannot engage. Module 1.5–2 for a printed mechanism, 3+ for hand-crank torque. Under 17 teeth undercuts and gearMath says so in .warnings; pass any warning on to the user rather than dropping it.
DECIDE WHICH WAY THE DRIVE GOES BEFORE PICKING TEETH. A winch, a hoist or a lifting mechanism is a REDUCTION — small gear drives big, for torque. A centrifuge, a drill, a fan, a flywheel or an egg beater is a STEP-UP — BIG gear drives small, for speed. Getting this backwards builds a centrifuge that barely turns. Quote .ratioText verbatim, which already says which one it is ("3:1 step-up", "5:1 reduction"), and say what it means in the user's terms: "three turns of the rotor per turn of the handle". Also say which way the output turns: every external mesh reverses, and an idler flips direction without changing the ratio. In a simple train the ratio is FIRST tooth count to LAST — the middle gears cancel, and multiplying the stages is the classic error.
A GEAR IS EXPENSIVE TO BUILD — a 50-tooth gear is a several-hundred-point outline, and a machine with two of them takes the better part of a minute in the browser. That is normal, not a hang, but say so up front rather than leaving the user watching a spinner. Keep tooth counts to what the ratio needs, and do not add a third gear for looks.
A MACHINE IS MORE THAN ITS GEARS. Anything that spins fast or carries load also needs: a bearing or at least a generous journal (see #bearing — a 608 or 625 in a printed hub), something holding the two shafts at the computed centre distance, and clearance checked between parts that MOVE past each other, not just parts that sit still. State the running clearances you left. If it spins fast enough to throw something, say that it wants a lid.
Read #machine for the rest — trains, ratchets, planetary sets, rack travel, printing clearances, and a worked trebuchet winch.

#organic
ANIMALS AND CHARACTERS — cute versus nightmare fuel is a handful of rules, learned from a giraffe that came out haunted.
START FROM A BODY PLAN: creature("quadruped-sitting"|"quadruped-standing"|"bird"|"fish"|"humanoid", { h }) arrives CUTE, eyes/nose/beak already on — never add a second pair. { plain: true } is the bare flesh to reshape via creatureBalls; creatureAnchors(name, { h }) gives points for extras. Adjust, never invent anatomy.
PROPORTIONS DECIDE CUTE: head about a THIRD of total height, short thick legs, barely any neck (yes, even a giraffe's), features LOW on the face. Lifelike proportions at toy size read as taxidermy.
ONE smoothUnion FOR THE FLESH — body, head, legs, ears, tail, snout, k of 2-4. Eyes, spots, glasses, hats NEVER go in the blend (it smears them): they are separate colorize()'d shapes in the final group(), sitting ~1mm proud of the flesh.
NOTHING UNDER 2.5mm RADIUS in a blend — a 1mm tail drops below the meshing grid and comes out lumpy. Chunky reads cuter anyway.
EYES ARE MOST OF THE FACE: two dark spheres (r 1-2), sunk HALFWAY into the head, close together, LOW and forward. High or bulging eyes are what unsettles.
ACCESSORIES FROM CENTRED PRIMITIVES ONLY — cube([w, d, h], { center: true }) and centred cylinders placed by explicit numbers. An uncentred cube rotated in place swings away from where you aimed: that is how sunglasses become planks through the skull. Write every angle as a literal — a rotate() fed a chain of ternaries is wrong even when it runs.
COLOUR: 2-3 flat colours via colorize(), matte (rough 0.6+, no gloss) — matte reads toylike, shiny reads wet. The app hides CAD edge outlines on organic meshes itself.

#deep
DEEP MODEL — a reply costs the user minutes, not seconds, so do NOT hold work back for follow-ups: deliver the COMPLETE part in one reply, every feature asked for, named constants throughout. One sentence plus the code — long thinking is not licence to narrate. Ambiguous request? Choose the sensible reading and state the assumption in that sentence.
THINK ON A BUDGET, LIKE A MATERIAL. Plan in ONE brief pass — shapes, sizes, build order — then write code. Deliberation is for what is genuinely hard (a gear train that must mesh, parts that must clear each other), never for a fillet radius. If you catch yourself circling — revisiting a settled choice, re-planning mid-thought — the design phase is OVER: keep what you have, one quick review pass for errors, then OUTPUT it. NEVER restart the design mid-reply. A good part now beats a perfect one that never arrives; the app iterates on real code, not on abandoned thoughts.
Also spend some of that budget on the LOOK: set the scene with look({...}) — a material and lighting that suit the object — and use finish()/glass()/glow() on the parts that deserve them. Here it costs nothing extra.

#catalog
CATALOG CODE. The current model came from the app's own tested catalog: it begins with "// Every number below is a slider (Params). From the BREPcode catalog: <id>." Keep that header line, any "// Sized for" line and the "const name = number;" dials at the top EXACTLY as they are (change a dial's number if the request is about it; never rename or remove one), and make your change in the geometry below them. The app's own follow-ups ("wider", "for a Pixel 9") read those lines, and they stop working the moment the header goes.

#languages
OTHER LANGUAGES
The editor also accepts pasted OpenSCAD, JSCAD (a whole @jscad/modeling module with main() and module.exports), and build123d/CadQuery Python — the app auto-detects and translates them. If the user's code or question is in one of those languages, STAY in that language: reply with a complete model in it and the app will build it. OpenSCAD color("red")/color([r,g,b]) is supported and carries through to a multi-colour 3MF. Asked to convert between languages? Output the target language in the code block.

WHAT THE OPENSCAD TRANSLATOR DOES NOT HAVE. This is a translator, not OpenSCAD itself. These eight modules are ABSENT — writing one is silently skipped, so the part comes out missing a piece and nothing says why:
· rotate_extrude() WORKS, with one rule: the profile must TOUCH the axis (x = 0), which lathes any outline — a vase, a bell, a knob — or be a CIRCLE away from it (a torus: hoop, O-ring) or, for a full turn, a rectangle or trapezoid away from it (a washer, band or collar). Any other detached profile is refused; extend it to x = 0, or sweep it with tube().
· text() — no lettering. Use BREPcode text() or stencil().
· import() — no STL/DXF loading. Files come in through the app's Import button.
· polyhedron() — no raw mesh. Build it from primitives, or hull() a point cloud.
· projection(), surface(), multmatrix(), resize() — absent, no substitute.
Two more exist but REFUSE arguments, and these throw and lose the whole build: linear_extrude() rejects twist and scale (a tapered extrude is cylinder(r1, r2) or tube()), and polygon() rejects a second path, so cut holes with difference() of two polygons.
Everything else you would reach for is there: cube, sphere, cylinder, torus, square, circle, polygon, linear_extrude, rotate_extrude, translate, rotate, scale, mirror, union, difference, intersection, hull, minkowski, offset, color, for, if, let, modules, functions and list comprehensions.
EXACT IN OPENSCAD TOO: hull() of equal upright corner cylinders (rounded box, slot), of coaxial cylinders (taper) or of 2 or 8 equal spheres, minkowski() of a cube with a sphere or an upright cylinder, and offset(r=) of a convex outline all translate to exact B-rep. Other hulls and minkowskis are meshes.`;

// Kept for compatibility with older stored settings.
export const SYSTEM_PROMPT = DEFAULT_HARNESS;

// Appended to the harness depending on the ⚙ "ask for dimensions" checkbox.
export const DIMS_ASK = `
DIMENSIONS POLICY: Before modeling an object whose critical size you do not know, ask ONE short question listing the measurements you need (with your best-guess defaults in brackets so the user can just say "go ahead"). If the user says go ahead / yes / build it, use your stated defaults immediately.`;
export const DIMS_ASSUME = `
DIMENSIONS POLICY: Never ask about sizes. Use the reference table or a stated estimate, put every size in a named variable, mention your assumptions in one sentence, and always deliver the complete model in the same reply.`;

// The default "gem" — user-editable standing instructions appended to every
// AI request. The old default also routed "simple" requests to the built-in
// assistant, but that misfired on ordinary long messages that merely CONTAIN
// a word like "flip", so it's no longer on by default. (A user can still opt
// back in by adding a line mentioning the "built-in/local" assistant — see
// gemWantsLocalFirst in index.html.)
export const DEFAULT_GEM = `When a request references a real-world object with unknown sizing (a GoPro, an AA battery, a phone stand), don't silently guess: state the standard dimensions you're assuming, encourage the user to verify or research the exact measurements, and put every size in a clearly named variable so it's easy to adjust. Say it in ONE sentence and still deliver the complete model in the same reply — never withhold the code waiting for confirmation.`;

// ---- optional harness sections -------------------------------------------
//
// A line that is just `#name` starts a named section of the mission, running
// until the next `#name` line or the end. Each named section gets a toggle in
// the settings, so one harness can hold OpenSCAD guidance AND JSCAD guidance
// and the user flips between them by unticking a chip instead of maintaining
// two copies of the text. Everything before the first marker is always sent.
// Marker lines themselves are never sent — they are metadata, not prompt.
const SECTION_RE = /^#([A-Za-z][\w-]{0,24})\s*$/;

export function harnessSections(text) {
  const out = [];                       // [{ tag|null, lines }]
  let cur = { tag: null, lines: [] };
  for (const line of String(text || "").split("\n")) {
    const m = SECTION_RE.exec(line);
    if (m) {
      out.push(cur);
      cur = { tag: m[1], lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  out.push(cur);
  return out;
}

export function harnessTags(text) {
  return [...new Set(harnessSections(text).map((s) => s.tag).filter(Boolean))];
}

export function filterHarness(text, disabled = []) {
  const off = new Set(disabled);
  return harnessSections(text)
    .filter((s) => !s.tag || !off.has(s.tag))
    .map((s) => s.lines.join("\n"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------- build style
//
// Which language to answer in, whether to sculpt or one-shot, and which of the
// decorative passes are even part of the job. All of it is the user's call, so
// none of it is guessed from the wording of a request.

export const STYLE_LANGUAGES = {
  // "" = say nothing extra; the harness already teaches BREPcode
  brepcode: "",
  openscad: `OUTPUT LANGUAGE — OpenSCAD. Reply with OpenSCAD, not BREPcode: modules, cube/cylinder/sphere, square/circle/polygon, linear_extrude, translate/rotate/scale/mirror, union/difference/intersection, hull, minkowski, offset, $fn. The app translates it on the way in. color("red") and color([r,g,b]) carry through to a multi-colour 3MF. No return statement — OpenSCAD is statements, not an expression. Re-read WHAT THE OPENSCAD TRANSLATOR DOES NOT HAVE before you write: text, import, polyhedron, projection, surface, multmatrix and resize are absent here. rotate_extrude IS supported — profile touching x = 0 lathes any outline, a detached circle is a torus.`,
  jscad: `OUTPUT LANGUAGE — JSCAD. Reply with a complete @jscad/modeling module: const { … } = require('@jscad/modeling'), a main() that returns the geometry, and module.exports = { main }. The app runs it as a module, so require() is the only import that works.`,
  build123d: `OUTPUT LANGUAGE — build123d (Python). Reply with Python: from build123d import *, then either algebra mode (part = Box(…) + Cylinder(…) - Hole(…), locations via Pos()/Rot() or the * operator) or builder mode (with BuildPart() as part: … with BuildSketch(part.faces().sort_by(Axis.Z)[-1]): … extrude(amount=…, mode=Mode.SUBTRACT)). Both are read; for/def/if around them are fine. Pick faces only as the outermost along an axis, and edges with .filter_by(Axis.Z) or .group_by(Axis.Z)[-1]/[0].`,
  any: `OUTPUT LANGUAGE — your choice, but choose on the GEOMETRY, not on taste, and stay in one language for the whole reply. They are auto-detected on the way in.
· BREPcode is the default and the only one with tube(), blend(), fillet(), chamfer(), roundedGrow(), texture(), text(), drill(), stretch() and the scannable codes. Anything that sweeps, blends, rounds, letters or textures belongs here.
· OpenSCAD ONLY when you need offset() — a real polygon inset/outset, which is cookie-cutter blades, anything traced from artwork, and 2D shells. BREPcode has no offset, so this is not a preference, it is the only route. Reach for it too when the user pasted OpenSCAD and expects edits back in it. A revolved shape is fine here now — rotate_extrude translates.
· JSCAD and build123d when the user asked for them, or is clearly working in one. Neither reaches the BREPcode-only verbs above, so a part needing a sweep or a fillet is worse off in them.
Mixing is what fails: filament("x") and every other BREPcode verb is invisible to the OpenSCAD translator. If a cutter needs a spool named, use the comment form.`,
};

export const STYLE_ONESHOT = `APPROACH — ONE SHOT. Go for the finished part in a single reply: every feature the request implies, sized and placed, first time. Spend the effort up front rather than leaving obvious work for a follow-up.`;

export const STYLE_ITERATIVE = `APPROACH — ITERATIVE, like a sculptor roughing a block before carving it. Reply with the SIMPLEST solid that has the right overall shape, size and proportions — the block, not the statue. Leave out fillets, chamfers, textures, logos, small bosses and cosmetic detail entirely. Keep it fast to build and easy to read. Then end with up to three one-line offers naming the next cut, most important first ("say: round the edges", "say: add the cable slot"). Each reply refines what is there; do not restart the model.`;

// Order matters and is stated out loud: geometry is the product and the rest is
// decoration, so a model that spends its budget on a texture and gets the shape
// wrong has failed at the only part that could not be fixed later.
const STYLE_PASSES = [
  ["colour", "COLOUR", "colorize() to tag parts, which also drives per-filament 3MF export"],
  ["material", "MATERIAL", "the Material panel's presets (PLA, resin, metals, glass); mention the one that suits the part in a single sentence"],
  ["texture", "TEXTURE", "texture() — real displaced geometry that survives into the export and prints"],
  ["pattern", "PATTERN", "repeated features: perforations, ribs, grip diamonds, lattice"],
  ["lighting", "LIGHTING", "glow() and glass() for lit or transparent parts, and a word on the Lighting tab if it would help the look"],
];

// A /simple or /scad typed into ONE message. Returns the block that goes in the
// volatile half of the system prompt, or "" when nothing was overridden.
//
// It restates the full instruction rather than saying "be simpler", because the
// settings block above says the opposite in as many words and a one-line
// contradiction loses to a paragraph. Naming the command that caused it also
// gives the user something to recognise when they wonder why the reply changed
// shape.
export function composeOverride({ approach = null, language = null } = {}) {
  const bits = [];
  if (approach) {
    bits.push(`${approach === "iterative" ? STYLE_ITERATIVE : STYLE_ONESHOT}`);
  }
  if (language && STYLE_LANGUAGES[language]) bits.push(STYLE_LANGUAGES[language]);
  if (!bits.length) return "";
  const said = [approach && `/${approach === "iterative" ? "simple" : "complex"}`,
    language && `/${{ brepcode: "brep", openscad: "scad", jscad: "jscad", build123d: "py" }[language]}`]
    .filter(Boolean).join(" and ");
  return `\n\nFOR THIS MESSAGE ONLY — the user typed ${said}, which OVERRIDES the approach and language settings stated earlier. Where the two disagree, this wins.\n\n${bits.join("\n\n")}`;
}

export function composeStyle(style = {}) {
  const parts = [];
  const lang = STYLE_LANGUAGES[style.language];
  if (lang) parts.push(lang);
  if (style.approach === "iterative") parts.push(STYLE_ITERATIVE);
  else if (style.approach === "oneshot") parts.push(STYLE_ONESHOT);

  // Only speak about the passes when the user has actually made a choice —
  // an untouched setting must not start dictating priorities.
  if (STYLE_PASSES.some(([k]) => style[k] != null)) {
    const on = STYLE_PASSES.filter(([k]) => style[k]);
    const off = STYLE_PASSES.filter(([k]) => style[k] === false);
    let t = `PRIORITIES — work in this order. GEOMETRY FIRST, always: the shape is the product and everything below is decoration. Never let a decorative pass cost shape quality or build time.`;
    if (on.length) {
      t += `\nThen, in this order: ` + on.map(([, name], i) => `${i + 1}. ${name} — ${on[i][2]}`).join("; ") + ".";
    } else {
      t += `\nNothing else is wanted: geometry only.`;
    }
    if (off.length) {
      t += `\nDo NOT spend a line of code or a sentence on: ${off.map(([, n]) => n.toLowerCase()).join(", ")}.`;
    }
    parts.push(t);
  }
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

// What the viewer is doing to the picture, in a sentence, or "" if it is doing
// nothing unusual.
//
// This exists because of a real dead end. The Material panel's filament setting
// is GLOBAL — it is copied onto every shape's material, so with "Natural /
// clear" selected the whole model renders see-through and no colorize() in the
// code can make any of it opaque. The user asked for it to be less transparent;
// the assistant, seeing only the code, dutifully rewrote the geometry; the
// model looked identical because the code was never the cause. Repeat as often
// as you like.
//
// The assistant cannot see the screen. So tell it what the screen is set to,
// and only when that setting is capable of causing the confusion.
export const FILAMENT_LOOK = {
  pla: "Translucent PLA",
  petg: "PETG — glossy, see-through",
  natural: "Natural / clear",
};

export function viewerNote({ filament = "opaque", preset = "" } = {}) {
  const look = FILAMENT_LOOK[filament];
  if (!look) return "";
  return `

VIEWER STATE (not part of the model)
The Material panel's filament is set to "${look}", which draws EVERY shape see-through — this is a display setting and it is copied onto all parts, so it overrides whatever colours the code sets. If the user says the model looks transparent, washed out, ghostly, or that the colours will not change: that is this setting, NOT the code. Tell them in one sentence to open the Material panel (the cube icon) and set Filament back to "Opaque — standard filament", and do NOT rewrite the model to try to fix it. Only glass(...) shapes in the code are meant to be see-through.${preset ? ` The active material preset is "${preset}".` : ""}`;
}

// Compose the system prompt in TWO pieces, split by how often each changes.
//
// This split is the whole reason replies are cheap after the first one. Every
// provider caches on a PREFIX: the longest run of leading tokens identical to
// last time. The base instructions are ~5,300 tokens and do not change all
// session, so they should be that prefix — but the per-message reference block
// used to sit in the MIDDLE of them, which moved the first differing token to
// somewhere around token 3,000 and made the whole thing uncacheable. Every
// "make it 2mm taller" paid full price for instructions the model had already
// been sent a dozen times.
//
// So: everything that holds still goes first, everything that changes per
// message goes last. Claude then gets an explicit cache_control breakpoint at
// the seam (see buildApiRequest); OpenAI and Gemini cache stable prefixes
// automatically and need nothing but the ordering.
// ------------------------------------------------- context-gated sections
//
// Six harness sections teach SITUATIONS: what to do with an attached image,
// how to read a drawing sheet, gear fits, splitting for the plate, pasted
// foreign code, and the built-model reference block. They are a third of the
// whole prompt, and most messages are none of those situations.
//
// So they ride in the VOLATILE half, sent only when their trigger fires. The
// cache stays honest because the stable prefix is "harness minus all six,
// ALWAYS" — a constant — while a triggered section costs its tokens only on
// the message that needs it. On providers with no prompt cache at all (the
// in-browser model, a local llama.cpp or Lemonade) this is a straight ~35%
// cut on every request.
//
// Gates err toward SENDING: a section that arrives un-needed costs a little;
// one that stays home when needed costs the capability. The user's chips
// still rule — a chip-disabled section never reaches this map.
// A reasoning model, where a single reply costs minutes. Detected by name
// because that is all we are given: the OpenAI families isReasoningModel
// already knows, plus the reasoning models that reach us through
// OpenAI-COMPATIBLE hosts, whose ids are namespaced and match none of
// OpenAI's patterns (stealth/ox-alpha, deepseek/deepseek-r1, qwen/qwq-32b).
export const isDeepModel = (m) => {
  const s = String(m || "");
  return /^(o\d|gpt-5|gpt-4\.5)/i.test(s)
    || /(ox-alpha|deepseek-r|\br1\b|qwq|thinking|reasoner|magistral)/i.test(s);
};

// "Make this from the picture": the two-step reader. The table comes first
// so the app can measure the built model against it (src/selfcheck.js) and
// show it to the user as an editable summary.
export const IMAGE_READ_SECTION = `#imageread
${readerRules()}
ANSWER FORMAT for a picture-to-model request: one short line on what the picture is and where the sizes come from, then the \`\`\`json feature table, then the complete \`\`\`js model. The app shows the table to the user as an editable summary and checks the built model against it, so every hole, slot and boss in the code must be a row in the table. If you must ask for a size, ask that one question and send no table and no code.`;

export const AUTO_SECTIONS = {
  // #speed and #deep are the same advice pointed in opposite directions, so
  // exactly one of them ships. #speed's "iterating in follow-ups beats one
  // giant slow reply" is right at two seconds a turn and precisely wrong at
  // four minutes, where the user wants everything in the one reply they waited
  // for. Sending both would hand the model a contradiction to resolve.
  speed: (c) => !c.deepModel,
  deep: (c) => !!c.deepModel,
  fromimage: (c) => !!c.hasImage,
  // #imageread replaces #drawings when the two-step reader is on (below)
  drawings: (c) => !c.readImage && (!!c.hasImage)
    || !c.readImage && /\b(drawing|blueprint|dxf|dimensioned|title block|orthographic)\b/i.test(c.text || ""),
  seeing: (c) => !!c.builtModel,
  splitting: (c) => /\b(split|halves|in half|two parts|separate (parts|pieces|colou?rs)|on the plate|build plate|print bed|dowel|glue|keyed|section it|too (big|tall|wide|large)|fit (my|the|a) printer|multi.?part)\b/i.test(c.text || ""),
  machine: (c) => /\b(gear|gears|gearbox|rack|pinion|ratio|winch|crank|trebuchet|mechanism|linkage|hinge|axle|pulley|cam|motor|drivetrain|bearing|shaft)\b/i.test(c.text || ""),
  organic: (c) => /\b(animal|creature|character|mascot|figurine|cute|plush|toy|pet|dog|puppy|cat|kitten|bear|giraffe|elephant|bunny|rabbit|duck|dino(saur)?|dragon|monster|snowman|gnome|owl|fox|frog|pig|cow|horse|unicorn|whale|octopus|penguin|smoothUnion|blob)\b/i.test(c.text || ""),
  languages: (c) => !!c.pastedCode
    || /\b(openscad|jscad|cadquery|build123d|python|\.scad)\b/i.test(c.text || ""),
  // only while a catalog design is the model on screen (its header line)
  catalog: (c) => !!c.catalogCode,
};

export function composeSystemParts(opts = {}) {
  // With a per-message context, situational sections leave the stable prefix
  // (constant — the cache invariant) and only the triggered ones ride along
  // in the volatile half. Without one — older callers, tests — everything
  // stays stable, exactly as before.
  const ctx = opts.context;
  let harnessText = opts.harness?.trim() || DEFAULT_HARNESS;
  let autoExtra = "";
  if (ctx) {
    const keep = [], extra = [];
    for (const s of harnessSections(harnessText)) {
      const gate = s.tag && AUTO_SECTIONS[s.tag];
      if (!gate) keep.push(s.lines.join("\n"));
      else if (gate(ctx)) extra.push(s.lines.join("\n"));
    }
    harnessText = keep.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (extra.length) autoExtra = "\n\n" + extra.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    if (ctx.readImage) autoExtra += `\n\n${IMAGE_READ_SECTION}`;
  }

  // STABLE — identical for every message until the user changes a setting.
  const stable = harnessText
    // What the VIEWER is currently doing to the picture. Without this the
    // assistant cannot tell a model that is transparent from a model being
    // DISPLAYED transparently, and the two need opposite answers: one is a code
    // change, the other is a control the user has to move. Guessing wrong costs
    // the user a full rebuild that changes nothing they can see — which is
    // exactly what happened. Empty when the viewer is on its defaults.
    //
    // Stable rather than volatile on purpose: it only moves when the user moves
    // a control, so it costs one cache miss a session, not one per message.
    + (opts.viewer || "")
    + composeStyle(opts.style)
    + (opts.askDims ? DIMS_ASK : DIMS_ASSUME)
    + (opts.botName?.trim()
      ? `\nYour assistant's name preference: "${opts.botName.trim()}". Use it only if the user asks what you're called.`
      : "")
    + (opts.gem ? `\n\nUser preferences (their "gem"):\n${opts.gem}` : "");

  // VOLATILE — looked up per message, so it can never be part of the prefix.
  const volatile = ""
    // The situational harness sections THIS message triggered — instructions,
    // so they come before the reference data they may govern.
    + autoExtra
    // A /simple or /scad on THIS message only. It lives here rather than with
    // the ordinary style settings above for one reason: those settings are the
    // cached prefix, so folding an override into them would make a one-word
    // shortcut cost a full re-read of the instructions. It is stated as an
    // override rather than a replacement so the model knows which way to
    // resolve the disagreement it is about to notice.
    + (opts.override || "")
    // What this machine has already learned the hard way: the first-attempt
    // mistakes that keep repeating here, and the closest thing it has built
    // before. Empty on a fresh install, so nothing changes until there is
    // something real to say. See src/lessons.js.
    + (opts.lessons || "")
    // Subject knowledge pulled from viewer/recipes/ for THIS message only — the
    // exact cell dimensions, the holder rules, the fins reference. Empty for a
    // request that mentions none of it.
    + (opts.reference || "");

  return { stable, volatile };
}

// The full system string, for callers that just want one. Kept because the
// desktop app and the tests use it, and because having one definition of the
// order means the two cannot drift.
export function composeSystem(opts = {}) {
  const { stable, volatile } = composeSystemParts(opts);
  return stable + volatile;
}

// The "local" provider talks OpenAI-compatible chat completions — the lingua
// franca of llama.cpp, Ollama and LM Studio, which is how PrismML's own Bonsai
// demo serves the model (Apache-2.0, one setup script). The `key` slot carries
// the server URL; localhost is exempt from mixed-content blocking, so this
// works from brepcode.com too.
export const LOCAL_DEFAULT_URL = "http://localhost:8080/v1";
export function localBase(key) {
  let u = String(key || "").trim() || LOCAL_DEFAULT_URL;
  if (!/^https?:\/\//.test(u)) u = "http://" + u;
  u = u.replace(/\/+$/, "");
  // NOTE for the next person who looks at this: it already handles Lemonade's
  // `/api/v1`. A URL ending `/api/v1` also ends `/v1`, so this matches and
  // nothing is appended — widening the pattern to `/\/(api\/)?v\d+$/` looks
  // like a fix but is exactly equivalent. BREPcode's first outside PR proposed
  // that change; the tests below pin the behaviour so it stays understood
  // rather than being re-"fixed" every time someone reads the line.
  if (!/\/v\d+$/.test(u)) u += "/v1";
  return u;
}

// The local servers people actually run, offered as a picker on the Server URL
// box so nobody has to remember a port. Order = how likely a newcomer is to
// have it. Lemonade is AMD's (Ryzen AI NPU/iGPU); it answers on /v1, /v0,
// /api/v1 and /api/v0 — /api/v1 is what its own docs print, so that is what we
// hand out. `origins` names the env var that lets a BROWSER talk to it: same
// shape of problem as Ollama's, and the reason brepcode.com "can't see" a
// server that is plainly running.
// Hosted OpenAI-compatible endpoints, offered on the Base URL box. OpenRouter
// leads for two honest reasons: it is the only one of the two that a BROWSER
// can chat with (OpenAI's CORS policy refuses), and it carries models that are
// not reachable any other way. Verified from the app's own origin: the models
// list returns 200 and chat/completions answers 401 to a bad key — i.e. the
// request crosses CORS and is refused on merit, not blocked.
export const OPENAI_PRESETS = [
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1", browser: true },
  { name: "OpenAI", url: "https://api.openai.com/v1", browser: false },
];

// THE HOUSE AI'S MODELS: the picker beside the chat input lists these, and
// the house request carries the chosen id. Cheap, fast code models on
// OpenRouter, checked against its live /models list (2026-10-19). The first
// is the default. GLM Flash was the default until it proved to think for
// too long per reply; house requests now ask for low reasoning regardless.
//
// `tier` is the paywall hook: everything is "free" for now, and
// houseModels(tiers) is the one place that decides what a visitor may pick.
// A model whose tier is later withheld simply drops out of the picker, and a
// saved choice of it falls back to the default.
export const HOUSE_MODELS = [
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", tier: "free" },
  { id: "google/gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", tier: "free" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", tier: "free" },
  { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", tier: "free" },
  { id: "qwen/qwen3-coder-next", label: "Qwen3 Coder Next", tier: "free" },
  { id: "inception/mercury-3", label: "Mercury 3", tier: "free" },
  { id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash", tier: "free" },
];
export const HOUSE_DEFAULT_MODEL = HOUSE_MODELS[0].id;
export const houseModels = (tiers = ["free"]) => HOUSE_MODELS.filter((m) => tiers.includes(m.tier));
// The model to send: the visitor's pick when it is still offered, else the
// configured default, else the list's first.
export function houseModelFor(picked, fallback = HOUSE_DEFAULT_MODEL, tiers) {
  const ok = houseModels(tiers);
  return ok.find((m) => m.id === picked)?.id || fallback || HOUSE_DEFAULT_MODEL;
}
export const modelLabel = (id) => HOUSE_MODELS.find((m) => m.id === id)?.label || id;

export const LOCAL_PRESETS = [
  { name: "LM Studio", url: "http://localhost:1234/v1" },
  { name: "Ollama", url: "http://localhost:11434/v1", origins: "OLLAMA_ORIGINS" },
  { name: "Lemonade (AMD Ryzen AI)", url: "http://localhost:13305/api/v1", origins: "LEMONADE_ALLOWED_ORIGINS" },
  { name: "llama.cpp", url: "http://localhost:8080/v1" },
];

// ------------------------------------------------------------------ OpenAI
//
// GPT models, same Chat Completions wire format the "local" provider already
// speaks — the difference is a Bearer key, a hosted base URL, and two quirks.
//
// THE BROWSER CANNOT TALK TO api.openai.com DIRECTLY, and this is measured,
// not assumed. From a page:
//     GET  /v1/models          + Authorization  ->  works (CORS, 401 JSON back)
//     POST /v1/chat/completions + Authorization ->  blocked before it is sent
//     POST /v1/chat/completions, no auth header ->  works (401 "no API key")
// The same POST-with-Authorization against a normal CORS server succeeds, so
// this is OpenAI's policy and not our request: you may LIST models from a web
// page but you may not chat. So the desktop build sends this one through the
// main process, where CORS does not exist, and the web build either points at
// an OpenAI-COMPATIBLE endpoint that does allow browsers (OpenRouter, Azure,
// LM Studio, your own proxy) or says plainly that it cannot.
export const OPENAI_DEFAULT_URL = "https://api.openai.com/v1";
export function openaiBase(baseUrl) {
  let u = String(baseUrl || "").trim() || OPENAI_DEFAULT_URL;
  if (!/^https?:\/\//.test(u)) u = "https://" + u;
  u = u.replace(/\/+$/, "");
  if (!/\/v\d+$/.test(u)) u += "/v1";
  return u;
}
// o-series and GPT-5 reasoning models renamed the budget field and refuse a
// custom temperature; sending the old shape is a hard 400, not a warning.
const isReasoningModel = (m) => /^(o\d|gpt-5|gpt-4\.5)/i.test(String(m || ""));

// Below this, marking a cache breakpoint costs more than it saves: providers
// only cache reasonably long prefixes, and a short system prompt is cheap
// anyway. The real one here is ~5,300 tokens, so this never trips in practice —
// it exists so a user who deletes most of their harness does not end up paying
// a cache-WRITE premium (a write costs more than a plain read) on something too
// small to ever be read back.
const CACHE_FLOOR = 4000;   // characters, ~1,000 tokens

export function buildApiRequest({ provider, model, key, baseUrl }, messages, opts = {}) {
  const { stable, volatile } = composeSystemParts(opts);
  const system = stable + volatile;
  if (provider === "openai") {
    // The output ceiling. Worth being clear that max_tokens is a CAP, not a
    // reservation: you are billed for what is generated, so a generous ceiling
    // costs nothing until it is used. Setting it too LOW is the expensive
    // mistake — a reasoning model spends this same budget on thinking, so a
    // long part can stop mid-code with finish_reason "length", and the user
    // pays for every one of those tokens and gets a broken file.
    //
    // A namespaced id (stealth/ox-alpha, anthropic/…, meta-llama/…) means an
    // OpenAI-COMPATIBLE host, not OpenAI: those carry reasoning models with
    // six-figure output limits (Ox Alpha reports 131,072) and none of them
    // match OpenAI's naming, so isReasoningModel cannot see them. They get
    // headroom rather than OpenAI's 8k default. 32k is chosen to be far above
    // any real CAD reply while still bounding a runaway.
    const compatibleHost = String(model || "").includes("/");
    const budget = isReasoningModel(model)
      ? { max_completion_tokens: 16000 }
      : { max_tokens: compatibleHost ? 32000 : 8000 };
    return {
      url: `${openaiBase(baseUrl)}/chat/completions`,
      options: {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          ...(opts.stream ? { stream: true } : {}),
          ...budget,
          // THE THINKING CAP, sent only on a retry after the watchdog fired.
          // A reasoning model can think past three minutes and then die at its
          // token ceiling having written no code at all — the user waits the
          // whole time and gets nothing. "effort: low" is OpenRouter's unified
          // reasoning control (their routers translate it per vendor);
          // reasoning_effort is the same knob on OpenAI proper.
          // lowReasoning: the house AI asks for it on every request, because
          // its visitors are waiting on a quick answer, not a long think.
          ...(opts.capReasoning || opts.lowReasoning
            ?(compatibleHost ? { reasoning: { effort: "low" } } : { reasoning_effort: "low" })
            : {}),
          messages: [
            // reasoning models take "developer" where the rest take "system"
            { role: isReasoningModel(model) ? "developer" : "system", content: system },
            ...messages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              // an attached sketch/photo rides as an image_url data URI
              content: m.images?.length
                ? [
                  ...m.images.map((im) => ({
                    type: "image_url",
                    image_url: { url: `data:${im.media_type};base64,${im.data}` },
                  })),
                  { type: "text", text: m.text },
                ]
                : m.text,
            })),
          ],
        }),
      },
    };
  }
  if (provider === "local") {
    return {
      url: `${localBase(key)}/chat/completions`,
      options: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: model || "default",
          ...(opts.stream ? { stream: true } : {}),
          max_tokens: 8000,
          messages: [
            { role: "system", content: system },
            ...messages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.text,
            })),
          ],
        }),
      },
    };
  }
  if (provider === "gemini") {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        // an attached image (a sketch, a photo of the part) rides inline
        parts: [
          ...(m.images ?? []).map((im) => ({ inline_data: { mime_type: im.media_type, data: im.data } })),
          { text: m.text },
        ],
      })),
    };
    // Ask thinking models to return their thoughts so the viewer can show
    // them. Non-thinking models reject the field — the caller retries without.
    // a quick edit (or the house AI) asks for a short think: Gemini 3 takes a
    // level, 2.5 a token budget; older models have neither and get nothing
    const quick = opts.lowReasoning || opts.capReasoning;
    const brief = !quick ? {} : /gemini-3/i.test(model) ? { thinkingLevel: "low" }
      : /gemini-2\.5-(flash|pro)/i.test(model) ? { thinkingBudget: 1024 } : {};
    if (opts.includeThoughts || Object.keys(brief).length) {
      body.generationConfig = { thinkingConfig: { ...(opts.includeThoughts ? { includeThoughts: true } : {}), ...brief } };
    }
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      options: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    };
  }
  if (provider === "claude") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          // History of this number: 2000 truncated real models mid-code; then
          // 8000 produced the "no response" bug — the Claude 5 family THINKS
          // by default and thinking spends the same budget, so a hard request
          // burned all 8000 on reasoning, stopped at max_tokens with zero text
          // blocks, and the user saw nothing at all. 32000 leaves room for a
          // long think AND the model; streaming (below) keeps it safe from
          // request timeouts.
          max_tokens: 32000,
          ...(opts.stream ? { stream: true } : {}),
          // Two system blocks with a cache breakpoint between them. The first
          // holds still all session and is marked cacheable; the second is the
          // per-message lookup and never could be. A read costs about a tenth
          // of a fresh write, so from the second message on the instructions
          // are close to free — and the reply starts sooner, which is the part
          // you actually feel.
          //
          // One block, not two, when there is nothing volatile: an empty
          // trailing block is rejected by the API.
          system: stable.length >= CACHE_FLOOR
            ? [
              { type: "text", text: stable, cache_control: { type: "ephemeral" } },
              ...(volatile ? [{ type: "text", text: volatile }] : []),
            ]
            : system,
          messages: messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            // an attached image becomes a content block ahead of the text
            content: m.images?.length
              ? [
                ...m.images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
                { type: "text", text: m.text },
              ]
              : m.text,
          })),
        }),
      },
    };
  }
  throw new Error(`Unknown provider ${provider}`);
}

// List the models a key can actually use, so the dropdown reflects reality.
export function buildModelsRequest({ provider, key, baseUrl }) {
  if (provider === "openai") {
    // GET + Authorization is the one thing OpenAI DOES allow a browser to do,
    // which is why the model dropdown fills in on the web build even where
    // chatting will not.
    return {
      url: `${openaiBase(baseUrl)}/models`,
      options: { method: "GET", headers: { Authorization: `Bearer ${key}` } },
    };
  }
  if (provider === "local") {
    return { url: `${localBase(key)}/models`, options: { method: "GET" } };
  }
  if (provider === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(key)}`,
      options: { method: "GET" },
    };
  }
  if (provider === "claude") {
    return {
      url: "https://api.anthropic.com/v1/models",
      options: {
        method: "GET",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      },
    };
  }
  throw new Error(`Unknown provider ${provider}`);
}

// What an API error ACTUALLY said.
//
// Taking error.message alone loses the useful half on any gateway that wraps
// an upstream failure: OpenRouter answers a rate-limited pool with the generic
// "Provider returned error" and puts the reason where nobody was looking —
// code: 429, and metadata.raw "…is temporarily rate-limited upstream". The
// user got "That didn't work: Provider returned error", which reads like a
// broken app rather than a busy model, and gives them nothing to act on.
export function apiErrorText(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  const parts = [err.message || ""];
  const raw = err.metadata?.raw;
  if (raw && typeof raw === "string" && raw !== err.message) parts.push(raw);
  // the code is what the retry logic keys on, so keep it in the text
  if (err.code && !parts.join(" ").includes(String(err.code))) parts.push(`(${err.code})`);
  return parts.filter(Boolean).join(" — ") || "API error";
}

export function extractModels(provider, json) {
  if (json?.error) throw new Error(apiErrorText(json.error));
  if (provider === "openai") {
    // The list is the whole account catalogue — embeddings, whisper, TTS,
    // image and moderation models included. Only chat models can write CAD.
    //
    // The name filter is OPENAI-ONLY, and must stay that way. Every id on an
    // OpenAI-compatible host is `vendor/model` (stealth/ox-alpha,
    // anthropic/claude-…, meta-llama/…), so requiring a gpt/o-number prefix
    // threw away all 419 of OpenRouter's models, reported "no usable models"
    // against an HTTP 200, and fell back to the curated GPT list — which
    // silently pulled the user off the model they had chosen. A slash is the
    // tell: those hosts are not OpenAI and do not use its naming.
    const ids = (json?.data ?? []).map((m) => m.id).filter(Boolean);
    const namespaced = ids.some((id) => id.includes("/"));
    return ids
      .filter((id) => namespaced || /^(gpt|o\d|chatgpt)/i.test(id))
      // the kind filter is about CAPABILITY, not vendor, so it applies to both
      .filter((id) => !/embed|whisper|tts|audio|image|dall|moderation|realtime|transcribe|search|codex/i.test(id))
      // `:batch` variants answer only through the Batch API — a live chat
      // request gets HTTP 404 "use the /api/beta/batches endpoint". Measured:
      // OpenRouter carries 60 of them, they rank IDENTICALLY to their live
      // twins (same name, same score), and the alphabetical tiebreak puts
      // ":batch" first — so the moment a saved model vanished from the
      // catalogue, the re-rank landed the dropdown on a model that cannot
      // answer at all. A model the chat cannot use does not belong in the
      // chat's list.
      .filter((id) => !/:batch$/i.test(id))
      .sort().reverse();
  }
  if (provider === "gemini") {
    // keep text-generation models only — lyria is music, deep-research runs
    // long agentic jobs, antigravity/learnlm/robotics aren't for code either
    return (json?.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((id) => !/embedding|aqa|imagen|veo|tts|audio|image|live|lyria|music|deep-research|antigravity|learnlm|robotics|computer-use/.test(id))
      .sort()
      .reverse();
  }
  if (provider === "claude") {
    return (json?.data ?? []).map((m) => m.id).filter(Boolean);
  }
  if (provider === "local") {
    // local servers list EVERYTHING loaded, embedding models included — and
    // an embedding model auto-picked as the chat default answers nothing
    return (json?.data ?? []).map((m) => m.id)
      .filter((id) => id && !/embed|rerank|whisper|clip\b/i.test(id));
  }
  return [];
}

export function extractApiText(provider, json) {
  if (provider === "gemini") {
    const t = json?.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought).map((p) => p.text).join("") ?? "";
    if (!t && json?.error) throw new Error(apiErrorText(json.error) || "Gemini error");
    return t;
  }
  if (provider === "claude") {
    const t = (json?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!t && json?.error) throw new Error(apiErrorText(json.error) || "Claude error");
    return t;
  }
  if (provider === "openai") {
    const t = json?.choices?.[0]?.message?.content ?? "";
    if (!t && json?.error) throw new Error(apiErrorText(json.error) || "OpenAI error");
    return t;
  }
  if (provider === "local") {
    let t = json?.choices?.[0]?.message?.content ?? "";
    // Qwen-lineage models (Bonsai included) may inline their reasoning as a
    // <think> block — that belongs in the thinking bubble, not the reply.
    t = t.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
    if (!t && json?.error) throw new Error(apiErrorText(json.error) || "local server error");
    return t;
  }
  return "";
}

// Read a Claude SSE stream back into the same JSON shape a non-streaming call
// returns, reporting progress as it goes — so extractApiText/Thinking work
// unchanged and the user watches the character count climb instead of staring
// at a spinner. onProgress({ phase: "thinking"|"writing", chars }) is called
// as deltas arrive (throttle in the caller if needed).
// ONE LINE OF WHAT IT IS ACTUALLY THINKING, for the waiting label.
//
// The first version showed the last 90 characters of the reasoning, which cut
// mid-word and mid-thought: "ket that mounts flush so the dovetail can" is not
// a summary, it is a ransom note. A reasoning model writes in whole sentences,
// and the sentence is the unit that carries the meaning — so show the last one
// it FINISHED. The fragment still being typed after it is half an idea and
// reads as noise.
//
// Truncate from the FRONT, not the back. A sentence puts its subject first:
// "The user wants a wall bracket with dovetails…" tells you it understood the
// request; the last 90 characters of that same sentence tell you nothing.
//
// This is extraction, not summarisation — no second model call, no cost, no
// lag. The model already writes its reasoning as prose; the job is only to
// pick the right sentence out of it.
const SUMMARY_MAX = 140;
export function summarise(s) {
  const flat = String(s || "").replace(/\s+/g, " ").trim();
  // Find where sentences END rather than what they are made of. The obvious
  // "a sentence contains no full stop" is wrong the moment a model writes
  // "3.5 mm" — it splits mid-number and the label shows "0 mm of wall." So a
  // terminator only counts as a boundary when a space and a capital or digit
  // follow it, or it ends the text. That keeps decimals ("3.5") and
  // abbreviations ("i.e. a chamfer") inside their sentence, where they belong.
  const ends = [];
  const re = /[.!?]+(?=\s+["'(]?[A-Z0-9]|\s*$)/g;
  for (let m; (m = re.exec(flat)); ) ends.push(m.index + m[0].length);
  const lastEnd = ends.length ? ends[ends.length - 1] : 0;
  // The sentence being written RIGHT NOW, and the last one it finished.
  const live = flat.slice(lastEnd).trim();
  const done = ends.length
    ? flat.slice(ends.length > 1 ? ends[ends.length - 2] : 0, lastEnd).trim()
    : "";
  // Prefer the sentence in flight. Showing only finished sentences sounds
  // safer but reads worse: measured, the label sat on "Okay." for two seconds
  // while the model was actually typing "The user wants a wall-mounted
  // sunglass holder with dovetails" — the one line worth seeing scrolled past
  // between refreshes. The fragment starts at a sentence boundary, so it still
  // opens with its subject; it is simply the newest thought.
  //
  // Below MIN_LIVE there is not enough of it to mean anything ("Now" tells you
  // nothing), so the completed sentence covers the gap.
  const MIN_LIVE = 20;
  let pick = live.length >= MIN_LIVE ? live : (done || live);
  // Mark an unfinished thought as unfinished. Drop a trailing comma or colon
  // first, or the line ends on the stutter "dovetail angle,…".
  if (pick === live && live && !/[.!?]$/.test(live)) pick = pick.replace(/[,;:\-–]+$/, "").trim() + "…";
  if (pick.length > SUMMARY_MAX) pick = pick.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, "") + "…";
  return pick;
}

export async function readClaudeStream(resp, onProgress) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const blocks = [];
  let stopReason = null, error = null, buf = "";
  const note = (phase, chars, text) => { try { onProgress?.({ phase, chars, text }); } catch { /* UI gone */ } };
  const handle = (data) => {
    let ev = null;
    try { ev = JSON.parse(data); } catch { return; }
    if (ev.type === "content_block_start") {
      blocks[ev.index] = ev.content_block?.type === "thinking"
        ? { type: "thinking", thinking: "" }
        : { type: ev.content_block?.type || "text", text: "" };
    } else if (ev.type === "content_block_delta") {
      const b = blocks[ev.index];
      if (!b) return;
      if (ev.delta?.type === "thinking_delta") {
        b.thinking = (b.thinking || "") + (ev.delta.thinking || "");
        note("thinking", blocks.reduce((n, x) => n + (x?.thinking?.length || 0), 0), summarise(b.thinking));
      } else if (ev.delta?.type === "text_delta") {
        b.text = (b.text || "") + (ev.delta.text || "");
        note("writing", blocks.reduce((n, x) => n + (x?.text?.length || 0), 0), summarise(b.text));
      }
    } else if (ev.type === "message_delta") {
      stopReason = ev.delta?.stop_reason ?? stopReason;
    } else if (ev.type === "error") {
      error = ev.error || { message: "stream error" };
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) handle(line.slice(5).trim());
    }
  }
  return { content: blocks.filter(Boolean), stop_reason: stopReason, ...(error ? { error } : {}) };
}

// What the request actually cost, for the log line.
//
// This exists so the caching is VISIBLE. A cache that silently stops working —
// because a setting crept into the stable half, or a provider changed its
// rules — looks exactly like a cache that is working, and the only symptom is
// a bill. "cached 5,261" in the log every turn after the first is the proof;
// its absence is the alarm.
//
// Every provider spells it differently and any of them may send nothing, so a
// missing number reads as "not reported", never as zero.
export function usageNote(provider, json) {
  const u = provider === "gemini" ? json?.usageMetadata : json?.usage;
  if (!u) return "";
  const n = (v) => (Number.isFinite(+v) ? +v : 0);
  const bits = [];
  if (provider === "gemini") {
    const cached = n(u.cachedContentTokenCount);
    const inTok = n(u.promptTokenCount);
    if (inTok) bits.push(`in ${inTok}`);
    if (cached) bits.push(`cached ${cached}`);
    if (n(u.candidatesTokenCount)) bits.push(`out ${n(u.candidatesTokenCount)}`);
  } else if (provider === "claude") {
    // Anthropic reports the three separately, and they do NOT overlap: fresh
    // input, tokens written INTO the cache this turn, and tokens read back
    // out of it. A write costs more than plain input and a read costs about a
    // tenth, so telling them apart is the whole point.
    if (n(u.input_tokens)) bits.push(`in ${n(u.input_tokens)}`);
    if (n(u.cache_creation_input_tokens)) bits.push(`cache write ${n(u.cache_creation_input_tokens)}`);
    if (n(u.cache_read_input_tokens)) bits.push(`cached ${n(u.cache_read_input_tokens)}`);
    if (n(u.output_tokens)) bits.push(`out ${n(u.output_tokens)}`);
  } else {
    if (n(u.prompt_tokens)) bits.push(`in ${n(u.prompt_tokens)}`);
    const cached = n(u.prompt_tokens_details?.cached_tokens);
    if (cached) bits.push(`cached ${cached}`);
    if (n(u.completion_tokens)) bits.push(`out ${n(u.completion_tokens)}`);
  }
  return bits.length ? `tokens: ${bits.join(" · ")}` : "";
}

// When a reply carries no text at all, say WHY instead of "Empty response" —
// the difference between a user retrying sensibly and giving up.
export function emptyReplyReason(provider, json) {
  if (json?.error) return apiErrorText(json.error);
  if (provider === "claude") {
    const thought = (json?.content ?? []).some((b) => b.type === "thinking");
    if (json?.stop_reason === "max_tokens") {
      return thought
        ? "The model spent its whole token budget thinking and never got to the answer. Ask again — or simplify the request, or pick a faster model (sonnet) for this one."
        : "The reply hit the token limit before any text arrived. Try again or simplify the request.";
    }
    if (thought) return "The model thought but produced no reply text — this usually passes on a retry.";
  }
  if (provider === "gemini" && json?.candidates?.[0]?.finishReason) {
    return `No text in the reply (finishReason: ${json.candidates[0].finishReason}).`;
  }
  if (provider === "openai") {
    const fin = json?.choices?.[0]?.finish_reason;
    if (fin === "length") {
      return "The reply hit the token limit before any text arrived — a reasoning model can spend the whole budget thinking. Try a simpler request, or pick a non-reasoning model like gpt-4o.";
    }
    return `OpenAI returned no reply text${fin ? ` (finish_reason: ${fin})` : ""}. Try again — and if it repeats, check the request log above.`;
  }
  if (provider === "local") {
    return "The local server returned no text — is a model loaded? Check the server window, and that the URL in ⚙ points at it (default http://localhost:8080/v1).";
  }
  return "The provider returned no reply text. Try again — and if it repeats, check the request log above.";
}

// The model's reasoning, when the response carries it (Gemini thought parts,
// Claude thinking blocks). Empty string when there is none.
export function extractApiThinking(provider, json) {
  if (provider === "gemini") {
    return json?.candidates?.[0]?.content?.parts
      ?.filter((p) => p.thought && p.text).map((p) => p.text).join("\n") ?? "";
  }
  if (provider === "claude") {
    return (json?.content ?? []).filter((b) => b.type === "thinking")
      .map((b) => b.thinking).filter(Boolean).join("\n");
  }
  if (provider === "openai" || provider === "local") {
    const m = json?.choices?.[0]?.message;
    if (m?.reasoning_content) return m.reasoning_content;          // llama.cpp --jinja
    const think = /<think>([\s\S]*?)<\/think>/.exec(m?.content || "");
    return think ? think[1].trim() : "";
  }
  return "";
}

// Read an OpenAI-compatible SSE stream (llama.cpp, Ollama, LM Studio) back
// into the non-streaming response shape, reporting progress like the Claude
// reader — same contract, different wire format.
export async function readOpenAIStream(resp, onProgress) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let content = "", reasoning = "", finish = null, error = null, buf = "";
  // `text` is the live tail of whatever is streaming, so the UI can show what
  // the model is actually doing rather than a number climbing. On a reasoning
  // model that is the difference between three silent minutes and watching it
  // work through the problem.
  const note = (phase, chars, text) => { try { onProgress?.({ phase, chars, text }); } catch { /* UI gone */ } };
  const handle = (data) => {
    if (data === "[DONE]") return;
    let ev = null;
    try { ev = JSON.parse(data); } catch { return; }
    if (ev.error) { error = ev.error; return; }
    const d = ev.choices?.[0]?.delta || {};
    // TWO spellings, and only one of them was read. OpenAI streams
    // `reasoning_content`; OpenRouter streams `reasoning` — so every reasoning
    // model reached through a compatible host had its entire thought stream
    // arrive and be discarded, leaving the user watching a bare timer through
    // the exact minutes there was most to show them.
    const think = d.reasoning_content ?? d.reasoning;
    if (think) { reasoning += think; note("thinking", reasoning.length, summarise(reasoning)); }
    if (d.content) { content += d.content; note("writing", content.length, summarise(content)); }
    finish = ev.choices?.[0]?.finish_reason ?? finish;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) handle(line.slice(5).trim());
    }
  }
  return {
    choices: [{ message: { content, ...(reasoning ? { reasoning_content: reasoning } : {}) }, finish_reason: finish }],
    ...(error ? { error } : {}),
  };
}

// ------------------------------------------------- model ranking for the UI
//
// Rough "good at code-CAD" score so the dropdown can highlight the models
// worth picking: bigger family version wins, then class (pro/opus > flash/
// sonnet > lite/haiku), previews slightly penalised.
//
// The version number is only trusted when it follows a known family word —
// grabbing the first digits in the id ranked "deep-research-preview-12-2025"
// above every real model because the DATE parsed as version 12.
export function modelScore(id) {
  const s = String(id).toLowerCase();
  let v = 0;
  const fam = s.match(/gemini-(\d+)(?:\.(\d+))?/)
    || s.match(/(?:opus|sonnet|haiku|fable|mythos)-(\d+)(?:[-.](\d+))?(?!\d)/);
  if (fam) {
    const ver = +fam[1] + (fam[2] ? +fam[2] / 10 : 0);
    if (ver <= 20) v += ver * 10;                 // a "version" over 20 is a date
  } else {
    const g = s.match(/gemma-(\d+)/);             // small open models trail their peers
    if (g && +g[1] <= 20) v += +g[1] * 10 - 15;
  }
  if (/opus|fable|mythos|pro(?:$|[^a-z])/.test(s)) v += 8;
  else if (/sonnet|flash(?!-?lite)/.test(s)) v += 5;
  else if (/haiku|lite|nano|mini|gemma/.test(s)) v += 2;
  if (/preview|exp(?:$|[^a-z])/.test(s)) v -= 1;
  // In-browser WebLLM ids carry their parameter count: more parameters, more
  // capable. Only relative order within the browser list matters.
  const wb = s.match(/-([\d.]+)b-instruct-q\d/);
  if (wb) v += Math.min(18, parseFloat(wb[1]) * 3);
  return v;
}

// --------------------------------------------------------- prior art lookup
//
// "Has somebody already made this?" — asked only when the request names
// something recognisable (see src/priorart.js, which decides that and is
// deliberately biased towards not asking).
//
// A SEPARATE, small request rather than a tool added to the generation call.
// Attaching a search tool to the main request changes the shape of the reply,
// and everything downstream — the fence parser, the retry loop, the code
// extractor — is built around the shape it has now. One cheap extra call that
// can fail on its own is worth more than a clever one that can break building.
//
// Only providers whose SERVERS can search are supported: doing it from the page
// is impossible anyway, since a browser cannot fetch a search engine across
// origins. Anything else returns null and the feature simply does not appear.
export function priorArtRequest({ provider, key, model, subject, sites = [] }) {
  const ask = `Search the web and tell me whether a ready-made 3D-printable model of "${subject}" already exists.`
    + ` Prefer ${sites.join(", ")}.`
    + ` Reply with ONLY a JSON array, no prose, at most 4 items, each`
    + ` {"title":"...","url":"https://...","site":"printables.com","licence":"CC-BY-NC or unknown"}.`
    + ` Use the real page URL for each model. If you find nothing relevant, reply with [].`;

  if (provider === "claude") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
          messages: [{ role: "user", content: ask }],
        }),
      },
    };
  }
  if (provider === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      options: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tools: [{ google_search: {} }],
          contents: [{ role: "user", parts: [{ text: ask }] }],
        }),
      },
    };
  }
  return null;                 // this provider cannot search; say nothing
}

// Pull the results out of whatever the provider sent back. Defensive on
// purpose: this is a bonus feature and a malformed answer must cost nothing
// more than the feature not appearing.
export function parsePriorArt(text, { safeUrl = (u) => u } = {}) {
  const s = String(text || "");
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let rows;
  try { rows = JSON.parse(s.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(rows)) return [];

  const out = [];
  const seen = new Set();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const url = safeUrl(r.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep blank */ }
    out.push({
      title: String(r.title || "Untitled").slice(0, 120),
      url,
      site: String(r.site || host).slice(0, 60),
      licence: String(r.licence || r.license || "unknown").slice(0, 60),
    });
    if (out.length >= 4) break;
  }
  return out;
}
