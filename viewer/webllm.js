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
    if (engine) {
      engine.setInitProgressCallback?.(cb);
      await engine.reload(model);
    } else {
      engine = await webllm.CreateMLCEngine(model, { initProgressCallback: cb });
    }
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

// The chat call, OpenAI-shaped like the local provider. Streams so the UI can
// show characters arriving; returns the final text.
export async function browserChat({ model, system, messages, onDelta }) {
  const eng = await loadBrowserModel(model, null);   // no-op when already loaded
  const chunks = await eng.chat.completions.create({
    stream: true,
    // small models ramble; a temperature nudge keeps the code deterministic-ish
    temperature: 0.3,
    max_tokens: 3000,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({
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
    }
  }
  if (!text.trim()) throw new Error("the in-browser model returned nothing — try re-sending, or a bigger model");
  return text;
}

// Free the GPU. The downloaded weights stay in the browser cache, so loading
// again later skips the download.
export async function unloadBrowserModel() {
  if (!engine) return;
  try { await engine.unload(); } catch { /* already gone */ }
  engine = null;
  loadedModel = null;
}
