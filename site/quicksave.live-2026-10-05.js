/* Private quick-save playground — client hook.
 * Preserved across zip updates (like locked-key.js).
 *
 * Loaded EARLY (classic script in <head>) so it can force
 * preserveDrawingBuffer on the WebGL context — otherwise canvas snapshots
 * come back blank.
 *
 * Unlock:  triple-tap the Export button  -> prompt for The Secret.
 * Save:    "☁ Save to cloud" button inside the (i) card's stash section.
 * Gallery: "Open gallery" button right next to it (thumbnail grid).
 * The stash section itself is revealed by triple-tapping the Model-folder
 * button in the (i) card (the app's own gesture).
 */
(() => {
  const LS_KEY = 'brep.quicksave.secret';
  const ENDPOINT = '/api/public/quicksave';

  // ---------- 1. force preserveDrawingBuffer (must run before renderer init)
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (/webgl/i.test(String(type))) {
      attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attrs);
  };

  // ---------- 2. capture exported HTML blobs so a save can carry the viewer
  let capturedHtml = null;
  const origCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    try {
      if (obj instanceof Blob && /html/i.test(obj.type || '')) {
        obj.text().then((t) => { capturedHtml = t; }).catch(() => {});
      }
    } catch {}
    return origCreateObjectURL(obj);
  };

  // ---------- helpers ----------
  const secret = () => localStorage.getItem(LS_KEY) || '';
  const isUnlocked = () => !!secret();

  async function apiFetch(method, path = '', body) {
    return fetch(ENDPOINT + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Quicksave-Secret': secret() },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  function toast(msg, kind = 'ok', sticky = false) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', left: '50%', bottom: '90px', transform: 'translateX(-50%)',
      background: kind === 'err' ? '#7a1f2b' : '#1e3a5f', color: '#fff',
      padding: '10px 16px', borderRadius: '10px', fontSize: '14px', zIndex: 999999,
      boxShadow: '0 6px 24px rgba(0,0,0,.4)', maxWidth: '80vw', textAlign: 'center',
      pointerEvents: 'none',
    });
    document.body.appendChild(t);
    if (sticky) return () => t.remove();
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 2400);
    setTimeout(() => t.remove(), 2900);
    return () => t.remove();
  }


  function bigCanvas() {
    let best = null, bestArea = 0;
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > 100 && r.height > 100) { best = c; bestArea = area; }
    }
    return best;
  }

  // A frame is "blank" when it has no meaningful pixel variation. This catches
  // solid black gallery tiles even when the JPEG itself is technically valid.
  function looksBlank(ctx, w, h) {
    try {
      const d = ctx.getImageData(0, 0, w, h).data;
      let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
      for (let i = 0; i < d.length; i += 4 * 29) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        if (g < minG) minG = g; if (g > maxG) maxG = g;
        if (b < minB) minB = b; if (b > maxB) maxB = b;
      }
      return (maxR - minR) < 18 && (maxG - minG) < 18 && (maxB - minB) < 18;
    } catch { return false; }
  }

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  // Grab the live frame; retry a few times in case the buffer was mid-clear.
  async function snapshotThumb() {
    for (let attempt = 0; attempt < 3; attempt++) {
      await nextFrame();
      try {
        const dataUrl = window.__brepQuicksaveSnapshot?.();
        if (!dataUrl) continue;
        const probe = document.createElement('img');
        const ok = await new Promise((resolve) => {
          probe.onload = () => {
            try {
              const w = Math.max(1, Math.min(160, probe.naturalWidth));
              const h = Math.max(1, Math.round(w * probe.naturalHeight / probe.naturalWidth));
              const tmp = document.createElement('canvas');
              tmp.width = w; tmp.height = h;
              const ctx = tmp.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(probe, 0, 0, w, h);
              resolve(!looksBlank(ctx, w, h));
            } catch { resolve(true); }
          };
          probe.onerror = () => resolve(false);
          probe.src = dataUrl;
        });
        if (ok) return dataUrl;
      } catch { /* fall back to direct canvas capture */ }
    }

    const c = bigCanvas();
    if (!c) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
      await nextFrame(); await nextFrame();
      try {
        const maxDim = 480;
        const scale = Math.min(1, maxDim / Math.max(c.width, c.height));
        const tw = Math.max(1, Math.round(c.width * scale));
        const th = Math.max(1, Math.round(c.height * scale));
        const tmp = document.createElement('canvas');
        tmp.width = tw; tmp.height = th;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#0a0f14';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(c, 0, 0, tw, th);
        if (looksBlank(ctx, tw, th)) continue;
        return tmp.toDataURL('image/jpeg', 0.75);
      } catch { /* try again */ }
    }
    return null;
  }


  const getBcode = () => document.getElementById('code')?.value || '';
  async function getProjectBcode() {
    try {
      const packed = await window.__brepQuicksaveProject?.();
      if (packed) return packed;
    } catch { /* fall back to raw editor text */ }
    return getBcode();
  }

  // ---------- triple-tap on the Export button = unlock ----------
  function attachTripleTap(matchFn, handler) {
    let taps = 0, timer = null;
    document.addEventListener('click', (e) => {
      const el = e.target.closest?.('button, [role="button"]');
      if (!el || !matchFn(el)) return;
      taps++;
      clearTimeout(timer);
      if (taps >= 3) {
        taps = 0;
        e.preventDefault(); e.stopPropagation();
        handler(el, e);
      } else {
        timer = setTimeout(() => { taps = 0; }, 550);
      }
    }, true);
  }

  async function promptUnlock() {
    const pass = window.prompt('Enter The Secret to unlock private cloud saves:');
    if (!pass) return false;
    localStorage.setItem(LS_KEY, pass);
    let res;
    try { res = await apiFetch('GET'); } catch { toast('Network error.', 'err'); return false; }
    if (res.status === 401) {
      localStorage.removeItem(LS_KEY);
      toast('Wrong secret.', 'err');
      return false;
    }
    if (!res.ok) { toast('Server error unlocking.', 'err'); return false; }
    toast('Unlocked. Cloud save enabled.');
    paint();
    return true;
  }

  // ---------- styles ----------
  const STYLE_ID = 'quicksave-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      button.qs-glow#export-btn {
        box-shadow: 0 0 0 2px #4dd0ff, 0 0 18px rgba(77,208,255,.55) !important;
        animation: qs-pulse 2.4s ease-in-out infinite;
      }
      @keyframes qs-pulse {
        0%,100% { box-shadow: 0 0 0 2px #4dd0ff, 0 0 12px rgba(77,208,255,.45); }
        50%     { box-shadow: 0 0 0 2px #4dd0ff, 0 0 24px rgba(77,208,255,.85); }
      }
      #qs-cloud { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:8px 0 2px; }
      #qs-cloud .qs-hint { color:#7a8fa5; font-size:11.5px; flex:1 1 100%; }
      #qs-modal-back, #qs-modal-back * { box-sizing: border-box; }
      #qs-modal-back {
        position: fixed; inset: 0; background: rgba(0,0,0,.72);
        z-index: 999999; display: flex; align-items: center; justify-content: center;
        padding: 16px; overflow: hidden;
      }
      #qs-modal {
        background: #101820; color: #e6eef7; border: 1px solid #24384d;
        border-radius: 14px;
        width: min(1000px, 100%); max-width: 100%;
        max-height: 100%;
        display: flex; flex-direction: column; min-height: 0; overflow: hidden;
      }
      #qs-modal header {
        padding: 14px 18px; border-bottom: 1px solid #24384d;
        display: flex; align-items: center; justify-content: space-between;
        flex: 0 0 auto;
      }
      #qs-modal h2 { margin: 0; font-size: 16px; }
      #qs-modal .qs-close { background: transparent; border: 0; color: #9ab; font-size: 22px; cursor: pointer; }
      #qs-grid { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
        -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
        padding: 14px; display: grid; gap: 14px; align-content: start;
        grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); }
      .qs-card { background:#17222d; border:1px solid #24384d; border-radius:10px;
        overflow:hidden; display:flex; flex-direction:column; }
      .qs-card img { width:100%; aspect-ratio:4/3; object-fit:cover; background:#0a0f14; }
      .qs-card .qs-noimg { width:100%; aspect-ratio:4/3; background:#0a0f14; color:#456;
        display:flex; align-items:center; justify-content:center; font-size:12px; }
      .qs-card .qs-meta { padding:10px; font-size:13px; }
      .qs-card .qs-name { font-weight:600; word-break:break-word; }
      .qs-card .qs-date { color:#7a8fa5; font-size:11px; margin-top:2px; }
      .qs-card .qs-actions { display:flex; gap:6px; padding:8px 10px 10px; flex-wrap:wrap; }
      .qs-card .qs-actions a, .qs-card .qs-actions button {
        flex:1; font-size:12px; padding:6px 8px; border-radius:6px; background:#0b3a5c;
        color:#cfefff; text-align:center; text-decoration:none; border:1px solid #24384d; cursor:pointer; }
      .qs-card .qs-del { background:#4a1a24; color:#f8c4cd; }
      #qs-empty { color:#7a8fa5; padding:30px; text-align:center; }
    `;
    document.head.appendChild(s);
  }

  // ---------- the (i)-card cloud row ----------
  function ensureCloudRow() {
    const lib = document.getElementById('secret-lib');
    if (!lib) return;
    let row = document.getElementById('qs-cloud');
    if (!row) {
      row = document.createElement('div');
      row.id = 'qs-cloud';
      row.innerHTML = `
        <button id="qs-save" class="hist-btn" style="font-size:11.5px">☁ Save to cloud</button>
        <button id="qs-open" class="hist-btn" style="font-size:11.5px">Open gallery</button>
        <button id="qs-unlock" class="hist-btn" style="font-size:11.5px">Unlock…</button>
        <span class="qs-hint"></span>`;
      const list = document.getElementById('secret-list');
      (list?.parentNode || lib).insertBefore(row, list || null);
      row.querySelector('#qs-save').addEventListener('click', doSave);
      row.querySelector('#qs-open').addEventListener('click', openGallery);
      row.querySelector('#qs-unlock').addEventListener('click', promptUnlock);
    }
    const unlocked = isUnlocked();
    row.querySelector('#qs-save').style.display = unlocked ? '' : 'none';
    row.querySelector('#qs-open').style.display = unlocked ? '' : 'none';
    row.querySelector('#qs-unlock').style.display = unlocked ? 'none' : '';
    row.querySelector('.qs-hint').textContent = unlocked
      ? 'Private cloud saves — source, exported HTML and a preview image.'
      : 'Cloud saves are locked. Unlock with The Secret (or triple-tap Export).';
  }

  let painting = false;
  function paint() {
    if (painting) return;
    painting = true;
    try { paintNow(); } finally { setTimeout(() => { painting = false; }, 60); }
  }

  function paintNow() {
    injectStyle();
    ensureCloudRow();
    if (isUnlocked()) {
      document.querySelectorAll('#export-btn:not(.qs-glow)').forEach((b) => b.classList.add('qs-glow'));
    } else {
      document.querySelectorAll('#export-btn.qs-glow').forEach((b) => b.classList.remove('qs-glow'));
    }
  }

  // ---------- save ----------
  async function doSave() {
    if (!isUnlocked()) { promptUnlock(); return; }
    const raw = getBcode();
    if (!raw.trim()) { toast('Nothing to save — editor is empty.', 'err'); return; }
    const name = window.prompt('Name this save:', 'Untitled ' + new Date().toLocaleString());
    if (name === null) return;
    toast('Saving…');
    const bcode = await getProjectBcode();
    // A save whose code calls importedMesh but carries no embedded mesh data can
    // never rebuild later — stop it here rather than storing a dead entry.
    if (/importedMesh\s*\(/.test(raw) && !/"imports"\s*:/.test(bcode)
      && !confirm('This model uses imported meshes, but none could be embedded — the save will not rebuild later. Save anyway?')) {
      toast('Save cancelled.', 'err');
      return;
    }
    const thumbDataUrl = await snapshotThumb();
    const body = { name: name.slice(0, 120), bcode, thumbDataUrl };
    if (capturedHtml && capturedHtml.length < 10 * 1024 * 1024) body.html = capturedHtml;

    try {
      const res = await apiFetch('POST', '', body);
      if (res.status === 401) {
        localStorage.removeItem(LS_KEY); paint();
        toast('Secret rejected. Re-unlock.', 'err'); return;
      }
      if (!res.ok) { toast('Save failed (' + res.status + ').', 'err'); return; }
      toast(thumbDataUrl ? 'Saved ✓' : 'Saved ✓ (no preview captured)');
    } catch { toast('Network error.', 'err'); }
  }

  // ---------- gallery ----------
  const escapeAttr = (s) =>
    String(s || '').replace(/["&<>]/g, (c) => ({ '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  async function openGallery() {
    if (!isUnlocked()) { const ok = await promptUnlock(); if (!ok) return; }
    injectStyle();
    document.getElementById('qs-modal-back')?.remove();

    const back = document.createElement('div');
    back.id = 'qs-modal-back';
    back.innerHTML = `
      <div id="qs-modal">
        <header>
          <h2>Your private saves</h2>
          <button class="qs-close" aria-label="close">✕</button>
        </header>
        <div id="qs-grid"><div id="qs-empty">Loading…</div></div>
      </div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('.qs-close').addEventListener('click', close);

    const grid = back.querySelector('#qs-grid');
    try {
      const res = await apiFetch('GET');
      if (res.status === 401) {
        localStorage.removeItem(LS_KEY); paint();
        grid.innerHTML = '<div id="qs-empty">Secret rejected. Re-unlock.</div>';
        return;
      }
      const { items } = await res.json();
      if (!items?.length) {
        grid.innerHTML = '<div id="qs-empty">No saves yet. Use ☁ Save to cloud.</div>';
        return;
      }
      grid.innerHTML = '';
      for (const it of items) {
        const card = document.createElement('div');
        card.className = 'qs-card';
        card.innerHTML = `
          ${it.thumb_url ? `<img src="${it.thumb_url}" alt="" loading="lazy">` : '<div class="qs-noimg">no preview</div>'}
          <div class="qs-meta"><div class="qs-name"></div><div class="qs-date"></div><div class="qs-pub" style="font-size:11px;margin-top:4px"></div></div>
          <div class="qs-actions">
            ${it.bcode_url ? `<a href="${it.bcode_url}" download="${escapeAttr(it.name)}.bcode">.bcode</a>` : ''}
            ${it.html_url ? `<a href="${it.html_url}" target="_blank" rel="noopener">.html</a>` : ''}
            <button class="qs-load">Load</button>
            <button class="qs-pubbtn"></button>
            <button class="qs-del">Delete</button>
          </div>`;
        const img = card.querySelector('img');
        if (img) img.addEventListener('error', () => {
          img.replaceWith(Object.assign(document.createElement('div'),
            { className: 'qs-noimg', textContent: 'no preview' }));
        });
        card.querySelector('.qs-name').textContent = it.name || 'Untitled';
        card.querySelector('.qs-date').textContent = new Date(it.created_at).toLocaleString();

        // ---- public page (/slug) toggle: admin-only, lives beside Load/Delete ----
        const pubLine = card.querySelector('.qs-pub');
        const pubBtn = card.querySelector('.qs-pubbtn');
        function paintPub() {
          pubBtn.textContent = it.published ? 'Unpublish' : 'Publish';
          if (it.published && it.slug) {
            const href = location.origin + '/' + it.slug;
            pubLine.innerHTML = `<a href="${escapeAttr(href)}" target="_blank" rel="noopener" style="color:#8fd6a3">/${escapeAttr(it.slug)}</a>`;
          } else {
            pubLine.textContent = 'private';
            pubLine.style.color = '#7a8fa5';
          }
        }
        paintPub();
        pubBtn.addEventListener('click', async () => {
          const next = !it.published;
          let slug = it.slug || '';
          if (next) {
            slug = window.prompt('Public page address (letters, numbers, dashes):',
              slug || String(it.name || 'model').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60));
            if (slug === null) return;
          }
          pubBtn.disabled = true;
          try {
            const r = await apiFetch('PATCH', '', { id: it.id, published: next, slug });
            if (!r.ok) { toast('Publish failed.', 'err'); return; }
            const out = await r.json();
            it.published = out.published; it.slug = out.slug;
            paintPub();
            toast(out.published ? 'Live at /' + out.slug : 'Unpublished.');
          } catch { toast('Publish failed.', 'err'); }
          finally { pubBtn.disabled = false; }
        });

        card.querySelector('.qs-load').addEventListener('click', async () => {
          if (!it.bcode_url) { toast('No source on this entry.', 'err'); return; }
          let done = null;
          try {
            done = toast('Fetching save…', 'ok', true);
            const src = await (await fetch(it.bcode_url)).text();
            const fileName = /\.bcode$/i.test(it.name || '') ? it.name : ((it.name || 'save') + '.bcode');
            const needsMesh = /importedMesh\s*\(/.test(src);
            const hasMesh = /"imports"\s*:/.test(src);
            close();
            if (needsMesh && !hasMesh) {
              // An old save from before meshes were embedded: the code alone can
              // never rebuild, so say so instead of letting it fail on a black screen.
              const ta = document.getElementById('code');
              if (ta) {
                ta.value = src.replace(/^\/\/[^\n]*\n(?:\/\/[^\n]*\n)*\n?/, '');
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
              }
              done(); done = null;
              toast('This save predates mesh embedding — its imported STLs were never uploaded. Re-import the mesh and save again.', 'err');
              return;
            }
            done(); done = null;
            done = toast('Rebuilding model — big imports can take a minute…', 'ok', true);
            const opened = await window.__brepOpenQuicksave?.({ name: fileName, text: src });
            done(); done = null;
            toast(opened ? 'Loaded.' : 'Loaded source, but the model did not build — check the editor message.',
              opened ? 'ok' : 'err');
          } catch {
            toast('Load failed.', 'err');
          } finally {
            if (done) done();
          }
        });


        card.querySelector('.qs-del').addEventListener('click', async () => {
          if (!confirm('Delete "' + (it.name || 'Untitled') + '"?')) return;
          const r = await apiFetch('DELETE', '?id=' + encodeURIComponent(it.id));
          if (r.ok) { card.remove(); toast('Deleted.'); } else toast('Delete failed.', 'err');
        });
        grid.appendChild(card);
      }
    } catch {
      grid.innerHTML = '<div id="qs-empty">Failed to load.</div>';
    }
  }

  // ---------- publish hook used by the app's Export ▸ Publish format ----------
  // The app hands us the packed .bcode text + a thumbnail; we store it in the
  // private stash and immediately flip it public, so it lands at /<slug>.
  window.__brepPublish = async ({ name, text, thumb } = {}) => {
    if (!isUnlocked()) {
      const ok = await promptUnlock();
      if (!ok) return { ok: false, error: 'locked — unlock the stash first' };
    }
    const base = String(name || 'model').slice(0, 120);
    try {
      const saveBody = { name: base, bcode: text || getBcode(), thumbDataUrl: thumb || (await snapshotThumb()) };
      if (capturedHtml && capturedHtml.length < 10 * 1024 * 1024) saveBody.html = capturedHtml;
      const res = await apiFetch('POST', '', saveBody);
      if (res.status === 401) {
        localStorage.removeItem(LS_KEY); paint();
        return { ok: false, error: 'secret rejected — re-unlock' };
      }
      if (!res.ok) return { ok: false, error: 'save failed (' + res.status + ')' };
      const { id } = await res.json();

      const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      const pr = await apiFetch('PATCH', '', { id, published: true, slug });
      if (!pr.ok) return { ok: false, error: 'published page failed (' + pr.status + ')' };
      const out = await pr.json();
      paint();
      return { ok: true, slug: out.slug, url: location.origin + '/' + out.slug };
    } catch (e) {
      return { ok: false, error: 'network error' };
    }
  };

  // ---------- boot ----------

  function boot() {
    injectStyle();
    attachTripleTap((el) => el.matches?.('#export-btn'), () => {
      if (isUnlocked()) doSave(); else promptUnlock();
    });
    // keep the row / glow in sync as the app re-renders or reveals the stash
    new MutationObserver(() => paint())
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    if (isUnlocked()) {
      apiFetch('GET').then((r) => {
        if (r.status === 401) localStorage.removeItem(LS_KEY);
        paint();
      }).catch(() => paint());
    } else {
      paint();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ---------- mobile file picker ----------------------------------------
   Android/iOS pickers hide files whose extension they don't recognise
   (.bcode, .3mf, .step …), so on touch devices the Import button opened an
   empty chooser. Widen `accept` there; desktop keeps the tidy filter. */
(function mobileImportPicker() {
  const touch = matchMedia('(pointer: coarse)').matches;
  if (!touch) return;
  const widen = () => {
    for (const el of document.querySelectorAll('input[type="file"]')) {
      const acc = el.getAttribute('accept') || '';
      if (/\.(bcode|stl|3mf|obj|step|stp|svg)/i.test(acc) && acc !== '*/*') {
        el.dataset.desktopAccept = acc;
        el.setAttribute('accept', '*/*');
      }
    }
  };
  const start = () => { widen(); new MutationObserver(widen).observe(document.documentElement, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
