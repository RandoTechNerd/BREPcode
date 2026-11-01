// Background jobs: work nobody has asked for yet, done only while the app is
// otherwise quiet.
//
// Two kinds of work, two tags:
//   background  a job that MAY run: module warm-ups, the smooth-surface cage
//               for a dropped mesh. One at a time, lowest `priority` first,
//               started on an idle beat. It pauses whenever foreground work is
//               going, at its next checkpoint, and resumes a moment after the
//               last foreground work ends.
//   foreground  work the user is waiting on: kernel builds, exports, dragging
//               the view, an open FizzCore dialog. Marked with
//               foreground(label) -> end(), during(label, promise), or by any
//               element in the page carrying data-bg-busy.
//
// A browser cannot freeze a worker in the middle of a calculation, so pausing
// is cooperative: a job calls `await ctx.checkpoint()` between its steps. A job
// that offers `kill` can also be stopped mid-step if foreground work has gone
// on for `killAfterMs` on a small machine; it is then queued again and starts
// over. A job someone is now waiting for (promote) ignores every pause.
//
// Pure: no DOM unless `doc` is passed, every clock and environment hook
// injectable, so test/bgjobs.js drives it in Node.

export const BACKGROUND = "background";
export const FOREGROUND = "foreground";

export function createScheduler({
  settleMs = 1000,          // quiet time after foreground work before resuming
  killAfterMs = 4000,       // foreground this long on a small machine -> kill a killable job
  pollMs = 400,             // how often a paused job re-checks
  idle = defaultIdle,       // (fn) => void: "call me when the page is idle"
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimer = (f, ms) => setTimeout(f, ms),
  clearTimer = (t) => clearTimeout(t),
  env = defaultEnv,         // () => { saveData, slowNet, cores }
  doc = typeof document !== "undefined" ? document : null,
  log = null,               // (line) => void, for the debug panel / tests
} = {}) {
  const fg = new Map();     // token -> label
  let fgSeq = 0;
  let lastFgEnd = -Infinity;
  let fgSince = null;       // when the current foreground stretch began
  const queue = [];         // waiting jobs
  let current = null;       // the running job
  let started = false;      // nothing runs before start(): the first build owns boot
  let pumpPending = false;
  const listeners = new Set();
  const say = (s) => { try { log?.(s); } catch { /* fine */ } };

  // ---- foreground ---------------------------------------------------------
  function domBusy() {
    try { return !!doc?.querySelector?.("[data-bg-busy]"); } catch { return false; }
  }
  function busyLabels() {
    const out = [...fg.values()];
    if (domBusy()) out.push("dialog");
    return out;
  }
  function isBusy() { return fg.size > 0 || domBusy(); }
  function quiet() { return !isBusy() && now() - lastFgEnd >= settleMs; }

  function foreground(label = "work") {
    const token = ++fgSeq;
    if (fg.size === 0) fgSince = now();
    fg.set(token, label);
    emit();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      fg.delete(token);
      if (fg.size === 0) { lastFgEnd = now(); fgSince = null; }
      emit();
      schedulePump(settleMs);
    };
  }
  function during(label, promise) {
    const end = foreground(label);
    return Promise.resolve(promise).finally(end);
  }

  // ---- background ---------------------------------------------------------
  // job: { id, run(ctx) -> Promise, priority = 50, needs = "network"|"cpu",
  //        kill?: () => void }
  // Returns { id, promise }. The promise settles with run()'s result, or
  // rejects with { cancelled: true } when the job is cancelled or skipped.
  function background(job) {
    if (!job || typeof job.run !== "function") throw new Error("background(job) needs run()");
    const id = job.id || `job${++fgSeq}`;
    const old = queue.find((j) => j.id === id) || (current?.id === id ? current : null);
    if (old) return { id, promise: old.promise };       // same work already queued: share it
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    promise.catch(() => { /* a caller that doesn't care must not see an unhandled rejection */ });
    const entry = {
      id, run: job.run, kill: job.kill || null,
      priority: job.priority ?? 50, needs: job.needs || "cpu",
      urgent: false, cancelled: false, attempts: 0, seq: ++fgSeq,
      resolve, reject, promise, waiters: [],
      state: "queued",
    };
    queue.push(entry);
    sortQueue();
    say(`queued ${id} (${entry.needs}, priority ${entry.priority})`);
    emit();
    schedulePump(0);
    return { id, promise };
  }
  function sortQueue() {
    queue.sort((a, b) => (b.urgent - a.urgent) || (a.priority - b.priority) || (a.seq - b.seq));
  }

  // Someone is now waiting on this job: front of the queue, no more pauses,
  // and it runs even where the environment gate would have skipped it.
  function promote(id) {
    const j = queue.find((x) => x.id === id) || (current?.id === id ? current : null);
    if (!j) return null;
    j.urgent = true;
    sortQueue();
    wake(j);
    say(`promoted ${id}`);
    emit();
    schedulePump(0);
    return j.promise;
  }
  function cancel(id) {
    const i = queue.findIndex((x) => x.id === id);
    if (i >= 0) {
      const [j] = queue.splice(i, 1);
      j.cancelled = true;
      j.reject({ cancelled: true, id });
      emit();
      return true;
    }
    if (current?.id === id) {
      current.cancelled = true;
      try { current.kill?.(); } catch { /* fine */ }
      wake(current);
      return true;
    }
    return false;
  }

  function gateAllows(j) {
    if (j.urgent) return true;
    let e = {};
    try { e = env() || {}; } catch { /* treat as unknown = allowed */ }
    if (j.needs === "network") return !(e.saveData || e.slowNet);
    return !(e.saveData || (e.cores && e.cores <= 2));
  }

  function schedulePump(ms) {
    if (!started || pumpPending) return;
    pumpPending = true;
    setTimer(() => { pumpPending = false; pump(); }, ms);
  }
  function pump() {
    if (!started || current) return;
    if (!queue.length) return;
    // Skip what this machine shouldn't do in the background at all.
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!gateAllows(queue[i])) {
        const [j] = queue.splice(i, 1);
        say(`skipped ${j.id}: not on this connection / machine`);
        j.reject({ cancelled: true, skipped: true, id: j.id });
      }
    }
    if (!queue.length) { emit(); return; }
    const head = queue[0];
    if (!head.urgent && !quiet()) {
      schedulePump(Math.max(pollMs, settleMs - (now() - lastFgEnd)));
      return;
    }
    if (head.urgent) start(queue.shift());
    else idle(() => {
      if (current || !queue.length) return;
      if (!queue[0].urgent && !quiet()) { schedulePump(pollMs); return; }
      start(queue.shift());
    });
  }

  function wake(j) {
    const w = j.waiters.splice(0);
    for (const f of w) f();
  }

  function makeCtx(j) {
    return {
      id: j.id,
      get cancelled() { return j.cancelled; },
      get urgent() { return j.urgent; },
      // Resolves when the job may go on: right away when nothing else is
      // happening (or it was promoted); otherwise once things have been quiet
      // for settleMs. Rejects if the job was cancelled meanwhile.
      checkpoint() {
        if (j.cancelled) return Promise.reject({ cancelled: true, id: j.id });
        if (j.urgent || quiet()) return Promise.resolve();
        j.state = "paused";
        say(`paused ${j.id} (${busyLabels().join(", ") || "settling"})`);
        emit();
        return new Promise((resolve, reject) => {
          const check = () => {
            if (j.cancelled) { reject({ cancelled: true, id: j.id }); return; }
            if (j.urgent || quiet()) {
              j.state = "running";
              say(`resumed ${j.id}`);
              emit();
              resolve();
              return;
            }
            const t = setTimer(check, pollMs);
            j.waiters.push(() => { clearTimer(t); check(); });
          };
          check();
        });
      },
    };
  }

  // A killable job stuck in a long step while foreground work drags on, on a
  // machine small enough that the two really compete: stop it and start it
  // over later. Only checked while it runs.
  function watchForKill(j) {
    if (!j.kill) return;
    const tick = () => {
      if (current !== j) return;
      let cores = 8;
      try { cores = env()?.cores || 8; } catch { /* fine */ }
      if (!j.urgent && cores <= 4 && fgSince !== null && now() - fgSince >= killAfterMs && j.state === "running") {
        say(`killed ${j.id} mid-step (foreground for ${Math.round(now() - fgSince)} ms); it starts over later`);
        j.restart = true;
        try { j.kill(); } catch { /* fine */ }
        return;
      }
      setTimer(tick, pollMs);
    };
    setTimer(tick, pollMs);
  }

  async function start(j) {
    current = j;
    j.state = "running";
    j.attempts++;
    say(`started ${j.id}${j.attempts > 1 ? ` (attempt ${j.attempts})` : ""}${j.urgent ? " (promoted)" : ""}`);
    emit();
    watchForKill(j);
    try {
      const v = await j.run(makeCtx(j));
      if (j.restart && !j.cancelled) throw { restart: true };
      if (j.cancelled) throw { cancelled: true, id: j.id };
      j.state = "done";
      say(`finished ${j.id}`);
      j.resolve(v);
    } catch (err) {
      if (j.restart && !j.cancelled && j.attempts < 4) {
        j.restart = false;
        j.state = "queued";
        queue.push(j);
        sortQueue();
      } else if (j.cancelled || err?.cancelled) {
        j.state = "cancelled";
        say(`cancelled ${j.id}`);
        j.reject({ cancelled: true, id: j.id });
      } else {
        j.state = "failed";
        say(`failed ${j.id}: ${String(err?.message || err).slice(0, 120)}`);
        j.reject(err);
      }
    } finally {
      current = null;
      emit();
      schedulePump(0);
    }
  }

  // ---- lifecycle / introspection -------------------------------------------
  function startScheduler() {
    if (started) return;
    started = true;
    say("scheduler started");
    schedulePump(0);
  }
  function status() {
    return {
      started,
      busy: busyLabels(),
      quiet: quiet(),
      current: current ? { id: current.id, state: current.state, urgent: current.urgent, attempts: current.attempts } : null,
      queued: queue.map((j) => ({ id: j.id, priority: j.priority, needs: j.needs, urgent: j.urgent })),
    };
  }
  function onChange(f) { listeners.add(f); return () => listeners.delete(f); }
  function emit() { for (const f of listeners) { try { f(status()); } catch { /* fine */ } } }

  return { foreground, during, background, promote, cancel, start: startScheduler, status, onChange, isBusy };
}

function defaultIdle(f) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(() => f(), { timeout: 4000 });
  else setTimeout(f, 200);
}
function defaultEnv() {
  const n = typeof navigator !== "undefined" ? navigator : {};
  const c = n.connection;
  return {
    saveData: !!c?.saveData,
    slowNet: !!(c && /(^|-)2g$/.test(c.effectiveType || "")),
    cores: n.hardwareConcurrency || 0,
  };
}
