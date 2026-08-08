// The parts shelf.
//
// A shelf of parts is only worth having if every part on it actually builds.
// A library where three of twenty throw is worse than no library: the model
// reaches for one, gets an error it cannot diagnose, and falls back to writing
// the part by hand — having spent a round trip to learn nothing.
//
// So the spine of this file is: build EVERY entry in the index, from its own
// sample code, and check the result is a real solid. Everything after that is
// the specific traps each part exists to avoid.

import { SHELF, shelfIndex, shelfGroups } from "../src/shelf.js";
import * as shelf from "../src/shelf.js";
import * as dsl from "../src/dsl.js";
import { build, toSTL } from "../index.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

async function measure(shape) {
  const stl = toSTL(await build(shape), "s");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  if (!v.length) return { facets: 0, x: 0, y: 0, z: 0, empty: true };
  const ax = (i) => ({ min: Math.min(...v.map((p) => p[i])), max: Math.max(...v.map((p) => p[i])) });
  const [x, y, z] = [ax(0), ax(1), ax(2)];
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2])
      + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return {
    x: x.max - x.min, y: y.max - y.min, z: z.max - z.min,
    zMin: z.min, zMax: z.max, xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max,
    facets: (stl.match(/facet normal/g) || []).length, vol: Math.abs(vol),
  };
}
const near = (a, b, tol = 0.1) => Math.abs(a - b) <= tol;

// Run a sample exactly as the picker would insert it and the model would write
// it — through the real vocabulary, not by calling the function directly.
const vocab = { ...dsl, ...shelf };
const runSample = (src) => Function(...Object.keys(vocab), `return (${src});`)(...Object.values(vocab));

console.log("\nthe index is a real index\n");
{
  check("there is a shelf worth browsing", SHELF.length >= 15, `${SHELF.length} parts`);
  check("every entry has an id, label, blurb, group and sample",
    SHELF.every((p) => p.id && p.label && p.blurb && p.group && p.sample));
  check("ids are unique", new Set(SHELF.map((p) => p.id)).size === SHELF.length);
  check("every id is a real exported function",
    SHELF.every((p) => typeof shelf[p.id] === "function"),
    SHELF.filter((p) => typeof shelf[p.id] !== "function").map((p) => p.id).join(", "));
  // ...and the reverse: a part written and never shelved is a part nobody can
  // find, which is the same as not having written it.
  const exported = Object.keys(shelf).filter((k) => typeof shelf[k] === "function"
    && !["shelfIndex", "shelfGroups"].includes(k));
  const unshelved = exported.filter((k) => !SHELF.some((p) => p.id === k));
  check("every part written is on the shelf", unshelved.length === 0, unshelved.join(", "));
  check("the groups are few enough to scan", shelfGroups().length <= 6, shelfGroups().join(", "));
  check("shelfIndex() hands out copies, not the live list",
    shelfIndex()[0] !== SHELF[0] && shelfIndex()[0].id === SHELF[0].id);
  // The naming rule, in the direction that is actually safe to promise.
  //
  // "Named like a negative ⇒ IS a negative" holds and is worth enforcing: a
  // reader who sees keyholeSlot and subtracts it is never wrong. The converse
  // does not hold and should not be forced — vent() and honeycomb() read as
  // the feature, and both can be positive with { solid: true }. Renaming them
  // to ventCut() would make the common call the ugly one.
  //
  // So the cut FLAG is the truth, and any cut that is not named like one has
  // to say so in its blurb, where a person browsing will actually see it.
  for (const p of SHELF) {
    if (/(Slot|Pocket|Hole|Cut|Catch)$/.test(p.id)) {
      check(`${p.id}: named like a negative, so it is one`, !!p.cut,
        "the name promises a cut and the flag says otherwise");
    } else if (p.cut) {
      check(`${p.id}: a cut not named like one says so in its blurb`,
        /\bcut\b|\bthin\b|\brebate\b|\bholes\b|\brecess\b/i.test(p.blurb),
        `blurb is "${p.blurb}" — a browser would not know to subtract it`);
    }
  }
}

