// Where is there still room for the model?
//
// The windows float over the 3D canvas, so the camera has to aim the part at
// whatever space is left rather than at the middle of a canvas that is half
// covered. This is the search that answers "what space".
//
// It replaced a simpler one that shrank the viewport away from one window at a
// time, and the two cases it got wrong are the first two tests here — both
// were found by driving the real app, and both LOOKED fine from the code:
//
//   a window parked in the middle of the screen has no cheap side to shrink
//   away from, so nothing happened at all and the part stayed hidden;
//
//   two windows open on a phone produced a band that the second window was
//   still sitting on — an answer that claims "clear" about occupied space,
//   which is worse than no answer.

import { largestFreeRect, chooseFreeRect, rectsOverlap, MIN_FREE_W, MIN_FREE_H } from "../viewer/stagefit.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
// a window, in the shape getBoundingClientRect hands back
const win = (left, top, width, height) =>
  ({ left, top, right: left + width, bottom: top + height, width, height });
const area = (r) => (r.r - r.l) * (r.b - r.t);
const clearOf = (r, wins) => !wins.some((w) => rectsOverlap(r, w));

console.log("\nthe answer never contains a window\n");
{
  // The one property that must hold for every layout, because the whole point
  // is to hand the camera somewhere safe to aim.
  const layouts = {
    "one down the right edge": [win(700, 0, 560, 820)],
    "a bar along the bottom": [win(0, 700, 1280, 120)],
    "parked in the middle": [win(320, 160, 560, 500)],
    "two stacked on a phone": [win(0, 20, 375, 380), win(0, 410, 375, 340)],
    "four corners": [win(0, 0, 300, 260), win(980, 0, 300, 260), win(0, 560, 300, 260), win(980, 560, 300, 260)],
    "an L down two edges": [win(0, 0, 260, 820), win(0, 640, 1280, 180)],
    "overlapping pair": [win(500, 200, 400, 400), win(650, 320, 400, 400)],
  };
  for (const [name, wins] of Object.entries(layouts)) {
    const W = name.includes("phone") ? 375 : 1280, H = name.includes("phone") ? 812 : 820;
    const r = largestFreeRect(wins, W, H);
    check(`${name}: the result is clear`, r && clearOf(r, wins),
      r ? `got ${r.l},${r.t}..${r.r},${r.b}` : "nothing found");
    if (r) {
      check(`${name}: ...and inside the viewport`,
        r.l >= 0 && r.t >= 0 && r.r <= W && r.b <= H, `${r.l},${r.t}..${r.r},${r.b}`);
    }
  }
}

console.log("\nand it is the LARGEST such rectangle\n");
{
  // A window down the right edge leaves the whole left of the screen. Anything
  // less means the part is being squeezed for no reason.
  const wins = [win(700, 0, 580, 820)];
  const r = largestFreeRect(wins, 1280, 820);
  check("a right-hand column leaves the left of the screen",
    r.l === 0 && r.t === 0 && r.b === 820 && Math.abs(r.r - 700) <= 16, `${r.l},${r.t}..${r.r},${r.b}`);

  // The middle window: 320..880 wide on a 1280 screen. Left band is 320 wide,
  // right band is 400 — so the answer must be the RIGHT one. This is the case
  // the old code could not see at all.
  const mid = [win(320, 160, 560, 500)];
  const m = largestFreeRect(mid, 1280, 820);
  check("a middle window sends it to the wider side, not the nearer one",
    m.l >= 880 - 16 && m.r === 1280, `${m.l},${m.t}..${m.r},${m.b}`);
  check("...which is bigger than the band the other side", area(m) > 320 * 820 * 0.9,
    `${Math.round(area(m))} vs ${320 * 820}`);

  // A full-width bar across the middle: the answer is a full-width band, and
  // the taller of the two.
  const bar = [win(0, 300, 1280, 200)];
  const b = largestFreeRect(bar, 1280, 820);
  check("a full-width bar leaves a full-width band", b.l === 0 && b.r === 1280);
  check("...and picks the taller side", b.t >= 500 - 16 && b.b === 820, `${b.t}..${b.b}`);
}

