// Exact screw threads (src/thread.js): thread() and tube(helix()) build on the
// exact lane, as closed solids of the right size, and a bolt fits the tap cut
// with the same d and pitch.
//
// Each exact thread costs a few seconds on the Rust kernel (joining the swept
// tooth to its core is the slow step), so the parts here are short.
//
//   node test/thread.js

import * as dsl from "../index.js";
import { build } from "../index.js";
import { threadSpec, threadMesh, coarsePitch } from "../src/thread.js";
import { exactAdvice } from "../src/exactlane.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";

const { thread, tube, helix, difference, cylinder, translate, union } = dsl;
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const rust = await loadRustKernel();
const mf = await loadManifoldNode();

// STL text -> manifold (welded), or null when it is not a closed solid
function manifoldOf(stl) {
  const map = new Map(), verts = [], tris = [];
  for (const m of stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
    const p = [+m[1], +m[2], +m[3]];
    const k = p.map((v) => Math.round(v * 1e4)).join(",");
    if (!map.has(k)) { map.set(k, verts.length / 3); verts.push(...p); }
    tris.push(map.get(k));
  }
  const keep = [];
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = tris.slice(i, i + 3);
    if (a !== b && b !== c && a !== c) keep.push(a, b, c);
  }
  try {
    const mesh = new mf.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(keep) });
    mesh.merge();
    const s = new mf.Manifold(mesh);
    return s.status() === "NoError" ? s : null;
  } catch { return null; }
}
const exactVolume = (r) => JSON.parse(rust.mass_properties_handle(r.solids[0].handle)).volume;
const timed = async (shape) => { const t = performance.now(); const r = await build(shape); return { r, ms: performance.now() - t }; };

