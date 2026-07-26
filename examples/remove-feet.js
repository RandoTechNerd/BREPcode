// Shear the feet off an imported holder and leave a glue pocket where each
// one was — the same edit as the in-app toolbox, but headless.
//
//   node src/cli.js examples/remove-feet.js -o holder.stl
//   node src/cli.js examples/remove-feet.js -D footTopZ=4 -o holder.stl
//
// An import sits ON z=0 with nothing below it, so the shear plane is a
// POSITIVE height and the pockets are bored UPWARD from it.

import { readFileSync } from "node:fs";
import {
  registerImport, importedMesh, difference, translate, cube, cylinder,
} from "../index.js";

const STL = process.env.HOLDER_STL || "viewer/g10.stl";

export default function model(D = {}) {
  const ascii = registerImport("holder.stl", readFileSync(STL));

  const footTopZ = D.footTopZ ?? 3.1;    // feet run z 0 -> here
  const footD = D.footD ?? 16.5;         // measured across one foot
  const clearance = D.clearance ?? 0.4;  // so a printed foot slots back in
  const insetDepth = D.insetDepth ?? 2;  // glue-pocket depth
  const inset = D.inset ?? 23;           // foot centres, in from the part centre
  const pocketR = footD / 2 + clearance;

  // The viewer's Import button recentres a mesh on the origin; the CLI hands
  // you the file's own coordinates, so work out the centre rather than
  // assuming it is [0, 0]. Guessing here is exactly how cutters end up in
  // empty space and the build "succeeds" having changed nothing.
  const centre = meshCentreXY(ascii);
  const feet = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
    .map(([sx, sy]) => [centre[0] + sx * inset, centre[1] + sy * inset]);

  return translate([0, 0, -footTopZ], difference(
    importedMesh("holder.stl", { split: true }),
    translate([-200, -200, -1], cube([400, 400, footTopZ + 1])),
    ...feet.map(([x, y]) => translate([x, y, footTopZ - 0.01],
      cylinder({ r: pocketR, h: insetDepth + 0.02, $fn: 64 }))),
  ));
}

function meshCentreXY(stl) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const m of stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+/g)) {
    const x = +m[1], y = +m[2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}
