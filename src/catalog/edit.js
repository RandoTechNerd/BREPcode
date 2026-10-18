// Editing a catalog model through the chat, in place.
//
// A catalog model in the editor is ordinary code: a header naming its family,
// one `const` per dial, then the geometry. So a follow-up ("wider", "for a
// Pixel 9", "scale it up 20%", "add another hole") never regenerates the file:
// it reads the dials back OUT of the code and rewrites just those const
// lines. Whatever else happened to the file (a fillet the chat wrapped round
// it, a line the user typed) survives, and the sliders keep working.
//
// The family is found from the header line familyCode() writes:
//   // Every number below is a slider (Params). From the BREPcode catalog: phone-stand.
// so this works after a reload, an undo, or a saved .bcode, not only straight
// after the chat made it.

import { familyById, specFor } from "./index.js";
import { resolveParams } from "./schema.js";
import { refineRequest, keyTokens } from "./match.js";

const MARK = /From the BREPcode catalog: ([a-z0-9-]+)\./;

export function catalogOf(code) {
  const m = MARK.exec(String(code || ""));
  return m ? familyById(m[1]) : null;
}

const declRe = (k) => new RegExp(`^(const ${k} = )([^;\\n]+)(;)`, "m");

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

const fmt = (p, v) => p.unit === "choice" ? JSON.stringify(v) : String(Math.round(v * 100) / 100);

// Rewrite only the dials that changed; the rest of the file is untouched.
export function writeValues(f, code, values) {
  let out = code;
  for (const [k, v] of Object.entries(values)) {
    const p = f.params[k];
    if (!p) continue;
    out = out.replace(declRe(k), (_, a, _old, c) => `${a}${fmt(p, v)}${c}`);
  }
  return out;
}

// A size that should NOT grow when the whole part is scaled: it matches
// something real (a screw, a phone, a cable) or is a clearance or a wall.
const FIXED = /screw|clearance|room around|\bgap\b|\bfit\b|tolerance|thickness|device|cable diameter|handle diameter/i;
export const scales = (p) => p.unit === "mm" && !p.fixed && !FIXED.test(p.label);

// "scale it 1.5x", "150%", "up 20%", "twice as big", "half the size",
// "bigger", "a bit smaller". null when the words are not about overall size.
export function scaleFactor(text) {
  const t = String(text).toLowerCase();
  if (/\b(twice|double|2x|x2)\b/.test(t) && /\b(big|size|large|scale|as)\b/.test(t)) return 2;
  if (/\b(half|halve)\b/.test(t) && /\b(size|big|scale|small)\b/.test(t)) return 0.5;
  const pct = /\b(up|bigger|larger|grow|increase)\b[^\d]{0,12}(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*(bigger|larger)/.exec(t);
  if (pct) return 1 + +(pct[2] ?? pct[3]) / 100;
  const dn = /\b(down|smaller|shrink|decrease)\b[^\d]{0,12}(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*smaller/.exec(t);
  if (dn) return 1 - +(dn[2] ?? dn[3]) / 100;
  const to = /\bscale\b[^\d]{0,12}(?:to\s*)?(\d+(?:\.\d+)?)\s*%/.exec(t);
  if (to) return +to[1] / 100;
  const x = /\bscale\b[^\d]{0,12}(?:by\s*)?(\d+(?:\.\d+)?)\s*(?:x|times)?\b/.exec(t) || /\b(\d+(?:\.\d+)?)\s*(?:x|times)\s*(?:bigger|larger|the size|as big)?\b/.exec(t);
  if (x && +x[1] > 0 && +x[1] <= 10) return +x[1];
  if (/\b(scale (it )?up|bigger|larger)\b/.test(t)) return /\b(bit|little|slightly)\b/.test(t) ? 1.1 : 1.25;
  if (/\b(scale (it )?down|smaller)\b/.test(t)) return /\b(bit|little|slightly)\b/.test(t) ? 0.9 : 0.8;
  return null;
}

const ROUND = /\b(round(?:ed)?|smooth(?:er)?|soften|soft)\b[^.]{0,20}\b(edge|edges|corner|corners|it|off|out)\b|\bfillet\b|^\s*smooth(?: it)?\s*$|\brounder\b/;
const HOLES = /\b(another|more|extra|add|second|third|one more)\b[^.]{0,20}\b(hole|holes|screw hole|screw holes|drill hole)\b|\b(fewer|less|remove a|one less)\b[^.]{0,12}\bholes?\b|\b(\d+)\s+(?:screw\s+)?holes\b/;

// The dial that does a job, when the family has one: `role: "round"` for the
// edge or corner radius, `role: "holes"` for how many screw or drill holes.
const byRole = (f, role) => Object.entries(f.params).find(([, p]) => p.role === role)?.[0] || null;

// A follow-up on a catalog model. Returns { code, values, changes, kind, ... }
// or null when the message is nothing this family's dials can answer.
export function editCatalog(f, code, text, { specId = null } = {}) {
  const now = readValues(f, code);
  const memo = { familyId: f.id, thingIdx: null, specId, values: now };
  const lower = String(text).toLowerCase();

  let kind = null, next = null, spec = null, used = [], clamped = [], note = null;

  // rounding: a radius dial if it has one; otherwise the caller wraps a fillet
  if (ROUND.test(lower)) {
    const k = byRole(f, "round");
    if (!k) return { kind: "round-generic", family: f };
    const p = f.params[k];
    const asked = /(\d+(?:\.\d+)?)\s*mm/.exec(lower);
    const v = asked ? +asked[1] : Math.min(p.max, Math.max(now[k] * 1.6, now[k] + 2));
    next = { ...now, [k]: v };
    kind = "round";
  } else if (HOLES.test(lower)) {
    const k = byRole(f, "holes");
    if (!k) return { kind: "holes-generic", family: f };
    const n = /\b(\d+)\s+(?:screw\s+)?holes\b/.exec(lower);
    const less = /\b(fewer|less|remove a|one less)\b/.test(lower);
    next = { ...now, [k]: n ? +n[1] : now[k] + (less ? -1 : 1) };
    kind = "holes";
  } else {
    const k = scaleFactor(lower);
    // a scale request with an axis word ("twice as wide") is a resize, below
    if (k && !/\b(wide|wider|tall|taller|long|longer|deep|deeper|high|higher)\b/.test(lower)) {
      next = { ...now };
      // sized for a real object (a yoga mat, a broom handle): that fit stays
      const sized = /^\/\/ Sized for /m.test(code);
      for (const [name, p] of Object.entries(f.params)) {
        if (scales(p) && !(sized && name === f.primary)) next[name] = now[name] * k;
      }
      kind = "scale";
      note = { factor: k };
    } else {
      const r = refineRequest(memo, text);
      if (!r) return null;
      next = r.values; spec = r.changedSpec ? r.spec : null; used = r.used || [];
      kind = "refine";
    }
  }

  const res = resolveParams(f, next);
  clamped = res.clamped;
  const changes = Object.keys(res.values).filter((k) => res.values[k] !== now[k])
    .map((k) => ({ k, from: now[k], to: res.values[k] }));
  if (!changes.length && !spec) return { kind: "no-change", family: f, clamped };
  let out = writeValues(f, code, res.values);
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
