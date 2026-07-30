// Export formats: OBJ conversion and the hand-rolled 3MF package. The 3MF is
// validated by actually unzipping it (jszip) and parsing the mesh XML back.

import { cube, cylinder, difference, translate, build, toSTL } from "../index.js";
import {
  stlToObj, stlTo3MF, colored3MF, splitConnectedParts, layoutOnPlates, partsPlate3MF,
} from "../viewer/exporters.js";
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

// ---- where the part lands on the plate --------------------------------
//
// A slicer's plate origin is its FRONT-LEFT corner, and models here are built
// around 0,0 — so a 3MF written as-modelled opens in the corner with half the
// part off the bed. That is what a user hit with a four-colour Benchy in Orca.
console.log("\n3MF plate placement\n");

const boundsOfModel = (xml) => {
  const b = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  for (const m of xml.matchAll(/<vertex x="([-\d.eE]+)" y="([-\d.eE]+)" z="([-\d.eE]+)"\/>/g)) {
    const v = { x: +m[1], y: +m[2], z: +m[3] };
    for (const a of ["x", "y", "z"]) {
      b[a][0] = Math.min(b[a][0], v[a]);
      b[a][1] = Math.max(b[a][1], v[a]);
    }
  }
  return {
    centre: ["x", "y", "z"].map((a) => +((b[a][0] + b[a][1]) / 2).toFixed(3)),
    size: ["x", "y", "z"].map((a) => +(b[a][1] - b[a][0]).toFixed(3)),
    minZ: +b.z[0].toFixed(3),
  };
};
const modelOf = async (bytes) =>
  (await JSZip.loadAsync(bytes)).file("3D/3dmodel.model").async("string");

const placed = boundsOfModel(await modelOf(stlTo3MF(stl, "part")));
check("centred on a 256 × 256 plate by default",
  placed.centre[0] === 128 && placed.centre[1] === 128, placed.centre.join(", "));
check("...standing ON the bed, not through it", placed.minZ === 0, String(placed.minZ));
check("...with the geometry itself untouched",
  placed.size.join(",") === "20,20,8", placed.size.join(", "));

const mini = boundsOfModel(await modelOf(stlTo3MF(stl, "part", { plate: { x: 180, y: 180 } })));
check("a smaller plate centres on ITS middle",
  mini.centre[0] === 90 && mini.centre[1] === 90, mini.centre.join(", "));

const asIs = boundsOfModel(await modelOf(stlTo3MF(stl, "part", { plate: null })));
check("plate: null keeps the model's own coordinates",
  asIs.centre[0] === 10 && asIs.centre[1] === 10, asIs.centre.join(", "));

// A multi-colour model must move as ONE assembly: centring each colour on its
// own middle would take the model apart.
const twoParts = [
  { color: "#c0392b", verts: [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 5]],
    tris: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]] },
  { color: "#1e2a78", verts: [[20, 0, 0], [30, 0, 0], [20, 10, 0], [20, 0, 5]],
    tris: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]] },
];
const colour = boundsOfModel(await modelOf(colored3MF(twoParts, "part")));
check("a colour 3MF centres the whole assembly",
  colour.centre[0] === 128 && colour.centre[1] === 128, colour.centre.join(", "));
check("...without pulling its parts apart",
  colour.size.join(",") === "30,10,5", colour.size.join(", "));

// ---- parts laid out on plates -----------------------------------------
//
// "Part" is decided by CONNECTIVITY: a two-colour piece whose colours share
// vertices is one part; two pieces of the same colour are two. The laid-out
// export then packs every part side by side on the bed, each on z=0.
console.log("\n3MF parts laid out\n");

// a closed-ish tetra soup at an offset, in a colour
const tetra = (ox, oy, oz, color) => ({
  color,
  verts: [[ox, oy, oz], [ox + 10, oy, oz], [ox, oy + 10, oz], [ox, oy, oz + 6]],
  tris: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]],
});
{
  // same colour, far apart -> 2 parts; two colours SHARING vertices -> 1 part
  const separate = splitConnectedParts([tetra(0, 0, 0, "#aa0000"), tetra(60, 0, 0, "#aa0000")]);
  check("two islands of one colour are two parts", separate.length === 2, String(separate.length));
  const shared = splitConnectedParts([
    tetra(0, 0, 0, "#aa0000"),
    { color: "#0000aa", verts: [[10, 0, 0], [0, 10, 0], [0, 0, 6], [8, 8, 8]],
      tris: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]] },   // reuses the tetra's corners
  ]);
  check("two colours sharing vertices stay ONE part", shared.length === 1, String(shared.length));
  check("...and that part keeps both colours",
    shared[0]?.groups.length === 2, String(shared[0]?.groups.length));
}
{
  // an assembly: a lid FLOATING ABOVE a base, same x/y — assembled they overlap
  // in plan view, laid out they must sit apart, both ON the bed
  const base = tetra(0, 0, 0, "#aa0000");
  const lid = tetra(0, 0, 30, "#0000aa");
  const files = partsPlate3MF([base, lid], "jar", { plate: { x: 200, y: 200 } });
  check("one plate is enough for two small parts", files.length === 1, String(files.length));
  check("...reporting both parts", files[0].parts === 2, String(files[0]?.parts));
  const xml = await modelOf(files[0].bytes);
  const b = boundsOfModel(xml);
  check("everything stands on the bed (the floating lid came down)", b.minZ === 0, String(b.minZ));
  check("the layout fits the plate",
    b.centre[0] > 0 && b.centre[0] < 200 && b.size[0] <= 200 && b.size[1] <= 200,
    `centre ${b.centre.join(",")} size ${b.size.join(",")}`);
  check("parts are separate build items", (xml.match(/<item /g) || []).length === 2);
  check("each part is its own object with components",
    (xml.match(/<components>/g) || []).length === 2);
  // laid out means NOT overlapping: the two tetras share x 0..10 as modelled,
  // so if the second still overlaps the first the layout did nothing
  const xs = [...xml.matchAll(/<vertex x="([-\d.eE]+)"/g)].map((m) => +m[1]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  check("the two parts sit apart, not on top of each other",
    Math.max(...xs) - Math.min(...xs) > 20, `x span ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)}`);
  void mid;
}
{
  // parts that cannot share a plate spill onto plate 2, as separate files
  const big = (ox) => tetra(ox, 0, 0, "#00aa00");
  // 150mm footprints on a 200mm plate: one per plate, no two ways about it
  const files = partsPlate3MF(
    [big(0), big(100), big(200)].map((t) => ({ ...t, verts: t.verts.map(([x, y, z]) => [x * 15, y * 15, z]) })),
    "wide", { plate: { x: 200, y: 200 }, gap: 8 });
  check("oversized batch spills onto more plates", files.length > 1, String(files.length));
  check("...with numbered suffixes", files[0].suffix === "-plate1" && files[1].suffix === "-plate2",
    files.map((f) => f.suffix).join(" "));
  const total = files.reduce((n, f) => n + f.parts, 0);
  check("...and no part is lost in the split", total === 3, String(total));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
