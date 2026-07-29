// Model-inventory parsers: STL (ascii + binary), OBJ, and 3MF via the
// minimal zip reader — including a round-trip through our own 3MF writer.

import {
  parseSTL, parseOBJ, parse3MF, parseModelFile,
  parse3MFObjects, parse3MFPartColours, parse3MFColourGroups,
} from "../viewer/inventory.js";
import { stlTo3MF, colored3MF } from "../viewer/exporters.js";
import { build, toSTL, cube } from "../index.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const enc = new TextEncoder();

console.log("\ninventory parsers\n");

// a real kernel-generated ascii STL
const asciiStl = toSTL(await build(cube([10, 10, 10])), "c");
{
  const pos = parseSTL(enc.encode(asciiStl));
  check("ascii STL parses to 12 triangles", pos.length === 12 * 9, String(pos.length / 9));
  const zs = [...pos].filter((_, i) => i % 3 === 2);
  check("ascii STL coordinates intact", Math.min(...zs) === 0 && Math.max(...zs) === 10);
}

// binary STL built by hand: one triangle
{
  const buf = new ArrayBuffer(84 + 50);
  const dv = new DataView(buf);
  dv.setUint32(80, 1, true);
  const tri = [[0, 0, 0], [5, 0, 0], [0, 5, 0]];
  tri.forEach((v, i) => v.forEach((c, k) => dv.setFloat32(84 + 12 + i * 12 + k * 4, c, true)));
  const pos = parseSTL(buf);
  check("binary STL parses", pos.length === 9 && pos[3] === 5, String([...pos]));
}

// binary STL that starts with "solid" in its header must still read as binary
{
  const buf = new ArrayBuffer(84 + 50);
  const dv = new DataView(buf);
  enc.encode("solid misleading header").forEach((b, i) => dv.setUint8(i, b));
  dv.setUint32(80, 1, true);
  dv.setFloat32(84 + 12, 1, true);
  const pos = parseSTL(buf);
  check("binary STL with 'solid' header not misread as ascii", pos.length === 9, String(pos.length));
}

{
  const pos = parseOBJ("v 0 0 0\nv 10 0 0\nv 10 10 0\nv 0 10 0\nf 1 2 3 4");
  check("OBJ quad fan-triangulates", pos.length === 2 * 9, String(pos.length / 9));
  const neg = parseOBJ("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1");
  check("OBJ negative indices", neg.length === 9, String(neg.length));
}

// 3MF round-trip: our stored-zip writer -> the inventory zip reader
{
  const zip = stlTo3MF(asciiStl, "cube");
  const pos = await parse3MF(zip.buffer ?? zip);
  check("3MF (stored zip) round-trips", pos.length === 12 * 9, String(pos.length / 9));
  const xs = [...pos].filter((_, i) => i % 3 === 0);
  // The writer now centres the part on the build plate, so the absolute
  // coordinates move — what has to survive the round-trip is the SHAPE.
  check("3MF geometry intact", Math.max(...xs) - Math.min(...xs) === 10,
    `${Math.min(...xs)}..${Math.max(...xs)}`);
  check("...placed on the middle of the default plate",
    (Math.min(...xs) + Math.max(...xs)) / 2 === 128, String((Math.min(...xs) + Math.max(...xs)) / 2));
  const asIs = [...await parse3MF((stlTo3MF(asciiStl, "cube", { plate: null })).buffer)]
    .filter((_, i) => i % 3 === 0);
  check("...and plate: null leaves them exactly as modelled",
    Math.min(...asIs) === 0 && Math.max(...asIs) === 10, `${Math.min(...asIs)}..${Math.max(...asIs)}`);
}

// deflated 3MF: recompress our package with real deflate entries
{
  const { default: JSZip } = await import("jszip");
  const src = stlTo3MF(asciiStl, "cube");
  const stored = new JSZip();
  await stored.loadAsync(src);
  const out = new JSZip();
  for (const [name, entry] of Object.entries(stored.files)) {
    out.file(name, await entry.async("uint8array"));
  }
  const deflated = await out.generateAsync({
    type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 },
  });
  const pos = await parse3MF(deflated);
  check("3MF (deflated zip) parses via DecompressionStream", pos.length === 12 * 9, String(pos.length / 9));
}

// router
{
  const pos = await parseModelFile("thing.stl", enc.encode(asciiStl));
  check("parseModelFile routes by extension", pos.length === 12 * 9);
  let threw = false;
  try { await parseModelFile("thing.gcode", new Uint8Array(4)); } catch { threw = true; }
  check("unknown extension errors clearly", threw);
}

