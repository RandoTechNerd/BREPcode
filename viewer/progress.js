// A progress bar for anything that takes a while: builds, conversions and
// exports.
//
// Two ways in:
//  - noteStatus(cls, text): every setStatus() call goes through here. A busy
//    status that lasts past `delayMs` grows a bar under the editor's status
//    line, with the seconds so far. "step 3 of 7" in the text (a build's own
//    report) makes it a real fraction; otherwise it slides (indeterminate).
//  - task(label, stages): a job that knows its steps (wrapping a mesh in a
//    smooth surface, a curved STEP export) says which step it is on, and
//    each step's rough time estimate fills the bar smoothly between steps.
//    A task outranks the status-driven bar while it runs.
//
// The bar lives in the editor's status line. When the editor panel is
// closed that line is not on screen, so the same bar shows as a small card
// at the bottom of the window instead. A failure stays up there with the
// reason, a Try again button when the caller gives one (plus any other
// ways out it names, as `actions`), and a close button.

export function createProgress({ status, say, isStatusVisible, delayMs = 700 }) {
  // ---- DOM: a bar in the status line, and the floating card
  status.classList.add("has-pbar");
  const bar = document.createElement("div");
  bar.className = "pbar";
  bar.innerHTML = "<i></i>";
  status.appendChild(bar);
  const time = document.createElement("span");
  time.className = "ptime";
  status.querySelector("#status-text")?.after(time);

  const card = document.createElement("div");
  card.id = "pcard";
  card.hidden = true;
  card.setAttribute("role", "status");
  card.innerHTML = `<div class="pc-row"><span class="pc-text"></span><span class="pc-time"></span>`
    + `<span class="pc-acts"></span><button class="pc-retry" hidden>Try again</button><button class="pc-x" title="Dismiss" hidden>✕</button></div>`
    + `<div class="pbar"><i></i></div>`;
  document.body.appendChild(card);
  const cardText = card.querySelector(".pc-text"), cardTime = card.querySelector(".pc-time");
  const retryBtn = card.querySelector(".pc-retry"), closeBtn = card.querySelector(".pc-x");
  const acts = card.querySelector(".pc-acts");
  let actsFor = null;          // the failure the extra buttons were made for
  closeBtn.onclick = () => { failure = null; render(); };
  retryBtn.onclick = () => { const r = failure?.retry; failure = null; render(); r?.(); };

  // ---- state
  let generic = null;          // { t0, text, frac }  from the status line
  let task = null;             // { label, stages, i, t0, stageT0, frac, text }
  let failure = null;          // { text, retry, actions, until }
  let timer = 0;

  const fracOfText = (text) => {
    const m = /step (\d+) of (\d+)/i.exec(text || "");
    return m ? Math.min(1, (+m[1] - 0.5) / +m[2]) : null;
  };

  function current(now) {
    if (task) {
      const st = task.stages[task.i] || {};
      const before = task.stages.slice(0, task.i).reduce((s, x) => s + (x.weight ?? 1), 0);
      const total = task.stages.reduce((s, x) => s + (x.weight ?? 1), 0) || 1;
      const w = st.weight ?? 1;
      // inside a step: what the caller reported, or an estimate that eases
      // toward the end of the step and never claims it (the 0.92 cap)
      const inside = task.frac != null ? task.frac
        : st.estMs ? 0.92 * (1 - Math.exp(-(now - task.stageT0) / st.estMs)) : null;
      return {
        text: task.text, t0: task.t0,
        frac: inside == null && !st.estMs ? (before / total) : (before + w * (inside ?? 0)) / total,
        slide: inside == null && !st.estMs && before === 0,
      };
    }
    if (generic) return { text: generic.text, t0: generic.t0, frac: generic.frac, slide: generic.frac == null };
    return null;
  }

  function paint(el, c, now, failed) {
    const i = el.querySelector("i");
    el.classList.toggle("slide", !!c?.slide && !failed);
    el.classList.toggle("fail", !!failed);
    i.style.width = failed ? "100%" : c?.slide ? "" : `${Math.round(Math.max(0.03, c?.frac ?? 0) * 100)}%`;
  }

  function render() {
    const now = performance.now();
    const c = current(now);
    const shown = c && now - c.t0 >= delayMs;
    const secs = c ? Math.floor((now - c.t0) / 1000) : 0;
    const timeText = shown && secs >= 1 ? `${secs} s` : "";
    // in the editor's status line
    bar.hidden = !shown;
    if (shown) paint(bar, c, now, false);
    time.textContent = timeText;
    // the card, when the status line is out of sight (or for a failure)
    const offscreen = !isStatusVisible();
    if (failure && failure.until && now > failure.until) failure = null;
    if (failure && offscreen) {
      card.hidden = false;
      card.classList.add("failed");
      cardText.textContent = failure.text;
      cardTime.textContent = "";
      retryBtn.hidden = !failure.retry;
      if (actsFor !== failure) {
        actsFor = failure;
        acts.replaceChildren(...(failure.actions || []).map(({ label, run }) => {
          const b = document.createElement("button");
          b.className = "pc-retry";
          b.textContent = label;
          b.onclick = () => { failure = null; render(); run(); };
          return b;
        }));
      }
      closeBtn.hidden = false;
      paint(card.querySelector(".pbar"), null, now, true);
    } else if (shown && offscreen) {
      card.hidden = false;
      card.classList.remove("failed");
      cardText.textContent = c.text;
      cardTime.textContent = timeText;
      retryBtn.hidden = true; closeBtn.hidden = true;
      paint(card.querySelector(".pbar"), c, now, false);
    } else {
      card.hidden = true;
    }
    // a timer, not animation frames: those stop in a background tab, and
    // the seconds and the bar should still be right when someone looks back
    const live = !!c || (failure && offscreen);
    if (live && !timer) timer = setInterval(render, 250);
    else if (!live && timer) { clearInterval(timer); timer = 0; }
  }

  // ---- the status line's busy spells
  function noteStatus(cls, text) {
    if (cls === "busy") {
      if (!generic) generic = { t0: performance.now(), text, frac: null };
      generic.text = text;
      generic.frac = fracOfText(text);
    } else {
      generic = null;
      if (!task) time.textContent = "";
    }
    render();
  }

  // ---- a job that knows its steps
  function startTask(label, stages = [{ label }]) {
    const t0 = performance.now();
    failure = null;
    task = { label, stages, i: 0, t0, stageT0: t0, frac: null, text: label };
    const h = {
      // move to step i (or a named step), optionally with new wording
      step(i, { label: l } = {}) {
        if (task !== me) return h;
        if (typeof i === "string") i = Math.max(0, stages.findIndex((s) => s.label === i));
        task.i = Math.min(i, stages.length - 1);
        task.stageT0 = performance.now();
        task.frac = null;
        const st = stages[task.i];
        task.text = `${l || st.label}${stages.length > 1 ? ` (step ${task.i + 1} of ${stages.length})` : ""}`;
        say?.(task.text);
        render();
        return h;
      },
      // how far through the current step, 0..1, when the caller knows
      frac(f) { if (task === me) { task.frac = Math.max(0, Math.min(1, f)); render(); } return h; },
      done() { if (task === me) { task = null; render(); } },
      fail(text, { retry = null, actions = null, holdMs = 8000 } = {}) {
        if (task === me) task = null;
        failure = { text, retry, actions, until: retry || actions ? 0 : performance.now() + holdMs };
        render();
      },
    };
    const me = task;
    h.step(0);
    return h;
  }

  // run fn(handle) as a task: done on success, fail (and rethrow) on error
  async function run(label, stages, fn, { retry = null, failText = null } = {}) {
    const h = startTask(label, stages);
    try {
      const out = await fn(h);
      h.done();
      return out;
    } catch (e) {
      h.fail(failText ? failText(e) : `${label} failed: ${String(e?.message || e)}`, { retry });
      throw e;
    }
  }

  return { noteStatus, task: startTask, run, fail: (text, opts) => { failure = { text, retry: opts?.retry || null, until: opts?.retry ? 0 : performance.now() + (opts?.holdMs ?? 8000) }; render(); } };
}
