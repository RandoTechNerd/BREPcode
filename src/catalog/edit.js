// Editing a catalog model through the chat, in place.
//
// A catalog model in the editor is ordinary code: a header naming its family,
// one `const` per dial, then the geometry. So a follow-up ("wider", "for a
// Pixel 9", "scale it up 20%", "add another hole", "no cable hole", "twice as
// wide", "bigger drainage hole") never regenerates the file: it reads the
// dials back OUT of the code and rewrites just those const lines. Whatever
// else happened to the file (a fillet the chat wrapped round it, a line the
// user typed) survives, and the sliders keep working.
//
// The family is found from the header line familyCode() writes:
//   // Every number below is a slider (Params). From the BREPcode catalog: phone-stand.
// so this works after a reload, an undo, or a saved .bcode, not only straight
// after the chat made it.

import { familyById, specFor } from "./index.js";
import { resolveParams } from "./schema.js";
import { refineRequest, keyTokens, stem } from "./match.js";

const MARK = /From the BREPcode catalog: ([a-z0-9-]+)\./;

export function catalogOf(code) {
  const m = MARK.exec(String(code || ""));
  return m ? familyById(m[1]) : null;
}

// `const width = 70;`, and also `let`, `var`, or spaces round the `=`: a line
// someone has tidied by hand is still their dial.
const declRe = (k) => new RegExp(`^([ \\t]*(?:const|let|var)\\s+${k}\\s*=\\s*)([^;\\n]+)(;)`, "m");

