// The quick door: brepcode.com/make.
//
// For someone who has never touched CAD and does not want to. The logo, the
// loading cube, one question ("What do you want to build?") and a box to type
// in. Nothing else on the first screen: no editor, no toolbar, no settings.
// A single button underneath, "What can I make?", unfolds the rest (real
// requests to tap, the three steps, the ways out). Submitting fades the
// cover away, opens the chat with their words already sent, and leaves the
// chat open so the next sentence ("wider", "for a Pixel 9", "round the
// edges") changes the model.
//
// It is an OVERLAY inside the app, not a separate page, on purpose: the
// geometry kernel (several MB of WebAssembly) downloads while they type, so
// the first model appears sooner, and nothing reloads between the question
// and the answer. The static /make/ folder the site build writes is a bounce
// to ?make=1, the same way /tour bounces to ?tour=1.
//
// The app owns everything that touches the model; this module asks for it
// through the hooks passed to showMake(), so it can be read on its own.

import { icon } from "./icons.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Does this address ask for the quick door? ?make=1 is what the /make bounce
// sends, #make is for a link pasted by hand, and /make is the tidy path for a
// host that rewrites instead of bouncing. /m/make is a MODEL address that
// happens to end in the same word, and is not ours.
export function isMakeUrl({ search = "", hash = "", pathname = "" } = {}) {
  return /[?&]make=1(&|$)/.test(search)
    || /^#make$/i.test(hash)
    || (/(^|\/)make\/?(index\.html)?$/i.test(pathname) && !/(^|\/)m\/make\/?$/i.test(pathname));
}

// Strip the "I want" off a catalog example so it reads as a chip: the
// matcher drops those words anyway, so the chip still routes exactly as the
// example it came from.
export function chipText(example) {
  return String(example).trim()
    .replace(/^(?:please\s+)?(?:i\s+(?:want|need|would like)|make\s+me|make|build\s+me|build|give\s+me|design\s+me|design|print\s+me|print|can\s+you\s+make\s+me|can\s+you\s+make)\s+/i, "")
    .replace(/\s+please\.?$/i, "")
    .replace(/[.!]+$/, "")
    .trim();
}

// Eight real requests, one per category, different every visit. Every one is
// a family's own tested example, so each chip is a request the catalog is
// known to answer. `families` is the catalog's FAMILIES array.
export function pickExamples(families, { count = 8, random = Math.random } = {}) {
  const byCat = new Map();
  for (const f of families || []) {
    if (!f?.examples?.length) continue;
    const list = byCat.get(f.category) || [];
    list.push(f);
    byCat.set(f.category, list);
  }
  const cats = [...byCat.keys()];
  for (let i = cats.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cats[i], cats[j]] = [cats[j], cats[i]]; }
  const out = [];
  for (const c of cats) {
    const fams = byCat.get(c);
    const f = fams[Math.floor(random() * fams.length)];
    // the shortest example reads best as a chip
    const ex = [...f.examples].map(chipText).filter((t) => t.length >= 6 && t.length <= 42).sort((a, b) => a.length - b.length)[0];
    if (ex && !out.includes(ex)) out.push(ex);
    if (out.length >= count) break;
  }
  return out;
}

// What the chips say if the catalog cannot be read (offline, a broken build):
// still real catalog requests, just not fresh ones.
export const FALLBACK_EXAMPLES = [
  "a phone stand", "a hook for my yoga mat", "a small wall shelf", "a cable clip for 3 cables",
  "a pen holder", "a plant pot with a saucer", "a storage box with a lid", "a bag clip",
];

export const PLACEHOLDER = "a phone stand for my iPhone 16";

