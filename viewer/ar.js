// "See it on your desk": the part, at its true size, on the real table in
// front of you, through the phone's camera.
//
// On a phone that can do it, the sheet shows the part spinning with one big
// button that drops it into the camera view. iPhones use Quick Look (the USDZ
// it needs is made from the GLB on the spot); Android uses Chrome's WebXR
// inside the page. Google's Scene Viewer is left out on purpose: it fetches
// the model itself, so it needs a file hosted on the web, and this one never
// leaves the phone.
//
// On a computer the sheet is a QR code instead. It is the share link with
// "ar=1" on the end: the model rides inside it, the phone builds it locally
// and lands straight on this sheet. Nothing is uploaded either way.
//
// Everything that touches the model comes in through the hooks passed to
// showAR(), so this file can be read on its own. Loaded only when the button
// is pressed: model-viewer is a few hundred KB nobody needs on a first visit.

import { MV_CDN } from "./exporters.js";

// The QR code is the share link, and a code past ~2,300 bytes is too dense for
// a phone camera to read off a monitor, even though the format goes to 2,953.
export const QR_MAX = 2300;

// Can THIS device put a model in the room? "quick-look" (iPhone, iPad),
// "webxr" (Android Chrome), or null (a computer, or a browser without it).
export async function arMode() {
  try {
    const a = document.createElement("a");
    if (a.relList?.supports?.("ar")) return "quick-look";
  } catch { /* old browser */ }
  try {
    if (navigator.xr && await navigator.xr.isSessionSupported("immersive-ar")) return "webxr";
  } catch { /* not allowed here */ }
  return null;
}

