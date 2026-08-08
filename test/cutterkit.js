// The cutter-kit generators.
//
// These emit OpenSCAD that a person prints. Two failures matter and neither
// throws: code that does not build, and code that builds but has quietly lost
// part of the outline — the gingerbread man with one arm. So the generators are
// checked as text AND one is built through the real kernel.

import {
  KINDS, makeKit, cutterScad, stampScad, stencilScad, rollerScad,
  loopLiteral, DEFAULTS, searchIcons, iconSvg, iconPreview, ICONIFY,
  loopsFromCode, scaleLoops, simplifyLoops, pieceNote,
} from "../viewer/cutterkit.js";
import { fromOpenSCAD } from "../src/openscad.js";
import { build, toSTL } from "../index.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const star = (n, R, r) => Array.from({ length: n * 2 }, (_, i) => {
  const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rad = i % 2 ? r : R;
  return [+(Math.cos(a) * rad).toFixed(2), +(Math.sin(a) * rad).toFixed(2)];
});
// an outline with a detached second piece and an interior hole — the shape most
// likely to lose something on the way through
const LOOPS = [
  { hole: false, points: star(5, 30, 14) },
  { hole: false, points: star(4, 8, 4).map(([x, y]) => [x + 44, y]) },
  { hole: true, points: star(5, 9, 4) },
];

