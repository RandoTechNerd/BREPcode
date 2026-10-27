// design-shell.js — Design mode, phase 1: the shell around the model.
//
//   toolbar      thin strip along the top; double-click it (or its ▾) for the
//                full ribbon. Phase 2's feature dialogs are placeholders here.
//   browser      the code as a tree of calls (design-tree.js); click a row to
//                select that shape exactly as clicking it on the model does
//   selection    the picked face, its feature, and the edges around it by the
//                names fillet() / chamfer() take ("A|B[n]")
//   timeline     the kernel's feature history (design-timeline.js)
//   move gizmo   arrows on the selected shape (design-gizmo.js); release
//                writes translate([dx, dy, dz], …) into the code
//
// Everything is shown only under body.design-mode and edits only the code,
// through the viewer's own writers (`host`, built in index.html). Switching
// back to Code mode shows exactly what was done.

import { buildTree, renderTree, primaryFid } from "./design-tree.js";
import { linkFeatures, renderTimeline } from "./design-timeline.js";
import { createMoveGizmo } from "./design-gizmo.js";
import { parseTyped } from "./design-edit.js";
import { rotateText, scaleText, shapeSpan } from "./design/features.js";
import { failedSteps } from "./design-timeline.js";

const RIBBON_KEY = "brepcode.ribbon";
const SNAPS = [1, 0.5, 0.1, 0];

// The ribbon. `dialog` tools open a feature dialog (design/dialogs.js, loaded
// the first time one is clicked); the rest are modes of the pointer.
const TOOLS = [
  { group: "Select", items: [
    { id: "select", label: "Select", tip: "Pick a shape or a face, no gizmo", icon: `<path d="M4 2l9 5-4 1.2L7.5 13z"/>` },
    { id: "move", label: "Move", tip: "Move the selected shape with arrows; the move is written into the code", icon: `<path d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M14.5 8l-2-2M14.5 8l-2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2"/>` },
    { id: "rotate", label: "Rotate", tip: "Turn the selected shape about its centre, one axis at a time; writes rotate([…], { about }, …)", icon: `<path d="M12.5 5.5A5 5 0 1 0 13 9"/><path d="M13 2.5v3h-3"/>` },
    { id: "scale", label: "Scale", tip: "Scale the selected shape: the centre dot evenly, an axis handle along that axis, or type the size in mm or %; writes scale(…, { about }, …)", icon: `<rect x="2.5" y="6.5" width="7" height="7"/><path d="M8 2.5h5.5V8M13.5 2.5 8.5 7.5"/>` },
  ] },
  { group: "Create", items: [
    { id: "sketch", label: "Sketch", tip: "Sketch on a plane or a flat face: lines, arcs, circles, splines, constraints and dimensions", icon: `<path d="M2.5 13.5h11M3 11l7.5-7.5 2 2L5 13H3z"/>` },
    { id: "extrude", label: "Extrude", dialog: true, tip: "Extrude a flat face: join, cut or a new body", icon: `<path d="M3 11l5 2.5 5-2.5M3 11V6l5-2.5L13 6v5M8 8.5V13.5M3 6l5 2.5L13 6"/>` },
    { id: "revolve", label: "Revolve", dialog: true, tip: "Spin a flat face about one of its edges or an axis", icon: `<path d="M8 2v12"/><ellipse cx="8" cy="8" rx="5" ry="2.2"/>` },
    { id: "hole", label: "Hole", dialog: true, tip: "A simple, counterbored or countersunk hole where you click", icon: `<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2"/>` },
  ] },
  { group: "Modify", items: [
    { id: "presspull", label: "Press-pull", tip: "Drag a face along its normal: out grows, in shrinks, past the shape cuts", icon: `<path d="M3 10h10v3H3zM8 2v6M6 4l2-2 2 2"/>` },
    { id: "fillet", label: "Fillet", dialog: true, tip: "Round the edges you click", icon: `<path d="M3 13V8a5 5 0 0 1 5-5h5"/>` },
    { id: "chamfer", label: "Chamfer", dialog: true, tip: "Bevel the edges you click", icon: `<path d="M3 13V7l4-4h6"/>` },
    { id: "shell", label: "Shell", dialog: true, tip: "Hollow the selected shape, leaving the faces you click open", icon: `<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><rect x="5" y="5" width="6" height="6"/>` },
    { id: "combine", label: "Combine", dialog: true, tip: "Join, cut or intersect bodies", icon: `<circle cx="6" cy="8" r="4"/><circle cx="10" cy="8" r="4"/>` },
  ] },
  { group: "Pattern", items: [
    { id: "mirror", label: "Mirror", dialog: true, tip: "Copy the selected shape across a plane", icon: `<path d="M8 1.5v13" stroke-dasharray="1.5 1.5"/><path d="M6 4 2 12h4zM10 4l4 8h-4z"/>` },
    { id: "linear", label: "Linear", dialog: true, tip: "Copies of the selected shape in a row or grid", icon: `<rect x="2" y="2" width="4" height="4"/><rect x="10" y="2" width="4" height="4"/><rect x="2" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/>` },
    { id: "circular", label: "Circular", dialog: true, tip: "Copies of the selected shape around an axis", icon: `<circle cx="8" cy="8" r="5.5" stroke-dasharray="2 2"/><circle cx="8" cy="2.5" r="1.3"/><circle cx="13" cy="10.5" r="1.3"/><circle cx="3" cy="10.5" r="1.3"/>` },
  ] },
];
const GIZMO_MODE = { move: "translate", rotate: "rotate", scale: "scale" };
// Design-mode keys (only while Design is on and nothing is being typed in),
// shown in each button's tooltip. Close to Fusion's where Code mode's own keys
// allow: S sketch, E extrude, Q press-pull, F fillet, H hole, M move.
const KEYS = { select: "V", move: "M", rotate: "R", scale: "Shift+S", sketch: "S", extrude: "E", hole: "H",
  presspull: "Q", fillet: "F", chamfer: "Shift+F", combine: "B" };
