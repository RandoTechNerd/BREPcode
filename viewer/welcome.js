// The front door.
//
// Two cards, both for people who did not arrive by a share link:
//
//  1. WELCOME, on a first visit. The app used to open on a grey box with a
//     hole in it and a small "Editor" pill, which says nothing about what the
//     tool can do. This says it in one line and offers the four things worth
//     doing first: describe a part, bring an STL, try an example, take the
//     tour. It shows once; any choice (or the x) retires it.
//
//  2. A TOOL CARD, for links like brepcode.com/?tool=texture. An article or a
//     video points at one tool; the visitor lands on that tool, ready to go:
//     drop an STL (or pick a file) and it runs straight away, or try it on the
//     example already on the plate. Generators (Gridfinity, cookie cutters,
//     the parts shelf, the chat) just open.
//
// The app owns everything that touches the model; this module only asks for
// it through the hooks passed in, so it can be read (and changed) on its own.

import { icon } from "./icons.js";

const WELCOMED_KEY = "brepcode-welcomed";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

// Every tool a link can open. `run` is what the app runs on a model:
// a toolbox button id, "wrap:<Edit a part entry>", or "fizz" / "fins" for the
// FizzCore dialog. `kind`: "mesh" wants a model (dropped, or the example);
// "panel" just opens.
export const TOOL_LINKS = {
  fizzcore: { run: "fizz", kind: "mesh", icon: "fizz", title: "FizzCore bubble infill", line: "Fill any STL with graded, printable bubbles: less plastic, still strong." },
  fins: { run: "fins", kind: "mesh", icon: "fins", title: "Support fins for tilted prints", line: "Tilt a part 45° and get snap-off fins that catch it if it teeters." },
  texture: { run: "texture-btn", kind: "mesh", icon: "texture", title: "Surface texture", line: "Knurl, fuzzy skin or bumps on any STL, as real geometry that prints." },
  emboss: { run: "emboss-btn", kind: "mesh", icon: "emboss", title: "Photo emboss / label", line: "Turn an image into relief on any face of a part." },
  qr: { run: "code-qr-btn", kind: "mesh", icon: "qr", title: "QR code on a part", line: "Stamp a scannable QR code onto any face." },
  datamatrix: { run: "code-dm-btn", kind: "mesh", icon: "datamatrix", title: "DataMatrix on a part", line: "Stamp a tiny scannable DataMatrix onto any face." },
  drill: { run: "drill-btn", kind: "mesh", icon: "drill", title: "Drill a hole in an STL", line: "Click a face and bore a hole straight into it." },
  hole: { run: "wrap:add a hole", kind: "mesh", icon: "hole", title: "Add a hole", line: "A hole you place by number, for screws and magnets." },
  stretch: { run: "wrap:split & fill the middle", kind: "mesh", icon: "stretch", title: "Make an STL longer", line: "Split it through the middle and fill the gap with its own shape." },
  narrow: { run: "wrap:cut the middle out (narrow it)", kind: "mesh", icon: "narrow", title: "Make an STL narrower", line: "Take a slab out of the middle and keep both ends intact." },
  "shave-bottom": { run: "wrap:shave off the bottom", kind: "mesh", icon: "shaveBottom", title: "Shave off the bottom", line: "Cut feet, a lip or a brim off flat." },
  thicken: { run: "wrap:thicken walls / rails", kind: "mesh", icon: "thicken", title: "Thicken walls", line: "Fatter rails and walls, same outside size." },
  whisker: { run: "shave-btn", kind: "mesh", icon: "whisker", title: "Shave a whisker", line: "Click a strand and it is cut off at its root." },
  scale: { run: "scale-btn", kind: "mesh", icon: "scale", title: "Scale an STL", line: "By a factor, or to an exact size in mm." },
  rotate: { run: "wrap:rotate / orient", kind: "mesh", icon: "rotate", title: "Rotate / stand it up", line: "Turn a part in X, Y and Z." },
  flip: { run: "wrap:lay flat / flip", kind: "mesh", icon: "flip", title: "Flip it over", line: "Upside down, printable face down." },
  measure: { run: "measure-btn", kind: "mesh", icon: "measure", title: "Measure an STL", line: "Click corners, edges or faces for real numbers." },
  gridfinity: { run: "gfin-row", kind: "panel", icon: "gridfinity", title: "Gridfinity generator", line: "Drag out a bin or a baseplate." },
  "cookie-cutter": { run: "cutter-row", kind: "panel", icon: "cutter", title: "Cookie cutter maker", line: "Search a shape and get a blade, stamp, stencil or roller." },
  parts: { run: "shelf-row", kind: "panel", icon: "shelf", title: "Parts shelf", line: "Hinges, snaps, vents and standoffs, already written." },
  chat: { run: "chat-btn", kind: "panel", icon: "chat", title: "Describe a part", line: "Say what you want and get editable code." },
};

