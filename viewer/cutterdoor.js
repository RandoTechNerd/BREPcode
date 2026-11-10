// The cookie-cutter front door (brepcode.com/cutter, ?cutter=1, and the Toolbox).
//
// Someone who arrives wanting a cookie cutter should see cookie cutters: a
// shelf of popular shapes, each a picture of the cutter it makes, one click
// from being on the plate. Under them, "Design your own": the icon search and
// the choice of kit (cutter, cutter and stamp, stencil, roller), which is the
// same card the Toolbox opens.
//
// The shapes are DRAWN HERE, from a few lines of arithmetic each, not traced
// from anyone's artwork: nothing to license, nothing to download, and each one
// is a single clean outline, which is what makes a cutter that prints first
// time. A star's points are rounded off a little and no neck is thinner than
// the blade can cut, for the same reason.
//
// PURE where it counts: EXAMPLES and previewSvg() touch no DOM, so the shapes
// are tested as geometry (closed, simple, a sensible size) and built through
// the real kernel in test/cutterkit.js.

const TAU = Math.PI * 2;
const round3 = (v) => +v.toFixed(3);
// a closed loop from a radius function of the angle
const polar = (r, n = 96, x = (a) => Math.cos(a), y = (a) => Math.sin(a)) =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU; const k = r(a); return [round3(k * x(a)), round3(k * y(a))]; });

function star() {
  // five points, the tips and the valleys rounded: a sharp tip tears dough
  const pts = [];
  const N = 5, R = 36, r = 16, steps = 6;
  for (let i = 0; i < N * 2; i++) {
    const a0 = (i / (N * 2)) * TAU + Math.PI / 2, rad = i % 2 ? r : R, soft = i % 2 ? 0.16 : 0.1;
    for (let s = -steps; s <= steps; s++) {
      const t = s / steps, a = a0 + t * soft;
      pts.push([round3(Math.cos(a) * rad * (1 - 0.06 * t * t)), round3(Math.sin(a) * rad * (1 - 0.06 * t * t))]);
    }
  }
  return pts;
}
// ROUND OUT, SHARP IN. Every shape here bulges outward in arcs and turns
// inward only at a corner. The exact kernel builds those in a fraction of a
// second; an outline that curves smoothly INWARD (the parametric heart, a
// cosine flower) makes it refuse the rim's cut, and the build falls back to
// the slow kernel: 5 s for the same cutter (measured, both ways).
function heart() {
  // two circles and a point: the lobes are arcs, the sides straight tangents
  const cx = 17, cy = 12, r = 17.5, tip = [0, -34], n = 16;
  // where the lobes meet, seen from the right one, stopped a little short:
  // the notch between them gets a small flat floor, not a knife-edge corner
  // (which the kernel refuses, and which would tear the dough anyway)
  const dip = Math.atan2(Math.sqrt(r * r - cx * cx), -cx) - 0.5;
  const d = Math.hypot(cx - tip[0], cy - tip[1]);
  const tan = Math.atan2(tip[1] - cy, tip[0] - cx) + Math.acos(r / d);         // where the right side leaves its lobe
  const right = Array.from({ length: n + 1 }, (_, i) => { const a = tan + (i / n) * (dip - tan); return [round3(cx + r * Math.cos(a)), round3(cy + r * Math.sin(a))]; });
  const left = right.slice(0, -1).reverse().map(([x, y]) => [round3(-x), y]);
  return [tip, ...right, ...left];
}
function flower() {
  // six round petals: arcs that meet at a corner between each pair
  const N = 6, R = 22, r = 13, n = 8;
  // from a petal's middle to just short of where it meets the next: a small
  // flat between petals, for the same reason as the heart's notch
  const half = Math.PI / 2 + Math.PI / N - Math.acos((R * Math.sin(Math.PI / N)) / r) - 0.28;
  const pts = [];
  for (let k = 0; k < N; k++) {
    const c = (k / N) * TAU;
    for (let j = -n; j <= n; j++) { const a = c + (j / n) * half; pts.push([round3(R * Math.cos(c) + r * Math.cos(a)), round3(R * Math.sin(c) + r * Math.sin(a))]); }
  }
  return pts;
}
const biscuit = () => polar((a) => 32 + 3 * Math.abs(Math.cos(6 * a)), 144);
const egg = () => polar(() => 1, 96, (a) => 27 * Math.cos(a), (a) => 36 * Math.sin(a) * (1 + 0.12 * Math.sin(a)) - 2);
function moon() {
  // a crescent: the outside of one circle, back along the inside of another
  const pts = [];
  const R = 34, r = 27, off = 15, n = 48;
  const a0 = Math.acos((off * off + R * R - r * r) / (2 * off * R));        // where the circles cross
  for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (TAU - 2 * a0); pts.push([round3(R * Math.cos(a)), round3(R * Math.sin(a))]); }
  const b0 = Math.atan2(R * Math.sin(-a0), R * Math.cos(-a0) - off);
  const b1 = Math.atan2(R * Math.sin(a0), R * Math.cos(a0) - off);
  // ...the LONG way round the inner circle, through its far side: the short
  // way closes the outline across the open mouth and makes a blob, not a moon
  const span = -(TAU - (b1 - b0));
  const m = 14;                                                             // few, flat facets: see ROUND OUT, SHARP IN
  for (let i = 1; i < m; i++) { const b = b0 + (i / m) * span; pts.push([round3(off + r * Math.cos(b)), round3(r * Math.sin(b))]); }
  return pts.map(([x, y]) => [round3(x - 6), y]);
}
function tree() {
  // three tiers and a trunk, right-hand side up then mirrored back down
  const right = [[5, -36], [5, -26], [27, -26], [12, -8], [21, -8], [8, 10], [15, 10], [0, 36]];
  const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
  return [...right, ...left];
}
function house() {
  return [[-28, -30], [28, -30], [28, 4], [34, 4], [0, 36], [-34, 4], [-28, 4]];
}
function cloud() {
  // a flat-bottomed cloud: lumps along the top
  return polar((a) => {
    const s = Math.sin(a);
    return s < -0.2 ? 30 / Math.max(0.55, -s * 1.6 + 0.2) * 0.62 : 26 + 6 * Math.abs(Math.cos(3.5 * a));
  }, 144, (a) => 1.35 * Math.cos(a), (a) => 0.85 * Math.sin(a));
}

