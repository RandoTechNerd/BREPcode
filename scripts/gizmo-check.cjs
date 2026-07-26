// Drive the view gizmo in a real, VISIBLE Electron window and report where the
// camera ends up.
//
//   npx electron scripts/gizmo-check.cjs
//
// A visible window matters: requestAnimationFrame is suspended in a hidden or
// backgrounded page, so the render loop never runs, the camera never updates
// and every control looks broken. That is an artefact of the harness, not the
// app — this script exists so the difference is never guessed at again.

const { app } = require("electron");
const shellApp = require("../desktop/main.cjs");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

app.whenReady().then(async () => {
  shellApp.serveBundle();
  const win = shellApp.createWindow();          // visible, so rAF actually runs
  const run = (js) => win.webContents.executeJavaScript(js, true);

  for (let i = 0; i < 160; i++) {
    try { if (await run("!!document.getElementById('code')")) break; } catch {}
    await wait(250);
  }
  await wait(3500);

  // The gizmo's own zone classes are the readout: they are computed from the
  // camera every frame, so they say where it actually is.
  const zone = () => run(`(() => {
    const nav = document.getElementById("viewnav");
    const f = [...nav.querySelectorAll(".vn-face")].map(x =>
      x.dataset.view + ":" + ((x.className.baseVal||"").replace("vn-face","").trim() || "-")).join(" ");
    const e = [...nav.querySelectorAll("line.vn-edge")]
      .filter(x => x.style.opacity && x.style.opacity !== "0")
      .map(x => x.id.replace("vn-edge-","")).join(",") || "-";
    const d = nav.querySelector("#vn-dot").style.opacity !== "0" ? "DOT" : "-";
    return f + " | " + e + " | " + d;
  })()`);
  const click = async (sel, n = 1, gap = 700) => {
    for (let i = 0; i < n; i++) {
      await run(`document.querySelector('#viewnav ${sel}').dispatchEvent(new MouseEvent("click", { bubbles: true }))`);
      await wait(gap);
    }
    await wait(1800);
    return zone();
  };

  try {
    console.log("\nstartup:", await zone());

    // --- faces: one axis, full strength, no edge, no dot ---------------------
    check("Z face -> top alone",   /top:lit-1/.test(await click('.vn-face[data-view="top"]')));
    check("Y face -> front alone", /front:lit-1/.test(await click('.vn-face[data-view="front"]')));
    check("X face -> right alone", /right:lit-1/.test(await click('.vn-face[data-view="right"]')));

    // --- edges: two axes at half, the shared edge lit, no dot ----------------
    let z = await click('circle[data-view="edge-zx"]');
    check("Z-X edge -> both faces + that edge", /top:lit-2/.test(z) && /right:lit-2/.test(z) && /\| zx \|/.test(z), z);
    z = await click('circle[data-view="edge-zy"]');
    check("Z-Y edge -> both faces + that edge", /top:lit-2/.test(z) && /front:lit-2/.test(z) && /\| zy \|/.test(z), z);
    z = await click('circle[data-view="edge-xy"]');
    check("X-Y edge -> both faces + that edge", /front:lit-2/.test(z) && /right:lit-2/.test(z) && /\| xy \|/.test(z), z);

    // --- corner: all three faint, dot on ------------------------------------
    z = await click('circle[data-view="corner"]');
    check("corner -> all three + dot",
      /top:lit-3/.test(z) && /front:lit-3/.test(z) && /right:lit-3/.test(z) && /DOT/.test(z), z);

    // --- up arrow loops over the pole instead of stopping short --------------
    await click('.vn-face[data-view="front"]');
    const seen = [];
    for (let i = 0; i < 8; i++) seen.push(await click('.vn-arrow [data-view="up"]'));
    check("up cycles right over the top and back round",
      new Set(seen).size >= 4 && /top:lit-1/.test(seen.join("|")),
      seen.map((s) => s.split(" | ")[0]).join("  ///  "));
    check("...and returns to where it started after 8 steps of 45",
      /front:lit-1/.test(seen[seen.length - 1]), seen[seen.length - 1]);

    // --- double-tap an arrow = straight to the far side ----------------------
    await click('.vn-face[data-view="front"]');
    const backSide = await click('.vn-arrow [data-view="left"]', 2, 90);   // inside the 320ms window
    check("double-tap left -> the opposite side", /front:.*back/.test(backSide), backSide);
  } catch (e) {
    fail++;
    console.log("  FAIL  threw —", e.message);
  }

  console.log(`\ngizmo: ${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
});