// Examples worth showing off: each one builds in a second or two in the app's
// own language, and shows something a mesh editor cannot do (live text, sizes
// you change by editing one number). A knurled knob was the first pick and
// was dropped from here: a real displaced texture takes 10+ seconds to build,
// which is the wrong first impression. It still ships, for the texture link.
export const EXAMPLES = {
  box: {
    title: "Box with a lid",
    code: `// A box and its lid, side by side. Change the sizes and both follow.
const w = 50, d = 36, h = 24;
const wall = 2, fit = 0.3;
union(
  difference(
    cube([w, d, h]),
    translate([wall, wall, wall], cube([w - 2 * wall, d - 2 * wall, h])),
  ),
  translate([w + 8, 0, 0], union(
    cube([w, d, wall]),
    translate([wall + fit, wall + fit, wall], cube([w - 2 * (wall + fit), d - 2 * (wall + fit), 4])),
  )),
)`,
  },
  knob: {
    title: "Knurled knob",
    code: `// Knurled grip knob: real knurl you can print, a hex nut pocket underneath.
// Change any number and it rebuilds.
const knob_d = 34;
const height = 18;
const nut = 8.2;
texture({ pattern: "knurl", depth: 0.7, scale: 3, faces: "sides" },
  difference(
    cylinder({ r: knob_d / 2, h: height, $fn: 96 }),
    translate([0, 0, -1], cylinder({ r: nut / 2 / Math.cos(Math.PI / 6), h: 7, $fn: 6 })),
    translate([0, 0, -1], cylinder({ r: 2.6, h: height + 2, $fn: 32 })),
  ))`,
  },
  tag: {
    title: "Name tag",
    code: `// Name tag: change the name and it rebuilds.
const name = "RANDO";
const w = 62, h = 20, t = 3;
difference(
  union(
    cube([w, h, t]),
    translate([w / 2 + 4, h / 2, t], text({ text: name, size: 9, height: 1.4 })),
  ),
  translate([6, h / 2, -1], cylinder({ r: 2.5, h: t + 2, $fn: 32 })),
)`,
  },
};

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const css = document.createElement("style");
  css.textContent = `
  .wl-card { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 9000;
    width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto;
    background: var(--card, #121826); color: var(--text, #dfe6f3); border: 1px solid var(--border, #26314a);
    border-radius: 16px; box-shadow: 0 24px 80px rgba(0,0,0,.6); font: 14px/1.5 system-ui, sans-serif; }
  .wl-head { padding: 18px 20px 4px; position: relative; }
  .wl-head h2 { margin: 0; font-size: 21px; line-height: 1.25; padding-right: 28px; }
  .wl-head p { margin: 6px 0 0; color: var(--muted, #8ea0c0); font-size: 13.5px; }
  .wl-x { position: absolute; right: 12px; top: 10px; background: none; border: 0; font-size: 22px; line-height: 1;
    color: var(--muted, #8ea0c0); cursor: pointer; padding: 4px 8px; border-radius: 6px; }
  .wl-x:hover { background: var(--hover, #1a2334); color: var(--text, #fff); }
  .wl-body { padding: 12px 20px 18px; display: flex; flex-direction: column; gap: 8px; }
  .wl-act { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; padding: 11px 13px;
    border-radius: 11px; border: 1px solid var(--border-soft, #1c2437); background: var(--input-bg, #0d1320);
    color: inherit; font: inherit; cursor: pointer; }
  .wl-act:hover, .wl-act:focus-visible { background: var(--hover-strong, #1d2a44); border-color: var(--border-focus, #3a5788); outline: none; }
  .wl-act.hero { border-color: var(--border-focus, #3a5788); }
  .wl-act .ic { width: 28px; flex: none; display: flex; justify-content: center; color: var(--muted6, #93a7c8); }
  .wl-act:hover .ic { color: var(--text, #dfe6f3); }
  .wl-head h2 { display: flex; align-items: center; gap: 10px; }
  .wl-ti { display: inline-flex; color: var(--muted6, #93a7c8); }
  .wl-act b { display: block; font-size: 14px; }
  .wl-act small { display: block; color: var(--muted, #8ea0c0); font-size: 12px; }
  .wl-ex { display: flex; gap: 6px; flex-wrap: wrap; margin: 2px 0 0 40px; }
  .wl-chip { font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text2, #d8e2f5); }
  .wl-chip:hover { background: var(--hover-strong, #1d2a44); }
  .wl-foot { padding: 0 20px 16px; color: var(--muted2, #6f83a6); font-size: 12px; }
  .wl-drop { border: 2px dashed var(--border-focus, #3a5788); border-radius: 12px; padding: 18px; text-align: center;
    color: var(--text2, #d8e2f5); }
  .wl-drop b { font-size: 15px; }
  .wl-drop small { display: block; color: var(--muted, #8ea0c0); margin-top: 4px; }
  .wl-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .wl-btn { flex: 1; min-width: 150px; padding: 10px 12px; border-radius: 10px; cursor: pointer; font: 600 13.5px system-ui;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text, #dfe6f3); }
  .wl-btn.go { border-color: var(--accent, #1c66e5); color: #fff; background: var(--accent, #1c66e5); }
  .wl-btn:hover { background: var(--hover-strong, #1d2a44); }
  .wl-btn.go:hover { background: var(--accent-hover, #2e76f2); }
  /* bottom-left, above the view cube: the one corner the cards and the dock
     never open into, so it never covers a control */
  .wl-next { position: fixed; left: 16px; bottom: 112px; z-index: 8500;
    display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 12px;
    background: var(--card, #121826); border: 1px solid var(--border, #26314a); box-shadow: 0 10px 30px rgba(0,0,0,.45);
    font: 13px system-ui, sans-serif; max-width: calc(100vw - 32px); }
  .wl-nb { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 8px; cursor: pointer; font: 600 13px system-ui;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text, #dfe6f3); white-space: nowrap; }
  .wl-nb:hover { background: var(--hover-strong, #1d2a44); }
  .wl-nb.go { background: var(--accent, #1c66e5); border-color: var(--accent, #1c66e5); color: #fff; }
  .wl-nb.go:hover { background: var(--accent-hover, #2e76f2); }
  .wl-nx { background: none; border: 0; color: var(--muted, #8ea0c0); font-size: 20px; line-height: 1; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
  .wl-nx:hover { background: var(--hover, #1a2334); color: var(--text, #fff); }
  @media (max-width: 520px) { .wl-head h2 { font-size: 18px; } }`;
  document.head.appendChild(css);
}

