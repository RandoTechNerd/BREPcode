// Design mode, checked in a real (offscreen) Electron window. See
// design-check-run.cjs for what it does.
//
//   npm run serve                      (in another terminal; port 5320)
//   npx electron scripts/design-check.cjs [outDir]
//
// This file is only the guard. The check runs as Electron's MAIN process, and
// an error there (even a typo that stops the script loading) raises a modal
// "A JavaScript error occurred in the main process" dialog on the desktop and
// waits for someone to click it. Here every failure is printed, logged to
// design-check.log, and ends the run with exit code 1.

const path = require("node:path");
const fs = require("node:fs");
const LOG = path.join(__dirname, "..", "design-check.log");

function die(kind, e) {
  const msg = `  FAIL  ${kind}: ${e?.stack || e}`;
  console.error(msg);
  try { fs.appendFileSync(LOG, msg + "\n"); } catch { /* the console has it */ }
  try { require("electron").app.exit(1); } catch { /* not up yet */ }
  process.exit(1);
}
process.on("uncaughtException", (e) => die("uncaught", e));
process.on("unhandledRejection", (e) => die("unhandled rejection", e));

try {
  const done = require("./design-check-run.cjs");
  Promise.resolve(done).catch((e) => die("run", e));
} catch (e) {
  die("could not load design-check-run.cjs", e);
}
