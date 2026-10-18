// Reading a request against the catalog, with no AI.
//
// "make me a hook for yoga roll" has three things in it: what to make (a
// hook), what it is FOR (a rolled yoga mat, a real object with a real size)
// and, sometimes, numbers ("70 degrees", "3 cables", "120 mm wide"). Each is
// found separately and then combined:
//
//   1. SPECS first. The longest alias of a known object wins ("iphone 15 pro
//      max" over "iphone 15"), and its KIND (phone, round, cable…) says which
//      families can be sized by it.
//   2. FAMILIES are scored: a whole name phrase ("phone stand") is strong, a
//      bare head noun ("hook", "stand") is weak, and a spec the family can use
//      adds enough to carry a weak noun over the line. So "hook for yoga mat"
//      lands on the cradle hook, while "hook" alone matches nothing and goes
//      on to the older rule-engine paths, which is the right answer for a
//      word that vague.
//   3. NUMBERS are tied to params by the words around them ("120 mm wide"
//      goes to the param that answers to "wide") or by unit ("70 degrees" to
//      the one angle). Anything that cannot be tied to a param is ignored, not
//      guessed.
//
// The same scorer is the whole test of a new family: its own example requests
// must route to it, and the rule-engine's primitive requests ("a box with a
// cone on top") must route to nothing (test/catalog.js).

import { FAMILIES, SPECS, CATEGORIES, familyById, specFor } from "./index.js";
import { resolveParams, familyCode } from "./schema.js";

// ---------------------------------------------------------------- words

const STOP = new Set(["a", "an", "the", "me", "my", "i", "im", "want", "need", "make", "build",
  "print", "printed", "create", "design", "please", "can", "you", "could", "would", "like",
  "some", "something", "to", "of", "with", "for", "and", "that", "this", "it", "is", "be",
  "one", "new", "nice", "simple", "little", "do", "get", "give", "model", "3", "d", "3d",
  "on", "in", "into", "so", "just", "our", "your", "id", "lets", "let", "us", "kind",
  "sort", "type", "thing", "hey", "hi", "how", "about"]);