function card(html, onClose) {
  style();
  const el = document.createElement("div");
  el.className = "wl-card";
  el.setAttribute("role", "dialog");
  el.innerHTML = html;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener("keydown", key, true); onClose?.(); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", key, true);
  el.querySelector(".wl-x")?.addEventListener("click", close);
  return { el, close };
}

export const welcomed = () => lsGet(WELCOMED_KEY) === "1";

/**
 * The first-visit card.
 * hooks: { openChat(), pickFile(), loadExample(code), startTour(), openTool(name) }
 */
export function showWelcome(hooks) {
  const { el, close } = card(`
    <div class="wl-head">
      <h2>Free CAD in your browser</h2>
      <p>Type it, describe it, or drop in an STL and upgrade it. Real solid modelling, no install, no account, and nothing leaves your machine.</p>
      <button class="wl-x" title="Close" aria-label="Close">&times;</button>
    </div>
    <div class="wl-body">
      <button class="wl-act" data-w="chat"><span class="ic">${icon("chat", 20)}</span>
        <span><b>Describe a part</b><small>"a 40 mm phone stand with a cable slot": get code you can edit</small></span></button>
      <button class="wl-act hero" data-w="stl"><span class="ic">${icon("part", 20)}</span>
        <span><b>Fix or upgrade an STL</b><small>drop one anywhere: bubble infill, support fins, texture, QR codes, drill, stretch, thicken…</small></span></button>
      <div class="wl-act" style="cursor:default"><span class="ic">${icon("example", 20)}</span>
        <span><b>Try an example</b><small>a real model, ready to change</small>
        <span class="wl-ex">
          <button class="wl-chip" data-ex="tag">Name tag</button>
          <button class="wl-chip" data-ex="box">Box with a lid</button>
          <button class="wl-chip" data-tool="gridfinity">Gridfinity bin</button>
          <button class="wl-chip" data-tool="cookie-cutter">Cookie cutter</button>
        </span></span></div>
      <button class="wl-act" data-w="tour"><span class="ic">${icon("tour", 20)}</span>
        <span><b>Take the 2-minute tour</b><small>where everything is, and the three languages you can paste</small></span></button>
    </div>
    <div class="wl-foot">Also reads OpenSCAD, JSCAD and build123d. Exports STL, 3MF, STEP, GLB.</div>`,
  () => lsSet(WELCOMED_KEY, "1"));
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-w],[data-ex],[data-tool]");
    if (!b) return;
    close();
    if (b.dataset.w === "chat") hooks.openChat?.();
    if (b.dataset.w === "stl") hooks.pickFile?.();
    if (b.dataset.w === "tour") hooks.startTour?.();
    if (b.dataset.ex) hooks.loadExample?.(EXAMPLES[b.dataset.ex].code, EXAMPLES[b.dataset.ex].title);
    if (b.dataset.tool) hooks.openTool?.(b.dataset.tool);
    // Anything but the tour leaves you in the app with the card gone. A slim
    // bar keeps the way forward (and back) in reach until you close it.
    if (b.dataset.w !== "tour") showNextBar(hooks);
  });
}

