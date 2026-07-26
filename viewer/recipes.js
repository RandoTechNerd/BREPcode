// The recipe library: modelling knowledge kept OUT of the prompt until the
// conversation actually calls for it.
//
// The system prompt used to carry everything at once — the fins paragraph, the
// import rules, the whole reference-size table — on every single request, even
// "make a cube". That is slower, costs more, and buries the two paragraphs that
// matter under six that do not.
//
// Now each subject is a markdown file under recipes/ with a tag, and only the
// files a message actually mentions get injected. Tags nest: #batt is the
// general battery knowledge and ##AAA is a child carrying exact numbers. That
// distinction is the whole point of the hierarchy —
//
//   "a battery holder"        -> #holder + #batt, and #batt ASKS which cell
//   "a AAA holder, 3 across"  -> #holder + #batt + ##AAA, no question asked,
//                                because ##AAA already states 10.5 x 44.5
//
// A child match silences its parent's question. So does the user simply giving
// dimensions. The result is fewer round-trips for a specific request and a
// sensible question for a vague one.
//
// Adding a subject means dropping a .md file in recipes/ — the manifest is
// GENERATED from the frontmatter (build-site.mjs), never hand-maintained, and
// test/recipes.js fails if it drifts. A hand-written list is exactly how the
// three.js addons went missing from two shipped bundles.

const BASE = new URL("./recipes/", import.meta.url);

let _manifest;
export async function loadManifest() {
  return (_manifest ??= fetch(new URL("manifest.json", BASE)).then((r) => {
    if (!r.ok) throw new Error(`recipe manifest: HTTP ${r.status}`);
    return r.json();
  }));
}

const _files = new Map();
async function loadRecipe(file) {
  if (!_files.has(file)) {
    _files.set(file, fetch(new URL(file, BASE)).then(async (r) => {
      if (!r.ok) throw new Error(`recipe ${file}: HTTP ${r.status}`);
      return stripFrontmatter(await r.text());
    }));
  }
  return _files.get(file);
}

// Frontmatter is metadata for the matcher, not for the model — the model gets
// the prose only.
export function stripFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  return m ? text.slice(m[0].length).trim() : text.trim();
}

export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim());
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

// A term matches on word boundaries so "aa" doesn't fire inside "aardvark" and
// "cell" doesn't fire inside "excellent". Multi-word terms match as a phrase
// with flexible whitespace. A trailing plural "s" is allowed, so "cell" catches
// "cells" and "18650" catches "two 18650s" without every recipe having to list
// both forms — the singular/plural pairs were the bulk of the keyword lists.
export function termMatches(term, text) {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const plural = /[a-z0-9]$/.test(t) && !t.endsWith("s") ? "s?" : "";
  return new RegExp(`(?<![a-z0-9])${esc}${plural}(?![a-z0-9])`, "i").test(text);
}

// "80x40x3", "40 x 60", "12mm", "r5" — any of these means the user has already
// told us a size, so a recipe's stock question would be noise.
export function statesDimensions(text) {
  return /\d+\s*(?:x|×|by)\s*\d+/i.test(text)
    || /\b\d+(?:\.\d+)?\s*(?:mm|cm|in|inch|inches|")\b/i.test(text)
    || /\b(?:r|d|dia|diameter|radius|width|height|depth|length)\s*[:=]?\s*\d/i.test(text);
}

// Returns the recipes this message calls for, most specific first, plus any
// questions still worth asking.
//
// opts.code is the model currently in the editor. It has to be searched too:
// "make it narrower" with importedMesh("frame.stl") on screen is a question
// about an import, but the message alone contains no word that says so, and the
// import rules are exactly what stops the model inventing a bounding box. The
// editor is already sent to the LLM as context — this makes the LIBRARY see the
// same thing the model does.
//
// Questions, though, come from the message only. Whether a request is vague is
// a property of what the user asked, not of what happens to be on screen.
export function matchRecipes(text, manifest, opts = {}) {
  const entries = manifest?.recipes || [];
  const haystack = opts.code ? `${text}\n${opts.code}` : text;
  const hit = new Map();
  for (const r of entries) {
    if ((r.match || []).some((term) => termMatches(term, haystack))) hit.set(r.tag, r);
  }

  // A matched child pulls its parent in for context even when the parent's own
  // keywords never appeared — "a AAA holder" never says "battery".
  for (const r of [...hit.values()]) {
    if (r.parent && !hit.has(r.parent)) {
      const p = entries.find((e) => e.tag === r.parent);
      if (p) hit.set(p.tag, p);
    }
  }

  const matched = [...hit.values()];
  const specific = matched.some((r) => r.parent);
  const dims = opts.statesDimensions ?? statesDimensions(text);

  // Ask only while the subject is genuinely open. Two things close it:
  //
  //   * the user gave measurements, or
  //   * a CHILD recipe matched — a child exists precisely because it carries
  //     exact numbers, so naming one answers the parent's question and the
  //     generic ones around it. "A AAA holder" should not be met with "what is
  //     it holding, and how big is it?" when ##AAA already says 10.5 x 44.5.
  //
  // Erring toward not asking is the right bias here: the harness already
  // requires the model to state its assumptions, so an unnecessary question
  // costs a whole round-trip while a stated assumption costs one sentence.
  const questions = (specific || dims) ? []
    : matched.filter((r) => r.ask).map((r) => ({ tag: r.tag, ask: r.ask }));

  // children first — the specific numbers should lead
  matched.sort((a, b) => (b.parent ? 1 : 0) - (a.parent ? 1 : 0));
  return { matched, questions, dims };
}

// The block appended to the system prompt. Empty string when nothing matched,
// so an ordinary "make a cube" costs exactly nothing.
export async function referenceFor(text, opts = {}) {
  let manifest;
  try {
    manifest = await loadManifest();
  } catch {
    return { text: "", tags: [], questions: [] };   // never block a build on this
  }
  const { matched, questions } = matchRecipes(text, manifest, opts);
  if (!matched.length) return { text: "", tags: [], questions: [] };

  const parts = [];
  for (const r of matched) {
    try {
      parts.push(`### ${r.title || r.tag}  (#${r.tag})\n\n${await loadRecipe(r.file)}`);
    } catch { /* a missing file shouldn't sink the request */ }
  }
  if (!parts.length) return { text: "", tags: [], questions: [] };

  return {
    text: `\n\nREFERENCE — pulled in because this request mentions ${matched.map((r) => "#" + r.tag).join(", ")}. `
      + `Treat it as established fact and build from it; do not re-derive or contradict it.\n\n`
      + parts.join("\n\n"),
    tags: matched.map((r) => r.tag),
    questions,
  };
}
