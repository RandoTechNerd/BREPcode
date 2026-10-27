// design/sketcher.js — Design mode's sketcher (phase 3).
//
// Pick a plane (XY, XZ, YZ) or a flat face; the view turns square-on to it
// with a grid, and you draw: line, rectangle, circle, arc, spline, trim,
// offset, construction. Points snap to the grid (1 mm; Alt for free) and to
// the points already there. Constraints (coincident, horizontal, vertical,
// parallel, perpendicular, tangent, equal, fixed) and dimensions are solved by
// the kernel's own ConstraintSolver (through design/sketch-model.js and
// dsl.solveSketch2D, the same path sketch() builds with), and a dimension can
// be made a named const: a slider.
//
// Finish writes ONE edit: `const sketch1 = sketch({ … });` above the return,
// and, if asked, the extrude or revolve that uses it, joined to / cut from the
// body it was drawn on or as a new body. Editing a sketch() already in the code
// rewrites that call in place. Cancel leaves the code as it was.

import * as M from "./sketch-model.js";
import * as F from "./features.js";
import { planeFrame } from "../../src/dsl.js";
import { parseCode } from "../../src/codemap.js";

const CSS = `
#dz-sk { top: 56px; right: 12px; width: 300px; max-height: calc(100vh - 150px); overflow: auto; z-index: 31; }
body.dz-ribbon #dz-sk { top: 104px; }
#dz-sk h3 { margin: 0; padding: 9px 12px 7px; font-size: 13px; font-weight: 650; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border, #26314a); }
#dz-sk h3 small { color: var(--muted, #8ea0c0); font-weight: 400; }
#dz-sk .sec { padding: 7px 12px 2px; }
#dz-sk .sec > .k { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted, #8ea0c0); margin-bottom: 4px; }
#dz-sk .row { display: flex; flex-wrap: wrap; gap: 3px; }
#dz-sk .row button { border: 1px solid var(--border, #26314a); background: transparent; border-radius: 6px; padding: 3px 7px; cursor: pointer; font-size: 11.5px; color: inherit; }
#dz-sk .row button:hover { border-color: var(--accent, #1c66e5); }
#dz-sk .row button[aria-pressed="true"] { background: var(--accent, #1c66e5); border-color: var(--accent, #1c66e5); color: #fff; }
#dz-sk .row button kbd { font: 10px ui-monospace, Consolas, monospace; opacity: .6; margin-left: 3px; }
#dz-sk .msg { margin: 6px 12px 0; padding: 6px 8px; border-radius: 6px; font-size: 11.5px; background: rgba(127, 150, 200, 0.10); }
#dz-sk .msg.err { background: rgba(255, 92, 92, 0.14); color: #ffb3b3; }
#dz-sk .msg.ok { background: rgba(79, 209, 165, 0.12); color: #9ff0d2; }
#dz-sk label.f { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 12px; }
#dz-sk label.f span { width: 70px; color: var(--muted, #8ea0c0); }
#dz-sk input[type=number], #dz-sk select { flex: 1; min-width: 0; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--border, #26314a); background: rgba(0,0,0,.22); color: inherit; font: 12px ui-monospace, Consolas, monospace; }
#dz-sk .ft { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 12px 12px; }
#dz-sk .ft button { border: 1px solid var(--border, #26314a); background: transparent; border-radius: 7px; padding: 5px 12px; cursor: pointer; color: inherit; }
#dz-sk .ft .ok { background: var(--accent, #1c66e5); border-color: var(--accent, #1c66e5); color: #fff; font-weight: 600; }
.dz-dim { position: fixed; z-index: 30; padding: 1px 5px; border-radius: 5px; background: rgba(10, 14, 24, 0.85); border: 1px solid #3a5a9a;
  color: #cfe0ff; font: 600 11px ui-monospace, Consolas, monospace; cursor: pointer; white-space: nowrap; transform: translate(-50%, -50%); }
.dz-dim.named { border-color: #ffb35c; color: #ffd8a8; }
.dz-dim.sel { border-color: #ffd166; }
.dz-glyph { position: fixed; z-index: 29; font: 600 10px ui-monospace, Consolas, monospace; color: #8fd1ff; pointer-events: none; transform: translate(-50%, -50%); text-shadow: 0 0 3px #000; }
#dz-dim-edit { position: fixed; z-index: 41; padding: 6px 8px; display: flex; gap: 6px; align-items: center; }
#dz-dim-edit input { width: 80px; padding: 3px 6px; border-radius: 5px; border: 1px solid var(--border, #26314a); background: rgba(0,0,0,.25); color: inherit; font: 12px ui-monospace, Consolas, monospace; }
#dz-dim-edit button { border: 1px solid var(--border, #26314a); background: transparent; border-radius: 5px; padding: 2px 7px; cursor: pointer; color: inherit; font-size: 11.5px; }
`;

const TOOL_KEYS = { line: "L", rect: "R", circle: "C", arc: "A", spline: "S", trim: "T", offset: "O", construction: "X" };
const TOOL_LABEL = { line: "Line", rect: "Rectangle", circle: "Circle", arc: "Arc", spline: "Spline", trim: "Trim", offset: "Offset", construction: "Construction" };
const CON_LABEL = { coincident: "Coincident", horizontal: "Horizontal", vertical: "Vertical", parallel: "Parallel", perpendicular: "Perpendicular", tangent: "Tangent", equal: "Equal", fixed: "Fixed" };
const GLYPHS = { horizontal: "━", vertical: "│", parallel: "∥", perpendicular: "⟂", tangent: "⌒", equal: "=", fixed: "⏚", coincident: "●", onLine: "⏛", midpoint: "⋯" };
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const SNAP_PX = 9, PICK_PX = 7;
const CLOSE_PX = 14;     // a click this near the chain's first point closes the loop
const DRAG_TOOLS = new Set(["line", "rect", "circle"]);      // press-drag draws these too

let cssDone = false;

