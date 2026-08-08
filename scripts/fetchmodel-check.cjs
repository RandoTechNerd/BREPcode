// The brakes on the one-click download. The URL comes from a language model's
// output, so this checks what gets refused, not what gets through.
const { app } = require("electron");
let pass = 0, fail = 0;
const check = (l, ok, d = "") => { ok ? (pass++, console.log("  PASS  " + l))
  : (fail++, console.log("  FAIL  " + l + (d ? "  — " + d : ""))); };

app.whenReady().then(async () => {
  const { checkUrl, MAX_BYTES } = require("../desktop/fetchmodel.cjs");
  check("an https model file is allowed", checkUrl("https://x.com/part.stl").ok);
  check("...and a .3mf with a query", checkUrl("https://x.com/p.3mf?dl=1").ok);
  for (const [u, why] of [
    ["file:///C:/Windows/win.ini", "file scheme"],
    ["data:text/html,<script>", "data scheme"],
    ["javascript:alert(1)", "javascript scheme"],
    ["https://x.com/part.zip", "a zip could hold anything"],
    ["https://x.com/part.gcode", "already sliced for another machine"],
    ["https://x.com/setup.exe", "an executable"],
    ["https://x.com/page", "not a file at all"],
    ["nonsense", "not a URL"],
  ]) check(`refused: ${why}`, checkUrl(u).ok === false, u);
  check("the refusal says why", /model file/.test(checkUrl("https://x.com/a.zip").error || ""),
    checkUrl("https://x.com/a.zip").error);
  check("there is a size ceiling", MAX_BYTES === 100 * 1024 * 1024);
  console.log(`\n${pass} passed, ${fail} failed\n`);
  app.exit(fail ? 1 : 0);
});
