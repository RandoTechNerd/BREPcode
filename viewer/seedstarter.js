// The seed starter configurator: brepcode.com/seedstarter.
//
// The self-watering seed starter from the catalog (src/catalog/garden/
// seed-starter.js) on the plate, built, with a small card beside it: how the
// water goes in (a pour-in spout, or an upside-down soda bottle twisted into
// a socket), the five dials most people want, and the print files. Every
// other size is still a slider in Params, and the chat's follow-ups ("make
// it 4 by 4", "use a bottle") work because the model in the editor is the
// catalog's own code.
//
// Like make.js and casebuilder.js this is an overlay inside the app, and
// everything that touches the model goes through the hooks passed to
// showSeedStarter(). The pure parts are exported for test/seedstarter.js.

export const FAMILY_ID = "seed-starter";

// Does this address ask for the configurator? ?seedstarter=1 is what the
// /seedstarter bounce sends; #seedstarter is for a link typed by hand.
// /m/seedstarter would be a MODEL called "seedstarter", and is not ours.
export function isSeedStarterUrl({ search = "", hash = "", pathname = "" } = {}) {
  return /[?&]seedstarter=1(&|$)/.test(search)
    || /^#seed-?starter$/i.test(hash)
    || (/(^|\/)seed-?starter\/?(index\.html)?$/i.test(pathname) && !/(^|\/)m\/seed-?starter\/?$/i.test(pathname));
}

// Is this code the catalog's seed starter? The header line is how the chat
// knows a catalog model, so it is how the card knows its own.
export function isSeedStarterCode(src = "") {
  return new RegExp(`From the BREPcode catalog: ${FAMILY_ID}\\.`).test(src);
}

// The dials up front, in the order a person thinks of them. Ranges and
// labels come from the family, so the card and the Params sliders agree.
export const DIALS = [
  { name: "cols", label: "Pots across" },
  { name: "rows", label: "Pots deep" },
  { name: "potTop", label: "Pot width at the rim" },
  { name: "potH", label: "Pot height" },
  { name: "resH", label: "Reservoir height" },
];

export const WATER = [
  { value: "spout", label: "Pour-in spout", hint: "Top the reservoir up through the spout at the front." },
  { value: "bottle", label: "Twist-in bottle",
    hint: (v) => `An upside-down soda or water bottle twists into the socket and keeps the water ${fmt(v.levelZ ?? 14)} mm deep.` },
];

const fmt = (v) => String(Math.round(+v * 10) / 10);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// What the card says about the grid: "3 x 3 pots, 164 x 164 mm".
// The outside size follows the family body: the grid, its margin, the wall.
export function sizeLine(v) {
  const n = (k, d) => (Number.isFinite(+v[k]) ? +v[k] : d);
  const cols = n("cols", 3), rows = n("rows", 3), pitch = n("pitch", 52), margin = n("margin", 1), wall = n("wall", 3);
  const W = cols * pitch + 2 * margin + 2 * wall, D = rows * pitch + 2 * margin + 2 * wall;
  return `${cols} x ${rows} pots, about ${Math.round(W)} x ${Math.round(D)} mm`;
}

