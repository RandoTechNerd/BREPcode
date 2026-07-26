// Export formats: OBJ conversion and the hand-rolled 3MF package. The 3MF is
// validated by actually unzipping it (jszip) and parsing the mesh XML back.

import { cube, cylinder, difference, translate, build, toSTL } from "../index.js";
import { stlToObj, stlTo3MF } from "../viewer/exporters.js";
import JSZip from "jszip";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const r = await build(difference(
  cube([20, 20, 8]),
  translate([10, 10, -1], cylinder({ r: 4, h: 10, $fn: 32 })),
));
const stl = toSTL(r, "t");
const facets = (stl.match(/facet normal/g) || []).length;

console.log("\nOBJ\n");
const obj = stlToObj(stl, "part");
const objVerts = (obj.match(/^v /gm) || []).length;
const objFaces = (obj.match(/^f /gm) || []).length;
check("face count matches STL facets", objFaces === facets, `${objFaces} vs ${facets}`);
check("vertices deduplicated", objVerts < facets * 3, `${objVerts} verts for ${facets} facets`);
check("indices are 1-based and in range", (() => {
  for (const m of obj.matchAll(/^f (\d+) (\d+) (\d+)$/gm)) {
    for (const g of [m[1], m[2], m[3]]) {
      const i = +g;
      if (i < 1 || i > objVerts) return false;
    }
  }
  return true;
})());

console.log("\n3MF\n");
const mf = stlTo3MF(stl, "part");
check("starts with zip magic PK", mf[0] === 0x50 && mf[1] === 0x4b);

const zip = await JSZip.loadAsync(mf);   // validates central directory + CRCs
const names = Object.keys(zip.files).sort();
check("package structure", JSON.stringify(names) ===
  JSON.stringify(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]), names.join(", "));

const model = await zip.file("3D/3dmodel.model").async("string");
const triCount = (model.match(/<triangle /g) || []).length;
const vertCount = (model.match(/<vertex /g) || []).length;
check("model XML declares millimetres", model.includes('unit="millimeter"'));
check("triangle count matches STL", triCount === facets, `${triCount} vs ${facets}`);
check("vertex count matches OBJ dedupe", vertCount === objVerts, `${vertCount} vs ${objVerts}`);
check("triangle indices in range", (() => {
  for (const m of model.matchAll(/v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
    for (const g of [m[1], m[2], m[3]]) if (+g >= vertCount) return false;
  }
  return true;
})());
check("rels points at the model", (await zip.file("_rels/.rels").async("string")).includes("/3D/3dmodel.model"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
