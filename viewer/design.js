// design.js — the Code | Design switch.
//
// Design mode is the human-editable, Fusion/SolidWorks-style way of working on
// the same model: a model browser, a timeline, selection, a move gizmo and
// feature dialogs, every one of them editing the CODE (which stays the single
// source of truth), so switching back shows exactly what was done. This file
// is the switch itself and a body class (`design-mode`) the Design UI hangs on
// (design-shell.js and the design-*.js pieces it wires, phase 1). Code mode is
// the app as it always was; nothing here changes it.
//
// The app OPENS in Code unless Settings > Advanced > "Opens in" says
// otherwise (the page passes that in as `start`). Silently remembering the
// last pick sent every later link (brepcode.com/tpu-box, a catalog model) into
// Design's toolbar and panels. A link can still ask: ?mode=design or
// #mode=design, and that beats the setting.

export const MODE_KEY = "brepcode.mode";   // the old remembered pick, cleared on load
// the Design help page (how-to, keys, FAQ, limits): the Beta tag, the
// sketch panel's ?, F1 and the About card all open it
export const HELP_URL = "design-help.html";
export const MODES = ["code", "design"];

// The mode a link asks for, else `start` (the setting), else Code.
export function readMode(loc = globalThis.location, start = "code") {
  const asked = /(?:^|[?#&])mode=(\w+)/.exec(`${loc?.search ?? ""}${loc?.hash ?? ""}`)?.[1];
  if (MODES.includes(asked)) return asked;
  return MODES.includes(start) ? start : "code";
}

const CSS = `
#mode-switch {
  position: fixed; top: 12px; left: 12px; z-index: 30;
  display: flex; gap: 2px; padding: 3px;
  background: var(--card, #121826);
  border: 1px solid var(--border, #26314a);
  border-radius: 999px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  user-select: none;
}
#mode-switch button {
  border: 0; background: transparent; color: var(--muted, #8ea0c0);
  padding: 6px 12px; border-radius: 999px; cursor: pointer; font: inherit;
}
#mode-switch button:hover { color: var(--text, #dfe6f3); }
#mode-switch button[aria-pressed="true"] { background: var(--accent, #1c66e5); color: #fff; }
#mode-switch button:focus-visible { outline: 2px solid var(--accent, #1c66e5); outline-offset: 1px; }
/* Design is still being built out: a small tag says so */
#mode-switch .beta {
  margin-left: 4px; padding: 1px 4px; border-radius: 4px; vertical-align: 1px;
  font-size: 8px; letter-spacing: 0.04em; text-transform: uppercase;
  background: rgba(255, 184, 77, 0.18); color: #ffb84d;
}
#mode-switch button[aria-pressed="true"] .beta { background: rgba(255, 255, 255, 0.22); color: #fff; }
#mode-switch .beta:hover { text-decoration: underline; cursor: help; }
`;

// Builds the switch, applies the starting mode, and returns
// { get mode(), setMode(mode) }. onChange(mode) runs after every change,
// including the first apply.
export function initModeSwitch({ start = "code", onChange } = {}) {
  if (!document.getElementById("mode-switch-css")) {
    const st = document.createElement("style");
    st.id = "mode-switch-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const bar = document.createElement("div");
  bar.id = "mode-switch";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Editing mode");
  bar.innerHTML = `<button type="button" data-mode="code" title="Code: write or ask for the model in text (the way BREPcode has always worked)">Code</button>`
    + `<button type="button" data-mode="design" title="Design: point-and-click CAD on the same model: browser, timeline, move gizmo. Beta: still being filled out.">Design<span class="beta" title="Design mode is in beta: what works, what doesn't yet, its keys and how-tos (opens the Design help)">Beta</span></button>`;
  document.body.append(bar);

  let mode = null;
  const setMode = (next) => {
    if (!MODES.includes(next)) next = "code";
    mode = next;
    document.body.classList.toggle("design-mode", mode === "design");
    for (const b of bar.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    onChange?.(mode);
    return mode;
  };
  bar.addEventListener("click", (e) => {
    // the Beta tag opens the Design help (and still switches to Design)
    if (e.target.closest(".beta")) window.open(HELP_URL, "_blank", "noopener");
    const b = e.target.closest("button[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  try { localStorage.removeItem(MODE_KEY); } catch { /* storage blocked: nothing kept anyway */ }
  setMode(readMode(globalThis.location, start));
  return { get mode() { return mode; }, setMode };
}
