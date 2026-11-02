// The current "Open as a smooth surface" path, timed stage by stage:
//   node current.mjs <file.stl> [faces...]   -> one JSON line per cage size
import { writeFileSync } from "node:fs";
import { loadSTL, cage, kernelImport, deviation, stlSoup } from "./lib.mjs";
const S = await import(new URL("../../src/smoothstep.js", import.meta.url).href);
const [path, ...sizes] = process.argv.slice(2);
const { stl, mesh, name } = loadSTL(path);
for (const faces of (sizes.length ? sizes : ["1200", "2500"]).map(Number)) {
  const out = { name, triangles: mesh.tris.length / 3, target: faces };
  try {
    const c = await cage(stl, faces);
    out.cage = { quads: c.quads.length / 4, ms: c.ms, stageMs: c.stageMs, seed: c.seed };
    const t = performance.now();
    const r = S.cageToStep(c.verts, c.quads, { name, mesh: true });
    out.write = { ms: Math.round(performance.now() - t), faces: r.faces, folded: r.folded, relaxed: r.relaxed, MB: +(r.step.length / 1048576).toFixed(2) };
    out.dev = deviation(mesh, stlSoup(r.mesh));
    writeFileSync(new URL(`./out/${name}-cur${faces}.step`, import.meta.url), r.step);
    writeFileSync(new URL(`./out/${name}-cur${faces}.stl`, import.meta.url), r.mesh);
    out.kernel = await kernelImport(r.step, name);
    out.totalMs = out.cage.ms + out.write.ms + out.kernel.ms;
  } catch (e) { out.failed = String(e?.message || e).slice(0, 200); }
  console.log(JSON.stringify(out));
}
process.exit(0);