// What is on the shelf. `loops` is the outline at about 70 mm, centred.
export const EXAMPLES = [
  { id: "star", label: "Star", blurb: "the one everyone starts with", make: star },
  { id: "heart", label: "Heart", blurb: "Valentine's, weddings, any day", make: heart },
  { id: "flower", label: "Flower", blurb: "six round petals", make: flower },
  { id: "tree", label: "Tree", blurb: "three tiers and a trunk", make: tree },
  { id: "moon", label: "Moon", blurb: "a crescent", make: moon },
  { id: "house", label: "House", blurb: "gingerbread, flat-packed", make: house },
  { id: "egg", label: "Egg", blurb: "Easter, or a plain oval", make: egg },
  { id: "biscuit", label: "Scalloped round", blurb: "the classic biscuit edge", make: biscuit },
].map((e) => ({ ...e, loops: [{ hole: false, points: e.make() }] }));

export const exampleById = (id) => EXAMPLES.find((e) => e.id === id) || null;

// A picture of the cutter that outline makes, standing on its rim and seen
// from above and in front, the way it sits on a counter. Drawn, not rendered:
// the outline is laid down flat (squashed, as a circle seen at an angle is an
// ellipse) and then drawn again and again, each copy a little higher and a
// little lighter, so the stack of thin lines IS the wall. The rim is the same
// trick with a fat line, the shadow the same outline once, blurred. It is the
// real shape, it needs no build and no image file, and it scales like type.
let previewSeq = 0;
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
export function previewSvg(loops, { size = 132, tint = "#49b9c9", top = null } = {}) {
  const pts = loops[0].points;
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const [x, y] of pts) { lo = [Math.min(lo[0], x), Math.min(lo[1], y)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y)]; }
  const SQ = 0.56;                       // how flat the plate looks from here
  const H = 20, RIM_H = 3, RIM = 11;     // blade height, rim height and rim width, in drawing units
  const w = hi[0] - lo[0], d = (hi[1] - lo[1]) * SQ;
  const pad = RIM / 2 + 4;
  const W = w + pad * 2, T = d + H + pad * 2 + 4, S = Math.max(W, T);
  const ox = (S - W) / 2 + pad - lo[0], oy = (S - T) / 2 + pad + H + hi[1] * SQ;
  // the outline as it lies on the plate: SVG's y runs down, the plate's away
  const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${round3(x + ox)} ${round3(oy - y * SQ)}`).join("") + "Z";
  const id = `ckp${++previewSeq}`;
  // two colours, the way a gradient spool prints: one at the rim, the other
  // by the time the blade reaches its edge
  const hiCol = top || mix(tint, "#ffffff", 0.35), loCol = tint;
  const use = (z, attrs) => `<use href="#${id}" transform="translate(0 ${round3(-z)})" ${attrs}/>`;
  let body = "";
  // the rim, lying on the plate
  for (let z = 0; z <= RIM_H; z += 0.75) body += use(z, `stroke="${mix(mix(loCol, "#1b1430", 0.3), loCol, z / RIM_H)}" stroke-width="${RIM}"`);
  body += use(RIM_H, `stroke="${mix(loCol, "#ffffff", 0.22)}" stroke-width="${RIM - 1.2}"`);
  // gloss: a soft light line along the rim's shoulder
  body += use(RIM_H + 0.2, `stroke="rgba(255,255,255,.5)" stroke-width="1.1" transform-origin="center"`).replace('transform="translate(0 ', 'transform="translate(-1.6 ');
  // the blade, standing on it
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    body += use(RIM_H + t * (H - RIM_H), `stroke="${mix(loCol, hiCol, t)}" stroke-width="2.6"`);
  }
  // gloss on the blade: a band of light a third of the way down from the edge
  for (const [k, o] of [[0.62, 0.16], [0.68, 0.3], [0.74, 0.16]]) body += use(RIM_H + k * (H - RIM_H), `stroke="rgba(255,255,255,${o})" stroke-width="2.6"`);
  // GLITTER: flake in the plastic, most of it a soft speck, a few caught square
  // by the light. Placed by a fixed scatter from the outline itself, so a
  // shape's picture is the same every time it is drawn.
  let seed = pts.length * 7919 + Math.round((hi[0] - lo[0]) * 131);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let flakes = "";
  for (let i = 0; i < 46; i++) {
    const p = pts[Math.floor(rnd() * pts.length)], z = RIM_H + 1 + rnd() * (H - RIM_H - 2);
    const x = round3(p[0] + ox + (rnd() - 0.5) * 1.2), y = round3(oy - p[1] * SQ - z);
    if (i % 9 === 0) {
      // a lit flake: a four-point glint
      const r = 2.1 + rnd() * 1.3;
      flakes += `<path d="M${x - r} ${y}L${x} ${round3(y - 0.45)}L${x + r} ${y}L${x} ${round3(y + 0.45)}ZM${x} ${round3(y - r)}L${round3(x + 0.45)} ${y}L${x} ${round3(y + r)}L${round3(x - 0.45)} ${y}Z" fill="#fff"/>`;
    } else {
      flakes += `<circle cx="${x}" cy="${y}" r="${round3(0.35 + rnd() * 0.45)}" fill="#fff" opacity="${round3(0.45 + rnd() * 0.45)}"/>`;
    }
  }
  body += flakes;
  // its top edge, catching the light
  body += use(H, `stroke="${mix(hiCol, "#ffffff", 0.55)}" stroke-width="1.5"`);
  return `<svg viewBox="0 0 ${round3(S)} ${round3(S)}" width="${size}" height="${size}" aria-hidden="true">`
    + `<defs><path id="${id}" d="${path}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<filter id="${id}s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>`
    + `<use href="#${id}" transform="translate(3 3.5)" stroke="rgba(20,24,34,.32)" stroke-width="${RIM + 2}" filter="url(#${id}s)"/>`
    + body + `</svg>`;
}

