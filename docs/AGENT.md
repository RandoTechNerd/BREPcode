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

**2. Point your Claude client at the MCP server.**

In this repo there is nothing to do: `.mcp.json` already registers it, so
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

`set_code` returns the state *after* the build, so `status.kind === "err"` is how
Claude finds out it wrote something that does not build — and the kernel's own
complaint comes back with it.

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
node test/mcp.js       # the MCP protocol alone, no Electron (part of `npm test`)
```

`test:agent` opens a **visible** window on purpose: `requestAnimationFrame` is
suspended in a hidden page, so the render loop never runs and a screenshot
proves nothing. Same lesson as `scripts/gizmo-check.cjs`.
