// Tutorial mode: a guided walk through the app, then the three pasted
// languages, then something to mark finishing it.
//
// WHY IT IS BUILT THIS WAY
//
// A guided tour is the easiest feature in an app to let rot. It points at
// elements by id, and the day somebody renames a button the tour silently
// starts anchoring popups to nothing — which is worse than not having one,
// because the first thing a new user meets is broken. So:
//
//   - the steps are DATA, exported, and a test asserts every selector they
//     name still exists in viewer/index.html
//   - the language snippets are exported too, and the test BUILDS each one
//     through the real kernel; a tutorial that teaches code which does not
//     compile is worse than no tutorial
//   - the positioning is a pure function of rectangles, so it can be tested at
//     phone sizes without a browser
//
// The driver at the bottom is the only part that touches the DOM.

// ---------------------------------------------------------------- the steps
//
// `sel` is the element the popup points at; null means "centre of the screen",
// used for the opening and closing beats. `open` names a card to reveal first,
// because pointing at a control inside a closed panel teaches nothing.
export const TOUR_STEPS = [
  {
    // The opening beat is the only one anybody chooses to look at, so it is
    // allowed to brag. `hero` gets it the wider card and the bullet list; every
    // other step stays a plain sentence.
    sel: null,
    hero: true,
    title: "This is CAD that lives in a browser tab",
    body: "Real solid modelling — no install, no account, no server. Two minutes and you will know where all of it is.",
    brag: [
      ["Four languages, one kernel", "Write BREPcode, or paste OpenSCAD, JSCAD or build123d. They all compile to the same BREP solids."],
      ["An AI that hands you code", "Describe a part and it writes readable, editable BREPcode with named sizes — not a mesh you can never change again."],
      ["Code and mouse, same model", "Drag a face handle and the number in the source changes. Edit the number and the model moves."],
      ["Straight to the printer", "STL, OBJ, 3MF, GLB and STEP — with a layer preview and supports built in, so you catch a bad part before you slice it."],
      ["Nothing leaves this machine", "Every model, every key, every byte stays local. MIT licensed, and the whole thing fits in a URL you can share."],
    ],
  },
  {
    sel: "#panel",
    open: "panel",
    title: "The editor",
    body: "Type here and the model rebuilds as you go. Sizes are millimetres, angles are degrees, and Z is up. You never press Save — the model IS the text.",
  },
  {
    sel: "#code",
    open: "panel",
    title: "Sloppy typing is fine",
    body: "Leave a bracket open and it still builds — it closes them for you. Press Ctrl+U and it writes the fix back into the editor, so what you read is what is being built.",
  },
  {
    sel: "#stage",
    title: "The model, and its handles",
    body: "Click a shape to select it. Drag a face handle and the NUMBER IN THE CODE changes to match. Code and mouse are two views of one model — use whichever is quicker.",
  },
  {
    sel: "#chat-btn",
    title: "Describe it instead",
    body: "Ask for a part in plain words and it writes BREPcode you can read and edit — not a mesh. Change one const afterwards and it is still your part. Needs an AI key, set in the gear.",
    open: "chat",
  },
  {
    sel: "#cheat-btn",
    title: "Cheat sheet",
    body: "Every command, with an example. Click any entry to drop it straight into the editor. Tabbed by language, so it works whichever one you paste.",
    open: "cheatsheet",
  },
  {
    sel: "#mat-btn",
    title: "Materials and light",
    body: "Colours, finish and lighting for the picture only — geometry and exports are untouched. One to remember: the Filament setting is GLOBAL, so if everything looks see-through, it is set here, not in your code.",
  },
  {
    sel: "#import-btn",
    title: "Bring in a model",
    body: "Drop in an STL, 3MF, OBJ, STEP or SVG — or drag it anywhere on the page. Imported meshes are not dead ends: drill them, stretch them, add support fins.",
  },
  {
    sel: "#export-btn",
    title: "Take it away",
    body: "STL, OBJ, 3MF, GLB or STEP. A 3MF carries your colours as separate filaments AND hides the source code inside, so the file reopens here as editable code months later.",
  },
  {
    sel: "#slicer-btn",
    title: "Slice it here",
    body: "Layer preview, infill, supports and toolpaths without leaving the tab — enough to catch a part that will not print before you commit to it.",
  },
  {
    sel: "#gear-btn",
    title: "Settings",
    body: "AI provider and key, the instructions the assistant follows, your preferences, and email. Keys are stored on this machine and never leave it.",
  },
  {
    sel: "#about-btn",
    title: "And back here",
    body: "Docs, links, and this tour whenever you want it again. Now three quick ones on the other languages you can paste.",
  },
];

