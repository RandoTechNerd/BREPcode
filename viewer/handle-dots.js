// handle-dots.js — the selection's drag handles as small dots of constant
// ON-SCREEN size.
//
// They used to be shaded beads sized in model space: huge on a small part
// zoomed in, specks on a big one zoomed out, and always covering the edge you
// wanted to look at. Now each handle is:
//
//   an invisible sphere, HIT_PX across on screen    what the raycaster hits
//   a dot (corners ~6 px light, faces ~5 px accent)  what you see
//   a thin ring (~16 px) while the pointer is on it
//   arrows for the directions that handle moves (a face both ways along its
//     normal: out grows, in shrinks). A FACE handle shows them as soon as it
//     exists, solid and big enough to grab (dragging an arrow drags its
//     handle); a corner shows its thin ones after a short dwell.
//   a signed distance label by the cursor while it drags
//
// The sphere is the handle the viewer has always had (userData.handle, its
// position is what a drag reads and moves), so every drag path is unchanged;
// only its scale is now set per frame from the camera, and the visuals are
// its children, sized in "handle units" where 1 unit = HIT_PX / 2 pixels.

export const HIT_PX = 20;
const UNIT_PX = HIT_PX / 2;
const px = (n) => n / UNIT_PX;              // pixels -> handle units

export const DOT_PX = { corner: 6, face: 5 };
export const RING_PX = 16;
export const DWELL_MS = 600;

