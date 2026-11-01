// The background-job scheduler (viewer/bgjobs.js) on a fake clock: background
// jobs wait for quiet, pause at checkpoints while foreground work runs, resume
// after the settle time, run one at a time by priority, respect the
// connection / core gate, and a promoted job ignores all of that. A killable
// job on a small machine is stopped mid-step and starts over.

import { createScheduler } from "../viewer/bgjobs.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

// A tiny fake clock. Timers fire in time order; promise callbacks get a chance
// to run between them.
function fakeClock() {
  let t = 0, seq = 0;
  const timers = new Map();
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return {
    now: () => t,
    setTimer: (f, ms) => { const id = ++seq; timers.set(id, { at: t + Math.max(0, ms), f }); return id; },
    clearTimer: (id) => timers.delete(id),
    idle: (f) => { const id = ++seq; timers.set(id, { at: t, f }); },
    async advance(ms) {
      const end = t + ms;
      await flush();
      for (;;) {
        let next = null;
        for (const [id, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [id, x];
        if (!next) break;
        timers.delete(next[0]);
        t = Math.max(t, next[1].at);
        next[1].f();
        await flush();
      }
      t = end;
      await flush();
    },
  };
}
function make(opts = {}) {
  const clock = fakeClock();
  const lines = [];
  const s = createScheduler({
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, idle: clock.idle,
    env: () => ({ cores: 8, ...(opts.env || {}) }), doc: opts.doc || null,
    log: (l) => lines.push(l), settleMs: 1000, pollMs: 100, killAfterMs: 3000,
  });
  return { s, clock, lines };
}
// A job of `n` steps; each step "takes" stepMs of fake time and is followed by
// a checkpoint. Records when each step started.
function stepsJob(clock, n, stepMs, log) {
  return async (ctx) => {
    for (let i = 0; i < n; i++) {
      await ctx.checkpoint();
      log.push([i, clock.now()]);
      await new Promise((r) => clock.setTimer(r, stepMs));
    }
    return "done";
  };
}

console.log("\nbackground jobs: waiting, pausing, resuming\n");

{
  const { s, clock } = make();
  const steps = [];
  const { promise } = s.background({ id: "a", run: stepsJob(clock, 3, 100, steps) });
  await clock.advance(500);
  check("nothing runs before start()", steps.length === 0);
  s.start();
  await clock.advance(2000);
  check("runs to the end once started on a quiet page", steps.length === 3);
  check("resolves with run()'s result", (await promise) === "done");
}

{
  const { s, clock } = make();
  s.start();
  const end = s.foreground("build");
  const steps = [];
  s.background({ id: "a", run: stepsJob(clock, 2, 100, steps) });
  await clock.advance(5000);
  check("does not start while foreground work is going", steps.length === 0);
  end();
  await clock.advance(500);
  check("still waits during the settle time", steps.length === 0);
  await clock.advance(1000);
  check("starts once things have been quiet for settleMs", steps.length === 2);
}

{
  const { s, clock } = make();
  s.start();
  const steps = [];
  s.background({ id: "a", run: stepsJob(clock, 4, 500, steps) });
  await clock.advance(1);            // step 0 starts at t=0
  check("first step started", steps.length === 1);
  const end = s.foreground("export");
  await clock.advance(3000);
  check("pauses at the next checkpoint while foreground runs", steps.length === 1, `steps=${steps.length}`);
  check("status says paused", s.status().current?.state === "paused");
  end();
  const tEnd = clock.now();
  await clock.advance(5000);
  check("resumes after the settle time", steps.length === 4);
  check("resumed no sooner than settleMs after foreground ended", steps[1][1] - tEnd >= 1000, `gap=${steps[1][1] - tEnd}`);
}

{
  const { s, clock } = make();
  s.start();
  const steps = [];
  const end = s.foreground("drag");
  s.background({ id: "cage", run: stepsJob(clock, 3, 100, steps) });
  await clock.advance(1000);
  check("not started under foreground work", steps.length === 0);
  const p = s.promote("cage");
  await clock.advance(1000);
  check("a promoted job runs even under foreground work", steps.length === 3);
  check("promote returns the job's promise", (await p) === "done");
  end();
}

{
  const { s, clock } = make();
  const doc = { busy: false, querySelector: () => (doc.busy ? {} : null) };
  const m = make({ doc });
  m.s.start();
  const steps = [];
  doc.busy = true;
  m.s.background({ id: "a", run: stepsJob(m.clock, 1, 100, steps) });
  await m.clock.advance(3000);
  check("an element with data-bg-busy counts as foreground", steps.length === 0);
  doc.busy = false;
  await m.clock.advance(2000);
  check("and the job runs once it is gone", steps.length === 1);
  void s; void clock;
}

console.log("\nbackground jobs: order, sharing, gating, cancelling\n");

{
  const { s, clock } = make();
  const order = [];
  const job = (id) => async () => { order.push(id); await new Promise((r) => clock.setTimer(r, 50)); };
  s.background({ id: "spools", priority: 90, needs: "network", run: job("spools") });
  s.background({ id: "fizz", priority: 10, needs: "network", run: job("fizz") });
  s.background({ id: "cage", priority: 30, run: job("cage") });
  s.start();
  await clock.advance(1000);
  check("runs lowest priority number first, one at a time", order.join() === "fizz,cage,spools", order.join());
}

{
  const { s } = make();
  const a = s.background({ id: "x", run: async () => 1 });
  const b = s.background({ id: "x", run: async () => 2 });
  check("the same id queued twice shares one job", a.promise === b.promise);
}

{
  const { s, clock } = make({ env: { saveData: true } });
  s.start();
  const ran = [];
  const net = s.background({ id: "warm", needs: "network", run: async () => ran.push("warm") });
  const cpu = s.background({ id: "cage", needs: "cpu", run: async () => ran.push("cage") });
  await clock.advance(1000);
  const r1 = await net.promise.then(() => "ran", (e) => (e?.skipped ? "skipped" : "other"));
  const r2 = await cpu.promise.then(() => "ran", (e) => (e?.skipped ? "skipped" : "other"));
  check("data saver skips network warm-ups", r1 === "skipped" && !ran.includes("warm"));
  check("data saver skips background CPU work", r2 === "skipped" && !ran.includes("cage"));
}

{
  const { s, clock } = make({ env: { cores: 2 } });
  s.start();
  const ran = [];
  const cpu = s.background({ id: "cage", needs: "cpu", run: async () => ran.push("cage") });
  const net = s.background({ id: "warm", needs: "network", run: async () => ran.push("warm") });
  await clock.advance(1000);
  check("a 2-core machine skips background CPU work", (await cpu.promise.catch((e) => e))?.skipped === true);
  check("but still warms modules", ran.includes("warm") && (await net.promise) !== undefined);
}

{
  const { s, clock } = make();
  s.start();
  const steps = [];
  const { promise } = s.background({ id: "a", run: stepsJob(clock, 5, 300, steps) });
  await clock.advance(400);
  s.cancel("a");
  await clock.advance(3000);
  const r = await promise.catch((e) => e);
  check("cancel stops at the next checkpoint and rejects", r?.cancelled === true && steps.length < 5, `steps=${steps.length}`);
}

console.log("\nbackground jobs: killing a long step on a small machine\n");

{
  const { s, clock, lines } = make({ env: { cores: 4 } });
  s.start();
  let attempts = 0, kills = 0;
  let wake = null;
  const run = async (ctx) => {
    attempts++;
    await ctx.checkpoint();
    // one long uninterruptible step (like QuadriFlow's index map): 6 s
    await new Promise((resolve, reject) => {
      const t = clock.setTimer(resolve, 6000);
      wake = () => { clock.clearTimer(t); reject(new Error("killed")); };
    });
    return `attempt ${attempts}`;
  };
  const { promise } = s.background({ id: "cage", run, kill: () => { kills++; wake?.(); } });
  await clock.advance(10);
  const end = s.foreground("build");
  await clock.advance(3500);
  check("a killable job is stopped after killAfterMs of foreground", kills === 1, lines.join(" | "));
  end();
  await clock.advance(10000);
  check("and starts over once quiet", attempts === 2);
  check("finishing the second time", (await promise) === "attempt 2");
}

{
  const { s, clock } = make({ env: { cores: 16 } });
  s.start();
  let kills = 0;
  s.background({
    id: "cage", kill: () => kills++,
    run: async (ctx) => { await ctx.checkpoint(); await new Promise((r) => clock.setTimer(r, 6000)); },
  });
  await clock.advance(10);
  const end = s.foreground("build");
  await clock.advance(5000);
  end();
  check("a big machine never kills: it just pauses at the next checkpoint", kills === 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