// The "what now?" bar after a welcome choice: back to the welcome card, on to
// the tour, or close it. One at a time; the tour or the x retires it.
let nextBar = null;
export function showNextBar(hooks) {
  style();
  nextBar?.remove();
  const bar = document.createElement("div");
  bar.className = "wl-next";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Getting started");
  bar.innerHTML = `
    <button class="wl-nb" data-n="back" title="Back to the start card">${icon("open", 15)}<span>Back</span></button>
    <button class="wl-nb go" data-n="tour" title="Take the 2-minute tour">${icon("tour", 15)}<span>Tour</span></button>
    <button class="wl-nx" data-n="close" title="Close" aria-label="Close">&times;</button>`;
  document.body.appendChild(bar);
  nextBar = bar;
  const done = () => { bar.remove(); if (nextBar === bar) nextBar = null; };
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (!b) return;
    done();
    if (b.dataset.n === "back") showWelcome(hooks);
    if (b.dataset.n === "tour") hooks.startTour?.();
  });
}

/**
 * The card for brepcode.com/?tool=<name>.
 * hooks: { armDrop(spec), pickFile(), runOnCurrent(spec), runPanel(spec) }
 * Returns false for an unknown tool name, so the caller can fall back.
 */
export function showToolCard(name, hooks) {
  const spec = TOOL_LINKS[String(name || "").toLowerCase()];
  if (!spec) return false;
  if (spec.kind === "panel") { hooks.runPanel?.(spec); return true; }
  hooks.armDrop?.(spec);
  const { el, close } = card(`
    <div class="wl-head">
      <h2><span class="wl-ti">${icon(spec.icon, 20)}</span>${esc(spec.title)}</h2>
      <p>${esc(spec.line)}</p>
      <button class="wl-x" title="Close" aria-label="Close">&times;</button>
    </div>
    <div class="wl-body">
      <div class="wl-drop"><b>Drop your STL, 3MF or OBJ anywhere</b><small>it opens straight into ${esc(spec.title.toLowerCase())}</small></div>
      <div class="wl-row">
        <button class="wl-btn go" data-c="file">Choose a file…</button>
        <button class="wl-btn" data-c="example">Try it on the example</button>
      </div>
    </div>
    <div class="wl-foot">Free and private: your file never leaves this browser.</div>`,
  () => hooks.disarmDrop?.());
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    if (b.dataset.c === "file") hooks.pickFile?.();
    if (b.dataset.c === "example") { close(); hooks.runOnCurrent?.(spec); }
  });
  return { close };
}
