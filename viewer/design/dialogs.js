// design/dialogs.js — Design mode's feature dialogs (phase 2).
//
// Loaded the first time a feature tool is clicked. Each dialog is a small
// panel: a few fields, sometimes picks on the model (a face, edges, a point,
// bodies), and a status line. Every change is written as code by its writer
// in design/features.js and BUILT as a live preview (the real kernel, the
// real geometry, no undo step yet). OK keeps it as one undo step; Cancel or
// Esc puts the text back exactly as it was. A preview the kernel refuses
// says why, in red, here and in the timeline, and OK waits for a good one.

import * as F from "./features.js";
import { worldToPlane } from "../../src/dsl.js";
import { dragSpanFor } from "../assist.js";

const CSS = `
#dz-dlg { top: 56px; right: 12px; width: 286px; max-height: calc(100vh - 150px); overflow: auto; z-index: 31; }
body.dz-ribbon #dz-dlg { top: 104px; }
#dz-dlg h3 { margin: 0; padding: 9px 12px 7px; font-size: 13px; font-weight: 650; display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--border, #26314a); }
#dz-dlg h3 .x { margin-left: auto; border: 0; background: transparent; cursor: pointer; color: var(--muted, #8ea0c0); font-size: 15px; }
#dz-dlg .bd { padding: 8px 12px 4px; display: flex; flex-direction: column; gap: 7px; }
#dz-dlg label.f { display: flex; align-items: center; gap: 8px; }
#dz-dlg label.f > span { width: 92px; color: var(--muted, #8ea0c0); font-size: 12px; flex: none; }
#dz-dlg input[type=number], #dz-dlg select { flex: 1 1 auto; min-width: 0; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border, #26314a);
  background: rgba(0, 0, 0, 0.22); color: inherit; font: 12px ui-monospace, "Cascadia Code", Consolas, monospace; }
#dz-dlg input:focus, #dz-dlg select:focus { outline: 2px solid var(--accent, #1c66e5); outline-offset: 0; }
#dz-dlg .seg { display: flex; flex: 1 1 auto; border: 1px solid var(--border, #26314a); border-radius: 7px; overflow: hidden; }
#dz-dlg .seg button { flex: 1 1 0; border: 0; background: transparent; padding: 4px 4px; cursor: pointer; color: var(--muted, #8ea0c0); font-size: 11.5px; }
#dz-dlg .seg button + button { border-left: 1px solid var(--border, #26314a); }
#dz-dlg .seg button[aria-pressed="true"] { background: var(--accent, #1c66e5); color: #fff; }
#dz-dlg .pick { border: 1px dashed var(--border, #3a4867); border-radius: 7px; padding: 6px 8px; font-size: 12px; }
#dz-dlg .pick.armed { border-color: #ffd166; background: rgba(255, 209, 102, 0.07); }
#dz-dlg .pick b { font-weight: 600; }
#dz-dlg .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
#dz-dlg .chip { border: 1px solid var(--border, #26314a); border-radius: 5px; padding: 1px 6px; font: 11px ui-monospace, Consolas, monospace;
  background: transparent; cursor: pointer; max-width: 100%; overflow-wrap: anywhere; text-align: left; }
#dz-dlg .chip:hover { border-color: #ff6b6b; color: #ff9c9c; text-decoration: line-through; }
#dz-dlg .st { margin: 4px 12px 0; padding: 6px 8px; border-radius: 6px; font-size: 11.5px; background: rgba(127, 150, 200, 0.10); }
#dz-dlg .st.ok { background: rgba(79, 209, 165, 0.12); color: #9ff0d2; }
#dz-dlg .st.err { background: rgba(255, 92, 92, 0.14); color: #ffb3b3; }
#dz-dlg .st.busy { color: var(--muted, #8ea0c0); }
#dz-dlg pre { margin: 6px 12px 0; padding: 6px 8px; border-radius: 6px; background: rgba(0, 0, 0, 0.25); font: 11px/1.4 ui-monospace, Consolas, monospace;
  white-space: pre-wrap; overflow-wrap: anywhere; max-height: 7.5em; overflow: auto; color: #cfe0ff; }
#dz-dlg .ft { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 12px 12px; }
#dz-dlg .ft button { border: 1px solid var(--border, #26314a); background: transparent; border-radius: 7px; padding: 5px 14px; cursor: pointer; }
#dz-dlg .ft .ok { background: var(--accent, #1c66e5); border-color: var(--accent, #1c66e5); color: #fff; font-weight: 600; }
#dz-dlg .ft .ok:disabled { opacity: 0.45; cursor: default; }
#dz-dlg small.k { color: var(--muted, #8ea0c0); font-size: 11px; }
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const OPS = [["join", "Join"], ["cut", "Cut"], ["new", "New body"]];

// ------------------------------------------------------------------ picks
//
// What a click on the model gives a dialog: the face under it (name, the
// feature it belongs to, its outline when it is flat, the hit point and the
// face normal there), read off the mesh the viewer drew.
export function facePick(hit, THREE) {
  const mesh = hit?.object;
  if (!mesh?.userData?.faceName) return null;
  mesh.updateMatrixWorld(true);
  const g = mesh.geometry;
  const outline = F.faceOutline({ positions: g.attributes.position.array, index: g.index?.array ?? null, matrix: mesh.matrixWorld.elements });
  let normal = outline?.normal ?? null;
  if (!normal && hit.face) {
    const n = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
    normal = [n.x, n.y, n.z];
  }
  return {
    mesh, name: mesh.userData.faceName, solid: mesh.userData.solidName, fid: mesh.userData.featureId,
    point: [hit.point.x, hit.point.y, hit.point.z], normal, outline,
  };
}

// The edge of a picked face nearest the click: by its drawn segments when the
// build gave them (a worker build), else by the face across it (the closest
// neighbour face to the click point).
export function nearestEdge(edges, point, meshes) {
  let best = null, bestD = Infinity;
  const segDist = (p, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = L ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
    return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
  };
  // the picked face borders every edge; the one across it tells them apart
  const picked = edges.length > 1 ? edges[0].faces?.find((f) => edges.every((e) => e.faces?.includes(f))) : null;
  for (const e of edges) {
    let d = Infinity;
    if (e.segments?.length) for (const [a, b] of e.segments) d = Math.min(d, segDist(point, a, b));
    else {
      // the nearest triangle side of the face across: its sides along the
      // shared edge lie right where the click is
      const across = (e.faces || []).filter((f) => f !== picked);
      for (const m of meshes) {
        if (!across.includes(m.userData.faceName)) continue;
        const pa = m.geometry.attributes.position.array, ix = m.geometry.index?.array;
        const n = ix ? ix.length : pa.length / 3;
        const v = (k) => { const i = (ix ? ix[k] : k) * 3; return [pa[i], pa[i + 1], pa[i + 2]]; };
        for (let t = 0; t + 2 < n; t += 3) {
          const [a, b, c] = [v(t), v(t + 1), v(t + 2)];
          d = Math.min(d, segDist(point, a, b), segDist(point, b, c), segDist(point, c, a));
        }
      }
    }
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// ------------------------------------------------------------- the dialogs
//
// spec: {
//   title, help,
//   fields: [{ key, label, type: "number" | "seg" | "check" | "select", … }],
//   picks:  { kind: "face" | "faces" | "edges" | "point" | "bodies", label, flat? },
//   init(env) -> state         (env.sel: the selection when it opened)
//   write(base, state, env) -> { next } | { error } | { wait: "message" }
// }
const SPECS = {
  extrude: {
    title: "Extrude",
    help: "Pick a flat face; it is pushed out (or cut in) as its own outline.",
    picks: { kind: "face", flat: true, label: "Face" },
    fields: [
      { key: "h", label: "Distance", type: "number", min: 0.1, step: 1, unit: "mm" },
      { key: "symmetric", label: "Symmetric", type: "check" },
      { key: "op", label: "Operation", type: "seg", options: OPS },
    ],
    init: (env) => ({ h: 10, symmetric: false, op: "join", face: env.flatFace() }),
    write(base, s, env) {
      if (!s.face?.outline) return { wait: "Click a flat face on the model." };
      const body = env.bodyOf(s.face.fid);
      if (!body) return { error: "That face has no call in the code to add to." };
      return F.extrudeText(base, body, s.face.outline, { h: s.h, mode: s.op, symmetric: s.symmetric, toPlane: env.toPlane(s.face.outline) });
    },
  },

  revolve: {
    title: "Revolve",
    help: "Pick a flat face and the axis to spin it about: one of its straight edges, or a world axis. The face must touch the axis.",
    picks: { kind: "face", flat: true, label: "Face" },
    fields: [
      { key: "axis", label: "Axis", type: "select", options: (s) => revolveAxes(s.face) },
      { key: "angle", label: "Angle", type: "number", min: 1, max: 360, step: 15, unit: "°" },
      { key: "op", label: "Operation", type: "seg", options: OPS },
    ],
    init: (env) => ({ angle: 360, op: "join", axis: "0", face: env.flatFace() }),
    write(base, s, env) {
      if (!s.face?.outline) return { wait: "Click a flat face on the model." };
      const ax = revolveAxes(s.face)[+s.axis];
      if (!ax) return { error: "Pick an axis." };
      const call = revolveCall(s.face.outline, ax, s.angle);
      if (call.error) return call;
      const body = env.bodyOf(s.face.fid);
      if (!body) return { error: "That face has no call in the code to add to." };
      if (s.op === "cut") return F.addTool(base, body, call.text);
      if (s.op === "join") return F.addTool(base, body, call.text, "union");
      return F.newBodyText(base, body, call.text);
    },
  },

  hole: {
    title: "Hole",
    help: "Click where the hole goes on a face; click again to move it.",
    picks: { kind: "point", label: "Position" },
    fields: [
      { key: "kind", label: "Type", type: "seg", options: [["simple", "Simple"], ["counterbore", "C-bore"], ["countersink", "C-sink"]] },
      { key: "d", label: "Diameter", type: "number", min: 0.2, step: 0.5, unit: "mm" },
      { key: "through", label: "Through all", type: "check" },
      { key: "depth", label: "Depth", type: "number", min: 0.2, step: 1, unit: "mm", when: (s) => !s.through },
      { key: "cbD", label: "C-bore Ø", type: "number", min: 0.2, step: 0.5, unit: "mm", when: (s) => s.kind === "counterbore" },
      { key: "cbDepth", label: "C-bore depth", type: "number", min: 0.1, step: 0.5, unit: "mm", when: (s) => s.kind === "counterbore" },
      { key: "csD", label: "C-sink Ø", type: "number", min: 0.2, step: 0.5, unit: "mm", when: (s) => s.kind === "countersink" },
      { key: "csAngle", label: "C-sink angle", type: "number", min: 30, max: 150, step: 1, unit: "°", when: (s) => s.kind === "countersink" },
    ],
    init: (env) => ({ kind: "simple", d: 5, through: false, depth: 10, cbD: 9, cbDepth: 3, csD: 10, csAngle: 90, at: env.sel?.face?.hitPoint ? { ...env.sel.face, point: env.sel.face.hitPoint } : null }),
    write(base, s, env) {
      if (!s.at) return { wait: "Click on a face where the hole goes." };
      const body = env.bodyOf(s.at.fid);
      if (!body) return { error: "That face has no call in the code to cut." };
      const point = s.at.point.map((v) => Math.round(v * 10) / 10);
      return F.addTool(base, body, F.holeCall({ ...s, point, normal: s.at.normal }));
    },
  },

  fillet: edgeSpec("fillet", "Fillet", "Radius", "r"),
  chamfer: edgeSpec("chamfer", "Chamfer", "Distance", "d"),

  shell: {
    title: "Shell",
    help: "Hollows the selected shape. Click faces to leave open (a box's top, say).",
    picks: { kind: "faces", label: "Open faces", optional: true },
    fields: [{ key: "wall", label: "Wall", type: "number", min: 0.2, step: 0.5, unit: "mm" }],
    init: (env) => ({ wall: 2, faces: [], fid: env.sel?.fid ?? null }),
    write(base, s, env) {
      const fid = s.fid ?? s.faces[0]?.fid;
      if (!fid) return { wait: "Select a shape (or click a face of it) first." };
      const shape = env.shapeOf(fid);
      if (!shape) return { error: "That shape has no call in the code." };
      const open = F.openKeys(s.faces.map((f) => f.normal));
      if (!open) return { error: "Only faces square to X, Y or Z can be left open." };
      return F.shellText(base, shape, { wall: s.wall, open });
    },
  },

  mirror: {
    title: "Mirror",
    help: "Copies the selected shape across a plane. Pick a flat face to mirror across it, or choose a world plane.",
    picks: { kind: "face", flat: true, label: "Plane face", optional: true },
    fields: [
      { key: "plane", label: "Plane", type: "seg", options: [["YZ", "YZ"], ["XZ", "XZ"], ["XY", "XY"], ["face", "Face"]] },
      { key: "at", label: "Offset", type: "number", step: 1, unit: "mm", when: (s) => s.plane !== "face" },
      { key: "join", label: "Join copy", type: "check" },
    ],
    init(env) {
      const box = env.selBox();
      return { plane: "YZ", at: box ? Math.round(box.max[0] * 100) / 100 : 0, join: false, fid: env.sel?.fid ?? null, face: null };
    },
    write(base, s, env) {
      if (!s.fid) return { wait: "Select a shape first." };
      const target = env.patternTarget(s.fid);
      let normal, at;
      if (s.plane === "face") {
        if (!s.face?.outline) return { wait: "Click the flat face to mirror across." };
        normal = s.face.outline.normal; at = normal.reduce((a, v, i) => a + v * s.face.outline.point[i], 0);
      } else {
        normal = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[s.plane]; at = s.at;
      }
      return F.mirrorText(base, target, { normal, at, join: s.join });
    },
  },

  linear: {
    title: "Linear pattern",
    help: "Copies of the selected shape in a row (and optionally a grid). A hole's cutter patterns as more holes.",
    fields: [
      { key: "dir", label: "Direction", type: "seg", options: [["X", "X"], ["Y", "Y"], ["Z", "Z"]] },
      { key: "count", label: "Count", type: "number", min: 2, max: 200, step: 1 },
      { key: "space", label: "Spacing", type: "number", step: 1, unit: "mm" },
      { key: "grid", label: "Second row", type: "check" },
      { key: "dir2", label: "Direction 2", type: "seg", options: [["X", "X"], ["Y", "Y"], ["Z", "Z"]], when: (s) => s.grid },
      { key: "count2", label: "Count 2", type: "number", min: 2, max: 200, step: 1, when: (s) => s.grid },
      { key: "space2", label: "Spacing 2", type: "number", step: 1, unit: "mm", when: (s) => s.grid },
      { key: "join", label: "Join copies", type: "check" },
    ],
    init(env) {
      const box = env.selBox();
      const sx = box ? Math.ceil((box.max[0] - box.min[0]) * 1.5) : 10, sy = box ? Math.ceil((box.max[1] - box.min[1]) * 1.5) : 10;
      return { dir: "X", count: 3, space: sx, grid: false, dir2: "Y", count2: 2, space2: sy, join: false, fid: env.sel?.fid ?? null };
    },
    write(base, s, env) {
      if (!s.fid) return { wait: "Select a shape first." };
      const step = AXES[s.dir].map((v) => v * s.space), step2 = AXES[s.dir2].map((v) => v * s.space2);
      return F.linearPatternText(base, env.patternTarget(s.fid), { count: s.count, step, count2: s.grid ? s.count2 : 1, step2, join: s.join });
    },
  },

  circular: {
    title: "Circular pattern",
    help: "Copies of the selected shape around an axis.",
    fields: [
      { key: "axis", label: "Axis", type: "seg", options: [["X", "X"], ["Y", "Y"], ["Z", "Z"]] },
      { key: "cx", label: "Centre x", type: "number", step: 1, unit: "mm" },
      { key: "cy", label: "Centre y", type: "number", step: 1, unit: "mm" },
      { key: "cz", label: "Centre z", type: "number", step: 1, unit: "mm" },
      { key: "count", label: "Count", type: "number", min: 2, max: 360, step: 1 },
      { key: "angle", label: "Angle", type: "number", min: 1, max: 360, step: 15, unit: "°" },
      { key: "join", label: "Join copies", type: "check" },
    ],
    init: (env) => ({ axis: "Z", cx: 0, cy: 0, cz: 0, count: 6, angle: 360, join: false, fid: env.sel?.fid ?? null }),
    write(base, s, env) {
      if (!s.fid) return { wait: "Select a shape first." };
      return F.circularPatternText(base, env.patternTarget(s.fid), { count: s.count, axis: AXES[s.axis], center: [s.cx, s.cy, s.cz], angle: s.angle, join: s.join });
    },
  },

  combine: {
    title: "Combine",
    help: "The selected body is the target; click the bodies to join to it, cut from it or keep where they overlap.",
    picks: { kind: "bodies", label: "Tool bodies" },
    fields: [{ key: "op", label: "Operation", type: "seg", options: [["union", "Join"], ["difference", "Cut"], ["intersection", "Intersect"]] }],
    init: (env) => ({ op: "union", fid: env.sel?.fid ?? null, bodies: [] }),
    write(base, s, env) {
      if (!s.fid) return { wait: "Select the target body first." };
      if (!s.bodies.length) return { wait: "Click the bodies to combine with it." };
      const target = env.bodyOf(s.fid);
      if (!target) return { error: "The target body has no call in the code." };
      const tools = s.bodies.map((b) => env.bodyOf(b.fid));
      if (tools.some((t) => !t || (t.start === target.start && t.end === target.end))) return { error: "Pick bodies other than the target." };
      return F.combineText(base, target, tools, s.op);
    },
  },
};

function edgeSpec(kind, title, label, key) {
  return {
    title,
    help: `Click edges on the model to ${kind} them (click a picked edge's name to drop it).`,
    picks: { kind: "edges", label: "Edges" },
    fields: [{ key: "amount", label, type: "number", min: 0.05, step: 0.5, unit: "mm" }],
    init: () => ({ amount: kind === "fillet" ? 2 : 1, edges: [] }),
    write(base, s, env) {
      if (!s.edges.length) return { wait: "Click the edges to " + kind + "." };
      const fid = s.edges[0].fid;
      const body = env.bodyOf(fid);
      if (!body) return { error: "That edge's shape has no call in the code." };
      if (s.edges.some((e) => { const b = env.bodyOf(e.fid); return !b || b.start !== body.start || b.end !== body.end; })) {
        return { error: "All the edges must be on one body." };
      }
      void key;
      return F.edgeOpText(base, body, { kind, amount: s.amount, edges: s.edges.map((e) => e.name) });
    },
  };
}

