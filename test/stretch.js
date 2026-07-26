// stretch() — cut a model at a plane and widen the middle with its own
// cross-section. The headline use case for editing imported parts.

import {
  cube, cylinder, difference, translate, scale, stretch, build, toSTL,
} from "../index.js";

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
function volumeOf(r) {
  const v = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}
function boundsOf(r) {
  const p = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const ax = (i) => [Math.min(...p.map((q) => q[i])), Math.max(...p.map((q) => q[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}

console.log("\nstretch\n");

// A 40mm cube centred on the origin: prismatic along every axis, so stretching
// is exact — the footprint grows by exactly `by`, the volume by by*cross-section.
{
  const base = translate([-20, -20, -20], cube([40, 40, 40]));
  const bV = volumeOf(await build(base));
  check("base cube volume ~64000", near(bV, 64000, 50), bV.toFixed(0));

  const wider = stretch({ axis: "x", by: 30, at: 0 }, translate([-20, -20, -20], cube([40, 40, 40])));
  const b = boundsOf(await build(wider));
  check("x-span grows by 30 (40 -> 70)", near(b.x[1] - b.x[0], 70, 0.3), JSON.stringify(b.x));
  check("y-span unchanged (40)", near(b.y[1] - b.y[0], 40, 0.3), JSON.stringify(b.y));
  check("z-span unchanged (40)", near(b.z[1] - b.z[0], 40, 0.3), JSON.stringify(b.z));
  const wV = volumeOf(await build(wider));
  // added a 30mm length of the 40x40 cross-section: +48000
  check("volume grows by cross-section*by (~112000)", near(wV, 112000, 200), wV.toFixed(0));
}

// Number shorthand defaults to the x axis.
{
  const w = stretch(20, translate([-20, -20, -20], cube([40, 40, 40])));
  const b = boundsOf(await build(w));
  check("stretch(20, ...) widens x by 20", near(b.x[1] - b.x[0], 60, 0.3), JSON.stringify(b.x));
}

// Works along y and z too.
{
  const wy = boundsOf(await build(stretch({ axis: "y", by: 15 }, translate([-20, -20, -20], cube([40, 40, 40])))));
  check("y stretch grows y by 15", near(wy.y[1] - wy.y[0], 55, 0.3), JSON.stringify(wy.y));
  const wz = boundsOf(await build(stretch({ axis: "z", by: 10 }, translate([-20, -20, -20], cube([40, 40, 40])))));
  check("z stretch grows z by 10", near(wz.z[1] - wz.z[0], 50, 0.3), JSON.stringify(wz.z));
}

// End detail is preserved: a cube with a pocket in each end, stretched through
// the plain middle, keeps both pockets (volume = plain stretch minus 2 pockets).
{
  const detailed = difference(
    translate([-30, -15, -15], cube([60, 30, 30])),
    translate([-30, -6, -6], cube([8, 12, 12])),    // pocket in the -x end
    translate([22, -6, -6], cube([8, 12, 12])),      // pocket in the +x end
  );
  const plainV = volumeOf(await build(detailed));
  const grown = stretch({ axis: "x", by: 40, at: 0 }, difference(
    translate([-30, -15, -15], cube([60, 30, 30])),
    translate([-30, -6, -6], cube([8, 12, 12])),
    translate([22, -6, -6], cube([8, 12, 12])),
  ));
  const gb = boundsOf(await build(grown));
  check("detailed part x-span 60 -> 100", near(gb.x[1] - gb.x[0], 100, 0.4), JSON.stringify(gb.x));
  const gV = volumeOf(await build(grown));
  // both 8x12x12 end pockets (1152 each) survive the stretch
  check("both end pockets survive (volume < solid block)",
    gV < 100 * 30 * 30 - 2000, `${gV.toFixed(0)} vs solid ${100 * 30 * 30}`);
  check("added length ~ middle cross-section*40 (+36000)",
    near(gV - plainV, 36000, 300), (gV - plainV).toFixed(0));
}

// Error paths.
{
  let threw = false;
  try { stretch({ axis: "w", by: 10 }, cube([10, 10, 10])); } catch { threw = true; }
  check("bad axis errors clearly", threw);
  threw = false;
  try { stretch({ axis: "x" }, cube([10, 10, 10])); } catch { threw = true; }
  check("missing distance errors clearly", threw);
  threw = false;
  try { stretch({ axis: "x", by: 10 }); } catch { threw = true; }
  check("no shape errors clearly", threw);
}

// A negative `by` is the inverse: take that much OUT of the middle. It's what
// makes "scale the part up, then shrink it back" work — the way to thicken a
// frame's rails or a box's walls without changing the part's outside size.
console.log("\nstretch: negative by removes from the middle\n");
{
  // at: 50 — the middle of a corner-at-origin 100mm bar. The removed slab is
  // centred on `at`, so aiming it at 0 would hang half of it off the end.
  const r = await build(stretch({ axis: "x", by: -30, at: 50 }, cube([100, 20, 10])));
  const b = boundsOf(r);
  check("100mm long minus 30 is 70 long", near(b.x[1] - b.x[0], 70, 0.05),
    `got ${(b.x[1] - b.x[0]).toFixed(2)}`);
  check("other axes untouched", near(b.y[1] - b.y[0], 20, 0.05) && near(b.z[1] - b.z[0], 10, 0.05));
  check("volume drops by the removed slab", near(volumeOf(r), 70 * 20 * 10, 60),
    `got ${volumeOf(r).toFixed(0)}`);
}
{
  // The real use: double the frame so its 5mm walls become 10mm, then take the
  // 60x40 you added back out of the middle. Outside size is unchanged; walls
  // are twice as thick.
  const frame = difference(cube([60, 40, 8], { center: true }), cube([50, 30, 20], { center: true }));
  const wide = await build(stretch({ axis: "y", by: -40 },
    stretch({ axis: "x", by: -60 }, scale([2, 2, 1], frame))));
  const b = boundsOf(wide);
  check("thickened frame keeps its 60x40 footprint",
    near(b.x[1] - b.x[0], 60, 0.05) && near(b.y[1] - b.y[0], 40, 0.05),
    `got ${(b.x[1] - b.x[0]).toFixed(1)} x ${(b.y[1] - b.y[0]).toFixed(1)}`);
  check("still hollow", volumeOf(wide) > 0 && volumeOf(wide) < 60 * 40 * 8 * 0.95);
  // walls doubled 5 -> 10, so the remaining window is 40 x 20 through 8mm
  check("walls doubled", near(volumeOf(wide), 60 * 40 * 8 - 40 * 20 * 8, 200),
    `got ${volumeOf(wide).toFixed(0)}`);
}
{
  // "Cut the middle out and close the gap" on a real picture frame — the case
  // that sent a user hand-writing two intersections against guessed bounding-box
  // numbers. Modelled on their actual part: a 120 x 65 x 5.4 frame, narrowed by
  // half. Both original ends must survive and only the width may change.
  const outer = cube([120, 65, 5.4], { center: true });
  const window = cube([100, 45, 20], { center: true });
  const pictureFrame = difference(outer, window);

  for (const [remove, wantW] of [[60, 60], [30, 90]]) {
    const r = await build(stretch({ axis: "x", by: -remove, at: 0 }, pictureFrame));
    const b = boundsOf(r);
    check(`frame 120 wide minus ${remove} is ${wantW} wide`,
      near(b.x[1] - b.x[0], wantW, 0.05), `got ${(b.x[1] - b.x[0]).toFixed(2)}`);
    check(`  ...height and depth untouched at -${remove}`,
      near(b.y[1] - b.y[0], 65, 0.05) && near(b.z[1] - b.z[0], 5.4, 0.05),
      `got ${(b.y[1] - b.y[0]).toFixed(2)} x ${(b.z[1] - b.z[0]).toFixed(2)}`);
    check(`  ...still a frame, not a solid slab at -${remove}`,
      volumeOf(r) < wantW * 65 * 5.4 * 0.95, `got ${volumeOf(r).toFixed(0)}`);
    // The near half stays put and the far half slides in to meet it, exactly as
    // the positive case grows away from `at`. So the result is anchored on its
    // low edge, NOT recentred — a part that came in centred lands off-centre by
    // half of what was removed. Worth pinning down: it surprises people, and the
    // fix is a translate the caller has to know to add.
    check(`  ...anchored on the low edge at -${remove}`,
      near(b.x[0], -60, 0.05) && near(b.x[1], -60 + wantW, 0.05),
      `x ${b.x[0].toFixed(2)}..${b.x[1].toFixed(2)}`);
    const back = boundsOf(await build(
      translate([remove / 2, 0, 0], stretch({ axis: "x", by: -remove, at: 0 }, pictureFrame))));
    check(`  ...and translate([${remove}/2,0,0]) recentres it`,
      near(back.x[0], -wantW / 2, 0.05) && near(back.x[1], wantW / 2, 0.05),
      `x ${back.x[0].toFixed(2)}..${back.x[1].toFixed(2)}`);
  }
}
{
  let threw = false;
  try { await build(stretch({ axis: "x", by: 0 }, cube([10, 10, 10]))); } catch { threw = true; }
  check("by: 0 still errors", threw);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
