// "Open as an exact solid": the policy in src/stlexact.js, and both builds it
// chooses between (vendor/brep-kernel-rust and vendor/brep-stl2step-legacy).
//
//   node test/stlexact.js
//
// The page runs each attempt in a throwaway worker; here they run in-process
// on meshes that convert cleanly. When the 24-file bench corpus from
// 2026-11-01 is on this machine, the two files that decided the policy (a lid
// the current build only repairs as facets, a bin only the current build
// opens) are run through it too; elsewhere that part is skipped.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { exactShare, wantsSecondOpinion, pickBetter, failureReason, summarise, convertStlToExact } from "../src/stlexact.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// ---- the choice, on made-up results
const exact = { ok: true, backend: "hybrid_analytic_rebuild", sourceTriangles: 1000, analyticTriangles: 900, faces: 80, ms: 500 };
const facets = { ok: true, backend: "faceted_repair_coplanar_merged", sourceTriangles: 1000, analyticTriangles: null, faces: 270, ms: 300 };
const whole = { ok: true, backend: "kernel_analytic_rebuild", sourceTriangles: 1000, faces: 40, ms: 100 };
check("faceted fallback scores 0, a whole recognised part 1", exactShare(facets) === 0 && exactShare(whole) === 1);
check("a failure, a trap or facets ask for a second opinion",
  wantsSecondOpinion({ ok: false }) && wantsSecondOpinion({ ok: false, crashed: true }) && wantsSecondOpinion(facets) && !wantsSecondOpinion(exact));
check("exact surfaces beat a faster faceted result", pickBetter(facets, exact) === exact);
check("anything beats a failure", pickBetter({ ok: false }, facets) === facets && pickBetter(facets, { ok: false }) === facets);
check("equal surfaces: fewer faces wins", pickBetter({ ...exact, faces: 90 }, exact) === exact);
check("a clear refusal is reported over a trap",
  failureReason({ ok: false, crashed: true, error: "unreachable" }, { ok: false, error: "facet 8 is degenerate" }) === "facet 8 is degenerate");

// ---- the policy, on a scripted runner
{
  const calls = [];
  const run = (answers) => async (engine) => { calls.push(engine); return answers[engine]; };
  let r = await convertStlToExact(run({ current: exact, legacy: whole }));
  check("an exact first result is kept without loading the legacy build", r.best === exact && calls.join() === "current");
  calls.length = 0;
  r = await convertStlToExact(run({ current: facets, legacy: exact }));
  check("faceted first result: the legacy one is asked and wins", r.best === exact && calls.join() === "current,legacy");
  calls.length = 0;
  r = await convertStlToExact(run({ current: { ok: false, timedOut: true, error: "no result after 120 s" }, legacy: { ok: false, error: "facet 2817 is degenerate" } }));
  check("both fail: no result, and the clear reason", !r.best && r.error === "facet 2817 is degenerate");
}

// ---- both real builds
async function loadBuild(dir) {
  const url = new URL(`../vendor/${dir}/brep_kernel.js`, import.meta.url);
  const mod = await import(url.href);
  mod.initSync({ module: readFileSync(fileURLToPath(new URL("brep_kernel_bg.wasm", url))) });
  return mod;
}
const builds = { current: await loadBuild("brep-kernel-rust"), legacy: await loadBuild("brep-stl2step-legacy") };
const runner = (bytes) => async (engine) => {
  const t0 = performance.now();
  try { return summarise(JSON.parse(builds[engine].stl_to_step_json(bytes, "", "t")), performance.now() - t0, engine); }
  catch (e) { return { ok: false, engine, error: String(e?.message || e) }; }
};

const box = (() => {
  const v = [[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,10],[20,0,10],[20,20,10],[0,20,10]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return new TextEncoder().encode(`solid b\n${f.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${v[i].join(" ")}`).join("\n")}\nendloop\nendfacet`).join("\n")}\nendsolid b\n`);
})();
for (const engine of ["current", "legacy"]) {
  const r = await runner(box)(engine);
  check(`${engine} build: a 12-triangle box comes back as 6 planes`, r.ok && r.faces === 6 && r.planes === 6, r.error || `${r.faces} faces`);
}
{
  const r = await convertStlToExact(runner(box));
  check("policy on a box: the current build, one attempt", r.best?.engine === "current" && r.attempts.length === 1);
}

const CORPUS = fileURLToPath(new URL("../../../BREPcodeRustKernel/stl2step-test/", import.meta.url));
const LID = `${CORPUS}A-flat_2_lid.stl`;
const BIN = fileURLToPath(new URL("../../../ModularCase/stl/Casefinity_160x110/bin.stl", import.meta.url));
if (existsSync(LID) && existsSync(BIN)) {
  const lid = await convertStlToExact(runner(new Uint8Array(readFileSync(LID))));
  check("lid: current build only repairs facets, the legacy build's exact rebuild is kept",
    lid.attempts[0]?.backend?.startsWith("faceted") && lid.best?.engine === "legacy" && lid.best.faces < lid.attempts[0].faces,
    lid.attempts.map((a) => `${a.engine} ${a.ok ? `${a.backend} ${a.faces}` : a.error}`).join(" | "));
  const bin = await convertStlToExact(runner(new Uint8Array(readFileSync(BIN))));
  check("bin: only the current build opens it, and it is kept",
    bin.best?.engine === "current" && bin.best.faces > 0,
    bin.attempts.map((a) => `${a.engine} ${a.ok ? `${a.backend} ${a.faces}` : a.error}`).join(" | "));
} else {
  console.log("  skip  the 2026-11-01 bench corpus isn't on this machine");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
