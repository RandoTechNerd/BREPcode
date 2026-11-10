// The desktop relay, streamed.
//
// The desktop app sends every provider request through its main process, and
// for a long time that meant a finished body or nothing: no thinking on screen,
// no Stop, and a request that failed outright when a deep model took more than
// five minutes to answer. Claude's requests now stream through it. This runs the
// real relay against a server on this machine, the one place plain http is
// allowed.

import http from "node:http";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readClaudeStream, extractApiText, extractApiThinking } from "../viewer/chatbot.js";

const { relayStream, stopStream, checkUrl } = createRequire(import.meta.url)("../desktop/aiproxy.cjs");

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const EVENTS = [
  { type: "message_start", message: { id: "msg_1", role: "assistant" } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "A plate with one hole. " } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Cut it with a cylinder." } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "return difference(cube([40, 30, 10]), " } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "cylinder({ r: 3, h: 10 }));" } },
  { type: "content_block_stop", index: 1 },
  { type: "message_delta", delta: { stop_reason: "end_turn" } },
  { type: "message_stop" },
];

let seenBody = null, seenHeaders = null, slowOpen = 0;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => { body += d; });
  req.on("end", async () => {
    seenBody = body; seenHeaders = req.headers;
    if (req.url === "/plain") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid x-api-key" } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (req.url === "/slow") {
      slowOpen++;
      res.on("close", () => { slowOpen--; });
      res.write(`event: ping\ndata: {"type":"ping"}\n\n`);
      return;                           // and then nothing, like a long think
    }
    for (const ev of EVENTS) {
      // split mid-event on purpose: a chunk boundary is not an event boundary
      const line = `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
      res.write(line.slice(0, 9));
      await wait(5);
      res.write(line.slice(9));
    }
    res.end();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// What the page does with the pieces: a reader the stream parsers can use.
function collect() {
  const queue = [];
  let ended = false, error = null, wake = null;
  const send = (_id, kind, data) => {
    if (kind === "chunk") queue.push(data); else { ended = true; error = data; }
    const w = wake; wake = null; w?.();
  };
  const reader = { async read() {
    for (;;) {
      if (queue.length) return { done: false, value: new TextEncoder().encode(queue.shift()) };
      if (error) throw new Error(error);
      if (ended) return { done: true };
      await new Promise((r) => { wake = r; });
    }
  } };
  return { send, reader, state: () => ({ ended, error, pieces: queue.length }) };
}

console.log("\na streamed reply arrives in pieces and reads back whole\n");
{
  const c = collect();
  const head = await relayStream({ id: "t1", url: `${base}/v1/messages`, method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "k", "x-evil": "1" },
    body: JSON.stringify({ stream: true }) }, c.send);
  check("the head comes back first, with the status and the content type",
    head.ok && head.status === 200 && /text\/event-stream/.test(head.contentType), JSON.stringify(head));
  const phases = [];
  const json = await readClaudeStream({ body: { getReader: () => c.reader } }, (p) => phases.push(p.phase));
  check("the reply text is whole, across chunks cut mid-event",
    extractApiText("claude", json) === "return difference(cube([40, 30, 10]), cylinder({ r: 3, h: 10 }));", extractApiText("claude", json));
  check("...and so is the thinking", extractApiThinking("claude", json) === "A plate with one hole. Cut it with a cylinder.");
  check("...progress was reported while it streamed", phases.includes("thinking") && phases.includes("writing"));
  check("...and it ended for the reason the model gave", json.stop_reason === "end_turn");
  check("the request went out as sent", seenBody === '{"stream":true}' && seenHeaders["x-api-key"] === "k");
  check("...minus any header an AI call has no use for", !("x-evil" in seenHeaders));
}

console.log("\nan error is still an answer\n");
{
  const c = collect();
  const head = await relayStream({ id: "t2", url: `${base}/plain`, method: "POST", body: "{}" }, c.send);
  let text = "";
  for (;;) { const { done, value } = await c.reader.read(); if (done) break; text += new TextDecoder().decode(value); }
  check("a 401 comes back as a 401 with its body", !head.ok && head.status === 401 && /invalid x-api-key/.test(text), text);
  check("...as JSON, so the page reads it the ordinary way", /application\/json/.test(head.contentType));
}

console.log("\nStop reaches a reply that is still thinking\n");
{
  const c = collect();
  const head = await relayStream({ id: "t3", url: `${base}/slow`, method: "POST", body: "{}" }, c.send);
  await wait(60);
  check("the slow reply is open", head.ok && slowOpen === 1, String(slowOpen));
  stopStream("t3");
  await wait(120);
  check("stopping it ends the stream on our side", c.state().ended && c.state().error === "stopped", JSON.stringify(c.state()));
  check("...and closes the connection, so nothing is left running", slowOpen === 0, String(slowOpen));
  stopStream("t3");                     // twice, and for an id that never was: harmless
  stopStream("nope");
  check("stopping again is harmless", true);
}

console.log("\nit is the same narrow errand as before\n");
{
  const refuse = async (req) => { try { await relayStream(req, () => {}); return null; } catch (e) { return String(e.message); } };
  check("a host off the allowlist is refused", /host not allowed/.test(await refuse({ id: "a", url: "https://example.com/x" }) || ""));
  check("plain http is refused anywhere but this machine", /HTTPS only/.test(await refuse({ id: "b", url: "http://example.com/x" }) || ""));
  check("only GET and POST", /method not allowed/.test(await refuse({ id: "c", url: `${base}/plain`, method: "DELETE" }) || ""));
  check("an id is a short plain token", /bad stream id/.test(await refuse({ id: "../../x y", url: `${base}/plain` }) || ""));
  check("Anthropic's host is on the list", !!checkUrl("https://api.anthropic.com/v1/messages"));

  const PRELOAD = readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  check("the preload exposes the stream and the stop", /aiRelayStream: async \(req, onChunk, onEnd\)/.test(PRELOAD)
    && /aiRelayAbort: \(id\) => ipcRenderer\.send\("ai:relayAbort"/.test(PRELOAD));
  check("the page uses it for a request that asks to stream",
    /if \(isDesktop && canRelayStream && typeof options\.body === "string" && \/"stream":true\/\.test\(options\.body\)\)/.test(HTML));
  check("...and Stop is wired to it", /window\.brepcodeDesktop\.aiRelayAbort\(id\);/.test(HTML));
}

server.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