// Press and hold a button for these: straight into a sketch tool, or a
// dialog opened on that choice.
const SUBS = {
  sketch: [["line", "Line"], ["rect", "Rectangle"], ["circle", "Circle"], ["arc", "Arc"], ["spline", "Spline"]].map(([v, l]) => ({ label: l, sketchTool: v })),
  extrude: [["join", "Join"], ["cut", "Cut"], ["new", "New body"]].map(([v, l]) => ({ label: l, preset: { op: v } })),
  revolve: [["join", "Join"], ["cut", "Cut"], ["new", "New body"]].map(([v, l]) => ({ label: l, preset: { op: v } })),
  hole: [["simple", "Simple"], ["counterbore", "Counterbore"], ["countersink", "Countersink"]].map(([v, l]) => ({ label: l, preset: { kind: v } })),
  combine: [["union", "Join"], ["difference", "Cut"], ["intersection", "Intersect"]].map(([v, l]) => ({ label: l, preset: { op: v } })),
};
const HOLD_MS = 350;
const tipFor = (t) => `${t.tip ?? t.label}${KEYS[t.id] ? ` (${KEYS[t.id]})` : ""}${SUBS[t.id] ? " · hold for options" : ""}`;

const CSS = `
body:not(.design-mode) .dz-ui { display: none !important; }
.dz-ui {
  position: fixed; z-index: 24;
  background: var(--card, #121826); color: var(--text, #dfe6f3);
  border: 1px solid var(--border, #26314a); border-radius: 10px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  font: 12.5px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.dz-ui button { font: inherit; color: inherit; }
.dz-empty { color: var(--muted, #8ea0c0); padding: 8px 10px; }
.dz-empty small { display: block; margin-top: 3px; }

/* scale panel: sizes in mm or %, a slicer's scale box */
#dz-scale { top: 56px; right: calc(12px + var(--dz-rcol, 0px)); width: 262px; padding: 8px 12px 10px; z-index: 100000; }
body.dz-ribbon #dz-scale { top: 104px; }
#dz-scale .hd { font-weight: 650; margin-bottom: 6px; }
#dz-scale label { display: flex; align-items: center; gap: 5px; margin: 4px 0; color: var(--muted, #8ea0c0); }
#dz-scale label > span { width: 14px; color: var(--text, #dfe6f3); font-weight: 600; }
#dz-scale input[type=number] { width: 72px; min-width: 0; padding: 3px 5px; border-radius: 6px; border: 1px solid var(--border, #26314a);
  background: var(--bg, #0c111c); color: var(--text, #dfe6f3); font: inherit; }
#dz-scale .ft { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
#dz-scale .ft button { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border, #26314a); background: transparent; cursor: pointer; }
#dz-scale .ft .ok { background: var(--accent, #3b6ef5); border-color: transparent; color: #fff; }

/* toolbar / ribbon */
#dz-bar { top: 12px; left: 168px; right: 12px; max-width: max-content; display: flex; align-items: stretch;
  padding: 3px; gap: 2px; border-radius: 999px; user-select: none; overflow-x: auto; scrollbar-width: none; }
#dz-bar.ribbon { border-radius: 10px; padding: 6px; gap: 8px; }
#dz-bar .dz-g { display: flex; gap: 2px; align-items: stretch; }
#dz-bar .dz-g + .dz-g { border-left: 1px solid var(--border, #26314a); padding-left: 4px; }
#dz-bar.ribbon .dz-g { flex-direction: column; gap: 4px; }
#dz-bar.ribbon .dz-g + .dz-g { padding-left: 8px; }
#dz-bar .dz-gl { display: none; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted, #8ea0c0); padding: 0 4px; }
#dz-bar.ribbon .dz-gl { display: block; }
#dz-bar .dz-gi { display: flex; gap: 2px; }
#dz-bar .dz-t { border: 0; background: transparent; border-radius: 999px; padding: 5px 8px; cursor: pointer;
  display: flex; align-items: center; gap: 5px; color: var(--muted, #8ea0c0); white-space: nowrap; }
#dz-bar .dz-t span { display: none; }
#dz-bar.ribbon .dz-t { flex-direction: column; border-radius: 8px; padding: 6px 8px; min-width: 54px; }
#dz-bar.ribbon .dz-t span { display: block; font-size: 11px; }
#dz-bar .dz-t:hover { color: var(--text, #dfe6f3); background: rgba(127, 150, 200, 0.12); }
#dz-bar .dz-t[aria-pressed="true"] { background: var(--accent, #1c66e5); color: #fff; }
#dz-bar .dz-t.p2 { opacity: 0.55; }
#dz-bar .dz-t.has-subs { position: relative; }
#dz-bar .dz-t.has-subs::after { content: ""; position: absolute; right: 3px; bottom: 3px; border: 3px solid transparent;
  border-right-color: currentColor; border-bottom-color: currentColor; opacity: 0.55; }
#dz-fly { padding: 4px; display: flex; flex-direction: column; min-width: 130px; z-index: 100001; }
#dz-fly button { border: 0; background: transparent; text-align: left; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
#dz-fly button:hover, #dz-fly button:focus-visible { background: rgba(127, 150, 200, 0.16); outline: none; }
#dz-bar .dz-snap { border: 0; background: transparent; color: var(--muted, #8ea0c0); cursor: pointer; padding: 5px 8px; border-radius: 999px; white-space: nowrap; }
#dz-bar .dz-snap:hover { color: var(--text, #dfe6f3); }
#dz-bar .dz-more { border: 0; background: transparent; color: var(--muted, #8ea0c0); cursor: pointer; padding: 5px 8px; border-radius: 999px; }
#dz-bar.ribbon .dz-more { align-self: flex-start; }

/* browser + selection */
#dz-side { top: 56px; left: 12px; width: 260px; max-height: calc(100vh - 190px); display: flex; flex-direction: column; overflow: hidden; }
body.dz-ribbon #dz-side { top: 104px; max-height: calc(100vh - 238px); }
#dz-side h3 { margin: 0; padding: 8px 10px 6px; font-size: 12px; font-weight: 650; display: flex; align-items: center; gap: 6px;
  border-bottom: 1px solid var(--border, #26314a); }
#dz-side h3 small { color: var(--muted, #8ea0c0); font-weight: 400; margin-left: auto; }
#dz-side .dz-fold { border: 0; background: transparent; cursor: pointer; padding: 0 2px; color: var(--muted, #8ea0c0); }
#dz-side.folded #dz-tree, #dz-side.folded #dz-sel { display: none; }
#dz-tree { overflow: auto; padding: 4px 0 6px; flex: 1 1 auto; min-height: 40px; }
.dz-group { padding: 6px 10px 2px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted, #8ea0c0); }
.dz-group small { text-transform: none; letter-spacing: 0; opacity: .8; }
.dz-row { display: flex; align-items: center; gap: 5px; width: 100%; border: 0; background: transparent; text-align: left;
  padding: 3px 10px 3px calc(10px + var(--depth, 0) * 14px); cursor: pointer; white-space: nowrap; min-height: 24px; }
.dz-row:hover { background: rgba(127, 150, 200, 0.12); }
.dz-row.on { background: color-mix(in srgb, var(--accent, #1c66e5) 30%, transparent); }
.dz-row.holds .dz-name { color: var(--accent, #6aa0ff); }
.dz-row.dead { opacity: 0.55; cursor: default; }
.dz-ico { display: inline-flex; color: var(--muted, #8ea0c0); flex: none; }
.dz-shape .dz-ico { color: #6aa0ff; }
.dz-boolean .dz-ico { color: #c08bff; }
.dz-op .dz-ico { color: #4fd1a5; }
.dz-name { font-weight: 600; }
.dz-id { font-size: 11px; padding: 0 5px; border-radius: 4px; background: rgba(127, 150, 200, 0.16); }
.dz-pat { font-size: 11px; color: #ffb35c; font-weight: 600; }
.dz-args { color: var(--muted, #8ea0c0); font: 11px ui-monospace, "Cascadia Code", Consolas, monospace; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
#dz-sel { border-top: 1px solid var(--border, #26314a); padding: 8px 10px 10px; flex: none; max-height: 40%; overflow: auto; }
#dz-sel:empty { display: none; }
#dz-sel .k { color: var(--muted, #8ea0c0); }
#dz-sel .dz-line { margin: 2px 0; overflow-wrap: anywhere; }
#dz-sel code { font: 11px ui-monospace, "Cascadia Code", Consolas, monospace; }
#dz-sel .dz-note { margin-top: 6px; padding: 6px 8px; border-radius: 6px; background: rgba(255, 179, 92, 0.12); color: #ffcf96; font-size: 11.5px; }
.dz-edges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.dz-edge { border: 1px solid var(--border, #26314a); background: transparent; border-radius: 5px; padding: 2px 6px; cursor: pointer;
  font: 11px ui-monospace, "Cascadia Code", Consolas, monospace; max-width: 100%; text-align: left; overflow-wrap: anywhere; }
.dz-edge:hover { border-color: #ffd166; color: #ffd166; }

/* the number box a double-clicked dot opens */
#dz-num { z-index: 40; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; min-width: 150px; }
#dz-num label { display: flex; align-items: center; gap: 8px; }
#dz-num label span { width: 54px; color: var(--muted, #8ea0c0); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#dz-num input { width: 80px; padding: 3px 6px; border-radius: 5px; border: 1px solid var(--border, #26314a);
  background: rgba(0, 0, 0, 0.25); color: inherit; font: 12px ui-monospace, "Cascadia Code", Consolas, monospace; }
#dz-num input:focus { outline: 2px solid var(--accent, #1c66e5); outline-offset: 0; }
#dz-num input.bad { border-color: #ff6b6b; }
#dz-num small { color: var(--muted, #8ea0c0); font-size: 10.5px; }

/* timeline */
#dz-time { left: 172px; right: 340px; bottom: 14px; padding: 6px 8px; display: flex; align-items: center; gap: 8px; }
#dz-time .dz-tl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted, #8ea0c0); flex: none; }
#dz-steps { display: flex; align-items: center; overflow-x: auto; flex: 1 1 auto; scrollbar-width: thin; padding: 2px 0; }
.dt-join { flex: none; width: 10px; height: 2px; background: var(--border, #26314a); }
.dt-step { flex: none; display: flex; align-items: center; gap: 5px; border: 1px solid var(--border, #26314a); background: transparent;
  border-radius: 6px; padding: 3px 7px; cursor: pointer; white-space: nowrap; }
.dt-step:hover { border-color: var(--accent, #1c66e5); }
.dt-step.on { background: color-mix(in srgb, var(--accent, #1c66e5) 30%, transparent); border-color: var(--accent, #1c66e5); }
.dt-step.rel { border-color: color-mix(in srgb, var(--accent, #1c66e5) 60%, transparent); }
.dt-step.dead { opacity: 0.55; }
.dt-n { font-size: 10px; color: var(--muted, #8ea0c0); }
.dt-step.fail { border-color: #ff5c5c; background: rgba(255, 92, 92, 0.16); color: #ffc2c2; }
.dt-step.unbuilt { opacity: 0.4; border-style: dashed; }
.dt-fail-note { flex: none; margin-left: 8px; color: #ff9c9c; font-size: 11.5px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#dz-pp-label { position: fixed; z-index: 40; pointer-events: none; padding: 2px 7px; border-radius: 6px; font: 600 12px ui-monospace, Consolas, monospace;
  background: rgba(10, 14, 24, 0.85); color: #9ff0d2; border: 1px solid #2f6e5a; }
#dz-pp-label.cut { color: #ffb3b3; border-color: #7a3434; }
.dt-prim { border-left: 3px solid #6aa0ff; }
.dt-bool { border-left: 3px solid #c08bff; }
.dt-op { border-left: 3px solid #4fd1a5; }

@media (max-width: 760px) {
  #dz-side { width: 200px; max-height: 40vh; }
  #dz-time { left: 12px; right: 12px; bottom: auto; top: 56px; margin-left: 212px; }
}
`;

