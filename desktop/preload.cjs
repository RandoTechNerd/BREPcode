// The only thing the page can reach in the main process.
//
// Kept deliberately narrow: four named calls, no generic "invoke whatever you
// like" escape hatch, because the page runs model code and, if the user turns
// on the chat, text written by an AI. Nothing here can read a file, run a
// command, or open a socket to an address the page chose.
//
// Note what is NOT on this bridge: any way to READ the saved password. The page
// sends it once when the user saves it and never sees it again — sendMail()
// takes a recipient and attachments, and the main process supplies the
// credentials itself.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("brepcodeDesktop", {
  // marks the desktop build, so the web bundle can keep its mailto fallback
  isDesktop: true,

  // { host, port, user, pass, from } -> { ok } | { ok:false, error }
  saveMail: (cfg) => ipcRenderer.invoke("mail:save", cfg),

  // everything except the password, so the form can be repopulated
  loadMail: () => ipcRenderer.invoke("mail:load"),

  // opens a connection and authenticates, sending nothing
  testMail: () => ipcRenderer.invoke("mail:test"),

  // { to, subject, text, attachments:[{ filename, contentBase64 }] }
  sendMail: (msg) => ipcRenderer.invoke("mail:send", msg),

  // Crash recovery. Snapshots live in a folder of our own under the OS temp
  // directory; recoveryRead refuses any path outside it, so this cannot be
  // turned into "read any file on this machine".
  recoverySave: (name, text) => ipcRenderer.invoke("recovery:save", { name, text }),
  recoveryList: () => ipcRenderer.invoke("recovery:list"),
  recoveryRead: (file) => ipcRenderer.invoke("recovery:read", file),
  recoveryReveal: () => ipcRenderer.invoke("recovery:reveal"),

  // Which slicer is installed, and what version — the renderer asks BEFORE
  // exporting so it can stamp the right version into the 3MF it is about to
  // build, which is what stops OrcaSlicer showing its "old version" dialog.
  slicerInfo: () => ipcRenderer.invoke("slicer:info"),
  openInSlicer: (name, base64) => ipcRenderer.invoke("slicer:open", { name, base64 }),

  // Chat through the user's own Claude Code install — their subscription, no
  // key. Detection only says whether it exists; ask() streams nothing back to
  // the page except the finished reply.
  claudeInfo: () => ipcRenderer.invoke("claude:info"),
  claudeAsk: (opts) => ipcRenderer.invoke("claude:ask", opts),
  claudeSaveImage: (ext, base64) => ipcRenderer.invoke("claude:saveImage", { ext, base64 }),

  // A file the OS handed us: double-clicked in Explorer, or dropped on the app.
  // The page registers a callback and gets { name, text } for each one.
  onOpenFile: (cb) => ipcRenderer.on("open-file", (_e, payload) => cb(payload)),
});
