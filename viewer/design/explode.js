// design/explode.js — Design mode's exploded (assembly) view.
//
// Loaded the first time Explode is clicked. Every body of the model (each
// solid the build made: a New body, each part of a group()) is pulled away
// from the middle of the whole, along the line from that middle to its own,
// by a slider; back to 0 it is assembled again. A view only: the code and the
// parts' real places never change, and closing the panel puts them back.
// "Save video" loads design/explode-video.js only when pressed.

const CSS = `
#dz-explode { top: 56px; right: 12px; width: 286px; padding: 0 0 10px; z-index: 31; }
body.dz-ribbon #dz-explode { top: 104px; }
#dz-explode h3 { margin: 0; padding: 9px 12px 7px; font-size: 13px; font-weight: 650; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border, #26314a); }
#dz-explode h3 .x { margin-left: auto; border: 0; background: transparent; cursor: pointer; color: var(--muted, #8ea0c0); font-size: 15px; }
#dz-explode .row { display: flex; align-items: center; gap: 8px; margin: 9px 12px 0; font-size: 12px; }
#dz-explode .row > span { width: 72px; color: var(--muted, #8ea0c0); flex: none; }
#dz-explode input[type=range] { flex: 1 1 auto; min-width: 0; }
#dz-explode output { width: 38px; text-align: right; font: 12px ui-monospace, Consolas, monospace; }
#dz-explode .btns { display: flex; gap: 6px; margin: 10px 12px 0; flex-wrap: wrap; }
#dz-explode .btns button { border: 1px solid var(--border, #26314a); background: transparent; border-radius: 7px; padding: 5px 10px; cursor: pointer; color: inherit; font-size: 12px; }
#dz-explode .btns button.primary { background: var(--accent, #1c66e5); border-color: var(--accent, #1c66e5); color: #fff; }
#dz-explode .btns button:disabled { opacity: .45; cursor: default; }
#dz-explode .note { margin: 8px 12px 0; font-size: 11px; color: var(--muted, #8ea0c0); }
#dz-explode .note.err { color: #ffb3b3; }
`;

// The bodies (meshes grouped by the solid they belong to) and, for each,
// which way and how far it moves at full explode: along the line from the
// whole model's middle to its own, a third of a body's own size plus a fifth
// of the whole's, so small parts clear big ones and all stay in view. A body right at the middle rises
// straight up instead (a lid on a box).
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
  if (bodies.length < 2) return { bodies, moves: [] };
  const mid = all.getCenter(new THREE.Vector3()), whole = all.getSize(new THREE.Vector3()).length();
  const moves = bodies.map(({ box }) => {
    const c = box.getCenter(new THREE.Vector3()), own = box.getSize(new THREE.Vector3()).length();
    const d = c.clone().sub(mid);
    const dir = d.length() > whole * 1e-3 ? d.normalize() : new THREE.Vector3(0, 0, 1);
    return dir.multiplyScalar(own * 0.35 + whole * 0.2);
  });
  // nothing goes below the floor it stood on (the grid would cut through it):
  // the whole explosion rises by what the lowest part would sink
  const sink = Math.max(0, ...bodies.map(({ box }, i) => all.min.z - (box.min.z + moves[i].z)));
  if (sink > 0) for (const m of moves) m.z += sink;
  return { bodies, moves };
}

let cssDone = false;
export function openExplode({ host, THREE }) {
  if (!cssDone) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
  document.getElementById("dz-explode")?.remove();
  const el = document.createElement("div");
  el.id = "dz-explode";
  el.className = "dz-ui";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Exploded view");
  document.body.appendChild(el);

  let plan = null, home = new Map(), k = 0, busy = false;
  // each mesh's real place, kept so 0 (and closing) puts it exactly back
  function readModel() {
    restore();
    const meshes = host.modelMeshes().filter((m) => m.isMesh && m.visible);
    home = new Map(meshes.map((m) => [m, m.position.clone()]));
    plan = explodePlan(meshes, THREE);
  }
  // keepOverlays: the video recorder hides the size lines itself, for all of it
  function setK(v, keepOverlays = false) {
    k = Math.max(0, Math.min(1, v));
    if (!plan?.moves.length) return;
    plan.bodies.forEach((b, i) => {
      for (const m of b.meshes) { const h = home.get(m); if (h) m.position.copy(h).addScaledVector(plan.moves[i], k); }
    });
    if (!keepOverlays) host.overlaysVisible?.(k < 0.01);
    const out = el.querySelector("output");
    if (out) out.textContent = `${Math.round(k * 100)}%`;
    const r = el.querySelector("input[type=range]");
    if (r && +r.value !== Math.round(k * 100)) r.value = String(Math.round(k * 100));
  }
  function restore() { for (const [m, h] of home) m.position.copy(h); host.overlaysVisible?.(true); }

  function render() {
    const n = plan?.bodies.length ?? 0;
    el.innerHTML = `<h3>Exploded view<button type="button" class="x" title="Close: the parts go back (Esc)" aria-label="Close">×</button></h3>`
      + (n >= 2
        ? `<div class="row"><span>Explode</span><input type="range" min="0" max="100" value="${Math.round(k * 100)}" aria-label="How far apart" /><output>${Math.round(k * 100)}%</output></div>`
          + `<div class="btns"><button type="button" data-a="out">Expand</button><button type="button" data-a="in">Collapse</button><button type="button" data-a="video" class="primary" title="A short video: the part turns once, comes apart, holds, and goes back together (WebM)">Save video…</button></div>`
          + `<div class="note">${n} parts. A view only: the code doesn't change, and closing puts every part back.</div>`
        : `<div class="note">There is ${n ? "one body" : "nothing built"} here. An exploded view needs two or more parts: sketch one as a <b>New body</b>, or put shapes in <code>group(…)</code> in the code.</div>`)
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
  el.addEventListener("input", (e) => { if (e.target.type === "range") setK(+e.target.value / 100); });
  el.addEventListener("click", async (e) => {
    if (e.target.closest(".x")) { close(); return; }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a || busy) return;
    if (a === "out") glide(1);
    if (a === "in") glide(0);
    if (a === "video") {
      busy = true;
      el.querySelectorAll("button[data-a]").forEach((b) => { b.disabled = true; });
      try {
        const { recordExplode } = await import("./explode-video.js");
        say("Recording… (about 9 s; leave the window be)");
        const file = await recordExplode({ host, THREE, setK: (v) => setK(v, true), getK: () => k, onProgress: (p) => say(`Recording… ${Math.round(p * 100)}%`) });
        say(`Saved ${file}.`);
      } catch (err) {
        say(`The video could not be made: ${err?.message || err}`, true);
      }
      busy = false;
      el.querySelectorAll("button[data-a]").forEach((b) => { b.disabled = false; });
    }
  });
  el.addEventListener("keydown", (e) => e.stopPropagation());
  const onKey = (e) => { if (e.key === "Escape" && !busy) close(); };
  addEventListener("keydown", onKey);
  // a rebuild makes new meshes: start again from the new model, assembled
  const off = host.onBuilt?.(() => { if (!document.body.contains(el)) return; home = new Map(); k = 0; readModel(); render(); });
  function close() { restore(); el.remove(); removeEventListener("keydown", onKey); off?.(); }
  host.clearSelection?.();         // the move gizmo belongs to the assembled part
  readModel();
  render();
  return { close, setK, get k() { return k; }, get parts() { return plan?.bodies.length ?? 0; } };
}