function style() {
  if (document.getElementById("ss-css")) return;
  const css = document.createElement("style");
  css.id = "ss-css";
  css.textContent = `
    #ss { position: fixed; left: 12px; top: 64px; z-index: 60; width: min(300px, calc(100vw - 24px));
      max-height: calc(100dvh - 140px); overflow: auto;
      background: var(--card, #121826); color: var(--text, #e8eefc); border: 1px solid var(--border-soft, #2a3654); border-radius: 14px;
      box-shadow: 0 14px 40px rgba(0,0,0,.5); font: 13px/1.4 system-ui, sans-serif; }
    #ss .ss-top { display: flex; align-items: flex-start; gap: 2px; padding: 11px 8px 4px 13px;
      cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }
    #ss.ss-drag .ss-top { cursor: grabbing; }
    #ss .ss-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    #ss .ss-eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--muted2, #8ea0c0); }
    #ss h2 { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.25; }
    #ss .ss-size { color: var(--muted2, #8ea0c0); font-size: 12px; }
    #ss .ss-min, #ss .ss-x { flex: none; background: none; border: 0; color: var(--muted2, #8ea0c0); font-size: 18px; line-height: 1;
      width: 26px; height: 26px; border-radius: 8px; cursor: pointer; }
    #ss .ss-min:hover, #ss .ss-x:hover { background: var(--hover, #1a2334); color: var(--text, #e8eefc); }
    #ss .ss-body { padding: 4px 13px 12px; display: flex; flex-direction: column; gap: 10px; }
    #ss.ss-small .ss-body { display: none; }
    body.design-mode #ss { display: none; }   /* Design's panels own that corner */
    #ss .ss-q { font-size: 12px; font-weight: 600; color: var(--muted2, #8ea0c0); margin: 2px 0 5px; }
    #ss .ss-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    #ss .ss-seg button { font: inherit; font-weight: 600; padding: 8px 6px; border-radius: 10px; cursor: pointer;
      background: none; color: var(--text, #e8eefc); border: 1px solid var(--border-soft, #2a3654); }
    #ss .ss-seg button:hover { background: var(--hover, #1a2334); }
    #ss .ss-seg button[aria-pressed="true"] { background: var(--accent, #7fd1ff); color: #06101c; border-color: transparent; }
    #ss .ss-hint { color: var(--muted2, #8ea0c0); font-size: 12px; margin-top: 5px; }
    #ss .ss-dial { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; }
    #ss .ss-dial label { font-size: 12.5px; }
    #ss .ss-dial output { font-variant-numeric: tabular-nums; font-size: 12.5px; color: var(--muted2, #8ea0c0); }
    #ss .ss-dial input { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: var(--accent, #7fd1ff); }
    #ss .ss-acts { display: flex; flex-wrap: wrap; gap: 6px; }
    #ss .ss-btn { font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 12px; border-radius: 999px; cursor: pointer;
      background: none; color: var(--text, #e8eefc); border: 1px solid var(--border-soft, #2a3654); }
    #ss .ss-btn:hover { background: var(--hover, #1a2334); }
    #ss .ss-go { background: var(--accent, #7fd1ff); color: #06101c; border-color: transparent; }
    #ss .ss-go:hover { filter: brightness(1.08); background: var(--accent, #7fd1ff); }
    #ss .ss-status { font-size: 11.5px; color: var(--muted2, #8ea0c0); min-height: 1.4em; display: flex; align-items: center; gap: 8px; }
    #ss .ss-status .bcube-wrap { --bc: 14; display: block; position: relative; }
    @media (max-width: 560px) { #ss { top: auto; bottom: 92px; max-height: 55dvh; } }
  `;
  document.head.appendChild(css);
}