// ------------------------------------------------- the three pasted languages
//
// Each of these is REAL code in that language, and the test builds all three.
// Keep them short: the point is "your existing file runs here", not a lesson.
export const LANGUAGE_STEPS = [
  {
    lang: "OpenSCAD",
    title: "Paste OpenSCAD",
    body: "Modules, for loops, $fn — translated to the same kernel everything else uses. Your existing .scad files run without changes.",
    code: `$fn = 48;
module bracket(w = 60, d = 40, t = 8, hole = 5) {
  difference() {
    union() {
      cube([w, d, t]);
      translate([0, 0, t]) cube([t, d, 24]);
    }
    for (x = [12 : 18 : w - 10])
      translate([x, d/2, -1]) cylinder(h = t + 2, r = hole/2);
  }
}
bracket();`,
  },
  {
    lang: "JSCAD",
    title: "Paste JSCAD",
    body: "A real JSCAD module — require, main, module.exports. The primitives and booleans map onto the same kernel.",
    code: `const { primitives, booleans, transforms } = require('@jscad/modeling')
const { cuboid, cylinder } = primitives
const { subtract } = booleans
const { translate } = transforms

const main = () => subtract(
  cuboid({ size: [50, 30, 10], center: [25, 15, 5] }),
  translate([25, 15, 0], cylinder({ radius: 6, height: 12, segments: 48 })),
)
module.exports = { main }`,
  },
  {
    lang: "build123d",
    title: "Paste build123d",
    body: "Python, in ALGEBRA mode — shapes combined with + and -. CadQuery-style scripts are understood too.",
    code: `from build123d import *

part = Box(60, 40, 10) - Cylinder(radius=6, height=12)`,
  },
];

// ------------------------------------------------------------- popup placing
//
// Pure: rectangles in, rectangle out. The whole reason this is separate is that
// the failure mode — a popup half off the bottom of a phone — is invisible on
// a desktop and obvious to the one person it happens to.
export const MARGIN = 10;

export function placePopup(anchor, pop, view, prefer = "auto") {
  // No anchor: dead centre, which is what the opening and closing beats want.
  if (!anchor) {
    return {
      place: "center",
      left: Math.max(MARGIN, (view.width - pop.width) / 2),
      top: Math.max(MARGIN, (view.height - pop.height) / 2),
    };
  }

  const room = {
    bottom: view.height - (anchor.top + anchor.height),
    top: anchor.top,
    right: view.width - (anchor.left + anchor.width),
    left: anchor.left,
  };
  const fits = {
    bottom: room.bottom >= pop.height + MARGIN,
    top: room.top >= pop.height + MARGIN,
    right: room.right >= pop.width + MARGIN,
    left: room.left >= pop.width + MARGIN,
  };

  // Preferred side if it fits, else the side with the most room that does, else
  // whichever has the most room at all — a clamped popup still beats none.
  let place = prefer !== "auto" && fits[prefer] ? prefer : null;
  if (!place) place = ["bottom", "top", "right", "left"].find((s) => fits[s]) || null;
  if (!place) place = Object.keys(room).sort((a, b) => room[b] - room[a])[0];

  let left, top;
  if (place === "bottom" || place === "top") {
    left = anchor.left + anchor.width / 2 - pop.width / 2;
    top = place === "bottom" ? anchor.top + anchor.height + MARGIN : anchor.top - pop.height - MARGIN;
  } else {
    top = anchor.top + anchor.height / 2 - pop.height / 2;
    left = place === "right" ? anchor.left + anchor.width + MARGIN : anchor.left - pop.width - MARGIN;
  }

  // Clamp last, so a popup is never off-screen even when nothing fit.
  left = Math.max(MARGIN, Math.min(left, view.width - pop.width - MARGIN));
  top = Math.max(MARGIN, Math.min(top, view.height - pop.height - MARGIN));
  // A viewport smaller than the popup would push it negative; the floor wins.
  return { place, left: Math.max(0, left), top: Math.max(0, top) };
}