// The host page's stand-in for the door, when we are framed by one on the
// same origin. Null everywhere else (no frame, another origin, no cover).
function hostCover() {
  try { return window.parent !== window ? window.parent.document.getElementById("mkc") : null; } catch { return null; }
}

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const css = document.createElement("style");
  css.textContent = `
  #mk { position: fixed; inset: 0; z-index: 9600; overflow: auto; -webkit-overflow-scrolling: touch;
    background: var(--bg, #0b0f16); color: var(--text, #dfe6f3);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    display: grid; place-items: center; padding: 24px 16px;
    transition: opacity .35s ease, transform .35s ease; }
  #mk.gone { opacity: 0; transform: scale(1.03); pointer-events: none; }
  .mk-wrap { width: 100%; max-width: 600px; position: relative; display: flex; flex-direction: column; align-items: stretch; }
  .mk-brand { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--muted, #8ea0c0);
    font-weight: 600; letter-spacing: .01em; margin-bottom: 10px; }
  .mk-brand .ic { display: inline-flex; color: var(--muted6, #93a7c8); }
  .mk-stage { position: relative; height: 160px; display: grid; place-items: center; margin: 0 0 4px; }
  .mk-glow { position: absolute; left: 50%; top: 50%; width: 300px; height: 300px; border-radius: 50%;
    transform: translate(-50%, -50%); pointer-events: none;
    background: conic-gradient(from var(--brc-spin),
      #ff4d4d, #ffb020, #ffe94d, #49d17a, #35c6e8, #6f7bff, #c86bff, #ff4d4d);
    filter: blur(56px); opacity: .34; animation: brc-spin 5.5s linear infinite; }
  @supports not (background: conic-gradient(from var(--brc-spin), red, blue)) {
    .mk-glow { background: conic-gradient(#ff4d4d, #ffb020, #ffe94d, #49d17a, #35c6e8, #6f7bff, #c86bff, #ff4d4d);
      animation: brc-spin-fallback 5.5s linear infinite; }
  }
  .mk-cube { position: relative; z-index: 1; }
  .mk-cube .bcube-wrap { --bc: 116; }
  /* one quiet line while the kernel is still arriving; gone once it has */
  .mk-status { position: relative; z-index: 1; text-align: center; color: var(--muted2, #6f83a6); font-size: 12px;
    min-height: 18px; margin: 0 0 10px; letter-spacing: .02em; opacity: .8; transition: opacity .4s ease; }
  .mk-status.ready { opacity: 0; }
  .mk-wrap h1 { font-size: clamp(26px, 5.6vw, 38px); line-height: 1.15; margin: 0 0 16px; letter-spacing: -0.02em; text-align: center; }
  .mk-form { display: flex; gap: 8px; background: var(--card, #121826); border: 1px solid var(--border, #26314a);
    border-radius: 16px; padding: 8px; box-shadow: 0 18px 60px rgba(0,0,0,.35); }
  .mk-form:focus-within { border-color: var(--border-focus, #3a5788); }
  .mk-form input { flex: 1 1 auto; min-width: 0; border: 0; outline: none; background: transparent; color: var(--text, #dfe6f3);
    font: inherit; font-size: 17px; padding: 10px 12px; }
  /* the example in the box is plainly an example: well short of the text colour */
  .mk-form input::placeholder { color: var(--muted2, #6f83a6); opacity: .55; }
  .mk-go { flex: none; border: 0; border-radius: 12px; background: var(--accent, #1c66e5); color: #fff;
    font: 600 15px system-ui, sans-serif; padding: 0 20px; cursor: pointer; }
  .mk-go:hover { background: var(--accent-hover, #2e76f2); }
  /* the one way to see more: a plain button, centred, that unfolds the rest */
  .mk-more { align-self: center; margin: 18px 0 0; background: none; border: 1px solid transparent; border-radius: 999px;
    padding: 7px 14px; font: 14px system-ui, sans-serif; color: var(--muted, #8ea0c0); cursor: pointer;
    display: inline-flex; align-items: center; gap: 7px; }
  .mk-more:hover, .mk-more:focus-visible { color: var(--text, #dfe6f3); border-color: var(--border, #26314a); outline: none; }
  .mk-more .chev { display: inline-block; transition: transform .2s ease; }
  .mk-more[aria-expanded="true"] .chev { transform: rotate(180deg); }
  .mk-extra { margin-top: 16px; }
  .mk-extra[hidden] { display: none; }
  .mk-sub { color: var(--muted, #8ea0c0); margin: 0 0 12px; text-align: center; font-size: 14px; }
  .mk-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 0 0 18px; min-height: 34px; }
  .mk-chip { border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text2, #d8e2f5);
    border-radius: 999px; padding: 7px 13px; font: 13.5px system-ui, sans-serif; cursor: pointer; }
  .mk-chip:hover, .mk-chip:focus-visible { border-color: var(--accent, #1c66e5); background: var(--hover-strong, #1d2a44); outline: none; }
  .mk-how { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
  .mk-how div { background: var(--card, #121826); border: 1px solid var(--border-soft, #1c2437); border-radius: 12px;
    padding: 10px 12px; font-size: 13px; color: var(--muted, #8ea0c0); }
  .mk-how b { display: block; color: var(--text, #dfe6f3); font-size: 14px; margin-bottom: 2px; }
  .mk-foot { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px 14px;
    color: var(--muted2, #6f83a6); font-size: 13px; }
  .mk-foot button, .mk-foot a { background: none; border: 0; padding: 4px 2px; font: inherit; cursor: pointer;
    color: var(--accent-soft2, #7fb0ff); text-decoration: none; }
  .mk-foot button:hover, .mk-foot a:hover { text-decoration: underline; }
  .mk-foot .sep { opacity: .5; }
  @media (max-width: 560px) {
    .mk-how { grid-template-columns: 1fr; }
    .mk-form { flex-direction: column; }
    .mk-go { padding: 12px; }
    .mk-stage { height: 128px; }
    .mk-cube .bcube-wrap { --bc: 88; }
    .mk-glow { width: 220px; height: 220px; filter: blur(42px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mk-glow { animation-duration: 30s; opacity: .25; }
    #mk, .mk-more .chev { transition: none; }
  }`;
  document.head.appendChild(css);
}

