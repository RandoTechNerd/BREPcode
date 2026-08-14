// The window that would not show all the way down.
//
// On a phone the cheat sheet showed a 325px porthole into a 2934px list, in a
// card using 477px of the 780px it was allowed. Nothing was broken in the
// scrolling sense — you COULD reach the end — but nine tenths of the list was
// hidden behind a scrollbar with empty screen underneath, which is what "it
// doesn't show all the way down" means to the person holding the phone.
//
// The cause was a stack of caps, each individually reasonable:
//
//   #cheat-body            max-height: min(46vh, 430px)   the desktop default
//   @media <=700 or short  max-height: min(38dvh, 360px)  "phones"
//   @media <=400           max-height: min(40dvh, 340px)  "folded phones"
//
// They exist so several windows can SHARE the dock column: the dock scrolls
// between them, and one window taking the whole screen would mean scrolling a
// phone-length page to reach the second. That reasoning is sound — and it only
// applies when there IS a second window. With one open there is nothing to
// share with, and a fraction of the screen is simply a smaller window.
//
// So the caps became conditional on #dock.multi, which the viewer sets from
// toggleCard. This file checks the rule did not get half-applied — a cap left
// unconditional anywhere puts the porthole back, and a panel added later with
// its own vh cap brings it back for that panel only, which is worse because
// nobody would think to look.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const html = readFileSync("viewer/index.html", "utf8");
// The <style> block only — matching CSS text against the whole file would also
// hit the inline module's strings. Comments come out too: a "selector" read as
// everything since the last brace otherwise swallows the comment above it, and
// a rule preceded by an explanation stops matching its own name.
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\none window on a small screen gets the small screen\n");
{
  check("the dock is told when its column is shared",
    /\$\("dock"\)\.classList\.toggle\("multi"/.test(html),
    "markDockShared is what every rule below keys on");
  // These used to pin the exact adjacency — `markDockShared()` on the line
  // after the class change. That broke when the window code was reworked even
  // though the behaviour was intact, and one of the three sites it counted has
  // legitimately gone: expanding a window no longer floats it first, because
  // .card.expanded overrides position outright and floating it was the bug
  // that lost your placement. So assert the rule instead of the layout —
  // every routine that changes who is IN the column must re-count it.
  const fnBody = (name, end) => {
    const at = html.indexOf(name);
    return at < 0 ? "" : html.slice(at, end ? html.indexOf(end, at) : at + 2000);
  };
  check("...from toggleCard, so opening or closing anything re-counts",
    /markDockShared\(\)/.test(fnBody("function toggleCard(card, btn, on)", "function markDockShared")));
  // A card dragged out of the column stops competing for its height, and a
  // card snapped back starts again. Both change the count.
  const changesFloating = [
    ["dragged out of the column", fnBody('headerEl.addEventListener("pointerdown"', "headerEl.addEventListener(\"dblclick\"")],
    ["rescued from off-screen", fnBody("function ensureCardVisible(card)", "\n    }\n")],
    ["snapped back into it", fnBody("function redockCard(card)", "\n    }\n")],
    ["restored from fullscreen", fnBody("function toggleExpand(card)", "function redockCard")],
  ];
  for (const [what, body] of changesFloating) {
    check(`...when a window is ${what}`,
      body.includes("markDockShared()"), body ? "no markDockShared in that routine" : "routine not found");
  }
  check("floating windows are excluded from the count",
    /\.card\.open:not\(\.floating\)/.test(html),
    "a window dragged onto the model is not sharing the column");
}

console.log("\nno fractional cap survives unconditionally on a phone\n");
{
  // Pull the small-screen media blocks out and read every max-height in them.
  const blocks = [];
  const re = /@media\s+([^{]*(?:max-width:\s*(?:400|700)px|max-height:\s*(?:460|520)px)[^{]*)\{/g;
  let m;
  while ((m = re.exec(css))) {
    // walk braces to the end of this block
    let depth = 1, i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    blocks.push({ cond: m[1].trim(), body: css.slice(re.lastIndex, i - 1) });
  }
  check("the small-screen blocks were found", blocks.length >= 3, `${blocks.length}`);

  const offenders = [];
  for (const b of blocks) {
    // every rule in the block that caps a height by a viewport fraction
    const rules = [...b.body.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const [, sel, decl] of rules) {
      if (!/max-height:\s*[^;]*d?vh/.test(decl)) continue;
      if (/max-height:\s*none/.test(decl)) continue;
      // The dock and the card itself are the FRAME — those caps are what keep a
      // window on the screen at all and are meant to be unconditional. It is
      // the scrolling contents that must not be pre-shrunk.
      if (/^\s*(#dock|\.card)\s*$/.test(sel)) continue;
      // ...must only apply while the column is shared
      if (!/#dock\.multi/.test(sel)) offenders.push(`${sel.trim()} {${decl.trim()}}`);
    }
  }
  check("every viewport-fraction cap is conditional on a shared column",
    offenders.length === 0, offenders.join(" | "));
}

console.log("\nand the desktop defaults are released, not merely overridden once\n");
{
  // The base stylesheet caps a dozen panels for the desktop side-column. The
  // first attempt at this fix scoped only the media-query caps and left the
  // base #cheat-body rule capping the body at 46vh — the card grew, the list
  // did not, and the bug was still there at 374px instead of 325px.
  const capped = new Set();
  for (const [, sel, decl] of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    if (!/max-height:\s*[^;]*d?vh/.test(decl)) continue;
    if (/max-height:\s*none/.test(decl)) continue;
    for (const one of sel.split(",")) {
      const id = /#([\w-]+)/.exec(one.trim());
      // only the scrolling BODIES of windows matter here
      if (id && /-body$|-msgs$|-grid$|-list$/.test(id[1])) capped.add("#" + id[1]);
    }
  }
  check("panels with a viewport cap were found", capped.size >= 6, [...capped].join(", "));

  const release = /#dock:not\(\.multi\)([\s\S]*?)\{\s*max-height:\s*none/.exec(css);
  check("there is a release rule for the single-window case", !!release);
  const released = new Set((release?.[0] || "").match(/#[\w-]+/g) || []);
  // #exp-list is the export dialog's format column, which lives in a modal
  // rather than the dock — a different container with its own two-pane layout,
  // so #dock:not(.multi) does not and should not reach it.
  const missed = [...capped].filter((id) => id !== "#exp-list" && !released.has(id));
  check("every capped panel is released when it is the only window",
    missed.length === 0, `still capped: ${missed.join(", ")}`);
}

console.log("\nthe window that grows must not grow under the pill row\n");
{
  // #buttons is sticky at the bottom of the dock and has no background, so
  // anything scrolling beneath it shows straight through. Letting a card take
  // the full 100dvh - 32px put its last inch behind the pills.
  const mobile = /@media \(max-width: 700px\), \(max-height: 520px\) \{([\s\S]*?)\n    \}/.exec(css);
  check("the phone block caps the card below the full viewport",
    !!mobile && /\.card\s*\{\s*max-height:\s*calc\(100dvh - (\d+)px\)/.test(mobile[1]),
    "otherwise the pill row floats over the card's own footer");
  const px = +(/\.card\s*\{\s*max-height:\s*calc\(100dvh - (\d+)px\)/.exec(mobile?.[1] || "")?.[1] || 0);
  // dock inset (20) + gap (10) + pill row (42) = 72
  check("...by enough for the dock inset, the gap and the pills", px >= 72, `${px}px`);
}

console.log("\nthe editor's option row, after the sentence came out of it\n");
{
  check("the auto-close sentence is gone",
    !/<span class="why">/.test(html) && !/#opts \.why/.test(css),
    "it spent 96px explaining a checkbox that has a tooltip");
  check("...replaced by a glyph", /id="autoclose"[^>]*>\{\}</.test(html));
  check("...which still says what it means on hover",
    /id="autoclose"[^>]*title="Auto-close brackets and quotes/.test(html));
  check("...and dims when Exact turns it off",
    /classList\.toggle\("off", \$\("exact"\)\.checked\)/.test(html));

  // The translated-from note now shrinks instead of pushing the buttons off
  // the right edge, which means it can be clipped, which means it needs its
  // full text somewhere.
  check("the translation note ellipsises rather than shoving the controls",
    /#fixnote\s*\{[^}]*text-overflow:\s*ellipsis/.test(css));
  check("...and carries its full text as a tooltip",
    /fixnote\.title = fixnote\.textContent/.test(html));
  check("...cleared with it, so a stale one cannot linger",
    /fixnote\.textContent = ""; fixnote\.title = ""/.test(html));

  check("there is exactly one Parameters button",
    (html.match(/id="params-btn"/g) || []).length === 1
    && !/params2-btn/.test(html));
  check("...in the option row with the other state buttons",
    /#anchor-btn, #neg-btn, #mat-btn, #params-btn \{/.test(css));
  check("...lit only when the model has dimensions to turn",
    /#params-btn\.has \{/.test(css)
    && /paramsBtn\.classList\.toggle\("has", list\.length > 0\)/.test(html));
  check("...and that light is kept whether or not the panel is open",
    // the early-return for a closed card must come AFTER the button is painted
    html.indexOf('paramsBtn.classList.toggle("has"')
      < html.indexOf('if (!paramsCard.classList.contains("open")) return;'),
    "otherwise the button only lights once you have already found the panel");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