// rim colour, edge colour: gradient spools, one pair a card
const TINTS = [
  ["#7a4fd8", "#3cc8bd"], ["#d8457a", "#ffb07a"], ["#3f6fe0", "#b46ff0"], ["#1f8a5a", "#b7e36a"],
  ["#2b2f6e", "#f0c64a"], ["#c8572f", "#ffd27a"], ["#6a4fd8", "#ff8fc0"], ["#b03a6a", "#ffc2a8"],
];

const CSS = `
#ck-door { position: fixed; inset: 0; z-index: 100200; display: flex; align-items: center; justify-content: center;
  background: rgba(8, 10, 16, .62); backdrop-filter: blur(6px); padding: 18px; }
#ck-door .ck-box { width: min(860px, 100%); max-height: 100%; overflow: auto; border-radius: 18px;
  background: var(--panel, #131a28); color: var(--text, #e8eefc); border: 1px solid var(--border, #26314a);
  box-shadow: 0 30px 80px rgba(0, 0, 0, .5); padding: 22px 24px 20px; font: 14px system-ui, sans-serif; }
#ck-door h2 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
#ck-door .ck-sub { color: var(--muted, #8ea0c0); margin: 0 0 16px; }
#ck-door .ck-x { float: right; border: 0; background: transparent; color: var(--muted, #8ea0c0); font-size: 22px; cursor: pointer; line-height: 1; }
#ck-door .ck-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
#ck-door .ck-card { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px 10px; cursor: pointer;
  border-radius: 14px; border: 1px solid var(--border, #26314a); background: #f2f0ec; color: #1d2530; font: inherit;
  transition: transform .12s ease, box-shadow .12s ease; }
#ck-door .ck-card:hover, #ck-door .ck-card:focus-visible { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0, 0, 0, .35); outline: none; }
#ck-door .ck-card b { font-size: 14px; }
#ck-door .ck-card small { font-size: 11.5px; color: #5c6675; text-align: center; }
#ck-door .ck-own { margin-top: 16px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 14px 16px; border-radius: 14px; border: 1px dashed var(--border, #26314a); }
#ck-door .ck-own div { flex: 1; min-width: 220px; }
#ck-door .ck-own b { display: block; font-size: 15px; }
#ck-door .ck-own span { color: var(--muted, #8ea0c0); font-size: 12.5px; }
#ck-door .ck-go { border: 0; border-radius: 10px; padding: 10px 16px; font: 600 14px system-ui, sans-serif; cursor: pointer;
  background: var(--accent, #4f7cff); color: #fff; }
#ck-door .ck-foot { margin-top: 12px; color: var(--muted, #8ea0c0); font-size: 12px; }
#ck-door .ck-kinds { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 14px; }
#ck-door .ck-kinds button { border: 1px solid var(--border, #26314a); background: transparent; color: var(--text, #e8eefc);
  border-radius: 999px; padding: 7px 13px; font: 600 13px system-ui, sans-serif; cursor: pointer; }
#ck-door .ck-kinds button[aria-pressed="true"] { background: var(--accent, #4f7cff); border-color: transparent; color: #fff; }
#ck-door .ck-kinds small { display: block; font-weight: 400; font-size: 11px; opacity: .8; }
#ck-door .ck-plus { justify-content: center; background: transparent; color: var(--text, #e8eefc); border-style: dashed; min-height: 150px; }
#ck-door .ck-plus .ck-big { font-size: 44px; line-height: 1; font-weight: 300; }
#ck-door .ck-own-acts { display: flex; gap: 8px; flex-wrap: wrap; }
#ck-door .ck-ghost { border: 1px solid var(--border, #26314a); border-radius: 10px; padding: 10px 14px; font: 600 13.5px system-ui, sans-serif;
  cursor: pointer; background: transparent; color: var(--text, #e8eefc); }
`;

