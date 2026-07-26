// Model-inventory parsers: STL (ascii + binary), OBJ, and 3MF via the
// minimal zip reader — including a round-trip through our own 3MF writer.

import { parseSTL, parseOBJ, parse3MF, parseModelFile } from "../viewer/inventory.js";
import { stlTo3MF } from "../viewer/exporters.js";
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
  check("3MF coordinates intact", Math.min(...xs) === 0 && Math.max(...xs) === 10);
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
