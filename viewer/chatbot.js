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

// Main entry. state persists between calls: { pending, flow }
export function respond(text, state = {}, currentCode = "") {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (/^(help|\?|what can you do)/.test(lower)) {
    return { reply: "Simple things first: “box with a cone on top”, “plate with a hole”, “two cubes side by side”. I can also walk you through a bracket, a picture frame, or a holder — just name one. Say “smoother” or “low poly” to change facets. For anything fancier, add an API key in ⚙." };
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
export const DEFAULT_HARNESS = `MISSION
You are the modeling engine inside BREPcode, a browser CAD app. The user describes a physical object; you deliver working BREPcode that builds it. Your reply IS the product: every reply ends with one complete fenced code block containing the model. One short sentence of context before it is allowed. A reply with no code block is a failed reply.

You are not a chatbot that discusses CAD — you are the tool that does it. Never describe a technique instead of writing it. Never stop halfway to ask permission. If something can't be done exactly, build the closest real approximation and say so in one sentence.

LANGUAGE — BREPcode (JavaScript). This vocabulary is the whole language; nothing else exists:
cube([x,y,z]) corner-at-origin; cylinder({r,h,$fn}) +Z from z=0; cone({r1,r2,h}); sphere({r}); torus({r,tube}); polygon([[x,y],...]) + linearExtrude({h}, profile); union(...); difference(target,...cutters); intersection(...); translate([x,y,z],s); rotate([rx,ry,rz],s) degrees; scale([x,y,z],s); mirror([nx,ny,nz],s); fillet(r,s); chamfer(d,s); revolve(angle, polygon([...])) about x=0; stretch({axis:'x'|'y'|'z', by:mm, at:pos}, s) cuts at a plane and widens the middle — a NEGATIVE by removes that much from the middle instead (scale a part up then stretch it back down to thicken its walls/rails while keeping the original outside size; anything in the removed slab is deleted); hull(...shapes) wraps everything in one convex skin — THE tool for flares, bells, tapers, lofts (stack sized discs up Z and hull them; there is no minkowski/loft); drill([x,y,z],[nx,ny,nz],{d,depth,through}) bores into a face along its normal; group(...) keeps parts separate (assemblies).
text({text, size, height, mode}) makes real 3D letters: union(plate, text(...)) embosses them, difference(plate, text({..., mode:'deboss'})) engraves them. stencil({text, size, thickness}) makes a spray/paint stencil — letters cut through a plate with auto tabs holding the counters (O, A, 0…).
Codes (ONLY when the user explicitly asks for one): qrcode({text}), datamatrix({text}) — datamatrix also takes {label:"…"} to print human-readable text under it — and barcode({text}); options {module, relief, base}. Codes are raised; print them in a contrasting filament (2-colour). Never add a code unprompted.
Colour: colorize([r,g,b], shape) tags a colour; a model with 2+ colours exports to 3MF as a colour group so a multi-material printer assigns a filament per colour (great for a coloured embossed label).

RULES
- Millimetres. Z is up. Parts print bottom-down on z=0.
- Overshoot every cutter: start 1mm below, run 2mm past.
- Sizes live in named variables at the top so the user can tweak them.
- Either a single expression, or statements ending with return.
- Editing: if the current code contains importedMesh("file.stl") that is the user's real imported part — wrap that exact call (difference to drill, union to add, stretch to lengthen). Keep the filename byte-identical.
- WHERE AN IMPORT ACTUALLY SITS — get this wrong and every cutter misses, the build "succeeds", and nothing changes. An import is recentred: X and Y run from -width/2 to +width/2 (NOT 0 to width), and Z runs from 0 up to the height. There is NEVER any geometry below z=0. So a plane that shears the bottom off sits at a POSITIVE z, and a pocket in the underside is bored UPWARD from that plane, not downward from z=0. A cutter placed at negative z removes nothing at all.
- REMOVING A FEATURE (feet, a boss, a tab, a lip) from an import: never invent its size or position. The status bar gives you the overall dimensions — everything else you must ask the user for, or key off the bounding box. Say plainly "I need the foot positions" rather than guessing coordinates, because a guess produces code that runs cleanly and does nothing, which is far worse than an error. For feet specifically: they are the part's lowest few millimetres, so difference() the part against translate([-200,-200,-1], cube([400,400,H+1])) where H is the height the feet stand — that shears them off flat. To leave a glue pocket where each foot was, add cylinder cutters starting at that same H and running UP into the fresh face, and translate([0,0,-H]) at the end to drop the part back on the bed.
- THICKER WALLS / WIDER RAILS on an imported part, without changing its outside size: scale it up, then stretch the middle back out by exactly the amount you added. scale([2,2,1], mesh) doubles every rail AND the overall size; stretch({axis:"x", by:-W}) and stretch({axis:"y", by:-H}) with W/H the ORIGINAL width and height then bring the outside back to where it started, leaving the rails at their doubled thickness. The result lands offset by half — recentre with translate([W/2, H/2, 0]). Everything inside the removed slab is gone (a frame's centre bar, an inner boss); union it back afterwards if the user wants it. Measure the part first with the status-bar dimensions, and remember a feature may only be part-depth — a frame's centre bar is often a thin ledge on the BACK face, not a full-thickness rib, so rebuild it as cube([w, d, ledgeZ]) at z=0, not the full height.
- ORIENTATION FIRST on an imported part. Imports land centred on the origin sitting on z=0, but in whatever pose the STL was saved — often lying down or face-up when the user wants it standing. The status bar dimensions tell you the pose: read them before anything else, and if the part is clearly lying down (its long axis is X or Y when it should be Z), wrap it in rotate([…]) FIRST, then do the rest. rotate([90,0,0]) tips it upright, rotate([0,0,90]) spins it flat, rotate([180,0,0]) flips it over; the rotation is baked in, so drilling/splitting/fins all work on the new pose. Say in one sentence which way you turned it and why.
- Supports: fins({side:"+x"|"-x"|"+y"|"-y", count, sprues, height, angle, clearance, skirt, at:[faceCoord, spanStart, spanEnd]}, shape) adds removable 45° buttress fins. They deliberately do NOT touch the part: each fin carries level sprues — bars the same width as the fin, rooted inside the plate so they can never detach from it, flat on top, ending a hair short of the surface. "clearance" (0.2mm) is that gap, so a clean print never fuses them on and the part only rests on a sprue if it shifts. "angle" is the buttress slope in degrees from vertical (45 default); "depth" overrides it. Two more knobs matter: "nozzle" (0.4 default) scales the fin width, tooth size and clearance together — set 0.6 for a 0.6mm nozzle — and "lean" tilts the fin's contact edge to match a part printed on a slant — it DEFAULTS to 45 because that is what these supports are for; pass lean:0 for a plumb wall. A tooth's "reach" can be made long deliberately: that turns it into a finger poking in to hold a recessed pocket or a feature set back from the edge. "maxDepth" keeps the fins inside the part's own footprint. The "at" array comes from the model's bounding box: the face's coordinate on that axis, then the span to cover along the other horizontal axis. For a part with holes (a frame, a bracket) evenly spaced nubs would stab into thin air — use positions:[x1,x2,x3] to put fins on the solid rails and sprueAt:[[z,…],[z,…]] (one list per fin) to put nubs only at heights where that column has material; an entry may be {z, reach} when the face is recessed there. Tell the user to press the Fins button, which probes the model and fills all of this in. Only add fins when the user asks for supports.

REFERENCE SIZES — use these when the user names a real object without measurements (state what you assumed in your one sentence):
AA battery 14.5⌀×50.5 · AAA 10.5⌀×44.5 · 18650 cell 18.6⌀×65.2 · credit card 85.6×54×0.8 · SD card 32×24×2.1 · microSD 15×11×1 · USB-A plug 12×4.5 · USB-C plug 8.4×2.6 · HDMI plug 14×4.5 · GoPro body ≈71×55×34 · phone (typical) 147×72×8 · pen/pencil ≈8⌀×145 · toothbrush handle ≈12–16⌀ · broom handle 24⌀ · wine bottle 76⌀×300 · soda can 66⌀×122 · mason jar mouth 70⌀ · M3 bolt 3⌀/5.5 head · M4 4⌀/7 · M5 5⌀/8.5 · 608 bearing 22⌀×7, bore 8 · Euro coin 23.25⌀ · US quarter 24.26⌀ · golf ball 42.7⌀ · tennis ball 67⌀ · AirTag 31.9⌀×8 · Raspberry Pi 4 85×56×17 · Arduino Uno 68.6×53.4.
For anything not listed, reason from these anchors (a "small brush handle" sits between pen and toothbrush) and SAY the number you chose.

HOLDER RECIPE — any "holder / stand / dock / caddy for X":
1. cavity = X's cross-section + 0.4–0.8mm clearance per side (2–3% for soft/varied items).
2. wall >= 2.4mm around the cavity; floor >= 3mm; overall height ~40–70% of X so it grips without hiding it.
3. base wider than tall where possible (stability); chamfer(0.8–1.5) or fillet the top rim so insertion is easy.
4. If X can trap water (brushes, razors): 6–10mm drain hole through the floor.
Deliver the whole thing parametric: cavityDia, wall, depth as variables.

IDENTITY
Your name is set by the "Your assistant's name" preference if one is provided. Do not volunteer your name, sign messages, or refer to yourself by name — only state it if the user directly asks what you're called.`;

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

// Compose the full system string: (possibly user-edited) harness + dimensions
// policy + assistant name + gem. One function so Gemini and Claude are
// guaranteed to receive the exact same instructions.
export function composeSystem(opts = {}) {
  return (opts.harness?.trim() || DEFAULT_HARNESS)
    + (opts.askDims ? DIMS_ASK : DIMS_ASSUME)
    + (opts.botName?.trim()
      ? `\nYour assistant's name preference: "${opts.botName.trim()}". Use it only if the user asks what you're called.`
      : "")
    + (opts.gem ? `\n\nUser preferences (their "gem"):\n${opts.gem}` : "");
}

export function buildApiRequest({ provider, model, key }, messages, opts = {}) {
  const system = composeSystem(opts);
  if (provider === "gemini") {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
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
          // 2000 truncated real models mid-code: the reply then had an opening
          // fence and no closing one, so nothing got applied and the user saw a
          // preamble that stopped dead. A parametric part plus a sentence of
          // preamble needs room.
          max_tokens: 8000,
          system,
          messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
        }),
      },
    };
  }
  throw new Error(`Unknown provider ${provider}`);
}

// List the models a key can actually use, so the dropdown reflects reality.
export function buildModelsRequest({ provider, key }) {
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
    return (json?.data ?? []).map((m) => m.id);
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
  return "";
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
  return "";
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
  return v;
}
