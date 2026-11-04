// design/inspect.js — Design mode's Inspect: the part's properties.
//
// Loaded the first time Properties is clicked. Read off the meshes the viewer
// drew (what you see is what is measured): volume, surface area, the size of
// its box, the centre of mass and the mass for a material, per body and in
// all. Nothing here changes the model.

const CSS = `
#dz-props { top: 56px; right: 12px; width: 286px; padding: 0 0 10px; z-index: 31; }
body.dz-ribbon #dz-props { top: 104px; }
#dz-props h3 { margin: 0; padding: 9px 12px 7px; font-size: 13px; font-weight: 650; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border, #26314a); }
#dz-props h3 .x { margin-left: auto; border: 0; background: transparent; cursor: pointer; color: var(--muted, #8ea0c0); font-size: 15px; }
#dz-props table { width: calc(100% - 24px); margin: 8px 12px 0; border-collapse: collapse; font-size: 12px; }
#dz-props td { padding: 3px 0; vertical-align: top; }
#dz-props td:first-child { color: var(--muted, #8ea0c0); width: 92px; }
#dz-props td b { font: 600 12px ui-monospace, Consolas, monospace; }
#dz-props label.f { display: flex; align-items: center; gap: 8px; margin: 8px 12px 0; font-size: 12px; }
#dz-props label.f > span { width: 92px; color: var(--muted, #8ea0c0); flex: none; }
#dz-props select { flex: 1 1 auto; min-width: 0; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border, #26314a); background: rgba(0,0,0,.22); color: inherit; font: 12px system-ui, sans-serif; }
#dz-props .note { margin: 8px 12px 0; font-size: 11px; color: var(--muted, #8ea0c0); }
`;

// g/cm³
export const MATERIALS = [
  ["pla", "PLA", 1.24], ["petg", "PETG", 1.27], ["abs", "ABS", 1.04], ["asa", "ASA", 1.07], ["nylon", "Nylon", 1.14], ["tpu", "TPU", 1.21],
  ["resin", "Resin (standard)", 1.15], ["al", "Aluminium", 2.7], ["steel", "Steel", 7.85], ["brass", "Brass", 8.5], ["wood", "Wood (pine)", 0.5],
];

// Volume, area, box and centre of mass of triangle meshes (world space).
// Closed meshes give a true volume (a signed sum of tetrahedra to the origin).
export function measureMeshes(meshes, THREE) {
  let v = 0, area = 0;
  const cm = [0, 0, 0], box = new THREE.Box3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    const g = m.geometry, p = g?.attributes?.position, ix = g?.index;
    if (!p) continue;
    const n = ix ? ix.count : p.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const j = [0, 1, 2].map((k) => (ix ? ix.getX(i + k) : i + k));
      a.fromBufferAttribute(p, j[0]).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(p, j[1]).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(p, j[2]).applyMatrix4(m.matrixWorld);
      const t = a.dot(b.clone().cross(c)) / 6;
      v += t;
      cm[0] += t * (a.x + b.x + c.x) / 4; cm[1] += t * (a.y + b.y + c.y) / 4; cm[2] += t * (a.z + b.z + c.z) / 4;
      area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
      box.expandByPoint(a); box.expandByPoint(b); box.expandByPoint(c);
    }
  }
  const centre = Math.abs(v) > 1e-12 ? cm.map((x) => x / v) : null;
  const size = box.isEmpty() ? [0, 0, 0] : [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  return { volume: Math.abs(v), area, size, centre };
}

let cssDone = false;
export function openProperties({ host, THREE }) {
  if (!cssDone) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
  document.getElementById("dz-props")?.remove();
  const el = document.createElement("div");
  el.id = "dz-props";
  el.className = "dz-ui";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Properties");
  document.body.appendChild(el);
  let mat = (() => { try { return localStorage.getItem("brepcode.propsMaterial") || "pla"; } catch { return "pla"; } })();
  const f = (x, d = 2) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : String(Math.round(x * 10 ** d) / 10 ** d));
  function render() {
    const meshes = host.modelMeshes().filter((m) => m.isMesh && m.visible);
    const all = measureMeshes(meshes, THREE);
    const bodies = new Set(meshes.map((m) => m.userData?.solidName ?? m.uuid)).size;
    const rho = (MATERIALS.find((x) => x[0] === mat) ?? MATERIALS[0])[2];
    const grams = (all.volume / 1000) * rho;
    el.innerHTML = `<h3>Properties<button type="button" class="x" title="Close (Esc)" aria-label="Close">×</button></h3>`
      + (meshes.length ? `<table>`
        + `<tr><td>Volume</td><td><b>${f(all.volume)}</b> mm³ (${f(all.volume / 1000, 3)} cm³)</td></tr>`
        + `<tr><td>Surface area</td><td><b>${f(all.area)}</b> mm²</td></tr>`
        + `<tr><td>Size (box)</td><td><b>${all.size.map((x) => f(x)).join(" × ")}</b> mm</td></tr>`
        + `<tr><td>Centre of mass</td><td><b>${all.centre ? all.centre.map((x) => f(x)).join(", ") : "–"}</b></td></tr>`
        + `<tr><td>Bodies</td><td><b>${bodies}</b></td></tr>`
        + `<tr><td>Mass</td><td><b>${f(grams, grams < 10 ? 2 : 1)}</b> g</td></tr>`
        + `</table><label class="f"><span>Material</span><select>${MATERIALS.map(([k, l, d]) => `<option value="${k}"${k === mat ? " selected" : ""}>${l} (${d} g/cm³)</option>`).join("")}</select></label>`
        + `<div class="note">Measured on the shape as drawn on screen (its triangles), so a curved part reads a hair under its true size. Mass assumes a solid part: a 3D print with infill weighs less.</div>`
        : `<div class="note">Nothing is built yet.</div>`);
  }
  el.addEventListener("click", (e) => { if (e.target.closest(".x")) close(); });
  el.addEventListener("change", (e) => {
    if (e.target.tagName !== "SELECT") return;
    mat = e.target.value;
    try { localStorage.setItem("brepcode.propsMaterial", mat); } catch { /* private window */ }
    render();
  });
  el.addEventListener("keydown", (e) => e.stopPropagation());
  const onKey = (e) => { if (e.key === "Escape") close(); };
  addEventListener("keydown", onKey);
  // the numbers follow the model: re-read after each build
  const off = host.onBuilt?.(() => document.body.contains(el) && render());
  function close() { el.remove(); removeEventListener("keydown", onKey); off?.(); }
  render();
  return { close, render, el };
}
