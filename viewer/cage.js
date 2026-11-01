// The smooth-surface cage as a BACKGROUND job (see bgjobs.js).
//
// queueCage(scheduler, name, stl) quietly builds QuadriFlow's quad cage for a
// dropped mesh in viewer/cage-worker.js, one stage at a time, pausing between
// stages whenever the app is doing something the user is waiting on. The
// result is cached by name, so a later "smooth surface" export can use it at
// once; needCage(name) is that later call: it promotes the job (no more
// pausing) and returns the cage.
//
// The cage is { verts: Float64Array xyz, quads: Int32Array 4 per quad,
// stageMs: [...], ms, triangles }. Nothing in the app consumes it yet beyond
// window.brepcode.cage(name); the patcher and STEP writer come next.

import { STAGE_NAMES } from "./cage-stages.js";

const cache = new Map();          // name -> { key, cage }
const MAX_TRIANGLES = 300_000;    // past this a background run is minutes, not seconds

let workerUrl = null;
export function setWorkerUrl(u) { workerUrl = u; }

function keyOf(stl) {
  // cheap fingerprint: length plus a sample of the text, so re-importing a
  // changed file under the same name does not reuse an old cage
  const s = typeof stl === "string" ? stl : "";
  let h = s.length;
  for (let i = 0; i < s.length; i += Math.max(1, (s.length / 512) | 0)) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

export function getCage(name) { return cache.get(name)?.cage || null; }
export function jobId(name) { return `cage:${name}`; }

// One worker per job, terminated at the end (or on a kill), so a finished or
// abandoned cage never holds memory.
function rpc(worker) {
  let seq = 0;
  const pending = new Map();
  worker.onmessage = (e) => {
    const p = pending.get(e.data?.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data); else p.reject(new Error(e.data.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "cage worker crashed"));
    pending.clear();
  };
  return {
    call(msg, transfer) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ ...msg, id }, transfer || []);
      });
    },
    abort(why) {
      for (const p of pending.values()) p.reject(new Error(why));
      pending.clear();
    },
  };
}

export function queueCage(scheduler, name, stl, { faces = 2500, sharp = true, onProgress = null } = {}) {
  if (typeof stl !== "string" || !/^\s*solid/.test(stl)) return null;
  const key = keyOf(stl);
  const hit = cache.get(name);
  if (hit && hit.key === key) return { id: jobId(name), promise: Promise.resolve(hit.cage) };
  const triangles = (stl.match(/facet normal/g) || []).length;
  if (triangles > MAX_TRIANGLES) return null;

  let worker = null, link = null;
  const kill = () => {
    link?.abort("stopped to make room for foreground work");
    worker?.terminate();
    worker = null; link = null;
  };
  const job = scheduler.background({
    id: jobId(name),
    priority: 30,
    needs: "cpu",
    kill,
    run: async (ctx) => {
      const t0 = performance.now();
      worker = new Worker(workerUrl || new URL("./cage-worker.js", import.meta.url), { type: "module" });
      link = rpc(worker);
      try {
        await ctx.checkpoint();
        const begun = await link.call({ op: "begin", stl, faces, sharp });
        const stageMs = [];
        for (let k = 0; k < STAGE_NAMES.length; k++) {
          await ctx.checkpoint();             // the pause point: between stages
          onProgress?.({ name, stage: k, of: STAGE_NAMES.length, label: STAGE_NAMES[k] });
          const r = await link.call({ op: "stage", k });
          stageMs.push(Math.round(r.ms));
        }
        await ctx.checkpoint();
        const out = await link.call({ op: "finish" });
        const cage = {
          name, verts: out.verts, quads: out.quads,
          triangles: begun.triangles, stageMs, ms: Math.round(performance.now() - t0),
        };
        cache.set(name, { key, cage });
        return cage;
      } finally {
        worker?.terminate();
        worker = null; link = null;
      }
    },
  });
  return job;
}

// Someone wants the cage now: stop pausing, put it first, and wait for it.
export async function needCage(scheduler, name) {
  const hit = getCage(name);
  if (hit) return hit;
  const p = scheduler.promote(jobId(name));
  if (!p) return null;
  return p;
}
