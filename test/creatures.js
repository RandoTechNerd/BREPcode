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
  check("creature() is a blob at heart",
    creature("bird", { h: 60 }).kind === "sdfblend",
    "the whole point: the model adjusts balls, the mesher guarantees the rest");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
