# Driving BREPcode from your own Claude

Type "make the wall 3 mm thicker" in Claude Code, watch the model change in the
BREPcode window in front of you. No copy, no paste, no second chat.

This is the opposite direction to the app's built-in chat. There (`desktop/claude.cjs`)
BREPcode calls out to your Claude Code install and pastes the reply into the editor.
Here, Claude calls in.

```
  your Claude session
        |  MCP over stdio
  agent/mcp-server.mjs
        |  HTTP on 127.0.0.1:5757
  desktop/bridge.cjs          (in the app's main process)
        |  executeJavaScript
  window.__brepAgent.run()    (in the page)
        |
  the same rebuild() your own typing goes through
```

That last line is the design rule. Nothing here pokes geometry directly:
`set_code` writes the editor and calls `rebuild()`, exactly as typing does. So a
change Claude makes and a change you make are the same event — one undo stack,
one recovery snapshot, one set of dials, and no second code path to keep in step
with the first. **You can Ctrl+Z anything Claude does.**

## Setup

**1. Start BREPcode.** In a dev build (`npm run desktop:build`) the bridge is
**on by default**, because a double-click has to be enough: the whole point is
that the model changes while you watch. **The public release download ships with
it off**, so start that one with `BREPcode.exe --agent` (or make a shortcut that
does).

To turn it off for a run:

```
BREPcode.exe --no-agent
```

or `BREPCODE_AGENT=0` in the environment. `--agent` / `BREPCODE_AGENT=1` force it
on. An argument beats the environment in both directions, so a shortcut can
override a machine-wide setting.

**If you distribute the exe, know what this means:** a build with the bridge on
opens a listening socket on 127.0.0.1 at startup. See the security note below.
The default is a build setting, `brepcodeAgentDefault` in package.json:
`npm run desktop:build:public` packages it off with no source change.

**2. Connect your AI: one click.** Open ⓘ About > Settings > **Connect your AI**
in the app. There is a button for each AI app that can run a local MCP server:

| app | config it writes | entry |
| --- | --- | --- |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers.brepcode` |
| Claude Code | `~/.claude.json` (user scope, every project) | `mcpServers.brepcode` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers.brepcode` |
| VS Code (Copilot agent mode) | `%APPDATA%\Code\User\mcp.json` | `servers.brepcode`, `type: "stdio"` |

(macOS uses `~/Library/Application Support/…` and Linux `~/.config/…` for the
first and last.) `desktop/aiconnect.cjs` does the writing, and it is built for
someone who will never open these files:

* **No Node needed.** If `node` is on PATH the entry runs it; if not, it runs
  BREPcode's own executable with `ELECTRON_RUN_AS_NODE=1`, which is a Node
  runtime. Either way the server is the same zero-dependency file.
* **The portable exe moves.** It unpacks to a new temp folder on every launch,
  so the entry points at a copy of `mcp-server.mjs` in BREPcode's own app-data
  folder, refreshed on every start, and an entry whose command has gone (the
  exe moved, node was uninstalled) is re-pointed at start-up. Only entries the
  app wrote are ever touched.
* **Your file is yours.** Every other key and server in it is kept, the
  previous file is saved beside it as `.bak-brepcode`, and the write is a temp
  file plus a rename. A file it cannot parse (VS Code allows comments) is left
  exactly as it was, with a pointer to **Copy config**, which puts the entry on
  the clipboard to paste in yourself.

Each row shows **not set up**, **set up** (the entry is in the file) or
**connected** in green: an MCP server started by that app has said hello to
the bridge in the last minute. The server says hello when its client
connects and every 20 s after (`POST /hello`), naming the app from the
`BREPCODE_CLIENT` in the entry, or guessing it from the client's own name for a
hand-written config. **Remove** takes the brepcode entry back out.

**ChatGPT cannot do this.** Neither the ChatGPT app nor chatgpt.com can start
a local MCP server, so there is nothing on this machine for it to connect to:
OpenAI's MCP support is for remote servers on the public internet, and the
bridge is loopback-only by design. To use an OpenAI model with BREPcode, use
the app's built-in assistant with an OpenAI key (`desktop/aiproxy.cjs` relays
it), or one of the clients above that lets you pick an OpenAI model (Cursor,
VS Code).

**By hand.** In this repo there is nothing to do: `.mcp.json` already registers it, so
`claude` started here picks it up.

Anywhere else — or for Claude Desktop — add it by absolute path. In an installed
build the file ships at `resources\agent\mcp-server.mjs` beside `BREPcode.exe`:

```json
{
  "mcpServers": {
    "brepcode": {
      "command": "node",
      "args": ["C:\\path\\to\\BREPcode\\resources\\agent\\mcp-server.mjs"]
    }
  }
}
```

MCP clients launch that file with their own `node`, so Node must be on your PATH.
That is also why the server ships as a real file rather than inside the asar —
nothing can spawn a script out of an archive.

## The tools

| tool | what it does |
| --- | --- |
| `get_state` | the editor's code, model name, build status and message, size in mm, the named dials |
| `set_code` | replace the editor and build it — the main one |
| `build` | rebuild what is there now, after *you* have typed |
| `set_param` | turn one named dial and rebuild, without rewriting the source |
| `set_view` | point the camera at a named angle before a picture |
| `fit` | frame the model when it has grown out of the view |
| `screenshot` | a PNG of your window, so Claude can see what you see |
| `save_stl` | write the built mesh to a path |
| `catalog_find` | ask the app's catalog of 200+ tested designs for a plain-words request; `apply: true` puts it on screen |
| `catalog_list` | what the catalog covers, all of it or one category |
| `check_fit` | for an `assembly()`: intersect every pair of placed parts, report each overlap by part name in mm³, paint it red |
| `export_parts` | for an `assembly()`: one STL per part in print pose on the bed, `parts.csv`, a true-curve STEP per part when the exact lane built it; to a folder or a `.zip` |
| `render` | a product shot of the view: white studio, floor shadow, `studio`/`metal`/`copper`/`matte`, optional `cutaway` wedge; returns the PNG and can save it |
| `explode` | slide an assembly's parts apart on screen, 0 to 1 |