export function stem(w) {
  if (/^\d/.test(w) || w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

// lowercase, "+" -> plus, letters split from digits ("s24" -> "s 24"),
// punctuation gone except a decimal point inside a number
export function normalise(text) {
  return String(text).toLowerCase()
    .replace(/(\d)\s*(?:["”″]|''|inches|inch)(?![a-z])/g, "$1 in ")
    .replace(/(\d)\s*°/g, "$1 deg ")
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .trim();
}
const allTokens = (text) => normalise(text).split(/\s+/).filter(Boolean);
// stop words go BEFORE stemming: "this" would otherwise stem to "thi" and stay
export const keyTokens = (text) => allTokens(text).filter((w) => !STOP.has(w)).map(stem);

// Does `phrase` appear in `toks` as a run of words? Returns its index or -1.
function findRun(toks, phrase) {
  const p = phrase;
  if (!p.length) return -1;
  outer: for (let i = 0; i + p.length <= toks.length; i++) {
    for (let j = 0; j < p.length; j++) if (toks[i + j] !== p[j]) continue outer;
    return i;
  }
  return -1;
}

// Model names keep EVERY word: "Pixel 9a" is "pixel 9 a", and dropping the
// "a" as filler made "for a Pixel 9" read as a 9a.
const specTokens = (text) => allTokens(text).map(stem);

// Phrases are tokenised once, lazily, per family / spec.
const phraseCache = new WeakMap();
function phrasesOf(obj, key, tok = keyTokens) {
  let m = phraseCache.get(obj);
  if (!m) { m = {}; phraseCache.set(obj, m); }
  return (m[key] ??= (obj[key] || []).map((n) => tok(n)).filter((t) => t.length));
}

// "a clip for coffee bags" means a coffee bag clip, and "a hook for my yoga
// mat" a yoga mat hook. English puts the purpose after "for"; names put it
// first. So a request is also read with the words after "for" moved in
// front of the noun before it, and a phrase may match either reading.
const FILLER = new Set(["a", "an", "the", "my", "our", "your", "his", "her", "their", "some"]);
export function readings(text) {
  const raw = allTokens(text);
  const out = [keyTokens(text)];
  const at = raw.indexOf("for");
  if (at > 0) {
    const head = raw[at - 1];
    const tail = [];
    for (let j = at + 1; j < raw.length && tail.length < 4; j++) {
      if (FILLER.has(raw[j])) continue;
      if (STOP.has(raw[j]) || /^\d/.test(raw[j])) break;
      tail.push(raw[j]);
    }
    if (tail.length) out.push(keyTokens([...tail, head].join(" ")));
  }
  return out;
}

// ---------------------------------------------------------------- specs

export function findSpec(text, { kinds = null } = {}) {
  const toks = specTokens(text);
  let best = null;
  for (const s of SPECS) {
    if (kinds && !kinds.includes(s.kind)) continue;
    for (const p of phrasesOf(s, "names", specTokens)) {
      if (findRun(toks, p) < 0) continue;
      const len = p.length * 100 + p.join(" ").length;
      if (!best || len > best.len) best = { spec: s, len };
    }
  }
  return best?.spec || null;
}

// ---------------------------------------------------------------- scoring

function scoreFamily(f, reads, spec) {
  let best = { score: 0, thing: null, named: false };
  for (const toks of reads) {
    const r = scoreReading(f, toks, spec);
    if (r.score > best.score) best = r;
  }
  return best;
}
function scoreReading(f, toks, spec) {
  let phrase = 0, thing = null;
  for (const p of phrasesOf(f, "names")) {
    if (findRun(toks, p) >= 0) phrase = Math.max(phrase, 10 + 3 * (p.length - 1));
  }
  (f.things || []).forEach((t, i) => {
    for (const p of phrasesOf(t, "names")) {
      if (findRun(toks, p) < 0) continue;
      const w = 12 + 3 * (p.length - 1);
      if (w > phrase && (!thing || w > thing.w)) thing = { i, w };
    }
  });
  let nouns = 0;
  for (const p of phrasesOf(f, "nouns")) if (findRun(toks, p) >= 0) nouns += 4;
  let kw = 0;
  for (const p of phrasesOf(f, "keywords")) if (findRun(toks, p) >= 0) kw += 1;
  const fits = spec && (f.fits || []).includes(spec.kind) ? 6 : 0;
  const score = Math.max(phrase, thing?.w || 0) + Math.min(nouns, 8) + Math.min(kw, 3) + fits;
  // no thing named outright: a thing whose own keywords appear still wins
  // ("a hook under my desk for my backpack" is the bag hook)
  if (!thing) {
    (f.things || []).forEach((t, i) => {
      if (!thing && phrasesOf(t, "keywords").some((p) => findRun(toks, p) >= 0)) thing = { i, w: 0 };
    });
  }
  return { score, thing: thing ? thing.i : null, named: phrase > 0 || !!thing };
}

export const THRESHOLD = 9;

export function rankFamilies(text) {
  const reads = readings(text);
  const spec = findSpec(text);
  return FAMILIES.map((f) => ({ family: f, ...scoreFamily(f, reads, spec) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------- numbers

const UNIT_WORDS = {
  mm: ["mm", "millimeter", "millimeters", "millimetre", "millimetres"],
  cm: ["cm", "centimeter", "centimeters", "centimetre", "centimetres"],
  in: ["in", "inch", "inches"],
  deg: ["deg", "degree", "degrees"],
};
const unitOf = (w) => Object.keys(UNIT_WORDS).find((u) => UNIT_WORDS[u].includes(w)) || null;

// Every number in the request, with its unit and the words around it.
export function readNumbers(text) {
  const toks = allTokens(text);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (!/^\d+(\.\d+)?$/.test(toks[i])) continue;
    const v = +toks[i];
    const u = unitOf(toks[i + 1]);
    let value = v, kind = u === "deg" ? "deg" : u ? "mm" : null;
    if (u === "cm") value = v * 10;
    if (u === "in") value = v * 25.4;
    const near = [];
    for (let j = Math.max(0, i - 3); j <= Math.min(toks.length - 1, i + 4); j++) {
      if (j === i || /^\d/.test(toks[j]) || unitOf(toks[j])) continue;
      near.push({ w: stem(toks[j]), dist: Math.abs(j - i), after: j > i });
    }
    out.push({ value, unit: kind, raw: v, near, at: i });
  }
  return out;
}

// Tie numbers to params. Returns overrides and the numbers it used.
function numbersToParams(f, text) {
  const nums = readNumbers(text);
  const over = {}, used = [];
  const taken = new Set();
  const sayOf = (p) => (p.say || []).map((s) => stem(s.toLowerCase()));
  const pick = (n, cands) => {
    let best = null;
    for (const [k, p] of cands) {
      if (taken.has(k)) continue;
      const hit = n.near.find((w) => sayOf(p).includes(w.w));
      if (hit && (!best || hit.dist < best.dist)) best = { k, dist: hit.dist };
    }
    return best?.k || null;
  };
  const entries = Object.entries(f.params);
  // "120 x 80 x 50": sizes in the family's own order (width, depth, height)
  const skip = new Set();
  if (f.triple) {
    const toks = allTokens(text);
    for (let i = 0; i < toks.length; i++) {
      const run = [];
      let j = i;
      while (/^\d+(\.\d+)?$/.test(toks[j] || "") && run.length < f.triple.length) {
        run.push(j);
        if (toks[j + 1] !== "x") break;
        j += 2;
      }
      if (run.length < 2) continue;
      const unit = unitOf(toks[run[run.length - 1] + 1]);
      const k = unit === "cm" ? 10 : unit === "in" ? 25.4 : 1;
      run.forEach((ti, idx) => {
        const name = f.triple[idx];
        over[name] = +toks[ti] * k; taken.add(name); skip.add(ti);
        used.push({ param: name, value: over[name] });
      });
      break;
    }
  }
  for (const n of nums) {
    if (skip.has(n.at)) continue;
    let k = null;
    if (n.unit === "deg") {
      const degs = entries.filter(([, p]) => p.unit === "deg");
      k = pick(n, degs) || degs.find(([kk]) => !taken.has(kk))?.[0] || null;
    } else {
      // counts first: "3 cables" — an integer straight before a count word
      const counts = entries.filter(([, p]) => p.unit === "count");
      if (!n.unit && Number.isInteger(n.raw)) {
        const c = counts.find(([kk, p]) => !taken.has(kk) && n.near.some((w) => w.after && w.dist <= 2 && sayOf(p).includes(w.w)));
        if (c) k = c[0];
      }
      if (!k) k = pick(n, entries.filter(([, p]) => p.unit === "mm"));
      if (!k && n.unit === "mm" && f.primary && !taken.has(f.primary)) k = f.primary;
    }
    if (!k) continue;
    taken.add(k);
    over[k] = n.value;
    used.push({ param: k, value: n.value });
  }
  // choice params: a word that names a choice selects it
  const toks = keyTokens(text);
  for (const [k, p] of entries) {
    if (p.unit !== "choice" || !p.words) continue;
    for (const [choice, words] of Object.entries(p.words)) {
      if (words.some((w) => findRun(toks, keyTokens(w)) >= 0)) { over[k] = choice; break; }
    }
  }
  return { over, used };
}

// "wider", "taller", "smaller": a nudge on whatever is there now
function nudges(f, text, current) {
  const toks = keyTokens(text);
  const over = {};
  for (const [k, p] of Object.entries(f.params)) {
    if (p.unit !== "mm" && p.unit !== "deg") continue;
    const up = (p.more || []).some((w) => toks.includes(stem(w)));
    const down = (p.less || []).some((w) => toks.includes(stem(w)));
    if (up) over[k] = current[k] * (p.unit === "deg" ? 1.08 : 1.2);
    if (down) over[k] = current[k] / (p.unit === "deg" ? 1.08 : 1.2);
  }
  return over;
}

// ---------------------------------------------------------------- results

function describeSpec(s) {
  if (s.note) return s.note;
  const d = s.dims;
  if (d.h && d.w && d.t) return `${s.label} (${d.h} x ${d.w} x ${d.t} mm)`;
  if (d.d) return `${s.label} (${d.d} mm across)`;
  return s.label;
}

// Build the result for a family + layers of overrides.
function assemble(f, { thingIdx = null, spec = null, over = {}, base = null } = {}) {
  const thing = thingIdx == null ? null : f.things[thingIdx];
  const thingSpec = !spec && thing?.spec ? specFor(thing.spec) : null;
  const useSpec = spec || thingSpec;
  const fromSpec = useSpec && f.fromSpec ? f.fromSpec(useSpec) : null;
  const { values, clamped } = resolveParams(f, base, thing?.params, fromSpec, over);
  const sizedFor = useSpec ? [describeSpec(useSpec) + (f.specNote ? `; ${f.specNote}` : "")] : [];
  const title = thing?.title || (thing ? cap(thing.names[0]) : f.title);
  let question = null;
  if (f.ask && !useSpec && !(f.ask.unless || []).some((k) => over[k] !== undefined)) question = f.ask;
  return {
    family: f, familyId: f.id, thing, thingIdx, spec: useSpec, values, clamped, sizedFor, question, title,
    code: familyCode(f, values, { sizedFor, title }),
    memo: { familyId: f.id, thingIdx, specId: useSpec?.id || null, values },
  };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A fresh request. null when nothing in the catalog is a confident match.
export function matchRequest(text) {
  const ranked = rankFamilies(text);
  const top = ranked[0];
  if (!top || top.score < THRESHOLD) return null;
  const f = top.family;
  const spec = findSpec(text, { kinds: f.fits || [] });
  // "a hook for my yoga mat" names no thing, but the spec it names has one
  let thingIdx = top.thing;
  if (thingIdx == null && spec) {
    const i = (f.things || []).findIndex((t) => t.spec === spec.id);
    if (i >= 0) thingIdx = i;
  }
  const { over, used } = numbersToParams(f, text);
  const res = assemble(f, { thingIdx, spec, over });
  res.score = top.score;
  res.used = used;
  res.alternatives = ranked.slice(1, 3)
    .filter((r) => r.score >= THRESHOLD && r.family.id !== f.id && top.score - r.score <= 3)
    .map((r) => r.family.title);
  return res;
}

// A follow-up to something the catalog made: "for a Pixel 9", "75 degrees",
// "wider". null when the message says nothing this family can use, so other
// handlers get their turn.
export function refineRequest(memo, text) {
  const f = familyById(memo?.familyId);
  if (!f) return null;
  const spec = findSpec(text, { kinds: f.fits || [] });
  const { over, used } = numbersToParams(f, text);
  const nudge = nudges(f, text, memo.values);
  if (!spec && !used.length && !Object.keys(over).length && !Object.keys(nudge).length) return null;
  const keepSpec = spec || (memo.specId ? specFor(memo.specId) : null);
  // Earlier values stay, except those the new spec would size: naming a
  // different phone must re-measure the slot, not keep the old one.
  const base = { ...memo.values };
  if (spec && f.fromSpec) for (const k of Object.keys(f.fromSpec(spec) || {})) delete base[k];
  const res = assemble(f, { thingIdx: memo.thingIdx, spec: keepSpec, over: { ...nudge, ...over }, base });
  res.used = used;
  res.changedSpec = !!spec;
  return res;
}

// "what can you make"
export function catalogSummary() {
  const per = {};
  for (const f of FAMILIES) (per[f.category] ||= []).push(f.title.toLowerCase());
  return Object.entries(per).map(([c, list]) => `${CATEGORIES[c]}: ${list.join(", ")}`);
}