// The family's dials as the code has them now.
export function readValues(f, code) {
  const out = {};
  for (const [k, p] of Object.entries(f.params)) {
    const m = declRe(k).exec(code);
    if (!m) { out[k] = p.default; continue; }
    const raw = m[2].trim();
    if (p.unit === "choice") out[k] = raw.replace(/^["']|["']$/g, "");
    else out[k] = Number.isFinite(+raw) ? +raw : p.default;
  }
  return out;
}

// The dials whose line is no longer a plain number or choice in the code
// (deleted, renamed, or turned into an expression). A follow-up cannot turn
// those, and must say so rather than claim a change the code does not have.
export function missingDials(f, code) {
  const out = [];
  for (const [k, p] of Object.entries(f.params)) {
    const m = declRe(k).exec(code);
    const raw = m ? m[2].trim() : "";
    const ok = m && (p.unit === "choice" ? /^["'][^"']*["']$/.test(raw) : Number.isFinite(+raw));
    if (!ok) out.push(k);
  }
  return out;
}

const fmt = (p, v) => p.unit === "choice" ? JSON.stringify(v) : String(Math.round(v * 100) / 100);

// Rewrite only the dials named in `keys` (every dial by default); the rest of
// the file, including a line the user rewrote as an expression, is untouched.
export function writeValues(f, code, values, keys = Object.keys(values)) {
  let out = code;
  for (const k of keys) {
    const p = f.params[k];
    if (!p || values[k] === undefined) continue;
    out = out.replace(declRe(k), (_, a, _old, c) => `${a}${fmt(p, values[k])}${c}`);
  }
  return out;
}

// A size that should NOT grow when the whole part is scaled: it matches
// something real (a screw, a phone, a cable) or is a clearance or a wall.
const FIXED = /screw|clearance|room around|\bgap\b|\bfit\b|tolerance|thickness|device|cable diameter|handle diameter/i;
export const scales = (p) => p.unit === "mm" && !p.fixed && !FIXED.test(p.label);

// "scale it 1.5x", "150%", "up 20%", "twice as big", "half the size",
// "bigger", "a bit smaller". null when the words are not about overall size.
// A size pair ("8 x 6", "120 x 80 x 50") is never a factor: the x must not
// be followed by another number.
export function scaleFactor(text) {
  const t = String(text).toLowerCase();
  if (/\b(twice|double|2x|x2)\b/.test(t) && /\b(big|size|large|scale|as|wide|tall|long|deep|high|thick)\b/.test(t)) return 2;
  if (/\b(half|halve)\b/.test(t) && /\b(size|big|scale|small|wide|tall|long|deep|high|thick|width|height|length|depth)\b/.test(t)) return 0.5;
  const pct = /\b(up|bigger|larger|grow|increase)\b[^\d]{0,12}(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*(bigger|larger)/.exec(t);
  if (pct) return 1 + +(pct[2] ?? pct[3]) / 100;
  const dn = /\b(down|smaller|shrink|decrease)\b[^\d]{0,12}(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*smaller/.exec(t);
  if (dn) return 1 - +(dn[2] ?? dn[3]) / 100;
  const to = /\bscale\b[^\d]{0,12}(?:to\s*)?(\d+(?:\.\d+)?)\s*%/.exec(t);
  if (to) return +to[1] / 100;
  const x = /\bscale\b[^\d]{0,12}(?:by\s*)?(\d+(?:\.\d+)?)\s*(?:x|times)?\b(?!\s*(?:x|by)\s*\d)/.exec(t)
    || /\b(\d+(?:\.\d+)?)\s*(?:x|times)(?!\s*\d)\s*(?:bigger|larger|the size|as big|as wide|as tall|as long)?\b/.exec(t);
  if (x && +x[1] > 0 && +x[1] <= 10) return +x[1];
  if (/\b(scale (it )?up|bigger|larger)\b/.test(t)) return /\b(bit|little|slightly)\b/.test(t) ? 1.1 : 1.25;
  if (/\b(scale (it )?down|smaller)\b/.test(t)) return /\b(bit|little|slightly)\b/.test(t) ? 0.9 : 0.8;
  return null;
}

// "round the edges" is a verb; "a round hole" is an adjective and belongs to
// the hole request, so a noun right after "round" is not rounding.
const ROUND = /\b(round(?:ed)?(?!\s+(?:hole|holes|slot|cutout|base|tray|box|dish|disc|disk|peg|rod|bar|tube|pipe|knob|button|loop|ring|coin|magnet|cup|pot|window|opening|notch))|smooth(?:er)?|soften|soft|sharp|square)\b[^.]{0,20}\b(edge|edges|corner|corners|it|off|out)\b|\bfillet\b|^\s*smooth(?:er)?(?: it)?(?: out)?\s*$|\brounder\b/;
const HOLES = /\b(another|more|extra|add|second|third|one more|put|drill|bore|punch)\b[^.]{0,20}\b(hole|holes|screw hole|screw holes|drill hole)\b|\b(fewer|less|remove a|one less)\b[^.]{0,12}\bholes?\b|\b(\d+)\s+(?:screw\s+|more\s+|extra\s+)?holes\b/;

// The dial that does a job, when the family has one: `role: "round"` for the
// edge or corner radius, `role: "holes"` for how many screw or drill holes.
// A count dial that answers to "hole" counts as the holes dial even without
// the role: "6 holes" on a toothbrush stand is its own dial, not a drill.
const byRole = (f, role) => Object.entries(f.params).find(([, p]) => p.role === role)?.[0]
  || (role === "holes" ? Object.entries(f.params).find(([, p]) => p.unit === "count" && (p.say || []).some((s) => /^holes?$/.test(s)))?.[0] : null)
  || null;

// A follow-up that names one of the family's own THINGS ("twisted hexagon",
// "a D-ring", "a set of 6"): that thing's presets go on, and its object.
function thingNamed(f, lower) {
  const toks = keyTokens(lower);
  if (!toks.length) return null;
  // the family's own words ("napkin", "ring") are a given with the model
  // open: "hexagon" alone names the hexagon napkin ring
  const own = new Set([...(f.names || []), ...(f.nouns || [])].flatMap((n) => keyTokens(n)));
  let best = null;
  (f.things || []).forEach((t) => {
    for (const n of t.names) {
      const p = keyTokens(n);
      const rest = p.filter((w) => !own.has(w));
      if (!rest.length) continue;
      const whole = p.length <= toks.length && toks.some((_, i) => p.every((w, j) => toks[i + j] === w));
      const distinct = rest.every((w) => toks.includes(w)) && toks.every((w) => p.includes(w) || own.has(w));
      if (!whole && !distinct) continue;
      const len = whole ? p.length + 1 : rest.length;
      if (!best || len > best.len) best = { thing: t, len };
    }
  });
  return best?.thing || null;
}

// The dials a word names: by its say list, or its more/less comparatives.
export function dialsFor(f, word) {
  const w = stem(String(word || "").toLowerCase());
  if (!w) return [];
  return Object.entries(f.params)
    .filter(([, p]) => [...(p.say || []), ...(p.more || []), ...(p.less || [])].some((s) => stem(s.toLowerCase()) === w))
    .map(([k]) => k);
}

// "twice as wide", "half the height": the dial that word names, times k
const AXIS_WORDS = /\b(wide|wider|width|tall|taller|height|high|higher|long|longer|length|deep|deeper|depth|thick|thicker|thickness)\b/;
const AXIS_SAY = { wider: "wide", width: "wide", taller: "tall", height: "tall", higher: "high", longer: "long", length: "long", deeper: "deep", depth: "deep", thicker: "thick", thickness: "thick" };

// "bigger drainage hole", "make the loop smaller", "a wider slot": the dial
// the noun names moves, and nothing else. Generic words ("it", "the model")
// name no dial, so those go on to the whole-model paths.
const COMPARATIVES = { bigger: 1.25, larger: 1.25, wider: 1.25, taller: 1.25, longer: 1.25, deeper: 1.25, thicker: 1.25, higher: 1.25,
  smaller: 0.8, narrower: 0.8, shorter: 0.8, thinner: 0.8, shallower: 0.8, lower: 0.8 };
const GENERIC = new Set(["it", "this", "that", "thing", "model", "part", "whole", "everything", "all", "piece", "design", "one"]);
// the object a family can be sized to, named without a model ("bigger phone")
const OBJECT_WORD = /^(phone|phones|tablet|tablets|device|devices|laptop|mat|roller|hose|cable|cables|cord|wire|bottle|can|jar|handle|broom|mop|tool|bag|book|cup|mug|glass)$/;
function featureNudge(f, lower, now) {
  const comps = Object.keys(COMPARATIVES).join("|");
  const after = new RegExp(`\\b(${comps})\\s+(?:the\\s+|a\\s+|an\\s+|its\\s+)?([a-z]+)(?:\\s+([a-z]+))?`).exec(lower);
  const before = new RegExp(`\\b(?:make|turn|get|want)\\s+(?:the\\s+|its\\s+|a\\s+|an\\s+)?([a-z]+)(?:\\s+([a-z]+))?\\s+(?:a\\s+(?:bit|little)\\s+)?(${comps})\\b`).exec(lower);
  let comp = null, nouns = [];
  if (after) { comp = after[1]; nouns = [after[2], after[3]]; }
  else if (before) { comp = before[3]; nouns = [before[1], before[2]]; }
  // "more ribs", "fewer windows", "lean back more": a count up or down by
  // one, a size by a quarter
  if (!comp) {
    const m = /\b(more|fewer|less|extra|additional)\s+(?:of\s+)?(?:the\s+)?([a-z]+)(?:\s+([a-z]+))?/.exec(lower)
      || /\b([a-z]+)(?:\s+([a-z]+))?\s+(more|less)\s*$/.exec(lower);
    if (m) {
      const up = /^(more|extra|additional)$/.test(m[1]) || m[3] === "more";
      // "two more dividers": by that many, not by one
      const by = +(/\b(\d+)\s+(?:more|fewer|less|extra|additional)\b/.exec(lower)?.[1] || 1);
      const words = (/^(more|fewer|less|extra|additional)$/.test(m[1]) ? [m[2], m[3]] : [m[1], m[2]]).filter((n) => n && !GENERIC.has(n));
      for (const n of words) {
        const dials = dialsFor(f, n).filter((k) => ["mm", "deg", "count"].includes(f.params[k].unit));
        if (!dials.length) continue;
        const next = { ...now };
        for (const k of dials) next[k] = f.params[k].unit === "count" ? now[k] + (up ? by : -by) : now[k] * (up ? 1.25 : 0.8);
        return { next, kind: "nudge", note: { factor: up ? 1.25 : 0.8, dials } };
      }
    }
    return null;
  }
  nouns = nouns.filter((n) => n && !GENERIC.has(n) && !COMPARATIVES[n] && !/^(bit|little|slightly|much|lot)$/.test(n));
  if (!nouns.length) return null;
  const small = /\b(bit|little|slightly)\b/.test(lower);
  const factor = small ? (COMPARATIVES[comp] > 1 ? 1.1 : 0.9) : COMPARATIVES[comp];
  for (const n of nouns) {
    const dials = dialsFor(f, n).filter((k) => f.params[k].unit === "mm" || f.params[k].unit === "deg");
    if (dials.length) {
      const next = { ...now };
      for (const k of dials) next[k] = now[k] * factor;
      return { next, kind: "nudge", note: { factor, dials } };
    }
  }
  // "bigger phone": not a dial, the object it is sized to
  if (nouns.some((n) => OBJECT_WORD.test(n)) && f.fits?.length) return { kind: "ask-spec" };
  return null;
}

// "no cable hole", "without the lip", "remove the drain": a dial that can be
// zero goes to zero. "add a divider", "with a lid hole": a dial sitting at
// zero comes up to its default, a count goes up by one.
const zeroable = (p) => (p.unit === "mm" || p.unit === "count") && p.min <= 0;
const sayStems = (p) => (p.say || []).map((s) => stem(s.toLowerCase()));
function toggles(f, lower, now) {
  const toks = lower.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const stems = toks.map((t) => stem(t));
  const next = {};
  let kind = null;
  for (let i = 0; i < toks.length; i++) {
    const neg = /^(no|without|remove|drop|delete|lose|skip|minus|zero|kill)$/.test(toks[i])
      || (toks[i] === "take" && /^(off|out|away)$/.test(toks[i + 1] || ""))
      || (toks[i] === "get" && toks[i + 1] === "rid");
    const add = /^(add|with|include|plus|another|extra)$/.test(toks[i])
      || (toks[i] === "one" && toks[i + 1] === "more")
      || (toks[i] === "put" && /^(in|on|back)$/.test(toks[i + 1] || ""));
    if (!neg && !add) continue;
    // "add two more dividers": by that many; "with 2 dividers" (a digit) is
    // a number for the dial itself and not a toggle
    const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    let by = 1;
    for (let j = i + 1; j <= Math.min(toks.length - 1, i + 4); j++) {
      if (/^\d/.test(toks[j])) break;
      if (WORDS[toks[j]]) { by = WORDS[toks[j]]; continue; }
      const w = stems[j];
      for (const [k, p] of Object.entries(f.params)) {
        if (next[k] !== undefined || !sayStems(p).includes(w)) continue;
        if (neg && zeroable(p) && now[k] > p.min) { next[k] = p.min; kind ||= "none"; }
        else if (add && p.unit === "count") { next[k] = now[k] + by; kind ||= "add"; }
        else if (add && zeroable(p)) {
          // already on: say so rather than drill a second one somewhere else
          next[k] = now[k] > p.min ? now[k] : p.default > p.min ? p.default : Math.min(p.max, p.min + (p.max - p.min) / 3);
          kind ||= "add";
        }
      }
      if (Object.keys(next).length) break;
    }
  }
  return kind ? { next: { ...now, ...next }, kind, dials: Object.keys(next) } : null;
}

// A follow-up on a catalog model. Returns { code, values, changes, kind, ... }
// or null when the message is nothing this family's dials can answer.
export function editCatalog(f, code, text, { specId = null } = {}) {
  const now = readValues(f, code);
  const memo = { familyId: f.id, thingIdx: null, specId, values: now };
  const lower = String(text).toLowerCase();

  let kind = null, next = null, spec = null, used = [], clamped = [], note = null;

  // a dial named outright wins: "add a cable hole" turns the cable-hole dial
  // back up, it does not drill a new hole; "no cable hole" turns it off
  const tog = toggles(f, lower, now);
  // one of the family's own things, by name: its presets and its object
  const named = tog ? null : thingNamed(f, lower);
  // holes before rounding: "put a round hole through it" is a hole
  if (tog) { next = tog.next; kind = tog.kind; note = { dials: tog.dials }; }
  else if (named && !HOLES.test(lower)) {
    const s = named.spec ? specFor(named.spec) : null;
    const sized = s && f.fromSpec ? f.fromSpec(s) : null;
    next = { ...now, ...(named.params || {}), ...(sized || {}) };
    if (s) spec = s;
    kind = "thing";
    note = { thing: named.title || named.names[0] };
  }
  else if (HOLES.test(lower)) {
    const k = byRole(f, "holes");
    if (!k) return { kind: "holes-generic", family: f };
    const n = /\b(\d+)\s+(?:screw\s+|more\s+|extra\s+)?holes\b/.exec(lower);
    const less = /\b(fewer|less|remove a|one less)\b/.test(lower);
    const more = /\b(more|extra|another|one more|second|third)\b/.test(lower) && !n;
    next = { ...now, [k]: n ? (more ? now[k] + +n[1] : +n[1]) : now[k] + (less ? -1 : 1) };
    kind = "holes";
  } else if (ROUND.test(lower)) {
    // rounding: a radius dial if it has one; otherwise the caller wraps a fillet
    const k = byRole(f, "round");
    if (!k) return { kind: "round-generic", family: f };
    const p = f.params[k];
    const asked = /(\d+(?:\.\d+)?)\s*mm/.exec(lower);
    const sharp = /\b(sharp|square|less round|unround|no round)\b/.test(lower);
    const v = asked ? +asked[1] : sharp ? p.min : Math.min(p.max, Math.max(now[k] * 1.6, now[k] + 2));
    next = { ...now, [k]: v };
    kind = "round";
  } else {
    const nudge = featureNudge(f, lower, now);
    if (nudge?.kind === "ask-spec") return { kind: "ask-spec", family: f };
    else if (nudge) { next = nudge.next; kind = nudge.kind; note = nudge.note; }
    else {
      const k = scaleFactor(lower);
      const axis = AXIS_WORDS.exec(lower)?.[1];
      if (k && axis) {
        // "twice as wide": the dial that word names, times k
        const dials = [...new Set([...dialsFor(f, axis), ...dialsFor(f, AXIS_SAY[axis] || axis)])]
          .filter((d) => f.params[d].unit === "mm");
        if (dials.length) {
          next = { ...now };
          for (const d of dials) next[d] = now[d] * k;
          kind = "scale-axis";
          note = { factor: k, dials };
        }
      } else if (k) {
        next = { ...now };
        for (const [name, p] of Object.entries(f.params)) if (scales(p)) next[name] = now[name] * k;
        kind = "scale";
        note = { factor: k };
      }
      if (!kind) {
        const r = refineRequest(memo, text);
        if (!r) return null;
        next = r.values; spec = r.changedSpec ? r.spec : null; used = r.used || [];
        clamped = r.clamped || [];
        kind = "refine";
      }
    }
  }

  const res = resolveParams(f, next);
  for (const c of res.clamped) if (!clamped.some((x) => x.param === c.param)) clamped.push(c);
  const changes = Object.keys(res.values).filter((k) => res.values[k] !== now[k])
    .map((k) => ({ k, from: now[k], to: res.values[k] }));
  if (!changes.length && !spec) return { kind: "no-change", family: f, clamped, already: kind === "add" ? note?.dials?.[0] : null, values: now };
  // a dial whose line the user has rewritten cannot be turned from here
  const missing = missingDials(f, code);
  const gone = changes.filter((c) => missing.includes(c.k)).map((c) => c.k);
  if (gone.length) return { kind: "missing-dial", family: f, missing: gone };
  let out = writeValues(f, code, res.values, changes.map((c) => c.k));
  if (spec) {
    // the "Sized for" line follows the new object
    const line = `// Sized for ${spec.note || spec.label}`;
    out = /^\/\/ Sized for .*$/m.test(out) ? out.replace(/^\/\/ Sized for .*$/m, line) : out.replace(/\n/, `\n${line}\n`);
  }
  return { kind, family: f, code: out, values: res.values, changes, clamped, spec, used, note,
    specId: spec?.id || specId };
}

// What this family's dials can do, for "I can't do that, but I can…"
export function capabilities(f) {
  const out = [];
  for (const [, p] of Object.entries(f.params)) {
    if (p.unit === "choice") out.push(`${p.label} (${p.choices.join(" / ")})`);
    else out.push(p.label);
  }
  return out;
}

export { keyTokens, specFor };
