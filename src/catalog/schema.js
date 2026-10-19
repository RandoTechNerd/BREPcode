// The model catalog: what a FAMILY is, and how one becomes code.
//
// A family is one parametric design ("a cradle hook for round things") that
// covers many requests ("yoga mat hook", "foam roller holder", "hose
// hanger"). Those named requests are its THINGS: a thing is just a family
// with some of its dials preset and its own names to be asked for by. A
// thousand things come from a couple of hundred families that way, without a
// thousand near-copies of the same hook.
//
// A family is data plus one string of geometry:
//
//   params   every size a person might want to change, with a default, a
//            range and the words people use for it ("wide", "angle").
//   body     BREPcode that uses those names and RETURNS the part. The params
//            are written above it as `const` lines, so the code that lands in
//            the editor is ordinary, readable code whose numbers are sliders,
//            not a call into a black box. A slider change rebuilds exactly
//            what the catalog built.
//   fits     the kinds of real object that can size it (phone, round, cable…).
//            A spec of that kind ("iPhone 15 Pro", "yoga mat") feeds its
//            measured sizes through fromSpec().
//
// Families never share files: each lives alone in its category folder, so a
// new one is a new file plus one line in that folder's index.js.

export const CATEGORIES = {
  desk: "Desk & office",
  wall: "Wall & hanging",
  storage: "Storage & organising",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  garage: "Garage & tools",
  garden: "Garden & plants",
  electronics: "Electronics & cables",
  home: "Home repair & furniture",
  fitness: "Fitness & sport",
  gaming: "Gaming & media",
  pets: "Pets",
  travel: "Travel & outdoor",
  kids: "Kids & toys",
  printer: "3D printer accessories",
  vehicle: "Car & bike",
  decor: "Decor & holidays",
  access: "Accessibility & daily living",
};

// The units a param may be in. "mm" and "deg" take unit words from a request
// ("6 inch", "70 degrees"); "count" is a whole number ("3 cables"); "choice"
// is one of a list ("tape" / "screws").
export const UNITS = ["mm", "deg", "count", "ratio", "choice"];

const round2 = (v) => Math.round(v * 100) / 100;

// Every value a family will be built with: defaults, then each layer of
// overrides in order, clamped to the family's ranges. Clamps are reported,
// because "made it 400 wide" when the slider stops at 300 is a thing to SAY.
export function resolveParams(family, ...layers) {
  const values = {}, clamped = [];
  for (const [k, p] of Object.entries(family.params)) values[k] = p.default;
  const put = (layer) => {
    for (const [k, v] of Object.entries(layer)) {
      const p = family.params[k];
      if (!p || v === undefined || v === null) continue;
      if (p.unit === "choice") {
        if (p.choices.includes(v)) values[k] = v;
        continue;
      }
      let n = +v;
      if (!Number.isFinite(n)) continue;
      if (p.unit === "count") n = Math.round(n);
      const lo = p.min, hi = p.max;
      if (n < lo || n > hi) {
        clamped.push({ param: k, asked: n, used: Math.min(hi, Math.max(lo, n)) });
        n = Math.min(hi, Math.max(lo, n));
      }
      values[k] = p.unit === "count" ? n : round2(n);
    }
  };
  for (const layer of layers) if (layer) put(layer);
  // A family may fold one dial into others once everything is in: the
  // battery organizer turns "12 batteries" into a 4 x 3 grid and sets the
  // count back to 0, so the code shows the grid and the follow-up reports
  // "pockets across 6 -> 4, rows 4 -> 3". Same clamps as any layer.
  if (family.derive) {
    const more = family.derive(values);
    if (more) put(more);
  }
  return { values, clamped };
}

