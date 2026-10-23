// Two pieces of UI that arrived together:
//
//  1. The DROP MENU. Dropping an STL / 3MF / OBJ anywhere on the page used to
//     import it straight into the editor. Now it asks what you came to do:
//     open it, fill it with FizzCore bubbles, or open it and go straight to a
//     tool (support fins, drill, texture...). "Always just open" puts the old
//     behaviour back for anyone who never wants the question.
//
//  2. The FIZZCORE dialog: graded bubble infill (see src/fizzcore.js), with a
//     live section view so you can SEE the bubbles, the knobs Aryn asked for
//     (smallest / largest bubble, fill the gaps, skin, webs, grading,
//     printable teardrop tops), optional support fins, and STL / 3MF out.
//
// It works on raw triangles and never touches the CAD kernel, so it runs on
// meshes far too heavy to open in the editor.

import { parseModelFile } from "./inventory.js";
import { icon } from "./icons.js";

const SKIP_KEY = "brepcode-drop-skip";
const SETTINGS_KEY = "brepcode-fizz";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const css = document.createElement("style");
  css.textContent = `
  .fz-veil { position: fixed; inset: 0; z-index: 10000; background: rgba(5,8,14,.62);
    display: flex; align-items: center; justify-content: center; padding: 16px; }
  .fz-box { background: var(--card, #121826); color: var(--text, #dfe6f3);
    border: 1px solid var(--border, #26314a); border-radius: 14px;
    box-shadow: 0 18px 60px rgba(0,0,0,.55); font: 14px/1.45 system-ui, sans-serif;
    max-height: calc(100dvh - 32px); display: flex; flex-direction: column; overflow: hidden; }
  .fz-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px;
    background: var(--header, #182135); border-bottom: 1px solid var(--border, #26314a); }
  .fz-head h2 { font-size: 15px; margin: 0; flex: 1; min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 9px; }
  .fz-hi { display: inline-flex; color: var(--muted6, #93a7c8); flex: none; }
  .fz-x { background: none; border: 0; color: var(--muted, #8ea0c0); font-size: 22px;
    line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
  .fz-x:hover { background: var(--hover, #1a2334); color: var(--text, #fff); }
  .fz-pick { width: min(620px, 100%); }
  .fz-list { padding: 10px; display: flex; flex-direction: column; gap: 6px; overflow: auto; }
  .fz-opt { display: flex; gap: 12px; align-items: center; text-align: left; width: 100%;
    padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-soft, #1c2437);
    background: var(--input-bg, #0d1320); color: inherit; cursor: pointer; font: inherit; }
  .fz-opt:hover, .fz-opt:focus-visible { background: var(--hover-strong, #1d2a44);
    border-color: var(--border-focus, #3a5788); outline: none; }
  .fz-opt .ic { width: 30px; flex: none; display: flex; justify-content: center; color: var(--muted6, #93a7c8); }
  .fz-opt:hover .ic, .fz-tile:hover .ic { color: var(--text, #dfe6f3); }
  .fz-opt b { display: block; font-size: 14px; }
  .fz-opt small { color: var(--muted, #8ea0c0); font-size: 12px; }
  .fz-opt.hero { border-color: var(--border-focus, #3a5788); }
  .fz-new { font-size: 10px; font-weight: 600; letter-spacing: .06em; color: var(--accent-soft, #4b8cf5);
    border: 1px solid var(--accent-soft, #4b8cf5); border-radius: 4px; padding: 0 5px; margin-left: 8px; vertical-align: 1px; }
  .fz-and { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted2, #6f83a6); margin: 10px 2px 2px; }
  .fz-grp { font-size: 11.5px; color: var(--muted, #8ea0c0); margin: 8px 2px 4px; }
  .fz-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
  .fz-tile { display: flex; gap: 8px; align-items: flex-start; text-align: left; padding: 7px 9px; border-radius: 9px; cursor: pointer;
    font: inherit; border: 1px solid var(--border-soft, #1c2437); background: var(--input-bg, #0d1320); color: var(--text, #dfe6f3); }
  .fz-tile:hover, .fz-tile:focus-visible { background: var(--hover-strong, #1d2a44); border-color: var(--border-focus, #3a5788); outline: none; }
  .fz-tile .ic { width: 18px; flex: none; display: flex; justify-content: center; padding-top: 1px; color: var(--muted6, #93a7c8); }
  .fz-tile b { display: block; font-size: 12.5px; font-weight: 600; }
  .fz-tile small { display: block; font-size: 11px; color: var(--muted2, #6f83a6); line-height: 1.3; }
  .fz-foot { padding: 8px 16px 12px; color: var(--muted2, #6f83a6); font-size: 12px; display: flex;
    gap: 8px; align-items: center; }
  .fz-main { width: min(1060px, 100%); height: min(720px, calc(100dvh - 32px)); }
  .fz-body { display: flex; flex: 1; min-height: 0; }
  .fz-side { width: 330px; flex: none; overflow: auto; padding: 12px 14px; border-right: 1px solid var(--border-soft, #1c2437); }
  .fz-view { flex: 1; position: relative; min-width: 0; background: #070a10; }
  .fz-view canvas { position: absolute; left: 0; top: 0; display: block; touch-action: none; }
  .fz-sec { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted2, #6f83a6); margin: 12px 0 6px; }
  .fz-sec:first-child { margin-top: 0; }
  .fz-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center; margin: 7px 0; }
  .fz-row label { font-size: 13px; }
  .fz-row small { grid-column: 1 / -1; color: var(--muted2, #6f83a6); font-size: 11.5px; margin-top: -2px; }
  .fz-row input[type=number] { width: 74px; padding: 4px 6px; border-radius: 6px; font: inherit; font-size: 13px;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: inherit; }
  .fz-row input[type=range] { width: 130px; }
  .fz-row select { padding: 4px 6px; border-radius: 6px; font: inherit; font-size: 13px;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: inherit; }
  .fz-check { display: flex; gap: 8px; align-items: flex-start; margin: 8px 0; font-size: 13px; cursor: pointer; }
  .fz-check input { margin-top: 3px; }
  .fz-check small { display: block; color: var(--muted2, #6f83a6); font-size: 11.5px; }
  .fz-go { width: 100%; margin-top: 12px; padding: 10px; border: 0; border-radius: 10px; cursor: pointer;
    font: 600 14px system-ui; color: #fff; background: var(--accent, #1c66e5); }
  .fz-go:hover:not(:disabled) { background: var(--accent-hover, #2e76f2); }
  .fz-go:disabled { opacity: .55; cursor: progress; }
  .fz-btns { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .fz-btn { flex: 1; padding: 8px 10px; border-radius: 8px; cursor: pointer; font: 600 13px system-ui;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text, #dfe6f3); }
  .fz-btn:hover { background: var(--hover-strong, #1d2a44); }
  .fz-btn:disabled { opacity: .45; cursor: default; }
  .fz-bar { height: 4px; border-radius: 4px; background: var(--spin-track, #2c3d5c); overflow: hidden; margin-top: 10px; display: none; }
  .fz-bar i { display: block; height: 100%; width: 0; background: var(--accent-soft, #4b8cf5); transition: width .15s; }
  .fz-msg { font-size: 12px; color: var(--muted, #8ea0c0); margin-top: 6px; min-height: 16px; }
  .fz-msg.err { color: var(--err, #f4a3a3); }
  .fz-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
  .fz-stat { background: var(--input-bg, #0d1320); border: 1px solid var(--border-soft, #1c2437); border-radius: 8px; padding: 6px 8px; }
  .fz-stat b { display: block; font-size: 16px; }
  .fz-stat span { font-size: 11px; color: var(--muted2, #6f83a6); }
  .fz-tip { font-size: 12px; color: var(--muted, #8ea0c0); background: var(--hint-bg, #0f1522);
    border: 1px solid var(--border-soft, #1c2437); border-radius: 8px; padding: 8px 10px; margin-top: 10px; }
  .fz-tip b { color: var(--text2, #d8e2f5); }
  .fz-cut { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; gap: 10px; align-items: center;
    background: rgba(12,17,27,.82); border: 1px solid var(--border, #26314a); border-radius: 10px; padding: 8px 12px;
    font-size: 12px; color: var(--text2, #d8e2f5); flex-wrap: wrap; }
  .fz-cut input[type=range] { flex: 1; min-width: 120px; }
  .fz-legend { position: absolute; left: 12px; top: 12px; font-size: 12px; color: var(--muted, #8ea0c0);
    background: rgba(12,17,27,.82); border-radius: 8px; padding: 6px 10px; pointer-events: none; }
  .fz-pv { margin-top: 3px; color: #f0c674; }
  .fz-warn { font-size: 12px; border-radius: 8px; padding: 7px 10px; margin: 8px 0 6px; line-height: 1.4; }
  .fz-warn:empty { display: none; }
  .fz-warn.ok { background: rgba(111,211,148,.10); border: 1px solid rgba(111,211,148,.35); color: var(--ok, #6fd394); }
  .fz-warn.bad { background: rgba(244,120,120,.10); border: 1px solid rgba(244,120,120,.4); color: #f6b0b0; }
  .fz-best { width: 100%; margin-bottom: 4px; }
  .fz-of { margin: 0 0 6px; }
  .fz-of > .fz-of-sum { cursor: pointer; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted2, #6f83a6); padding: 4px 0 8px; list-style-position: inside; }
  .fz-of > .fz-of-sum:hover { color: var(--accent-soft, #4b8cf5); }
  .fz-of[open] > .fz-of-sum { color: var(--text2, #d8e2f5); }
  .fz-hidden { display: none !important; }
  .fz-adv { margin: 8px 0 4px; border: 1px solid var(--border-soft, #1c2437); border-radius: 8px; padding: 0 10px; }
  .fz-adv[open] { padding-bottom: 6px; }
  .fz-adv summary { cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--text2, #d8e2f5); padding: 8px 0; list-style-position: inside; }
  .fz-adv summary:hover { color: var(--accent-soft, #4b8cf5); }
  .fz-pvstats { font-size: 12px; color: var(--muted, #8ea0c0); margin: -2px 0 8px; }
  .fz-pvstats:empty { display: none; }
  .fz-orbtns { margin: 2px 0 8px; }
  .fz-orbtns .fz-btn { flex: 1 1 30%; padding: 6px 6px; font-size: 12px; }
  .fz-btn.armed { background: var(--accent, #1c66e5); color: #fff; border-color: var(--accent, #1c66e5); }
  /* bubble shape: picture buttons over the (hidden) select that holds the value */
  .fz-shapes { display: flex; gap: 6px; margin-top: 2px; }
  .fz-shape-btn { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 7px 4px 6px; border-radius: 9px; cursor: pointer; font: inherit; font-size: 12px; line-height: 1.2;
    border: 1px solid var(--border, #26314a); background: var(--input-bg, #0d1320); color: var(--text2, #d8e2f5); }
  .fz-shape-btn svg { width: 30px; height: 30px; color: var(--muted6, #93a7c8); }
  .fz-shape-btn small { color: var(--muted, #8ea0c0); font-size: 10.5px; text-align: center; }
  .fz-shape-btn:hover { background: var(--hover-strong, #1d2a44); }
  .fz-shape-btn.on { border-color: var(--accent, #1c66e5); background: rgba(28,102,229,.14); color: var(--text, #fff); }
  .fz-shape-btn.on svg { color: var(--accent-soft, #4b8cf5); }
  .fz-pv:empty { display: none; }
  .fz-off { opacity: .4; pointer-events: none; }
  .fz-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin: 0 4px -1px 0; }
  @media (max-width: 760px) {
    .fz-main { height: calc(100dvh - 32px); }
    .fz-body { flex-direction: column; }
    .fz-side { width: auto; border-right: 0; border-bottom: 1px solid var(--border-soft, #1c2437); max-height: 52%; }
    .fz-view { min-height: 240px; }
  }`;
  document.head.appendChild(css);
}

