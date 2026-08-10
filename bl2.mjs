import { build, toSTL } from "./index.js";
import { gridfinityBase } from "./src/shelf.js";
import * as dsl from "./src/dsl.js";
const vol = async (s) => { const stl = toSTL(await build(s), "b");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  let out = 0;
  for (let i = 0; i < v.length; i += 3) { const [a,b,c] = v.slice(i, i+3);
    out += (a[0]*(b[1]*c[2]-c[1]*b[2]) - a[1]*(b[0]*c[2]-c[0]*b[2]) + a[2]*(b[0]*c[1]-c[0]*b[1]))/6; }
  return Math.abs(out); };
// A 20mm-square probe pillar through the middle of each cell of a 1x1 frame:
// if the socket is truly open, the pillar passes through untouched.
const probe = dsl.translate([-10, -10, -2], dsl.cube([20, 20, 10]));
const inFrame = await vol(dsl.intersection(gridfinityBase({ x: 1, y: 1, bottomless: true }), probe));
const inSolid = await vol(dsl.intersection(gridfinityBase({ x: 1, y: 1 }), probe));
console.log(`material inside the probe: bottomless ${inFrame.toFixed(1)} mm³, solid ${inSolid.toFixed(0)} mm³`);
console.log(inFrame < 1 ? "OPEN right through — the drawer becomes the floor" : "still has a floor!");
