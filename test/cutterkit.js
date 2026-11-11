// The cutter-kit generators.
//
// These emit OpenSCAD that a person prints. Two failures matter and neither
// throws: code that does not build, and code that builds but has quietly lost
// part of the outline — the gingerbread man with one arm. So the generators are
// checked as text AND one is built through the real kernel.

import {
  KINDS, makeKit, cutterScad, stampScad, stencilScad, rollerScad,
  loopLiteral, DEFAULTS, searchIcons, iconSvg, iconPreview, ICONIFY,
  loopsFromCode, scaleLoops, simplifyLoops, pieceNote, iconSvgs,
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
  check("holes are not extra blades, and are not carried into a cutter", !/h0 = \[/.test(c) && /h0 = \[/.test(stampScad(LOOPS)));
}

console.log("\nthe numbers the recipe justifies are the numbers emitted\n");
{
  const c = cutterScad(LOOPS);
  check("wall is never below the nozzle floor", DEFAULTS.wall >= 0.8, `${DEFAULTS.wall}`);
  check("...and it is in the source", /WALL = 0\.9/.test(c));
  // PRINTED AS IT STANDS: the rim is the wide part and it is on the plate, the
  // blade rising from it. Its corners are rounded (offset r, not delta).
  check("the rim lies on the plate, the blade standing in it", /module flange\(pts\) \{[^}]*?\n  linear_extrude\(RIM_H\) difference\(\) \{/.test(c) && !/translate\(\[0, 0, H - /.test(c.replace(/translate\(\[0, 0, H - EDGE_H/g, "")));
  check("...with rounded corners", /offset\(r = RIM\) polygon\(pts\);/.test(c));
  {
    const sq = [{ hole: false, points: [[-20, -20], [20, -20], [20, 20], [-20, 20]] }];
    const stl = toSTL(await build(fromOpenSCAD(cutterScad(sq, { size: 40 }))), "t");
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    const wide = (z0, z1) => Math.max(...v.filter((p) => p[2] >= z0 && p[2] <= z1).map((p) => Math.abs(p[0])));
    check("...built: widest at the plate, bare blade at the top", wide(0, 0.01) > 25.9 && wide(14.9, 15.1) < 20.6, `${wide(0, 0.01)} / ${wide(14.9, 15.1)}`);
    const corner = Math.max(...v.filter((p) => p[2] < 0.01).map((p) => Math.hypot(p[0], p[1])));
    check("...and the rim's corner is an arc, not a point", corner > 34.2 && corner < 34.4, `${corner.toFixed(2)} (a mitred point would reach 36.77)`);
  }
  {
    const twice = [LOOPS[0], { hole: false, points: LOOPS[0].points.map((q) => [...q]) }, LOOPS[2]];
    check("the same outline twice is one blade", (cutterScad(twice).match(/blade\(o\d\)/g) || []).length === 1);
  }
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
  // Sliced by ID rather than by the exact opening tag: adding an attribute to
  // the menu (data-flip, when it learned to open upward) made indexOf return
  // -1, and the slice silently became the whole file from position -1. Three
  // checks then failed with nothing wrong in the app.
  const openTag = (id) => {
    const at = HTML.indexOf(`id="${id}"`);
    return at < 0 ? -1 : HTML.lastIndexOf("<", at);
  };
  const menuFrom = openTag("tools-menu"), menuTo = openTag("more-menu");
  check("the Toolbox and the overflow menu are both in the document",
    menuFrom > -1 && menuTo > menuFrom, `${menuFrom} .. ${menuTo}`);
  const menu = HTML.slice(menuFrom, menuTo);
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
  check("no outline on the plate opens the shelf, which has the icon search under it",
    /if \(!loops\.length\)[\s\S]{0,180}openCutterDoor\(\)/.test(block));
  check("an outline on the plate expands the kits instead",
    /fillSubRows\(loops\)/.test(block));
  check("the kits are built from KINDS rather than typed twice",
    (block.match(/const \{ KINDS \} = await getCK\(\)/g) || []).length >= 2);
  check("cutterkit is loaded lazily, not on startup",
    /await import\("\.\/cutterkit\.js"\)/.test(block) && !/^import .*cutterkit/m.test(HTML));
}

console.log("\nthe choices a cutter designer offers\n");
{
  const { HANDLES, BARS, mirrorLoops } = await import("../viewer/cutterkit.js");
  const one = [{ hole: false, points: star(5, 30, 14) }];
  const dims = async (opts) => {
    const stl = toSTL(await build(fromOpenSCAD(cutterScad(one, { size: 70, ...opts }))), "t");
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    const mm = (k) => [Math.min(...v.map((p) => p[k])), Math.max(...v.map((p) => p[k]))];
    return { x: mm(0), z: mm(2), solids: (stl.match(/^solid /gm) || []).length, facets: v.length / 3 };
  };
  const plain = await dims({});
  check("blade height is a dial", Math.abs((await dims({ height: 22 })).z[1] - 22) < 0.01);
  check("the wall never goes under the nozzle floor, whatever the dial says", /WALL = 0\.8;/.test(cutterScad(one, { wall: 0.3 })));
  check("handles: standard, wide, comfort, none", HANDLES.map((h) => h.id).join() === "standard,wide,comfort,none");
  const wide = await dims({ handle: "wide" }), none = await dims({ handle: "none" }), comfort = await dims({ handle: "comfort" });
  check("...wide reaches 4 mm further out, all the way round (the rim is rounded, so no further at a point)", Math.abs(wide.x[1] - plain.x[1] - 4) < 0.05, `${(wide.x[1] - plain.x[1]).toFixed(2)}`);
  check("...none is the bare blade", none.x[1] < plain.x[1] - 4 && none.solids === 1, `${none.x[1].toFixed(1)} against ${plain.x[1].toFixed(1)}`);
  check("...comfort adds a second, narrower tier on the rim, still one body", Math.abs(comfort.z[1] - plain.z[1]) < 0.01 && comfort.solids === 1 && comfort.facets > plain.facets && /linear_extrude\(RIM_H \* 0\.6 \+ 0\.4\)/.test(cutterScad(one, { handle: "comfort" })), `z to ${comfort.z[1]}, ${comfort.solids} solid(s)`);
  const sharp = await dims({ sharp: true });
  check("a sharp edge is still one body, the same size outside", sharp.solids === 1 && Math.abs(sharp.x[1] - plain.x[1]) < 0.01 && sharp.facets > plain.facets);
  check("...thinned to one line over the last of the blade", /EDGE = 0\.45;/.test(cutterScad(one, { sharp: true })) && /EDGE_H = 2;/.test(cutterScad(one, { sharp: true })));
  check("centre bars: off, one, or a cross", BARS.map((b) => b.id).join() === "0,1,2");
  const bar = await dims({ bars: 1 }), cross = await dims({ bars: 2 });
  check("...bars stay inside the outline and make it no bigger", bar.solids === 1 && cross.solids === 1 && Math.abs(cross.x[1] - plain.x[1]) < 0.01);
  check("...a cross is more than a bar is more than none", cross.facets > bar.facets && bar.facets > plain.facets, `${plain.facets} / ${bar.facets} / ${cross.facets}`);
  check("...and a stamp, which drops through the opening, never gets them", !/bars\(/.test(stampScad(one, { size: 70, bars: 2 })));
  // mirror: an L, so left and right are different
  const ell = [{ hole: false, points: [[0, 0], [30, 0], [30, 8], [8, 8], [8, 40], [0, 40]] }];
  const m = mirrorLoops(ell)[0].points;
  check("mirror flips left to right", Math.min(...m.map((p) => p[0])) === -30 && Math.max(...m.map((p) => p[0])) === 0);
  const area = (p) => p.reduce((a, q, i) => a + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0);
  check("...and keeps each loop winding the way it did", Math.sign(area(m)) === Math.sign(area(ell[0].points)));
  check("...in the code a mirrored cutter writes", /\[-30, ?0\]/.test(cutterScad(ell, { size: 40, mirror: true, tolerance: 0 })));
  check("everything at once still builds as one body", (await dims({ sharp: true, handle: "comfort", bars: 2, mirror: true, height: 20, wall: 1.2 })).solids === 1);

  const H = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  check("the card has the controls", ["cutter-height", "cutter-wall", "cutter-sharp", "cutter-handle", "cutter-bars", "cutter-mirror"].every((id) => H.includes(`id="${id}"`)));
  check("...remembered choices are applied once, never over what was just set", /if \(cutterOptsFilled\) return;/.test(H));
  check("...and every way of making a kit uses them", /makeKit\(kind, loops, \{ \.\.\.cutterExtras\(\), \.\.\.extra \}\)/.test(H));
}

console.log("\nthe shelf of popular shapes\n");
{
  const D = await import("../viewer/cutterdoor.js");
  check("there is a shelf of shapes", D.EXAMPLES.length >= 8, String(D.EXAMPLES.length));
  check("every one has a name people would search for", D.EXAMPLES.every((e) => e.label && e.blurb && /^[a-z]+$/.test(e.id)));
  const segs = (p) => p.map((a, i) => [a, p[(i + 1) % p.length]]);
  const cross = ([a, b], [c, d]) => {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (const e of D.EXAMPLES) {
    const p = e.loops[0].points;
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    check(`${e.id}: one outline, about a cookie across`, e.loops.length === 1 && Math.max(w, h) > 55 && Math.max(w, h) < 95 && Math.min(w, h) > 35, `${w.toFixed(0)} x ${h.toFixed(0)}`);
    const S = segs(p);
    let hits = 0;
    for (let i = 0; i < S.length; i++) for (let j = i + 2; j < S.length; j++) { if (i === 0 && j === S.length - 1) continue; if (cross(S[i], S[j])) hits++; }
    check(`${e.id}: the outline never crosses itself`, hits === 0, `${hits} crossings`);
    let ok = false, detail = "";
    try {
      const stl = toSTL(await build(fromOpenSCAD(cutterScad(e.loops, { size: 70 }))), "t");
      ok = (stl.match(/^solid /gm) || []).length === 1 && (stl.match(/facet normal/g) || []).length > 40;
    } catch (err) { detail = String(err.message || err).slice(0, 160); }
    check(`${e.id}: builds as one cutter`, ok, detail);
    // round out, sharp or flat in: an outline the exact kernel takes, so the
    // shelf's first build is a fraction of a second and not a fallback
    const fast = await build(fromOpenSCAD(cutterScad(e.loops, { size: 70 })));
    check(`${e.id}: builds on the exact kernel, no fallback`, fast.engine === "exact", `${fast.engine} ${String(fast.fallback || "").slice(0, 80)}`);
    const svg = D.previewSvg(e.loops);
    check(`${e.id}: has a picture, drawn standing up`, /^<svg /.test(svg) && (svg.match(/<defs><path /g) || []).length === 1 && (svg.match(/fill="url\(#ckp\d+w\d+\)"/g) || []).length > 12 && (svg.match(/<circle /g) || []).length > 20 && !/NaN|Infinity|undefined/.test(svg));
    for (const o of [{ kind: "stamp" }, { kind: "stencil" }, { kind: "roller" }, { handle: "comfort", bars: 2, sharp: true, height: 28 }, { handle: "none" }]) {
      const s2 = D.previewSvg(e.loops, o);
      if (!/^<svg /.test(s2) || /NaN|Infinity|undefined/.test(s2) || s2 === svg) check(`${e.id}: the picture follows ${JSON.stringify(o)}`, false);
    }
  }
  const H2 = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const B = readFileSync(new URL("../build-site.mjs", import.meta.url), "utf8");
  check("/cutter opens the shelf", /bounce\("cutter", "cutter=1"/.test(B) && /function cutterRequested\(\)/.test(H2) && /cutterRequested\(\)\) \{[\s\S]{0,160}openCutterDoor\(\)/.test(H2));
  check("...the bundle ships it", /"cutterdoor\.js",/.test(B));
  check("...the Toolbox reaches it, with or without an outline on the plate", /Popular shapes…/.test(H2) && /openCutterDoor\(\);            \/\/ nothing on the plate/.test(H2));
  check("...and searching is the door itself, the caret in its search box", /const openSearch = \(\) => openCutterDoor\(\{ focusSearch: true \}\);/.test(H2));
  const DS = readFileSync(new URL("../viewer/cutterdoor.js", import.meta.url), "utf8");
  check("one window: the search, what it found drawn as cutters, the chosen one large with its dials",
    /class="ck-q"/.test(DS) && /class="ck-kinds"/.test(DS) && /class="ck-stage"/.test(DS) && /class="ck-make"/.test(DS)
    && /card\.querySelector\("\.ck-wait"\)\.outerHTML = previewSvg\(shaped\(got, 70, false\), \{ \.\.\.tintOf\(\+card\.dataset\.n\), \.\.\.FOUND_VIEW \}\);/.test(DS));
  check("...nothing is built until Make it, at the size on the dial", /const scaled = \(\) => \(tools\.scaleLoops \? tools\.scaleLoops\(sel\.loops, size\) : sel\.loops\);/.test(DS) && /const loops = shaped\(\);/.test(DS) && /await emit\(kind, loops, \{ size \}, \{ showCode: false \}\);/.test(H2));
  check("...a late answer to an old search is dropped", /if \(mine !== seq\) return;/.test(DS));
  check("bring your own: an SVG, or a picture to trace",
    /data-act="svg"/.test(DS) && /data-act="pic"/.test(DS) && /\$\("trace-file"\)\.click\(\);/.test(H2));
  check("the loading screen does not sit over an editor that starts empty", /if \(prefs\.starterCube === false\) \{ code\.value = ""; updateHint\(\); bootDismiss\(\); \}/.test(H2));
  // A kit is only ever printed, so a cut the exact kernel refuses (most traced
  // icons) is redone on triangles instead of on the slow kernel: measured on a
  // searched cat, 9 s down to 2.3 s. The page knows a kit by its first line.
  {
    const E = readFileSync(new URL("../src/engine.js", import.meta.url), "utf8");
    const head = new RegExp(/const KIT_HEAD = \/(.+)\/;/.exec(H2)?.[1] || "^$");
    check("a kit is marked print-only by its first line, whichever kit it is", KINDS.every((k) => head.test(makeKit(k.id, D.exampleById("star").loops, { size: 70 }))) && !head.test("// A bracket; cube(10);"));
    check("...and the engine is told so", /const every = !!src\.meshIfRefused;/.test(E) && /delete src\.meshIfRefused;/.test(E) && /json: printOnlyKit\(j\)/.test(H2));
  }
  // every kit builds from a shelf shape
  for (const k of KINDS) {
    let ok = false, detail = "";
    try { ok = (toSTL(await build(fromOpenSCAD(makeKit(k.id, D.exampleById("star").loops, { size: 70 }))), "t").match(/facet normal/g) || []).length > 40; }
    catch (err) { detail = String(err.message || err).slice(0, 160); }
    check(`a star as a ${k.id} builds`, ok, detail);
  }
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

// ------------------------------------------------- a drawing -> one outline
//
// A searched icon is a pile of pieces: head, eyes, whiskers, strokes. Each as
// its own blade is what put walls across the inside of a cat cutter and loose
// slivers beside it. viewer/cutteroutline.js reduces the drawing to the one
// silhouette a cutter goes round, and the engine builds a kit on triangles.
console.log("\na drawing becomes one outline\n");
{
  const O = await import("../viewer/cutteroutline.js");
  const CS = await O.loadCross();
  const circle = (cx, cy, r, n = 32) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 2 * Math.PI) * r, cy + Math.sin((i / n) * 2 * Math.PI) * r]);
  // a face drawn the way a line icon draws it: a stroked ring, two filled
  // eyes, a mouth, and two hairline whiskers that poke out
  const face = {
    fills: [[circle(8, 9, 1.2)], [circle(16, 9, 1.2)]],
    strokes: [
      { points: circle(12, 12, 9), width: 2, closed: true },
      { points: [[8, 16], [12, 18], [16, 16]], width: 2, closed: false },
      { points: [[2, 13], [-3, 13]], width: 0.3, closed: false },
      { points: [[22, 13], [27, 13]], width: 0.3, closed: false },
    ],
  };
  const ink = O.inkLoops(CS, face, { maxSize: 70 });
  const spanOf = (ls) => { const xs = ls.flatMap((l) => l.points.map((p) => p[0])), ys = ls.flatMap((l) => l.points.map((p) => p[1])); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
  check("the ink is everything drawn, strokes at their width, scaled to size", Math.abs(Math.max(...spanOf(ink)) - 70) < 0.01 && ink.some((l) => l.hole) && ink.filter((l) => !l.hole).length >= 3, `${ink.length} loops, ${spanOf(ink).map((v) => v.toFixed(1))}`);
  const cut = O.cutterOutline(CS, ink, { detail: false });
  check("the cutter goes round ONE outline: no blade for an eye, a mouth or the inside of the ring", cut.loops.length === 1 && !cut.loops[0].hole, `${cut.loops.length} loops`);
  // the whiskers are 0.3 of 30 units wide: under a millimetre at 70 mm
  const [w] = spanOf(cut.loops);
  check("...and hairlines too thin for a blade are gone, not left as slivers", w < 50 && w > 40, `${w.toFixed(1)} mm across`);
  const stamp = O.cutterOutline(CS, ink);
  const det = stamp.loops.filter((l) => l.hole);
  check("for a stamp the inside comes back as detail, in pieces without holes", det.length >= 3 && stamp.loops.filter((l) => !l.hole).length === 1, `${det.length} detail pieces`);
  const scad = stampScad(stamp.loops, { size: 70 });
  check("...which the stamp kit raises", (scad.match(/polygon\(h\d+\)/g) || []).length === det.length && /blade\(o0\)/.test(scad) && !/blade\(o1\)/.test(scad));
  check("a cutter's code carries no interior loops at all", !/h0 = /.test(cutterScad(stamp.loops, { size: 70 })));
  // two pieces 2 mm apart are one cutter; a speck is nobody's cutter
  const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  const two = O.cutterOutline(CS, [{ hole: false, points: sq(0, 0, 30) }, { hole: false, points: sq(32, 0, 30) }, { hole: false, points: sq(80, 80, 2) }], { detail: false });
  check("near pieces fuse and a speck is dropped", two.pieces === 1 && two.loops.length === 1, `${two.pieces} pieces, ${two.dropped} dropped`);
  const far = O.cutterOutline(CS, [{ hole: false, points: sq(0, 0, 30) }, { hole: false, points: sq(40, 0, 20) }], { detail: false });
  check("...but two real pieces stay two cutters, biggest first", far.pieces === 2 && Math.abs(spanOf([far.loops[0]])[0] - 30) < 0.5);
  // corners are rounded: a square's corner point is no longer on the outline
  const one = O.cutterOutline(CS, [{ hole: false, points: sq(0, 0, 30) }], { detail: false }).loops[0].points;
  check("outside corners come out rounded", !one.some(([x, y]) => Math.hypot(x, y) < 0.3) && one.some(([x, y]) => Math.hypot(x, y) < 0.8));
  // an emoji whose body runs off the frame, with a spare shape parked a page
  // to the left: only what shows through the viewBox is ink
  const framed = O.inkLoops(CS, { fills: [[sq(4, 4, 40)], [sq(-130, 0, 20)]], strokes: [], box: [0, 0, 24, 24] }, { maxSize: 70 });
  check("ink is cut to the picture's frame", framed.length === 1 && Math.abs(spanOf(framed)[0] - 70) < 0.01 && Math.abs(spanOf(framed)[1] - 70) < 0.01, `${framed.length} loops, ${spanOf(framed).map((v) => v.toFixed(1))}`);
  check("...which svgParts reads from the viewBox", /return \{ fills, strokes, box \};/.test(readFileSync(new URL("../viewer/svg.js", import.meta.url), "utf8")));
  // A rim grown 6 mm round a notch 2 mm wide: the plain offset crosses itself
  // there and the loop extrudes as a spur. The clipper's does not: every
  // point of it is a full 6 mm from the outline.
  {
    const { offsetPolygon, setPolygonOffsetter } = await import("../src/openscad.js");
    const notched = [[0, 0], [40, 0], [40, 30], [22, 30], [21.5, 12], [21, 10], [20, 9.5], [19, 10], [18.5, 12], [18, 30], [0, 30], [0, 20], [0, 10], [0, 5]];
    const dist = ([px, py]) => Math.min(...notched.map((a, i) => {
      const b = notched[(i + 1) % notched.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
    }));
    const off = O.makeOffsetter(CS);
    const clean = off(notched, 6, 48, true), plain = offsetPolygon(notched, 6, 48, true);
    check("the clipper's offset has no inside-out loop at a tight notch", clean.every((p) => dist(p) > 5.9) && plain.some((p) => dist(p) < 5), `nearest ${Math.min(...clean.map(dist)).toFixed(2)} vs ${Math.min(...plain.map(dist)).toFixed(2)} mm`);
    let asked = 0;
    setPolygonOffsetter((...a) => { asked++; return off(...a); });
    const lit = (pts) => "[" + pts.map((p) => `[${p}]`).join(",") + "]";
    fromOpenSCAD(`linear_extrude(2) offset(r = 6) polygon(${lit(notched)});`);
    const many = asked;
    fromOpenSCAD(`linear_extrude(2) offset(r = 2) polygon([[0,0],[10,0],[10,10],[0,10]]);`);
    setPolygonOffsetter(null);
    check("...the translator uses it for many-sided outlines only", many === 1 && asked === 1, `${many}, ${asked}`);
    check("...and the page hands it over before a kit is written", /setPolygonOffsetter\(O\.makeOffsetter\(outliner\.CS\)\);/.test(readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8")) && /await ensureOutliner\(\)\.catch\(\(\) => \{\}\);/.test(readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8")));
  }
  check("an empty drawing says so", (() => { try { O.inkLoops(CS, { fills: [], strokes: [] }); return false; } catch (e) { return /nothing is drawn/.test(e.message); } })());

  const SV = readFileSync(new URL("../viewer/svg.js", import.meta.url), "utf8");
  const DS = readFileSync(new URL("../viewer/cutterdoor.js", import.meta.url), "utf8");
  const HT = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const BS = readFileSync(new URL("../build-site.mjs", import.meta.url), "utf8");
  const EN = readFileSync(new URL("../src/engine.js", import.meta.url), "utf8");
  check("an SVG is read as it is drawn: fills where filled, strokes where stroked", /export async function svgParts/.test(SV) && /on\(st\.fill\)/.test(SV) && /on\(st\.stroke\)/.test(SV));
  check("the door traces through it, and makes the outline at the size on the dial", /O\.inkLoops\(CS, await S\.svgParts\(text\), o\)/.test(HT) && /sel\.cut = \{ key, loops: tools\.outline\(scaled\(\), \{ detail \}\) \}/.test(DS) && /"cutteroutline\.js",/.test(BS));
  check("a search fetches its drawings a set at a time, and keeps what it traced", /await tools\.iconSvgs\(need\)/.test(DS) && /^const TRACED = new Map\(\);/m.test(DS) && /limit: 48/.test(DS));
  // one request per icon set, each icon rebuilt as an SVG
  const asked = [];
  const got = await iconSvgs(["mdi:cat", "mdi:dog", "tabler:cat", "bad name", "x:y:z"], { fetchImpl: async (url) => {
    asked.push(url);
    return { ok: true, json: async () => (/mdi\.json/.test(url) ? { width: 24, height: 24, icons: { cat: { body: "<path d='M0 0h4v4z'/>" }, dog: { body: "<path/>", width: 20 } } } : { icons: {} }) };
  } });
  check("iconSvgs: one request per set, an SVG per icon it answered", asked.length === 2 && asked.some((u) => u.endsWith("/mdi.json?icons=cat,dog")) && got.size === 2
    && /viewBox="0 0 24 24"/.test(got.get("mdi:cat")) && /viewBox="0 0 20 24"/.test(got.get("mdi:dog")), `${asked.length} requests, ${got.size} icons`);
  check("a kit is cut on triangles from the start, not after the exact kernel has refused it", /if \(src\.meshIfRefused && !hulls\.length\) \{/.test(EN) && /out\.stats = \{ \.\.\.out\.stats, printOnly: true \};/.test(EN));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