function modal(cls, title, ic = "") {
  injectStyle();
  const veil = document.createElement("div");
  veil.className = "fz-veil";
  veil.innerHTML = `<div class="fz-box ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="fz-head"><h2>${ic ? `<span class="fz-hi">${icon(ic, 18)}</span>` : ""}${esc(title)}</h2><button class="fz-x" title="Close" aria-label="Close">&times;</button></div>
  </div>`;
  document.body.appendChild(veil);
  const box = veil.firstElementChild;
  const close = () => { veil.remove(); document.removeEventListener("keydown", onKey, true); box.onclose?.(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  veil.addEventListener("pointerdown", (e) => { if (e.target === veil) close(); });
  box.querySelector(".fz-x").onclick = close;
  return { veil, box, close };
}

// ------------------------------------------------------------ the drop menu

export function dropSkipped() { return lsGet(SKIP_KEY) === "1"; }

/**
 * Ask what to do with a dropped mesh.
 * groups: [{ title, tools: [{ id, label, icon, desc }] }] - every tool that works on the opened mesh
 * returns a Promise of { action: "open" | "exact" | "fizz" | "fins" | "tool", tool? } or null if cancelled
 */
export function chooseDropAction(file, { groups = [] } = {}) {
  return new Promise((resolve) => {
    const { box, close } = modal("fz-pick", `${file.name}: what would you like to do?`);
    let done = false;
    const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
    box.onclose = () => { if (!done) { done = true; resolve(null); } };
    const mb = file.size / 1048576;
    box.insertAdjacentHTML("beforeend", `
      <div class="fz-list">
        <button class="fz-opt" data-a="open"><span class="ic">${icon("open", 20)}</span>
          <span><b>Open in the editor</b><small>import it as a mesh you can cut, scale, combine and export</small></span></button>
        <button class="fz-opt" data-a="exact"><span class="ic">${icon("open", 20)}</span>
          <span><b>Open as an exact solid<span class="fz-new">BETA</span></b><small>rebuild real planes and cylinders from the triangles, so cuts are exact and a curved STEP export carries true surfaces. Best for parts made in CAD; you can switch back to the mesh.</small></span></button>
        <button class="fz-opt hero" data-a="fizz"><span class="ic">${icon("fizz", 20)}</span>
          <span><b>FizzCore bubble infill<span class="fz-new">NEW</span></b><small>fill it with graded, self-supporting bubbles: less plastic, and still strong. Support fins optional.</small></span></button>
        <button class="fz-opt" data-a="fins"><span class="ic">${icon("fins", 20)}</span>
          <span><b>Add support fins</b><small>tilt it 45° (or any angle) with a live preview, and get snap-off fins that lean with it</small></span></button>
        <div class="fz-and">Open it and…</div>
        ${groups.map((g) => `<div class="fz-grp">${esc(g.title)}</div><div class="fz-tiles">${g.tools.map((t) =>
          `<button class="fz-tile" data-a="tool" data-t="${esc(t.id)}"><span class="ic">${icon(t.icon, 16)}</span><span><b>${esc(t.label)}</b>${t.desc ? `<small>${esc(t.desc)}</small>` : ""}</span></button>`).join("")}</div>`).join("")}
      </div>
      <div class="fz-foot"><label style="display:flex;gap:6px;align-items:center;cursor:pointer">
        <input type="checkbox" class="fz-skip" /> Always just open (skip this menu)</label>
        <span style="margin-left:auto">${mb < 1 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${mb.toFixed(1)} MB`}</span></div>`);
    box.querySelector(".fz-skip").onchange = (e) => lsSet(SKIP_KEY, e.target.checked ? "1" : "0");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      finish({ action: b.dataset.a, tool: b.dataset.t });
    });
    box.querySelector('[data-a="fizz"]').focus();
  });
}

// ------------------------------------------------------------- FizzCore UI

const UI_DEFAULTS = {
  nozzle: 0.4, mode: "solid",
  minD: 2.4, maxD: 0, fillGaps: true, skin: 1.2, web: 0.8, grade: 35, shape: "teardrop",
  fins: false, finSide: "auto", tiltToward: "best", finCount: 3,
  finShape: "slim", finDepth: 8, pokeEvery: 10, finHeight: "auto", finHeightMm: 30, pokeGap: 0.2,
  finLines: 3, finSpacing: 0, finGap: 0.8, finSkirt: 5,
  // Printing on a slant is what the fins are for, so a part with fins is
  // tilted 45 degrees by default. With fins off the tilt does nothing: a part
  // leaning on nothing just falls over.
  tilt: 45, bubbles: true,
};

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(lsGet(SETTINGS_KEY) || "{}"); } catch { /* defaults */ }
  // settings saved before there was a shape choice had a teardrop box
  if (!saved.shape && saved.teardrop === false) saved.shape = "round";
  return { ...UI_DEFAULTS, ...saved };
}

/**
 * Open the FizzCore dialog.
 * @param THREE     the page's three.js
 * @param source    { name, soup } or { file }  (soup = Float32Array, 9 floats/tri)
 * @param hooks     { openInEditor(file), save(bytes, filename, mime) }
 * @param mode      "fizz" (bubbles, fins optional) or "fins" (tilt + fins, no bubbles)
 */
export async function openFizzCore(THREE, source, hooks = {}, mode = "fizz") {
  const name = (source.name || source.file?.name || "model").replace(/\.[^.]+$/, "");
  const finsMode = mode === "fins";
  const { box, close } = modal("fz-main", finsMode ? `Support fins: ${name}` : `FizzCore bubble infill: ${name}`, finsMode ? "fins" : "fizz");
  const s = loadSettings();
  // the way in decides the starting point; everything else is remembered
  // FizzCore mode starts with fins OFF even if the last run had them: they
  // are folded away as optional here, and a remembered tilt would surprise
  // someone who came for bubbles
  if (finsMode) { s.fins = true; s.bubbles = false; } else { s.bubbles = true; s.fins = false; }
  const SIDES = { "-x": "Left (−X)", "+x": "Right (+X)", "-y": "Front (−Y)", "+y": "Back (+Y)" };
  box.insertAdjacentHTML("beforeend", `
    <div class="fz-body">
      <div class="fz-side">
        <details class="fz-of" ${finsMode ? "open" : ""}>
        <summary class="fz-of-sum">${finsMode ? "Orientation &amp; support fins" : "Tilt it / add support fins (optional)"}</summary>
        <div class="fz-sec">Print orientation</div>
        <div class="fz-row"><label for="fz-spin">Spin on the bed <b class="fz-spin-val"></b></label><input id="fz-spin" type="range" min="0" max="355" step="5" value="0" />
          <small>Turns the model on the bed. The fins stay on their side and re-fit to whatever faces them. Shift+drag in the preview spins it too.</small></div>
        <div class="fz-btns fz-orbtns">
          <button class="fz-btn" type="button" data-or="flip">Flip over</button>
          <button class="fz-btn" type="button" data-or="flat">Lay a face flat…</button>
          <button class="fz-btn" type="button" data-or="reset">Reset</button>
        </div>
        <div class="fz-sec">Support fins</div>
        <label class="fz-check"><input id="fz-fins" type="checkbox" ${s.fins ? "checked" : ""} />
          <span>Support fins<small>Snap-off fins that stop a tilted part tipping. Tiny pokes reach in and stop just short of it, so they catch it if it sways but never fuse.</small></span></label>
        <div class="fz-row fz-finonly"><label for="fz-tilt">Tilt <b class="fz-tilt-val"></b></label><input id="fz-tilt" type="range" min="0" max="75" step="5" value="${s.tilt}" />
          <small>Leans the part over its fins, like printing it on a slant. 45° is the classic. 0 = upright, as it came in.</small></div>
        <div class="fz-row fz-finonly"><label for="fz-toward">Lean toward</label><select id="fz-toward">
          <option value="best" ${s.tiltToward === "best" ? "selected" : ""}>Auto: least overhang</option>
          ${Object.entries(SIDES).map(([v, l]) => `<option value="${v}" ${s.tiltToward === v ? "selected" : ""}>${l}</option>`).join("")}
        </select><small class="fz-toward-note">Which way the top of the part tips. Auto tries all four and keeps the one that leaves the least overhang.</small></div>
        <div class="fz-row fz-finonly"><label for="fz-fside">Fins on</label><select id="fz-fside">
          <option value="auto" ${s.finSide === "auto" ? "selected" : ""}>Auto: where it would tip</option>
          ${Object.entries(SIDES).map(([v, l]) => `<option value="${v}" ${s.finSide === v ? "selected" : ""}>${l}</option>`).join("")}
        </select><small class="fz-fside-note">A tall part tips toward the lean; a wide one stands on an edge and tips the other way. Auto works it out from the centre of mass.</small></div>
        <div class="fz-warn fz-finonly-hide"></div>
        <div class="fz-pvstats"></div>
        <button class="fz-btn fz-best fz-finonly-hide" type="button">Find the tilt with the least overhang</button>
        <div class="fz-row fz-finonly"><label for="fz-fcount">How many fins</label><input id="fz-fcount" type="number" min="1" max="24" step="1" value="${s.finCount}" />
          <small>Spread evenly along the side. For a fixed gap between fins instead, see Advanced.</small></div>
        <div class="fz-row fz-finonly"><label for="fz-fheight">Fin height</label><select id="fz-fheight">
          <option value="auto" ${s.finHeight === "auto" ? "selected" : ""}>Auto: just past the centre of mass</option>
          <option value="full" ${s.finHeight === "full" ? "selected" : ""}>Full height (wobbly / top-heavy)</option>
          <option value="custom" ${s.finHeight === "custom" ? "selected" : ""}>Custom</option>
        </select><small>A part tips about its centre of mass, so Auto stops a little above it: a face that already prints (a box at 45°) needs nothing taller.</small></div>
        <div class="fz-row fz-finonly fz-customh"><label for="fz-fhmm">Fin height (mm)</label><input id="fz-fhmm" type="number" min="5" max="400" step="1" value="${s.finHeightMm}" /></div>
        <div class="fz-row fz-finonly"><label for="fz-poke">Pokes every (mm)</label><input id="fz-poke" type="number" min="0" max="60" step="1" value="${s.pokeEvery}" />
          <small>Up the fin. Smaller = more pokes holding the part. 0 = none (the fin alone, standing off).</small></div>
        <details class="fz-adv fz-finonly">
          <summary>Advanced fin settings</summary>
          <div class="fz-row fz-finonly"><label for="fz-fshape">Fin shape</label><select id="fz-fshape">
            <option value="slim" ${s.finShape !== "buttress" ? "selected" : ""}>Slim: 90° triangle</option>
            <option value="buttress" ${s.finShape === "buttress" ? "selected" : ""}>Buttress: 45° brace</option>
          </select><small>Slim: the curvy side hugs the part, the outer side drops straight down. Buttress: a full 45° brace for heavy parts, more plastic.</small></div>
          <div class="fz-row fz-finonly fz-slimonly"><label for="fz-fdepth">Fin size (mm)</label><input id="fz-fdepth" type="number" min="3" max="40" step="1" value="${s.finDepth}" />
            <small>How far a slim fin reaches out past the part.</small></div>
          <div class="fz-row fz-finonly"><label for="fz-flines">Fin thickness</label><select id="fz-flines">
            ${[2, 3, 4, 5].map((n) => `<option value="${n}" ${+s.finLines === n ? "selected" : ""}>${n} lines${n === 3 ? " (best)" : n === 2 ? " (lighter)" : n >= 4 ? " (heavy parts)" : ""}</option>`).join("")}
          </select><small>In whole nozzle widths, so the slicer prints it as clean walls.</small></div>
          <div class="fz-row fz-finonly"><label for="fz-fspace">Space between fins (mm)</label><input id="fz-fspace" type="number" min="0" max="200" step="1" value="${s.finSpacing || ""}" placeholder="use count" />
            <small>Set a gap and the fin count follows the part's length (overrides How many fins). Blank = use the count.</small></div>
          <div class="fz-row fz-finonly"><label for="fz-fgap">Distance from model (mm)</label><input id="fz-fgap" type="number" min="0.3" max="5" step="0.1" value="${s.finGap}" />
            <small>How far the fin stands off the part. The pokes bridge this gap.</small></div>
          <div class="fz-row fz-finonly"><label for="fz-pgap">Poke gap (mm)</label><input id="fz-pgap" type="number" min="0" max="1" step="0.05" value="${s.pokeGap}" />
            <small>How far short of the part each poke stops. 0.2 is a slicer's usual support gap. 0 = the tip just kisses it (holds firmer, may leave a tiny mark).</small></div>
          <div class="fz-row fz-finonly"><label for="fz-skirt">Foot size (mm)</label><input id="fz-skirt" type="number" min="0" max="20" step="1" value="${s.finSkirt}" />
            <small>The flat foot each fin stands on, for bed grip. 0 = no foot.</small></div>
        </details>

        </details>

        <div class="fz-sec">Printer</div>
        <div class="fz-row"><label for="fz-noz">Nozzle</label><select id="fz-noz">
          ${[0.2, 0.4, 0.6, 0.8].map((n) => `<option value="${n}" ${+s.nozzle === n ? "selected" : ""}>${n} mm</option>`).join("")}
        </select><small>Sets the skin (3 lines), the bubble walls (2 lines), the smallest useful bubble and the fin thickness.</small></div>

        <div class="fz-sec">Bubbles</div>
        <label class="fz-check"><input id="fz-bub" type="checkbox" ${s.bubbles ? "checked" : ""} />
          <span>Fill it with bubbles (FizzCore)<small>Graded, self-supporting bubbles inside: less plastic, still strong.</small></span></label>
        <div class="fz-bubonly">
        <div class="fz-row"><label for="fz-mode">Walls between bubbles</label><select id="fz-mode">
          <option value="solid" ${s.mode !== "hybrid" ? "selected" : ""}>Solid webs</option>
          <option value="hybrid" ${s.mode === "hybrid" ? "selected" : ""}>Hybrid: slicer infill</option>
        </select><small class="fz-mode-note"></small></div>
        <div class="fz-row"><label for="fz-min">Smallest bubble Ø (mm)</label><input id="fz-min" type="number" min="0.6" max="40" step="0.2" value="${s.minD}" />
          <small>Nothing smaller is made. Under ~2 mm the slicer prints it solid anyway.</small></div>
        <div class="fz-row"><label for="fz-max">Largest bubble Ø (mm)</label><input id="fz-max" type="number" min="0" max="80" step="0.5" value="${s.maxD || ""}" placeholder="auto" />
          <small>Blank = auto (sized to the part). Bigger = lighter, fewer bubbles.</small></div>
        <div class="fz-row"><label>Bubble shape</label>
          <div class="fz-shapes" role="radiogroup" aria-label="Bubble shape">
            <button type="button" class="fz-shape-btn" role="radio" data-shape="teardrop" title="Teardrops: round, with a 45° peak">
              <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 4.7 L20.7 10.3 A8 8 0 1 1 9.3 10.3 Z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
              <b>Drops</b><small>45° peak · FDM</small></button>
            <button type="button" class="fz-shape-btn" role="radio" data-shape="diamond" title="Diamonds: cells that tile, flat even walls, 50° peak">
              <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 3 L23 9.5 L23 20.5 L15 27 L7 20.5 L7 9.5 Z M7 9.5 L15 14 L23 9.5 M15 14 L15 27" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
              <b>Diamonds</b><small>flat walls · lightest</small></button>
            <button type="button" class="fz-shape-btn" role="radio" data-shape="round" title="Round: no peak, for powder printers">
              <svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="9" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.6"/></svg>
              <b>Round</b><small>SLS / MJF only</small></button>
          </div>
          <select id="fz-shape" hidden>
            <option value="teardrop" ${s.shape === "teardrop" ? "selected" : ""}>Drops</option>
            <option value="diamond" ${s.shape === "diamond" ? "selected" : ""}>Diamonds</option>
            <option value="round" ${s.shape === "round" ? "selected" : ""}>Round</option>
          </select>
          <small class="fz-shape-note"></small></div>
        <label class="fz-check"><input id="fz-gaps" type="checkbox" ${s.fillGaps ? "checked" : ""} />
          <span>Fill gaps with small bubbles<small>Packs little bubbles into the spaces between big ones.</small></span></label>
        <details class="fz-adv">
          <summary>Advanced bubble settings</summary>
          <div class="fz-row"><label for="fz-grade">Grading</label><input id="fz-grade" type="range" min="0" max="100" value="${s.grade}" />
            <small>Left: same size everywhere. Right: small, dense bubbles under the skin, big ones in the core (stiffer in bending).</small></div>
          <div class="fz-row"><label for="fz-skin">Outer skin (mm)</label><input id="fz-skin" type="number" min="0.4" max="10" step="0.2" value="${s.skin}" />
            <small class="fz-skin-note">Solid shell, 3 lines thick.</small></div>
          <div class="fz-row"><label for="fz-web">Wall between bubbles (mm)</label><input id="fz-web" type="number" min="0.2" max="20" step="0.2" value="${s.web}" />
            <small class="fz-web-note">Thinnest web. Thicker = stronger and heavier.</small></div>
        </details>
        </div>

        <button class="fz-go"></button>
        <div class="fz-bar"><i></i></div>
        <div class="fz-msg"></div>
        <div class="fz-stats" hidden></div>
        <div class="fz-btns">
          <button class="fz-btn" data-dl="stl" disabled>Download STL</button>
          <button class="fz-btn" data-dl="3mf" disabled>Download 3MF</button>
        </div>
        <div class="fz-btns"><button class="fz-btn" data-open disabled>Open result in the editor</button></div>
        <div class="fz-tip"></div>
      </div>
      <div class="fz-view">
        <canvas></canvas>
        <div class="fz-legend"><i style="background:#e7609e"></i>cut plastic &nbsp; <i style="background:#9fb7d9"></i>surface / bubble walls &nbsp; <i style="background:#8a93a3"></i>fins <span class="fz-oh-chip">&nbsp; <i style="background:#ff4d4d"></i>overhang &gt; 45°</span><div class="fz-pv"></div></div>
        <div class="fz-cut"><label><input type="checkbox" class="fz-clip" checked /> Section view</label>
          <input type="range" class="fz-slice" min="0" max="100" value="50" />
          <select class="fz-axis"><option value="0">cut along X</option><option value="1" selected>cut along Y</option><option value="2">cut along Z</option></select></div>
      </div>
    </div>`);

  const $ = (sel) => box.querySelector(sel);
  let result = null;
  if (!finsMode) {
    const of = $(".fz-of"), go = $(".fz-go");
    go.parentNode.insertBefore(of, go);
  }
  // Nozzle and wall mode drive the sizes. Picking either one REWRITES the
  // skin / web / smallest bubble, because those numbers only mean anything in
  // whole extrusion lines; typing in a box afterwards still wins.
  const sizesFor = (noz, mode) => ({
    skin: +(noz * 3).toFixed(2),
    // hybrid webs are wide enough for the slicer to lay real infill inside
    // them: two perimeters each side plus a few lines of gyroid
    web: mode === "hybrid" ? +Math.max(3, noz * 10).toFixed(1) : +(noz * 2).toFixed(2),
    minD: +Math.max(1.2, noz * 6).toFixed(1),
  });
  const notes = () => {
    const bub = $("#fz-bub").checked, fins = $("#fz-fins").checked;
    for (const el of box.querySelectorAll(".fz-bubonly")) el.classList.toggle("fz-off", !bub);
    for (const el of box.querySelectorAll(".fz-finonly")) el.classList.toggle("fz-off", !fins);
    for (const el of box.querySelectorAll(".fz-finonly-hide, .fz-oh-chip")) el.classList.toggle("fz-hidden", !fins);
    for (const el of box.querySelectorAll(".fz-slimonly")) el.classList.toggle("fz-off", !fins || $("#fz-fshape").value !== "slim");
    for (const el of box.querySelectorAll(".fz-customh")) el.style.display = $("#fz-fheight").value === "custom" ? "" : "none";
    $(".fz-tilt-val").textContent = `${$("#fz-tilt").value}°`;
    $(".fz-spin-val").textContent = `${$("#fz-spin").value}°`;
    $(".fz-go").textContent = bub ? (fins ? "Fill it with bubbles + add fins" : "Fill it with bubbles") : (fins ? "Tilt it and add the fins" : "Nothing to do: turn on bubbles or fins");
    $(".fz-go").disabled = !bub && !fins;
    const noz = +$("#fz-noz").value, hybrid = $("#fz-mode").value === "hybrid";
    const lines = (mm) => `${(mm / noz).toFixed(1).replace(/\.0$/, "")} lines at ${noz} mm`;
    $(".fz-skin-note").textContent = `Solid shell: ${lines(+$("#fz-skin").value)}.`;
    for (const b of box.querySelectorAll(".fz-shape-btn")) {
      const on = b.dataset.shape === $("#fz-shape").value;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }
    $(".fz-shape-note").textContent = {
      teardrop: "A 45° peak on every bubble, so no ceiling needs support.",
      diamond: "Flat walls of one even thickness, each cell peaked at 50°. Usually lighter, fewer triangles, quicker to slice.",
      round: "No peaks: for powder printers. On FDM the roofs sag and string.",
    }[$("#fz-shape").value] || "";
    $(".fz-web-note").textContent = `Thinnest web: ${lines(+$("#fz-web").value)}. ${hybrid ? "Wide on purpose: the slicer fills it with infill." : "Prints as pure perimeters. Thicker = stronger and heavier."}`;
    $(".fz-mode-note").textContent = hybrid
      ? "Thick webs that the slicer fills with its own infill (gyroid). A lighter part that still has a bubble skeleton."
      : "Thin webs printed as solid walls: the bubbles ARE the infill. Strongest per gram.";
    $(".fz-tip").innerHTML = !bub
      ? `<b>Slicing it:</b> your normal settings, no supports. Print the fins in the same plastic; once it's done they snap off at the teeth.`
      : hybrid
      ? `<b>Slicing it:</b> 2 walls, <b>gyroid infill 10 to 20%</b>. The webs are ${(+$("#fz-web").value).toFixed(1)} mm wide, so the slicer lays gyroid inside them. No supports needed inside the bubbles.`
      : `<b>Slicing it:</b> 2 to 3 walls. <b>Infill 100%</b> for the strongest part (the webs print as walls, and the slicer only fills the odd thick spot), or 15% to go lighter. No supports needed inside the bubbles.`;
  };
  const applySizes = () => {
    const z = sizesFor(+$("#fz-noz").value, $("#fz-mode").value);
    $("#fz-skin").value = z.skin; $("#fz-web").value = z.web; $("#fz-min").value = z.minD;
    notes();
  };
  $("#fz-noz").addEventListener("change", applySizes);
  $("#fz-mode").addEventListener("change", applySizes);
  for (const id of ["#fz-skin", "#fz-web"]) $(id).addEventListener("input", notes);
  notes();

  const msg = (t, err = false) => { const m = $(".fz-msg"); m.textContent = t; m.classList.toggle("err", err); };

  // ---- source triangles
  let soup = source.soup;
  if (!soup) {
    try {
      msg("Reading the file…");
      soup = await parseModelFile(source.file.name, await source.file.arrayBuffer());
    } catch (e) {
      msg(`Couldn't read ${source.file.name}: ${e?.message || e}`, true);
      return;
    }
  }
  if (!soup || !soup.length) { msg("No triangles found in that file.", true); return; }

  // ---- preview
  const canvas = $("canvas");
  const view = $(".fz-view");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a2233, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  scene.add(sun);
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const group = new THREE.Group();
  scene.add(group);
  const frontMat = new THREE.MeshStandardMaterial({ color: 0x9fb7d9, roughness: 0.55, metalness: 0.05, side: THREE.FrontSide, clippingPlanes: [plane] });
  // Back faces only show where the section plane has sliced through plastic,
  // so painting them a loud colour makes the cut face read as solid material.
  const backMat = new THREE.MeshBasicMaterial({ color: 0xe7609e, side: THREE.BackSide, clippingPlanes: [plane] });
  const finMat = new THREE.MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.7, side: THREE.DoubleSide, clippingPlanes: [plane] });
  // overhangs past 45 degrees, painted over the part (nudged toward the camera
  // so they win the depth fight with the surface they sit on)
  const ohMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, side: THREE.DoubleSide, clippingPlanes: [plane],
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  let bbox = new THREE.Box3(), frameBox = new THREE.Box3();
  let grid = null;
  const setMeshes = (partSoup, finSoup, oh = null) => {
    for (const c of [...group.children]) { c.geometry.dispose(); group.remove(c); }
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid = null; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(partSoup, 3));
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, frontMat), new THREE.Mesh(geo, backMat));
    if (finSoup) {
      const fg = new THREE.BufferGeometry();
      fg.setAttribute("position", new THREE.BufferAttribute(finSoup, 3));
      fg.computeVertexNormals();
      group.add(new THREE.Mesh(fg, finMat));
    }
    if (oh && oh.tris.length) {
      const src = oh.soup, out = new Float32Array(oh.tris.length * 9);
      oh.tris.forEach((ti, k) => out.set(src.subarray(ti * 9, ti * 9 + 9), k * 9));
      const og = new THREE.BufferGeometry();
      og.setAttribute("position", new THREE.BufferAttribute(out, 3));
      group.add(new THREE.Mesh(og, ohMat));
    }
    geo.computeBoundingBox();
    bbox = geo.boundingBox.clone();   // the PART: the section slider spans this
    frameBox = new THREE.Box3().setFromObject(group);   // part + fins: the camera frames this
    // the bed, so a tilt reads as a tilt: 10 mm squares under the model
    const fs = frameBox.getSize(new THREE.Vector3()), fc = frameBox.getCenter(new THREE.Vector3());
    const span = Math.ceil((Math.max(fs.x, fs.y) * 1.4) / 10) * 10 + 20;
    grid = new THREE.GridHelper(span, span / 10, 0x3a5788, 0x1c2437);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(Math.round(fc.x / 10) * 10, Math.round(fc.y / 10) * 10, frameBox.min.z - 0.01);
    scene.add(grid);
    updateClip();
  };

  // orbit: drag to turn, wheel to zoom. Small on purpose: the page's own
  // controls are bound to the main viewport.
  let yaw = -0.7, pitch = 0.45, dist = 0;
  const target = new THREE.Vector3();
  const frame = () => {
    const size = frameBox.getSize(new THREE.Vector3());
    frameBox.getCenter(target);
    dist = size.length() * 1.45 + 1;
  };
  const place = () => {
    camera.position.set(
      target.x + dist * Math.cos(pitch) * Math.sin(yaw),
      target.y - dist * Math.cos(pitch) * Math.cos(yaw),
      target.z + dist * Math.sin(pitch));
    camera.up.set(0, 0, 1);
    camera.lookAt(target);
    sun.position.copy(camera.position).add(new THREE.Vector3(0, 0, dist));
  };
  let alive = true;
  const draw = () => { if (!alive) return; place(); renderer.render(scene, camera); };
  const resize = () => {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);          // updateStyle on: with false, a HiDPI canvas overflows its box
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(view);
  let drag = null, downAt = null, spinDrag = false;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY }; downAt = { x: e.clientX, y: e.clientY }; spinDrag = e.shiftKey;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (spinDrag) {
      // Shift+drag turns the MODEL on the bed (the fins stay put); the camera holds still
      const sp = $("#fz-spin");
      const v = ((+sp.value + Math.round((e.clientX - drag.x) * 0.6 / 5) * 5) % 360 + 360) % 360;
      if (v !== +sp.value) { sp.value = v; drag = { x: e.clientX, y: e.clientY }; orientChanged(); }
      return;
    }
    yaw -= (e.clientX - drag.x) * 0.01;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - drag.y) * 0.01));
    drag = { x: e.clientX, y: e.clientY };
    updateClip();
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); dist *= e.deltaY > 0 ? 1.1 : 0.9; draw(); }, { passive: false });

  function updateClip() {
    const on = $(".fz-clip").checked;
    const ax = +$(".fz-axis").value;
    const t = +$(".fz-slice").value / 100;
    // Throw away the half NEAREST the camera, so the cut face looks at you.
    // three keeps the side the normal points to, so the normal points away
    // from the camera along the chosen axis.
    place();
    const toCam = camera.position.getComponent(ax) - target.getComponent(ax);
    const sgn = toCam >= 0 ? -1 : 1;
    const n = new THREE.Vector3(); n.setComponent(ax, sgn);
    const lo = bbox.min.getComponent(ax), hi = bbox.max.getComponent(ax);
    plane.normal.copy(n);
    plane.constant = -sgn * (lo + (hi - lo) * t);
    const planes = on ? [plane] : [];
    frontMat.clippingPlanes = planes; backMat.clippingPlanes = planes; finMat.clippingPlanes = planes; ohMat.clippingPlanes = planes;
    frontMat.needsUpdate = backMat.needsUpdate = finMat.needsUpdate = ohMat.needsUpdate = true;
    draw();
  }
  for (const el of [".fz-clip", ".fz-slice", ".fz-axis"]) $(el).addEventListener("input", updateClip);

  // ---- the live preview: a low-poly copy, tilted, with its fins, redrawn as
  // the sliders move. Cheap enough to follow a drag; the real run uses every
  // triangle and is a button press away.
  const tris = soup.length / 9;
  let low = null, lowSolid = false, previewTimer = 0, previewSeq = 0, running = false;
  // ORIENTATION. A base rotation (flips, faces laid flat) times a spin about
  // the bed's vertical, applied before the tilt. Row-major 3x3s.
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let baseM = I3.slice();
  const mul = (a, b) => {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
  };
  const rotZ = (deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return [c, -sn, 0, sn, c, 0, 0, 0, 1]; };
  // the same rotation tiltSoup applies, as a matrix
  const tiltM = (deg, toward) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), sg = toward[0] === "+" ? 1 : -1;
    return toward[1] === "x" ? [c, 0, sg * sn, 0, 1, 0, -sg * sn, 0, c] : [1, 0, 0, 0, c, sg * sn, 0, -sg * sn, c];
  };
  // the rotation that turns unit vector n to face straight down
  const faceDown = (n) => {
    const d = [0, 0, -1];
    const dot = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
    if (dot > 0.9999) return I3.slice();
    if (dot < -0.9999) return [1, 0, 0, 0, -1, 0, 0, 0, -1];
    let k = [n[1] * d[2] - n[2] * d[1], n[2] * d[0] - n[0] * d[2], n[0] * d[1] - n[1] * d[0]];
    const kl = Math.hypot(...k); k = k.map((v) => v / kl);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot))), c = Math.cos(ang), sn = Math.sin(ang), v = 1 - c;
    const [x, y, z] = k;
    return [c + x * x * v, x * y * v - z * sn, x * z * v + y * sn,
      y * x * v + z * sn, c + y * y * v, y * z * v - x * sn,
      z * x * v - y * sn, z * y * v + x * sn, c + z * z * v];
  };
  const orientM = () => mul(rotZ(+$("#fz-spin").value), baseM);
  const isIdentity = (m) => m.every((v, i) => Math.abs(v - I3[i]) < 1e-9);
  let resolvedToward = "-x";
  const stale = () => {
    if (!result) return;
    result = null;
    for (const b of box.querySelectorAll("[data-dl],[data-open]")) b.disabled = true;
    $(".fz-stats").hidden = true;
    msg("Settings changed: press the button again for the real thing.");
  };
  const showOverhang = (area, tilt) => {
    const w = $(".fz-warn");
    const cm2 = area / 100;
    if (cm2 < 0.5) {
      w.className = "fz-warn ok";
      w.textContent = `Nothing hangs past 45° at ${tilt}°: every surface can print without support.`;
    } else {
      w.className = "fz-warn bad";
      w.textContent = `${cm2.toFixed(1)} cm² of the part hangs past 45° at ${tilt}° (red) and would print on air. Fins stop it tipping; they don't hold up undersides. Try another tilt, or add slicer supports for the red.`;
    }
  };
  async function preview() {
    const seq = ++previewSeq;
    const u = read();
    const F = await import("../src/fizzcore.js");
    const w = await F.loadManifold();
    // The preview copy: manifold's own simplify keeps it WATERTIGHT, so the
    // preview can carve its fins against the real outline exactly like the
    // full run (curvy fins included). A mesh that isn't a closed solid falls
    // back to a quick vertex-clustered copy and the straight profile fins.
    if (!low) {
      try {
        const full = F.soupToManifold(w, soup);
        const b = F.boundsOfSoup(soup);
        low = tris > 8000 ? F.manifoldToSoup(full.simplify(Math.max(0.15, Math.max(...b.size) / 400))) : soup;
        lowSolid = true;
      } catch {
        low = tris > 20000 ? F.decimateSoup(soup, 64) : soup;
        lowSolid = false;
      }
    }
    const tilt = u.fins ? u.tilt : 0;
    const M = orientM();
    const oLow = isIdentity(M) ? low : F.orientSoup(low, M);
    // Auto lean: try the four directions at this tilt, keep the least overhang
    let toward = u.tiltToward;
    if (toward === "best") {
      toward = tilt > 0 ? F.bestTilt(oLow, { angles: [tilt] }).toward : "-x";
      $(".fz-toward-note").textContent = tilt > 0
        ? `Auto picked ${SIDES[toward]}: the least overhang of the four at ${tilt}°.`
        : "Upright: no lean to pick.";
    }
    resolvedToward = toward;
    const shown = F.tiltSoup(oLow, tilt, toward);
    let finSoup = null, finGrams = 0;
    if (u.fins) {
      // decide the side on the REAL triangles (the low-poly copy is not closed,
      // so its centre of mass is meaningless); turning them is cheap
      const side = u.finSide === "auto" ? F.tipSide(F.tiltSoup(isIdentity(M) ? soup : F.orientSoup(soup, M), tilt, toward), toward) : u.finSide;
      $(".fz-fside-note").textContent = u.finSide === "auto"
        ? `It would tip toward ${SIDES[side]}, so the fins go there.`
        : "Your pick. Auto works out where it would tip from the centre of mass.";
      try {
        let solid = null;
        if (lowSolid) { try { solid = F.soupToManifold(w, shown); } catch { solid = null; } }
        const { fins } = F.finsFor(w, shown, F.boundsOfSoup(shown), { side, count: u.finCount, nozzle: u.nozzle, lean: "auto", solid,
          shape: u.finShape, depth: u.finDepth, teethEvery: u.pokeEvery, layer: 0.5,
          height: u.finHeight === "custom" ? u.finHeightMm : u.finHeight, clearance: u.pokeGap,
          lines: u.finLines, spacing: u.finSpacing, gap: u.finGap, skirt: u.finSkirt });
        if (fins.length) {
          const all = w.Manifold.compose(fins);
          finSoup = F.manifoldToSoup(all);
          finGrams = (all.volume() / 1000) * 1.24;
        }
      } catch { /* the preview is a sketch; the real run reports real errors */ }
    }
    if (seq !== previewSeq || !alive) return;    // a newer drag already won
    // ...or the real run finished while this sketch was still being carved:
    // never paint a low-poly preview over a finished result
    if (result || running) return;
    const oh = F.overhangs(shown);
    if (u.fins) showOverhang(oh.area, tilt);
    {
      const b = F.boundsOfSoup(shown);
      $(".fz-pvstats").textContent = `On the bed: ${b.size[0].toFixed(0)} × ${b.size[1].toFixed(0)} mm, ${b.size[2].toFixed(0)} mm tall`
        + (u.fins ? ` · fins ≈ ${finGrams.toFixed(1)} g` : "");
    }
    setMeshes(shown, finSoup, u.fins ? { soup: shown, tris: oh.tris } : null);
    $(".fz-pv").textContent = low !== soup ? `Preview: low-poly (${Math.round(low.length / 9).toLocaleString()} of ${tris.toLocaleString()} triangles${lowSolid ? ", fins carved to fit" : ""}). The button makes the real one.`
      : (u.fins || u.bubbles ? "Preview. The button makes the real one." : "");
    frame(); updateClip();
  }
  // ~half a second to carve the preview fins, so wait for the slider to settle
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 220); };
  for (const id of ["#fz-tilt", "#fz-toward", "#fz-fside", "#fz-fcount", "#fz-fins", "#fz-noz", "#fz-fshape", "#fz-fdepth", "#fz-poke", "#fz-fheight", "#fz-fhmm", "#fz-pgap", "#fz-flines", "#fz-fspace", "#fz-fgap", "#fz-skirt"]) {
    $(id).addEventListener("input", () => { notes(); stale(); schedulePreview(); });
  }
  for (const id of ["#fz-bub", "#fz-mode", "#fz-min", "#fz-max", "#fz-gaps", "#fz-grade", "#fz-shape", "#fz-skin", "#fz-web"]) {
    $(id).addEventListener("input", () => { notes(); if (result) { stale(); schedulePreview(); } });
  }
  // the shape buttons just set the hidden select and let its listener run
  for (const b of box.querySelectorAll(".fz-shape-btn")) {
    b.addEventListener("click", () => {
      const sel = $("#fz-shape");
      if (sel.value === b.dataset.shape) return;
      sel.value = b.dataset.shape;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const orientChanged = () => { notes(); stale(); schedulePreview(); };
  $("#fz-spin").addEventListener("input", orientChanged);
  let flatArmed = false;
  const armFlat = (on) => {
    flatArmed = on;
    box.querySelector('[data-or="flat"]').classList.toggle("armed", on);
    canvas.style.cursor = on ? "crosshair" : "";
    if (on) msg("Click the face that should sit on the bed.");
  };
  box.querySelector(".fz-orbtns").addEventListener("click", (e) => {
    const b = e.target.closest("[data-or]");
    if (!b) return;
    if (b.dataset.or === "flip") { baseM = mul([1, 0, 0, 0, -1, 0, 0, 0, -1], mul(rotZ(+$("#fz-spin").value), baseM)); $("#fz-spin").value = 0; orientChanged(); }
    if (b.dataset.or === "reset") { baseM = I3.slice(); $("#fz-spin").value = 0; armFlat(false); orientChanged(); }
    if (b.dataset.or === "flat") armFlat(!flatArmed);
  });
  // a click (not a drag) on the part while armed lays that face on the bed
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener("pointerup", (e) => {
    if (!flatArmed || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(group.children[0], false)[0];
    if (!hit) return;
    const n = hit.face.normal.clone().normalize();
    // what is on screen = tilt x spin x base; fold all of it into the base,
    // then turn the clicked face down. Spin and tilt start again from zero.
    const u = read();
    const shownM = mul(tiltM(u.fins ? u.tilt : 0, resolvedToward), orientM());
    baseM = mul(faceDown([n.x, n.y, n.z]), shownM);
    $("#fz-spin").value = 0;
    $("#fz-tilt").value = 0;
    armFlat(false);
    orientChanged();
    msg("Laid flat on that face. Tilt it again if you want it on a slant.");
  });

  $(".fz-best").onclick = async () => {
    const btn = $(".fz-best");
    btn.disabled = true;
    btn.textContent = "Searching every angle and side…";
    await new Promise((r) => setTimeout(r, 20));
    try {
      const F = await import("../src/fizzcore.js");
      // a big mesh searches on the preview copy: overhang area barely moves
      const M = orientM();
      const src = tris > 150000 && low ? low : soup;
      const b = F.bestTilt(isIdentity(M) ? src : F.orientSoup(src, M));
      if (!$("#fz-fins").checked && b.tilt > 0) { $("#fz-fins").checked = true; }
      $("#fz-tilt").value = b.tilt;
      $("#fz-toward").value = b.toward;
      notes(); stale(); schedulePreview();
      msg(b.tilt === 0
        ? `Least overhang is upright (${(b.area / 100).toFixed(1)} cm²): it may not need tilting at all.`
        : `Least overhang: ${b.tilt}° with the top toward ${SIDES[b.toward]} (${(b.area / 100).toFixed(1)} cm² past 45°).`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Find the tilt with the least overhang";
    }
  };

  setMeshes(soup, null);
  frame();
  updateClip();
  resize();
  notes();
  msg(finsMode ? "Drag the tilt to see it lean. Fins stand under the lean." : "Z is up as printed, and every bubble peaks upward.");
  setTimeout(preview, 0);      // after the rest of the dialog (read() included) is wired
  // test hook (the tests and the agent bridge read the preview through it)
  box.__fz = { renderer, camera, scene, group, plane, draw, get dist() { return dist; } };

  box.onclose = () => { alive = false; ro.disconnect(); renderer.dispose(); };

  // ---- run
  const read = () => ({
    bubbles: $("#fz-bub").checked,
    tilt: +$("#fz-tilt").value,
    nozzle: +$("#fz-noz").value,
    mode: $("#fz-mode").value,
    minD: +$("#fz-min").value || UI_DEFAULTS.minD,
    maxD: +$("#fz-max").value || 0,
    fillGaps: $("#fz-gaps").checked,
    grade: +$("#fz-grade").value,
    shape: $("#fz-shape").value,
    skin: +$("#fz-skin").value || UI_DEFAULTS.skin,
    web: +$("#fz-web").value || UI_DEFAULTS.web,
    fins: $("#fz-fins").checked,
    finSide: $("#fz-fside").value,
    tiltToward: $("#fz-toward").value,
    finShape: $("#fz-fshape").value,
    finDepth: +$("#fz-fdepth").value || 8,
    pokeEvery: Math.max(0, +$("#fz-poke").value || 0),
    finHeight: $("#fz-fheight").value,
    finHeightMm: Math.max(5, +$("#fz-fhmm").value || 30),
    pokeGap: Math.max(0, Math.min(1, +$("#fz-pgap").value || 0)),
    finLines: +$("#fz-flines").value || 3,
    finSpacing: Math.max(0, +$("#fz-fspace").value || 0),
    finGap: Math.max(0.3, +$("#fz-fgap").value || 0.8),
    finSkirt: Math.max(0, +$("#fz-skirt").value || 0),
    finCount: +$("#fz-fcount").value || 3,
  });
  const bar = $(".fz-bar"), barI = bar.firstElementChild;
  $(".fz-go").onclick = async () => {
    // cancel any preview still being carved, so it cannot land on top of this
    previewSeq++;
    clearTimeout(previewTimer);
    running = true;
    const u = read();
    lsSet(SETTINGS_KEY, JSON.stringify(u));
    const go = $(".fz-go");
    go.disabled = true;
    bar.style.display = "block";
    for (const b of box.querySelectorAll("[data-dl],[data-open]")) b.disabled = true;
    try {
      const { fizzcore } = await import("../src/fizzcore.js");
      result = await fizzcore(soup, {
        bubbles: u.bubbles,
        tilt: u.fins ? u.tilt : 0,
        tiltToward: u.tiltToward === "best" ? resolvedToward : u.tiltToward,
        orient: isIdentity(orientM()) ? null : orientM(),
        minBubble: u.minD / 2,
        maxBubble: u.maxD / 2,
        fillGaps: u.fillGaps,
        grade: u.grade / 100,
        shape: u.shape,
        skin: u.skin,
        web: u.web,
        fins: u.fins ? { side: u.finSide, count: u.finCount, nozzle: u.nozzle, shape: u.finShape, depth: u.finDepth, teethEvery: u.pokeEvery,
          height: u.finHeight === "custom" ? u.finHeightMm : u.finHeight, clearance: u.pokeGap,
          lines: u.finLines, spacing: u.finSpacing, gap: u.finGap, skirt: u.finSkirt } : null,
      }, {
        onProgress: (p, t) => { barI.style.width = `${Math.round(p * 100)}%`; msg(t); },
      });
      setMeshes(result.part, result.fins, u.fins ? { soup: result.tilted, tris: result.stats.overhangTris } : null);
      if (u.fins) showOverhang(result.stats.overhangArea, u.tilt);
      $(".fz-pv").textContent = "";
      frame(); updateClip();
      const st = result.stats;
      const g = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));
      const stats = $(".fz-stats");
      stats.hidden = false;
      if (!u.bubbles) {
        stats.innerHTML = `
        <div class="fz-stat"><b>${u.fins ? u.tilt : 0}°</b><span>tilt, top toward ${esc(SIDES[u.tiltToward === "best" ? resolvedToward : u.tiltToward])}</span></div>
        <div class="fz-stat"><b>${st.fins.length}</b><span>${u.finShape === "slim" ? "slim" : "buttress"} fins on ${st.fins[0] ? esc(SIDES[st.fins[0].side]) : "-"}, ${st.fins.reduce((a, f) => a + f.teeth, 0)} pokes</span></div>
        <div class="fz-stat"><b>${g(st.gramsAfter)} g</b><span>part, in PLA</span></div>
        <div class="fz-stat"><b>${g(st.gramsFins)} g</b><span>fins (snap off)</span></div>`;
      } else stats.innerHTML = `
        <div class="fz-stat"><b>${st.bubbles.toLocaleString()}</b><span>bubbles${st.capped ? " (hit the cap)" : ""}</span></div>
        <div class="fz-stat"><b>${Math.round(st.saved * 100)}%</b><span>less plastic than solid${u.mode === "hybrid" ? " (before slicer infill)" : ""}</span></div>
        <div class="fz-stat"><b>${g(st.gramsBefore)} → ${g(st.gramsAfter)} g</b><span>weight in PLA${st.gramsFins ? ` (+${g(st.gramsFins)} g fins)` : ""}</span></div>
        ${u.mode === "hybrid"
          ? `<div class="fz-stat"><b>${Math.round((1 - st.infillEquivalent) * 100)}%</b><span>of the core is bubbles (the rest gets slicer infill)</span></div>`
          : `<div class="fz-stat"><b>≈${Math.round(st.infillEquivalent * 100)}%</b><span>like this slicer infill %</span></div>`}
        <div class="fz-stat"><b>Ø ${(st.smallest * 2).toFixed(1)}–${(st.largest * 2).toFixed(1)}</b><span>bubble sizes, mm</span></div>
        <div class="fz-stat"><b>${(st.ms / 1000).toFixed(1)} s</b><span>${Math.round(st.triangles / 1000)}k triangles</span></div>`;
      const finNote = u.fins ? (st.fins.length ? ` ${st.fins.length} support fin${st.fins.length === 1 ? "" : "s"} added.` : " No fins: nothing on that side to hold.") : "";
      msg(!u.bubbles ? `Done.${finNote}` : st.bubbles ? `Done.${finNote}` : `No room for bubbles: the part is thinner than skin + smallest bubble. Try a thinner skin or smaller bubbles.${finNote}`, !st.bubbles);
      for (const b of box.querySelectorAll("[data-dl],[data-open]")) b.disabled = false;
    } catch (e) {
      msg(String(e?.message || e), true);
    } finally {
      running = false;
      go.disabled = false;
      setTimeout(() => { bar.style.display = "none"; barI.style.width = "0"; }, 400);
    }
  };

  const stlBytes = async () => {
    const { soupToBinaryStl } = await import("../src/fizzcore.js");
    return soupToBinaryStl([result.part, result.fins], name);
  };
  box.querySelector('[data-dl="stl"]').onclick = async () => {
    if (!result) return;
    hooks.save?.(await stlBytes(), `${name}-fizzcore.stl`, "model/stl");
  };
  box.querySelector('[data-dl="3mf"]').onclick = async () => {
    if (!result) return;
    const exp = await import("./exporters.js");
    // part and fins as one object: same colour, so a one-nozzle printer needs
    // no filament mapping
    const group = (sp) => {
      const verts = [], tris = [];
      for (let i = 0; i < sp.length; i += 9) {
        const b = verts.length;
        verts.push([sp[i], sp[i + 1], sp[i + 2]], [sp[i + 3], sp[i + 4], sp[i + 5]], [sp[i + 6], sp[i + 7], sp[i + 8]]);
        tris.push([b, b + 1, b + 2]);
      }
      return { verts, tris, color: "#E7609E" };
    };
    const groups = [group(result.part)];
    if (result.fins) groups.push(group(result.fins));
    const bytes = await exp.colored3MF(groups, `${name}-fizzcore`);
    hooks.save?.(bytes, `${name}-fizzcore.3mf`, "model/3mf");
  };
  box.querySelector("[data-open]").onclick = async () => {
    if (!result) return;
    const bytes = await stlBytes();
    close();
    hooks.openInEditor?.(new File([bytes], `${name}-fizzcore.stl`, { type: "model/stl" }));
  };
}
