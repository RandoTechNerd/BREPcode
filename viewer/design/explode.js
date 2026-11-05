// design/explode.js — Design mode's exploded (assembly) and cut views.
//
// Loaded the first time Explode is clicked. Every body of the model (each
// solid the build made: a New body, each part of a group()) is pulled away
// from the middle of the whole, along the line from that middle to its own,
// by a slider; back to 0 it is assembled again. A cut view slices the part
// open on an X, Y or Z plane (or takes a quarter out) to show the inside, with
// a flat cap where the cut went through material; exploded, each part keeps
// the cut it had assembled. A view only: the code and the parts' real places
// never change, and closing the panel puts everything back.
// "Save video" loads design/explode-video.js only when pressed.

const CSS = `
#dz-explode { top: 56px; right: 12px; width: 286px; padding: 0 0 10px; z-index: 31; }
body.dz-ribbon #dz-explode { top: 104px; }
#dz-explode h3 { margin: 0; padding: 9px 12px 7px; font-size: 13px; font-weight: 650; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border, #26314a); }
#dz-explode h3 .x { margin-left: auto; border: 0; background: transparent; cursor: pointer; color: var(--muted, #8ea0c0); font-size: 15px; }
#dz-explode .row { display: flex; align-items: center; gap: 8px; margin: 9px 12px 0; font-size: 12px; }
#dz-explode .row > span { width: 64px; color: var(--muted, #8ea0c0); flex: none; }
#dz-explode input[type=range] { flex: 1 1 auto; min-width: 0; }
#dz-explode output { width: 38px; text-align: right; font: 12px ui-monospace, Consolas, monospace; }
#dz-explode .seg { display: flex; flex: 1 1 auto; min-width: 0; border: 1px solid var(--border, #26314a); border-radius: 7px; overflow: hidden; }
#dz-explode .seg button { flex: 1 1 0; min-width: 0; border: 0; background: transparent; color: inherit; padding: 4px 0; font-size: 11.5px; cursor: pointer; }
#dz-explode .seg button + button { border-left: 1px solid var(--border, #26314a); }
#dz-explode .seg button.on { background: var(--accent, #1c66e5); color: #fff; }
#dz-explode label.chk { display: flex; align-items: center; gap: 6px; margin: 7px 12px 0 84px; font-size: 12px; cursor: pointer; }
#dz-explode .sub { margin: 12px 12px 0; padding-top: 8px; border-top: 1px solid var(--border, #26314a); font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .04em; color: var(--muted, #8ea0c0); }
#dz-explode .btns { display: flex; gap: 6px; margin: 10px 12px 0; flex-wrap: wrap; }
#dz-explode .btns button { border: 1px solid var(--border, #26314a); background: transparent; border-radius: 7px; padding: 5px 10px; cursor: pointer; color: inherit; font-size: 12px; }
#dz-explode .btns button.primary { background: var(--accent, #1c66e5); border-color: var(--accent, #1c66e5); color: #fff; }
#dz-explode .btns button:disabled { opacity: .45; cursor: default; }
#dz-explode .note { margin: 8px 12px 0; font-size: 11px; color: var(--muted, #8ea0c0); }
#dz-explode .note.err { color: #ffb3b3; }
`;

