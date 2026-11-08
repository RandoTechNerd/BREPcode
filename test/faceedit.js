// Editing an imported STEP by its faces: the file comes in as its own exact
// solid (importedSolid, faces named IMPORT3D1_Face_<k>), and fillet(), the
// face edits (pushFace, moveFace with by / turn, deleteFace) and Design mode's
// Face edit dialog all work on it. The parts are made here and written out as
// STEP first, so the import knows nothing of how they were built.
//
//   node test/faceedit.js

import * as d from "../src/dsl.js";
import { build } from "../index.js";
import { exactSTEP } from "../src/stepexport.js";
import { runEngine, solidsToSTL } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";
import { PartHistory } from "brep-io-kernel";
import { faceOpText } from "../viewer/design/features.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const rust = await loadRustKernel();
const vol = (out) => {
  const v = [...solidsToSTL(out.solids).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  let t = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    t += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2]) + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return Math.abs(t);
};
// the kernel's own face and edge names, as the viewer passes them to compile
const names = async (json) => {
  const out = await runEngine(json, { rust, manifold: loadManifoldNode, edges: true });
  return out.solids.map((s) => ({ name: s.name, faces: s.faces.map((f) => f.name), edges: s.edges }));
};
const run = async (shape) => {
  const ph = new PartHistory();
  await d.compile(shape, ph, null, { edgeNames: names, faceNames: names });
  return runEngine(await ph.toJSON(), { rust, manifold: loadManifoldNode });
};
// each face: curved (a fillet), or flat with the axis its normal points along
function faceKinds(out) {
  const kinds = {};
  for (const f of out.solids[0].faces) {
    const P = f.positions, I = f.index || [...Array(P.length / 3).keys()];
    const ns = [];
    for (let t = 0; t < I.length; t += 3) {
      const p = [0, 1, 2].map((q) => [P[3 * I[t + q]], P[3 * I[t + q] + 1], P[3 * I[t + q] + 2]]);
      const a = p[1].map((v, i) => v - p[0][i]), b = p[2].map((v, i) => v - p[0][i]);
      const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const L = Math.hypot(...n) || 1;
      ns.push(n.map((v) => v / L));
    }
    const curved = ns.some((n) => n[0] * ns[0][0] + n[1] * ns[0][1] + n[2] * ns[0][2] < 0.999);
    const ax = ns[0].findIndex((v) => Math.abs(v) > 0.999);
    const k = curved ? "curved" : ax < 0 ? "slanted" : ["x", "y", "z"][ax] + (ns[0][ax] > 0 ? "+" : "-");
    (kinds[k] ??= []).push(f.name);
  }
  return kinds;
}
async function importPart(name, shape) {
  d.registerImport(name, await exactSTEP(await build(shape), name));
  const base = await run(d.importedSolid(name));
  return { base, kinds: faceKinds(base), part: () => d.importedSolid(name) };
}

// a 40 x 30 x 20 block with its four upright edges rounded, read back from STEP
{
  const { base, kinds, part } = await importPart("rounded.step", d.fillet({ r: 4, edges: "z" }, d.cube([40, 30, 20])));
  check("the STEP comes in as an exact solid", base.engine === "exact" || base.lane === "exact", base.engine ?? base.lane);
  check("...with its faces named after the import", base.solids[0].faces.every((f) => /^IMPORT3D\d+_Face_\d+$/.test(f.name)));
  check("...four of them the fillets", kinds.curved?.length === 4, JSON.stringify(kinds));
  const sharp = await run(d.deleteFace({ faces: kinds.curved }, part()));
  check("deleteFace on the fillets heals it sharp (24000 mm³)", near(vol(sharp), 24000, 1), vol(sharp).toFixed(1));
  const one = await run(d.deleteFace({ faces: [kinds.curved[0]] }, part()));
  check("...or one fillet at a time", vol(one) > vol(base) + 10 && vol(one) < 24000, vol(one).toFixed(1));
  const pushed = await run(d.pushFace({ faces: kinds["z+"], by: 3 }, part()));
  check("pushFace +3 on the top adds a 3 mm slab", near(vol(pushed) - vol(base), 3 * (vol(base) / 20), 2), (vol(pushed) - vol(base)).toFixed(1));
  const moved = await run(d.moveFace({ faces: kinds["z+"], by: [0, 0, -2] }, part()));
  check("moveFace by [0, 0, -2] takes a 2 mm slab off", near(vol(base) - vol(moved), 2 * (vol(base) / 20), 2), (vol(base) - vol(moved)).toFixed(1));
  const filleted = await run(d.fillet({ r: 2, edges: "top" }, part()));
  check("fillet() rounds the imported part's edges", vol(filleted) < vol(base) - 10, vol(filleted).toFixed(1));
  let stale = "";
  try { await run(d.deleteFace({ faces: ["IMPORT3D1_Face_99"] }, part())); } catch (e) { stale = String(e.message); }
  check("a face name that isn't on the part is refused, not guessed", /no face "IMPORT3D1_Face_99"/.test(stale), stale);
}

// tilting: a block, its top turned 5° about the far edge
{
  const { base, kinds, part } = await importPart("block.step", d.cube([40, 30, 20]));
  const centre = await run(d.moveFace({ faces: kinds["z+"], turn: [0, 5, 0] }, part()));
  check("moveFace turn: about the face's centre, what one side gains the other loses", near(vol(centre), vol(base), 1), vol(centre).toFixed(1));
  const edge = await run(d.moveFace({ faces: kinds["z+"], turn: [0, 5, 0], pivot: [0, 15, 20] }, part()));
  const wedge = 0.5 * 40 * (40 * Math.tan(5 * Math.PI / 180)) * 30;
  check("...about an edge (pivot) it takes the wedge off", near(vol(base) - vol(edge), wedge, 2), `${(vol(base) - vol(edge)).toFixed(1)} vs ${wedge.toFixed(1)}`);
}

// what Design mode's Face edit writes
{
  const text = 'importedSolid("part.step")';
  const body = { start: 0, end: text.length };
  check("Face edit: push", faceOpText(text, body, { mode: "push", faces: ["A"], by: 2 }).next === 'pushFace({ faces: ["A"], by: 2 }, importedSolid("part.step"))');
  check("Face edit: tilt", faceOpText(text, body, { mode: "tilt", faces: ["A"], angle: 5, axis: "y" }).next === 'moveFace({ faces: ["A"], turn: [0, 5, 0] }, importedSolid("part.step"))');
  check("Face edit: delete", faceOpText(text, body, { mode: "delete", faces: ["A", "B"] }).next === 'deleteFace({ faces: ["A", "B"] }, importedSolid("part.step"))');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