// Does the address say "go straight to the desk view"? The QR code's link does.
export const wantsAR = (hash = "") => /[#&]ar=1(&|$)/.test(hash);
export const withAR = (url) => url + (url.includes("#") ? "&ar=1" : "#ar=1");

const CSS = `
  #ar { position: fixed; inset: 0; z-index: 160000; display: grid; place-items: center; padding: 16px;
    background: rgba(5, 8, 14, .72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text, #dfe6f3); }
  #ar *, #ar *::before, #ar *::after { box-sizing: border-box; }
  .ar-card { width: min(440px, 100%); max-height: calc(100dvh - 32px); overflow: auto; border-radius: 18px;
    background: var(--bg, #0b0f16); border: 1px solid var(--border, #26314a); padding: 16px;
    display: flex; flex-direction: column; gap: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  .ar-head { display: flex; align-items: flex-start; gap: 10px; }
  .ar-head h2 { margin: 0; font-size: 18px; letter-spacing: -.01em; }
  .ar-head .ar-sub { color: var(--muted, #8ea0c0); font-size: 13px; margin-top: 2px; }
  .ar-head .ar-sp { flex: 1; }
  .ar-x { flex: none; background: none; border: 1px solid var(--border, #26314a); color: var(--muted, #8ea0c0);
    border-radius: 10px; width: 34px; height: 34px; font-size: 20px; line-height: 1; cursor: pointer; }
  .ar-x:hover { color: var(--text, #dfe6f3); border-color: var(--accent, #1c66e5); }
  .ar-stage { position: relative; height: min(46dvh, 340px); border-radius: 14px; overflow: hidden;
    background: radial-gradient(circle at 50% 40%, #1d2638, #0d121c 75%); }
  .ar-stage model-viewer { width: 100%; height: 100%; --poster-color: transparent; }
  .ar-go { width: 100%; border: 0; border-radius: 12px; background: var(--accent, #1c66e5); color: #fff;
    font: 600 16px/1.2 inherit; padding: 14px 16px; cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 10px; }
  .ar-go:hover { background: var(--accent-hover, #2e76f2); }
  .ar-go[disabled] { opacity: .55; cursor: default; }
  .ar-note { color: var(--muted, #8ea0c0); font-size: 13px; }
  .ar-note b { color: var(--text, #dfe6f3); font-weight: 600; }
  .ar-qr { align-self: center; background: #fff; padding: 14px; border-radius: 14px; line-height: 0; }
  .ar-qr canvas { width: min(340px, 70vw, 50dvh); height: auto; image-rendering: pixelated; }
  .ar-steps { margin: 0; padding-left: 20px; color: var(--muted, #8ea0c0); font-size: 13px; }
  .ar-steps li + li { margin-top: 3px; }
  .ar-link { display: flex; gap: 8px; }
  .ar-link input { flex: 1; min-width: 0; font: 11px ui-monospace, monospace; background: var(--panel, #121826);
    color: var(--muted, #8ea0c0); border: 1px solid var(--border, #26314a); border-radius: 8px; padding: 6px 8px; }
  .ar-link button { flex: none; background: none; border: 1px solid var(--border, #26314a); color: var(--text, #dfe6f3);
    border-radius: 8px; padding: 0 12px; font: inherit; font-size: 13px; cursor: pointer; }
  .ar-link button:hover { border-color: var(--accent, #1c66e5); }
  .ar-warn { color: var(--warn, #e5a05a); font-size: 13px; }
`;

const ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 7v8L12 19l7.5-4V7z"/>
  <path d="M4.5 7 12 11l7.5-4M12 11v8"/><path d="M2.5 20.5h19" opacity=".6"/></svg>`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const mm = (m) => { const v = m * 1000; return v >= 100 ? Math.round(v) : Math.round(v * 10) / 10; };

let mvLoad = null;
const loadModelViewer = () => (mvLoad ??= import(/* @vite-ignore */ MV_CDN).catch((e) => { mvLoad = null; throw e; }));
let bwipLoad = null;
const loadBwip = () => (bwipLoad ??= import("/node_modules/bwip-js/dist/bwip-js.mjs").catch((e) => { bwipLoad = null; throw e; }));

// A QR code of `text` drawn on a canvas, or null when it will not fit.
export async function qrCanvas(text) {
  if (text.length > QR_MAX) return null;
  const bwip = await loadBwip();
  const cv = document.createElement("canvas");
  // L: the fewest, biggest squares. A screen is a clean surface, with no
  // smudges for the stronger levels to correct, and density is what fails.
  bwip.toCanvas(cv, { bcid: "qrcode", text, eclevel: "L",
    scale: 4, paddingwidth: 0, paddingheight: 0, backgroundcolor: "FFFFFF", barcolor: "000000" });
  return cv;
}

let open = null;
export function closeAR() { open?.(); }

// hooks: {
//   name:     the model's name, for the heading
//   glb():    the model as a GLB ArrayBuffer, in METRES (AR is real size)
//   shareUrl(): the share link for this model, or null when it is too big
// }
export async function showAR(hooks) {
  closeAR();
  const mode = await arMode();
  if (!document.getElementById("ar-css")) {
    const st = document.createElement("style");
    st.id = "ar-css";
    st.textContent = CSS;
    document.head.append(st);
  }
  const root = document.createElement("div");
  root.id = "ar";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "See it on your desk");
  const card = document.createElement("div");
  card.className = "ar-card";
  root.append(card);
  const urls = [];
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const close = () => {
    open = null;
    removeEventListener("keydown", onKey);
    root.remove();
    for (const u of urls) URL.revokeObjectURL(u);
  };
  open = close;
  addEventListener("keydown", onKey);
  root.addEventListener("click", (e) => { if (e.target === root) close(); });
  const head = (sub) => `<div class="ar-head"><div><h2>See it on your desk</h2><div class="ar-sub">${sub}</div></div>
    <span class="ar-sp"></span><button class="ar-x" type="button" aria-label="Close">&times;</button></div>`;
  document.body.append(root);

  if (mode) {
    card.innerHTML = head(esc(hooks.name || "Your model") + ", at its real size")
      + `<div class="ar-stage"><div class="ar-note" style="padding:16px">Getting it ready…</div></div>`
      + `<button class="ar-go" type="button" disabled>${ICON}<span>Place it on your desk</span></button>`
      + `<div class="ar-note">Point the camera at a table and move the phone slowly until the part appears. `
      + `It stays its true size, so you can check it fits before you print it.</div>`;
    card.querySelector(".ar-x").onclick = close;
    const stage = card.querySelector(".ar-stage"), go = card.querySelector(".ar-go"), note = card.querySelectorAll(".ar-note")[1];
    try {
      const [glb] = await Promise.all([hooks.glb(), loadModelViewer()]);
      if (open !== close) return;
      const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
      urls.push(url);
      const mv = document.createElement("model-viewer");
      mv.setAttribute("src", url);
      mv.setAttribute("alt", hooks.name || "Your model");
      mv.setAttribute("camera-controls", "");
      mv.setAttribute("auto-rotate", "");
      mv.setAttribute("shadow-intensity", "1");
      mv.setAttribute("ar", "");
      mv.setAttribute("ar-modes", "webxr quick-look");
      mv.setAttribute("ar-scale", "fixed");               // real size is the whole point
      mv.setAttribute("ar-placement", "floor");
      // model-viewer's own AR button is never shown; ours drives it, so the
      // tap that starts AR is the user's own (both modes insist on that)
      const hidden = document.createElement("span");
      hidden.slot = "ar-button";
      hidden.style.display = "none";
      mv.append(hidden);
      stage.replaceChildren(mv);
      mv.addEventListener("load", () => {
        const d = mv.getDimensions?.();
        if (d) note.innerHTML = `Real size <b>${mm(d.x)} × ${mm(d.z)} × ${mm(d.y)} mm</b>. ` + note.innerHTML;
        go.disabled = false;
      }, { once: true });
      mv.addEventListener("ar-status", (e) => {
        if (e.detail?.status === "failed") {
          note.innerHTML = `<span class="ar-warn">The camera view did not start. On Android it needs Chrome `
            + `and Google Play Services for AR; on an iPhone, Safari or any browser works.</span>`;
        }
      });
      go.onclick = () => mv.activateAR();
    } catch (e) {
      stage.innerHTML = `<div class="ar-warn" style="padding:16px">Could not get the model ready: ${esc(e?.message || e)}</div>`;
    }
    return;
  }

  // A computer: the QR code.
  card.innerHTML = head("Scan it with your phone")
    + `<div class="ar-qr"><div class="ar-note" style="padding:40px 30px;color:#555">Making the code…</div></div>`
    + `<ol class="ar-steps"><li>Open your phone's camera and point it at the code.</li>`
    + `<li>Tap the link. Your phone builds this exact model, sizes and all.</li>`
    + `<li>Tap <b>Place it on your desk</b> and aim at a table.</li></ol>`
    + `<div class="ar-note">The model travels inside the code. Nothing is uploaded.</div>`
    + `<div class="ar-link"><input readonly aria-label="Link"><button type="button">Copy link</button></div>`;
  card.querySelector(".ar-x").onclick = close;
  const box = card.querySelector(".ar-qr"), input = card.querySelector(".ar-link input"), copy = card.querySelector(".ar-link button");
  try {
    const share = await hooks.shareUrl();
    if (open !== close) return;
    if (!share) throw new Error("too-big");
    const link = withAR(share);
    input.value = link;
    input.onfocus = () => input.select();
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(link); copy.textContent = "Copied"; }
      catch { input.focus(); input.select(); }
    };
    const cv = await qrCanvas(link);
    if (open !== close) return;
    if (!cv) throw new Error("too-big");
    box.replaceChildren(cv);
  } catch (e) {
    const big = e?.message === "too-big";
    box.replaceWith(Object.assign(document.createElement("div"), {
      className: "ar-warn",
      innerHTML: big
        ? `This model holds too much to fit in a QR code. Export it as <b>Share link</b> with a short `
          + `name, open that on your phone, and tap the cube button there.`
        : `Could not make the code: ${esc(e?.message || e)}`,
    }));
    if (big && !input.value) card.querySelector(".ar-link").remove();
  }
}
