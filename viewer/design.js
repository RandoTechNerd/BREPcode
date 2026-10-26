// design.js — the Code | Design switch.
//
// Design mode is the human-editable, Fusion/SolidWorks-style way of working on
// the same model: a model browser, a timeline, selection, a move gizmo and
// feature dialogs, every one of them editing the CODE (which stays the single
// source of truth), so switching back shows exactly what was done. This file
// is phase 0 of that: the switch itself, remembered per browser, and a body
// class (`design-mode`) the later phases hang their UI on. Code mode is the app
// as it always was; nothing here changes it.

export const MODE_KEY = "brepcode.mode";
export const MODES = ["code", "design"];

export function readMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return MODES.includes(v) ? v : "code";
  } catch {
    return "code";          // private mode / storage blocked: the default
  }
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
#design-note {
  position: fixed; top: 52px; left: 12px; z-index: 30; max-width: 300px;
  padding: 10px 12px; border-radius: 10px;
  background: var(--card, #121826);
  border: 1px solid var(--border, #26314a);
  color: var(--text, #dfe6f3); font: 12.5px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
#design-note b { display: block; margin-bottom: 3px; font-size: 13px; }
#design-note small { color: var(--muted, #8ea0c0); }
body:not(.design-mode) #design-note { display: none; }
`;

// Builds the switch, applies the remembered mode, and returns
// { get mode(), setMode(mode) }. onChange(mode) runs after every change,
// including the first apply.
export function initModeSwitch({ onChange } = {}) {
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
    + `<button type="button" data-mode="design" title="Design: point-and-click CAD on the same model. Early preview.">Design</button>`;
  const note = document.createElement("div");
  note.id = "design-note";
  note.setAttribute("role", "note");
  note.innerHTML = `<b>Design mode is on its way</b>`
    + `A model browser, timeline, move gizmo and feature dialogs are coming here, `
    + `each one editing the same code you see in Code mode. `
    + `<small>For now everything works exactly as in Code mode.</small>`;
  document.body.append(bar, note);

  let mode = null;
  const setMode = (next) => {
    if (!MODES.includes(next)) next = "code";
    mode = next;
    document.body.classList.toggle("design-mode", mode === "design");
    for (const b of bar.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* not remembered, still switched */ }
    onChange?.(mode);
    return mode;
  };
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  setMode(readMode());
  return { get mode() { return mode; }, setMode };
}