function discTexture(THREE, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  draw(c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createHandleDots(THREE) {
  // white disc with a dark rim, tinted by the material colour, so a light dot
  // still reads on a light model
  const dotTex = discTexture(THREE, (g) => {
    g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fillStyle = "#ffffff"; g.fill();
    g.lineWidth = 6; g.strokeStyle = "rgba(10, 14, 24, 0.85)"; g.stroke();
  });
  // a 1.5 px stroke at 16 px is 6 px at the texture's 64
  const ringTex = discTexture(THREE, (g) => {
    g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2);
    g.lineWidth = 6; g.strokeStyle = "#ffffff"; g.stroke();
  });
  const sprite = (map, color, opacity, depthTest) => new THREE.SpriteMaterial({
    map, color, transparent: true, opacity, depthTest, depthWrite: false,
  });
  const mats = {
    face: sprite(dotTex, 0x2e76f2, 1, true),
    faceGhost: sprite(dotTex, 0x2e76f2, 0.35, false),
    corner: sprite(dotTex, 0xeaf1ff, 1, true),
    cornerGhost: sprite(dotTex, 0xeaf1ff, 0.35, false),
    ring: sprite(ringTex, 0x3b9dff, 1, false),
  };
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitGeo = new THREE.SphereGeometry(1, 12, 8);
  let accent = 0x3b9dff;

  let hovered = null, dwellTimer = 0;
  let labelEl = null;

  const kit = {
    hitGeo,
    // make({ kind: "face" | "corner", dirs: [Vector3] }) -> the hit mesh
    make({ kind, dirs = [] }) {
      const look = kind === "face" ? "face" : "corner";
      const h = new THREE.Mesh(hitGeo, hitMat);
      h.renderOrder = 998;
      h.userData.dot = { dirs: dirs.map((d) => d.clone().normalize()), look };
      // a faint pass through everything, so a handle behind the model can still
      // be seen (and grabbed), and the crisp one the model hides
      for (const [m, order] of [[mats[`${look}Ghost`], 996], [mats[look], 999]]) {
        const s = new THREE.Sprite(m);
        s.scale.setScalar(px(DOT_PX[look]));
        s.renderOrder = order;
        s.userData.dotPart = m === mats[look] ? "crisp" : "ghost";
        h.add(s);
      }
      const ring = new THREE.Sprite(mats.ring);
      ring.scale.setScalar(px(RING_PX));
      ring.renderOrder = 1000;
      ring.visible = false;
      ring.userData.dotPart = "ring";
      h.add(ring);
      // a face's push/pull arrows are always there: hidden behind a dwell on a
      // 5 px dot they were never found
      if (look === "face" && dirs.length) { h.userData.dot.always = true; kit.showArrows(h); }
      return h;
    },

    // Every frame: hold each handle at a constant pixel size, and lift the
    // crisp dot a few pixels towards the camera so the surface it sits on does
    // not slice it in half.
    resize(group, camera, heightPx) {
      if (!group.children.length || !heightPx) return;
      const v = new THREE.Vector3();
      for (const h of group.children) {
        if (!h.userData.dot) continue;
        let wpp;
        if (camera.isOrthographicCamera) {
          wpp = (camera.top - camera.bottom) / camera.zoom / heightPx;
          v.set(0, 0, 1).applyQuaternion(camera.quaternion);
        } else {
          // depth along the view, not distance: off-centre dots would grow
          const depth = -v.copy(h.position).applyMatrix4(camera.matrixWorldInverse).z;
          wpp = (2 * Math.max(depth, 1e-6) * Math.tan((camera.fov * Math.PI) / 360)) / camera.zoom / heightPx;
          v.copy(camera.position).sub(h.position).normalize();
        }
        h.scale.setScalar(wpp * UNIT_PX);
        for (const c of h.children) {
          if (c.userData.dotPart === "crisp") c.position.copy(v).multiplyScalar(px(4));
        }
      }
    },

    // the pointer is over handle h (or none): ring now, arrows after a dwell
    hover(h, dwellMs = DWELL_MS) {
      if (h === hovered) return;
      clearTimeout(dwellTimer);
      if (hovered) { setRing(hovered, false); if (!hovered.userData.dot?.always) kit.hideArrows(hovered); }
      hovered = h;
      if (!h) return;
      setRing(h, true);
      if (!h.userData.dot?.always) dwellTimer = setTimeout(() => { if (hovered === h && h.parent) kit.showArrows(h); }, Math.max(0, dwellMs));
    },
    get hovered() { return hovered; },

    showArrows(h) {
      kit.hideArrows(h);
      const arrows = new THREE.Group();
      arrows.userData.dotPart = "arrows";
      if (h.userData.dot?.always) {
        // solid arrows, ~50 px, with a fat invisible sleeve to grab
        for (const d of h.userData.dot.dirs) arrows.add(solidArrow(d));
        h.add(arrows);
        return arrows.children.length;
      }
      for (const d of h.userData.dot?.dirs ?? []) {
        const a = new THREE.ArrowHelper(d, d.clone().multiplyScalar(px(10)), px(30), accent, px(8), px(5));
        for (const o of [a.line, a.cone]) {
          o.material.depthTest = false;
          o.material.transparent = true;
          o.renderOrder = 1001;
        }
        arrows.add(a);
      }
      h.add(arrows);
      return arrows.children.length;
    },
    // the handle whose arrow is under the ray (arrows are children of the hit
    // sphere, so the non-recursive handle pick never sees them)
    pickArrow(raycaster, group) {
      const sleeves = [];
      for (const h of group.children) h.traverse((o) => { if (o.userData.arrowHit) sleeves.push(o); });
      const hit = sleeves.length ? raycaster.intersectObjects(sleeves, false)[0] : null;
      if (!hit) return null;
      let h = hit.object;
      while (h && !h.userData.handle) h = h.parent;
      return h ? { object: h, distance: hit.distance, point: h.position.clone() } : null;
    },
    hideArrows(h) {
      for (const c of [...(h?.children ?? [])]) {
        if (c.userData.dotPart !== "arrows") continue;
        c.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        h.remove(c);
      }
    },

    // A small live readout beside the cursor while a handle drags, signed so
    // the direction is obvious: "+3.0 mm" grows, "-2.5 mm" shrinks.
    // (or, with `text`, that text: a box corner shows its three sizes)
    label(clientX, clientY, mm, text = null) {
      if (!labelEl) {
        labelEl = document.createElement("div");
        labelEl.id = "handle-drag-label";
        labelEl.setAttribute("aria-live", "polite");
        labelEl.style.cssText = "position:fixed;z-index:60;pointer-events:none;padding:2px 6px;border-radius:5px;"
          + "font:600 11.5px/1.3 ui-monospace,'Cascadia Code',Consolas,monospace;color:#fff;"
          + "background:rgba(10,14,24,0.82);border:1px solid rgba(127,150,200,0.35);white-space:nowrap";
        document.body.appendChild(labelEl);
      }
      const v = Math.round((mm ?? 0) * 10) / 10;
      labelEl.textContent = text ?? `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(1)} mm`;
      labelEl.style.color = text == null && v < 0 ? "#ffb35c" : "#9fd0ff";
      labelEl.style.left = `${clientX + 14}px`;
      labelEl.style.top = `${clientY + 12}px`;
      labelEl.style.display = "block";
    },
    hideLabel() { if (labelEl) labelEl.style.display = "none"; },
    get labelText() { return labelEl && labelEl.style.display !== "none" ? labelEl.textContent : null; },

    setColors({ face, corner, ring }) {
      if (face) { mats.face.color.set(face); mats.faceGhost.color.set(face); }
      if (corner) { mats.corner.color.set(corner); mats.cornerGhost.color.set(corner); }
      if (ring) { mats.ring.color.set(ring); accent = new THREE.Color(ring).getHex(); }
    },

    // what a test needs to see: per handle, its on-screen size and state
    describe(group, camera, widthPx, heightPx) {
      return group.children.filter((h) => h.userData.dot).map((h) => {
        const a = h.position.clone().project(camera);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(h.scale.x);
        const b = h.position.clone().add(right).project(camera);
        const hitPx = Math.hypot((b.x - a.x) * widthPx / 2, (b.y - a.y) * heightPx / 2) * 2;
        return {
          kind: h.userData.handle?.kind, look: h.userData.dot.look,
          x: (a.x + 1) / 2 * widthPx, y: (1 - a.y) / 2 * heightPx,
          hitPx, dotPx: hitPx * (DOT_PX[h.userData.dot.look] / HIT_PX),
          ring: h.children.some((c) => c.userData.dotPart === "ring" && c.visible),
          arrows: h.children.filter((c) => c.userData.dotPart === "arrows").reduce((n, g) => n + g.children.length, 0),
        };
      });
    },
  };
  const Y = new THREE.Vector3(0, 1, 0);
  function solidArrow(d) {
    const a = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const gap = px(9), shaft = px(30), head = px(14);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(px(1.6), px(1.6), shaft, 8), m);
    s.position.y = gap + shaft / 2;
    const c = new THREE.Mesh(new THREE.ConeGeometry(px(6), head, 16), m);
    c.position.y = gap + shaft + head / 2;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(px(9), px(9), shaft + head, 8), hitMat);
    sleeve.position.y = gap + (shaft + head) / 2;
    sleeve.userData.arrowHit = true;
    for (const o of [s, c]) o.renderOrder = 1001;
    a.add(s, c, sleeve);
    a.quaternion.setFromUnitVectors(Y, d);
    return a;
  }
  function setRing(h, on) {
    for (const c of h.children) if (c.userData.dotPart === "ring") c.visible = on;
  }
  return kit;
}
