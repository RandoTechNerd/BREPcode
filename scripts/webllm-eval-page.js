// Runs scripts/webllm-eval.json through the in-browser model the way the chat
// does for a new request on the starter cube, untouched mission, and returns
// each request's path and code for scripts/webllm-eval-check.mjs to build.
//
// In the viewer page (the dev server, WebGPU, a model cached):
//   const E = await import("/scripts/webllm-eval-page.js");
//   const out = await E.runEval({ model: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC" });
//   copy(JSON.stringify(out))     // -> a file, then: node scripts/webllm-eval-check.mjs that-file
//
// The order mirrors index.html: the catalog by its own words, then the model
// names it (a catalog design), then a plain-part template, then the catalog's
// own guess, then the model writes code. `codeOnly: true` skips straight to
// the code pass, for tuning the code harness on its own. `set: "webllm-eval-heldout.json"`
// runs the held-out requests instead.

const STARTER = "difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),\n)";
const v = `?v=${Date.now()}`;

export async function runEval({ model, codeOnly = false, only = null, label = model, onRow = null, set: setName = "webllm-eval.json" } = {}) {
  const [W, CHAT, R, P, REC] = await Promise.all([
    import(`/viewer/webllm.js${v}`), import(`/viewer/chatbot.js${v}`), import(`/viewer/catalogroute.js${v}`),
    import(`/viewer/browserparts.js${v}`), import(`/viewer/recipes.js${v}`),
  ]);
  const set = (await (await fetch(`/scripts/${setName}${v}`)).json()).requests;
  await W.loadBrowserModel(model, null);
  const ask = (q) => W.browserPick({ model, ...q });
  const rows = [];
  for (const [i, { text }] of set.entries()) {
    if (only && !only.includes(i)) continue;
    const t0 = performance.now();
    const row = { i, text, path: null, code: null, note: "" };
    try {
      if (!codeOnly) {
        const local = CHAT.respond(text, {}, STARTER);
        let guess = null;
        if (local.fromCatalog && local.code !== undefined) Object.assign(row, { path: "catalog", code: local.code });
        else if (local.fromCatalog && local.guess) guess = local;
        else if (local.fromCatalog && !local.cantDo) Object.assign(row, { path: "catalog-question", note: local.reply.slice(0, 80) });
        if (!row.path) {
          // as index.html: a part the request names, a catalog design by the
          // model's names, a part by its names, the catalog's guess
          let part = P.templateFor(text) ? await P.fillTemplate(text, [], ask) : null;
          if (!part) {
            const names = await R.nameRequest(text, ask);
            row.note = names.join(" / ");
            const pick = R.routeNames(names);
            const handed = pick && CHAT.respond(R.catalogPhrase(pick.family, text), {}, STARTER);
            if (handed && R.pickedFamilyOf(handed.code) === pick.family.id) Object.assign(row, { path: `route:${pick.family.id}`, code: handed.code });
            else part = await P.fillTemplate(text, names, ask);
          }
          if (part) Object.assign(row, { path: `template:${part.template.id}`, code: part.code, note: `${row.note} | ${JSON.stringify(part.values)}` });
          else if (!row.path && guess && !CHAT.sizedRequest(text)) Object.assign(row, { path: "guess", note: guess.chips?.join(", ") });
        }
      }
      if (!row.path) {
        let reference = "";
        try { reference = (await REC.referenceFor(text, { code: STARTER })).text || ""; } catch { /* as the app: a miss costs nothing */ }
        const system = CHAT.composeSystem({ reference: reference.slice(0, 1500), harness: CHAT.browserMission({ code: STARTER }), botName: "", gem: "", context: { text } });
        const answer = await W.browserChat({ model, system, messages: [{ role: "user", text }], grammar: CHAT.REPLY_GRAMMAR, prior: CHAT.pickBrowserExample(text) });
        const fence = /```[\w]*\n([\s\S]*?)```/.exec(CHAT.mendReply(answer));   // as index.html
        if (CHAT.copiesExample(answer)) Object.assign(row, { path: "code:example", note: "handed the example back" });
        else Object.assign(row, { path: "code", code: fence ? fence[1] : null, note: answer.split("\n")[0].slice(0, 100) });
      }
    } catch (e) {
      Object.assign(row, { path: row.path || "error", note: String(e?.message || e).slice(0, 120) });
    }
    row.ms = Math.round(performance.now() - t0);
    rows.push(row);
    onRow?.(row, rows.length);
  }
  return { [label]: rows };
}
