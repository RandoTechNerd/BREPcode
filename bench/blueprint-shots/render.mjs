// Renders the app's blueprint (viewer/curved.js) for a few reference parts to
// PNG, for eyeballing the sheet layout:
//   node bench/blueprint-shots/render.mjs <suffix>
// writes bench/blueprint-shots/<part>-<suffix>.png
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { _setReplicad, curvedDrawingSVG } from "../../viewer/curved.js";
import { fromOpenSCAD } from "../../src/openscad.js";
import { svgToPNG, closeBrowser } from "../cadgen/lib/drawing.mjs";

const loaderSrc = readFileSync("node_modules/replicad-opencascadejs/src/replicad_single.js", "utf8")
  .replace(/export default Module;\s*$/, "module.exports = Module;");
const loaderPath = join(tmpdir(), "brepcode-replicad-shots.cjs");
writeFileSync(loaderPath, loaderSrc);
const initOC = createRequire(import.meta.url)(loaderPath);
const replicad = await import("replicad");
replicad.setOC(await initOC({ locateFile: () => "node_modules/replicad-opencascadejs/src/replicad_single.wasm" }));
_setReplicad(replicad);

// Octagonal flange like CADGenBench sample 121: 278.6 across flats, 65 thick,
// a centre bore, a raised hub and eight bolt holes.
const R8 = 278.6 / 2 / Math.cos(Math.PI / 8);
const OCT = Array.from({ length: 8 }, (_, i) => {
  const a = (i + 0.5) * Math.PI / 4;
  return `[${(R8 * Math.cos(a)).toFixed(3)},${(R8 * Math.sin(a)).toFixed(3)}]`;
}).join(",");
const PARTS = {
  flange: [fromOpenSCAD(`
    difference() {
      union() {
        linear_extrude(height=30) polygon([${OCT}]);
        cylinder(r=80, h=65, $fn=96);
      }
      translate([0,0,-1]) cylinder(r=50, h=70, $fn=96);
      for (i=[0:7]) rotate([0,0,i*45]) translate([110,0,-1]) cylinder(r=9, h=40, $fn=48);
    }`), [278.6, 278.6, 65]],
  jar: [fromOpenSCAD(`
    difference() {
      union() { cylinder(r=40, h=160, $fn=96); translate([0,0,150]) cylinder(r=28, h=35, $fn=96); }
      translate([0,0,6]) cylinder(r=35, h=148, $fn=96);
      translate([0,0,100]) cylinder(r=22, h=100, $fn=96);
    }`), [80, 80, 185]],
};
const suffix = process.argv[2] || "after";
for (const [name, [shape, size]] of Object.entries(PARTS)) {
  const svg = await curvedDrawingSVG(shape, { size, title: name });
  writeFileSync(join(tmpdir(), `bp-${name}-${suffix}.svg`), svg);
  await svgToPNG(svg, `bench/blueprint-shots/${name}-${suffix}.png`, { scale: 1 });
  console.log(name, suffix);
}
await closeBrowser();
