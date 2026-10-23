// Will a SLICER read the STL we hand it?
//
// This file used to ask only whether three.js's STLLoader could read our STL,
// and three.js is forgiving: it regex-scans for facets and ignores whatever
// else is in the file. Bambu Studio is not. It (with PrusaSlicer, OrcaSlicer
// and SuperSlicer) reads STL through admesh, which sizes an ASCII file by
// COUNTING ITS LINES and then insists on that many facets. Our STL carried the
// model's source after `endsolid`, every line of it added to the count, and
// Bambu reported the download as having no geometry while this test passed.
//
// So the reader that matters is now in the loop: test/admesh-reader.js is a
// port of admesh's, run over everything the app writes as STL.
import { readFileSync } from "node:fs";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { stlToBinary, extractSourceFromStl, SOURCE_MARKER } from "../viewer/exporters.js";
import { soupToBinaryStl } from "../src/fizzcore.js";
import { admeshRead } from "./admesh-reader.js";
import * as dsl from "../index.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const loader = new STLLoader();
const positions = (data) => loader.parse(
  (typeof data === "string" ? new TextEncoder().encode(data) : data).slice().buffer).getAttribute("position").array;
const facetCount = (ascii) => (ascii.match(/facet normal/g) || []).length;

// What the STL used to carry, kept here only to prove the reader still opens
// files exported before the change, and to pin down why it had to go.
const legacyStlWithSource = (stl, code) => {
  const b64 = btoa(unescape(encodeURIComponent(code.trim())));
  return `${stl.trimEnd()}\n${SOURCE_MARKER}\n`
    + "The BREPcode that generated this part, as base64 of UTF-8. Decode it and\n"
    + "paste it into BREPcode.com to get the editable, parametric model back.\n"
    + `${(b64.match(/.{1,76}/g) || []).join("\n")}\nEND-${SOURCE_MARKER}\n`;
};

const plate = toSTL(await build(dsl.difference(
  dsl.cube([40, 30, 10]),
  dsl.translate([20, 15, -1], dsl.cylinder({ r: 6, h: 12, $fn: 32 })))), "part");
const ball = toSTL(await build(dsl.sphere({ r: 9, $fn: 40 })), "ball");
const two = [plate, toSTL(await build(dsl.translate([60, 0, 0], dsl.cube([5, 5, 5]))), "b")].join("\n");
const MODELS = { "a plate with a hole": plate, "a sphere (no axis-aligned normals)": ball, "a two-part model": two };

console.log("\nthe reader itself: it fails what Bambu failed\n");
{
  const STARTER = 'difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cylinder({ r: 6, h: 14, $fn: 64 })),\n)';
  check("the kernel's plain ASCII loads", admeshRead(plate).ok, admeshRead(plate).error);
  const old = admeshRead(legacyStlWithSource(plate, STARTER));
  check("the old STL-with-source export FAILS (the bug, reproduced)", !old.ok && /syntactically/.test(old.error), JSON.stringify(old));
  check("...with more facets counted than the file holds", old.facets > facetCount(plate), `${old.facets} vs ${facetCount(plate)}`);
  const bin = new Uint8Array(84 + 50 * 3 + 7);              // a binary with a passenger
  bin[90] = 200;
  new DataView(bin.buffer).setUint32(80, 3, true);
  check("a binary with bytes after the triangles fails", !admeshRead(bin).ok);
}

console.log("\nthe STL download is a binary that loads\n");
for (const [label, ascii] of Object.entries(MODELS)) {
  const bin = stlToBinary(ascii, "part");
  const r = admeshRead(bin);
  check(`${label}: admesh loads it`, r.ok, r.error);
  check(`${label}: ...as binary, every facet`, r.type === "binary" && r.facets === facetCount(ascii), `${r.type} ${r.facets}/${facetCount(ascii)}`);
  check(`${label}: exactly 84 + 50 n bytes`, bin.length === 84 + 50 * facetCount(ascii));
  const a = positions(ascii), b = positions(bin);
  let worst = a.length === b.length ? 0 : Infinity;
  for (let i = 0; i < a.length && worst < Infinity; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  check(`${label}: three.js reads the same triangles in the same places`, worst < 1e-4, `worst ${worst}`);
}
{
  const bin = stlToBinary(plate, "solid name");
  check("the header never starts with \"solid\" (readers take that as ASCII)",
    !new TextDecoder().decode(bin.slice(0, 5)).startsWith("solid"));
  check("an empty model still makes a well-formed file", stlToBinary("", "x").length === 84);
  const missing = plate.replace(/facet normal \S+ \S+ \S+/, "facet normal 0 0 0");
  const n = new DataView(stlToBinary(missing, "x").buffer);
  check("a zero normal is rebuilt from the winding",
    Math.abs(Math.hypot(n.getFloat32(84, true), n.getFloat32(88, true), n.getFloat32(92, true)) - 1) < 1e-5);
}

console.log("\nevery other STL the app writes\n");
{
  // FizzCore's own writer
  const p = positions(plate);
  const fz = soupToBinaryStl([Array.from(p)], "fz");
  check("FizzCore's STL loads in admesh", admeshRead(fz).ok, admeshRead(fz).error);
  // the agent bridge's save_stl writes the kernel's ASCII as it is
  check("a multi-part ASCII (save_stl) loads in admesh", admeshRead(two).ok, admeshRead(two).error);
  check("...with both parts' facets", admeshRead(two).facets === facetCount(two));
}

console.log("\nold files still reopen as code\n");
{
  const CODE = 'const w = 40;\n// a plate, "réglage"\nreturn cube([w, 30, 10]);';
  check("source in an STL from before the change still comes back",
    extractSourceFromStl(legacyStlWithSource(plate, CODE)) === CODE.trim());
  check("a binary STL simply has none", extractSourceFromStl(new TextDecoder().decode(stlToBinary(plate))) === "");
}

console.log("\nthe app wires it up\n");
{
  const html = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const exporters = readFileSync(new URL("../viewer/exporters.js", import.meta.url), "utf8");
  check("the STL download goes through stlToBinary", /exp\.stlToBinary\(await exportSTL\(\), base\)/.test(html));
  check("nothing appends to an STL any more", !/stlWithSource/.test(html + exporters));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
