// Smooth blends. A blend is judged by eye in the end, but every claim under
// it is arithmetic — a radius is a radius, and a mesh that says it encloses a
// sphere should enclose the volume of one.

import {
  sdSphere, sdBox, sdCylinder, sdTorus, at, scaled,
  smin, smax, sUnion, sIntersect, sSubtract,
  surfaceNets, meshVolume,
} from "../src/sdf.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const box = (r) => [[-r, -r, -r], [r, r, r]];

console.log("\ndistance fields say the true distance\n");
{
  const s = sdSphere(10);
  check("zero on the surface", near(s([10, 0, 0]), 0, 1e-9));
  check("negative inside, by how far", near(s([0, 0, 0]), -10, 1e-9));
  check("positive outside, by how far", near(s([25, 0, 0]), 15, 1e-9));
  const b = sdBox(20, 20, 20);
  check("a box knows its faces", near(b([10, 0, 0]), 0, 1e-9) && near(b([14, 0, 0]), 4, 1e-9));
  check("...and its corners", near(b([13, 14, 10]), Math.hypot(3, 4, 0), 1e-9));
  const c = sdCylinder(5, 20);
  check("a cylinder knows its wall and its cap",
    near(c([5, 0, 0]), 0, 1e-9) && near(c([0, 0, 10]), 0, 1e-9));
  check("a torus knows its tube", near(sdTorus(20, 3)([23, 0, 0]), 0, 1e-9));
  check("translation moves the field, not the query",
    near(at([30, 0, 0], sdSphere(10))([40, 0, 0]), 0, 1e-9));
  check("scaling keeps distances honest",
    near(scaled(2, sdSphere(5))([10, 0, 0]), 0, 1e-9));
}

console.log("\nsmooth min is a min with the corner filed off\n");
{
  check("far apart, it IS min", near(smin(3, 20, 4), 3, 1e-9));
  check("far apart, smax IS max", near(smax(3, 20, 4), 20, 1e-9));
  check("k of zero is the hard operation", near(smin(5, 5, 0), 5, 1e-9));
  // where the two fields are equal the blend digs in by the most it ever will
  check("the deepest cut is a quarter of k", near(smin(5, 5, 4), 5 - 1, 1e-9), String(smin(5, 5, 4)));
  check("...and smax lifts by the same", near(smax(5, 5, 4), 5 + 1, 1e-9));
  check("it never returns MORE than min", [0, 1, 2, 3, 4, 8].every((d) => smin(5, 5 + d, 4) <= 5 + 1e-12));
  check("bigger k blends further", smin(5, 6, 8) < smin(5, 6, 2));
}

console.log("\nmeshing a shape whose volume is known\n");
{
  const m = surfaceNets(sdSphere(10), box(14), 56);
  check("a sphere meshes", m.points.length > 500 && m.faces.length > 800,
    `${m.points.length} pts, ${m.faces.length} tris`);
  const want = (4 / 3) * Math.PI * 1000;
  check("...to the volume of a sphere", near(meshVolume(m), want, want * 0.02),
    `${meshVolume(m).toFixed(0)} vs ${want.toFixed(0)}`);
  check("every point is on the surface it claims",
    m.points.every((p) => Math.abs(sdSphere(10)(p)) < 0.6),
    String(Math.max(...m.points.map((p) => Math.abs(sdSphere(10)(p))))));

  const cube = surfaceNets(sdBox(20, 20, 20), box(16), 48);
  check("a box meshes to its own volume",
    near(meshVolume(cube), 8000, 8000 * 0.03), String(meshVolume(cube).toFixed(0)));
  check("a field that is empty here meshes to nothing",
    surfaceNets(at([500, 0, 0], sdSphere(5)), box(20), 24).faces.length === 0);
}