// The bodies (meshes grouped by the solid they belong to) and, for each,
// which way and how far it moves at full explode. Each goes along the line
// from the whole model's middle to its own (a body right at the middle goes
// straight up: a lid on a box). Bodies going the same way are then STACKED
// along it in the order they sit, nearest the middle first, each one clear of
// the one before by a gap: a shaft, a bearing on it, a pulley round that and
// a cap on top come off in that order and never pass through each other
// (moving each by its own size let a small bearing overtake into the pulley
// above it). The order is by where each starts along the line, except that a
// part wrapped round another (a bearing round its shaft, a pulley round its
// bearing) comes off after the one inside it, sliding off its end rather
// than through it.
export function explodePlan(meshes, THREE) {
  const groups = new Map();
  for (const m of meshes) {
    const k = m.userData?.solidName ?? m.uuid;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const all = new THREE.Box3();
  const bodies = [...groups.values()].map((list) => {
    const box = new THREE.Box3();
    for (const m of list) box.expandByObject(m);
    all.union(box);
    return { meshes: list, box };
  });
  if (bodies.length < 2) return { bodies, moves: bodies.map(() => new THREE.Vector3()), all };
  const mid = all.getCenter(new THREE.Vector3()), whole = all.getSize(new THREE.Vector3()).length();
  const gap = whole * 0.07;
  const info = bodies.map(({ box }) => {
    const c = box.getCenter(new THREE.Vector3()), d = c.clone().sub(mid);
    const dir = d.length() > whole * 0.02 ? d.clone().normalize() : new THREE.Vector3(0, 0, 1);
    return { box, c, dist: d.length(), dir, size: box.getSize(new THREE.Vector3()).length() };
  });
  // the extent of a box along a direction
  const span = (box, dir) => {
    let lo = Infinity, hi = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const t = x * dir.x + y * dir.y + z * dir.z;
      lo = Math.min(lo, t); hi = Math.max(hi, t);
    }
    return [lo, hi];
  };
  // A wraps round B, seen along dir: across the line A's box holds B's, and
  // along it they overlap (a bearing round its shaft, a pulley round it)
  const wraps = (A, B, dir) => {
    const along = Math.abs(dir.x) > 0.7 ? 0 : Math.abs(dir.y) > 0.7 ? 1 : Math.abs(dir.z) > 0.7 ? 2 : -1;
    if (along < 0) return false;
    const k = ["x", "y", "z"], eps = whole * 1e-4;
    for (let a = 0; a < 3; a++) {
      if (a === along) continue;
      if (A.min[k[a]] > B.min[k[a]] + eps || A.max[k[a]] < B.max[k[a]] - eps) return false;
    }
    const sizeA = (A.max[k[(along + 1) % 3]] - A.min[k[(along + 1) % 3]]), sizeB = (B.max[k[(along + 1) % 3]] - B.min[k[(along + 1) % 3]]);
    if (sizeA <= sizeB + eps) return false;
    return A.min[k[along]] < B.max[k[along]] - eps && B.min[k[along]] < A.max[k[along]] - eps;
  };
  // directions within ~15° are one line of parts
  const lines = [];
  info.forEach((b, i) => {
    const line = lines.find((l) => l.dir.dot(b.dir) > 0.966);
    if (line) line.members.push(i); else lines.push({ dir: b.dir.clone(), members: [i] });
  });
  const moves = info.map(() => new THREE.Vector3());
  for (const { dir, members } of lines) {
    // by where each starts along the line; then any part that wraps round a
    // later one moves after it
    const order = members.map((i) => ({ i, lo: span(info[i].box, dir)[0], size: info[i].size }))
      .sort((p, q) => (Math.abs(p.lo - q.lo) > whole * 1e-3 ? p.lo - q.lo : p.size - q.size));
    for (let pass = 0, moved = true; moved && pass < order.length * order.length; pass++) {
      moved = false;
      for (let a = 0; a < order.length && !moved; a++) {
        for (let b = a + 1; b < order.length; b++) {
          if (!wraps(info[order[a].i].box, info[order[b].i].box, dir)) continue;
          order.splice(b, 0, order.splice(a, 1)[0]);
          moved = true;
          break;
        }
      }
    }
    // a line of one: its own spread from the middle, plus a gap
    let cursor = -Infinity;
    for (const { i } of order) {
      const [lo, hi] = span(info[i].box, dir);
      const own = info[i].dist * 0.3 + (members.length === 1 ? gap + info[i].size * 0.15 : 0);
      const shift = Math.max(own, cursor === -Infinity ? own : cursor + gap - lo);
      moves[i].copy(members.length > 1 ? dir : info[i].dir).multiplyScalar(shift);
      cursor = hi + shift;
    }
  }
  // nothing goes below the floor it stood on (the grid would cut through it):
  // the whole explosion rises by what the lowest part would sink
  const sink = Math.max(0, ...bodies.map(({ box }, i) => all.min.z - (box.min.z + moves[i].z)));
  if (sink > 0) for (const m of moves) m.z += sink;
  // the exploded model's box (the video frames it)
  const out = new THREE.Box3();
  bodies.forEach(({ box }, i) => out.union(box.clone().translate(moves[i])));
  return { bodies, moves, all, out };
}

// The cut's planes in the assembled model: { normal, constant } pairs (three's
// Plane keeps n·p + c >= 0). cut is "x" | "y" | "z" (a plane across that
// axis) or "quarter" (the corner past both the X and Y planes is taken out).
// The side taken away is the one facing the eye (the camera), so you look
// straight at the cut; flip takes the other side instead. Without an eye the
// high side goes. at is 0..1 across the model's box.
export function cutPlanes(cut, at, flip, box, eye = null) {
  const AX = { x: 0, y: 1, z: 2 };
  const one = (a) => {
    const lo = box.min.getComponent(a), hi = box.max.getComponent(a);
    const v = lo + (hi - lo) * at, n = [0, 0, 0];
    const highGoes = (eye ? eye[a] >= (lo + hi) / 2 : true) !== !!flip;
    n[a] = highGoes ? -1 : 1;
    return { normal: n, constant: highGoes ? v : -v };
  };
  if (cut in AX) return { planes: [one(AX[cut])], intersect: false };
  // a quarter: clipped only where BOTH planes clip, so just the one corner goes
  if (cut === "quarter") return { planes: [one(0), one(1)], intersect: true };
  return { planes: [], intersect: false };
}

