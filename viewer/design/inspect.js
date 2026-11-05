// design/inspect.js — Design mode's Inspect: the part's properties.
//
// Loaded the first time Properties is clicked. Read off the meshes the viewer
// drew (what you see is what is measured): volume, surface area, the size of
// its box, the centre of mass and the mass for a material, per body and in
// all. Nothing here changes the model. "…" opens the look of it (preset,
// filament, colour, finish, lights): those rows drive the viewer's own
// Material and Lighting controls, so the two always agree.

const CSS = `
#dz-props { top: 56px; right: 12px; width: 286px; padding: 0 0 10px; z-index: 31; }
body.dz-ribbon #dz-props { top: 104px; }
#dz-props h3 { margin: 0; padding: 9px 12px 7px; font-size: 13px; font-weight: 650; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border, #26314a); }
#dz-props h3 .x { margin-left: auto; border: 0; background: transparent; cursor: pointer; color: var(--muted, #8ea0c0); font-size: 15px; }
#dz-props table { width: calc(100% - 24px); margin: 8px 12px 0; border-collapse: collapse; font-size: 12px; }
#dz-props td { padding: 3px 0; vertical-align: top; }
#dz-props td:first-child { color: var(--muted, #8ea0c0); width: 92px; }
#dz-props td b { font: 600 12px ui-monospace, Consolas, monospace; }
#dz-props td small { color: var(--muted, #8ea0c0); font-size: 11px; }
#dz-props .f { display: flex; align-items: center; gap: 8px; margin: 8px 12px 0; font-size: 12px; }
#dz-props .f > span { width: 92px; color: var(--muted, #8ea0c0); flex: none; }
#dz-props select { flex: 1 1 auto; min-width: 0; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border, #26314a); background: rgba(0,0,0,.22); color: inherit; font: 12px system-ui, sans-serif; }
#dz-props .note { margin: 8px 12px 0; font-size: 11px; color: var(--muted, #8ea0c0); }
#dz-props .more { display: flex; align-items: center; gap: 6px; width: calc(100% - 24px); margin: 10px 12px 0; padding: 5px 8px; border: 1px solid var(--border, #26314a); border-radius: 7px; background: transparent; color: inherit; font-size: 12px; cursor: pointer; text-align: left; }
#dz-props .more b { font-size: 15px; line-height: 10px; letter-spacing: 1px; }
#dz-props .more i { margin-left: auto; font-style: normal; color: var(--muted, #8ea0c0); }
#dz-props .lk { max-height: 46vh; overflow-y: auto; padding-bottom: 2px; }
#dz-props .lk .sub { margin: 10px 12px 0; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .04em; color: var(--muted, #8ea0c0); }
#dz-props .lk input[type=range] { flex: 1 1 auto; min-width: 0; }
#dz-props .lk output { width: 40px; flex: none; text-align: right; font: 11.5px ui-monospace, Consolas, monospace; }
#dz-props .lk .sw { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 auto; min-width: 0; }
#dz-props .lk .sw button { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25); cursor: pointer; padding: 0; }
#dz-props .lk .sw button.on { outline: 2px solid var(--accent, #3b6ef5); outline-offset: 1px; }
#dz-props .lk .all { margin: 10px 12px 0; border: 1px solid var(--border, #26314a); background: transparent; border-radius: 7px; padding: 5px 10px; cursor: pointer; color: inherit; font-size: 12px; }
`;

// the viewer's own controls the "…" rows drive (Material and Lighting card)
const FINISH = [["mat-metal", "Metalness"], ["mat-rough", "Roughness"], ["mat-opacity", "Opacity"]];
const LIGHTS = [["mat-ambient", "Ambient"], ["mat-key", "Key light"], ["mat-fill", "Fill light"], ["mat-rim", "Rim light"], ["mat-exposure", "Exposure"]];

// A piece's own material name (finish("Brass", …), a preset, a spool) as one
// of MATERIALS, or null: "Brass" -> brass, "Aluminium" / "aluminum" -> al,
// "Stainless steel" -> steel, "Balsa" / "Oak" -> wood, "Silk PLA" -> pla.
export function materialOf(name) {
  const t = String(name || "");
  for (const [k, re] of [["brass", /brass|bronze/i], ["al", /alumin/i], ["steel", /steel|iron|titanium/i], ["wood", /wood|balsa|oak|pine|walnut|maple/i]]) {
    if (re.test(t)) return k;
  }
  return familyOf(t);
}