// --- the 3MF production extension -----------------------------------------
//
// A real 4-colour Benchy would not import: zero triangles, no error anyone
// could act on. parse3MF read the FIRST .model part in the zip, and on every
// file Bambu or Orca writes that part is 3D/3dmodel.model, which contains
// nothing but <components> pointing into 3D/Objects/*.model. The geometry was
// in another file the whole time.
{
  const { default: JSZip } = await import("jszip");

  // Two unit cubes in a SEPARATE part file, referenced by an assembly in the
  // root, each moved by its own component transform — the exact shape of a
  // multi-part slicer project.
  const cube = (id) => `  <object id="${id}" type="model">
   <mesh>
    <vertices>
     <vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="1" y="1" z="0"/>
     <vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/><vertex x="1" y="0" z="1"/>
     <vertex x="1" y="1" z="1"/><vertex x="0" y="1" z="1"/>
    </vertices>
    <triangles>
     <triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="3" v3="2"/>
     <triangle v1="4" v2="5" v3="6"/><triangle v1="4" v2="6" v3="7"/>
     <triangle v1="0" v2="1" v3="5"/><triangle v1="0" v2="5" v3="4"/>
     <triangle v1="1" v2="2" v3="6"/><triangle v1="1" v2="6" v3="5"/>
     <triangle v1="2" v2="3" v3="7"/><triangle v1="2" v2="7" v3="6"/>
     <triangle v1="3" v2="0" v3="4"/><triangle v1="3" v2="4" v3="7"/>
    </triangles>
   </mesh>
  </object>`;

  const objects = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
${cube(1)}
${cube(2)}
 </resources>
</model>`;

  const root = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <resources>
  <object id="9" type="model">
   <components>
    <component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
    <component p:path="/3D/Objects/object_1.model" objectid="2" transform="1 0 0 0 1 0 0 0 1 10 0 0"/>
   </components>
  </object>
 </resources>
 <build><item objectid="9"/></build>
</model>`;

  const z = new JSZip();
  z.file("3D/3dmodel.model", root);
  z.file("3D/Objects/object_1.model", objects);
  const bytes = await z.generateAsync({ type: "uint8array" });

  const pos = await parse3MF(bytes);
  check("geometry in a separate part file is followed", pos.length / 9 === 24,
    `${pos.length / 9} triangles`);

  const xs = [...pos].filter((_, i) => i % 3 === 0);
  check("...and each component's transform is applied",
    Math.min(...xs) === 0 && Math.max(...xs) === 11,
    `x spans ${Math.min(...xs)}..${Math.max(...xs)}`);

  // The root on its own carries no mesh — reading only that is the old bug.
  const rootOnly = new JSZip();
  rootOnly.file("3D/3dmodel.model", root);
  const orphan = await parse3MF(await rootOnly.generateAsync({ type: "uint8array" }));
  check("a dangling component reference yields nothing rather than throwing",
    orphan.length === 0);

  // and the ordinary single-file 3MF must still work
  const plain = stlTo3MF(asciiStl, "cube");
  check("a plain single-part 3MF still parses",
    (await parse3MF(plain.buffer ?? plain)).length === 12 * 9);
}

// ---- colour round-trip through our OWN writer -------------------------------
// The bug this pins down: colored3MF wrote per-part extruders but never the
// filament_colour palette, so a coloured BREPcode export re-imported GREY.
{
  const cubeGroup = (ox, color) => {
    const v = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]]
      .map(([x, y, z]) => [x + ox, y, z]);
    const q = (a, b, c, d) => [[a, b, c], [a, c, d]];
    const tris = [...q(0, 3, 2, 1), ...q(4, 5, 6, 7), ...q(0, 1, 5, 4), ...q(2, 3, 7, 6), ...q(0, 4, 7, 3), ...q(1, 2, 6, 5)];
    return { verts: v, tris, color };
  };
  const bytes = colored3MF([cubeGroup(0, "#ff0000"), cubeGroup(14, "#00aa00"), cubeGroup(28, "#0000ff")], "rainbow");

  const objects = await parse3MFObjects(bytes);
  check("our colour 3MF parses to 3 parts", objects.length === 3, String(objects.length));
  const colours = await parse3MFPartColours(bytes);
  check("colours ROUND-TRIP through our own writer",
    colours.join() === "#FF0000,#00AA00,#0000FF", colours.join());
  const groups = await parse3MFColourGroups(bytes);
  check("colour groups pair positions with colours",
    groups.length === 3 && groups.every((g) => g.color && g.positions.length === 12 * 9));

  // Files exported BEFORE the fix have no project_settings — the m:colorgroup
  // fallback must recover their colours too.
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  zip.remove("Metadata/project_settings.config");
  const legacy = await zip.generateAsync({ type: "uint8array" });
  const legacyColours = await parse3MFPartColours(legacy);
  check("legacy exports (no palette file) recover via m:colorgroup",
    legacyColours.join() === "#FF0000,#00AA00,#0000FF", legacyColours.join());
  // and with BOTH colour records gone, it degrades to no colours, not a throw
  zip.remove("Metadata/model_settings.config");
  const grey = await zip.generateAsync({ type: "uint8array" });
  // strip pid/pindex from the model to simulate a plain colourless file
  const model = (await (await JSZip.loadAsync(grey)).file("3D/3dmodel.model").async("string"))
    .replace(/\spid="[^"]*"/g, "").replace(/\spindex="[^"]*"/g, "").replace(/<m:colorgroup[\s\S]*?<\/m:colorgroup>/g, "");
  const z2 = await JSZip.loadAsync(grey);
  z2.file("3D/3dmodel.model", model);
  const colourless = await parse3MFPartColours(await z2.generateAsync({ type: "uint8array" }));
  check("a colourless file yields nulls, never a throw", colourless.every((c) => !c));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
