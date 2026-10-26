// design/presspull.js — Design mode's press-pull: drag a face along its
// normal, both ways.
//
//   out    grows: a box side or a cylinder's end edits that size number (and
//          the translate that keeps the far side put); any other flat face is
//          extruded as its own outline and joined
//   in     shrinks the same way, while the shape has size left
//   past   the shape's own size (or a face with no size number behind it): the
//          face's outline cuts in, on through whatever lies beyond, as deep
//          as it was pushed
//
// While dragging, a translucent slab shows the material that comes or goes
// (green / red) with a signed +/- mm label at the cursor; nothing is built
// until release, which writes ONE edit (design/features.js pressPullText).
// A cylinder's round side pulls its radius.

import * as F from "./features.js";
import { facePick } from "./dialogs.js";
import { worldToPlane, planeFrame } from "../../src/dsl.js";
import { findResizeTarget } from "../assist.js";

const BOX = new Set(["cube", "cuboid"]);

export function createPressPull({ host, THREE, scene, camera, orbit }) {
  const ghostGroup = new THREE.Group();
  ghostGroup.name = "design-presspull";
  scene.add(ghostGroup);
  const addMat = new THREE.MeshBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
  const cutMat = new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
  const label = document.createElement("div");
  label.id = "dz-pp-label";
  label.className = "dz-ui";
  label.hidden = true;
  document.body.appendChild(label);

  let drag = null;      // { fp, n, origin, base, ctx, d, x0, y0, pxPerMm, dir }
  let lastWrite = null;

  const clearGhost = () => { for (const c of [...ghostGroup.children]) { ghostGroup.remove(c); c.geometry.dispose(); } };

  // what the face is to the code: the size number behind it, if any
  function context(fp, text) {
    const site = (host.featureMap() || {})[fp.fid];
    if (!site) return null;
    const sites = host.featureMap(), trace = host.trace(), runText = host.runText();
    const body = F.bodySpan(text, fp.fid, { sites, trace, runText });
    const n = fp.normal;
    const suffix = /_(P|N)([XYZ])$/.exec(fp.name);
    const own = text.slice(site.start, site.end);
    const centered = /center\s*:\s*true/.test(own);
    let target = null, axis = 2, sign = 1, radial = false;
    const along = (a, s) => n && Math.abs(n[a] - s) < 1e-6;
    if (BOX.has(site.kind) && suffix) {
      axis = "XYZ".indexOf(suffix[2]); sign = suffix[1] === "P" ? 1 : -1;
      // only when the box is not turned: its own +X face must still face +X
      if (along(axis, sign)) target = findResizeTarget(text, site, axis);
    } else if (site.kind === "cylinder" && /_(T|B)$/.test(fp.name)) {
      sign = fp.name.endsWith("_T") ? 1 : -1;
      if (along(2, sign)) target = findResizeTarget(text, site, 2);
    } else if (site.kind === "cylinder" && /_S$/.test(fp.name) && !fp.outline) {
      radial = true;
      target = findResizeTarget(text, site, 0);       // its r (a d: has none)
    }
    return { site, body, target, axis, sign, radial, centered: centered && !radial, siteSpan: { start: site.start, end: site.end } };
  }

  return {
    get dragging() { return !!drag; },
    // a press on the model with the Press-pull tool; false = not a face it can pull
    down(e, hit) {
      const fp = facePick(hit, THREE);
      if (!fp) return false;
      const text = host.text();
      const ctx = context(fp, text);
      if (!ctx || (!fp.outline && !ctx.radial)) {
        host.setHint(`Press-pull works on flat faces and a cylinder's round side; <code>${fp?.name ?? "that"}</code> is neither.`);
        return false;
      }
      let n = fp.normal;
      if (ctx.radial) {
        // out from the axis, at the point pressed
        const c = new THREE.Box3().setFromObject(fp.mesh).getCenter(new THREE.Vector3());
        const v = new THREE.Vector3(fp.point[0] - c.x, fp.point[1] - c.y, 0).normalize();
        n = [v.x, v.y, 0];
      }
      const origin = new THREE.Vector3(...fp.point);
      // screen direction and scale of the normal at the press
      const rect = host.renderer.domElement.getBoundingClientRect();
      const toPx = (p) => { const q = p.clone().project(camera); return [(q.x + 1) / 2 * rect.width, (1 - q.y) / 2 * rect.height]; };
      const a = toPx(origin), b = toPx(origin.clone().addScaledVector(new THREE.Vector3(...n), 1));
      const dir = [b[0] - a[0], b[1] - a[1]];
      const pxPerMm = Math.hypot(...dir);
      if (pxPerMm < 0.05) { host.setHint("That face points straight at you: turn the view a little to pull it."); return false; }
      orbit.enabled = false;
      drag = { fp, n, origin, base: text, ctx, d: 0, x0: e.clientX, y0: e.clientY, pxPerMm, dir: [dir[0] / pxPerMm, dir[1] / pxPerMm] };
      return true;
    },
    move(e) {
      if (!drag) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      const raw = (dx * drag.dir[0] + dy * drag.dir[1]) / drag.pxPerMm;
      const step = e.ctrlKey ? 0.1 : e.shiftKey ? 5 : 1;
      drag.d = Math.round(raw / step) * step;
      const d = drag.d;
      // past the size: the cut (it says so on the label)
      const past = drag.ctx.target && drag.ctx.target.value + d < 0.2;
      const cut = d < 0 && (!drag.ctx.target || past);
      label.hidden = false;
      label.className = `dz-ui${d < 0 ? " cut" : ""}`;
      label.textContent = `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(step < 1 ? 1 : 0)} mm${cut ? " cut" : d > 0 && !drag.ctx.target ? " join" : ""}`;
      label.style.left = `${e.clientX + 16}px`;
      label.style.top = `${e.clientY + 14}px`;
      clearGhost();
      if (!d || !drag.fp.outline) return;
      const pl = F.facePlane(drag.fp.outline);
      const fr = planeFrame(pl);
      const shape = new THREE.Shape(drag.fp.outline.loops[0].map((p) => new THREE.Vector2(...worldToPlane(pl, p))));
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(d), bevelEnabled: false });
      const m = new THREE.Mesh(g, d > 0 ? addMat : cutMat);
      m.matrixAutoUpdate = false;
      m.matrix.makeBasis(fr.x, fr.y, fr.n).setPosition(fr.origin.clone().addScaledVector(fr.n, d < 0 ? d : 0));
      m.renderOrder = 996;
      ghostGroup.add(m);
    },
    async up() {
      if (!drag) return;
      const g = drag;
      drag = null;
      orbit.enabled = true;
      label.hidden = true;
      clearGhost();
      if (Math.abs(g.d) < 0.05) return;
      const toPlane = g.fp.outline ? ((pl) => (p) => worldToPlane(pl, p))(F.facePlane(g.fp.outline)) : null;
      const r = F.pressPullText(g.base, { body: g.ctx.body, outline: g.fp.outline, target: g.ctx.target, sign: g.ctx.sign, axis: g.ctx.axis,
        siteSpan: g.ctx.siteSpan, centered: g.ctx.centered, toPlane }, g.d);
      lastWrite = { d: g.d, how: r.how, face: g.fp.name };
      if (r.how === "none") return;
      if (host.text() !== g.base) { host.setHint("The code changed during the drag, so nothing was written."); return; }
      const res = await host.commit(r.next);
      host.setHint(`Press-pull <b>${g.d > 0 ? "+" : "−"}${Math.abs(g.d)} mm</b> on <code>${g.fp.name}</code>: `
        + ({ size: "its size number was changed.", join: "the face's outline was extruded and joined.", cut: "the face's outline cuts in." }[r.how])
        + (res.ok ? "" : ` <b style="color:#ff9c9c">The kernel refused it</b> (see the timeline); Ctrl+Z takes it back.`));
    },
    cancel() {
      if (drag) orbit.enabled = true;
      drag = null;
      label.hidden = true;
      clearGhost();
    },
    debug: () => ({ dragging: !!drag, d: drag?.d ?? null, last: lastWrite }),
  };
}