console.log("\nEVERY part on the shelf builds, from its own sample\n");
{
  for (const p of SHELF) {
    let m = null, err = "";
    try { m = await measure(runSample(p.sample)); } catch (e) { err = String(e.message || e); }
    check(`${p.id} builds`, !!m && m.facets > 0, err || "produced nothing");
    if (m && m.facets > 0) {
      check(`${p.id}: ...and has real volume`, m.vol > 0.5, `${m.vol?.toFixed(2)} mm³`);
      check(`${p.id}: ...at a sane size`, m.x < 500 && m.y < 500 && m.z < 500,
        `${m.x.toFixed(0)} x ${m.y.toFixed(0)} x ${m.z.toFixed(0)}`);
    }
  }
}

console.log("\nand every part called BARE works too — defaults are the promise\n");
{
  // The point of a shelf is that standoff() gives you a standoff. A part whose
  // defaults throw is a part you have to read the source of before using.
  for (const p of SHELF) {
    let ok = false, err = "";
    try { ok = !!(await measure(shelf[p.id]())).facets; } catch (e) { err = String(e.message || e); }
    check(`${p.id}() with no arguments`, ok, err);
  }
}

console.log("\nthe traps each part exists to avoid\n");
{
  // standoff: the hole must go THROUGH, or it is a post with a dimple.
  const so = await measure(shelf.standoff({ h: 8, id: 3.2, wall: 2 }));
  check("standoff is id + 2 walls across", near(so.x, 3.2 + 4), `${so.x.toFixed(2)}`);
  const solid = await measure(shelf.standoff({ h: 8, id: 3.2, wall: 2, solid: true }));
  // a 3.2 bore through a 7.2 post removes (3.2/7.2)^2 = 20% of it
  check("...and its bore is really open", so.vol < solid.vol * 0.85,
    `${so.vol.toFixed(0)} vs solid ${solid.vol.toFixed(0)} mm³`);
  let t = "";
  try { shelf.standoff({ id: 6, od: 5 }); } catch (e) { t = e.message; }
  check("a bore wider than the post is refused", /bigger than/.test(t), t);

  // screwBoss: the boss diameter must come from the insert table, not by eye.
  const { insertSpec } = await import("../src/parts.js");
  const bo = await measure(shelf.screwBoss("M3"));
  check("screwBoss uses the insert table's minimum boss",
    near(bo.x, insertSpec("M3").boss), `${bo.x.toFixed(2)} vs ${insertSpec("M3").boss}`);

  // keyhole: the head end must actually be wider than the shank end, and the
  // slot must run the distance asked for.
  const kh = await measure(shelf.keyholeSlot({ head: 8, shank: 4.2, drop: 12 }));
  check("keyhole is as wide as its head", near(kh.x, 8), `${kh.x.toFixed(2)}`);
  check("...and runs head + drop long", near(kh.y, 8 / 2 + 12 + 4.2 / 2, 0.3), `${kh.y.toFixed(2)}`);
  t = "";
  try { shelf.keyholeSlot({ head: 4, shank: 6 }); } catch (e) { t = e.message; }
  check("a shank wider than the head is refused", /smaller than/.test(t), t);

  // zip tie: TWO slots, not one.
  const zt = await measure(shelf.zipTieSlot({ w: 5, gap: 12 }));
  check("zipTieSlot spans the gap it was given", near(zt.x, 12 + 2.4, 0.3), `${zt.x.toFixed(2)}`);

  // snap hook + catch: the catch must be WIDER than the hook or it never clicks.
  const hk = await measure(shelf.snapHook({ w: 6, t: 1.6, l: 10, lip: 1.2 }));
  const ct = await measure(shelf.snapCatch({ w: 6, lip: 1.2, t: 2 }));
  check("the hook is as wide as asked", near(hk.y, 6), `${hk.y.toFixed(2)}`);
  check("the catch window clears the hook", ct.y > hk.y, `${ct.y.toFixed(2)} vs ${hk.y.toFixed(2)}`);
  check("the hook's barb stands proud of its arm", hk.x > 1.6, `${hk.x.toFixed(2)}`);

  // dovetail: the socket must be bigger than the tongue, in both widths.
  const dt = await measure(shelf.dovetail({ w: 12, neck: 7, d: 6, h: 8 }));
  const ds = await measure(shelf.dovetailSlot({ w: 12, neck: 7, d: 6, h: 8 }));
  check("the dovetail socket is wider than the tongue", ds.x > dt.x,
    `${ds.x.toFixed(2)} vs ${dt.x.toFixed(2)}`);
  check("the tongue is wide at the far end, narrow at the neck", near(dt.x, 12), `${dt.x.toFixed(2)}`);
  t = "";
  try { shelf.dovetail({ w: 7, neck: 12 }); } catch (e) { t = e.message; }
  check("a neck wider than the tail is refused", /narrower than/.test(t), t);

  // living hinge: what is LEFT is the number that matters.
  const lh = await measure(shelf.livingHinge({ l: 40, w: 3, t: 3, leave: 0.4 }));
  check("the living hinge cut starts above the material it leaves",
    near(lh.zMin, 0.4), `starts at ${lh.zMin.toFixed(2)}`);
  check("...and removes the rest of the panel", near(lh.z, 3 - 0.4, 0.05), `${lh.z.toFixed(2)}`);
  t = "";
  try { shelf.livingHinge({ t: 2, leave: 3 }); } catch (e) { t = e.message; }
  check("leaving more than the panel is thick is refused", /less than/.test(t), t);

  // shell: hollow, and the wall is the wall.
  const sh = await measure(shelf.shell({ size: [60, 40, 25], wall: 2, r: 3 }));
  const shSolid = await measure(shelf.shell({ size: [60, 40, 25], solid: true, r: 3 }));
  check("the shell is the size asked for", near(sh.x, 60) && near(sh.y, 40) && near(sh.z, 25),
    `${sh.x.toFixed(1)} x ${sh.y.toFixed(1)} x ${sh.z.toFixed(1)}`);
  check("...and is genuinely hollow", sh.vol < shSolid.vol * 0.5,
    `${sh.vol.toFixed(0)} vs solid ${shSolid.vol.toFixed(0)} mm³`);

  // vent: more than one slot, and it stays inside the width it was given.
  const vn = await measure(shelf.vent({ w: 40, h: 20, slot: 3, gap: 3, t: 4 }));
  check("the vent fits the width it was given", vn.x <= 40.01, `${vn.x.toFixed(2)}`);
  check("...and is a ROW, not one slot", vn.facets > 60, `${vn.facets} facets`);

  // honeycomb: many cells, and it respects the panel.
  const hc = await measure(shelf.honeycomb({ w: 60, h: 40, cell: 8, wall: 1.6, t: 4 }));
  check("the honeycomb is many cells", hc.facets > 200, `${hc.facets} facets`);
  const hcSolid = await measure(shelf.honeycomb({ w: 60, h: 40, cell: 8, wall: 1.6, t: 4, solid: true }));
  check("...and as ribs it stays inside the panel",
    hcSolid.x <= 60.01 && hcSolid.y <= 40.01, `${hcSolid.x.toFixed(1)} x ${hcSolid.y.toFixed(1)}`);
  check("...and the ribs weigh less than a full plate", hcSolid.vol < 60 * 40 * 4 * 0.6,
    `${hcSolid.vol.toFixed(0)} mm³`);

  // knob: the flutes are CUT, so the diameter is the diameter.
  const kn = await measure(shelf.knob({ d: 30, h: 12, flutes: 12 }));
  check("the knob is the diameter asked for, not bigger",
    kn.x <= 30.01 && kn.x > 26, `${kn.x.toFixed(2)}`);
  check("...and it is fluted, not plain", kn.facets > 100, `${kn.facets}`);
  const bored = await measure(shelf.knob({ d: 30, h: 12, bore: 6 }));
  check("...and a bore really goes through it", bored.vol < kn.vol, `${bored.vol.toFixed(0)}`);

  // pillow block: bored right THROUGH, so a shaft can pass.
  const bb = await measure(shelf.bearingBlock("608", { wall: 4 }));
  const bbVol = bb.vol;
  check("the pillow block stands on a foot", bb.zMin <= 0.01, `${bb.zMin.toFixed(2)}`);
  check("...and is wider at the base than the body", bb.x > 22 + 8, `${bb.x.toFixed(2)}`);
  check("...and has real material in it", bbVol > 1000, `${bbVol.toFixed(0)} mm³`);
}

