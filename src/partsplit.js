// Build a multi-part model one part at a time.
//
// A group() of separate parts is one feature history, but nothing in part A
// ever reads part B: every feature names the solids it works on (a boolean's
// targets, a fillet's edge names, an XFORM's solids), so the history falls
// apart into independent pieces wherever no name crosses between them. Each
// piece can then go to the kernel on its own: in parallel on the desktop's
// pool of native kernels, and either way onto the screen as soon as it is
// done instead of when the last one is.
//
// splitHistory() finds the pieces; mergeOutputs() puts the engine results back
// together in the original order, so the page and the exporters see exactly
// what one whole-model build would have given them.

// Feature ids look like "P.CU12", "B3", "E38__P". A reference is an id with no
// id character on either side: "P.CU1" inside "P.CU1_NX|P.CU1_NY[0]" counts,
// "P.CU1" inside "P.CU10" does not.
const ID_CHAR = "A-Za-z0-9.";

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// The history as independent pieces, in order of each piece's first feature,
// or null when it is one piece (or can't be split safely). `maxPieces` folds
// neighbouring pieces together so eighty tiny parts don't become eighty kernel
// calls and eighty repaints.
export function splitHistory(json, { maxPieces = 32 } = {}) {
  const src = typeof json === "string" ? JSON.parse(json) : json;
  const features = src?.features;
  if (!Array.isArray(features) || features.length < 2) return null;
  const ids = features.map((f) => f?.inputParams?.id);
  if (ids.some((id) => typeof id !== "string" || !id)) return null;
  const owner = new Map(ids.map((id, i) => [id, i]));
  if (owner.size !== ids.length) return null;          // duplicate ids: don't guess

  const parent = features.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };

  // longest first, so "P.CU10" is tried before "P.CU1"
  const alt = [...ids].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const re = new RegExp(`(?<![${ID_CHAR}])(?:${alt})(?![${ID_CHAR}])`, "g");
  features.forEach((f, i) => {
    const text = JSON.stringify([f.inputParams, f.persistentData]);
    for (const m of text.matchAll(re)) {
      const j = owner.get(m[0]);
      if (j !== undefined && j !== i) join(i, j);
    }
  });

  const groups = new Map();
  features.forEach((f, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { fs: [], last: i });
    const g = groups.get(r);
    g.fs.push(f);
    g.last = i;
  });
  let pieces = [...groups.values()];
  if (pieces.length < 2) return null;
  // Too many pieces: fold the SMALLEST into a neighbour, one at a time, so the
  // big parts stay on their own. Folding neighbours in fixed runs paired a
  // motor's housing with its weld ring, the two slowest parts, and that one
  // piece was the whole wait while the other kernels sat idle.
  while (pieces.length > maxPieces) {
    let k = 0;
    pieces.forEach((g, i) => { if (g.fs.length < pieces[k].fs.length) k = i; });
    const left = pieces[k - 1], right = pieces[k + 1];
    const j = !left ? k + 1 : !right ? k - 1 : left.fs.length <= right.fs.length ? k - 1 : k + 1;
    const [a, b] = [Math.min(j, k), Math.max(j, k)];
    pieces.splice(a, 2, { fs: [...pieces[a].fs, ...pieces[b].fs], last: Math.max(pieces[a].last, pieces[b].last) });
  }
  // every piece keeps the document around the features (id counter,
  // expressions, metadata), so it is a complete history on its own
  const docs = pieces.map((g) => ({ ...src, features: g.fs }));
  // where each piece's last feature sits in the whole history: mergeOutputs
  // needs it to list the solids in the order one whole build would
  docs.lastIndex = pieces.map((g) => g.last);
  return docs;
}

// Engine outputs for the pieces, in piece order, as one output.
//
// The solids come back in the order one whole build lists them: every exact
// solid, then every mesh one, each by when its solid was last changed, which
// is when its piece's last feature ran (a boolean re-adds its target). Pass
// the pieces from splitHistory() for that; without them it is piece order.
export function mergeOutputs(outs, wallMs, pieces = null) {
  const last = pieces?.lastIndex || outs.map((_, i) => i);
  const order = outs.map((_, i) => i).sort((a, b) => last[a] - last[b]);
  const solids = [
    ...order.flatMap((i) => outs[i].solids.filter((s) => s.exact)),
    ...order.flatMap((i) => outs[i].solids.filter((s) => !s.exact)),
  ];
  const sum = (k) => outs.reduce((n, o) => n + (o.stats?.[k] || 0), 0);
  const first = outs[0]?.stats || {};
  return {
    lane: outs.some((o) => o.lane === "mesh") ? "mesh" : "exact",
    solids,
    stats: {
      ...first,
      exactFeatures: sum("exactFeatures"),
      meshFeatures: sum("meshFeatures"),
      exactMs: sum("exactMs"),
      meshMs: sum("meshMs"),
      roundedCurves: sum("roundedCurves"),
      nvidiaRefused: outs.map((o) => o.stats?.nvidiaRefused).find(Boolean) || null,
      parts: outs.length,
      // each piece's own kernel time, in piece order: which part is the slow one
      pieceMs: outs.map((o) => Math.round((o.stats?.exactMs || 0) + (o.stats?.meshMs || 0))),
      ...(wallMs != null ? { wallMs: Math.round(wallMs) } : {}),
    },
  };
}
