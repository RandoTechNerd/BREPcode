// path3d(): lines, true arcs through three points and splines, in space.
import { path3d, tube } from "../src/dsl.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

{
  const p = path3d([0, 0, 0]).lineTo([10, 0, 0]).line([0, 5, 2]).points();
  check("lineTo and a relative line", d(p[1], [10, 0, 0]) < 1e-9 && d(p[2], [10, 5, 2]) < 1e-9);
}
{
  // a quarter circle in a tilted plane: every point on the sphere radius
  const ctr = [5, 5, 5], R = 10;
  const a = [ctr[0] + R, ctr[1], ctr[2]];
  const m = [ctr[0] + R * Math.SQRT1_2, ctr[1] + R * 0.5, ctr[2] + R * 0.5];
  const e = [ctr[0], ctr[1] + R * Math.SQRT1_2, ctr[2] + R * Math.SQRT1_2];
  const p = path3d(a).arcThrough(m, e).points();
  const worst = Math.max(...p.map((q) => Math.abs(d(q, ctr) - R)));
  check("arcThrough stays on its circle, in any plane", worst < 1e-6, `off by ${worst}`);
  check("...ends exactly at the end point", d(p[p.length - 1], e) < 1e-9);
  check("...passes the middle point", Math.min(...p.map((q) => d(q, m))) < R * 0.1);
  const straight = path3d([0, 0, 0]).arcThrough([5, 0, 0], [10, 0, 0]).points();
  check("three points in a line are a line", straight.length === 2);
}
{
  const ctl = [[10, 0, 0], [20, 10, 5], [30, 0, 10]];
  const p = path3d([0, 0, 0]).splineTo(ctl).points();
  check("splineTo passes through every point", ctl.every((c) => p.some((q) => d(q, c) < 1e-9)));
  check("...with steps in between", p.length === 1 + 3 * 8);
}
{
  let threw = false; try { path3d([0, 0]).lineTo(["x", 1, 2]); } catch { threw = true; }
  check("a bad point says so", threw);
}
{
  const frame = path3d([0, 0, 0]).lineTo([60, 0, 0]).arcThrough([80, 20, 10], [60, 40, 20]).splineTo([[30, 60, 30], [0, 40, 10]]);
  const stl = toSTL(await build(tube(frame, { r: 3 })), "f");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  const zMax = Math.max(...v.map((q) => q[2]));
  check("tube() takes the builder and builds it", v.length > 100 && zMax > 30 && zMax < 34, `zMax ${zMax}`);
}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