// The whole run, in order, so the driver and the tests agree on the length.
export function tourPlan() {
  return [
    ...TOUR_STEPS,
    // Every language step OPENS the editor first. Without this the sample was
    // pasted into a closed card: the tour said "look at this code" while the
    // panel holding it was not on screen.
    ...LANGUAGE_STEPS.map((l) => ({
      sel: "#code", open: "panel",
      title: l.title, body: l.body, code: l.code, lang: l.lang,
    })),
  ];
}

export const TOUR_DONE_KEY = "brepcode-tour-done";

// ------------------------------------------------------------- the finale
//
// A CAD celebration rather than confetti: the primitives the app is made of,
// thrown out of the middle and tumbling, with dimension lines snapping onto
// them and a tolerance callout. Pure SVG so it costs nothing and cannot fail
// the way a kernel build can.
export function celebrationSvg({ width = 800, height = 500, count = 14 } = {}) {
  const cx = width / 2, cy = height / 2;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.3;
    const dist = Math.min(width, height) * (0.30 + 0.16 * ((i * 7) % 5) / 4);
    const x = cx + Math.cos(a) * dist, y = cy + Math.sin(a) * dist;
    const s = 13 + ((i * 5) % 4) * 5;
    const spin = ((i % 2) ? 1 : -1) * (160 + (i % 3) * 70);
    const kind = i % 4;
    let shape;
    if (kind === 0) {
      // a wireframe cube, drawn as a front face, a back face and four struts
      const o = s * 0.42;
      shape = `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}"/>
        <rect x="${-s / 2 + o}" y="${-s / 2 - o}" width="${s}" height="${s}"/>
        <path d="M${-s / 2} ${-s / 2}l${o} ${-o}M${s / 2} ${-s / 2}l${o} ${-o}M${s / 2} ${s / 2}l${o} ${-o}M${-s / 2} ${s / 2}l${o} ${-o}"/>`;
    } else if (kind === 1) {
      // a cylinder: two ellipses and the silhouette
      shape = `<ellipse cx="0" cy="${-s / 2}" rx="${s / 2}" ry="${s / 5}"/>
        <ellipse cx="0" cy="${s / 2}" rx="${s / 2}" ry="${s / 5}"/>
        <path d="M${-s / 2} ${-s / 2}v${s}M${s / 2} ${-s / 2}v${s}"/>`;
    } else if (kind === 2) {
      // a sphere: outline plus two great circles, which is how you draw one
      shape = `<circle cx="0" cy="0" r="${s / 2}"/>
        <ellipse cx="0" cy="0" rx="${s / 2}" ry="${s / 5}"/>
        <ellipse cx="0" cy="0" rx="${s / 5}" ry="${s / 2}"/>`;
    } else {
      shape = `<circle cx="0" cy="0" r="${s / 2}"/><circle cx="0" cy="0" r="${s / 4}"/>`;
    }
    parts.push(
      `<g class="bc-cel-p" style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;` +
      `--spin:${spin}deg;--d:${(i * 55)}ms">` +
      `<g transform="translate(${cx} ${cy})"><g class="bc-cel-s">${shape}</g></g></g>`,
    );
  }
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%"
     preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g fill="none" stroke="#7fd4ff" stroke-width="1.6" stroke-linejoin="round">${parts.join("")}</g>
  </svg>`;
}

// ================================================================ the driver
//
// Everything above is data and arithmetic. This is the only part that needs a
// document, and it is the thinnest layer that will do the job.
//
// The styles are injected from here rather than living in index.html, so the
// whole feature is one lazily-loaded file: nobody who never opens the tour
// pays for any of it.

const CSS = `
.bc-tour-spot{position:fixed;z-index:9000;border-radius:10px;pointer-events:none;
  box-shadow:0 0 0 9999px rgba(4,7,12,.62),0 0 0 2px #7fd4ff inset;
  transition:all .28s cubic-bezier(.4,0,.2,1)}
