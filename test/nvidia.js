// NVIDIA's SMLib kernel (native/nvidia-kernel, the desktop alpha's default):
// it loads, it builds the shapes BREPcode makes most, the volumes are right,
// and faces come back with the same names the Rust kernel gives them (which is
// what colours, click-to-code and fillet edge picks depend on).
//
// Skipped (exit 0) where the addon isn't built, which is everywhere but an
// alpha build: `npm run build:nvidia` first. BREPCODE_REQUIRE_NVIDIA=1 (the alpha CI job) makes a missing addon a failure.

import * as dsl from "../src/dsl.js";
import { build } from "../index.js";
import { loadNvidiaKernel } from "../src/engine-node.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

if (!loadNvidiaKernel()) {
  if (process.env.BREPCODE_REQUIRE_NVIDIA) { console.log("FAIL  the NVIDIA kernel addon isn't built in this job"); process.exit(1); }
  console.log("skip  the NVIDIA kernel isn't built here (npm run build:nvidia)");
  process.exit(0);
}

const names = Object.keys(dsl).filter((k) => typeof dsl[k] === "function" && k !== "compile");
const shape = (src) => new Function(...names, `"use strict";\n${src}`)(...names.map((n) => dsl[n]));

function volumeOf(res) {
  let vol = 0;
  for (const s of res.solids) {
    const v = [...s.toSTL(s.name).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    for (let i = 0; i + 2 < v.length; i += 3) {
      const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return vol;
}

// [label, code, exact volume, faces that must be named, tolerance]
const PI = Math.PI;
const CASES = [
  ["box", "return cube([40, 30, 10]);", 12000, ["P.CU1_PX", "P.CU1_NZ"]],
  ["cylinder", "return cylinder({ r: 5, h: 10 });", PI * 25 * 10, ["P.CY1_S", "P.CY1_T", "P.CY1_B"]],
  ["sphere", "return sphere({ r: 6 });", (4 / 3) * PI * 216, ["P.S1"], 0.02],
  ["plate with a hole", "return difference(cube([40, 30, 10]), translate([20, 15, -1], cylinder({ r: 5, h: 12 })));",
    12000 - PI * 25 * 10, ["P.CU1_PZ", "P.CY2_S"]],
  ["rounded box", 'return fillet({ r: 3, edges: "z" }, cube([40, 30, 10]));',
    12000 - 4 * (9 - PI * 9 / 4) * 10, ["P.CU1_PX", "F2:BLEND:P.CU1_NX|P.CU1_NY[0]"]],
  ["chamfered top", 'return chamfer({ d: 1, edges: "top" }, cube([10, 10, 10]));',
    1000 - 4 * 0.5 * 10, ["P.CU1_PZ"]],
  ["union", "return union(cube([10, 10, 10]), translate([5, 5, 10], cylinder({ r: 3, h: 5 })));",
    1000 + PI * 9 * 5, ["P.CU1_PZ"]],
  ["extruded triangle", "return linearExtrude({ h: 5 }, polygon([[0, 0], [20, 0], [10, 15]]));",
    150 * 5, ["E3:S2:G100_SW", "E3:S2:PROFILE:L100_END"]],
  ["revolved cup", "return revolve({ angle: 360 }, polygon([[0, 0], [8, 0], [8, 6], [0, 6]]));",
    PI * 64 * 6, ["S2:G101_RV"], 0.02],
];

console.log("\nNVIDIA kernel\n");
for (const [label, src, want, faces, tol = 0.005] of CASES) {
  let res;
  try { res = await build(shape(src), { engine: "nvidia-split" }); }
  catch (e) { check(`${label}: builds`, false, String(e.message || e).slice(0, 200)); continue; }
  check(`${label}: builds`, res.kernel === "nvidia");
  const v = volumeOf(res);
  check(`${label}: volume ${v.toFixed(1)} ~ ${want.toFixed(1)}`, Math.abs(v - want) / want < tol);
  const got = new Set(res.solids.flatMap((s) => s.faceNames || []));
  for (const f of faces) check(`${label}: face ${f}`, got.has(f), [...got].slice(0, 12).join(" "));
}

// a model NVIDIA's kernel refuses (a part torus, for now) still builds, on
// the Rust kernel, and says why
{
  const res = await build(shape("return torus({ r: 10, tube: 2, arc: 180 });"), { engine: "nvidia" });
  check("a refusal falls through to the Rust kernel", res.solids.length > 0 && res.kernel === "rust" && /NVIDIA/.test(res.fallback || ""),
    `${res.kernel} ${res.fallback || ""}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