console.log("\nbad input is refused by name, never silently absorbed\n");
{
  // A part that quietly accepts nonsense produces a shape that looks fine and
  // is wrong. Every one of these should say which argument and why.
  const bad = [
    ["standoff", { h: 0 }], ["standoff", { h: "big" }],
    ["shell", { size: [0, 40, 25] }],
    ["vent", { slot: -1 }],
    ["knob", { d: 0 }],
    ["cornerGusset", { l: 0 }],
    ["handle", { span: NaN }],
  ];
  for (const [id, opts] of bad) {
    let msg = "";
    try { shelf[id](opts); } catch (e) { msg = e.message; }
    check(`${id}(${JSON.stringify(opts)}) is refused`, /^shelf: /.test(msg), msg || "accepted it");
  }
}

console.log("\nthe shelf costs the prompt nothing until it is asked for\n");
{
  // The whole design rule. The harness may POINT at the shelf; it must not
  // carry it. If the catalogue ever gets pasted into the prompt, every request
  // starts paying for parts it will never use.
  const { DEFAULT_HARNESS } = await import("../viewer/chatbot.js");
  const named = SHELF.filter((p) => DEFAULT_HARNESS.includes(p.id));
  check("the harness does not list the whole shelf", named.length < SHELF.length / 2,
    `${named.length} of ${SHELF.length} parts named in the prompt`);
  check("...but it does say the shelf exists", /#shelf/.test(DEFAULT_HARNESS));

  // The recipe is where the detail lives, and it is fetched only on a match.
  const md = readFileSync(new URL("../viewer/recipes/shelf.md", import.meta.url), "utf8");
  for (const p of SHELF) {
    check(`#shelf documents ${p.id}`, md.includes(p.id), "on the shelf but not in the recipe");
  }
  // And nothing documented that does not exist. Two things are legitimately
  // not in this module's vocabulary: JavaScript's own methods, and the words
  // the VIEWER adds (text, stencil, the codes) which live in index.html rather
  // than the DSL — test/vocab.js is what holds those honest.
  const JS = ["map", "filter", "forEach", "slice", "join", "push", "Math", "Array"];
  const VIEWER = ["text", "stencil", "qrcode", "datamatrix", "barcode", "blend", "filament"];
  const shown = [...md.matchAll(/\b([a-z][A-Za-z0-9]*)\(/g)].map((m) => m[1]);
  const ghosts = [...new Set(shown)]
    .filter((n) => !(n in vocab) && !JS.includes(n) && !VIEWER.includes(n));
  check("the recipe teaches nothing that does not exist", ghosts.length === 0, ghosts.join(", "));
}

console.log("\nthe picker is wired to the index, not to a copy of it\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  for (const id of ["shelf", "shelf-row", "shelf-sub", "shelf-q", "shelf-list", "shelf-foot"]) {
    check(`#${id} exists`, HTML.includes(`id="${id}"`));
  }
  // The one thing that must never happen: the part list typed into the page.
  // A copy goes stale, and a stale shelf offers parts that no longer exist.
  check("the picker reads shelfIndex(), it does not hold its own list",
    /shelfIndex\(\)/.test(HTML));
  check("...loaded only when the shelf is opened",
    /await import\("\.\.\/src\/shelf\.js"\)/.test(HTML));
  const named = SHELF.filter((p) => new RegExp(`["'\`]${p.id}["'\`]`).test(HTML));
  check("no part id is hard-coded into the page", named.length === 0, named.map((p) => p.id).join(", "));

  check("clicking a part INSERTS at the caret rather than replacing the model",
    /code\.value = v\.slice\(0, at\) \+ snippet/.test(HTML));
  check("...and a cut goes in marked as one",
    /p\.cut \? `\$\{p\.sample\}   \/\/ subtract this`/.test(HTML));
  check("...and it is undoable", /pushHistory\(v\);[\s\S]{0,200}code\.value = v\.slice/.test(HTML));
  check("the search has an empty state rather than a blank panel", /shelf-none/.test(HTML));
  check("Enter takes the first result", /shelfList\.querySelector\("button"\)\?\.click\(\)/.test(HTML));
  check("the row does not go through the Toolbox delegate",
    !/<button id="shelf-row"[^>]*data-act/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
