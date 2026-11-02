// Targeted edits to the editor's code, for an AI that wants to change one line
// instead of sending the whole model back.
//
// Two callers, one rule set:
//   - the MCP bridge's edit_code tool hands in [{ old, new }, ...] directly;
//   - the in-app chat finds SEARCH/REPLACE blocks in a model's reply with
//     parseEditBlocks() and applies them the same way.
//
// The rule is the one a careful person follows with find-and-replace: every
// `old` must match the text EXACTLY ONCE. Zero matches means the model is
// looking at code that is not there (the user typed over it, or it misremembered
// a line); two means it would be guessing which one. Either way nothing is
// applied, and the error says which edit failed and why, so the caller can try
// again with more context instead of half an edit landing.
//
// Pure string work, no DOM: tested in test/codeedit.js.

const count = (hay, needle) => {
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) n++;
  return n;
};
const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;
const clip = (s, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// Lines at which `needle` starts, for "matches 3 times (lines 4, 9, 12)".
function matchLines(hay, needle) {
  const out = [];
  for (let i = hay.indexOf(needle); i >= 0 && out.length < 6; i = hay.indexOf(needle, i + 1)) out.push(lineOf(hay, i));
  return out;
}

// The same lines, compared with trailing whitespace and CRs ignored. Models
// copy a line faithfully and drop the two spaces at its end often enough that
// refusing outright would bounce good edits. Returns [startLine, endLine) of
// the single match, or the number of matches when it is not exactly one.
function looseMatch(text, old) {
  const lines = text.split("\n");
  const want = old.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.trimEnd());
  if (!want.length || !want.some((l) => l.trim())) return 0;
  const hits = [];
  for (let i = 0; i + want.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length && ok; j++) ok = lines[i + j].replace(/\r$/, "").trimEnd() === want[j];
    if (ok) hits.push(i);
  }
  return hits.length === 1 ? [hits[0], hits[0] + want.length] : hits.length;
}

// The line of the code most like the first line of `old`, so "not found" can
// say what IS there. Cheap word overlap, which is enough to point at a line.
function nearestLine(text, old) {
  const first = old.split("\n").find((l) => l.trim()) || "";
  const words = new Set(first.match(/\w+/g) || []);
  if (!words.size) return null;
  let best = null, bestScore = 0;
  text.split("\n").forEach((l, i) => {
    const w = l.match(/\w+/g) || [];
    const score = w.filter((x) => words.has(x)).length / Math.max(words.size, w.length);
    if (score > bestScore) { bestScore = score; best = { line: i + 1, text: l.trim() }; }
  });
  return bestScore >= 0.3 ? best : null;
}

/**
 * Apply edits in order, each against the result of the one before.
 * All-or-nothing: on any failure the original text is untouched.
 *
 * @param {string} text   the current code
 * @param {{old: string, new: string}[]} edits
 * @param {{loose?: boolean}} opts  loose: also accept a match that differs only
 *        in trailing whitespace (the chat uses this; the MCP tool is strict)
 * @returns {{ok: true, code: string, applied: number} | {ok: false, error: string, index: number}}
 */