console.log("\nevery loop of the outline reaches the output\n");
{
  for (const k of KINDS) {
    const src = makeKit(k.id, LOOPS, { size: 70, cols: 3, rows: 2, around: 3, along: 2 });
    // The detached piece sits at x+44. If a generator dropped it, no coordinate
    // near 44 survives anywhere in the emitted source.
    check(`${k.id}: keeps the detached second piece`, /\b(4[0-9]|5[0-2])(\.\d+)?\b/.test(src),
      "no coordinate from the second loop is in the output");
    check(`${k.id}: emits OpenSCAD, not prose`, /linear_extrude|polygon\(/.test(src));
    check(`${k.id}: says what it is`, /^\/\/ /.test(src));
  }
  // The cutter and stamp must ring EVERY solid loop, not just the first.
  const c = cutterScad(LOOPS);
  check("cutter: one blade per solid loop", (c.match(/blade\(o\d\)/g) || []).length === 2,
    (c.match(/blade\(o\d\)/g) || []).join(","));
  check("cutter: and a flange on each", (c.match(/flange\(o\d\)/g) || []).length === 2);
  check("holes become h-vars, not extra blades", /h0 = \[/.test(c));
}

console.log("\nthe numbers the recipe justifies are the numbers emitted\n");
{
  const c = cutterScad(LOOPS);
  check("wall is never below the nozzle floor", DEFAULTS.wall >= 0.8, `${DEFAULTS.wall}`);
  check("...and it is in the source", /WALL = 0\.9/.test(c));
  check("the rim BITES into the blade rather than resting on it", /BITE/.test(c) && DEFAULTS.bite > 0);
  check("blade height is a printable 15mm", /H = 15/.test(c));

  const s = stampScad(LOOPS);
  check("stamp: the bayonet clearance is stated", /CLR = 0\.35/.test(s));
  check("...with the warning that decides whether it turns", /under 0\.25 will not turn/i.test(s));
  check("stamp: three parts, spread out to print flat", (s.match(/translate\(\[\d/g) || []).length >= 2);
  check("stamp: the plate is undersized so it drops inside the blade",
    /offset\(delta = -0\.5\)/.test(s));
  check("stamp: the socket is bored, slotted AND chambered",
    /cylinder\(h = BOSS_H, r = POST\+CLR\)/.test(s)
      && /cube\(\[POST\+LUG\+CLR/.test(s)
      && /r = POST\+LUG\+CLR/.test(s));
  // It must BE a bayonet and say so — a printed thread at this size is fussy to
  // model, slow to build and prints badly on a vertical wall.
  check("knob: a quarter-turn bayonet", /bayonet/i.test(s));
  check("...and it says outright that it is not threaded", /no threads/i.test(s));
  check("...with lugs and a turn chamber, which is what makes it one",
    /LUG/.test(s) && /LUGH/.test(s));

  const st = stencilScad(LOOPS, { cols: 6, rows: 4 });
  check("stencil: warns what a big grid costs", /45 s|45s/.test(st));
  check("stencil: sheet stays in the 1.0-1.5 band",
    DEFAULTS.sheet >= 1.0 && DEFAULTS.sheet <= 1.5, `${DEFAULTS.sheet}`);

  const r = rollerScad(LOOPS);
  check("roller: states the circumference so the pattern can be matched",
    /Circumference is 2\*PI\*R/.test(r));
  check("roller: the motif sinks INTO the barrel", /R-0\.5/.test(r));
  check("roller: has an axle bore", /AXLE/.test(r));
}

console.log("\nbad input is refused by name\n");
{
  let t = "";
  try { loopLiteral([[0, 0], [1, 1]]); } catch (e) { t = e.message; }
  check("a 2-point loop is not an outline", /at least 3 points/.test(t), t);
  t = "";
  try { cutterScad([{ hole: true, points: star(4, 5, 2) }]); } catch (e) { t = e.message; }
  check("holes with no shape around them are refused", /no filled shape/.test(t), t);
  t = "";
  try { makeKit("sprocket", LOOPS); } catch (e) { t = e.message; }
  check("an unknown kit lists the real ones", /cutter, stamp, stencil, roller/.test(t), t);
  t = "";
  try { loopLiteral([[0, 0], [1, NaN], [2, 2]]); } catch (e) { t = e.message; }
  check("a NaN coordinate never reaches the source", /not a number/.test(t), t);
}

console.log("\nan outline already in the editor is read back out\n");
{
  // BREPcode and OpenSCAD spell a 2D outline identically, which is the whole
  // reason one reader can serve both. Both forms are checked so a change to
  // either dialect's emitter shows up here.
  const brep = `const P = polygon([[0,0],[40,0],[40,30],[0,30]]);
return linearExtrude({ h: 4 }, P);`;
  const scad = `linear_extrude(4) polygon(points = [[0,0],[40,0],[40,30],[0,30]]);`;
  for (const [name, src] of [["BREPcode", brep], ["OpenSCAD", scad]]) {
    const l = loopsFromCode(src);
    check(`${name}: the outline comes back`, l.length === 1, `${l.length} loops`);
    check(`${name}: ...with all four corners`, l[0]?.points.length === 4);
    check(`${name}: ...and it is not called a hole`, l[0]?.hole === false);
  }

  // A nested loop is a hole, decided by containment rather than by reading the
  // difference() around it — so it works however the source spelled the cut.
  const donut = `difference() {
  linear_extrude(4) polygon([[-20,-20],[20,-20],[20,20],[-20,20]]);
  linear_extrude(9) polygon([[-6,-6],[6,-6],[6,6],[-6,6]]);
}`;
  const d = loopsFromCode(donut);
  check("a loop inside another is a hole", d.length === 2 && d.filter((x) => x.hole).length === 1,
    JSON.stringify(d.map((x) => x.hole)));
  check("...and the outer one is not", d.find((x) => !x.hole)?.points.length === 4);
  // An island inside a hole is solid again — the middle of a letter O.
  const three = loopsFromCode(`polygon([[-30,-30],[30,-30],[30,30],[-30,30]]);
polygon([[-20,-20],[20,-20],[20,20],[-20,20]]);
polygon([[-5,-5],[5,-5],[5,5],[-5,5]]);`);
  check("an island inside a hole is solid again",
    three.map((x) => x.hole).join() === "false,true,false", three.map((x) => x.hole).join());

  // The scan must not stop at the first ")" — a truncated point list is a
  // shape with its tail missing, which builds happily and looks wrong.
  const nested = `polygon([[0,0],[40,0],[40,30],[0,30]], convexity = max(2, 3));`;
  check("a nested call in a later argument does not truncate the outline",
    loopsFromCode(nested)[0]?.points.length === 4, JSON.stringify(loopsFromCode(nested)));

  // And a point whose value is an EXPRESSION cannot be read from text at all.
  // Taking the numeric pairs and leaving the rest would hand back an outline
  // that is a different shape from the one on screen — so it declines instead,
  // and the caller falls back to icon search.
  check("computed points are declined, not half-read",
    loopsFromCode(`polygon([[0,0],[W,0],[W,H],[0,H]]);`).length === 0);
  check("...even when enough numeric pairs remain to look like a shape",
    loopsFromCode(`polygon([[0,0],[10,0],[10,10],[0,S*2],[3,4]]);`).length === 0,
    JSON.stringify(loopsFromCode(`polygon([[0,0],[10,0],[10,10],[0,S*2],[3,4]]);`)));

  check("code with no outline yields nothing rather than guessing",
    loopsFromCode("return cube([10,10,10]);").length === 0);
  check("...and so does a two-point 'outline'",
    loopsFromCode("polygon([[0,0],[1,1]]);").length === 0);
  check("a non-string is not a crash", loopsFromCode(null).length === 0);
}

console.log("\ndense traced artwork is thinned to what a nozzle can print\n");
{
  // A traced icon arrives around 1,400 points; offset() on that had not
  // finished translating after ninety seconds. The thinning has to be
  // aggressive AND stay inside its stated tolerance, so both are measured
  // rather than assumed.
  const circle = (n, r, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [+(cx + Math.cos(a) * r).toFixed(4), +(cy + Math.sin(a) * r).toFixed(4)];
  });
  const dense = [{ hole: false, points: circle(600, 40) }];
  const thin = simplifyLoops(dense, 0.25);
  check("a 600-point circle loses most of its points",
    thin[0].points.length < 120, `${thin[0].points.length} left`);
  check("...and is still a closed shape", thin[0].points.length >= 3);

  // Every original point must still lie within the tolerance of the simplified
  // outline — INCLUDING across the closing segment. Measuring against segments
  // is the whole point: measuring against the nearest kept VERTEX would pass
  // even for an outline that had lost a corner.
  const dev = (orig, simp) => {
    let worst = 0;
    for (const [px, py] of orig) {
      let best = Infinity;
      for (let j = 0; j < simp.length; j++) {
        const [ax, ay] = simp[j], [bx, by] = simp[(j + 1) % simp.length];
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
      }
      worst = Math.max(worst, best);
    }
    return worst;
  };
  for (const tol of [0.1, 0.25, 0.5]) {
    const s = simplifyLoops(dense, tol);
    check(`tolerance ${tol} mm is honoured, not approximated`,
      dev(dense[0].points, s[0].points) <= tol + 1e-6,
      `worst deviation ${dev(dense[0].points, s[0].points).toFixed(4)} mm`);
  }

  // The bug this check exists for: the closed loop was split at point 0 and at
  // the far anchor, and the last point was dropped whatever it was. A spike
  // sitting at the LAST index went missing, putting a 6 mm notch in the
  // outline of a real traced icon — a wrong shape, not a coarse one.
  const spiked = circle(60, 40);
  spiked[spiked.length - 1] = [55, 0.5];
  const s = simplifyLoops([{ hole: false, points: spiked }], 0.25);
  check("a feature sitting on the LAST point is not dropped",
    s[0].points.some(([x]) => x > 50), `max x is ${Math.max(...s[0].points.map((p) => p[0])).toFixed(1)}`);
  check("...and the closing segment is measured too",
    dev(spiked, s[0].points) <= 0.25 + 1e-6, `${dev(spiked, s[0].points).toFixed(3)} mm`);

  // Holes are outlines too, and a hole that drifts 0.25 mm is fine; a hole
  // that loses its flag is a second blade in the middle of the cookie.
  const withHole = simplifyLoops([
    { hole: false, points: circle(200, 40) },
    { hole: true, points: circle(200, 12) },
  ], 0.25);
  check("holes are thinned as well", withHole[1].points.length < 200);
  check("...and stay holes", withHole[1].hole === true);

  // Small loops are left alone: below the point count where thinning helps,
  // the tolerance can only take away a corner that mattered.
  const tri = [{ hole: false, points: [[0, 0], [40, 0], [40, 40]] }];
  check("a shape too small to thin is returned untouched",
    simplifyLoops(tri, 5)[0].points.length === 3);
  check("thinning off means exactly the points given",
    simplifyLoops(dense, 0)[0].points.length === 600);

  // And it reaches the generators — all four, via the one path they share.
  for (const k of KINDS) {
    const src = makeKit(k.id, dense, { size: 80 });
    const pts = (src.match(/\[-?[\d.]+,-?[\d.]+\]/g) || []).length;
    check(`${k.id}: emits the thinned outline, not the raw one`, pts < 200, `${pts} points`);
  }
  const raw = makeKit("cutter", dense, { size: 80, tolerance: 0 });
  check("...and tolerance 0 still lets a caller keep every point",
    (raw.match(/\[-?[\d.]+,-?[\d.]+\]/g) || []).length === 600);
}

console.log("\nand it is scaled to a size a person would print\n");
{
  const big = [{ hole: false, points: [[0, 0], [500, 0], [500, 250]] }];
  const s = scaleLoops(big, 70);
  const xs = s[0].points.map((p) => p[0]), ys = s[0].points.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  check("the longest side becomes the size asked for", Math.abs(span - 70) < 0.01, `${span}`);
  check("...and it is centred on the plate",
    Math.abs((Math.max(...xs) + Math.min(...xs)) / 2) < 0.01);
  check("aspect ratio survives",
    Math.abs((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)) - 2) < 0.01);
  // Holes have to move with the outline they belong to, or a donut's hole
  // ends up outside the donut.
  const pair = scaleLoops([
    { hole: false, points: [[-10, -10], [10, -10], [10, 10], [-10, 10]] },
    { hole: true, points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] },
  ], 70);
  check("a hole scales by the same factor as its outline",
    Math.abs(Math.max(...pair[1].points.map((p) => p[0])) - 7) < 0.01,
    `${Math.max(...pair[1].points.map((p) => p[0]))}`);
  check("...and stays flagged as a hole", pair[1].hole === true);
  let t = "";
  try { scaleLoops(big, 0); } catch (e) { t = e.message; }
  check("a zero size is refused", /not a size/.test(t), t);
  t = "";
  try { scaleLoops([{ hole: false, points: [[1, 1], [1, 1], [1, 1]] }], 70); } catch (e) { t = e.message; }
  check("an outline with no extent is refused rather than divided by zero",
    /no size to scale/.test(t), t);
}

console.log("\nthe Iconify client asks the right questions\n");
{
  // No network here — a unit test that depends on someone else's uptime is a
  // test that fails for reasons that are not about this code.
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url.includes("/search")) return { ok: true, json: async () => ({ icons: ["mdi:heart", "mdi:star"] }) };
    return { ok: true, text: async () => '<svg viewBox="0 0 24 24"><path d="M1 1h4v4H1z"/></svg>' };
  };
  check("search hits the documented endpoint",
    (await searchIcons("heart", { fetchImpl: fakeFetch })).length === 2);
  check("...at api.iconify.design", calls[0].startsWith(ICONIFY + "/search"), calls[0]);
  check("...with the query encoded", (await searchIcons("ice cream", { fetchImpl: fakeFetch }),
    calls[calls.length - 1].includes("ice%20cream")), calls[calls.length - 1]);
  check("an empty query does not hit the network at all",
    (await searchIcons("  ", { fetchImpl: fakeFetch })).length === 0);

  check("an icon id fetches its svg",
    /<svg/.test(await iconSvg("mdi:heart", { fetchImpl: fakeFetch })));
  check("...from prefix/name.svg", /\/mdi\/heart\.svg/.test(calls[calls.length - 1]));
  let t = "";
  try { await iconSvg("just-a-word", { fetchImpl: fakeFetch }); } catch (e) { t = e.message; }
  check("a malformed id is refused before any request", /look like "mdi:heart"/.test(t), t);
  const bad = async () => ({ ok: false, status: 404 });
  t = "";
  try { await iconSvg("mdi:nope", { fetchImpl: bad }); } catch (e) { t = e.message; }
  check("a 404 says which icon and what happened", /mdi:nope/.test(t) && /404/.test(t), t);
  check("previews come from the same host", iconPreview("mdi:heart").startsWith(ICONIFY));
}

console.log("\nthe wait is announced before it is spent\n");
{
  // Measured on this kernel at 80 mm, after thinning: one blade 3.4 s, three
  // 11.8 s, five 35 s. Cost tracks the number of separate PIECES, and thinning
  // the outline from 1,430 points to 202 barely moved it. Dropping pieces to go
  // faster is the one thing this file must never do, so the cost gets said.
  check("one piece needs no warning", pieceNote([{ hole: false, points: star(5, 30, 14) }]) === "");
  check("...and holes are not pieces",
    pieceNote([{ hole: false, points: star(5, 30, 14) }, { hole: true, points: star(4, 5, 2) }]) === "");
  // LOOPS has a star at the origin and a second one out at x+44 — genuinely
  // apart, so genuinely two cutters.
  const many = pieceNote(LOOPS);
  check("two pieces that are really apart do get a warning", many.length > 0, many);
  check("...and are called two cutters", /2 separate pieces/.test(many) && /2 cutters/.test(many), many);

  // The one this check exists for. A traced salmon arrives as four outlines —
  // body, tail, fin, gill — that all OVERLAP, so their blades fuse into a
  // single cutter. Counting outlines and announcing "4 cutters" told the user
  // something false about what comes off the printer, and it said it during a
  // demo before anyone noticed.
  const ring = (cx, r) => Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [+(cx + Math.cos(a) * r).toFixed(2), +(Math.sin(a) * r).toFixed(2)];
  });
  const fused = pieceNote([0, 6, 12, 18].map((cx) => ({ hole: false, points: ring(cx, 10) })));
  check("four OVERLAPPING outlines are one cutter, not four",
    /fuse into one cutter/.test(fused) && !/4 cutters/.test(fused), fused);
  check("...and the build cost is still reported, because that is per outline",
    /\d+ s for/.test(fused), fused);
  const apart = pieceNote([0, 60, 120].map((cx) => ({ hole: false, points: ring(cx, 10) })));
  check("three outlines far apart really are three cutters",
    /3 separate pieces/.test(apart) && /3 cutters/.test(apart), apart);
  check("...and two touching plus one apart is two cutters",
    /2 cutters/.test(pieceNote([0, 6, 90].map((cx) => ({ hole: false, points: ring(cx, 10) })))),
    pieceNote([0, 6, 90].map((cx) => ({ hole: false, points: ring(cx, 10) }))));
  check("a warning under three outlines does not quote a build time",
    !/\d+ s for/.test(pieceNote([0, 60].map((cx) => ({ hole: false, points: ring(cx, 10) })))));
}

