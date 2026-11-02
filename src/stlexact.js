// "Open as an exact solid" (STL -> STEP): which reconstruction to keep.
//
// Two builds of the upstream stl2step engine (next.BREP.io's
// BREP_reconstruction) are on hand:
//
//   current  vendor/brep-kernel-rust      0.11.0 (BREP_reconstruction 0.8.0),
//            the same wasm the exact lane builds models with
//   legacy   vendor/brep-stl2step-legacy  0.9.0 (BREP_reconstruction 0.6.x),
//            kept ONLY for this, loaded only when the current one falls short
//
// Measured on 24 real STLs (bench/kernel-bench.mjs stl, 2026-11-01), the
// current build is faster and opens files the legacy one refuses (zero-area
// facets are now dropped instead of rejected), but it is not better on every
// file: a lid and a bracket that the legacy build rebuilt as exact planes and
// cylinders came back as merged facets, and three files that the legacy build
// refused in milliseconds made the current one trap ("unreachable") or run
// for more than five minutes. So:
//
//   1. run the current build, capped, in a worker that is thrown away after
//      (a trapped wasm instance is never reused, and a hang is terminated);
//   2. keep it when it converted and is not a faceted fallback;
//   3. otherwise run the legacy build too, and keep the better of the two.

export const STL_EXACT_CAP_MS = 120_000;   // the slowest good conversion measured was 32 s

// How much of the source mesh came back as real surfaces, 0..1.
export function exactShare(r) {
  if (!r?.ok) return -1;
  const b = String(r.backend || "");
  if (b.startsWith("faceted")) return 0;
  const tris = r.sourceTriangles || 0;
  if (r.analyticTriangles != null && tris > 0) return Math.min(1, r.analyticTriangles / tris);
  // kernel_analytic_rebuild / ransac_*: the whole part was recognised
  return 1;
}

// Worth asking the other build: it failed, timed out, or only repaired facets.
export function wantsSecondOpinion(r) {
  return !r?.ok || String(r.backend || "").startsWith("faceted");
}

// The better of two attempts (either may be { ok: false }).
export function pickBetter(a, b) {
  if (!a?.ok) return b?.ok ? b : null;
  if (!b?.ok) return a;
  const da = exactShare(a), db = exactShare(b);
  if (Math.abs(da - db) > 0.02) return da > db ? a : b;
  if (a.faces !== b.faces) return a.faces < b.faces ? a : b;   // fewer faces = cleaner model
  return (a.ms ?? 0) <= (b.ms ?? 0) ? a : b;
}

// What the attempts add up to, for the hint line when neither converted.
export function failureReason(...attempts) {
  // a clear refusal ("facet 8 is degenerate") beats a trap or a timeout
  const told = attempts.find((r) => r && !r.ok && !r.crashed && !r.timedOut);
  const any = told || attempts.find((r) => r && !r.ok);
  return any ? any.error : "no reconstruction ran";
}

// Summarise a stl_to_step_json() result the way the page reports it.
export function summarise(out, ms, engine) {
  const step = out.step;
  const count = (re) => (step.match(re) || []).length;
  const h = out.report?.hybrid_rebuild;
  return {
    ok: true, engine, ms: Math.round(ms), step,
    sourceTriangles: out.sourceTriangles,
    backend: out.report?.backend || "",
    analyticTriangles: h ? ["plane", "cylinder", "cone", "sphere", "torus"].reduce((n, k) => n + (h[`analytic_${k}_triangles`] || 0), 0) : null,
    // how much of the mesh stayed triangles, which "Open as a solid" weighs
    // against the smooth surface (a facet is also a PLANE, so the plane count
    // can't say): all of it for a faceted repair, none for a recognised part
    facetedTriangles: String(out.report?.backend || "").startsWith("faceted") ? out.sourceTriangles
      : h ? (h.faceted_triangles ?? 0) : 0,
    solids: count(/MANIFOLD_SOLID_BREP\(/g),
    faces: count(/ADVANCED_FACE\(/g),
    planes: count(/=\s*PLANE\(/g), cylinders: count(/CYLINDRICAL_SURFACE\(/g),
    cones: count(/CONICAL_SURFACE\(/g), spheres: count(/SPHERICAL_SURFACE\(/g), tori: count(/TOROIDAL_SURFACE\(/g),
  };
}

// The whole policy, over any runner(engine) => Promise<result>. The page's
// runner starts a worker per attempt; the test's runs the wasm in-process.
export async function convertStlToExact(run, { onFallback } = {}) {
  const first = await run("current");
  if (!wantsSecondOpinion(first)) return { best: first, attempts: [first] };
  onFallback?.(first);
  const second = await run("legacy");
  const best = pickBetter(first, second);
  return { best, attempts: [first, second], error: best ? null : failureReason(first, second) };
}
