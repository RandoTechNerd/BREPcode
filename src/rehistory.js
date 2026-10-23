// Rebuilding only what changed.
//
// Every build used to be a fresh PartHistory: the page compiles the script into
// a feature list, serialises it, and the worker did `new PartHistory()` +
// `fromJSON()` + `runHistory()`. Correct, and it threw away a cache the kernel
// had already built. Measured on a plate with twelve booleans: 800-950ms for a
// fresh history against 197ms to re-run the same instance. A 1mm nudge to one
// boss cost what the whole model cost.
//
// The kernel is already an incremental engine. Each feature carries `dirty`,
// `timestamp` and `lastRunInputParams`; the run loop skips a feature whose
// params are unchanged, and — this is the part that makes reuse SAFE — it
// re-marks a feature dirty when anything it references carries a newer
// timestamp than its own:
//
//     const R = referencedTimestamp(...);
//     if (Number.isFinite(R) && (!Number.isFinite(w.timestamp) || R > w.timestamp))
//       w.dirty = true;                      // an input rebuilt after me → I am stale
//
// So downstream invalidation is the kernel's job and it already does it. All
// this module has to get right is IDENTITY: deciding when the history arriving
// from the page is the same history as the one already in hand, and which of
// its features actually changed.
//
// THE FAILURE MODE THIS IS WRITTEN AGAINST is not a crash, it is silently stale
// geometry — a model that looks built and is wrong. Two rules follow from that,
// and both cost speed:
//
//   1. Reuse only on an EXACT structural match. Same feature count, same types,
//      same ids, in the same order, and every non-feature field of the history
//      identical. Anything else is a full rebuild. Adding a feature shifts the
//      generated ids, so "add a hole" simply rebuilds — which is correct, and
//      cheap to decide.
//
//   2. Never rely on the kernel noticing a change. We compare each feature's
//      full serialised form ourselves and set `dirty` by hand. The kernel's own
//      comparison is a second line of defence, not the first. If our signature
//      and its comparison ever disagree, the pessimistic answer wins.
//
// test/incremental.js holds this honest: for a battery of edits it builds both
// ways and compares the STL text. Not "it looked right" — byte-for-byte.

// What makes a feature THE SAME FEATURE across two compiles. The page compiles
// into a fresh history every time, so the kernel's id counter restarts and ids
// are deterministic for a given structure: P.CU1, P.CY2, B3. Same script shape,
// same ids; one feature inserted and every id after it shifts, which is exactly
// the signal we want.
export function featureKey(f) {
  return `${f?.type ?? "?"}#${f?.inputParams?.id ?? "?"}`;
}

// What makes a feature UNCHANGED. Everything the kernel is given as input:
// the params and the persistent data. `timestamp` is deliberately excluded —
// it is the kernel's own bookkeeping and is null on everything the page sends.
export function featureSignature(f) {
  return JSON.stringify([f?.inputParams ?? null, f?.persistentData ?? null]);
}

// Everything in the serialised history that is NOT a feature: idCounter,
// expressions, configurator, metadata and the rest. A change in any of them
// could alter how a feature evaluates, and none of them are worth reasoning
// about individually, so any difference here is a full rebuild.
export function shellSignature(doc) {
  const rest = {};
  for (const k of Object.keys(doc || {}).sort()) {
    if (k === "features") continue;
    rest[k] = doc[k];
  }
  return JSON.stringify(rest);
}

// Decide what to do with an incoming history, given the fingerprint of the one
// already built. Pure: no kernel, no side effects, so the tests can drive every
// branch directly.
export function planAdoption(prev, doc) {
  const features = Array.isArray(doc?.features) ? doc.features : null;
  if (!features) return { reuse: false, reason: "no features in the history" };

  const keys = features.map(featureKey);
  const sigs = features.map(featureSignature);
  const shell = shellSignature(doc);
  const fingerprint = { keys, sigs, shell };

  if (!prev) return { ...fingerprint, reuse: false, reason: "nothing built yet", changed: [] };
  if (prev.shell !== shell) return { ...fingerprint, reuse: false, reason: "history settings changed", changed: [] };
  if (prev.keys.length !== keys.length) {
    return { ...fingerprint, reuse: false, changed: [],
      reason: `feature count changed (${prev.keys.length} → ${keys.length})` };
  }
  for (let i = 0; i < keys.length; i++) {
    if (prev.keys[i] !== keys[i]) {
      return { ...fingerprint, reuse: false, changed: [],
        reason: `feature ${i} changed identity (${prev.keys[i]} → ${keys[i]})` };
    }
  }

  const changed = [];
  for (let i = 0; i < sigs.length; i++) if (prev.sigs[i] !== sigs[i]) changed.push(i);
  return { ...fingerprint, reuse: true, reason: "same structure", changed };
}

// HOW MANY FEATURES ACTUALLY REBUILT — which is not how many the script
// changed, and the difference is the whole story of this optimisation.
//
// CSG is a chain: `s = union(s, boss)` then `s = difference(s, hole)`, each
// step consuming the last. Change one number in the FIRST boss and the kernel
// correctly rebuilds every boolean after it; change the LAST one and almost
// nothing downstream exists to invalidate. Measured on a plate with twelve
// booleans (25 features), the same one-parameter edit:
//
//     no change at all        0 of 25 re-ran     816ms → 204ms   (4.0x)
//     edit at the END         4 of 25            586ms → 289ms   (2.0x)
//     edit at the START      14 of 25            742ms → 615ms   (1.2x)
//
// Two features had changed params in both edits. Reporting that number would
// have been a flattering lie; the kernel's own timestamps say what really ran.
export const featureTimestamps = (ph) => (ph?.features || []).map((f) => f?.timestamp ?? 0);

export function countRebuilt(before, after) {
  if (!Array.isArray(before) || before.length !== after.length) return after.length;
  let n = 0;
  for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) n++;
  return n;
}

// Hand the worker a PartHistory ready to run.
//
// `prev` is the instance from the last build (or null). `PartHistory` is passed
// in rather than imported so this module stays free of the kernel and the tests
// can run without loading it for the pure cases.
//
// Returns the history to run plus what happened, which the caller logs — a
// silent optimisation is one nobody can debug when it misbehaves.
export async function adoptHistory({ prev, prevPlan, json, PartHistory }) {
  const doc = typeof json === "string" ? JSON.parse(json) : json;
  const plan = planAdoption(prev ? prevPlan : null, doc);

  if (!plan.reuse) {
    const ph = new PartHistory();
    await ph.fromJSON(typeof json === "string" ? json : JSON.stringify(json));
    return { ph, plan, incremental: false, changed: plan.keys?.length ?? 0, total: plan.keys?.length ?? 0 };
  }

  const feats = prev.features;
  for (const i of plan.changed) {
    const src = doc.features[i];
    // Replace the inputs wholesale rather than merging. A merge would leave a
    // key the new script no longer sets — a chamfer that was removed, say —
    // sitting in the params and quietly still applied.
    feats[i].inputParams = src.inputParams;
    feats[i].persistentData = src.persistentData ?? {};
    // Set by hand. The kernel would almost certainly reach the same conclusion
    // from its own comparison, but "almost certainly" is the wrong standard
    // when being wrong means a stale model that looks fine.
    feats[i].dirty = true;
  }
  return { ph: prev, plan, incremental: true, changed: plan.changed.length, total: feats.length };
}