// The const block. The trailing comment is the OpenSCAD customizer form the
// params panel already reads: `// [min:max] what it is`, or `// [a, b] …` for
// a choice. So every line becomes a labelled slider with the right stops.
export function paramLines(family, values) {
  const names = Object.keys(family.params);
  const pad = Math.max(...names.map((k) => `const ${k} = ${fmt(values[k])};`.length)) + 2;
  return names.map((k) => {
    const p = family.params[k];
    const decl = `const ${k} = ${fmt(values[k])};`;
    const range = p.unit === "choice" ? `[${p.choices.join(", ")}]`
      : p.step ? `[${p.min}:${p.step}:${p.max}]` : `[${p.min}:${p.max}]`;
    const unit = p.unit === "mm" ? ", mm" : p.unit === "deg" ? ", degrees" : "";
    return `${decl.padEnd(pad)}// ${range} ${p.label}${unit}`;
  });
}

const fmt = (v) => typeof v === "string" ? JSON.stringify(v) : String(round2(v));

// The finished source for the editor.
export function familyCode(family, values, { sizedFor = [], title = family.title } = {}) {
  const head = [
    `// ${title}: ${family.summary}`,
    ...sizedFor.map((s) => `// Sized for ${s}`),
    ...(family.print ? [`// Print: ${family.print}`] : []),
    // the family id is how a later chat follow-up knows what this is (edit.js)
    `// Every number below is a slider (Params). From the BREPcode catalog: ${family.id}.`,
  ];
  return [...head, ...paramLines(family, values), "", family.body.trim(), ""].join("\n");
}

// What a family must have. Run by test/catalog.js over every registered
// family, so a new file that forgets a range, or names a param after a DSL
// word (the evaluator passes the vocabulary in as arguments, and `const hook`
// would then be a SyntaxError), fails at once rather than in someone's chat.
export function validateFamily(f, { dslNames = [] } = {}) {
  const bad = [];
  const need = (cond, msg) => { if (!cond) bad.push(`${f?.id ?? "?"}: ${msg}`); };
  need(typeof f.id === "string" && /^[a-z0-9-]+$/.test(f.id), "id must be kebab-case");
  need(CATEGORIES[f.category], `unknown category "${f.category}"`);
  need(typeof f.title === "string" && f.title.length > 2, "title");
  need(typeof f.summary === "string" && f.summary.length > 10, "summary (one sentence)");
  need(Array.isArray(f.names) && f.names.length >= 2, "names: at least two phrases people say");
  need(Array.isArray(f.examples) && f.examples.length >= 2, "examples: at least two full requests");
  need(typeof f.body === "string" && /\breturn\b/.test(f.body), "body must RETURN the part");
  need(f.params && Object.keys(f.params).length >= 2, "params: at least two dials");
  for (const [k, p] of Object.entries(f.params || {})) {
    need(/^[a-z][A-Za-z0-9]*$/.test(k), `param ${k}: camelCase name`);
    need(!dslNames.includes(k), `param ${k} shadows the DSL word ${k}()`);
    need(UNITS.includes(p.unit), `param ${k}: unit must be one of ${UNITS.join("/")}`);
    need(typeof p.label === "string" && p.label.length > 2, `param ${k}: label`);
    if (p.unit === "choice") {
      need(Array.isArray(p.choices) && p.choices.includes(p.default), `param ${k}: default must be one of its choices`);
    } else {
      need(Number.isFinite(p.min) && Number.isFinite(p.max) && p.min < p.max, `param ${k}: min < max`);
      need(p.default >= p.min && p.default <= p.max, `param ${k}: default inside [min, max]`);
    }
    need(new RegExp(`\\b${k}\\b`).test(f.body || ""), `param ${k} is never used in the body`);
    // numbers are tied to params one neighbouring word at a time, so a
    // multi-word `say` can never match
    for (const w of p.say || []) need(!/\s/.test(w.trim()), `param ${k}: say "${w}" is several words; say entries match one word at a time`);
  }
  for (const t of f.things || []) {
    need(Array.isArray(t.names) && t.names.length >= 1, `thing without names`);
    for (const k of Object.keys(t.params || {})) need(f.params?.[k], `thing "${t.names?.[0]}" sets unknown param ${k}`);
  }
  if (f.fits) need(typeof f.fromSpec === "function", "fits needs fromSpec(spec)");
  return bad;
}
