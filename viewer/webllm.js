// A real LLM running IN the browser — no key, no install, no server.
//
// Backed by WebLLM (MLC-AI, Apache-2.0): models compiled for WebGPU, weights
// pulled from HuggingFace on the user's explicit request and cached by the
// browser (Cache API), so the download happens once. After that the chatbot is
// fully client-side — nothing typed here leaves the machine.
//
// Deliberately load-on-request: the smallest useful model is ~1 GB. Nothing in
// this module runs until the user presses Load; the module itself is only
// imported when the "browser" provider is selected.
//
// NB build-site.mjs rewrites the /node_modules path below for the static site.

// Curated, not exhaustive: Qwen2.5-Coder is the family that actually writes
// working OpenSCAD-style code at these sizes. Sizes are the real quantized
// weight downloads; vram is what WebLLM declares it needs on the GPU.
export const BROWSER_MODELS = [
  { id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 Coder 1.5B", dlMB: 950, vramMB: 1630 },
  { id: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5 Coder 3B", dlMB: 1750, vramMB: 2505 },
  { id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC", label: "Qwen2.5 Coder 7B", dlMB: 4100, vramMB: 5107 },
  { id: "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 Coder 0.5B", dlMB: 330, vramMB: 945 },
];
export const browserModelInfo = (id) => BROWSER_MODELS.find((m) => m.id === id) || null;

// WebGPU is the hard requirement. navigator.gpu existing is not enough — an
// adapter can still be refused (blocklisted driver, software renderer) — so
// really ask for one.
export async function webgpuInfo() {
  if (!navigator.gpu) {
    return { ok: false, why: "this browser has no WebGPU — Chrome/Edge on desktop have it; Firefox and Safari are getting there" };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, why: "WebGPU is present but no usable GPU adapter answered (driver blocklist or software rendering)" };
    return { ok: true };
  } catch (e) {
    return { ok: false, why: `WebGPU adapter request failed: ${String(e?.message || e).slice(0, 80)}` };
  }
}

let webllmMod = null;
const getWebLLM = async () =>
  (webllmMod ??= await import("/node_modules/@mlc-ai/web-llm/lib/index.js"));

// One engine, one loaded model. Switching models reloads in place — WebLLM
// frees the old weights first, so VRAM doesn't double up.
let engine = null;
let loadedModel = null;
let loading = null;      // in-flight load promise, so double-clicks don't race

export const loadedBrowserModel = () => loadedModel;

// onProgress({ pct, text }) — pct is 0..100 or null while it can't be known.
export async function loadBrowserModel(model, onProgress) {
  if (loadedModel === model && engine) return engine;
  if (loading) await loading.catch(() => { /* previous attempt failed — retry */ });
  if (loadedModel === model && engine) return engine;

  loading = (async () => {
    const gpu = await webgpuInfo();
    if (!gpu.ok) throw new Error(gpu.why);
    const webllm = await getWebLLM();
    const cb = (p) => {
      if (!onProgress) return;
      const pct = typeof p?.progress === "number" ? Math.round(p.progress * 100) : null;
      onProgress({ pct, text: String(p?.text || "").slice(0, 140) });
    };
    // 8K context instead of the prebuilt 4K. The default overflowed on real
    // use — mission + the current model's code + a few turns of history came
    // to ~6k tokens and the whole request errored. The KV cache grows with
    // the window (~+250MB on the 7B, less on the small ones), which is the
    // right trade against "can't discuss the model that's on screen".
    const chatOpts = { context_window_size: 8192 };
    if (engine) {
      engine.setInitProgressCallback?.(cb);
      await engine.reload(model, chatOpts);
    } else {
      engine = await webllm.CreateMLCEngine(model, { initProgressCallback: cb }, chatOpts);
    }
    // The FIRST generation after a load builds the GPU pipelines: 31 s on an
    // integrated GPU for the 1.5B, then under a second a reply. Paid here,
    // under the progress bar the user is already watching, rather than on
    // their first message, where it looked like the model had hung.
    onProgress?.({ pct: 100, text: "Warming up the model on your GPU (once per load)…" });
    await engine.chat.completions.create({
      stream: false, max_tokens: 1, ...noThinking(model),
      messages: [{ role: "user", content: "hi" }],
    });
    loadedModel = model;
    return engine;
  })();
  try {
    return await loading;
  } catch (e) {
    // a failed load must not leave a half-initialised engine looking loaded
    loadedModel = null;
    throw e;
  } finally {
    loading = null;
  }
}

// Qwen3-family models think out loud before answering unless told not to: a
// few hundred hidden tokens on every reply, at 10-30 tokens a second. The
// code-CAD replies here gain nothing from it, so it is off.
const thinks = (model) => /^qwen3/i.test(model);
const noThinking = (model) => (thinks(model) ? { extra_body: { enable_thinking: false } } : {});
// an opening fence, its code, and the closing fence on a line of its own
const FENCE_DONE = /```[\w-]*\n[\s\S]*?\n```(?:\s*\n|\s*$)/;
// Sixteen finished lines in a row that are the same once their numbers are
// ignored ("translate([10, 80, -1], ..." then "[10, 120, -1]"): a loop. Real
// code repeats a line a handful of times (four corner holes, a row of eight),
// and a bigger pattern is a loop in the code, not sixteen lines of it.
export function looping(text, run = 16) {
  const lines = String(text).split("\n").slice(0, -1).map((l) => l.trim().replace(/-?\d+(\.\d+)?/g, "#")).filter(Boolean);
  if (lines.length < run) return false;
  const tail = lines.slice(-run);
  return tail[0].length > 6 && tail.every((l) => l === tail[0]);
}

// The chat call, OpenAI-shaped like the local provider. Streams so the UI can
// show characters arriving; returns the final text.
//   grammar: an EBNF the reply must follow (WebLLM's xgrammar), e.g. the
//            one-sentence-then-one-fence shape in chatbot.js REPLY_GRAMMAR
//   prior:   example turns sent before the conversation, [{ role, text }]
export async function browserChat({ model, system, messages, onDelta, grammar = null, prior = [] }) {
  const eng = await loadBrowserModel(model, null);   // no-op when already loaded
  const chunks = await eng.chat.completions.create({
    stream: true,
    ...noThinking(model),
    // small models ramble; a temperature nudge keeps the code deterministic-ish
    temperature: 0.3,
    // A complete BREPcode model is rarely 800 tokens; 2000 leaves generous
    // room while halving the worst case — the 0.5B once spent 4+ minutes
    // free-associating its way to a 3000-token cap at ~20 tokens/s.
    max_tokens: 2000,
    ...(grammar ? { response_format: { type: "grammar", grammar } } : {}),
    messages: [
      { role: "system", content: system },
      ...[...prior, ...messages].map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text,
      })),
    ],
  });
  let text = "";
  for await (const chunk of chunks) {
    const delta = chunk?.choices?.[0]?.delta?.content || "";
    if (delta) {
      text += delta;
      onDelta?.({ phase: /```/.test(text) ? "writing" : "thinking", chars: text.length });
      // The reply is done when its code block closes: every harness here
      // asks for nothing after the fence, and what small models write there
      // anyway (the same model again, a tutorial, the request back) is all
      // waiting. At 11-16 tokens a second on an integrated GPU the 1.5B ran
      // on to its 2000-token cap, two minutes a reply.
      if (FENCE_DONE.test(text)) { engine.interruptGenerate?.(); break; }
      // ...and it is stuck when it writes the same line over and over: the
      // 1.5B, asked for two holes an arm, wrote the same translate() line to
      // y = 800 mm and on until the cap. Nothing after that point is a model.
      // Stopping at 16 saves about 1,500 tokens, a minute and a half here.
      if (delta.includes("\n") && looping(text)) {
        engine.interruptGenerate?.();
        throw new Error("the in-browser model got stuck repeating one line. Try sending it again, or pick a bigger model in ⚙");
      }
    }
  }
  if (!text.trim()) throw new Error("the in-browser model returned nothing — try re-sending, or a bigger model");
  return text;
}

// One short answer held to a JSON schema by WebLLM's grammar: the model
// cannot reply with anything the schema does not allow, so a one-word choice
// from a list comes back as exactly that. Used by viewer/catalogroute.js.
// Only for a model that is already loaded: a choice is never worth a download.
// maxTokens: a few names fit in 40; a filled form of six numbers did not,
// and a JSON cut off mid-field reads as no answer at all.
export async function browserPick({ model, system, user, schema, maxTokens = 40 }) {
  if (loadedModel !== model || !engine) throw new Error("the in-browser model is not loaded");
  const r = await engine.chat.completions.create({
    stream: false,
    ...noThinking(model),
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: "json_object", schema: JSON.stringify(schema) },
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  return r?.choices?.[0]?.message?.content || "";
}

// Free the GPU. The downloaded weights stay in the browser cache, so loading
// again later skips the download.
export async function unloadBrowserModel() {
  if (!engine) return;
  try { await engine.unload(); } catch { /* already gone */ }
  engine = null;
  loadedModel = null;
}