console.log("\nthe Toolbox entry is wired to things that exist\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const has = (id) => HTML.includes(`id="${id}"`);
  for (const id of ["cutter", "cutter-row", "cutter-row-hint", "cutter-sub-rows",
    "cutter-sub", "cutter-q", "cutter-go", "cutter-grid", "cutter-opts",
    "cutter-kinds", "cutter-size", "cutter-size-o", "cutter-stat"]) {
    check(`#${id} exists`, has(id), "the handler reads it and would get null");
  }
  // Every $("…") the cutter block reaches for, checked against the document
  // rather than against this list — so an id renamed in the handler and
  // nowhere else still fails here.
  const block = HTML.slice(HTML.indexOf("// ------------------------------------------------------- cookie cutter"));
  const used = [...block.slice(0, block.indexOf('"More tools"')).matchAll(/\$\("([\w-]+)"\)/g)]
    .map((m) => m[1]);
  check("the block actually looks things up", used.length >= 8, `${used.length}`);
  const dangling = [...new Set(used)].filter((id) => !has(id));
  check("...and every one of them is in the document",
    dangling.length === 0, `no such id: ${dangling.join(", ")}`);

  // Position: the user asked for it at the BOTTOM of the Toolbox. The one
  // thing below it is the free-form checkbox, which is a mode, not a tool.
  const menu = HTML.slice(HTML.indexOf('<div id="tools-menu">'), HTML.indexOf('<div id="more-menu">'));
  const rows = [...menu.matchAll(/data-act="([\w-]+)"|id="(cutter-row)"/g)].map((m) => m[1] || m[2]);
  check("the cutter is the last tool in the Toolbox",
    rows[rows.length - 1] === "cutter-row", rows.join(" > "));
  check("...and the free-form MODE still sits below it, where it was",
    menu.indexOf('id="freeform"') > menu.indexOf('id="cutter-row"'));

  // The row must not go through the generic delegate: that fires the button
  // named by data-act and closes the menu, which would collapse the submenu
  // in the same click that opened it.
  const rowTag = menu.slice(menu.indexOf('<button id="cutter-row"'));
  check("the row has no data-act, so the menu does not close under it",
    !rowTag.slice(0, rowTag.indexOf(">")).includes("data-act"));
  check("...and it says whether it is expanded, for a screen reader",
    /aria-expanded/.test(rowTag.slice(0, rowTag.indexOf(">"))));

  // Both halves of the behaviour the user specified have to be reachable.
  check("no outline on the plate opens the icon search",
    /if \(!loops\.length\)[\s\S]{0,180}openSearch\(\)/.test(block));
  check("an outline on the plate expands the kits instead",
    /fillSubRows\(loops\)/.test(block));
  check("the kits are built from KINDS rather than typed twice",
    (block.match(/const \{ KINDS \} = await getCK\(\)/g) || []).length >= 2);
  check("cutterkit is loaded lazily, not on startup",
    /await import\("\.\/cutterkit\.js"\)/.test(block) && !/^import .*cutterkit/m.test(HTML));
}

console.log("\nand it builds — through the real kernel\n");
{
  const src = cutterScad(LOOPS, { size: 70 });
  let facets = 0, xs = [], err = "";
  try {
    const stl = toSTL(await build(fromOpenSCAD(src)), "t");
    facets = (stl.match(/facet normal/g) || []).length;
    xs = [...stl.matchAll(/vertex\s+(\S+)/g)].map((m) => +m[1]);
  } catch (e) { err = String(e.message || e); }
  check("the generated cutter builds", facets > 50, err || `${facets} facets`);
  // The second piece is centred at x=44; if it were dropped the model would
  // stop around x=37 (30 + rim).
  check("...with BOTH pieces on the plate", Math.max(...xs) > 45,
    `x reaches ${Math.max(...xs).toFixed(1)}`);
  check("...and it is a wall, not a filled slab", facets < 2000, `${facets} facets`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
