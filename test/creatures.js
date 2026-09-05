// The baseline silhouettes, held to the rules they exist to enforce.
//
// Every plan here is a promise to a generator: start from this and the
// silhouette already reads as the animal, with the #organic proportions baked
// in. So the tests ARE those rules — a plan that drifts from them while
// remaining a perfectly nice list of numbers is exactly the regression nobody
// would notice by eye until the cats come out haunted again.

import { creatureBalls, creatureAnchors, CREATURE_NAMES, creature } from "../src/dsl.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

console.log("\nevery body plan keeps the organic rules\n");
for (const name of CREATURE_NAMES) {
  const balls = creatureBalls(name);            // canonical: h = 100
  const top = Math.max(...balls.map(([, , z, r]) => z + r));
  const bottom = Math.min(...balls.map(([, , z, r]) => z - r));
  const minR = Math.min(...balls.map(([, , , r]) => r));
  const maxR = Math.max(...balls.map(([, , , r]) => r));

  check(`${name}: stands its full height`, top > 88 && top < 112, `top ${top.toFixed(0)}`);
  check(`${name}: grounded, not floating or buried`, bottom > -6 && bottom < 12,
    `bottom ${bottom.toFixed(0)}`);
  check(`${name}: nothing under the 2.5% feature floor`, minR >= 2.5,
    `smallest ball r ${minR} — below the meshing grid at typical sizes`);
  check(`${name}: has a dominant mass`, maxR >= 14, `biggest ${maxR}`);

  // symmetric in Y: every off-axis ball has a mirror
  const key = ([x, y, z, r]) => `${x}|${z}|${r}`;
  const off = balls.filter(([, y]) => y !== 0);
  const unmatched = off.filter((b) => !off.some((o) => o !== b && o[1] === -b[1] && key(o) === key(b)));
  check(`${name}: symmetric about Y`, unmatched.length === 0,
    `${unmatched.length} balls without a mirror`);

  const a = creatureAnchors(name);
  for (const need of ["headCentre", "eyeL", "eyeR", "noseTip", "earL", "earR", "tailTip", "back"]) {
    if (!a[need]) { check(`${name}: anchor ${need} exists`, false); }
  }
  check(`${name}: eyes are a mirrored pair`,
    a.eyeL[1] === -a.eyeR[1] && a.eyeL[0] === a.eyeR[0] && a.eyeL[2] === a.eyeR[2]);
  check(`${name}: the face is FORWARD (+X)`, a.noseTip[0] > a.headCentre[0],
    "the +X convention is what lets accessories aim without guessing");
  check(`${name}: eyes sit low on the head, not on top`,
    a.eyeL[2] <= a.headCentre[2] + 8,
    "high eyes are precisely what unsettles — see #organic");
}

console.log("\nscaling and the cute head\n");
{
  const h80 = creatureBalls("quadruped-sitting", { h: 80 });
  const h100 = creatureBalls("quadruped-sitting");
  check("h scales every number uniformly",
    h80.every((b, i) => b.every((v, j) => Math.abs(v - h100[i][j] * 0.8) < 1e-9)));
  check("chubby widens Y only",
    creatureBalls("bird", { chubby: 1.5 }).every((b, i) =>
      b[0] === creatureBalls("bird")[i][0] && b[2] === creatureBalls("bird")[i][2]
      && Math.abs(b[1] - creatureBalls("bird")[i][1] * 1.5) < 1e-9));
  // the cute rule the plans exist to carry: a head about a third of the height
  for (const name of CREATURE_NAMES) {
    const a = creatureAnchors(name);
    const balls = creatureBalls(name);
    const head = balls.reduce((best, b) =>
      (Math.hypot(b[0] - a.headCentre[0], b[1] - a.headCentre[1], b[2] - a.headCentre[2]) <
       Math.hypot(best[0] - a.headCentre[0], best[1] - a.headCentre[1], best[2] - a.headCentre[2]) ? b : best));
    check(`${name}: head is a THIRD-ish of the height`, head[3] * 2 >= 26,
      `head diameter ${head[3] * 2} of 100`);
  }
  check("an unknown plan names the real ones",
    (() => { try { creature("dragon"); return false; }
      catch (e) { return /quadruped-sitting/.test(e.message); } })());
}

// THE FACE COMES INCLUDED. The first bird built from the bare plan had no
// beak and no eyes — a Halloween decoration, not a toy. creature() now ships
// decorated; { plain: true } is the bare flesh for reshaping.
console.log("\ncreatures arrive with their faces on\n");
{
  const { creatureDecor } = await import("../src/dsl.js");
  check("creature() is a group: flesh plus its face",
    creature("bird", { h: 60 }).kind === "group"
    && creature("bird", { h: 60 }).children.length === 4,
    "body + two eyes + beak");
  check("plain: true is the bare blob for reshaping",
    creature("bird", { h: 60, plain: true }).kind === "sdfblend");
  for (const name of CREATURE_NAMES) {
    const d = creatureDecor(name);
    check(`${name}: two eyes`, d.filter((x) => x.kind === "eye").length === 2);
  }
  const beak = creatureDecor("bird").find((d) => d.kind === "beak");
  check("the bird has a beak", !!beak && beak.len > 0, "the whole complaint");
  check("...in beak orange, not eye black", beak.color[0] > 200);
  const d60 = creatureDecor("bird", { h: 60 });
  const d100 = creatureDecor("bird");
  check("the face scales with the body",
    Math.abs(d60[0].r - d100[0].r * 0.6) < 1e-9
    && d60[0].at.every((v, i) => Math.abs(v - d100[0].at[i] * 0.6) < 1e-9));
  check("the flesh inside the group is uncoloured",
    creature("fish").children[0].color == null,
    "so colorize(tint, creature(...)) tints the body while the face keeps its own colours");

  // THE EYES MUST BREAK THE SURFACE. The first bird had its eye anchors
  // 4.7mm inside the head ball — the eyes rendered, entirely inside the
  // flesh, and the chick came out faceless. "Sunk halfway" is a geometric
  // claim, so hold every plan to it: the anchor's signed distance to the
  // nearest ball surface (negative = inside) must leave part of the eye out.
  const surfOffset = (name, p) => Math.min(...creatureBalls(name).map(([x, y, z, r]) =>
    Math.hypot(p[0] - x, p[1] - y, p[2] - z) - r));
  for (const name of CREATURE_NAMES) {
    for (const d of creatureDecor(name)) {
      if (d.kind === "beak") continue;               // rides on a cone, not a dome
      const off = surfOffset(name, d.at);
      check(`${name}: the ${d.kind} breaks the surface (${off.toFixed(1)} vs r ${d.r})`,
        off >= -0.8 * d.r && off <= 0.9 * d.r,
        "deeper than -0.8r is invisible; further than +0.9r floats");
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
