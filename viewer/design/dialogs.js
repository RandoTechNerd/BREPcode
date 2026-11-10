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
import { worldToPlane, planeFrame } from "../../src/dsl.js";
import { makeSolidArrow, worldPerPixel } from "../handle-dots.js";
import { SCREWS, INSERTS, BEARINGS } from "../../src/parts.js";
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
    help: "Pick a flat face; it is pushed out (or cut in) as its own outline. Drag the arrow on the face to set the distance (past the face is a cut). Up to face: then click the face it should stop at.",
    picks: { kind: "face", flat: true, label: "Face" },
    fields: [
      { key: "extent", label: "Extent", type: "seg", options: [["dist", "Distance"], ["face", "Up to face"]] },
      { key: "h", label: "Distance", type: "number", min: 0.1, step: 1, unit: "mm", when: (s) => s.extent !== "face" },
      { key: "symmetric", label: "Symmetric", type: "check", when: (s) => s.extent !== "face" },
      { key: "taper", label: "Taper", type: "number", min: -45, max: 45, step: 1, unit: "°" },
      { key: "op", label: "Operation", type: "seg", options: OPS },
    ],
    init: (env) => ({ h: 10, symmetric: false, op: "join", extent: "dist", taper: 0, face: env.flatFace(), toFace: null }),
    write(base, s, env) {
      if (!s.face?.outline) return { wait: "Click a flat face on the model." };
      const body = env.bodyOf(s.face.fid);
      if (!body) return { error: "That face has no call in the code to add to." };
      let h = s.h, symmetric = s.symmetric;
      if (s.extent === "face") {
        if (!s.toFace?.outline) return { wait: "Now click the flat face it should run up to." };
        const r = F.upToDistance(s.face.outline, s.toFace.outline);
        if (r.error) return r;
        if (r.inward !== (s.op === "cut")) return { error: r.inward ? "that face is inside the part, behind this one: only a Cut reaches it" : "that face is out in front of this one: Join or New body reaches it, a Cut goes the other way" };
        h = r.h; symmetric = false;
      }
      return F.extrudeText(base, body, s.face.outline, { h, mode: s.op, symmetric, taper: s.taper || 0, toPlane: env.toPlane(s.face.outline) });
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

  primitive: {
    title: "Primitive",
    help: "A box, cylinder, cone, sphere or torus. It goes beside the model as a New body; click a face to put it there instead (Join or Cut it into that body).",
    picks: { kind: "point", label: "On a face", optional: true },
    fields: [
      { key: "kind", label: "Shape", type: "select", options: () => F.PRIMITIVES },
      { key: "w", label: "Width (X)", type: "number", min: 0.1, step: 1, unit: "mm", when: (s) => s.kind === "box" },
      { key: "d", label: "Depth (Y)", type: "number", min: 0.1, step: 1, unit: "mm", when: (s) => s.kind === "box" },
      { key: "r", label: "Radius", type: "number", min: 0.1, step: 0.5, unit: "mm", when: (s) => ["cylinder", "cone", "sphere"].includes(s.kind) },
      { key: "rTop", label: "Top radius", type: "number", min: 0, step: 0.5, unit: "mm", when: (s) => s.kind === "cone" },
      { key: "R", label: "Ring radius", type: "number", min: 0.2, step: 1, unit: "mm", when: (s) => s.kind === "torus" },
      { key: "tube", label: "Tube radius", type: "number", min: 0.1, step: 0.5, unit: "mm", when: (s) => s.kind === "torus" },
      { key: "h", label: "Height", type: "number", min: 0.1, step: 1, unit: "mm", when: (s) => ["box", "cylinder", "cone"].includes(s.kind) },
      { key: "x", label: "X", type: "number", step: 1, unit: "mm" },
      { key: "y", label: "Y", type: "number", step: 1, unit: "mm" },
      { key: "z", label: "Z", type: "number", step: 1, unit: "mm" },
      { key: "op", label: "Operation", type: "seg", options: [["new", "New body"], ["join", "Join"], ["cut", "Cut"]] },
    ],
    init(env) {
      // beside the model on the floor (or at the origin on an empty plate)
      const b = env.modelBox();
      const x = b ? Math.round(b.max[0] + 25) : 0, y = b ? Math.round((b.min[1] + b.max[1]) / 2) : 0;
      return { kind: "box", w: 20, d: 20, h: 20, r: 10, rTop: 4, R: 12, tube: 3, x, y, z: 0, op: "new", at: null };
    },
    write(base, s, env) {
      const call = F.primitiveCall(s.kind, s, { sink: s.op === "cut" && !!s.at });
      if (call.error) return call;
      const fid = s.at?.fid ?? env.sel?.fid;
      const body = s.op === "new" ? null : fid ? env.bodyOf(fid) : null;
      if (s.op !== "new" && fid && !body) return { error: "That body has no call in the code." };
      return F.primitiveText(base, call.text, { op: s.op, body, starter: env.isStarter() ? env.starterText() : null });
    },
  },

  hardware: {
    title: "Hardware",
    help: "Standard fasteners from the tables (src/parts.js), fit allowances included. A pocket or hole: click the face it goes into and it cuts in square to that face. A part (a printable bolt, nut, rod or a bearing to check a fit): it goes beside the model as a New body.",
    picks: { kind: "point", label: "On a face", optional: true },
    fields: [
      { key: "kind", label: "What", type: "select", options: () => HW_KINDS.map(([v, l]) => [v, l]) },
      { key: "size", label: "Size", type: "select", options: (s) => hwSizes(s.kind) },
      { key: "head", label: "Head", type: "select", options: (s) => s.kind === "bolt" ? [["socket", "Socket cap"], ["button", "Button"], ["hex", "Hex"]] : [["none", "None (plain)"], ["socket", "Socket cap"], ["button", "Button"], ["flat", "Countersunk"]], when: (s) => s.kind === "screwHole" || s.kind === "bolt" },
      { key: "depth", label: "Depth", type: "number", min: 0.5, step: 1, unit: "mm", when: (s) => s.kind === "screwHole" || s.kind === "tapped" },
      { key: "length", label: "Length", type: "number", min: 1, step: 1, unit: "mm", when: (s) => s.kind === "bolt" || s.kind === "rod" },
      { key: "x", label: "X", type: "number", step: 1, unit: "mm" },
      { key: "y", label: "Y", type: "number", step: 1, unit: "mm" },
      { key: "z", label: "Z", type: "number", step: 1, unit: "mm" },
    ],
    init(env) {
      const b = env.modelBox();
      const x = b ? Math.round(b.max[0] + 20) : 0, y = b ? Math.round((b.min[1] + b.max[1]) / 2) : 0;
      const at = env.sel?.face?.hitPoint ? { ...env.sel.face, point: env.sel.face.hitPoint } : null;
      const p = at ? at.point.map((v) => Math.round(v * 10) / 10) : [x, y, 0];
      return { kind: "screwHole", size: "M3", head: "socket", depth: 10, length: 16, x: p[0], y: p[1], z: p[2], at, normal: at?.normal ?? [0, 0, 1] };
    },
    write(base, s, env) {
      const call = hardwareCall(s);
      if (call.error) return call;
      if (call.cut) {
        const fid = s.at?.fid ?? env.sel?.fid;
        if (!fid) return { wait: "Click the face it goes into." };
        const body = env.bodyOf(fid);
        if (!body) return { error: "That face has no call in the code to cut." };
        return F.addTool(base, body, call.text);
      }
      return F.primitiveText(base, call.text, { op: "new", starter: env.isStarter() ? env.starterText() : null });
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
  // Direct edits by face: push / move / delete-and-heal, on any exact solid,
  // an imported STEP included (the kernel's synchronous modelling)
  faceedit: {
    title: "Face edit",
    help: "Click faces on the model. Push moves each along its own normal, Move shifts them together, Tilt turns them about their centre, Delete removes them and heals the solid (fills a hole, takes a fillet off).",
    picks: { kind: "faces", label: "Faces" },
    fields: [
      { key: "mode", label: "Edit", type: "seg", options: [["push", "Push / pull"], ["move", "Move"], ["tilt", "Tilt"], ["delete", "Delete & heal"]] },
      { key: "by", label: "Distance", type: "number", step: 0.5, unit: "mm", when: (s) => s.mode === "push" },
      { key: "dx", label: "X", type: "number", step: 0.5, unit: "mm", when: (s) => s.mode === "move" },
      { key: "dy", label: "Y", type: "number", step: 0.5, unit: "mm", when: (s) => s.mode === "move" },
      { key: "dz", label: "Z", type: "number", step: 0.5, unit: "mm", when: (s) => s.mode === "move" },
      { key: "angle", label: "Angle", type: "number", step: 1, unit: "°", when: (s) => s.mode === "tilt" },
      { key: "axis", label: "About", type: "seg", options: [["x", "X"], ["y", "Y"], ["z", "Z"]], when: (s) => s.mode === "tilt" },
    ],
    init: () => ({ mode: "push", by: 1, dx: 0, dy: 0, dz: 1, angle: 5, axis: "x", faces: [] }),
    write(base, s, env) {
      if (!s.faces.length) return { wait: "Click the faces to edit." };
      const fid = s.faces[0].fid;
      const body = env.bodyOf(fid);
      if (!body) return { error: "That face's shape has no call in the code." };
      if (s.faces.some((f) => { const b = env.bodyOf(f.fid); return !b || b.start !== body.start || b.end !== body.end; })) {
        return { error: "All the faces must be on one body." };
      }
      if (s.mode === "push" && !(Math.abs(+s.by) > 0)) return { wait: "Set a distance (+ out, - in)." };
      const faces = [...new Set(s.faces.map((f) => f.name))];
      if (s.mode === "tilt" && !(Math.abs(+s.angle) > 0)) return { wait: "Set an angle." };
      return F.faceOpText(base, body, { mode: s.mode, faces, by: +s.by, vec: [+s.dx || 0, +s.dy || 0, +s.dz || 0], angle: +s.angle, axis: s.axis });
    },
  },
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

  split: {
    title: "Split body",
    help: "Cuts the selected body in two along a plane: a world plane at an offset, or a flat face you click. Each half becomes a body of its own.",
    picks: { kind: "face", flat: true, label: "Plane face", optional: true },
    fields: [
      { key: "plane", label: "Plane", type: "seg", options: [["YZ", "YZ"], ["XZ", "XZ"], ["XY", "XY"], ["face", "Face"]] },
      { key: "at", label: "Offset", type: "number", step: 1, unit: "mm", when: (s) => s.plane !== "face" },
    ],
    init(env) {
      const box = env.selBox();
      const mid = box ? Math.round(((box.min[2] + box.max[2]) / 2) * 100) / 100 : 0;
      return { plane: "XY", at: mid, fid: env.sel?.fid ?? null, face: null };
    },
    write(base, s, env) {
      if (!s.fid) return { wait: "Select the body to split first." };
      const target = env.patternTarget(s.fid);
      if (!target) return { error: "That body has no call in the code." };
      let normal, at;
      if (s.plane === "face") {
        if (!s.face?.outline) return { wait: "Click the flat face to split along." };
        normal = s.face.outline.normal; at = normal.reduce((a, v, i) => a + v * s.face.outline.point[i], 0);
      } else {
        normal = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[s.plane]; at = s.at;
      }
      return F.splitText(base, target, { normal, at });
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

// ---- the Hardware dialog's catalogue and code ------------------------------
const HW_KINDS = [
  ["screwHole", "Screw hole (clearance)"], ["tapped", "Tapped hole (modelled thread)"], ["insert", "Heat-set insert bore"],
  ["nutPocket", "Nut pocket"], ["bearingSeat", "Bearing seat"],
  ["bolt", "Bolt (printable, threaded)"], ["nut", "Nut (printable, threaded)"], ["rod", "Threaded rod"], ["bearing", "Bearing (to check a fit)"],
];
const HW_CUT = new Set(["screwHole", "tapped", "insert", "nutPocket", "bearingSeat"]);
const hwLabel = (k) => k.replace("_", ".");
function hwSizes(kind) {
  if (kind === "insert") return Object.keys(INSERTS).map((k) => [hwLabel(k), hwLabel(k)]);
  if (kind === "bearingSeat" || kind === "bearing") return Object.entries(BEARINGS).map(([k, b]) => [k, `${k} (${b.bore}/${b.od}/${b.w})`]);
  return Object.keys(SCREWS).map((k) => [hwLabel(k), hwLabel(k)]);
}
// Turn the part's +Z onto the face normal: about Y by the tilt, then about Z.
function orient(n, text) {
  const [x, y, z] = n ?? [0, 0, 1];
  const len = Math.hypot(x, y, z) || 1;
  const tilt = Math.acos(Math.max(-1, Math.min(1, z / len))) * 180 / Math.PI;
  if (tilt < 0.01) return text;
  const spin = Math.atan2(y, x) * 180 / Math.PI;
  const r = (v) => Math.round(v * 100) / 100;
  return `rotate([0, ${r(tilt)}, ${r(spin)}], ${text})`;
}
export function hardwareCall(s) {
  // a size from another kind's table (M3 after switching to a bearing) snaps
  // to this table's first, and the state follows so the select agrees
  const sizes = hwSizes(s.kind);
  if (!sizes.some(([v]) => v === String(s.size))) s.size = sizes.find(([v]) => v === "M3")?.[0] ?? sizes[0][0];
  const q = JSON.stringify(String(s.size));
  const key = String(s.size).replace(".", "_");
  let text;
  switch (s.kind) {
    case "screwHole": text = `screwHole(${q}, { depth: ${s.depth}${s.head && s.head !== "none" ? `, head: "${s.head}"` : ""} })`; break;
    case "tapped": text = `threadedHole(${q}, { depth: ${s.depth} })`; break;
    case "insert": text = `insertBore(${q})`; break;
    // the pocket and the seat stand UP from z = 0, so they are sunk by their own height
    case "nutPocket": text = `translate([0, 0, ${-Math.round((SCREWS[key].nutT + 0.3) * 100) / 100}], nutPocket(${q}))`; break;
    case "bearingSeat": text = `translate([0, 0, ${-Math.round((BEARINGS[s.size].w + 0.2) * 100) / 100}], bearingPocket(${q}))`; break;
    case "bolt": text = `bolt(${q}, { length: ${s.length}${s.head && s.head !== "socket" && s.head !== "none" ? `, head: "${s.head}"` : ""} })`; break;
    case "nut": text = `threadedNut(${q})`; break;
    case "rod": text = `thread({ size: ${q}, length: ${s.length} })`; break;
    case "bearing": text = `bearing(${q})`; break;
    default: return { error: `no hardware called ${s.kind}` };
  }
  const cut = HW_CUT.has(s.kind);
  const placed = cut ? orient(s.normal, text) : text;
  const r = (v) => Math.round((+v || 0) * 100) / 100;
  const at = [r(s.x), r(s.y), r(s.z)];
  return { cut, text: at.some((v) => v) ? `translate([${at.join(", ")}], ${placed})` : placed };
}

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
      const names = s.edges.map((e) => e.name);
      const r = F.edgeOpText(base, body, { kind, amount: s.amount, edges: names });
      // If the kernel cannot find the edge on the finished shape (a boolean
      // renamed or split it), the same edges on the feature's OWN call, before
      // anything is joined to it, usually still exist: try that next.
      const own = env.shapeOf(fid);
      if (own && (own.start !== body.start || own.end !== body.end) && s.edges.every((e) => e.fid === fid)) {
        const what = (base.slice(own.start, own.end).match(/^[A-Za-z_$][\w$]*/) || ["that shape"])[0];
        r.alts = [{ next: F.edgeOpText(base, own, { kind, amount: s.amount, edges: names }).next,
          note: `The kernel lost that edge once the shapes were joined, so the ${kind} goes on the <code>${what}()</code> itself, before the join (the build order changed for you).` }];
      }
      return r;
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
    // the whole model's box ({ min, max }), or null on an empty plate
    modelBox: () => {
      const b = new THREE.Box3();
      for (const m of host.modelMeshes()) if (m.isMesh && m.visible) b.expandByObject(m);
      return b.isEmpty() ? null : { min: b.min.toArray(), max: b.max.toArray() };
    },
    isStarter: () => !!host.isStarter?.(),
    starterText: () => host.starterText?.() ?? "",
    selBox: () => {
      if (!ctx.sel?.fid) return null;
      const b = host.featureBox(ctx.sel.fid);
      return b && !b.isEmpty() ? { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] } : null;
    },
  };
  // a choice made on the way in (held toolbar button): Cut, Counterbore, ...
  const state = Object.assign(spec.init(env), ctx.preset || {});
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

  // ---- the Extrude arrow ----
  // Extrude's distance, as something to grab: an arrow standing on the picked
  // face at the far end of the extrusion. Drag it along the face's normal and
  // the Distance field follows; past the face the other way and it is a Cut
  // (back out again: a Join). A translucent slab shows what comes or goes
  // while dragging; the kernel builds the real preview on release. Ctrl is
  // 0.1 mm steps, Shift 5 mm. Only this dialog has one: the others have no
  // single distance along a single normal to hang it on.
  const hasHandle = id === "extrude";
  const handleGroup = new THREE.Group();
  handleGroup.name = "design-dialog-handle";
  const ghostGroup = new THREE.Group();
  const sleeveMat = new THREE.MeshBasicMaterial({ visible: false });
  const ghostAdd = new THREE.MeshBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
  const ghostCut = new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
  if (hasHandle) { scene.add(handleGroup); scene.add(ghostGroup); }
  let handle = null, handleDrag = null, handleHot = false;
  const canvas = host.renderer.domElement, cam = host.camera;
  const signedH = () => (state.op === "cut" ? -1 : 1) * Math.abs(+state.h || 0);
  const clearHandle = () => {
    for (const a of [...handleGroup.children]) { handleGroup.remove(a); a.traverse((o) => { o.geometry?.dispose?.(); if (o.material !== sleeveMat) o.material?.dispose?.(); }); }
    handle = null;
  };
  const clearGhost = () => { for (const c of [...ghostGroup.children]) { ghostGroup.remove(c); c.geometry.dispose(); } };
  // the middle of the face, on its plane
  const faceCentre = (fp) => {
    const loop = fp.outline.loops[0];
    const c = new THREE.Vector3();
    for (const p of loop) c.add(new THREE.Vector3(p[0], p[1], p[2]));
    return c.multiplyScalar(1 / loop.length);
  };
  function placeHandle() {
    if (!hasHandle) return;
    clearHandle();
    const fp = state.face;
    if (closed || !fp?.outline || !fp.normal || state.extent === "face") return;
    const n = new THREE.Vector3(...fp.normal).normalize();
    const at = faceCentre(fp).addScaledVector(n, handleDrag ? handleDrag.d : signedH());
    // about 50 px long wherever the face is
    const wpp = worldPerPixel(THREE, cam, canvas, at);
    // Its LENGTH is measured along the way it points: an arrow standing on a
    // face seen from above is foreshortened, and at the width's scale it came
    // out a third as long on screen as it was drawn for, too short to grab.
    // (Up to three times longer in the world; face-on it cannot be helped.)
    const rect = canvas.getBoundingClientRect();
    const px = (p) => { const q = p.clone().project(cam); return [(q.x + 1) / 2 * rect.width, (1 - q.y) / 2 * rect.height]; };
    const a0 = px(at), a1 = px(at.clone().add(n));
    const along = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    const lpp = Math.min(3 * wpp, along > 1e-9 ? 1 / along : 3 * wpp);
    handle = makeSolidArrow(THREE, n, { gap: lpp * 6, shaft: lpp * 34, head: lpp * 16, r: wpp * 2, headR: wpp * 7, sleeveR: wpp * 12,
      color: (handleDrag ? handleDrag.d : signedH()) < 0 ? 0xff7a5c : 0x3ddc97, hitMat: sleeveMat });
    handle.position.copy(at);
    handle.userData.setHot?.(handleHot || !!handleDrag);
    handleGroup.add(handle);
  }
  function handleAt(x, y) {
    if (!handle) return false;
    const rect = canvas.getBoundingClientRect();
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), cam);
    const sleeves = [];
    // the arrow may have been put there since the last frame was drawn (a
    // field typed, a preview landing): its matrices are only as fresh as that
    handleGroup.updateMatrixWorld(true);
    handleGroup.traverse((o) => { if (o.userData.arrowHit) sleeves.push(o); });
    return rc.intersectObjects(sleeves, false).length > 0;
  }
  const onHandleHover = (e) => {
    if (handleDrag || !handle) return;
    const on = handleAt(e.clientX, e.clientY);
    if (on === handleHot) return;
    handleHot = on;
    handle.userData.setHot?.(on);
    canvas.style.cursor = on ? "grab" : "";
  };
  if (hasHandle) {
    canvas.addEventListener("pointermove", onHandleHover);
    host.orbit?.addEventListener?.("change", placeHandle);     // it keeps its size on screen
  }
  function drawGhost(d) {
    clearGhost();
    const fp = state.face;
    if (!d || !fp?.outline) return;
    const pl = F.facePlane(fp.outline), fr = planeFrame(pl);
    const shape = new THREE.Shape(fp.outline.loops[0].map((p) => new THREE.Vector2(...worldToPlane(pl, p))));
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: Math.abs(d), bevelEnabled: false }), d > 0 ? ghostAdd : ghostCut);
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(fr.x, fr.y, fr.n).setPosition(fr.origin.clone().addScaledVector(fr.n, d < 0 ? d : 0));
    m.renderOrder = 996;
    ghostGroup.add(m);
  }
  // a press on the stage: true when it took hold of the arrow
  let lastHandlePress = null;     // for tests: where the last press on the stage landed, and whether it took the arrow
  function handleDown(e) {
    const took = hasHandle && !!handle && handleAt(e.clientX, e.clientY);
    lastHandlePress = { x: Math.round(e.clientX), y: Math.round(e.clientY), took };
    if (!took) return false;
    const fp = state.face;
    const n = new THREE.Vector3(...fp.normal).normalize();
    const origin = faceCentre(fp).addScaledVector(n, signedH());
    // the normal's direction and scale on screen, where the arrow stands
    const rect = canvas.getBoundingClientRect();
    const toPx = (p) => { const q = p.clone().project(cam); return [(q.x + 1) / 2 * rect.width, (1 - q.y) / 2 * rect.height]; };
    const a = toPx(origin), b = toPx(origin.clone().add(n));
    const dir = [b[0] - a[0], b[1] - a[1]];
    const pxPerMm = Math.hypot(...dir);
    // a face square on to the view has no screen direction: up the screen is out
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const sidePx = Math.hypot(...[0, 1].map((k) => toPx(origin.clone().add(right))[k] - a[k]));
    const faceOn = pxPerMm < sidePx * 0.25;
    handleDrag = { x0: e.clientX, y0: e.clientY, start: signedH(), d: signedH(),
      pxPerMm: faceOn ? sidePx : pxPerMm, dir: faceOn ? [0, -1] : [dir[0] / pxPerMm, dir[1] / pxPerMm] };
    if (host.orbit) host.orbit.enabled = false;
    canvas.style.cursor = "grabbing";
    clearTimeout(previewT);
    return true;
  }
  function handleMove(e) {
    if (!handleDrag) return;
    const g = handleDrag;
    const raw = g.start + ((e.clientX - g.x0) * g.dir[0] + (e.clientY - g.y0) * g.dir[1]) / g.pxPerMm;
    const step = e.ctrlKey ? 0.1 : e.shiftKey ? 5 : 1;
    g.d = Math.round(raw / step) * step;
    // the fields follow as it moves: the distance, and Join or Cut by the side
    if (Math.abs(g.d) >= 0.1) {
      state.h = F.round(Math.abs(g.d));
      if (g.d < 0) state.op = "cut"; else if (state.op === "cut") state.op = "join";
    }
    drawGhost(g.d);
    placeHandle();
    const f = box.querySelector('[data-k="h"]');
    if (f) f.value = state.h;
    for (const b of box.querySelectorAll('.seg[data-k="op"] button')) b.setAttribute("aria-pressed", String(b.dataset.v === state.op));
  }
  function handleUp() {
    if (!handleDrag) return;
    handleDrag = null;
    if (host.orbit) host.orbit.enabled = true;
    canvas.style.cursor = "";
    clearGhost();
    render();
    schedule(30);
  }

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
        // [value, label] pairs keep their value; anything else is by index
        + opts.map((o, i) => { const v = Array.isArray(o) ? o[0] : i; return `<option value="${esc(v)}"${String(v) === String(state[f.key]) ? " selected" : ""}>${esc(Array.isArray(o) ? o[1] : o.label ?? o)}</option>`; }).join("")
        + `</select></label>`;
    }
    return `<label class="f"><span>${esc(f.label)}</span><span class="seg" role="group" data-k="${f.key}">`
      + f.options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${state[f.key] === v}">${esc(l)}</button>`).join("") + `</span></label>`;
  };
  const pickHTML = () => {
    const p = spec.picks;
    if (!p) return "";
    let what = "";
    if (p.kind === "face") what = (state.face ? `<b>${esc(state.face.name)}</b>` : "click a face")
      + (id === "extrude" && state.extent === "face" ? `<br><span class="k">Up to:</span> ${state.toFace ? `<b>${esc(state.toFace.name)}</b>` : state.face ? "click the face to stop at" : "then the face to stop at"}` : "");
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
    placeHandle();
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
    if (last?.from === r.next && last.ok != null) { render(); return; }
    setStatus("busy", "Building the preview…");
    last = { text: r.next, ok: null };
    render();
    // A slow build says so, and for how long. "Building the preview…" with
    // nothing moving read as stuck on a big imported STEP, where the first
    // build can take a while. Only the status line is touched: a redraw every
    // second would take the cursor out of the number being typed.
    const t0 = Date.now();
    const tick = setInterval(() => {
      const st = box.querySelector(".st.busy");
      const s = Math.round((Date.now() - t0) / 1000);
      if (st && !closed && mine === seq && s >= 3) st.textContent = `Building the preview… ${s} s${s >= 20 ? " (a big model: it is still working; Cancel stops waiting)" : ""}`;
    }, 1000);
    let res;
    try { res = await host.preview(r.next); } finally { clearInterval(tick); }
    if (closed || mine !== seq) return;
    last = { text: r.next, from: r.next, ok: res.ok, failure: res.failure };
    // refused: the writer's other ways of saying the same thing, in order
    for (const alt of res.ok ? [] : r.alts || []) {
      setStatus("busy", "The kernel refused that; trying another build order…");
      render();
      const a = await host.preview(alt.next);
      if (closed || mine !== seq) return;
      if (a.ok) { res = a; last = { text: alt.next, from: r.next, ok: true, note: alt.note }; break; }
    }
    if (res.ok) setStatus("ok", (last.note ? `${last.note} ` : "") + "Preview built. OK keeps it (one undo step).");
    else {
      const lost = /no edge/i.test(String(res.failure?.reason || ""));
      setStatus("err", lost
        ? `The kernel could not find that edge${r.alts?.length ? ", on the joined shape or on the part before the join" : ""}: edge names change as shapes are combined. Pick it again after the model rebuilds, pick a neighbouring edge, or round it in the code before the union.`
        : `The kernel refused it: ${esc(shortReason(res.failure?.reason))}`);
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
    // a select can change which fields show (a primitive's shape): redraw
    else if (f.type === "select") { state[k] = e.target.value; render(); }
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
    if (hasHandle) {
      canvas.removeEventListener("pointermove", onHandleHover);
      host.orbit?.removeEventListener?.("change", placeHandle);
      if (handleDrag && host.orbit) host.orbit.enabled = true;
      handleDrag = null;
      canvas.style.cursor = "";
      clearHandle(); clearGhost();
      scene.remove(handleGroup); scene.remove(ghostGroup);
      for (const m of [sleeveMat, ghostAdd, ghostCut]) m.dispose();
    }
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
    if (!r.wait && !r.error && r.next !== last?.from) { clearTimeout(previewT); await runPreview(); }
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
      // Up to face: with the face to extrude picked, the next click is where it stops
      if (id === "extrude" && state.extent === "face" && state.face && fp.name !== state.face.name) state.toFace = fp;
      else { state.face = fp; if (id === "extrude") state.toFace = null; }
      if (state.plane && state.plane !== "face" && (id === "mirror" || id === "split")) state.plane = "face";
    } else if (p.kind === "point") {
      state.at = fp;
      if (id === "primitive") {
        [state.x, state.y, state.z] = fp.point.map((v) => Math.round(v * 10) / 10);
        if (state.op === "new") state.op = "join";
      }
      if (id === "hardware") {
        [state.x, state.y, state.z] = fp.point.map((v) => Math.round(v * 10) / 10);
        state.normal = fp.normal ?? [0, 0, 1];
      }
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
    // the Extrude arrow: a press that lands on it drags the distance
    handleDown, handleMove, handleUp,
    cancel,
    ok,
    get busy() { return !closed && last?.ok == null; },
    // for tests: the state, the text the preview built, and its outcome
    debug: () => ({ id, state: JSON.parse(JSON.stringify(state, (k, v) => (k === "mesh" || k === "outline" || k === "segments" ? undefined : v))),
      lastPick, handle: handle ? { at: handle.position.toArray(), dragging: !!handleDrag, hot: handleHot, press: lastHandlePress } : null, text: last?.text ?? null, ok: last?.ok ?? null, status: status.text.replace(/<[^>]+>/g, ""), line: last?.text ? changedLine(base, last.text) : null }),
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