console.log("\nnothing open means the whole stage\n");
{
  const r = chooseFreeRect([], 1280, 820);
  check("the answer is the viewport", r.l === 0 && r.t === 0 && r.r === 1280 && r.b === 820);
  // Slivers are not windows: a zero-height card that is open but not laid out
  // yet must not carve up the screen.
  const s = chooseFreeRect([win(0, 0, 1280, 0), win(3, 3, 2, 2)], 1280, 820);
  check("...and a not-yet-laid-out window is not a blocker",
    s.r - s.l === 1280 && s.b - s.t === 820, `${s.l},${s.t}..${s.r},${s.b}`);
}

console.log("\nno room is answered honestly, not with a sliver\n");
{
  // A phone with two big windows open genuinely has nowhere to put a model.
  // Saying so lets the caller leave the view alone; inventing a 40px box would
  // shrink the part to a speck for no gain.
  const packed = [win(0, 0, 375, 400), win(0, 405, 375, 400)];
  check("a full phone screen reports no room", chooseFreeRect(packed, 375, 812) === null);
  const tiny = [win(0, 0, 1280, 700), win(0, 700, 1100, 120)];
  const t = chooseFreeRect(tiny, 1280, 820);
  check("...and so does a leftover strip below the minimum",
    t === null || (t.r - t.l >= MIN_FREE_W && t.b - t.t >= MIN_FREE_H),
    t ? `${t.r - t.l}x${t.b - t.t}` : "null");
}

console.log("\nit stays put rather than flickering between equals\n");
{
  // Two bands of nearly equal size on either side of a window: without
  // hysteresis a nudge of a few pixels flips the answer from one to the other
  // and the model hops across the screen.
  // A 200px window at x=400 leaves 400 to its left and 680 to its right, so
  // the space in use is the right band.
  const before = [win(400, 0, 200, 820)];
  const first = chooseFreeRect(before, 1280, 820, null);
  check("it starts on the wider band", Math.abs(first.l - 600) <= 16 && first.r === 1280,
    `${first.l}..${first.r}`);
  // Now the window shifts 40px left. The right band is genuinely bigger than
  // it was, so the "best" rectangle has changed — but the one already in use
  // is still clear and still 94% as large, and shuffling the model sideways to
  // collect 40px of margin is motion for its own sake.
  const nudged = [win(360, 0, 200, 820)];
  const second = chooseFreeRect(nudged, 1280, 820, first);
  check("a small change keeps the space already in use",
    second === first, `${first.l}..${first.r} then ${second.l}..${second.r}`);
  check("...and that space is still genuinely clear", clearOf(second, nudged));

  // ...but a window that actually moves ONTO the space in use gives it up.
  const onto = [win(700, 0, 560, 820)];
  const moved = chooseFreeRect(onto, 1280, 820, first);
  check("a window landing on that space makes it move", moved !== first && clearOf(moved, onto),
    `${moved.l},${moved.t}..${moved.r},${moved.b}`);

  // ...and so does the space becoming much worse than the alternative.
  const shrunk = [win(300, 0, 200, 820)];      // left band now 300, right 780
  const left = { l: 0, t: 0, r: 300, b: 820 };
  const better = chooseFreeRect(shrunk, 1280, 820, left);
  check("a much better space wins over staying put", better !== left && better.l >= 500 - 16,
    `${better.l}..${better.r}`);

  // A remembered rectangle from a bigger window must not survive a resize.
  const stale = { l: 0, t: 0, r: 1200, b: 800 };
  const after = chooseFreeRect([win(0, 0, 200, 500)], 700, 500, stale);
  check("a remembered space from a larger window is dropped",
    after !== stale && after.r <= 700 && after.b <= 500, `${after.l},${after.t}..${after.r},${after.b}`);
}

console.log("\nthe grid is fine enough to be worth trusting\n");
{
  // The search runs on a 16px grid, so an answer can be up to one cell tight
  // against a window — never overlapping it, because blocked cells are rounded
  // OUTWARDS. Worth asserting: rounding the wrong way would put the model a
  // few pixels under a window edge in every layout.
  const w = [win(101, 101, 300, 300)];
  const r = largestFreeRect(w, 1280, 820);
  check("blocked cells round outwards, so the answer never bleeds under a window",
    clearOf(r, w), `${r.l},${r.t}..${r.r},${r.b}`);
  const many = Array.from({ length: 14 }, (_, i) => win(i * 80, (i % 3) * 200, 70, 180));
  const t0 = Date.now();
  for (let i = 0; i < 50; i++) largestFreeRect(many, 1280, 820);
  const ms = (Date.now() - t0) / 50;
  check("50 searches over 14 windows average under 5ms", ms < 5, `${ms.toFixed(2)}ms each`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