console.log("\nthe spec: ISO sizes, and the sizes it refuses\n");
{
  check("M8 defaults to its coarse pitch, M40 to 4.5", coarsePitch(8) === 1.25 && coarsePitch(42) === 4.5);
  const s = threadSpec({ d: 8, length: 20 });
  check("ISO basic depth 5H/8 and a 4 mm crest radius", Math.abs(s.depth - 0.5413 * 1.25) < 1e-3 && s.rMaj === 4, `${s.depth}`);
  check("the tooth stops short of both chamfered ends", s.zA > 0 && s.zB < 20 && s.turns > 10);
  const t = threadSpec({ d: 8, length: 6, internal: true, clearance: 0.4 });
  check("the tap is the rod grown by half the clearance", Math.abs(t.rMaj - 4.2) < 1e-9 && Math.abs(t.rMin - (s.rMin + 0.2)) < 1e-9);
  check("...and runs out through both faces of a nut", t.zA < 0 && t.zB > 6);
  check("...but not through the top of a lid", threadSpec({ d: 40, pitch: 3, length: 9, internal: true, blind: true }).zB < 9);
  let msg = "";
  try { threadSpec({ d: 8, pitch: 1.25, length: 6, internal: true, clearance: 1.5 }); } catch (e) { msg = e.message; }
  check("too much clearance for the pitch is refused by name", /clearance/.test(msg), msg);
  try { msg = ""; threadSpec({ d: 8, length: 1 }); } catch (e) { msg = e.message; }
  check("a rod too short to hold a turn is refused", /too short/.test(msg), msg);
  try { msg = ""; thread({ pitch: 1 }); } catch (e) { msg = e.message; }
  check("no size: a usage hint", /thread\(\{ d: 8/.test(msg), msg);
  check("a short thread is exact by default", threadSpec({ d: 40, pitch: 3, length: 9, profile: "round" }).exact === true);
  check("...a long one is triangles unless exact: true asks for the wait",
    threadSpec({ d: 8, length: 30 }).exact === false && threadSpec({ d: 8, length: 30, exact: true }).exact === true);
}

console.log("\nthe triangles the JS kernel and the fallback read are a closed solid\n");
for (const opts of [{ d: 10, pitch: 1.5, length: 8 }, { d: 40, pitch: 3, length: 9, profile: "round", chamfer: "top" },
  { d: 12, pitch: 2, length: 8, profile: "square", starts: 2, leftHand: true }, { d: 10, pitch: 1.5, length: 6, internal: true }]) {
  const m = manifoldOf(threadMesh(threadSpec(opts)));
  check(`mesh of ${JSON.stringify(opts)} is watertight`, !!m && m.genus() === 0, m ? `genus ${m.genus()}` : "not a manifold");
  m?.delete();
}

console.log("\nthread() and tube(helix()) stay on the exact lane\n");
let boltVol = 0;
{
  const opts = { d: 10, pitch: 1.5, length: 6 };
  const { r, ms } = await timed(thread(opts));
  check(`an M10 x 6 rod builds exact (${Math.round(ms)} ms)`, r.engine === "exact" && r.solids.length === 1 && r.solids[0].exact,
    r.fallback || JSON.stringify(r.stats));
  const s = threadSpec(opts);
  boltVol = exactVolume(r);
  // between the core and the crest cylinder, and close to the triangles
  const core = Math.PI * s.rMin ** 2 * s.L, crest = Math.PI * s.rMaj ** 2 * s.L;
  const mesh = manifoldOf(threadMesh(s));
  check("its volume sits between the root and crest cylinders", boltVol > core * 0.97 && boltVol < crest, `${boltVol.toFixed(1)} vs ${core.toFixed(1)}..${crest.toFixed(1)}`);
  check("...and within 2% of the analytic mesh", Math.abs(boltVol - mesh.volume()) / boltVol < 0.02, `${boltVol.toFixed(1)} vs ${mesh.volume().toFixed(1)}`);
  mesh.delete();
  const shell = manifoldOf(r.solids[0].toSTL("bolt"));
  check("the exact solid tessellates watertight", !!shell && shell.genus() === 0, shell ? `genus ${shell.genus()}` : "open");
  shell?.delete();
  check("it reaches the kernel as HX + SW, joined to its core", r.stats?.exactSweeps === 1);
}
{
  const { r, ms } = await timed(tube(helix({ r: 10, turns: 3, pitch: 5 }), { r: 1.5 }));
  const v = r.solids[0]?.exact ? exactVolume(r) : 0;
  // Pappus: the section times the path its centre travels
  const pappus = Math.PI * 1.5 ** 2 * 3 * 2 * Math.PI * 10;
  check(`tube(helix()) is an exact coil (${Math.round(ms)} ms)`, r.engine === "exact", r.fallback || "");
  check("...of the Pappus volume", Math.abs(v - pappus) / pappus < 0.01, `${v.toFixed(1)} vs ${pappus.toFixed(1)}`);
  const kept = await build(tube(helix({ r: 10, turns: 3, pitch: 5 }), { r: 1.5, caps: "round" }));
  check("round end caps asked for by name keep the mesh sweep", kept.engine === "mesh");
  const flat = await build(tube(helix({ r: 10, turns: 3, pitch: 0 }), { r: 1.5 }));
  check("a flat spiral (pitch 0) is still the mesh sweep", flat.engine === "mesh");
}

console.log("\na bolt fits the tap cut with the same d and pitch\n");
{
  const opts = { d: 10, pitch: 1.5, length: 6 };
  const tapOpts = { ...opts, internal: true, clearance: 0.4, exact: true };
  const { r, ms } = await timed(thread(tapOpts));
  check(`the tap builds exact (${Math.round(ms)} ms)`, r.engine === "exact", r.fallback || "");
  const bolt = manifoldOf((await build(thread(opts))).solids[0].toSTL("b"));
  const tap = manifoldOf(r.solids[0].toSTL("t"));
  const clash = bolt.subtract(tap).volume();
  check("no part of the bolt is left outside the tap (it turns freely)", clash < boltVol * 0.002, `${clash.toFixed(3)} mm3 of ${boltVol.toFixed(1)}`);
  // and the tap is not just a big hole: its thread engages the bolt's
  const crestRing = mf.Manifold.cylinder(4, 5.0, 5.0, 96).translate([0, 0, 1]);
  const minorRing = mf.Manifold.cylinder(4, 5.0 - 0.5413 * 1.5 + 0.2 + 0.05, 5.0 - 0.5413 * 1.5 + 0.2 + 0.05, 96).translate([0, 0, 1]);
  const nutTeeth = crestRing.subtract(minorRing).subtract(tap).volume();
  check("...and the nut keeps teeth inside the bolt's crest diameter", nutTeeth > 10, `${nutTeeth.toFixed(1)} mm3`);
  const zero = manifoldOf((await build(thread({ ...opts, internal: true, clearance: 0, exact: false }))).solids[0].toSTL("z"));
  const gap = tap.subtract(bolt).volume() - zero.subtract(bolt).volume();
  check("the clearance is real play: 0.4 mm opens up the tap", gap > 5, `${gap.toFixed(1)} mm3 more room`);
  for (const m of [bolt, tap, crestRing, minorRing, zero]) m.delete();
}

console.log("\na thread past the exact budget is the mesh, and says nothing\n");
{
  const r = await build(thread({ d: 8, length: 30 }));
  check("an M8 x 30 builds at once, as triangles", r.engine === "mesh" && !r.fallback);
  check("...and the advice leaves a thread alone", exactAdvice({ engine: "mesh" }, "return thread({ d: 8, length: 30 });") === null);
}

console.log("\nthe exact-lane advice points a mesh thread at thread()\n");
{
  const a = exactAdvice({ engine: "mesh" }, "return union(neck, tube(helix({ r: 20, turns: 2, pitch: 3 }), { r: 1, caps: 'round' }));");
  check("a tube(helix()) mesh is named and thread() suggested", /thread\(\{ d, pitch, length \}\)/.test(a?.ask || "") && /tube\(helix\(\)\)/.test(a?.note || ""), a?.ask);
  check("a bent wire (no helix) is still a mesh on purpose", exactAdvice({ engine: "mesh" }, "return tube([[0,0,0],[9,0,0]], { r: 1 });") === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