`set_code` returns the state *after* the build, so `status.kind === "err"` is how
Claude finds out it wrote something that does not build — and the kernel's own
complaint comes back with it.

`catalog_find` is the shortcut for common things. "A phone stand for my iPhone
16" is a design the app already has, tested to print without supports and
with every size a slider, so Claude is told to ask the catalog first and only
write a part itself when the catalog has nothing. A catalog model's code
starts with a header line (`From the BREPcode catalog: phone-stand.`) and one
`const` per dial; Claude keeps those lines when it edits the model, so your own
chat follow-ups ("wider", "for a Pixel 9") keep working afterwards.

## Assemblies: multi-part projects

A printed machine is several parts, each printed on its own and put together.
`assembly()` (src/assembly.js) says so:

```js
return assembly({
  housing:  { shape: housing(), color: "#8a8f98", finish: "aluminium" },
  coil_pod: { shape: coilPod(), color: "#c8702a", finish: "copper", count: 12,
              place: polar(12, { at: [45, 0, 28], rotate: [90, -90, 0] }) },
});
```

Each part is drawn in the frame it **prints** in. `place` moves its copies to
where they sit in the finished thing (`polar(n, …)`, an array, a function
`(shape, i) => translate(…, rotate(…, shape))`, or `{ translate, rotate }`; a
place that changes the part instead of moving it is refused). `print` turns it
for the bed: `"asis"`, `"flip"`, `"side"`, `"placed"` or `[rx, ry, rz]`.
`finish` is the product-shot material and `explode` an optional direction in
the part's own frame. Inside a part, `fillet({ edges: "z" })` and friends mean
the part's own z, so a pod rotated onto its spoke rounds the same edges as the
one lying on the bed.

It compiles to a plain `group()` of transformed parts, so the per-part
parallel build (`src/partsplit.js`) builds the copies side by side on the
native kernel pool. compile() records which features each copy emitted, and
that is how a face on screen or a solid in the STL becomes "coil_pod #7". In
the app a **Parts** button appears beside Parameters: the parts list, an
explode slider, **Check fit**, **Export parts** (a zip) and **Product shot**.
The MCP tools above call the same functions.

`examples/printmotor-assembly.js` is the worked case: the whole PrintMotor
(housing, yoke, tooth star, twelve coil pods, rotor, shaft, spacer, busbar
crown, three terminal lugs, lid and output hub; 24 pieces). The lid and crown
print flipped and the pods and lugs are placed from their print frames.
`examples/printmotor-pods.js` is the housing and pods alone, matching the
original Python parts' sizes exactly and their volumes to within 0.1%;
`npm run test:assembly` builds that one in a real window and drives every
button and tool, including a deliberate clash between neighbouring pods.

`examples/printmotor-hairpin.js` is PrintMotor C: a 36-slot hairpin stator (two
crown rings of tube() bars plus a weld ring) around a 32-segment Halbach rotor,
45 pieces. The copper parts and the housing (helical coolant groove) build on the
mesh lane; its fit check takes about 15 minutes with 164k triangles.

## Ports and other apps

Default `5757`, override with `BREPCODE_AGENT_PORT` (the app and the MCP server
must agree). The listener is bound to `127.0.0.1` and every request is
re-checked against its remote address, because binding alone has been wrong
before on machines with unusual interfaces.

There is no auth beyond that, and that is deliberate: the bridge grants exactly
what a local user can already do by typing in the app's own editor. The actions
are a fixed allowlist inside the page — there is no "evaluate this" action — so
it cannot be turned into a way to run arbitrary code on the machine.

That reasoning is what makes on-by-default defensible, and it is worth stating
the limit of it. Any process on the machine can reach a loopback port, so on a
shared or multi-user box the bridge is reachable by anything already running as
any local user. It cannot read files or run commands, but it can rewrite the
model in your editor and read it back. If that is not a trade you want on a
particular machine, start it with `--no-agent`.

## When it does not work

`ping` reports the **build stamp**, not just the version number. That is on
purpose: "is the running exe the one I just built?" is the first question every
bridge session needs answered, and a v-number cannot answer it because two
builds share it. `curl http://127.0.0.1:5757/ping` and compare with ⓘ About.

* **"BREPcode is not reachable"** — almost always the app is just closed. Open
  it. If it *is* open, it was started with `--no-agent`, or it is an older build.
* **"this BREPcode build has no agent surface"** — the app is running, but it is
  an older exe built before the bridge existed. Windows fronts an already-running
  BREPcode when you launch a new one, so check you are not looking at the old build.
* **`EADDRINUSE` in the app's console** — something else has 5757.

## Testing it

```
npm run test:agent     # real window, real builds, 20 checks end to end
npm run test:assembly  # the PrintMotor assembly: build, explode, fit, export, render, Connect; GUI and MCP
node test/assembly.js  # assembly(), the fit check and print pose on the real kernel (in `npm test`)
node test/aiconnect.js # the four config writers against a throwaway home (in `npm test`)
node test/mcp.js       # the MCP protocol alone, no Electron (part of `npm test`)
```

`test:agent` opens a **visible** window on purpose: `requestAnimationFrame` is
suspended in a hidden page, so the render loop never runs and a screenshot
proves nothing. Same lesson as `scripts/gizmo-check.cjs`.
