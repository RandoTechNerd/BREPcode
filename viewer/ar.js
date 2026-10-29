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
// On a computer the sheet is a QR code instead. It asks for a short link
// first: a whole model in the link makes a code too dense to scan comfortably
// and a slow page to open, while #s=<name> is a handful of characters. The
// long link (nothing uploaded) is still one click away. Either way "ar=1" on
// the end lands the phone straight on this sheet.
//
// brepcode.com shows the app inside an iframe that is not allowed the camera
// (no xr-spatial-tracking), and Quick Look will not open from a frame either.
// So a phone inside a frame first moves itself to the app's own page, with
// the model in the address, and the sheet opens there.
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
  // isSessionSupported can sit unanswered for a long time on a phone (asking
  // ARCore, or inside a frame without permission): never wait on it forever
  return Promise.race([arModeNow(), new Promise((r) => setTimeout(() => r(null), 2500))]);
}
async function arModeNow() {
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
  .ar-short, .ar-done { display: flex; flex-direction: column; gap: 12px; }
  #ar [hidden] { display: none !important; }
  .ar-name { display: flex; gap: 8px; }
  .ar-name input { flex: 1; min-width: 0; font: 14px ui-monospace, monospace; background: var(--panel, #121826);
    color: var(--text, #dfe6f3); border: 1px solid var(--border, #26314a); border-radius: 10px; padding: 9px 10px; }
  .ar-name input:focus { outline: none; border-color: var(--accent, #1c66e5); }
  .ar-make { flex: none; border: 0; border-radius: 10px; background: var(--accent, #1c66e5); color: #fff;
    font: 600 14px/1.2 inherit; padding: 0 14px; cursor: pointer; }
  .ar-make:hover { background: var(--accent-hover, #2e76f2); }
  .ar-make[disabled] { opacity: .6; cursor: default; }
  .ar-msg:empty { display: none; }
  .ar-long { align-self: flex-start; background: none; border: 0; padding: 0; color: var(--muted, #8ea0c0);
    font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; }
  .ar-long:hover { color: var(--text, #dfe6f3); }
`;

const ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 7v8L12 19l7.5-4V7z"/>
  <path d="M4.5 7 12 11l7.5-4M12 11v8"/><path d="M2.5 20.5h19" opacity=".6"/></svg>`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const mm = (m) => { const v = m * 1000; return v >= 100 ? Math.round(v) : Math.round(v * 10) / 10; };

// jsDelivr first: the same pinned file, and far quicker than unpkg to a phone.
const MV_FAST = MV_CDN.replace("https://unpkg.com/", "https://cdn.jsdelivr.net/npm/");
let mvLoad = null;
const loadModelViewer = () => (mvLoad ??= import(/* @vite-ignore */ MV_FAST)
  .catch(() => import(/* @vite-ignore */ MV_CDN))
  .catch((e) => { mvLoad = null; throw e; }));
// Started the moment a QR link arrives, so it downloads while the model builds.
export const preloadAR = () => { loadModelViewer().catch(() => {}); };

const inFrame = () => { try { return window.top !== window; } catch { return true; } };
// A phone or tablet, whether or not this browser can do AR: such a device
// gets the phone sheet (or a reason), never a QR code to scan with itself.
export const touchDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
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
//   name:      the model's name, for the heading
//   glb():     the model as a GLB ArrayBuffer, in METRES (AR is real size)
//   longUrl(): the long share link for this model, or null when it is too big
//   existing:  { slug, url } when the model already lives at a short link
//              and has not changed since, else null: the code uses it as is
//   short:     null when short links are not available here, else {
//     name:          a suggested name
//     slugify(text): what a typed name becomes in the link
//     check(slug):   cloudlink's checkName() answer
//     suggest(slug): a free variant of a taken name, or null
//     save(slug):    stores the model under that name, returns its link
//   }
// }
export async function showAR(hooks) {
  closeAR();
  // A phone inside brepcode.com's frame leaves it FIRST, before asking the
  // browser anything: the frame is not allowed the camera at all.
  if (inFrame() && touchDevice()) {
    try {
      const u = await hooks.longUrl();
      if (u) { window.top.location.href = withAR(u); return; }
    } catch { /* open it here and hope */ }
  }
  const mode = await arMode();
  const phone = !!mode || touchDevice();
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

  if (phone) {
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
        const size = d ? `Real size <b>${mm(d.x)} × ${mm(d.z)} × ${mm(d.y)} mm</b>. ` : "";
        if (!mode) {
          // a phone whose browser cannot do it: say why, rather than a dead button
          note.innerHTML = size + `<span class="ar-warn">This browser cannot open the camera view. `
            + (/Android/i.test(navigator.userAgent)
              ? `Open this page in Chrome, and install Google Play Services for AR from the Play Store.`
              : `Open this page in Safari.`) + `</span>`;
          return;
        }
        note.innerHTML = size + note.innerHTML;
        ready = note.innerHTML;
        go.disabled = false;
        if (mode === "webxr") askFirst();
      }, { once: true });
      mv.addEventListener("ar-status", (e) => {
        if (e.detail?.status === "failed") {
          note.innerHTML = `<span class="ar-warn">The camera view did not start. On Android it needs Chrome `
            + `and Google Play Services for AR; on an iPhone, Safari or any browser works.</span>`;
        }
      });
      // Android's camera view needs camera permission, and Chrome refuses
      // SILENTLY when it was blocked once. So the camera is asked for as its
      // own step, with its own tap (the prompt can outlast the tap that
      // starts AR), and a block is explained rather than swallowed.
      const label = go.querySelector("span");
      let ready = note.innerHTML, camOK = mode !== "webxr";
      const BLOCKED = `<span class="ar-warn">The camera is blocked for this site. Tap the icon left of the `
        + `address bar, then <b>Permissions</b>, turn <b>Camera</b> on, and tap the button again.</span>`;
      const camAllowed = () => {
        camOK = true;
        label.textContent = "Place it on your desk";
        note.innerHTML = ready;
      };
      async function askFirst() {
        let state = "prompt";
        try { state = (await navigator.permissions.query({ name: "camera" })).state; } catch { /* not supported: ask */ }
        if (state === "granted") return camAllowed();
        label.textContent = "Allow the camera";
        note.innerHTML = state === "denied" ? BLOCKED
          : `${ready.replace(/Point the camera[\s\S]*$/, "")}Your phone will ask to use the camera. It stays on this `
            + `phone: nothing is recorded or sent anywhere.`;
      }
      async function askCamera() {
        go.disabled = true;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          for (const t of stream.getTracks()) t.stop();
          camAllowed();
        } catch (e) {
          note.innerHTML = e?.name === "NotAllowedError" || e?.name === "SecurityError" ? BLOCKED
            : `<span class="ar-warn">Could not reach the camera: ${esc(e?.message || e?.name || e)}</span>`;
        } finally { go.disabled = false; }
      }
      go.onclick = () => {
        if (!camOK) { askCamera(); return; }
        if (mv.canActivateAR === false) {
          note.innerHTML = `<span class="ar-warn">This browser will not open the camera view here. `
            + `On Android it needs Chrome and Google Play Services for AR; on an iPhone, Safari.</span>`;
          return;
        }
        go.disabled = true;
        let started = false;
        const onStatus = (e) => {
          const st = e.detail?.status;
          if (st === "session-started" || st === "object-placed") started = true;
          if (st === "not-presenting" || st === "failed") go.disabled = false;
        };
        mv.addEventListener("ar-status", onStatus);
        // Quick Look leaves the page, so it never reports back; WebXR does
        setTimeout(() => {
          go.disabled = false;
          if (!started && mode === "webxr" && document.visibilityState === "visible") {
            note.innerHTML = `<span class="ar-warn">The camera view did not start. Check that Chrome may use the `
              + `camera, and that Google Play Services for AR is installed and up to date, then try again.</span>`;
          }
        }, 6000);
        Promise.resolve(mv.activateAR()).catch((e) => {
          go.disabled = false;
          note.innerHTML = `<span class="ar-warn">The camera view did not start: ${esc(e?.message || e)}</span>`;
        });
      };
    } catch (e) {
      stage.innerHTML = `<div class="ar-warn" style="padding:16px">Could not get the model ready: ${esc(e?.message || e)}</div>`;
    }
    return;
  }


  // A computer: the QR code, behind a short link when there can be one.
  card.innerHTML = head("Scan it with your phone")
    + `<div class="ar-short" hidden>`
    + `<div class="ar-note"><b>First, give it a short link.</b> It keeps the code small, so it scans in a `
    + `moment and opens fast. The model is saved on brepcode.com under this name, and anyone with the link can open it.</div>`
    + `<div class="ar-name"><input type="text" spellcheck="false" maxlength="48" aria-label="Short link name">`
    + `<button type="button" class="ar-make">Make the code</button></div>`
    + `<div class="ar-msg ar-note"></div>`
    + `<button type="button" class="ar-long">Use the long link instead (nothing uploaded)</button>`
    + `</div>`
    + `<div class="ar-done" hidden>`
    + `<div class="ar-qr"></div>`
    + `<ol class="ar-steps"><li>Open your phone's camera and point it at the code.</li>`
    + `<li>Tap the link. Your phone builds this exact model, sizes and all.</li>`
    + `<li>Tap <b>Place it on your desk</b> and aim at a table.</li></ol>`
    + `<div class="ar-note ar-how"></div>`
    + `<div class="ar-link"><input readonly aria-label="Link"><button type="button">Copy link</button></div>`
    + `</div>`;
  card.querySelector(".ar-x").onclick = close;
  const $q = (s) => card.querySelector(s);
  const shortBox = $q(".ar-short"), done = $q(".ar-done"), nameIn = $q(".ar-name input"),
    make = $q(".ar-make"), msg = $q(".ar-msg"), longBtn = $q(".ar-long"),
    box = $q(".ar-qr"), how = $q(".ar-how"), input = $q(".ar-link input"), copy = $q(".ar-link button");
  const say = (html, warn) => { msg.innerHTML = html.charAt(0).toUpperCase() + html.slice(1); msg.classList.toggle("ar-warn", !!warn); };

  // The code for a finished link, or a sentence saying why there is none.
  const showCode = async (link, note) => {
    const cv = await qrCanvas(link);
    if (open !== close) return false;
    if (!cv) return false;
    input.value = link;
    input.onfocus = () => input.select();
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(link); copy.textContent = "Copied"; }
      catch { input.focus(); input.select(); }
    };
    how.innerHTML = note;
    box.replaceChildren(cv);
    shortBox.hidden = true;
    done.hidden = false;
    return true;
  };
  const useLong = async () => {
    longBtn.disabled = true;
    try {
      const u = await hooks.longUrl();
      if (open !== close) return;
      if (u && await showCode(withAR(u), "The model travels inside the code. Nothing is uploaded.")) return;
      say(hooks.short
        ? `This model is too big for a code on its own. Use a short link above.`
        : `This model is too big to fit in a QR code.`, true);
      longBtn.hidden = true;
    } catch (e) {
      say(`Could not make the code: ${esc(e?.message || e)}`, true);
    } finally { longBtn.disabled = false; }
  };
  longBtn.onclick = useLong;

  if (hooks.existing) {
    shortBox.hidden = true;
    const ok = await showCode(withAR(hooks.existing.url),
      `This model already has a short link, <b>${esc(hooks.existing.slug)}</b>, so the code uses it.`);
    if (ok || open !== close) return;
  }
  const sh = hooks.short;
  if (!sh) {
    // no link server here: straight to the long link
    shortBox.hidden = false;
    for (const el of [shortBox.firstElementChild, $q(".ar-name"), longBtn]) el.hidden = true;
    say("Making the code…");
    return useLong();
  }
  shortBox.hidden = false;
  // Only ever OFFER a name that is free, or this model's own link (saving
  // updates it). A name this browser made for ANOTHER model counts as taken:
  // saving over it would replace that model. The box stays empty until the
  // server has answered, rather than showing a name that is not available.
  nameIn.value = "";
  nameIn.placeholder = "finding a free name…";
  make.disabled = true;
  (async () => {
    let pick = sh.slugify(sh.name), note = "";
    try {
      const r = await sh.check(pick);
      if (open !== close) return;
      if (r.offline) { say(`${esc(r.reason)}. The long link still works.`, true); pick = ""; }
      else if (r.ok && r.mine && pick === sh.reuse) note = `<b>${esc(pick)}</b> is this model's link: saving updates it.`;
      else if (!(r.ok && r.free)) {
        pick = (await sh.suggest(pick)) || "";
        // every simple variant taken: a random tail is as good as certain to be free
        for (let i = 0; !pick && i < 3; i++) {
          const c = `${sh.slugify(sh.name).slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
          const rc = await sh.check(c);
          if (rc.offline) break;
          if (rc.ok && rc.free) pick = c;
        }
      }
    } catch { pick = ""; }
    if (open !== close || nameIn.value) return;          // the user typed one meanwhile
    nameIn.placeholder = "name for the link";
    nameIn.value = pick;
    make.disabled = false;
    if (note) say(note);
    try { nameIn.focus(); nameIn.select(); } catch { /* gone */ }
  })();
  let confirmReplace = null;
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") make.click(); });
  nameIn.addEventListener("input", () => { say(""); confirmReplace = null; });
  make.onclick = async () => {
    const slug = sh.slugify(nameIn.value);
    if (slug !== nameIn.value) nameIn.value = slug;
    make.disabled = true;
    say("Checking the name…");
    try {
      const r = await sh.check(slug);
      if (open !== close) return;
      if (r.offline) { say(`${esc(r.reason)}. Use the long link instead.`, true); return; }
      if (r.ok && r.mine && slug !== sh.reuse && confirmReplace !== slug) {
        confirmReplace = slug;
        say(`<b>${esc(slug)}</b> is a link you made for another model. Press again to replace that `
          + `model with this one, or pick a new name.`, true);
        return;
      }
      if (!r.ok) {
        const alt = r.free === false ? await sh.suggest(slug) : null;
        if (alt) { nameIn.value = alt; say(`"${esc(slug)}" is taken. <b>${esc(alt)}</b> is free: press Make the code.`); }
        else say(esc(r.reason), true);
        return;
      }
      say("Saving…");
      const url = await sh.save(slug);
      if (open !== close) return;
      if (!await showCode(withAR(url), `Saved as <b>${esc(slug)}</b>. Anyone with this link can open the model.`)) {
        say("Could not make the code.", true);
      }
    } catch (e) {
      say(`${esc(e?.message || e)}`, true);
    } finally { make.disabled = false; }
  };
}