export function createSketcher({ host, THREE, scene, camera, orbit, renderer }) {
  if (!cssDone) {
    const st = document.createElement("style");
    st.id = "dz-sk-css";
    st.textContent = CSS;
    document.head.appendChild(st);
    cssDone = true;
  }
  const group = new THREE.Group();
  group.name = "design-sketch";
  group.renderOrder = 1000;
  scene.add(group);
  const mats = {
    curve: new THREE.LineBasicMaterial({ color: 0xe8eefc, depthTest: false, transparent: true }),
    cons: new THREE.LineDashedMaterial({ color: 0xffa94d, dashSize: 1.2, gapSize: 0.8, depthTest: false, transparent: true }),
    sel: new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true }),
    hover: new THREE.LineBasicMaterial({ color: 0x5ad1ff, depthTest: false, transparent: true }),
    rubber: new THREE.LineBasicMaterial({ color: 0x5ad1ff, depthTest: false, transparent: true, opacity: 0.85 }),
    close: new THREE.LineBasicMaterial({ color: 0x3ddc97, depthTest: false }),
    // drawn over the face it lies in: depth-tested, the face hid it in patches
    grid: new THREE.LineBasicMaterial({ color: 0x3a4a6a, transparent: true, opacity: 0.35, depthTest: false }),
    gridMajor: new THREE.LineBasicMaterial({ color: 0x5a6f98, transparent: true, opacity: 0.55, depthTest: false }),
    axis: new THREE.LineBasicMaterial({ color: 0x8aa2d8, transparent: true, opacity: 0.8, depthTest: false }),
    point: new THREE.PointsMaterial({ color: 0xffffff, size: 6, sizeAttenuation: false, depthTest: false, transparent: true }),
    pointSel: new THREE.PointsMaterial({ color: 0xffd166, size: 9, sizeAttenuation: false, depthTest: false, transparent: true }),
    pointFixed: new THREE.PointsMaterial({ color: 0xff6b6b, size: 7, sizeAttenuation: false, depthTest: false, transparent: true }),
  };

  // ---- state ----
  let S = null;        // { sk, frame, on, span (editing a call), name, tool, pending: [], sel: [], hover, saved camera, ... }
  let panel = null;
  const labels = [];   // dim labels and glyphs (DOM)

  // ---- plane <-> world <-> screen ----
  const toWorld = ([u, v]) => S.frame.origin.clone().addScaledVector(S.frame.x, u).addScaledVector(S.frame.y, v);
  const toScreen = (uv) => {
    const p = toWorld(uv).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height];
  };
  const plane3 = () => new THREE.Plane().setFromNormalAndCoplanarPoint(S.frame.n, S.frame.origin);
  function fromScreen(x, y) {
    const r = renderer.domElement.getBoundingClientRect();
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const hit = rc.ray.intersectPlane(plane3(), new THREE.Vector3());
    if (!hit) return null;
    const d = hit.sub(S.frame.origin);
    return [d.dot(S.frame.x), d.dot(S.frame.y)];
  }
  // mm per screen pixel near the sketch
  function mmPerPx() {
    const a = toScreen([0, 0]), b = toScreen([10, 0]);
    return 10 / Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  // where a click lands: an existing point (within SNAP_PX), else the grid
  function snap(x, y, free) {
    const uv = fromScreen(x, y);
    if (!uv) return null;
    const k = mmPerPx();
    const near = M.nearestPoint(S.sk, uv, SNAP_PX * k);
    if (near >= 0) return { uv: [...S.sk.points[near]], point: near };
    if (free) return { uv };
    const g = k > 0.5 ? 5 : k > 0.1 ? 1 : 0.5;
    return { uv: [Math.round(uv[0] / g) * g, Math.round(uv[1] / g) * g] };
  }

  // ---- drawing the sketch ----
  function curvePoints(c, pts = S.sk.points) {
    const P = c.ids.map((i) => pts[i]);
    if (c.kind === "line") return [P[0], P[1]];
    if (c.kind === "circle") return arcPts(P[0], c.r, 0, Math.PI * 2, 64);
    if (c.kind === "arc") {
      const r = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
      const a0 = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]);
      let a1 = Math.atan2(P[2][1] - P[0][1], P[2][0] - P[0][0]);
      if (a1 <= a0 + 1e-9) a1 += Math.PI * 2;
      return arcPts(P[0], r, a0, a1, 48);
    }
    // bezier
    const out = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24, u = 1 - t;
      out.push([0, 1].map((j) => u * u * u * P[0][j] + 3 * u * u * t * P[1][j] + 3 * u * t * t * P[2][j] + t * t * t * P[3][j]));
    }
    return out;
  }
  const arcPts = (c, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + (a1 - a0) * k / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });
  function polyline(list, mat) {
    const g = new THREE.BufferGeometry().setFromPoints(list.map((uv) => toWorld(uv)));
    const l = new THREE.Line(g, mat);
    if (mat.isLineDashedMaterial) l.computeLineDistances();
    l.renderOrder = 1001;
    return l;
  }
  function clearGroup(g) {
    for (const c of [...g.children]) { g.remove(c); c.geometry?.dispose(); }
  }
  const sketchGroup = new THREE.Group();
  const gridGroup = new THREE.Group();
  const rubberGroup = new THREE.Group();
  group.add(gridGroup, sketchGroup, rubberGroup);

  function drawGrid() {
    clearGroup(gridGroup);
    // the pad covers the whole model flattened onto the plane (S.ext, from
    // lookSquare); a big pad steps its grid up so it stays a few thousand lines
    const ext = S.ext || 150, step = ext > 300 ? 5 : 1, major = ext > 300 ? 50 : 10;
    const minor = [], maj = [];
    for (let v = -ext; v <= ext; v += step) {
      const list = v % major === 0 ? maj : minor;
      list.push(toWorld([v, -ext]), toWorld([v, ext]), toWorld([-ext, v]), toWorld([ext, v]));
    }
    const seg = (pts, mat) => { const g = new THREE.BufferGeometry().setFromPoints(pts); const l = new THREE.LineSegments(g, mat); l.renderOrder = 998; return l; };
    gridGroup.add(seg(minor, mats.grid), seg(maj, mats.gridMajor), seg([toWorld([-ext, 0]), toWorld([ext, 0]), toWorld([0, -ext]), toWorld([0, ext])], mats.axis));
  }
  function draw() {
    if (!S) return;
    clearGroup(sketchGroup);
    const sk = S.sk;
    const selCurves = new Set(S.sel.filter((s) => s.curve != null).map((s) => s.curve));
    const selPts = new Set(S.sel.filter((s) => s.point != null).map((s) => s.point));
    sk.curves.forEach((c, i) => {
      const mat = selCurves.has(i) ? mats.sel : S.hover?.curve === i ? mats.hover : c.construction ? mats.cons : mats.curve;
      sketchGroup.add(polyline(curvePoints(c), mat));
    });
    // points: the ends and centres curves use; a spline's Bezier handles
    // only while that curve is selected or under the pointer (a finished
    // spline is a smooth line, not a cloud of squares)
    const used = visiblePoints(selCurves);
    const fixed = new Set(sk.constraints.filter((c) => c.type === "fixed").flatMap((c) => c.ids));
    const buckets = { point: [], pointSel: [], pointFixed: [] };
    for (const i of used) (selPts.has(i) || S.hover?.point === i ? buckets.pointSel : fixed.has(i) ? buckets.pointFixed : buckets.point).push(toWorld(sk.points[i]));
    for (const [k, list] of Object.entries(buckets)) {
      if (!list.length) continue;
      const pts = new THREE.Points(new THREE.BufferGeometry().setFromPoints(list), mats[k]);
      pts.renderOrder = 1002;
      sketchGroup.add(pts);
    }
    drawLabels();
  }
  function visiblePoints(selCurves = new Set(S.sel.filter((s) => s.curve != null).map((s) => s.curve))) {
    const out = new Set();
    S.sk.curves.forEach((c, i) => {
      const open = selCurves.has(i) || S.hover?.curve === i;
      c.ids.forEach((id, k) => { if (c.kind !== "bezier" || k === 0 || k === 3 || open) out.add(id); });
    });
    return out;
  }
  // a spline through these points, as the polyline it will draw
  function splinePreview(pts, closed = false) {
    const tmp = { points: [], curves: [], constraints: [], dims: [] };
    M.addSpline(tmp, pts, { closed });
    return tmp.curves.flatMap((c, k) => curvePoints(c, tmp.points).slice(k ? 1 : 0));
  }
  // the first point of the chain being drawn, and whether (x, y) would close it
  function chainStartUV() {
    if (S.tool === "spline" && S.pending.length >= 3) return S.pending[0];
    if (S.tool === "line" && S.pending.chainStart != null && S.sk.points[S.pending.chainStart]
      && S.sk.curves.length && S.pending[0] !== S.sk.points[S.pending.chainStart]) return S.sk.points[S.pending.chainStart];
    return null;
  }
  const nearStart = (x, y, uv) => { const [sx, sy] = toScreen(uv); return Math.hypot(sx - x, sy - y) < CLOSE_PX; };
  function startRing(uv, hot) {
    const r = (hot ? 9 : 6) * mmPerPx();
    const ring = polyline(arcPts(uv, r, 0, Math.PI * 2, 32), hot ? mats.close : mats.rubber);
    ring.renderOrder = 1003;
    return ring;
  }
  function drawRubber(list, ring = null) {
    clearGroup(rubberGroup);
    for (const l of list || []) rubberGroup.add(polyline(l, mats.rubber));
    if (ring) rubberGroup.add(startRing(ring.uv, ring.hot));
  }

  // dims and constraint glyphs, as DOM labels that follow the view
  function drawLabels() {
    for (const el of labels.splice(0)) el.remove();
    if (!S) return;
    const sk = S.sk, P = sk.points;
    sk.dims.forEach((d, k) => {
      let at;
      if (d.type === "distance") {
        const [a, b] = [P[d.ids[0]], P[d.ids[1]]];
        const n = [-(b[1] - a[1]), b[0] - a[0]], l = Math.hypot(...n) || 1;
        const off = 5 * mmPerPx() * 3;
        at = [(a[0] + b[0]) / 2 + n[0] / l * off, (a[1] + b[1]) / 2 + n[1] / l * off];
      } else {
        at = [(P[d.ids[0]][0] + P[d.ids[2]][0]) / 2, (P[d.ids[0]][1] + P[d.ids[2]][1]) / 2];
      }
      label(at, `${d.name ? `${d.name} = ` : ""}${fmt(d.value)}${d.type === "angle" ? "°" : ""}`, d.name ? "dz-dim named" : "dz-dim", { dim: k });
    });
    sk.curves.forEach((c, i) => {
      if (c.kind !== "circle") return;
      const ctr = P[c.ids[0]];
      label([ctr[0] + c.r * 0.7071, ctr[1] + c.r * 0.7071], `R ${fmt(c.r)}`, "dz-dim", { radius: i });
    });
    // glyphs: one per constraint, by its first two points
    sk.constraints.forEach((c) => {
      const g = GLYPHS[c.type];
      if (!g) return;
      const a = P[c.ids[0]], b = P[c.ids[1] ?? c.ids[0]];
      const at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const [x, y] = toScreen(at);
      const el = document.createElement("div");
      el.className = "dz-glyph";
      el.textContent = g;
      el.style.left = `${x + 8}px`;
      el.style.top = `${y - 8}px`;
      document.body.appendChild(el);
      labels.push(el);
    });
  }
  function label(uv, text, cls, data) {
    const [x, y] = toScreen(uv);
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); editDim(data, x, y); });
    document.body.appendChild(el);
    labels.push(el);
  }
  const fmt = (v) => String(Math.round(v * 1000) / 1000);

  // ---- dim editing: a value, or a name (promote to a const param) ----
  let dimBox = null;
  function closeDimBox() { dimBox?.remove(); dimBox = null; }
  function editDim(data, x, y) {
    closeDimBox();
    const sk = S.sk;
    const cur = data.dim != null ? sk.dims[data.dim] : { value: sk.curves[data.radius].r, name: sk.curves[data.radius].rName };
    const box = document.createElement("form");
    box.id = "dz-dim-edit";
    box.className = "dz-ui";
    box.innerHTML = `<input type="number" step="any" value="${esc(cur.value)}" aria-label="Value" />`
      + (data.dim != null ? `<button type="button" class="pr" title="Make this dimension a named parameter (a slider)">${cur.name ? esc(cur.name) : "★ name"}</button>` : "")
      + `<button type="submit">OK</button>`;
    box.style.left = `${x + 10}px`;
    box.style.top = `${y + 10}px`;
    document.body.appendChild(box);
    dimBox = box;
    const inp = box.querySelector("input");
    inp.focus(); inp.select();
    box.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") closeDimBox(); });
    box.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v) || (data.radius != null && v <= 0)) { inp.style.borderColor = "#ff6b6b"; return; }
      if (data.dim != null) sk.dims[data.dim].value = v; else sk.curves[data.radius].r = v;
      closeDimBox();
      resolve("Dimension set.");
    });
    box.querySelector(".pr")?.addEventListener("click", () => {
      const name = prompt("Name for this dimension (it becomes a const at the top of the code, with a slider):", cur.name || suggestName());
      if (!name) return;
      const v = parseFloat(inp.value);
      if (Number.isFinite(v)) sk.dims[data.dim].value = v;
      const r = M.promoteDim(S.text, sk, data.dim, name.trim());
      if (r?.error) { setMsg(r.error, "err"); return; }
      S.text = r.text;
      closeDimBox();
      resolve(`<b>${esc(name)}</b> is a parameter now (a slider once the sketch is finished).`);
    });
  }
  function suggestName() {
    for (let i = 1; ; i++) { const n = `d${i}`; if (!new RegExp(`\\b${n}\\b`).test(S.text) && !S.sk.dims.some((d) => d.name === n)) return n; }
  }

  // ---- solve ----
  function resolve(msg) {
    try {
      M.solve(S.sk);
      const p = M.profileProblem(S.sk);
      setMsg(msg ?? (p ? `Not a closed profile yet: ${esc(p)}` : "Closed profile: ready to extrude or revolve."), p && !msg ? "" : "ok");
    } catch (e) {
      setMsg(`The solver could not satisfy that: ${esc(e.message || e)}`, "err");
    }
    draw();
    renderPanel();
  }

  // ---- the panel ----
  let msg = { text: "", cls: "" };
  const setMsg = (text, cls = "") => { msg = { text, cls }; renderPanel(); };
  function renderPanel() {
    if (!panel || !S) return;
    const t = S.tool;
    const p = M.profileProblem(S.sk);
    const axes = S.sk.curves.map((c, i) => [c, i]).filter(([c]) => c.kind === "line" && c.construction);
    panel.innerHTML = `<h3>Sketch <small>${esc(S.name)} · ${esc(planeLabel(S.on))}</small></h3>`
      + `<div class="sec"><span class="k">Draw</span><div class="row">${M.TOOLS.map((k) => `<button type="button" data-tool="${k}" aria-pressed="${t === k}" title="${TOOL_LABEL[k]} (${TOOL_KEYS[k]})">${TOOL_LABEL[k]}<kbd>${TOOL_KEYS[k]}</kbd></button>`).join("")}`
      + `<button type="button" data-tool="dim" aria-pressed="${t === "dim"}" title="Dimension (D): a line, two points, a circle or two lines">Dimension<kbd>D</kbd></button></div></div>`
      + `<div class="sec"><span class="k">Constrain the selection</span><div class="row">${M.CONSTRAINTS.map((k) => `<button type="button" data-con="${k}" title="${CON_LABEL[k]}">${GLYPHS[k] ?? ""} ${CON_LABEL[k]}</button>`).join("")}</div></div>`
      + (msg.text ? `<div class="msg ${msg.cls}">${msg.text}</div>` : "")
      + `<div class="sec"><span class="k">Finish as</span>`
      + `<label class="f"><span>Feature</span><select data-k="feat"><option value="extrude"${S.feat === "extrude" ? " selected" : ""}>Extrude</option><option value="revolve"${S.feat === "revolve" ? " selected" : ""}>Revolve</option><option value="none"${S.feat === "none" ? " selected" : ""}>Sketch only</option></select></label>`
      + (S.feat === "extrude" ? `<label class="f"><span>Distance</span><input type="number" data-k="h" step="1" value="${S.h}" /></label>` : "")
      + (S.feat === "revolve" ? `<label class="f"><span>Axis</span><select data-k="axis"><option value="y"${S.axis === "y" ? " selected" : ""}>sketch Y axis</option>`
        + axes.map(([, i], n) => `<option value="${i}"${String(S.axis) === String(i) ? " selected" : ""}>construction line ${n + 1}</option>`).join("") + `</select></label>`
        + `<label class="f"><span>Angle</span><input type="number" data-k="angle" step="15" value="${S.angle}" /></label>` : "")
      + (S.feat !== "none" ? `<label class="f"><span>Operation</span><select data-k="op">${[["join", "Join"], ["cut", "Cut"], ["new", "New body"]].map(([v, l]) => `<option value="${v}"${S.op === v ? " selected" : ""}${!S.body && v !== "new" ? " disabled" : ""}>${l}</option>`).join("")}</select></label>` : "")
      + `</div><div class="ft"><button type="button" class="look" title="Square on to the sketch again">Look at</button><button type="button" class="cancel">Cancel</button><button type="button" class="ok"${S.feat !== "none" && p ? " disabled title=\"" + esc(p) + "\"" : ""}>Finish</button></div>`;
  }
  const planeLabel = (on) => (typeof on === "string" ? `${on} plane` : "on a face");

  // ---- tools ----
  function setTool(t) {
    S.tool = t;
    S.pending = [];
    drawRubber([]);
    const hints = {
      line: "Click points; each click ends a line and starts the next. Esc ends the chain.",
      rect: "Click two opposite corners.",
      circle: "Click the centre, then a point on the rim.",
      arc: "Click the centre, the start, then the end (counter-clockwise).",
      spline: "Click the points it passes through; Enter (or double-click) finishes.",
      trim: "Click the piece of a line to cut away (between crossings).",
      offset: "Click a closed outline or a circle, then type the distance.",
      construction: "Click curves to make them construction (dashed, not part of the profile) or back.",
      dim: "Click a line, two points, a circle or two lines; then type the value.",
      select: "Click points or curves to select (Shift adds); drag a point to move it; Delete removes.",
    };
    setMsg(hints[t] ?? "");
  }

  // a click in the plane
  function click(x, y, e) {
    const sk = S.sk;
    const hitSel = pickAt(x, y);
    let sp = snap(x, y, e?.altKey);
    if (!sp) return;
    const t = S.tool;
    if (t === "line") {
      // near the chain's first point (a wider target than a snap): close on it
      const st = chainStartUV();
      if (st && nearStart(x, y, st)) sp = { uv: [...st], point: S.pending.chainStart };
      if (S.pending.length) {
        const ci = M.addLine(sk, S.pending[0], sp.uv);
        if (ci >= 0) { resolve(); if (sp.point != null && S.pending.chainStart != null && sp.point === S.pending.chainStart) { S.pending = []; drawRubber([]); return; } }
        const cs = S.pending.chainStart;
        S.pending = [sk.curves[sk.curves.length - 1] ? sk.points[sk.curves[sk.curves.length - 1].ids[1]] : sp.uv];
        S.pending.chainStart = cs;
      } else {
        S.pending = [sp.uv];
        S.pending.chainStart = M.pointAt(sk, sp.uv);
      }
    } else if (t === "rect") {
      if (S.pending.length) { M.addRect(sk, S.pending[0], sp.uv); S.pending = []; resolve(); } else S.pending = [sp.uv];
    } else if (t === "circle") {
      if (S.pending.length) {
        const r = Math.hypot(sp.uv[0] - S.pending[0][0], sp.uv[1] - S.pending[0][1]);
        if (r > 1e-6) { M.addCircle(sk, S.pending[0], r); resolve(); }
        S.pending = [];
      } else S.pending = [sp.uv];
    } else if (t === "arc") {
      S.pending.push(sp.uv);
      if (S.pending.length === 3) { M.addArc(sk, ...S.pending); S.pending = []; resolve(); }
    } else if (t === "spline") {
      // back on the first point: the loop closes and the spline is done
      if (S.pending.length >= 3 && nearStart(x, y, S.pending[0])) { finishSpline(true); return; }
      S.pending.push(sp.uv);
      if (e?.detail >= 2 && S.pending.length >= 2) finishSpline();
    } else if (t === "trim") {
      if (hitSel?.curve == null) { setMsg("Click on a curve to trim."); return; }
      const err = M.trim(sk, hitSel.curve, fromScreen(x, y));
      if (err) setMsg(err, "err"); else resolve("Trimmed.");
    } else if (t === "offset") {
      if (hitSel?.curve == null) { setMsg("Click a closed outline (or a circle) to offset."); return; }
      const d = parseFloat(prompt("Offset distance in mm (negative goes inward):", "2"));
      if (!Number.isFinite(d)) return;
      const err = M.offset(sk, hitSel.curve, d);
      if (err) setMsg(err, "err"); else resolve(`Offset by ${d} mm.`);
    } else if (t === "construction") {
      if (hitSel?.curve == null) return;
      M.toggleConstruction(sk, hitSel.curve);
      resolve();
    } else if (t === "dim") {
      if (!hitSel) return;
      S.sel.push(hitSel);
      const two = S.sel.length === 2;
      const one = S.sel.length === 1 && hitSel.curve != null && sk.curves[hitSel.curve].kind !== "line" ? true
        : S.sel.length === 1 && hitSel.curve != null && sk.curves[hitSel.curve].kind === "line" && !e?.shiftKey;
      if (two || one) {
        const r = M.dimension(sk, S.sel);
        S.sel = [];
        if (r.error) { setMsg(r.error, "err"); draw(); return; }
        draw();
        const lab = labels.find((l) => l.textContent && (r.dim != null ? true : true));
        const [lx, ly] = [x, y];
        editDim(r.dim != null ? { dim: r.dim } : { radius: r.radius }, lx, ly);
        void lab;
        return;
      }
      draw();
    } else {
      // select
      if (!hitSel) { if (!e?.shiftKey) S.sel = []; draw(); return; }
      if (!e?.shiftKey) S.sel = [];
      const i = S.sel.findIndex((s) => s.point === hitSel.point && s.curve === hitSel.curve);
      if (i >= 0) S.sel.splice(i, 1); else S.sel.push(hitSel);
      draw();
    }
    rubber(x, y);
  }
  function finishSpline(closed = false) {
    if (S.pending.length >= (closed ? 3 : 2)) { M.addSpline(S.sk, S.pending, { closed }); resolve(closed ? "Closed spline." : undefined); }
    S.pending = [];
    drawRubber([]);
  }
  // the rubber band from the pending clicks to the pointer
  function rubber(x, y) {
    if (!S.pending.length) { drawRubber([]); return; }
    const sp = snap(x, y, false);
    if (!sp) return;
    const a = S.pending[0], b = sp.uv;
    const t = S.tool;
    const start = chainStartUV();
    const hot = !!start && nearStart(x, y, start);
    const ring = start ? { uv: start, hot } : null;
    if (hot !== !!S.hotClose) { S.hotClose = hot; if (hot) setMsg("Click to close the loop."); }
    if (t === "line") drawRubber([[a, hot ? start : b]], ring);
    else if (t === "rect") drawRubber([[a, [b[0], a[1]], b, [a[0], b[1]], a]]);
    else if (t === "circle") drawRubber([arcPts(a, Math.hypot(b[0] - a[0], b[1] - a[1]), 0, Math.PI * 2, 64)]);
    else if (t === "arc") {
      if (S.pending.length === 1) drawRubber([[a, b]]);
      else {
        const s = S.pending[1], r = Math.hypot(s[0] - a[0], s[1] - a[1]);
        const a0 = Math.atan2(s[1] - a[1], s[0] - a[0]);
        let a1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (a1 <= a0) a1 += Math.PI * 2;
        drawRubber([arcPts(a, r, a0, a1, 48)]);
      }
    } else if (t === "spline") drawRubber([hot ? splinePreview(S.pending, true) : splinePreview([...S.pending, b])], ring);
  }
  // the point or curve under the pointer
  function pickAt(x, y) {
    const sk = S.sk;
    let best = null, bd = Infinity;
    const used = visiblePoints();
    for (const i of used) {
      const [sx, sy] = toScreen(sk.points[i]);
      const d = Math.hypot(sx - x, sy - y);
      if (d < SNAP_PX && d < bd) { bd = d; best = { point: i }; }
    }
    if (best) return best;
    sk.curves.forEach((c, i) => {
      const pl = curvePoints(c).map(toScreen);
      for (let k = 0; k + 1 < pl.length; k++) {
        const d = segPx(x, y, pl[k], pl[k + 1]);
        if (d < PICK_PX && d < bd) { bd = d; best = { curve: i }; }
      }
    });
    return best;
  }
  const segPx = (x, y, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1]], ap = [x - a[0], y - a[1]];
    const L = ab[0] ** 2 + ab[1] ** 2;
    const t = L ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / L)) : 0;
    return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1]);
  };

  // ---- pointer (the shell routes every press here while sketching) ----
  let drag = null;     // dragging a point in select mode
  function down(e) {
    if (e.button !== 0) return false;
    if (S.tool === "select") {
      const h = pickAt(e.clientX, e.clientY);
      if (h?.point != null) { drag = { point: h.point, moved: false }; orbit.enabled = false; }
    }
    S.downAt = [e.clientX, e.clientY, e.detail, e.shiftKey, e.altKey];
    return true;
  }
  function move(e) {
    if (!S) return;
    if (drag) {
      const uv = fromScreen(e.clientX, e.clientY);
      if (uv) { S.sk.points[drag.point] = uv; drag.moved = true; draw(); }
      return;
    }
    const h = pickAt(e.clientX, e.clientY);
    if ((h?.point ?? -1) !== (S.hover?.point ?? -1) || (h?.curve ?? -1) !== (S.hover?.curve ?? -1)) { S.hover = h; draw(); }
    // a press-drag being drawn: the rubber band from where it went down
    if (S.downAt && (e.buttons & 1) && DRAG_TOOLS.has(S.tool) && !S.pending.length) {
      const sp = snap(S.downAt[0], S.downAt[1], S.downAt[4]);
      if (sp) { S.pending = [sp.uv]; rubber(e.clientX, e.clientY); S.pending = []; }
      return;
    }
    rubber(e.clientX, e.clientY);
  }
  function up(e) {
    if (!S) return;
    if (drag) {
      const d = drag;
      drag = null;
      orbit.enabled = true;
      if (d.moved) {
        // the dragged point is held where it was let go while the rest re-solve
        S.sk.constraints.push({ type: "fixed", ids: [d.point], temp: true });
        resolve();
        S.sk.constraints = S.sk.constraints.filter((c) => !c.temp);
        draw();
        return;
      }
    }
    const [x0, y0, , , alt0] = S.downAt || [e.clientX, e.clientY];
    S.downAt = null;
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 5) {
      // A press-drag with a drawing tool draws (a click where it went down, a
      // click where it came up), as Fusion and SolidWorks take both; anything
      // else that moved was a pan.
      if (DRAG_TOOLS.has(S.tool) && !S.pending.length) {
        click(x0, y0, { detail: 1, altKey: alt0 });
        click(e.clientX, e.clientY, e);
        if (S.tool === "line") { S.pending = []; drawRubber([]); }
      }
      return;
    }
    click(e.clientX, e.clientY, e);
  }
  function key(e) {
    if (!S || dimBox) return false;
    // a field you are typing in keeps its keys; a hidden one (the code editor
    // while its card is closed) does not
    const el = e.target;
    const typing = !!el?.closest?.("input, select, textarea, [contenteditable]") && el.getClientRects().length > 0;
    if (typing && e.key !== "Escape") return false;
    const k = e.key.toUpperCase();
    if (e.key === "Escape") {
      if (S.pending.length) { if (S.tool === "spline") finishSpline(); S.pending = []; drawRubber([]); }
      else if (S.tool !== "select") setTool("select");
      else { S.sel = []; draw(); }
      renderPanel();
      return true;
    }
    if (e.key === "Enter" && S.tool === "spline") { finishSpline(); return true; }
    if ((e.key === "Delete" || e.key === "Backspace") && S.sel.length) {
      const curves = S.sel.filter((s) => s.curve != null).map((s) => s.curve).sort((a, b) => b - a);
      for (const ci of curves) M.removeCurve(S.sk, ci);
      S.sel = [];
      resolve("Deleted.");
      return true;
    }
    const tool = Object.entries(TOOL_KEYS).find(([, v]) => v === k)?.[0] ?? (k === "D" ? "dim" : null);
    if (tool && !e.ctrlKey && !e.metaKey) { setTool(tool); renderPanel(); return true; }
    return false;
  }

  // ---- camera: square on to the plane ----
  // Square on to the plane, framing the model and the sketch: the model's box
  // (and the sketch's points) flattened onto the plane, fitted to the view.
  function lookSquare(center) {
    S.lookCenter = center;
    if (!S.savedCam) S.savedCam = { pos: camera.position.clone(), up: camera.up.clone(), target: orbit.target.clone(), rotate: orbit.enableRotate };
    const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    const add = ([u, v]) => { lo[0] = Math.min(lo[0], u); lo[1] = Math.min(lo[1], v); hi[0] = Math.max(hi[0], u); hi[1] = Math.max(hi[1], v); };
    const box = new THREE.Box3();
    for (const m of host.modelMeshes()) box.expandByObject(m);
    if (!box.isEmpty()) {
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const d = new THREE.Vector3(x, y, z).sub(S.frame.origin);
        add([d.dot(S.frame.x), d.dot(S.frame.y)]);
      }
    }
    for (const p of S.sk.points) add(p);
    add(center);
    S.ext = Math.max(150, Math.ceil((Math.max(...lo.map(Math.abs), ...hi.map(Math.abs)) + 20) / 10) * 10);
    const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    const span = Math.max(40, hi[0] - lo[0], (hi[1] - lo[1]) * camera.aspect);
    const c = toWorld(mid);
    // 1.9: room for the browser on the left and the sketch panel on the right
    const dist = (span * 1.9) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 45) / 2)) / Math.max(1, camera.aspect);
    camera.up.copy(S.frame.y);
    camera.position.copy(c.clone().addScaledVector(S.frame.n, dist));
    orbit.target.copy(c);
    orbit.enableRotate = false;      // a sketch is drawn flat on; pan and zoom stay
    orbit.update();
  }
  const squareOn = () => { if (S) { lookSquare(S.lookCenter); drawLabels(); } };
  // a drag that starts ON the pad draws and never turns the view; off the pad
  // it may orbit (Look at squares it up again). The viewer's model-spin
  // handler asks this before it starts a spin.
  function offPad(e) {
    if (!S) return true;
    const uv = fromScreen(e.clientX, e.clientY);
    return !uv || Math.abs(uv[0]) > S.ext || Math.abs(uv[1]) > S.ext;
  }
  function restoreCam() {
    const s = S?.savedCam;
    if (!s) return;
    camera.up.copy(s.up);
    camera.position.copy(s.pos);
    orbit.target.copy(s.target);
    orbit.enableRotate = s.rotate;
    orbit.update();
  }

  // ---- finish: the code ----
  // The code the sketch finishes as. S.orig is the text it opened on (every
  // span was read from it); S.text is that with any new params put on top.
  // The sketch is compacted first, so a revolve's axis numbers are the ones
  // written.
  function finishText() {
    const sk = M.compact(S.sk);
    let text = S.text;
    // a named dim's const takes its (maybe edited) value
    for (const d of sk.dims) {
      if (!d.name) continue;
      text = text.replace(new RegExp(`((?:^|\\n)\\s*(?:const|let|var)\\s+${d.name}\\s*=\\s*)(-?[\\d.]+)`), (_, a) => a + fmt(d.value));
    }
    // params live at the top, above anything the spans point at
    const shift = text.length - S.orig.length;
    const moved = (sp) => sp && { start: sp.start + shift, end: sp.end + shift };
    if (S.span) {
      // editing a sketch() already in the code: rewrite that call (its indent kept)
      const { start, end } = moved(S.span);
      const indent = /(^|\n)([ \t]*)[^\n]*$/.exec(text.slice(0, start))?.[2] ?? "";
      return text.slice(0, start) + M.sketchCode(sk, indent) + text.slice(end);
    }
    const name = S.name;
    const use = S.feat === "extrude" ? `linearExtrude({ h: ${fmt(Math.abs(S.h))}${S.op === "cut" ? ", reverse: true, proud: 0.5" : ""} }, ${name})`
      : S.feat === "revolve" ? `revolve({ angle: ${fmt(S.angle)}${S.axis === "y" ? "" : `, axis: [${sk.curves[S.axis].ids.join(", ")}]`} }, ${name})`
      : null;
    // the feature, against the body the sketch was drawn on (spans read from
    // the text before the sketch is declared, so they still hold)
    if (use) {
      if (S.body && S.op !== "new") text = (S.op === "cut" ? F.addTool(text, moved(S.body), use) : F.addTool(text, moved(S.body), use, "union")).next;
      else text = newBody(text, use);
    }
    return declare(text, `const ${name} = ${M.sketchCode(sk, "")};\n`);
  }
  // a new body: into the returned group(), beside the returned shape, or the
  // first shape of an empty model
  function newBody(text, use) {
    const ret = returnExpr(text);
    if (!ret) return text.replace(/\s*$/, "") + `\nreturn ${use};\n`;
    return F.newBodyText(text, ret, use).next;
  }
  // The top-level return's expression ({ start, end }), or a bare final
  // expression statement (the editor's no-return form) turned into a return.
  function returnExpr(text) {
    const m = parseCode(text);
    if (!m.ok) return null;
    const re = /(^|\n)[ \t]*return\s+/g;
    let last = null, k;
    while ((k = re.exec(text))) last = k;
    if (!last) return null;
    const at = last.index + last[0].length;
    const c = m.calls.find((x) => x.start === at);
    return c ? { start: c.start, end: c.end } : null;
  }
  // the declaration goes on the line above the top-level return (or first,
  // when the code is a bare expression it then returns)
  function declare(text, decl) {
    const re = /(^|\n)([ \t]*)return\s/g;
    let last = null, k;
    while ((k = re.exec(text))) last = k;
    if (last) {
      const at = last.index + last[1].length;
      return text.slice(0, at) + last[2] + decl + text.slice(at);
    }
    const body = text.trim();
    return body ? `${decl}return ${body.replace(/;\s*$/, "")};\n` : decl;
  }

  // ---- open / close ----
  function open({ on, sketchCall = null, name = null, body = null, center = null }) {
    close();
    const text = host.text();
    let sk, span = null;
    if (sketchCall) {
      sk = M.readSketch(text, sketchCall);
      span = { start: sketchCall.start, end: sketchCall.end };
    } else sk = M.emptySketch(on);
    S = {
      sk, on: sk.on, frame: planeFrame(sk.on), span, text, orig: text, name: name || nextName(text),
      tool: "line", pending: [], sel: [], hover: null, feat: span ? "none" : "extrude", h: 10, angle: 360, axis: "y",
      op: body ? "join" : "new", body,
    };
    const ctr = center ?? (sk.points.length ? sk.points.reduce((a, p) => [a[0] + p[0] / sk.points.length, a[1] + p[1] / sk.points.length], [0, 0]) : [0, 0]);
    lookSquare(ctr);
    drawGrid();
    panel = document.createElement("div");
    panel.id = "dz-sk";
    panel.className = "dz-ui";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Sketch");
    document.body.appendChild(panel);
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("change", onPanelChange);
    panel.addEventListener("keydown", (e) => e.stopPropagation());
    setTool(nextTool || "line");
    nextTool = null;
    resolve(span ? "Editing the sketch. Finish rewrites its call." : undefined);
    if (!span && S.tool === "line") setMsg("Draw. " + "Click points; each click ends a line and starts the next. Esc ends the chain.");
    orbit.addEventListener?.("change", onView);
    orbit.spinGate = offPad;
    return api;
  }
  const onView = () => { if (S) drawLabels(); };
  function nextName(text) {
    for (let i = 1; ; i++) if (!new RegExp(`\\bsketch${i}\\b`).test(text)) return `sketch${i}`;
  }
  function onPanelClick(e) {
    const tb = e.target.closest("[data-tool]");
    if (tb) { setTool(tb.dataset.tool); renderPanel(); return; }
    const cb = e.target.closest("[data-con]");
    if (cb) {
      const err = M.constrain(S.sk, cb.dataset.con, S.sel);
      if (err) { setMsg(`${CON_LABEL[cb.dataset.con]}: ${err}.`, "err"); return; }
      S.sel = [];
      resolve(`${CON_LABEL[cb.dataset.con]} added.`);
      return;
    }
    if (e.target.closest(".cancel")) { cancel(); return; }
    if (e.target.closest(".look")) { squareOn(); return; }
    if (e.target.closest(".ok")) finish();
  }
  function onPanelChange(e) {
    const k = e.target.dataset.k;
    if (!k) return;
    const v = e.target.type === "number" ? parseFloat(e.target.value) : e.target.value;
    if (k === "h" || k === "angle") { if (Number.isFinite(v)) S[k] = v; }
    else S[k] = v;
    renderPanel();
  }
  async function finish() {
    const p = M.profileProblem(S.sk);
    if (S.feat !== "none" && p) { setMsg(`Not a profile yet: ${esc(p)}`, "err"); return; }
    // the sketch is written into the code as it was when it opened: anything
    // changed since (typed, or another tool) would be silently undone
    if (host.text() !== S.orig) { setMsg("The code changed while this sketch was open, so Finish would undo that. Cancel and sketch again.", "err"); return; }
    let next;
    try { next = finishText(); } catch (e) { setMsg(esc(e.message || e), "err"); return; }
    close();
    const res = await host.commit(next);
    host.setHint(res.ok ? "Sketch finished: written into the code as <code>sketch({ … })</code>."
      : `The sketch was written, but the build failed: ${esc(res.failure?.reason ?? "")}. Ctrl+Z takes it back.`);
  }
  function cancel() { endChoose(); close(); host.setHint("Sketch cancelled; the code is as it was."); }
  function close() {
    if (!S) return;
    closeDimBox();
    restoreCam();
    if (orbit.spinGate === offPad) orbit.spinGate = null;
    if (drag) { drag = null; orbit.enabled = true; }     // closed mid point-drag
    clearGroup(sketchGroup); clearGroup(gridGroup); clearGroup(rubberGroup);
    for (const el of labels.splice(0)) el.remove();
    panel?.remove();
    panel = null;
    orbit.removeEventListener?.("change", onView);
    S = null;
  }

  // ---- where to sketch: a world plane, a flat face clicked, or a sketch() to edit ----
  let chooser = null;
  // the tool a new sketch starts with (a held Sketch button's choice)
  let nextTool = null;
  function preferTool(t) {
    if (!M.TOOLS.includes(t)) return;
    if (S) { setTool(t); renderPanel(); } else nextTool = t;
  }
  function choose({ face = null } = {}) {
    close();
    endChoose();
    // a flat face already picked: straight onto it
    if (face?.outline) { openOnFace(face); return; }
    const text = host.text();
    const m = parseCode(text);
    const existing = m.ok ? m.calls.filter((c) => c.name === "sketch").map((c) => {
      const nm = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(text.slice(Math.max(0, c.start - 60), c.start))?.[1] ?? "sketch";
      return { name: nm, start: c.start, end: c.end };
    }) : [];
    chooser = document.createElement("div");
    chooser.id = "dz-sk";
    chooser.className = "dz-ui";
    chooser.innerHTML = `<h3>Sketch</h3><div class="sec"><span class="k">New sketch on</span><div class="row">`
      + ["XY", "XZ", "YZ"].map((p) => `<button type="button" data-plane="${p}">${p} plane</button>`).join("")
      + `</div><div class="msg">…or click a flat face of the model.</div></div>`
      + (existing.length ? `<div class="sec"><span class="k">Edit</span><div class="row">${existing.map((e, i) => `<button type="button" data-edit="${i}">${esc(e.name)}</button>`).join("")}</div></div>` : "")
      + `<div class="ft"><button type="button" class="cancel">Cancel</button></div>`;
    document.body.appendChild(chooser);
    chooser.addEventListener("click", (e) => {
      const p = e.target.closest("[data-plane]");
      if (p) { endChoose(); open({ on: p.dataset.plane }); return; }
      const ed = e.target.closest("[data-edit]");
      if (ed) { const x = existing[+ed.dataset.edit]; endChoose(); open({ sketchCall: x, name: x.name }); return; }
      if (e.target.closest(".cancel")) endChoose();
    });
    return existing.map((e) => e.name);
  }
  function endChoose() { chooser?.remove(); chooser = null; }
  async function openOnFace(fp) {
    const { facePlane, bodySpan } = F;
    const pl = facePlane(fp.outline);
    const text = host.text();
    const body = bodySpan(text, fp.fid, { sites: host.featureMap() || {}, trace: host.trace(), runText: host.runText() });
    const on = { origin: pl.origin, normal: pl.normal };
    const fr = planeFrame(on);
    const c = new THREE.Vector3(...fp.outline.point).sub(fr.origin);
    endChoose();
    return open({ on, body, center: [c.dot(fr.x), c.dot(fr.y)] });
  }
  let facePickFn = null;
  async function chooserClick(e) {
    const hit = host.pickAt(e.clientX, e.clientY);
    if (!hit) return;
    facePickFn ??= (await import("./dialogs.js")).facePick;
    const fp = facePickFn(hit, THREE);
    if (!fp?.outline) { chooser?.querySelector(".msg")?.replaceChildren(document.createTextNode(`${fp?.name ?? "That"} is not flat: click a flat face.`)); return; }
    openOnFace(fp);
  }

  const api = {
    open, close, cancel, finish, choose,
    get active() { return !!S; },
    get choosing() { return !!chooser; },
    chooserClick,
    preferTool,
    down, move, up, key,
    // for tests: work in plane coordinates
    tool: (t) => { setTool(t); renderPanel(); },
    clickPlane: (uv, opts = {}) => { const [x, y] = toScreen(uv); click(x, y, { detail: 1, ...opts }); },
    set: (k, v) => { S[k] = v; renderPanel(); },
    select: (list) => { S.sel = list; draw(); },
    constrain: (type) => { const err = M.constrain(S.sk, type, S.sel); S.sel = []; resolve(err ? undefined : `${type} added.`); return err; },
    dimension: (sel, value, name) => {
      const r = M.dimension(S.sk, sel, value);
      if (name && r.dim != null) { const pr = M.promoteDim(S.text, S.sk, r.dim, name); if (pr?.error) return pr.error; S.text = pr.text; }
      resolve(); return r.error ?? null;
    },
    toScreen: (uv) => toScreen(uv),
    debug: () => S && { sk: JSON.parse(JSON.stringify(S.sk)), tool: S.tool, name: S.name, on: S.on, msg: msg.text.replace(/<[^>]+>/g, ""), problem: M.profileProblem(S.sk), code: (() => { try { return finishText(); } catch (e) { return `ERR ${e.message}`; } })() },
  };
  return api;
}
