// Modelled threads (src/threads.js) and the hardware built on them.
//
// The mesh is checked closed by construction (every directed edge has its
// twin), its volume lands between the minor and major cylinders, and the
// verbs build through the real kernel: a bolt, a nut, a tapped plate.

import { threadMesh, threadSpec, threadStl, COARSE_PITCH } from "../src/threads.js";
import { thread, difference, translate, cube } from "../src/dsl.js";
import { bolt, threadedNut, threadedHole, SCREWS } from "../src/parts.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

function stats(m) {
  const e = new Map();
  let vol = 0;
  for (const f of m.faces) {
    for (let k = 0; k < 3; k++) { const key = `${f[k]}:${f[(k + 1) % 3]}`; e.set(key, (e.get(key) || 0) + 1); }
    const [A, B, C] = f.map((i) => m.points[i]);
    vol += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
  }
  let open = 0, dup = 0;
  for (const [k, c] of e) { const [a, b] = k.split(":"); if (!e.has(`${b}:${a}`)) open++; if (c > 1) dup++; }
  const z = m.points.map((p) => p[2]);
  return { open, dup, vol, zMin: Math.min(...z), zMax: Math.max(...z), r: Math.max(...m.points.map((p) => Math.hypot(p[0], p[1]))) };
}

console.log("\nthe sizes are the standard ones\n");
check("M8 coarse is 1.25", threadSpec("M8").pitch === 1.25);
check("M2.5 is spelled either way", threadSpec("m2.5").pitch === 0.45 && threadSpec("M2_5").d === 2.5);
check("a bare number is a diameter", threadSpec(6).d === 6 && threadSpec(6).pitch === 1.0);
check("a fine pitch is honoured", threadSpec("M8", 1).pitch === 1);
let threw = false; try { threadSpec("M7"); } catch { threw = true; }
check("an unknown size says so", threw);
check("every screw in the table has a thread pitch", Object.keys(SCREWS).every((k) => COARSE_PITCH[k] === SCREWS[k].pitch),
  Object.keys(SCREWS).filter((k) => COARSE_PITCH[k] !== SCREWS[k].pitch).join(", "));

console.log("\nthe mesh is a closed solid of the right size\n");
for (const [size, L, internal] of [["M3", 10, false], ["M8", 20, false], ["M8", 12, true], ["M12", 25, false]]) {
  const sp = threadSpec(size);
  const m = threadMesh({ ...sp, length: L, internal });
  const s = stats(m);
  const tag = `${size} x ${L}${internal ? " cutter" : ""}`;
  check(`${tag}: closed`, s.open === 0 && s.dup === 0, `open ${s.open}, doubled ${s.dup}`);
  const rMaj = sp.d / 2 + (internal ? 0.15 : 0), rMin = rMaj - 0.5413 * sp.pitch;
  check(`${tag}: volume between minor and major cylinders`, s.vol > Math.PI * rMin * rMin * L && s.vol < Math.PI * rMaj * rMaj * L,
    `${s.vol.toFixed(1)}`);
  check(`${tag}: runs 0 to ${L}`, Math.abs(s.zMin) < 1e-9 && Math.abs(s.zMax - L) < 1e-9);
  check(`${tag}: outside diameter is the size (plus fit on a cutter)`, Math.abs(s.r * 2 - sp.d - (internal ? 0.3 : 0)) < 0.02, `${(s.r * 2).toFixed(3)}`);
}
{
  const right = threadMesh({ d: 8, pitch: 1.25, length: 10 }), left = threadMesh({ d: 8, pitch: 1.25, length: 10, leftHand: true });
  check("left hand is a mirror, same volume", Math.abs(stats(right).vol - stats(left).vol) < 0.5 && stats(left).open === 0);
  check("the STL writer writes every face", (threadStl({ d: 3, pitch: 0.5, length: 4 }).match(/facet normal/g) || []).length === threadMesh({ d: 3, pitch: 0.5, length: 4 }).faces.length);
}

console.log("\nthe verbs build through the kernel\n");
async function measure(shape) {
  const stl = toSTL(await build(shape), "p");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  const ax = (i) => [Math.min(...v.map((p) => p[i])), Math.max(...v.map((p) => p[i]))];
  return { x: ax(0), y: ax(1), z: ax(2), facets: v.length / 3 };
}
{
  const r = await measure(thread({ size: "M6", length: 15 }));
  check("thread(): an M6 rod 15 long", Math.abs(r.z[1] - r.z[0] - 15) < 0.01 && Math.abs(r.x[1] - r.x[0] - 6) < 0.05, JSON.stringify(r));
}
{
  const r = await measure(bolt("M5", { length: 16 }));
  check("bolt(): head above z = 0, shank down to -16", Math.abs(r.z[0] + 16) < 0.01 && Math.abs(r.z[1] - SCREWS.M5.socket.h) < 0.01, JSON.stringify(r.z));
}
{
  const r = await measure(threadedNut("M8"));
  check("threadedNut(): as thick as the table says", Math.abs(r.z[1] - r.z[0] - SCREWS.M8.nutT) < 0.05, JSON.stringify(r.z));
}
{
  const r = await measure(difference(cube([30, 30, 10]), translate([15, 15, 10], threadedHole("M6", { depth: 10.5 }))));
  check("threadedHole(): a tapped plate keeps its outside", Math.abs(r.x[1] - r.x[0] - 30) < 0.01 && Math.abs(r.z[1] - r.z[0] - 10) < 0.01, JSON.stringify(r));
  check("...and has the thread's facets in it", r.facets > 1000, `${r.facets}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