console.log("\nthe blend itself\n");
{
  // two spheres side by side, just touching
  const a = at([-9, 0, 0], sdSphere(10)), b = at([9, 0, 0], sdSphere(10));
  const hard = surfaceNets(sUnion(0, a, b), box(24), 56);
  const soft = surfaceNets(sUnion(6, a, b), box(24), 56);
  check("a hard union meshes", hard.faces.length > 500);
  check("a blended union ADDS material at the join — that is the fillet",
    meshVolume(soft) > meshVolume(hard),
    `${meshVolume(hard).toFixed(0)} -> ${meshVolume(soft).toFixed(0)}`);
  check("...but only a little of it", meshVolume(soft) < meshVolume(hard) * 1.2,
    `${(meshVolume(soft) / meshVolume(hard)).toFixed(3)}x`);
  check("a bigger k adds more",
    meshVolume(surfaceNets(sUnion(10, a, b), box(24), 56)) > meshVolume(soft));

  // THE claim: the join is smooth. Walk the waist and look at how fast the
  // surface turns — a hard union has a crease there, a blend does not.
  const creaseAt = (k) => {
    const f = sUnion(k, a, b);
    const eps = 0.05;
    const nAt = (p) => {
      const g = [
        f([p[0] + eps, p[1], p[2]]) - f([p[0] - eps, p[1], p[2]]),
        f([p[0], p[1] + eps, p[2]]) - f([p[0], p[1] - eps, p[2]]),
        f([p[0], p[1], p[2] + eps]) - f([p[0], p[1], p[2] - eps]),
      ];
      const L = Math.hypot(...g) || 1;
      return g.map((v) => v / L);
    };
    // march along the surface across the waist and take the worst turn
    let worst = 0, prev = null;
    for (let t = -4; t <= 4; t += 0.25) {
      // the surface point above the waist at x = t
      let z = 12;
      for (let it = 0; it < 40; it++) z -= f([t, 0, z]);   // sphere-trace down
      const nv = nAt([t, 0, z]);
      if (prev) {
        const dot = Math.max(-1, Math.min(1, nv[0] * prev[0] + nv[1] * prev[1] + nv[2] * prev[2]));
        worst = Math.max(worst, Math.acos(dot) * 180 / Math.PI);
      }
      prev = nv;
    }
    return worst;
  };
  const sharp = creaseAt(0), rounded = creaseAt(6);
  check("the hard union creases at the waist", sharp > 12, `${sharp.toFixed(1)}°`);
  check("the blend does not — the surface turns gently instead",
    rounded < sharp / 2, `${sharp.toFixed(1)}° -> ${rounded.toFixed(1)}°`);
}

console.log("\nsubtracting, which is the mouth-in-a-whale case\n");
{
  const body = sdSphere(20);
  const mouth = at([0, -15, 0], sdSphere(8));
  const hard = surfaceNets(sSubtract(0, body, mouth), box(24), 56);
  const soft = surfaceNets(sSubtract(4, body, mouth), box(24), 56);
  check("a hard cut meshes", hard.faces.length > 500);
  check("a softened cut takes MORE away — the rim is eased back",
    meshVolume(soft) < meshVolume(hard),
    `${meshVolume(hard).toFixed(0)} -> ${meshVolume(soft).toFixed(0)}`);
  check("...and it is still most of the body",
    meshVolume(soft) > meshVolume(hard) * 0.9);
  const whole = meshVolume(surfaceNets(body, box(24), 56));
  check("the cut actually removed something", meshVolume(hard) < whole * 0.99,
    `${meshVolume(hard).toFixed(0)} of ${whole.toFixed(0)}`);
}

console.log("\nintersection\n");
{
  const a = at([-6, 0, 0], sdSphere(12)), b = at([6, 0, 0], sdSphere(12));
  const m = surfaceNets(sIntersect(0, a, b), box(16), 48);
  check("overlapping spheres intersect to a lens", m.faces.length > 300);
  check("...smaller than either of them",
    meshVolume(m) < (4 / 3) * Math.PI * 12 ** 3);
  // A lens has a sharp rim all the way round, and rounding it can only take
  // material off — the opposite direction to a blended UNION, which adds a
  // fillet into an inside corner. Same smooth operator, opposite sign, because
  // one is filling a valley and the other is knocking down a ridge.
  const soft = surfaceNets(sIntersect(4, a, b), box(16), 48);
  check("a blended intersection eases its rim back rather than leaving it sharp",
    meshVolume(soft) < meshVolume(m), `${meshVolume(m).toFixed(0)} -> ${meshVolume(soft).toFixed(0)}`);
  check("...without eating the lens", meshVolume(soft) > meshVolume(m) * 0.85,
    `${(meshVolume(soft) / meshVolume(m)).toFixed(3)}x`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