export function applyEdits(text, edits, { loose = false } = {}) {
  if (typeof text !== "string") return { ok: false, error: "there is no code to edit", index: -1 };
  if (!Array.isArray(edits) || !edits.length) return { ok: false, error: "no edits given: pass at least one { old, new }", index: -1 };
  let cur = text;
  for (let k = 0; k < edits.length; k++) {
    const e = edits[k] || {};
    const tag = edits.length > 1 ? `edit ${k + 1} of ${edits.length}` : "the edit";
    const oldS = e.old, newS = e.new;
    if (typeof oldS !== "string" || typeof newS !== "string") {
      return { ok: false, index: k, error: `${tag}: needs both "old" and "new" as strings` };
    }
    if (!oldS) return { ok: false, index: k, error: `${tag}: "old" is empty; quote the exact text to replace (use set_code to write a whole new model)` };
    if (oldS === newS) return { ok: false, index: k, error: `${tag}: "old" and "new" are the same, so nothing would change` };
    const n = count(cur, oldS);
    if (n === 1) { const i = cur.indexOf(oldS); cur = cur.slice(0, i) + newS + cur.slice(i + oldS.length); continue; }
    if (n > 1) {
      return { ok: false, index: k, error: `${tag}: "old" matches ${n} times (lines ${matchLines(cur, oldS).join(", ")}); include more of the surrounding lines so it matches exactly once` };
    }
    if (loose) {
      const m = looseMatch(cur, oldS);
      if (Array.isArray(m)) {
        const lines = cur.split("\n");
        const repl = newS.replace(/\r/g, "").replace(/\n$/, "");
        lines.splice(m[0], m[1] - m[0], ...repl.split("\n"));
        cur = lines.join("\n");
        continue;
      }
      if (m > 1) return { ok: false, index: k, error: `${tag}: "old" matches ${m} places; include more of the surrounding lines so it matches exactly once` };
    }
    const near = nearestLine(cur, oldS);
    const ws = !loose && Array.isArray(looseMatch(cur, oldS)) ? " It does match if trailing spaces are ignored: copy the line exactly as it is in the code." : "";
    return {
      ok: false, index: k,
      error: `${tag}: "old" was not found in the current code${k ? " (after the edits before it were applied)" : ""}.`
        + ws
        + (near ? ` The closest line is line ${near.line}: ${JSON.stringify(clip(near.text))}.` : "")
        + ` Read the code again (it may have changed) and quote it exactly.`,
    };
  }
  return { ok: true, code: cur, applied: edits.length };
}

// ---- SEARCH/REPLACE blocks in a chat reply -------------------------------
//
//   <<<<<<< SEARCH
//   const WALL = 2;
//   =======
//   const WALL = 3;
//   >>>>>>> REPLACE
//
// The merge-conflict shape, because it is the edit format models have seen most
// and it cannot be confused with BREPcode: no real model has a line of seven <.
// Blocks may sit inside a ``` fence or bare. The marker lines are matched
// loosely (5-9 marker characters, optional trailing spaces) since that is where
// models wobble; the content between them is kept byte for byte.

const OPEN = /^[ \t]*<{5,9}[ \t]*SEARCH[ \t]*$/;
const MID = /^[ \t]*={5,9}[ \t]*$/;
const CLOSE = /^[ \t]*>{5,9}[ \t]*REPLACE[ \t]*$/;

/**
 * @returns {{edits: {old: string, new: string}[], incomplete: boolean}}
 *   incomplete: a block was opened and never closed (a reply cut off by the
 *   length limit). Callers must not apply a partial set.
 */
export function parseEditBlocks(reply) {
  const edits = [];
  const lines = String(reply || "").replace(/\r\n/g, "\n").split("\n");
  let mode = null, oldL = [], newL = [];
  for (const line of lines) {
    if (mode === null) {
      if (OPEN.test(line)) { mode = "old"; oldL = []; newL = []; }
    } else if (mode === "old") {
      if (MID.test(line)) mode = "new";
      else oldL.push(line);
    } else if (CLOSE.test(line)) {
      edits.push({ old: oldL.join("\n"), new: newL.join("\n") });
      mode = null;
    } else newL.push(line);
  }
  return { edits, incomplete: mode !== null };
}

// True when a reply carries edit blocks at all (complete or not), so the chat
// knows not to read the fence around them as a whole new model.
export const hasEditBlocks = (reply) => String(reply || "").split(/\r?\n/).some((l) => OPEN.test(l));

// The reply with its edit blocks (and any fence left empty around them) taken
// out, for showing the prose to the user.
export function stripEditBlocks(reply) {
  const out = [];
  let inBlock = false;
  for (const line of String(reply || "").replace(/\r\n/g, "\n").split("\n")) {
    if (!inBlock && OPEN.test(line)) { inBlock = true; continue; }
    if (inBlock) { if (CLOSE.test(line)) inBlock = false; continue; }
    out.push(line);
  }
  return out.join("\n").replace(/```[\w+-]*[ \t]*\n\s*```/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
