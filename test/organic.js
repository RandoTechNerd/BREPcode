// smoothUnion() and blob(): organic blending on the SDF engine.
//
// The claim these ops make is geometric, so the checks are volumes, not
// vibes: a smooth union must hold at least the material of the hard union
// (the blend only ADDS neck material), a blob must hold at least its spheres,
// and the result must be a real, watertight kernel solid that booleans.
//
// The performance architecture is load-bearing enough to pin: the first cut
// asked meshSignedDistance() one point at a time and a two-sphere blend
// measured in MINUTES; the lattice precompute (fieldgrid.js) brought it to
// ~4s. The source checks at the bottom keep that road in place.

import {
  blob, smoothUnion, sphere, cylinder, translate, union, difference,
  build, toSTL,
} from "../index.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const volOf = (r) => {
  let vol = 0;
  const v = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
};

console.log("\nblob: metaballs\n");
{
  const snowman = await build(blob([[0, 0, 10, 12], [0, 0, 28, 8], [0, 0, 40, 5]], { k: 5, res: 40 }));
  const v = volOf(snowman);
  const spheresAlone = (4 / 3) * Math.PI * (12 ** 3 + 8 ** 3 + 5 ** 3);
  check("a snowman builds", v > 0);
  check("...holding at least its spheres — the blend only adds neck material",
    v > spheresAlone * 0.97, `${v.toFixed(0)} vs ${spheresAlone.toFixed(0)}`);
  check("...but not absurdly more", v < spheresAlone * 1.35, `${v.toFixed(0)}`);

  // the same balls with a bigger k melt FURTHER together: more bridge material
  const melted = volOf(await build(blob([[0, 0, 10, 12], [0, 0, 28, 8], [0, 0, 40, 5]], { k: 10, res: 40 })));
  check("a bigger k adds bridge material", melted > v, `${melted.toFixed(0)} vs ${v.toFixed(0)}`);
}

console.log("\nsmoothUnion: arbitrary shapes\n");
{
  const a = sphere({ r: 14, $fn: 32 });
  const b = translate([0, 0, 18], sphere({ r: 9, $fn: 32 }));
  const hard = volOf(await build(union(a, b)));
  const soft = volOf(await build(smoothUnion({ k: 6, res: 40 }, a, b)));
  check("the blend holds at least the hard union", soft > hard * 0.98,
    `${soft.toFixed(0)} vs ${hard.toFixed(0)}`);
  check("...and visibly more — the neck is real material", soft > hard * 1.005,
    `${soft.toFixed(0)} vs ${hard.toFixed(0)}`);

  // the result is a solid the kernel can CUT — the whole point of importing
  // it back rather than stopping at a mesh
  const cut = await build(difference(
    smoothUnion({ k: 5, res: 36 }, sphere({ r: 12, $fn: 24 }), translate([0, 0, 14], sphere({ r: 8, $fn: 24 }))),
    cylinder({ r: 3, h: 60, $fn: 24 }),
  ));
  const cutVol = volOf(cut);
  check("the blend booleans like any other solid", cutVol > 0 && Number.isFinite(cutVol));
}

console.log("\nit refuses what it cannot do, with directions\n");
{
  const boom = async (fn) => { try { await build(fn()); return null; } catch (e) { return String(e.message || e); } };
  check("one child is refused", /at least two/.test(await boom(() => smoothUnion(6, sphere({ r: 5 })))) ,
    "a blend of one thing is a no-op wearing a cost");
  check("a missing k names the fix", /blend distance in mm/.test(await boom(() => smoothUnion(undefined, sphere({ r: 5 }), sphere({ r: 3 })))));
  check("blob wants real balls", /\[\[x, y, z, r\]/.test(await boom(() => blob([[0, 0, 0]]))));
  check("blob refuses a zero radius", /radius must be positive/.test(await boom(() => blob([[0, 0, 0, 5], [9, 0, 0, 0]]))));
}

console.log("\nthe performance road stays paved\n");
{
  const DSL = readFileSync(new URL("../src/dsl.js", import.meta.url), "utf8");
  check("mesh children go through the lattice field, not point-by-point queries",
    /fields\.push\(meshFieldGrid\(m, bounds, res\)\)/.test(DSL),
    "meshSignedDistance per sample measured a two-sphere blend in MINUTES");
  check("balls stay analytic — no mesh, no lattice",
    /fields\.push\(\(p\) => Math\.hypot\(p\[0\] - x, p\[1\] - y, p\[2\] - z\) - r\)/.test(DSL));
  check("the nets output is repaired where it is created",
    /solidNets\(f, bounds, res, \{ repair: repairMesh \}\)/.test(DSL),
    "surface nets is not edge-manifold; unrepaired it poisons later booleans");
  const FG = readFileSync(new URL("../src/fieldgrid.js", import.meta.url), "utf8");
  check("the lattice seeds exact distances near the surface",
    /exactDistanceNear\(at3\(i, j, k\), tris, g, seedR\)/.test(FG));
  check("...and chamfer-sweeps the rest in two passes",
    /sweep\(\{ is: up, js: up, ks: up \}, fwd\);\s*\n\s*sweep\(\{ is: down, js: down, ks: down \}, bwd\);/.test(FG),
    "chamfer error lives only far from the surface, where the blend has stopped caring");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