const CUTS = [["off", "Off"], ["x", "X"], ["y", "Y"], ["z", "Z"], ["quarter", "¼"]];

let cssDone = false;
export function openExplode({ host, THREE }) {
  if (!cssDone) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
  document.getElementById("dz-explode")?.remove();
  const el = document.createElement("div");
  el.id = "dz-explode";
  el.className = "dz-ui";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Exploded and cut view");
  document.body.appendChild(el);

  let plan = null, home = new Map(), k = 0, busy = false;
  const cut = { kind: "off", at: 0.5, flip: false };
  // per body, its cut planes (three Planes) and where each sits assembled
  let bodyPlanes = [], bodyOf = new Map();
  // each mesh's real place, kept so 0 (and closing) puts it exactly back
  function readModel() {
    restore();
    const meshes = host.modelMeshes().filter((m) => m.isMesh && m.visible);
    home = new Map(meshes.map((m) => [m, m.position.clone()]));
    plan = explodePlan(meshes, THREE);
    bodyOf = new Map();
    plan.bodies.forEach((b, i) => { for (const m of b.meshes) bodyOf.set(m, i); });
    applyCut();
  }
  // the cut: new planes for every body, handed to the viewer, then moved with
  // the bodies (setK) so an exploded part keeps the cut it had assembled
  function applyCut() {
    const eye = host.camera?.position.toArray() ?? null;
    const spec = plan && cut.kind !== "off" ? cutPlanes(cut.kind, cut.at, cut.flip, plan.all, eye) : null;
    if (!spec?.planes.length) { bodyPlanes = []; host.sectionView?.(null); return; }
    bodyPlanes = plan.bodies.map(() => spec.planes.map((p) => ({ base: p.constant, plane: new THREE.Plane(new THREE.Vector3(...p.normal), p.constant) })));
    host.sectionView?.({ intersect: spec.intersect, planesFor: (m) => { const i = bodyOf.get(m); return i == null ? null : bodyPlanes[i].map((b) => b.plane); } });
    movePlanes();
  }
  function movePlanes() {
    bodyPlanes.forEach((list, i) => {
      const d = plan.moves[i];
      for (const b of list) b.plane.constant = b.base - b.plane.normal.dot(d) * k;
    });
  }
  const overlaysOn = () => k < 0.01 && cut.kind === "off";
  // keepOverlays: the video recorder hides the size lines itself, for all of it
  function setK(v, keepOverlays = false) {
    k = Math.max(0, Math.min(1, v));
    if (plan?.bodies.length >= 2) {
      plan.bodies.forEach((b, i) => {
        for (const m of b.meshes) { const h = home.get(m); if (h) m.position.copy(h).addScaledVector(plan.moves[i], k); }
      });
    }
    movePlanes();
    if (!keepOverlays) host.overlaysVisible?.(overlaysOn());
    const out = el.querySelector("output.k");
    if (out) out.textContent = `${Math.round(k * 100)}%`;
    const r = el.querySelector('input[data-k="k"]');
    if (r && +r.value !== Math.round(k * 100)) r.value = String(Math.round(k * 100));
  }
  function restore() { for (const [m, h] of home) m.position.copy(h); host.sectionView?.(null); bodyPlanes = []; host.overlaysVisible?.(true); }

  function render() {
    const n = plan?.bodies.length ?? 0;
    const pct = Math.round(cut.at * 100);
    el.innerHTML = `<h3>Exploded and cut view<button type="button" class="x" title="Close: the parts go back (Esc)" aria-label="Close">×</button></h3>`
      + (n >= 2
        ? `<div class="row"><span>Explode</span><input type="range" data-k="k" min="0" max="100" value="${Math.round(k * 100)}" aria-label="How far apart" /><output class="k">${Math.round(k * 100)}%</output></div>`
          + `<div class="btns"><button type="button" data-a="out">Expand</button><button type="button" data-a="in">Collapse</button></div>`
        : n ? `<div class="note">One body, so nothing to pull apart: an exploded view needs two or more parts (a <b>New body</b>, or shapes in <code>group(…)</code>). The cut view below still works.</div>`
          : `<div class="note">Nothing is built yet.</div>`)
      + (n ? `<div class="sub">Cut view</div>`
          + `<div class="row"><span>Cut</span><div class="seg" role="group" aria-label="Cut view">${CUTS.map(([v, l]) => `<button type="button" data-cut="${v}" class="${cut.kind === v ? "on" : ""}" title="${v === "off" ? "No cut" : v === "quarter" ? "Take a quarter out (the corner past X and Y)" : `Slice across ${v.toUpperCase()}`}">${l}</button>`).join("")}</div></div>`
          + (cut.kind !== "off"
            ? `<div class="row"><span>Cut at</span><input type="range" data-k="at" min="0" max="100" value="${pct}" aria-label="Where the cut is" /><output class="at">${pct}%</output></div>`
              + `<label class="chk"><input type="checkbox" data-k="flip"${cut.flip ? " checked" : ""} /> Show the other side</label>`
            : "")
          + `<div class="btns"><button type="button" data-a="video" class="primary" title="A short video: the part turns once${n >= 2 ? ", comes apart, holds, and goes back together" : ""}, with the cut if one is on (WebM)">Save video…</button></div>`
          + `<div class="note">${n >= 2 ? `${n} parts. ` : ""}A view only: the code doesn't change, and closing puts every part back.</div>`
        : "")
      + `<div class="note st"></div>`;
  }
  const say = (t, err = false) => { const s = el.querySelector(".st"); if (s) { s.textContent = t; s.classList.toggle("err", err); } };
  // ease from where it is to `to` over ms
  function glide(to, ms = 700) {
    return new Promise((done) => {
      const from = k, t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        setK(from + (to - from) * e);
        if (t < 1 && document.body.contains(el)) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  }
  function setCut(kind, at = cut.at, flip = cut.flip) {
    const redraw = kind !== cut.kind;
    Object.assign(cut, { kind, at, flip });
    applyCut();
    host.overlaysVisible?.(overlaysOn());
    if (redraw) render();
    const o = el.querySelector("output.at");
    if (o) o.textContent = `${Math.round(cut.at * 100)}%`;
  }
  el.addEventListener("input", (e) => {
    const key = e.target.dataset?.k;
    if (key === "k") setK(+e.target.value / 100);
    if (key === "at") setCut(cut.kind, +e.target.value / 100);
  });
  el.addEventListener("change", (e) => { if (e.target.dataset?.k === "flip") setCut(cut.kind, cut.at, e.target.checked); });
  el.addEventListener("click", async (e) => {
    if (e.target.closest(".x")) { close(); return; }
    const c = e.target.closest("[data-cut]")?.dataset.cut;
    if (c && !busy) { setCut(c); return; }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a || busy) return;
    if (a === "out") glide(1);
    if (a === "in") glide(0);
    if (a === "video") {
      busy = true;
      el.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      try {
        const { recordExplode } = await import("./explode-video.js");
        say("Recording… (about 9 s; leave the window be)");
        const file = await recordExplode({ host, THREE, explode: (plan?.bodies.length ?? 0) >= 2, frame: plan?.out ?? plan?.all, setK: (v) => setK(v, true), getK: () => k, onProgress: (p) => say(`Recording… ${Math.round(p * 100)}%`) });
        say(`Saved ${file}.`);
      } catch (err) {
        say(`The video could not be made: ${err?.message || err}`, true);
      }
      busy = false;
      el.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      host.overlaysVisible?.(overlaysOn());
    }
  });
  el.addEventListener("keydown", (e) => e.stopPropagation());
  const onKey = (e) => { if (e.key === "Escape" && !busy) close(); };
  addEventListener("keydown", onKey);
  // a rebuild makes new meshes: start again from the new model, assembled
  // (the cut stays as it was)
  const off = host.onBuilt?.(() => { if (!document.body.contains(el)) return; home = new Map(); k = 0; readModel(); render(); host.overlaysVisible?.(overlaysOn()); });
  function close() { restore(); el.remove(); removeEventListener("keydown", onKey); off?.(); }
  host.clearSelection?.();         // the move gizmo belongs to the assembled part
  readModel();
  render();
  return {
    close, setK, get k() { return k; }, get parts() { return plan?.bodies.length ?? 0; },
    setCut: (kind, at, flip) => { setCut(kind, at ?? cut.at, flip ?? cut.flip); },
    get cut() { return { ...cut }; },
  };
}
