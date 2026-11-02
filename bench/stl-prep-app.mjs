// Prepare STLs the way the viewer's import does before "Open as an exact
// solid" ever sees them (viewer/index.html, the file-drop handler):
//   binary  -> repairBinaryStl (src/meshrepair.js) when the mesh needs it,
//              else one scratch IMPORT3D through the JS kernel, toSTL(name, 6)
//   ASCII   -> as is
//   then    -> duplicate facets dropped, part recentred on the plate
// so bench/kernel-bench.mjs stl can time the converter on the app's real input.
//
//   node bench/stl-prep-app.mjs list.txt outDir   (writes outDir/list.txt too)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { PartHistory } from "brep-io-kernel";
import { repairBinaryStl } from "../src/meshrepair.js";

const [listFile, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const MESH_HEAVY = 80000;   // viewer/index.html: past here the cosmetic passes are skipped

// copied from viewer/index.html (inline there, not a module)
function dedupeStlFacets(stl) {
  const facets = stl.match(/facet\s+normal[\s\S]*?endfacet/g);
  if (!facets || facets.length < 2 || facets.length > MESH_HEAVY) return { text: stl, removed: 0 };
  const seen = new Set(), kept = [];
  for (const f of facets) {
    const vs = [...f.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((v) => `${(+v[1]).toFixed(4)},${(+v[2]).toFixed(4)},${(+v[3]).toFixed(4)}`);
    if (vs.length !== 3) { kept.push(f); continue; }
    const id = vs.slice().sort().join("|");
    if (seen.has(id)) continue;
    seen.add(id); kept.push(f);
  }
  const removed = facets.length - kept.length;
  if (!removed) return { text: stl, removed: 0 };
  const name = (/^\s*solid\s+(.*)$/m.exec(stl)?.[1] || "mesh").trim();
  return { text: `solid ${name}\n${kept.join("\n")}\nendsolid ${name}\n`, removed };
}
function recenterStl(stl) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let m;
  while ((m = re.exec(stl))) {
    const p = [+m[1], +m[2], +m[3]];
    for (let i = 0; i < 3; i++) { if (!Number.isFinite(p[i])) return stl; lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  }
  if (!Number.isFinite(lo[0])) return stl;
  const off = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]];
  if (off.every((n) => Math.abs(n) < 0.05)) return stl;
  return stl.replace(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g, (_, x, y, z) => `vertex ${(+x + off[0])} ${(+y + off[1])} ${(+z + off[2])}`);
}

const list = readFileSync(listFile, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
const outList = [];
for (const file of list) {
  const name = basename(file);
  const bytes = new Uint8Array(readFileSync(file));
  let contents = new TextDecoder().decode(bytes.subarray(0, 512));
  let how;
  try {
    if (/^\s*solid/.test(contents) && /facet/.test(new TextDecoder().decode(bytes.subarray(0, 4096)))) {
      contents = new TextDecoder().decode(bytes); how = "ascii";
    } else {
      contents = null;
      const fix = repairBinaryStl(bytes, name);
      if (fix?.changed) { contents = fix.text; how = `repaired (${fix.before.openEdges || 0} open edges, ${fix.before.degenerate || 0} degenerate)`; }
      if (!contents) {
        const ph = new PartHistory();
        const im = await ph.newFeature("IMPORT3D");
        im.inputParams.fileToImport = `data:model/stl;base64,${Buffer.from(bytes).toString("base64")}`;
        im.inputParams.centerMesh = false;
        im.inputParams.meshRepairLevel = "NONE";
        await ph.runHistory({ throwOnFeatureError: true });
        const solid = (ph.scene?.children || []).find((o) => o.type === "SOLID" && o.toSTL);
        if (!solid) throw new Error("no solid found in the file");
        contents = solid.toSTL(name, 6); how = how || "binary -> ascii";
      }
    }
    const d = dedupeStlFacets(contents);
    const facets = (d.text.match(/vertex/g)?.length ?? 0) / 3;
    const text = facets <= MESH_HEAVY ? recenterStl(d.text) : d.text;
    const out = resolve(outDir, name);
    writeFileSync(out, text);
    outList.push(out);
    console.log(`ok   ${name.padEnd(36)} ${how}${d.removed ? `, ${d.removed} duplicate facets dropped` : ""}`);
  } catch (e) {
    console.log(`FAIL ${name.padEnd(36)} the app's import would refuse it: ${String(e.message || e).slice(0, 120)}`);
  }
}
writeFileSync(join(outDir, "list.txt"), outList.join("\n") + "\n");
process.exit(0);