const svg = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

export function initDesignShell(host) {
  const { THREE, scene, code } = host;
  if (!document.getElementById("dz-css")) {
    const st = document.createElement("style");
    st.id = "dz-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---- DOM ----
  const bar = document.createElement("div");
  bar.id = "dz-bar";
  bar.className = "dz-ui";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Design tools");
  bar.innerHTML = TOOLS.map((g) => `<div class="dz-g"><div class="dz-gl">${g.group}</div><div class="dz-gi">`
      + g.items.map((t) => `<button type="button" class="dz-t${SUBS[t.id] ? " has-subs" : ""}" data-tool="${t.id}" title="${esc(tipFor(t))}"`
        + `${t.dialog ? "" : ` aria-pressed="false"`}>${svg(t.icon)}<span>${t.label}</span></button>`).join("")
      + `</div></div>`).join("")
    + `<div class="dz-g"><div class="dz-gl">Snap</div><div class="dz-gi"><button type="button" class="dz-snap" title="Move snap (click to change)">1 mm</button></div></div>`
    + `<button type="button" class="dz-more" title="Show the full ribbon (or double-click the toolbar)" aria-expanded="false">▾</button>`;

  const side = document.createElement("div");
  side.id = "dz-side";
  side.className = "dz-ui";
  side.innerHTML = `<h3><button type="button" class="dz-fold" title="Fold the browser" aria-expanded="true">▾</button>Browser<small></small></h3>`
    + `<div id="dz-tree" role="tree" aria-label="Model browser"></div><div id="dz-sel" aria-live="polite"></div>`;

  const time = document.createElement("div");
  time.id = "dz-time";
  time.className = "dz-ui";
  time.innerHTML = `<span class="dz-tl">Timeline</span><div id="dz-steps" role="list" aria-label="Feature timeline"></div>`;
  document.body.append(bar, side, time);
  const treeEl = side.querySelector("#dz-tree"), selEl = side.querySelector("#dz-sel");
  const countEl = side.querySelector("h3 small"), stepsEl = time.querySelector("#dz-steps");

  // ---- state ----
  let active = false;
  let tool = "move";
  let selectedFid = null;
  let pickedRow = null;           // the row a browser click selected (a boolean, say)
  let face = null;                // { mesh, name, edges }
  let tree = { ok: true, groups: [] };
  let steps = [];
  let snapIx = 0;
  let dialog = null;              // the open feature dialog (design/dialogs.js)
  let failure = null;             // the last build's failure, as timeline steps
  let press = null;               // a press the shell owns: { x, y, pp? }
  let pressPull = null;           // design/presspull.js, once loaded

  // ---- face overlay: the picked face tinted, its edges drawn ----
  const overlay = new THREE.Group();
  overlay.name = "design-face-pick";
  scene.add(overlay);
  const faceMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true });
  const edgeHotMat = new THREE.LineBasicMaterial({ color: 0xff5c8a, depthTest: false, transparent: true });
  // pre-selection: the face under the pointer, tinted before you click it
  const hoverGroup = new THREE.Group();
  hoverGroup.name = "design-face-hover";
  scene.add(hoverGroup);
  const hoverMat = new THREE.MeshBasicMaterial({ color: 0x3b9dff, transparent: true, opacity: 0.28, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
  let hoverMesh = null;
  const setHoverFace = (mesh) => {
    if (mesh === hoverMesh) return;
    hoverMesh = mesh;
    for (const c of [...hoverGroup.children]) hoverGroup.remove(c);
    if (!mesh || mesh === face?.mesh) return;
    const t = new THREE.Mesh(mesh.geometry, hoverMat);
    t.matrixAutoUpdate = false;
    mesh.updateMatrixWorld(true);
    t.matrix.copy(mesh.matrixWorld);
    t.renderOrder = 989;
    hoverGroup.add(t);
  };
  const clearOverlay = () => { for (const c of [...overlay.children]) { if (c.isLine || c.isLineSegments) c.geometry.dispose(); overlay.remove(c); } };

  // ---- gizmo ----
  const gizmo = createMoveGizmo({
    THREE, scene, camera: host.camera, renderer: host.renderer, orbit: host.orbit,
    // the face tint marks where the face WAS; it would only mislead mid-drag
    onDragging(on) { overlay.visible = !on; if (on) setHoverFace(null); },
    // the live size while a scale handle drags, in the scale panel
    onScaling(k) { setScaleFields([k.x, k.y, k.z]); },
    onRelease(fid, d) {
      if (d.mode === "rotate" || d.mode === "scale") {
        const m = host.moveMembers(fid);
        if (!m) return;
        const text = host.text();
        const span = shapeSpan(text, m.span);
        const about = [d.about.x, d.about.y, d.about.z];
        const r = d.mode === "rotate" ? rotateText(text, span, d.axis, d.deg, about) : scaleText(text, span, d.factor, about);
        if (r.how === "none") return;
        host.commit(r.next);
        host.setHint(d.mode === "rotate"
          ? `Turned <b>${d.deg}°</b> about ${"XYZ"[d.axis]}: ${r.how === "fold" ? "folded into its" : "wrapped in"} <code>rotate(…, { about })</code>.`
          : `Scaled <b>×${[d.factor].flat().join(" × ")}</b>: ${r.how === "fold" ? "folded into its" : "wrapped in"} <code>scale(…, { about })</code>.`);
        return;
      }
      const r = host.commitMove(fid, d);
      if (r?.how && r.how !== "none") {
        host.setHint(`Moved by <b>[${[d.x, d.y, d.z].map((v) => Math.round(v * 10) / 10).join(", ")}]</b> mm: `
          + (r.how === "drill" ? "the drill's point was rewritten." : r.how === "fold" ? "folded into its <code>translate()</code>." : "wrapped in <code>translate()</code>."));
      }
    },
  });

  const attachGizmo = () => {
    if (gizmo.dragging) return;      // a rebuild mid-drag must not drop the drag
    host.handlesVisible?.(true);
    if (!active || !GIZMO_MODE[tool] || !selectedFid || dialog || sketcher?.active) { gizmo.detach(); closeScalePanel(); return; }
    if (gizmo.mode !== GIZMO_MODE[tool]) gizmo.setMode(GIZMO_MODE[tool]);
    const m = host.moveMembers(selectedFid);
    if (!m?.meshes.length) { gizmo.detach(); closeScalePanel(); return; }
    gizmo.attach(selectedFid, m);
    if (tool === "scale") showScalePanel(); else closeScalePanel();
    // rotate and scale have their own handles: the face dots and arrows would
    // be a second set on top (Move keeps them: they resize, the gizmo moves)
    host.handlesVisible?.(tool === "move");
  };

  // ---- scale panel: type the size in mm or %, proportions locked or not ----
  let scaleEl = null, scaleLock = true;
  const r2 = (v) => Math.round(v * 100) / 100;
  function closeScalePanel() { scaleEl?.remove(); scaleEl = null; }
  function showScalePanel() {
    const size = gizmo.size;
    if (!size) { closeScalePanel(); return; }
    if (!scaleEl) {
      scaleEl = document.createElement("form");
      scaleEl.id = "dz-scale";
      scaleEl.className = "dz-ui";
      scaleEl.setAttribute("aria-label", "Scale");
      scaleEl.addEventListener("keydown", (e) => e.stopPropagation());
      scaleEl.addEventListener("input", onScaleInput);
      scaleEl.addEventListener("submit", (e) => { e.preventDefault(); applyScale(); });
      scaleEl.addEventListener("click", (e) => { if (e.target.closest(".rs")) setScaleFields([1, 1, 1]); });
      document.body.appendChild(scaleEl);
    }
    scaleEl.dataset.s0 = [size.x, size.y, size.z].join(",");
    scaleEl.innerHTML = `<div class="hd">Scale</div>`
      + ["X", "Y", "Z"].map((a, i) => `<label><span>${a}</span><input type="number" step="any" min="0.01" name="mm${i}" aria-label="${a} size, mm"> mm`
        + `<input type="number" step="any" min="1" name="pc${i}" aria-label="${a} scale, percent"> %</label>`).join("")
      + `<label><input type="checkbox" name="lock"${scaleLock ? " checked" : ""}> Keep proportions</label>`
      + `<div class="ft"><button type="button" class="rs">Reset</button><button type="submit" class="ok">Apply</button></div>`;
    setScaleFields([1, 1, 1]);
  }
  // fill every field from per-axis factors (except the one being typed in)
  function setScaleFields(k) {
    if (!scaleEl) return;
    const s0 = scaleEl.dataset.s0.split(",").map(Number);
    for (let i = 0; i < 3; i++) {
      for (const [name, v] of [[`mm${i}`, r2(s0[i] * k[i])], [`pc${i}`, r2(k[i] * 100)]]) {
        const el = scaleEl.elements[name];
        if (el && el !== document.activeElement) el.value = v;
      }
    }
  }
  const scaleFactors = () => [0, 1, 2].map((i) => (parseFloat(scaleEl.elements[`pc${i}`].value) || 100) / 100);
  function onScaleInput(e) {
    const n = e.target.name;
    if (n === "lock") { scaleLock = e.target.checked; return; }
    const v = parseFloat(e.target.value);
    if (!(v > 0) || !/^(mm|pc)\d$/.test(n)) return;
    const i = +n[2], s0 = scaleEl.dataset.s0.split(",").map(Number);
    const k = n.startsWith("mm") ? v / s0[i] : v / 100;
    const f = scaleFactors();
    if (scaleLock) f.fill(k); else f[i] = k;
    setScaleFields(f);
  }
  function applyScale() {
    const fid = gizmo.fid, about = gizmo.origin;
    if (!fid || !about) return;
    const f = scaleFactors().map((v) => Math.round(v * 1000) / 1000);
    const factor = f.every((v) => v === f[0]) ? f[0] : f;
    if (f.every((v) => Math.abs(v - 1) < 1e-6)) return;
    const m = host.moveMembers(fid);
    if (!m) return;
    const text = host.text();
    const r = scaleText(text, shapeSpan(text, m.span), factor, [about.x, about.y, about.z]);
    if (r.how === "none") return;
    host.commit(r.next);
    host.setHint(`Scaled <b>×${f.join(" × ")}</b>: ${r.how === "fold" ? "folded into its" : "wrapped in"} <code>scale(…, { about })</code>.`);
  }

  // ---- rendering ----
  const draw = () => {
    const fm = host.featureMap();
    renderTree(treeEl, tree, { selectedFid, stale: !fm, onPick: pickRow });
    if (pickedRow && selectedFid) {
      const el = treeEl.querySelector(`[data-key="${pickedRow}"]`);
      if (el?.dataset.fids?.split(" ").includes(selectedFid)) {
        for (const x of treeEl.querySelectorAll(".dz-row.on")) { x.classList.remove("on"); x.classList.add("holds"); }
        el.classList.add("on");
      }
    }
    const shapes = fm ? Object.keys(fm).length : 0;
    countEl.textContent = fm ? `${shapes} shape${shapes === 1 ? "" : "s"}` : "building…";
    if (failure) {
      renderTimeline(stepsEl, failure.steps, { selectedFid, featureLabel: host.featureLabel, onPick: pickStep, failed: failure.index });
      const note = document.createElement("span");
      note.className = "dt-fail-note";
      note.textContent = `✕ ${failure.reason}`;
      note.title = failure.reason;
      stepsEl.appendChild(note);
    } else renderTimeline(stepsEl, steps, { selectedFid, featureLabel: host.featureLabel, onPick: pickStep });
    drawSelection();
  };

  const drawSelection = () => {
    if (!selectedFid) { selEl.textContent = ""; return; }
    const fm = host.featureMap();
    const site = fm?.[selectedFid];
    const m = host.moveMembers(selectedFid);
    const many = m && !m.span.whole && m.fids.length > 1;
    let html = `<div class="dz-line"><span class="k">Feature</span> <b>${esc(site?.kind ?? "?")}</b>`
      + (site?.name ? ` <span class="dz-id">${esc(site.name)}</span>` : "") + ` <code>${esc(selectedFid)}</code></div>`;
    if (m?.span.whole) html += `<div class="dz-line"><span class="k">Moves</span> the whole <code>${esc(m.span.label)}</code> (it is its main shape)</div>`;
    if (face) {
      html += `<div class="dz-line"><span class="k">Face</span> <code>${esc(face.name)}</code></div>`;
      if (face.edges.length) {
        html += `<div class="dz-line"><span class="k">Edges</span> <small class="k">(click to copy, for fillet / chamfer)</small></div>`
          + `<div class="dz-edges">${face.edges.map((e, i) => `<button type="button" class="dz-edge" data-i="${i}" title="Copy ${esc(e.name)}">${esc(e.name)}</button>`).join("")}</div>`;
      } else {
        html += `<div class="dz-line k">No named edges found around this face.</div>`;
      }
    } else {
      html += `<div class="dz-line k">Click a face on the model to see its name and edges.</div>`;
    }
    if (many) {
      html += `<div class="dz-note">This one call makes <b>${m.fids.length}</b> shapes (a loop, a helper or a variable used twice). `
        + `Moving it moves all ${m.fids.length}: the move edits the shared call. To move one on its own, give it its own call.</div>`;
    }
    selEl.innerHTML = html;
  };
  selEl.addEventListener("click", async (e) => {
    const b = e.target.closest(".dz-edge");
    if (!b || !face) return;
    const name = face.edges[+b.dataset.i]?.name;
    if (!name) return;
    try { await navigator.clipboard.writeText(`"${name}"`); } catch { /* clipboard blocked: the hint still shows it */ }
    host.setHint(`Edge <code>${esc(name)}</code> copied. Use it as <code>fillet({ r: 2, edges: ["${esc(name)}"] }, …)</code>.`);
  });
  selEl.addEventListener("pointerover", (e) => hotEdge(e.target.closest(".dz-edge")?.dataset.i ?? null));
  selEl.addEventListener("pointerout", () => hotEdge(null));
  function hotEdge(i) {
    for (const c of overlay.children) if (c.isLineSegments) c.material = c.userData.i === (i == null ? -1 : +i) ? edgeHotMat : edgeMat;
  }

  const refresh = () => {
    const fm = host.featureMap();
    tree = buildTree(code.value, fm, host.words);
    if (fm) {
      steps = linkFeatures(host.features(), {
        sites: fm, trace: host.trace(), runText: host.runText(), editorText: code.value,
      });
    }
    if (face && !face.mesh.parent) refindFace();
    draw();
    attachGizmo();
  };

  // ---- picking ----
  function pickRow(row) {
    const fid = primaryFid(row);
    pickedRow = row.key;
    if (fid && host.featureMap()?.[fid]) host.select(fid, { start: row.start, end: row.end });
    else host.selectRange(row);
    draw();
  }
  function pickStep(step) {
    pickedRow = null;
    const fm = host.featureMap();
    const fid = fm?.[step.id] ? step.id : step.refs.find((r) => fm?.[r]) ?? null;
    if (fid) host.select(fid, step.link ?? undefined);
    else if (step.link) host.selectRange(step.link);
    draw();
  }

  function showFace(mesh) {
    clearOverlay();
    const edges = host.edgesOfFace(mesh) || [];
    face = { mesh, name: mesh.userData.faceName, edges, solid: mesh.userData.solidName };
    const tint = new THREE.Mesh(mesh.geometry, faceMat);
    tint.matrixAutoUpdate = false;
    mesh.updateMatrixWorld(true);
    tint.matrix.copy(mesh.matrixWorld);
    tint.renderOrder = 990;
    overlay.add(tint);
    edges.forEach((e, i) => {
      if (!e.segments?.length) return;
      const pts = [];
      for (const [p, q] of e.segments) pts.push(p[0], p[1], p[2], q[0], q[1], q[2]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.LineSegments(g, edgeMat);
      line.renderOrder = 999;
      line.userData.i = i;
      overlay.add(line);
    });
  }
  // after a rebuild the picked face is a new mesh with the same name
  function refindFace() {
    const m = findFaceMesh(face.name, face.solid);
    if (m && active) showFace(m);
    else { face = null; clearOverlay(); }
  }
  function findFaceMesh(name, solid) {
    let hit = null;
    scene.traverse((o) => { if (!hit && o.isMesh && o.userData.faceName === name && o.userData.solidName === solid && o.parent !== overlay) hit = o; });
    return hit;
  }

  // ---- toolbar ----
  const setTool = (t) => {
    if (t !== "presspull") pressPull?.cancel();      // its hover arrows and any half pull go
    tool = t;
    for (const b of bar.querySelectorAll(".dz-t[aria-pressed]")) b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
    attachGizmo();
  };
  let ribbon = false;
  try { ribbon = localStorage.getItem(RIBBON_KEY) === "1"; } catch { /* default: thin */ }
  const setRibbon = (on) => {
    ribbon = on;
    bar.classList.toggle("ribbon", on);
    document.body.classList.toggle("dz-ribbon", on);   // the browser moves down out of its way
    const more = bar.querySelector(".dz-more");
    more.textContent = on ? "▴" : "▾";
    more.setAttribute("aria-expanded", String(on));
    more.title = on ? "Back to the thin toolbar" : "Show the full ribbon (or double-click the toolbar)";
    try { localStorage.setItem(RIBBON_KEY, on ? "1" : "0"); } catch { /* not remembered */ }
  };
  bar.addEventListener("click", (e) => {
    if (e.target.closest(".dz-more")) { setRibbon(!ribbon); return; }
    if (e.target.closest(".dz-snap")) {
      snapIx = (snapIx + 1) % SNAPS.length;
      const s = SNAPS[snapIx];
      e.target.closest(".dz-snap").textContent = s ? `${s} mm` : "free";
      gizmo.setSnap(s);
      return;
    }
    const b = e.target.closest(".dz-t");
    if (!b) return;
    if (heldOpen) { heldOpen = false; return; }      // the hold opened the flyout: not a click
    runTool(b.dataset.tool);
  });
  // what a button (or its key, or a flyout choice) does
  function runTool(id, sub = null) {
    const t = TOOLS.flatMap((g) => g.items).find((x) => x.id === id);
    if (!t) return;
    // a dialog or a sketch is one-off work: press-pull (a pointer mode) ends
    if ((t.dialog || t.id === "sketch") && tool === "presspull") setTool("select");
    if (t.dialog) { openFeature(t.id, sub?.preset); return; }
    if (t.id === "sketch") { openSketch(sub?.sketchTool); return; }
    // press-pull again: off, back to Select
    if (t.id === "presspull" && tool === "presspull") { setTool("select"); host.setHint(""); return; }
    setTool(t.id);
    if (t.id === "presspull") {
      loadPressPull();
      host.setHint("<b>Press-pull</b>: drag any flat face (or a round side) along its normal. Out grows, in shrinks; pushed past the shape it cuts on through. Esc or another tool to stop.");
    }
  }

  // press and hold a button with choices: a small flyout under it
  let holdT = 0, heldOpen = false, fly = null;
  const closeFly = () => { fly?.remove(); fly = null; removeEventListener("pointerdown", flyAway, true); };
  function flyAway(e) { if (fly && !fly.contains(e.target)) closeFly(); }
  function openFly(b) {
    closeFly();
    const subs = SUBS[b.dataset.tool];
    fly = document.createElement("div");
    fly.id = "dz-fly";
    fly.className = "dz-ui";
    fly.setAttribute("role", "menu");
    fly.innerHTML = subs.map((s, i) => `<button type="button" role="menuitem" data-i="${i}">${esc(s.label)}</button>`).join("");
    const r = b.getBoundingClientRect();
    fly.style.left = `${Math.round(r.left)}px`;
    fly.style.top = `${Math.round(r.bottom + 6)}px`;
    document.body.appendChild(fly);
    fly.addEventListener("click", (e) => {
      const i = e.target.closest("[data-i]")?.dataset.i;
      if (i == null) return;
      const id = b.dataset.tool;
      closeFly();
      runTool(id, subs[+i]);
    });
    fly.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") closeFly(); });
    fly.querySelector("button")?.focus();
    addEventListener("pointerdown", flyAway, true);
  }
  bar.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".dz-t.has-subs");
    clearTimeout(holdT);
    heldOpen = false;
    if (!b || e.button !== 0) return;
    holdT = setTimeout(() => { heldOpen = true; openFly(b); }, HOLD_MS);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) bar.addEventListener(ev, () => clearTimeout(holdT));
  bar.addEventListener("contextmenu", (e) => {       // right-click: the same choices
    const b = e.target.closest(".dz-t.has-subs");
    if (!b) return;
    e.preventDefault();
    openFly(b);
  });

  // Design keys (KEYS): not while typing, not while the sketcher has the keys
  addEventListener("keydown", (e) => {
    if (!active || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (sketcher?.active) return;
    if (e.key === "Escape" && tool === "presspull" && !pressPull?.dragging) { setTool("select"); host.setHint(""); return; }
    const k = (e.shiftKey ? "Shift+" : "") + (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const id = Object.keys(KEYS).find((x) => KEYS[x] === k);
    if (!id) return;
    e.preventDefault();
    e.stopImmediatePropagation();      // Code mode's own E / M / H must not fire too
    runTool(id);
  }, true);
  bar.addEventListener("dblclick", (e) => { if (!e.target.closest(".dz-t, .dz-snap, .dz-more")) setRibbon(!ribbon); });
  side.querySelector(".dz-fold").addEventListener("click", (e) => {
    const folded = side.classList.toggle("folded");
    e.currentTarget.textContent = folded ? "▸" : "▾";
    e.currentTarget.setAttribute("aria-expanded", String(!folded));
  });
  setRibbon(ribbon);
  setTool(tool);

  // the tree follows typing (marked stale until the build lands)
  let typingT = 0;
  code.addEventListener("input", () => {
    if (!active) return;
    clearTimeout(typingT);
    typingT = setTimeout(refresh, 250);
  });

  // ---- the number box a double-clicked dot opens ----
  let numBox = null;
  function numAway(e) { if (numBox && !numBox.contains(e.target)) closeNumbers(); }
  function closeNumbers() {
    removeEventListener("pointerdown", numAway, true);
    numBox?.remove();
    numBox = null;
  }

  // ---- feature dialogs ----
  let dialogsMod = null;
  async function openFeature(id, preset = null) {
    dialogsMod ??= await import("./design/dialogs.js");
    if (dialog) await dialog.cancel();
    // one tool at a time: a dialog over an open sketch could not take its picks
    if (sketcher?.active || sketcher?.choosing) sketcher.cancel();
    const sel = { fid: selectedFid, face: null };
    if (face?.mesh) {
      const fp = dialogsMod.facePick({ object: face.mesh, point: face.point ?? face.mesh.position }, THREE);
      if (fp) sel.face = { ...fp, hitPoint: face.point ? [face.point.x, face.point.y, face.point.z] : null };
    }
    gizmo.detach();
    dialog = dialogsMod.openDialog(id, {
      host, THREE, scene, sel, preset,
      onClose: () => { dialog = null; attachGizmo(); },
      markFailure: (f) => showFailure(f),
    });
    for (const x of bar.querySelectorAll(".dz-t")) x.classList.toggle("open", x.dataset.tool === id);
  }

  // ---- the sketcher (phase 3) ----
  let sketcher = null;
  async function loadSketcher() {
    if (sketcher) return sketcher;
    const mod = await import("./design/sketcher.js");
    sketcher = mod.createSketcher({ host, THREE, scene, camera: host.camera, orbit: host.orbit, renderer: host.renderer });
    // the rubber band follows the pointer between clicks; keys are the sketcher's while it is open
    host.renderer.domElement.addEventListener("pointermove", (e) => { if (sketcher.active && !press) sketcher.move(e); });
    addEventListener("keydown", (e) => {
      if (!active || !sketcher.active) return;
      if (sketcher.key(e)) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    return sketcher;
  }
  async function openSketch(startTool = null) {
    await loadSketcher();
    if (startTool) sketcher.preferTool(startTool);
    if (dialog) await dialog.cancel();
    gizmo.detach();
    let fp = null;
    if (face?.mesh) {
      dialogsMod ??= await import("./design/dialogs.js");
      fp = dialogsMod.facePick({ object: face.mesh, point: face.point ?? face.mesh.position }, THREE);
    }
    host.clearSelection();
    sketcher.choose({ face: fp?.outline ? fp : null });
  }

  // ---- a failed build in the timeline ----
  function showFailure(f) {
    if (!f) { failure = null; return; }
    const r = failedSteps(f, { words: host.words });
    failure = r ? { ...r, reason: f.reason } : { steps, index: -1, reason: f.reason };
    if (active) draw();
  }

  // ---- press-pull ----
  async function loadPressPull() {
    if (pressPull) return pressPull;
    const mod = await import("./design/presspull.js");
    pressPull = mod.createPressPull({ host, THREE, scene, camera: host.camera, orbit: host.orbit });
    // Esc mid-pull lets go without writing anything
    addEventListener("keydown", (e) => {
      if (active && e.key === "Escape" && pressPull.dragging) { e.preventDefault(); e.stopPropagation(); pressPull.cancel(); host.setHint("Press-pull cancelled."); }
    }, true);
    return pressPull;
  }

  // a press on the model that a dialog or press-pull takes for itself
  function onPressMove(e) {
    if (press?.pp) pressPull.move(e);
    else if (press?.sk) sketcher.move(e);
  }
  function onPressUp(e) {
    removeEventListener("pointermove", onPressMove, true);
    removeEventListener("pointerup", onPressUp, true);
    const p = press;
    press = null;
    if (!p) return;
    if (p.pp) { pressPull.up(e); return; }
    if (p.sk) { sketcher.up(e); return; }
    if (p.choose) { if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 5) sketcher.chooserClick(e); return; }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) return;    // an orbit
    const hit = host.pickAt(e.clientX, e.clientY);
    if (hit && dialog) dialog.takePick(hit);
  }

  // ---- what index.html calls ----
  let clearQueued = false;
  return {
    // A press on the stage: true when Design mode takes it (the viewer then
    // stays out of it, the camera still orbits on a drag).
    pressOwns(e) {
      if (!active || e.button !== 0) return false;
      if (sketcher?.active) {
        sketcher.down(e);
        press = { x: e.clientX, y: e.clientY, sk: true };
      } else if (sketcher?.choosing) {
        press = { x: e.clientX, y: e.clientY, choose: true };
      } else if (dialog) {
        press = { x: e.clientX, y: e.clientY };
      } else if (tool === "presspull" && pressPull) {
        // an arrow is a handle on its face: pressing it pulls that face
        const hit = pressPull.arrowAt(e.clientX, e.clientY) ?? host.pickAt(e.clientX, e.clientY);
        if (!hit || !pressPull.down(e, hit)) return false;
        press = { x: e.clientX, y: e.clientY, pp: true };
      } else return false;
      addEventListener("pointermove", onPressMove, true);
      addEventListener("pointerup", onPressUp, true);
      return true;
    },
    // every build's outcome (index.html fireBuilt)
    buildResult(ok, f) {
      if (ok) { if (failure) { failure = null; if (active) draw(); } return; }
      if (!dialog) showFailure(f);       // a dialog shows its own preview's failure
    },
    openFeature: (id) => openFeature(id),
    openSketch: () => openSketch(),
    sketcher: () => sketcher,
    dialog: () => dialog,
    pressPull: () => pressPull,
    setActive(on) {
      active = !!on;
      if (active) refresh();
      else { gizmo.detach(); clearOverlay(); face = null; setHoverFace(null); closeNumbers(); dialog?.cancel(); pressPull?.cancel(); if (sketcher?.active || sketcher?.choosing) sketcher.cancel(); }
    },
    // the viewer's selection changed (spawnHandles / clearHandles)
    onSelect(fid) {
      if (fid == null) {
        // clearHandles runs first inside every spawnHandles; only a clear
        // that is not followed by a new selection in the same tick is real
        selectedFid = null;
        if (!clearQueued) {
          clearQueued = true;
          queueMicrotask(() => {
            clearQueued = false;
            if (selectedFid) return;
            pickedRow = null;
            face = null;
            clearOverlay();
            gizmo.detach();
            if (active) draw();
          });
        }
        return;
      }
      const changed = fid !== selectedFid;
      selectedFid = fid;
      if (face && face.mesh.userData.featureId !== fid) { face = null; clearOverlay(); }
      if (!active) return;
      if (changed || gizmo.fid !== fid) attachGizmo();
      draw();
    },
    // a click on the model landed on this face mesh (after onSelect)
    pickFace(mesh, point = null) {
      if (!active || !mesh?.userData?.faceName) return;
      pickedRow = null;
      setHoverFace(null);
      showFace(mesh);
      if (face && point) face.point = point.clone();
      draw();
    },
    refresh() { if (active) refresh(); setHoverFace(null); },
    // index.html's hover tick: should it look for a face, and here it is
    wantsFaceHover() { return active && !gizmo.dragging && !pressPull?.dragging && !sketcher?.active; },
    hoverFace(mesh) {
      setHoverFace(active && !sketcher?.active ? mesh : null);
      pressPull?.hover(active && tool === "presspull" ? mesh : null);
    },
    gizmoOwnsPointer() { return active && gizmo.ownsPointer(); },
    isActive() { return active; },
    sketching() { return !!sketcher?.active; },
    // a double-clicked dot: a small box per number behind it, beside the
    // cursor. Enter writes them all (only the ones changed), Esc or a click
    // away cancels. `against` is the code the ranges were read from.
    editNumbers(fields, x, y, against) {
      closeNumbers();
      if (!active) return;
      if (!fields.length) {
        host.setHint("There is no plain number behind that dot to type (it is a name worked out from others, or an expression). Edit it in the code.");
        return;
      }
      const box = document.createElement("form");
      box.id = "dz-num";
      box.className = "dz-ui";
      box.setAttribute("aria-label", "Type exact values");
      box.innerHTML = fields.map((f, i) => `<label><span>${esc(f.label)}</span>`
        + `<input data-i="${i}" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(String(f.value))}" /></label>`).join("")
        + `<small>Enter to write · Esc to cancel</small>`;
      box.style.left = `${Math.min(x + 14, innerWidth - 220)}px`;
      box.style.top = `${Math.min(y + 10, innerHeight - 40 - fields.length * 30)}px`;
      document.body.appendChild(box);
      const inputs = [...box.querySelectorAll("input")];
      inputs[0].focus();
      inputs[0].select();
      const done = () => closeNumbers();
      box.addEventListener("keydown", (e) => {
        e.stopPropagation();        // the editor's and the app's shortcuts are not for this box
        if (e.key === "Escape") { e.preventDefault(); done(); }
        // a form with several fields and no button does not submit on Enter
        else if (e.key === "Enter") { e.preventDefault(); box.requestSubmit(); }
      });
      box.addEventListener("submit", (e) => {
        e.preventDefault();
        const edits = [];
        let bad = false;
        inputs.forEach((inp, i) => {
          const v = parseTyped(inp.value);
          inp.classList.toggle("bad", v === null);
          if (v === null) bad = true;
          else if (v !== fields[i].value) edits.push({ numStart: fields[i].numStart, numEnd: fields[i].numEnd, value: v });
        });
        if (bad) return;
        if (edits.length && !host.writeNumbers(edits, against)) {
          host.setHint("The code changed since that box opened, so nothing was written. Double-click the dot again.");
        }
        done();
      });
      // a click anywhere else is a cancel
      setTimeout(() => addEventListener("pointerdown", numAway, true), 0);
      numBox = box;
    },
    get numberBox() { return numBox ? [...numBox.querySelectorAll("input")].map((i) => i.value) : null; },
    // for tests and the console
    debug: () => ({ active, tool, selectedFid, hoverFace: hoverMesh?.userData.faceName ?? null, face: face && { name: face.name, edges: face.edges.map((e) => e.name) },
      dialog: dialog?.debug() ?? null, failure: failure && { reason: failure.reason, index: failure.index, step: failure.steps[failure.index]?.id ?? null },
      gizmoMode: gizmo.mode, gizmoHandles: gizmo.handles(), pressPull: pressPull?.debug() ?? null,
      sketch: sketcher?.debug() ?? null,
      rows: tree.groups.flatMap((g) => g.rows.map((r) => ({ group: g.key, name: r.name, depth: r.depth, fids: r.fids, pattern: r.pattern?.count ?? null }))),
      steps: steps.map((s) => ({ id: s.id, type: s.type, op: s.op, linked: !!s.link, text: s.link ? code.value.slice(s.link.start, s.link.end).slice(0, 40) : null })),
      gizmo: gizmo.fid }),
    gizmo,
  };
}
