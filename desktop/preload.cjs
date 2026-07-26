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
});