/**
 * Show the quick door.
 * hooks: {
 *   ask(text)      send this request to the chat and leave the chat open (required)
 *   openChat()     open the chat with nothing sent (Esc)
 *   openEditor()   open the full editor ("Open the full editor")
 *   pickFile()     bring an STL instead
 *   startTour()    the guided tour
 *   cubeHTML()     the build-cube markup (the app's buildCubeHTML)
 *   ready          a promise: true once the kernel has built something
 *   examples()     a promise of catalog request strings for the chips
 *   onClose()      called once, however it closes (the app marks the welcome seen)
 * }
 */
export function showMake(hooks = {}) {
  style();
  document.getElementById("mk")?.remove();
  const el = document.createElement("div");
  el.id = "mk";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "mk-h");
  el.innerHTML = `
    <div class="mk-wrap">
      <div class="mk-brand"><span class="ic">${icon("part", 18)}</span>BREPcode</div>
      <div class="mk-stage"><div class="mk-glow"></div><div class="mk-cube">${hooks.cubeHTML ? hooks.cubeHTML() : ""}</div></div>
      <div class="mk-status" aria-live="polite">Warming up the geometry kernel&hellip;</div>
      <h1 id="mk-h">What do you want to build?</h1>
      <form class="mk-form" autocomplete="off">
        <input id="mk-q" type="text" autocomplete="off" enterkeyhint="go" aria-label="What do you want to build?" placeholder="${esc(PLACEHOLDER)}" />
        <button class="mk-go" type="submit">Make it</button>
      </form>
      <button class="mk-more" type="button" aria-expanded="false" aria-controls="mk-extra">What can I make?<span class="chev" aria-hidden="true">&#9662;</span></button>
      <div class="mk-extra" id="mk-extra" hidden>
        <p class="mk-sub">Real things people print, as tested designs with every size on a slider. Tap one, or say what yours is for.</p>
        <div class="mk-chips" aria-label="Examples"></div>
        <div class="mk-how">
          <div><b>1. Ask</b>"a hook for my yoga mat", "a cable clip for 3 cables".</div>
          <div><b>2. Adjust</b>"wider", "for a Pixel 9", "round the edges", or drag the sliders.</div>
          <div><b>3. Print</b>Download the STL and open it in your slicer.</div>
        </div>
        <div class="mk-foot">
          <button type="button" data-mk="full">Open the full editor</button><span class="sep">&middot;</span>
          <button type="button" data-mk="stl">Bring an STL instead</button><span class="sep">&middot;</span>
          <button type="button" data-mk="tour">Take the 2-minute tour</button>
          <span style="flex-basis:100%;height:0"></span>
          <span>Free, no account, no AI key needed.</span>
          <a href="mailto:RandoTechNerd@gmail.com?subject=BREPcode">RandoTechNerd@gmail.com</a>
          <a href="https://discord.gg/8fjQHDX8PQ" target="_blank" rel="noopener">Discord</a>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  // Keys and taps inside the door are the door's. The app behind it has
  // single-letter shortcuts on the document and an "any interaction lifts the
  // loading screen" listener on the window; neither should hear a visitor
  // typing their first sentence.
  for (const ev of ["keydown", "keyup", "pointerdown", "wheel"]) {
    el.addEventListener(ev, (e) => {
      if (ev === "keydown" && e.key === "Escape") { e.preventDefault(); leave("chat"); }
      e.stopPropagation();
    }, { passive: ev !== "keydown" });
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add("gone");
    setTimeout(() => el.remove(), 380);
    try { hooks.onClose?.(); } catch { /* the door is shut either way */ }
  };
  const leave = (how, text) => {
    if (closed) return;            // the host page may submit a second time
    close();
    if (how === "ask") hooks.ask?.(text);
    else if (how === "stl") hooks.pickFile?.();
    else if (how === "tour") hooks.startTour?.();
    else if (how === "full") (hooks.openEditor || hooks.openChat)?.();
    else hooks.openChat?.();
  };

  const q = el.querySelector("#mk-q");
  el.querySelector(".mk-form").addEventListener("submit", (e) => {
    e.preventDefault();
    leave("ask", q.value.trim() || PLACEHOLDER);
  });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mk]");
    if (b) leave(b.dataset.mk);
  });

  // "What can I make?" unfolds the examples, the three steps and the ways
  // out; the first screen stays the question alone.
  const more = el.querySelector(".mk-more"), extra = el.querySelector("#mk-extra");
  more.addEventListener("click", () => {
    const open = extra.hidden;
    extra.hidden = !open;
    more.setAttribute("aria-expanded", String(open));
    if (open) extra.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  });

  // The chips: fresh catalog requests when the catalog can be read, the
  // standing list when it cannot. Painted up front, so unfolding never
  // shows an empty row.
  const chips = el.querySelector(".mk-chips");
  const paintChips = (list) => {
    chips.innerHTML = "";
    for (const text of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mk-chip";
      b.textContent = text;
      b.addEventListener("click", () => leave("ask", text));
      chips.appendChild(b);
    }
  };
  paintChips(FALLBACK_EXAMPLES);
  Promise.resolve(hooks.examples ? hooks.examples() : null)
    .then((list) => { if (!closed && Array.isArray(list) && list.length >= 4) paintChips(list); })
    .catch(() => { /* the standing list is already up */ });

  // The one line of status, and only while there is something to wait for.
  const status = el.querySelector(".mk-status");
  Promise.resolve(hooks.ready).then((ok) => {
    if (closed) return;
    if (ok) { status.classList.add("ready"); return; }
    status.textContent = "Taking a while to load. You can type anyway.";
  }).catch(() => {});

  // brepcode.com/make's host page paints its own copy of this question
  // (#mkc) while the app loads, then fades it out once this one exists.
  // Both on screen at once, with different layouts, read as a fake page
  // swapping for the real one. Take it over in the same frame instead:
  // carry across what was typed (or sent), and hide the copy at once.
  const cover = hostCover();
  if (cover) {
    const typed = cover.querySelector("input")?.value || window.parent.__mkcText || "";
    if (typed && !q.value) q.value = typed;
    cover.style.transition = "none";
    cover.style.visibility = "hidden";
    if (window.parent.__mkcSubmitted) { leave("ask", q.value.trim() || PLACEHOLDER); return { el, close }; }
  }

  // Focus the box, after the browser has painted it. On a phone this does not
  // raise the keyboard (browsers want a tap for that), which is right.
  requestAnimationFrame(() => { try { q.focus({ preventScroll: true }); } catch { /* fine */ } });

  return { el, close };
}
