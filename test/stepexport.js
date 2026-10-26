// Exact STEP from the CLI: `brepscript model.js --step out.step` writes the
// Rust kernel's own AP242 (true cylinders, not facets), refuses a model that
// left the exact lane, and survives the boolean results whose loop-wire ids
// the kernel's validating codec rejects (src/stepexport.js).
//
//   node test/stepexport.js

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { build, cube, cylinder, union, difference, translate, hull, sphere, drill } from "../index.js";
import { exactSTEP, StepRefusal } from "../src/stepexport.js";
import { loadRustKernel } from "../src/engine-node.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const count = (step, entity) => (step.match(new RegExp(`=${entity}\\(`, "g")) || []).length;

console.log("\nexact STEP from a build\n");
{
  const r = await build(difference(cube([60, 40, 6]), translate([30, 20, -1], cylinder({ r: 5, h: 8, $fn: 32 }))), { engine: "split" });
  const step = await exactSTEP(r, "plate");
  check("an ISO-10303-21 file", step.startsWith("ISO-10303-21;") && /END-ISO-10303-21;\s*$/.test(step));
  check("one manifold solid", count(step, "MANIFOLD_SOLID_BREP") === 1);
  check("the hole is a true cylinder, not facets", count(step, "CYLINDRICAL_SURFACE") === 1 && count(step, "PLANE") === 6, `${count(step, "CYLINDRICAL_SURFACE")} cyl, ${count(step, "PLANE")} planes`);
  check("in millimetres", /SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(step));
}
{
  // A UNION of coaxial cylinders (a counterbore cutter) comes out of the
  // kernel with a loop-wire id twice; the exporter rebuilds the ids.
  const r = await build(union(cylinder({ d: 6, h: 13 }), translate([0, 0, 6], cylinder({ d: 11, h: 7 }))), { engine: "split" });
  let step = "";
  try { step = await exactSTEP(r, "cbore"); } catch (e) { step = String(e.message); }
  check("a union the codec used to refuse still exports", count(step, "MANIFOLD_SOLID_BREP") === 1, step.slice(0, 120));
  check("...with both cylinders exact", count(step, "CYLINDRICAL_SURFACE") === 2);
}
{
  const r = await build(difference(cube([40, 40, 10]), drill([20, 20, 10], [0, 0, 1], { d: 6.6, through: true, cbore: { d: 11, depth: 4 } })), { engine: "split" });
  check("a counterbored drill() exports", count(await exactSTEP(r, "cb"), "MANIFOLD_SOLID_BREP") === 1);
}
{
  // csk: is what models write; drill() used to ignore it silently (a plain hole)
  const rk = await loadRustKernel();
  const vol = async (o) => {
    const r = await build(drill([0, 0, 0], [0, 0, 1], { d: 5.5, depth: 8, ...o }), { engine: "split" });
    return JSON.parse(rk.mass_properties_handle(r.solids[0].handle)).volume;
  };
  const a = await vol({ csink: { d: 11, angle: 90 } }), b = await vol({ csk: { d: 11, angle: 90 } }), plain = await vol({});
  check("drill() reads csk: as a countersink, like csink:", Math.abs(a - b) < 1e-6 && a > plain + 50, `${a} ${b} ${plain}`);
}
{
  const r = await build(hull(sphere({ r: 5 }), translate([20, 0, 0], sphere({ r: 3 }))), { engine: "auto" });
  let refused = null;
  try { await exactSTEP(r); } catch (e) { refused = e; }
  check("a mesh-lane model is refused, not faceted", refused instanceof StepRefusal, String(refused?.message));
}

console.log("\nthe CLI\n");
{
  const dir = mkdtempSync(join(tmpdir(), "brep-step-"));
  const out = join(dir, "bracket.step");
  const ok = spawnSync(process.execPath, ["src/cli.js", "examples/bracket.js", "--step", out], { encoding: "utf8" });
  check("--step writes the file and exits 0", ok.status === 0 && readFileSync(out, "utf8").startsWith("ISO-10303-21;"), ok.stderr);
  const model = join(dir, "blob.js");
  writeFileSync(model, `import { hull, sphere, translate } from "${new URL("../index.js", import.meta.url).href}";\nexport default () => hull(sphere({ r: 5 }), translate([20, 0, 0], sphere({ r: 3 })));\n`);
  const no = spawnSync(process.execPath, ["src/cli.js", model, "--step", join(dir, "blob.step")], { encoding: "utf8" });
  check("--step on a mesh model exits non-zero", no.status === 2 && /STEP refused/.test(no.stderr), `${no.status} ${no.stderr.slice(-200)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