// The axes a face can revolve about: its straight edges (outline sides),
// then the world axes through the plane's origin.
function revolveAxes(face) {
  const out = [];
  const L = face?.outline?.loops?.[0];
  if (L && L.length <= 64) {
    L.forEach((p, i) => {
      const q = L[(i + 1) % L.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (len > 1e-6) out.push({ label: `edge ${out.length + 1} (${len.toFixed(1)} mm)`, p, d: [(q[0] - p[0]) / len, (q[1] - p[1]) / len, (q[2] - p[2]) / len] });
    });
  }
  for (const [k, d] of Object.entries(AXES)) out.push({ label: `world ${k}`, p: [0, 0, 0], d });
  return out;
}
// revolve({ angle, on }, polygon(...)) spinning the face's outline about axis
function revolveCall(outline, axis, angle) {
  const n = outline.normal;
  const a = axis.d;
  if (Math.abs(a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) > 1e-6) return { error: "That axis is not in the face's plane." };
  // the profile's x runs from the axis toward the face: x = a × n (then the
  // plane's y, n × x, is the axis itself)
  let x = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  const c = outline.point, p = axis.p;
  // the origin is the point on the axis nearest the face's middle
  const t = (c[0] - p[0]) * a[0] + (c[1] - p[1]) * a[1] + (c[2] - p[2]) * a[2];
  const origin = [p[0] + t * a[0], p[1] + t * a[1], p[2] + t * a[2]];
  if ((c[0] - origin[0]) * x[0] + (c[1] - origin[1]) * x[1] + (c[2] - origin[2]) * x[2] < 0) x = x.map((v) => -v);
  const plane = { origin, normal: n, x };
  const loc = outline.loops[0].map((q) => worldToPlane(plane, q));
  if (loc.some(([u]) => u < -1e-6)) return { error: "The face crosses the axis: pick an axis along one side of it." };
  const nrm = n.map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
  const text = `revolve({ angle: ${F.round(angle)}, on: { origin: ${F.vec(origin)}, normal: ${F.vec(nrm, 10000)}, x: ${F.vec(x, 10000)} } }, `
    + `polygon([${loc.map(([u, v]) => F.vec([Math.max(0, u), v])).join(", ")}]))`;
  return { text };
}

// ------------------------------------------------------------------ runtime

let cssDone = false;

// openDialog(id, ctx) -> controller
// ctx: { host, THREE, scene, sel: { fid, face } , onClose(), markFailure(failure, link) }
export function openDialog(id, ctx) {
  const spec = SPECS[id];
  if (!spec) throw new Error(`no dialog "${id}"`);
  if (!cssDone) {
    const st = document.createElement("style");
    st.id = "dz-dlg-css";
    st.textContent = CSS;
    document.head.appendChild(st);
    cssDone = true;
  }
  const { host, THREE, scene } = ctx;
  const base = host.text();
  // the build the dialog opened on: picks and spans are read against it
  const env0 = {
    sites: host.featureMap() || {}, trace: host.trace(), runText: host.runText(),
  };
  const env = {
    sel: ctx.sel,
    bodyOf: (fid) => F.bodySpan(base, fid, env0),
    shapeOf: (fid) => (env0.sites[fid] ? F.shapeSpan(base, env0.sites[fid]) : null),
    // a pattern or mirror copies what a move would move: the call (and the
    // transforms around it), or the whole boolean when it is the main shape.
    // Read against `base`: once a preview has built, the editor holds the
    // preview's text and its ranges are not base's.
    patternTarget: (fid) => {
      const site = env0.sites[fid];
      if (!site) return null;
      const span = dragSpanFor(base, site);
      return F.shapeSpan(base, { start: span.start, end: span.end });
    },
    toPlane: (outline) => { const pl = F.facePlane(outline); return (p) => worldToPlane(pl, p); },
    flatFace: () => (ctx.sel?.face?.outline ? ctx.sel.face : null),
    selBox: () => {
      if (!ctx.sel?.fid) return null;
      const b = host.featureBox(ctx.sel.fid);
      return b && !b.isEmpty() ? { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] } : null;
    },
  };
  const state = spec.init(env);
  // the model's faces as the dialog found them: anything else on screen later
  // is the preview's own
  const baseFaces = new Set(host.modelMeshes().map((m) => m.userData.faceName).filter(Boolean));
  const fromPreview = (name) => !!name && !baseFaces.has(name);
  let lastPick = null;        // for tests: { face, preview }
  // the picked edge a preview face came from: by the edge's drawn segments
  // nearest the click, else by both its faces' names inside the new face's
  // (every kernel names a round or bevel after its edge), else the only one
  const ownerEdge = (fp) => {
    if (!state.edges?.length) return -1;
    const withSegs = state.edges.map((e, i) => [e, i]).filter(([e]) => e.segments?.length);
    if (withSegs.length) {
      const best = nearestEdge(withSegs.map(([e]) => e), fp.point, []);
      return state.edges.indexOf(best);
    }
    const flat = (s) => String(s).replace(/[^A-Za-z0-9]/g, "");
    const k = state.edges.findIndex((e) => e.name.replace(/\[\d+\]$/, "").split("|").every((f) => flat(fp.name).includes(flat(f))));
    return k >= 0 ? k : state.edges.length === 1 ? 0 : -1;
  };

  // ---- DOM ----
  const box = document.createElement("div");
  box.id = "dz-dlg";
  box.className = "dz-ui";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", spec.title);
  document.body.appendChild(box);

  // ---- overlay of what is picked ----
  const overlay = new THREE.Group();
  overlay.name = "design-dialog-picks";
  scene.add(overlay);
  const pickMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.4, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff5c8a, depthTest: false, transparent: true });
  // a face's tint borrows the model's own geometry; lines and points are ours
  const clearPicks = () => {
    for (const c of [...overlay.children]) {
      overlay.remove(c);
      if (c.isLine || c.isLineSegments || c.isPoints) c.geometry.dispose();
      if (c.isPoints) c.material.dispose();
    }
  };
  const drawPicks = () => {
    clearPicks();
    const faces = [state.face, ...(state.faces || []), state.at].filter(Boolean);
    for (const f of faces) {
      if (!f.mesh?.geometry) continue;
      const t = new THREE.Mesh(f.mesh.geometry, pickMat);
      t.matrixAutoUpdate = false;
      t.matrix.copy(f.mesh.matrixWorld);
      t.renderOrder = 991;
      overlay.add(t);
    }
    for (const e of state.edges || []) {
      if (!e.segments?.length) continue;
      const pts = [];
      for (const [p, q] of e.segments) pts.push(...p, ...q);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const l = new THREE.LineSegments(g, lineMat);
      l.renderOrder = 999;
      overlay.add(l);
    }
    if (state.at?.point) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(state.at.point, 3));
      const dot = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff5c8a, size: 9, sizeAttenuation: false, depthTest: false }));
      dot.renderOrder = 999;
      overlay.add(dot);
    }
  };

  let last = null;          // { text, ok, failure } of the latest preview
  let seq = 0;
  let status = { cls: "busy", text: "" };
  let previewT = 0;
  let closed = false;

  const fieldHTML = (f) => {
    if (f.when && !f.when(state)) return "";
    const id = `dz-f-${f.key}`;
    if (f.type === "number") {
      return `<label class="f"><span>${esc(f.label)}${f.unit ? ` <small class="k">${esc(f.unit)}</small>` : ""}</span>`
        + `<input id="${id}" data-k="${f.key}" type="number" step="${f.step ?? 1}"${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""} value="${esc(state[f.key])}" /></label>`;
    }
    if (f.type === "check") {
      return `<label class="f"><span>${esc(f.label)}</span><input id="${id}" data-k="${f.key}" type="checkbox"${state[f.key] ? " checked" : ""} /></label>`;
    }
    if (f.type === "select") {
      const opts = (typeof f.options === "function" ? f.options(state) : f.options);
      return `<label class="f"><span>${esc(f.label)}</span><select id="${id}" data-k="${f.key}">`
        + opts.map((o, i) => `<option value="${i}"${String(i) === String(state[f.key]) ? " selected" : ""}>${esc(o.label ?? o)}</option>`).join("")
        + `</select></label>`;
    }
    return `<label class="f"><span>${esc(f.label)}</span><span class="seg" role="group" data-k="${f.key}">`
      + f.options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${state[f.key] === v}">${esc(l)}</button>`).join("") + `</span></label>`;
  };
  const pickHTML = () => {
    const p = spec.picks;
    if (!p) return "";
    let what = "";
    if (p.kind === "face") what = state.face ? `<b>${esc(state.face.name)}</b>` : "click a face";
    else if (p.kind === "point") what = state.at ? `<b>${state.at.point.map((v) => v.toFixed(1)).join(", ")}</b> on ${esc(state.at.name)}` : "click on a face";
    else {
      const list = state[p.kind] || [];
      what = list.length ? `<b>${list.length}</b> picked<div class="chips">${list.map((x, i) => `<button type="button" class="chip" data-drop="${i}" title="Drop it">${esc(x.name)}</button>`).join("")}</div>`
        : `click ${p.kind === "edges" ? "edges" : p.kind === "faces" ? "faces" : "bodies"} on the model${p.optional ? " (optional)" : ""}`;
    }
    return `<div class="pick armed"><span class="k">${esc(p.label)}:</span> ${what}</div>`;
  };
  const render = () => {
    const focus = document.activeElement?.dataset?.k;
    const preview = last?.text && last.text !== base ? changedLine(base, last.text) : "";
    box.innerHTML = `<h3>${esc(spec.title)}<button type="button" class="x" title="Cancel (Esc)" aria-label="Cancel">✕</button></h3>`
      + `<div class="bd"><small class="k">${esc(spec.help)}</small>${pickHTML()}${spec.fields.map(fieldHTML).join("")}</div>`
      + (status.text ? `<div class="st ${status.cls}">${status.text}</div>` : "")
      + (preview ? `<pre title="What will be written">${esc(preview)}</pre>` : "")
      + `<div class="ft"><button type="button" class="cancel">Cancel</button><button type="button" class="ok"${okReady() ? "" : " disabled"}>OK</button></div>`;
    if (focus) box.querySelector(`[data-k="${focus}"]`)?.focus();
  };
  const okReady = () => !!last && last.ok && last.text !== base;

  const setStatus = (cls, text) => { status = { cls, text }; };
  const schedule = (ms = 260) => { clearTimeout(previewT); previewT = setTimeout(runPreview, ms); };
  async function runPreview() {
    if (closed) return;
    const r = spec.write(base, state, env);
    const mine = ++seq;
    if (r.wait || r.error) {
      setStatus(r.error ? "err" : "busy", esc(r.wait || r.error));
      last = null;
      if (host.text() !== base) await host.preview(base);
      if (mine === seq) render();
      return;
    }
    if (last?.text === r.next && last.ok != null) { render(); return; }
    setStatus("busy", "Building the preview…");
    last = { text: r.next, ok: null };
    render();
    const res = await host.preview(r.next);
    if (closed || mine !== seq) return;
    last = { text: r.next, ok: res.ok, failure: res.failure };
    if (res.ok) setStatus("ok", "Preview built. OK keeps it (one undo step).");
    else {
      setStatus("err", `The kernel refused it: ${esc(shortReason(res.failure?.reason))}`);
      // the timeline marks THIS feature red (it may never have become a step)
      ctx.markFailure?.({ ...res.failure, pending: { label: spec.title, link: diffSpan(base, r.next) } });
    }
    render();
  }

  // ---- events ----
  box.addEventListener("input", (e) => {
    const k = e.target.dataset.k;
    const f = spec.fields.find((x) => x.key === k);
    if (!f) return;
    if (f.type === "number") {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v)) return;
      state[k] = v;
    } else if (f.type === "check") { state[k] = e.target.checked; render(); }
    else if (f.type === "select") state[k] = e.target.value;
    schedule();
  });
  box.addEventListener("click", (e) => {
    if (e.target.closest(".x, .cancel")) { cancel(); return; }
    if (e.target.closest(".ok")) { ok(); return; }
    const seg = e.target.closest(".seg button");
    if (seg) {
      const k = seg.parentElement.dataset.k;
      state[k] = seg.dataset.v;
      render();
      schedule(60);
      return;
    }
    const drop = e.target.closest("[data-drop]");
    if (drop) {
      const list = state[spec.picks.kind];
      list.splice(+drop.dataset.drop, 1);
      drawPicks();
      render();
      schedule(60);
    }
  });
  box.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    else if (e.key === "Enter" && (okReady() || last)) { e.preventDefault(); ok(); }
  });
  const onKey = (e) => { if (e.key === "Escape" && !closed) cancel(); };
  addEventListener("keydown", onKey);

  function close() {
    closed = true;
    clearTimeout(previewT);
    removeEventListener("keydown", onKey);
    box.remove();
    clearPicks();
    pickMat.dispose();
    lineMat.dispose();
    scene.remove(overlay);
    ctx.onClose?.();
  }
  async function cancel() {
    if (closed) return;
    seq++;
    close();
    if (host.text() !== base) await host.preview(base);
  }
  async function ok() {
    if (closed) return;
    // a field typed a moment ago has its preview still pending: build what the
    // fields say now, so OK never keeps the one before
    const r = spec.write(base, state, env);
    if (!r.wait && !r.error && r.next !== last?.text) { clearTimeout(previewT); await runPreview(); }
    if (closed || !okReady()) return;
    const text = last.text;
    close();
    await host.commit(text, { built: host.text() === text });
  }

  // a click on the model while the dialog is open
  function takePick(hit) {
    const p = spec.picks;
    const fp = facePick(hit, THREE);
    if (!p) {
      // dialogs with no picks retarget to a clicked shape
      if (fp?.fid) { state.fid = fp.fid; schedule(60); render(); }
      return true;
    }
    if (!fp) return true;
    // Picks are of the model the dialog opened on. Once a preview has built,
    // the screen also shows the pending feature's own faces (a fillet's round,
    // a chamfer's bevel, a hole's wall), named differently on every kernel; a
    // click on one is mapped back to the edge it came from (which toggles
    // off) or refused, never written into the feature it is a preview of.
    lastPick = { face: fp.name, preview: fromPreview(fp.name) };
    if (fromPreview(fp.name)) {
      if (p.kind === "edges") {
        const k = ownerEdge(fp);
        if (k >= 0) {
          const [gone] = state.edges.splice(k, 1);
          setStatus("busy", `${esc(gone.name)} dropped (that was its ${esc(spec.title.toLowerCase())} you clicked).`);
          drawPicks(); render(); schedule(60);
          return true;
        }
      }
      setStatus("err", `That face is the preview's own (made by this ${esc(spec.title.toLowerCase())}); pick on the model as it was.`);
      render();
      return true;
    }
    if (p.kind === "face") {
      if (p.flat && !fp.outline) { setStatus("err", `${esc(fp.name)} is not flat. Pick a flat face.`); render(); return true; }
      state.face = fp;
      if (state.plane && state.plane !== "face" && id === "mirror") state.plane = "face";
    } else if (p.kind === "point") {
      state.at = fp;
    } else if (p.kind === "faces") {
      const i = state.faces.findIndex((f) => f.name === fp.name);
      if (i >= 0) state.faces.splice(i, 1);
      else {
        if (state.fid && fp.fid !== state.fid && state.faces.length === 0 && id === "shell") state.fid = fp.fid;
        state.faces.push(fp);
      }
    } else if (p.kind === "edges") {
      // only edges between two of the model's own faces (not the preview's)
      const edges = (host.edgesOfFace(fp.mesh) || []).filter((x) => (x.faces ?? []).every((f) => !fromPreview(f)));
      const e = nearestEdge(edges, fp.point, host.modelMeshes().filter((m) => m.userData.solidName === fp.solid));
      if (!e) { setStatus("err", "No named edge there."); render(); return true; }
      const i = state.edges.findIndex((x) => x.name === e.name);
      if (i >= 0) state.edges.splice(i, 1);
      else state.edges.push({ name: e.name, fid: fp.fid, segments: e.segments ?? null });
    } else if (p.kind === "bodies") {
      if (fp.fid === state.fid || !env0.sites[fp.fid]) return true;
      const i = state.bodies.findIndex((b) => b.fid === fp.fid);
      if (i >= 0) state.bodies.splice(i, 1);
      else state.bodies.push({ fid: fp.fid, name: (env.bodyOf(fp.fid)?.name ?? "body") + "(…)" });
    }
    drawPicks();
    render();
    schedule(60);
    return true;
  }

  drawPicks();
  render();
  schedule(30);
  return {
    id,
    takePick,
    cancel,
    ok,
    get busy() { return !closed && last?.ok == null; },
    // for tests: the state, the text the preview built, and its outcome
    debug: () => ({ id, state: JSON.parse(JSON.stringify(state, (k, v) => (k === "mesh" || k === "outline" || k === "segments" ? undefined : v))),
      lastPick, text: last?.text ?? null, ok: last?.ok ?? null, status: status.text.replace(/<[^>]+>/g, ""), line: last?.text ? changedLine(base, last.text) : null }),
    set(key, value) { state[key] = value; render(); schedule(30); },
  };
}

// The lines of `next` that differ from `base` (what the dialog will write).
function changedLine(base, next) {
  let a = 0;
  while (a < base.length && a < next.length && base[a] === next[a]) a++;
  let b = 0;
  while (b < base.length - a && b < next.length - a && base[base.length - 1 - b] === next[next.length - 1 - b]) b++;
  const s = next.lastIndexOf("\n", a - 1) + 1;
  let e = next.indexOf("\n", next.length - b);
  if (e < 0) e = next.length;
  return next.slice(s, e).trim();
}
function shortReason(r) {
  const s = String(r || "unknown reason").replace(/^Error:\s*/, "");
  return s.length > 240 ? s.slice(0, 240) + "…" : s;
}

export const DIALOGS = Object.keys(SPECS);
export const _test = { revolveAxes, revolveCall, changedLine, diffSpan, SPECS };

// The range of `next` that differs from `base`: where a dialog's edit went.
function diffSpan(base, next) {
  let a = 0;
  while (a < base.length && a < next.length && base[a] === next[a]) a++;
  let b = 0;
  while (b < base.length - a && b < next.length - a && base[base.length - 1 - b] === next[next.length - 1 - b]) b++;
  return { start: a, end: next.length - b, exact: false };
}
