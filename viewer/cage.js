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

const cache = new Map();          // `${name}@${faces}` -> { key, cage }
// The smooth surface sizes itself (index.html): an 800-quad cage first (refined
// only where it misses, adaptsmooth.js), and a 2,500-quad one when the coarse
// surface has lost part of the shape (a Benchy at 800 has no cabin).
export const CAGE_SIZES = [800, 2500];
const slot = (name, faces, alt = 0) => `${name}@${faces}${alt ? `~${alt}` : ""}`;
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

export function getCage(name, faces = CAGE_SIZES.at(-1), alt = 0) { return cache.get(slot(name, faces, alt))?.cage || null; }

// Someone waiting on a cage can follow it stage by stage (a progress bar),
// whoever queued it: watchCage(name, fn) -> unsubscribe. fn gets
// { name, stage, of, label, seed } as each QuadriFlow stage starts.
const watchers = new Map();
export function watchCage(name, fn) {
  if (!watchers.has(name)) watchers.set(name, new Set());
  watchers.get(name).add(fn);
  return () => watchers.get(name)?.delete(fn);
}
const tell = (ev) => { for (const fn of watchers.get(ev.name) || []) { try { fn(ev); } catch { /* a listener's problem */ } } };
export function jobId(name, faces = CAGE_SIZES.at(-1), alt = 0) { return `cage:${slot(name, faces, alt)}`; }

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

// Per-stage deadline for QuadriFlow (see run() below): generous, since a
// stage that is merely slow must never be cut off.
let STAGE_BASE_MS = 15000;
let STAGE_MS_PER_TRIANGLE = 0.25;       // 225k triangles -> 71 s per stage
// test/cage.js shortens these to prove a stuck stage is retried, not waited on
export function setStageLimits({ base = STAGE_BASE_MS, perTriangle = STAGE_MS_PER_TRIANGLE } = {}) {
  STAGE_BASE_MS = base; STAGE_MS_PER_TRIANGLE = perTriangle;
}
const SEEDS = [0, 1, 2];
class StageTimeout extends Error {
  constructor(msg) { super(`${msg.op === "stage" ? STAGE_NAMES[msg.k] : msg.op} ran too long`); this.name = "StageTimeout"; }
}

// alt: an ALTERNATIVE layout from other seeds (alt 1 starts at seed 1+3k...),
// cached apart: a seed can lay a Benchy out without its chimney's bore, and
// another seed keeps it (the smooth surface asks for one when the first
// layout misses too much of the mesh).
export function queueCage(scheduler, name, stl, { faces = 2500, sharp = true, onProgress = null, alt = 0 } = {}) {
  if (typeof stl !== "string" || !/^\s*solid/.test(stl)) return null;
  const key = keyOf(stl);
  const hit = cache.get(slot(name, faces, alt));
  if (hit && hit.key === key) return { id: jobId(name, faces, alt), promise: Promise.resolve(hit.cage) };
  const triangles = (stl.match(/facet normal/g) || []).length;
  if (triangles > MAX_TRIANGLES) return null;

  let worker = null, link = null;
  const kill = () => {
    link?.abort("stopped to make room for foreground work");
    worker?.terminate();
    worker = null; link = null;
  };
  const job = scheduler.background({
    id: jobId(name, faces, alt),
    priority: faces <= CAGE_SIZES[0] ? 30 : 31,      // the small cage first: it is often enough
    needs: "cpu",
    kill,
    run: async (ctx) => {
      const t0 = performance.now();
      // QuadriFlow can loop forever on some meshes with some random seeds:
      // the Taco Bell bag, after the import's repair, never leaves the index
      // map with seed 0, and finishes in 3 s with seeds 1, 2 and 3. So every
      // stage runs against a deadline sized from the mesh (Benchy's 225k
      // triangles need ~9 s for the slowest stage), and a stage that blows it
      // costs that worker and a retry on the next seed. A cage that never
      // finishes would also hold up every other background job.
      const stageLimit = STAGE_BASE_MS + triangles * STAGE_MS_PER_TRIANGLE;
      let lastErr = null;
      for (const seed of SEEDS.map((s) => s + 3 * alt)) {
        worker = new Worker(workerUrl || new URL("./cage-worker.js", import.meta.url), { type: "module" });
        link = rpc(worker);
        const call = (msg) => {
          const l = link;
          if (!l) return Promise.reject(new Error("stopped to make room for foreground work"));
          let timer;
          return Promise.race([
            l.call(msg),
            new Promise((_, rej) => { timer = setTimeout(() => rej(new StageTimeout(msg)), stageLimit); }),
          ]).finally(() => clearTimeout(timer));
        };
        try {
          await ctx.checkpoint();
          const begun = await call({ op: "begin", stl, faces, sharp, seed });
          const stageMs = [];
          for (let k = 0; k < STAGE_NAMES.length; k++) {
            await ctx.checkpoint();             // the pause point: between stages
            const ev = { name, faces, stage: k, of: STAGE_NAMES.length, label: STAGE_NAMES[k], seed };
            onProgress?.(ev);
            tell(ev);
            const r = await call({ op: "stage", k });
            stageMs.push(Math.round(r.ms));
          }
          await ctx.checkpoint();
          const out = await call({ op: "finish" });
          const cage = {
            name, verts: out.verts, quads: out.quads, seed,
            triangles: begun.triangles, stageMs, ms: Math.round(performance.now() - t0),
          };
          cache.set(slot(name, faces, alt), { key, cage });
          return cage;
        } catch (e) {
          if (!(e instanceof StageTimeout)) throw e;
          lastErr = e;                          // try the next seed on a fresh worker
        } finally {
          worker?.terminate();
          worker = null; link = null;
        }
      }
      throw new Error(`the surface layout didn't settle on this mesh (${lastErr?.message || "timed out"}, ${SEEDS.length} tries)`);
    },
  });
  return job;
}

// Someone wants the cage now: stop pausing, put it first, and wait for it.
export async function needCage(scheduler, name, faces = CAGE_SIZES.at(-1)) {
  const hit = getCage(name, faces);
  if (hit) return hit;
  const p = scheduler.promote(jobId(name, faces));
  if (!p) return null;
  return p;
}
