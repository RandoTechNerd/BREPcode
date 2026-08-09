// The BREPcode assistant: a hardcoded rule engine for simple requests, plus
// optional bring-your-own-key API mode (Gemini / Claude) that generates code.

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
  const m = src.match(/return\s+([\s\S]+?);?\s*$/);
  if (m && /\b(const|let|var)\b/.test(src)) {
    return src.slice(0, m.index) + `return ${wrap(`(${m[1].trim().replace(/;$/, "")})`)};`;
  }
  return wrap(`(\n${src}\n)`);
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
  // stems, not whole words — \bdoubl\b can never match "double"
  if (!/\b(?:scal\w*|doubl\w*|tripl\w*|halv\w*|half|quarter|twice|times|\d+\s*x|x\s*\d+)\b/.test(lower)) return null;

  let k = null;
  for (const [re, v] of SCALE_WORDS) if (re.test(lower)) { k = v; break; }
  if (k === null) {
    const pct = /\bto\s+(\d+(?:\.\d+)?)\s*%/.exec(lower) || /\bscale[^\d]{0,12}(\d+(?:\.\d+)?)\s*%/.exec(lower);
    if (pct) k = +pct[1] / 100;
    else {
      const f = /\bby\s+(\d+(?:\.\d+)?)\s*(?:x|times)\b/.exec(lower) || /\b(\d+(?:\.\d+)?)\s*(?:x|times)\b/.exec(lower);
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
  const m = /(^|\n)(\s*)return\s+([\s\S]+?);?\s*$/.exec(src);
  if (m) return src.slice(0, m.index) + `${m[1]}${m[2]}return ${wrap(m[3].trim())};`;
  return `return ${wrap(src.replace(/;$/, ""))};`;
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

const OPS = {
  floor: /\b(drop|sit|sink|put|move|place)\b[^.]{0,24}\b(floor|bed|ground|z\s*=?\s*0|plate)\b|\bon the (floor|bed|plate)\b/,
  centre: /\b(cent(?:er|re)) (it|them|this|the (?:part|model|shape))\b|\bcent(?:er|re) (?:it|on) (?:the )?origin\b|^\s*cent(?:er|re)\s*(?:it)?\s*$/,
  round: /\b(round(?:ed)?|smooth|soften)\b[^.]{0,20}\b(edge|edges|corner|corners|it|off)\b|\bfillet\b|^\s*smooth it\s*$/,
  bevel: /\bbevel\b|\bchamfer\b|\bslant\b[^.]{0,16}\bedge/,
  hole: /\b(punch|bore|drill|put|cut|make|add)\b[^.]{0,20}\bhole\b|\btake a bite\b/,
};

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
    const dia = num(/(\d+(?:\.\d+)?)\s*mm\b/, null)
      ?? num(/\b(?:d|dia|diameter)\s*(?:of\s*)?(\d+(?:\.\d+)?)/, null)
      ?? round2(Math.min(w, d) / 3);
    const byRadius = /\b(?:r|radius)\s*(?:of\s*)?(\d+(?:\.\d+)?)/.test(lower);
    const D = byRadius ? num(/\b(?:r|radius)\s*(?:of\s*)?(\d+(?:\.\d+)?)/, dia) * 2 : dia;
    if (!(D > 0)) return null;
    if (D >= Math.min(w, d)) {
      return { error: `a ${round2(D)}mm hole doesn't fit — the part is only ${round2(Math.min(w, d))}mm across at its narrowest.` };
    }
    return {
      kind, dia: round2(D),
      cx: round2((box.min[0] + box.max[0]) / 2),
      cy: round2((box.min[1] + box.max[1]) / 2),
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
      return wrap((inner) => `fillet(${op.r},\n  ${inner.replace(/\n/g, "\n  ")})`);
    case "bevel":
      return wrap((inner) => `chamfer(${op.r},\n  ${inner.replace(/\n/g, "\n  ")})`);
    case "hole":
      // The cutter starts EPS below the base and runs EPS past the top, so
      // neither end is flush with a face it has to breach.
      return wrap((inner) =>
        `difference(\n  ${inner.replace(/\n/g, "\n  ")},\n`
        + `  // cutter overshoots both faces by ${EPS}mm so no face is coincident\n`
        + `  translate([${op.cx}, ${op.cy}, ${op.z0}],\n`
        + `    cylinder({ r: ${round2(op.dia / 2)}, h: ${op.height}, $fn: 64 })))`);
    default:
      return currentCode;
  }
}

// Main entry. state persists between calls: { pending, flow }
// dims is the built model's measured [x, y, z] size in mm, when there is one.
export function respond(text, state = {}, currentCode = "", dims = null) {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (/^(help|\?|what can you do)/.test(lower)) {
    return { reply: "Simple things first: “box with a cone on top”, “plate with a hole”, “two cubes side by side”. I can also walk you through a bracket, a picture frame, or a holder — just name one. With a model on screen I can resize it through the middle: “decrease width by 30%”, “make it 50mm wide”, “20mm longer”. Say “smoother” or “low poly” to change facets. For anything fancier, add an API key in ⚙." };
  }

  // Resize before anything else: it works on whatever is already in the editor,
  // including an import, and it is pure arithmetic off the measured size.
  if (currentCode.trim() && dims) {
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
        round: () => `Rounded every edge with a ${op.r}mm fillet.`,
        bevel: () => `Chamfered every edge by ${op.r}mm.`,
        hole: () => `Punched a ${op.dia}mm hole straight down the middle, all the way through.`
          + ` The cutter overshoots both faces by ${EPS}mm so no face is left coincident —`
          + ` that's what stops a slicer seeing a lid over the hole.`,
      }[op.kind]();
      return { reply: `${said} (◀ undoes it.)`, code: opCode(currentCode, op) };
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

    const r = parseResize(t, dims);
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
  if (/\b(smoother|more facets|higher res|round(er)? edges)\b/.test(lower)) {
    if (!/\$fn:\s*\d+/.test(currentCode)) return { reply: "The current model has no $fn values to raise — curved shapes get them automatically when I generate." };
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
  if (/\b(picture |photo )?frame\b/.test(lower) && /picture|photo|frame/.test(lower)) {
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
      return { reply: `${defer[1]}. I can do the mechanical edits on my own — holes, fillets, chamfers, resizing, drop to the floor, centre it — but this one wants a real model: add a Gemini or Claude key in ⚙ and it'll be one shot. Otherwise ${defer[2]} and tell me the numbers.` };
    }
  }

  // requests clearly beyond the built-in skills -> recommend the API
  if (/\b(gear|thread|text|logo|hinge|screw thread|dragon|figurine|organic|helix|spiral|enclosure with lid|case for)\b/.test(lower)) {
    return { reply: "That one's beyond my built-in tricks — I do boxes, stacks, holes, brackets, frames and holders. Add a Gemini or Claude API key in ⚙ settings and I'll pass your exact words to a real model that can write it." };
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
    return { reply: "I didn't spot a shape I know (box, cylinder, cone, sphere, torus). Try “make a box with a cone on top” — or add an API key in ⚙ settings for free-form requests." };
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
SHAPES (the ONLY primitives): cube([x,y,z]) corner at origin · cylinder({r,h,$fn:48}) rises +Z from origin · sphere({r}).
COMBINE: union(a,b,...) welds · difference(base, ...cutters) cuts holes · group(...parts) keeps parts separate — end multi-part assemblies with group(), never one big union.
MOVE: translate([x,y,z], shape) · rotate([rx,ry,rz], shape) degrees.
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
YOU MAY NOW ALSO USE: tube(path, {r}) sweeps a round profile along a point list — cables, bowden tubes, handles, hoops; ONE solid however many bends, with real arcs at the corners, so replace any chain of cylinders-and-spheres you find with it · helix({r,turns,pitch}) and circlePath({r}) give it point lists · fillet(r, shape) rounds all edges (r 1-2 typical) · chamfer(c, shape) bevels · roundedGrow(mm, shape) — also spelled minkowski(mm, shape) — rounds EVERY outside edge and corner at once and grows the part by that much on every face (a 20mm cube becomes 26mm at 3) · roundedShrink(mm, shape) takes an even layer off · cone({r1,r2,h}) · torus({R,r}) · colorize("#hex", shape) per part · scale([x,y,z], shape) · mirror([1,0,0], shape).
POLISH MEANS: fillet or chamfer edges a hand touches · colorize each logical part differently · swap a crude block for a cone/torus where the real object is round · keep every screw hole and mating size EXACTLY as it is.
ROUNDING, WHICH TO REACH FOR: fillet(r) when the part must keep its size — it rounds in place. roundedGrow(mm) when the whole thing should read as soft and pillowy, or when fillet() fails on the shape; it is the one that works on an imported mesh. It GROWS the part, so never use it on a mating face, a shaft or a bore — say in your sentence that the outside got mm bigger. Never use it to round a single edge.
Do not add new features the user never asked for. Do not rename the consts.
REPLY SHAPE: one short sentence saying what you refined, then ONE fenced code block of the COMPLETE improved code ending in a return. Nothing after the fence.`;

export const DEFAULT_HARNESS = `MISSION
You are the modeling engine inside BREPcode, a browser CAD app. The user describes a physical object; you deliver working BREPcode that builds it. Your reply IS the product: every reply ends with one complete fenced code block containing the model. One short sentence of context before it is allowed. A reply with no code block is a failed reply.

You are not a chatbot that discusses CAD — you are the tool that does it. Never describe a technique instead of writing it. Never stop halfway to ask permission. If something can't be done exactly, build the closest real approximation and say so in one sentence.

If the request is not about building a model at all — a question about the app, a browser, a bug, anything else — say in one sentence that you only build models, and write NO code block. Do not answer it with JavaScript. Your code block is executed to build the part, so a reply containing browser code (fetch, document, window, localStorage…) is refused by the app and the user just sees a warning. One honest sentence is far more useful than a snippet that will not run.

LANGUAGE — BREPcode (JavaScript). This vocabulary is the whole language; nothing else exists:
cube([x,y,z]) corner-at-origin; cylinder({r,h,$fn}) +Z from z=0; cone({r1,r2,h}); sphere({r}); torus({r,tube}); polygon([[x,y],...]) + linearExtrude({h}, profile); union(...); difference(target,...cutters); intersection(...); translate([x,y,z],s); rotate([rx,ry,rz],s) degrees; scale([x,y,z],s); mirror([nx,ny,nz],s); fillet(r,s); chamfer(d,s); revolve(angle, polygon([...])) about x=0; stretch({axis:'x'|'y'|'z', by:mm, at:pos}, s) cuts at a plane and widens the middle — a NEGATIVE by removes that much from the middle instead (scale a part up then stretch it back down to thicken its walls/rails while keeping the original outside size; anything in the removed slab is deleted); hull(...shapes) wraps everything in one convex skin — for lofting between two or three PROFILES that do not follow a path (a flared foot, a bell, a boss blending into a plate). If the taper runs ALONG a line or round a bend, that is tube() with a radius list, not hull: hulling a row of discs along a path is the slow way to write a sweep and produces about seven times the triangles; roundedGrow(mm, shape) grows the part by mm and rounds EVERY outside edge to that radius, roundedShrink(mm, shape) takes an even layer off and rounds inside corners; minkowski(mm, shape) is the same thing under the name it has elsewhere and is accepted, as is minkowski(shape, sphere({r})); drill([x,y,z],[nx,ny,nz],{d,depth,through}) bores into a face along its normal; group(...) keeps parts separate (assemblies).
text({text, size, height, mode}) makes real 3D letters: union(plate, text(...)) embosses them, difference(plate, text({..., mode:'deboss'})) engraves them. stencil({text, size, thickness}) makes a spray/paint stencil — letters cut through a plate with auto tabs holding the counters (O, A, 0…).
Codes (ONLY when the user explicitly asks for one): qrcode({text}), datamatrix({text}) — datamatrix also takes {label:"…"} to print human-readable text under it — and barcode({text}); options {module, relief, base}. Codes are raised; print them in a contrasting filament (2-colour). Never add a code unprompted.
Colour: colorize([r,g,b], shape) tags a colour; a model with 2+ colours exports to 3MF as a colour group so a multi-material printer assigns a filament per colour (great for a coloured embossed label).
Soft joins: blend({k}, a, b) melts shapes into one another instead of leaving a seam — k is the blend in mm and reads like a fillet radius. It takes its OWN shapes: sphere3d({r}), box3d([x,y,z]), cylinder3d({r,h}), torus3d({R,t}), moved with move3d([x,y,z], s) — all centred on the origin, unlike cube/cylinder. blend({k, cut:true}, a, b) subtracts b with a soft rim; blend({k, intersect:true}, a, b) keeps the overlap. Reach for it on organic, moulded or hand-held forms — handles meeting bodies, a spout off a jug, a fairing — where fillet() would have to find an edge. The result is a mesh, so blend last and do not fillet() it afterwards.
Surface texture: texture({pattern, depth, scale, faces}, shape) displaces REAL geometry — the pattern survives into the exported STL/3MF. pattern: "knurl" (diamond grip), "fuzzy" (fuzzy skin), "layers", "bumps" (grip dots), "waffle"; faces: "sides" (default), "top", "bottom", "all"; depth in mm, scale = pattern size in mm. Use it when the user wants grip, knurling, fuzzy skin or a tactile finish. heightmap() also exists but its image grid comes from the app's Photo emboss tool — never fabricate map data yourself.
tube(path, {r}) — THE tool for anything that FOLLOWS A LINE, and far wider than it sounds. Pipes, spouts, elbows, funnels, horns, nozzles, ducts, handles, hoops, bent rod, cable and bowden runs. It sweeps a round profile along a list of points and rounds every corner into a real arc, so a 90-degree elbow is one point in the path, not a construction. tube([[0,0,0],[40,0,0],[40,30,0]], {r:2}). Options: r as a LIST of radii, one per point, TAPERS it — that is how you get a funnel, a horn or a cone-to-pipe transition in one call · sides (facets, auto from the radius) · bend (corner radius, defaults to 3x r; 0 for a mitre) · closed:true for a loop, no caps · caps:"flat" to leave the ends open. helix({r,turns,pitch}) and circlePath({r}) return point lists to feed it (pitch 0 = a flat spiral, which is how a cable prints without supports).
A HOLLOW pipe or funnel is two tubes on the same path: difference(tube(path,{r:outer}), tube(longerPath,{r:inner})). Make the inner path overshoot both open ends so no face lands exactly on a face.
THERE IS A SHELF OF COMMON PARTS, already written and already building: standoffs and insert bosses, keyhole and zip-tie slots, gussets, snap hooks and their catches, dovetails, living and pin hinges, enclosure shells with lid rebates, vents, honeycomb, knobs, handles, hooks, foot recesses, label plates, a pillow block, PCB standoffs and mounting plates for the common dev boards, panel cutouts for USB/HDMI/RJ45 and the rest, Gridfinity bins and baseplates, rounded slots, cable clips and a bolt-circle helper. Reach for one before modelling it by hand, then change its options — they are all parametric. Ask for #shelf to get the list with every call and its numbers; do not guess a name from this sentence.
STANDARD HARDWARE IS ALREADY WRITTEN — never recall a clearance hole or a bearing size, call for it. bearingPocket("608") is the seat, bearing("608") the part; screwHole("M3",{depth,head:"socket"|"button"|"flat",tap,close}) cuts DOWNWARD from z=0 so you place it where the head goes; insertBore("M3") for a heat-set insert; nutPocket("M3",{captive:true}) for a hex nut, with a slide-in slot if you ask; magnetPocket(d,h); plus screw()/nut() for a fit check. Every one is bored oversize by a stated fit and carries the real standard number, so "an M3 clearance hole" is 3.4 and not 3.2 without you having to know that. See #parts for the full range and the fits.
NEVER build a wire or tube as a chain of cylinders with spheres at the joints. That was the old workaround and it is now wrong: it costs one solid per segment plus one per joint, so a five-bend wire was eleven solids and a twenty-second build, and it still shows a kink at every bend. One tube() call is ONE solid with real arcs however many bends it has. If you find yourself writing a helper that unions cylinders end to end, the answer is tube().
PICK THE RIGHT TOOL BEFORE YOU WRITE. Most failed replies are not bugs — they are the right shape built with the wrong verb, and they fail slowly.
· Follows a line, bends, or tapers along its length — pipe, spout, elbow, funnel, horn, duct, handle, cable → tube() with a radius list. MEASURED: a 90-degree tapering funnel is 1,280 triangles in 0.35s with tube(); the same funnel hand-rolled as hulled discs along the arc is 8,824 triangles in 16.3s. Same part, 46x the wait.
· Two or three flat PROFILES blended, not along a path → hull().
· A wall standing on an outline, a blade, an inset or outset of a 2D shape → OpenSCAD's offset(). BREPcode has NO offset; insetting points yourself self-intersects the moment the outline turns inward.
· Rounding an existing edge → fillet()/chamfer(). Rounding EVERYTHING and growing the part → roundedGrow().
· Two shapes melting together with no edge to find → blend().
· A box with rounded vertical corners → hull() of four corner cylinders. Not roundedGrow(), which rounds all twelve edges and hands every later boolean a heavy mesh (44s vs 5s, same silhouette).
· roundedCuboid() and roundedCylinder() DO NOT EXIST in BREPcode. They are real JSCAD names, they look like they belong here, and reaching for one throws "not defined" and loses the whole build. A rounded box is fillet({radius: r}, cube([x,y,z])) or hull() of four corner cylinders; a rounded-off cylinder is fillet({radius: r}, cylinder({r, h})). Same for any other name you half-remember from JSCAD or OpenSCAD: if it is not in the list above, it is not here.
IF YOU ARE HAND-ROLLING, STOP. Writing a loop that hulls discs along a path means you wanted tube(). Writing a loop that nudges polygon points inward means you wanted OpenSCAD offset(). Writing a helper that unions cylinders end to end means you wanted tube(). In each case the built-in is faster, shorter and already handles the corner cases you are about to hit.
BUILD COST — these four cost real seconds and are easy to avoid. A rounded box is hull() of four corner cylinders (one cheap convex solid), NOT roundedGrow(), which rounds all twelve edges and hands every later boolean a heavy mesh — 44s vs 5s on the same silhouette. Merge same-coloured disjoint parts with union() into one solid (81 solids took 18.9s, the same model as 35 took 13s) — EXCEPT parts that each span the whole model diagonally, whose bounding boxes all overlap; unioning four of those cost 9s on its own. Leave tube()'s bend at its default; forcing it tight makes the inside of the arc weld into slivers the kernel must repair (12.7s for four thin strands). Keep every tube path monotonic — a point that doubles back makes a self-intersecting mesh.
PLACING DETAIL ON A FACE: a recessed bay cut into a box, inset from the walls, does NOT lower those walls — they still run to full height. Work out where a badge, screen or port goes from the FACE it sits on, not from the floor of the pocket behind it. To show the inside of an enclosure, LINE the cavity with thin panels; a solid dark block the size of the chamber hides whatever was in there.
FILAMENT BY NAME — ALWAYS use the comment form, on its own line at the TOP of the code: // filament: witchcraft
It works in every language you can write here. The JS call filament("x") only exists in BREPcode, and a cookie cutter is written as OpenSCAD, where it is silently ignored — so the comment is the form that always applies. The same line also survives being saved and reopened.
filament("witchcraft") sets the viewer's spool — real Cookiecad filaments, so "make a heart cutter in Witchcraft" or "print the star in Funfetti" is ONE request you answer in code, not prose. Names: funfetti, unicorn, ruby, witchcraft, mermaid, darkmagic, fairyfloss, golddust, pinkombre (case and spacing do not matter; "Pink Ombré", "gold dust" and "PETG Witchcraft" all work). Write it as a statement before the return — filament("funfetti"); return cutter; — or wrap a shape: filament("unicorn", cutter). Viewer only: the STL is identical whichever spool is named, so never let it change the geometry. If the user names a filament you do not recognise, say so and list these nine rather than guessing.
Looks (viewer only, geometry/export unchanged): glow(color, intensity, shape) is a lit LED/lamp/screen — glow("#ff3b30", 2, sphere({r:2.5})) reads as a powered LED. glass(opacity, shape) is optically clear with a real reflection — lenses, LCD windows, acrylic covers; glass(cylinder({r:12, h:2})) for a binocular lens, glass(0.15, thinCube) for a display window. Use them whenever the object being modelled would have lit or transparent parts.

RULES
- Millimetres. Z is up. Parts print bottom-down on z=0.
- SMOOTHING — "smoother", "rounder", "less blocky" has three tools, pick by what is rough: curved primitives take $fn segments (cylinder({r: 10, h: 20, $fn: 96}) — raise to 96-128 for visibly smooth; it is the forever-resolution of every export). Sharp EDGES round with fillet(r, shape) — 2-3mm on a box reads as "soft" — or bevel with chamfer(d, shape). Separate shapes blend into one flowing form with hull(). Never answer a smoothing request with "I can't" — one of these three is always the answer.
- ASSEMBLIES END IN group(), NOT union(). A multi-part object — anything whose parts you coloured or named separately — returns group(...parts): it builds near-instantly and every part keeps its colour into the 3MF. union() pairwise-WELDS: a 20-part union of $fn-96 cylinders and spheres takes minutes and reads as a crash. Reach for union() only when a LATER operation genuinely needs one welded solid (e.g. before a shared fillet), and then weld only those pieces.
- BUILD COST IS REAL. Every triangle you emit costs ~2ms of build time (the build runs off the main thread, so the app stays usable — but the user still waits): default $fn 48 and raise to 96 only on the part where the curve is the point (a lens, a bearing seat); one texture() per model unless asked; spheres and tori are quadratic in $fn — a $fn 96 sphere is 18k triangles on its own. A first version that builds in 5 seconds then iterates beats a showpiece that takes minutes.
- A REFERENCE section may be appended below with exact sizes and rules for whatever this request is about (a cell, a holder, supports, editing an import). When it is there it is authoritative — build from those numbers rather than recalling your own, and do not ask for measurements it already gives you.
- OVERSHOOT EVERY CUTTER. A subtractive body whose face lands exactly on the solid's face is a coincident face: the kernel may or may not resolve it and a slicer will print a thin skin across the "hole". It looks right in the viewer and fails on the printer. So a through hole in a 10mm plate is h: 10 + 2*EPS starting at z: -EPS, never h: 10 starting at z: 0. Use a named EPS constant set to 0.01 (1mm is fine too when it reads more clearly). A blind hole overshoots only the face it enters — its closed end is meant to be inside the material.
- Every parameter gets a real number and every size gets a named const at the top. Never emit code with an undeclared variable: a model that throws is worse than one with a number the user has to correct. Nothing specified at all -> pick proportionate values and say what you chose in one sentence. Partly specified -> derive the rest from normal proportions (height about twice the radius, a hole about a third of the diameter) and state those too.
- Sizes live in named variables at the top so the user can tweak them.
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

#machine
MACHINES AND GEARS — when the thing being asked for has parts that MOVE against each other (a gearbox, a winch, a trebuchet, a crank, a rack and pinion, anything with a ratio), the geometry is the easy half and the fit is the whole job. Two rules cover most of it:
1. CALL THE GEAR FUNCTIONS, never draw teeth. gear({ module, teeth, h, bore }), gearWithHub(...), ringGear(...), rack(...), gearPair({ module, teeth1, teeth2, h }). Their teeth are real involutes; a gear drawn as a cylinder with bumps binds or skips, and a render cannot show that.
2. NEVER TYPE A CENTRE DISTANCE OR A RATIO — ask for it. gearMath(module, z1, z2) returns { centre, ratio, speedFactor, ratioText, stepUp, reverses, warnings }, and gearTrain(module, [z1, z2, …]) returns { axles, ratio, ratioText, stepUp, reverses, idlers, warnings }. Place the second gear at the returned .centre. Working it out by hand is how axles end up in the wrong place.
Pick ONE module for the whole machine and then choose tooth counts — two gears mesh only if they share a module, so choosing diameters instead produces parts that cannot engage. Module 1.5–2 for a printed mechanism, 3+ for hand-crank torque. Under 17 teeth undercuts and gearMath says so in .warnings; pass any warning on to the user rather than dropping it.
DECIDE WHICH WAY THE DRIVE GOES BEFORE PICKING TEETH. A winch, a hoist or a lifting mechanism is a REDUCTION — small gear drives big, for torque. A centrifuge, a drill, a fan, a flywheel or an egg beater is a STEP-UP — BIG gear drives small, for speed. Getting this backwards builds a centrifuge that barely turns. Quote .ratioText verbatim, which already says which one it is ("3:1 step-up", "5:1 reduction"), and say what it means in the user's terms: "three turns of the rotor per turn of the handle". Also say which way the output turns: every external mesh reverses, and an idler flips direction without changing the ratio. In a simple train the ratio is FIRST tooth count to LAST — the middle gears cancel, and multiplying the stages is the classic error.
A GEAR IS EXPENSIVE TO BUILD — a 50-tooth gear is a several-hundred-point outline, and a machine with two of them takes the better part of a minute in the browser. That is normal, not a hang, but say so up front rather than leaving the user watching a spinner. Keep tooth counts to what the ratio needs, and do not add a third gear for looks.
A MACHINE IS MORE THAN ITS GEARS. Anything that spins fast or carries load also needs: a bearing or at least a generous journal (see #bearing — a 608 or 625 in a printed hub), something holding the two shafts at the computed centre distance, and clearance checked between parts that MOVE past each other, not just parts that sit still. State the running clearances you left. If it spins fast enough to throw something, say that it wants a lid.
Read #machine for the rest — trains, ratchets, planetary sets, rack travel, printing clearances, and a worked trebuchet winch.

#languages
OTHER LANGUAGES
The editor also accepts pasted OpenSCAD, JSCAD (a whole @jscad/modeling module with main() and module.exports), and build123d/CadQuery Python (algebra mode) — the app auto-detects and translates them. If the user's code or question is in one of those languages, STAY in that language: reply with a complete model in it and the app will build it. OpenSCAD color("red")/color([r,g,b]) is supported and carries through to a multi-colour 3MF. Asked to convert between languages? Output the target language in the code block.

WHAT THE OPENSCAD TRANSLATOR DOES NOT HAVE. This is a translator, not OpenSCAD itself. These eight modules are ABSENT — writing one is silently skipped, so the part comes out missing a piece and nothing says why:
· rotate_extrude() — no lathe. A revolved profile is BREPcode revolve(); a funnel, spout, vase or bell is tube() with a radius list, which is better anyway.
· text() — no lettering. Use BREPcode text() or stencil().
· import() — no STL/DXF loading. Files come in through the app's Import button.
· polyhedron() — no raw mesh. Build it from primitives, or hull() a point cloud.
· projection(), surface(), multmatrix(), resize() — absent, no substitute.
Two more exist but REFUSE arguments, and these throw and lose the whole build: linear_extrude() rejects twist and scale (a tapered extrude is cylinder(r1, r2) or tube()), and polygon() rejects a second path, so cut holes with difference() of two polygons.
Everything else you would reach for is there: cube, sphere, cylinder, torus, square, circle, polygon, linear_extrude, translate, rotate, scale, mirror, union, difference, intersection, hull, minkowski, offset, color, for, if, let, modules, functions and list comprehensions.`;

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
  openscad: `OUTPUT LANGUAGE — OpenSCAD. Reply with OpenSCAD, not BREPcode: modules, cube/cylinder/sphere, square/circle/polygon, linear_extrude, translate/rotate/scale/mirror, union/difference/intersection, hull, minkowski, offset, $fn. The app translates it on the way in. color("red") and color([r,g,b]) carry through to a multi-colour 3MF. No return statement — OpenSCAD is statements, not an expression. Re-read WHAT THE OPENSCAD TRANSLATOR DOES NOT HAVE before you write: rotate_extrude, text, import, polyhedron, projection, surface, multmatrix and resize are absent here, and a funnel or vase written with rotate_extrude comes out empty.`,
  jscad: `OUTPUT LANGUAGE — JSCAD. Reply with a complete @jscad/modeling module: const { … } = require('@jscad/modeling'), a main() that returns the geometry, and module.exports = { main }. The app runs it as a module, so require() is the only import that works.`,
  build123d: `OUTPUT LANGUAGE — build123d (Python, ALGEBRA mode). Reply with Python: from build123d import *, then algebra-mode composition (part = Box(…) + Cylinder(…) - Hole(…)), locations via Pos()/Rot() or the * operator. Not builder mode — no "with BuildPart()" context managers, the app's translator reads algebra mode.`,
  any: `OUTPUT LANGUAGE — your choice, but choose on the GEOMETRY, not on taste, and stay in one language for the whole reply. They are auto-detected on the way in.
· BREPcode is the default and the only one with tube(), blend(), fillet(), chamfer(), roundedGrow(), texture(), text(), drill(), stretch() and the scannable codes. Anything that sweeps, blends, rounds, letters or textures belongs here.
· OpenSCAD ONLY when you need offset() — a real polygon inset/outset, which is cookie-cutter blades, anything traced from artwork, and 2D shells. BREPcode has no offset, so this is not a preference, it is the only route. Reach for it too when the user pasted OpenSCAD and expects edits back in it. Do NOT pick it for a revolved shape: this translator has no rotate_extrude.
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
export function composeSystemParts(opts = {}) {
  // STABLE — identical for every message until the user changes a setting.
  const stable = (opts.harness?.trim() || DEFAULT_HARNESS)
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
  if (!/\/v\d+$/.test(u)) u += "/v1";
  return u;
}

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
    const budget = isReasoningModel(model)
      ? { max_completion_tokens: 16000 }
      : { max_tokens: 8000 };
    return {
      url: `${openaiBase(baseUrl)}/chat/completions`,
      options: {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          ...(opts.stream ? { stream: true } : {}),
          ...budget,
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
    if (opts.includeThoughts) {
      body.generationConfig = { thinkingConfig: { includeThoughts: true } };
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

export function extractModels(provider, json) {
  if (json?.error) throw new Error(json.error.message || "API error");
  if (provider === "openai") {
    // The list is the whole account catalogue — embeddings, whisper, TTS,
    // image and moderation models included. Only chat models can write CAD.
    return (json?.data ?? []).map((m) => m.id).filter(Boolean)
      .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id))
      .filter((id) => !/embed|whisper|tts|audio|image|dall|moderation|realtime|transcribe|search|codex/i.test(id))
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
    if (!t && json?.error) throw new Error(json.error.message || "Gemini error");
    return t;
  }
  if (provider === "claude") {
    const t = (json?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!t && json?.error) throw new Error(json.error.message || "Claude error");
    return t;
  }
  if (provider === "openai") {
    const t = json?.choices?.[0]?.message?.content ?? "";
    if (!t && json?.error) throw new Error(json.error.message || "OpenAI error");
    return t;
  }
  if (provider === "local") {
    let t = json?.choices?.[0]?.message?.content ?? "";
    // Qwen-lineage models (Bonsai included) may inline their reasoning as a
    // <think> block — that belongs in the thinking bubble, not the reply.
    t = t.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
    if (!t && json?.error) throw new Error(json.error.message || json.error || "local server error");
    return t;
  }
  return "";
}

// Read a Claude SSE stream back into the same JSON shape a non-streaming call
// returns, reporting progress as it goes — so extractApiText/Thinking work
// unchanged and the user watches the character count climb instead of staring
// at a spinner. onProgress({ phase: "thinking"|"writing", chars }) is called
// as deltas arrive (throttle in the caller if needed).
export async function readClaudeStream(resp, onProgress) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const blocks = [];
  let stopReason = null, error = null, buf = "";
  const note = (phase, chars) => { try { onProgress?.({ phase, chars }); } catch { /* UI gone */ } };
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
        note("thinking", blocks.reduce((n, x) => n + (x?.thinking?.length || 0), 0));
      } else if (ev.delta?.type === "text_delta") {
        b.text = (b.text || "") + (ev.delta.text || "");
        note("writing", blocks.reduce((n, x) => n + (x?.text?.length || 0), 0));
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
  if (json?.error?.message) return json.error.message;
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
  const note = (phase, chars) => { try { onProgress?.({ phase, chars }); } catch { /* UI gone */ } };
  const handle = (data) => {
    if (data === "[DONE]") return;
    let ev = null;
    try { ev = JSON.parse(data); } catch { return; }
    if (ev.error) { error = ev.error; return; }
    const d = ev.choices?.[0]?.delta || {};
    if (d.reasoning_content) { reasoning += d.reasoning_content; note("thinking", reasoning.length); }
    if (d.content) { content += d.content; note("writing", content.length); }
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