// hooks:
//   family         the catalog family (ranges and labels for the dials)
//   read()         the model's current values by name, or null when the code
//                  on the plate is no longer the seed starter
//   set(name, v)   turn one dial (the Params setParam: the build follows)
//   exportParts()  the Export dialog on "3MF - parts laid out"
//   openParams()   every other dial
//   status()       { kind, text } of the app's build status
export function showSeedStarter(hooks = {}) {
  style();
  document.getElementById("ss")?.remove();
  const fam = hooks.family || { params: {} };
  const el = document.createElement("div");
  el.id = "ss";
  // the app's stage-fit treats this as a window: the model stays clear of it
  el.dataset.stageWindow = "";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Seed starter settings");
  const dialHTML = DIALS.map((d) => {
    const p = fam.params[d.name] || { min: 0, max: 100 };
    const step = p.unit === "count" ? 1 : p.step || 1;
    return `<div class="ss-dial">
        <label for="ss-${d.name}">${esc(d.label)}</label><output id="ss-${d.name}-o" for="ss-${d.name}"></output>
        <input id="ss-${d.name}" type="range" min="${p.min}" max="${p.max}" step="${step}" data-name="${d.name}" />
      </div>`;
  }).join("");
  el.innerHTML = `
    <div class="ss-top">
      <div class="ss-txt"><span class="ss-eyebrow">Self-watering seed starter</span><h2>Make it yours</h2><span class="ss-size"></span></div>
      <button type="button" class="ss-min" aria-expanded="true" title="Fold this card" aria-label="Fold this card">&minus;</button>
      <button type="button" class="ss-x" title="Close (every setting is still in Params)" aria-label="Close">&times;</button>
    </div>
    <div class="ss-body">
      <div>
        <div class="ss-q" id="ss-water-q">How does the water go in?</div>
        <div class="ss-seg" role="group" aria-labelledby="ss-water-q">
          ${WATER.map((w) => `<button type="button" data-water="${w.value}" aria-pressed="false">${esc(w.label)}</button>`).join("")}
        </div>
        <div class="ss-hint" aria-live="polite"></div>
      </div>
      ${dialHTML}
      <div class="ss-status" aria-live="polite"></div>
      <div class="ss-acts">
        <button type="button" class="ss-btn ss-go" data-act="export">Download print files</button>
        <button type="button" class="ss-btn" data-act="params">All settings</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  const $ = (s) => el.querySelector(s);
  let values = {};
  let dragging = null;          // the dial under the finger: not overwritten from the code
  let pending = Promise.resolve();
  // one write at a time: a second dial turned mid-build waits its turn, so
  // the code never has two half-applied edits racing each other
  const write = (name, v) => { pending = pending.then(() => hooks.set?.(name, v)).catch(() => {}); return pending; };

  function paint() {
    const v = hooks.read?.();
    if (v === null) { el.remove(); stop(); return; }      // something else is on the plate now
    if (!v) return;
    values = v;
    $(".ss-size").textContent = sizeLine(v);
    for (const b of el.querySelectorAll("[data-water]")) b.setAttribute("aria-pressed", String(b.dataset.water === v.water));
    const w = WATER.find((x) => x.value === v.water) || WATER[0];
    $(".ss-hint").textContent = typeof w.hint === "function" ? w.hint(v) : w.hint;
    for (const d of DIALS) {
      if (dragging === d.name || v[d.name] === undefined) continue;
      $(`#ss-${d.name}`).value = v[d.name];
      $(`#ss-${d.name}-o`).textContent = outText(d.name, v[d.name]);
    }
    // Building: the app's own build cube with the word, here where it is
    // always seen (the one by the Editor button sits under the Params panel)
    const s = hooks.status?.() || {};
    const line = s.kind === "busy" ? "busy" : s.kind === "err" ? `err:${s.text}` : "";
    if (line !== shown) {                  // only on a change, so the cube keeps spinning
      shown = line;
      const st = $(".ss-status");
      if (s.kind === "busy") st.innerHTML = `${hooks.cubeHTML?.() || ""}<span>Building…</span>`;
      else st.textContent = s.kind === "err" ? (s.text || "That didn't build.") : "";
    }
  }
  let shown = null;
  const outText = (name, x) => (fam.params[name]?.unit === "mm" ? `${fmt(x)} mm` : fmt(x));

  for (const b of el.querySelectorAll("[data-water]")) {
    b.addEventListener("click", () => {
      if (values.water === b.dataset.water) return;
      values.water = b.dataset.water;
      for (const o of el.querySelectorAll("[data-water]")) o.setAttribute("aria-pressed", String(o === b));
      write("water", b.dataset.water).then(paint);
    });
  }
  for (const d of DIALS) {
    const inp = $(`#ss-${d.name}`), out = $(`#ss-${d.name}-o`);
    // the label follows the finger; the model rebuilds once, on release
    inp.addEventListener("input", () => { dragging = d.name; out.textContent = outText(d.name, inp.value); });
    inp.addEventListener("change", () => {
      dragging = null;
      write(d.name, +inp.value).then(paint);
    });
  }
  $('[data-act="export"]').addEventListener("click", () => hooks.exportParts?.());
  $('[data-act="params"]').addEventListener("click", () => hooks.openParams?.());
  $(".ss-min").addEventListener("click", (e) => {
    const small = el.classList.toggle("ss-small");
    e.currentTarget.setAttribute("aria-expanded", String(!small));
    e.currentTarget.innerHTML = small ? "+" : "&minus;";
    e.currentTarget.title = e.currentTarget.ariaLabel = small ? "Open this card" : "Fold this card";
    hooks.windowsChanged?.();
  });

  // Moved by its header, like the app's own windows; kept on screen.
  {
    const top = $(".ss-top");
    let from = null;
    top.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const r = el.getBoundingClientRect();
      from = { x: e.clientX - r.left, y: e.clientY - r.top };
      top.setPointerCapture(e.pointerId);
      el.classList.add("ss-drag");
      e.preventDefault();
    });
    top.addEventListener("pointermove", (e) => {
      if (!from) return;
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(0, e.clientX - from.x), innerWidth - r.width);
      const y = Math.min(Math.max(0, e.clientY - from.y), innerHeight - 40);
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, bottom: "auto" });
    });
    const end = () => { if (!from) return; from = null; el.classList.remove("ss-drag"); hooks.windowsChanged?.(); };
    top.addEventListener("pointerup", end);
    top.addEventListener("pointercancel", end);
  }
  $(".ss-x").addEventListener("click", () => { el.remove(); stop(); });

  // The code can change under the card (Params, the chat, Ctrl+Z, the
  // editor), so it re-reads it rather than trusting what it last wrote.
  const timer = setInterval(paint, 700);
  function stop() { clearInterval(timer); hooks.windowsChanged?.(); }
  paint();
  hooks.windowsChanged?.();
  return { el, paint, close: () => { el.remove(); stop(); } };
}
