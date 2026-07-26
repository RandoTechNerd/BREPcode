// Capture promo stills of the running app, straight out of Electron.
//
//   npx electron scripts/shots.cjs [outDir]
//
// Uses webContents.capturePage() on the real shell, so what lands on disk is
// exactly what the app draws — no screen recorder, no window furniture, no
// scaling artefacts. The window is sized to 2560x1440 so a YouTube thumbnail
// (1280x720) can be cropped or downscaled from it without going soft.
//
// Each shot sets the editor's code, waits for the build to settle, points the
// camera, then captures. The waits are generous on purpose: the kernel is doing
// real CSG and a capture taken mid-build is a picture of a half-built model.

const { app, BrowserWindow, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const shellApp = require("../desktop/main.cjs");   // registers app:// before ready

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "BREPcode-shots");
const W = 2560, H = 1440;

// text() builds its glyphs standing in the XZ plane, like a sign, not lying on
// a face — laying it on a plate needs a rotate([90,0,0]) that I have not pinned
// down yet, so the lettering shot is out rather than shipped wrong.
const SHOTS = [
  {
    name: "01-hero-bracket",
    yaw: 1, pitch: 1, zoom: 1,
    why: "the default view doing something recognisable",
    code: `const w = 90, d = 60, t = 8, holeR = 4;
return difference(
  union(
    cube([w, d, t]),
    translate([0, 0, t], cube([w, t, 46]))),
  translate([18, 30, -1], cylinder({ r: holeR, h: t + 2, $fn: 64 })),
  translate([72, 30, -1], cylinder({ r: holeR, h: t + 2, $fn: 64 })),
  translate([25, -1, 30], rotate([-90, 0, 0], cylinder({ r: holeR, h: t + 2, $fn: 64 }))),
  translate([65, -1, 30], rotate([-90, 0, 0], cylinder({ r: holeR, h: t + 2, $fn: 64 }))));`,
  },
  {
    name: "02-hole-punched",
    yaw: 1, pitch: 1, zoom: 1,
    why: "the plain-English edit: a plate with a hole straight through",
    code: `const EPS = 0.01, w = 100, d = 70, t = 14;
return difference(
  cube([w, d, t]),
  translate([w / 2, d / 2, -EPS], cylinder({ r: 22, h: t + EPS * 2, $fn: 96 })));`,
  },
  {
    name: "03-rounded",
    yaw: 1, pitch: 1, zoom: 1,
    why: "fillets reading clearly at small size",
    code: `return fillet(6,
  difference(
    cube([110, 70, 34]),
    translate([12, 12, 8], cube([86, 46, 40]))));`,
  },
  {
    name: "04-curved-vase",
    yaw: 1, pitch: 0, zoom: 1,
    why: "something organic, to show it is not all boxes",
    code: `const pts = [];
for (let i = 0; i <= 14; i++) {
  const z = i * 7;
  pts.push([18 + 14 * Math.sin(i / 14 * Math.PI * 1.1), z]);
}
return revolve(360, polygon([[0, 0], ...pts, [0, 98]]));`,
  },
  {
    name: "06-top-view",
    zoom: 1,
    why: "a clean orthographic plate, good for a title card background",
    code: `const EPS = 0.01, r = 46;
let s = cylinder({ r, h: 10, $fn: 128 });
for (let i = 0; i < 6; i++) {
  const a = i / 6 * Math.PI * 2;
  s = difference(s, translate([Math.cos(a) * 28, Math.sin(a) * 28, -EPS],
    cylinder({ r: 7, h: 10 + EPS * 2, $fn: 64 })));
}
return difference(s, translate([0, 0, -EPS], cylinder({ r: 14, h: 10 + EPS * 2, $fn: 96 })));`,
    view: "top",
  },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  shellApp.serveBundle();
  const win = shellApp.createWindow({ hidden: true });
  win.setSize(W, H);
  const run = (js) => win.webContents.executeJavaScript(js, true);

  // wait for the module script to finish booting
  for (let i = 0; i < 160; i++) {
    try { if (await run("!!document.getElementById('code')")) break; } catch {}
    await wait(250);
  }
  await wait(2500);

  // Start from stock settings. These run against the real app's stored
  // preferences, so whatever material was last used carries over — the first
  // pass came out with a translucent part because a saved opacity below 100
  // let the grid show straight through it. Clear it and reload so the stills
  // show what a new user sees, not what this machine was last set to.
  await run('localStorage.removeItem("brepcode-material"); localStorage.removeItem("brepcode-theme"); true').catch(() => {});
  win.reload();
  for (let i = 0; i < 160; i++) {
    try { if (await run("!!document.getElementById('code')")) break; } catch {}
    await wait(250);
  }
  await wait(3000);

  // Hide the chrome that would date the picture or clutter a thumbnail: the
  // floating dock, the prompt bar, the corner icons. The model and the grid are
  // the subject.
  await run(`(() => {
    for (const sel of ["#dock", "#chat-fab", "#toolbar", ".fab-row", "#viewnav", "#hint-corner"]) {
      const el = document.querySelector(sel);
      if (el) el.style.display = "none";
    }
    document.querySelectorAll(".card").forEach((c) => { c.style.display = "none"; });
    return true;
  })()`).catch(() => {});

  const made = [];
  for (const shot of SHOTS) {
    await run(`(() => {
      const ed = document.getElementById("code");
      ed.value = ${JSON.stringify(shot.code)};
      ed.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await wait(shot.settle || 6000);                    // let the kernel finish
    if (shot.view) {
      await run(`document.querySelector('[data-view="${shot.view}"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }))`).catch(() => {});
      await wait(2500);
    }
    // Back to home FIRST. The camera survives between shots, so without this
    // each pose stacked on the last one: by the fourth shot the vase was being
    // photographed from almost directly overhead and read as a featureless
    // blob. Every shot's yaw/pitch is relative to home, so home is where each
    // one has to start.
    await run(`document.getElementById("viewnav")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`).catch(() => {});
    await wait(1500);

    // orbit into the pose: n x 45 degrees of yaw, then of pitch
    for (const [dir, n] of [["left", shot.yaw || 0], ["up", shot.pitch || 0]]) {
      for (let i = 0; i < n; i++) {
        await run(`document.querySelector('.vn-arrow [data-view="${dir}"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }))`).catch(() => {});
        await wait(700);
      }
    }
    // fill more of the frame — a thumbnail wants the part, not the floor
    if (shot.zoom) {
      await run(`(() => {
        const c = document.querySelector("canvas");
        for (let i = 0; i < ${shot.zoom}; i++) {
          c.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, clientX: c.clientWidth/2, clientY: c.clientHeight/2 }));
        }
        return true;
      })()`).catch(() => {});
      await wait(1200);
    }
    await wait(600);
    const img = await win.webContents.capturePage();
    const file = path.join(OUT, `${shot.name}.png`);
    fs.writeFileSync(file, img.toPNG());
    const kb = (fs.statSync(file).size / 1024).toFixed(0);
    made.push(`${shot.name}.png  ${kb} KB  — ${shot.why}`);
    console.log(`  ${shot.name}.png  ${kb} KB`);
  }

  console.log(`\n${made.length} stills in ${OUT}`);
  app.exit(0);
});
