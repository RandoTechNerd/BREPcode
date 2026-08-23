// The windows: one gesture, one meaning — and the model stays out from under
// them.
//
// Two defects prompted this, both found by driving the real app rather than by
// reading it:
//
//   every card header had TWO dblclick listeners. One expanded the window, the
//   other snapped it back into the dock, and both fired on the same gesture.
//   Drag a window somewhere, expand it, restore it, and it came back in the
//   dock rather than where you left it — your placement silently thrown away.
//
//   and nothing ever moved the MODEL. The camera frames it in the middle of
//   the whole canvas, so opening the editor simply put the part behind it.
//
// The rule the fix is built on, and the one worth protecting here: the app may
// rearrange what the app placed, and disturbs a view you set yourself only
// when something is genuinely sitting on top of it.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");

console.log("\none gesture, one meaning\n");
{
  // The regression that started this. Counting listeners is crude, but it is
  // exactly the thing that went wrong: a second one added later, in the same
  // loop, quietly contradicting the first.
  const hdrLoop = HTML.slice(HTML.indexOf('for (const headerEl of document.querySelectorAll(".card > header")'));
  const upTo = hdrLoop.slice(0, hdrLoop.indexOf("\n    }\n"));
  const dbl = (upTo.match(/headerEl\.addEventListener\("dblclick"/g) || []).length;
  check("a card header has exactly one dblclick listener", dbl === 1, `${dbl} found`);
  check("...and it is the expand one", /dblclick[\s\S]{0,160}toggleExpand\(card\)/.test(upTo));
  check("re-docking moved to its own named action", /function redockCard\(card\)/.test(HTML));
  check("...reachable from a button, not a rival gesture",
    /mk\("win-dock", \(\) => redockCard\(card\)\)/.test(HTML));
  check("right-click on the header still closes", /headerEl\.addEventListener\("contextmenu"/.test(HTML));
}

console.log("\nexpand, then come back to exactly where you were\n");
{
  const fn = HTML.slice(HTML.indexOf("function toggleExpand(card)"), HTML.indexOf("function redockCard"));
  check("what is saved includes whether it was floating", /floating: card\.classList\.contains\("floating"\)/.test(fn),
    "without this a docked window returns as a loose one");
  check("...and the geometry", /left: card\.style\.left, top: card\.style\.top/.test(fn));
  check("restoring puts the floating state back", /card\.classList\.toggle\("floating", p\.floating\)/.test(fn));
  check("...and the geometry with it", /for \(const k of \["left", "top", "width", "height"\]\) card\.style\[k\] = p\[k\]/.test(fn));
  check("the dock is told the column changed", /markDockShared\(\)/.test(fn));
  check("it no longer floats a window just to expand it", !/classList\.add\("floating"\)/.test(fn),
    ".card.expanded overrides position outright — there was never anything to reposition");
}

console.log("\nclosing a window forgets its fullscreen state\n");
{
  const fn = HTML.slice(HTML.indexOf("function toggleCard(card, btn, on)"), HTML.indexOf("function markDockShared"));
  check("closing drops expanded as well as maxed", /card\.classList\.remove\("maxed", "expanded"\)/.test(fn));
  check("...and the geometry it was holding to go back to", /preExpand\.delete\(card\)/.test(fn),
    "that geometry belongs to a session that is over");
  check("opening or closing re-checks the model", /windowsChanged\(\)/.test(fn));
}

console.log("\nevery window gets the same controls\n");
{
  check("they are built in code, not typed into thirteen headers",
    /function syncWindowChrome\(card\)/.test(HTML));
  check("the expand button says which way it will go",
    /exp\.textContent = big \? "⤡" : "⤢"/.test(HTML));
  check("the put-back button is offered only when it applies",
    /dock\.hidden = big \|\| !card\.classList\.contains\("floating"\)/.test(HTML));
  // Still "before the ×", but into the ×'s own parent — the chat header keeps
  // its controls in a wrapper, and inserting into the header made a third flex
  // group that stranded ⚙ × in the middle of the bar. See the block at the end.
  check("the close × keeps its place at the end",
    /group\.insertBefore\(exp, close \|\| null\)/.test(HTML),
    "moving it would retrain the one button everybody knows the position of");
  check("a click on them does not start a window drag",
    /b\.addEventListener\("click", \(e\) => \{ e\.stopPropagation\(\); onClick\(\); \}\)/.test(HTML));
}

console.log("\nthe model is moved out from under the windows\n");
{
  check("there is a clearance pass", /function keepModelClear\(/.test(HTML));
  check("it asks where there is room", /chooseFreeRect\(blockers, innerWidth, innerHeight, lastFree\)/.test(HTML));
  check("...counting the button row as something to stay off", /\$\("buttons"\)\?\.getBoundingClientRect\(\)/.test(HTML));
  check("a fullscreen window is left alone",
    /if \(document\.querySelector\("\.card\.open\.expanded, \.card\.open\.maxed"\)\) return null/.test(HTML),
    "it covered the model on purpose, and there is no room to move into");

  const fn = HTML.slice(HTML.indexOf("function keepModelClear("), HTML.indexOf("function windowsChanged"));
  check("it measures where the part actually lands", /const seen = modelScreenBox\(\)/.test(fn));
  check("...and only pulls back, never pushes in", /\buse = Math\.max\(dist, need\)/.test(fn),
    "zooming in to use the space would undo a zoom the user chose");
  check("it corrects itself from what the camera would really show",
    /probeCamera\(pos, target\)/.test(fn),
    "under perspective a box's outline is not centred on its centre's projection");
  check("...twice, because pulling back changes the offset too",
    /for \(let pass = 0; pass < 2; pass\+\+\)/.test(fn));
}

console.log("\n...but it never fights the hand on the mouse\n");
{
  check("touching the view marks it as yours",
    /controls\.addEventListener\("start", \(\) => \{ camGlide = null; autoPlaced = false; \}\)/.test(HTML));
  check("a view you set is left alone while it is clear",
    /if \(clear && !autoPlaced\) return false/.test(HTML));
  check("...and the app may still tidy its own placement",
    /autoPlaced = true;\s*\/\/ this position is the app's/.test(HTML));
  check("a few pixels off centre is not worth moving for",
    /if \(offX < 24 && offY < 24\) return false/.test(HTML));
  check("a rebuild hands straight on to the clearance",
    /autoPlaced = true;\s*\n\s*windowsChanged\(\);\s*\n\s*\}/.test(HTML),
    "otherwise every rebuild parks a fresh model back under the editor");
}

console.log("\nthe move is visible, and cannot get stuck half-done\n");
{
  check("the camera glides rather than jumping", /function glideCamera\(pos, target, animate = true\)/.test(HTML));
  check("it is driven from the render loop", /if \(camGlide\) camGlide\(performance\.now\(\)\)/.test(HTML));
  check("camGlide is declared before that loop, which runs synchronously",
    HTML.indexOf("let camGlide = null;") < HTML.indexOf("if (camGlide) camGlide(performance.now())"),
    "a let further down the module is still in its dead zone there");
  check("a glide that never got frames still arrives",
    /if \(camGlide !== mine\) return;\s*\n\s*camGlide = null;\s*\n\s*camera\.position\.copy\(pos\)/.test(HTML),
    "animation frames stop in a background tab");
  check("the decision itself does not wait for a frame",
    /clearT = setTimeout\(\(\) => keepModelClear\(\), delay\)/.test(HTML),
    "getBoundingClientRect forces the layout it needs, so a paint buys nothing");
}

console.log("\nevery way a window can change asks again\n");
{
  for (const [what, near] of [
    ["opened or closed", "function toggleCard(card, btn, on)"],
    ["dragged", "// Near a screen edge? Snap flush to it"],
    ["resized by the grip", "grip.removeEventListener(\"pointercancel\", up)"],
    ["put back in the dock", "function redockCard(card)"],
    ["expanded or restored", "function toggleExpand(card)"],
  ]) {
    const at = HTML.indexOf(near);
    const after = at >= 0 ? HTML.slice(at, at + 1500) : "";
    check(`a window being ${what} re-checks the model`, /windowsChanged\(\)/.test(after));
  }
  check("...and so does the browser window being resized",
    /windowsChanged\(\);\s*\/\/ the stage is a different shape/.test(HTML));
}

console.log("\na tour link opens the tour, not a loading screen\n");
{
  check("the boot cube is hidden before it can paint",
    /<script>\s*if \(\/\[\?&\]tour=1\(&\|\$\)\/\.test\(location\.search\)/.test(HTML),
    "hiding it from the module still flashes it first");
  check("...and the rest of the boot machinery never starts",
    /if \(tourRequested\(\)\) \{ boot\.hidden = true; return; \}/.test(HTML));
  check("one definition of what a tour link is", /function tourRequested\(\)/.test(HTML));
  check("the tour opens on the next frame, not after a wait for the kernel",
    /if \(tourRequested\(\)\) \{\s*\n\s*requestAnimationFrame\(\(\) => \$\("tour-btn"\)\.click\(\)\);/.test(HTML));
  check("...and the old 1400ms wait is gone", !/setTimeout\(\(\) => \$\("tour-btn"\)\.click\(\), 1400\)/.test(HTML));
}

// The header controls must form ONE run. They did not: the chat header keeps
// ⚙ and × inside their own wrapper div, so ":scope > .close-btn" matched
// nothing there and insertBefore(_, null) appended ⤢ to the header instead.
// The header is space-between, so three groups meant the free space was shared
// out between them — ⚙ × ended up marooned in the middle of the bar with ⤢
// alone at the right edge. Measured in the live page: gap between adjacent
// buttons went 160px -> 0px.
{
  console.log("\nheader controls stay in one group\n");

  check("the × is found wherever it lives, not only as a direct child",
    /const close = header\.querySelector\("\.close-btn"\);/.test(HTML),
    "':scope > .close-btn' missed the chat's wrapped ×");
  check("...and the window buttons join THAT element's group",
    /let group = close \? close\.parentElement : header;/.test(HTML)
    && /group\.insertBefore\(dock, close \|\| null\);\s*\n\s*group\.insertBefore\(exp, close \|\| null\)/.test(HTML),
    "appending to the header makes a third flex group");
  check("nothing inserts into the header directly any more",
    !/header\.insertBefore\((dock|exp),/.test(HTML));

  // The wrapped-× fix covered the chat; the NINE headers whose × sits directly
  // in the header still spread, because there "the ×'s group" was the header
  // itself and space-between deals loose buttons across the bar — measured
  // gaps up to 164px between ⇲ ⤢ ×. Those headers now get a built box: one
  // flex item pinned right, which space-between cannot scatter. After the fix,
  // every one of the 13 card headers measured gap ≤ 4px inside the cluster,
  // with the × last and 14px to the edge.
  check("a direct-child × gets its controls boxed",
    /if \(group === header\) \{\s*\n\s*const box = document\.createElement\("div"\);\s*\n\s*box\.className = "win-controls";/.test(HTML));
  check("...and the × itself is moved INTO the box, last",
    /box\.appendChild\(el\);\s*\n\s*if \(el === close\) break;/.test(HTML),
    "an × left outside gets the ⤢ appended after it — × mid-bar, exactly the report");
  check("loose buttons just before the × ride along in the box",
    /while \(first\.previousElementSibling\?\.tagName === "BUTTON"\) first = first\.previousElementSibling;/.test(HTML),
    "once the box eats the free space, a button left out is stranded mid-bar");
  check("the box is one rigid flex item pinned right",
    /\.card > header \.win-controls \{\s*\n\s*display: flex; align-items: center; gap: 2px;\s*\n\s*margin-left: auto; flex: none;/.test(HTML),
    "margin-left:auto pins it even in a header with no title to push against");

  // Once they can sit inside a wrapper, a child selector styles every header
  // except the one that needed it — so both the CSS and the lookup must be
  // descendant selectors, or the buttons come back unstyled and unsynced.
  check("the styling reaches a nested control", /\.card > header \.win-expand,/.test(HTML));
  check("...including the hidden-wins rule", /\.card > header \.win-dock\[hidden\]/.test(HTML));
  check("...and so does the label/icon sync",
    /card\.querySelector\(":scope > header \.win-expand"\)/.test(HTML));
  check("no '> header >' child selector survives for these",
    !/> header > \.win-(expand|dock)/.test(HTML));
}

// A header is ONE line. "SnapMaker U1 MICRO" wrapped the title and took the ×
// down onto a second row with it — the app looked broken, and the one control
// everybody aims for moved. The truncation rules existed but sat inside
// @media (max-width: 620px), which is a VIEWPORT query: these windows are
// resizable, so a narrow panel on a wide screen never matched. Measured live at
// three panel widths, the header stayed 43px and the name ellipsised instead.
{
  console.log("\nthe header never wraps to a second line\n");

  check("the row is explicitly nowrap",
    /\.card > header \{[^}]*flex-wrap: nowrap/s.test(HTML));
  check("the title can shrink below its content",
    /\.card > header > div:first-child \{[^}]*min-width: 0/s.test(HTML),
    "min-width:0 is what lets a flex item truncate at all");
  check("the name truncates rather than wrapping",
    /\.card > header \.sub \{[^}]*text-overflow: ellipsis/s.test(HTML));
  check("the tool run is rigid, so buttons never squeeze",
    /#editor-tools \{[^}]*flex: none/s.test(HTML),
    "a half-width icon is unreadable; a shortened name still identifies the model");

  // The bug was duplication-by-media-query. If the rule is written twice, one
  // copy can be edited and the other left behind — which is how it ended up
  // phone-only in the first place.
  const subRules = HTML.match(/\.card > header \.sub \{/g) || [];
  check("...and that rule is written exactly once, not once per breakpoint",
    subRules.length === 1, `${subRules.length} copies`);
}

// Two header slots given back: Rebuild moved next to the name it acts on, and
// placing an image moved into the toolbox where the other modelling tools live.
{
  console.log("\nheader slots: rebuild by the name, image in the toolbox\n");

  check("rebuild sits in the title, next to the model name",
    /id="panel-title"[\s\S]{0,400}?<button id="refresh-btn"/.test(HTML));
  check("...and is smaller and quieter than the tool run",
    /#panel-title #refresh-btn \{[^}]*font-size: 12px/s.test(HTML));
  const tools = HTML.slice(HTML.indexOf('<div id="editor-tools">'), HTML.indexOf('<div id="tools-menu">'));
  check("...and is no longer duplicated in the tool run",
    !/id="refresh-btn"/.test(tools),
    "two elements with one id is a bug even when it renders");

  check("placing an image is out of the header",
    /<button id="trace-btn" hidden><\/button>/.test(HTML));
  check("...and is offered in the toolbox instead",
    /<button data-act="trace-btn">/.test(HTML));
  check("...with a name and a line saying what it does",
    /<b>Place an image<\/b><small>PNG \/ JPG traced into an outline you can extrude<\/small>/.test(HTML));
  // It is still a real button because the toolbox rows click the real buttons —
  // one implementation per tool, however it is launched.
  check("the file input it drives is still there",
    /<input type="file" id="trace-file"/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
