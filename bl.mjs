import { build, toSTL } from "./index.js";
import { gridfinityBase, gridfinityBin, GRID } from "./src/shelf.js";
import * as dsl from "./src/dsl.js";
const measure = async (s) => { const stl = toSTL(await build(s), "b");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) { const [a,b,c] = v.slice(i, i+3);
    vol += (a[0]*(b[1]*c[2]-c[1]*b[2]) - a[1]*(b[0]*c[2]-c[0]*b[2]) + a[2]*(b[0]*c[1]-c[0]*b[1]))/6; }
  const zs = v.map(p=>p[2]);
  return { vol: Math.abs(vol), z0: Math.min(...zs), z1: Math.max(...zs),
    // any triangle lying flat at z=0 means there is still a floor
    floorTris: (() => { let n=0; for (let i=0;i<v.length;i+=3)
      if (v.slice(i,i+3).every(p=>Math.abs(p[2])<1e-6)) n++; return n; })() };
};
const solid = await measure(gridfinityBase({ x: 2, y: 2 }));
const frame = await measure(gridfinityBase({ x: 2, y: 2, bottomless: true }));
console.log(`solid  vol ${solid.vol.toFixed(0)}  z ${solid.z0}..${solid.z1}  floor tris ${solid.floorTris}`);
console.log(`frame  vol ${frame.vol.toFixed(0)}  z ${frame.z0}..${frame.z1}  floor tris ${frame.floorTris}`);
console.log(`plastic saved: ${(100*(1-frame.vol/solid.vol)).toFixed(0)}%`);
// and a bin still seats: intersection must be empty at the same seat height
const clash = await measure(dsl.intersection(
  dsl.translate([0, 0, GRID.socket - GRID.socket], // frame h defaults to socket => seat at 0
    dsl.translate([0, 0, GRID.socket - GRID.socket], gridfinityBin({ x: 1, y: 1, u: 2, solid: true }))),
  gridfinityBase({ x: 1, y: 1, bottomless: true })));
console.log(`bin-in-frame overlap: ${clash.vol.toFixed(1)} mm³ ${clash.vol < 1 ? "OK" : "FOULS"}`);