/* A capped height with its own scroll, because the hero card is taller than a
   laptop's spare vertical space and a popup whose Next button is below the
   fold is a dead end. The row below is sticky, so the way forward is on screen
   whatever the content does. */
.bc-tour-pop{position:fixed;z-index:9001;width:min(330px,calc(100vw - 24px));
  max-height:calc(100vh - 20px);overflow-y:auto;overscroll-behavior:contain;
  background:#141a24;color:#e8eef6;border:1px solid #2b3746;border-radius:12px;
  padding:14px 15px 12px;box-shadow:0 18px 50px rgba(0,0,0,.55);
  font:13.5px/1.5 system-ui,sans-serif;transition:left .28s,top .28s}
.bc-tour-pop h4{margin:0 0 6px;font-size:14.5px;color:#fff}
.bc-tour-pop p{margin:0 0 11px;opacity:.9}
/* the opening card: wider, and allowed to make a case */
.bc-tour-pop.hero{width:min(470px,calc(100vw - 24px));padding:18px 20px 14px}
.bc-tour-pop.hero h4{font-size:19px;line-height:1.3;margin-bottom:8px}
.bc-tour-pop.hero p{margin-bottom:13px}
.bc-tour-brag{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:11px}
.bc-tour-brag li{display:grid;grid-template-columns:26px 1fr;gap:9px;align-items:start;
  font-size:12.8px;line-height:1.45;opacity:.88}
/* the bullet is the app's own build cube, shrunk. --bc is the size knob the
   cube was already built with, so this is the same object as the one that
   spins in the status bar, not a picture of it. */
.bc-tour-brag .bcube-wrap{--bc:22;margin-top:1px}

/* ---- they assemble one after another, and then stay ----
   Each row fades in on its own beat, and its cube runs the build once: the
   laser draws it, the faces pop out, it turns a full revolution — and then it
   STOPS, assembled.
   Freezing is done by pausing the animation at 75% of the cycle, because that
   is where the original choreography holds the finished isometric box (faces
   out, laser gone) before flattening it again at 85%. Pausing rather than
   ending means the design's own keyframes are reused untouched; and the
   iteration count stays infinite on purpose, so if the pause is ever missed —
   a backgrounded tab, a throttled timer — the cubes simply keep spinning,
   which is what they do everywhere else in the app. */
.bc-tour-brag li{opacity:0;animation:bc-tour-in .42s ease both;animation-delay:var(--in,0s)}
@keyframes bc-tour-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
.bc-tour-brag .bcube,
.bc-tour-brag .bcube .face,
.bc-tour-brag .bcube .laser{animation-duration:2.6s;animation-delay:var(--in,0s)}
.bc-tour-brag li.settled .bcube,
.bc-tour-brag li.settled .bcube .face,
.bc-tour-brag li.settled .bcube .laser{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){
  .bc-tour-brag li{opacity:1;animation:none}
  .bc-tour-brag .bcube,.bc-tour-brag .bcube .face,.bc-tour-brag .bcube .laser{
    animation-delay:-1.95s;animation-play-state:paused}}
/* fallback for a caller that did not hand us the cube factory */
.bc-tour-brag li.plain{grid-template-columns:19px 1fr}
.bc-tour-brag li.plain .bc-dot{width:9px;height:9px;margin-top:5px;
  border:1.5px solid #7fd4ff;border-radius:2px;transform:rotate(45deg)}
.bc-tour-brag b{display:block;color:#fff;font-weight:600;opacity:1;margin-bottom:1px}
/* ---- branding on the opening card ---- */
.bc-tour-brand{display:flex;align-items:center;gap:9px;margin:0 0 12px;
  padding-bottom:11px;border-bottom:1px solid #26313f}
.bc-tour-mark{width:26px;height:26px;flex:none;border-radius:5px}
.bc-tour-word{font-weight:700;font-size:15px;color:#fff;letter-spacing:.01em}
.bc-tour-word span{font-weight:400;color:#7fd4ff}
.bc-tour-tag{margin-left:auto;font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;
  color:#7fd4ff;opacity:.85;border:1px solid rgba(127,212,255,.32);
  border-radius:999px;padding:3px 9px;white-space:nowrap}
.bc-tour-row{display:flex;gap:7px;align-items:center;position:sticky;bottom:0;
  background:#141a24;margin:0 -15px -12px;padding:9px 15px 12px}
.bc-tour-pop button{font:inherit;border-radius:7px;padding:5px 11px;cursor:pointer;
  border:1px solid #33465c;background:#1d2634;color:#dbe6f2}
.bc-tour-pop button:hover{background:#263244}
.bc-tour-pop button:disabled{opacity:.4;cursor:default}
.bc-tour-pop button.pri{background:#2f6fd0;border-color:#3f83e8;color:#fff}
.bc-tour-pop button.pri:hover{background:#3a7ee0}
.bc-tour-count{margin-left:auto;opacity:.55;font-size:11.5px;letter-spacing:.03em}
.bc-tour-skip{background:none;border:none;opacity:.6;padding:5px 4px}
.bc-cel{position:fixed;inset:0;z-index:9500;display:grid;place-items:center;
  background:radial-gradient(circle at 50% 45%,rgba(20,40,66,.86),rgba(4,7,12,.94));
  cursor:pointer;animation:bc-cel-in .4s ease}
@keyframes bc-cel-in{from{opacity:0}to{opacity:1}}
.bc-cel-svg{position:absolute;inset:0}
.bc-cel-p{animation:bc-cel-fly 2.6s cubic-bezier(.14,.7,.3,1) both;animation-delay:var(--d)}
.bc-cel-s{animation:bc-cel-spin 2.6s linear both;animation-delay:var(--d)}
@keyframes bc-cel-fly{from{transform:translate(0,0) scale(.2);opacity:0}
  35%{opacity:1}to{transform:translate(calc(var(--x) - 50vw),calc(var(--y) - 50vh)) scale(1);opacity:.85}}
@keyframes bc-cel-spin{to{transform:rotate(var(--spin))}}
/* The caption gets its OWN panel. Without it the tumbling primitives pass
   straight over the words — readable by luck, and only until a shape lands
   badly. Text sits inside something, with padding, and nothing crosses it. */
.bc-cel-mid{position:relative;text-align:center;color:#eaf3ff;
  font:600 15px/1.6 system-ui,sans-serif;padding:26px 34px;pointer-events:none;
  background:rgba(10,16,26,.82);border:1px solid rgba(127,212,255,.28);
  border-radius:14px;backdrop-filter:blur(3px);max-width:min(90vw,520px)}
.bc-cel-mid b{display:block;font-size:30px;letter-spacing:.02em;margin-bottom:4px}
.bc-cel-mid .tol{font:11.5px ui-monospace,monospace;opacity:.6;letter-spacing:.08em}
.bc-cel-mid .go{margin-top:14px;opacity:.65;font-weight:400;font-size:12.5px}
@media (prefers-reduced-motion:reduce){
  .bc-tour-spot{transition:none}.bc-cel-p,.bc-cel-s{animation-duration:.01ms}}
`;

function styles(doc) {
  if (doc.getElementById("bc-tour-css")) return;
  const s = doc.createElement("style");
  s.id = "bc-tour-css";
  s.textContent = CSS;
  doc.head.appendChild(s);
}

// The finale. Click, key or wait — it never traps anyone behind it.
export function celebrate({ doc = document, onClose } = {}) {
  styles(doc);
  const wrap = doc.createElement("div");
  wrap.className = "bc-cel";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Tutorial complete");
  wrap.innerHTML =
    `<div class="bc-cel-svg">${celebrationSvg({
      width: Math.max(320, doc.documentElement.clientWidth || 800),
      height: Math.max(320, doc.documentElement.clientHeight || 500),
    })}</div>
     <div class="bc-cel-mid">
       <b>BUILD COMPLETE</b>
       You know your way around now — go make something.
       <div class="tol">TOL &plusmn;0.00 mm &middot; 1 PART &middot; 0 ERRORS</div>
       <div class="go">click anywhere to close</div>
     </div>`;
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.remove();
    doc.removeEventListener("keydown", onKey, true);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); }
  };
  wrap.addEventListener("click", close);
  doc.addEventListener("keydown", onKey, true);
  doc.body.appendChild(wrap);
  setTimeout(close, 9000);
  return close;
}

// startTour({ setCode, openCard }) -> stop()
//
// setCode is how the language steps demonstrate anything; openCard reveals a
// panel before a step points inside it. Both are optional — without them the
// tour still runs, it just explains rather than shows.
export function startTour({
  doc = document, setCode, openCard, onFinish,
  cubeHTML,                       // the app's build-cube factory, for the bullets
  brandMark = "favicon.svg",      // the product mark, next to the wordmark
} = {}) {
  styles(doc);
  const plan = tourPlan();
  let i = 0;

  // The bullet sequence. CUBE_CYCLE must match the animation-duration the CSS
  // above sets for .bc-tour-brag cubes, and 0.75 of it is where the design
  // holds the assembled box — see the note there.
  const STAGGER = 0.55, CUBE_CYCLE = 2.6;
  let settleTimers = [];
  const clearSettle = () => { settleTimers.forEach(clearTimeout); settleTimers = []; };

  const spot = doc.createElement("div");
  spot.className = "bc-tour-spot";
  const pop = doc.createElement("div");
  pop.className = "bc-tour-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-live", "polite");
  doc.body.append(spot, pop);

  function stop(done) {
    clearSettle();
    spot.remove(); pop.remove();
    removeEventListener("resize", place);
    doc.removeEventListener("keydown", onKey, true);
    if (done) {
      try { localStorage.setItem(TOUR_DONE_KEY, new Date().toISOString()); } catch { /* private window */ }
      celebrate({ doc, onClose: onFinish });
    } else onFinish?.();
  }

  function target() {
    const s = plan[i].sel;
    if (!s) return null;
    const el = doc.querySelector(s);
    if (!el) return null;
    // An element that exists but is not laid out — a closed card — counts as no
    // anchor, rather than a zero-size spotlight stuck in the top-left corner.
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 ? r : null;
  }

  function place() {
    const r = target();
    const view = {
      width: doc.documentElement.clientWidth,
      height: doc.documentElement.clientHeight,
    };
    if (r) {
      Object.assign(spot.style, {
        left: (r.left - 5) + "px", top: (r.top - 5) + "px",
        width: (r.width + 10) + "px", height: (r.height + 10) + "px",
      });
    } else {
      // nothing to point at: dim the page, highlight none of it
      Object.assign(spot.style, {
        left: "50%", top: "50%", width: "0px", height: "0px",
      });
    }
    const p = pop.getBoundingClientRect();
    const at = placePopup(r, { width: p.width || 330, height: p.height || 170 }, view);
    pop.style.left = at.left + "px";
    pop.style.top = at.top + "px";
  }

  function render() {
    const s = plan[i];
    // Leaving a step throws away its rows; any freeze still pending would be
    // holding a reference to an element that is no longer on the page.
    clearSettle();
    if (s.open) openCard?.(s.open);
    pop.innerHTML =
      `<h4></h4><p></p>
       <div class="bc-tour-row">
         <button class="bc-tour-back">Back</button>
         <button class="pri bc-tour-next"></button>
         <button class="bc-tour-skip">Skip</button>
         <span class="bc-tour-count"></span>
       </div>`;
    pop.classList.toggle("hero", !!s.hero);
    pop.querySelector("h4").textContent = s.title;
    pop.querySelector("p").textContent = s.body;

    // The opening card wears the brand: the product mark, the wordmark, and a
    // chip saying what this is. Everything after it is plain, because a badge
    // on every step would be noise.
    if (s.hero) {
      const brand = doc.createElement("div");
      brand.className = "bc-tour-brand";
      const mark = doc.createElement("img");
      mark.className = "bc-tour-mark";
      mark.src = brandMark;            // relative — same folder as the page
      mark.alt = "";
      const word = doc.createElement("div");
      word.className = "bc-tour-word";
      word.append("BREP", Object.assign(doc.createElement("span"), { textContent: "code" }));
      const tag = doc.createElement("div");
      tag.className = "bc-tour-tag";
      tag.textContent = "Guided tour";
      brand.append(mark, word, tag);
      pop.prepend(brand);
    }

    // The brag list is built from data with textContent, not pasted in as
    // markup — the copy is ours today and there is no reason to leave an
    // innerHTML path open for whatever ends up in here later.
    if (s.brag?.length) {
      const ul = doc.createElement("ul");
      ul.className = "bc-tour-brag";
      let idx = 0;
      for (const [head, detail] of s.brag) {
        const li = doc.createElement("li");
        // Its beat in the sequence: the row fades in, its cube builds, and a
        // timer freezes it assembled three quarters of the way through.
        const startAt = idx * STAGGER;
        li.style.setProperty("--in", startAt + "s");
        settleTimers.push(setTimeout(
          () => li.classList.add("settled"),
          (startAt + CUBE_CYCLE * 0.75) * 1000,
        ));
        idx++;
        // The bullet is the real build cube when the host hands us its
        // factory, so there is one definition of that object in the app.
        if (cubeHTML) {
          const slot = doc.createElement("span");
          slot.innerHTML = cubeHTML();
          li.appendChild(slot.firstElementChild);
        } else {
          li.classList.add("plain");
          li.appendChild(Object.assign(doc.createElement("span"), { className: "bc-dot" }));
        }
        const txt = doc.createElement("div");
        const b = doc.createElement("b");
        b.textContent = head;
        txt.append(b, doc.createTextNode(detail));
        li.appendChild(txt);
        ul.appendChild(li);
      }
      pop.querySelector("p").after(ul);
    }
    pop.querySelector(".bc-tour-count").textContent = `${i + 1} / ${plan.length}`;
    pop.querySelector(".bc-tour-next").textContent = i === plan.length - 1 ? "Finish" : "Next";
    pop.querySelector(".bc-tour-back").disabled = i === 0;
    pop.querySelector(".bc-tour-next").onclick = () => go(1);
    pop.querySelector(".bc-tour-back").onclick = () => go(-1);
    pop.querySelector(".bc-tour-skip").onclick = () => stop(false);
    // A language step puts its code in the editor, so the sentence and the
    // thing on screen are about each other.
    if (s.code) setCode?.(s.code);
    place();
    // one more pass once the browser has laid the popup out at its real size
    requestAnimationFrame(place);
  }

  function go(d) {
    const next = i + d;
    if (next < 0) return;
    if (next >= plan.length) { stop(true); return; }
    i = next;
    render();
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); stop(false); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  }

  doc.addEventListener("keydown", onKey, true);
  addEventListener("resize", place);
  render();
  return () => stop(false);
}