// A spool or filament look's family, as one of MATERIALS (for the mass):
// "Filament — PETG" / "PETG - glossy" -> petg. null when it says no family.
export function familyOf(text) {
  const t = String(text || "");
  for (const [k, re] of [["petg", /\bPETG\b/i], ["pla", /\bPLA\b/i], ["abs", /\bABS\b/i], ["asa", /\bASA\b/i], ["tpu", /\bTPU\b/i], ["nylon", /\b(nylon|PA\d*)\b/i], ["resin", /\bresin\b/i]]) {
    if (re.test(t)) return k;
  }
  return null;
}

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
  let more = (() => { try { return localStorage.getItem("brepcode.propsMore") === "1"; } catch { return false; } })();
  const $ = (id) => document.getElementById(id);
  const outOf = (id) => $(`${id}-o`)?.textContent ?? "";
  // drive one of the viewer's controls as if it were used there
  const drive = (target, value) => {
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const range = ([id, label]) => {
    const t = $(id);
    if (!t) return "";
    return `<label class="f"><span>${label}</span><input type="range" data-m="${id}" min="${t.min}" max="${t.max}" step="${t.step || 1}" value="${t.value}" /><output data-o="${id}">${outOf(id)}</output></label>`;
  };
  function lookHTML() {
    const presets = [...document.querySelectorAll("#mat-presets .mat-preset")];
    const onPreset = presets.find((b) => b.classList.contains("active"))?.dataset.name ?? "";
    const fil = $("mat-filament");
    const sw = [...document.querySelectorAll("#mat-swatches button")].slice(0, 14);
    const colour = ($("mat-color")?.value ?? "").toLowerCase();
    return `<div class="lk">`
      + (presets.length ? `<label class="f"><span>Look</span><select data-preset><option value=""${onPreset ? "" : " selected"}>Custom</option>${presets.map((b) => `<option value="${b.dataset.name}"${b.dataset.name === onPreset ? " selected" : ""}>${b.dataset.name}</option>`).join("")}</select></label>` : "")
      + (fil ? `<label class="f" title="How the plastic carries light: a real spool's colour and see-through-ness. A spool also sets the mass material."><span>Filament</span><select data-m="mat-filament">${fil.innerHTML}</select></label>` : "")
      + (sw.length ? `<div class="f"><span>Colour</span><span class="sw">${sw.map((b, i) => `<button type="button" data-sw="${i}" title="${b.title}" style="background:${b.style.background}" class="${rgbHex(b.style.background) === colour ? "on" : ""}"></button>`).join("")}</span></div>` : "")
      + FINISH.map(range).join("")
      + `<div class="sub">Lighting</div>`
      + LIGHTS.map(range).join("")
      + `<button type="button" class="all" title="The Material, Lighting and Grid settings window, with everything (textures, outlines, tints, background)">All look settings…</button>`
      + `</div>`;
  }
  const f = (x, d = 2) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : String(Math.round(x * 10 ** d) / 10 ** d));
  function render() {
    const meshes = host.modelMeshes().filter((m) => m.isMesh && m.visible);
    const all = measureMeshes(meshes, THREE);
    const bodies = new Set(meshes.map((m) => m.userData?.solidName ?? m.uuid)).size;
    const rhoOf = (k) => (MATERIALS.find((x) => x[0] === k) ?? MATERIALS[0])[2];
    // each piece by its own material where it has one (finish() / the shape
    // menu), the rest by the Material picked below
    // (whole solids: a hole's faces carry the cutter's id, not the body's)
    const solids = new Map();
    for (const m of meshes) {
      const sk = m.userData?.solidName ?? m.uuid;
      if (!solids.has(sk)) solids.set(sk, []);
      solids.get(sk).push(m);
    }
    const own = new Map();
    for (const list of solids.values()) {
      const votes = new Map();
      for (const m of list) { const v = materialOf(host.finishOf?.(m.userData?.featureId)); if (v) votes.set(v, (votes.get(v) ?? 0) + 1); }
      const k = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? mat;
      if (!own.has(k)) own.set(k, []);
      own.get(k).push(...list);
    }
    const grams = [...own].reduce((g, [k, list]) => g + ((own.size === 1 ? all.volume : measureMeshes(list, THREE).volume) / 1000) * rhoOf(k), 0);
    const mixed = [...own.keys()].filter((k) => k !== mat).map((k) => MATERIALS.find((x) => x[0] === k)?.[1]).filter(Boolean);
    el.innerHTML = `<h3>Properties<button type="button" class="x" title="Close (Esc)" aria-label="Close">×</button></h3>`
      + (meshes.length ? `<table>`
        + `<tr><td>Volume</td><td><b>${f(all.volume)}</b> mm³ (${f(all.volume / 1000, 3)} cm³)</td></tr>`
        + `<tr><td>Surface area</td><td><b>${f(all.area)}</b> mm²</td></tr>`
        + `<tr><td>Size (box)</td><td><b>${all.size.map((x) => f(x)).join(" × ")}</b> mm</td></tr>`
        + `<tr><td>Centre of mass</td><td><b>${all.centre ? all.centre.map((x) => f(x)).join(", ") : "–"}</b></td></tr>`
        + `<tr><td>Bodies</td><td><b>${bodies}</b></td></tr>`
        + `<tr><td>Mass</td><td><b>${f(grams, grams < 10 ? 2 : 1)}</b> g${mixed.length ? `<br><small>parts in ${mixed.join(", ")} weighed as that</small>` : ""}</td></tr>`
        + `</table><label class="f"><span>Material</span><select>${MATERIALS.map(([k, l, d]) => `<option value="${k}"${k === mat ? " selected" : ""}>${l} (${d} g/cm³)</option>`).join("")}</select></label>`
        + `<div class="note">Measured on the shape as drawn on screen (its triangles), so a curved part reads a hair under its true size. Mass assumes a solid part: a 3D print with infill weighs less.</div>`
        : `<div class="note">Nothing is built yet.</div>`)
      + `<button type="button" class="more" aria-expanded="${more}" title="The part's look: filament, colour, finish and lighting"><b>…</b> Look and lighting<i>${more ? "▴" : "▾"}</i></button>`
      + (more ? lookHTML() : "");
    const fil = el.querySelector('select[data-m="mat-filament"]');
    if (fil) fil.value = $("mat-filament").value;
  }
  // "rgb(159, 180, 214)" -> "#9fb4d6"
  function rgbHex(c) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || "");
    return m ? "#" + m.slice(1, 4).map((v) => (+v).toString(16).padStart(2, "0")).join("") : String(c || "").toLowerCase();
  }
  // a spool picked here (or a translucent look) sets the mass material too
  function massFromFilament(sel) {
    const o = sel.selectedOptions[0];
    const fam = familyOf(o?.parentElement?.tagName === "OPTGROUP" ? o.parentElement.label : "") ?? familyOf(o?.textContent) ?? (o?.value === "pla" || o?.value === "petg" ? o.value : null);
    if (!fam || fam === mat) return;
    mat = fam;
    try { localStorage.setItem("brepcode.propsMaterial", mat); } catch { /* private window */ }
  }
  el.addEventListener("click", (e) => {
    if (e.target.closest(".x")) { close(); return; }
    if (e.target.closest(".more")) {
      more = !more;
      try { localStorage.setItem("brepcode.propsMore", more ? "1" : "0"); } catch { /* private window */ }
      if (more) host.loadSpools?.()?.then?.(() => { if (more && document.body.contains(el)) render(); });
      render();
      return;
    }
    if (e.target.closest(".all")) { host.openLook?.("material"); return; }
    const sw = e.target.closest("[data-sw]");
    if (sw) { document.querySelectorAll("#mat-swatches button")[+sw.dataset.sw]?.click(); render(); }
  });
  // a range dragged here: the viewer's control follows, live
  el.addEventListener("input", (e) => {
    const id = e.target.dataset?.m;
    if (!id || e.target.type !== "range") return;
    const t = $(id);
    if (!t) return;
    t.value = e.target.value;
    t.dispatchEvent(new Event("input", { bubbles: true }));
    const o = el.querySelector(`output[data-o="${id}"]`);
    if (o) o.textContent = outOf(id);
  });
  el.addEventListener("change", (e) => {
    if (e.target.tagName !== "SELECT") return;
    if (e.target.dataset.preset != null) {
      const b = [...document.querySelectorAll("#mat-presets .mat-preset")].find((x) => x.dataset.name === e.target.value);
      b?.click();
    } else if (e.target.dataset.m === "mat-filament") {
      drive($("mat-filament"), e.target.value);
      massFromFilament(e.target);
    } else {
      mat = e.target.value;
      try { localStorage.setItem("brepcode.propsMaterial", mat); } catch { /* private window */ }
    }
    render();
  });
  el.addEventListener("keydown", (e) => e.stopPropagation());
  const onKey = (e) => { if (e.key === "Escape") close(); };
  addEventListener("keydown", onKey);
  // the numbers follow the model: re-read after each build
  const off = host.onBuilt?.(() => document.body.contains(el) && render());
  function close() { el.remove(); removeEventListener("keydown", onKey); off?.(); }
  if (more) host.loadSpools?.()?.then?.(() => { if (more && document.body.contains(el)) render(); });
  render();
  return { close, render, el, get material() { return mat; } };
}