// showCutterDoor({ kinds, kind, onPick(example, kind), onCustom(kind), onSvg(text, name, kind), onPicture() }) -> { close }
//   kinds: [{ id, label, blurb }] the kits on offer (cutterkit's KINDS); the
//   one chosen at the top is what a shape, a search or an upload makes.
export function showCutterDoor({ kinds = [], kind = null, onPick, onCustom, onSvg, onPicture } = {}) {
  let chosen = kind || kinds[0]?.id || "cutter";
  document.getElementById("ck-door")?.remove();
  if (!document.getElementById("ck-door-css")) {
    const st = document.createElement("style");
    st.id = "ck-door-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement("div");
  el.id = "ck-door";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Cookie cutters");
  el.innerHTML = `<div class="ck-box">
    <button type="button" class="ck-x" title="Close (Esc)" aria-label="Close">×</button>
    <h2>Cookie cutters</h2>
    <p class="ck-sub">Choose what to make, then pick a shape: it is on the plate, ready to size and print. Or bring your own.</p>
    <div class="ck-kinds" role="group" aria-label="What to make">${kinds.map((k) => `<button type="button" data-kind="${k.id}" aria-pressed="${k.id === chosen}">${k.label}<small>${k.blurb}</small></button>`).join("")}</div>
    <div class="ck-grid">${EXAMPLES.map((e, i) => `<button type="button" class="ck-card" data-id="${e.id}">${previewSvg(e.loops, { tint: TINTS[i % TINTS.length][0], top: TINTS[i % TINTS.length][1] })}<b>${e.label}</b><small>${e.blurb}</small></button>`).join("")}<button type="button" class="ck-card ck-plus" data-own="1" title="Your own shape: search, or bring a file"><span class="ck-big">+</span><b>Your own</b><small style="color:inherit;opacity:.75">search, or bring an SVG or a picture</small></button></div>
    <div class="ck-own" id="ck-own">
      <div><b>Bring your own shape</b><span>Search thousands of icons, open an SVG you drew, or trace a photo or a drawing (PNG, JPG).</span></div>
      <div class="ck-own-acts">
        <button type="button" class="ck-go">Search shapes</button>
        <button type="button" class="ck-ghost" data-act="svg">Open an SVG</button>
        <button type="button" class="ck-ghost" data-act="pic">Trace a picture</button>
      </div>
      <input type="file" class="ck-file" accept=".svg,image/svg+xml" hidden />
    </div>
    <p class="ck-foot">Every cutter can be resized, given a taller blade, a sharper edge, a different handle or centre bars before you print it.</p>
  </div>`;
  const close = () => { removeEventListener("keydown", onKey, true); el.remove(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  addEventListener("keydown", onKey, true);
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest(".ck-x")) { close(); return; }
    const k = e.target.closest(".ck-kinds button");
    if (k) {
      chosen = k.dataset.kind;
      for (const b of el.querySelectorAll(".ck-kinds button")) b.setAttribute("aria-pressed", String(b === k));
      return;
    }
    const card = e.target.closest(".ck-card");
    if (card?.dataset.own) { el.querySelector("#ck-own").scrollIntoView({ block: "nearest", behavior: "smooth" }); el.querySelector(".ck-go").focus(); return; }
    if (card) { close(); onPick?.(exampleById(card.dataset.id), chosen); return; }
    if (e.target.closest(".ck-go")) { close(); onCustom?.(chosen); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "svg") el.querySelector(".ck-file").click();
    if (act === "pic") { close(); onPicture?.(); }
  });
  el.querySelector(".ck-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    close();
    onSvg?.(text, file.name.replace(/\.svg$/i, ""), chosen);
  });
  document.body.appendChild(el);
  el.querySelector(".ck-card")?.focus();
  return { close };
}
