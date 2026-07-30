// In-app mesh decimation: a too-dense import must come out of the simplifier
// small enough for the kernel, still the same object at the same size, and
// still buildable as a real solid. The simplifier is meshoptimizer's wasm —
// injected here the same way curved.js takes replicad, because node can't
// resolve the browser's /node_modules path.

import { MeshoptSimplifier } from "meshoptimizer";
import { simplifyObjects, _setSimplifier } from "../viewer/simplify.js";
import { build, toSTL } from "../index.js";
import { importedMesh, registerImport } from "../src/dsl.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

await MeshoptSimplifier.ready;
_setSimplifier(MeshoptSimplifier);

// A dense UV sphere as raw triangle soup — ~46k triangles, no kernel needed.
function sphereSoup(r, seg, ring, cx = 0, cy = 0, cz = 0) {
  const P = (i, j) => {
    const th = (i / seg) * 2 * Math.PI, ph = (j / ring) * Math.PI;
    return [cx + r * Math.sin(ph) * Math.cos(th), cy + r * Math.sin(ph) * Math.sin(th), cz + r * Math.cos(ph)];
  };
  const out = [];
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < ring; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      // at the poles a whole edge of the quad collapses — emit only the real
      // triangle there, or the soup itself is non-manifold before we start
      if (j > 0) out.push(...a, ...b, ...c);
      if (j < ring - 1) out.push(...a, ...c, ...d);
    }
  }
  return out;
}

console.log("\nsimplify\n");
{
  const soup = sphereSoup(20, 152, 152);            // ~46k triangles
  const before = soup.length / 9;
  const [slim] = await simplifyObjects([{ positions: soup }], 8000);
  const after = slim.positions.length / 9;
  check("a 46k sphere shrinks hard", after < before / 3, `${before} -> ${after}`);
  check("...to roughly the asked-for budget", after < 12000, String(after));
  // same object, same size: every vertex still on (or near) the r=20 shell
  let mn = Infinity, mx = 0;
  for (let i = 0; i < slim.positions.length; i += 3) {
    const d = Math.hypot(slim.positions[i], slim.positions[i + 1], slim.positions[i + 2]);
    if (d < mn) mn = d; if (d > mx) mx = d;
  }
  check("...still a 20mm sphere", mx <= 20.05 && mn > 18.5, `r ${mn.toFixed(2)}..${mx.toFixed(2)}`);

  // and the kernel can BUILD the result — the entire point
  const lines = ["solid s"];
  for (let t = 0; t < slim.positions.length; t += 9) {
    lines.push("facet normal 0 0 0", "outer loop");
    for (let k = 0; k < 9; k += 3) {
      lines.push(`vertex ${slim.positions[t + k]} ${slim.positions[t + k + 1]} ${slim.positions[t + k + 2]}`);
    }
    lines.push("endloop", "endfacet");
  }
  lines.push("endsolid s");
  registerImport("slim.stl", lines.join("\n"));
  // BASIC repair, same as the app's import flow. This once failed NotManifold
  // and the cause was OURS, not the simplifier's: (-0).toFixed() is "-0.000",
  // a different weld key from "0.000", so axis vertices split and the
  // simplifier saw phantom boundaries. The fx() normalisation in simplify.js
  // is what this line is really testing.
  const r = await build(importedMesh("slim.stl", { repair: "BASIC" }));
  const facets = (toSTL(r, "t").match(/facet normal/g) || []).length;
  check("...and builds as a real solid", facets > 1000, `${facets} facets`);
}
{
  // multi-part: budgets are proportional, and a small part is not erased
  const big = { positions: sphereSoup(20, 120, 120) };            // ~28.8k
  const small = { positions: sphereSoup(3, 24, 24, 50, 0, 0) };   // ~1.2k
  const out = await simplifyObjects([big, small], 6000);
  const bigAfter = out[0].positions.length / 9, smallAfter = out[1].positions.length / 9;
  check("the big part takes the cut", bigAfter < 28800 / 3, String(bigAfter));
  check("the small part survives", smallAfter >= 200, String(smallAfter));
}
{
  // already under budget -> untouched, byte for byte
  const soup = sphereSoup(10, 24, 24);
  const [same] = await simplifyObjects([{ positions: soup }], 80000);
  check("an already-light mesh is left alone", same.positions === soup);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
